import "reflect-metadata";
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import {
    ChannelType,
    Guild,
    GuildScheduledEvent,
    GuildScheduledEventEntityType,
    GuildScheduledEventPrivacyLevel,
    MessageFlags,
    ModalSubmitInteraction,
} from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { EventEdition, EventEditionManager } from '../../managers/EventEditionManager';
import { EventManager } from '../../managers/EventManager';
import { EventTemplateManager } from '../../managers/EventTemplateManager';
import { SettingsManager } from '../../managers/SettingsManager';
import {
    buildDiscordEventDescription,
    EVENT_PLAN_DATE_INPUT_ID,
    EVENT_PLAN_MODAL_ID,
    EVENT_PLAN_TEMPLATE_INPUT_ID,
    formatApiError,
    formatZonedDateTime,
    isAdministrator,
    NO_PERMISSION_MESSAGE,
    parsePlannedAt,
    validationError,
} from '../../utils/EventManagement';

/** Etichette dei campi della modale, usate nei messaggi di validazione delle API. */
const FIELD_LABELS: Record<string, string> = {
    eventTemplateId: 'Template Evento',
    plannedAt: 'Data e Ora',
};

/**
 * Salva tramite le API l'edizione evento compilata nella modale "Pianifica Evento" e crea il corrispondente
 * evento programmato su Discord. Se la creazione su Discord fallisce l'edizione viene eliminata, così da non
 * lasciare in database date senza evento (e senza link per le notizie).
 */
@autoInjectable()
export class EventPlanModalSubmitHandler extends InteractionHandler {

    public constructor(
        context: InteractionHandler.LoaderContext,
        options: InteractionHandler.Options,
        protected eventEditionManager?: EventEditionManager,
        protected eventTemplateManager?: EventTemplateManager,
        protected eventManager?: EventManager,
        protected settingsManager?: SettingsManager,
    ) {
        super(context, {
            ...options,
            interactionHandlerType: InteractionHandlerTypes.ModalSubmit,
        });
    }

    public override parse(interaction: ModalSubmitInteraction) {
        return interaction.customId === EVENT_PLAN_MODAL_ID ? this.some() : this.none();
    }

    public override async run(interaction: ModalSubmitInteraction) {
        if (!isAdministrator(interaction) || !interaction.inCachedGuild()) {
            await interaction.reply({ content: NO_PERMISSION_MESSAGE, flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const [templateValue] = interaction.fields.getStringSelectValues(EVENT_PLAN_TEMPLATE_INPUT_ID);
        const dateValue = interaction.fields.getTextInputValue(EVENT_PLAN_DATE_INPUT_ID);

        const plannedAt = parsePlannedAt(dateValue);
        if (!plannedAt) {
            await interaction.editReply(validationError(
                FIELD_LABELS.plannedAt,
                `"${dateValue.trim()}" non è una data valida nel formato GG/MM/AAAA HH:MM`,
            ));
            return;
        }

        let edition: EventEdition;
        try {
            edition = await this.eventEditionManager!.create({
                eventTemplateId: Number(templateValue),
                plannedAt: plannedAt.toISOString(),
            });
        } catch (error) {
            console.error('[EventPlanModalSubmitHandler] Errore durante il salvataggio dell\'edizione:', error);
            await interaction.editReply(formatApiError(error, FIELD_LABELS, '❌ Non è stato possibile pianificare l\'evento, riprova più tardi.'));
            return;
        }

        let scheduledEvent: GuildScheduledEvent | null = null;
        try {
            scheduledEvent = await this.createDiscordEvent(interaction.guild, edition, plannedAt);
            await this.eventEditionManager!.update(edition.id, {
                eventTemplateId: edition.eventTemplateId,
                plannedAt: edition.plannedAt,
                discordEventId: scheduledEvent.id,
            });

            await interaction.editReply(
                `✅ Evento pianificato per il **${formatZonedDateTime(plannedAt)}**: ${scheduledEvent.url}\n`
                + 'Le notizie verranno pubblicate alle 12:00 una settimana prima e il giorno stesso.',
            );
        } catch (error) {
            console.error('[EventPlanModalSubmitHandler] Errore durante la creazione dell\'evento Discord:', error);
            await this.rollback(edition, scheduledEvent);
            await interaction.editReply(`❌ Non è stato possibile creare l'evento su Discord: ${this.describeError(error)}`);
        }
    }

    /** Crea l'evento programmato nel canale vocale degli eventi, a partire da template ed evento dell'edizione. */
    protected async createDiscordEvent(guild: Guild, edition: EventEdition, plannedAt: Date): Promise<GuildScheduledEvent> {
        const template = await this.eventTemplateManager!.getById(edition.eventTemplateId);
        const [event, image] = await Promise.all([
            this.eventManager!.getById(template.eventId),
            this.eventTemplateManager!.getImage(template.id),
        ]);

        const role = await guild.roles.fetch(event.interest).catch(() => null);
        if (!role) {
            throw new Error(`il ruolo di interesse ${event.interest} dell'evento "${event.name}" non esiste più`);
        }

        const channelId = await this.settingsManager!.getEventsRoomChannelId();
        if (!channelId) {
            throw new Error("configurazione 'channels/community/events_room' non definita");
        }
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (channel?.type !== ChannelType.GuildVoice && channel?.type !== ChannelType.GuildStageVoice) {
            throw new Error(`il canale ${channelId} della configurazione 'channels/community/events_room' non è un canale vocale`);
        }

        return guild.scheduledEvents.create({
            name: template.discordEventTitle,
            description: buildDiscordEventDescription(event, role, template.discordEventDescription),
            image,
            scheduledStartTime: plannedAt,
            privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
            entityType: channel.type === ChannelType.GuildStageVoice
                ? GuildScheduledEventEntityType.StageInstance
                : GuildScheduledEventEntityType.Voice,
            channel,
            reason: `Evento pianificato tramite il pannello di gestione eventi`,
        });
    }

    /** Annulla quanto creato finora; gli errori vengono solo registrati, per non nascondere quello originale. */
    protected async rollback(edition: EventEdition, scheduledEvent: GuildScheduledEvent | null): Promise<void> {
        if (scheduledEvent) {
            await scheduledEvent.delete().catch((error) =>
                console.error(`[EventPlanModalSubmitHandler] Errore durante l'eliminazione dell'evento Discord ${scheduledEvent.id}:`, error),
            );
        }
        await this.eventEditionManager!.delete(edition.id).catch((error) =>
            console.error(`[EventPlanModalSubmitHandler] Errore durante l'eliminazione dell'edizione ${edition.id}:`, error),
        );
    }

    protected describeError(error: unknown): string {
        return error instanceof Error ? error.message : 'errore sconosciuto, controlla i log.';
    }
}
