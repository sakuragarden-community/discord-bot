import "reflect-metadata";
import {
    APIGuildScheduledEventUser,
    ChannelType,
    Client,
    Guild,
    GuildScheduledEvent,
    hyperlink,
    makeURLSearchParams,
    roleMention,
    Routes,
    ThreadAutoArchiveDuration,
    ThreadChannel,
    userMention,
} from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { EventEdition, EventEditionManager } from './EventEditionManager';
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

/**
 * Titolo con il link alle iscrizioni, in coda alla notizia della settimana prima degli eventi chiusi. Rimanda al
 * messaggio di apertura del thread.
 */
function buildSignupHeading(signupUrl: string): string {
    return `## ${hyperlink(EVENT_SIGNUP_LINK_LABEL, signupUrl)}`;
}

/**
 * Spazio riservato a {@link buildSignupHeading}: a capo, titolo e URL del messaggio di apertura del thread
 * (`/channels/<guild>/<thread>/<message>`).
 */
const SIGNUP_LINE_MAX_LENGTH = 1 + buildSignupHeading(
    'https://discord.com/channels/00000000000000000000/00000000000000000000/00000000000000000000',
).length;

/** Massimo di utenti per pagina dell'endpoint degli iscritti a un evento e per `allowedMentions.users`. */
const MAX_USERS_PER_REQUEST = 100;

/** Tipi di notizia nell'ordine in cui vengono pubblicati. */
export const EVENT_NEWS_KINDS: readonly EventNewsKind[] = ['week-before', 'same-day'];

/** Un messaggio del promemoria, con gli utenti che può pingare. */
interface ReminderMessage {
    content: string;
    users: string[];
}

/**
 * Pubblica le notizie di un'edizione. Usato dal cron giornaliero e alla pianificazione (subito, se mancano meno di
 * 7 giorni, o in modalità di test).
 *
 * - **Settimana prima**: nel canale notizie del template, chiusa dal tag del ruolo di interesse dell'evento e dal
 *   link all'evento Discord, insieme al thread dei commenti (che per gli eventi chiusi raccoglie anche le
 *   iscrizioni, linkato in coda alla notizia e nella descrizione dell'evento Discord). L'ID del thread viene salvato
 *   nell'edizione.
 * - **Giorno stesso**: un promemoria nel thread della notizia della settimana prima, che pinga chi ha cliccato
 *   "Mi interessa" sull'evento Discord.
 */
@autoInjectable()
export class EventNewsManager {

    public constructor(
        protected eventTemplateManager?: EventTemplateManager,
        protected eventManager?: EventManager,
        protected eventEditionManager?: EventEditionManager,
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

        return kind === 'week-before'
            ? this.publishWeekBeforeNews(client, edition, template)
            : this.publishSameDayReminder(client, edition, template);
    }

