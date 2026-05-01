import { DateTime } from "luxon";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSalonId } from "@/lib/salon";

export type AppointmentRecordInput = {
  eventId: string;
  calendarId: string;
  customerName: string;
  phone: string;
  serviceId: string;
  serviceName: string;
  collaboratorId?: string;
  collaboratorName?: string;
  notes?: string;
  price?: number;
  date: string;
  time: string;
  startISO: string;
  endISO: string;
  peopleCount?: number;
  groupLabel?: string;
  recurrenceLabel?: string;
  recurringRuleId?: string;
  status?: string;
};

export type AppointmentRecord = {
  id: string;
  eventId: string;
  calendarId: string;
  customerName: string;
  phone: string;
  serviceId: string;
  serviceName: string;
  collaboratorId: string;
  collaboratorName: string;
  notes: string;
  price: number;
  date: string;
  time: string;
  startISO: string;
  endISO: string;
  peopleCount: number;
  groupLabel: string;
  recurrenceLabel: string;
  recurringRuleId: string;
  status: string;
  createdAt?: string;
};

type AppointmentRow = {
  id: string;
  salon_id?: string | null;

  event_id?: string | null;
  google_event_id?: string | null;
  calendar_id?: string | null;

  customer_name: string;
  phone?: string | null;
  customer_phone?: string | null;
  customer_names?: string[] | null;

  service_id: string;
  service_name?: string | null;

  collaborator_id: string | null;
  collaborator_name?: string | null;

  notes?: string | null;
  price?: number | string | null;

  date?: string | null;
  time?: string | null;
  date_iso?: string | null;
  start_time?: string | null;
  end_time?: string | null;

  start_iso?: string | null;
  end_iso?: string | null;

  people_count?: number | null;
  group_label?: string | null;
  recurrence_label?: string | null;

  recurring_rule_id?: string | null;
  status?: string | null;
  created_at?: string | null;
};

function normalizePhone(phone: string) {
  return String(phone || "").replace(/[^\d+]/g, "");
}

function toWhatsappUrl(phone: string) {
  const cleaned = normalizePhone(phone);
  if (!cleaned) return "";
  const international = cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;
  return `https://wa.me/${international}`;
}

function toIsoIfPossible(date: string, time: string) {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: "Europe/Rome" });
  return dt.isValid ? dt.toISO() : null;
}

function addMinutesIso(startISO: string, minutes: number) {
  const dt = DateTime.fromISO(startISO, { zone: "Europe/Rome" });
  return dt.isValid ? dt.plus({ minutes }).toISO() : null;
}

function fallbackServiceName(serviceId: string) {
  switch (String(serviceId || "").trim().toLowerCase()) {
    case "barba":
      return "Barba";
    case "taglio":
      return "Taglio";
    case "barba_taglio":
      return "Barba + Taglio";
    default:
      return String(serviceId || "").trim();
  }
}

function coalescePhone(row: AppointmentRow) {
  return String(row.phone || row.customer_phone || "").trim();
}

function coalesceEventId(row: AppointmentRow) {
  return String(row.event_id || row.google_event_id || row.id || "").trim();
}

function coalesceCalendarId(row: AppointmentRow) {
  return String(row.calendar_id || "primary").trim();
}

function coalesceServiceName(row: AppointmentRow) {
  return String(row.service_name || fallbackServiceName(row.service_id) || "").trim();
}

function coalesceCollaboratorName(row: AppointmentRow) {
  return String(row.collaborator_name || row.collaborator_id || "").trim();
}

function coalesceDate(row: AppointmentRow) {
  return String(row.date || row.date_iso || "").trim();
}

function coalesceTime(row: AppointmentRow) {
  return String(row.time || row.start_time || "").trim();
}

function coalesceStartISO(row: AppointmentRow) {
  if (row.start_iso) return String(row.start_iso).trim();

  const date = coalesceDate(row);
  const time = coalesceTime(row);
  const computed = date && time ? toIsoIfPossible(date, time) : null;

  return computed || "";
}

