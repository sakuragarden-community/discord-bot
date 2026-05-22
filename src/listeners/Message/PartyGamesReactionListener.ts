import 'reflect-metadata';
import { Listener } from '@sapphire/framework';
import { MessageReaction, User, PartialMessageReaction, PartialUser } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { ConfigManager } from '../../managers/ConfigManager';

/**
 * PartyGamesReactionListener
 *
 * Se un utente aggiunge la reazione 🎉 ad un messaggio nel canale "news",
 * assegna automaticamente all'utente il ruolo di interesse "partygames".
 */
@autoInjectable()
export class PartyGamesReactionListener extends Listener {
  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options,
    protected configManager?: ConfigManager,
  ) {
    super(context, {
      ...options,
      event: 'messageReactionAdd'
    });
  }

  public override async run(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
    try {
      // Ignora i bot
      if ((user as User)?.bot) return;

      // Recupera i partial, se necessario
      if (reaction.partial) {
        try { reaction = await reaction.fetch(); } catch { return; }
      }
      if (reaction.message?.partial) {
        try { await reaction.message.fetch(); } catch { return; }
      }

      const message = reaction.message;
      if (!message || !message.guild) return;

      // Solo nel canale news configurato
      const newsChannelId = this.configManager?.getNewsChannelId();
      if (!newsChannelId) return;
      if (message.channelId !== newsChannelId) return;

      // Emoji deve essere 🎉
      const emojiName = reaction.emoji?.name;
      if (emojiName !== '🎉') return;

      // Recupera il ruolo partygames da config
      const roleId = this.configManager?.getPartygamesRoleId();
      if (!roleId) return;

      // Recupera il membro
      const member = await message.guild.members.fetch(user.id).catch(() => null);
      if (!member) return;

      // Aggiungi il ruolo se non presente
      if (!member.roles.cache.has(roleId)) {
        await member.roles.add(roleId).catch(() => null);
      }
    } catch (error) {
      console.error('Errore in PartyGamesReactionListener:', error);
    }
  }
}
