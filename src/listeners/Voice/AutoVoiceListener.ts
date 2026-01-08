import "reflect-metadata";
import { autoInjectable } from "tsyringe";
import { Listener } from '@sapphire/framework';
import { ChannelType, GuildBasedChannel, VoiceState } from "discord.js";
import { ConfigManager } from "../../managers/ConfigManager";

@autoInjectable()
export class AutoVoiceListener extends Listener {

    public constructor(
        context: Listener.LoaderContext,
        options: Listener.Options,
        protected configManager?: ConfigManager,
    ) {
        super(context, {
            ...options,
            event: 'voiceStateUpdate'
        });
    }

    public override async run(oldState: VoiceState, newState: VoiceState) {
        try {
            // CREATE: User joined the trigger channel
            const triggerChannelId = this.configManager?.getVocalTriggerChannelId();
            const voicesCategoryId = this.configManager?.getVoicesCategoryId();

            // When member joins the trigger channel
            if (triggerChannelId && voicesCategoryId && newState.channelId === triggerChannelId && oldState.channelId !== newState.channelId) {
                const guild = newState.guild;

                // Create the private voice channel under the configured category
                const channelName = `》☕・Stanza di ${newState.member?.displayName ?? newState.member?.user.username ?? 'Utente'}`;

                const created = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildVoice,
                    parent: voicesCategoryId,
                    userLimit: (this.configManager?.getVoiceMaxUsers?.() ?? 10),
                    reason: `Auto voice: richiesta da ${newState.member?.user.tag}`
                });

                // Move the member to the newly created channel
                await newState.member?.voice.setChannel(created);
            }

            // CLEANUP: User left a channel; if it's an auto-created room and now empty, delete it
            const leftChannel = oldState.channel;
            if (leftChannel && leftChannel.type === ChannelType.GuildVoice) {
                const name = leftChannel.name || '';
                const isAutoRoom = name.includes('Stanza di');
                const isTrigger = leftChannel.id === triggerChannelId;
                if (isAutoRoom && !isTrigger && leftChannel.members.size === 0) {
                    // Ensure it's under the voices category (extra safety)
                    if (!voicesCategoryId || (leftChannel.parentId === voicesCategoryId)) {
                        try {
                            await leftChannel.delete("Auto voice cleanup: canale vuoto");
                        } catch (e) {
                            // ignore deletion errors
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[AutoVoiceListener] Errore durante la gestione di voiceStateUpdate:', error);
        }
    }
}
