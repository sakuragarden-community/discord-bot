import "reflect-metadata";
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, ModalSubmitInteraction } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { KodamaApiError } from '../../managers/ApiManager';
import { EventTemplate, EventTemplateManager } from '../../managers/EventTemplateManager';
import {
    EVENT_TEMPLATE_DELETE_SELECT_MODAL_ID,
    EVENT_TEMPLATE_SELECT_INPUT_ID,
    isAdministrator,
    NO_PERMISSION_MESSAGE,
} from '../../utils/EventManagement';

/** Cancella tramite le API il template scelto in "Cancella Template Evento". */
@autoInjectable()
export class EventTemplateDeleteModalSubmitHandler extends InteractionHandler {

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
        return interaction.customId === EVENT_TEMPLATE_DELETE_SELECT_MODAL_ID ? this.some() : this.none();
    }

    public override async run(interaction: ModalSubmitInteraction) {
        if (!isAdministrator(interaction)) {
            await interaction.reply({ content: NO_PERMISSION_MESSAGE, flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const [templateValue] = interaction.fields.getStringSelectValues(EVENT_TEMPLATE_SELECT_INPUT_ID);

        let template: EventTemplate | undefined;
        try {
            // Il nome serve solo per il messaggio di conferma
            template = await this.eventTemplateManager!.getById(Number(templateValue));
            await this.eventTemplateManager!.delete(template.id);

            await interaction.editReply(`🗑️ Template **${template.name}** cancellato.`);
        } catch (error) {
            console.error(`[EventTemplateDeleteModalSubmitHandler] Errore durante la cancellazione del template ${templateValue}:`, error);
            await interaction.editReply(this.describeError(error, template));
        }
    }

    protected describeError(error: unknown, template: EventTemplate | undefined): string {
        if (error instanceof KodamaApiError && error.status === 409) {
            return `❌ Il template **${template?.name}** è già stato pianificato almeno una volta: `
                + 'non può essere cancellato finché esistono le sue edizioni.';
        }
        if (error instanceof KodamaApiError && error.status === 404) {
            return '❌ Il template non esiste più: potrebbe essere già stato cancellato.';
        }
        return '❌ Non è stato possibile cancellare il template, riprova più tardi.';
    }
}
