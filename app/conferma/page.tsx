import Link from "next/link";

function formatDateIT(date: string) {
  if (!date) return "";
  const [y, m, d] = date.split("-");
  if (!y || !m || !d) return date;
  return `${d}/${m}/${y}`;
}

function parseDateTime(date: string, time: string) {
  if (!date || !time) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }

  return { year, month, day, hour, minute };
}

function addMinutes(parts: { year: number; month: number; day: number; hour: number; minute: number }, minutesToAdd: number) {
  const d = new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0);
  d.setMinutes(d.getMinutes() + minutesToAdd);
  return d;
}

function toGoogleCalendarDateTimeLocal(dateObj: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    dateObj.getFullYear().toString() +
    pad(dateObj.getMonth() + 1) +
    pad(dateObj.getDate()) +
    "T" +
    pad(dateObj.getHours()) +
    pad(dateObj.getMinutes()) +
    pad(dateObj.getSeconds())
  );
}

function buildGoogleCalendarUrl(args: {
  title: string;
  description: string;
  date: string;
  time: string;
  durationMin: number;
}) {
  const parsed = parseDateTime(args.date, args.time);
  if (!parsed) return "";

  const start = new Date(parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute, 0, 0);
  const end = addMinutes(parsed, args.durationMin > 0 ? args.durationMin : 30);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: args.title,
    dates: `${toGoogleCalendarDateTimeLocal(start)}/${toGoogleCalendarDateTimeLocal(end)}`,
    details: args.description,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page({ searchParams }: { searchParams: any }) {
  const service = searchParams?.service || "";
  const date = searchParams?.date || "";
  const time = searchParams?.time || "";
  const name = searchParams?.name || "";
  const durationMin = Number(searchParams?.durationMin || 0) || 30;

  const calendarTitle = `${service || "Appuntamento"} - Ringhio BarberShop`;
  const calendarDescription = [
    "Promemoria appuntamento",
    name ? `Cliente: ${name}` : "",
    service ? `Servizio: ${service}` : "",
    date ? `Data: ${formatDateIT(date)}` : "",
    time ? `Ora: ${time}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const googleCalendarUrl = buildGoogleCalendarUrl({
    title: calendarTitle,
    description: calendarDescription,
    date,
    time,
    durationMin,
  });

  return (
    <main className="container">
      <section className="card" style={{ maxWidth: 560, margin: "40px auto" }}>
        <div className="grid" style={{ textAlign: "center", gap: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-ringhio.png"
            width={120}
            height={120}
            style={{ width: 120, height: 120, objectFit: "contain", margin: "0 auto" }}
            alt="Ringhio BarberShop"
          />

          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
              Prenotazione confermata
            </h1>
            <p style={{ marginTop: 8, opacity: 0.8 }}>
              {name ? `Grazie ${name}, il tuo appuntamento è stato registrato.` : "Il tuo appuntamento è stato registrato."}
            </p>
          </div>

          <div style={{ background: "#000", padding: 16, borderRadius: 12, textAlign: "left" }}>
            <div style={{ marginBottom: 8 }}><b>Servizio:</b> {service || "-"}</div>
            <div style={{ marginBottom: 8 }}><b>Data:</b> {formatDateIT(date || "") || "-"}</div>
            <div style={{ marginBottom: 8 }}><b>Ora:</b> {time || "-"}</div>
            <div><b>Durata:</b> {durationMin} min</div>
          </div>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/" className="btn">
              Torna alla home
            </Link>

            {googleCalendarUrl ? (
              <a href={googleCalendarUrl} target="_blank" rel="noreferrer" className="btn">
                Esporta su Google Calendar
              </a>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
