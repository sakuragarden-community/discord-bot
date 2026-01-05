import 'reflect-metadata';
import { Listener } from '@sapphire/framework';
import { EmbedBuilder, Message } from 'discord.js';

/**
 * NewYearListener
 *
 * Quando un messaggio nel server contiene la stringa "sendpromo2026",
 * invia un messaggio privato (DM) a tutti i membri del server con
 * un embed contenente la parola "Prova" e l'immagine fornita.
 */
export class NewYearListener extends Listener {
    public constructor(context: Listener.LoaderContext, options: Listener.Options) {
        super(context, {
            ...options,
            event: 'messageCreate'
        });
    }

    public override async run(message: Message) {
        try {
            // Ignora bot e DM
            if (!message.guild) return;
            if (message.author?.bot) return;

            const content = (message.content ?? '').toLowerCase();
            if (!content.includes('sendpromo2026')) return;

            // Costruisce l'embed richiesto
            const bodyText = `L'inverno sta per arrivare, e la natura si agita presto per coricare i suoi figli sotto il manto di neve. E' stato un anno lungo, intenso, ogni ciclo di stagione porta gioia e dolori che affaticano l'animo e consuma le energie, quindi è il momento per tutti di riporsarsi, e rifocillarsi sotto il tetto di casa propria.\n\nMa l'inverno non starà qui per sempre, e la prossima stagione già affaccia il suo sguardo. Non esiste cosa al mondo che stia ferma e immobile, anche in tempi di riposo si contempla il futuro per tornare di nuovo a splendere, e sarà proprio la primavera a coltivare quei sogni che permeano nel cielo dei nostri pensieri.`;
            const embed = new EmbedBuilder()
                .setTitle(`Come sarà Sakura Garden nel 2026`)
                .setDescription(bodyText)
                .setColor(0xFF69B4)
                .setImage('https://i.imgur.com/1acbR39.jpeg');

            // Recupera tutti i membri del server
            const members = await message.guild.members.fetch();

            let sent = 0;
            let failed = 0;

            await Promise.all(
                members.map(async (member) => {
                    try {
                        if (member.user?.bot) return;
                        await member.send({ embeds: [embed] });
                        // Secondo messaggio testuale dopo l'embed
                        await member.send('# [Clicca qui per leggere le novità che arriveranno nel 2026](https://discord.com/channels/1302653623360294942/1304845273582927952/1449447926848950443)');
                        sent++;
                    } catch {
                        // Utente potrebbe avere i DM chiusi o altri errori
                        failed++;
                    }
                })
            );

            // Risposta di conferma nel canale dove è stato scritto il comando
            try {
                await message.reply(`📨 Promo inviata in DM. Successi: ${sent}, falliti: ${failed}.`);
            } catch {}
        } catch (e) {
            // Non bloccare il bot per errori inattesi
            try {
                await message.reply('Si è verificato un errore durante l\'invio della promo.');
            } catch {}
        }
    }
}
