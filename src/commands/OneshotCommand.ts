import { Command } from '@sapphire/framework';
import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { ConfigManager } from '../managers/ConfigManager';

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
        .setDescription('Comando ad uso esclusivo del ruolo master. (Attualmente non fa nulla)'),
      {},
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const guild = await this.configManager!.getGuild();
    const masterRoleId = this.configManager!.getMasterRoleId();
    const member = await guild.members.fetch(interaction.user.id);

    if (!member.roles.cache.has(masterRoleId)) {
      await interaction.reply({
        content: 'Non hai i permessi per usare questo comando.',
        ephemeral: true,
      });
      return;
    }

    // Il comando, per ora, non esegue alcuna azione.
    await interaction.reply({ content: 'Questo comando al momento non esegue alcuna azione.', ephemeral: true });
  }
}
