import { Command } from '@sapphire/framework';
import { ChatInputCommandInteraction, SlashCommandBuilder, TextChannel, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import axios from 'axios';
import { ConfigManager } from '../managers/ConfigManager';

interface ApiListResponse<T> {
  data: T[];
}

interface ApiMessageEntity {
  id: number;
  channel_id: number;
  label: string | null;
  position: number | null;
  type: 'default' | 'embed';
  title: string | null;
  content: string | null;
  image: string | null;
  embed_color: string | null;
  discord_id: string | null;
  queued: number;
  created_at: string;
  updated_at: string;
}

interface ApiChannelEntity {
  id: number;
  discord_id: string; // channel snowflake
  name: string;
  type: string;
  created_at: string;
  updated_at: string;
}

const API_BASE_URL = 'https://nime-staging.sakuragarden.it';

@autoInjectable()
export class PublishCommand extends Command {
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
        .setName('publish')
        .setDescription('Pubblica entità pianificate dal sito')
        .addStringOption((option) =>
          option
            .setName('entity')
            .setDescription('Scegli l\'entità da pubblicare')
            .setRequired(true)
            .addChoices({ name: 'messages', value: 'messages' }),
        ),
      {},
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const entity = interaction.options.getString('entity', true);

    // Permission check: only master role can use
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

    if (entity !== 'messages') {
      await interaction.reply({ content: 'Entità non supportata.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    let processed = 0;
    let published = 0;
    let skippedNoChannel = 0;
    let skippedAlready = 0;
    let errors = 0;

    try {
      // Fetch channels map
      const channelsResp = await axios.get<ApiListResponse<ApiChannelEntity>>(`${API_BASE_URL}/api/channels`);
      const channels = channelsResp.data.data;
      const channelById = new Map<number, ApiChannelEntity>();
      channels.forEach((c) => channelById.set(c.id, c));

      // Fetch messages
      const messagesResp = await axios.get<ApiListResponse<ApiMessageEntity>>(`${API_BASE_URL}/api/messages`);
      const messages = messagesResp.data.data;

      for (const m of messages) {
        try {
          if (m.queued !== 1) continue;
          processed++;

          const chInfo = channelById.get(m.channel_id);
          if (!chInfo || !chInfo.discord_id) {
            skippedNoChannel++;
            continue;
          }

          const channelFetched = await interaction.client.channels.fetch(chInfo.discord_id);
          if (!channelFetched || !channelFetched.isTextBased()) {
            skippedNoChannel++;
            continue;
          }

          const textChannel = channelFetched as TextChannel;

          // If message already has a discord_id, update the existing Discord message instead of creating a new one
          if (m.discord_id && m.discord_id !== 'null') {
            let existingMessage: any = null;
            try {
              existingMessage = await textChannel.messages.fetch(m.discord_id);
            } catch (e) {
              existingMessage = null;
            }

            if (existingMessage) {
              if (m.type === 'embed') {
                const embed = new EmbedBuilder();
                if (m.title) embed.setTitle(m.title);
                if (m.content) embed.setDescription(m.content);
                if (m.embed_color) {
                  try { embed.setColor(m.embed_color as any); } catch {}
                }
                if (m.image) embed.setImage(m.image);

                await existingMessage.edit({ embeds: [embed] });
              } else {
                const titlePart = m.title ? `# ${m.title}\n\n` : '';
                const content = `${titlePart}${m.content ?? ''}`.trim();
                if (m.image) {
                  await existingMessage.edit({ content, files: [m.image] });
                } else {
                  // remove attachments if any by sending empty attachments and only content
                  try {
                    await existingMessage.edit({ content, attachments: [] as any });
                  } catch {
                    await existingMessage.edit({ content });
                  }
                }
              }

              published++;
              try {
                await axios.patch(`${API_BASE_URL}/api/messages/${m.id}`, { queued: 0, discord_id: m.discord_id });
              } catch (e) {
                console.warn('Impossibile aggiornare lo stato (queued/discord_id) sul server per il messaggio', m.id);
              }
              continue; // proceed to next API message
            }
            // If the original Discord message is missing, fall back to creating a new one below
          }

          let sentMessage;
          if (m.type === 'embed') {
            const embed = new EmbedBuilder();
            if (m.title) embed.setTitle(m.title);
            if (m.content) embed.setDescription(m.content);
            if (m.embed_color) {
              try { embed.setColor(m.embed_color as any); } catch {}
            }
            if (m.image) embed.setImage(m.image);

            sentMessage = await textChannel.send({ embeds: [embed] });
          } else {
            // default: title as H1 and image as attachment, ignore embed color
            const titlePart = m.title ? `# ${m.title}\n\n` : '';
            const content = `${titlePart}${m.content ?? ''}`.trim();
            if (m.image) {
              sentMessage = await textChannel.send({ content, files: [m.image] });
            } else {
              sentMessage = await textChannel.send({ content });
            }
          }

          published++;

          // Try to update queued flag and discord_id on API if endpoint exists
          try {
            await axios.patch(`${API_BASE_URL}/api/messages/${m.id}`, { queued: 0, discord_id: sentMessage.id });
          } catch (e) {
            console.warn('Impossibile aggiornare lo stato (queued/discord_id) sul server per il messaggio', m.id);
          }
        } catch (e) {
          console.error('Errore durante la pubblicazione del messaggio', m.id, e);
          errors++;
          continue;
        }
      }
    } catch (e) {
      await interaction.editReply('Errore durante il recupero dei dati dal server.');
      return;
    }

    await interaction.editReply(
      `Elaborazione completata.\n` +
        `Processati: ${processed}\n` +
        `Pubblicati: ${published}\n` +
        `Senza canale: ${skippedNoChannel}\n` +
        `In precedenza pubblicati (discord_id): ${skippedAlready}\n` +
        `Errori: ${errors}`,
    );
  }
}
