// Shared client-side fetcher — handles the v2 error envelope
// { error: { code, message, requestId } } and legacy { error: string }.

export class ApiClientError extends Error {
  code: string;
  requestId?: string;
  status: number;

  constructor(message: string, code: string, status: number, requestId?: string) {
    super(message);
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

export async function apiFetch<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON body
  }
  if (!res.ok) {
    const payload = data as { error?: string | { code?: string; message?: string; requestId?: string } } | null;
    const message =
      typeof payload?.error === "string"
        ? payload.error
        : payload?.error?.message || `Request failed (${res.status})`;
    const code = typeof payload?.error === "object" && payload?.error?.code ? payload.error.code : "UNKNOWN";
    const requestId = typeof payload?.error === "object" ? payload?.error?.requestId : undefined;
    throw new ApiClientError(message, code, res.status, requestId);
  }
  return data as T;
}

export async function apiJson<T = unknown>(url: string, method: string, bodyData: unknown): Promise<T> {
  return apiFetch<T>(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyData),
  });
}
