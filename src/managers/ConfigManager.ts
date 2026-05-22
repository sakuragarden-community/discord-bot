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

    public getHelperRoleId()
    {
        return (config as any)?.roles?.types?.helper;
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

    // Opzioni ruoli
    public getDisableFindPlayerRoleId()
    {
        return (config as any)?.roles?.options?.disableFindPlayer;
    }

    // Ruoli di interesse
    public getPartygamesRoleId()
    {
        return (config as any)?.roles?.interest?.partygames;
    }

    public getMainChannelId()
    {
        return config.channels.main;
    }

    public getNewChannelId()
    {
        return (config as any)?.channels?.new;
    }

    public getMenuChannelId()
    {
        return (config as any)?.channels?.menu;
    }

    public getPromoChannelId()
    {
        return config.channels.promo;
    }

    public getServerChannelId()
    {
        return config.channels.server;
    }

    public getNewsChannelId()
    {
        return (config as any)?.channels?.news;
    }

    public getCommandsChannelId()
    {
        return (config as any)?.channels?.commands;
    }

    public getPresentationsChannelId()
    {
        return (config as any)?.channels?.presentations;
    }

    public getEventsChannelId()
    {
        return (config as any)?.channels?.events;
    }

    public getSupportChannelId()
    {
        return (config as any)?.channels?.support;
    }

    public getGalleriesChannelId()
    {
        return (config as any)?.channels?.galleries;
    }

    public getTopChannelId()
    {
        return (config as any)?.channels?.top;
    }

    public getFreetalkChannelId()
    {
        return (config as any)?.channels?.freetalk;
    }

    public getFindplayerChannelId()
    {
        return (config as any)?.channels?.findplayer;
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

    public getNsfwVocalTriggerChannelId()
    {
        return (config as any)?.triggers?.nsfw;
    }

    public getFocusVocalTriggerChannelId()
    {
        return (config as any)?.triggers?.focus;
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

    public getVoiceMaxUsersFocus(): number
    {
        const raw = (config as any)?.voice?.maxUsersFocus;
        let max = Number.isInteger(raw) ? raw as number : parseInt(String(raw ?? 10), 10);
        if (!Number.isFinite(max) || isNaN(max)) max = 10;
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

    public getSecondaryColor(): ColorResolvable
    {
        const secondary = (config as any)?.colors?.secondary ?? "#000000";
        return secondary as ColorResolvable;
    }

    // Ritorna il colore di alert definito nella config
    public getAlertColor(): ColorResolvable
    {
        const alert = (config as any)?.colors?.alert ?? "#FFDA55";
        return alert as ColorResolvable;
    }

    public getErrorColor(): ColorResolvable
    {
        const error = (config as any)?.colors?.error ?? "#FF5555";
        return error as ColorResolvable;
    }

    // Ritorna il colore blu definito nella config
    public getBlueColor(): ColorResolvable
    {
        const blue = (config as any)?.colors?.blue ?? "#0000FF";
        return blue as ColorResolvable;
    }

    // Ritorna il colore violet definito nella config
    public getVioletColor(): ColorResolvable
    {
        const violet = (config as any)?.colors?.violet ?? "#EE82EE";
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