import "reflect-metadata";
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ButtonInteraction, MessageFlags } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { Event, EventManager } from '../../managers/EventManager';
import { EventTemplate, EventTemplateManager } from '../../managers/EventTemplateManager';
import {
    EVENT_TEMPLATE_EDIT_CONTINUE_BUTTON_ID,
    isAdministrator,
    NO_PERMISSION_MESSAGE,
    parseRecordId,
} from '../../utils/EventManagement';
import { buildEventTemplateModal } from '../../utils/EventManagementModals';

/** Apre il primo passo di "Modifica Template Evento", precompilato con i valori attuali del template scelto. */
@autoInjectable()
export class EventTemplateEditContinueButtonHandler extends InteractionHandler {

    public constructor(
        context: InteractionHandler.LoaderContext,
        options: InteractionHandler.Options,
        protected eventTemplateManager?: EventTemplateManager,
        protected eventManager?: EventManager,
    ) {
        super(context, {
            ...options,
            interactionHandlerType: InteractionHandlerTypes.Button,
        });
    }

    public override parse(interaction: ButtonInteraction) {
        const templateId = parseRecordId(interaction.customId, EVENT_TEMPLATE_EDIT_CONTINUE_BUTTON_ID);
        return templateId === null ? this.none() : this.some(templateId);
    }

    public override async run(interaction: ButtonInteraction, templateId: number) {
        if (!isAdministrator(interaction)) {
            await interaction.reply({ content: NO_PERMISSION_MESSAGE, flags: MessageFlags.Ephemeral });
            return;
        }

        let template: EventTemplate;
        let events: Event[];
        try {
            [template, events] = await Promise.all([
                this.eventTemplateManager!.getById(templateId),
                this.eventManager!.listAll({ sort: 'name,asc' }),
            ]);
        } catch (error) {
            console.error(`[EventTemplateEditContinueButtonHandler] Errore durante il caricamento del template ${templateId}:`, error);
            await interaction.reply({ content: '❌ Non è stato possibile caricare il template: potrebbe essere stato cancellato.', flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.showModal(buildEventTemplateModal(events, template));
    }
}
