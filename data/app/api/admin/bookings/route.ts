export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { listBookings, TIME_ZONE, createAdminBooking, createRecurringAdminBookings, deleteBooking, deleteRecurringSeries, editRecurringSeriesNotes } from "@/lib/admin-calendar";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(req: Request) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const range = searchParams.get("range") || "day";
    const all = searchParams.get("all") === "1";

    const base = date ? DateTime.fromISO(date, { zone: TIME_ZONE }) : DateTime.now().setZone(TIME_ZONE);

    if (!base.isValid) {
      return NextResponse.json({ error: "Data non valida" }, { status: 400 });
    }

    const from = all ? base.startOf("day") : range === "month" ? base.startOf("month") : base.startOf("day");
    const to = all ? DateTime.now().setZone(TIME_ZONE).plus({ years: 2 }).endOf("day") : range === "week" ? from.plus({ days: 7 }) : range === "month" ? from.plus({ months: 1 }) : from.plus({ days: 1 });

    const bookings = await listBookings(from.toISO()!, to.toISO()!);

    return NextResponse.json({ ok: true, range, date: from.toISODate(), total: bookings.length, bookings });
  } catch (error: any) {
    console.error("Admin bookings GET error:", error);
    return NextResponse.json({ error: error?.message || "Errore nel recupero appuntamenti" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const payload = {
      name: String(body?.name || "").trim(),
      phone: String(body?.phone || "").trim(),
      date: String(body?.date || "").trim(),
      time: String(body?.time || "").trim(),
      serviceId: String(body?.serviceId || "").trim(),
      notes: String(body?.notes || "").trim(),
    };

    const repeatEnabled = Boolean(body?.repeatEnabled);
    const occurrences = Math.max(1, Number(body?.occurrences) || 1);
    const every = Math.max(1, Number(body?.every) || 1);
    const unit = String(body?.unit || "weeks") as "days" | "weeks" | "months";

    if (repeatEnabled && occurrences > 1) {
      const result = await createRecurringAdminBookings({
        ...payload,
        every,
        unit,
        occurrences,
      });

      return NextResponse.json({ ok: true, recurring: true, ...result });
    }

    const booking = await createAdminBooking(payload);
    return NextResponse.json({ ok: true, booking, recurring: false });
  } catch (error: any) {
    console.error("Admin bookings POST error:", error);
    return NextResponse.json({ error: error?.message || "Errore creazione appuntamento" }, { status: 500 });
  }
}


export async function DELETE(req: Request) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const url = new URL(req.url);
    let id = url.searchParams.get("id") || "";

    if (!id) {
      try {
        const body = await req.json();
        id = String(body?.id || "").trim();
      } catch {}
    }

    if (!id) {
      return NextResponse.json({ error: "ID appuntamento mancante" }, { status: 400 });
    }

    const seriesId = url.searchParams.get("seriesId") || "";

    if (seriesId) {
      const bookings = await deleteRecurringSeries(seriesId);
      return NextResponse.json({ ok: true, status: "cancelled", recurring: true, bookings });
    }

    const booking = await deleteBooking(id);

    if (!booking) {
      return NextResponse.json({ error: "Appuntamento non trovato" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, status: "cancelled", booking, recurring: false });
  } catch (error: any) {
    console.error("Admin bookings DELETE error:", error);
    return NextResponse.json({ error: error?.message || "Errore durante l'annullamento" }, { status: 500 });
  }
}


export async function PUT(req: Request) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const seriesId = String(body?.seriesId || "").trim();
    const notes = String(body?.notes || "").trim();

    if (!seriesId) {
      return NextResponse.json({ error: "ID serie mancante" }, { status: 400 });
    }

    const bookings = await editRecurringSeriesNotes(seriesId, notes);
    return NextResponse.json({ ok: true, recurring: true, bookings });
  } catch (error: any) {
    console.error("Admin bookings PUT error:", error);
    return NextResponse.json({ error: error?.message || "Errore aggiornamento ricorrenza" }, { status: 500 });
  }
}
