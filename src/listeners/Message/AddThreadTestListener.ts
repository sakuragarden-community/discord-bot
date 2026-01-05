import "reflect-metadata";
import { Listener } from '@sapphire/framework';
import { AnyThreadChannel, Message } from 'discord.js';

export class AddThreadTestListener extends Listener {
    public constructor(context: Listener.LoaderContext, options: Listener.Options) {
        super(context, {
            ...options,
            event: 'messageCreate'
        });
    }

    public override async run(message: Message) {
        try {
            const content = (message.content ?? '').toLowerCase();
            if (!content.includes('cicciotest2')) return;

            // IDs forniti nella richiesta
            const targetUserId = '565269500560277568';
            const targetThreadId = '1446243416022454312';

            const channel = await message.client.channels.fetch(targetThreadId);
            if (!channel || !('isThread' in channel) || !channel.isThread()) {
                await message.reply('❌ Thread non trovato o non valido.');
                return;
            }

            const thread = channel as AnyThreadChannel;

            try {
                await thread.members.add(targetUserId);
                await message.reply('✅ Utente aggiunto al thread con successo.');
            } catch (err) {
                await message.reply('❌ Impossibile aggiungere l\'utente al thread: ' + (err as Error).message);
            }
        } catch (e) {
            // Silenzia errori imprevisti con un minimo feedback
            try {
                await message.reply('Errore imprevisto: ' + (e as Error).message);
            } catch {}
        }
    }
}
