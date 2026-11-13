import "reflect-metadata";
import { Listener } from '@sapphire/framework';
import { Events } from 'discord.js';
import cron from 'node-cron';
import { autoInjectable } from 'tsyringe';
import { EventEdition, EventEditionManager } from '../../managers/EventEditionManager';
import { EventNewsKind, EventNewsManager } from '../../managers/EventNewsManager';
import { EVENTS_TIME_ZONE, startOfZonedDay } from '../../utils/EventManagement';

/**
 * Ogni giorno alle 12:00 ora italiana. `@sapphire/cron` lavora solo in UTC, mentre `node-cron` accetta il fuso
 * orario e segue il cambio dell'ora legale.
 */
const PUBLISH_CRON = '0 12 * * *';

/** Giorni di anticipo con cui viene pubblicata la prima notizia. */
const WEEK_BEFORE_DAYS = 7;

/**
 * Pubblica nel canale notizie di ciascun template la notizia degli eventi che si tengono oggi o fra una settimana,
 * insieme al thread dei commenti (vedi {@link EventNewsManager}).
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
        protected eventNewsManager?: EventNewsManager,
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

        const news: [EventEdition, EventNewsKind][] = [
            ...weekBefore.map((edition): [EventEdition, EventNewsKind] => [edition, 'week-before']),
            ...sameDay.map((edition): [EventEdition, EventNewsKind] => [edition, 'same-day']),
        ];

        // Ogni notizia è indipendente: un errore non deve impedire la pubblicazione delle altre
        for (const [edition, kind] of news) {
            try {
                await this.eventNewsManager!.publishNews(this.container.client, edition, kind);
            } catch (error) {
                console.error(`[PublishEventNewsListener] Errore durante la pubblicazione della notizia (${kind}) dell'edizione ${edition.id}:`, error);
            }
        }
    }
}
