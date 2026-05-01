"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Service = { id: string; name: string; durationMin: number; price: number; active: boolean };
type Collaborator = { id: string; name: string; active: boolean; calendarId?: string };

type Settings = {
  slotIntervalMin: 15 | 30;
  minAdvanceMin?: number;
  closedWeekdays?: number[];
  holidays?: string[];
  morningEnabled: boolean;
  morningOpen: string;
  morningClose: string;
  afternoonEnabled: boolean;
  afternoonOpen: string;
  afternoonClose: string;
};

type SlotsResponse = {
  date: string;
  serviceId: string;
  collaboratorId?: string;
  preferredCollaboratorId?: string;
  peopleCount: number;
  slots: string[];
  settings?: Settings;
};

type CachedSlotsState = { slots: string[]; settings: Settings | null };

type BookResponse = {
  bookingId?: string;
  peopleCount?: number;
  bookings?: Array<{ collaboratorName: string; customerName: string }>;
};

function todayISO() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function safeJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error || "Errore server");
  return data as T;
}

function hoursLabel(settings?: Settings | null) {
  if (!settings) return "Caricamento orari...";

  const parts: string[] = [];
  if (settings.morningEnabled) parts.push(`Mattina ${settings.morningOpen}-${settings.morningClose}`);
  if (settings.afternoonEnabled) parts.push(`Pomeriggio ${settings.afternoonOpen}-${settings.afternoonClose}`);
  return parts.join(" · ");
}

