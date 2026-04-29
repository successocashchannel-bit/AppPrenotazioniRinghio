"use client";

import { useEffect, useMemo, useState } from "react";

type Booking = {
  id: string;
  summary: string;
  serviceId: string;
  serviceName: string;
  customerName: string;
  phone: string;
  notes: string;
  price: number;
  startISO: string;
  endISO: string;
  startLabel: string;
  endLabel: string;
  dateLabel: string;
  whatsappUrl: string;
  recurringSeriesId?: string;
  recurrenceLabel?: string;
};

type BusinessSettings = {
  slotIntervalMin: 15 | 30;
  minAdvanceMin: number;
  closedWeekdays: number[];
  holidays: string[];
  morningEnabled: boolean;
  morningOpen: string;
  morningClose: string;
  afternoonEnabled: boolean;
  afternoonOpen: string;
  afternoonClose: string;
  logoUrl: string;
  icon192: string;
  icon512: string;
  brandTitle: string;
  brandSubtitle: string;
  updatedAt?: string;
};

type Service = { id: string; name: string; durationMin: number; price: number; active: boolean };

type DashboardResponse = { ok: boolean; range: "day" | "week" | "month"; date: string; total: number; bookings: Booking[] };

type AllBookingsResponse = { ok: boolean; range: "month"; date: string; total: number; bookings: Booking[] };

type ManualBookingForm = {
  name: string;
  phone: string;
  serviceId: string;
  time: string;
  notes: string;
  repeatEnabled: boolean;
  every: number;
  unit: "days" | "weeks" | "months";
  occurrences: number;
};

type CustomerHistory = {
  key: string;
  customerName: string;
  phone: string;
  totalBookings: number;
  totalSpent: number;
  whatsappUrl: string;
  bookings: Booking[];
};

const DEFAULT_SETTINGS: BusinessSettings = {
  slotIntervalMin: 15,
  minAdvanceMin: 60,
  closedWeekdays: [0, 1],
  holidays: [],
  morningEnabled: true,
  morningOpen: "09:00",
  morningClose: "13:00",
  afternoonEnabled: true,
  afternoonOpen: "15:30",
  afternoonClose: "20:00",
  logoUrl: "",
  icon192: "",
  icon512: "",
  brandTitle: "Prenotazioni Online",
  brandSubtitle: "Prenota il tuo appuntamento in pochi secondi",
};

const WEEKDAYS = [
  { value: 1, label: "Lunedì" },
  { value: 2, label: "Martedì" },
  { value: 3, label: "Mercoledì" },
  { value: 4, label: "Giovedì" },
  { value: 5, label: "Venerdì" },
  { value: 6, label: "Sabato" },
  { value: 0, label: "Domenica" },
];

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

function hoursLabel(settings?: BusinessSettings | null) {
  if (!settings) return "Caricamento orari...";
  const parts: string[] = [];
  if (settings.morningEnabled) parts.push(`Mattina ${settings.morningOpen}-${settings.morningClose}`);
  if (settings.afternoonEnabled) parts.push(`Pomeriggio ${settings.afternoonOpen}-${settings.afternoonClose}`);
  return parts.join(" · ");
}

function emptyService(): Service {
  return { id: "", name: "", durationMin: 30, price: 0, active: true };
}

function emptyManualBooking(defaultServiceId = ""): ManualBookingForm {
  return {
    name: "",
    phone: "",
    serviceId: defaultServiceId,
    time: "",
    notes: "",
    repeatEnabled: false,
    every: 1,
    unit: "weeks",
    occurrences: 4,
  };
}

