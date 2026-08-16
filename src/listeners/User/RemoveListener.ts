import "reflect-metadata";
import { autoInjectable } from "tsyringe";
import { Listener } from '@sapphire/framework';
import { GuildMember, ChannelType, ForumChannel, EmbedBuilder } from 'discord.js';
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
    // 1) Prova a recuperare l'eventuale presentazione dell'utente (solo canale Forum)
    let presentationUrl: string | null = null;
    try {
      const presentationsChannelId = (this.configManager as ConfigManager).getPresentationsChannelId?.();
      if (presentationsChannelId) {
        const presChannel = await member.guild.channels.fetch(presentationsChannelId);

        if (!presChannel) {
          console.warn('Canale presentazioni non trovato.');
        } else if (presChannel.type === ChannelType.GuildForum) {
          // Gestione Forum: i post sono thread
          const forum = presChannel as ForumChannel;
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
                  // Memorizza l'URL del thread (se non già trovato)
                  if (!presentationUrl) {
                    try {
                      presentationUrl = (thread as any)?.url ?? `https://discord.com/channels/${member.guild.id}/${thread.id}`;
                    } catch {}
                  }
                  // Non cancellare la presentazione: si conserva solo l'URL
                  break;
                }
              } catch (e) {
                console.warn(`Errore durante l'analisi del thread ${thread.id} per l'utente ${member.id}:`, e);
              }
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
      await this.sendLeaveEmbed(member, presentationUrl ?? undefined);
    } catch (error) {
      console.error('Errore durante l\'invio dell\'avviso di uscita utente:', error);
    }
  }

  // Invia un embed di avviso quando un utente lascia il server
  private async sendLeaveEmbed(member: GuildMember, presentationUrl?: string) {
    const channelId = this.configManager.getServerChannelId();
    const channel = await member.guild.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) return;

    const username = member.user?.tag ?? member.displayName ?? 'Utente sconosciuto';
    const title = `👋 L'utente ${username} ha lasciato il server.`; // stesso testo della riga 86

    const joinedAt = member.joinedAt ? new Date(member.joinedAt) : null;
    const leftAt = new Date();

    const formatDateTime = (d: Date | null) => d ? d.toLocaleString('it-IT') : 'N/D';

    const bulletLines: string[] = [
      `• Data di ingresso: ${formatDateTime(joinedAt)}`,
      `• Data di uscita: ${formatDateTime(leftAt)}`,
    ];

    if (presentationUrl) {
      bulletLines.push(`• Presentazione: ${presentationUrl}`);
    }

    const avatarUrl = member.user?.displayAvatarURL?.({ forceStatic: false, size: 512 }) ?? undefined;

    const embed = new EmbedBuilder()
      .setColor(this.configManager.getAlertColor())
      .setTitle(title)
      .setDescription(bulletLines.join('\n'));

    if (avatarUrl) embed.setThumbnail(avatarUrl);

    await channel.send({ embeds: [embed] });
  }
}
