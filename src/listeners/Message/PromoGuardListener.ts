import 'reflect-metadata';
import { Listener } from '@sapphire/framework';
import { EmbedBuilder, Message } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { ConfigManager } from '../../managers/ConfigManager';

/**
 * PromoGuardListener
 *
 * Requisito: Se un utente invia un messaggio nel canale "promo" ma è nel server da meno di 2 settimane,
 * il messaggio viene eliminato e si invia un embed di avviso nel canale, taggando l'utente.
 */
@autoInjectable()
export class PromoGuardListener extends Listener {
  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options,
    protected configManager: ConfigManager,
  ) {
    super(context, {
      ...options,
      event: 'messageCreate'
    });
  }

  public override async run(message: Message) {
    try {
      // Ignora messaggi non di server o inviati da bot
      if (!message.guild) return;
      if (message.author?.bot) return;

      // Solo nel canale promo configurato
      const promoChannelId = this.configManager.getPromoChannelId();
      if (!promoChannelId) return;
      if (message.channelId !== promoChannelId) return;

      const member = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
      if (!member) return; // impossibile verificare l'anzianità

      const joinedTs = member.joinedTimestamp;
      if (!joinedTs) return; // nessuna informazione utile

      const now = Date.now();
      const elapsedMs = now - joinedTs;
      const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;

      if (elapsedMs >= twoWeeksMs) return; // Ha già 2 settimane nel server

      // Prova a cancellare il messaggio originale
      try {
        await message.delete();
      } catch {
        // Se non ho permesso, proseguo comunque con l'avviso
      }

      // Invia un embed di avviso nel canale promo
      const remainingDays = Math.max(0, Math.ceil((twoWeeksMs - elapsedMs) / (24 * 60 * 60 * 1000)));

      const embed = new EmbedBuilder()
        .setTitle('⛔ Attenzione!')
        .setDescription(
          `Per poter pubblicare in questo canale devi essere nel server da almeno **2 settimane**. ` +
          (remainingDays > 0 ? `Ti mancano circa **${remainingDays}** giorn${remainingDays === 1 ? 'o' : 'i'}.` : '')
        )
        .setColor(0xFF5555);

      await (message.channel as any).send({
        content: `<@${message.author.id}>`, // garantisce il tag
        embeds: [embed],
        allowedMentions: { users: [message.author.id] }
      });
    } catch (err) {
      // Log silenzioso per evitare di bloccare il bot
      console.error('PromoGuardListener error:', err);
    }
  }
}
