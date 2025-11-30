import "reflect-metadata";
import { Listener } from '@sapphire/framework';
import { GuildMember } from 'discord.js';

export class RemoveListener extends Listener {
  public constructor(context: Listener.LoaderContext, options: Listener.Options) {
    super(context, {
      ...options,
      event: 'guildMemberRemove'
    });
  }

  public override async run(member: GuildMember) {
    try {
      const channelId = '1304861264790556773';
      const channel = await member.guild.channels.fetch(channelId);

      if (channel && channel.isTextBased()) {
        const username = member.user?.tag ?? member.displayName ?? 'Utente sconosciuto';
        await channel.send(`👋 L'utente ${username} ha lasciato il server.`);
      }
    } catch (error) {
      console.error('Errore durante l\'invio dell\'avviso di uscita utente:', error);
    }
  }
}
