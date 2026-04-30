import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: false, message: "Callback Google non disponibile." }, { status: 410 });
}
