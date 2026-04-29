export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { readBusinessSettings, saveBusinessSettings, normalizeSettings } from "@/lib/business-settings";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET() {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const settings = await readBusinessSettings();
    return NextResponse.json({ ok: true, settings });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Errore lettura impostazioni" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const settings = await saveBusinessSettings(normalizeSettings(body));
    return NextResponse.json({ ok: true, settings });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Errore salvataggio impostazioni" }, { status: 500 });
  }
}
