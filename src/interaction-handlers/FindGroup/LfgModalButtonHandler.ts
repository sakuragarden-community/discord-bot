import "reflect-metadata";
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import {
    ButtonInteraction,
    LabelBuilder,
    MessageFlags,
    ModalBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
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
    LFG_MODAL_BUTTON_PREFIX,
    LFG_MODAL_PREFIX,
    LfgReason,
    parseLfgReason,
} from '../../utils/FindGroup';

/**
 * Apre la modale per la creazione di un annuncio di ricerca gruppo al click di uno dei pulsanti dedicati,
 * uno per motivo, a meno che l'utente non abbia già un annuncio attivo.
 */
@autoInjectable()
export class LfgModalButtonHandler extends InteractionHandler {

    public constructor(
        context: InteractionHandler.LoaderContext,
        options: InteractionHandler.Options,
        protected settingsManager?: SettingsManager,
    ) {
        super(context, {
            ...options,
            interactionHandlerType: InteractionHandlerTypes.Button,
        });
    }

    public override parse(interaction: ButtonInteraction) {
        const reason = parseLfgReason(interaction.customId, LFG_MODAL_BUTTON_PREFIX);
        return reason ? this.some(reason) : this.none();
    }

    public override async run(interaction: ButtonInteraction, reason: LfgReason) {
        try {
            const channel = await fetchFindGroupChannel(this.settingsManager!);
            const announcement = await findActiveAnnouncement(channel, interaction.user.id);
            if (announcement) {
                await interaction.reply({ content: activeAnnouncementError(announcement), flags: MessageFlags.Ephemeral });
                return;
            }
        } catch (error) {
            console.error('[LfgModalButtonHandler] Errore durante la verifica degli annunci attivi:', error);
            await interaction.reply({ content: '❌ Non è stato possibile aprire il modulo, riprova più tardi.', flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.showModal(this.buildModal(reason));
    }

    /** La modale chiede sempre la descrizione; solo chi cerca giocatori deve anche scegliere il gioco. */
    protected buildModal(reason: LfgReason): ModalBuilder {
        const description = new TextInputBuilder()
            .setCustomId(LFG_DESCRIPTION_INPUT_ID)
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(300)
            .setRequired(true);

        const labels: LabelBuilder[] = [];

        if (reason.value === LFG_GAMES_REASON) {
            // "Nessun gioco selezionato" è preselezionato: se non viene cambiato, l'invio restituisce un errore
            const game = new StringSelectMenuBuilder()
                .setCustomId(LFG_GAME_INPUT_ID)
                .setRequired(true)
                .addOptions(LFG_GAMES.map(({ value, label }) => ({ value, label, default: value === 'none' })));

            labels.push(
                new LabelBuilder()
                    .setLabel('Gioco')
                    .setDescription('Scegli per quale gioco stai cercando persone')
                    .setStringSelectMenuComponent(game),
            );
        }

        labels.push(
            new LabelBuilder()
                .setLabel('Descrivi il tuo annuncio')
                .setTextInputComponent(description),
        );

        // Il titolo è limitato a 45 caratteri, entro cui rientrano le label dei motivi
        return new ModalBuilder()
            .setCustomId(`${LFG_MODAL_PREFIX}${reason.value}`)
            .setTitle(reason.label)
            .addLabelComponents(...labels);
    }
}
