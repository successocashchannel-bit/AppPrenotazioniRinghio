import { google } from "googleapis";

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId) throw new Error("GOOGLE_CLIENT_ID mancante");
  if (!clientSecret) throw new Error("GOOGLE_CLIENT_SECRET mancante");
  if (!redirectUri) throw new Error("GOOGLE_REDIRECT_URI mancante");
  if (!refreshToken) throw new Error("GOOGLE_REFRESH_TOKEN mancante");

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });

  return oauth2Client;
}

function getCalendar() {
  return google.calendar({
    version: "v3",
    auth: getOAuth2Client(),
  });
}

export async function getBusyIntervals(
  timeMinISO: string,
  timeMaxISO: string,
  calendarId?: string
): Promise<{ startMs: number; endMs: number }[]> {
  const targetCalendarId = calendarId || process.env.GOOGLE_CALENDAR_ID || "primary";
  const cal = getCalendar();

  const resp = await cal.freebusy.query({
    requestBody: {
      timeMin: timeMinISO,
      timeMax: timeMaxISO,
      items: [{ id: targetCalendarId }],
    },
  });

  const busy = resp.data.calendars?.[targetCalendarId]?.busy || [];

  return busy.map((b) => ({
    startMs: new Date(b.start!).getTime(),
    endMs: new Date(b.end!).getTime(),
  }));
}

export async function createBookingEvent(args: {
  summary: string;
  description?: string;
  startDateTimeLocal: string;
  endDateTimeLocal: string;
  calendarId?: string;
}) {
  const calendarId = args.calendarId || process.env.GOOGLE_CALENDAR_ID || "primary";
  const cal = getCalendar();

  const res = await cal.events.insert({
    calendarId,
    requestBody: {
      summary: args.summary,
      description: args.description || "",
      start: {
        dateTime: args.startDateTimeLocal,
        timeZone: "Europe/Rome",
      },
      end: {
        dateTime: args.endDateTimeLocal,
        timeZone: "Europe/Rome",
      },
    },
  });

  return res.data.id!;
}

export async function deleteBookingEvent(
  eventId: string,
  calendarId?: string
): Promise<{ ok?: boolean; skipped?: boolean; deleted?: boolean; alreadyDeleted?: boolean }> {
  const normalizedEventId = String(eventId || "").trim();
  if (!normalizedEventId) {
    return { skipped: true };
  }

  const targetCalendarId = calendarId || process.env.GOOGLE_CALENDAR_ID || "primary";
  const cal = getCalendar();

  try {
    await cal.events.delete({
      calendarId: targetCalendarId,
      eventId: normalizedEventId,
    });

    return { ok: true, deleted: true };
  } catch (error: any) {
    const status = Number(error?.code || error?.status || 0);
    if (status === 404) {
      return { ok: true, alreadyDeleted: true };
    }
    throw error;
  }
}
