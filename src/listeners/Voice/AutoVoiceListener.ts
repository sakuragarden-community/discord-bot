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
            const triggerNsfwChannelId = this.configManager?.getNsfwVocalTriggerChannelId();
            const triggerFocusChannelId = this.configManager?.getFocusVocalTriggerChannelId();
            const voicesCategoryId = this.configManager?.getVoicesCategoryId();

            // When member joins any trigger channel
            const joinedATrigger = (
                !!voicesCategoryId && (
                    (triggerChannelId && newState.channelId === triggerChannelId) ||
                    (triggerNsfwChannelId && newState.channelId === triggerNsfwChannelId) ||
                    (triggerFocusChannelId && newState.channelId === triggerFocusChannelId)
                ) && (oldState.channelId !== newState.channelId)
            );

            if (joinedATrigger) {
                const guild = newState.guild;

                // Decide prefix and user limit based on which trigger was used
                let prefix = '》☕・Stanza di ';
                let userLimit = (this.configManager?.getVoiceMaxUsers?.() ?? 10);

                if (triggerNsfwChannelId && newState.channelId === triggerNsfwChannelId) {
                    prefix = '》🔞・Stanza di ';
                } else if (triggerFocusChannelId && newState.channelId === triggerFocusChannelId) {
                    prefix = '》⚡・Stanza di ';
                    userLimit = (this.configManager?.getVoiceMaxUsersFocus?.() ?? userLimit);
                }

                // Create the private voice channel under the configured category
                const channelName = `${prefix}${newState.member?.displayName ?? newState.member?.user.username ?? 'Utente'}`;

                const created = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildVoice,
                    parent: voicesCategoryId!,
                    userLimit,
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
                const isTrigger = [triggerChannelId, triggerNsfwChannelId, triggerFocusChannelId].includes(leftChannel.id);
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
