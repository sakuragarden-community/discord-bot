import { Interaction, PermissionFlagsBits, Role } from 'discord.js';
import { KodamaApiError } from '../managers/ApiManager';
import { Event } from '../managers/EventManager';
import { EventTemplate } from '../managers/EventTemplateManager';

/** Custom ID dei pulsanti pubblicati nel canale eventsManagement (vedi setup/messages.json). */
export const EVENT_PLAN_BUTTON_ID = 'event-plan-button';
export const EVENT_CREATE_BUTTON_ID = 'event-create-button';
export const EVENT_TEMPLATE_CREATE_BUTTON_ID = 'event-template-create-button';
export const EVENT_EDIT_BUTTON_ID = 'event-edit-button';
export const EVENT_DELETE_BUTTON_ID = 'event-delete-button';
export const EVENT_TEMPLATE_EDIT_BUTTON_ID = 'event-template-edit-button';
export const EVENT_TEMPLATE_DELETE_BUTTON_ID = 'event-template-delete-button';

/**
 * Modali di selezione dell'evento o del template da modificare o cancellare. Una modale non può aprirne un'altra:
 * dopo la selezione della modifica il bot risponde con un pulsante "continua", che apre la modale precompilata.
 */
export const EVENT_EDIT_SELECT_MODAL_ID = 'event-edit-select-modal';
export const EVENT_DELETE_SELECT_MODAL_ID = 'event-delete-select-modal';
export const EVENT_SELECT_INPUT_ID = 'event-select';
export const EVENT_TEMPLATE_EDIT_SELECT_MODAL_ID = 'event-template-edit-select-modal';
export const EVENT_TEMPLATE_DELETE_SELECT_MODAL_ID = 'event-template-delete-select-modal';
export const EVENT_TEMPLATE_SELECT_INPUT_ID = 'event-template-select';

/** Pulsanti e modali di modifica: il custom ID è seguito da `:<id>` del record da aggiornare (vedi {@link withRecordId}). */
export const EVENT_EDIT_CONTINUE_BUTTON_ID = 'event-edit-continue-button';
export const EVENT_EDIT_MODAL_ID = 'event-edit-modal';
export const EVENT_TEMPLATE_EDIT_CONTINUE_BUTTON_ID = 'event-template-edit-continue-button';
export const EVENT_TEMPLATE_EDIT_MODAL_ID = 'event-template-edit-modal';

/** Modale "Crea Evento" (e "Modifica Evento", con gli stessi campi). */
export const EVENT_CREATE_MODAL_ID = 'event-create-modal';
export const EVENT_NAME_INPUT_ID = 'event-name';
export const EVENT_SECTION_INPUT_ID = 'event-section';
export const EVENT_INTEREST_INPUT_ID = 'event-interest';
export const EVENT_MAX_PARTICIPANTS_INPUT_ID = 'event-max-participants';
export const EVENT_IS_OPEN_INPUT_ID = 'event-is-open';

/**
 * Modale "Crea Template Evento" (e "Modifica Template Evento", con gli stessi campi): i campi sono otto e una modale
 * ne contiene al massimo cinque, quindi è divisa in due passi. Il primo raccoglie nome del template ed evento Discord,
 * il secondo — aperto dal pulsante "Continua" — la notizia.
 */
export const EVENT_TEMPLATE_MODAL_ID = 'event-template-modal';
export const EVENT_TEMPLATE_EVENT_INPUT_ID = 'event-template-event';
export const EVENT_TEMPLATE_NAME_INPUT_ID = 'event-template-name';
export const EVENT_TEMPLATE_TITLE_INPUT_ID = 'event-template-title';
export const EVENT_TEMPLATE_DESCRIPTION_INPUT_ID = 'event-template-description';
export const EVENT_TEMPLATE_IMAGE_INPUT_ID = 'event-template-image';
export const EVENT_TEMPLATE_CONTINUE_BUTTON_ID = 'event-template-continue-button';
export const EVENT_TEMPLATE_NEWS_MODAL_ID = 'event-template-news-modal';
export const EVENT_TEMPLATE_NEWS_CHANNEL_INPUT_ID = 'event-template-news-channel';
export const EVENT_TEMPLATE_NEWS_CONTENT_INPUT_ID = 'event-template-news-content';
export const EVENT_TEMPLATE_THREAD_POST_INPUT_ID = 'event-template-thread-post';

/** Modale "Pianifica Evento". */
export const EVENT_PLAN_MODAL_ID = 'event-plan-modal';
export const EVENT_PLAN_TEMPLATE_INPUT_ID = 'event-plan-template';
export const EVENT_PLAN_DATE_INPUT_ID = 'event-plan-date';

/** Fuso orario in cui lo Staff inserisce le date e in cui gira il cron delle notizie. */
export const EVENTS_TIME_ZONE = 'Europe/Rome';

/** Numero massimo di opzioni di una select di Discord. */
export const SELECT_MAX_OPTIONS = 25;

