import "reflect-metadata";
import { Command } from '@sapphire/framework';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    ColorResolvable,
    EmbedBuilder,
    Guild,
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

/** Pulsante da inserire come interactive component del messaggio. */
interface SetupButton {
    type: 'link';
    label: string;
    url: string;
}

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
                        .addChoices({ name: 'messages', value: 'messages' }),
                )
                .addStringOption((option) =>
                    option
                        .setName('subcategory')
                        .setDescription('Limita il setup a una sola sottocategoria (es. il canale di messages.json)')
                        .setRequired(false)
                        .setAutocomplete(true),
                ),
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
