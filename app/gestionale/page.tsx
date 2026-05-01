"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AdminBookingCalendar from "@/components/AdminBookingCalendar";

type Booking = {
  id: string;
  summary: string;
  serviceId: string;
  serviceName: string;
  collaboratorId: string;
  collaboratorName: string;
  calendarId: string;
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
  recurrenceLabel?: string;
  recurringRuleId?: string;
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
};

type Service = { id: string; name: string; durationMin: number; price: number; active: boolean };
type Collaborator = {
  id: string;
  name: string;
  active: boolean;
  calendarId?: string;
  color?: string;
  weeklyOffDays: number[];
  holidays: string[];
  morningEnabled: boolean;
  morningOpen: string;
  morningClose: string;
  afternoonEnabled: boolean;
  afternoonOpen: string;
  afternoonClose: string;
};

type DashboardResponse = { ok: boolean; range: "day" | "week" | "month"; date: string; total: number; bookings: Booking[] };

type SlotsResponse = {
  date: string;
  serviceId: string;
  collaboratorId?: string;
  preferredCollaboratorId?: string;
  peopleCount: number;
  slots: string[];
  settings?: BusinessSettings;
};


type CachedSlotsState = { slots: string[]; settings: BusinessSettings | null };

type BookResponse = {
  bookingId?: string;
  peopleCount?: number;
  bookings?: Array<{ collaboratorName: string; customerName: string }>;
};

type RecurringForm = {
  customerName: string;
  phone: string;
  serviceId: string;
  collaboratorId: string;
  startDate: string;
  time: string;
  every: number;
  unit: "days" | "weeks" | "months";
  occurrenceMode: "count" | "forever";
  occurrences: number;
  notes: string;
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
};

