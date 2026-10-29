import { getConfig, maskToken } from "../utils/config.js";
import { CanvasApiError } from "./errors.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
export interface RequestOptions {
  method?: HttpMethod;
  query?: Record<string, string | number | boolean | string[] | undefined | null>;
  body?: unknown;
  maxPages?: number;
}

function buildQuery(query?: RequestOptions["query"]): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) for (const v of value) params.append(`${key}[]`, String(v));
    else params.append(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

function parseLinkHeader(header: string | null): Record<string, string> {
  if (!header) return {};
  const links: Record<string, string> = {};
  for (const part of header.split(",")) {
    const m = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (m) links[m[2]] = m[1];
  }
  return links;
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function isRetryable(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("fetch failed") || msg.includes("network") || msg.includes("timeout") ||
      msg.includes("aborted") || msg.includes("econnreset");
  }
  return false;
}

export class CanvasClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor() {
    const cfg = getConfig();
    this.baseUrl = cfg.CANVAS_BASE_URL;
    this.token = cfg.CANVAS_ACCESS_TOKEN;
    this.timeoutMs = cfg.CANVAS_TIMEOUT_MS ?? 30_000;
    this.maxRetries = cfg.CANVAS_MAX_RETRIES ?? 3;
  }

  get instanceUrl() { return this.baseUrl; }
  get maskedToken() { return maskToken(this.token); }

  async request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method ?? "GET";
    if (method === "GET" && (options.maxPages ?? 1) > 1) {
      return this.paginate<T>(path, options) as Promise<T>;
    }
    return this.singleRequest<T>(path, options);
  }

  private async singleRequest<T>(path: string, options: RequestOptions): Promise<T> {
    const method = options.method ?? "GET";
    const url = `${this.baseUrl}/api/v1${path}${buildQuery(options.query)}`;
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
        };
        if (options.body !== undefined) headers["Content-Type"] = "application/json";
        const res = await fetch(url, {
          method,
          headers,
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
          const retryAfter = Number(res.headers.get("Retry-After") ?? "2");
          if (attempt < this.maxRetries) {
            await sleep(Math.min(retryAfter * 1000, 10_000) * (attempt + 1));
            continue;
          }
        }
        const text = await res.text();
        let body: unknown;
        if (text) { try { body = JSON.parse(text); } catch { body = text; } }
        if (!res.ok) throw CanvasApiError.fromResponse(res.status, body, path);
        return body as T;
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
        if (err instanceof CanvasApiError) throw err;
        if (attempt < this.maxRetries && isRetryable(err)) {
          await sleep(500 * (attempt + 1));
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  }

  private async paginate<T>(path: string, options: RequestOptions): Promise<T> {
    const maxPages = options.maxPages ?? 10;
    const all: unknown[] = [];
    let nextUrl: string | null = null;
    let page = 0;
    while (page < maxPages) {
      const url = page === 0
        ? `${this.baseUrl}/api/v1${path}${buildQuery(options.query)}`
        : (nextUrl as string);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const res = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const text = await res.text();
        let body: unknown;
        try { body = JSON.parse(text); } catch { body = text; }
        throw CanvasApiError.fromResponse(res.status, body, path);
      }
      const data = (await res.json()) as unknown;
      if (Array.isArray(data)) all.push(...data);
      else return data as T;
      const links = parseLinkHeader(res.headers.get("Link"));
      nextUrl = links.next ?? null;
      if (!nextUrl) break;
      page++;
    }
    return all as T;
  }

  get<T = unknown>(path: string, query?: RequestOptions["query"], maxPages = 10) {
    return this.request<T>(path, { method: "GET", query, maxPages });
  }
  post<T = unknown>(path: string, body?: unknown, query?: RequestOptions["query"]) {
    return this.request<T>(path, { method: "POST", body, query });
  }
  put<T = unknown>(path: string, body?: unknown, query?: RequestOptions["query"]) {
    return this.request<T>(path, { method: "PUT", body, query });
  }
  delete<T = unknown>(path: string, query?: RequestOptions["query"]) {
    return this.request<T>(path, { method: "DELETE", query });
  }
}

let sharedClient: CanvasClient | null = null;
export function getCanvasClient(): CanvasClient {
  if (!sharedClient) sharedClient = new CanvasClient();
  return sharedClient;
}
