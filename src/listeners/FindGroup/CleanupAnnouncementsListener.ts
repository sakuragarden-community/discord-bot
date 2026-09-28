import "reflect-metadata";
import { Cron } from '@sapphire/cron';
import { Listener } from '@sapphire/framework';
import { AnyThreadChannel, ChannelType, Events, Message, TextChannel } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { SettingsManager } from '../../managers/SettingsManager';
import { LFG_MAX_AGE_MS } from '../../utils/FindGroup';

/** Allo scoccare di ogni ora. */
const CLEANUP_CRON = new Cron('0 * * * *');

/** Avvia la pulizia oraria degli annunci e dei thread del canale find_group più vecchi di {@link LFG_MAX_AGE_MS}. */
@autoInjectable()
export class CleanupAnnouncementsListener extends Listener {

    public constructor(
        context: Listener.LoaderContext,
        options: Listener.Options,
        protected settingsManager?: SettingsManager,
    ) {
        super(context, {
            ...options,
            event: Events.ClientReady,
            once: true,
        });
    }

    public override run() {
        this.scheduleNext();
    }

    protected scheduleNext() {
        const delay = CLEANUP_CRON.next().getTime() - Date.now();
        setTimeout(async () => {
            try {
                await this.cleanup();
            } catch (error) {
                console.error('[CleanupAnnouncementsListener] Errore durante la pulizia degli annunci:', error);
            }
            this.scheduleNext();
        }, delay);
    }

    protected async cleanup() {
        const channelId = await this.settingsManager!.getFindGroupChannelId();
        if (!channelId) return;

        const channel = await this.container.client.channels.fetch(channelId);
        if (channel?.type !== ChannelType.GuildText) return;

        const cutoff = Date.now() - LFG_MAX_AGE_MS;

        // I thread vanno rimossi per primi: eliminare il messaggio d'origine non elimina il thread
        for (const thread of await this.fetchExpiredThreads(channel, cutoff)) {
            await thread.delete('Annuncio cerca gruppo scaduto');
        }
        for (const message of await this.fetchExpiredAnnouncements(channel, cutoff)) {
            await message.delete();
        }
    }

    /** Thread creati dal bot nel canale (attivi o archiviati) prima del cutoff. */
    protected async fetchExpiredThreads(channel: TextChannel, cutoff: number): Promise<AnyThreadChannel[]> {
        const botId = this.container.client.user!.id;
        const [active, archived] = await Promise.all([
            channel.threads.fetchActive(),
            channel.threads.fetchArchived({ type: 'public' }),
        ]);

        return [...active.threads.values(), ...archived.threads.values()].filter((thread) =>
            thread.parentId === channel.id
            && thread.ownerId === botId
            && (thread.createdTimestamp ?? Infinity) < cutoff,
        );
    }

    /**
     * Annunci pubblicati prima del cutoff: sono gli unici messaggi del bot nel canale che menzionano un utente,
     * a differenza dei messaggi di setup.
     */
    protected async fetchExpiredAnnouncements(channel: TextChannel, cutoff: number): Promise<Message[]> {
        const botId = this.container.client.user!.id;
        const expired: Message[] = [];

        let before: string | undefined;
        while (true) {
            const page = await channel.messages.fetch({ limit: 100, before });
            if (page.size === 0) break;
            expired.push(...page.filter((message) =>
                message.author.id === botId
                && message.mentions.users.size > 0
                && message.createdTimestamp < cutoff,
            ).values());
            before = page.lastKey();
        }

        return expired;
    }
}
