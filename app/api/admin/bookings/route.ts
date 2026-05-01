export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { listBookings, TIME_ZONE } from "@/lib/admin-calendar";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(req: Request) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const range = searchParams.get("range") || "day";

    const base = date ? DateTime.fromISO(date, { zone: TIME_ZONE }) : DateTime.now().setZone(TIME_ZONE);

    if (!base.isValid) {
      return NextResponse.json({ error: "Data non valida" }, { status: 400 });
    }

    const from = range === "month" ? base.startOf("month") : base.startOf("day");
    const to = range === "week" ? from.plus({ days: 7 }) : range === "month" ? from.plus({ months: 1 }) : from.plus({ days: 1 });

    const bookings = await listBookings(from.toISO()!, to.toISO()!);

    return NextResponse.json({ ok: true, range, date: from.toISODate(), total: bookings.length, bookings });
  } catch (error: any) {
    console.error("Admin bookings GET error:", error);
    return NextResponse.json({ error: error?.message || "Errore nel recupero appuntamenti" }, { status: 500 });
  }
}
