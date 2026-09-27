import "reflect-metadata";
import { Listener } from '@sapphire/framework';
import { EmbedBuilder, Message } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { SettingsManager } from '../../managers/SettingsManager';
import { MemberManager } from '../../managers/MemberManager';

@autoInjectable()
export class PromoGuardListener extends Listener {

    /** Giorni di permanenza nel server necessari per poter fare self promo. */
    protected static readonly MIN_DAYS = 14;

    protected static readonly DAY_MS = 24 * 60 * 60 * 1000;

    public constructor(
        context: Listener.LoaderContext,
        options: Listener.Options,
        protected settingsManager?: SettingsManager,
        protected memberManager?: MemberManager,
    ) {
        super(context, {
            ...options,
            event: 'messageCreate'
        });
    }

    public override async run(message: Message) {
        try {
            await this.guardPromo(message);
        } catch (e) {
            // Non bloccare il bot per errori inattesi
            console.error('PromoGuardListener error:', e);
        }
    }

    /** Cancella i messaggi nel canale promo degli utenti entrati nel server da meno di {@link MIN_DAYS} giorni. */
    protected async guardPromo(message: Message) {
        // Ignora i DM, i messaggi senza guild e i bot
        if (!message.guild || !message.channelId || message.author.bot) return;

        const promoChannelId = await this.settingsManager?.getPromoChannelId();
        if (!promoChannelId) return;

        // Solo nel canale promo
        if (message.channelId !== promoChannelId) return;

        const joinedAt = await this.getJoinedAt(message);
        if (!joinedAt) return;

        const allowedAt = new Date(joinedAt.getTime() + PromoGuardListener.MIN_DAYS * PromoGuardListener.DAY_MS);
        const remainingMs = allowedAt.getTime() - Date.now();
        if (remainingMs <= 0) return;

        const remainingDays = Math.ceil(remainingMs / PromoGuardListener.DAY_MS);

        await message.delete();
        await this.sendWarning(message, joinedAt, allowedAt, remainingDays);
    }

    /** Ricava la data di iscrizione dell'utente dalle API Kodama, con fallback sul dato Discord. */
    protected async getJoinedAt(message: Message): Promise<Date | null> {
        try {
            const member = await this.memberManager?.findByDiscordId(message.author.id);
            if (member?.joinedAt) {
                return new Date(member.joinedAt);
            }
        } catch (error) {
            console.error("Errore durante il recupero del membro dalle API Kodama:", error);
        }

        return message.member?.joinedAt ?? null;
    }

    /** Tagga l'utente nel canale promo con un embed che spiega quanto deve ancora attendere. */
    protected async sendWarning(message: Message, joinedAt: Date, allowedAt: Date, remainingDays: number) {
        if (!message.channel.isSendable()) return;

        const joinedTs = Math.floor(joinedAt.getTime() / 1000);
        const allowedTs = Math.floor(allowedAt.getTime() / 1000);
        const daysLabel = remainingDays === 1 ? 'giorno' : 'giorni';

        const embed = new EmbedBuilder()
            .setTitle('🚫 Self promo non ancora consentita')
            .setColor(await this.settingsManager!.getAlertColor())
            .setDescription([
                `Non puoi fare self promo se sei all'interno del server da meno di ${PromoGuardListener.MIN_DAYS / 7} settimane.`,
                '',
                `• Data di iscrizione: <t:${joinedTs}:D>`,
                `• Giorni da attendere: **${remainingDays} ${daysLabel}**`,
            ].join('\n'));

        await message.channel.send({ content: message.author.toString(), embeds: [embed] });
    }
}
