import "reflect-metadata";
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ChannelType, MessageFlags, ModalSubmitInteraction } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { EventTemplateManager } from '../../managers/EventTemplateManager';
import {
    deleteEventTemplateDraft,
    EVENT_TEMPLATE_DRAFT_EXPIRED_MESSAGE,
    EVENT_TEMPLATE_NEWS_CHANNEL_INPUT_ID,
    EVENT_TEMPLATE_NEWS_CONTENT_INPUT_ID,
    EVENT_TEMPLATE_NEWS_MODAL_ID,
    EVENT_TEMPLATE_THREAD_POST_INPUT_ID,
    formatApiError,
    getEventTemplateDraft,
    isAdministrator,
    NO_PERMISSION_MESSAGE,
    validationError,
} from '../../utils/EventManagement';

/** Etichette dei campi di entrambi i passi, usate nei messaggi di validazione delle API. */
const FIELD_LABELS: Record<string, string> = {
    eventId: 'Evento',
    discordEventTitle: 'Titolo dell\'Evento Discord',
    discordEventDescription: 'Descrizione dell\'Evento Discord',
    discordEventImage: 'Immagine dell\'Evento Discord',
    discordNewsChannel: 'Canale Notizie Discord',
    discordNewsContent: 'Messaggio per Canale Notizie Discord',
    discordThreadPost: 'Messaggio per Thread nel Canale Notizie',
};

/** Secondo passo della creazione di un template evento: unisce i dati alla bozza e li salva tramite le API. */
@autoInjectable()
export class EventTemplateNewsModalSubmitHandler extends InteractionHandler {

    public constructor(
        context: InteractionHandler.LoaderContext,
        options: InteractionHandler.Options,
        protected eventTemplateManager?: EventTemplateManager,
    ) {
        super(context, {
            ...options,
            interactionHandlerType: InteractionHandlerTypes.ModalSubmit,
        });
    }

    public override parse(interaction: ModalSubmitInteraction) {
        return interaction.customId === EVENT_TEMPLATE_NEWS_MODAL_ID ? this.some() : this.none();
    }

    public override async run(interaction: ModalSubmitInteraction) {
        if (!isAdministrator(interaction) || !interaction.inCachedGuild()) {
            await interaction.reply({ content: NO_PERMISSION_MESSAGE, flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const draft = getEventTemplateDraft(interaction.user.id);
        if (!draft) {
            await interaction.editReply(EVENT_TEMPLATE_DRAFT_EXPIRED_MESSAGE);
            return;
        }

        const newsChannelId = interaction.fields.getTextInputValue(EVENT_TEMPLATE_NEWS_CHANNEL_INPUT_ID).trim();
        const newsContent = interaction.fields.getTextInputValue(EVENT_TEMPLATE_NEWS_CONTENT_INPUT_ID).trim();
        const threadPost = interaction.fields.getTextInputValue(EVENT_TEMPLATE_THREAD_POST_INPUT_ID).trim();

        // Il canale deve poter ospitare la notizia e il relativo thread: va verificato subito
        const channel = /^\d+$/.test(newsChannelId)
            ? await interaction.guild.channels.fetch(newsChannelId).catch(() => null)
            : null;
        if (channel?.type !== ChannelType.GuildText && channel?.type !== ChannelType.GuildAnnouncement) {
            await interaction.editReply(validationError(
                FIELD_LABELS.discordNewsChannel,
                `nessun canale testuale o di annunci trovato con ID "${newsChannelId}". Premi di nuovo "Continua" per correggerlo.`,
            ));
            return;
        }

        try {
            const template = await this.eventTemplateManager!.create({
                ...draft,
                discordNewsChannel: newsChannelId,
                discordNewsContent: newsContent,
                discordThreadPost: threadPost || null,
            });
            deleteEventTemplateDraft(interaction.user.id);

            await interaction.editReply(
                `✅ Template **${template.discordEventTitle}** creato per l'evento **${template.eventName}**; `
                + `le notizie verranno pubblicate in ${channel}.`,
            );
        } catch (error) {
            // La bozza resta disponibile: l'utente può correggere i dati premendo di nuovo "Continua"
            console.error('[EventTemplateNewsModalSubmitHandler] Errore durante la creazione del template:', error);
            await interaction.editReply(formatApiError(error, FIELD_LABELS, '❌ Non è stato possibile creare il template, riprova più tardi.'));
        }
    }
}
