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

    public async getDisableFindGroupRoleId()
    {
        return this.getSetting("roles/options/disable_find_group");
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

    public async getFindGroupChannelId()
    {
        return this.getSetting("channels/community/find_group");
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

    public async getBlueColor(): Promise<ColorResolvable>
    {
        const blue = (await this.getSetting("general/colors/blue")) ?? "#0000FF";
        return blue as ColorResolvable;
    }

    public async getVioletColor(): Promise<ColorResolvable>
    {
        const violet = (await this.getSetting("general/colors/violet")) ?? "#EE82EE";
        return violet as ColorResolvable;
    }
}