/** Lunghezze massime imposte da Discord. */
export const DISCORD_LIMITS = {
    eventDescription: 1000,
    message: 2000,
    threadName: 100,
    selectLabel: 100,
    buttonLabel: 80,
} as const;

/** Testo del link al thread delle iscrizioni, per gli eventi chiusi (notizia ed evento Discord). */
export const EVENT_SIGNUP_LINK_LABEL = 'PREMI QUI PER ISCRIVERTI ALL\'EVENTO!';

/** Formati di immagine accettati da Discord come copertina di un evento. */
export const EVENT_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;

export const NO_PERMISSION_MESSAGE = '❌ Non hai i permessi necessari per eseguire questa operazione.';

/** Accoda al custom ID l'id del record a cui si riferisce, es. `event-edit-modal:3`. */
export function withRecordId(customId: string, id: number): string {
    return `${customId}:${id}`;
}

/** Id del record accodato al custom ID con {@link withRecordId}, o `null` se il custom ID non corrisponde. */
export function parseRecordId(customId: string, prefix: string): number | null {
    const match = customId.match(/^(.+):(\d+)$/);
    return match && match[1] === prefix ? Number(match[2]) : null;
}

/** Opzioni di una select di eventi: nome dell'evento, con la sezione come descrizione. */
export function eventOptions(events: Event[], selectedId?: number) {
    return events.slice(0, SELECT_MAX_OPTIONS).map(({ id, name, sectionName }) => ({
        value: String(id),
        label: truncate(name, DISCORD_LIMITS.selectLabel),
        description: truncate(sectionName, DISCORD_LIMITS.selectLabel),
        default: id === selectedId,
    }));
}

/** Opzioni di una select di template: nome del template, con il nome dell'evento come descrizione. */
export function eventTemplateOptions(templates: EventTemplate[]) {
    return templates.slice(0, SELECT_MAX_OPTIONS).map(({ id, name, eventName }) => ({
        value: String(id),
        label: truncate(name, DISCORD_LIMITS.selectLabel),
        description: truncate(eventName, DISCORD_LIMITS.selectLabel),
    }));
}

/** Solo chi ha i permessi di amministrazione può gestire gli eventi. */
export function isAdministrator(interaction: Interaction): boolean {
    return interaction.inCachedGuild() && interaction.memberPermissions.has(PermissionFlagsBits.Administrator);
}

/** Tronca il testo alla lunghezza indicata, chiudendolo con un'ellissi. */
export function truncate(text: string, maxLength: number): string {
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/**
 * Messaggio per l'utente a partire da un errore delle API: le violazioni di validazione sono elencate per campo,
 * usando le etichette del form al posto dei nomi tecnici.
 */
export function formatApiError(error: unknown, labels: Record<string, string>, fallback: string): string {
    if (!(error instanceof KodamaApiError) || error.status === undefined || error.status >= 500) {
        return fallback;
    }

    if (error.violations.length > 0) {
        const lines = error.violations.map(({ field, message }) => `- **${labels[field] ?? field}**: ${message}`);
        return truncate(['❌ I dati inseriti non sono validi:', ...lines].join('\n'), DISCORD_LIMITS.message);
    }

    return truncate(`❌ ${error.message}`, DISCORD_LIMITS.message);
}

/** Messaggio di errore per una validazione eseguita direttamente dal bot. */
export function validationError(label: string, message: string): string {
    return `❌ I dati inseriti non sono validi:\n- **${label}**: ${message}`;
}

/** Parti di data e ora di un istante, lette nel fuso orario indicato. */
interface ZonedParts {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
}

function getZonedParts(date: Date, timeZone: string): ZonedParts {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
    }).formatToParts(date);

    const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)!.value);
    return {
        year: get('year'),
        month: get('month'),
        day: get('day'),
        hour: get('hour'),
        minute: get('minute'),
        second: get('second'),
    };
}

/** Scarto in millisecondi fra l'ora locale del fuso e UTC nell'istante indicato (es. +1h per Roma in inverno). */
function getTimeZoneOffset(date: Date, timeZone: string): number {
    const { year, month, day, hour, minute, second } = getZonedParts(date, timeZone);
    const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    return asUtc - (date.getTime() - date.getMilliseconds());
}

/**
 * Istante corrispondente a data e ora locali del fuso indicato. Gli overflow vengono normalizzati come in
 * `Date.UTC` (es. il giorno 32 diventa il primo del mese successivo).
 */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number,
                               timeZone: string = EVENTS_TIME_ZONE): Date {
    const wallClock = Date.UTC(year, month - 1, day, hour, minute);
    // Lo scarto va ricalcolato sull'istante ottenuto: a cavallo del cambio d'ora quello iniziale è sbagliato
    const firstGuess = wallClock - getTimeZoneOffset(new Date(wallClock), timeZone);
    return new Date(wallClock - getTimeZoneOffset(new Date(firstGuess), timeZone));
}

