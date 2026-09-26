import { Command } from '@sapphire/framework';
import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import axios from 'axios';
import { SettingsManager } from '../managers/SettingsManager';
import { ApiManager } from '../managers/ApiManager';

@autoInjectable()
export class OneshotCommand extends Command {
  public constructor(
    context: Command.Context,
    options: Command.Options,
    protected settingsManager?: SettingsManager,
    protected apiManager?: ApiManager,
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
    const guild = await this.settingsManager!.getGuild();
    const masterRoleId = await this.settingsManager!.getMasterRoleId();
    const member = await guild.members.fetch(interaction.user.id);

    if (!masterRoleId || !member.roles.cache.has(masterRoleId)) {
      await interaction.reply({
        content: 'Non hai i permessi per usare questo comando.',
        ephemeral: true,
      });
      return;
    }

    try {
      const token = await this.apiManager!.getBearerToken();

      await axios.post(
        `${process.env.KODAMA_API_BASE_URL}/api/v1/members`,
        {
          discordId: '123456789012345678',
          username: 'sakura_mochi',
          joinedAt: '2026-08-26T10:15:00Z',
          leftAt: null,
          status: 'ACTIVE',
          presentation: 'Ciao a tutti, sono nuovo nel server!',
          experience: 0,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      await interaction.reply({ content: 'Richiesta inviata con successo alle API Kodama.', ephemeral: true });
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: "Errore durante la chiamata alle API Kodama.", ephemeral: true });
    }
  }
}
