import { supabaseDelete, supabasePatch, supabaseSelect, supabaseUpsert } from "@/lib/supabase-rest";

export type ServiceItem = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  active: boolean;
};

export const DEFAULT_SERVICES: Record<string, ServiceItem> = {
  servizio_1: { id: "servizio_1", name: "Servizio 1", durationMin: 30, price: 20, active: true },
  servizio_2: { id: "servizio_2", name: "Servizio 2", durationMin: 45, price: 30, active: true },
  servizio_3: { id: "servizio_3", name: "Servizio 3", durationMin: 60, price: 40, active: true },
};

type ServiceRow = {
  id: string;
  name: string;
  duration_min: number | null;
  price: number | null;
  active: boolean | null;
};

type BookingRefRow = {
  id: string;
  status: string | null;
};

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
  const name = String(input.name || "").trim() || "Nuovo servizio";
  const id = slugify(String(input.id || fallbackId || name)) || `servizio_${Date.now()}`;
  const durationMin = Math.max(5, Math.min(480, Number(input.durationMin) || 30));
  const price = Math.max(0, Number(input.price) || 0);
  const active = input.active !== false;
  return { id, name, durationMin, price, active };
}

function rowToService(row: ServiceRow): ServiceItem {
  return sanitizeService({
    id: row.id,
    name: row.name,
    durationMin: Number(row.duration_min || 30),
    price: Number(row.price || 0),
    active: row.active !== false,
  });
}

function serviceToRow(input: ServiceItem): ServiceRow {
  return {
    id: input.id,
    name: input.name,
    duration_min: input.durationMin,
    price: input.price,
    active: input.active,
  };
}

async function ensureDefaultServicesIfEmpty() {
  const existing = await supabaseSelect<ServiceRow[]>("services", {
    select: "id,name,duration_min,price,active",
    order: "name.asc",
  });

  if ((existing || []).length > 0) return existing;

  const defaults = Object.values(DEFAULT_SERVICES).map((service) => serviceToRow(service));
  return await supabaseUpsert<ServiceRow[]>("services", defaults, "id");
}

export async function readServicesMap() {
  try {
    const rows = await ensureDefaultServicesIfEmpty();
    const result: Record<string, ServiceItem> = {};
    for (const row of rows || []) {
      const item = rowToService(row);
      result[item.id] = item;
    }
    return Object.keys(result).length ? result : { ...DEFAULT_SERVICES };
  } catch {
    return { ...DEFAULT_SERVICES };
  }
}

export async function saveServicesMap(input: Record<string, ServiceItem>) {
  const items = Object.values(input).map((item) => sanitizeService(item));
  const rows = items.map((item) => serviceToRow(item));
  const saved = await supabaseUpsert<ServiceRow[]>("services", rows, "id");
  const result: Record<string, ServiceItem> = {};
  for (const row of saved || []) {
    const item = rowToService(row);
    result[item.id] = item;
  }
  return result;
}

export async function readServicesList(includeInactive = false) {
  const map = await readServicesMap();
  const list = Object.values(map).sort((a, b) => a.name.localeCompare(b.name, "it"));
  return includeInactive ? list : list.filter((item) => item.active);
}

export async function getServiceById(serviceId: string) {
  const id = String(serviceId || "").trim().toLowerCase();
  if (!id) return null;
  try {
    const rows = await supabaseSelect<ServiceRow[]>("services", {
      select: "id,name,duration_min,price,active",
      id: `eq.${id}`,
      limit: 1,
    });
    const row = rows?.[0];
    return row ? rowToService(row) : null;
  } catch {
    const map = await readServicesMap();
    return map[id] || null;
  }
}

export async function upsertService(input: Partial<ServiceItem>) {
  const item = sanitizeService(input, input.id);
  const saved = await supabaseUpsert<ServiceRow[]>("services", [serviceToRow(item)], "id");
  const row = saved?.[0];
  return row ? rowToService(row) : item;
}

async function findBookingReferences(serviceId: string) {
  try {
    const rows = await supabaseSelect<BookingRefRow[]>("bookings", {
      select: "id,status",
      service_id: `eq.${serviceId}`,
      limit: 500,
    });

    const active = (rows || []).filter((row) => String(row.status || "confirmed") !== "cancelled");
    return {
      activeCount: active.length,
      totalCount: (rows || []).length,
    };
  } catch {
    return {
      activeCount: 0,
      totalCount: 0,
    };
  }
}

export async function deleteService(serviceId: string) {
  const id = String(serviceId || "").trim().toLowerCase();
  if (!id) throw new Error("Servizio mancante");

  const all = await readServicesList(true);
  if ((all || []).length <= 1) {
    throw new Error("Deve rimanere almeno un servizio nel sistema");
  }

  const refs = await findBookingReferences(id);

  if (refs.activeCount > 0) {
    await supabasePatch("services", { id }, { active: false });
    return {
      deleted: false,
      deactivated: true,
      activeReferenced: true,
      historicalReferenced: refs.totalCount > refs.activeCount,
    };
  }

  try {
    await supabaseDelete("services", { id });
    return {
      deleted: true,
      deactivated: false,
      activeReferenced: false,
      historicalReferenced: refs.totalCount > 0,
    };
  } catch (error: any) {
    const message = String(error?.message || "").toLowerCase();
    const likelyReferenced =
      message.includes("foreign key") ||
      message.includes("violates") ||
      message.includes("constraint") ||
      message.includes("bookings") ||
      message.includes("appointments");

    if (!likelyReferenced) {
      throw error;
    }

    throw new Error(
      "Il servizio è ancora collegato allo storico. Esegui prima il fix SQL con ON DELETE SET NULL per permettere la rimozione definitiva."
    );
  }
}
