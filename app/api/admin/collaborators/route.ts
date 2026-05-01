export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, collaborators: [] });
}

export async function POST() {
  return NextResponse.json({ ok: true, collaborator: null, collaborators: [] });
}

export async function DELETE() {
  return NextResponse.json({ ok: true, collaborators: [] });
}
