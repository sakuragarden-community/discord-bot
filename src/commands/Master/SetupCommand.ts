import "reflect-metadata";
import { Command } from '@sapphire/framework';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    CategoryChannel,
    ChannelType,
    ChatInputCommandInteraction,
    ColorResolvable,
    EmbedBuilder,
    Guild,
    GuildBasedChannel,
    GuildTextBasedChannel,
    InteractionContextType,
    Message,
    MessageCreateOptions,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
} from 'discord.js';
import fs from 'fs';
import path from 'path';
import { autoInjectable } from 'tsyringe';
import { SettingsManager } from '../../managers/SettingsManager';

const MESSAGES_FILE = 'setup/messages.json';
const CONTENT_DIR = 'setup/content';

/**
 * Pattern delle decorazioni applicate dall'entità `decorations`.
 * `{{name}}` è il nome identificativo del canale/categoria, `{{emoji}}` la sua emoji.
 */
const CATEGORY_NAME_PATTERN = '❀━━┓ {{emoji}} {{name}} {{emoji}} ┏━━❀';
const CHANNEL_NAME_PATTERN = '┣╸{{emoji}}・{{name}}';
const LAST_CHANNEL_NAME_PATTERN = '┗╸{{emoji}}・{{name}}';

/** Riconosce una singola emoji (anche composta: ZWJ, variation selector, bandiere, keycap). */
const EMOJI_REGEX = new RegExp('\\p{RGI_Emoji}', 'gv');

/** Pulsante che apre un link esterno. */
interface SetupLinkButton {
    type: 'link';
    label: string;
    url: string;
}

/** Stili dei pulsanti con custom ID, mappati sui {@link ButtonStyle} di Discord. */
const BUTTON_STYLES = {
    primary: ButtonStyle.Primary,
    secondary: ButtonStyle.Secondary,
    success: ButtonStyle.Success,
    danger: ButtonStyle.Danger,
} as const;

/**
 * Pulsante gestito dall'interaction handler associato all'ID: `modal` apre una modale,
 * `action` esegue direttamente un'azione.
 */
interface SetupInteractiveButton {
    type: 'modal' | 'action';
    /** Custom ID assegnato al pulsante. */
    id: string;
    label: string;
    /** Stile del pulsante, `primary` se omesso. */
    style?: keyof typeof BUTTON_STYLES;
}

/** Pulsante da inserire come interactive component del messaggio. */
type SetupButton = SetupLinkButton | SetupInteractiveButton;

/** Definizione di un messaggio da pubblicare. */
interface SetupMessage {
    type: 'default' | 'embed';
    /** Nome del colore, risolto dalla configurazione `general/colors/<embedColor>`. */
    embedColor: string;
    embedTitle: string;
    /** Percorso del file .md relativo a {@link CONTENT_DIR}. */
    content: string;
    /** URL dell'immagine da allegare. */
    image: string;
    buttons: SetupButton[];
}

/** Canale da allestire: la configurazione con il Discord ID e i messaggi da pubblicare in ordine. */
interface SetupChannel {
    settingPath: string;
    messages: SetupMessage[];
}

type SetupMessagesFile = Record<string, SetupChannel>;

/** Esito della decorazione di un singolo canale o categoria. */
interface DecorationResult {
    oldName: string;
    newName?: string;
    status: 'renamed' | 'unchanged' | 'skipped' | 'error';
    error?: string;
}

/** Esito del setup di un singolo canale. */
interface ChannelSetupResult {
    subcategory: string;
    deleted: number;
    published: number;
    total: number;
    error?: string;
}

@autoInjectable()
export class SetupCommand extends Command {

