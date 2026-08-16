import "reflect-metadata";
import { autoInjectable } from "tsyringe";
import { Listener } from '@sapphire/framework';
import cron from 'node-cron';
import { ChannelType, GuildTextBasedChannel, Message } from 'discord.js';
import { ConfigManager } from "../../managers/ConfigManager";

@autoInjectable()
export class FindplayerCleanupCron extends Listener {
  private scheduled: boolean = false;

  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options,
    protected configManager?: ConfigManager,
  ) {
    super(context, {
      ...options,
      event: 'ready'
    });
  }

  public override async run() {
    if (this.scheduled) return;
    this.scheduled = true;

    // Esegue ogni ora al minuto 0
    cron.schedule('0 * * * *', async () => {
      try {
        await this.cleanupFindplayer();
      } catch (e) {
        console.error('[FindplayerCleanupCron] Errore durante il cleanup orario:', e);
      }
    }, { timezone: 'Europe/Rome' });

    // Esegue anche una volta all'avvio, con un piccolo delay per sicurezza
    setTimeout(() => {
      this.cleanupFindplayer().catch(err => console.error('[FindplayerCleanupCron] Errore cleanup iniziale:', err));
    }, 15_000);
  }

  private async cleanupFindplayer() {
    const cfg = this.configManager as ConfigManager;
    const channelId = cfg.getFindplayerChannelId?.();
    if (!channelId) return;

    const guild = await cfg.getGuild();
    if (!guild) return;

    const ch = await guild.channels.fetch(channelId).catch(() => null);
    if (!ch || !ch.isTextBased()) return;

    // Non processare thread/DM
    if ('type' in ch && (ch.type === ChannelType.PublicThread || ch.type === ChannelType.PrivateThread || ch.type === ChannelType.AnnouncementThread)) return;

    const channel = ch as GuildTextBasedChannel;

    const cutoffMs = Date.now() - 8 * 60 * 60 * 1000; // 8 ore
    const exemptUserId = cfg.getFindplayerExemptUserId?.() || '1349839010490617918';

    let lastId: string | undefined = undefined;
    let fetchedCount = 0;
    let deletedCount = 0;

    while (true) {
      let batch: Map<string, Message>;
      try {
        batch = await channel.messages.fetch({ limit: 100, before: lastId });
      } catch (e) {
        console.warn('[FindplayerCleanupCron] Impossibile fetchare i messaggi dal canale findplayer:', e);
        break;
      }

      if (!batch || batch.size === 0) break;
      fetchedCount += batch.size;

      // Ordina dal più vecchio al più recente per cancellazioni più stabili
      const messages = Array.from(batch.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      for (const msg of messages) {
        // Solo messaggi più vecchi del cutoff e non dell'utente esente
        if (msg.createdTimestamp <= cutoffMs && msg.author?.id !== exemptUserId) {
          try {
            await msg.delete();
            deletedCount++;
          } catch (e) {
            // Se non ho permessi o il messaggio è già cancellato, prosegui
            console.warn(`[FindplayerCleanupCron] Impossibile cancellare il messaggio ${msg.id}:`, e);
          }
        }
      }

      // Imposta il cursore per la prossima pagina
      const oldest = messages[0];
      lastId = oldest?.id;

      // Se l'ultimo batch contiene messaggi tutti più recenti del cutoff e non abbiamo cancellato nulla, 
      // potremmo comunque avere messaggi più vecchi dopo: continuiamo a paginare fino ad esaurimento.
      // Condizione di stop naturale: nessun nuovo messaggio fetchato.
    }

    if (deletedCount > 0) {
      console.log(`[FindplayerCleanupCron] Pulizia completata: esaminati ${fetchedCount} messaggi, cancellati ${deletedCount}.`);
    }
  }
}
