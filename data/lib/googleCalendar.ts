export const TIME_ZONE = "Europe/Rome";

export function isGoogleCalendarConfigured() {
  return false;
}

export async function getBusyIntervals(
  _timeMinISO: string,
  _timeMaxISO: string
): Promise<{ startMs: number; endMs: number }[]> {
  return [];
}

export async function createBookingEvent(_args: {
  summary: string;
  description?: string;
  startDateTimeLocal: string;
  endDateTimeLocal: string;
}) {
  return null;
}

export async function deleteBookingEvent(_eventId: string) {
  return { ok: true, skipped: true };
}
