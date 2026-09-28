import { container } from '@sapphire/framework';
import { ChannelType, Message, TextChannel, time, TimestampStyles } from 'discord.js';
import { SettingsManager } from '../managers/SettingsManager';

/** Custom ID del pulsante pubblicato nel canale findGroup (vedi setup/messages.json). */
export const LFG_MODAL_BUTTON_ID = 'lfg-modal-button';
export const LFG_MODAL_ID = 'lfg-modal';
export const LFG_REASON_INPUT_ID = 'lfg-reason';
export const LFG_GAME_INPUT_ID = 'lfg-game';
export const LFG_DESCRIPTION_INPUT_ID = 'lfg-description';

/** Durata massima di un annuncio prima che venga rimosso dalla pulizia periodica. */
export const LFG_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * Motivo per cui viene creato un annuncio: il valore è quello inviato dalla select, la label quella mostrata.
 * Il topic è l'ID del ruolo taggato nel messaggio dell'annuncio; per i giocatori si usa il ruolo del gioco scelto.
 */
export const LFG_REASONS = [
    { value: 'voice', label: 'Fare quattro chiacchiere in chiamata vocale', topic: '1320420728385831002' },
    { value: 'art', label: 'Disegnare o fare arte in compagnia', topic: '1321813930842001468' },
    { value: 'games', label: 'Trovare giocatori per una partita insieme', topic: null },
] as const;

/** Motivo per cui ha senso scegliere un gioco. */
export const LFG_GAMES_REASON = 'games';

/** Giochi selezionabili, con l'ID del ruolo da taggare; `none` indica che non è stato scelto alcun gioco. */
export const LFG_GAMES = [
    { value: 'none', label: 'Nessun gioco selezionato', role: null },
    { value: 'overwatch', label: 'Overwatch', role: '1367453856618778655' },
    { value: 'mtg', label: 'Magic: The Gathering', role: '1427636433346367488' },
    { value: 'party-games', label: 'Party Games', role: '1507355089076224092' },
    { value: 'yugioh', label: 'Yu-Gi-Oh!', role: '1542119720680038420' },
    { value: 'minecraft', label: 'Minecraft', role: '1307500035625451603' },
    { value: 'wow', label: 'World of Warcraft', role: '1549026118181593190' },
    { value: 'destiny-2', label: 'Destiny 2', role: '1554155721338261524' },
    { value: 'warframe', label: 'Warframe', role: '1521212208007352340' },
    { value: 'genshin-impact', label: 'Genshin Impact', role: '1427636727429726349' },
    { value: 'lol', label: 'League of Legends', role: '1466955120565686423' },
    { value: 'ffxiv', label: 'Final Fantasy XIV', role: '1466955077741711519' },
    { value: 'tft', label: 'Teamfight Tactics', role: '1466955157421162657' },
] as const;

/** Recupera il canale find_group dalla configurazione `channels/community/find_group`. */
export async function fetchFindGroupChannel(settingsManager: SettingsManager): Promise<TextChannel> {
    const channelId = await settingsManager.getFindGroupChannelId();
    if (!channelId) {
        throw new Error("configurazione 'channels/community/find_group' non definita");
    }

    const channel = await container.client.channels.fetch(channelId);
    if (channel?.type !== ChannelType.GuildText) {
        throw new Error(`canale ${channelId} non trovato o non testuale`);
    }
    return channel;
}

/**
 * Cerca l'annuncio non ancora scaduto dell'utente: gli annunci sono i messaggi del bot che menzionano l'autore.
 * Un annuncio più vecchio di {@link LFG_MAX_AGE_MS} è scaduto anche se la pulizia oraria non l'ha ancora rimosso.
 */
export async function findActiveAnnouncement(channel: TextChannel, userId: string): Promise<Message | null> {
    const botId = container.client.user!.id;
    const cutoff = Date.now() - LFG_MAX_AGE_MS;

    // I messaggi arrivano dal più recente: ci si ferma al primo più vecchio del cutoff
    let before: string | undefined;
    while (true) {
        const page = await channel.messages.fetch({ limit: 100, before });
        if (page.size === 0) return null;

        const announcement = page.find((message) =>
            message.author.id === botId
            && message.mentions.users.has(userId)
            && message.createdTimestamp >= cutoff,
        );
        if (announcement) return announcement;

        if (page.last()!.createdTimestamp < cutoff) return null;
        before = page.lastKey();
    }
}

/** Messaggio di errore per chi prova a creare un annuncio avendone già uno attivo. */
export function activeAnnouncementError(announcement: Message): string {
    const expiresAt = new Date(announcement.createdTimestamp + LFG_MAX_AGE_MS);
    return `❌ Hai già un annuncio attivo: ${announcement.url}\n`
        + `Devi attendere che scada prima di poterne creare un altro. Scadrà ${time(expiresAt, TimestampStyles.RelativeTime)}.`;
}
