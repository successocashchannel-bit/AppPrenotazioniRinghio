"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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
  if (settings.morningEnabled) {
    parts.push(`Mattina ${settings.morningOpen}-${settings.morningClose}`);
  }
  if (settings.afternoonEnabled) {
    parts.push(`Pomeriggio ${settings.afternoonOpen}-${settings.afternoonClose}`);
  }

  return parts.join(" · ");
}

export default function HomePage() {
  const router = useRouter();
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [collaboratorsLoading, setCollaboratorsLoading] = useState(true);
  const [serviceId, setServiceId] = useState("");
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
    async function loadInitialData() {
      try {
        const [servicesRes, collaboratorsRes] = await Promise.all([
          fetch("/api/public/services"),
          fetch("/api/public/collaborators"),
        ]);

        const servicesData = await safeJson<{ ok: boolean; services: Service[] }>(servicesRes);
        const collaboratorsData = await safeJson<{ ok: boolean; collaborators: Collaborator[] }>(collaboratorsRes);

        const loadedCollaborators = collaboratorsData.collaborators || [];
        setServices(servicesData.services || []);
        setCollaborators(loadedCollaborators);
        setPreferredCollaboratorId((prev) => prev || loadedCollaborators[0]?.id || "");
        setServiceId((prev) => prev || servicesData.services?.[0]?.id || "");
      } catch (e: any) {
        setMessage(e?.message || "Errore caricamento dati iniziali");
      } finally {
        setServicesLoading(false);
        setCollaboratorsLoading(false);
      }
    }

    loadInitialData();
  }, []);

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

const selectedService = useMemo(
  () => services.find((s) => s.id === serviceId) || null,
  [services, serviceId]
);

  async function submit() {
    setMessage("");

    if (!selectedService) {
      setMessage("Seleziona un servizio.");
      return;
    }

    if (!selected) {
      setMessage("Seleziona un orario.");
      return;
    }

    if (!name.trim() || !phone.trim()) {
      setMessage("Inserisci nome e telefono.");
      return;
    }

    if (peopleCount > 1 && parsedGroupNames.length < peopleCount) {
      setMessage(`Inserisci  nomi, uno per ogni persona.`);
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
          peopleCount,
          customerNames: peopleCount > 1 ? parsedGroupNames : [name.trim()],
        }),
      }).then(safeJson<BookResponse>);

      const collaboratorSummary =
        data.bookings
          ?.map((item) => `${item.customerName}: ${item.collaboratorName}`)
          .join(" | ") ||
        "Operatore";

      const params = new URLSearchParams({
        service: selectedService?.name || "Servizio",        date,
        time: selected,
        name: peopleCount > 1 ? `${name.trim()} + gruppo` : name.trim(),
        durationMin: String((selectedService?.durationMin || 0) * peopleCount),
      });

      router.push(`/conferma?${params.toString()}`);
    } catch (e: any) {
      setMessage(e?.message || "Errore prenotazione");
    } finally {
      setBooking(false);
    }
  }

  return (
    <main className="container">
<header className="hero">
  <div className="brand">
    <div className="title">Prenotazioni Online</div>
    <p className="subtitle">Prenota il tuo appuntamento in pochi secondi</p>
  </div>
</header>

      <section className="card">
        <div className="grid">
          {message && <div className="badge error">{message}</div>}

          <div>
            <label>Numero persone</label>
            <select value={peopleCount} onChange={(e) => setPeopleCount(Number(e.target.value) || 1)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "persona" : "persone"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Servizio</label>
            {servicesLoading ? (
              <div className="badge info">Caricamento servizi...</div>
            ) : (
              <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.durationMin} min · €{s.price})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label>Data</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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

          <div>
            <label>Nome referente</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <label>Telefono referente</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          {peopleCount > 1 && (
            <div className="fullRow">
              <label>Nomi persone (uno per riga)</label>
              <textarea
                rows={5}
                value={groupNamesText}
                onChange={(e) => setGroupNamesText(e.target.value)}
                placeholder={`Es.\nMario Rossi\nLuca Bianchi${peopleCount > 2 ? "\nAltri nomi..." : ""}`}
              />
            </div>
          )}


          <button className="btn" onClick={submit} disabled={booking || !selectedService}>
            {booking ? "Prenotazione in corso..." : peopleCount > 1 ? `Prenota per ${peopleCount} persone` : "Prenota ora"}
          </button>

          <div className="badge info">Orari: {hoursLabel(settings)}</div>
        </div>
      </section>
    </main>
  );
}