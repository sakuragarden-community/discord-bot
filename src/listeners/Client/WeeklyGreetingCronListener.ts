import 'reflect-metadata';
import { Listener, container } from '@sapphire/framework';
import { EmbedBuilder, TextBasedChannel } from 'discord.js';
import cron from 'node-cron';
import { autoInjectable } from 'tsyringe';
import { ConfigManager } from '../../managers/ConfigManager';

@autoInjectable()
export class WeeklyGreetingCronListener extends Listener {
    private static started = false;

    public constructor(
        context: Listener.LoaderContext,
        options: Listener.Options,
        protected configManager?: ConfigManager,
    ) {
        super(context, {
            ...options,
            event: 'ready',
            once: true
        });
    }

    public override async run() {
        try {
            if (WeeklyGreetingCronListener.started) return;
            WeeklyGreetingCronListener.started = true;

            const guildId = (this.configManager as any)?.getGuild ? (await this.configManager!.getGuild()).id : undefined;
            const topChannelId = this.configManager?.getTopChannelId();
            const mainChannelId = this.configManager?.getMainChannelId();

            if (!topChannelId || !mainChannelId) {
                console.warn('[WeeklyGreetingCron] Missing channel IDs in config. top or main not defined.');
                return;
            }

            const embedColor = this.configManager?.getSecondaryColor() as any;

            cron.schedule('0 9 * * 1', async () => {
                try {
                    const ch = await container.client.channels.fetch(topChannelId);
                    if (!ch) return;
                    // Ensure it's a text channel and can send
                    const isText = (ch as any).isTextBased?.() ?? false;
                    if (!isText) return;

                    const jumpUrl = guildId && mainChannelId
                        ? `https://discord.com/channels/${guildId}/${mainChannelId}`
                        : `<#${mainChannelId}>`;

                    const embed = new EmbedBuilder()
                        .setTitle('☀️ Comincia una nuova settimana in Sakura Garden!')
                        .setDescription(`[Vai a dare il buongiorno in chat come fanno i boomer!](${jumpUrl})`)
                        .setColor(embedColor ?? 0xF39595);

                    if (typeof ch.isTextBased === 'function' && ch.isTextBased() && 'send' in ch) {
                        await ch.send({ embeds: [embed] });
                    }
                } catch (err) {
                    console.error('[WeeklyGreetingCron] Error while sending message:', err);
                }
            }, { timezone: 'Europe/Rome' });

            console.log('[WeeklyGreetingCron] Cron job scheduled: every Monday at 09:00 (Europe/Rome)');
        } catch (e) {
            console.error('[WeeklyGreetingCron] Failed to start cron:', e);
        }
    }
}
