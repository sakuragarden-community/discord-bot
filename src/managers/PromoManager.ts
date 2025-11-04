import "reflect-metadata";
import { Client, TextChannel, ChannelType, ThreadAutoArchiveDuration, EmbedBuilder, ThreadChannel, Message, GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel, Guild } from "discord.js";

export interface ParticipationDate {
    hosts: string[];
    /** ISO 8601 date string, e.g. "2025-11-15" or full datetime "2025-11-15T20:30:00Z" */
    date: string;
}

export interface DiscordPromo {
    discord_description: string;
    discord_banner: string;
    discord_promo: string;
    discord_title: string;
    /** Start date (ISO 8601). */
    from: string;
    /** End date (ISO 8601). */
    to: string;
    max_participants: number;
    participation_dates: ParticipationDate[];
}

/**
 * PromoManager
 *
 * This manager exposes an in-memory example JSON payload describing a Discord promotion/campaign.
 * You can use this as a schema reference or seed it from a real source later.
 */
export class PromoManager {
    protected examplePromo: DiscordPromo = {
        discord_description: "Promo di benvenuto per i nuovi membri: partecipa agli eventi settimanali e vinci ruoli speciali!",
        discord_banner: "https://www.wendywutours.co.uk/blog/wp-content/uploads/2022/03/shutterstock_431720092-1.jpg",
        discord_title: "Autumn Sakura Fest 2025",
        discord_promo: "Testo della promo.",
        from: "2025-12-01",
        to: "2025-12-30",
        max_participants: 4,
        participation_dates: [
            {
                hosts: ["565269500560277568"],
                date: "2025-11-03T20:30:00Z"
            },
            {
                hosts: ["565269500560277568"],
                date: "2025-11-10T20:30:00Z"
            }
        ]
    };

    // In-memory events store replacing file-based storage (events.json)
    private events: Record<string, { partecipants: string[]; thread_id?: string }> = {};

    // In-memory helpers (no-op wrappers kept async for API compatibility)
    private async readEventsStore(): Promise<Record<string, { partecipants: string[]; thread_id?: string }>> {
        return this.events;
    }

    private async writeEventsStore(_store: Record<string, { partecipants: string[]; thread_id?: string }>): Promise<void> {
        // No file I/O: state is kept in-memory only
        this.events = _store;
    }

    public async saveEventRecord(eventId: string, threadId?: string): Promise<void> {
        const store = await this.readEventsStore();
        if (!store[eventId]) {
            store[eventId] = { partecipants: [], ...(threadId ? { thread_id: threadId } : {}) };
            await this.writeEventsStore(store);
            return;
        }
        // Update existing record with thread_id if provided and not set
        if (threadId && !store[eventId].thread_id) {
            store[eventId].thread_id = threadId;
            await this.writeEventsStore(store);
        }
    }

    public async removeEventRecord(eventId: string): Promise<void> {
        const store = await this.readEventsStore();
        if (store[eventId]) {
            delete store[eventId];
            await this.writeEventsStore(store);
        }
    }

    /**
     * Deletes the thread associated with a given scheduled event, if present in the in-memory events map.
     * Returns true if a deletion was attempted (thread_id existed), false otherwise.
     */
    public async deleteEventThread(guild: Guild, eventId: string): Promise<boolean> {
        const store = await this.readEventsStore();
        const rec = store[eventId];
        const threadId = rec?.thread_id;
        if (!threadId) return false;
        try {
            const ch = await guild.channels.fetch(threadId);
            if (ch && ch.isThread()) {
                await ch.delete("Scheduled event canceled/deleted");
                return true;
            }
        } catch (err) {
            console.error(`Errore nella cancellazione del thread ${threadId} per evento ${eventId}:`, err);
        }
        return false;
    }

    /**
     * Se esiste un record per l'evento nell'archivio in-memory e contiene un thread_id,
     * invia un messaggio nel thread menzionando l'utente specificato.
     * Restituisce true se il messaggio è stato inviato, altrimenti false.
     */
    public async mentionUserInEventThread(guild: Guild, eventId: string, userId: string): Promise<boolean> {
        try {
            const store = await this.readEventsStore();
            const rec = store[eventId];
            const threadId = rec?.thread_id;
            if (!rec || !threadId) return false;

            const ch = await guild.channels.fetch(threadId);
            if (!ch || !ch.isThread()) return false;

            await ch.send({ content: `<@${userId}> ha mostrato interesse per l'evento! Benvenut* nel thread 🌸` });
            return true;
        } catch (err) {
            console.error(`Errore nel menzionare l'utente ${userId} nel thread per evento ${eventId}:`, err);
            return false;
        }
    }

    /**
     * Restituisce l'esempio di JSON della promo Discord.
     */
    public getExamplePromo(): DiscordPromo {
        return this.examplePromo;
    }

    /**
     * Sostituisce l'esempio di JSON con dati personalizzati (opzionale).
     */
    public setExamplePromo(promo: DiscordPromo): void {
        this.examplePromo = promo;
    }

