import "reflect-metadata";
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalSubmitInteraction } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { EventTemplate, EventTemplateManager } from '../../managers/EventTemplateManager';
import {
    DISCORD_LIMITS,
    EVENT_TEMPLATE_EDIT_CONTINUE_BUTTON_ID,
    EVENT_TEMPLATE_EDIT_SELECT_MODAL_ID,
    EVENT_TEMPLATE_SELECT_INPUT_ID,
    isAdministrator,
    NO_PERMISSION_MESSAGE,
    truncate,
    withRecordId,
} from '../../utils/EventManagement';

/**
 * Template scelto in "Modifica Template Evento": una modale non può aprirne un'altra, quindi il bot risponde con il
 * pulsante che apre il primo passo precompilato.
 */
@autoInjectable()
export class EventTemplateEditSelectModalSubmitHandler extends InteractionHandler {

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
        return interaction.customId === EVENT_TEMPLATE_EDIT_SELECT_MODAL_ID ? this.some() : this.none();
    }

    public override async run(interaction: ModalSubmitInteraction) {
        if (!isAdministrator(interaction)) {
            await interaction.reply({ content: NO_PERMISSION_MESSAGE, flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const [templateValue] = interaction.fields.getStringSelectValues(EVENT_TEMPLATE_SELECT_INPUT_ID);

        let template: EventTemplate;
        try {
            template = await this.eventTemplateManager!.getById(Number(templateValue));
        } catch (error) {
            console.error(`[EventTemplateEditSelectModalSubmitHandler] Errore durante il caricamento del template ${templateValue}:`, error);
            await interaction.editReply('❌ Non è stato possibile caricare il template: potrebbe essere stato cancellato.');
            return;
        }

        const button = new ButtonBuilder()
            .setCustomId(withRecordId(EVENT_TEMPLATE_EDIT_CONTINUE_BUTTON_ID, template.id))
            .setStyle(ButtonStyle.Primary)
            .setLabel(truncate(`Modifica "${template.name}"`, DISCORD_LIMITS.buttonLabel));

        await interaction.editReply({
            content: `✏️ Premi il pulsante per modificare il template **${template.name}**: i campi saranno già compilati `
                + 'con i valori attuali. La modifica si svolge in due passi, come la creazione.',
            components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
        });
    }
}
