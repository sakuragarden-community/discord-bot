import "reflect-metadata";
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ButtonInteraction, MessageFlags } from 'discord.js';
import {
    EVENT_TEMPLATE_CONTINUE_BUTTON_ID,
    EVENT_TEMPLATE_DRAFT_EXPIRED_MESSAGE,
    getEventTemplateDraft,
    isAdministrator,
    NO_PERMISSION_MESSAGE,
} from '../../utils/EventManagement';
import { buildEventTemplateNewsModal } from '../../utils/EventManagementModals';

/**
 * Apre il secondo passo della creazione o modifica di un template evento: canale, notizia e messaggio del thread,
 * precompilati se il template è in modifica.
 */
export class EventTemplateContinueButtonHandler extends InteractionHandler {

    public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
        super(context, {
            ...options,
            interactionHandlerType: InteractionHandlerTypes.Button,
        });
    }

    public override parse(interaction: ButtonInteraction) {
        return interaction.customId === EVENT_TEMPLATE_CONTINUE_BUTTON_ID ? this.some() : this.none();
    }

    public override async run(interaction: ButtonInteraction) {
        if (!isAdministrator(interaction)) {
            await interaction.reply({ content: NO_PERMISSION_MESSAGE, flags: MessageFlags.Ephemeral });
            return;
        }

        const draft = getEventTemplateDraft(interaction.user.id);
        if (!draft) {
            await interaction.reply({ content: EVENT_TEMPLATE_DRAFT_EXPIRED_MESSAGE, flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.showModal(buildEventTemplateNewsModal(draft.existing));
    }
}
