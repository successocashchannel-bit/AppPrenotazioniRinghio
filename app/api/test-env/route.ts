export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: !!process.env.GOOGLE_REDIRECT_URI,
    GOOGLE_REFRESH_TOKEN: !!process.env.GOOGLE_REFRESH_TOKEN,
    CALENDAR_ID: !!process.env.CALENDAR_ID,
  });
}