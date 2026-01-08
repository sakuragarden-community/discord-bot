import "reflect-metadata";
import { autoInjectable } from "tsyringe";
import { Listener } from '@sapphire/framework';
import { GuildMember, ChannelType, ForumChannel } from 'discord.js';
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
    // 1) Prova a cancellare l'eventuale presentazione dell'utente (solo canale Forum)
    try {
      const presentationsChannelId = (this.configManager as ConfigManager).getPresentationsChannelId?.();
      if (presentationsChannelId) {
        const presChannel = await member.guild.channels.fetch(presentationsChannelId);

        if (!presChannel) {
          console.warn('Canale presentazioni non trovato.');
        } else if (presChannel.type === ChannelType.GuildForum) {
          // Gestione Forum: i post sono thread
          const forum = presChannel as ForumChannel;
          let deleted = 0;
          try {
            // Thread attivi
            const active = await forum.threads.fetchActive();
            const toCheckActive = Array.from(active.threads.values());

            // Thread archiviati pubblici (i forum usano thread pubblici)
            const archived = await forum.threads.fetchArchived({ type: 'public', limit: 100 });
            const toCheckArchived = Array.from(archived.threads.values());

            const toCheck = [...toCheckActive, ...toCheckArchived];

            for (const thread of toCheck) {
              try {
                // Verifica proprietario o autore del primo messaggio
                const isOwner = (thread as any).ownerId === member.id;
                let isStarterAuthor = false;
                try {
                  const starter = await (thread as any).fetchStarterMessage?.();
                  if (starter) {
                    isStarterAuthor = starter.author?.id === member.id;
                  }
                } catch {}

                if (isOwner || isStarterAuthor) {
                  await thread.delete();
                  deleted++;
                  // piccolo delay per rate limit
                  await new Promise(res => setTimeout(res, 200));
                }
              } catch (e) {
                console.warn(`Impossibile cancellare il thread ${thread.id} per l'utente ${member.id}:`, e);
              }
            }

            if (deleted > 0) {
              console.log(`Cancellati ${deleted} thread di presentazione per l'utente ${member.id}.`);
            }
          } catch (e) {
            console.error('Errore durante la gestione dei thread del forum di presentazioni:', e);
          }
        }
      }
    } catch (error) {
      console.error('Errore durante la gestione delle presentazioni in uscita:', error);
    }

    // 2) Invia un messaggio nel canale server che l'utente è uscito
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