function coalesceEndISO(row: AppointmentRow) {
  if (row.end_iso) return String(row.end_iso).trim();

  const startISO = coalesceStartISO(row);
  if (!startISO) return "";

  if (row.end_time && coalesceDate(row)) {
    const computed = toIsoIfPossible(coalesceDate(row), String(row.end_time).trim());
    if (computed) return computed;
  }

  return addMinutesIso(startISO, 30) || "";
}

function rowToRecord(row: AppointmentRow): AppointmentRecord {
  return {
    id: row.id,
    eventId: coalesceEventId(row),
    calendarId: coalesceCalendarId(row),
    customerName: String(row.customer_name || "").trim(),
    phone: coalescePhone(row),
    serviceId: String(row.service_id || "").trim(),
    serviceName: coalesceServiceName(row),
    collaboratorId: String(row.collaborator_id || "").trim(),
    collaboratorName: coalesceCollaboratorName(row),
    notes: String(row.notes || "").trim(),
    price: Number(row.price || 0),
    date: coalesceDate(row),
    time: coalesceTime(row),
    startISO: coalesceStartISO(row),
    endISO: coalesceEndISO(row),
    peopleCount: Math.max(1, Number(row.people_count || 1)),
    groupLabel: String(row.group_label || "").trim(),
    recurrenceLabel: String(row.recurrence_label || "").trim(),
    recurringRuleId: String(row.recurring_rule_id || "").trim(),
    status: String(row.status || "confirmed").trim(),
    createdAt: row.created_at || undefined,
  };
}

function inputToRow(input: AppointmentRecordInput) {
  const normalizedDate = String(input.date || "").trim();
  const normalizedTime = String(input.time || "").trim();

  const startISO = String(input.startISO || "").trim();
  const endISO = String(input.endISO || "").trim();

  const startDt = DateTime.fromISO(startISO, { zone: "Europe/Rome" });
  const endDt = DateTime.fromISO(endISO, { zone: "Europe/Rome" });

  const startTime =
    normalizedTime ||
    (startDt.isValid ? startDt.toFormat("HH:mm") : "");

  const endTime =
    endDt.isValid ? endDt.toFormat("HH:mm") : "";

  return {
    salon_id: getSalonId(),
    event_id: String(input.eventId || "").trim(),
    google_event_id: String(input.eventId || "").trim(),
    calendar_id: String(input.calendarId || "").trim() || "primary",

    customer_name: String(input.customerName || "").trim(),
    phone: String(input.phone || "").trim(),
    customer_phone: String(input.phone || "").trim(),
    customer_names: [String(input.customerName || "").trim()].filter(Boolean),

    service_id: String(input.serviceId || "").trim(),
    service_name: String(input.serviceName || "").trim(),

    collaborator_id: String(input.collaboratorId || "").trim() || null,
    collaborator_name: String(input.collaboratorName || "").trim() || null,

    notes: String(input.notes || "").trim() || null,
    price: Number(input.price || 0),

    date: normalizedDate,
    time: startTime,
    date_iso: normalizedDate,
    start_time: startTime,
    end_time: endTime,

    start_iso: startISO || null,
    end_iso: endISO || null,

    people_count: Math.max(1, Number(input.peopleCount || 1)),
    group_label: String(input.groupLabel || "").trim() || null,
    recurrence_label: String(input.recurrenceLabel || "").trim() || null,
    recurring_rule_id: String(input.recurringRuleId || "").trim() || null,

    status: String(input.status || "confirmed").trim(),
  };
}

export function appointmentToDashboardItem(item: AppointmentRecord) {
  const start = DateTime.fromISO(item.startISO, { zone: "Europe/Rome" });
  const end = DateTime.fromISO(item.endISO, { zone: "Europe/Rome" });

  return {
    id: item.eventId,
    summary: `${item.serviceName} - ${item.customerName}`,
    serviceId: item.serviceId,
    serviceName: item.serviceName,
    collaboratorId: item.collaboratorId,
    collaboratorName: item.collaboratorName,
    calendarId: item.calendarId,
    customerName: item.customerName,
    phone: item.phone,
    notes: item.notes,
    price: item.price,
    startISO: item.startISO,
    endISO: item.endISO,
    recurrenceLabel: item.recurrenceLabel,
    recurringRuleId: item.recurringRuleId,
    startLabel: start.isValid ? start.toFormat("HH:mm") : item.time,
    endLabel: end.isValid ? end.toFormat("HH:mm") : "",
    dateLabel: start.isValid
      ? start.setLocale("it").toFormat("cccc dd LLLL yyyy")
      : item.date,
    whatsappUrl: toWhatsappUrl(item.phone),
  };
}

