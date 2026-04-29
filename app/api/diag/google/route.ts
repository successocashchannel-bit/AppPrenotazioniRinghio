import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, googleConfigured: false, mode: "database-only" });
}
