"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

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

export default function GestionaleCalendarioPage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

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
    checkAuth();
  }, []);

  useEffect(() => {
    if (!authenticated) return;

    async function loadInitialData() {
      try {
        const [servicesRes, collaboratorsRes] = await Promise.all([
          fetch("/api/public/services"),
          fetch("/api/public/collaborators"),
        ]);

        const servicesData = await safeJson<{ ok: boolean; services: Service[] }>(servicesRes);
        const collaboratorsData = await safeJson<{ ok: boolean; collaborators: Collaborator[] }>(collaboratorsRes);

        setServices(servicesData.services || []);
        setCollaborators(collaboratorsData.collaborators || []);
        setServiceId((prev) => prev || servicesData.services?.[0]?.id || "");
      } catch (e: any) {
        setMessage(e?.message || "Errore caricamento dati iniziali");
      } finally {
        setServicesLoading(false);
        setCollaboratorsLoading(false);
      }
    }

    loadInitialData();
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated || !serviceId) return;

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
  }, [authenticated, date, serviceId, preferredCollaboratorId, peopleCount]);

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

  async function checkAuth() {
    try {
      const res = await fetch("/api/admin/me", { cache: "no-store" });
      const data = await safeJson<{ ok: boolean; authenticated: boolean }>(res);
      setAuthenticated(Boolean(data.authenticated));
    } catch {
      setAuthenticated(false);
    }
  }

  async function login() {
    setLoginLoading(true);
    setLoginError("");

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      await safeJson(res);
      setAuthenticated(true);
    } catch (e: any) {
      setLoginError(e?.message || "Errore login");
    } finally {
      setLoginLoading(false);
    }
  }

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
          .join(" | ") ||
        "Operatore";

      setMessage(
        peopleCount > 1
          ? `Prenotazione creata. ${collaboratorSummary}`
          : `Prenotazione creata con successo. ${collaboratorSummary}`
      );

      setSelected("");
      setName("");
      setPhone("");
      setGroupNamesText("");

      const qs = new URLSearchParams({
        date,
        serviceId,
        peopleCount: String(peopleCount),
        adminBypassMinAdvance: "1",
      });

      const requestKey = qs.toString();
      const res = await fetch(`/api/slots?${requestKey}`);
      const slotsData = await safeJson<SlotsResponse>(res);
      const nextState = { slots: slotsData.slots || [], settings: slotsData.settings || null };
      slotsCacheRef.current.set(requestKey, nextState);
      setSlots(nextState.slots);
      setSettings(nextState.settings);
    } catch (e: any) {
      setMessage(e?.message || "Errore prenotazione");
    } finally {
      setBooking(false);
    }
  }

  if (authenticated === null) {
    return <main className="container"><div className="card"><div className="badge info">Caricamento calendario gestionale...</div></div></main>;
  }

  if (!authenticated) {
    return (
      <main className="container" style={{ maxWidth: 460 }}>
        <header className="hero">
          <div className="brand">
            <div className="title">Accesso admin</div>
            <p className="subtitle">Entra per usare il calendario manuale del gestionale</p>
          </div>
        </header>

        <section className="card">
          <div className="grid">
            {loginError && <div className="badge error">{loginError}</div>}

            <div>
              <label>Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>

            <div>
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            <button className="btn" onClick={login} disabled={loginLoading}>
              {loginLoading ? "Accesso..." : "Accedi"}
            </button>

            <Link href="/gestionale" className="tabBtn" style={{ textAlign: "center" }}>
              Torna al gestionale
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="container">
      <header className="hero leftHero" style={{ marginBottom: 18 }}>
        <div className="brand leftBrand" style={{ width: "100%" }}>
          <div className="title">Calendario gestionale</div>
                  </div>
      </header>

      <section className="card" style={{ marginBottom: 18 }}>
        <div className="tabRow" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div className="tabRow">
            <Link href="/gestionale" className="tabBtn">Dashboard</Link>
            <Link href="/gestionale/calendario" className="tabBtn activeTab">Calendario</Link>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="grid">
          {message && <div className={message.toLowerCase().includes("errore") ? "badge error" : "badge ok"}>{message}</div>}

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

          <button className="btn" onClick={submit} disabled={booking || !service}>
            {booking ? "Prenotazione in corso..." : peopleCount > 1 ? `Prenota per ${peopleCount} persone` : "Prenota ora"}
          </button>

          <div className="badge info">Orari: {hoursLabel(settings)}</div>
        </div>
      </section>
    </main>
  );
}
