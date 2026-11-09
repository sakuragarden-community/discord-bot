import { APIEmbedField, ColorResolvable, EmbedBuilder, escapeMarkdown, hyperlink, User } from "discord.js";
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

    const fields: APIEmbedField[] = [
        { name: '👤 Utente', value: escapeMarkdown(member?.username ?? user.username), inline: true },
        { name: '📥 Ingresso', value: formatDate(member?.joinedAt), inline: true },
    ];
    // Senza una data di uscita il membro è al primo ingresso: la voce sarebbe sempre vuota
    if (member?.leftAt) {
        fields.push({ name: '📤 Uscita', value: formatDate(member.leftAt), inline: true });
    }
    fields.push(
        { name: '🗣 Presentazione', value: member?.presentation ?? 'Non presente' },
        // Il footer non supporta i link: ID e collegamento al profilo stanno in un campo dedicato
        { name: '🆔 Discord ID', value: `${user.id} • ${hyperlink('Link', `https://discord.com/users/${user.id}`)}` },
    );

    return new EmbedBuilder()
        .setTitle(title)
        .setColor(color)
        .setDescription(description)
        .setThumbnail(user.displayAvatarURL({ size: 512 }))
        .addFields(fields)
        .setTimestamp();
}
