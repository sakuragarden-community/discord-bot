import axios, { AxiosRequestConfig, AxiosError, AxiosResponse } from "axios";

/** Errore di validazione su un singolo campo. */
export interface ApiViolation {
    field: string;
    message: string;
}

/** Corpo di errore comune a tutte le API (non al token endpoint). */
export interface ApiErrorBody {
    timestamp: string;
    status: number;
    error: string;
    message: string;
    path: string;
    violations?: ApiViolation[];
}

/** Involucro di paginazione esposto dalle API. */
export interface PageResponse<T> {
    content: T[];
    page: number;
    size: number;
    totalElements: number;
    totalPages: number;
    last: boolean;
}

/** Errore applicativo sollevato dalle chiamate alle API Kodama. */
export class KodamaApiError extends Error {

    public constructor(
        message: string,
        public readonly status?: number,
        public readonly violations: ApiViolation[] = [],
        public readonly body?: ApiErrorBody,
    ) {
        super(message);
        this.name = "KodamaApiError";
    }
}

/**
 * Manager di accesso alle API Kodama.
 *
 * Si occupa dell'autenticazione (OAuth 2.0 client_credentials), dell'esecuzione
 * delle chiamate HTTP autenticate e della normalizzazione degli errori.
 */
export class ApiManager {

    public async getBearerToken(): Promise<string> {
        const baseUrl = process.env.KODAMA_API_BASE_URL;
        const clientId = process.env.KODAMA_CLIENT_ID;
        const clientSecret = process.env.KODAMA_CLIENT_SECRET;

        if (!baseUrl || !clientId || !clientSecret) {
            throw new Error("KODAMA_API_BASE_URL, KODAMA_CLIENT_ID e KODAMA_CLIENT_SECRET devono essere definite nel file .env");
        }

        const response = await axios.post(
            `${baseUrl}/oauth2/token`,
            new URLSearchParams({
                grant_type: "client_credentials",
                client_id: clientId,
                client_secret: clientSecret,
            }),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            }
        );

        return response.data.access_token;
    }

    /** Esegue la chiamata autenticata e normalizza gli errori delle API. */
    public async request<T>(config: AxiosRequestConfig): Promise<T> {
        return (await this.requestResponse<T>(config)).data;
    }

    /** Come {@link request}, ma ritorna l'intera risposta, intestazioni comprese. */
    public async requestResponse<T>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
        const baseUrl = process.env.KODAMA_API_BASE_URL;

        if (!baseUrl) {
            throw new Error("KODAMA_API_BASE_URL deve essere definita nel file .env");
        }

        const token = await this.getBearerToken();

        try {
            const response = await axios.request<T>({
                ...config,
                baseURL: baseUrl,
                headers: {
                    Authorization: `Bearer ${token}`,
                    ...(config.headers ?? {}),
                },
            });

            return response;
        } catch (error) {
            throw this.toApiError(error);
        }
    }

    /** Traduce un errore axios nel corrispondente {@link KodamaApiError}. */
    public toApiError(error: unknown): unknown {
        if (!axios.isAxiosError(error)) {
            return error;
        }

        const axiosError = error as AxiosError<ApiErrorBody>;
        const body = axiosError.response?.data;

        return new KodamaApiError(
            body?.message ?? axiosError.message,
            axiosError.response?.status,
            body?.violations ?? [],
            body,
        );
    }

    /** Scorre tutte le pagine restituite da `fetchPage` e ne concatena il contenuto. */
    public async fetchAllPages<T>(fetchPage: (page: number) => Promise<PageResponse<T>>): Promise<T[]> {
        const items: T[] = [];
        let page = 0;
        let last = false;

        while (!last) {
            const response = await fetchPage(page);
            items.push(...response.content);
            last = response.last || response.content.length === 0;
            page++;
        }

        return items;
    }
}
