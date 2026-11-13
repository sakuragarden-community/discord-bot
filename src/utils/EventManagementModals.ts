import {
    FileUploadBuilder,
    LabelBuilder,
    ModalBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import { Event } from '../managers/EventManager';
import { EVENT_TEMPLATE_LIMITS, EventTemplate } from '../managers/EventTemplateManager';
import { Section } from '../managers/SectionManager';
import {
    DISCORD_LIMITS,
    EVENT_CREATE_MODAL_ID,
    EVENT_EDIT_MODAL_ID,
    EVENT_INTEREST_INPUT_ID,
    EVENT_IS_OPEN_INPUT_ID,
    EVENT_MAX_PARTICIPANTS_INPUT_ID,
    EVENT_NAME_INPUT_ID,
    EVENT_SECTION_INPUT_ID,
    EVENT_TEMPLATE_DESCRIPTION_INPUT_ID,
    EVENT_TEMPLATE_EDIT_MODAL_ID,
    EVENT_TEMPLATE_EVENT_INPUT_ID,
    EVENT_TEMPLATE_IMAGE_INPUT_ID,
    EVENT_TEMPLATE_MODAL_ID,
    EVENT_TEMPLATE_NAME_INPUT_ID,
    EVENT_TEMPLATE_NEWS_CHANNEL_INPUT_ID,
    EVENT_TEMPLATE_NEWS_CONTENT_INPUT_ID,
    EVENT_TEMPLATE_NEWS_MODAL_ID,
    EVENT_TEMPLATE_THREAD_POST_INPUT_ID,
    EVENT_TEMPLATE_TITLE_INPUT_ID,
    eventOptions,
    SELECT_MAX_OPTIONS,
    truncate,
    withRecordId,
} from './EventManagement';

/** Opzioni passate a {@link buildSelectionModal}. */
export interface SelectionModalOptions {
    customId: string;
    title: string;
    selectId: string;
    label: string;
    description?: string;
    options: { value: string; label: string; description?: string }[];
}

/** Modale con un'unica select, usata per scegliere l'evento o il template da modificare o cancellare. */
export function buildSelectionModal({ customId, title, selectId, label, description, options }: SelectionModalOptions): ModalBuilder {
    const select = new StringSelectMenuBuilder()
        .setCustomId(selectId)
        .setRequired(true)
        .addOptions(options);

    const labelBuilder = new LabelBuilder().setLabel(label).setStringSelectMenuComponent(select);
    if (description) labelBuilder.setDescription(description);

    return new ModalBuilder()
        .setCustomId(customId)
        .setTitle(title)
        .addLabelComponents(labelBuilder);
}

/**
 * Modale "Crea Evento", o "Modifica Evento" se viene passato l'evento da aggiornare: in quel caso i campi sono
 * precompilati con i valori attuali e il custom ID riporta l'id dell'evento.
 */
export function buildEventModal(sections: Section[], event?: Event): ModalBuilder {
    const name = new TextInputBuilder()
        .setCustomId(EVENT_NAME_INPUT_ID)
        .setStyle(TextInputStyle.Short)
        .setMaxLength(100)
        .setRequired(true);
    if (event) name.setValue(event.name);

    const section = new StringSelectMenuBuilder()
        .setCustomId(EVENT_SECTION_INPUT_ID)
        .setRequired(true)
        .addOptions(sections.slice(0, SELECT_MAX_OPTIONS).map(({ id, name }) => ({
            value: String(id),
            label: truncate(name, DISCORD_LIMITS.selectLabel),
            default: id === event?.sectionId,
        })));

    // In futuro diventerà una select dei ruoli
    const interest = new TextInputBuilder()
        .setCustomId(EVENT_INTEREST_INPUT_ID)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Es. 1321813930842001468')
        .setMaxLength(32)
        .setRequired(true);
    if (event) interest.setValue(event.interest);

    const maxParticipants = new TextInputBuilder()
        .setCustomId(EVENT_MAX_PARTICIPANTS_INPUT_ID)
        .setStyle(TextInputStyle.Short)
        .setValue(String(event?.maxParticipants ?? 0))
        .setMaxLength(4)
        .setRequired(true);

    const isOpenValue = event?.isOpen ?? true;
    const isOpen = new StringSelectMenuBuilder()
        .setCustomId(EVENT_IS_OPEN_INPUT_ID)
        .setRequired(true)
        .addOptions(
            { value: 'yes', label: 'Sì', description: 'Partecipazione libera', emoji: '✅', default: isOpenValue },
            { value: 'no', label: 'No', description: 'Iscrizione richiesta', emoji: '🔒', default: !isOpenValue },
        );

    return new ModalBuilder()
        .setCustomId(event ? withRecordId(EVENT_EDIT_MODAL_ID, event.id) : EVENT_CREATE_MODAL_ID)
        .setTitle(event ? 'Modifica Evento' : 'Crea Evento')
        .addLabelComponents(
            new LabelBuilder().setLabel('Nome').setTextInputComponent(name),
            new LabelBuilder().setLabel('Sezione').setStringSelectMenuComponent(section),
            new LabelBuilder()
                .setLabel('Interesse')
                .setDescription('ID del ruolo Discord di riferimento')
                .setTextInputComponent(interest),
            new LabelBuilder()
                .setLabel('Numero di partecipanti')
                .setDescription('Numero massimo di persone, 0 per nessun limite')
                .setTextInputComponent(maxParticipants),
            new LabelBuilder()
                .setLabel('Evento aperto')
                .setDescription('"No" se l\'evento richiede delle iscrizioni')
                .setStringSelectMenuComponent(isOpen),
        );
}

/**
 * Primo passo di "Crea Template Evento", o di "Modifica Template Evento" se viene passato il template da aggiornare:
 * in quel caso i campi sono precompilati e l'immagine diventa facoltativa (se non ne viene caricata una nuova,
 * resta quella attuale).
 */
export function buildEventTemplateModal(events: Event[], template?: EventTemplate): ModalBuilder {
    const event = new StringSelectMenuBuilder()
        .setCustomId(EVENT_TEMPLATE_EVENT_INPUT_ID)
        .setRequired(true)
        .addOptions(eventOptions(events, template?.eventId));

    const name = new TextInputBuilder()
        .setCustomId(EVENT_TEMPLATE_NAME_INPUT_ID)
        .setStyle(TextInputStyle.Short)
        .setMaxLength(EVENT_TEMPLATE_LIMITS.name)
        .setRequired(true);
    if (template) name.setValue(template.name);

    const title = new TextInputBuilder()
        .setCustomId(EVENT_TEMPLATE_TITLE_INPUT_ID)
        .setStyle(TextInputStyle.Short)
        .setMaxLength(EVENT_TEMPLATE_LIMITS.title)
        .setRequired(true);
    if (template) title.setValue(template.discordEventTitle);

    const description = new TextInputBuilder()
        .setCustomId(EVENT_TEMPLATE_DESCRIPTION_INPUT_ID)
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(EVENT_TEMPLATE_LIMITS.description)
        .setRequired(true);
    if (template) description.setValue(template.discordEventDescription);

    const image = new FileUploadBuilder()
        .setCustomId(EVENT_TEMPLATE_IMAGE_INPUT_ID)
        .setMaxValues(1);
    if (template) {
        image.setRequired(false);
    } else {
        image.setMinValues(1).setRequired(true);
    }

    return new ModalBuilder()
        .setCustomId(template ? withRecordId(EVENT_TEMPLATE_EDIT_MODAL_ID, template.id) : EVENT_TEMPLATE_MODAL_ID)
        .setTitle(template ? 'Modifica Template Evento (1/2)' : 'Crea Template Evento (1/2)')
        .addLabelComponents(
            new LabelBuilder().setLabel('Evento').setStringSelectMenuComponent(event),
            new LabelBuilder()
                .setLabel('Nome Template')
                .setDescription('Con questo nome il template compare nella lista di "Pianifica Evento"')
                .setTextInputComponent(name),
            new LabelBuilder()
                .setLabel('Titolo dell\'Evento Discord')
                .setTextInputComponent(title),
            new LabelBuilder()
                .setLabel('Descrizione dell\'Evento Discord')
                .setDescription('Markdown; la riga di riepilogo (interesse, partecipanti, accesso) viene aggiunta in automatico')
                .setTextInputComponent(description),
            new LabelBuilder()
                .setLabel('Immagine dell\'Evento Discord')
                .setDescription(template
                    ? 'Facoltativa: caricane una solo per sostituire quella attuale (PNG, JPEG, GIF o WEBP, max 4 MB)'
                    : 'PNG, JPEG, GIF o WEBP, max 4 MB')
                .setFileUploadComponent(image),
        );
}

/** Secondo passo del template: canale, notizia e thread, precompilati con i valori del template in modifica. */
export function buildEventTemplateNewsModal(template?: EventTemplate): ModalBuilder {
    // In futuro diventerà una select dei canali
    const channel = new TextInputBuilder()
        .setCustomId(EVENT_TEMPLATE_NEWS_CHANNEL_INPUT_ID)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Es. 1547270860338106460')
        .setMaxLength(32)
        .setRequired(true);
    if (template) channel.setValue(template.discordNewsChannel);

    const content = new TextInputBuilder()
        .setCustomId(EVENT_TEMPLATE_NEWS_CONTENT_INPUT_ID)
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(EVENT_TEMPLATE_LIMITS.newsContent)
        .setRequired(true);
    if (template) content.setValue(template.discordNewsContent);

    const threadPost = new TextInputBuilder()
        .setCustomId(EVENT_TEMPLATE_THREAD_POST_INPUT_ID)
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(EVENT_TEMPLATE_LIMITS.threadPost)
        .setRequired(false);
    if (template?.discordThreadPost) threadPost.setValue(template.discordThreadPost);

    return new ModalBuilder()
        .setCustomId(EVENT_TEMPLATE_NEWS_MODAL_ID)
        .setTitle(template ? 'Modifica Template Evento (2/2)' : 'Crea Template Evento (2/2)')
        .addLabelComponents(
            new LabelBuilder()
                .setLabel('Canale Notizie Discord')
                .setDescription('ID del canale in cui pubblicare la notizia')
                .setTextInputComponent(channel),
            new LabelBuilder()
                .setLabel('Messaggio per Canale Notizie Discord')
                .setDescription('Markdown, esce una settimana prima. Variabili: {{data}}, {{ora}}, {{partecipanti}}')
                .setTextInputComponent(content),
            new LabelBuilder()
                .setLabel('Messaggio per Thread nel Canale Notizie')
                .setDescription('Markdown, opzionale: se vuoto il thread si apre con un invito a commentare')
                .setTextInputComponent(threadPost),
        );
}
