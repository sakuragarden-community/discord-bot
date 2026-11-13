import "reflect-metadata";
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import {
    ButtonInteraction,
    LabelBuilder,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import { EVENT_TEMPLATE_LIMITS } from '../../managers/EventTemplateManager';
import {
    EVENT_TEMPLATE_CONTINUE_BUTTON_ID,
    EVENT_TEMPLATE_DRAFT_EXPIRED_MESSAGE,
    EVENT_TEMPLATE_NEWS_CHANNEL_INPUT_ID,
    EVENT_TEMPLATE_NEWS_CONTENT_INPUT_ID,
    EVENT_TEMPLATE_NEWS_MODAL_ID,
    EVENT_TEMPLATE_THREAD_POST_INPUT_ID,
    getEventTemplateDraft,
    isAdministrator,
    NO_PERMISSION_MESSAGE,
} from '../../utils/EventManagement';

/** Apre il secondo passo della creazione di un template evento: canale, notizia e messaggio del thread. */
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

        if (!getEventTemplateDraft(interaction.user.id)) {
            await interaction.reply({ content: EVENT_TEMPLATE_DRAFT_EXPIRED_MESSAGE, flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.showModal(this.buildModal());
    }

    protected buildModal(): ModalBuilder {
        // In futuro diventerà una select dei canali
        const channel = new TextInputBuilder()
            .setCustomId(EVENT_TEMPLATE_NEWS_CHANNEL_INPUT_ID)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Es. 1547270860338106460')
            .setMaxLength(32)
            .setRequired(true);

        const content = new TextInputBuilder()
            .setCustomId(EVENT_TEMPLATE_NEWS_CONTENT_INPUT_ID)
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(EVENT_TEMPLATE_LIMITS.newsContent)
            .setRequired(true);

        const threadPost = new TextInputBuilder()
            .setCustomId(EVENT_TEMPLATE_THREAD_POST_INPUT_ID)
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(EVENT_TEMPLATE_LIMITS.threadPost)
            .setRequired(false);

        return new ModalBuilder()
            .setCustomId(EVENT_TEMPLATE_NEWS_MODAL_ID)
            .setTitle('Crea Template Evento (2/2)')
            .addLabelComponents(
                new LabelBuilder()
                    .setLabel('Canale Notizie Discord')
                    .setDescription('ID del canale in cui pubblicare la notizia')
                    .setTextInputComponent(channel),
                new LabelBuilder()
                    .setLabel('Messaggio per Canale Notizie Discord')
                    .setDescription('Markdown, pubblicato una settimana prima; il link all\'evento viene aggiunto in coda')
                    .setTextInputComponent(content),
                new LabelBuilder()
                    .setLabel('Messaggio per Thread nel Canale Notizie')
                    .setDescription('Markdown, opzionale: se vuoto il thread si apre con un invito a commentare')
                    .setTextInputComponent(threadPost),
            );
    }
}
