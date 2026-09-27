import "reflect-metadata";
import { autoInjectable } from "tsyringe";
import { Listener } from '@sapphire/framework';
import { GuildMember, PartialGuildMember } from 'discord.js';
import { SettingsManager } from "../../managers/SettingsManager";
import { Member, MemberManager, MemberStatus } from "../../managers/MemberManager";
import { buildMemberNotificationEmbed } from "../../utils/MemberNotificationEmbed";

@autoInjectable()
export class RemoveListener extends Listener {

    public constructor(
        context: Listener.LoaderContext,
        options: Listener.Options,
        protected settingsManager: SettingsManager,
        protected memberManager: MemberManager,
    ) {
        super(context, {
            ...options,
            event: 'guildMemberRemove'
        });
    }

    public override async run(member: GuildMember | PartialGuildMember) {
        const banned = await this.isBanned(member);

        let record: Member | null = null;
        try {
            record = await this.saveMemberExit(member, banned ? "BANNED" : "LEFT");
        } catch (error) {
            console.error("Errore durante l'aggiornamento del membro in uscita sulle API Kodama:", error);
        }

        try {
            await this.notifyStaff(member, record, banned);
        } catch (error) {
            console.error("Errore durante l'invio della notifica di uscita allo Staff:", error);
        }
    }

    /** `true` se l'uscita è dovuta a un ban (richiede il permesso "Banna membri"). */
    protected async isBanned(member: GuildMember | PartialGuildMember): Promise<boolean> {
        try {
            await member.guild.bans.fetch({ user: member.id, force: true });
            return true;
        } catch {
            return false;
        }
    }

    /** Aggiorna sulle API Kodama lo stato del membro e la data di uscita. */
    protected async saveMemberExit(member: GuildMember | PartialGuildMember, status: MemberStatus): Promise<Member | null> {
        const existing = await this.memberManager.findByDiscordId(member.id);
        if (!existing) {
            console.warn(`Membro ${member.id} non registrato sulle API Kodama: uscita non salvata.`);
            return null;
        }

        return this.memberManager.patch(existing.id, {
            status,
            leftAt: new Date().toISOString(),
        });
    }

    /** Notifica allo Staff, nel canale server, l'uscita o il ban del membro. */
    protected async notifyStaff(member: GuildMember | PartialGuildMember, record: Member | null, banned: boolean) {
        const channelId = await this.settingsManager.getServerChannelId();
        if (!channelId) return;
        const channel = await member.guild.channels.fetch(channelId);
        if (!channel || !channel.isTextBased()) return;

        const username = record?.username ?? member.user.username;
        const embed = buildMemberNotificationEmbed({
            user: member.user,
            member: record,
            title: banned ? '🔨 Un fiore è stato estirpato' : '🍂 Un fiore ha lasciato il giardino',
            description: banned
                ? `**${username}** è stato bannato dal server.`
                : `**${username}** è appena uscito dal server. Alla prossima! 👋`,
            color: banned
                ? await this.settingsManager.getErrorColor()
                : await this.settingsManager.getAlertColor(),
        });

        await channel.send({ embeds: [embed] });
    }
}