export default function AdminBookingCalendar({
  services,
  collaborators,
  onBooked,
}: {
  services: Service[];
  collaborators: Collaborator[];
  onBooked?: () => void;
}) {
  const [serviceId, setServiceId] = useState(services[0]?.id || "");
  const [preferredCollaboratorId, setPreferredCollaboratorId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [peopleCount, setPeopleCount] = useState(1);
  const [slots, setSlots] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [booking, setBooking] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [groupNamesText, setGroupNamesText] = useState("");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState("");
  const slotsCacheRef = useRef<Map<string, CachedSlotsState>>(new Map());
  const slotsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSlotsKeyRef = useRef("");

  useEffect(() => {
    if (!serviceId && services[0]?.id) setServiceId(services[0].id);
  }, [serviceId, services]);

  const service = useMemo(
    () => services.find((s) => s.id === serviceId) || null,
    [services, serviceId]
  );

  const preferredCollaborator = useMemo(
    () => collaborators.find((c) => c.id === preferredCollaboratorId) || null,
    [collaborators, preferredCollaboratorId]
  );

  const parsedGroupNames = useMemo(
    () => groupNamesText.split("\n").map((item) => item.trim()).filter(Boolean),
    [groupNamesText]
  );

  useEffect(() => {
    if (!serviceId) return;

    const qs = new URLSearchParams({
      date,
      serviceId,
      peopleCount: String(peopleCount),
      adminBypassMinAdvance: "1",
    });

    const requestKey = qs.toString();
    latestSlotsKeyRef.current = requestKey;
    setSelected("");
    setMessage("");

    const cached = slotsCacheRef.current.get(requestKey);
    if (cached) {
      setSlots(cached.slots);
      setSettings(cached.settings);
      setLoadingSlots(false);
      return;
    }

    setLoadingSlots(true);

    if (slotsDebounceRef.current) clearTimeout(slotsDebounceRef.current);

    slotsDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/slots?${requestKey}`);
        const data = await safeJson<SlotsResponse>(res);
        const nextState = { slots: data.slots || [], settings: data.settings || null };
        slotsCacheRef.current.set(requestKey, nextState);
        if (latestSlotsKeyRef.current !== requestKey) return;
        setSlots(nextState.slots);
        setSettings(nextState.settings);
      } catch (e: any) {
        if (latestSlotsKeyRef.current !== requestKey) return;
        setSlots([]);
        setSettings(null);
        setMessage(e?.message || "Errore caricamento slot");
      } finally {
        if (latestSlotsKeyRef.current === requestKey) setLoadingSlots(false);
      }
    }, 400);

    return () => {
      if (slotsDebounceRef.current) clearTimeout(slotsDebounceRef.current);
    };
  }, [date, serviceId, preferredCollaboratorId, peopleCount]);

  async function submit() {
    setMessage("");

    if (!selected) {
      setMessage("Seleziona un orario.");
      return;
    }

    if (!name.trim() || !phone.trim()) {
      setMessage("Inserisci nome e telefono.");
      return;
    }

    if (peopleCount > 1 && parsedGroupNames.length === 0) {
      setMessage("Per una prenotazione di gruppo inserisci almeno un nome per persona, uno per riga.");
      return;
    }

    setBooking(true);

    try {
      const data = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId,          date,
          time: selected,
          name: name.trim(),
          phone: phone.trim(),
          notes: "",
          peopleCount,
          customerNames: peopleCount > 1 ? parsedGroupNames : [name.trim()],
          adminBypassMinAdvance: true,
        }),
      }).then(safeJson<BookResponse>);

      const collaboratorSummary =
        data.bookings
          ?.map((item) => `${item.customerName}: ${item.collaboratorName}`)
          .join(" | ") || "Operatore";

      setMessage(`Appuntamento creato con successo. ${service?.name || "Servizio"} · ${date} · ${selected} · ${collaboratorSummary}`);
      setName("");
      setPhone("");
      setGroupNamesText("");
      setSelected("");
      onBooked?.();

      const qs = new URLSearchParams({ date, serviceId, peopleCount: String(peopleCount), adminBypassMinAdvance: "1" });
      const requestKey = qs.toString();
      const res = await fetch(`/api/slots?${requestKey}`);
      const refreshed = await safeJson<SlotsResponse>(res);
      const nextState = { slots: refreshed.slots || [], settings: refreshed.settings || null };
      slotsCacheRef.current.set(requestKey, nextState);
      setSlots(nextState.slots);
      setSettings(nextState.settings);
    } catch (e: any) {
      setMessage(e?.message || "Errore prenotazione");
    } finally {
      setBooking(false);
    }
  }

  return (
    <div className="grid">
      <div className="sectionTitle">Calendario prenotazioni manuali</div>
      {message && <div className={`badge ${message.includes("successo") ? "ok" : "error"}`}>{message}</div>}

      <div className="gridTwoCols">
        <div>
          <label>Numero persone</label>
          <select value={peopleCount} onChange={(e) => setPeopleCount(Number(e.target.value) || 1)}>
            {[1].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "persona" : "persone"}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Servizio</label>
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.durationMin} min · €{s.price})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Data</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div>
        <label>Orari disponibili</label>
        {loadingSlots ? (
          <div className="badge info">Caricamento...</div>
        ) : slots.length === 0 ? (
          <div className="badge info">Nessuno slot disponibile per i criteri selezionati</div>
        ) : (
          <div className="slots">
            {slots.map((t) => (
              <button
                key={t}
                className={`slot ${selected === t ? "active" : ""}`}
                onClick={() => setSelected(t)}
                type="button"
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="gridTwoCols">
        <div>
          <label>Nome referente</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div>
          <label>Telefono referente</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>

      {peopleCount > 1 && (
        <div>
          <label>Nomi persone (uno per riga)</label>
          <textarea
            rows={5}
            value={groupNamesText}
            onChange={(e) => setGroupNamesText(e.target.value)}
            placeholder={`Es.\nMario Rossi\nLuca Bianchi${peopleCount > 2 ? "\nAltri nomi..." : ""}`}
          />
        </div>
      )}

      <div className="bookingActions">
        <button className="btn" onClick={submit} disabled={booking || !service || services.length === 0}>
          {booking ? "Prenotazione in corso..." : peopleCount > 1 ? `Prenota per ${peopleCount} persone` : "Prenota ora"}
        </button>
      </div>

      <div className="badge info">Orari: {hoursLabel(settings)}</div>
    </div>
  );
}
