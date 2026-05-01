export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";

function disabled() {
  return NextResponse.json(
    {
      ok: false,
      error: "Google Calendar è disattivato in questa versione database-only.",
    },
    { status: 410 }
  );
}

export async function GET() {
  return disabled();
}

export async function POST() {
  return disabled();
}