    public constructor(
        context: Command.LoaderContext,
        options: Command.Options,
        protected settingsManager?: SettingsManager,
    ) {
        super(context, { ...options });
    }

    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand(
            new SlashCommandBuilder()
                .setName('setup')
                .setDescription('Allestisce i contenuti del server a partire dai file di setup')
                .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
                .setContexts(InteractionContextType.Guild)
                .addStringOption((option) =>
                    option
                        .setName('entity')
                        .setDescription('Entità da allestire')
                        .setRequired(true)
                        .addChoices(
                            { name: 'messages', value: 'messages' },
                            { name: 'decorations', value: 'decorations' },
                        ),
                )
                .addStringOption((option) =>
                    option
                        .setName('subcategory')
                        .setDescription('Limita il setup a una sola sottocategoria (es. il canale di messages.json)')
                        .setRequired(false)
                        .setAutocomplete(true),
                ),
            { idHints: ['1554191774094860328'] },
        );
    }

    /** Suggerisce le sottocategorie definite in messages.json (riletto a ogni richiesta). */
    public override async autocompleteRun(interaction: Command.AutocompleteInteraction) {
        const focused = interaction.options.getFocused().toLowerCase();
        let keys: string[] = [];
        try {
            keys = Object.keys(this.loadMessagesFile());
        } catch (error) {
            console.error('[SetupCommand] Errore durante la lettura di messages.json:', error);
        }

        await interaction.respond(
            keys
                .filter((key) => key.toLowerCase().includes(focused))
                .slice(0, 25)
                .map((key) => ({ name: key, value: key })),
        );
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        if (!interaction.inCachedGuild() || !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Non hai i permessi per eseguire questo comando.', flags: MessageFlags.Ephemeral });
            return;
        }

        const entity = interaction.options.getString('entity', true);
        const subcategory = interaction.options.getString('subcategory');

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            switch (entity) {
                case 'messages': {
                    const results = await this.setupMessages(interaction.guild, subcategory);
                    if (!results) {
                        await interaction.editReply(`Sottocategoria "${subcategory}" non presente in ${MESSAGES_FILE}.`);
                        break;
                    }
                    await interaction.editReply(this.formatMessagesReport(results));
                    break;
                }
                case 'decorations': {
                    const results = await this.setupDecorations(interaction.guild);
                    await interaction.editReply(this.formatDecorationsReport(results));
                    break;
                }
                default:
                    await interaction.editReply(`Entità "${entity}" non supportata.`);
            }
        } catch (error) {
            console.error('[SetupCommand] Errore durante il setup:', error);
            await interaction.editReply('❌ Errore durante il setup, controlla i log.');
        }
    }

    /**
     * Pubblica i messaggi definiti in messages.json, dopo aver rimosso i precedenti messaggi del bot.
     * Ritorna `null` se la sottocategoria richiesta non esiste.
     */
    protected async setupMessages(guild: Guild, subcategory: string | null): Promise<ChannelSetupResult[] | null> {
        const file = this.loadMessagesFile();

        let entries = Object.entries(file);
        if (subcategory) {
            if (!(subcategory in file)) return null;
            entries = [[subcategory, file[subcategory]]];
        }

        const results: ChannelSetupResult[] = [];
        for (const [key, setup] of entries) {
            results.push(await this.setupChannel(guild, key, setup));
        }
        return results;
    }

    /** Svuota il canale dai messaggi del bot e pubblica in sequenza i nuovi, fermandosi al primo errore. */
    protected async setupChannel(guild: Guild, subcategory: string, setup: SetupChannel): Promise<ChannelSetupResult> {
        const result: ChannelSetupResult = { subcategory, deleted: 0, published: 0, total: setup.messages.length };

        try {
            const channelId = await this.settingsManager!.getSetting(setup.settingPath);
            if (!channelId) {
                throw new Error(`configurazione '${setup.settingPath}' non definita`);
            }

            const channel = await guild.channels.fetch(channelId);
            if (!channel || !channel.isTextBased()) {
                throw new Error(`canale ${channelId} non trovato o non testuale`);
            }

            result.deleted = await this.deleteBotMessages(channel);

            // Un messaggio viene pubblicato solo se il precedente è andato a buon fine
            for (const message of setup.messages) {
                await channel.send(await this.buildMessage(message));
                result.published++;
            }
        } catch (error) {
            console.error(`[SetupCommand] Errore durante il setup di "${subcategory}":`, error);
            result.error = error instanceof Error ? error.message : String(error);
        }

        return result;
    }

    /**
     * Rinomina categorie e relativi canali secondo i pattern di decorazione,
     * mantenendo nome identificativo ed emoji di ciascuno.
     */
    protected async setupDecorations(guild: Guild): Promise<DecorationResult[]> {
        const channels = await guild.channels.fetch();
        const categories = [...channels.values()]
            .filter((channel): channel is CategoryChannel => channel?.type === ChannelType.GuildCategory)
            .sort((a, b) => a.rawPosition - b.rawPosition || a.id.localeCompare(b.id));

        const results: DecorationResult[] = [];
        for (const category of categories) {
            results.push(await this.decorate(category, CATEGORY_NAME_PATTERN));

            const children = this.sortByDisplayOrder([...category.children.cache.values()]);
            for (const [index, child] of children.entries()) {
                const pattern = index === children.length - 1 ? LAST_CHANNEL_NAME_PATTERN : CHANNEL_NAME_PATTERN;
                results.push(await this.decorate(child, pattern));
            }
        }
        return results;
    }

    /** Ordina i canali come appaiono nella sidebar di Discord: prima i testuali, poi i vocali. */
    protected sortByDisplayOrder(channels: GuildBasedChannel[]): GuildBasedChannel[] {
        const isVoice = (channel: GuildBasedChannel) =>
            channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice;

        return channels.sort((a, b) =>
            Number(isVoice(a)) - Number(isVoice(b))
            || ('rawPosition' in a && 'rawPosition' in b ? a.rawPosition - b.rawPosition : 0)
            || a.id.localeCompare(b.id),
        );
    }

    /** Rinomina il canale applicando il pattern; ignora i canali senza emoji. */
    protected async decorate(channel: GuildBasedChannel, pattern: string): Promise<DecorationResult> {
        const result: DecorationResult = { oldName: channel.name, status: 'unchanged' };

        const parsed = this.parseDecoratedName(channel.name);
        if (!parsed) {
            result.status = 'skipped';
            result.error = 'emoji o nome identificativo non trovati';
            return result;
        }

        const newName = pattern
            .split('{{emoji}}').join(parsed.emoji)
            .split('{{name}}').join(parsed.name);
        result.newName = newName;
        if (newName === channel.name) return result;

        try {
            await channel.setName(newName, 'Setup decorazioni');
            result.status = 'renamed';
        } catch (error) {
            console.error(`[SetupCommand] Errore durante la rinomina di "${channel.name}":`, error);
            result.status = 'error';
            result.error = error instanceof Error ? error.message : String(error);
        }
        return result;
    }

    /**
     * Estrae emoji e nome identificativo da un nome decorato, es. "┣╸🗣️・formattazione-testo"
     * → { emoji: "🗣️", name: "formattazione-testo" }. L'emoji è la prima presente nel nome; il
     * nome identificativo è ciò che resta rimuovendo le emoji e i caratteri decorativi agli estremi.
     */
    protected parseDecoratedName(fullName: string): { emoji: string; name: string } | null {
        const emoji = fullName.match(EMOJI_REGEX)?.[0];
        if (!emoji) return null;

        const name = fullName
            .replace(EMOJI_REGEX, ' ')
            .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
            .trim();
        if (!name) return null;

        return { emoji, name };
    }

    /** Elimina tutti i messaggi inviati dal bot nel canale, ritornandone il numero. */
    protected async deleteBotMessages(channel: GuildTextBasedChannel): Promise<number> {
        const botId = this.container.client.user!.id;
        const botMessages: Message[] = [];

        let before: string | undefined;
        while (true) {
            const page = await channel.messages.fetch({ limit: 100, before });
            if (page.size === 0) break;
            botMessages.push(...page.filter((message) => message.author.id === botId).values());
            before = page.lastKey();
        }

        // bulkDelete ignora i messaggi più vecchi di 14 giorni, che vanno eliminati singolarmente
        for (const message of botMessages) {
            await message.delete();
        }

        return botMessages.length;
    }

    /** Costruisce il payload del messaggio secondo la definizione di messages.json. */
    protected async buildMessage(message: SetupMessage): Promise<MessageCreateOptions> {
        const payload: MessageCreateOptions = {};
        const content = message.content ? this.loadContent(message.content) : '';

        if (message.type === 'embed') {
            const embed = new EmbedBuilder();
            if (message.embedTitle) embed.setTitle(message.embedTitle);
            if (content) embed.setDescription(content);

            const color = await this.resolveColor(message.embedColor);
            if (color) embed.setColor(color);

            payload.embeds = [embed];
        } else if (content) {
            payload.content = content;
        }

        if (message.image) {
            payload.files = [message.image];
        }

        if (message.buttons.length > 0) {
            payload.components = this.buildButtonRows(message.buttons);
        }

        return payload;
    }

    /** Risolve il colore dalla configurazione `general/colors/<name>`. */
    protected async resolveColor(name: string): Promise<ColorResolvable | null> {
        if (!name) return null;

        const color = await this.settingsManager!.getSetting(`general/colors/${name}`);
        if (!color) {
            console.warn(`[SetupCommand] Colore 'general/colors/${name}' non definito, embed senza colore.`);
            return null;
        }
        return color as ColorResolvable;
    }

    /** Distribuisce i pulsanti su più righe, massimo 5 per riga come da limiti Discord. */
    protected buildButtonRows(buttons: SetupButton[]): ActionRowBuilder<ButtonBuilder>[] {
        const rows: ActionRowBuilder<ButtonBuilder>[] = [];

        for (let i = 0; i < buttons.length; i += 5) {
            const row = new ActionRowBuilder<ButtonBuilder>();
            for (const button of buttons.slice(i, i + 5)) {
                switch (button.type) {
                    case 'link':
                        row.addComponents(
                            new ButtonBuilder()
                                .setStyle(ButtonStyle.Link)
                                .setLabel(button.label)
                                .setURL(button.url),
                        );
                        break;
                    case 'modal':
                    case 'action': {
                        if (!button.id) {
                            throw new Error(`il pulsante "${button.label}" di tipo ${button.type} non ha un id`);
                        }
                        const style = BUTTON_STYLES[button.style ?? 'primary'];
                        if (style === undefined) {
                            throw new Error(`stile "${button.style}" del pulsante "${button.label}" non supportato`);
                        }
                        row.addComponents(
                            new ButtonBuilder()
                                .setStyle(style)
                                .setLabel(button.label)
                                .setCustomId(button.id),
                        );
                        break;
                    }
                    default:
                        throw new Error(`tipo di pulsante "${(button as { type: string }).type}" non supportato`);
                }
            }
            rows.push(row);
        }

        return rows;
    }

    protected loadMessagesFile(): SetupMessagesFile {
        return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf-8'));
    }

    protected loadContent(file: string): string {
        return fs.readFileSync(path.join(CONTENT_DIR, file), 'utf-8').trim();
    }

    /** Riepilogo delle decorazioni: conteggi e dettaglio dei soli canali non rinominati con successo. */
    protected formatDecorationsReport(results: DecorationResult[]): string {
        const count = (status: DecorationResult['status']) => results.filter((r) => r.status === status).length;
        const lines = [
            'Setup delle decorazioni completato.',
            `✅ rinominati: ${count('renamed')} — invariati: ${count('unchanged')} — ignorati: ${count('skipped')} — errori: ${count('error')}`,
            ...results
                .filter((r) => r.status === 'skipped' || r.status === 'error')
                .map((r) => `${r.status === 'error' ? '❌' : '⚠️'} **${r.oldName}** — ${r.error}`),
        ];

        // Limite di 2000 caratteri per messaggio
        let report = lines.join('\n');
        if (report.length > 2000) report = report.slice(0, 1997) + '...';
        return report;
    }

    /** Riepilogo del setup, una riga per canale. */
    protected formatMessagesReport(results: ChannelSetupResult[]): string {
        const lines = results.map((result) => {
            const status = result.error ? '❌' : '✅';
            const detail = `messaggi eliminati: ${result.deleted}, pubblicati: ${result.published}/${result.total}`;
            return `${status} **${result.subcategory}** — ${detail}${result.error ? ` (${result.error})` : ''}`;
        });
        return [`Setup dei messaggi completato.`, ...lines].join('\n');
    }
}
