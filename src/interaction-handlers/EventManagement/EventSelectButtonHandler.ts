import "reflect-metadata";
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ButtonInteraction, MessageFlags } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { Event, EventManager } from '../../managers/EventManager';
import {
    EVENT_DELETE_BUTTON_ID,
    EVENT_DELETE_SELECT_MODAL_ID,
    EVENT_EDIT_BUTTON_ID,
    EVENT_EDIT_SELECT_MODAL_ID,
    EVENT_SELECT_INPUT_ID,
    eventOptions,
    isAdministrator,
    NO_PERMISSION_MESSAGE,
    SELECT_MAX_OPTIONS,
} from '../../utils/EventManagement';
import { buildSelectionModal } from '../../utils/EventManagementModals';

/** Modale di selezione aperta da ciascun pulsante. */
const SELECTION_MODALS: Record<string, { customId: string; title: string; description: string }> = {
    [EVENT_EDIT_BUTTON_ID]: {
        customId: EVENT_EDIT_SELECT_MODAL_ID,
        title: 'Modifica Evento',
        description: 'Dopo la conferma potrai modificarne i campi',
    },
    [EVENT_DELETE_BUTTON_ID]: {
        customId: EVENT_DELETE_SELECT_MODAL_ID,
        title: 'Cancella Evento',
        description: 'Si possono cancellare solo gli eventi senza template',
    },
};

/**
 * Pulsanti "Modifica Evento" e "Cancella Evento": aprono la modale per scegliere l'evento, con gli eventi caricati
 * dalle API. Riservati agli amministratori.
 */
@autoInjectable()
export class EventSelectButtonHandler extends InteractionHandler {

    public constructor(
        context: InteractionHandler.LoaderContext,
        options: InteractionHandler.Options,
        protected eventManager?: EventManager,
    ) {
        super(context, {
            ...options,
            interactionHandlerType: InteractionHandlerTypes.Button,
        });
    }

    public override parse(interaction: ButtonInteraction) {
        const modal = SELECTION_MODALS[interaction.customId];
        return modal ? this.some(modal) : this.none();
    }

    public override async run(interaction: ButtonInteraction, modal: typeof SELECTION_MODALS[string]) {
        if (!isAdministrator(interaction)) {
            await interaction.reply({ content: NO_PERMISSION_MESSAGE, flags: MessageFlags.Ephemeral });
            return;
        }

        let events: Event[];
        try {
            events = await this.eventManager!.listAll({ sort: 'name,asc' });
        } catch (error) {
            console.error('[EventSelectButtonHandler] Errore durante il caricamento degli eventi:', error);
            await interaction.reply({ content: '❌ Non è stato possibile caricare gli eventi, riprova più tardi.', flags: MessageFlags.Ephemeral });
            return;
        }

        if (events.length === 0) {
            await interaction.reply({ content: '❌ Non è presente nessun evento.', flags: MessageFlags.Ephemeral });
            return;
        }
        if (events.length > SELECT_MAX_OPTIONS) {
            console.warn(`[EventSelectButtonHandler] ${events.length} eventi presenti, mostrati solo i primi ${SELECT_MAX_OPTIONS}.`);
        }

        await interaction.showModal(buildSelectionModal({
            ...modal,
            selectId: EVENT_SELECT_INPUT_ID,
            label: 'Evento',
            options: eventOptions(events),
        }));
    }
}
