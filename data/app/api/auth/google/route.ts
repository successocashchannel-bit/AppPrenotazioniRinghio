import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: false, message: "Google disattivato in questa versione." }, { status: 410 });
}
