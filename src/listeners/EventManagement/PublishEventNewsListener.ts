import "reflect-metadata";
import { Listener } from '@sapphire/framework';
import { ChannelType, Events, NewsChannel, TextChannel, ThreadAutoArchiveDuration } from 'discord.js';
import cron from 'node-cron';
import { autoInjectable } from 'tsyringe';
import { EventEdition, EventEditionManager } from '../../managers/EventEditionManager';
import { EventTemplate, EventTemplateManager } from '../../managers/EventTemplateManager';
import {
    DISCORD_LIMITS,
    EVENTS_TIME_ZONE,
    formatZonedTime,
    startOfZonedDay,
    truncate,
} from '../../utils/EventManagement';

/**
 * Ogni giorno alle 12:00 ora italiana. `@sapphire/cron` lavora solo in UTC, mentre `node-cron` accetta il fuso
 * orario e segue il cambio dell'ora legale.
 */
const PUBLISH_CRON = '0 12 * * *';

/** Giorni di anticipo con cui viene pubblicata la prima notizia. */
const WEEK_BEFORE_DAYS = 7;

/** Tipo di notizia: la settimana prima riporta il messaggio del template, il giorno stesso un promemoria. */
type NewsKind = 'week-before' | 'same-day';

/**
 * Pubblica nel canale notizie di ciascun template la notizia degli eventi che si tengono oggi o fra una settimana,
 * insieme al thread dei commenti (che per gli eventi chiusi raccoglie anche le iscrizioni).
 *
 * Le notizie partono solo allo scoccare delle 12:00: se il bot non è attivo in quel momento, quelle del giorno
 * non vengono recuperate.
 */
@autoInjectable()
export class PublishEventNewsListener extends Listener {

    public constructor(
        context: Listener.LoaderContext,
        options: Listener.Options,
        protected eventEditionManager?: EventEditionManager,
        protected eventTemplateManager?: EventTemplateManager,
    ) {
        super(context, {
            ...options,
            event: Events.ClientReady,
            once: true,
        });
    }

    public override run() {
        cron.schedule(PUBLISH_CRON, async () => {
            try {
                await this.publishDailyNews(new Date());
            } catch (error) {
                console.error('[PublishEventNewsListener] Errore durante la pubblicazione delle notizie:', error);
            }
        }, { name: 'publish-event-news', timezone: EVENTS_TIME_ZONE, noOverlap: true });
    }

    protected async publishDailyNews(now: Date) {
        const [sameDay, weekBefore] = await Promise.all([
            this.eventEditionManager!.listPlannedBetween(startOfZonedDay(now), startOfZonedDay(now, 1)),
            this.eventEditionManager!.listPlannedBetween(
                startOfZonedDay(now, WEEK_BEFORE_DAYS),
                startOfZonedDay(now, WEEK_BEFORE_DAYS + 1),
            ),
        ]);

        const news: [EventEdition, NewsKind][] = [
            ...weekBefore.map((edition): [EventEdition, NewsKind] => [edition, 'week-before']),
            ...sameDay.map((edition): [EventEdition, NewsKind] => [edition, 'same-day']),
        ];

        // Ogni notizia è indipendente: un errore non deve impedire la pubblicazione delle altre
        for (const [edition, kind] of news) {
            try {
                await this.publishNews(edition, kind);
            } catch (error) {
                console.error(`[PublishEventNewsListener] Errore durante la pubblicazione della notizia (${kind}) dell'edizione ${edition.id}:`, error);
            }
        }
    }

    protected async publishNews(edition: EventEdition, kind: NewsKind) {
        const template = await this.eventTemplateManager!.getById(edition.eventTemplateId);

        const channel = await this.container.client.channels.fetch(template.discordNewsChannel).catch(() => null);
        if (channel?.type !== ChannelType.GuildText && channel?.type !== ChannelType.GuildAnnouncement) {
            throw new Error(`il canale notizie ${template.discordNewsChannel} del template ${template.id} non esiste o non è testuale`);
        }

        const eventUrl = await this.resolveEventUrl(channel, edition);
        if (eventUrl === undefined) {
            console.warn(`[PublishEventNewsListener] Evento Discord dell'edizione ${edition.id} eliminato: notizia (${kind}) non pubblicata.`);
            return;
        }

        const content = kind === 'week-before'
            ? template.discordNewsContent
            : this.buildReminder(template, new Date(edition.plannedAt));

        const message = await channel.send(truncate([content, eventUrl].filter(Boolean).join('\n\n'), DISCORD_LIMITS.message));

        const thread = await message.startThread({
            name: truncate(`💬 ${template.discordEventTitle}`, DISCORD_LIMITS.threadName),
            autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
            reason: `Commenti all'evento "${template.discordEventTitle}"`,
        });
        await thread.send(template.discordThreadPost ?? this.buildDefaultThreadPost(template));

        console.info(`[PublishEventNewsListener] Pubblicata la notizia (${kind}) dell'edizione ${edition.id} in #${channel.name}.`);
    }

    /**
     * Link all'evento Discord dell'edizione: `null` se l'edizione non ne ha uno (la notizia esce senza link),
     * `undefined` se l'evento è stato eliminato da Discord, cioè annullato.
     */
    protected async resolveEventUrl(channel: TextChannel | NewsChannel, edition: EventEdition): Promise<string | null | undefined> {
        if (!edition.discordEventId) {
            console.warn(`[PublishEventNewsListener] L'edizione ${edition.id} non ha un evento Discord: notizia senza link.`);
            return null;
        }

        try {
            const scheduledEvent = await channel.guild.scheduledEvents.fetch(edition.discordEventId);
            return scheduledEvent.url;
        } catch (error) {
            // Unknown Guild Scheduled Event
            if ((error as { code?: number }).code === 10070) return undefined;
            throw error;
        }
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
