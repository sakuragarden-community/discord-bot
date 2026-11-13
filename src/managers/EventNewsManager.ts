import "reflect-metadata";
import {
    ChannelType,
    Client,
    GuildScheduledEvent,
    hyperlink,
    NewsChannel,
    roleMention,
    TextChannel,
    ThreadAutoArchiveDuration,
} from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { EventEdition } from './EventEditionManager';
import { Event, EventManager } from './EventManager';
import { EventTemplate, EventTemplateManager } from './EventTemplateManager';
import {
    DISCORD_LIMITS,
    EVENT_SIGNUP_LINK_LABEL,
    formatZonedLongDate,
    formatZonedTime,
    replaceTemplateVariables,
    truncate,
} from '../utils/EventManagement';

/** Tipo di notizia: la settimana prima riporta il messaggio del template, il giorno stesso un promemoria. */
export type EventNewsKind = 'week-before' | 'same-day';

/** Titolo H3 con il link alle iscrizioni, in coda alla notizia della settimana prima degli eventi chiusi. */
function buildSignupHeading(threadUrl: string): string {
    return `## ${hyperlink(EVENT_SIGNUP_LINK_LABEL, threadUrl)}`;
}

/** Spazio riservato a {@link buildSignupHeading}: a capo, titolo e URL del thread (`/channels/<guild>/<thread>`). */
const SIGNUP_LINE_MAX_LENGTH = 1 + buildSignupHeading('https://discord.com/channels/00000000000000000000/00000000000000000000').length;

/** Tipi di notizia nell'ordine in cui vengono pubblicati. */
export const EVENT_NEWS_KINDS: readonly EventNewsKind[] = ['week-before', 'same-day'];

/**
 * Pubblica nel canale notizie del template la notizia di un'edizione, chiusa dal tag del ruolo di interesse
 * dell'evento e dal link all'evento Discord. Per gli eventi chiusi, la notizia della settimana prima rimanda anche
 * al thread per le iscrizioni, sia in coda al messaggio sia nella descrizione dell'evento Discord. Il tutto insieme al thread dei commenti (che per gli
 * eventi chiusi raccoglie anche le iscrizioni). Usato dal cron giornaliero e, in test, alla pianificazione.
 */
@autoInjectable()
export class EventNewsManager {

    public constructor(
        protected eventTemplateManager?: EventTemplateManager,
        protected eventManager?: EventManager,
    ) {}

    /**
     * Se `TEST_EVENT_REMINDER=1`, le notizie di un'edizione vengono pubblicate subito dopo la pianificazione,
     * senza attendere le 12:00 della settimana prima e del giorno stesso.
     */
    public static isTestReminderEnabled(): boolean {
        return process.env.TEST_EVENT_REMINDER?.trim() === '1';
    }

    /** Ritorna `false` se l'evento Discord dell'edizione è stato eliminato e la notizia non è stata pubblicata. */
    public async publishNews(client: Client, edition: EventEdition, kind: EventNewsKind): Promise<boolean> {
        const template = await this.eventTemplateManager!.getById(edition.eventTemplateId);
        const event = await this.eventManager!.getById(template.eventId);

        const channel = await client.channels.fetch(template.discordNewsChannel).catch(() => null);
        if (channel?.type !== ChannelType.GuildText && channel?.type !== ChannelType.GuildAnnouncement) {
            throw new Error(`il canale notizie ${template.discordNewsChannel} del template ${template.id} non esiste o non è testuale`);
        }

        const scheduledEvent = await this.resolveScheduledEvent(channel, edition);
        if (scheduledEvent === undefined) {
            console.warn(`[EventNewsManager] Evento Discord dell'edizione ${edition.id} eliminato: notizia (${kind}) non pubblicata.`);
            return false;
        }

        // Per gli eventi chiusi la notizia della settimana prima apre le iscrizioni nel thread
        const opensSignup = kind === 'week-before' && !event.isOpen;

        const plannedAt = new Date(edition.plannedAt);
        const content = kind === 'week-before'
            ? this.fillNewsVariables(template.discordNewsContent, event, plannedAt)
            : this.buildReminder(template, plannedAt);

        // Riga finale: tag del ruolo di interesse e link all'evento. Si tronca solo il contenuto, per non perderla;
        // va lasciato spazio anche al link alle iscrizioni, aggiunto quando il thread esiste
        const footer = [roleMention(event.interest), scheduledEvent?.url].filter(Boolean).join(' ');
        const reserved = footer.length + 2 + (opensSignup ? SIGNUP_LINE_MAX_LENGTH : 0);
        const text = `${truncate(content, DISCORD_LIMITS.message - reserved)}\n\n${footer}`;
        const message = await channel.send({ content: text, allowedMentions: { roles: [event.interest] } });

        const thread = await message.startThread({
            name: truncate(`💬 ${template.discordEventTitle}`, DISCORD_LIMITS.threadName),
            autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
            reason: `Commenti all'evento "${template.discordEventTitle}"`,
        });
        await thread.send(template.discordThreadPost ?? this.buildDefaultThreadPost(template));

        if (opensSignup) {
            await message.edit({ content: `${text}\n${buildSignupHeading(thread.url)}`, allowedMentions: { parse: [] } });
            if (scheduledEvent) await this.addSignupLinkToEvent(scheduledEvent, thread.url);
        }

        console.info(`[EventNewsManager] Pubblicata la notizia (${kind}) dell'edizione ${edition.id} in #${channel.name}.`);
        return true;
    }

