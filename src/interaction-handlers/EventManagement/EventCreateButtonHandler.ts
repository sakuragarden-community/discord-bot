import "reflect-metadata";
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ButtonInteraction, MessageFlags } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { Section, SectionManager } from '../../managers/SectionManager';
import {
    EVENT_CREATE_BUTTON_ID,
    isAdministrator,
    NO_PERMISSION_MESSAGE,
    SELECT_MAX_OPTIONS,
} from '../../utils/EventManagement';
import { buildEventModal } from '../../utils/EventManagementModals';

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

        await interaction.showModal(buildEventModal(sections));
    }
}
