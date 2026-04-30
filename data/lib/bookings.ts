import { DateTime } from "luxon";
import { getServiceById } from "@/lib/services";
import { supabaseDelete, supabaseInsert, supabasePatch, supabaseSelect } from "@/lib/supabase-rest";
import { TIME_ZONE } from "@/lib/business-settings";

export type BookingItem = {
  id: string;
  summary: string;
  serviceId: string;
  serviceName: string;
  customerName: string;
  phone: string;
  notes: string;
  price: number;
  startISO: string;
  endISO: string;
  startLabel: string;
  endLabel: string;
  dateLabel: string;
  whatsappUrl: string;
  bookingDate: string;
  status: string;
  googleEventId: string;
  recurringSeriesId: string;
  recurrenceLabel: string;
};

type BookingRow = {
  id: string;
  customer_name: string;
  phone: string;
  booking_date: string;
  booking_time: string;
  start_at: string;
  end_at: string;
  service_id: string;
  service_name: string;
  price: number;
  notes: string | null;
  status: string;
  summary: string | null;
  google_event_id: string | null;
  recurring_series_id: string | null;
  recurrence_label: string | null;
};

function normalizePhone(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

function toWhatsappUrl(phone: string) {
  const cleaned = normalizePhone(phone);
  if (!cleaned) return "";
  const international = cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;
  return `https://wa.me/${international}`;
}

function rowToBooking(row: BookingRow): BookingItem {
  const start = DateTime.fromISO(row.start_at, { zone: TIME_ZONE });
  const end = DateTime.fromISO(row.end_at, { zone: TIME_ZONE });

  return {
    id: row.id,
    summary: row.summary || `${row.service_name} - ${row.customer_name}`,
    serviceId: row.service_id,
    serviceName: row.service_name,
    customerName: row.customer_name,
    phone: row.phone,
    notes: row.notes || "",
    price: Number(row.price || 0),
    startISO: row.start_at,
    endISO: row.end_at,
    startLabel: start.isValid ? start.toFormat("HH:mm") : "",
    endLabel: end.isValid ? end.toFormat("HH:mm") : "",
    dateLabel: start.isValid ? start.setLocale("it").toFormat("cccc dd LLLL yyyy") : row.booking_date,
    whatsappUrl: toWhatsappUrl(row.phone),
    bookingDate: row.booking_date,
    status: row.status || "confirmed",
    googleEventId: "",
    recurringSeriesId: String(row.recurring_series_id || ""),
    recurrenceLabel: String(row.recurrence_label || ""),
  };
}

const BOOKING_SELECT =
  "id,customer_name,phone,booking_date,booking_time,start_at,end_at,service_id,service_name,price,notes,status,summary,google_event_id,recurring_series_id,recurrence_label";

export async function listBookings(fromISO: string, toISO: string) {
  const rows = await supabaseSelect<BookingRow[]>("bookings", {
    select: BOOKING_SELECT,
    start_at: `gte.${fromISO}`,
    end_at: `lt.${toISO}`,
    status: "neq.cancelled",
    order: "start_at.asc",
  });
  return rows.map(rowToBooking);
}

export async function listBookingsForDate(date: string) {
  const rows = await supabaseSelect<BookingRow[]>("bookings", {
    select: BOOKING_SELECT,
    booking_date: `eq.${date}`,
    status: "neq.cancelled",
    order: "start_at.asc",
  });
  return rows.map(rowToBooking);
}

export async function getBookingById(id: string) {
  const rows = await supabaseSelect<BookingRow[]>("bookings", {
    select: BOOKING_SELECT,
    id: `eq.${id}`,
    limit: 1,
  });
  return rows?.[0] ? rowToBooking(rows[0]) : null;
}

export async function createBooking(input: {
  name: string;
  phone: string;
  date: string;
  time: string;
  serviceId: string;
  notes?: string;
  recurringSeriesId?: string;
  recurrenceLabel?: string;
}) {
  const service = await getServiceById(input.serviceId);
  if (!service || !service.active) throw new Error("Servizio non valido");

  const start = DateTime.fromISO(`${input.date}T${input.time}`, { zone: TIME_ZONE });
  const end = start.plus({ minutes: service.durationMin });
  const summary = `${service.name} - ${input.name}`;
  const notes = String(input.notes || "").trim();

  const rows = await supabaseInsert<BookingRow[]>("bookings", {
    customer_name: input.name,
    phone: input.phone,
    booking_date: input.date,
    booking_time: input.time,
    start_at: start.toISO(),
    end_at: end.toISO(),
    service_id: service.id,
    service_name: service.name,
    price: service.price,
    notes,
    status: "confirmed",
    summary,
    google_event_id: null,
    recurring_series_id: input.recurringSeriesId || null,
    recurrence_label: input.recurrenceLabel || null,
  });

  return rowToBooking(rows[0]);
}

export async function markBookingCancelled(id: string) {
  const booking = await getBookingById(id);
  if (!booking) return null;

  if (booking.status === "cancelled") {
    return booking;
  }

  const rows = await supabasePatch<BookingRow[]>(
    "bookings",
    { id },
    { status: "cancelled", google_event_id: null }
  );

  return rows?.[0]
    ? rowToBooking(rows[0])
    : {
        ...booking,
        status: "cancelled",
        googleEventId: "",
      };
}

export async function hardDeleteBooking(id: string) {
  const booking = await getBookingById(id);
  await supabaseDelete("bookings", { id });
  return booking;
}

export async function listBookingsBySeriesId(seriesId: string) {
  const normalized = String(seriesId || "").trim();
  if (!normalized) return [];
  const rows = await supabaseSelect<BookingRow[]>("bookings", {
    select: BOOKING_SELECT,
    recurring_series_id: `eq.${normalized}`,
    order: "start_at.asc",
  });
  return rows.map(rowToBooking);
}

export async function cancelRecurringSeries(seriesId: string) {
  const normalized = String(seriesId || "").trim();
  if (!normalized) throw new Error("Serie ricorrente non valida");

  const rows = await supabasePatch<BookingRow[]>(
    "bookings",
    { recurring_series_id: normalized },
    { status: "cancelled", google_event_id: null }
  );

  return rows.map(rowToBooking);
}

export async function updateRecurringSeriesNotes(seriesId: string, notes: string) {
  const normalized = String(seriesId || "").trim();
  if (!normalized) throw new Error("Serie ricorrente non valida");

  const rows = await supabasePatch<BookingRow[]>(
    "bookings",
    { recurring_series_id: normalized },
    { notes: String(notes || "").trim() }
  );

  return rows.map(rowToBooking);
}
