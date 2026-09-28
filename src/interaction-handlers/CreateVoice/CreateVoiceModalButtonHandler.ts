import "reflect-metadata";
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import {
    ButtonInteraction,
    LabelBuilder,
    MessageFlags,
    ModalBuilder,
    StringSelectMenuBuilder,
} from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { SettingsManager } from '../../managers/SettingsManager';
import {
    CREATE_VOICE_LIMIT_INPUT_ID,
    CREATE_VOICE_MODAL_BUTTON_ID,
    CREATE_VOICE_MODAL_ID,
    CREATE_VOICE_TYPE_INPUT_ID,
    emptyVoiceRoomError,
    fetchVoicesCategoryId,
    findEmptyVoiceRooms,
    VOICE_MAX_USERS,
    VOICE_MIN_USERS,
    VOICE_TYPES,
} from '../../utils/CreateVoice';

/**
 * Apre la modale per la creazione di una stanza vocale al click del pulsante dedicato,
 * a meno che l'utente non abbia già una stanza vuota.
 */
@autoInjectable()
export class CreateVoiceModalButtonHandler extends InteractionHandler {

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
        return interaction.customId === CREATE_VOICE_MODAL_BUTTON_ID ? this.some() : this.none();
    }

    public override async run(interaction: ButtonInteraction) {
        if (!interaction.inCachedGuild()) return;

        try {
            const categoryId = await fetchVoicesCategoryId(this.settingsManager!);
            const [room] = findEmptyVoiceRooms(interaction.guild, categoryId, interaction.user.username);
            if (room) {
                await interaction.reply({ content: emptyVoiceRoomError(room), flags: MessageFlags.Ephemeral });
                return;
            }
        } catch (error) {
            console.error('[CreateVoiceModalButtonHandler] Errore durante la verifica delle stanze vuote:', error);
            await interaction.reply({ content: '❌ Non è stato possibile aprire il modulo, riprova più tardi.', flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.showModal(this.buildModal());
    }

    protected buildModal(): ModalBuilder {
        const type = new StringSelectMenuBuilder()
            .setCustomId(CREATE_VOICE_TYPE_INPUT_ID)
            .setRequired(true)
            .addOptions(VOICE_TYPES.map(({ value, label, emoji }) => ({ value, label, emoji })));

        // Da VOICE_MAX_USERS (preselezionato) a scendere fino a VOICE_MIN_USERS
        const limits = Array.from({ length: VOICE_MAX_USERS - VOICE_MIN_USERS + 1 }, (_, i) => VOICE_MAX_USERS - i);
        const limit = new StringSelectMenuBuilder()
            .setCustomId(CREATE_VOICE_LIMIT_INPUT_ID)
            .setRequired(true)
            .addOptions(limits.map((value) => ({
                value: String(value),
                label: String(value),
                default: value === VOICE_MAX_USERS,
            })));

        return new ModalBuilder()
            .setCustomId(CREATE_VOICE_MODAL_ID)
            .setTitle('Crea la tua vocale')
            .addLabelComponents(
                new LabelBuilder()
                    .setLabel('Seleziona il tipo di vocale')
                    .setStringSelectMenuComponent(type),
                new LabelBuilder()
                    .setLabel('Numero massimo di persone')
                    .setStringSelectMenuComponent(limit),
            );
    }
}
