import { Command } from '@sapphire/framework';
import { ChatInputCommandInteraction, SlashCommandBuilder, TextChannel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import fs from 'fs';
import path from 'path';
import config from '../../config.json';
import { ConfigManager } from '../managers/ConfigManager';

interface SetupButton {
  type: 'link';
  label: string;
  url?: string; // required if type is 'link'
}

interface SetupMessage {
  id: string; // 'new' or discord message id
  type: 'default' | 'embed';
  embedColor?: string;
  embedTitle?: string;
  content?: string;
  image?: string;
  buttons?: SetupButton[];
}

interface SetupSection {
  channelId: string; // discord channel id
  messages: SetupMessage[];
}

// Top-level JSON is a record of sections
type SetupPayload = Record<string, SetupSection>;

function resolveSetupContent(content?: string): string {
  const value = (content ?? '').trim();
  if (!value) return '';

  try {
    // Try multiple base locations where the markdown may live
    const candidates = [
      path.join(process.cwd(), 'setup', 'content', value),
      path.join(process.cwd(), 'setup', value),
      path.isAbsolute(value) ? value : path.join(process.cwd(), value),
    ];

    for (const p of candidates) {
      try {
        const stat = fs.existsSync(p) ? fs.statSync(p) : null;
        if (stat && stat.isFile()) {
          return fs.readFileSync(p, 'utf-8');
        }
      } catch {}
    }
  } catch {}

  // Fallback: treat it as plain text
  return value;
}

function buildComponents(buttons?: SetupButton[]) {
  if (!buttons || buttons.length === 0) return undefined;
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let current = new ActionRowBuilder<ButtonBuilder>();

  for (const b of buttons) {
    if (!b || !b.label) continue;
    if (b.type === 'link') {
      if (!b.url) continue;
      const btn = new ButtonBuilder().setLabel(b.label).setStyle(ButtonStyle.Link).setURL(b.url);
      // push to current row; if 5 buttons, start a new row
      const currentComponents = (current as any).components as ButtonBuilder[];
      if (currentComponents && currentComponents.length >= 5) {
        rows.push(current);
        current = new ActionRowBuilder<ButtonBuilder>();
      }
      current.addComponents(btn);
    } else {
      // unsupported button types are ignored per requirements
      continue;
    }
  }

  // push last row if it has components
  const comps = (current as any).components as ButtonBuilder[];
  if (comps && comps.length > 0) rows.push(current);

  return rows.length > 0 ? rows : undefined;
}

async function clearTextChannel(channel: TextChannel): Promise<number> {
  let totalDeleted = 0;
  try {
    // Loop until there are no messages left (or very few)
    while (true) {
      const fetched = await channel.messages.fetch({ limit: 100 });
      if (!fetched || fetched.size === 0) break;

      // Try bulk delete first for messages younger than 14 days
      try {
        const bulkCount = await channel.bulkDelete(fetched, true).catch(() => 0 as any);
        const countNumber = typeof bulkCount === 'number' ? bulkCount : (bulkCount?.size ?? 0);
        totalDeleted += countNumber;
      } catch {}

      // Delete remaining old messages individually
      for (const msg of fetched.values()) {
        try {
          await msg.delete();
          totalDeleted++;
        } catch {
          // ignore failures (e.g. permissions or already deleted)
        }
      }

      // Small break to respect rate limits implicitly
      await new Promise((r) => setTimeout(r, 500));

      // Safety: if fewer than 100 returned, next fetch may return 0 soon
      if (fetched.size < 100) {
        // Check again quickly
        const check = await channel.messages.fetch({ limit: 1 }).catch(() => null as any);
        if (!check || check.size === 0) break;
      }
    }
  } catch {
    // ignore errors, return what we could delete
  }
  return totalDeleted;
}

@autoInjectable()
export class SetupCommand extends Command {
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
        .setName('setup')
        .setDescription('Esegue la configurazione iniziale pubblicando contenuti predefiniti')
        .setDefaultMemberPermissions(0)
        .addStringOption((option) =>
          option
            .setName('entity')
            .setDescription("Entità da configurare")
            .setRequired(true)
            .addChoices({ name: 'messages', value: 'messages' }),
        )
        .addStringOption((option) =>
          option
            .setName('subcategory')
            .setDescription('Se entity=messages, limita la pubblicazione alla sottocategoria specificata (es. "menu" o "rules")')
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName('flags')
            .setDescription('Flag opzionali. Usa "f" per pulire i messaggi del canale prima della pubblicazione')
            .setRequired(false),
        ),
      {},
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const entity = interaction.options.getString('entity', true);
    const subcategory = interaction.options.getString('subcategory');
    const flagsRaw = interaction.options.getString('flags') || '';
    const hasFlagF = flagsRaw.toLowerCase().includes('f');

    if (entity !== 'messages') {
      await interaction.reply({ content: 'Entità non supportata.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const setupFile = path.join(process.cwd(), 'setup', 'messages.json');
    if (!fs.existsSync(setupFile)) {
      await interaction.editReply('File setup/messages.json non trovato.');
      return;
    }

    let raw: string;
    try {
      raw = fs.readFileSync(setupFile, 'utf-8');
    } catch (e) {
      await interaction.editReply('Impossibile leggere il file di setup.');
      return;
    }

    let payload: SetupPayload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      await interaction.editReply('Il file di setup non contiene un JSON valido.');
      return;
    }

    let sections = 0;
    let total = 0;
    let published = 0;
    let updated = 0;
    let errors = 0;

    const colorMap: Record<string, any> = (config as any)?.colors ?? {};

    // If a subcategory is specified, restrict to that section only
    let keys = Object.keys(payload);
    if (subcategory) {
      if (!Object.prototype.hasOwnProperty.call(payload, subcategory)) {
        await interaction.editReply(`Sottocategoria "${subcategory}" non trovata. Nessuna azione eseguita.`);
        return;
      }
      // Validate channel existence before proceeding as per requirement
      const sec = payload[subcategory];
      const chanIdCheck = (sec as any)?.channelId ?? (sec as any)?.channel_id;
      if (!chanIdCheck) {
        await interaction.editReply(`Canale non trovato per la sottocategoria "${subcategory}". Nessuna azione eseguita.`);
        return;
      }
      try {
        const ch = await interaction.client.channels.fetch(chanIdCheck);
        if (!ch || !ch.isTextBased()) {
          await interaction.editReply(`Canale non valido per la sottocategoria "${subcategory}". Nessuna azione eseguita.`);
          return;
        }
      } catch {
        await interaction.editReply(`Canale non trovato per la sottocategoria "${subcategory}". Nessuna azione eseguita.`);
        return;
      }
      keys = [subcategory];
    }

    const cleanedChannels = new Set<string>();
    for (const key of keys) {
      const section = payload[key];
      const chanId = (section as any)?.channelId ?? (section as any)?.channel_id;
      if (!section || !chanId || !Array.isArray(section.messages)) continue;
      sections++;

      try {
        const ch = await interaction.client.channels.fetch(chanId);
        if (!ch || !ch.isTextBased()) {
          errors++;
          continue;
        }
        const textChannel = ch as TextChannel;

        // If cleanup flag is present, clear the channel once per channel before publishing
        let channelWasCleared = false;
        if (hasFlagF && !cleanedChannels.has(textChannel.id)) {
          try {
            await clearTextChannel(textChannel);
            channelWasCleared = true;
            cleanedChannels.add(textChannel.id);
          } catch {
            // Even if cleanup fails, proceed with sending to avoid blocking
          }
        }

        for (const m of section.messages) {
          total++;
          try {
            if (!m || !m.type) {
              errors++;
              continue;
            }

            const msgType = (m.type as string | undefined)?.toString().trim().toLowerCase() ?? 'default';
            const isEmbed = msgType === 'embed';
            const hasImage = !!m.image && m.image.trim().length > 0;
            const components = buildComponents(m.buttons);

            const shouldCreateNew = !m.id || m.id === 'new' || channelWasCleared;
            if (!shouldCreateNew) {
              // Edit existing message
              let existing: any = null;
              try {
                existing = await textChannel.messages.fetch(m.id);
              } catch {
                existing = null;
              }

              if (!existing) {
                errors++;
                continue;
              }

              if (isEmbed) {
                const embed = new EmbedBuilder();
                console.log('ciao');
                if (m.embedTitle) {
                  embed.setTitle(m.embedTitle);
                }
                const content = resolveSetupContent(m.content);
                if (content) {
                  embed.setDescription(content);
                }
                if (m.embedColor) {
                  const clr = colorMap[m.embedColor];
                  if (clr) {
                    try { embed.setColor(clr as any); } catch {}
                  }
                }
                if (hasImage) embed.setImage(m.image!);

                await existing.edit(components ? { embeds: [embed], components } : { embeds: [embed] });
              } else {
                const content = resolveSetupContent(m.content);
                if (hasImage) {
                  await existing.edit(components ? { content, files: [m.image!], components } : { content, files: [m.image!] });
                } else {
                  try {
                    await existing.edit(components ? { content, attachments: [] as any, components } : { content, attachments: [] as any });
                  } catch {
                    await existing.edit(components ? { content, components } : { content });
                  }
                }
              }

              updated++;
            } else {
              // Create new message
              if (isEmbed) {
                const embed = new EmbedBuilder();
                if (m.embedTitle) {
                  embed.setTitle(m.embedTitle);
                }
                const content = resolveSetupContent(m.content);
                if (content) {
                  embed.setDescription(content);
                }
                if (m.embedColor) {
                  const clr = colorMap[m.embedColor];
                  if (clr) {
                    try { embed.setColor(clr as any); } catch {}
                  }
                }
                if (hasImage) embed.setImage(m.image!);

                await textChannel.send(components ? { embeds: [embed], components } : { embeds: [embed] });
              } else {
                const content = resolveSetupContent(m.content);
                if (hasImage) {
                  await textChannel.send(components ? { content, files: [m.image!], components } : { content, files: [m.image!] });
                } else {
                  await textChannel.send(components ? { content, components } : { content });
                }
              }

              published++;
            }
          } catch (e) {
            errors++;
            continue;
          }
        }
      } catch (e) {
        errors++;
        continue;
      }
    }

    await interaction.editReply(
      `Setup completato.\n` +
      `Sezioni: ${sections}\n` +
      `Totale elementi: ${total}\n` +
      `Pubblicati: ${published}\n` +
      `Aggiornati: ${updated}\n` +
      `Errori: ${errors}`,
    );
  }
}
