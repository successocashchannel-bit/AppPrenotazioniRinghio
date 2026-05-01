import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSalonId, matchesSalonScopedId, salonScopedId } from "@/lib/salon";

export type ServiceItem = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  active: boolean;
};

type ServiceRow = {
  id: string;
  salon_id?: string | null;
  name: string;
  duration_min: number;
  price: number;
  active: boolean;
  updated_at?: string;
};

const DEFAULT_SERVICE_DEFS: Record<string, Omit<ServiceItem, "id"> & { baseId: string }> = {
  barba: {
    baseId: "barba",
    name: "Barba",
    durationMin: 15,
    price: 10,
    active: true,
  },
  taglio: {
    baseId: "taglio",
    name: "Taglio",
    durationMin: 30,
    price: 15,
    active: true,
  },
  barba_taglio: {
    baseId: "barba_taglio",
    name: "Barba + Taglio",
    durationMin: 45,
    price: 20,
    active: true,
  },
};

export function getDefaultServices(): Record<string, ServiceItem> {
  const result: Record<string, ServiceItem> = {};
  for (const def of Object.values(DEFAULT_SERVICE_DEFS)) {
    const id = salonScopedId(def.baseId);
    result[id] = { id, name: def.name, durationMin: def.durationMin, price: def.price, active: def.active };
  }
  return result;
}

function slugify(text: string) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
}

function sanitizeService(input: Partial<ServiceItem>, fallbackId?: string): ServiceItem {
  const name = String(input.name || "").trim() || "Servizio";
  const id = slugify(String(input.id || fallbackId || name)) || `servizio_${Date.now()}`;
  const durationMin = Math.max(5, Number(input.durationMin || 0) || 15);
  const price = Math.max(0, Number(input.price || 0) || 0);

  return {
    id,
    name,
    durationMin,
    price,
    active: input.active !== false,
  };
}

function fromRow(row: ServiceRow): ServiceItem {
  return sanitizeService(
    {
      id: row.id,
      name: row.name,
      durationMin: row.duration_min,
      price: row.price,
      active: row.active,
    },
    row.id
  );
}

function toRow(item: ServiceItem): ServiceRow {
  return {
    id: salonScopedId(item.id),
    salon_id: getSalonId(),
    name: item.name,
    duration_min: item.durationMin,
    price: item.price,
    active: item.active,
  };
}

function normalizeServices(input: any): Record<string, ServiceItem> {
  if (!input || typeof input !== "object") return getDefaultServices();

  const result: Record<string, ServiceItem> = {};
  for (const [key, value] of Object.entries(input)) {
    const item = sanitizeService(value as Partial<ServiceItem>, key);
    item.id = salonScopedId(item.id);
    result[item.id] = item;
  }

  return Object.keys(result).length ? result : getDefaultServices();
}

async function seedDefaultServicesIfEmpty() {
  const { data, error } = await supabaseAdmin.from("services").select("id").eq("salon_id", getSalonId()).limit(1);
  if (error) throw error;

  if ((data || []).length === 0) {
    const rows = Object.values(getDefaultServices()).map(toRow);
    const upsert = await supabaseAdmin.from("services").upsert(rows, { onConflict: "id" });
    if (upsert.error) throw upsert.error;
  }
}

export async function readServicesMap() {
  await seedDefaultServicesIfEmpty();

  const { data, error } = await supabaseAdmin.from("services").select("*").eq("salon_id", getSalonId());
  if (error) throw error;

  const result: Record<string, ServiceItem> = {};
  for (const row of (data || []) as ServiceRow[]) {
    const item = fromRow(row);
    result[item.id] = item;
  }

  return Object.keys(result).length ? result : getDefaultServices();
}

export async function saveServicesMap(input: Record<string, ServiceItem>) {
  const normalized = normalizeServices(input);
  const rows = Object.values(normalized).map(toRow);

  const existing = await supabaseAdmin.from("services").select("id").eq("salon_id", getSalonId());
  if (existing.error) throw existing.error;

  const keepIds = new Set(rows.map((item) => item.id));
  const deleteIds = (existing.data || [])
    .map((item: any) => item.id)
    .filter((id: string) => !keepIds.has(id));

  if (deleteIds.length) {
    const deleted = await supabaseAdmin.from("services").delete().eq("salon_id", getSalonId()).in("id", deleteIds);
    if (deleted.error) throw deleted.error;
  }

  const upsert = await supabaseAdmin.from("services").upsert(rows, { onConflict: "id" });
  if (upsert.error) throw upsert.error;

  return normalized;
}

export async function readServicesList(includeInactive = false) {
  const map = await readServicesMap();
  const list = Object.values(map).sort((a, b) => a.name.localeCompare(b.name, "it"));
  return includeInactive ? list : list.filter((item) => item.active);
}

export async function getServiceById(serviceId: string) {
  const normalizedId = String(serviceId || "").trim().toLowerCase();
  if (!normalizedId) return null;

  const { data, error } = await supabaseAdmin
    .from("services")
    .select("*")
     .eq("salon_id", getSalonId())
    .in("id", [normalizedId, salonScopedId(normalizedId)])
    .limit(1);

  if (error) throw error;

  const rows = (data || []) as ServiceRow[];
  const row = rows.find((entry) => matchesSalonScopedId(entry.id, normalizedId)) || rows[0];
  return row ? fromRow(row) : null;
}

export async function upsertService(input: Partial<ServiceItem>) {
  const item = sanitizeService(input, input.id);
  item.id = salonScopedId(item.id);

  const { error } = await supabaseAdmin
    .from("services")
    .upsert(toRow(item), { onConflict: "id" });

  if (error) throw error;

  return item;
}

export async function deleteService(serviceId: string) {
  const normalizedId = String(serviceId || "").trim().toLowerCase();
  if (!normalizedId) return;

  const all = await readServicesList(true);
  if (all.length <= 1) {
    throw new Error("Deve rimanere almeno un servizio nel sistema");
  }

  const { error } = await supabaseAdmin
    .from("services")
    .delete()
     .eq("salon_id", getSalonId())
    .in("id", [normalizedId, salonScopedId(normalizedId)]);

  if (error) throw error;
}

export async function getServices() {
  return readServicesList(true);
}

export async function saveServices(services: ServiceItem[]) {
  const map: Record<string, ServiceItem> = {};
  for (const service of services) {
    const item = sanitizeService(service, service.id);
    item.id = salonScopedId(item.id);
    map[item.id] = item;
  }
  return saveServicesMap(map);
}