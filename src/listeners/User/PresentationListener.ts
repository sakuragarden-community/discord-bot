import "reflect-metadata";
import { autoInjectable } from "tsyringe";
import { Listener } from '@sapphire/framework';
import { AnyThreadChannel } from 'discord.js';
import { SettingsManager } from "../../managers/SettingsManager";
import { MemberManager } from "../../managers/MemberManager";

@autoInjectable()
export class PresentationListener extends Listener {

    public constructor(
        context: Listener.LoaderContext,
        options: Listener.Options,
        protected settingsManager?: SettingsManager,
        protected memberManager?: MemberManager,
    ) {
        super(context, {
            ...options,
            event: 'threadCreate'
        });
    }

    public override async run(thread: AnyThreadChannel, newlyCreated: boolean) {
        try {
            await this.savePresentation(thread, newlyCreated);
        } catch (error) {
            console.error("Errore durante il salvataggio della presentazione sulle API Kodama:", error);
        }
    }

    /** Aggiorna il membro sulle API Kodama con il link del topic di presentazione appena creato. */
    protected async savePresentation(thread: AnyThreadChannel, newlyCreated: boolean) {
        // Ignora i thread già esistenti a cui il bot viene aggiunto
        if (!newlyCreated || !thread.ownerId) return;

        const presentationsChannelId = await this.settingsManager?.getPresentationsChannelId();
        if (!presentationsChannelId) return;

        // Solo nel canale presentazioni
        if (thread.parentId !== presentationsChannelId) return;

        const member = await this.memberManager!.findByDiscordId(thread.ownerId);
        if (!member) {
            console.warn(`Membro ${thread.ownerId} non registrato sulle API Kodama: presentazione ${thread.url} non salvata.`);
            return;
        }

        await this.memberManager!.patch(member.id, { presentation: thread.url });
    }
}
