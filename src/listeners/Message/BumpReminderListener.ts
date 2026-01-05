import "reflect-metadata";
import { Listener } from '@sapphire/framework';
import { Message, TextBasedChannel } from 'discord.js';

// Canale target dove osservare il comando /bump
const TARGET_CHANNEL_ID = '1444757275268092185';
// ID del bot DISBOARD (in caso si voglia rilevare il messaggio di conferma del bump)
const DISBOARD_BOT_ID = '302050872383242240';

// Mantiene un timer per canale per evitare duplicati
const bumpTimers = new Map<string, NodeJS.Timeout>();

export class BumpReminderListener extends Listener {
    public constructor(context: Listener.LoaderContext, options: Listener.Options) {
        super(context, {
            ...options,
            event: 'messageCreate'
        });
    }

    public override async run(message: Message) {
        try {
            // Ignora i DM e messaggi senza canale
            if (!message.guild || !message.channelId) return;
            // Solo nel canale target
            if (message.channelId !== TARGET_CHANNEL_ID) return;

            const content = (message.content ?? '').trim().toLowerCase();

            const triggeredBySlashText = content.includes('/bump');
            const triggeredByDisboard = message.author?.id === DISBOARD_BOT_ID;

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
                    const ch = await message.client.channels.fetch(TARGET_CHANNEL_ID);
                    if (ch && (ch as any).isTextBased && (ch as any).isTextBased() && 'send' in (ch as any)) {
                        await (ch as any).send('⏰ Sono passate 2 ore! Ricorda di avviare di nuovo il comando per bumpare.');
                    }
                } catch (err) {
                    // Log silenzioso
                    console.error('Errore nell\'invio del reminder:', err);
                } finally {
                    bumpTimers.delete(TARGET_CHANNEL_ID);
                }
            }, 2 * 60 * 60 * 1000);

            bumpTimers.set(message.channelId, timeout);
        } catch (e) {
            // Non bloccare il bot per errori inattesi
            console.error('BumpReminderListener error:', e);
        }
    }
}
