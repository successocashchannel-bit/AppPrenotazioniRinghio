export function createBookingId(date: string, time: string) {
  // Example: RB-20260219-1030-AB12
  const clean = time.replace(":", "");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RB-${date.replace(/-/g, "")}-${clean}-${rand}`;
}
