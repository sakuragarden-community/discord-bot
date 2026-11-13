import "reflect-metadata";
import { autoInjectable } from "tsyringe";
import { ApiManager, PageResponse } from "./ApiManager";
import { ListParams } from "./SectionManager";

/** Proiezione di un'edizione evento esposta dalle API. */
export interface EventEdition {
    id: number;
    eventTemplateId: number;
    /** Istante ISO-8601. */
    plannedAt: string;
    /** Evento programmato creato su Discord, `null` finché non esiste. */
    discordEventId: string | null;
}

/** Payload di creazione e aggiornamento (semantica `PUT`: i campi omessi vengono azzerati). */
export interface EventEditionRequest {
    eventTemplateId: number;
    plannedAt: string;
    discordEventId?: string | null;
}

/** Parametri della lista: `from`/`to` filtrano `plannedAt` nell'intervallo `[from, to)`. */
export interface EventEditionListParams extends ListParams {
    from?: string;
    to?: string;
}

/** Manager delle API REST dell'entità `EventEdition`. */
@autoInjectable()
export class EventEditionManager {

    protected static readonly BASE_PATH = "/api/v1/event-editions";

    public constructor(
        protected apiManager?: ApiManager,
    ) {}

    /** `GET /event-editions` — lista paginata, filtrabile per data pianificata. */
    public async list(params: EventEditionListParams = {}): Promise<PageResponse<EventEdition>> {
        return this.apiManager!.request<PageResponse<EventEdition>>({
            method: "GET",
            url: EventEditionManager.BASE_PATH,
            params,
        });
    }

    /** Scorre tutte le pagine e ritorna l'elenco completo delle edizioni. */
    public async listAll(params: Omit<EventEditionListParams, "page"> = {}): Promise<EventEdition[]> {
        return this.apiManager!.fetchAllPages((page) => this.list({ ...params, page }));
    }

    /** Edizioni pianificate nell'intervallo `[from, to)`. */
    public async listPlannedBetween(from: Date, to: Date): Promise<EventEdition[]> {
        return this.listAll({ from: from.toISOString(), to: to.toISOString() });
    }

    /** `GET /event-editions/{id}` — dettaglio per id. */
    public async getById(id: number): Promise<EventEdition> {
        return this.apiManager!.request<EventEdition>({
            method: "GET",
            url: `${EventEditionManager.BASE_PATH}/${id}`,
        });
    }

    /** `POST /event-editions` — creazione. */
    public async create(edition: EventEditionRequest): Promise<EventEdition> {
        return this.apiManager!.request<EventEdition>({
            method: "POST",
            url: EventEditionManager.BASE_PATH,
            data: edition,
        });
    }

    /** `PUT /event-editions/{id}` — aggiornamento completo. */
    public async update(id: number, edition: EventEditionRequest): Promise<EventEdition> {
        return this.apiManager!.request<EventEdition>({
            method: "PUT",
            url: `${EventEditionManager.BASE_PATH}/${id}`,
            data: edition,
        });
    }

    /** `DELETE /event-editions/{id}` — eliminazione. */
    public async delete(id: number): Promise<void> {
        await this.apiManager!.request<void>({
            method: "DELETE",
            url: `${EventEditionManager.BASE_PATH}/${id}`,
        });
    }
}
