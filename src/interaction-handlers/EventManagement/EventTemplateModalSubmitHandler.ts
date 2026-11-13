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
import { EVENT_TEMPLATE_LIMITS } from '../../managers/EventTemplateManager';
import {
    EVENT_IMAGE_TYPES,
    EVENT_TEMPLATE_CONTINUE_BUTTON_ID,
    EVENT_TEMPLATE_DESCRIPTION_INPUT_ID,
    EVENT_TEMPLATE_EVENT_INPUT_ID,
    EVENT_TEMPLATE_IMAGE_INPUT_ID,
    EVENT_TEMPLATE_MODAL_ID,
    EVENT_TEMPLATE_TITLE_INPUT_ID,
    isAdministrator,
    NO_PERMISSION_MESSAGE,
    saveEventTemplateDraft,
    validationError,
} from '../../utils/EventManagement';

/**
 * Primo passo della creazione di un template evento: scarica l'immagine, conserva i dati in una bozza e propone
 * il pulsante per aprire il secondo passo (una modale non può aprirne un'altra direttamente).
 */
export class EventTemplateModalSubmitHandler extends InteractionHandler {

    public constructor(context: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
        super(context, {
            ...options,
            interactionHandlerType: InteractionHandlerTypes.ModalSubmit,
        });
    }

    public override parse(interaction: ModalSubmitInteraction) {
        return interaction.customId === EVENT_TEMPLATE_MODAL_ID ? this.some() : this.none();
    }

    public override async run(interaction: ModalSubmitInteraction) {
        if (!isAdministrator(interaction)) {
            await interaction.reply({ content: NO_PERMISSION_MESSAGE, flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const [eventValue] = interaction.fields.getStringSelectValues(EVENT_TEMPLATE_EVENT_INPUT_ID);
        const title = interaction.fields.getTextInputValue(EVENT_TEMPLATE_TITLE_INPUT_ID).trim();
        const description = interaction.fields.getTextInputValue(EVENT_TEMPLATE_DESCRIPTION_INPUT_ID).trim();
        const image = interaction.fields.getUploadedFiles(EVENT_TEMPLATE_IMAGE_INPUT_ID, true).first();

        const imageError = this.validateImage(image);
        if (imageError) {
            await interaction.editReply(validationError('Immagine dell\'Evento Discord', imageError));
            return;
        }

        let dataUri: string;
        try {
            dataUri = await this.downloadAsDataUri(image!);
        } catch (error) {
            console.error('[EventTemplateModalSubmitHandler] Errore durante il download dell\'immagine:', error);
            await interaction.editReply('❌ Non è stato possibile leggere l\'immagine caricata, riprova più tardi.');
            return;
        }

        saveEventTemplateDraft(interaction.user.id, {
            eventId: Number(eventValue),
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
