import "reflect-metadata";
import { Listener } from '@sapphire/framework';
import { VoiceState } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { SettingsManager } from '../../managers/SettingsManager';
import { deleteVoiceRoomIfEmpty, fetchVoicesCategoryId, isVoiceRoom } from '../../utils/CreateVoice';

/** Elimina le stanze vocali create dal pulsante del canale createVoice quando si svuotano. */
@autoInjectable()
export class DeleteEmptyVoiceListener extends Listener {

    public constructor(
        context: Listener.LoaderContext,
        options: Listener.Options,
        protected settingsManager?: SettingsManager,
    ) {
        super(context, {
            ...options,
            event: 'voiceStateUpdate',
        });
    }

    public override async run(oldState: VoiceState, newState: VoiceState) {
        try {
            const leftChannel = oldState.channel;
            if (!leftChannel || oldState.channelId === newState.channelId) return;

            const categoryId = await fetchVoicesCategoryId(this.settingsManager!);
            if (!isVoiceRoom(leftChannel, categoryId)) return;

            await deleteVoiceRoomIfEmpty(leftChannel);
        } catch (error) {
            console.error('[DeleteEmptyVoiceListener] Errore durante l\'eliminazione della stanza vuota:', error);
        }
    }
}