    /**
     * Inserisce dopo la prima riga della descrizione dell'evento Discord (il riepilogo) il link alle iscrizioni nel
     * thread. Un link già presente viene sostituito, così una seconda pubblicazione non lo duplica. Un errore non
     * blocca la notizia, già pubblicata: viene solo registrato.
     */
    protected async addSignupLinkToEvent(scheduledEvent: GuildScheduledEvent, threadUrl: string): Promise<void> {
        const [summary, ...rest] = (scheduledEvent.description ?? '').split('\n');
        const body = rest[0]?.includes(EVENT_SIGNUP_LINK_LABEL) ? rest.slice(1) : rest;
        const signupLine = hyperlink(EVENT_SIGNUP_LINK_LABEL, threadUrl);

        try {
            await scheduledEvent.edit({
                description: truncate([summary, signupLine, ...body].join('\n'), DISCORD_LIMITS.eventDescription),
                reason: 'Link alle iscrizioni nel thread della notizia',
            });
        } catch (error) {
            console.error(`[EventNewsManager] Errore durante l'aggiunta del link alle iscrizioni all'evento Discord ${scheduledEvent.id}:`, error);
        }
    }

    /**
     * Evento Discord dell'edizione: `null` se l'edizione non ne ha uno (la notizia esce senza link),
     * `undefined` se l'evento è stato eliminato da Discord, cioè annullato.
     */
    protected async resolveScheduledEvent(channel: TextChannel | NewsChannel, edition: EventEdition): Promise<GuildScheduledEvent | null | undefined> {
        if (!edition.discordEventId) {
            console.warn(`[EventNewsManager] L'edizione ${edition.id} non ha un evento Discord: notizia senza link.`);
            return null;
        }

        try {
            return await channel.guild.scheduledEvents.fetch(edition.discordEventId);
        } catch (error) {
            // Unknown Guild Scheduled Event
            if ((error as { code?: number }).code === 10070) return undefined;
            throw error;
        }
    }

    /**
     * Variabili disponibili nel messaggio della notizia:
     * - `{{data}}`: giorno dell'edizione, es. `sabato 21 novembre`;
     * - `{{ora}}`: ora italiana dell'edizione, es. `21:15`;
     * - `{{partecipanti}}`: numero massimo di partecipanti dell'evento, anche se `0`.
     */
    protected fillNewsVariables(content: string, event: Event, plannedAt: Date): string {
        return replaceTemplateVariables(content, {
            data: formatZonedLongDate(plannedAt),
            ora: formatZonedTime(plannedAt),
            partecipanti: String(event.maxParticipants),
        });
    }

    /** Promemoria generico del giorno stesso, al posto del messaggio del template. */
    protected buildReminder(template: EventTemplate, plannedAt: Date): string {
        return `📢 **Oggi alle ore ${formatZonedTime(plannedAt)}** si terrà l'evento **${template.discordEventTitle}**: vi aspettiamo! 🌸`;
    }

    /** Apertura del thread quando il template non ne specifica una. */
    protected buildDefaultThreadPost(template: EventTemplate): string {
        return `💬 Questo è il thread dell'evento **${template.discordEventTitle}**: lascia qui un commento!`;
    }
}
