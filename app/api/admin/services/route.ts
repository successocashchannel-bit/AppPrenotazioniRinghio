export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { invalidateAllSalonSlotCaches } from "@/lib/slot-cache";
import { deleteService, readServicesList, upsertService } from "@/lib/services";

export async function GET() {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;
  const services = await readServicesList(true);
  return NextResponse.json({ ok: true, services });
}

export async function POST(req: Request) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;
  try {
    const body = await req.json();
    const service = await upsertService(body);
    invalidateAllSalonSlotCaches();
    const services = await readServicesList(true);
    return NextResponse.json({ ok: true, service, services });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Errore salvataggio servizio" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id") || "";
    if (!id) return NextResponse.json({ error: "Servizio mancante" }, { status: 400 });
    await deleteService(id);
    invalidateAllSalonSlotCaches();
    const services = await readServicesList(true);
    return NextResponse.json({ ok: true, services });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Errore eliminazione servizio" }, { status: 500 });
  }
}
