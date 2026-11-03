import "reflect-metadata";
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import { ButtonInteraction, MessageFlags } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { SettingsManager } from '../../managers/SettingsManager';
import {
    deleteAnnouncement,
    fetchFindGroupChannel,
    findActiveAnnouncement,
    LFG_DELETE_BUTTON_ID,
} from '../../utils/FindGroup';

/** Elimina l'annuncio attivo dell'utente, insieme al suo thread, al click del pulsante dedicato. */
@autoInjectable()
export class LfgDeleteButtonHandler extends InteractionHandler {

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
        return interaction.customId === LFG_DELETE_BUTTON_ID ? this.some() : this.none();
    }

    public override async run(interaction: ButtonInteraction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const channel = await fetchFindGroupChannel(this.settingsManager!);
            const announcement = await findActiveAnnouncement(channel, interaction.user.id);
            if (!announcement) {
                await interaction.editReply('❌ Non hai nessun annuncio attivo da eliminare.');
                return;
            }

            await deleteAnnouncement(announcement);
            await interaction.editReply('✅ Il tuo annuncio è stato eliminato.');
        } catch (error) {
            console.error('[LfgDeleteButtonHandler] Errore durante l\'eliminazione dell\'annuncio:', error);
            await interaction.editReply('❌ Non è stato possibile eliminare l\'annuncio, riprova più tardi.');
        }
    }
}