export async function upsertAppointmentRecord(
  input: AppointmentRecordInput
): Promise<AppointmentRecord> {
  const payload = inputToRow(input);

  const { data, error } = await supabaseAdmin
    .from("appointments")
    .upsert(payload, { onConflict: "event_id" })
    .select("*")
    .single();

  if (error) throw error;

  return rowToRecord(data as AppointmentRow);
}

export async function createAppointmentRecord(
  input: AppointmentRecordInput
): Promise<AppointmentRecord> {
  return upsertAppointmentRecord(input);
}

export async function listAppointmentsByDate(
  date: string
): Promise<AppointmentRecord[]> {
  const normalized = String(date || "").trim();

  const { data, error } = await supabaseAdmin
    .from("appointments")
    .select("*")
    .eq("salon_id", getSalonId())
    .or(`date.eq.${normalized},date_iso.eq.${normalized}`)
    .order("start_iso", { ascending: true });

  if (error) throw error;

  return ((data || []) as AppointmentRow[]).map(rowToRecord);
}

export async function listAppointmentsInRange(
  fromISO: string,
  toISO: string
): Promise<AppointmentRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("appointments")
    .select("*")
    .eq("salon_id", getSalonId())
    .gte("start_iso", fromISO)
    .lt("start_iso", toISO)
    .order("start_iso", { ascending: true });

  if (error) throw error;

  return ((data || []) as AppointmentRow[]).map(rowToRecord);
}

export async function listAllAppointments(): Promise<AppointmentRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("appointments")
    .select("*")
    .eq("salon_id", getSalonId())
    .order("start_iso", { ascending: false });

  if (error) throw error;

  return ((data || []) as AppointmentRow[]).map(rowToRecord);
}

export async function listAppointmentsForCollaboratorInRange(
  collaboratorId: string,
  fromISO: string,
  toISO: string
): Promise<AppointmentRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("appointments")
    .select("*")
    .eq("salon_id", getSalonId())
    .eq("collaborator_id", collaboratorId)
    .gte("start_iso", fromISO)
    .lt("start_iso", toISO)
    .order("start_iso", { ascending: true });

  if (error) throw error;

  return ((data || []) as AppointmentRow[]).map(rowToRecord);
}

export async function deleteAppointmentRecord(eventId: string): Promise<void> {
  const normalized = String(eventId || "").trim();
  if (!normalized) return;

  const { error } = await supabaseAdmin
    .from("appointments")
    .delete()
    .eq("salon_id", getSalonId())
    .or(`event_id.eq.${normalized},google_event_id.eq.${normalized}`);

  if (error) throw error;
}

export async function getAppointmentByEventId(eventId: string): Promise<AppointmentRecord | null> {
  const normalized = String(eventId || "").trim();
  if (!normalized) return null;

  const { data, error } = await supabaseAdmin
    .from("appointments")
    .select("*")
    .eq("salon_id", getSalonId())
    .or(`event_id.eq.${normalized},google_event_id.eq.${normalized}`)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToRecord(data as AppointmentRow) : null;
}

export async function listAppointmentsByRecurringRuleId(recurringRuleId: string): Promise<AppointmentRecord[]> {
  const normalized = String(recurringRuleId || "").trim();
  if (!normalized) return [];

  const { data, error } = await supabaseAdmin
    .from("appointments")
    .select("*")
    .eq("salon_id", getSalonId())
    .eq("recurring_rule_id", normalized)
    .order("start_iso", { ascending: true });

  if (error) throw error;
  return ((data || []) as AppointmentRow[]).map(rowToRecord);
}

export async function deleteAppointmentsByRecurringRuleId(recurringRuleId: string): Promise<void> {
  const normalized = String(recurringRuleId || "").trim();
  if (!normalized) return;

  const { error } = await supabaseAdmin
    .from("appointments")
    .delete()
    .eq("salon_id", getSalonId())
    .eq("recurring_rule_id", normalized);

  if (error) throw error;
}
