import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: false, token: null, message: "Google non usato in questa versione." }, { status: 410 });
}
