import "reflect-metadata";
import { autoInjectable } from "tsyringe";
import { ApiManager, KodamaApiError } from "./ApiManager";

/** Stato del ciclo di vita di un membro all'interno del server Discord. */
export type MemberStatus = "ACTIVE" | "INACTIVE" | "LEFT" | "BANNED";

/** Proiezione di un membro esposta dalle API. */
export interface Member {
    id: number;
    discordId: string;
    username: string;
    createdAt: string;
    joinedAt: string | null;
    leftAt: string | null;
    status: MemberStatus;
    presentation: string | null;
    experience: number;
}

/**
 * Payload di creazione: `status` ed `experience` sono opzionali e valgono
 * rispettivamente `ACTIVE` e `0` se omessi.
 */
export interface MemberCreateRequest {
    discordId: string;
    username: string;
    joinedAt?: string | null;
    leftAt?: string | null;
    status?: MemberStatus;
    presentation?: string | null;
    experience?: number;
}

/**
 * Payload di aggiornamento completo (semantica `PUT`: i campi omessi vengono
 * azzerati). `discordId` non compare volutamente: non è modificabile via API.
 */
export interface MemberUpdateRequest {
    username: string;
    joinedAt?: string | null;
    leftAt?: string | null;
    status: MemberStatus;
    presentation?: string | null;
    experience: number;
}

/** Parametri di filtro e paginazione della lista membri. */
export interface MemberListParams {
    status?: MemberStatus;
    page?: number;
    /** Default lato server: 20. */
    size?: number;
    /** Default lato server: `id,asc`. */
    sort?: string;
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

/**
 * Manager delle API REST dell'entità `Member`.
 *
 * Si occupa solo di tradurre chiamate TypeScript ↔ HTTP: autenticazione,
 * esecuzione della richiesta e normalizzazione degli errori sono delegate
 * a {@link ApiManager}.
 */
@autoInjectable()
export class MemberManager {

    protected static readonly BASE_PATH = "/api/v1/members";

    public constructor(
        protected apiManager?: ApiManager,
    ) {}

    /** `GET /members` — lista paginata, con filtro opzionale per stato. */
    public async list(params: MemberListParams = {}): Promise<PageResponse<Member>> {
        return this.apiManager!.request<PageResponse<Member>>({
            method: "GET",
            url: MemberManager.BASE_PATH,
            params: {
                status: params.status,
                page: params.page,
                size: params.size,
                sort: params.sort,
            },
        });
    }

    /** Scorre tutte le pagine e ritorna l'elenco completo dei membri. */
    public async listAll(params: Omit<MemberListParams, "page"> = {}): Promise<Member[]> {
        const members: Member[] = [];
        let page = 0;
        let last = false;

        while (!last) {
            const response = await this.list({ ...params, page });
            members.push(...response.content);
            last = response.last || response.content.length === 0;
            page++;
        }

        return members;
    }

    /** `GET /members/{id}` — dettaglio per id. */
    public async getById(id: number): Promise<Member> {
        return this.apiManager!.request<Member>({
            method: "GET",
            url: `${MemberManager.BASE_PATH}/${id}`,
        });
    }

    /** `GET /members/by-discord-id/{discordId}` — lookup per snowflake Discord. */
    public async getByDiscordId(discordId: string): Promise<Member> {
        return this.apiManager!.request<Member>({
            method: "GET",
            url: `${MemberManager.BASE_PATH}/by-discord-id/${encodeURIComponent(discordId)}`,
        });
    }

    /** Come {@link getByDiscordId}, ma ritorna `null` se il membro non esiste. */
    public async findByDiscordId(discordId: string): Promise<Member | null> {
        try {
            return await this.getByDiscordId(discordId);
        } catch (error) {
            if (error instanceof KodamaApiError && error.status === 404) {
                return null;
            }
            throw error;
        }
    }

    /** `true` se esiste già un membro con questo snowflake Discord. */
    public async existsByDiscordId(discordId: string): Promise<boolean> {
        return (await this.findByDiscordId(discordId)) !== null;
    }

    /** `POST /members` — creazione. */
    public async create(member: MemberCreateRequest): Promise<Member> {
        return this.apiManager!.request<Member>({
            method: "POST",
            url: MemberManager.BASE_PATH,
            data: member,
        });
    }

    /** `PUT /members/{id}` — aggiornamento completo (i campi omessi vengono azzerati). */
    public async update(id: number, member: MemberUpdateRequest): Promise<Member> {
        return this.apiManager!.request<Member>({
            method: "PUT",
            url: `${MemberManager.BASE_PATH}/${id}`,
            data: member,
        });
    }

    /**
     * Aggiornamento parziale: legge il membro, applica le modifiche e reinvia
     * il payload completo, così da non azzerare i campi non toccati.
     */
    public async patch(id: number, changes: Partial<MemberUpdateRequest>): Promise<Member> {
        const current = await this.getById(id);

        return this.update(id, {
            username: changes.username ?? current.username,
            joinedAt: changes.joinedAt !== undefined ? changes.joinedAt : current.joinedAt,
            leftAt: changes.leftAt !== undefined ? changes.leftAt : current.leftAt,
            status: changes.status ?? current.status,
            presentation: changes.presentation !== undefined ? changes.presentation : current.presentation,
            experience: changes.experience ?? current.experience,
        });
    }

    /** `DELETE /members/{id}` — eliminazione. */
    public async delete(id: number): Promise<void> {
        await this.apiManager!.request<void>({
            method: "DELETE",
            url: `${MemberManager.BASE_PATH}/${id}`,
        });
    }
}
