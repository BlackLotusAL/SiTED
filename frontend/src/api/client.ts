import type { ApiErrorBody, Identity } from "./types";

type Fetcher = typeof fetch;
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonRequestBody = Exclude<JsonValue, string>;
type RequestBody = JsonValue | BodyInit;
type ApiRequestInit = Omit<RequestInit, "body"> & {
  body?: RequestBody;
};

interface ApiClientOptions {
  baseUrl?: string;
  fetcher?: Fetcher;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiClient {
  get<T>(path: string, init?: RequestInit): Promise<T | undefined>;
  post<TResponse>(path: string, body: RequestBody, init?: RequestInit): Promise<TResponse | undefined>;
  patch<TResponse>(path: string, body: RequestBody, init?: RequestInit): Promise<TResponse | undefined>;
  delete<TResponse>(path: string, init?: RequestInit): Promise<TResponse | undefined>;
  me(): Promise<Identity>;
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = options.baseUrl ?? "/api";
  const fetcher = options.fetcher ?? fetch;

  async function request<T>(path: string, init: ApiRequestInit = {}): Promise<T | undefined> {
    const { body, ...requestInit } = init;
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");

    if (body !== undefined && isJsonBody(body) && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    const nextInit: RequestInit = { ...requestInit, headers };
    if (body !== undefined) {
      nextInit.body = toRequestBody(body);
    }

    let response: Response;

    try {
      response = await fetcher(toApiPath(baseUrl, path), nextInit);
    } catch {
      throw new ApiError("NETWORK_ERROR", "Network request failed", 0);
    }

    const payload = await readJson(response);

    if (!response.ok) {
      throw toApiError(response, payload);
    }

    return payload as T;
  }

  return {
    get: request,
    post: (path, body, init) => request(path, { ...init, method: "POST", body }),
    patch: (path, body, init) => request(path, { ...init, method: "PATCH", body }),
    delete: (path, init) => request(path, { ...init, method: "DELETE" }),
    me: async () => {
      const identity = await request<Identity>("/me");

      if (identity === undefined) {
        throw new ApiError("EMPTY_RESPONSE", "Identity response was empty", 0);
      }

      return identity;
    }
  };
}

export const apiClient = createApiClient();

function toApiPath(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (normalizedPath === normalizedBase || normalizedPath.startsWith(`${normalizedBase}/`)) {
    return normalizedPath;
  }

  return `${normalizedBase}${normalizedPath}`;
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (response.status === 204) {
    return undefined;
  }

  if (!contentType.includes("application/json")) {
    return undefined;
  }

  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function toApiError(response: Response, payload: unknown): ApiError {
  if (isApiErrorBody(payload)) {
    return new ApiError(payload.code, payload.message, response.status);
  }

  return new ApiError(`HTTP_${response.status}`, `Request failed with status ${response.status}`, response.status);
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "message" in value &&
    typeof value.code === "string" &&
    typeof value.message === "string"
  );
}

function toRequestBody(body: RequestBody): BodyInit {
  return isJsonBody(body) ? JSON.stringify(body) : body;
}

function isJsonBody(body: unknown): body is JsonRequestBody {
  return (
    body === null ||
    typeof body === "number" ||
    typeof body === "boolean" ||
    Array.isArray(body) ||
    (typeof body === "object" &&
      body !== null &&
      !(body instanceof FormData) &&
      !(body instanceof Blob) &&
      !(body instanceof ArrayBuffer) &&
      !ArrayBuffer.isView(body) &&
      !(body instanceof URLSearchParams) &&
      !(body instanceof ReadableStream))
  );
}
