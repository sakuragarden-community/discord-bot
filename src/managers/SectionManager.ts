import "reflect-metadata";
import { autoInjectable } from "tsyringe";
import { ApiManager, PageResponse } from "./ApiManager";

/** Proiezione di una sezione esposta dalle API. */
export interface Section {
    id: number;
    name: string;
    code: string;
}

/** Parametri di paginazione delle liste. */
export interface ListParams {
    page?: number;
    /** Default lato server: 20. */
    size?: number;
    /** Es. `name,asc`; default lato server: `id,asc`. */
    sort?: string;
}

/**
 * Manager delle API REST dell'entità `Section` (sola lettura: le sezioni non
 * vengono gestite dal bot).
 */
@autoInjectable()
export class SectionManager {

    protected static readonly BASE_PATH = "/api/v1/sections";

    public constructor(
        protected apiManager?: ApiManager,
    ) {}

    /** `GET /sections` — lista paginata. */
    public async list(params: ListParams = {}): Promise<PageResponse<Section>> {
        return this.apiManager!.request<PageResponse<Section>>({
            method: "GET",
            url: SectionManager.BASE_PATH,
            params,
        });
    }

    /** Scorre tutte le pagine e ritorna l'elenco completo delle sezioni. */
    public async listAll(params: Omit<ListParams, "page"> = {}): Promise<Section[]> {
        return this.apiManager!.fetchAllPages((page) => this.list({ ...params, page }));
    }

    /** `GET /sections/{id}` — dettaglio per id. */
    public async getById(id: number): Promise<Section> {
        return this.apiManager!.request<Section>({
            method: "GET",
            url: `${SectionManager.BASE_PATH}/${id}`,
        });
    }
}
