import { ColorResolvable, EmbedBuilder, User } from "discord.js";
import { Member } from "../managers/MemberManager";

/** Dati per costruire la notifica allo Staff su ingresso/uscita di un membro. */
export interface MemberNotificationOptions {
    /** Utente Discord ricevuto dall'evento (usato solo per menzione e avatar). */
    user: User;
    /** Record del membro sulle API Kodama, `null` se non disponibile. */
    member: Member | null;
    title: string;
    description: string;
    color: ColorResolvable;
}

/** Formatta una data ISO come timestamp Discord, o `N/D` se assente. */
function formatDate(value: string | null | undefined): string {
    if (!value) return 'N/D';
    return `<t:${Math.floor(new Date(value).getTime() / 1000)}:f>`;
}

/** Costruisce l'embed di notifica per lo Staff, con lo stesso stile per ingressi e uscite. */
export function buildMemberNotificationEmbed(options: MemberNotificationOptions): EmbedBuilder {
    const { user, member, title, description, color } = options;

    return new EmbedBuilder()
        .setTitle(title)
        .setColor(color)
        .setDescription(description)
        .setThumbnail(user.displayAvatarURL({ size: 512 }))
        .addFields(
            { name: '👤 Utente', value: `${user.toString()} (${member?.username ?? user.username})`, inline: true },
            { name: '📥 Ingresso', value: formatDate(member?.joinedAt), inline: true },
            { name: '📤 Uscita', value: formatDate(member?.leftAt), inline: true },
            { name: '🗣 Presentazione', value: member?.presentation ?? 'Non presente' },
        )
        .setFooter({ text: `Discord ID: ${user.id}` })
        .setTimestamp();
}
