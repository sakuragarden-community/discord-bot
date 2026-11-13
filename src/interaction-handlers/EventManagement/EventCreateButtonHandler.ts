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
import { Section, SectionManager } from '../../managers/SectionManager';
import {
    EVENT_CREATE_BUTTON_ID,
    EVENT_CREATE_MODAL_ID,
    EVENT_INTEREST_INPUT_ID,
    EVENT_IS_OPEN_INPUT_ID,
    EVENT_MAX_PARTICIPANTS_INPUT_ID,
    EVENT_NAME_INPUT_ID,
    EVENT_SECTION_INPUT_ID,
    isAdministrator,
    NO_PERMISSION_MESSAGE,
    SELECT_MAX_OPTIONS,
    truncate,
    DISCORD_LIMITS,
} from '../../utils/EventManagement';

/** Apre la modale di creazione di un evento, con le sezioni caricate dalle API. Riservato agli amministratori. */
@autoInjectable()
export class EventCreateButtonHandler extends InteractionHandler {

    public constructor(
        context: InteractionHandler.LoaderContext,
        options: InteractionHandler.Options,
        protected sectionManager?: SectionManager,
    ) {
        super(context, {
            ...options,
            interactionHandlerType: InteractionHandlerTypes.Button,
        });
    }

    public override parse(interaction: ButtonInteraction) {
        return interaction.customId === EVENT_CREATE_BUTTON_ID ? this.some() : this.none();
    }

    public override async run(interaction: ButtonInteraction) {
        if (!isAdministrator(interaction)) {
            await interaction.reply({ content: NO_PERMISSION_MESSAGE, flags: MessageFlags.Ephemeral });
            return;
        }

        let sections: Section[];
        try {
            sections = await this.sectionManager!.listAll({ sort: 'name,asc' });
        } catch (error) {
            console.error('[EventCreateButtonHandler] Errore durante il caricamento delle sezioni:', error);
            await interaction.reply({ content: '❌ Non è stato possibile caricare le sezioni, riprova più tardi.', flags: MessageFlags.Ephemeral });
            return;
        }

        if (sections.length === 0) {
            await interaction.reply({ content: '❌ Non è presente nessuna sezione: creane almeno una prima di creare un evento.', flags: MessageFlags.Ephemeral });
            return;
        }
        if (sections.length > SELECT_MAX_OPTIONS) {
            console.warn(`[EventCreateButtonHandler] ${sections.length} sezioni presenti, mostrate solo le prime ${SELECT_MAX_OPTIONS}.`);
        }

        await interaction.showModal(this.buildModal(sections.slice(0, SELECT_MAX_OPTIONS)));
    }

    protected buildModal(sections: Section[]): ModalBuilder {
        const name = new TextInputBuilder()
            .setCustomId(EVENT_NAME_INPUT_ID)
            .setStyle(TextInputStyle.Short)
            .setMaxLength(100)
            .setRequired(true);

        const section = new StringSelectMenuBuilder()
            .setCustomId(EVENT_SECTION_INPUT_ID)
            .setRequired(true)
            .addOptions(sections.map(({ id, name }) => ({
                value: String(id),
                label: truncate(name, DISCORD_LIMITS.selectLabel),
            })));

        // In futuro diventerà una select dei ruoli
        const interest = new TextInputBuilder()
            .setCustomId(EVENT_INTEREST_INPUT_ID)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Es. 1321813930842001468')
            .setMaxLength(32)
            .setRequired(true);

        const maxParticipants = new TextInputBuilder()
            .setCustomId(EVENT_MAX_PARTICIPANTS_INPUT_ID)
            .setStyle(TextInputStyle.Short)
            .setValue('0')
            .setMaxLength(4)
            .setRequired(true);

        const isOpen = new StringSelectMenuBuilder()
            .setCustomId(EVENT_IS_OPEN_INPUT_ID)
            .setRequired(true)
            .addOptions(
                { value: 'yes', label: 'Sì', description: 'Partecipazione libera', emoji: '✅', default: true },
                { value: 'no', label: 'No', description: 'Iscrizione richiesta', emoji: '🔒' },
            );

        return new ModalBuilder()
            .setCustomId(EVENT_CREATE_MODAL_ID)
            .setTitle('Crea Evento')
            .addLabelComponents(
                new LabelBuilder().setLabel('Nome').setTextInputComponent(name),
                new LabelBuilder().setLabel('Sezione').setStringSelectMenuComponent(section),
                new LabelBuilder()
                    .setLabel('Interesse')
                    .setDescription('ID del ruolo Discord di riferimento')
                    .setTextInputComponent(interest),
                new LabelBuilder()
                    .setLabel('Numero di partecipanti')
                    .setDescription('Numero massimo di persone, 0 per nessun limite')
                    .setTextInputComponent(maxParticipants),
                new LabelBuilder()
                    .setLabel('Evento aperto')
                    .setDescription('"No" se l\'evento richiede delle iscrizioni')
                    .setStringSelectMenuComponent(isOpen),
            );
    }
}
