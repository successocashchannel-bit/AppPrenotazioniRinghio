const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function ensureEnv() {
  if (!SUPABASE_URL) {
    throw new Error("Manca NEXT_PUBLIC_SUPABASE_URL o SUPABASE_URL");
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Manca SUPABASE_SERVICE_ROLE_KEY");
  }
}

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>) {
  ensureEnv();
  const url = new URL(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export async function supabaseSelect<T>(
  table: string,
  params?: Record<string, string | number | boolean | undefined>,
  options?: { single?: boolean }
): Promise<T> {
  const res = await fetch(buildUrl(table, params), {
    method: "GET",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: options?.single ? "return=representation" : "",
    },
    cache: "no-store",
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Errore lettura tabella ${table}`);
  }
  return data as T;
}

export async function supabaseUpsert<T>(table: string, payload: object | object[], onConflict?: string): Promise<T> {
  const url = buildUrl(table, onConflict ? { on_conflict: onConflict } : undefined);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Errore upsert tabella ${table}`);
  }
  return data as T;
}

export async function supabaseInsert<T>(table: string, payload: object | object[]): Promise<T> {
  const res = await fetch(buildUrl(table), {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Errore insert tabella ${table}`);
  }
  return data as T;
}

export async function supabasePatch<T>(
  table: string,
  match: Record<string, string | number | boolean>,
  payload: object
): Promise<T> {
  const res = await fetch(buildUrl(table, buildMatchParams(match)), {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Errore update tabella ${table}`);
  }
  return data as T;
}

export async function supabaseDelete(table: string, match: Record<string, string | number | boolean>) {
  const res = await fetch(buildUrl(table, buildMatchParams(match)), {
    method: "DELETE",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "return=representation",
    },
    cache: "no-store",
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Errore delete tabella ${table}`);
  }
  return data;
}

function buildMatchParams(match: Record<string, string | number | boolean>) {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(match)) {
    params[key] = `eq.${String(value)}`;
  }
  return params;
}
