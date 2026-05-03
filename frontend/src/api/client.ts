import type { ApiErrorBody, Identity } from "./types";

type Fetcher = typeof fetch;

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
  get<T>(path: string, init?: RequestInit): Promise<T>;
  post<TResponse, TBody = unknown>(path: string, body: TBody, init?: RequestInit): Promise<TResponse>;
  patch<TResponse, TBody = unknown>(path: string, body: TBody, init?: RequestInit): Promise<TResponse>;
  me(): Promise<Identity>;
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = options.baseUrl ?? "/api";
  const fetcher = options.fetcher ?? fetch;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");

    if (init.body !== undefined && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    const response = await fetcher(toApiPath(baseUrl, path), { ...init, headers });
    const payload = await readJson(response);

    if (!response.ok) {
      throw toApiError(response, payload);
    }

    return payload as T;
  }

  return {
    get: request,
    post: (path, body, init) => request(path, { ...init, method: "POST", body: JSON.stringify(body) }),
    patch: (path, body, init) => request(path, { ...init, method: "PATCH", body: JSON.stringify(body) }),
    me: () => request<Identity>("/me")
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

  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
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