/** Mezzanotte del giorno di `date` più `offsetDays`, nel fuso orario degli eventi. */
export function startOfZonedDay(date: Date, offsetDays = 0): Date {
    const { year, month, day } = getZonedParts(date, EVENTS_TIME_ZONE);
    return zonedTimeToUtc(year, month, day + offsetDays, 0, 0);
}

/**
 * Interpreta una data nel formato `GG/MM/AAAA HH:MM`, nel fuso orario degli eventi.
 * Ritorna `null` se il formato non è rispettato o la data non esiste (es. 31/02).
 */
export function parsePlannedAt(input: string): Date | null {
    const match = input.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2})[:.](\d{2})$/);
    if (!match) return null;

    const [day, month, year, hour, minute] = match.slice(1).map(Number);
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;

    const date = zonedTimeToUtc(year, month, day, hour, minute);
    const parts = getZonedParts(date, EVENTS_TIME_ZONE);
    // Una data inesistente viene normalizzata in un'altra: il confronto la scarta
    if (parts.day !== day || parts.month !== month || parts.year !== year) return null;

    return date;
}

/** Ora nel formato `HH:MM`, nel fuso orario degli eventi. */
export function formatZonedTime(date: Date): string {
    return new Intl.DateTimeFormat('it-IT', {
        timeZone: EVENTS_TIME_ZONE,
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

/** Data estesa senza anno, es. `sabato 21 novembre`, nel fuso orario degli eventi. */
export function formatZonedLongDate(date: Date): string {
    return new Intl.DateTimeFormat('it-IT', {
        timeZone: EVENTS_TIME_ZONE,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    }).format(date);
}

/**
 * Sostituisce nel testo le variabili `{{nome}}` con i valori indicati; gli spazi dentro le graffe sono ignorati e
 * le variabili sconosciute restano come sono.
 */
export function replaceTemplateVariables(text: string, values: Record<string, string>): string {
    return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) => values[name] ?? match);
}

/** Data e ora nel formato `GG/MM/AAAA HH:MM`, nel fuso orario degli eventi. */
export function formatZonedDateTime(date: Date): string {
    const { year, month, day } = getZonedParts(date, EVENTS_TIME_ZONE);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${pad(day)}/${pad(month)}/${year} ${formatZonedTime(date)}`;
}

/**
 * Descrizione dell'evento Discord: una riga di riepilogo, seguita dalla descrizione del template, es.
 * `**🎨 Arte | 👥 Max 12 persone | ✅ Partecipazione libera**`.
 */
export function buildDiscordEventDescription(event: Event, role: Role, description: string): string {
    const roleLabel = [role.unicodeEmoji, role.name].filter(Boolean).join(' ');
    const participants = event.maxParticipants === 0 ? 'Nessun limite' : `Max ${event.maxParticipants} persone`;
    const access = event.isOpen ? '✅ Partecipazione libera' : '🔒 Iscrizione richiesta';

    return truncate(`**${roleLabel} | 👥 ${participants} | ${access}**\n${description}`, DISCORD_LIMITS.eventDescription);
}

/** Dati raccolti dal primo passo della creazione o modifica di un template, in attesa del secondo. */
export interface EventTemplateDraft {
    /** Template in modifica, usato per precompilare il secondo passo; assente in creazione. */
    existing?: EventTemplate;
    eventId: number;
    name: string;
    discordEventTitle: string;
    discordEventDescription: string;
    /**
     * Immagine già scaricata, come data URI: l'URL dell'allegato Discord scade. In modifica è assente se l'immagine
     * non viene sostituita.
     */
    discordEventImage?: string;
}

/** Tempo entro cui completare il secondo passo, trascorso il quale la bozza viene scartata. */
export const EVENT_TEMPLATE_DRAFT_TTL_MS = 15 * 60 * 1000;

const templateDrafts = new Map<string, { draft: EventTemplateDraft; timeout: NodeJS.Timeout }>();

/** Salva la bozza dell'utente, sostituendo un'eventuale bozza precedente. */
export function saveEventTemplateDraft(userId: string, draft: EventTemplateDraft): void {
    deleteEventTemplateDraft(userId);
    const timeout = setTimeout(() => templateDrafts.delete(userId), EVENT_TEMPLATE_DRAFT_TTL_MS);
    templateDrafts.set(userId, { draft, timeout });
}

export function getEventTemplateDraft(userId: string): EventTemplateDraft | null {
    return templateDrafts.get(userId)?.draft ?? null;
}

export function deleteEventTemplateDraft(userId: string): void {
    const entry = templateDrafts.get(userId);
    if (!entry) return;

    clearTimeout(entry.timeout);
    templateDrafts.delete(userId);
}

export const EVENT_TEMPLATE_DRAFT_EXPIRED_MESSAGE =
    '❌ I dati del primo passo non sono più disponibili (sono passati più di 15 minuti o il bot è stato riavviato). '
    + 'Ricomincia premendo di nuovo "Crea Template Evento" o "Modifica Template Evento".';
