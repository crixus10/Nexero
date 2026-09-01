const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

const TOKEN_KEY = 'nexero.accessToken';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Corp de eroare standard NestJS: `{ statusCode, message, error }`, cu
 * `message` fie string (o singură eroare), fie string[] (class-validator,
 * o intrare per câmp invalid — whitelist/forbidNonWhitelisted din
 * src/main.ts). Normalizat aici într-un singur mesaj afișabil.
 */
interface NestErrorBody {
  statusCode?: number;
  message?: string | string[];
  error?: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 204) {
    return undefined as T;
  }

  const body: unknown = await res.json().catch(() => undefined);

  if (!res.ok) {
    const nestBody = body as NestErrorBody | undefined;
    const message = Array.isArray(nestBody?.message)
      ? nestBody.message.join('; ')
      : (nestBody?.message ?? `Eroare ${res.status}`);
    throw new ApiError(res.status, message);
  }

  return body as T;
}
