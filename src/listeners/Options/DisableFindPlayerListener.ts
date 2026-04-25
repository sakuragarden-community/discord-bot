import "reflect-metadata";
import { autoInjectable } from "tsyringe";
import { Listener } from '@sapphire/framework';
import { GuildMember, PermissionFlagsBits, GuildChannel } from 'discord.js';
import { ConfigManager } from "../../managers/ConfigManager";

@autoInjectable()
export class DisableFindPlayerListener extends Listener {
  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options,
    protected configManager: ConfigManager,
  ) {
    super(context, {
      ...options,
      event: 'guildMemberUpdate'
    });
  }

  public override async run(oldMember: GuildMember, newMember: GuildMember) {
    try {
      const disableRoleId = this.configManager.getDisableFindPlayerRoleId?.();
      const findplayerChannelId = this.configManager.getFindplayerChannelId?.();

      if (!disableRoleId || !findplayerChannelId) return;

      const hadRole = oldMember.roles.cache.has(disableRoleId);
      const hasRole = newMember.roles.cache.has(disableRoleId);

      if (hadRole === hasRole) return; // Nessun cambiamento sul ruolo target

      const channel = await newMember.guild.channels.fetch(findplayerChannelId);
      if (!channel) return;

      const reason = 'Aggiornamento permessi findplayer per ruolo disableFindPlayer';

      // Se il ruolo è stato AGGIUNTO => nega la visualizzazione del canale all'utente
      if (!hadRole && hasRole) {
        try {
          if ((channel as GuildChannel).permissionOverwrites) {
            await (channel as GuildChannel).permissionOverwrites.edit(newMember.id, {
              ViewChannel: false
            }, { reason });
          }
        } catch (e) {
          console.error('Errore durante l\'aggiunta del deny ViewChannel per utente', newMember.id, 'nel canale', findplayerChannelId, e);
        }
        return;
      }

      // Se il ruolo è stato RIMOSSO => rimuovi l\'overwrite specifico dell'utente
      if (hadRole && !hasRole) {
        try {
          if ((channel as GuildChannel).permissionOverwrites) {
            await (channel as GuildChannel).permissionOverwrites.delete(newMember.id, reason);
          }
        } catch (e) {
          console.error('Errore durante la rimozione dell\'overwrite per utente', newMember.id, 'nel canale', findplayerChannelId, e);
        }
        return;
      }
    } catch (error) {
      console.error('Errore in DisableFindPlayerListener:', error);
    }
  }
}
