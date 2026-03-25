"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Trash, Edit2, Clock, Users, Calendar, Activity, Moon, Sun, LogOut, AlertTriangle,
  Bell, RefreshCw, ArrowRightLeft, Download,
} from "lucide-react";
import { Toaster, toast } from "react-hot-toast";
import { fromZonedTime, toZonedTime, format as formatTz } from "date-fns-tz";

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "Europe/London", "Europe/Paris",
  "Asia/Karachi", "Asia/Dubai", "Asia/Kolkata", "Asia/Tokyo",
  "Australia/Sydney", "Pacific/Auckland",
];

function hasBusinessWeekSlots(recurring) {
  if (!Array.isArray(recurring) || recurring.length === 0) return false;
  const need = new Set([1, 2, 3, 4, 5]);
  for (const r of recurring) {
    if (need.has(r.dayOfWeek) && r.startMinute === 540 && r.endMinute === 1020) {
      need.delete(r.dayOfWeek);
    }
  }
  return need.size === 0;
}

function assigneeNames(shift) {
  if (shift.assignedUsers?.length) {
    return shift.assignedUsers.map((u) => u?.name || "?").filter(Boolean);
  }
  if (shift.user?.name) return [shift.user.name];
  return [];
}

export default function Dashboard() {
  const router = useRouter();
  const [shifts, setShifts] = useState([]);
  const [users, setUsers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalShifts: 0, totalHours: 0, topEmployee: "N/A" });
  const [theme, setTheme] = useState("light");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [editingShiftId, setEditingShiftId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [laborPreview, setLaborPreview] = useState(null);
  const [laborOverrideReason, setLaborOverrideReason] = useState("");
  const [laborSummary, setLaborSummary] = useState(null);
  const [notifications, setNotifications] = useState({ items: [], unreadCount: 0 });
  const [showNotify, setShowNotify] = useState(false);
  const [onDuty, setOnDuty] = useState([]);
  const [fairness, setFairness] = useState(null);
  const [conflictSuggestions, setConflictSuggestions] = useState([]);
  const [editingSchemaVersion, setEditingSchemaVersion] = useState(null);
  const [bypassScheduleCutoff, setBypassScheduleCutoff] = useState(false);
  const [profileForm, setProfileForm] = useState({
    desiredHoursPerWeek: "",
    timezone: "America/New_York",
    applyBusinessHours: false,
  });

  const [form, setForm] = useState({
    title: "", date: "", location: "", user: "",
    startTime: "", endTime: "", requiredSkill: "Service", status: "Published",
    requiredHeadcount: 1,
  });

  const computeStats = useCallback((shiftsData) => {
    let tHours = 0;
    const hoursMap = {};
    shiftsData.forEach((s) => {
      const hrs = (new Date(s.endTime) - new Date(s.startTime)) / 3600000;
      tHours += hrs;
      const names = assigneeNames(s);
      if (names.length === 0) return;
      const share = hrs / names.length;
      names.forEach((n) => {
        hoursMap[n] = (hoursMap[n] || 0) + share;
      });
    });
    let topEmp = "N/A", maxHrs = 0;
    Object.entries(hoursMap).forEach(([k, v]) => { if (v > maxHrs) { maxHrs = v; topEmp = k; } });
    setStats({ totalShifts: shiftsData.length, totalHours: tHours.toFixed(1), topEmployee: topEmp });
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [shRes, usRes, locRes] = await Promise.all([
        fetch("/api/shifts"), fetch("/api/users"), fetch("/api/locations"),
      ]);
      if (shRes.status === 401 || usRes.status === 401 || locRes.status === 401) {
        localStorage.removeItem("shiftsync_user");
        router.push("/login");
        return;
      }
      if (!shRes.ok || !usRes.ok || !locRes.ok) throw new Error("Failed to fetch data.");
      const [shData, usData, locData] = await Promise.all([shRes.json(), usRes.json(), locRes.json()]);
      setShifts(shData);
      setUsers(usData);
      setLocations(locData);
      computeStats(shData);
    } catch (err) {
      toast.error(err.message || "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [computeStats, router]);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setNotifications({ items: data.items || [], unreadCount: data.unreadCount ?? 0 });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("shiftsync_user");
    if (!stored) { router.push("/login"); return; }
    try { setCurrentUser(JSON.parse(stored)); } catch {}
    setIsAuthenticated(true);
    fetchData();
    const storedTheme = localStorage.getItem("shiftsync_theme");
    if (storedTheme) setTheme(storedTheme);
    setAuthChecking(false);
  }, [router, fetchData]);

  const canManage =
    currentUser?.role === "Admin" || currentUser?.role === "Manager";

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchNotifications();
    const t = setInterval(fetchNotifications, 60000);
    return () => clearInterval(t);
  }, [isAuthenticated, fetchNotifications]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const es = new EventSource("/api/events");
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "shifts_updated" || msg.type === "swap_updated") {
          fetchData();
          fetchNotifications();
        }
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      es.close();
    };
    return () => es.close();
  }, [isAuthenticated, fetchData, fetchNotifications]);

  useEffect(() => {
    if (!currentUser?._id || canManage) return;
    const uid = String(currentUser._id);
    const u = users.find((x) => String(x._id) === uid);
    if (u) {
      setProfileForm({
        desiredHoursPerWeek: u.desiredHoursPerWeek ?? "",
        timezone: u.timezone || "America/New_York",
        applyBusinessHours: hasBusinessWeekSlots(u.recurringAvailability),
      });
    }
  }, [users, currentUser, canManage]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const odRes = await fetch("/api/shifts/on-duty");
        if (!cancelled && odRes.ok) setOnDuty(await odRes.json());
        if (canManage) {
          const faRes = await fetch("/api/analytics/fairness");
          if (!cancelled && faRes.ok) setFairness(await faRes.json());
        } else if (!cancelled) setFairness(null);
      } catch {
        if (!cancelled) {
          setOnDuty([]);
          setFairness(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, canManage, shifts]);

  useEffect(() => {
    if (!canManage) {
      setLaborSummary(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/labor/summary");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setLaborSummary(data);
      } catch {
        if (!cancelled) setLaborSummary(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canManage, shifts]);

  useEffect(() => {
    if (!canManage) {
      setLaborPreview(null);
      return;
    }
    if (!form.user || !form.date || !form.startTime || !form.endTime || !form.location) {
      setLaborPreview(null);
      return;
    }
    const loc = locations.find((l) => l._id === form.location);
    if (!loc) return;
    const tz = loc.timezone || "UTC";
    let startDT;
    let endDT;
    try {
      startDT = fromZonedTime(`${form.date}T${form.startTime}`, tz);
      endDT = fromZonedTime(`${form.date}T${form.endTime}`, tz);
      if (endDT <= startDT) endDT = new Date(endDT.getTime() + 86400000);
    } catch {
      setLaborPreview(null);
      return;
    }
    const ac = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/shifts/labor-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: form.user,
            startTime: startDT.toISOString(),
            endTime: endDT.toISOString(),
            shiftId: editingShiftId || undefined,
          }),
          signal: ac.signal,
        });
        if (res.ok) setLaborPreview(await res.json());
      } catch (e) {
        if (e.name !== "AbortError") setLaborPreview(null);
      }
    }, 450);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [
    canManage,
    form.user,
    form.date,
    form.startTime,
    form.endTime,
    form.location,
    locations,
    editingShiftId,
  ]);

  const toggleTheme = () => {
    const t = theme === "light" ? "dark" : "light";
    setTheme(t);
    localStorage.setItem("shiftsync_theme", t);
  };

  const logout = async () => {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
    localStorage.removeItem("shiftsync_user");
    router.push("/login");
  };

  const publishWeek = async () => {
    const monday = new Date();
    const d = monday.getDay();
    const diff = monday.getDate() - ((d + 6) % 7);
    monday.setDate(diff);
    monday.setHours(0, 0, 0, 0);
    const tid = toast.loading("Publishing week…");
    try {
      const res = await fetch("/api/schedule/publish-week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: monday.toISOString() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Publish failed", { id: tid });
        return;
      }
      toast.success(`Published ${data.updated ?? 0} draft shift(s).`, { id: tid });
      fetchData();
    } catch {
      toast.error("Publish failed", { id: tid });
    }
  };

  const downloadAuditCsv = async () => {
    try {
      const res = await fetch("/api/audit-logs?format=csv");
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Export failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "audit-export.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Audit log downloaded.");
    } catch {
      toast.error("Export failed");
    }
  };

  const markAllNotificationsRead = async () => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      fetchNotifications();
    } catch {
      /* ignore */
    }
  };

  const saveStaffProfile = async (e) => {
    e.preventDefault();
    if (!currentUser?._id) return;
    const tid = toast.loading("Saving profile…");
    try {
      const body = {
        timezone: profileForm.timezone,
      };
      if (profileForm.desiredHoursPerWeek !== "" && profileForm.desiredHoursPerWeek != null) {
        const n = parseInt(String(profileForm.desiredHoursPerWeek), 10);
        if (!Number.isNaN(n)) body.desiredHoursPerWeek = n;
      }
      if (profileForm.applyBusinessHours) {
        body.recurringAvailability = [1, 2, 3, 4, 5].map((d) => ({
          dayOfWeek: d,
          startMinute: 9 * 60,
          endMinute: 17 * 60,
        }));
      } else {
        body.recurringAvailability = [];
      }
      const res = await fetch(`/api/users/${currentUser._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Save failed", { id: tid });
        return;
      }
      toast.success("Availability preferences saved.", { id: tid });
      fetchData();
    } catch {
      toast.error("Save failed", { id: tid });
    }
  };

  const seedDB = async () => {
    if (!window.confirm("This will replace all data with demo data. Continue?")) return;
    try {
      setLoading(true);
      const res = await fetch("/api/seed", { method: "POST" });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || "Seed failed"); return; }
      toast.success("Demo data loaded! Log in as admin@shiftsync.com");
      await fetchData();
    } catch { toast.error("Seed failed"); } finally { setLoading(false); }
  };

  const handleSubmitShift = async (e) => {
    e.preventDefault();
    if (!form.location) return toast.error("Please select a location");
    if (!form.user) return toast.error("Please select an employee");
    if (!form.title) return toast.error("Shift title is required");
    if (!form.date) return toast.error("Date is required");
    if (!form.startTime || !form.endTime) return toast.error("Time range is required");
    if (!form.requiredSkill) return toast.error("Required skill is needed");

    const tid = toast.loading(editingShiftId ? "Updating shift..." : "Creating shift...");
    setConflictSuggestions([]);
    try {
      const loc = locations.find((l) => l._id === form.location);
      const tz = loc?.timezone || "UTC";
      let startDT = fromZonedTime(`${form.date}T${form.startTime}`, tz);
      let endDT = fromZonedTime(`${form.date}T${form.endTime}`, tz);
      if (endDT <= startDT) endDT = new Date(endDT.getTime() + 86400000);

      const payload = {
        ...form,
        user: form.user || null,
        location: form.location || null,
        date: startDT.toISOString(),
        startTime: startDT.toISOString(),
        endTime: endDT.toISOString(),
        requiredHeadcount: form.requiredHeadcount,
      };
      if (editingShiftId && editingSchemaVersion != null) {
        payload.expectedSchemaVersion = editingSchemaVersion;
      }
      if (currentUser?.role === "Admin" && bypassScheduleCutoff) {
        payload.bypassScheduleCutoff = true;
      }
      const trimmedOverride = laborOverrideReason.trim();
      if (trimmedOverride) {
        payload.laborComplianceOverride = { reason: trimmedOverride };
      }
      const res = await fetch(editingShiftId ? `/api/shifts/${editingShiftId}` : "/api/shifts", {
        method: editingShiftId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.status === 400 && Array.isArray(data.suggestions)) {
        setConflictSuggestions(data.suggestions);
        toast.error(data.error || "Conflict — see suggested assignees below.", { id: tid });
        return;
      }
      if (res.status === 409) {
        toast.error(data.error || "Someone else edited this shift. Refreshed list.", { id: tid });
        fetchData();
        return;
      }
      if (res.status === 403) {
        toast.error(data.error || "Not allowed", { id: tid });
        return;
      }
      if (res.status === 422) {
        toast.error(data.error || "Labor compliance blocked this assignment.", { id: tid });
        setLaborPreview({
          warnings: data.laborWarnings || [],
          blocks: data.laborBlocks || [],
          mergedDailyHours: {},
          weeklyHours: [],
          maxConsecutiveDays: 0,
        });
        return;
      }
      if (!res.ok) { toast.error(data.error || "Failed", { id: tid }); return; }
      if (Array.isArray(data.laborWarnings) && data.laborWarnings.length > 0) {
        toast.success(editingShiftId ? "Shift updated (see labor warnings)." : "Shift created (see labor warnings).", { id: tid });
        data.laborWarnings.forEach((w) => toast(w.message, { icon: "⚠️", duration: 6000 }));
      } else {
        toast.success(editingShiftId ? "Shift updated!" : "Shift created!", { id: tid });
      }
      setLaborOverrideReason("");
      setEditingShiftId(null);
      setEditingSchemaVersion(null);
      setBypassScheduleCutoff(false);
      setConflictSuggestions([]);
      setForm({
        title: "", date: "", location: "", user: "",
        startTime: "", endTime: "", requiredSkill: "Service", status: "Published", requiredHeadcount: 1,
      });
      fetchData();
    } catch { toast.error("Network error", { id: tid }); }
  };

  const startEditing = (shift) => {
    const tz = shift.location?.timezone || "UTC";
    const zs = toZonedTime(new Date(shift.startTime), tz);
    const ze = toZonedTime(new Date(shift.endTime), tz);
    setLaborOverrideReason("");
    setEditingShiftId(shift._id);
    setEditingSchemaVersion(shift.schemaVersion ?? 0);
    setBypassScheduleCutoff(false);
    setConflictSuggestions([]);
    const primaryUser = shift.user?._id || shift.assignedUsers?.[0]?._id || shift.assignedUsers?.[0] || "";
    setForm({
      title: shift.title || "", date: formatTz(zs, "yyyy-MM-dd", { timeZone: tz }),
      location: shift.location?._id || "", user: primaryUser ? String(primaryUser) : "",
      startTime: formatTz(zs, "HH:mm", { timeZone: tz }), endTime: formatTz(ze, "HH:mm", { timeZone: tz }),
      requiredSkill: shift.requiredSkill, status: shift.status,
      requiredHeadcount: shift.requiredHeadcount ?? 1,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteShift = async (id) => {
    try {
      const res = await fetch(`/api/shifts/${id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || "Delete failed"); return; }
      toast.success("Shift deleted");
      fetchData();
    } catch { toast.error("Delete failed"); }
    setConfirmDeleteId(null);
  };

  const otRiskShiftIds = useMemo(() => {
    if (!laborSummary?.employees) return new Set();
    const s = new Set();
    laborSummary.employees.forEach((e) => {
      (e.shiftsPushingOvertime || []).forEach((id) => s.add(id));
    });
    return s;
  }, [laborSummary]);

  if (authChecking || !isAuthenticated) return null;

  const chartData = Object.values(
    shifts.reduce((acc, s) => {
      const day = new Date(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      if (!acc[day]) acc[day] = { name: day, hours: 0, count: 0 };
      acc[day].hours += parseFloat(((new Date(s.endTime) - new Date(s.startTime)) / 3600000).toFixed(1));
      acc[day].count += 1;
      return acc;
    }, {}),
  );

  const isDark = theme === "dark";
  const cardCls = `rounded-2xl shadow-lg border transition-all duration-300 ${isDark ? "bg-gray-900/80 border-gray-800 shadow-gray-950/30" : "bg-white border-gray-100 shadow-gray-200/60"}`;
  const inputCls = `w-full rounded-xl px-4 py-3 text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 ${isDark ? "bg-gray-800 border border-gray-700 text-white placeholder:text-gray-500" : "bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 hover:border-gray-300"}`;

  return (
    <div className={`min-h-screen pb-10 transition-colors duration-500 font-sans ${isDark ? "bg-[#0f0f0f] text-gray-100" : "bg-[#f5f7fa] text-gray-800"}`}>
      <Toaster position="top-right" toastOptions={{ style: { borderRadius: "12px" } }} />

      <AnimatePresence>
        {confirmDeleteId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setConfirmDeleteId(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className={`rounded-2xl shadow-2xl p-8 max-w-sm w-full ${isDark ? "bg-gray-900 border border-gray-800" : "bg-white"}`}>
              <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Trash className="text-red-500" size={24} />
              </div>
              <h3 className={`text-lg font-bold text-center mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>Delete this shift?</h3>
              <p className={`text-center text-sm mb-6 ${isDark ? "text-gray-400" : "text-gray-500"}`}>This action cannot be undone.</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmDeleteId(null)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${isDark ? "bg-gray-800 text-gray-300 hover:bg-gray-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Cancel</button>
                <button onClick={() => handleDeleteShift(confirmDeleteId)}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors">Delete</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className={`sticky top-0 z-30 backdrop-blur-xl border-b ${isDark ? "bg-[#0f0f0f]/80 border-gray-800" : "bg-[#f5f7fa]/80 border-gray-200"}`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/30">
              <Calendar size={18} className="text-white" />
            </div>
            <div>
              <h1 className={`text-xl font-bold tracking-tight ${isDark ? "text-white" : "text-gray-900"}`}>ShiftSync</h1>
              {currentUser && <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>{currentUser.name} · {currentUser.role}</p>}
            </div>
          </div>
          <div className="flex gap-2 items-center flex-wrap justify-end relative">
            <div className="relative">
              <button type="button" onClick={() => setShowNotify((v) => !v)}
                className={`p-2.5 rounded-xl transition-all relative ${isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-200" : "bg-white hover:bg-gray-50 text-gray-600 shadow-sm border border-gray-200"}`}>
                <Bell size={18} />
                {notifications.unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 text-[10px] font-bold flex items-center justify-center rounded-full bg-red-500 text-white">
                    {notifications.unreadCount > 9 ? "9+" : notifications.unreadCount}
                  </span>
                )}
              </button>
              {showNotify && (
                <div className={`absolute right-0 top-full mt-2 w-80 max-h-80 overflow-y-auto rounded-xl shadow-xl border z-50 p-3 ${isDark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"}`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className={`text-xs font-bold uppercase ${isDark ? "text-gray-400" : "text-gray-500"}`}>Notifications</span>
                    <button type="button" onClick={markAllNotificationsRead} className="text-xs text-blue-500 hover:underline">Mark all read</button>
                  </div>
                  {(notifications.items || []).length === 0 ? (
                    <p className={`text-sm py-4 text-center ${isDark ? "text-gray-500" : "text-gray-400"}`}>No notifications</p>
                  ) : (
                    <ul className="space-y-2">
                      {notifications.items.map((n) => (
                        <li key={n._id} className={`text-xs rounded-lg p-2 ${n.read ? (isDark ? "opacity-60" : "opacity-70") : ""} ${isDark ? "bg-gray-800/80" : "bg-gray-50"}`}>
                          <p className={`font-semibold ${isDark ? "text-gray-100" : "text-gray-900"}`}>{n.title}</p>
                          <p className={isDark ? "text-gray-400" : "text-gray-600"}>{n.body}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <button type="button" onClick={() => router.push("/swaps")}
              className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 ${isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-200" : "bg-white hover:bg-gray-50 text-gray-700 shadow-sm border border-gray-200"}`}>
              <ArrowRightLeft size={16} /> Swaps
            </button>
            {canManage && (
              <>
                <button type="button" onClick={publishWeek}
                  className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 ${isDark ? "bg-emerald-900/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800" : "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200"}`}>
                  <RefreshCw size={16} /> Publish week
                </button>
                {currentUser?.role === "Admin" && (
                  <button type="button" onClick={downloadAuditCsv}
                    className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 ${isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-200" : "bg-white hover:bg-gray-50 text-gray-600 shadow-sm border border-gray-200"}`}>
                    <Download size={16} /> Audit CSV
                  </button>
                )}
              </>
            )}
            <button onClick={toggleTheme}
              className={`p-2.5 rounded-xl transition-all ${isDark ? "bg-gray-800 hover:bg-gray-700 text-yellow-400" : "bg-white hover:bg-gray-50 text-gray-600 shadow-sm border border-gray-200"}`}>
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button onClick={seedDB}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "bg-white hover:bg-gray-50 text-gray-600 shadow-sm border border-gray-200"}`}>
              Seed Data
            </button>
            <button onClick={() => router.push("/manage")}
              className="px-4 py-2.5 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-600/20 transition-all flex items-center gap-2">
              <Users size={16} /> Manage
            </button>
            <button onClick={logout}
              className={`p-2.5 rounded-xl transition-all ${isDark ? "bg-red-900/30 hover:bg-red-900/50 text-red-400" : "bg-red-50 hover:bg-red-100 text-red-500 border border-red-100"}`}>
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 pt-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          {[
            { title: "Total Shifts", value: stats.totalShifts, icon: <Calendar size={22} />, color: "blue" },
            { title: "Scheduled Hours", value: `${stats.totalHours}h`, icon: <Clock size={22} />, color: "indigo" },
            { title: "Top Performer", value: stats.topEmployee, icon: <Activity size={22} />, color: "emerald" },
          ].map((s, i) => (
            <motion.div key={s.title}
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
              className={`${cardCls} p-5 flex items-center gap-4`}>
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isDark ? `bg-${s.color}-500/10 text-${s.color}-400` : `bg-${s.color}-50 text-${s.color}-600`}`}>
                {s.icon}
              </div>
              <div>
                <p className={`text-xs font-medium uppercase tracking-wider ${isDark ? "text-gray-500" : "text-gray-400"}`}>{s.title}</p>
                <h2 className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{s.value}</h2>
              </div>
            </motion.div>
          ))}
        </div>

        {!canManage && currentUser && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`${cardCls} p-6 mb-8`}>
            <h3 className={`text-lg font-bold mb-1 ${isDark ? "text-white" : "text-gray-900"}`}>My availability</h3>
            <p className={`text-xs mb-4 ${isDark ? "text-gray-500" : "text-gray-500"}`}>
              Updates notify your managers. Empty recurring slots mean you are generally available.
            </p>
            <form onSubmit={saveStaffProfile} className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
              <div>
                <label className={`text-xs font-semibold uppercase mb-1 block ${isDark ? "text-gray-400" : "text-gray-500"}`}>Timezone</label>
                <select className={inputCls} value={profileForm.timezone}
                  onChange={(e) => setProfileForm((f) => ({ ...f, timezone: e.target.value }))}>
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
              <div>
                <label className={`text-xs font-semibold uppercase mb-1 block ${isDark ? "text-gray-400" : "text-gray-500"}`}>Desired hours / week</label>
                <input type="number" min={0} max={80} className={inputCls} placeholder="Optional"
                  value={profileForm.desiredHoursPerWeek}
                  onChange={(e) => setProfileForm((f) => ({ ...f, desiredHoursPerWeek: e.target.value }))} />
              </div>
              <label className="flex items-center gap-2 cursor-pointer md:col-span-2">
                <input type="checkbox" className="rounded accent-blue-600"
                  checked={profileForm.applyBusinessHours}
                  onChange={(e) => setProfileForm((f) => ({ ...f, applyBusinessHours: e.target.checked }))} />
                <span className={`text-sm ${isDark ? "text-gray-300" : "text-gray-600"}`}>Mon–Fri 9:00–17:00 in my timezone</span>
              </label>
              <button type="submit" className="md:col-span-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold w-fit px-6">
                Save preferences
              </button>
            </form>
          </motion.div>
        )}

        {onDuty.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`${cardCls} p-6 mb-8`}>
            <h3 className={`text-lg font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>On duty now</h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              {onDuty.map((sh) => {
                const tz = sh.location?.timezone || "UTC";
                const names = assigneeNames(sh);
                return (
                  <li key={sh._id} className={`rounded-lg px-3 py-2 ${isDark ? "bg-gray-800/80" : "bg-gray-50"}`}>
                    <span className={`font-medium ${isDark ? "text-gray-100" : "text-gray-900"}`}>{names.join(", ") || "Staff"}</span>
                    <span className={`block text-xs ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                      {sh.location?.name} · {sh.title} · {formatTz(toZonedTime(new Date(sh.startTime), tz), "HH:mm", { timeZone: tz })}–{formatTz(toZonedTime(new Date(sh.endTime), tz), "HH:mm", { timeZone: tz })}
                    </span>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}

        {canManage && fairness?.staff?.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`${cardCls} p-6 mb-8`}>
            <h3 className={`text-lg font-bold mb-1 ${isDark ? "text-white" : "text-gray-900"}`}>Fairness (last 30 days)</h3>
            <p className={`text-xs mb-4 ${isDark ? "text-gray-500" : "text-gray-500"}`}>
              Score {fairness.fairnessScore}/100 · {fairness.premiumDefinition}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className={`text-xs uppercase ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                    <th className="pb-2">Staff</th>
                    <th className="pb-2">Hours</th>
                    <th className="pb-2">Premium h</th>
                    <th className="pb-2">vs desired</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDark ? "divide-gray-800" : "divide-gray-100"}`}>
                  {fairness.staff.map((row) => (
                    <tr key={row.userId}>
                      <td className={`py-2 ${isDark ? "text-gray-200" : "text-gray-800"}`}>{row.name}</td>
                      <td className={isDark ? "text-gray-400" : "text-gray-600"}>{row.totalHours}</td>
                      <td className={isDark ? "text-gray-400" : "text-gray-600"}>{row.premiumHours}</td>
                      <td className={isDark ? "text-gray-400" : "text-gray-600"}>
                        {row.hoursVsDesiredDelta != null ? `${row.hoursVsDesiredDelta >= 0 ? "+" : ""}${row.hoursVsDesiredDelta}h` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {canManage && laborSummary && laborSummary.employees?.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`${cardCls} p-6 mb-8`}>
            <h3 className={`text-lg font-bold mb-1 ${isDark ? "text-white" : "text-gray-900"}`}>Labor & projected overtime</h3>
            <p className={`text-xs mb-4 ${isDark ? "text-gray-500" : "text-gray-500"}`}>
              ISO week starting {laborSummary.weekStart?.slice(0, 10)} (UTC) · base ${laborSummary.baseRatePerHour}/h · OT × {laborSummary.overtimeMultiplier}
              {laborSummary.note ? ` — ${laborSummary.note}` : ""}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {laborSummary.employees.map((emp) => (
                <div key={emp.userId} className={`rounded-xl p-4 ${isDark ? "bg-gray-800/60 border border-gray-700" : "bg-gray-50 border border-gray-100"}`}>
                  <div className="flex justify-between items-start gap-2">
                    <span className={`font-semibold text-sm ${isDark ? "text-gray-100" : "text-gray-900"}`}>{emp.name}</span>
                    <span className={`text-sm tabular-nums ${isDark ? "text-gray-400" : "text-gray-600"}`}>{emp.totalHoursInWeek}h</span>
                  </div>
                  {emp.overtimeHours > 0 && (
                    <p className={`text-xs mt-1 ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                      ~{emp.overtimeHours}h over regular cap · est. ${emp.estimatedWeekCost} this week
                    </p>
                  )}
                  {emp.laborWarnings?.slice(0, 3).map((w) => (
                    <p key={`${emp.userId}-${w.code}`} className={`text-[11px] mt-1 leading-snug ${isDark ? "text-gray-500" : "text-gray-500"}`}>{w.message}</p>
                  ))}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}
            className={`lg:col-span-4 ${cardCls} p-6`}>
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDark ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-600"}`}>
                <Plus size={18} />
              </div>
              <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                {editingShiftId ? "Edit Shift" : "New Shift"}
              </h3>
            </div>
            <form onSubmit={handleSubmitShift} className="space-y-4" noValidate>
              <div>
                <label className={`text-xs font-semibold uppercase tracking-wider mb-1.5 block ${isDark ? "text-gray-400" : "text-gray-500"}`}>Location</label>
                <select className={inputCls} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}>
                  <option value="">Select location...</option>
                  {locations.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className={`text-xs font-semibold uppercase tracking-wider mb-1.5 block ${isDark ? "text-gray-400" : "text-gray-500"}`}>Employee</label>
                <select className={inputCls} value={form.user} onChange={(e) => {
                  const u = users.find((x) => x._id === e.target.value);
                  setForm({ ...form, user: e.target.value, requiredSkill: u?.skills?.[0] || "" });
                }}>
                  <option value="">Select employee...</option>
                  {users.map((u) => <option key={u._id} value={u._id}>{u.name} ({u.skills?.join(", ")})</option>)}
                </select>
              </div>
              <div>
                <label className={`text-xs font-semibold uppercase tracking-wider mb-1.5 block ${isDark ? "text-gray-400" : "text-gray-500"}`}>Required headcount</label>
                <input type="number" min={1} max={20} className={inputCls}
                  value={form.requiredHeadcount}
                  onChange={(e) => setForm({ ...form, requiredHeadcount: Math.min(20, Math.max(1, parseInt(e.target.value, 10) || 1)) })} />
                <p className={`text-[11px] mt-1 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  Primary assignee above; API supports multiple assignees on the same shift.
                </p>
              </div>
              <div>
                <label className={`text-xs font-semibold uppercase tracking-wider mb-1.5 block ${isDark ? "text-gray-400" : "text-gray-500"}`}>Shift Title</label>
                <input type="text" className={inputCls} placeholder="e.g. Morning Opening" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <label className={`text-xs font-semibold uppercase tracking-wider mb-1.5 block ${isDark ? "text-gray-400" : "text-gray-500"}`}>Date</label>
                <input type="date" className={`${inputCls} ${isDark ? "scheme-dark" : ""}`} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`text-xs font-semibold uppercase tracking-wider mb-1.5 block ${isDark ? "text-gray-400" : "text-gray-500"}`}>Start</label>
                  <input type="time" className={`${inputCls} ${isDark ? "scheme-dark" : ""}`} value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
                </div>
                <div>
                  <label className={`text-xs font-semibold uppercase tracking-wider mb-1.5 block ${isDark ? "text-gray-400" : "text-gray-500"}`}>End</label>
                  <input type="time" className={`${inputCls} ${isDark ? "scheme-dark" : ""}`} value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
                </div>
              </div>
              <div>
                <label className={`text-xs font-semibold uppercase tracking-wider mb-1.5 block ${isDark ? "text-gray-400" : "text-gray-500"}`}>Required Skill</label>
                {form.user ? (
                  <select className={inputCls} value={form.requiredSkill} onChange={(e) => setForm({ ...form, requiredSkill: e.target.value })}>
                    {(users.find((u) => u._id === form.user)?.skills || []).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <input type="text" className={inputCls} placeholder="e.g. Service" value={form.requiredSkill} onChange={(e) => setForm({ ...form, requiredSkill: e.target.value })} />
                )}
              </div>
              {canManage && laborPreview && (laborPreview.warnings?.length > 0 || laborPreview.blocks?.length > 0) && (
                <div className={`rounded-xl p-4 space-y-2 text-sm ${laborPreview.blocks?.length > 0
                  ? isDark ? "bg-red-950/40 border border-red-800/60 text-red-200" : "bg-red-50 border border-red-200 text-red-900"
                  : isDark ? "bg-amber-950/30 border border-amber-800/50 text-amber-100" : "bg-amber-50 border border-amber-200 text-amber-900"}`}>
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle size={16} className="shrink-0" />
                    What-if labor check (before save)
                  </div>
                  {laborPreview.blocks?.map((b) => (
                    <p key={b.code + (b.day || "")} className="text-xs leading-relaxed opacity-95">{b.message}</p>
                  ))}
                  {laborPreview.warnings?.map((w) => (
                    <p key={w.code + (w.day || w.weekStart || "")} className="text-xs leading-relaxed opacity-90">{w.message}</p>
                  ))}
                  {laborPreview.blocks?.length > 0 && (
                    <div className="pt-2 space-y-1.5">
                      <label className={`text-xs font-semibold uppercase tracking-wider ${isDark ? "text-red-300" : "text-red-800"}`}>Manager override reason (required to save)</label>
                      <textarea
                        className={`w-full rounded-lg px-3 py-2 text-sm min-h-[72px] ${isDark ? "bg-gray-900 border border-red-900/50 text-white placeholder:text-gray-500" : "bg-white border border-red-200 text-gray-900"}`}
                        placeholder="Document why this assignment is allowed (min. 8 characters)…"
                        value={laborOverrideReason}
                        onChange={(e) => setLaborOverrideReason(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}
              {conflictSuggestions.length > 0 && (
                <div className={`rounded-xl p-4 space-y-2 ${isDark ? "bg-indigo-950/40 border border-indigo-800/50" : "bg-indigo-50 border border-indigo-100"}`}>
                  <p className={`text-xs font-semibold ${isDark ? "text-indigo-200" : "text-indigo-900"}`}>Suggested assignees (no conflict)</p>
                  <div className="flex flex-wrap gap-2">
                    {conflictSuggestions.map((s) => (
                      <button key={s.id} type="button"
                        onClick={() => { setForm((f) => ({ ...f, user: s.id })); setConflictSuggestions([]); toast.success(`Selected ${s.name}`); }}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${isDark ? "bg-indigo-900/60 text-indigo-100 hover:bg-indigo-800" : "bg-white text-indigo-700 hover:bg-indigo-100 border border-indigo-200"}`}>
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {currentUser?.role === "Admin" && editingShiftId && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded accent-blue-600" checked={bypassScheduleCutoff}
                    onChange={(e) => setBypassScheduleCutoff(e.target.checked)} />
                  <span className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>Bypass schedule edit cutoff (48h)</span>
                </label>
              )}
              <button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm shadow-blue-600/20 transition-all active:scale-[0.98]">
                {editingShiftId ? "Update Shift" : "Create Shift"}
              </button>
              {editingShiftId && (
                <button type="button" onClick={() => {
                  setEditingShiftId(null);
                  setLaborOverrideReason("");
                  setEditingSchemaVersion(null);
                  setBypassScheduleCutoff(false);
                  setConflictSuggestions([]);
                  setForm({
                    title: "", date: "", location: "", user: "",
                    startTime: "", endTime: "", requiredSkill: "Service", status: "Published", requiredHeadcount: 1,
                  });
                }}
                  className={`w-full py-3 text-sm font-semibold rounded-xl transition-all active:scale-[0.98] ${isDark ? "bg-gray-800 text-gray-300 hover:bg-gray-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Cancel</button>
              )}
            </form>
          </motion.div>

          <div className="lg:col-span-8 flex flex-col gap-6">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className={`${cardCls} p-6`}>
              <h3 className={`text-lg font-bold mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>Hours by Day</h3>
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData.length > 0 ? chartData : [{ name: "No Data", hours: 0 }]} barCategoryGap="20%">
                    <XAxis dataKey="name" stroke={isDark ? "#6b7280" : "#9ca3af"} fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke={isDark ? "#6b7280" : "#9ca3af"} fontSize={12} tickLine={false} axisLine={false} unit="h" width={40} />
                    <Tooltip
                      cursor={{ fill: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", radius: 8 }}
                      contentStyle={{ background: isDark ? "#1f2937" : "#fff", border: isDark ? "1px solid #374151" : "1px solid #e5e7eb", borderRadius: "12px", boxShadow: "0 4px 20px rgba(0,0,0,0.1)", color: isDark ? "#fff" : "#111" }}
                    />
                    <Bar dataKey="hours" fill={isDark ? "#3b82f6" : "#2563eb"} radius={[8, 8, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className={`${cardCls} p-6`}>
              <h3 className={`text-lg font-bold mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>Scheduled Shifts</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className={`text-xs font-semibold uppercase tracking-wider ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                      <th className="pb-3 pl-1">Employee</th>
                      <th className="pb-3">Location</th>
                      <th className="pb-3">Schedule</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3 text-right pr-1">Actions</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? "divide-gray-800" : "divide-gray-100"}`}>
                    <AnimatePresence>
                      {shifts.map((shift) => {
                        const tz = shift.location?.timezone || "UTC";
                        const zs = toZonedTime(new Date(shift.startTime), tz);
                        const ze = toZonedTime(new Date(shift.endTime), tz);
                        const names = assigneeNames(shift);
                        const label = names.length ? names.join(", ") : "Unassigned";
                        const initial = (names[0] || "?").charAt(0);
                        const hc = shift.requiredHeadcount > 1 ? shift.requiredHeadcount : null;
                        return (
                          <motion.tr key={shift._id}
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className={`group transition-colors ${otRiskShiftIds.has(String(shift._id)) ? (isDark ? "bg-amber-950/25 border-l-4 border-amber-500" : "bg-amber-50/80 border-l-4 border-amber-500") : ""} ${isDark ? "hover:bg-gray-800/50" : "hover:bg-gray-50/80"}`}>
                            <td className="py-3.5 pl-1">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                                  {initial}
                                </div>
                                <div>
                                  <p className={`text-sm font-medium ${isDark ? "text-gray-200" : "text-gray-900"}`}>
                                    {label}
                                    {hc != null && (
                                      <span className={`ml-1.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${isDark ? "bg-blue-900/50 text-blue-300" : "bg-blue-100 text-blue-700"}`}>
                                        headcount {hc}
                                      </span>
                                    )}
                                  </p>
                                  <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>{shift.requiredSkill}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5">
                              <p className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>{shift.location?.name || "N/A"}</p>
                              <p className={`text-xs ${isDark ? "text-gray-600" : "text-gray-400"}`}>{shift.title}</p>
                            </td>
                            <td className="py-3.5">
                              <p className={`text-sm font-medium ${isDark ? "text-gray-200" : "text-gray-900"}`}>
                                {formatTz(zs, "MMM d", { timeZone: tz })}
                              </p>
                              <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                                {formatTz(zs, "HH:mm", { timeZone: tz })} – {formatTz(ze, "HH:mm", { timeZone: tz })}
                                <span className="ml-1 opacity-60">({tz.split("/").pop().replace("_", " ")})</span>
                              </p>
                            </td>
                            <td className="py-3.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold ${
                                  shift.status === "Published"
                                    ? isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-700"
                                    : isDark ? "bg-yellow-500/10 text-yellow-400" : "bg-yellow-50 text-yellow-700"
                                }`}>{shift.status}</span>
                                {shift.laborOverrideReason && (
                                  <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${isDark ? "bg-purple-900/40 text-purple-300" : "bg-purple-100 text-purple-800"}`}>Labor override</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3.5 text-right pr-1">
                              <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => startEditing(shift)}
                                  className={`p-2 rounded-lg transition-colors ${isDark ? "text-blue-400 hover:bg-blue-500/10" : "text-blue-500 hover:bg-blue-50"}`}>
                                  <Edit2 size={15} />
                                </button>
                                <button onClick={() => setConfirmDeleteId(shift._id)}
                                  className={`p-2 rounded-lg transition-colors ${isDark ? "text-red-400 hover:bg-red-500/10" : "text-red-500 hover:bg-red-50"}`}>
                                  <Trash size={15} />
                                </button>
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                    {shifts.length === 0 && (
                      <tr>
                        <td colSpan="5" className={`py-12 text-center ${isDark ? "text-gray-600" : "text-gray-400"}`}>
                          <Calendar size={40} className="mx-auto mb-3 opacity-30" />
                          <p className="font-medium">No shifts scheduled</p>
                          <p className="text-sm mt-1">Create one using the form or seed demo data</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}
