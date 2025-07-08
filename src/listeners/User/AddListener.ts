import "reflect-metadata"
import { autoInjectable } from "tsyringe";
import { Listener } from '@sapphire/framework';
import {DMChannel, GuildMember, Message, User} from "discord.js";
import * as fs from "fs";
import {ConfigManager} from "../../managers/ConfigManager";

@autoInjectable()
export class AddListener extends Listener {

    public constructor(
        context: Listener.LoaderContext,
        options: Listener.Options,
        protected configManager: ConfigManager,
    ) {
        super(context, {
            ...options,
            event: 'guildMemberAdd'
        });
    }

    public override async run(member: GuildMember) {
        let guild = await this.configManager.getGuild();

        // Invia messaggio di benvenuto in privato
        try {
            let welcomeMessage = fs.readFileSync("messages/welcome_private.md", "utf-8");
            await member.send(welcomeMessage);
        } catch (error) {
            console.error(error);
        }

        // Invia messaggio di benvenuto in pubblico
        try {
            let welcomeMessage = fs.readFileSync("messages/welcome_public.md", "utf-8");
            welcomeMessage = welcomeMessage.replace('{{new_member}}', member.toString());
            let channel = await guild.channels.fetch(this.configManager.getMainChannelId());
            if (channel && channel.isTextBased()) {
                await channel.send(welcomeMessage);
            }
        } catch (error) {
            console.error(error);
        }

        // Assegna ruoli di base
        this.configManager.getInitRolesId().forEach(id => {
            member.roles.add(id);
        })
    }

}