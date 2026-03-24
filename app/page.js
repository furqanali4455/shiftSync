"use client";
import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash, Edit2, Clock, Users, Calendar, Activity, Moon, Sun, LogOut, ChevronDown } from "lucide-react";
import { Toaster, toast } from "react-hot-toast";
import { fromZonedTime, toZonedTime, format as formatTz } from "date-fns-tz";

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

  const [form, setForm] = useState({
    title: "", date: "", location: "", user: "",
    startTime: "", endTime: "", requiredSkill: "Service", status: "Published",
  });

  const computeStats = useCallback((shiftsData) => {
    let tHours = 0;
    const hoursMap = {};
    shiftsData.forEach((s) => {
      const hrs = (new Date(s.endTime) - new Date(s.startTime)) / 3600000;
      tHours += hrs;
      if (s.user) hoursMap[s.user.name] = (hoursMap[s.user.name] || 0) + hrs;
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
    try {
      const loc = locations.find((l) => l._id === form.location);
      const tz = loc?.timezone || "UTC";
      let startDT = fromZonedTime(`${form.date}T${form.startTime}`, tz);
      let endDT = fromZonedTime(`${form.date}T${form.endTime}`, tz);
      if (endDT <= startDT) endDT = new Date(endDT.getTime() + 86400000);

      const res = await fetch(editingShiftId ? `/api/shifts/${editingShiftId}` : "/api/shifts", {
        method: editingShiftId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, user: form.user || null, location: form.location || null, date: startDT.toISOString(), startTime: startDT.toISOString(), endTime: endDT.toISOString() }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Failed", { id: tid }); return; }
      toast.success(editingShiftId ? "Shift updated!" : "Shift created!", { id: tid });
      setEditingShiftId(null);
      setForm({ title: "", date: "", location: "", user: "", startTime: "", endTime: "", requiredSkill: "Service", status: "Published" });
      fetchData();
    } catch { toast.error("Network error", { id: tid }); }
  };

  const startEditing = (shift) => {
    const tz = shift.location?.timezone || "UTC";
    const zs = toZonedTime(new Date(shift.startTime), tz);
    const ze = toZonedTime(new Date(shift.endTime), tz);
    setEditingShiftId(shift._id);
    setForm({
      title: shift.title || "", date: formatTz(zs, "yyyy-MM-dd", { timeZone: tz }),
      location: shift.location?._id || "", user: shift.user?._id || "",
      startTime: formatTz(zs, "HH:mm", { timeZone: tz }), endTime: formatTz(ze, "HH:mm", { timeZone: tz }),
      requiredSkill: shift.requiredSkill, status: shift.status,
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
          <div className="flex gap-2 items-center">
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
              <button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm shadow-blue-600/20 transition-all active:scale-[0.98]">
                {editingShiftId ? "Update Shift" : "Create Shift"}
              </button>
              {editingShiftId && (
                <button type="button" onClick={() => { setEditingShiftId(null); setForm({ title: "", date: "", location: "", user: "", startTime: "", endTime: "", requiredSkill: "Service", status: "Published" }); }}
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
                        return (
                          <motion.tr key={shift._id}
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className={`group transition-colors ${isDark ? "hover:bg-gray-800/50" : "hover:bg-gray-50/80"}`}>
                            <td className="py-3.5 pl-1">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                                  {shift.user ? shift.user.name.charAt(0) : "?"}
                                </div>
                                <div>
                                  <p className={`text-sm font-medium ${isDark ? "text-gray-200" : "text-gray-900"}`}>{shift.user ? shift.user.name : "Unassigned"}</p>
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
                              <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold ${
                                shift.status === "Published"
                                  ? isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-700"
                                  : isDark ? "bg-yellow-500/10 text-yellow-400" : "bg-yellow-50 text-yellow-700"
                              }`}>{shift.status}</span>
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
