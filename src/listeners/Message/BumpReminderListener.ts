import "reflect-metadata";
import { Listener } from '@sapphire/framework';
import { Message, EmbedBuilder } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { ConfigManager } from '../../managers/ConfigManager';

// Mantiene un timer per canale per evitare duplicati
const bumpTimers = new Map<string, NodeJS.Timeout>();

@autoInjectable()
export class BumpReminderListener extends Listener {
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
            // Ignora i DM e messaggi senza canale
            if (!message.guild || !message.channelId) return;

            const targetChannelId = this.configManager?.getCommandsChannelId();
            if (!targetChannelId) return;

            // Solo nel canale target
            if (message.channelId !== targetChannelId) return;

            const content = (message.content ?? '').trim().toLowerCase();

            const disboardBotId = this.configManager?.getDisboardBotId();
            const triggeredBySlashText = content.includes('/bump');
            const triggeredByDisboard = !!disboardBotId && message.author?.id === disboardBotId;

            // Opzionale: rilevazione semplice di conferma bump da DISBOARD nel contenuto/embeds
            const embedsText = message.embeds?.map(e => `${e.title ?? ''} ${e.description ?? ''}`.toLowerCase()).join(' ') ?? '';
            const looksLikeBumpConfirmation = embedsText.includes('bump') || content.includes('bump');

            if (!(triggeredBySlashText || (triggeredByDisboard && looksLikeBumpConfirmation))) {
                return;
            }

            // Se esiste già un timer pendente per questo canale, lo resettiamo per partire da ora
            const existing = bumpTimers.get(message.channelId);
            if (existing) {
                clearTimeout(existing);
            }

            // Pianifica il reminder dopo 2 ore (2 * 60 * 60 * 1000 ms)
            const timeout = setTimeout(async () => {
                try {
                    const ch = await message.client.channels.fetch(targetChannelId);
                    if (ch && (ch as any).isTextBased && (ch as any).isTextBased() && 'send' in (ch as any)) {
                        const embed = new EmbedBuilder()
                            .setTitle('⏰ Promemoria Bump')
                            .setDescription('Sono passate 2 ore! Ricorda di avviare di nuovo il comando per bumpare.')
                            .setColor(this.configManager?.getPrimaryColor() ?? 0xF39595);

                        await (ch as any).send({ embeds: [embed] });
                    }
                } catch (err) {
                    // Log silenzioso
                    console.error('Errore nell\'invio del reminder:', err);
                } finally {
                    bumpTimers.delete(targetChannelId);
                }
            }, 2 * 60 * 60 * 1000);

            bumpTimers.set(message.channelId, timeout);
        } catch (e) {
            // Non bloccare il bot per errori inattesi
            console.error('BumpReminderListener error:', e);
        }
    }
}
