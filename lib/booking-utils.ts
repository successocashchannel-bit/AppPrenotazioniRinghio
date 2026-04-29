import { DateTime } from "luxon";

export const TIME_ZONE = "Europe/Rome";

export function pad(n: number) {
  return String(Math.floor(n)).padStart(2, "0");
}

export function isClosedDay(dateStr: string) {
  const date = DateTime.fromISO(dateStr, { zone: TIME_ZONE });
  const day = date.weekday; // 1=lunedì ... 7=domenica
  return day === 1 || day === 7;
}

export function makeRomeDateTime(dateStr: string, timeStr: string) {
  return DateTime.fromISO(`${dateStr}T${timeStr}`, {
    zone: TIME_ZONE,
  });
}

export function addMinutesToISO(isoString: string, minutes: number) {
  return DateTime.fromISO(isoString, { zone: TIME_ZONE })
    .plus({ minutes })
    .toISO();
}

export function overlaps(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date
) {
  return startA < endB && endA > startB;
}

export function generateSlots(
  dateStr: string,
  startHour: number,
  endHour: number,
  stepMin: number
) {
  const slots: string[] = [];

  const startHourInt = Math.floor(startHour);
  const startMinutes = Math.round((startHour % 1) * 60);

  let current = DateTime.fromISO(
    `${dateStr}T${pad(startHourInt)}:${pad(startMinutes)}`,
    { zone: TIME_ZONE }
  );

  const endHourInt = Math.floor(endHour);
  const endMinutes = Math.round((endHour % 1) * 60);

  const end = DateTime.fromISO(
    `${dateStr}T${pad(endHourInt)}:${pad(endMinutes)}`,
    { zone: TIME_ZONE }
  );

  while (current < end) {
    slots.push(current.toFormat("HH:mm"));
    current = current.plus({ minutes: stepMin });
  }

  return slots;
}