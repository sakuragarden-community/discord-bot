import "reflect-metadata"
import { autoInjectable } from "tsyringe";
import { Guild, ColorResolvable } from "discord.js";
import { container } from '@sapphire/framework';
import { ApiManager, KodamaApiError } from "./ApiManager";

/** Proiezione di una configurazione esposta dalle API. */
export interface Setting {
    path: string;
    type: string;
    value: string | null;
}

/** Nodo della cache delle configurazioni, con la stessa alberatura dei path. */
export interface SettingsTree {
    [key: string]: SettingsTree | string | null;
}

/** Cache delle configurazioni, più la guild risolta da `general/discord/guild_id`. */
export type SettingsCache = SettingsTree & {
    guild?: Guild;
};

/**
 * Manager delle configurazioni applicative.
 *
 * I valori sono letti dalle API Kodama (`GET /settings?path={path}`); i path seguono
 * il formato `<section>/<group>/<field>` definito in `settings_migration.sql`.
 * Ogni valore viene letto una sola volta e poi servito dalla cache.
 */
@autoInjectable()
export class SettingsManager {

    protected static readonly BASE_PATH = "/api/v1/settings";

    protected settings: SettingsCache = {};

    public constructor(
        protected apiManager?: ApiManager,
    ) {}

    /**
     * Ritorna il valore della configurazione, o `null` se il path non esiste.
     * Alla prima lettura il valore viene salvato in {@link settings}, nel nodo
     * corrispondente al path (es. `roles/types/admin` → `settings.roles.types.admin`).
     */
    public async getSetting(path: string): Promise<string | null> {
        const keys = path.split("/");
        const field = keys.pop()!;

        let node: SettingsTree = this.settings;
        for (const key of keys) {
            node = (node[key] ??= {}) as SettingsTree;
        }

        if (!(field in node)) {
            node[field] = await this.fetchSetting(path);
        }
        return node[field] as string | null;
    }

    /** `GET /settings?path={path}` — legge il valore dalle API, `null` se il path non esiste. */
    protected async fetchSetting(path: string): Promise<string | null> {
        try {
            const setting = await this.apiManager!.request<Setting>({
                method: "GET",
                url: SettingsManager.BASE_PATH,
                params: { path },
            });
            return setting.value;
        } catch (error) {
            if (error instanceof KodamaApiError && error.status === 404) {
                return null;
            }
            throw error;
        }
    }

    public async getGuild() {
        if (!this.settings.guild) {
            const guildId = await this.getSetting("general/discord/guild_id");
            if (!guildId) {
                throw new Error("Configurazione 'general/discord/guild_id' non definita");
            }
            this.settings.guild = await container.client.guilds.fetch(guildId)
        }
        return this.settings.guild;
    }

    // Gli array sono salvati come stringhe con i valori separati da virgola
    public async getInitRolesId(): Promise<string[]>
    {
        const raw = await this.getSetting("roles/init/role_ids");
        return (raw ?? "").split(",").map(id => id.trim()).filter(Boolean);
    }

    public async getAdminRoleId()
    {
        return this.getSetting("roles/types/admin");
    }

    public async getMasterRoleId()
    {
        return this.getSetting("roles/types/master");
    }

    public async getModeratorRoleId()
    {
        return this.getSetting("roles/types/moderator");
    }

    public async getHelperRoleId()
    {
        return this.getSetting("roles/types/helper");
    }

    public async getCollaboratorRoleId()
    {
        return this.getSetting("roles/types/collaborator");
    }

    public async getSupporterRoleId()
    {
        return this.getSetting("roles/types/supporter");
    }

    public async getBotRoleId()
    {
        return this.getSetting("roles/types/bot");
    }

    public async getMemberRoleId()
    {
        return this.getSetting("roles/types/member");
    }

    // Opzioni ruoli
    public async getDisableFindPlayerRoleId()
    {
        return this.getSetting("roles/options/disable_find_player");
    }

    // Ruoli di interesse
    public async getPartygamesRoleId()
    {
        return this.getSetting("roles/interests/party_games");
    }

    public async getMainChannelId()
    {
        return this.getSetting("channels/community/main");
    }

    public async getNewChannelId()
    {
        return this.getSetting("channels/community/new");
    }

    public async getMenuChannelId()
    {
        return this.getSetting("channels/info/menu");
    }

