import "reflect-metadata";
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import {
    ButtonInteraction,
    FileUploadBuilder,
    LabelBuilder,
    MessageFlags,
    ModalBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { Event, EventManager } from '../../managers/EventManager';
import { EVENT_TEMPLATE_LIMITS } from '../../managers/EventTemplateManager';
import {
    DISCORD_LIMITS,
    EVENT_TEMPLATE_CREATE_BUTTON_ID,
    EVENT_TEMPLATE_DESCRIPTION_INPUT_ID,
    EVENT_TEMPLATE_EVENT_INPUT_ID,
    EVENT_TEMPLATE_IMAGE_INPUT_ID,
    EVENT_TEMPLATE_MODAL_ID,
    EVENT_TEMPLATE_TITLE_INPUT_ID,
    isAdministrator,
    NO_PERMISSION_MESSAGE,
    SELECT_MAX_OPTIONS,
    truncate,
} from '../../utils/EventManagement';

/**
 * Apre il primo passo della creazione di un template evento, con gli eventi caricati dalle API.
 * Riservato agli amministratori.
 */
@autoInjectable()
export class EventTemplateCreateButtonHandler extends InteractionHandler {

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
        return interaction.customId === EVENT_TEMPLATE_CREATE_BUTTON_ID ? this.some() : this.none();
    }

    public override async run(interaction: ButtonInteraction) {
        if (!isAdministrator(interaction)) {
            await interaction.reply({ content: NO_PERMISSION_MESSAGE, flags: MessageFlags.Ephemeral });
            return;
        }

        let events: Event[];
        try {
            events = await this.eventManager!.listAll({ sort: 'name,asc' });
        } catch (error) {
            console.error('[EventTemplateCreateButtonHandler] Errore durante il caricamento degli eventi:', error);
            await interaction.reply({ content: '❌ Non è stato possibile caricare gli eventi, riprova più tardi.', flags: MessageFlags.Ephemeral });
            return;
        }

        if (events.length === 0) {
            await interaction.reply({ content: '❌ Non è presente nessun evento: premi prima "Crea Evento".', flags: MessageFlags.Ephemeral });
            return;
        }
        if (events.length > SELECT_MAX_OPTIONS) {
            console.warn(`[EventTemplateCreateButtonHandler] ${events.length} eventi presenti, mostrati solo i primi ${SELECT_MAX_OPTIONS}.`);
        }

        await interaction.showModal(this.buildModal(events.slice(0, SELECT_MAX_OPTIONS)));
    }

    protected buildModal(events: Event[]): ModalBuilder {
        const event = new StringSelectMenuBuilder()
            .setCustomId(EVENT_TEMPLATE_EVENT_INPUT_ID)
            .setRequired(true)
            .addOptions(events.map(({ id, name, sectionName }) => ({
                value: String(id),
                label: truncate(name, DISCORD_LIMITS.selectLabel),
                description: truncate(sectionName, DISCORD_LIMITS.selectLabel),
            })));

        const title = new TextInputBuilder()
            .setCustomId(EVENT_TEMPLATE_TITLE_INPUT_ID)
            .setStyle(TextInputStyle.Short)
            .setMaxLength(EVENT_TEMPLATE_LIMITS.title)
            .setRequired(true);

        const description = new TextInputBuilder()
            .setCustomId(EVENT_TEMPLATE_DESCRIPTION_INPUT_ID)
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(EVENT_TEMPLATE_LIMITS.description)
            .setRequired(true);

        const image = new FileUploadBuilder()
            .setCustomId(EVENT_TEMPLATE_IMAGE_INPUT_ID)
            .setMinValues(1)
            .setMaxValues(1)
            .setRequired(true);

        return new ModalBuilder()
            .setCustomId(EVENT_TEMPLATE_MODAL_ID)
            .setTitle('Crea Template Evento (1/2)')
            .addLabelComponents(
                new LabelBuilder().setLabel('Evento').setStringSelectMenuComponent(event),
                new LabelBuilder()
                    .setLabel('Titolo dell\'Evento Discord')
                    .setTextInputComponent(title),
                new LabelBuilder()
                    .setLabel('Descrizione dell\'Evento Discord')
                    .setDescription('Markdown; la riga di riepilogo (interesse, partecipanti, accesso) viene aggiunta in automatico')
                    .setTextInputComponent(description),
                new LabelBuilder()
                    .setLabel('Immagine dell\'Evento Discord')
                    .setDescription('PNG, JPEG, GIF o WEBP, max 4 MB')
                    .setFileUploadComponent(image),
            );
    }
}
