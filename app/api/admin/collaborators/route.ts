export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { invalidateAllSalonSlotCaches } from "@/lib/slot-cache";
import { deleteCollaborator, readCollaboratorsList, serializeCollaborator, upsertCollaborator } from "@/lib/collaborators";

export async function GET() {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;
  const collaborators = await readCollaboratorsList(true);
  return NextResponse.json({ ok: true, collaborators: collaborators.map(serializeCollaborator) });
}

export async function POST(req: Request) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;
  try {
    const body = await req.json();
    const collaborator = await upsertCollaborator(body);
    invalidateAllSalonSlotCaches();
    const collaborators = await readCollaboratorsList(true);
    return NextResponse.json({ ok: true, collaborator: serializeCollaborator(collaborator), collaborators: collaborators.map(serializeCollaborator) });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Errore salvataggio collaboratore" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id") || "";
    if (!id) return NextResponse.json({ error: "ID collaboratore mancante" }, { status: 400 });
    await deleteCollaborator(id);
    invalidateAllSalonSlotCaches();
    const collaborators = await readCollaboratorsList(true);
    return NextResponse.json({ ok: true, collaborators: collaborators.map(serializeCollaborator) });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Errore eliminazione collaboratore" }, { status: 500 });
  }
}
