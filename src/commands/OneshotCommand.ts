import { Command } from '@sapphire/framework';
import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { ConfigManager } from '../managers/ConfigManager';

const EXTRA_ROLE_ID = '1466948651162013706';

function chunk<T>(arr: T[], size: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
}

@autoInjectable()
export class OneshotCommand extends Command {
  public constructor(
    context: Command.Context,
    options: Command.Options,
    protected configManager?: ConfigManager,
  ) {
    super(context, { ...options });
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand(
      new SlashCommandBuilder()
        .setName('oneshot')
        .setDescription('Assegna ruoli ai membri (solo master).'),
      {},
    );
  }

  private async assignRequiredRoles(interaction: ChatInputCommandInteraction) {
    const guild = await this.configManager!.getGuild();

    const botRoleId = this.configManager!.getBotRoleId();
    const memberRoleId = this.configManager!.getMemberRoleId();

    // Ensure roles exist
    const botRole = guild.roles.cache.get(botRoleId) ?? await guild.roles.fetch(botRoleId).catch(() => null);
    const memberRole = guild.roles.cache.get(memberRoleId) ?? await guild.roles.fetch(memberRoleId).catch(() => null);
    const extraRole = guild.roles.cache.get(EXTRA_ROLE_ID) ?? await guild.roles.fetch(EXTRA_ROLE_ID).catch(() => null);

    if (!memberRole || !extraRole) {
      throw new Error('Ruoli necessari non trovati. Verifica configurazione e permessi.');
    }

    // Fetch all members to cache
    await guild.members.fetch();
    const allMembers: GuildMember[] = guild.members.cache.map((m) => m);

    // Exclude members with the bot role
    const targets = allMembers.filter((m) => !m.roles.cache.has(botRole?.id ?? '')); 

    let processed = 0;
    let changedMemberRole = 0;
    let changedExtraRole = 0;
    let skipped = 0;
    let failed = 0;

    const batches = chunk(targets, 20);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      const results = await Promise.allSettled(
        batch.map(async (m) => {
          try {
            let changed = 0;
            if (!m.roles.cache.has(memberRole.id)) {
              await m.roles.add(memberRole);
              changed++;
              changedMemberRole++;
            }
            if (!m.roles.cache.has(extraRole.id)) {
              await m.roles.add(extraRole);
              changed++;
              changedExtraRole++;
            }
            if (changed === 0) {
              skipped++;
            }
            processed++;
          } catch (e) {
            failed++;
            processed++;
          }
        })
      );

      // If any rejected, small delay to avoid hammering in case of rate limits
      if (results.some((r) => r.status === 'rejected')) {
        await new Promise((r) => setTimeout(r, 750));
      }

      if ((i + 1) % 5 === 0 || i === batches.length - 1) {
        await interaction.editReply(
          `Progresso: ${processed}/${targets.length} | Aggiunti member: ${changedMemberRole} | Aggiunti extra: ${changedExtraRole} | Ignorati: ${skipped} | Errori: ${failed}`
        );
      }
    }

    return { total: targets.length, processed, changedMemberRole, changedExtraRole, skipped, failed };
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const guild = await this.configManager!.getGuild();
    const masterRoleId = this.configManager!.getMasterRoleId();
    const invoker = await guild.members.fetch(interaction.user.id);

    if (!invoker.roles.cache.has(masterRoleId)) {
      await interaction.reply({
        content: 'Non hai i permessi per usare questo comando.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const summary = await this.assignRequiredRoles(interaction);
      await interaction.editReply(
        `Completato. Membri target: ${summary.total}\n` +
        `Elaborati: ${summary.processed}\n` +
        `Ruolo member aggiunto: ${summary.changedMemberRole}\n` +
        `Ruolo extra aggiunto: ${summary.changedExtraRole}\n` +
        `Ignorati: ${summary.skipped}\n` +
        `Errori: ${summary.failed}`
      );
    } catch (e: any) {
      await interaction.editReply(`Errore: ${e?.message ?? 'Imprevisto durante l\'operazione.'}`);
    }
  }
}
