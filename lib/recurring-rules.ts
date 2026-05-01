import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSalonId } from "@/lib/salon";

export type RecurringRuleRecord = {
  id?: string;
  customerName: string;
  phone: string;
  serviceId: string;
  collaboratorId: string;
  startDate: string;
  time: string;
  every: number;
  unit: "days" | "weeks" | "months";
  occurrences: number | null;
  notes?: string;
  recurrenceLabel: string;
  createdEventIds: string[];
};

type RecurringRuleRow = {
  id?: string;
  salon_id?: string | null;
  customer_name: string;
  phone: string;
  service_id: string;
  collaborator_id: string;
  start_date: string;
  time: string;
  every: number;
  unit: "days" | "weeks" | "months";
  occurrences: number | null;
  frequency_type?: "days" | "weeks" | "months" | null;
  frequency_interval?: number | null;
  notes: string | null;
  recurrence_label: string;
  created_event_ids: string[] | null;
  created_at?: string;
};

function buildRow(record: RecurringRuleRecord, mode: "modern" | "legacy" | "hybrid"): Record<string, unknown> {
  const base = {
    salon_id: getSalonId(),
    customer_name: record.customerName,
    phone: record.phone,
    service_id: record.serviceId,
    collaborator_id: record.collaboratorId,
    start_date: record.startDate,
    time: record.time,
    every: record.every,
    unit: record.unit,
    occurrences: typeof record.occurrences === "number" ? record.occurrences : null,
    notes: String(record.notes || "").trim() || null,
    recurrence_label: record.recurrenceLabel,
    created_event_ids: record.createdEventIds || [],
  } satisfies Record<string, unknown>;

  if (mode === "modern") {
    return { ...base, frequency_type: record.unit };
  }
  if (mode === "legacy") {
    return { ...base, frequency_type: record.unit, frequency_interval: record.every };
  }
  return { ...base, frequency_type: record.unit, frequency_interval: record.every };
}

function isMissingColumnError(error: any, columnName: string) {
  const msg = String(error?.message || error?.details || error?.hint || "").toLowerCase();
  return msg.includes(columnName.toLowerCase()) && msg.includes("column")
}

async function insertRecurringRuleRow(payload: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin.from("recurring_rules").insert(payload).select("*").limit(1);
  if (error) throw error;
  return (data || [])[0];
}

export async function createRecurringRule(record: RecurringRuleRecord) {
  try {
    return await insertRecurringRuleRow(buildRow(record, "hybrid"));
  } catch (error: any) {
    if (isMissingColumnError(error, "frequency_interval")) {
      return await insertRecurringRuleRow(buildRow(record, "modern"));
    }
    if (isMissingColumnError(error, "frequency_type")) {
      return await insertRecurringRuleRow(buildRow(record, "legacy"));
    }
    throw error;
  }
}

export async function updateRecurringRuleMeta(id: string, patch: { createdEventIds?: string[]; unit?: "days" | "weeks" | "months"; every?: number }) {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) return;

  const modernPayload: Record<string, unknown> = {};
  if (Array.isArray(patch.createdEventIds)) modernPayload.created_event_ids = patch.createdEventIds;
  if (patch.unit) modernPayload.frequency_type = patch.unit;

  const legacyPayload: Record<string, unknown> = { ...modernPayload };
  if (typeof patch.every === "number" && Number.isFinite(patch.every)) legacyPayload.frequency_interval = patch.every;

  try {
    const { error } = await supabaseAdmin.from("recurring_rules").update(legacyPayload).eq("salon_id", getSalonId()).eq("id", normalizedId);
    if (error) throw error;
    return;
  } catch (error: any) {
    if (isMissingColumnError(error, "frequency_interval")) {
      const { error: retryError } = await supabaseAdmin.from("recurring_rules").update(modernPayload).eq("salon_id", getSalonId()).eq("id", normalizedId);
      if (retryError) throw retryError;
      return;
    }
    throw error;
  }
}

export async function listRecurringRules() {
  const { data, error } = await supabaseAdmin.from("recurring_rules").select("*").eq("salon_id", getSalonId()).order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getRecurringRuleById(id: string) {
  const { data, error } = await supabaseAdmin.from("recurring_rules").select("*").eq("salon_id", getSalonId()).eq("id", id).limit(1).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function deleteRecurringRule(id: string) {
  const { error } = await supabaseAdmin.from("recurring_rules").delete().eq("salon_id", getSalonId()).eq("id", id);
  if (error) throw error;
}

export async function getRecurringRuleByEventId(eventId: string) {
  const normalized = String(eventId || "").trim();
  if (!normalized) return null;

  const { data, error } = await supabaseAdmin
    .from("recurring_rules")
    .select("*")
    .eq("salon_id", getSalonId())
    .contains("created_event_ids", [normalized])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}
