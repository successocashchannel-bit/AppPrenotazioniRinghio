export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { appointmentToDashboardItem, listAllAppointments } from "@/lib/appointments-db";

export async function GET() {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const bookings = await listAllAppointments();
    return NextResponse.json({
      ok: true,
      total: bookings.length,
      bookings: bookings.map(appointmentToDashboardItem),
    });
  } catch (error: any) {
    console.error("Admin history GET error:", error);
    return NextResponse.json(
      { error: error?.message || "Errore nel recupero storico" },
      { status: 500 }
    );
  }
}