    protected async publishWeekBeforeNews(client: Client, edition: EventEdition, template: EventTemplate): Promise<boolean> {
        const event = await this.eventManager!.getById(template.eventId);

        const channel = await client.channels.fetch(template.discordNewsChannel).catch(() => null);
        if (channel?.type !== ChannelType.GuildText && channel?.type !== ChannelType.GuildAnnouncement) {
            throw new Error(`il canale notizie ${template.discordNewsChannel} del template ${template.id} non esiste o non è testuale`);
        }

        const scheduledEvent = await this.resolveScheduledEvent(channel.guild, edition);
        if (scheduledEvent === undefined) {
            console.warn(`[EventNewsManager] Evento Discord dell'edizione ${edition.id} eliminato: notizia (week-before) non pubblicata.`);
            return false;
        }

        // Per gli eventi chiusi la notizia apre le iscrizioni nel thread
        const opensSignup = !event.isOpen;
        const plannedAt = new Date(edition.plannedAt);
        const content = this.fillNewsVariables(template.discordNewsContent, event, plannedAt);

        // Riga finale: tag del ruolo di interesse e link all'evento. Si tronca solo il contenuto, per non perderla;
        // va lasciato spazio anche al link alle iscrizioni, aggiunto quando il thread esiste
        const footer = [roleMention(event.interest), scheduledEvent?.url].filter(Boolean).join(' ');
        const reserved = footer.length + 2 + (opensSignup ? SIGNUP_LINE_MAX_LENGTH : 0);
        const text = `${truncate(content, DISCORD_LIMITS.message - reserved)}\n\n${footer}`;
        const message = await channel.send({ content: text, allowedMentions: { roles: [event.interest] } });

        const thread = await message.startThread({
            name: this.buildThreadName(template, plannedAt),
            autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
            reason: `Commenti all'evento "${template.discordEventTitle}"`,
        });
        const threadPost = template.discordThreadPost
            ? this.fillNewsVariables(template.discordThreadPost, event, plannedAt)
            : this.buildDefaultThreadPost(template);
        const firstPost = await thread.send(truncate(threadPost, DISCORD_LIMITS.message));
        await this.saveNewsThread(edition, thread);

        // Le iscrizioni rimandano al messaggio di apertura del thread, non al thread in sé
        if (opensSignup) {
            await message.edit({ content: `${text}\n${buildSignupHeading(firstPost.url)}`, allowedMentions: { parse: [] } });
            if (scheduledEvent) await this.addSignupLinkToEvent(scheduledEvent, firstPost.url);
        }

        console.info(`[EventNewsManager] Pubblicata la notizia (week-before) dell'edizione ${edition.id} in #${channel.name}.`);
        return true;
    }

    /**
     * Promemoria nel thread della notizia della settimana prima. L'edizione viene riletta dalle API, perché il
     * thread potrebbe essere stato salvato dopo che è stata caricata (es. modalità di test).
     */
    protected async publishSameDayReminder(client: Client, edition: EventEdition, template: EventTemplate): Promise<boolean> {
        const { discordNewsThreadId } = await this.eventEditionManager!.getById(edition.id);
        if (!discordNewsThreadId) {
            throw new Error(`l'edizione ${edition.id} non ha un thread della notizia della settimana prima in cui pubblicare il promemoria`);
        }

        const thread = await client.channels.fetch(discordNewsThreadId).catch(() => null);
        if (!thread?.isThread()) {
            throw new Error(`il thread ${discordNewsThreadId} della notizia dell'edizione ${edition.id} non esiste più`);
        }

        const scheduledEvent = await this.resolveScheduledEvent(thread.guild, edition);
        if (scheduledEvent === undefined) {
            console.warn(`[EventNewsManager] Evento Discord dell'edizione ${edition.id} eliminato: promemoria (same-day) non pubblicato.`);
            return false;
        }

        // Il thread si archivia dopo una settimana di inattività, cioè proprio intorno al giorno dell'evento
        if (thread.archived) await thread.setArchived(false, 'Promemoria del giorno dell\'evento');

        const interested = scheduledEvent ? await this.fetchInterestedUserIds(client, scheduledEvent) : [];
        const reminder = [this.buildReminder(template, new Date(edition.plannedAt)), scheduledEvent?.url]
            .filter(Boolean)
            .join('\n');

        for (const { content, users } of this.buildReminderMessages(reminder, interested)) {
            await thread.send({ content, allowedMentions: { users } });
        }

        console.info(`[EventNewsManager] Pubblicato il promemoria (same-day) dell'edizione ${edition.id} nel thread ${thread.id}, con ${interested.length} menzioni.`);
        return true;
    }

    /**
     * Salva nell'edizione il thread della notizia, dove il giorno dell'evento uscirà il promemoria. Un errore non
     * blocca la notizia, già pubblicata: viene solo registrato.
     */
    protected async saveNewsThread(edition: EventEdition, thread: ThreadChannel): Promise<void> {
        try {
            await this.eventEditionManager!.update(edition.id, {
                eventTemplateId: edition.eventTemplateId,
                plannedAt: edition.plannedAt,
                discordEventId: edition.discordEventId,
                discordNewsThreadId: thread.id,
            });
        } catch (error) {
            console.error(`[EventNewsManager] Errore durante il salvataggio del thread ${thread.id} nell'edizione ${edition.id}: il promemoria del giorno stesso non potrà essere pubblicato.`, error);
        }
    }