const WEEKDAYS = [
  { value: 0, label: "Domenica" },
  { value: 1, label: "Lunedì" },
  { value: 2, label: "Martedì" },
  { value: 3, label: "Mercoledì" },
  { value: 4, label: "Giovedì" },
  { value: 5, label: "Venerdì" },
  { value: 6, label: "Sabato" },
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

function emptyService(): Service {
  return { id: "", name: "", durationMin: 30, price: 0, active: true };
}

function emptyCollaborator(): Collaborator {
  return { id: "", name: "", active: true, calendarId: "", color: "", weeklyOffDays: [], holidays: [], morningEnabled: true, morningOpen: "09:00", morningClose: "13:00", afternoonEnabled: true, afternoonOpen: "15:30", afternoonClose: "20:00" };
}

function emptyRecurring(date = todayISO()): RecurringForm {
  return {
    customerName: "",
    phone: "",
    serviceId: "",
    collaboratorId: "",
    startDate: date,
    time: "09:00",
    every: 1,
    unit: "weeks",
    occurrenceMode: "count",
    occurrences: 4,
    notes: "",
  };
}

const COLLABORATOR_COLORS = ["#2563eb", "#16a34a", "#d97706", "#9333ea", "#dc2626", "#0891b2"];

function collaboratorColor(collaborator: Collaborator | undefined, index = 0) {
  const raw = String(collaborator?.color || "").trim();
  if (raw) return raw;
  return COLLABORATOR_COLORS[index % COLLABORATOR_COLORS.length];
}


export default function GestionalePage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [tab, setTab] = useState<"dashboard" | "calendario" | "clienti" | "storico" | "servizi" | "collaboratori" | "impostazioni">("calendario");
  const [date, setDate] = useState(todayISO());
  const [range, setRange] = useState<"day" | "week" | "month">("day");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const slotsCacheRef = useRef<Map<string, CachedSlotsState>>(new Map());
  const slotsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSlotsKeyRef = useRef("");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [deletingId, setDeletingId] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [expandedHistoryKeys, setExpandedHistoryKeys] = useState<Record<string, boolean>>({});
  const [dashboardCollaboratorFilter, setDashboardCollaboratorFilter] = useState("all");
  const [historyBookings, setHistoryBookings] = useState<Booking[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyMessage, setHistoryMessage] = useState("");

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

  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [collaboratorsLoading, setCollaboratorsLoading] = useState(true);
  const [collaboratorsMessage, setCollaboratorsMessage] = useState("");
  const [collaboratorForm, setCollaboratorForm] = useState<Collaborator>(emptyCollaborator());
  const [savingCollaborator, setSavingCollaborator] = useState(false);
  const [deletingCollaboratorId, setDeletingCollaboratorId] = useState("");
  const [newCollaboratorHoliday, setNewCollaboratorHoliday] = useState("");

  const [recurringForm, setRecurringForm] = useState<RecurringForm>(emptyRecurring());
  const [recurringLoading, setRecurringLoading] = useState(false);
  const [recurringMessage, setRecurringMessage] = useState("");

  const [calendarServiceId, setCalendarServiceId] = useState("");
  const [calendarPreferredCollaboratorId, setCalendarPreferredCollaboratorId] = useState("");
  const [calendarPeopleCount, setCalendarPeopleCount] = useState(1);
  const [calendarSlots, setCalendarSlots] = useState<string[]>([]);
  const [calendarSelectedSlot, setCalendarSelectedSlot] = useState("");
  const [calendarLoadingSlots, setCalendarLoadingSlots] = useState(false);
  const [calendarBooking, setCalendarBooking] = useState(false);
  const [calendarName, setCalendarName] = useState("");
  const [calendarPhone, setCalendarPhone] = useState("");
  const [calendarNotes, setCalendarNotes] = useState("");
  const [calendarGroupNamesText, setCalendarGroupNamesText] = useState("");
  const [calendarMessage, setCalendarMessage] = useState("");

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    loadDashboard();
  }, [authenticated, date, range]);

  useEffect(() => {
    if (!authenticated) return;
    loadSettings();
    loadServices();
    loadCollaborators();
    loadHistory();
  }, [authenticated]);

  useEffect(() => {
    setRecurringForm((prev) => ({
      ...prev,
      serviceId: prev.serviceId || services[0]?.id || "",
      collaboratorId: prev.collaboratorId || collaborators[0]?.id || "",
    }));
    setCalendarServiceId((prev) => prev || services[0]?.id || "");
  }, [services, collaborators]);

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

  async function loadHistory() {
    setHistoryLoading(true);
    setHistoryMessage("");
    try {
      const res = await fetch("/api/admin/history", { cache: "no-store" });
      const data = await safeJson<{ ok: boolean; total: number; bookings: Booking[] }>(res);
      setHistoryBookings(data.bookings || []);
    } catch (e: any) {
      setHistoryBookings([]);
      setHistoryMessage(e?.message || "Errore caricamento storico");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function loadSettings() {
    setSettingsLoading(true);
    try {
      const res = await fetch("/api/admin/settings", { cache: "no-store" });
      const data = await safeJson<{ ok: boolean; settings: BusinessSettings }>(res);
      setSettings(data.settings || DEFAULT_SETTINGS);
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

  async function loadCollaborators() {
    setCollaboratorsLoading(true);
    try {
      const res = await fetch("/api/admin/collaborators", { cache: "no-store" });
      const data = await safeJson<{ ok: boolean; collaborators: Collaborator[] }>(res);
      setCollaborators(data.collaborators || []);
    } catch (e: any) {
      setCollaboratorsMessage(e?.message || "Errore caricamento collaboratori");
    } finally {
      setCollaboratorsLoading(false);
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
      setSettings(data.settings);
      setSettingsMessage("Impostazioni salvate.");
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
      const payload = { ...serviceForm, id: serviceForm.id || undefined };
      const res = await fetch("/api/admin/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await safeJson<{ ok: boolean; services: Service[] }>(res);
      setServices(data.services || []);
      setServiceForm(emptyService());
      setServicesMessage("Servizio salvato con successo.");
    } catch (e: any) {
      setServicesMessage(e?.message || "Errore salvataggio servizio");
    } finally {
      setSavingService(false);
    }
  }

  async function saveCollaborator() {
    setSavingCollaborator(true);
    setCollaboratorsMessage("");
    try {
      const payload = { ...collaboratorForm, id: collaboratorForm.id || undefined };
      const res = await fetch("/api/admin/collaborators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await safeJson<{ ok: boolean; collaborators: Collaborator[] }>(res);
      setCollaborators(data.collaborators || []);
      setCollaboratorForm(emptyCollaborator());
      setCollaboratorsMessage("Collaboratore salvato con successo.");
    } catch (e: any) {
      setCollaboratorsMessage(e?.message || "Errore salvataggio collaboratore");
    } finally {
      setSavingCollaborator(false);
    }
  }

  async function removeService(id: string) {
    const ok = window.confirm("Vuoi davvero eliminare questo servizio?");
    if (!ok) return;
    setDeletingServiceId(id);
    try {
      const res = await fetch(`/api/admin/services?id=${id}`, { method: "DELETE" });
      const data = await safeJson<{ ok: boolean; services: Service[] }>(res);
      setServices(data.services || []);
      if (serviceForm.id === id) setServiceForm(emptyService());
    } catch (e: any) {
      setServicesMessage(e?.message || "Errore eliminazione servizio");
    } finally {
      setDeletingServiceId("");
    }
  }

  async function removeCollaborator(id: string) {
    const ok = window.confirm("Vuoi davvero eliminare questo collaboratore?");
    if (!ok) return;
    setDeletingCollaboratorId(id);
    try {
      const res = await fetch(`/api/admin/collaborators?id=${id}`, { method: "DELETE" });
      const data = await safeJson<{ ok: boolean; collaborators: Collaborator[] }>(res);
      setCollaborators(data.collaborators || []);
      if (collaboratorForm.id === id) setCollaboratorForm(emptyCollaborator());
    } catch (e: any) {
      setCollaboratorsMessage(e?.message || "Errore eliminazione collaboratore");
    } finally {
      setDeletingCollaboratorId("");
    }
  }

  async function removeBooking(item: Booking) {
    let scope: "single" | "series" = "single";

    if (item.recurringRuleId) {
      const choice = window.prompt(
        "Questo appuntamento fa parte di una ricorrenza. Scrivi: SOLO per eliminare solo questo appuntamento, TUTTA per eliminare tutta la ricorrenza.",
        "SOLO"
      );
      if (!choice) return;
      const normalizedChoice = choice.trim().toLowerCase();
      if (normalizedChoice === "tutta") {
        scope = "series";
      } else if (normalizedChoice !== "solo") {
        window.alert("Scelta non valida. Scrivi SOLO oppure TUTTA.");
        return;
      }
    } else {
      const ok = window.confirm("Vuoi eliminare questo appuntamento dal gestionale?");
      if (!ok) return;
    }

    setDeletingId(item.id);
    try {
      const query = new URLSearchParams({ calendarId: item.calendarId || "", scope }).toString();
      const res = await fetch(`/api/admin/bookings/${item.id}?${query}`, { method: "DELETE" });
      await safeJson(res);
      await Promise.all([loadDashboard(), loadHistory()]);
      setMessage(scope === "series" ? "Ricorrenza eliminata con successo." : "Appuntamento eliminato con successo.");
      setHistoryMessage("");
    } catch (e: any) {
      setMessage(e?.message || "Errore eliminazione appuntamento");
    } finally {
      setDeletingId("");
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

  function toggleCollaboratorWeekday(day: number) {
    setCollaboratorForm((prev) => ({
      ...prev,
      weeklyOffDays: prev.weeklyOffDays.includes(day)
        ? prev.weeklyOffDays.filter((d) => d !== day)
        : [...prev.weeklyOffDays, day].sort((a, b) => a - b),
    }));
  }

  function addCollaboratorHoliday() {
    if (!newCollaboratorHoliday) return;
    setCollaboratorForm((prev) => ({
      ...prev,
      holidays: Array.from(new Set([...(prev.holidays || []), newCollaboratorHoliday])).sort(),
    }));
    setNewCollaboratorHoliday("");
  }

  async function createRecurringBookings() {
    setRecurringLoading(true);
    setRecurringMessage("");
    try {
      const res = await fetch("/api/admin/recurring-bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recurringForm),
      });
      const data = await safeJson<{ ok: boolean; createdCount: number; skippedCount: number }>(res);
      setRecurringMessage(`Ricorrenza creata. Appuntamenti creati: ${data.createdCount}. Saltati: ${data.skippedCount}.`);
      loadDashboard();
    } catch (e: any) {
      setRecurringMessage(e?.message || "Errore creazione ricorrenza");
    } finally {
      setRecurringLoading(false);
    }
  }

  function fillRecurringFromCustomer(customerName: string, phone: string) {
    setRecurringForm((prev) => ({ ...prev, customerName, phone }));
    setTab("calendario");
    setRecurringMessage("");
  }

const calendarGroupNames = useMemo(
    () => calendarGroupNamesText.split("\n").map((item) => item.trim()).filter(Boolean),
    [calendarGroupNamesText]
  );

  const calendarHoursLabel = useMemo(() => {
    const parts: string[] = [];
    if (settings.morningEnabled) parts.push(`Mattina ${settings.morningOpen}-${settings.morningClose}`);
    if (settings.afternoonEnabled) parts.push(`Pomeriggio ${settings.afternoonOpen}-${settings.afternoonClose}`);
    return parts.join(" · ");
  }, [settings]);

  useEffect(() => {
    setMenuOpen(false);
  }, [tab]);

  useEffect(() => {
    if (!authenticated || !calendarServiceId) return;

    const qs = new URLSearchParams({
      date,
      serviceId: calendarServiceId,
      peopleCount: String(calendarPeopleCount),
      adminBypassMinAdvance: "1",
    });

    if (calendarPreferredCollaboratorId) {
      qs.set("preferredCollaboratorId", calendarPreferredCollaboratorId);
      qs.set("collaboratorId", calendarPreferredCollaboratorId);
    }

    const requestKey = qs.toString();
    latestSlotsKeyRef.current = requestKey;
    setCalendarSelectedSlot("");
    setCalendarMessage("");

    const cached = slotsCacheRef.current.get(requestKey);
    if (cached) {
      setCalendarSlots(cached.slots);
      setCalendarLoadingSlots(false);
      return;
    }

    setCalendarLoadingSlots(true);

    if (slotsDebounceRef.current) clearTimeout(slotsDebounceRef.current);

    slotsDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/slots?${requestKey}`);
        const data = await safeJson<SlotsResponse>(res);
        const nextState = { slots: data.slots || [], settings: null };
        slotsCacheRef.current.set(requestKey, nextState);
        if (latestSlotsKeyRef.current !== requestKey) return;
        setCalendarSlots(nextState.slots);
      } catch (e: any) {
        if (latestSlotsKeyRef.current !== requestKey) return;
        setCalendarSlots([]);
        setCalendarMessage(e?.message || "Errore caricamento slot");
      } finally {
        if (latestSlotsKeyRef.current === requestKey) setCalendarLoadingSlots(false);
      }
    }, 400);

    return () => {
      if (slotsDebounceRef.current) clearTimeout(slotsDebounceRef.current);
    };
  }, [authenticated, date, calendarServiceId, calendarPreferredCollaboratorId, calendarPeopleCount]);

  async function refreshCalendarSlots() {
    if (!calendarServiceId) return;

    const qs = new URLSearchParams({
      date,
      serviceId: calendarServiceId,
      peopleCount: String(calendarPeopleCount),
      adminBypassMinAdvance: "1",
    });

    if (calendarPreferredCollaboratorId) {
      qs.set("preferredCollaboratorId", calendarPreferredCollaboratorId);
      qs.set("collaboratorId", calendarPreferredCollaboratorId);
    }

    const requestKey = qs.toString();
    const res = await fetch(`/api/slots?${requestKey}`);
    const data = await safeJson<SlotsResponse>(res);
    const nextState = { slots: data.slots || [], settings: null };
    slotsCacheRef.current.set(requestKey, nextState);
    setCalendarSlots(nextState.slots);
  }

  async function createManualBooking() {
    setCalendarMessage("");

    if (!calendarSelectedSlot) {
      setCalendarMessage("Seleziona un orario.");
      return;
    }

    if (!calendarName.trim() || !calendarPhone.trim()) {
      setCalendarMessage("Inserisci nome e telefono.");
      return;
    }

    if (calendarPeopleCount > 1 && calendarGroupNames.length === 0) {
      setCalendarMessage("Per una prenotazione di gruppo inserisci almeno un nome per persona, uno per riga.");
      return;
    }

    setCalendarBooking(true);

    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: calendarServiceId,
          preferredCollaboratorId: calendarPreferredCollaboratorId,
          collaboratorId: calendarPreferredCollaboratorId,
          date,
          time: calendarSelectedSlot,
          name: calendarName.trim(),
          phone: calendarPhone.trim(),
          notes: "",
          peopleCount: calendarPeopleCount,
          customerNames: calendarPeopleCount > 1 ? calendarGroupNames : [calendarName.trim()],
          adminBypassMinAdvance: true,
        }),
      });

      const data = await safeJson<BookResponse>(res);
      const summary =
        data.bookings?.map((item) => `${item.customerName}: ${item.collaboratorName}`).join(" | ") ||
        "Appuntamento inserito";

      setCalendarMessage(
        calendarPeopleCount > 1
          ? `Prenotazione gruppo creata. ${summary}`
          : `Prenotazione creata con successo. ${summary}`
      );

      setCalendarSelectedSlot("");
      setCalendarName("");
      setCalendarPhone("");
      setCalendarNotes("");
      setCalendarGroupNamesText("");

      await refreshCalendarSlots();
      await loadDashboard();
    } catch (e: any) {
      setCalendarMessage(e?.message || "Errore prenotazione");
    } finally {
      setCalendarBooking(false);
    }
  }

  const stats = useMemo(() => {
    const totalRevenue = bookings.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
    const withPhone = bookings.filter((b) => b.phone).length;
    const uniqueClients = new Set(bookings.map((b) => `${b.customerName}|${b.phone}`)).size;
    const activeCollaborators = collaborators.filter((c) => c.active).length;
    return { totalAppointments: bookings.length, totalRevenue, withPhone, uniqueClients, activeCollaborators };
  }, [bookings, collaborators]);

  const allBookingsSorted = useMemo(
    () => [...bookings].sort((a, b) => new Date(b.startISO).getTime() - new Date(a.startISO).getTime()),
    [bookings]
  );

  const allHistoryBookingsSorted = useMemo(
    () => [...historyBookings].sort((a, b) => new Date(b.startISO).getTime() - new Date(a.startISO).getTime()),
    [historyBookings]
  );

  const filteredDashboardBookings = useMemo(() => {
    if (dashboardCollaboratorFilter === "all") return bookings;
    return bookings.filter((booking) => booking.collaboratorId === dashboardCollaboratorFilter);
  }, [bookings, dashboardCollaboratorFilter]);

  const customers = useMemo(() => {
    const map = new Map<string, { customerName: string; phone: string; totalBookings: number; totalSpent: number; lastDate: string; whatsappUrl: string }>();
    for (const booking of allHistoryBookingsSorted) {
      const key = `${booking.customerName}|${booking.phone}`;
      const prev = map.get(key) || {
        customerName: booking.customerName,
        phone: booking.phone,
        totalBookings: 0,
        totalSpent: 0,
        lastDate: booking.dateLabel,
        whatsappUrl: booking.whatsappUrl,
      };
      prev.totalBookings += 1;
      prev.totalSpent += Number(booking.price) || 0;
      prev.lastDate = booking.dateLabel || prev.lastDate;
      map.set(key, prev);
    }
    return Array.from(map.values()).sort((a, b) => b.totalBookings - a.totalBookings);
  }, [allHistoryBookingsSorted]);

  const filteredStats = useMemo(() => {
    const totalRevenue = filteredDashboardBookings.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
    const uniqueClients = new Set(filteredDashboardBookings.map((item) => `${item.customerName}|${item.phone}`)).size;
    const withPhone = filteredDashboardBookings.filter((item) => item.phone).length;
    const activeCollaborators =
      dashboardCollaboratorFilter === "all"
        ? collaborators.filter((c) => c.active).length
        : collaborators.filter((c) => c.active && c.id === dashboardCollaboratorFilter).length;

    return {
      totalAppointments: filteredDashboardBookings.length,
      totalRevenue,
      withPhone,
      uniqueClients,
      activeCollaborators,
    };
  }, [filteredDashboardBookings, collaborators, dashboardCollaboratorFilter]);

  const historyCustomers = useMemo(() => {
    const map = new Map<string, {
      key: string;
      customerName: string;
      phone: string;
      whatsappUrl: string;
      totalBookings: number;
      totalSpent: number;
      lastDate: string;
      bookings: Booking[];
    }>();

    for (const booking of allHistoryBookingsSorted) {
      const key = `${String(booking.customerName || "").trim()}|${String(booking.phone || "").trim()}`;
      const prev = map.get(key) || {
        key,
        customerName: booking.customerName,
        phone: booking.phone,
        whatsappUrl: booking.whatsappUrl,
        totalBookings: 0,
        totalSpent: 0,
        lastDate: booking.dateLabel,
        bookings: [],
      };

      prev.totalBookings += 1;
      prev.totalSpent += Number(booking.price) || 0;
      prev.lastDate = booking.dateLabel || prev.lastDate;
      prev.bookings.push(booking);
      map.set(key, prev);
    }

    const normalizedSearch = historySearch.trim().toLowerCase();

    return Array.from(map.values())
      .filter((customer) => {
        if (!normalizedSearch) return true;
        return (
          customer.customerName.toLowerCase().includes(normalizedSearch) ||
          String(customer.phone || "").toLowerCase().includes(normalizedSearch)
        );
      })
      .sort((a, b) => {
        const byName = a.customerName.localeCompare(b.customerName, "it");
        if (byName !== 0) return byName;
        return String(a.phone || "").localeCompare(String(b.phone || ""), "it");
      });
  }, [allHistoryBookingsSorted, historySearch]);

  useEffect(() => {
    setExpandedHistoryKeys((prev) => {
      const next = { ...prev };
      let changed = false;
      Object.keys(next).forEach((key) => {
        if (!historyCustomers.some((customer) => customer.key === key)) {
          delete next[key];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [historyCustomers]);

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
            <div>
              <label>Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div>
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button className="btn" onClick={login} disabled={loginLoading}>{loginLoading ? "Accesso..." : "Entra nel gestionale"}</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="container wideContainer">
      <header className="hero leftHero" style={{ marginBottom: 18 }}>
        <div className="brand leftBrand" style={{ width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div className="title">Gestionale</div>
              
            </div>

            <div style={{ position: "relative", marginLeft: "auto" }}>
              <button
                className="tabBtn"
                onClick={() => setMenuOpen((prev) => !prev)}
                style={{ minWidth: 190 }}
              >
                Menu rapido ▾
              </button>

              {menuOpen && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 10px)",
                    minWidth: 250,
                    background: "#111",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 14,
                    padding: 10,
                    display: "grid",
                    gap: 8,
                    zIndex: 20,
                    boxShadow: "0 14px 34px rgba(0,0,0,0.35)",
                  }}
                >
                  {[
                    ["calendario", "Calendario"],
                    ["dashboard", "Dashboard"],
                    ["clienti", "Clienti"],
                    ["storico", "Storico"],
                    ["servizi", "Servizi & Prezzi"],
                    ["collaboratori", "Collaboratori"],
                    ["impostazioni", "Impostazioni"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      className={`tabBtn ${tab === value ? "activeTab" : ""}`}
                      onClick={() => setTab(value as any)}
                      style={{ width: "100%", justifyContent: "flex-start" }}
                    >
                      {label}
                    </button>
                  ))}
                  <button className="tabBtn secondaryBtn" onClick={logout} style={{ width: "100%" }}>
                    Esci
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <section className="card" style={{ marginBottom: 18 }}>
        <div className="tabRow" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div className="badge info">
            Sezione attiva: {tab === "calendario" ? "Calendario" : tab === "dashboard" ? "Dashboard" : tab === "clienti" ? "Clienti" : tab === "storico" ? "Storico" : tab === "servizi" ? "Servizi & Prezzi" : tab === "collaboratori" ? "Collaboratori" : "Impostazioni"}
          </div>
          
        </div>
      </section>

      {tab === "dashboard" && (
        <>
          <section className="card" style={{ marginBottom: 18 }}>
            <div className="gridTwoCols">
              <div>
                <label>Data base</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <label>Vista</label>
                <select value={range} onChange={(e) => setRange(e.target.value as any)}>
                  <option value="day">Giorno</option>
                  <option value="week">Settimana</option>
                  <option value="month">Mese</option>
                </select>
              </div>
            </div>
          </section>

          <section className="statsRow" style={{ marginBottom: 18 }}>
            <div className="statBox"><strong>{filteredStats.totalAppointments}</strong><span>Appuntamenti</span></div>
            <div className="statBox"><strong>€{filteredStats.totalRevenue}</strong><span>Incasso stimato</span></div>
            <div className="statBox"><strong>{filteredStats.uniqueClients}</strong><span>Clienti unici</span></div>
            <div className="statBox"><strong>{filteredStats.activeCollaborators}</strong><span>Collaboratori attivi</span></div>
          </section>

          <section className="card">
            <div className="grid">
              <div className="sectionTitle">Dashboard</div>
              <div className="badge info">Filtra gli appuntamenti per collaboratore oppure visualizza tutto insieme.</div>

              <div className="dashboardFilterRow">
                <button
                  type="button"
                  className={`collabFilterBtn ${dashboardCollaboratorFilter === "all" ? "activeCollabFilter" : ""}`}
                  onClick={() => setDashboardCollaboratorFilter("all")}
                >
                  Tutti gli appuntamenti
                </button>
                {collaborators.filter((c) => c.active).map((collaborator, index) => (
                  <button
                    key={collaborator.id}
                    type="button"
                    className={`collabFilterBtn ${dashboardCollaboratorFilter === collaborator.id ? "activeCollabFilter" : ""}`}
                    onClick={() => setDashboardCollaboratorFilter(collaborator.id)}
                    style={{ borderColor: collaboratorColor(collaborator, index), boxShadow: dashboardCollaboratorFilter === collaborator.id ? `0 0 0 2px ${collaboratorColor(collaborator, index)}33 inset` : undefined }}
                  >
                    <span className="collabDot" style={{ background: collaboratorColor(collaborator, index) }} />
                    {collaborator.name}
                  </button>
                ))}
              </div>

              {message && <div className="badge error">{message}</div>}
              {loading ? (
                <div className="badge info">Caricamento appuntamenti...</div>
              ) : filteredDashboardBookings.length === 0 ? (
                <div className="badge info">Nessun appuntamento trovato per il filtro selezionato.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {filteredDashboardBookings.map((item) => (
                    <div
                      key={`${item.calendarId}-${item.id}`}
                      style={{
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 16,
                        padding: 12,
                        background: "rgba(255,255,255,0.02)",
                      }}
                    >
                      <div style={{ display: "grid", gridTemplateColumns: "130px 1fr auto", gap: 12, alignItems: "start" }}>
                        <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                          <div style={{ fontWeight: 800 }}>{item.startLabel} - {item.endLabel}</div>
                          <div className="muted" style={{ fontSize: 12 }}>{item.dateLabel}</div>
                        </div>

                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 3 }}>{item.customerName}</div>
                          <div className="muted" style={{ fontSize: 12 }}>{item.serviceName} · €{item.price} · {item.collaboratorName || "—"}</div>
                          <div className="muted" style={{ fontSize: 12 }}>{item.phone || "Telefono non disponibile"}</div>
                        </div>

                        <div className="bookingActions" style={{ alignItems: "flex-end", gap: 8 }}>
                          {item.whatsappUrl && <a className="tabBtn secondaryBtn" href={item.whatsappUrl} target="_blank">WhatsApp</a>}
                          <button className="tabBtn dangerBtn" onClick={() => removeBooking(item)} disabled={deletingId === item.id}>
                            {deletingId === item.id ? "Elimino..." : "Elimina"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </>
      )}

{tab === "calendario" && (
        <>
          <section className="card">
            <AdminBookingCalendar
              services={services.filter((service) => service.active)}
              collaborators={collaborators.filter((collaborator) => collaborator.active)}
              onBooked={() => {
                loadDashboard();
                loadHistory();
              }}
            />
          </section>

          <section className="card" style={{ marginTop: 16 }}>
            <div className="grid">
              <div className="sectionTitle">Ricorrenza</div>
              {recurringMessage && <div className={`badge ${recurringMessage.includes("creata") ? "ok" : "error"}`}>{recurringMessage}</div>}
              <div className="gridTwoCols">
                <div>
                  <label>Nome cliente</label>
                  <input value={recurringForm.customerName} onChange={(e) => setRecurringForm({ ...recurringForm, customerName: e.target.value })} />
                </div>
                <div>
                  <label>Telefono</label>
                  <input value={recurringForm.phone} onChange={(e) => setRecurringForm({ ...recurringForm, phone: e.target.value })} />
                </div>
                <div>
                  <label>Servizio</label>
                  <select value={recurringForm.serviceId} onChange={(e) => setRecurringForm({ ...recurringForm, serviceId: e.target.value })}>
                    <option value="">Seleziona servizio</option>
                    {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
                  </select>
                </div>
                <div>
                  <label>Collaboratore</label>
                  <select value={recurringForm.collaboratorId} onChange={(e) => setRecurringForm({ ...recurringForm, collaboratorId: e.target.value })}>
                    <option value="">Seleziona collaboratore</option>
                    {collaborators.map((collaborator) => <option key={collaborator.id} value={collaborator.id}>{collaborator.name}</option>)}
                  </select>
                </div>
                <div>
                  <label>Data iniziale</label>
                  <input type="date" value={recurringForm.startDate} onChange={(e) => setRecurringForm({ ...recurringForm, startDate: e.target.value })} />
                </div>
                <div>
                  <label>Orario</label>
                  <input type="time" value={recurringForm.time} onChange={(e) => setRecurringForm({ ...recurringForm, time: e.target.value })} />
                </div>
                <div>
                  <label>Ripeti ogni</label>
                  <input type="number" min={1} value={recurringForm.every} onChange={(e) => setRecurringForm({ ...recurringForm, every: Number(e.target.value) || 1 })} />
                </div>
                <div>
                  <label>Unità</label>
                  <select value={recurringForm.unit} onChange={(e) => setRecurringForm({ ...recurringForm, unit: e.target.value as "days" | "weeks" | "months" })}>
                    <option value="days">Giorni</option>
                    <option value="weeks">Settimane</option>
                    <option value="months">Mesi</option>
                  </select>
                </div>
                <div>
                  <label>Tipo ricorrenza</label>
                  <select value={recurringForm.occurrenceMode} onChange={(e) => setRecurringForm({ ...recurringForm, occurrenceMode: e.target.value as "count" | "forever" })}>
                    <option value="count">Numero appuntamenti</option>
                    <option value="forever">Per sempre</option>
                  </select>
                </div>
                {recurringForm.occurrenceMode === "count" ? (
                  <div>
                    <label>Quanti appuntamenti</label>
                    <input type="number" min={1} max={240} value={recurringForm.occurrences} onChange={(e) => setRecurringForm({ ...recurringForm, occurrences: Math.max(1, Number(e.target.value) || 1) })} />
                  </div>
                ) : (
                  <div>
                    <label>Durata serie</label>
                    <div className="badge info">Per sempre crea automaticamente fino a 240 appuntamenti futuri.</div>
                  </div>
                )}
                <div className="fullRow">
                  <label>Note</label>
                  <textarea rows={3} value={recurringForm.notes} onChange={(e) => setRecurringForm({ ...recurringForm, notes: e.target.value })} />
                </div>
              </div>
              <div className="bookingActions">
                <button className="btn" onClick={createRecurringBookings} disabled={recurringLoading}>{recurringLoading ? "Creazione..." : "Crea appuntamenti ricorrenti"}</button>
                <button className="tabBtn secondaryBtn" onClick={() => setRecurringForm(emptyRecurring(date))}>Reset</button>
              </div>
            </div>
          </section>
        </>
      )}

      {tab === "clienti" && (
        <section className="card">
          <div className="grid">
            <div className="sectionTitle">Clienti</div>
            {customers.length === 0 ? <div className="badge info">Nessun cliente disponibile.</div> : customers.map((c, i) => (
              <div key={`${c.phone}-${i}`} className="holidayItem">
                <div>
                  <strong>{c.customerName}</strong>
                  <div className="muted">{c.phone || "Telefono non disponibile"}</div>
                  <div className="muted">Prenotazioni: {c.totalBookings} · Speso: €{c.totalSpent}</div>
                </div>
                <div className="bookingActions">
                  {c.whatsappUrl && <a className="tabBtn secondaryBtn" href={c.whatsappUrl} target="_blank">WhatsApp</a>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "storico" && (
        <section className="card">
          <div className="grid">
            <div className="sectionTitle">Storico clienti</div>
            <div>
              <label>Cerca cliente</label>
              <input
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Cerca per nome o telefono"
              />
            </div>

            {historyMessage && <div className="badge error">{historyMessage}</div>}

            {historyLoading ? (
              <div className="badge info">Caricamento storico...</div>
            ) : historyCustomers.length === 0 ? (
              <div className="badge info">Nessun cliente trovato nello storico.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {historyCustomers.map((customer) => {
                  const isOpen = Boolean(expandedHistoryKeys[customer.key]);
                  return (
                    <div key={customer.key} className="historyAccordion">
                      <button
                        type="button"
                        className="historyAccordionBtn"
                        onClick={() => setExpandedHistoryKeys((prev) => ({ ...prev, [customer.key]: !prev[customer.key] }))}
                      >
                        <div>
                          <strong>{customer.customerName}</strong>
                          <div className="muted">{customer.phone || "Telefono non disponibile"}</div>
                          <div className="muted">Appuntamenti: {customer.totalBookings} · Speso: €{customer.totalSpent}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div className="muted">{customer.lastDate}</div>
                          <div className="muted">{isOpen ? "Chiudi" : "Apri"}</div>
                        </div>
                      </button>

                      {isOpen && (
                        <div className="historyAccordionContent">
                          <div className="historyCustomerMeta">
                            <div><strong>Cliente:</strong> {customer.customerName}</div>
                            <div><strong>Telefono:</strong> {customer.phone || "Non disponibile"}</div>
                            <div><strong>Totale appuntamenti:</strong> {customer.totalBookings}</div>
                            <div><strong>Speso totale:</strong> €{customer.totalSpent}</div>
                            {customer.whatsappUrl ? <a className="tabBtn secondaryBtn" href={customer.whatsappUrl} target="_blank">WhatsApp</a> : null}
                          </div>

                          <div style={{ display: "grid", gap: 10 }}>
                            {customer.bookings.map((item) => (
                              <div
                                key={`${item.calendarId}-${item.id}`}
                                style={{
                                  border: "1px solid rgba(255,255,255,0.08)",
                                  borderRadius: 14,
                                  padding: 12,
                                  background: "rgba(255,255,255,0.02)",
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                                  <div>
                                    <strong>{item.serviceName}</strong>
                                    <div className="muted">{item.dateLabel} · {item.startLabel} - {item.endLabel}</div>
                                    <div className="muted">Collaboratore: {item.collaboratorName || "—"}</div>
                                  </div>
                                  <div style={{ textAlign: "right" }}>
                                    <strong>€{item.price}</strong>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {tab === "servizi" && (
        <section className="card">
          <div className="grid">
            <div className="sectionTitle">Servizi</div>
            {servicesMessage && <div className={`badge ${servicesMessage.includes("successo") ? "ok" : "error"}`}>{servicesMessage}</div>}
            <div className="gridTwoCols">
              <div>
                <label>Nome servizio</label>
                <input value={serviceForm.name} onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })} placeholder="es. Taglio + Barba" />
              </div>
              <div>
                <label>Durata (min)</label>
                <input type="number" value={serviceForm.durationMin} onChange={(e) => setServiceForm({ ...serviceForm, durationMin: Number(e.target.value) })} />
              </div>
              <div>
                <label>Prezzo (€)</label>
                <input type="number" value={serviceForm.price} onChange={(e) => setServiceForm({ ...serviceForm, price: Number(e.target.value) })} />
              </div>
              <label className="switchRow fullRow"><input type="checkbox" checked={serviceForm.active} onChange={(e) => setServiceForm({ ...serviceForm, active: e.target.checked })} /> Servizio attivo nell'app prenotazioni</label>
            </div>
            <div className="bookingActions">
              <button className="btn" onClick={saveService} disabled={savingService}>{savingService ? "Salvo..." : "Salva servizio"}</button>
              <button className="tabBtn secondaryBtn" onClick={() => setServiceForm(emptyService())}>Nuovo servizio</button>
            </div>

            <div className="sectionTitle">Elenco servizi</div>
            {servicesLoading ? <div className="badge info">Caricamento servizi...</div> : services.map((service) => (
              <div key={service.id} className="holidayItem">
                <div>
                  <strong>{service.name}</strong>
                  <div className="muted">{service.durationMin} min · €{service.price} · {service.active ? "Attivo" : "Disattivato"}</div>
                </div>
                <div className="bookingActions">
                  <button className="tabBtn secondaryBtn" onClick={() => setServiceForm(service)}>Modifica</button>
                  <button className="tabBtn dangerBtn" onClick={() => removeService(service.id)} disabled={deletingServiceId === service.id}>{deletingServiceId === service.id ? "Elimino..." : "Rimuovi"}</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "collaboratori" && (
        <section className="card">
          <div className="grid">
            <div className="sectionTitle">Collaboratori</div>
            
            {collaboratorsMessage && <div className={`badge ${collaboratorsMessage.includes("successo") ? "ok" : "error"}`}>{collaboratorsMessage}</div>}
            <div className="gridTwoCols">
              <div>
                <label>ID collaboratore (facoltativo)</label>
                <input value={collaboratorForm.id} onChange={(e) => setCollaboratorForm({ ...collaboratorForm, id: e.target.value })} placeholder="es. marco" />
              </div>
              <div>
                <label>Nome operatore</label>
                <input value={collaboratorForm.name} onChange={(e) => setCollaboratorForm({ ...collaboratorForm, name: e.target.value })} placeholder="es. Marco" />
              </div>
              <label className="switchRow fullRow"><input type="checkbox" checked={collaboratorForm.active} onChange={(e) => setCollaboratorForm({ ...collaboratorForm, active: e.target.checked })} /> Operatore attivo nell'app prenotazioni</label>
            </div>

            <div className="sectionTitle">Giorni fissi di riposo dell'operatore</div>
            <div className="checkboxGrid">
              {WEEKDAYS.map((day) => (
                <label key={day.value} className="checkCard">
                  <input type="checkbox" checked={collaboratorForm.weeklyOffDays.includes(day.value)} onChange={() => toggleCollaboratorWeekday(day.value)} /> {day.label}
                </label>
              ))}
            </div>

            <div className="sectionTitle">Orari personalizzati operatore</div>
            <label className="switchRow"><input type="checkbox" checked={collaboratorForm.morningEnabled} onChange={(e) => setCollaboratorForm({ ...collaboratorForm, morningEnabled: e.target.checked })} /> Attiva fascia mattina</label>
            <div className="gridTwoCols">
              <div><label>Apertura mattina</label><input type="time" value={collaboratorForm.morningOpen} onChange={(e) => setCollaboratorForm({ ...collaboratorForm, morningOpen: e.target.value })} /></div>
              <div><label>Chiusura mattina</label><input type="time" value={collaboratorForm.morningClose} onChange={(e) => setCollaboratorForm({ ...collaboratorForm, morningClose: e.target.value })} /></div>
            </div>
            <label className="switchRow"><input type="checkbox" checked={collaboratorForm.afternoonEnabled} onChange={(e) => setCollaboratorForm({ ...collaboratorForm, afternoonEnabled: e.target.checked })} /> Attiva fascia pomeriggio</label>
            <div className="gridTwoCols">
              <div><label>Apertura pomeriggio</label><input type="time" value={collaboratorForm.afternoonOpen} onChange={(e) => setCollaboratorForm({ ...collaboratorForm, afternoonOpen: e.target.value })} /></div>
              <div><label>Chiusura pomeriggio</label><input type="time" value={collaboratorForm.afternoonClose} onChange={(e) => setCollaboratorForm({ ...collaboratorForm, afternoonClose: e.target.value })} /></div>
            </div>

            <div className="sectionTitle">Ferie / assenze dell'operatore</div>
            <div className="holidayRow">
              <div><label>Nuova data ferie</label><input type="date" value={newCollaboratorHoliday} onChange={(e) => setNewCollaboratorHoliday(e.target.value)} /></div>
              <button className="btn" onClick={addCollaboratorHoliday}>Aggiungi</button>
            </div>
            <div className="holidayList">
              {collaboratorForm.holidays.length === 0 ? <div className="badge info">Nessuna ferie/assenza impostata.</div> : collaboratorForm.holidays.map((holiday) => (
                <div key={holiday} className="holidayItem">
                  <strong>{holiday}</strong>
                  <button className="miniDangerBtn" onClick={() => setCollaboratorForm({ ...collaboratorForm, holidays: collaboratorForm.holidays.filter((d) => d !== holiday) })}>Rimuovi</button>
                </div>
              ))}
            </div>

            <div className="bookingActions">
              <button className="btn" onClick={saveCollaborator} disabled={savingCollaborator || !collaboratorForm.id}>{savingCollaborator ? "Salvo..." : "Salva operatore"}</button>
              <button className="tabBtn secondaryBtn" disabled>Gestionale 1 operatore</button>
            </div>

            <div className="sectionTitle">Operatore</div>
            {collaboratorsLoading ? <div className="badge info">Caricamento collaboratori...</div> : collaborators.map((collaborator) => (
              <div key={collaborator.id} className="holidayItem">
                <div>
                  <strong>{collaborator.name}</strong>
                  <div className="muted">Riposo settimanale: {collaborator.weeklyOffDays.length ? WEEKDAYS.filter((day) => collaborator.weeklyOffDays.includes(day.value)).map((day) => day.label).join(", ") : "nessuno"}</div>
                  <div className="muted">Ferie impostate: {collaborator.holidays.length}</div>
                  <div className="muted">Mattina: {collaborator.morningEnabled ? `${collaborator.morningOpen}-${collaborator.morningClose}` : "off"} · Pomeriggio: {collaborator.afternoonEnabled ? `${collaborator.afternoonOpen}-${collaborator.afternoonClose}` : "off"}</div>
                  <div className="muted">{collaborator.active ? "Attivo" : "Disattivato"}</div>
                </div>
                <div className="bookingActions">
                  <button className="tabBtn secondaryBtn" onClick={() => { setCollaboratorForm(collaborator); setNewCollaboratorHoliday(""); }}>Modifica</button>
                  <button className="tabBtn dangerBtn" onClick={() => removeCollaborator(collaborator.id)} disabled={deletingCollaboratorId === collaborator.id || collaborators.length <= 1}>{deletingCollaboratorId === collaborator.id ? "Elimino..." : "Rimuovi"}</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "impostazioni" && (
        <section className="card">
          <div className="grid">
            <div className="sectionTitle">Impostazioni</div>
            {settingsMessage && <div className={`badge ${settingsMessage.includes("salvate") ? "ok" : "error"}`}>{settingsMessage}</div>}
            {settingsLoading ? <div className="badge info">Caricamento impostazioni...</div> : (
              <>
                <div>
                  <label>Intervallo slot</label>
                  <select value={settings.slotIntervalMin} onChange={(e) => setSettings({ ...settings, slotIntervalMin: Number(e.target.value) as 15 | 30 })}>
                    <option value={15}>15 minuti</option>
                    <option value={30}>30 minuti</option>
                  </select>
                </div>

                <div>
                  <label>Anticipo minimo prenotazione web app (minuti)</label>
                  <input
                    type="number"
                    min={0}
                    step={15}
                    value={settings.minAdvanceMin}
                    onChange={(e) => setSettings({ ...settings, minAdvanceMin: Math.max(0, Number(e.target.value) || 0) })}
                  />
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
                <label className="switchRow"><input type="checkbox" checked={settings.morningEnabled} onChange={(e) => setSettings({ ...settings, morningEnabled: e.target.checked })} /> Attiva fascia mattina</label>
                <div className="gridTwoCols">
                  <div><label>Apertura mattina</label><input type="time" value={settings.morningOpen} onChange={(e) => setSettings({ ...settings, morningOpen: e.target.value })} /></div>
                  <div><label>Chiusura mattina</label><input type="time" value={settings.morningClose} onChange={(e) => setSettings({ ...settings, morningClose: e.target.value })} /></div>
                </div>

                <div className="sectionTitle">Orari pomeriggio</div>
                <label className="switchRow"><input type="checkbox" checked={settings.afternoonEnabled} onChange={(e) => setSettings({ ...settings, afternoonEnabled: e.target.checked })} /> Attiva fascia pomeriggio</label>
                <div className="gridTwoCols">
                  <div><label>Apertura pomeriggio</label><input type="time" value={settings.afternoonOpen} onChange={(e) => setSettings({ ...settings, afternoonOpen: e.target.value })} /></div>
                  <div><label>Chiusura pomeriggio</label><input type="time" value={settings.afternoonClose} onChange={(e) => setSettings({ ...settings, afternoonClose: e.target.value })} /></div>
                </div>

                <div className="sectionTitle">Ferie / chiusure straordinarie</div>
                <div className="holidayRow">
                  <div><label>Nuova data di chiusura</label><input type="date" value={newHoliday} onChange={(e) => setNewHoliday(e.target.value)} /></div>
                  <button className="btn" onClick={addHoliday}>Aggiungi</button>
                </div>
                <div className="holidayList">
                  {settings.holidays.length === 0 ? <div className="badge info">Nessuna chiusura straordinaria.</div> : settings.holidays.map((holiday) => (
                    <div key={holiday} className="holidayItem">
                      <strong>{holiday}</strong>
                      <button className="miniDangerBtn" onClick={() => setSettings({ ...settings, holidays: settings.holidays.filter((d) => d !== holiday) })}>Rimuovi</button>
                    </div>
                  ))}
                </div>

                <button className="btn" onClick={saveSettings} disabled={savingSettings}>{savingSettings ? "Salvataggio..." : "Salva impostazioni"}</button>
              </>
            )}
          </div>
        </section>
      )}
      <style jsx>{`
        .dashboardFilterRow {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .collabFilterBtn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 44px;
          padding: 10px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.03);
          color: #fff;
          cursor: pointer;
          transition: 0.2s ease;
        }
        .collabFilterBtn:hover,
        .activeCollabFilter {
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,255,255,0.28);
        }
        .collabDot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          display: inline-block;
        }
        .historyAccordion {
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px;
          overflow: hidden;
          background: rgba(255,255,255,0.02);
        }
        .historyAccordionBtn {
          width: 100%;
          display: flex;
          justify-content: space-between;
          gap: 16px;
          text-align: left;
          padding: 14px;
          border: 0;
          background: transparent;
          color: #fff;
          cursor: pointer;
        }
        .historyAccordionContent {
          padding: 0 14px 14px;
          display: grid;
          gap: 12px;
        }
        .historyCustomerMeta {
          display: grid;
          gap: 8px;
          padding: 12px;
          border-radius: 14px;
          background: rgba(255,255,255,0.04);
        }
        @media (max-width: 860px) {
          .statsRow {
            grid-template-columns: 1fr 1fr;
          }
        }
        @media (max-width: 640px) {
          .statsRow {
            grid-template-columns: 1fr;
          }
          .historyAccordionBtn {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>

    </main>
  );
}
