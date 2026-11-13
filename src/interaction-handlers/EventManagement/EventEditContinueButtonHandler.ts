import "reflect-metadata";
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ButtonInteraction, MessageFlags } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { Event, EventManager } from '../../managers/EventManager';
import { Section, SectionManager } from '../../managers/SectionManager';
import {
    EVENT_EDIT_CONTINUE_BUTTON_ID,
    isAdministrator,
    NO_PERMISSION_MESSAGE,
    parseRecordId,
} from '../../utils/EventManagement';
import { buildEventModal } from '../../utils/EventManagementModals';

/** Apre la modale "Modifica Evento" precompilata con i valori attuali dell'evento scelto. */
@autoInjectable()
export class EventEditContinueButtonHandler extends InteractionHandler {

    public constructor(
        context: InteractionHandler.LoaderContext,
        options: InteractionHandler.Options,
        protected eventManager?: EventManager,
        protected sectionManager?: SectionManager,
    ) {
        super(context, {
            ...options,
            interactionHandlerType: InteractionHandlerTypes.Button,
        });
    }

    public override parse(interaction: ButtonInteraction) {
        const eventId = parseRecordId(interaction.customId, EVENT_EDIT_CONTINUE_BUTTON_ID);
        return eventId === null ? this.none() : this.some(eventId);
    }

    public override async run(interaction: ButtonInteraction, eventId: number) {
        if (!isAdministrator(interaction)) {
            await interaction.reply({ content: NO_PERMISSION_MESSAGE, flags: MessageFlags.Ephemeral });
            return;
        }

        let event: Event;
        let sections: Section[];
        try {
            [event, sections] = await Promise.all([
                this.eventManager!.getById(eventId),
                this.sectionManager!.listAll({ sort: 'name,asc' }),
            ]);
        } catch (error) {
            console.error(`[EventEditContinueButtonHandler] Errore durante il caricamento dell'evento ${eventId}:`, error);
            await interaction.reply({ content: '❌ Non è stato possibile caricare l\'evento: potrebbe essere stato cancellato.', flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.showModal(buildEventModal(sections, event));
    }
}
