export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { deleteBooking } from "@/lib/admin-calendar";
import { requireAdmin } from "@/lib/admin-auth";

export async function DELETE(req: Request, { params }: { params: { eventId: string } }) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(req.url);
    const calendarId = searchParams.get("calendarId") || undefined;
    const scope = searchParams.get("scope") === "series" ? "series" : "single";
    const result = await deleteBooking(params.eventId, calendarId, scope);
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error("Admin bookings DELETE error:", error);
    return NextResponse.json({ error: error?.message || "Errore durante l'eliminazione" }, { status: 500 });
  }
}
