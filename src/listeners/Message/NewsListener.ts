import "reflect-metadata";
import { Listener } from '@sapphire/framework';
import { Message } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { ConfigManager } from '../../managers/ConfigManager';

@autoInjectable()
export class NewsListener extends Listener {
    public constructor(
        context: Listener.LoaderContext,
        options: Listener.Options,
        protected configManager?: ConfigManager,
    ) {
        super(context, {
            ...options,
            event: 'messageCreate'
        });
    }

    public override async run(message: Message) {
        try {
            // Ignora i DM o messaggi senza guild
            if (!message.guild || !message.channelId) return;

            const newsChannelId = this.configManager?.getNewsChannelId();
            if (!newsChannelId) return;

            // Solo nel canale news
            if (message.channelId !== newsChannelId) return;

            // Se il messaggio è parziale, prova a fetcharlo prima di reagire
            if (message.partial) {
                try { await message.fetch(); } catch { /* ignore fetch errors */ }
            }

            // Aggiunge la reazione 🌸
            await message.react('🌸');
        } catch (e) {
            // Non bloccare il bot per errori inattesi
            console.error('NewsListener error:', e);
        }
    }
}
