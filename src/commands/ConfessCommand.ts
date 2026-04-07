import { Command } from '@sapphire/framework';
import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, TextChannel } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { ConfigManager } from '../managers/ConfigManager';

@autoInjectable()
export class ConfessCommand extends Command {
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
        .setName('confess')
        .setDescription('Invia una confessione nel canale freetalk')
        .addBooleanOption((option) =>
          option
            .setName('is_anonymous')
            .setDescription('Se vero, la confessione sarà anonima')
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('message')
            .setDescription('Il messaggio della confessione')
            .setRequired(true)
            .setMaxLength(1900),
        ),
      {},
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const isAnonymous = interaction.options.getBoolean('is_anonymous', true);
    const message = interaction.options.getString('message', true).trim();

    const freetalkId = this.configManager!.getFreetalkChannelId();
    if (!freetalkId) {
      await interaction.reply({ content: 'Configurazione canale freetalk mancante.', ephemeral: true });
      return;
    }

    const ch = await interaction.client.channels.fetch(freetalkId).catch(() => null);
    if (!ch || !ch.isTextBased()) {
      await interaction.reply({ content: 'Impossibile trovare il canale freetalk.', ephemeral: true });
      return;
    }

    const title = "Uhh, c'è una confessione da fare qui!";

    const authorRef = `<@${interaction.user.id}>`;
    const desc = isAnonymous
      ? `Un anonimo vuole rivelarci questo segreto:\n\n"${message}"`
      : `${authorRef} vuole rivelarci questo segreto:\n\n"${message}"`;

    const color = this.configManager!.getVioletColor();

    const botAvatar = interaction.client.user?.displayAvatarURL() ?? null;
    const authorAvatar = interaction.user.displayAvatarURL() ?? null;

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(desc)
      .setColor(color);

    const thumbUrl = isAnonymous ? botAvatar : authorAvatar;
    if (thumbUrl) embed.setThumbnail(thumbUrl);

    try {
      await (ch as TextChannel).send({ embeds: [embed] });
      await interaction.reply({ content: 'La tua confessione è stata inviata!', ephemeral: true });
    } catch (e) {
      console.log(e);
      await interaction.reply({ content: 'Si è verificato un errore nell\'invio della confessione.', ephemeral: true });
    }
  }
}
