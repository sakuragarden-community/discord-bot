import "reflect-metadata";
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, ModalSubmitInteraction, roleMention } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { EventManager } from '../../managers/EventManager';
import {
    EVENT_CREATE_MODAL_ID,
    EVENT_INTEREST_INPUT_ID,
    EVENT_IS_OPEN_INPUT_ID,
    EVENT_MAX_PARTICIPANTS_INPUT_ID,
    EVENT_NAME_INPUT_ID,
    EVENT_SECTION_INPUT_ID,
    formatApiError,
    isAdministrator,
    NO_PERMISSION_MESSAGE,
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

/** Salva tramite le API l'evento compilato nella modale "Crea Evento". */
@autoInjectable()
export class EventCreateModalSubmitHandler extends InteractionHandler {

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
        return interaction.customId === EVENT_CREATE_MODAL_ID ? this.some() : this.none();
    }

    public override async run(interaction: ModalSubmitInteraction) {
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

        try {
            const event = await this.eventManager!.create({
                sectionId: Number(sectionValue),
                name,
                interest,
                maxParticipants,
                isOpen: isOpenValue === 'yes',
            });

            await interaction.editReply({
                content: `✅ Evento **${event.name}** creato nella sezione **${event.sectionName}** (interesse: ${roleMention(role.id)}).`,
                allowedMentions: { parse: [] },
            });
        } catch (error) {
            console.error('[EventCreateModalSubmitHandler] Errore durante la creazione dell\'evento:', error);
            await interaction.editReply(formatApiError(error, FIELD_LABELS, '❌ Non è stato possibile creare l\'evento, riprova più tardi.'));
        }
    }
}
