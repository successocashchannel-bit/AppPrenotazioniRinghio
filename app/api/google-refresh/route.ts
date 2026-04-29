import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: false, message: "Refresh Google non disponibile." }, { status: 410 });
}
