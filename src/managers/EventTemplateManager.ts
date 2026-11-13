import "reflect-metadata";
import { autoInjectable } from "tsyringe";
import { ApiManager, PageResponse } from "./ApiManager";
import { ListParams } from "./SectionManager";

/** Proiezione di un template evento esposta dalle API (senza immagine, vedi {@link EventTemplateManager.getImage}). */
export interface EventTemplate {
    id: number;
    eventId: number;
    eventName: string;
    /** Nome con cui lo Staff riconosce il template, es. nelle select. */
    name: string;
    discordEventTitle: string;
    discordEventDescription: string;
    discordNewsChannel: string;
    discordNewsContent: string;
    /** `null` se il thread va aperto con l'invito generico a commentare. */
    discordThreadPost: string | null;
}

/** Payload di creazione e aggiornamento (semantica `PUT`). */
export interface EventTemplateRequest {
    eventId: number;
    name: string;
    discordEventTitle: string;
    discordEventDescription: string;
    /** Data URI base64, es. `data:image/png;base64,...`. */
    discordEventImage: string;
    discordNewsChannel: string;
    discordNewsContent: string;
    discordThreadPost?: string | null;
}

/** Limiti di lunghezza imposti dalle API sui campi del template. */
export const EVENT_TEMPLATE_LIMITS = {
    name: 100,
    title: 100,
    description: 800,
    newsContent: 1800,
    threadPost: 2000,
    imageBytes: 4 * 1024 * 1024,
} as const;

/** Manager delle API REST dell'entità `EventTemplate`. */
@autoInjectable()
export class EventTemplateManager {

    protected static readonly BASE_PATH = "/api/v1/event-templates";

    public constructor(
        protected apiManager?: ApiManager,
    ) {}

    /** `GET /event-templates` — lista paginata. */
    public async list(params: ListParams = {}): Promise<PageResponse<EventTemplate>> {
        return this.apiManager!.request<PageResponse<EventTemplate>>({
            method: "GET",
            url: EventTemplateManager.BASE_PATH,
            params,
        });
    }

    /** Scorre tutte le pagine e ritorna l'elenco completo dei template. */
    public async listAll(params: Omit<ListParams, "page"> = {}): Promise<EventTemplate[]> {
        return this.apiManager!.fetchAllPages((page) => this.list({ ...params, page }));
    }

    /** `GET /event-templates/{id}` — dettaglio per id. */
    public async getById(id: number): Promise<EventTemplate> {
        return this.apiManager!.request<EventTemplate>({
            method: "GET",
            url: `${EventTemplateManager.BASE_PATH}/${id}`,
        });
    }

    /** `GET /event-templates/{id}/image` — immagine dell'evento Discord in binario. */
    public async getImage(id: number): Promise<Buffer> {
        const data = await this.apiManager!.request<ArrayBuffer>({
            method: "GET",
            url: `${EventTemplateManager.BASE_PATH}/${id}/image`,
            responseType: "arraybuffer",
        });
        return Buffer.from(data);
    }

    /**
     * Immagine dell'evento Discord come data URI, il formato accettato in scrittura: serve per conservare
     * l'immagine attuale quando un template viene aggiornato senza sostituirla.
     */
    public async getImageDataUri(id: number): Promise<string> {
        const response = await this.apiManager!.requestResponse<ArrayBuffer>({
            method: "GET",
            url: `${EventTemplateManager.BASE_PATH}/${id}/image`,
            responseType: "arraybuffer",
        });
        const contentType = String(response.headers["content-type"] ?? "").split(";")[0].trim();
        return `data:${contentType};base64,${Buffer.from(response.data).toString("base64")}`;
    }

    /** `POST /event-templates` — creazione. */
    public async create(template: EventTemplateRequest): Promise<EventTemplate> {
        return this.apiManager!.request<EventTemplate>({
            method: "POST",
            url: EventTemplateManager.BASE_PATH,
            data: template,
        });
    }

    /** `PUT /event-templates/{id}` — aggiornamento completo. */
    public async update(id: number, template: EventTemplateRequest): Promise<EventTemplate> {
        return this.apiManager!.request<EventTemplate>({
            method: "PUT",
            url: `${EventTemplateManager.BASE_PATH}/${id}`,
            data: template,
        });
    }

    /** `DELETE /event-templates/{id}` — eliminazione (`409` se il template ha delle edizioni). */
    public async delete(id: number): Promise<void> {
        await this.apiManager!.request<void>({
            method: "DELETE",
            url: `${EventTemplateManager.BASE_PATH}/${id}`,
        });
    }
}
