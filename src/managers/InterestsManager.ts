import { container } from '@sapphire/framework';
import { ChannelType, GuildMember, Role, ThreadChannel } from 'discord.js';
import { ConfigManager, InterestMapItem } from './ConfigManager';

/**
 * Manager per sincronizzare i membri dei ruoli con i rispettivi thread di interesse.
 */
export class InterestsManager {
  constructor(private readonly configManager: ConfigManager = new ConfigManager()) {}

  /**
   * Legge la configurazione "interestsMap" e per ciascun elemento:
   * - recupera il ruolo Discord dall'ID specificato in "role"
   * - cicla tutti i membri del ruolo
   * - se un membro non fa parte del thread indicato da "thread", lo segna da aggiungere
   * - al termine, invia un messaggio nel thread taggando tutti i membri segnati
   */
  public async map(): Promise<void> {
    const guild = await this.configManager.getGuild();
    const interests = this.configManager.getInterestsMap();

    for (const item of interests) {
      try {
        const role = await guild.roles.fetch(item.role);
        if (!role) {
          this.log(`Ruolo non trovato per '${item.name}' (roleId=${item.role}). Salto.`);
          continue;
        }

        const thread = await this.fetchThread(item.thread);
        if (!thread) {
          this.log(`Thread non trovato o non valido per '${item.name}' (threadId=${item.thread}). Salto.`);
          continue;
        }

        const toMention = await this.collectMembersNotInThread(role, thread);

        if (toMention.length > 0) {
          const mentionText = toMention.map((m) => `<@${m.id}>`).join(' ');
          const header = `Benvenuti nel thread dedicato a ${item.name}!\nSiete stati aggiungi in questo canale poiché avete espresso interesse durante l'ingresso.\nBuona chiacchierata!\n`;
          await thread.send({ content: `${header}\n${mentionText}` });
        }
      } catch (err) {
        this.log(`Errore durante l'elaborazione di '${item.name}': ${(err as Error).message}`);
      }
    }
  }

  private async fetchThread(threadId: string): Promise<ThreadChannel | null> {
    try {
      const channel = await container.client.channels.fetch(threadId);
      if (channel && channel.type === ChannelType.PublicThread || channel?.type === ChannelType.PrivateThread || channel?.type === ChannelType.AnnouncementThread) {
        return channel as ThreadChannel;
      }
    } catch {
      // ignore
    }
    return null;
  }

  private async collectMembersNotInThread(role: Role, thread: ThreadChannel): Promise<GuildMember[]> {
    const missing: GuildMember[] = [];

    // Precarica i membri del thread per ridurre le fetch singole.
    try {
      await thread.members.fetch();
    } catch {
      // Se fallisce, procederemo con fetch individuali.
    }

    // Itera i membri del ruolo
    for (const [memberId, member] of role.members) {
      const isInThread = thread.members.resolve(memberId) !== null
        || await this.isMemberInThread(thread, memberId);

      if (!isInThread) {
        missing.push(member);
      }
    }

    return missing;
  }

  private async isMemberInThread(thread: ThreadChannel, userId: string): Promise<boolean> {
    try {
      const tm = await thread.members.fetch(userId);
      return !!tm;
    } catch {
      return false;
    }
  }

  private log(message: string) {
    // Semplice logger silenzioso per ora
    // eslint-disable-next-line no-console
    console.log(`[InterestsMapManager] ${message}`);
  }
}
