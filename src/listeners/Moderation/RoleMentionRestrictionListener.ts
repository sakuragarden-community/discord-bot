import "reflect-metadata";
import { autoInjectable } from "tsyringe";
import { Listener } from '@sapphire/framework';
import { ChannelType, EmbedBuilder, GuildMember, Message } from 'discord.js';
import { ConfigManager } from "../../managers/ConfigManager";

@autoInjectable()
export class RoleMentionRestrictionListener extends Listener {
  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options,
    protected configManager: ConfigManager,
  ) {
    super(context, {
      ...options,
      event: 'messageCreate'
    });
  }

  public override async run(message: Message) {
    try {
      // Skip bot or system messages or DMs
      if (!message.guild || message.author.bot) return;

      // Ensure message is fully fetched if partial
      if ((message as any).partial) {
        try { await message.fetch(); } catch { return; }
      }

      // Must be in a guild text-based channel within the target category and not the findplayer channel
      const channel = message.channel;
      if (!channel || channel.type === ChannelType.DM) return;
      if (!(channel as any).isTextBased?.() || !(channel as any).send) return; // ensure can send
      const parentId = (channel as any).parentId as string | null | undefined;
      const targetCategoryId = this.configManager.getSearchPlayersCategoryId?.();
      const findplayerChannelId = this.configManager.getFindplayerChannelId?.();
      if (!targetCategoryId || !findplayerChannelId) return;

      if (channel.id === findplayerChannelId) return; // exception for findplayer
      if (!parentId || parentId !== targetCategoryId) return; // only inside the specified category

      // Must contain at least one role mention
      if (!message.mentions?.roles || message.mentions.roles.size === 0) return;

      // Fetch fresh member to avoid relying on cache
      let member: GuildMember | null = null;
      try {
        member = await message.guild.members.fetch(message.author.id);
      } catch {
        member = null;
      }
      if (!member) return;

      // Prepare role type IDs
      const roleIds = {
        master: this.configManager.getMasterRoleId?.(),
        admin: this.configManager.getAdminRoleId?.(),
        moderator: this.configManager.getModeratorRoleId?.(),
        helper: this.configManager.getHelperRoleId?.(),
        collaborator: this.configManager.getCollaboratorRoleId?.(),
        supporter: this.configManager.getSupporterRoleId?.(),
        bot: this.configManager.getBotRoleId?.(),
        member: this.configManager.getMemberRoleId?.(),
      } as const;

      // Collect member's roles that are part of the defined role types
      const memberTypeRoles = member.roles.cache.filter(r => Object.values(roleIds).includes(r.id));

      // Condition: user has ONLY member and/or supporter among the listed types
      const allowedSet = new Set([roleIds.member, roleIds.supporter].filter(Boolean) as string[]);
      const hasOnlyAllowed = memberTypeRoles.every(r => allowedSet.has(r.id));
      // Also ensure they actually have at least one allowed role among types (typical: member)
      const hasAtLeastOneAllowed = memberTypeRoles.some(r => allowedSet.has(r.id));

      if (!hasOnlyAllowed || !hasAtLeastOneAllowed) return; // has privileged roles, so allow

      // Delete the original message
      try {
        await message.delete();
      } catch (e) {
        console.warn('Impossibile cancellare il messaggio per permessi insufficienti o già eliminato.', e);
      }

      // Send warning embed tagging the user outside the embed
      try {
        const embed = new EmbedBuilder()
          .setColor(this.configManager.getErrorColor())
          .setTitle('⛔ Per cercare giocatori usa il canale dedicato')
          .setDescription(`Per favore utilizza il canale <#${findplayerChannelId}> per cercare o menzionare ruoli di gioco. Grazie!`);

        await (channel as any).send({ content: `${member.toString()}`, embeds: [embed] });
      } catch (e) {
        console.warn('Impossibile inviare il messaggio di avviso nel canale.', e);
      }
    } catch (error) {
      console.error('Errore in RoleMentionRestrictionListener:', error);
    }
  }
}
