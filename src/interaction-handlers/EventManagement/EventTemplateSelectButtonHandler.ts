import "reflect-metadata";
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ButtonInteraction, MessageFlags } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { EventTemplate, EventTemplateManager } from '../../managers/EventTemplateManager';
import {
    EVENT_TEMPLATE_DELETE_BUTTON_ID,
    EVENT_TEMPLATE_DELETE_SELECT_MODAL_ID,
    EVENT_TEMPLATE_EDIT_BUTTON_ID,
    EVENT_TEMPLATE_EDIT_SELECT_MODAL_ID,
    EVENT_TEMPLATE_SELECT_INPUT_ID,
    eventTemplateOptions,
    isAdministrator,
    NO_PERMISSION_MESSAGE,
    SELECT_MAX_OPTIONS,
} from '../../utils/EventManagement';
import { buildSelectionModal } from '../../utils/EventManagementModals';

/** Modale di selezione aperta da ciascun pulsante. */
const SELECTION_MODALS: Record<string, { customId: string; title: string; description: string }> = {
    [EVENT_TEMPLATE_EDIT_BUTTON_ID]: {
        customId: EVENT_TEMPLATE_EDIT_SELECT_MODAL_ID,
        title: 'Modifica Template Evento',
        description: 'Dopo la conferma potrai modificarne i campi',
    },
    [EVENT_TEMPLATE_DELETE_BUTTON_ID]: {
        customId: EVENT_TEMPLATE_DELETE_SELECT_MODAL_ID,
        title: 'Cancella Template Evento',
        description: 'Si possono cancellare solo i template mai pianificati',
    },
};

/**
 * Pulsanti "Modifica Template Evento" e "Cancella Template Evento": aprono la modale per scegliere il template, con
 * i template caricati dalle API. Riservati agli amministratori.
 */
@autoInjectable()
export class EventTemplateSelectButtonHandler extends InteractionHandler {

    public constructor(
        context: InteractionHandler.LoaderContext,
        options: InteractionHandler.Options,
        protected eventTemplateManager?: EventTemplateManager,
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

        let templates: EventTemplate[];
        try {
            templates = await this.eventTemplateManager!.listAll({ sort: 'name,asc' });
        } catch (error) {
            console.error('[EventTemplateSelectButtonHandler] Errore durante il caricamento dei template:', error);
            await interaction.reply({ content: '❌ Non è stato possibile caricare i template evento, riprova più tardi.', flags: MessageFlags.Ephemeral });
            return;
        }

        if (templates.length === 0) {
            await interaction.reply({ content: '❌ Non è presente nessun template evento.', flags: MessageFlags.Ephemeral });
            return;
        }
        if (templates.length > SELECT_MAX_OPTIONS) {
            console.warn(`[EventTemplateSelectButtonHandler] ${templates.length} template presenti, mostrati solo i primi ${SELECT_MAX_OPTIONS}.`);
        }

        await interaction.showModal(buildSelectionModal({
            ...modal,
            selectId: EVENT_TEMPLATE_SELECT_INPUT_ID,
            label: 'Template Evento',
            options: eventTemplateOptions(templates),
        }));
    }
}
