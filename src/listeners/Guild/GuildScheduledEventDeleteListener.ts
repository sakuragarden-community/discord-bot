import "reflect-metadata";
import { autoInjectable } from "tsyringe";
import { Listener } from "@sapphire/framework";
import { GuildScheduledEvent } from "discord.js";
import { PromoManager } from "../../managers/PromoManager";

@autoInjectable()
export class GuildScheduledEventDeleteListener extends Listener {
  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options,
    private promoManager?: PromoManager
  ) {
    super(context, {
      ...options,
      event: "guildScheduledEventDelete",
    });
  }

  public override async run(event: GuildScheduledEvent) {
    try {
      if (event.guild) {
        await this.promoManager?.deleteEventThread(event.guild, event.id);
      }
      await this.promoManager?.removeEventRecord(event.id);
    } catch (err) {
      console.error("Errore nella cancellazione del thread o rimozione del record evento (delete):", err);
    }
  }
}
