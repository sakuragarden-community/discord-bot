import "reflect-metadata";
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import {
    ActionRowBuilder,
    Attachment,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ModalSubmitInteraction,
} from 'discord.js';
import axios from 'axios';
import { autoInjectable } from 'tsyringe';
import { EVENT_TEMPLATE_LIMITS, EventTemplate, EventTemplateManager } from '../../managers/EventTemplateManager';
import {
    EVENT_IMAGE_TYPES,
    EVENT_TEMPLATE_CONTINUE_BUTTON_ID,
    EVENT_TEMPLATE_DESCRIPTION_INPUT_ID,
    EVENT_TEMPLATE_EDIT_MODAL_ID,
    EVENT_TEMPLATE_EVENT_INPUT_ID,
    EVENT_TEMPLATE_IMAGE_INPUT_ID,
    EVENT_TEMPLATE_MODAL_ID,
    EVENT_TEMPLATE_NAME_INPUT_ID,
    EVENT_TEMPLATE_TITLE_INPUT_ID,
    isAdministrator,
    NO_PERMISSION_MESSAGE,
    parseRecordId,
    saveEventTemplateDraft,
    validationError,
} from '../../utils/EventManagement';

/**
 * Primo passo della creazione o modifica di un template evento: scarica l'immagine, conserva i dati in una bozza e
 * propone il pulsante per aprire il secondo passo (una modale non può aprirne un'altra direttamente).
 *
 * In modifica il custom ID riporta l'id del template e l'immagine è facoltativa: senza, resta quella attuale.
 */
@autoInjectable()
export class EventTemplateModalSubmitHandler extends InteractionHandler {

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
        if (interaction.customId === EVENT_TEMPLATE_MODAL_ID) return this.some<number | null>(null);

        const templateId = parseRecordId(interaction.customId, EVENT_TEMPLATE_EDIT_MODAL_ID);
        return templateId === null ? this.none() : this.some<number | null>(templateId);
    }

    public override async run(interaction: ModalSubmitInteraction, templateId: number | null) {
        if (!isAdministrator(interaction)) {
            await interaction.reply({ content: NO_PERMISSION_MESSAGE, flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const [eventValue] = interaction.fields.getStringSelectValues(EVENT_TEMPLATE_EVENT_INPUT_ID);
        const name = interaction.fields.getTextInputValue(EVENT_TEMPLATE_NAME_INPUT_ID).trim();
        const title = interaction.fields.getTextInputValue(EVENT_TEMPLATE_TITLE_INPUT_ID).trim();
        const description = interaction.fields.getTextInputValue(EVENT_TEMPLATE_DESCRIPTION_INPUT_ID).trim();
        const image = interaction.fields.getUploadedFiles(EVENT_TEMPLATE_IMAGE_INPUT_ID, false)?.first();

        // In modifica serve il template attuale, per precompilare il secondo passo
        let existing: EventTemplate | undefined;
        if (templateId !== null) {
            try {
                existing = await this.eventTemplateManager!.getById(templateId);
            } catch (error) {
                console.error(`[EventTemplateModalSubmitHandler] Errore durante il caricamento del template ${templateId}:`, error);
                await interaction.editReply('❌ Non è stato possibile caricare il template da modificare: potrebbe essere stato cancellato.');
                return;
            }
        }

        // L'immagine è obbligatoria solo in creazione
        let dataUri: string | undefined;
        if (image || !existing) {
            const imageError = this.validateImage(image);
            if (imageError) {
                await interaction.editReply(validationError('Immagine dell\'Evento Discord', imageError));
                return;
            }

            try {
                dataUri = await this.downloadAsDataUri(image!);
            } catch (error) {
                console.error('[EventTemplateModalSubmitHandler] Errore durante il download dell\'immagine:', error);
                await interaction.editReply('❌ Non è stato possibile leggere l\'immagine caricata, riprova più tardi.');
                return;
            }
        }

        saveEventTemplateDraft(interaction.user.id, {
            existing,
            eventId: Number(eventValue),
            name,
            discordEventTitle: title,
            discordEventDescription: description,
            discordEventImage: dataUri,
        });

        const button = new ButtonBuilder()
            .setCustomId(EVENT_TEMPLATE_CONTINUE_BUTTON_ID)
            .setStyle(ButtonStyle.Primary)
            .setLabel('Continua: notizia e thread');

        await interaction.editReply({
            content: '📝 Dati dell\'evento Discord salvati. Premi il pulsante entro 15 minuti per compilare la notizia e il thread.',
            components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
        });
    }

    /** Ritorna il motivo per cui l'immagine non è accettabile, o `null` se è valida. */
    protected validateImage(image: Attachment | undefined): string | null {
        if (!image) return 'è obbligatoria';

        const contentType = image.contentType?.split(';')[0].trim();
        if (!contentType || !(EVENT_IMAGE_TYPES as readonly string[]).includes(contentType)) {
            return 'deve essere un file PNG, JPEG, GIF o WEBP';
        }
        if (image.size > EVENT_TEMPLATE_LIMITS.imageBytes) {
            return 'non può superare i 4 MB';
        }
        return null;
    }

    /** Scarica l'allegato e lo codifica come data URI, l'unico formato che sopravvive alla scadenza dell'URL. */
    protected async downloadAsDataUri(image: Attachment): Promise<string> {
        const response = await axios.get<ArrayBuffer>(image.url, { responseType: 'arraybuffer' });
        const contentType = image.contentType!.split(';')[0].trim();
        return `data:${contentType};base64,${Buffer.from(response.data).toString('base64')}`;
    }
}
