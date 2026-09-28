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
    LFG_MODAL_BUTTON_ID,
    LFG_MODAL_ID,
    LFG_REASON_INPUT_ID,
    LFG_REASONS,
} from '../../utils/FindGroup';

/**
 * Apre la modale per la creazione di un annuncio di ricerca gruppo al click del pulsante dedicato,
 * a meno che l'utente non abbia già un annuncio attivo.
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
        return interaction.customId === LFG_MODAL_BUTTON_ID ? this.some() : this.none();
    }

    public override async run(interaction: ButtonInteraction) {
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

        await interaction.showModal(this.buildModal());
    }

    protected buildModal(): ModalBuilder {
        const reason = new StringSelectMenuBuilder()
            .setCustomId(LFG_REASON_INPUT_ID)
            .setRequired(true)
            .addOptions(LFG_REASONS.map(({ value, label }) => ({ value, label })));

        // "Nessun gioco selezionato" è preselezionato, così chi non cerca giocatori può ignorare il campo
        const game = new StringSelectMenuBuilder()
            .setCustomId(LFG_GAME_INPUT_ID)
            .setRequired(true)
            .addOptions(LFG_GAMES.map(({ value, label }) => ({ value, label, default: value === 'none' })));

        const description = new TextInputBuilder()
            .setCustomId(LFG_DESCRIPTION_INPUT_ID)
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(300)
            .setRequired(true);

        // Le label sono limitate a 45 caratteri: il testo completo va nella description (massimo 100)
        return new ModalBuilder()
            .setCustomId(LFG_MODAL_ID)
            .setTitle('Cerca Gruppo')
            .addLabelComponents(
                new LabelBuilder()
                    .setLabel("Motivo dell'annuncio")
                    .setDescription('Per quale motivo stai creando questo annuncio?')
                    .setStringSelectMenuComponent(reason),
                new LabelBuilder()
                    .setLabel('Gioco')
                    .setDescription("Se hai selezionato l'ultima voce, scegli per quale gioco stai cercando persone")
                    .setStringSelectMenuComponent(game),
                new LabelBuilder()
                    .setLabel('Descrivi il tuo annuncio')
                    .setTextInputComponent(description),
            );
    }
}
