import "reflect-metadata";
import { Command } from '@sapphire/framework';
import {
    ChannelType,
    ChatInputCommandInteraction,
    ForumChannel,
    Guild,
    GuildMember,
    InteractionContextType,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
    ThreadChannel,
} from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { SettingsManager } from '../../managers/SettingsManager';
import { MemberManager } from '../../managers/MemberManager';

/** Esito del seed dei membri. */
interface MemberSeedResult {
    total: number;
    created: number;
    withPresentation: number;
    failed: number;
}

@autoInjectable()
export class SeedCommand extends Command {

    public constructor(
        context: Command.LoaderContext,
        options: Command.Options,
        protected settingsManager?: SettingsManager,
        protected memberManager?: MemberManager,
    ) {
        super(context, { ...options });
    }

    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand(
            new SlashCommandBuilder()
                .setName('seed')
                .setDescription('Popola il database Kodama a partire dai dati del server')
                .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
                .setContexts(InteractionContextType.Guild)
                .addStringOption((option) =>
                    option
                        .setName('entity')
                        .setDescription('Entità da popolare')
                        .setRequired(true)
                        .addChoices({ name: 'member', value: 'member' }),
                ),
            { idHints: ['1554191775831302154'] },
        );
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        if (!interaction.inCachedGuild() || !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Non hai i permessi per eseguire questo comando.', flags: MessageFlags.Ephemeral });
            return;
        }

        const entity = interaction.options.getString('entity', true);

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            switch (entity) {
                case 'member': {
                    const result = await this.seedMembers(interaction.guild);
                    await interaction.editReply([
                        `✅ Seed dei membri completato.`,
                        `• Utenti analizzati: ${result.total}`,
                        `• Record creati: ${result.created} (di cui con presentazione: ${result.withPresentation})`,
                        `• Errori: ${result.failed}`,
                    ].join('\n'));
                    break;
                }
                default:
                    await interaction.editReply(`Entità "${entity}" non supportata.`);
            }
        } catch (error) {
            console.error('[SeedCommand] Errore durante il seed:', error);
            await interaction.editReply('❌ Errore durante il seed, controlla i log.');
        }
    }

    /** Crea sulle API Kodama i membri del server non ancora registrati, con l'eventuale link alla presentazione. */
    protected async seedMembers(guild: Guild): Promise<MemberSeedResult> {
        const guildMembers = await guild.members.fetch();
        const users = Array.from(guildMembers.values()).filter((member) => !member.user.bot);

        const storedIds = new Set(
            (await this.memberManager!.listAll({ size: 100 })).map((member) => member.discordId),
        );
        const missing = users.filter((member) => !storedIds.has(member.id));

        const result: MemberSeedResult = { total: users.length, created: 0, withPresentation: 0, failed: 0 };
        if (missing.length === 0) return result;

        // Le presentazioni servono solo per i membri non ancora registrati
        const presentations = await this.getPresentationUrls(guild);

        for (const member of missing) {
            const presentation = presentations.get(member.id) ?? null;
            try {
                await this.createMember(member, presentation);
                result.created++;
                if (presentation) result.withPresentation++;
            } catch (error) {
                result.failed++;
                console.error(`[SeedCommand] Errore durante la creazione del membro ${member.id}:`, error);
            }
        }

        return result;
    }

    /** Registra il membro sulle API Kodama. */
    protected async createMember(member: GuildMember, presentation: string | null) {
        return this.memberManager!.create({
            discordId: member.id,
            username: member.user.username,
            joinedAt: member.joinedAt?.toISOString() ?? null,
            status: "ACTIVE",
            presentation,
        });
    }

    /** Ritorna la mappa Discord ID → URL del topic aperto dall'utente nel forum presentazioni. */
    protected async getPresentationUrls(guild: Guild): Promise<Map<string, string>> {
        const urls = new Map<string, string>();

        const presentationsChannelId = await this.settingsManager!.getPresentationsChannelId();
        if (!presentationsChannelId) return urls;

        const channel = await guild.channels.fetch(presentationsChannelId);
        if (!channel || channel.type !== ChannelType.GuildForum) {
            console.warn('[SeedCommand] Canale presentazioni non trovato o non di tipo forum.');
            return urls;
        }

        for (const thread of await this.fetchAllThreads(channel)) {
            const authorId = await this.getThreadAuthorId(thread);
            // In caso di più topic dello stesso utente si conserva il primo trovato
            if (authorId && !urls.has(authorId)) {
                urls.set(authorId, thread.url);
            }
        }

        return urls;
    }

    /** Recupera tutti i thread del forum, attivi e archiviati. */
    protected async fetchAllThreads(forum: ForumChannel): Promise<ThreadChannel[]> {
        const active = await forum.threads.fetchActive();
        const threads = Array.from(active.threads.values());

        let before: ThreadChannel | undefined;
        let hasMore = true;
        while (hasMore) {
            const archived = await forum.threads.fetchArchived({ type: 'public', limit: 100, before });
            const page = Array.from(archived.threads.values());
            threads.push(...page);
            hasMore = archived.hasMore && page.length > 0;
            before = page[page.length - 1];
        }

        return threads;
    }

    /** Autore del topic: il proprietario del thread o, in mancanza, l'autore del primo messaggio. */
    protected async getThreadAuthorId(thread: ThreadChannel): Promise<string | null> {
        if (thread.ownerId) return thread.ownerId;

        try {
            const starter = await thread.fetchStarterMessage();
            return starter?.author.id ?? null;
        } catch {
            return null;
        }
    }
}