function addMinutes(time: string, minutes: number) {
  const [h, m] = String(time || "00:00").split(":").map(Number);
  const total = (h || 0) * 60 + (m || 0) + minutes;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function windowsFromSettings(settings: BusinessSettings) {
  const items: { key: string; start: string; end: string }[] = [];
  if (settings.morningEnabled) items.push({ key: "morning", start: settings.morningOpen, end: settings.morningClose });
  if (settings.afternoonEnabled) items.push({ key: "afternoon", start: settings.afternoonOpen, end: settings.afternoonClose });
  return items.filter((item) => item.start && item.end && item.end > item.start);
}

function generateStartSlots(settings: BusinessSettings, durationMin: number) {
  const slots: string[] = [];
  const step = Number(settings.slotIntervalMin) || 15;

  for (const window of windowsFromSettings(settings)) {
    let current = window.start;
    while (addMinutes(current, durationMin) <= window.end) {
      slots.push(current);
      current = addMinutes(current, step);
    }
  }

  return Array.from(new Set(slots));
}

function overlapsRange(startA: string, endA: string, startB: string, endB: string) {
  return startA < endB && endA > startB;
}

function isPastSlot(dateISO: string, time: string) {
  const [year, month, day] = dateISO.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const slotDate = new Date(year || 0, (month || 1) - 1, day || 1, hour || 0, minute || 0, 0, 0);
  return slotDate.getTime() <= Date.now();
}

function getServiceColor(name: string) {
  const n = String(name || "").toLowerCase();
  if (n.includes("taglio")) return "#3b82f6";
  if (n.includes("barba")) return "#10b981";
  if (n.includes("ceretta")) return "#a855f7";
  if (n.includes("colore")) return "#f59e0b";
  return "#6b7280";
}

function isCurrentAppointment(startISO: string, endISO: string) {
  const now = new Date();
  const start = new Date(startISO);
  const end = new Date(endISO);
  return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && now >= start && now <= end;
}

function reorderByIds<T extends { id: string }>(items: T[], ids: string[]) {
  if (!ids.length) return items;
  const map = new Map(items.map((item) => [item.id, item]));
  const ordered = ids.map((id) => map.get(id)).filter(Boolean) as T[];
  const leftovers = items.filter((item) => !ids.includes(item.id));
  return [...ordered, ...leftovers];
}

function withVersion(url: string, version: string) {
  if (!url) return "";
  const joiner = url.includes("?") ? "&" : "?";
  return `${url}${joiner}v=${encodeURIComponent(version)}`;
}

export default function GestionalePage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [tab, setTab] = useState<"dashboard" | "calendario" | "clienti" | "storico" | "servizi" | "impostazioni">("calendario");
  const [menuOpen, setMenuOpen] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [range, setRange] = useState<"day" | "week" | "month">("day");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [allHistoryBookings, setAllHistoryBookings] = useState<Booking[]>([]);
  const [dashboardOrderIds, setDashboardOrderIds] = useState<string[]>([]);
  const [draggingBookingId, setDraggingBookingId] = useState<string>("");
  const [deletingId, setDeletingId] = useState("");

  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [newHoliday, setNewHoliday] = useState("");

  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesMessage, setServicesMessage] = useState("");
  const [serviceForm, setServiceForm] = useState<Service>(emptyService());
  const [savingService, setSavingService] = useState(false);
  const [deletingServiceId, setDeletingServiceId] = useState("");

  const [calendarDate, setCalendarDate] = useState(todayISO());
  const [calendarBookings, setCalendarBookings] = useState<Booking[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarMessage, setCalendarMessage] = useState("");
  const [calendarDeletingId, setCalendarDeletingId] = useState("");
  const [savingManualBooking, setSavingManualBooking] = useState(false);
  const [manualBookingMessage, setManualBookingMessage] = useState("");
  const [manualBooking, setManualBooking] = useState<ManualBookingForm>(emptyManualBooking());
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const [brandingVersion, setBrandingVersion] = useState(() => String(Date.now()));
  const [openHistoryCustomerKey, setOpenHistoryCustomerKey] = useState<string | null>(null);
  const [historyInitialized, setHistoryInitialized] = useState(false);
  const [historySearch, setHistorySearch] = useState("");

  const [editingSeriesId, setEditingSeriesId] = useState("");
  const [editingSeriesNotes, setEditingSeriesNotes] = useState("");
  const [seriesActionMessage, setSeriesActionMessage] = useState("");

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);


  useEffect(() => {
    if (!authenticated) return;
    loadDashboard();
  }, [authenticated, date, range]);

  useEffect(() => {
    if (!authenticated) return;
    loadSettings();
    loadServices();
    loadAllHistoryBookings();
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) return;
    loadCalendarBookings(calendarDate);
  }, [authenticated, calendarDate]);

  useEffect(() => {
    setLogoLoadFailed(false);
  }, [settings.logoUrl, brandingVersion]);

  useEffect(() => {
    if (services.length > 0 && !manualBooking.serviceId) {
      setManualBooking((prev) => ({ ...prev, serviceId: services.find((s) => s.active)?.id || services[0].id || "" }));
    }
  }, [services, manualBooking.serviceId]);


  useEffect(() => {
    setDashboardOrderIds((prev) => {
      const nextIds = bookings.map((item) => item.id);
      if (!prev.length) return nextIds;
      return [...prev.filter((id) => nextIds.includes(id)), ...nextIds.filter((id) => !prev.includes(id))];
    });
  }, [bookings]);

  useEffect(() => {
    if (tab !== "dashboard") return;
    const el = document.querySelector(".dashboardNowCard");
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [tab, bookings, range, date]);

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

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthenticated(false);
  }

  function openCalendarView(targetDate?: string) {
    const nextDate = targetDate || date || calendarDate;
    setCalendarDate(nextDate);
    setTab("calendario");
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function loadDashboard() {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`/api/admin/bookings?date=${date}&range=${range}`, { cache: "no-store" });
      const data = await safeJson<DashboardResponse>(res);
      setBookings(data.bookings || []);
    } catch (e: any) {
      setBookings([]);
      setMessage(e?.message || "Errore caricamento appuntamenti");
    } finally {
      setLoading(false);
    }
  }

  async function loadAllHistoryBookings() {
    try {
      const today = new Date();
      const start = new Date(today.getFullYear() - 5, 0, 1);
      const iso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
      const res = await fetch(`/api/admin/bookings?date=${iso}&range=month&all=1`, { cache: "no-store" });
      const data = await safeJson<AllBookingsResponse>(res);
      setAllHistoryBookings(data.bookings || []);
    } catch {
      setAllHistoryBookings([]);
    }
  }

  async function loadCalendarBookings(targetDate = calendarDate) {
    setCalendarLoading(true);
    setCalendarMessage("");
    try {
      const res = await fetch(`/api/admin/bookings?date=${targetDate}&range=day`, { cache: "no-store" });
      const data = await safeJson<DashboardResponse>(res);
      setCalendarBookings(data.bookings || []);
    } catch (e: any) {
      setCalendarBookings([]);
      setCalendarMessage(e?.message || "Errore caricamento calendario");
    } finally {
      setCalendarLoading(false);
    }
  }

  async function loadSettings() {
    setSettingsLoading(true);
    try {
      const res = await fetch("/api/admin/settings", { cache: "no-store" });
      const data = await safeJson<{ ok: boolean; settings: BusinessSettings }>(res);
      const nextSettings = { ...DEFAULT_SETTINGS, ...(data.settings || DEFAULT_SETTINGS), logoUrl: data?.settings?.logoUrl || "" };
      setSettings(nextSettings);
      setBrandingVersion(nextSettings.updatedAt || String(Date.now()));
    } catch (e: any) {
      setSettingsMessage(e?.message || "Errore caricamento impostazioni");
    } finally {
      setSettingsLoading(false);
    }
  }

  async function loadServices() {
    setServicesLoading(true);
    try {
      const res = await fetch("/api/admin/services", { cache: "no-store" });
      const data = await safeJson<{ ok: boolean; services: Service[] }>(res);
      setServices(data.services || []);
    } catch (e: any) {
      setServicesMessage(e?.message || "Errore caricamento servizi");
    } finally {
      setServicesLoading(false);
    }
  }

  async function saveSettings() {
    setSavingSettings(true);
    setSettingsMessage("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await safeJson<{ ok: boolean; settings: BusinessSettings }>(res);
      const nextVersion = data.settings?.updatedAt || String(Date.now());
      setSettings(data.settings);
      setBrandingVersion(nextVersion);
      if (typeof window !== "undefined") {
        localStorage.setItem("branding_version", nextVersion);
        window.dispatchEvent(new Event("branding-updated"));
      }
      setSettingsMessage("Impostazioni salvate e sincronizzate nella web app.");
    } catch (e: any) {
      setSettingsMessage(e?.message || "Errore salvataggio impostazioni");
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveService() {
    setSavingService(true);
    setServicesMessage("");
    try {
      const payload = {
        ...serviceForm,
        id: String(serviceForm.id || "").trim() || undefined,
        name: String(serviceForm.name || "").trim(),
        durationMin: Number(serviceForm.durationMin) || 30,
        price: Number(serviceForm.price) || 0,
        active: serviceForm.active !== false,
      };

      const res = await fetch("/api/admin/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      await safeJson(res);
      await loadServices();
      setServiceForm(emptyService());
      setServicesMessage("Servizio salvato con successo.");
    } catch (e: any) {
      setServicesMessage(e?.message || "Errore salvataggio servizio");
    } finally {
      setSavingService(false);
    }
  }

  async function removeService(id: string) {
    const ok = window.confirm("Vuoi davvero eliminare questo servizio?");
    if (!ok) return;
    setDeletingServiceId(id);
    try {
      const res = await fetch(`/api/admin/services?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        cache: "no-store",
      });
      const data = await safeJson<{
        ok: boolean;
        services: Service[];
        result?: {
          deleted?: boolean;
          deactivated?: boolean;
          activeReferenced?: boolean;
          historicalReferenced?: boolean;
        };
      }>(res);
      await loadServices();
      if (serviceForm.id === id) setServiceForm(emptyService());

      if (data?.result?.deleted) {
        setServicesMessage(
          data?.result?.historicalReferenced
            ? "Servizio rimosso con successo. Lo storico è stato mantenuto."
            : "Servizio rimosso con successo."
        );
      } else if (data?.result?.activeReferenced) {
        setServicesMessage("Servizio disattivato: è collegato a prenotazioni attive.");
      } else if (data?.result?.deactivated) {
        setServicesMessage("Servizio disattivato.");
      } else {
        setServicesMessage("Operazione completata.");
      }
    } catch (e: any) {
      setServicesMessage(e?.message || "Errore eliminazione servizio");
    } finally {
      setDeletingServiceId("");
    }
  }

  async function removeBooking(id: string) {
    const ok = window.confirm("Vuoi eliminare questo appuntamento dal gestionale?");
    if (!ok) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/bookings?id=${encodeURIComponent(id)}`, { method: "DELETE", cache: "no-store" });
      await safeJson(res);
      setBookings((prev) => prev.filter((item) => item.id !== id));
      setCalendarBookings((prev) => prev.filter((item) => item.id !== id));
      setAllHistoryBookings((prev) => prev.filter((item) => item.id !== id));
    } catch (e: any) {
      setMessage(e?.message || "Errore eliminazione appuntamento");
    } finally {
      setDeletingId("");
    }
  }

  async function removeCalendarBooking(id: string) {
    const ok = window.confirm("Vuoi disdire questo appuntamento dal calendario?");
    if (!ok) return;
    setCalendarDeletingId(id);
    setManualBookingMessage("");
    try {
      const res = await fetch(`/api/admin/bookings?id=${encodeURIComponent(id)}`, { method: "DELETE", cache: "no-store" });
      await safeJson(res);
      setCalendarBookings((prev) => prev.filter((item) => item.id !== id));
      setBookings((prev) => prev.filter((item) => item.id !== id));
      setAllHistoryBookings((prev) => prev.filter((item) => item.id !== id));
      setManualBookingMessage("Appuntamento disdetto con successo.");
    } catch (e: any) {
      setManualBookingMessage(e?.message || "Errore disdetta appuntamento");
    } finally {
      setCalendarDeletingId("");
    }
  }

  async function createManualBooking() {
    setManualBookingMessage("");

    if (!manualBooking.time) {
      setManualBookingMessage("Seleziona un orario.");
      return;
    }

    if (!manualBooking.name.trim() || !manualBooking.phone.trim()) {
      setManualBookingMessage("Inserisci nome e telefono.");
      return;
    }

    setSavingManualBooking(true);
    try {
      const res = await fetch("/api/admin/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...manualBooking, date: calendarDate }),
      });

      const data = await safeJson<{
        ok: boolean;
        booking?: Booking;
        recurring?: boolean;
        created?: Booking[];
        skipped?: Array<{ date: string; reason: string }>;
        createdCount?: number;
        skippedCount?: number;
      }>(res);

      const serviceIdToKeep = manualBooking.serviceId;

      if (data.recurring) {
        setManualBooking((prev) => ({
          ...emptyManualBooking(serviceIdToKeep),
          repeatEnabled: prev.repeatEnabled,
          every: prev.every,
          unit: prev.unit,
          occurrences: prev.occurrences,
        }));

        const created = data.created || [];
        const skippedCount = Number(data.skippedCount || 0);
        const createdCount = Number(data.createdCount || created.length || 0);

        setManualBookingMessage(
          skippedCount > 0
            ? `Ricorrenza creata. Appuntamenti creati: ${createdCount}. Saltati: ${skippedCount}.`
            : `Ricorrenza creata con successo. Appuntamenti creati: ${createdCount}.`
        );

        await loadCalendarBookings(calendarDate);
      } else {
        setManualBooking(emptyManualBooking(serviceIdToKeep));
        setManualBookingMessage("Prenotazione confermata con successo.");
        if (data.booking) {
          setCalendarBookings((prev) => [...prev, data.booking!].sort((a, b) => a.startISO.localeCompare(b.startISO)));
        } else {
          await loadCalendarBookings(calendarDate);
        }
      }

      await loadAllHistoryBookings();
      if (date === calendarDate && range === "day") {
        loadDashboard();
      }
    } catch (e: any) {
      setManualBookingMessage(e?.message || "Errore prenotazione");
    } finally {
      setSavingManualBooking(false);
    }
  }


  async function deleteSeries(seriesId: string) {
    const ok = window.confirm("Vuoi eliminare tutta la serie ricorrente?");
    if (!ok) return;

    setSeriesActionMessage("");
    try {
      const res = await fetch(`/api/admin/bookings?seriesId=${encodeURIComponent(seriesId)}`, {
        method: "DELETE",
        cache: "no-store",
      });
      await safeJson(res);
      setSeriesActionMessage("Serie ricorrente disdetta con successo.");
      await loadCalendarBookings(calendarDate);
      await loadAllHistoryBookings();
      if (date === calendarDate && range === "day") {
        loadDashboard();
      } else {
        loadDashboard();
      }
    } catch (e: any) {
      setSeriesActionMessage(e?.message || "Errore disdetta ricorrenza");
    }
  }

  async function saveSeriesNotes() {
    if (!editingSeriesId) return;
    setSeriesActionMessage("");
    try {
      const res = await fetch("/api/admin/bookings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seriesId: editingSeriesId, notes: editingSeriesNotes }),
      });
      await safeJson(res);
      setSeriesActionMessage("Serie ricorrente aggiornata con successo.");
      setEditingSeriesId("");
      setEditingSeriesNotes("");
      await loadCalendarBookings(calendarDate);
      await loadAllHistoryBookings();
      loadDashboard();
    } catch (e: any) {
      setSeriesActionMessage(e?.message || "Errore aggiornamento ricorrenza");
    }
  }

  function toggleClosedWeekday(day: number) {
    setSettings((prev) => ({
      ...prev,
      closedWeekdays: prev.closedWeekdays.includes(day)
        ? prev.closedWeekdays.filter((d) => d !== day)
        : [...prev.closedWeekdays, day].sort((a, b) => a - b),
    }));
  }

  function addHoliday() {
    if (!newHoliday) return;
    setSettings((prev) => ({ ...prev, holidays: Array.from(new Set([...prev.holidays, newHoliday])).sort() }));
    setNewHoliday("");
  }

  const stats = useMemo(() => {
    const totalRevenue = bookings.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
    const withPhone = bookings.filter((b) => b.phone).length;
    const uniqueClients = new Set(bookings.map((b) => `${b.customerName}|${b.phone}`)).size;
    return { totalAppointments: bookings.length, totalRevenue, withPhone, uniqueClients };
  }, [bookings]);

  const dashboardBookings = useMemo(
    () => reorderByIds([...bookings].sort((a, b) => a.startISO.localeCompare(b.startISO)), dashboardOrderIds),
    [bookings, dashboardOrderIds]
  );

  const dashboardTimeline = useMemo(() => {
    const step = Number(settings.slotIntervalMin) || 15;
    const slots = generateStartSlots(settings, step);
    return slots.map((slot) => {
      const booking = dashboardBookings.find((item) => overlapsRange(slot, addMinutes(slot, step), item.startLabel, item.endLabel)) || null;
      return {
        slot,
        booking,
        isStart: booking ? booking.startLabel === slot : false,
        isOccupied: Boolean(booking),
      };
    });
  }, [settings, dashboardBookings]);

  const dashboardBookingsSorted = useMemo(
    () => [...bookings].sort((a, b) => new Date(b.startISO).getTime() - new Date(a.startISO).getTime()),
    [bookings]
  );

  const allBookingsSorted = useMemo(
    () => [...allHistoryBookings].sort((a, b) => new Date(b.startISO).getTime() - new Date(a.startISO).getTime()),
    [allHistoryBookings]
  );

  const customerHistoryGroups = useMemo(() => {
    const map = new Map<string, CustomerHistory>();
    for (const booking of allBookingsSorted) {
      const key = `${booking.customerName}|${booking.phone}`;
      const prev = map.get(key) || {
        key,
        customerName: booking.customerName,
        phone: booking.phone,
        totalBookings: 0,
        totalSpent: 0,
        whatsappUrl: booking.whatsappUrl,
        bookings: [],
      };
      prev.totalBookings += 1;
      prev.totalSpent += Number(booking.price) || 0;
      if (!prev.whatsappUrl && booking.whatsappUrl) prev.whatsappUrl = booking.whatsappUrl;
      prev.bookings.push(booking);
      map.set(key, prev);
    }
    return Array.from(map.values())
      .map((group) => ({
        ...group,
        bookings: [...group.bookings].sort((a, b) => new Date(b.startISO).getTime() - new Date(a.startISO).getTime()),
      }))
      .sort((a, b) => {
        const aTime = a.bookings[0] ? new Date(a.bookings[0].startISO).getTime() : 0;
        const bTime = b.bookings[0] ? new Date(b.bookings[0].startISO).getTime() : 0;
        return bTime - aTime;
      });
  }, [allBookingsSorted]);

  const customers = useMemo(
    () =>
      customerHistoryGroups.map((group) => ({
        key: group.key,
        customerName: group.customerName,
        phone: group.phone,
        totalBookings: group.totalBookings,
        totalSpent: group.totalSpent,
        whatsappUrl: group.whatsappUrl,
        servicesHistory: group.bookings.map((item) => ({
          id: item.id,
          date: item.dateLabel,
          service: item.serviceName,
          price: item.price,
          notes: item.notes,
        })),
      })),
    [customerHistoryGroups]
  );

  const filteredCustomerHistoryGroups = useMemo(() => {
    const query = historySearch.trim().toLowerCase();
    if (!query) return customerHistoryGroups;
    return customerHistoryGroups.filter((customer) => {
      const latestBooking = customer.bookings[0];
      const haystack = [
        customer.customerName,
        customer.phone,
        latestBooking?.serviceName || "",
        ...customer.bookings.map((item) => `${item.serviceName} ${item.notes || ""}`),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [customerHistoryGroups, historySearch]);

  useEffect(() => {
    if (filteredCustomerHistoryGroups.length === 0) {
      setOpenHistoryCustomerKey(null);
      setHistoryInitialized(false);
      return;
    }

    if (!historyInitialized) {
      setOpenHistoryCustomerKey(filteredCustomerHistoryGroups[0]?.key || null);
      setHistoryInitialized(true);
      return;
    }

    if (openHistoryCustomerKey && !filteredCustomerHistoryGroups.some((group) => group.key === openHistoryCustomerKey)) {
      setOpenHistoryCustomerKey(filteredCustomerHistoryGroups[0]?.key || null);
    }
  }, [filteredCustomerHistoryGroups, openHistoryCustomerKey, historyInitialized]);

  const activeServices = useMemo(() => services.filter((service) => service.active), [services]);
  const selectedService = useMemo(
    () => activeServices.find((service) => service.id === manualBooking.serviceId) || activeServices[0] || null,
    [activeServices, manualBooking.serviceId]
  );

  const calendarGridSlots = useMemo(() => {
    const step = Number(settings.slotIntervalMin) || 15;
    return generateStartSlots(settings, step).filter((time) => !isPastSlot(calendarDate, time) || calendarBookings.some((booking) => overlapsRange(time, addMinutes(time, step), booking.startLabel, booking.endLabel)));
  }, [settings, calendarDate, calendarBookings]);

  const slotOccupancyMap = useMemo(() => {
    const map = new Map<string, Booking>();
    const step = Number(settings.slotIntervalMin) || 15;
    for (const slot of calendarGridSlots) {
      const booking = calendarBookings.find((item) => overlapsRange(slot, addMinutes(slot, step), item.startLabel, item.endLabel));
      if (booking) map.set(slot, booking);
    }
    return map;
  }, [calendarBookings, calendarGridSlots, settings.slotIntervalMin]);

  const availableCalendarSlots = useMemo(() => {
    if (!selectedService) return [];
    const baseSlots = generateStartSlots(settings, selectedService.durationMin);
    return baseSlots.filter((slot) => {
      if (isPastSlot(calendarDate, slot)) return false;
      const slotEnd = addMinutes(slot, selectedService.durationMin);
      return !calendarBookings.some((booking) => overlapsRange(slot, slotEnd, booking.startLabel, booking.endLabel));
    });
  }, [settings, selectedService, calendarBookings, calendarDate]);

  const selectedTimeAvailable = useMemo(() => {
    if (!manualBooking.time || !selectedService) return false;
    return availableCalendarSlots.includes(manualBooking.time);
  }, [availableCalendarSlots, manualBooking.time, selectedService]);

  const orderedCalendarBookings = useMemo(
    () => [...calendarBookings].sort((a, b) => a.startISO.localeCompare(b.startISO)),
    [calendarBookings]
  );

  if (authenticated === null) {
    return <main className="container wideContainer"><div className="card"><div className="badge info">Caricamento gestionale...</div></div></main>;
  }

  if (!authenticated) {
    return (
      <main className="container" style={{ maxWidth: 460 }}>
        <header className="hero">
          <div className="brand">
            <div className="title">Accesso admin</div>
            <p className="subtitle">Credenziali impostate: name admin · password admin</p>
          </div>
        </header>
        <section className="card">
          <div className="grid">
            {loginError && <div className="badge error">{loginError}</div>}
            <div><label>Username</label><input value={username} onChange={(e) => setUsername(e.target.value)} /></div>
            <div><label>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <button type="button" className="btn" onClick={login} disabled={loginLoading}>{loginLoading ? "Accesso..." : "Entra nel gestionale"}</button>
          </div>
        </section>
      </main>
    );
  }

  const menuItems: Array<{ value: "dashboard" | "calendario" | "clienti" | "storico" | "servizi" | "impostazioni"; label: string }> = [
    { value: "dashboard", label: "Dashboard" },
    { value: "calendario", label: "Calendario" },
    { value: "clienti", label: "Clienti" },
    { value: "storico", label: "Storico" },
    { value: "servizi", label: "Servizi & Prezzi" },
    { value: "impostazioni", label: "Impostazioni" },
  ];

  return (
    <main className="container wideContainer gestionaleShell">
      <div className="sideMenuWrap">
        <button type="button" className={`menuToggle ${menuOpen ? "open" : ""}`} onClick={() => setMenuOpen((p) => !p)} aria-label="Apri menu">
          <span /><span /><span />
        </button>
        <div className={`sideMenuPanel ${menuOpen ? "show" : ""}`}>
          <div className="sideMenuHeader">
            <div><div className="sectionTitle">Gestionale</div><div className="muted">Controllo appuntamenti, clienti e impostazioni</div></div>
          </div>
          <div className="sideMenuList">
            {menuItems.map((item) => (
              <button key={item.value} type="button" className={`tabBtn sideMenuBtn ${tab === item.value ? "activeTab" : ""}`} onClick={() => { setTab(item.value); setMenuOpen(false); }}>
                {item.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn sideMenuLogout" onClick={logout}>Esci</button>
        </div>
      </div>

      <header className="hero leftHero">
        <div className="brand leftBrand">
          <div className="logoWrap">
            {settings.logoUrl && !logoLoadFailed ? <img src={withVersion(settings.logoUrl, brandingVersion)} alt={settings.brandTitle || "Logo salone"} style={{ objectFit: "contain", width: "100%", height: "100%", padding: 12 }} onError={() => setLogoLoadFailed(true)} /> : <div className="title" style={{ fontSize: 18 }}>{settings.brandTitle || "Gestionale"}</div>}
          </div>
          <div className="title">Gestionale appuntamenti</div>
          <p className="subtitle">{hoursLabel(settings)}</p>
        </div>
      </header>

      {tab === "dashboard" && (
        <>
          <section className="card dashboardHeroCard">
            <div className="dashboardHeroHeader">
              <div><div className="sectionTitle">Panoramica</div><div className="dashboardHeroText">Vista rapida degli appuntamenti per il periodo selezionato, con totale clienti, ricavi e contatti.</div></div>
              <div className="dashboardCountBadge">{bookings.length} appuntamenti</div>
            </div>
            <div className="dashboardFilters">
              <div><label>Data di riferimento</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div><label>Intervallo</label><select value={range} onChange={(e) => setRange(e.target.value as "day" | "week" | "month")}><option value="day">Giorno</option><option value="week">Settimana</option><option value="month">Mese</option></select></div>
            </div>
          </section>

          <section className="card dashboardStats">
            <div className="statsRow">
              <div className="statBox statBoxProfessional"><span>Appuntamenti</span><strong>{stats.totalAppointments}</strong><small>Nel periodo selezionato</small></div>
              <div className="statBox statBoxProfessional"><span>Incasso</span><strong>€{stats.totalRevenue.toFixed(2)}</strong><small>Totale servizi prenotati</small></div>
              <div className="statBox statBoxProfessional"><span>Clienti unici</span><strong>{stats.uniqueClients}</strong><small>Contatti distinti</small></div>
              <div className="statBox statBoxProfessional"><span>Con telefono</span><strong>{stats.withPhone}</strong><small>Pronti per richiamo o WhatsApp</small></div>
            </div>
          </section>

          <section className="card">
            <div className="dashboardSectionHeader"><div className="sectionTitle">Timeline</div>{message && <div className="badge error">{message}</div>}</div>
            {loading ? <div className="badge info">Caricamento appuntamenti...</div> : dashboardTimeline.length === 0 ? <div className="badge info">Nessuno slot disponibile per la timeline corrente.</div> : (
              <div className="dashboardTimeline">
                {dashboardTimeline.map(({ slot, booking, isStart, isOccupied }) => {
                  const rowNow = booking ? isCurrentAppointment(booking.startISO, booking.endISO) : false;
                  return (
                    <div key={slot} className={`dashboardTimelineRow ${rowNow ? "dashboardTimelineRowNow" : ""}`}>
                      <div className="dashboardTimelineHour">{slot}</div>
                      <div className="dashboardTimelineContent">
                        {!booking ? <div className="dashboardTimelineEmpty" /> : !isStart ? <div className="dashboardTimelineEmpty dashboardTimelineContinuation">Occupato fino alle {booking.endLabel}</div> : (
                          <div key={booking.id} className={`dashboardTimelineCard ${isCurrentAppointment(booking.startISO, booking.endISO) ? "dashboardNowCard" : ""}`} style={{ borderLeftColor: getServiceColor(booking.serviceName) }} draggable onDragStart={() => setDraggingBookingId(booking.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (!draggingBookingId || draggingBookingId === booking.id) return; setDashboardOrderIds((prev) => { const ids = [...prev.filter((id) => id !== draggingBookingId)]; const targetIndex = ids.indexOf(booking.id); if (targetIndex === -1) return prev; ids.splice(targetIndex, 0, draggingBookingId); return ids; }); setDraggingBookingId(""); }}>
                            <div className="dashboardTimelineCardTop"><strong>{booking.customerName}</strong><span className="dashboardChip dashboardChipTime">{booking.startLabel} - {booking.endLabel}</span></div>
                            <div className="muted">{booking.serviceName}</div>
                            <div className="bookingActions">{booking.phone && booking.whatsappUrl ? <a className="tabBtn secondaryBtn" href={booking.whatsappUrl} target="_blank">WhatsApp</a> : null}<button type="button" className="tabBtn secondaryBtn" onClick={() => openCalendarView(booking.dateLabel)}>Apri giorno</button><button type="button" className="tabBtn dangerBtn" onClick={() => removeBooking(booking.id)} disabled={deletingId === booking.id}>{deletingId === booking.id ? "Elimino..." : "Elimina"}</button></div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card">
            <div className="dashboardSectionHeader"><div className="sectionTitle">Lista appuntamenti</div><div className="dashboardCountBadge">{dashboardBookingsSorted.length}</div></div>
            {dashboardBookingsSorted.length === 0 ? <div className="badge info">Nessun appuntamento nel periodo selezionato.</div> : <div className="dashboardAppointmentList">{dashboardBookingsSorted.map((booking) => <div key={booking.id} className="dashboardAppointmentCard"><div className="dashboardAppointmentMain"><div className="dashboardAppointmentIdentity"><h3>{booking.customerName}</h3><p>{booking.serviceName}</p></div><div className="dashboardAppointmentChipRow"><span className="dashboardChip dashboardChipTime">{booking.dateLabel}</span><span className="dashboardChip">{booking.startLabel} - {booking.endLabel}</span><span className="dashboardChip">€{Number(booking.price || 0).toFixed(2)}</span></div></div><div className="dashboardAppointmentMeta"><div><span className="dashboardMetaLabel">Telefono</span><strong>{booking.phone || "Non disponibile"}</strong></div><div><span className="dashboardMetaLabel">Note</span><strong>{booking.notes || "Nessuna nota"}</strong></div></div><div className="dashboardAppointmentActions">{booking.whatsappUrl ? <a className="tabBtn secondaryBtn dashboardMiniBtn" href={booking.whatsappUrl} target="_blank">WhatsApp</a> : null}<button type="button" className="tabBtn secondaryBtn dashboardMiniBtn" onClick={() => openCalendarView(booking.dateLabel)}>Calendario</button><button type="button" className="tabBtn dangerBtn dashboardMiniBtn" onClick={() => removeBooking(booking.id)} disabled={deletingId === booking.id}>{deletingId === booking.id ? "Elimino..." : "Elimina"}</button></div></div>)}</div>}
          </section>
        </>
      )}

      {tab === "calendario" && (
        <section className="adminWebAppMirror">
          <main className="container">
            <header className="hero">
              <div className="logoWrap">
                {settings.logoUrl && !logoLoadFailed ? (
                  <img
                    src={withVersion(settings.logoUrl, brandingVersion)}
                    alt={settings.brandTitle || "Logo salone"}
                    style={{ width: 120, height: 120, objectFit: "contain" }}
                    onError={() => setLogoLoadFailed(true)}
                  />
                ) : (
                  <img
                    src="/icons/icon-512.png"
                    width={120}
                    height={120}
                    alt={settings.brandTitle || "Logo salone"}
                    style={{ width: 120, height: 120, objectFit: "contain" }}
                  />
                )}
              </div>

              <div className="brand">
                <div className="title">{settings.brandTitle || "Prenotazioni Online"}</div>
                <p className="subtitle">{settings.brandSubtitle || "Prenota il tuo appuntamento in pochi secondi"}</p>
              </div>
            </header>

            <section className="card">
              <div className="grid">
                {(calendarMessage || manualBookingMessage || seriesActionMessage) ? (
                  <div className={`badge ${((manualBookingMessage || calendarMessage || seriesActionMessage).toLowerCase().includes("successo") || (manualBookingMessage || "").toLowerCase().includes("confermata") || (manualBookingMessage || "").toLowerCase().includes("creata")) ? "ok" : "error"}`}>
                    {manualBookingMessage || calendarMessage || seriesActionMessage}
                  </div>
                ) : null}

                <div>
                  <label>Servizio</label>
                  {servicesLoading ? (
                    <div className="badge info">Caricamento servizi...</div>
                  ) : (
                    <select
                      value={manualBooking.serviceId}
                      onChange={(e) => setManualBooking((prev) => ({ ...prev, serviceId: e.target.value, time: "" }))}
                    >
                      {(activeServices.length ? activeServices : services).map((service) => (
                        <option key={service.id} value={service.id}>
                          {service.name} ({service.durationMin} min · €{service.price})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label>Data</label>
                  <input
                    type="date"
                    value={calendarDate}
                    onChange={(e) => {
                      setCalendarDate(e.target.value);
                      setManualBooking((prev) => ({ ...prev, time: "" }));
                      setCalendarMessage("");
                      setManualBookingMessage("");
                      setSeriesActionMessage("");
                    }}
                  />
                </div>

                <div>
                  <label>Orari disponibili</label>
                  {calendarLoading ? (
                    <div className="badge info">Caricamento...</div>
                  ) : availableCalendarSlots.length === 0 ? (
                    <div className="badge info">Nessuno slot disponibile</div>
                  ) : (
                    <div className="slots">
                      {availableCalendarSlots.map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          className={`slot ${manualBooking.time === slot ? "active" : ""}`}
                          onClick={() => setManualBooking((prev) => ({ ...prev, time: slot }))}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label>Nome</label>
                  <input value={manualBooking.name} onChange={(e) => setManualBooking((prev) => ({ ...prev, name: e.target.value }))} />
                </div>

                <div>
                  <label>Telefono</label>
                  <input value={manualBooking.phone} onChange={(e) => setManualBooking((prev) => ({ ...prev, phone: e.target.value }))} />
                </div>

                <div>
                  <label>Note</label>
                  <textarea rows={3} value={manualBooking.notes} onChange={(e) => setManualBooking((prev) => ({ ...prev, notes: e.target.value }))} />
                </div>

                <button className="btn" onClick={createManualBooking} disabled={savingManualBooking || !selectedService || !manualBooking.time || !selectedTimeAvailable}>
                  {savingManualBooking ? "Prenotazione..." : "Conferma prenotazione"}
                </button>
              </div>
            </section>

            <div className="footer">
              Orari configurati: {hoursLabel(settings)} · intervallo slot {settings?.slotIntervalMin || 15} min ·{" "}
              <button
                type="button"
                className="adminInlineReset"
                onClick={() => {
                  setManualBooking((prev) => ({ ...emptyManualBooking(prev.serviceId || selectedService?.id || "") }));
                  setCalendarMessage("");
                  setManualBookingMessage("");
                  setSeriesActionMessage("");
                }}
              >
                Reset calendario
              </button>
            </div>
          </main>
        </section>
      )}

      {tab === "clienti" && <section className="card"><div className="grid"><div className="sectionTitle">Anagrafica clienti</div>{customers.length === 0 ? <div className="badge info">Nessun cliente registrato.</div> : customers.map((customer) => <div key={customer.key} className="holidayItem" style={{ alignItems: "flex-start" }}><div><strong>{customer.customerName}</strong><div className="muted">{customer.phone || "Telefono non disponibile"}</div><div className="muted">Prenotazioni: {customer.totalBookings} · Totale speso: €{customer.totalSpent.toFixed(2)}</div><div className="muted">Ultimi servizi: {customer.servicesHistory.slice(0, 3).map((item) => `${item.date} ${item.service}`).join(" · ") || "Nessuno"}</div></div><div className="bookingActions">{customer.whatsappUrl ? <a className="tabBtn secondaryBtn" href={customer.whatsappUrl} target="_blank">WhatsApp</a> : null}<button type="button" className="tabBtn secondaryBtn" onClick={() => { setHistorySearch(customer.customerName); setTab("storico"); }}>Apri storico</button></div></div>)}</div></section>}

      {tab === "storico" && <section className="card"><div className="grid"><div className="sectionTitle">Storico</div><div className="muted historyIntro">Storico completo di tutti i clienti e di tutti i servizi passati.</div><div><label>Cerca nello storico</label><input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} placeholder="Cerca per nome, telefono o servizio" /></div>{filteredCustomerHistoryGroups.length === 0 ? <div className="badge info">Nessun cliente trovato.</div> : filteredCustomerHistoryGroups.map((customer) => { const isOpen = openHistoryCustomerKey === customer.key; const latestBooking = customer.bookings[0]; return <div key={customer.key} className="historyCard"><button type="button" className={`historyToggle ${isOpen ? "open" : ""}`} onClick={() => setOpenHistoryCustomerKey(isOpen ? null : customer.key)}><div className="historySummary"><strong>{customer.customerName}</strong><div className="muted historySmallText">{customer.phone || "Telefono non disponibile"}</div><div className="muted historySmallText">{customer.totalBookings} appuntamenti · €{customer.totalSpent.toFixed(2)} · Ultimo: {latestBooking ? `${latestBooking.dateLabel} ${latestBooking.startLabel}` : "—"}</div></div><span className="historyArrow">{isOpen ? "−" : "+"}</span></button>{isOpen && <div className="historyDetails"><div className="bookingActions">{customer.whatsappUrl && <a className="tabBtn secondaryBtn" href={customer.whatsappUrl} target="_blank">WhatsApp</a>}</div>{customer.bookings.map((item) => <div key={item.id} className="historyBookingRow"><div className="historyRowText"><strong>{item.serviceName}</strong><div className="muted historySmallText">{item.dateLabel} · {item.startLabel} - {item.endLabel}</div>{item.notes ? <div className="muted historySmallText">Note: {item.notes}</div> : null}</div><div><strong>€{Number(item.price || 0).toFixed(2)}</strong></div></div>)}</div>}</div>; })}</div></section>}

      {tab === "servizi" && <section className="card"><div className="grid"><div className="sectionTitle">Gestione servizi e prezzi</div>{servicesMessage && <div className={`badge ${servicesMessage.includes("successo") ? "ok" : "error"}`}>{servicesMessage}</div>}<div className="gridTwoCols"><div><label>Nome servizio</label><input value={serviceForm.name} onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })} placeholder="es. Consulenza" /></div><div><label>Durata (min)</label><input type="number" value={serviceForm.durationMin} onChange={(e) => setServiceForm({ ...serviceForm, durationMin: Number(e.target.value) })} /></div><div><label>Prezzo (€)</label><input type="number" value={serviceForm.price} onChange={(e) => setServiceForm({ ...serviceForm, price: Number(e.target.value) })} /></div><label className="switchRow fullRow"><input type="checkbox" checked={serviceForm.active} onChange={(e) => setServiceForm({ ...serviceForm, active: e.target.checked })} /> Servizio attivo nell'app prenotazioni</label></div><div className="bookingActions"><button type="button" className="btn" onClick={saveService} disabled={savingService}>{savingService ? "Salvo..." : "Salva servizio"}</button><button type="button" className="tabBtn secondaryBtn" onClick={() => setServiceForm(emptyService())}>Nuovo servizio</button></div><div className="sectionTitle">Elenco servizi</div>{servicesLoading ? <div className="badge info">Caricamento servizi...</div> : services.map((service) => <div key={service.id} className="holidayItem"><div><strong>{service.name}</strong><div className="muted">{service.durationMin} min · €{service.price} · {service.active ? "Attivo" : "Disattivato"}</div></div><div className="bookingActions"><button type="button" className="tabBtn secondaryBtn" onClick={() => setServiceForm(service)}>Modifica servizio</button><button type="button" className="tabBtn dangerBtn" onClick={() => removeService(service.id)} disabled={deletingServiceId === service.id}>{deletingServiceId === service.id ? "Elimino..." : "Rimuovi"}</button></div></div>)}</div></section>}

      {tab === "impostazioni" && (
        <section className="card">
          <div className="grid">
            <div className="sectionTitle">Impostazioni operative</div>
            {settingsMessage && <div className={`badge ${settingsMessage.includes("salvate") ? "ok" : "error"}`}>{settingsMessage}</div>}
            {settingsLoading ? (
              <div className="badge info">Caricamento impostazioni...</div>
            ) : (
              <>
                <div className="gridTwoCols">
                  <div>
                    <label>Nome web app</label>
                    <input value={settings.brandTitle} onChange={(e) => setSettings({ ...settings, brandTitle: e.target.value })} placeholder="Es. Prenotazioni Online" />
                  </div>
                  <div>
                    <label>Sottotitolo web app</label>
                    <input value={settings.brandSubtitle} onChange={(e) => setSettings({ ...settings, brandSubtitle: e.target.value })} placeholder="Es. Prenota il tuo appuntamento in pochi secondi" />
                  </div>
                  <div>
                    <label>Intervallo slot</label>
                    <select value={settings.slotIntervalMin} onChange={(e) => setSettings({ ...settings, slotIntervalMin: Number(e.target.value) as 15 | 30 })}>
                      <option value={15}>15 minuti</option>
                      <option value={30}>30 minuti</option>
                    </select>
                  </div>
                  <div>
                    <label>Anticipo minimo prenotazione</label>
                    <input type="number" value={settings.minAdvanceMin} onChange={(e) => setSettings({ ...settings, minAdvanceMin: Number(e.target.value) })} />
                  </div>
                </div>

                <div className="sectionTitle">Giorni di chiusura</div>
                <div className="checkboxGrid">
                  {WEEKDAYS.map((day) => (
                    <label key={day.value} className="checkCard">
                      <input type="checkbox" checked={settings.closedWeekdays.includes(day.value)} onChange={() => toggleClosedWeekday(day.value)} /> {day.label}
                    </label>
                  ))}
                </div>

                <div className="sectionTitle">Orari mattina</div>
                <label className="switchRow">
                  <input type="checkbox" checked={settings.morningEnabled} onChange={(e) => setSettings({ ...settings, morningEnabled: e.target.checked })} /> Attiva fascia mattina
                </label>
                <div className="gridTwoCols">
                  <div>
                    <label>Apertura mattina</label>
                    <input type="time" value={settings.morningOpen} onChange={(e) => setSettings({ ...settings, morningOpen: e.target.value })} />
                  </div>
                  <div>
                    <label>Chiusura mattina</label>
                    <input type="time" value={settings.morningClose} onChange={(e) => setSettings({ ...settings, morningClose: e.target.value })} />
                  </div>
                </div>

                <div className="sectionTitle">Orari pomeriggio</div>
                <label className="switchRow">
                  <input type="checkbox" checked={settings.afternoonEnabled} onChange={(e) => setSettings({ ...settings, afternoonEnabled: e.target.checked })} /> Attiva fascia pomeriggio
                </label>
                <div className="gridTwoCols">
                  <div>
                    <label>Apertura pomeriggio</label>
                    <input type="time" value={settings.afternoonOpen} onChange={(e) => setSettings({ ...settings, afternoonOpen: e.target.value })} />
                  </div>
                  <div>
                    <label>Chiusura pomeriggio</label>
                    <input type="time" value={settings.afternoonClose} onChange={(e) => setSettings({ ...settings, afternoonClose: e.target.value })} />
                  </div>
                </div>

                <div className="sectionTitle">Ferie / chiusure straordinarie</div>
                <div className="holidayRow">
                  <div>
                    <label>Nuova data di chiusura</label>
                    <input type="date" value={newHoliday} onChange={(e) => setNewHoliday(e.target.value)} />
                  </div>
                  <button type="button" className="btn" onClick={addHoliday}>Aggiungi</button>
                </div>
                <div className="holidayList">
                  {settings.holidays.length === 0 ? <div className="badge info">Nessuna chiusura straordinaria.</div> : settings.holidays.map((holiday) => <div key={holiday} className="holidayItem"><strong>{holiday}</strong><button type="button" className="miniDangerBtn" onClick={() => setSettings({ ...settings, holidays: settings.holidays.filter((d) => d !== holiday) })}>Rimuovi data</button></div>)}
                </div>
                <button type="button" className="btn" onClick={saveSettings} disabled={savingSettings}>{savingSettings ? "Salvataggio..." : "Salva impostazioni"}</button>
              </>
            )}
          </div>
        </section>
      )}

    </main>
    );
  }
