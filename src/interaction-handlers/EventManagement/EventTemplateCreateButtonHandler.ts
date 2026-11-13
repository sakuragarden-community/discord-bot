import "reflect-metadata";
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ButtonInteraction, MessageFlags } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { Event, EventManager } from '../../managers/EventManager';
import {
    EVENT_TEMPLATE_CREATE_BUTTON_ID,
    isAdministrator,
    NO_PERMISSION_MESSAGE,
    SELECT_MAX_OPTIONS,
} from '../../utils/EventManagement';
import { buildEventTemplateModal } from '../../utils/EventManagementModals';

/**
 * Apre il primo passo della creazione di un template evento, con gli eventi caricati dalle API.
 * Riservato agli amministratori.
 */
@autoInjectable()
export class EventTemplateCreateButtonHandler extends InteractionHandler {

    public constructor(
        context: InteractionHandler.LoaderContext,
        options: InteractionHandler.Options,
        protected eventManager?: EventManager,
    ) {
        super(context, {
            ...options,
            interactionHandlerType: InteractionHandlerTypes.Button,
        });
    }

    public override parse(interaction: ButtonInteraction) {
        return interaction.customId === EVENT_TEMPLATE_CREATE_BUTTON_ID ? this.some() : this.none();
    }

    public override async run(interaction: ButtonInteraction) {
        if (!isAdministrator(interaction)) {
            await interaction.reply({ content: NO_PERMISSION_MESSAGE, flags: MessageFlags.Ephemeral });
            return;
        }

        let events: Event[];
        try {
            events = await this.eventManager!.listAll({ sort: 'name,asc' });
        } catch (error) {
            console.error('[EventTemplateCreateButtonHandler] Errore durante il caricamento degli eventi:', error);
            await interaction.reply({ content: '❌ Non è stato possibile caricare gli eventi, riprova più tardi.', flags: MessageFlags.Ephemeral });
            return;
        }

        if (events.length === 0) {
            await interaction.reply({ content: '❌ Non è presente nessun evento: premi prima "Crea Evento".', flags: MessageFlags.Ephemeral });
            return;
        }
        if (events.length > SELECT_MAX_OPTIONS) {
            console.warn(`[EventTemplateCreateButtonHandler] ${events.length} eventi presenti, mostrati solo i primi ${SELECT_MAX_OPTIONS}.`);
        }

        await interaction.showModal(buildEventTemplateModal(events));
    }
}
