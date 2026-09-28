import "reflect-metadata";
import { autoInjectable } from "tsyringe";
import { Listener } from '@sapphire/framework';
import { GuildMember, PermissionFlagsBits, GuildChannel } from 'discord.js';
import { SettingsManager } from "../../managers/SettingsManager";

@autoInjectable()
export class DisableFeatureListener extends Listener {
    public constructor(
        context: Listener.LoaderContext,
        options: Listener.Options,
        protected settingsManager: SettingsManager,
    ) {
        super(context, {
            ...options,
            event: 'guildMemberUpdate'
        });
    }

    public override async run(oldMember: GuildMember, newMember: GuildMember) {
        try {
            await this.updateFindGroupPermissions(oldMember, newMember);
        } catch (error) {
            console.error('Errore in DisableFeatureListener:', error);
        }
    }

    /** Nega o ripristina la visualizzazione del canale findgroup in base all'aggiunta/rimozione del ruolo disableFindGroup. */
    protected async updateFindGroupPermissions(oldMember: GuildMember, newMember: GuildMember) {
        const [disableRoleId, findGroupChannelId] = await Promise.all([
            this.settingsManager.getDisableFindGroupRoleId?.(),
            this.settingsManager.getFindGroupChannelId?.(),
        ]);

        if (!disableRoleId || !findGroupChannelId) return;

        const hadRole = oldMember.roles.cache.has(disableRoleId);
        const hasRole = newMember.roles.cache.has(disableRoleId);

        if (hadRole === hasRole) return; // Nessun cambiamento sul ruolo target

        const channel = await newMember.guild.channels.fetch(findGroupChannelId);
        if (!channel) return;

        const reason = 'Aggiornamento permessi findgroup per ruolo disableFindGroup';

        // Se il ruolo è stato AGGIUNTO => nega la visualizzazione del canale all'utente
        if (!hadRole && hasRole) {
            try {
                if ((channel as GuildChannel).permissionOverwrites) {
                    await (channel as GuildChannel).permissionOverwrites.edit(newMember.id, {
                        ViewChannel: false
                    }, { reason });
                }
            } catch (e) {
                console.error('Errore durante l\'aggiunta del deny ViewChannel per utente', newMember.id, 'nel canale', findGroupChannelId, e);
            }
            return;
        }

        // Se il ruolo è stato RIMOSSO => rimuovi l\'overwrite specifico dell'utente
        if (hadRole && !hasRole) {
            try {
                if ((channel as GuildChannel).permissionOverwrites) {
                    await (channel as GuildChannel).permissionOverwrites.delete(newMember.id, reason);
                }
            } catch (e) {
                console.error('Errore durante la rimozione dell\'overwrite per utente', newMember.id, 'nel canale', findGroupChannelId, e);
            }
            return;
        }
    }
}
