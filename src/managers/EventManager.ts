import "reflect-metadata";
import { autoInjectable } from "tsyringe";
import { ApiManager, PageResponse } from "./ApiManager";
import { ListParams } from "./SectionManager";

/** Proiezione di un evento esposta dalle API. */
export interface Event {
    id: number;
    sectionId: number;
    sectionName: string;
    name: string;
    /** ID del ruolo Discord di riferimento. */
    interest: string;
    /** `0` indica nessun limite. */
    maxParticipants: number;
    /** `false` se la partecipazione richiede un'iscrizione. */
    isOpen: boolean;
}

/** Payload di creazione e aggiornamento (semantica `PUT`). */
export interface EventRequest {
    sectionId: number;
    name: string;
    interest: string;
    maxParticipants?: number;
    isOpen: boolean;
}

/** Manager delle API REST dell'entità `Event`. */
@autoInjectable()
export class EventManager {

    protected static readonly BASE_PATH = "/api/v1/events";

    public constructor(
        protected apiManager?: ApiManager,
    ) {}

    /** `GET /events` — lista paginata. */
    public async list(params: ListParams = {}): Promise<PageResponse<Event>> {
        return this.apiManager!.request<PageResponse<Event>>({
            method: "GET",
            url: EventManager.BASE_PATH,
            params,
        });
    }

    /** Scorre tutte le pagine e ritorna l'elenco completo degli eventi. */
    public async listAll(params: Omit<ListParams, "page"> = {}): Promise<Event[]> {
        return this.apiManager!.fetchAllPages((page) => this.list({ ...params, page }));
    }

    /** `GET /events/{id}` — dettaglio per id. */
    public async getById(id: number): Promise<Event> {
        return this.apiManager!.request<Event>({
            method: "GET",
            url: `${EventManager.BASE_PATH}/${id}`,
        });
    }

    /** `POST /events` — creazione. */
    public async create(event: EventRequest): Promise<Event> {
        return this.apiManager!.request<Event>({
            method: "POST",
            url: EventManager.BASE_PATH,
            data: event,
        });
    }

    /** `PUT /events/{id}` — aggiornamento completo. */
    public async update(id: number, event: EventRequest): Promise<Event> {
        return this.apiManager!.request<Event>({
            method: "PUT",
            url: `${EventManager.BASE_PATH}/${id}`,
            data: event,
        });
    }

    /** `DELETE /events/{id}` — eliminazione (`409` se l'evento ha dei template). */
    public async delete(id: number): Promise<void> {
        await this.apiManager!.request<void>({
            method: "DELETE",
            url: `${EventManager.BASE_PATH}/${id}`,
        });
    }
}
