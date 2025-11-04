import "reflect-metadata";
import { autoInjectable } from "tsyringe";
import { Listener } from "@sapphire/framework";
import { GuildScheduledEvent, User } from "discord.js";
import { PromoManager } from "../../managers/PromoManager";

@autoInjectable()
export class GuildScheduledEventUserAddListener extends Listener {
  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options,
    private promoManager?: PromoManager
  ) {
    super(context, {
      ...options,
      event: "guildScheduledEventUserAdd",
    });
  }

  public override async run(event: GuildScheduledEvent, user: User) {
    try {
      if (!event.guild) return;
      // Tenta di menzionare l'utente nel thread associato all'evento, se presente nello storage
      await this.promoManager?.mentionUserInEventThread(event.guild, event.id, user.id);
    } catch (err) {
      console.error("Errore nella gestione di guildScheduledEventUserAdd:", err);
    }
  }
}
