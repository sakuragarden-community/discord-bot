import "reflect-metadata";
import { autoInjectable } from "tsyringe";
import {container, Listener} from '@sapphire/framework';
import { Message } from "discord.js";
import { PromoManager } from "../../managers/PromoManager";
import {ConfigManager} from "../../managers/ConfigManager";

@autoInjectable()
export class CreateEventTestListener extends Listener {

    public constructor(
        context: Listener.LoaderContext,
        options: Listener.Options,
        protected configManager: ConfigManager,
        protected promoManager?: PromoManager,
    ) {
        super(context, {
            ...options,
            event: 'messageCreate'
        });
    }

    public override async run(message: Message) {
        const content = message.content ?? "";
        if (!content.toLowerCase().includes("testevent")) {
            return; // Non fa nulla se il contenuto non contiene "testevent"
        }

        // Azione minima di conferma: utilizza il PromoManager iniettato (se presente)
        try {
            const promo = this.promoManager?.getExamplePromo();
            const title = promo?.discord_promo ?? "Test Event";
            await message.reply(`✅ CreateEventTestListener attivato. Promo corrente: ${title}`);


            let client = container.client;
            this.promoManager?.publishEvent(client)
        } catch (e) {
            // In caso di problemi, manteniamo un fallback semplice
            await message.reply("Errore: " + e);
        }
    }
}
