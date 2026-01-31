import { Command } from '@sapphire/framework';
import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits, GuildMember } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { ConfigManager } from '../managers/ConfigManager';

const MAINTENANCE_ROLE_ID = '1466930663436320948';

function chunk<T>(arr: T[], size: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
}

@autoInjectable()
export class MaintenanceCommand extends Command {
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
        .setName('maintenance')
        .setDescription('Attiva o disattiva la modalità manutenzione per tutti i membri')
        .addStringOption((option) =>
          option
            .setName('mode')
            .setDescription('Scegli tra on/off')
            .setRequired(true)
            .addChoices(
              { name: 'on', value: 'on' },
              { name: 'off', value: 'off' },
            ),
        )
        // Richiede il permesso Gestire Ruoli per eseguire il comando
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
      {},
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const mode = interaction.options.getString('mode', true) as 'on' | 'off';

    // Permission check aggiuntivo: consenti solo al ruolo master, se definito
    const guild = await this.configManager!.getGuild();
    // const masterRoleId = this.configManager!.getMasterRoleId();
    const invoker = await guild.members.fetch(interaction.user.id);
    /*
    if (!invoker.roles.cache.has(masterRoleId)) {
      await interaction.reply({ content: 'Non hai i permessi per usare questo comando.', ephemeral: true });
      return;
    }
    */


    await interaction.deferReply({ ephemeral: true });

    const role = guild.roles.cache.get(MAINTENANCE_ROLE_ID) ?? await guild.roles.fetch(MAINTENANCE_ROLE_ID).catch(() => null);
    if (!role) {
      await interaction.editReply('Ruolo di manutenzione non trovato. Verifica l\'ID del ruolo.');
      return;
    }

    // Recupera tutti i membri del server
    await guild.members.fetch();
    const members: GuildMember[] = guild.members.cache.map((m) => m);

    console.log(members.length);

    let processed = 0;
    let changed = 0;
    let skipped = 0;
    let failed = 0;

    const batches = chunk(members, 20); // piccoli batch per evitare rate limit

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      const results = await Promise.allSettled(
        batch.map(async (member) => {
          // ignora bot? La richiesta specifica TUTTI i membri, quindi includiamo anche i bot.
          try {
            if (mode === 'on') {
              if (member.roles.cache.has(role.id)) {
                skipped++;
              } else {
                await member.roles.add(role);
                changed++;
              }
            } else {
              if (!member.roles.cache.has(role.id)) {
                skipped++;
              } else {
                await member.roles.remove(role);
                changed++;
              }
            }
            processed++;
          } catch (e) {
            failed++;
            processed++;
            console.log(e);
          }
        }),
      );

      // Se Discord dovesse rate-limitare, attendi leggermente
      const hasRejections = results.some((r) => r.status === 'rejected');
      if (hasRejections) {
        // piccolo delay per dare respiro
        await new Promise((r) => setTimeout(r, 750));
      }

      // Aggiorna progresso ogni N batch
      if ((i + 1) % 5 === 0 || i === batches.length - 1) {
        await interaction.editReply(
          `Modalità: ${mode}\nElaborati: ${processed}/${members.length}\nModificati: ${changed}\nIgnorati: ${skipped}\nErrori: ${failed}`,
        );
      }
    }

    await interaction.editReply(
      `Operazione completata. Modalità: ${mode}\nTotale membri: ${members.length}\nModifiche applicate: ${changed}\nIgnorati: ${skipped}\nErrori: ${failed}`,
    );
  }
}
