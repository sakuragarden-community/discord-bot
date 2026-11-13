import "reflect-metadata";
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, ModalSubmitInteraction, roleMention } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { EventManager, EventRequest } from '../../managers/EventManager';
import {
    EVENT_CREATE_MODAL_ID,
    EVENT_EDIT_MODAL_ID,
    EVENT_INTEREST_INPUT_ID,
    EVENT_IS_OPEN_INPUT_ID,
    EVENT_MAX_PARTICIPANTS_INPUT_ID,
    EVENT_NAME_INPUT_ID,
    EVENT_SECTION_INPUT_ID,
    formatApiError,
    isAdministrator,
    NO_PERMISSION_MESSAGE,
    parseRecordId,
    validationError,
} from '../../utils/EventManagement';

/** Etichette dei campi della modale, usate nei messaggi di validazione delle API. */
const FIELD_LABELS: Record<string, string> = {
    name: 'Nome',
    sectionId: 'Sezione',
    interest: 'Interesse',
    maxParticipants: 'Numero di partecipanti',
    isOpen: 'Evento aperto',
};

/**
 * Salva tramite le API l'evento compilato nella modale "Crea Evento" o "Modifica Evento": nel secondo caso il custom
 * ID riporta l'id dell'evento da aggiornare.
 */
@autoInjectable()
export class EventModalSubmitHandler extends InteractionHandler {

    public constructor(
        context: InteractionHandler.LoaderContext,
        options: InteractionHandler.Options,
        protected eventManager?: EventManager,
    ) {
        super(context, {
            ...options,
            interactionHandlerType: InteractionHandlerTypes.ModalSubmit,
        });
    }

    public override parse(interaction: ModalSubmitInteraction) {
        if (interaction.customId === EVENT_CREATE_MODAL_ID) return this.some<number | null>(null);

        const eventId = parseRecordId(interaction.customId, EVENT_EDIT_MODAL_ID);
        return eventId === null ? this.none() : this.some<number | null>(eventId);
    }

    public override async run(interaction: ModalSubmitInteraction, eventId: number | null) {
        if (!isAdministrator(interaction) || !interaction.inCachedGuild()) {
            await interaction.reply({ content: NO_PERMISSION_MESSAGE, flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const name = interaction.fields.getTextInputValue(EVENT_NAME_INPUT_ID).trim();
        const [sectionValue] = interaction.fields.getStringSelectValues(EVENT_SECTION_INPUT_ID);
        const interest = interaction.fields.getTextInputValue(EVENT_INTEREST_INPUT_ID).trim();
        const maxParticipantsValue = interaction.fields.getTextInputValue(EVENT_MAX_PARTICIPANTS_INPUT_ID).trim();
        const [isOpenValue] = interaction.fields.getStringSelectValues(EVENT_IS_OPEN_INPUT_ID);

        const maxParticipants = Number(maxParticipantsValue || '0');
        if (!/^\d+$/.test(maxParticipantsValue || '0') || !Number.isSafeInteger(maxParticipants)) {
            await interaction.editReply(validationError(FIELD_LABELS.maxParticipants, 'deve essere un numero intero maggiore o uguale a 0'));
            return;
        }

        // Il ruolo è necessario per comporre la descrizione dell'evento Discord: va verificato subito
        const role = /^\d+$/.test(interest) ? await interaction.guild.roles.fetch(interest).catch(() => null) : null;
        if (!role) {
            await interaction.editReply(validationError(FIELD_LABELS.interest, `nessun ruolo trovato con ID "${interest}"`));
            return;
        }

        const request: EventRequest = {
            sectionId: Number(sectionValue),
            name,
            interest,
            maxParticipants,
            isOpen: isOpenValue === 'yes',
        };

        try {
            const event = eventId === null
                ? await this.eventManager!.create(request)
                : await this.eventManager!.update(eventId, request);

            await interaction.editReply({
                content: `✅ Evento **${event.name}** ${eventId === null ? 'creato' : 'aggiornato'} nella sezione `
                    + `**${event.sectionName}** (interesse: ${roleMention(role.id)}).`,
                allowedMentions: { parse: [] },
            });
        } catch (error) {
            console.error(`[EventModalSubmitHandler] Errore durante il salvataggio dell'evento ${eventId ?? '(nuovo)'}:`, error);
            const fallback = eventId === null
                ? '❌ Non è stato possibile creare l\'evento, riprova più tardi.'
                : '❌ Non è stato possibile aggiornare l\'evento, riprova più tardi.';
            await interaction.editReply(formatApiError(error, FIELD_LABELS, fallback));
        }
    }
}
