import "reflect-metadata";
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalSubmitInteraction } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { Event, EventManager } from '../../managers/EventManager';
import {
    DISCORD_LIMITS,
    EVENT_EDIT_CONTINUE_BUTTON_ID,
    EVENT_EDIT_SELECT_MODAL_ID,
    EVENT_SELECT_INPUT_ID,
    isAdministrator,
    NO_PERMISSION_MESSAGE,
    truncate,
    withRecordId,
} from '../../utils/EventManagement';

/**
 * Evento scelto in "Modifica Evento": una modale non può aprirne un'altra, quindi il bot risponde con il pulsante
 * che apre la modale precompilata.
 */
@autoInjectable()
export class EventEditSelectModalSubmitHandler extends InteractionHandler {

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
        return interaction.customId === EVENT_EDIT_SELECT_MODAL_ID ? this.some() : this.none();
    }

    public override async run(interaction: ModalSubmitInteraction) {
        if (!isAdministrator(interaction)) {
            await interaction.reply({ content: NO_PERMISSION_MESSAGE, flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const [eventValue] = interaction.fields.getStringSelectValues(EVENT_SELECT_INPUT_ID);

        let event: Event;
        try {
            event = await this.eventManager!.getById(Number(eventValue));
        } catch (error) {
            console.error(`[EventEditSelectModalSubmitHandler] Errore durante il caricamento dell'evento ${eventValue}:`, error);
            await interaction.editReply('❌ Non è stato possibile caricare l\'evento: potrebbe essere stato cancellato.');
            return;
        }

        const button = new ButtonBuilder()
            .setCustomId(withRecordId(EVENT_EDIT_CONTINUE_BUTTON_ID, event.id))
            .setStyle(ButtonStyle.Primary)
            .setLabel(truncate(`Modifica "${event.name}"`, DISCORD_LIMITS.buttonLabel));

        await interaction.editReply({
            content: `✏️ Premi il pulsante per modificare l'evento **${event.name}**: i campi saranno già compilati con i valori attuali.`,
            components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
        });
    }
}
