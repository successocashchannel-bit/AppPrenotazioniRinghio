"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Service = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  active: boolean;
};

type Settings = {
  slotIntervalMin: 15 | 30;
  minAdvanceMin: number;
  morningEnabled: boolean;
  morningOpen: string;
  morningClose: string;
  afternoonEnabled: boolean;
  afternoonOpen: string;
  afternoonClose: string;
  logoUrl?: string;
  brandTitle?: string;
  brandSubtitle?: string;
  updatedAt?: string;
};

type ServicesResponse = {
  ok: boolean;
  services: Service[];
};

type SettingsResponse = {
  ok: boolean;
  settings: Settings;
};

type SlotsResponse = {
  date: string;
  serviceId: string;
  slots: string[];
  settings?: Settings;
  closed?: boolean;
};

type BookResponse = {
  bookingId?: string;
};

declare global {
  interface Window {
    __brandSyncVersion?: string;
  }
}

function todayISO() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function safeJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error || data?.details || "Errore server");
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

function withVersion(url: string | undefined, version: string) {
  if (!url) return "";
  const joiner = url.includes("?") ? "&" : "?";
  return `${url}${joiner}v=${encodeURIComponent(version)}`;
}

function isSafeLogo(url?: string) {
  if (!url) return false;
  const value = String(url).trim();
  if (!value) return false;
  if (value.startsWith("blob:")) return false;
  if (value.startsWith("data:")) return false;
  return value.startsWith("/") || value.startsWith("http://") || value.startsWith("https://");
}

export default function HomePage() {
  const router = useRouter();

  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [slots, setSlots] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [booking, setBooking] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState("");
  const [logoFailed, setLogoFailed] = useState(false);
  const [settingsVersion, setSettingsVersion] = useState(() => String(Date.now()));

  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId) || null,
    [services, serviceId]
  );

  async function loadPublicSettings(forceVersion?: string) {
    const version =
      forceVersion ||
      window.__brandSyncVersion ||
      localStorage.getItem("branding_version") ||
      String(Date.now());

    const res = await fetch(`/api/public/settings?v=${encodeURIComponent(version)}`, {
      cache: "no-store",
    });
    const data = await safeJson<SettingsResponse>(res);
    setSettings(data.settings || null);
    setSettingsVersion(data.settings?.updatedAt || version);
    setLogoFailed(false);
  }

  async function loadServices() {
    setServicesLoading(true);
    try {
      const res = await fetch("/api/public/services", { cache: "no-store" });
      const data = await safeJson<ServicesResponse>(res);
      const list = Array.isArray(data.services) ? data.services.filter((s) => s && s.active !== false) : [];
      setServices(list);

      if (list.length > 0) {
        setServiceId((current) => {
          const currentExists = list.some((s) => s.id === current);
          return currentExists ? current : list[0].id;
        });
      } else {
        setServiceId("");
        setMessage("Nessun servizio disponibile.");
      }
    } catch (error: any) {
      setServices([]);
      setServiceId("");
      setMessage(error?.message || "Errore nel caricamento servizi.");
    } finally {
      setServicesLoading(false);
    }
  }

  async function loadSlots(targetDate: string, targetServiceId: string) {
    if (!targetDate || !targetServiceId) {
      setSlots([]);
      setSelected("");
      return;
    }

    setLoadingSlots(true);
    try {
      const params = new URLSearchParams({
        date: targetDate,
        serviceId: targetServiceId,
      });

      const res = await fetch(`/api/slots?${params.toString()}`, { cache: "no-store" });
      const data = await safeJson<SlotsResponse>(res);
      const nextSlots = Array.isArray(data.slots) ? data.slots : [];
      setSlots(nextSlots);
      setSelected((current) => (nextSlots.includes(current) ? current : ""));
      if (data.settings) {
        setSettings(data.settings);
        setSettingsVersion(data.settings.updatedAt || String(Date.now()));
      }
    } catch (error: any) {
      setSlots([]);
      setSelected("");
      setMessage(error?.message || "Errore nel caricamento slot.");
    } finally {
      setLoadingSlots(false);
    }
  }

  useEffect(() => {
    loadPublicSettings().catch(() => {});
    loadServices().catch(() => {});
  }, []);

  useEffect(() => {
    const syncBranding = () =>
      loadPublicSettings(
        window.__brandSyncVersion || localStorage.getItem("branding_version") || undefined
      ).catch(() => {});

    const onStorage = (e: StorageEvent) => {
      if (e.key === "branding_version") {
        window.__brandSyncVersion = e.newValue || String(Date.now());
        syncBranding();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        syncBranding();
      }
    };

    window.addEventListener("branding-updated", syncBranding as EventListener);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", syncBranding);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("branding-updated", syncBranding as EventListener);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", syncBranding);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    setMessage("");
    loadSlots(date, serviceId).catch(() => {});
  }, [date, serviceId]);

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

    setBooking(true);

    try {
      await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: selectedService.id,
          date,
          time: selected,
          name: name.trim(),
          phone: phone.trim(),
          notes,
        }),
      }).then(safeJson<BookResponse>);

      const params = new URLSearchParams({
        service: selectedService.name || "Servizio",
        date,
        time: selected,
        name: name.trim(),
        durationMin: String(selectedService.durationMin || 0),
      });

      router.push(`/conferma?${params.toString()}`);
    } catch (error: any) {
      setMessage(error?.message || "Errore prenotazione");
    } finally {
      setBooking(false);
    }
  }

  const title = settings?.brandTitle?.trim() || "Ringhio BarberShop";
  const subtitle =
    settings?.brandSubtitle?.trim() || "Prenota il tuo appuntamento in pochi secondi";
  const brandedLogoUrl = withVersion(settings?.logoUrl, settingsVersion);
  const showCustomLogo = isSafeLogo(brandedLogoUrl) && !logoFailed;

  return (
    <main className="container">
      <header className="hero">
        <div className="logoWrap">
          {showCustomLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brandedLogoUrl}
              alt={title}
              style={{ width: 120, height: 120, objectFit: "contain" }}
              onError={() => setLogoFailed(true)}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/icons/icon-512.png"
              width={120}
              height={120}
              alt={title}
              style={{ width: 120, height: 120, objectFit: "contain" }}
            />
          )}
        </div>

        <div className="brand">
          <div className="title">{title}</div>
          <p className="subtitle">{subtitle}</p>
        </div>
      </header>

      <section className="card">
        <div className="grid">
          {message ? <div className="badge error">{message}</div> : null}

          <div>
            <label>Servizio</label>
            {servicesLoading ? (
              <div className="badge info">Caricamento servizi...</div>
            ) : services.length === 0 ? (
              <div className="badge info">Nessun servizio disponibile</div>
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
              <div className="badge info">Nessuno slot disponibile</div>
            ) : (
              <div className="slots">
                {slots.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`slot ${selected === t ? "active" : ""}`}
                    onClick={() => setSelected(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label>Nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <label>Telefono</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          <div>
            <label>Note</label>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <button className="btn" onClick={submit} disabled={booking || !selectedService}>
            {booking ? "Prenotazione..." : "Conferma prenotazione"}
          </button>
        </div>
      </section>

      <div className="footer">Orari configurati: {hoursLabel(settings)}</div>
    </main>
  );
}