    public async getPromoChannelId()
    {
        return this.getSetting("channels/community/promo");
    }

    public async getServerChannelId()
    {
        return this.getSetting("channels/info/server");
    }

    public async getNewsChannelId()
    {
        return this.getSetting("channels/info/news");
    }

    public async getCommandsChannelId()
    {
        return this.getSetting("channels/utility/commands");
    }

    public async getPresentationsChannelId()
    {
        return this.getSetting("channels/community/presentations");
    }

    public async getEventsChannelId()
    {
        return this.getSetting("channels/info/events");
    }

    public async getSupportChannelId()
    {
        return this.getSetting("channels/utility/support");
    }

    public async getGalleriesChannelId()
    {
        return this.getSetting("channels/community/galleries");
    }

    public async getTopChannelId()
    {
        return this.getSetting("channels/info/top");
    }

    public async getFreetalkChannelId()
    {
        return this.getSetting("channels/community/free_talk");
    }

    public async getFindplayerChannelId()
    {
        return this.getSetting("channels/gaming/find_player");
    }

    public async getDisboardBotId()
    {
        return this.getSetting("general/bots/disboard");
    }

    public async getVoicesCategoryId()
    {
        return this.getSetting("voice/general/category_id");
    }

    public async getVocalTriggerChannelId()
    {
        return this.getSetting("voice/triggers/default");
    }

    public async getNsfwVocalTriggerChannelId()
    {
        return this.getSetting("voice/triggers/nsfw");
    }

    public async getFocusVocalTriggerChannelId()
    {
        return this.getSetting("voice/triggers/focus");
    }

    public async getVoiceMaxUsers(): Promise<number>
    {
        const raw = await this.getSetting("voice/limits/max_users");
        let max = parseInt(String(raw ?? 10), 10);
        if (!Number.isFinite(max) || isNaN(max)) max = 10;
        // Discord user limit: 0 means unlimited; typical range 1..99. Clamp to 0..99 just in case.
        if (max < 0) max = 0;
        if (max > 99) max = 99;
        return max;
    }

    public async getVoiceMaxUsersFocus(): Promise<number>
    {
        const raw = await this.getSetting("voice/limits/max_users_focus");
        let max = parseInt(String(raw ?? 10), 10);
        if (!Number.isFinite(max) || isNaN(max)) max = 10;
        if (max < 0) max = 0;
        if (max > 99) max = 99;
        return max;
    }

    // Ritorna il colore primario definito nelle configurazioni
    public async getPrimaryColor(): Promise<ColorResolvable>
    {
        const primary = (await this.getSetting("general/colors/primary")) ?? "#000000";
        return primary as ColorResolvable;
    }

    public async getSecondaryColor(): Promise<ColorResolvable>
    {
        const secondary = (await this.getSetting("general/colors/secondary")) ?? "#000000";
        return secondary as ColorResolvable;
    }

    // Ritorna il colore di alert definito nelle configurazioni
    public async getAlertColor(): Promise<ColorResolvable>
    {
        const alert = (await this.getSetting("general/colors/alert")) ?? "#FFDA55";
        return alert as ColorResolvable;
    }

    public async getErrorColor(): Promise<ColorResolvable>
    {
        const error = (await this.getSetting("general/colors/error")) ?? "#FF5555";
        return error as ColorResolvable;
    }

    // Ritorna il colore blu definito nelle configurazioni
    public async getBlueColor(): Promise<ColorResolvable>
    {
        const blue = (await this.getSetting("general/colors/blue")) ?? "#0000FF";
        return blue as ColorResolvable;
    }

    // Ritorna il colore violet definito nelle configurazioni
    public async getVioletColor(): Promise<ColorResolvable>
    {
        const violet = (await this.getSetting("general/colors/violet")) ?? "#EE82EE";
        return violet as ColorResolvable;
    }

    // Categoria testuale dove è vietato menzionare ruoli (eccetto canale findplayer)
    // ID fornito nella specifica: 1304844728730386462
    public getSearchPlayersCategoryId(): string
    {
        return "1304844728730386462";
    }

    // Utente esente dalla cancellazione dei messaggi in #findplayer
    public getFindplayerExemptUserId(): string
    {
        // ID fornito nella specifica
        return "1349839010490617918";
    }
}
