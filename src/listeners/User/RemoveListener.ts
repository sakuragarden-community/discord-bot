import "reflect-metadata";
import { autoInjectable } from "tsyringe";
import { Listener } from '@sapphire/framework';
import { GuildMember } from 'discord.js';
import { ConfigManager } from "../../managers/ConfigManager";

@autoInjectable()
export class RemoveListener extends Listener {
  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options,
    protected configManager: ConfigManager,
  ) {
    super(context, {
      ...options,
      event: 'guildMemberRemove'
    });
  }

  public override async run(member: GuildMember) {
    try {
      const channelId = this.configManager.getServerChannelId();
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
