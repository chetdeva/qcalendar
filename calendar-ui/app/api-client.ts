/** Browser-side helper for this app's own /api routes. Errors carry the service's code and details. */
export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(message: string, status: number, code = 'error', details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json' } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = json.error;
    throw new ApiError(typeof e === 'string' ? e : (e?.message ?? res.statusText), res.status, e?.code, e?.details);
  }
  return json as T;
}