    /**
     * Crea un Evento Programmato su Discord (Scheduled Event) e, subito dopo, un thread privato nel canale indicato.
     * - L'evento usa: `discord_title` (titolo), `discord_description` (descrizione), `discord_banner` (immagine), `from`/`to` (start/end).
     * - Il titolo del thread è il `discord_title` dell'esempio promo.
     * - All'interno del thread invia un messaggio di benvenuto e un embed che invita a votare le date proposte.
     *
     * Nota: il bot deve avere i permessi per creare eventi nella gilda, creare thread privati e scrivere nel canale.
     *
     * @param client Istanza del client Discord.
     * @param channelId ID del canale testuale dove creare il thread. Default: "1406183238690668594".
     * @returns Oggetti creati (thread, messaggio introduttivo, messaggio embed)
     */
    public async publishEvent(
        client: Client,
        channelId: string = "1406183238690668594"
    ): Promise<{ thread: ThreadChannel; introMessage: Message; embedMessage: Message }> {
        const promo = this.getExamplePromo();
        const title = (promo.discord_title || "Evento Sakura").slice(0, 100);

        // Recupera il canale
        const ch = await client.channels.fetch(channelId);
        if (!ch || !(ch instanceof TextChannel)) {
            throw new Error("Il canale specificato non è un TextChannel valido o non è stato trovato.");
        }

        // 1) Crea un Evento Programmato su Discord prima di creare il thread
        const start = new Date(promo.from);
        const end = new Date(promo.to);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            throw new Error("Le date 'from' o 'to' della promo non sono valide (formato ISO richiesto).");
        }

        let imageBuffer: Buffer | undefined;
        if (promo.discord_banner) {
            try {
                // Node 18+ ha fetch globale; se fallisce, l'immagine verrà semplicemente omessa
                const res = await fetch(promo.discord_banner);
                if (res.ok) {
                    const ab = await res.arrayBuffer();
                    imageBuffer = Buffer.from(ab);
                }
            } catch (_) {
                // ignora errori nel recupero dell'immagine
            }
        }

        const createdEvent = await ch.guild.scheduledEvents.create({
            name: title,
            description: promo.discord_description?.slice(0, 1000),
            scheduledStartTime: start,
            scheduledEndTime: end,
            privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
            entityType: GuildScheduledEventEntityType.External,
            entityMetadata: { location: ch.guild.name || "Discord" },
            image: imageBuffer
        });

        // Registra l'evento nell'archivio in-memory con array "partecipants" vuoto
        try {
            await this.saveEventRecord(createdEvent.id);
        } catch (err) {
            console.error("Impossibile salvare il record dell'evento nell'archivio in-memory:", err);
        }

        // 2) Crea un thread privato nel canale (visibile inizialmente solo al bot)
        const thread = await ch.threads.create({
            name: title,
            type: ChannelType.PrivateThread,
            autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
            invitable: false
        });

        // Aggiorna lo storage con l'ID del thread creato
        try {
            await this.saveEventRecord(createdEvent.id, thread.id);
        } catch (err) {
            console.error("Impossibile aggiornare lo storage con il thread_id:", err);
        }

        // Messaggio introduttivo nel thread
        const introMessage = await thread.send(`Thread dedicato all'evento ${title}`);

        // Costruisce un embed amichevole per invitare al voto delle date (senza elenco date)
        const descriptionLines: string[] = [];
        descriptionLines.push(
            "Ciao a tutti! 🌸 Benvenuti nel thread dell'evento **" + title + "**."
        );
        descriptionLines.push(
            "Qui promuoveremo l'evento e raccoglieremo le preferenze per la data! ✨"
        );
        descriptionLines.push(
            "Se avete dubbi, taggate pure gli host — siamo qui per voi! _Grazie mille per la partecipazione_ 💮"
        );

        const embed = new EmbedBuilder()
            .setTitle(`🌸 Vota la tua data preferita`)
            .setDescription(descriptionLines.join("\n\n"))
            .setColor(0xFF69B4);

        if (promo.discord_banner) {
            embed.setImage(promo.discord_banner);
        }

        const embedMessage = await thread.send({ embeds: [embed] });

        // Secondo embed con l'elenco delle participation_dates
        const bullets: string[] = [];
        try {
            const pds = Array.isArray(promo.participation_dates) ? promo.participation_dates : [];
            for (const pd of pds) {
                const hosts = Array.isArray(pd?.hosts) ? pd.hosts : [];
                const mentions = hosts.map((id) => `<@${id}>`).join(", ");
                let when = "";
                const d = pd?.date ? new Date(pd.date) : undefined;
                if (d && !isNaN(d.getTime())) {
                    const unix = Math.floor(d.getTime() / 1000);
                    // Discord rich text timestamp (full date/time)
                    when = `<t:${unix}:F>`;
                } else if (pd?.date) {
                    // fallback alla stringa originale se non parsabile
                    when = pd.date;
                }
                const left = mentions ? `${mentions} — ` : "";
                bullets.push(`- ${left}${when}`.trim());
            }
        } catch (_) {
            // In caso di errore sul parsing, non bloccare l'invio dell'embed
        }

        if (bullets.length > 0) {
            const datesEmbed = new EmbedBuilder()
                .setTitle("📅 Date proposte")
                .setDescription(bullets.join("\n"))
                .setColor(0xFF69B4);
            await thread.send({ embeds: [datesEmbed] });
        }

        return { thread, introMessage, embedMessage };
    }
}