    /**
     * Utenti (bot esclusi) che hanno cliccato "Mi interessa" sull'evento Discord. `fetchSubscribers` di discord.js
     * non espone la paginazione, quindi l'endpoint viene chiamato direttamente, 100 utenti alla volta.
     */
    protected async fetchInterestedUserIds(client: Client, scheduledEvent: GuildScheduledEvent): Promise<string[]> {
        const ids: string[] = [];
        let after: string | undefined;

        while (true) {
            const page = await client.rest.get(Routes.guildScheduledEventUsers(scheduledEvent.guildId, scheduledEvent.id), {
                query: makeURLSearchParams({ limit: MAX_USERS_PER_REQUEST, after }),
            }) as APIGuildScheduledEventUser[];

            ids.push(...page.filter(({ user }) => !user.bot).map(({ user }) => user.id));
            if (page.length < MAX_USERS_PER_REQUEST) return ids;
            after = page[page.length - 1].user.id;
        }
    }

    /**
     * Divide promemoria e menzioni in messaggi entro i limiti di Discord (lunghezza e 100 utenti pingabili per
     * messaggio): il primo contiene il promemoria, i successivi solo le menzioni rimaste.
     */
    protected buildReminderMessages(reminder: string, userIds: string[]): ReminderMessage[] {
        const messages: ReminderMessage[] = [{ content: truncate(reminder, DISCORD_LIMITS.message), users: [] }];

        for (const id of userIds) {
            const current = messages[messages.length - 1];
            const mention = userMention(id);
            const separator = current.users.length > 0 ? ' ' : current.content ? '\n\n' : '';

            if (current.users.length < MAX_USERS_PER_REQUEST
                && current.content.length + separator.length + mention.length <= DISCORD_LIMITS.message) {
                current.content += separator + mention;
                current.users.push(id);
            } else {
                messages.push({ content: mention, users: [id] });
            }
        }

        return messages;
    }

    /**
     * Inserisce dopo la prima riga della descrizione dell'evento Discord (il riepilogo) il link alle iscrizioni, cioè
     * al messaggio di apertura del thread. Un link già presente viene sostituito, così una seconda pubblicazione non lo duplica. Un errore non
     * blocca la notizia, già pubblicata: viene solo registrato.
     */
    protected async addSignupLinkToEvent(scheduledEvent: GuildScheduledEvent, signupUrl: string): Promise<void> {
        const [summary, ...rest] = (scheduledEvent.description ?? '').split('\n');
        const body = rest[0]?.includes(EVENT_SIGNUP_LINK_LABEL) ? rest.slice(1) : rest;
        const signupLine = hyperlink(EVENT_SIGNUP_LINK_LABEL, signupUrl);

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
    protected async resolveScheduledEvent(guild: Guild, edition: EventEdition): Promise<GuildScheduledEvent | null | undefined> {
        if (!edition.discordEventId) {
            console.warn(`[EventNewsManager] L'edizione ${edition.id} non ha un evento Discord: notizia senza link.`);
            return null;
        }

        try {
            return await guild.scheduledEvents.fetch(edition.discordEventId);
        } catch (error) {
            // Unknown Guild Scheduled Event
            if ((error as { code?: number }).code === 10070) return undefined;
            throw error;
        }
    }

    /**
     * Titolo del thread: titolo dell'evento e data, es. `💬 Arte libera | sabato 28 novembre`. Se supera il limite di
     * Discord si accorcia il titolo, così la data resta sempre visibile.
     */
    protected buildThreadName(template: EventTemplate, plannedAt: Date): string {
        const prefix = '💬 ';
        const suffix = ` | ${formatZonedLongDate(plannedAt)}`;
        const title = truncate(template.discordEventTitle, DISCORD_LIMITS.threadName - prefix.length - suffix.length);
        return `${prefix}${title}${suffix}`;
    }

    /**
     * Variabili disponibili nel messaggio della notizia e nel messaggio di apertura del thread:
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
