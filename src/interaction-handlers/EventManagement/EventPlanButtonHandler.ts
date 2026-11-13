import "reflect-metadata";
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import {
    ButtonInteraction,
    LabelBuilder,
    MessageFlags,
    ModalBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { EventTemplate, EventTemplateManager } from '../../managers/EventTemplateManager';
import {
    EVENT_PLAN_BUTTON_ID,
    EVENT_PLAN_DATE_INPUT_ID,
    EVENT_PLAN_MODAL_ID,
    EVENT_PLAN_TEMPLATE_INPUT_ID,
    eventTemplateOptions,
    isAdministrator,
    NO_PERMISSION_MESSAGE,
    SELECT_MAX_OPTIONS,
} from '../../utils/EventManagement';

/** Apre la modale di pianificazione di un evento, con i template caricati dalle API. Riservato agli amministratori. */
@autoInjectable()
export class EventPlanButtonHandler extends InteractionHandler {

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
        return interaction.customId === EVENT_PLAN_BUTTON_ID ? this.some() : this.none();
    }

    public override async run(interaction: ButtonInteraction) {
        if (!isAdministrator(interaction)) {
            await interaction.reply({ content: NO_PERMISSION_MESSAGE, flags: MessageFlags.Ephemeral });
            return;
        }

        let templates: EventTemplate[];
        try {
            templates = await this.eventTemplateManager!.listAll({ sort: 'name,asc' });
        } catch (error) {
            console.error('[EventPlanButtonHandler] Errore durante il caricamento dei template:', error);
            await interaction.reply({ content: '❌ Non è stato possibile caricare i template evento, riprova più tardi.', flags: MessageFlags.Ephemeral });
            return;
        }

        if (templates.length === 0) {
            await interaction.reply({ content: '❌ Non è presente nessun template evento: premi prima "Crea Template Evento".', flags: MessageFlags.Ephemeral });
            return;
        }
        if (templates.length > SELECT_MAX_OPTIONS) {
            console.warn(`[EventPlanButtonHandler] ${templates.length} template presenti, mostrati solo i primi ${SELECT_MAX_OPTIONS}.`);
        }

        await interaction.showModal(this.buildModal(templates));
    }

    protected buildModal(templates: EventTemplate[]): ModalBuilder {
        const template = new StringSelectMenuBuilder()
            .setCustomId(EVENT_PLAN_TEMPLATE_INPUT_ID)
            .setRequired(true)
            .addOptions(eventTemplateOptions(templates));

        const date = new TextInputBuilder()
            .setCustomId(EVENT_PLAN_DATE_INPUT_ID)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('GG/MM/AAAA HH:MM, es. 20/11/2026 21:30')
            .setMinLength(14)
            .setMaxLength(16)
            .setRequired(true);

        return new ModalBuilder()
            .setCustomId(EVENT_PLAN_MODAL_ID)
            .setTitle('Pianifica Evento')
            .addLabelComponents(
                new LabelBuilder().setLabel('Template Evento').setStringSelectMenuComponent(template),
                new LabelBuilder()
                    .setLabel('Data e Ora')
                    .setDescription('Nel formato GG/MM/AAAA HH:MM, ora italiana')
                    .setTextInputComponent(date),
            );
    }
}
