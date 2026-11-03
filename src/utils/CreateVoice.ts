import { ChannelType, Guild, GuildBasedChannel, OverwriteType, VoiceChannel } from 'discord.js';
import { SettingsManager } from '../managers/SettingsManager';

/** Custom ID del pulsante pubblicato nel canale createVoice (vedi setup/messages.json). */
export const CREATE_VOICE_MODAL_BUTTON_ID = 'create-voice-modal-button';
export const CREATE_VOICE_MODAL_ID = 'create-voice-modal';
export const CREATE_VOICE_TYPE_INPUT_ID = 'create-voice-type';
export const CREATE_VOICE_LIMIT_INPUT_ID = 'create-voice-limit';

/** Numero massimo di persone selezionabile, anche valore predefinito, e numero minimo. */
export const VOICE_MAX_USERS = 12;
export const VOICE_MIN_USERS = 2;

/** Tempo entro cui qualcuno deve entrare in una stanza appena creata, altrimenti viene eliminata. */
export const VOICE_EMPTY_TIMEOUT_MS = 5 * 60 * 1000;

/** Tipi di stanza: il valore è quello inviato dalla select, l'emoji compare nel nome della stanza. */
export const VOICE_TYPES = [
    { value: 'chill', label: 'Chill', emoji: '☕' },
    { value: 'nsfw', label: '18+', emoji: '🔞' },
    { value: 'focus', label: 'Focus', emoji: '⚡' },
] as const;

export type VoiceType = typeof VOICE_TYPES[number];

/** Nome della stanza, nel formato `》<emoji>・Stanza di <nome nel server>`. */
export function buildVoiceRoomName(type: VoiceType, displayName: string): string {
    return `》${type.emoji}・Stanza di ${displayName}`;
}

/** Recupera l'ID della categoria delle vocali dalla configurazione `voice/general/category_id`. */
export async function fetchVoicesCategoryId(settingsManager: SettingsManager): Promise<string> {
    const categoryId = await settingsManager.getVoicesCategoryId();
    if (!categoryId) {
        throw new Error("configurazione 'voice/general/category_id' non definita");
    }
    return categoryId;
}

/** Indica se il canale è una stanza creata dal pulsante: vocale nella categoria delle vocali e con il nome previsto. */
export function isVoiceRoom(channel: GuildBasedChannel, categoryId: string): channel is VoiceChannel {
    return channel.type === ChannelType.GuildVoice
        && channel.parentId === categoryId
        && VOICE_TYPES.some((type) => channel.name.startsWith(`》${type.emoji}・Stanza di `));
}

/**
 * Stanze vuote dell'utente: il nome nel server non è univoco e può cambiare, quindi il creatore è identificato
 * dall'overwrite dei permessi a lui intestato al momento della creazione.
 */
export function findEmptyVoiceRooms(guild: Guild, categoryId: string, userId: string): VoiceChannel[] {
    return guild.channels.cache
        .filter((channel): channel is VoiceChannel =>
            isVoiceRoom(channel, categoryId)
            && channel.permissionOverwrites.cache.get(userId)?.type === OverwriteType.Member
            && channel.members.size === 0,
        )
        .map((channel) => channel);
}

/** Messaggio di errore per chi prova a creare una stanza avendone già una vuota. */
export function emptyVoiceRoomError(room: VoiceChannel): string {
    return `❌ Hai già creato una stanza vocale ancora vuota: ${room}\nEntra in quella stanza oppure attendi che venga eliminata prima di crearne un'altra.`;
}

/** Elimina la stanza se è ancora presente e vuota. */
export async function deleteVoiceRoomIfEmpty(room: VoiceChannel): Promise<void> {
    const current = room.guild.channels.cache.get(room.id);
    if (current?.type !== ChannelType.GuildVoice || current.members.size > 0) return;

    await current.delete('Stanza vocale vuota');
}
