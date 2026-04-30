export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { deleteBooking } from "@/lib/admin-calendar";
import { requireAdmin } from "@/lib/admin-auth";

export async function DELETE(_req: Request, { params }: { params: { eventId: string } }) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const booking = await deleteBooking(params.eventId);

    if (!booking) {
      return NextResponse.json({ error: "Appuntamento non trovato" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      status: "cancelled",
      booking,
    });
  } catch (error: any) {
    console.error("Admin bookings DELETE error:", error);
    return NextResponse.json({ error: error?.message || "Errore durante l'annullamento" }, { status: 500 });
  }
}
