import "reflect-metadata"
import { autoInjectable } from "tsyringe";
import { Listener } from '@sapphire/framework';
import {DMChannel, GuildMember, Message, User, EmbedBuilder} from "discord.js";
import * as fs from "fs";
import {ConfigManager} from "../../managers/ConfigManager";
import {MemberManager} from "../../managers/MemberManager";

@autoInjectable()
export class AddListener extends Listener {

    public constructor(
        context: Listener.LoaderContext,
        options: Listener.Options,
        protected configManager: ConfigManager,
        protected memberManager: MemberManager,
    ) {
        super(context, {
            ...options,
            event: 'guildMemberAdd'
        });
    }

    public override async run(member: GuildMember) {
        await this.sendWelcomeMessages(member);

        try {
            await this.createMember(member);
        } catch (error) {
            console.error("Errore durante la registrazione del membro sulle API Kodama:", error);
        }
    }

    /** Invia i messaggi di benvenuto in privato e nel canale pubblico. */
    protected async sendWelcomeMessages(member: GuildMember) {
        let guild = await this.configManager.getGuild();

        // Invia messaggio di benvenuto in privato
        try {
            let welcomeMessage = fs.readFileSync("messages/welcome_private.md", "utf-8");
            welcomeMessage = welcomeMessage.replace('{{new_member}}', member.toString());
            welcomeMessage = welcomeMessage.replace('{{menu}}', `<#${this.configManager.getMenuChannelId()}>`);
            welcomeMessage = welcomeMessage.replace('{{presentations}}', `<#${this.configManager.getPresentationsChannelId()}>`);
            welcomeMessage = welcomeMessage.replace('{{support}}', `<#${this.configManager.getSupportChannelId()}>`);
            welcomeMessage = welcomeMessage.replace('{{events}}', `<#${this.configManager.getEventsChannelId()}>`);
            const embed = new EmbedBuilder()
                .setTitle('Grazie per essere entrato in Sakura Garden!')
                .setColor(this.configManager.getPrimaryColor())
                .setDescription(welcomeMessage)
                .setImage('https://sakuragarden.it/images/wprivato.png');
            await member.send({ embeds: [embed] });
        } catch (error) {
            console.error(error);
        }

        // Invia messaggio di benvenuto in pubblico
        try {
            let welcomeMessage = fs.readFileSync("messages/welcome_public.md", "utf-8");
            welcomeMessage = welcomeMessage.replace('{{link}}', `<#${this.configManager.getMenuChannelId()}>`);
            welcomeMessage = welcomeMessage.replace('{{new_member}}', member.toString());
            welcomeMessage = welcomeMessage.replace('{{presentations}}', `<#${this.configManager.getPresentationsChannelId()}>`);
            let channel = await guild.channels.fetch(this.configManager.getNewChannelId());
            if (channel && channel.isTextBased()) {
                const embed = new EmbedBuilder()
                    .setTitle('Un nuovo fiore è sbocciato in giardino!')
                    .setColor(this.configManager.getPrimaryColor())
                    .setDescription(welcomeMessage)
                    .setImage('https://sakuragarden.it/images/wpubblico.png');
                await channel.send({ content: '## ' + member.toString() + ' è entrato nella community!', embeds: [embed] });
            }
        } catch (error) {
            console.error(error);
        }
    }

    /** Registra il nuovo membro sulle API Kodama. */
    protected async createMember(member: GuildMember) {
        return this.memberManager.create({
            discordId: member.id,
            username: member.user.username,
            joinedAt: member.joinedAt?.toISOString() ?? null,
            status: "ACTIVE",
        });
    }

}
