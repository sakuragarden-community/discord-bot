import "reflect-metadata";
import { Listener } from '@sapphire/framework';
import { EmbedBuilder, ChannelType, ThreadChannel } from 'discord.js';
import { autoInjectable } from 'tsyringe';
import { ConfigManager } from '../../managers/ConfigManager';

@autoInjectable()
export class TopActivitiesListener extends Listener {
    public constructor(
        context: Listener.LoaderContext,
        options: Listener.Options,
        protected configManager?: ConfigManager,
    ) {
        super(context, {
            ...options,
            event: 'threadCreate'
        });
    }

    public override async run(thread: ThreadChannel) {
        try {
            // Ignora thread senza guild
            if (!thread.guild) return;

            const galleriesId = this.configManager?.getGalleriesChannelId();
            const topId = this.configManager?.getTopChannelId();
            if (!galleriesId || !topId) return;

            // Verifica che il parent sia il forum "galleries"
            const parent = thread.parent;
            if (!parent || parent.type !== ChannelType.GuildForum) return;
            if (parent.id !== galleriesId) return; // Non è nel forum "galleries"

            // Recupera titolo del topic e link diretto
            const topicTitle = thread.name ?? 'Raccolta senza titolo';
            const topicUrl = (thread as any).url ?? `https://discord.com/channels/${thread.guild.id}/${thread.id}`;

            const opener = thread.ownerId ? `<@${thread.ownerId}>` : 'Qualcuno';

            // Recupera avatar dell'autore per usarlo come icona nell'embed
            let authorName = 'Autore';
            let authorIcon: string | undefined = undefined;
            if (thread.ownerId) {
                try {
                    const user = await thread.client.users.fetch(thread.ownerId);
                    authorName = (user as any)?.tag ?? (user as any)?.username ?? authorName;
                    authorIcon = (user as any)?.displayAvatarURL?.({ size: 128 }) ?? undefined;
                } catch {}
            }

            // Prepara embed
            const embed = new EmbedBuilder()
                .setTitle("📸 E' stata creata una nuova raccolta di foto!")
                .setColor(this.configManager?.getBlueColor() ?? 0x7EBDC3)
                .setDescription(`${opener} ha aperto la raccolta intitolato **"${topicTitle}"**, vai a vedere cosa si tratta e partecipa!\n[Clicca qui per aprire la raccolta.](${topicUrl})`)
                .setAuthor({ name: authorName, iconURL: authorIcon });

            // Pubblica una notifica nel canale "top" (testuale normale) inviando direttamente l'embed
            const topChannel = await thread.client.channels.fetch(topId);
            if (!topChannel) return;
            const anyTop = topChannel as any;
            if (typeof anyTop.isTextBased === 'function' && anyTop.isTextBased() && 'send' in anyTop) {
                await anyTop.send({ embeds: [embed] });
            }
        } catch (e) {
            console.error('TopActivitiesListener error:', e);
        }
    }
}
