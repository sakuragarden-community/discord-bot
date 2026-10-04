import "reflect-metadata"
import { autoInjectable } from "tsyringe";
import { Listener } from '@sapphire/framework';
import {GuildMember, EmbedBuilder} from "discord.js";
import * as fs from "fs";
import {SettingsManager} from "../../managers/SettingsManager";
import {Member, MemberManager} from "../../managers/MemberManager";
import {buildMemberNotificationEmbed} from "../../utils/MemberNotificationEmbed";

@autoInjectable()
export class AddListener extends Listener {

    public constructor(
        context: Listener.LoaderContext,
        options: Listener.Options,
        protected settingsManager: SettingsManager,
        protected memberManager: MemberManager,
    ) {
        super(context, {
            ...options,
            event: 'guildMemberAdd'
        });
    }

    public override async run(member: GuildMember) {
        await this.sendWelcomeMessage(member);

        let record: Member | null = null;
        let returning = false;
        try {
            ({ record, returning } = await this.saveMember(member));
        } catch (error) {
            console.error("Errore durante la registrazione del membro sulle API Kodama:", error);
        }

        try {
            await this.notifyStaff(member, record, returning);
        } catch (error) {
            console.error("Errore durante l'invio della notifica di ingresso allo Staff:", error);
        }
    }

    /** Invia il messaggio di benvenuto in privato. */
    protected async sendWelcomeMessage(member: GuildMember) {
        const [menuChannelId, presentationsChannelId, supportChannelId, eventsChannelId, primaryColor] = await Promise.all([
            this.settingsManager.getMenuChannelId(),
            this.settingsManager.getPresentationsChannelId(),
            this.settingsManager.getSupportChannelId(),
            this.settingsManager.getEventsChannelId(),
            this.settingsManager.getPrimaryColor(),
        ]);

        try {
            let welcomeMessage = fs.readFileSync("messages/welcome_private.md", "utf-8");
            welcomeMessage = welcomeMessage.replace('{{new_member}}', member.toString());
            welcomeMessage = welcomeMessage.replace('{{menu}}', `<#${menuChannelId}>`);
            welcomeMessage = welcomeMessage.replace('{{presentations}}', `<#${presentationsChannelId}>`);
            welcomeMessage = welcomeMessage.replace('{{support}}', `<#${supportChannelId}>`);
            welcomeMessage = welcomeMessage.replace('{{events}}', `<#${eventsChannelId}>`);
            const embed = new EmbedBuilder()
                .setTitle('Grazie per essere entrato in Sakura Garden!')
                .setColor(primaryColor)
                .setDescription(welcomeMessage)
                .setImage('https://sakuragarden.it/images/wprivato.png');
            await member.send({ embeds: [embed] });
        } catch (error) {
            console.error(error);
        }
    }

    /**
     * Registra il membro sulle API Kodama; se il record esiste già (utente
     * rientrato) lo riattiva aggiornando la data di ingresso.
     */
    protected async saveMember(member: GuildMember): Promise<{ record: Member, returning: boolean }> {
        const joinedAt = (member.joinedAt ?? new Date()).toISOString();
        const existing = await this.memberManager.findByDiscordId(member.id);

        if (existing) {
            const record = await this.memberManager.patch(existing.id, {
                username: member.user.username,
                joinedAt,
                status: "ACTIVE",
            });
            return { record, returning: true };
        }

        const record = await this.memberManager.create({
            discordId: member.id,
            username: member.user.username,
            joinedAt,
            status: "ACTIVE",
        });
        return { record, returning: false };
    }

    /** Notifica allo Staff, nel canale server, l'ingresso del membro. */
    protected async notifyStaff(member: GuildMember, record: Member | null, returning: boolean) {
        const channelId = await this.settingsManager.getNewChannelId();
        if (!channelId) return;
        const channel = await member.guild.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) return;

        const username = record?.username ?? member.user.username;
        const embed = buildMemberNotificationEmbed({
            user: member.user,
            member: record,
            title: returning ? '🌸 Bentornato in giardino!' : '🌱 Nuovo arrivo in giardino!',
            description: returning
                ? `**${username}** è tornato nel server! Diamogli di nuovo il benvenuto 👋`
                : `**${username}** è appena entrato nel server! Diamogli un caloroso benvenuto 👋`,
            color: await this.settingsManager.getPrimaryColor(),
        });

        await channel.send({ embeds: [embed] });
    }

}
