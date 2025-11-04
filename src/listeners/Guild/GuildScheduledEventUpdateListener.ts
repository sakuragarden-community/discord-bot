import "reflect-metadata";
import { autoInjectable } from "tsyringe";
import { Listener } from "@sapphire/framework";
import { GuildScheduledEvent, GuildScheduledEventStatus } from "discord.js";
import { PromoManager } from "../../managers/PromoManager";

@autoInjectable()
export class GuildScheduledEventUpdateListener extends Listener {
  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options,
    private promoManager?: PromoManager
  ) {
    super(context, {
      ...options,
      event: "guildScheduledEventUpdate",
    });
  }

  public override async run(oldEvent: GuildScheduledEvent | null, newEvent: GuildScheduledEvent) {
    try {
      if (newEvent.status === GuildScheduledEventStatus.Canceled) {
        // First, attempt to delete the related thread (if any), then remove the record.
        if (newEvent.guild) {
          await this.promoManager?.deleteEventThread(newEvent.guild, newEvent.id);
        }
        await this.promoManager?.removeEventRecord(newEvent.id);
      }
    } catch (err) {
      console.error("Errore nella cancellazione del thread o rimozione del record evento (update):", err);
    }
  }
}
