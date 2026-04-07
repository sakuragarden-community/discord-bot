import { Command } from '@sapphire/framework';
import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ColorResolvable } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { ConfigManager } from '../managers/ConfigManager';

@autoInjectable()
export class MalediciCommand extends Command {
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
        .setName('maledici')
        .setDescription('Lancia una maledizione a un utente menzionato')
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('Menzione dell\'utente da maledire (es. @utente)')
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('maledizione')
            .setDescription('Il testo della maledizione')
            .setRequired(true)
            .setMaxLength(1900),
        ),
      {},
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const targetRaw = interaction.options.getString('target', true).trim();
    const maledizione = interaction.options.getString('maledizione', true).trim();

    // Validate target mention format: <@123> or <@!123>
    const mentionMatch = targetRaw.match(/^<@!?\d+>$/);
    if (!mentionMatch) {
      await interaction.reply({ content: 'Devi fornire una menzione utente valida come target (es. @utente).', ephemeral: true });
      return;
    }

    const idMatch = targetRaw.match(/\d+/);
    const targetId = idMatch ? idMatch[0] : null;
    if (!targetId) {
      await interaction.reply({ content: 'Impossibile leggere l\'utente target dalla menzione fornita.', ephemeral: true });
      return;
    }

    // Try to fetch the target user to obtain the avatar for thumbnail
    const client = interaction.client;
    let targetUser = null as any;
    try {
      targetUser = await client.users.fetch(targetId);
    } catch (e) {
      // If fetch fails, we still block since target must be a proper user mention
      await interaction.reply({ content: 'Impossibile trovare l\'utente menzionato. Controlla la menzione e riprova.', ephemeral: true });
      return;
    }

    const author = interaction.user;
    const authorRef = `<@${author.id}>`;
    const targetRef = `<@${targetId}>`;

    const violet = (this.configManager?.getVioletColor?.() ?? '#EE82EE') as ColorResolvable;

    const embed = new EmbedBuilder()
      .setTitle("E' stata lanciata una maledizione!")
      .setColor(violet)
      .setAuthor({ name: `${author.username}`, iconURL: author.displayAvatarURL() || undefined })
      .setDescription(`${authorRef} ha lanciato una maledizione a ${targetRef}!\n L'effetto di questo sortilegio è:\n\n"${maledizione}"`);

    const thumbUrl = targetUser?.displayAvatarURL?.() ?? null;
    if (thumbUrl) embed.setThumbnail(thumbUrl);

    try {
      await interaction.reply({ embeds: [embed] });
    } catch (e) {
      console.log(e);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: 'Si è verificato un errore durante l\'invio della maledizione.', ephemeral: true });
      } else {
        await interaction.reply({ content: 'Si è verificato un errore durante l\'invio della maledizione.', ephemeral: true });
      }
    }
  }
}
