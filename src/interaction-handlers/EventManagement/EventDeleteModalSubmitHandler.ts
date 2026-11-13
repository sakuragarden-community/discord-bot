import "reflect-metadata";
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { MessageFlags, ModalSubmitInteraction } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { KodamaApiError } from '../../managers/ApiManager';
import { Event, EventManager } from '../../managers/EventManager';
import {
    EVENT_DELETE_SELECT_MODAL_ID,
    EVENT_SELECT_INPUT_ID,
    isAdministrator,
    NO_PERMISSION_MESSAGE,
} from '../../utils/EventManagement';

/** Cancella tramite le API l'evento scelto in "Cancella Evento". */
@autoInjectable()
export class EventDeleteModalSubmitHandler extends InteractionHandler {

    public constructor(
        context: InteractionHandler.LoaderContext,
        options: InteractionHandler.Options,
        protected eventManager?: EventManager,
    ) {
        super(context, {
            ...options,
            interactionHandlerType: InteractionHandlerTypes.ModalSubmit,
        });
    }

    public override parse(interaction: ModalSubmitInteraction) {
        return interaction.customId === EVENT_DELETE_SELECT_MODAL_ID ? this.some() : this.none();
    }

    public override async run(interaction: ModalSubmitInteraction) {
        if (!isAdministrator(interaction)) {
            await interaction.reply({ content: NO_PERMISSION_MESSAGE, flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const [eventValue] = interaction.fields.getStringSelectValues(EVENT_SELECT_INPUT_ID);

        let event: Event | undefined;
        try {
            // Il nome serve solo per il messaggio di conferma
            event = await this.eventManager!.getById(Number(eventValue));
            await this.eventManager!.delete(event.id);

            await interaction.editReply(`🗑️ Evento **${event.name}** cancellato.`);
        } catch (error) {
            console.error(`[EventDeleteModalSubmitHandler] Errore durante la cancellazione dell'evento ${eventValue}:`, error);
            await interaction.editReply(this.describeError(error, event));
        }
    }

    protected describeError(error: unknown, event: Event | undefined): string {
        if (error instanceof KodamaApiError && error.status === 409) {
            return `❌ L'evento **${event?.name}** ha ancora dei template: cancellali prima con "Cancella Template Evento".`;
        }
        if (error instanceof KodamaApiError && error.status === 404) {
            return '❌ L\'evento non esiste più: potrebbe essere già stato cancellato.';
        }
        return '❌ Non è stato possibile cancellare l\'evento, riprova più tardi.';
    }
}
