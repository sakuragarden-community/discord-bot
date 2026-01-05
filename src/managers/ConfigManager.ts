import "reflect-metadata"
import config from "../../config.json"
import { Guild } from "discord.js";
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

    public getGuestRoleId()
    {
        return config.roles.types.guest;
    }

    public getMainChannelId()
    {
        return config.channels.main;
    }
}