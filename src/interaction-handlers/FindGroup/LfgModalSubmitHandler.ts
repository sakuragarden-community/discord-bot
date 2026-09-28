import "reflect-metadata";
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import {
    EmbedBuilder,
    MessageFlags,
    ModalSubmitInteraction,
    roleMention,
    ThreadAutoArchiveDuration,
    User,
} from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { SettingsManager } from '../../managers/SettingsManager';
import {
    activeAnnouncementError,
    fetchFindGroupChannel,
    findActiveAnnouncement,
    LFG_DESCRIPTION_INPUT_ID,
    LFG_GAME_INPUT_ID,
    LFG_GAMES,
    LFG_GAMES_REASON,
    LFG_MODAL_ID,
    LFG_REASON_INPUT_ID,
    LFG_REASONS,
} from '../../utils/FindGroup';

/** Lunghezza massima del nome di un thread consentita da Discord. */
const THREAD_NAME_MAX_LENGTH = 100;

/** Dati inseriti nella modale, già risolti nelle label da mostrare. */
interface LfgAnnouncement {
    reason: string;
    /** Gioco scelto, `null` se il motivo non è la ricerca di giocatori. */
    game: string | null;
    /** ID del ruolo da taggare nel messaggio: quello del gioco, o quello associato al motivo. */
    roleId: string;
    description: string;
}

/** Pubblica l'annuncio di ricerca gruppo nel canale find_group, con il relativo thread di discussione. */
@autoInjectable()
export class LfgModalSubmitHandler extends InteractionHandler {

    public constructor(
        context: InteractionHandler.LoaderContext,
        options: InteractionHandler.Options,
        protected settingsManager?: SettingsManager,
    ) {
        super(context, {
            ...options,
            interactionHandlerType: InteractionHandlerTypes.ModalSubmit,
        });
    }

    public override parse(interaction: ModalSubmitInteraction) {
        return interaction.customId === LFG_MODAL_ID ? this.some() : this.none();
    }

    public override async run(interaction: ModalSubmitInteraction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const announcement = this.readAnnouncement(interaction);
            if (!announcement) {
                await interaction.editReply(
                    '❌ L\'annuncio non è stato creato perché stai cercando giocatori ma non hai selezionato nessun titolo di gioco. '
                    + 'Riprova scegliendo il gioco per cui cerchi persone.',
                );
                return;
            }

            const channel = await fetchFindGroupChannel(this.settingsManager!);
            const author = interaction.user;

            // Verifica ripetuta all'invio: la modale potrebbe essere stata aperta più volte prima di pubblicare
            const activeAnnouncement = await findActiveAnnouncement(channel, author.id);
            if (activeAnnouncement) {
                await interaction.editReply(activeAnnouncementError(activeAnnouncement));
                return;
            }

            const message = await channel.send({
                content: `${author} ha creato un nuovo annuncio per ${roleMention(announcement.roleId)}!`,
                embeds: [await this.buildEmbed(author, announcement)],
                allowedMentions: { users: [author.id], roles: [announcement.roleId] },
            });

            // Il thread nasce dal messaggio dell'annuncio, così la pulizia periodica può rimuoverli insieme
            const thread = await message.startThread({
                name: this.buildThreadName(author, announcement),
                autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
            });

            await interaction.editReply(`✅ Annuncio pubblicato! Puoi seguire la discussione qui: ${thread}`);
        } catch (error) {
            console.error('[LfgModalSubmitHandler] Errore durante la pubblicazione dell\'annuncio:', error);
            await interaction.editReply('❌ Non è stato possibile pubblicare l\'annuncio, riprova più tardi.');
        }
    }

    /** Legge i dati della modale; ritorna `null` se si cercano giocatori senza aver scelto un gioco. */
    protected readAnnouncement(interaction: ModalSubmitInteraction): LfgAnnouncement | null {
        const [reasonValue] = interaction.fields.getStringSelectValues(LFG_REASON_INPUT_ID);
        const [gameValue] = interaction.fields.getStringSelectValues(LFG_GAME_INPUT_ID);

        const reason = LFG_REASONS.find(({ value }) => value === reasonValue);
        if (!reason) {
            throw new Error(`motivo "${reasonValue}" non valido`);
        }

        const description = interaction.fields.getTextInputValue(LFG_DESCRIPTION_INPUT_ID).trim();

        // Il gioco è rilevante solo se si cercano giocatori, e in quel caso è obbligatorio
        if (reason.value !== LFG_GAMES_REASON) {
            return { reason: reason.label, game: null, roleId: reason.topic!, description };
        }

        const game = LFG_GAMES.find(({ value }) => value === gameValue && value !== 'none');
        if (!game) return null;

        return { reason: reason.label, game: game.label, roleId: game.role!, description };
    }

    protected async buildEmbed(author: User, announcement: LfgAnnouncement): Promise<EmbedBuilder> {
        const embed = new EmbedBuilder()
            .setColor(await this.settingsManager!.getPrimaryColor())
            .setTitle(`Annuncio di ${author.username}`)
            .setThumbnail(author.displayAvatarURL({ size: 256 }))
            .addFields({ name: 'Motivo', value: announcement.reason });

        if (announcement.game) {
            embed.addFields({ name: 'Gioco', value: announcement.game });
        }

        return embed
            .addFields({ name: 'Descrizione', value: announcement.description })
            .setTimestamp();
    }

    protected buildThreadName(author: User, announcement: LfgAnnouncement): string {
        const parts = [`Annuncio di ${author.username}`, announcement.reason];
        if (announcement.game) parts.push(announcement.game);

        const name = parts.join(' - ');
        return name.length > THREAD_NAME_MAX_LENGTH ? `${name.slice(0, THREAD_NAME_MAX_LENGTH - 1)}…` : name;
    }
}
