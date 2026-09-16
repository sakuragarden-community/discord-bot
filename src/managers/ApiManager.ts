import axios, { AxiosRequestConfig, AxiosError } from "axios";

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

            return response.data;
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
}
