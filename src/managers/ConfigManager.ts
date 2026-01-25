import "reflect-metadata"
import config from "../../config.json"
import { Guild, ColorResolvable } from "discord.js";
import { container } from '@sapphire/framework';

export class ConfigManager {

    protected guild: Guild|null = null;

    public async getGuild() {
        if (!this.guild) {
            this.guild = await container.client.guilds.fetch(config.guild)
        }
        return this.guild;
    }

    public getInitRolesId()
    {
        return config.roles.init;
    }

    public getAdminRoleId()
    {
        return config.roles.types.admin;
    }

    public getMasterRoleId()
    {
        return config.roles.types.master;
    }

    public getModeratorRoleId()
    {
        return config.roles.types.moderator;
    }

    public getCollaboratorRoleId()
    {
        return config.roles.types.collaborator;
    }

    public getSupporterRoleId()
    {
        return config.roles.types.supporter;
    }

    public getBotRoleId()
    {
        return config.roles.types.bot;
    }

    public getMemberRoleId()
    {
        return config.roles.types.member;
    }

    public getMainChannelId()
    {
        return config.channels.main;
    }

    public getPromoChannelId()
    {
        return config.channels.promo;
    }

    public getServerChannelId()
    {
        return config.channels.server;
    }

    public getCommandsChannelId()
    {
        return (config as any)?.channels?.commands;
    }

    public getPresentationsChannelId()
    {
        return (config as any)?.channels?.presentations;
    }

    public getDisboardBotId()
    {
        return (config as any)?.bots?.disboard;
    }

    public getVoicesCategoryId()
    {
        return (config as any)?.categories?.voices;
    }

    public getVocalTriggerChannelId()
    {
        return (config as any)?.triggers?.vocal;
    }

    public getVoiceMaxUsers(): number
    {
        const raw = (config as any)?.voice?.maxUsers;
        let max = Number.isInteger(raw) ? raw as number : parseInt(String(raw ?? 10), 10);
        if (!Number.isFinite(max) || isNaN(max)) max = 10;
        // Discord user limit: 0 means unlimited; typical range 1..99. Clamp to 0..99 just in case.
        if (max < 0) max = 0;
        if (max > 99) max = 99;
        return max;
    }

    // Ritorna il colore primario definito nella config
    public getPrimaryColor(): ColorResolvable
    {
        const primary = (config as any)?.colors?.primary ?? "#000000";
        return primary as ColorResolvable;
    }

    // Ritorna il colore di alert definito nella config
    public getAlertColor(): ColorResolvable
    {
        const alert = (config as any)?.colors?.alert ?? "#FFDA55";
        return alert as ColorResolvable;
    }
}