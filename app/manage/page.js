"use client";
import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, MapPin, Plus, Trash2, Edit2, X, Check,
  ArrowLeft, Shield, Globe, UserPlus, Building2, Moon, Sun, LogOut,
} from "lucide-react";
import { Toaster, toast } from "react-hot-toast";

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "Europe/London", "Europe/Paris",
  "Asia/Karachi", "Asia/Dubai", "Asia/Kolkata", "Asia/Tokyo",
  "Australia/Sydney", "Pacific/Auckland",
];

const ROLES = ["Staff", "Manager", "Admin"];
const COMMON_SKILLS = ["Service", "Management", "Bartending", "Cooking", "Cashier", "Security", "Cleaning", "Reception"];

function SkillBadge({ skill, onRemove, isDark }) {
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${isDark ? "bg-blue-900/40 text-blue-300 border border-blue-700" : "bg-blue-100 text-blue-700 border border-blue-200"}`}>
      {skill}
      {onRemove && (
        <button type="button" onClick={() => onRemove(skill)} className="hover:text-red-500 transition-colors">
          <X size={12} />
        </button>
      )}
    </span>
  );
}

function Card({ children, className = "", isDark }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl shadow-xl p-6 border-t-4 ${isDark ? "bg-linear-to-b from-gray-800 to-gray-900 border border-gray-700 border-t-blue-500" : "bg-linear-to-b from-[#e6eaef] to-[#ffffff] border border-gray-200 border-t-blue-600"} ${className}`}
    >
      {children}
    </motion.div>
  );
}

function SectionHeader({ icon, title, count, isDark }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
          {icon}
        </div>
        <div>
          <h2 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-800"}`}>{title}</h2>
          <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>{count} record{count !== 1 ? "s" : ""}</p>
        </div>
      </div>
    </div>
  );
}

export default function ManagePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("employees");
  const [users, setUsers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState("light");

  const [empForm, setEmpForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    role: "Staff",
    skills: [],
    locations: [],
    desiredHoursPerWeek: "",
    timezone: "America/New_York",
    applyBusinessHours: false,
  });
  const [skillInput, setSkillInput] = useState("");
  const [editingEmpId, setEditingEmpId] = useState(null);
  const [showEmpForm, setShowEmpForm] = useState(false);

  const [locForm, setLocForm] = useState({ name: "", address: "", timezone: "America/New_York" });
  const [editingLocId, setEditingLocId] = useState(null);
  const [showLocForm, setShowLocForm] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, lRes] = await Promise.all([fetch("/api/users"), fetch("/api/locations")]);
      if (uRes.status === 401 || lRes.status === 401) {
        localStorage.removeItem("shiftsync_user");
        router.push("/login");
        return;
      }
      setUsers(await uRes.json());
      setLocations(await lRes.json());
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const user = localStorage.getItem("shiftsync_user");
    if (!user) { router.push("/login"); return; }
    const storedTheme = localStorage.getItem("shiftsync_theme");
    if (storedTheme) setTheme(storedTheme);
    fetchAll();
  }, [router, fetchAll]);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("shiftsync_theme", newTheme);
  };

  const isDark = theme === "dark";

  const inputCls = `w-full rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm ${isDark ? "bg-gray-900/50 border border-gray-700 text-white placeholder:text-gray-500" : "bg-white/60 border border-gray-200 text-gray-900 placeholder:text-gray-400"}`;

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

  const resetEmpForm = () => {
    setEmpForm({
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      role: "Staff",
      skills: [],
      locations: [],
      desiredHoursPerWeek: "",
      timezone: "America/New_York",
      applyBusinessHours: false,
    });
    setSkillInput("");
    setEditingEmpId(null);
    setShowEmpForm(false);
  };

  const handleEditEmployee = (user) => {
    const nameParts = user.name.split(" ");
    setEmpForm({
      firstName: nameParts[0] || "",
      lastName: nameParts.slice(1).join(" ") || "",
      email: user.email,
      password: "",
      role: user.role,
      skills: user.skills || [],
      locations: (user.locations || []).map((l) => l._id || l),
      desiredHoursPerWeek: user.desiredHoursPerWeek ?? "",
      timezone: user.timezone || "America/New_York",
      applyBusinessHours: hasBusinessWeekSlots(user.recurringAvailability),
    });
    setEditingEmpId(user._id);
    setShowEmpForm(true);
  };

  const addSkill = (skill) => {
    const s = skill.trim();
    if (s && !empForm.skills.includes(s)) {
      setEmpForm((f) => ({ ...f, skills: [...f.skills, s] }));
    }
    setSkillInput("");
  };

  const removeSkill = (skill) => {
    setEmpForm((f) => ({ ...f, skills: f.skills.filter((s) => s !== skill) }));
  };

  const toggleLocation = (locId) => {
    setEmpForm((f) => ({
      ...f,
      locations: f.locations.includes(locId) ? f.locations.filter((l) => l !== locId) : [...f.locations, locId],
    }));
  };

  const handleSaveEmployee = async (e) => {
    e.preventDefault();
    if (!empForm.firstName) return toast.error("First name is required");
    if (!empForm.email) return toast.error("Email is required");
    if (!editingEmpId && !empForm.password) return toast.error("Password is required for new employees");
    if (empForm.password && empForm.password.length < 8) return toast.error("Password must be at least 8 characters");

    const tid = toast.loading(editingEmpId ? "Updating employee..." : "Adding employee...");
    try {
      const payload = {
        name: `${empForm.firstName} ${empForm.lastName}`.trim(),
        email: empForm.email,
        role: empForm.role,
        skills: empForm.skills,
        locations: empForm.locations,
        timezone: empForm.timezone,
      };
      if (empForm.desiredHoursPerWeek !== "" && empForm.desiredHoursPerWeek != null) {
        const n = parseInt(String(empForm.desiredHoursPerWeek), 10);
        if (!Number.isNaN(n)) payload.desiredHoursPerWeek = n;
      }
      if (empForm.applyBusinessHours) {
        payload.recurringAvailability = [1, 2, 3, 4, 5].map((d) => ({
          dayOfWeek: d,
          startMinute: 9 * 60,
          endMinute: 17 * 60,
        }));
      }
      if (empForm.password) {
        payload.password = empForm.password;
      }

      let res;
      if (editingEmpId) {
        res = await fetch(`/api/users/${editingEmpId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firstName: empForm.firstName, lastName: empForm.lastName, email: empForm.email, password: empForm.password }),
        });
        if (res.ok) {
          const newUser = await res.json();
          const follow = {
            role: empForm.role,
            skills: empForm.skills,
            locations: empForm.locations,
            timezone: empForm.timezone,
          };
          if (empForm.desiredHoursPerWeek !== "" && empForm.desiredHoursPerWeek != null) {
            const n = parseInt(String(empForm.desiredHoursPerWeek), 10);
            if (!Number.isNaN(n)) follow.desiredHoursPerWeek = n;
          }
          if (empForm.applyBusinessHours) {
            follow.recurringAvailability = [1, 2, 3, 4, 5].map((d) => ({
              dayOfWeek: d,
              startMinute: 9 * 60,
              endMinute: 17 * 60,
            }));
          }
          res = await fetch(`/api/users/${newUser._id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(follow),
          });
        }
      }

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to save", { id: tid });
      } else {
        toast.success(editingEmpId ? "Employee updated!" : "Employee added!", { id: tid });
        resetEmpForm();
        fetchAll();
      }
    } catch {
      toast.error("Network error", { id: tid });
    }
  };

  const handleDeleteEmployee = async (id) => {
    const tid = toast.loading("Deleting employee...");
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error, { id: tid });
      } else {
        toast.success("Employee removed", { id: tid });
        fetchAll();
      }
    } catch {
      toast.error("Failed to delete", { id: tid });
    }
    setConfirmDelete(null);
  };

  const resetLocForm = () => {
    setLocForm({ name: "", address: "", timezone: "America/New_York" });
    setEditingLocId(null);
    setShowLocForm(false);
  };

  const handleEditLocation = (loc) => {
    setLocForm({ name: loc.name, address: loc.address || "", timezone: loc.timezone || "America/New_York" });
    setEditingLocId(loc._id);
    setShowLocForm(true);
  };

  const handleSaveLocation = async (e) => {
    e.preventDefault();
    if (!locForm.name) return toast.error("Location name is required");
    if (!locForm.address) return toast.error("Address is required");

    const tid = toast.loading(editingLocId ? "Updating location..." : "Adding location...");
    try {
      const method = editingLocId ? "PUT" : "POST";
      const url = editingLocId ? `/api/locations/${editingLocId}` : "/api/locations";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(locForm),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to save", { id: tid });
      } else {
        toast.success(editingLocId ? "Location updated!" : "Location added!", { id: tid });
        resetLocForm();
        fetchAll();
      }
    } catch {
      toast.error("Network error", { id: tid });
    }
  };

  const handleDeleteLocation = async (id) => {
    const tid = toast.loading("Deleting location...");
    try {
      const res = await fetch(`/api/locations/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error, { id: tid });
      } else {
        toast.success("Location removed", { id: tid });
        fetchAll();
      }
    } catch {
      toast.error("Failed to delete", { id: tid });
    }
    setConfirmDelete(null);
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? "bg-[#121212]" : "bg-gray-50"}`}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className={`min-h-screen font-sans transition-colors duration-500 ${isDark ? "bg-[#121212] text-gray-100" : "bg-linear-to-br from-gray-50 via-blue-50/20 to-gray-100 text-gray-800"}`}>
      <Toaster position="top-right" toastOptions={{ style: { borderRadius: "12px", fontFamily: "inherit" } }} />

      <AnimatePresence>
        {confirmDelete && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
              className={`rounded-2xl shadow-2xl p-8 max-w-sm w-full border-t-4 border-t-red-500 ${isDark ? "bg-gray-900 border-gray-700" : "bg-white"}`}>
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="text-red-500" size={24} />
              </div>
              <h3 className={`text-xl font-bold text-center mb-2 ${isDark ? "text-white" : "text-gray-800"}`}>Confirm Delete</h3>
              <p className={`text-center mb-6 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                Are you sure you want to delete <strong className={isDark ? "text-white" : "text-gray-800"}>{confirmDelete.name}</strong>? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmDelete(null)}
                  className={`flex-1 py-3 rounded-xl border font-semibold transition-colors ${isDark ? "border-gray-700 text-gray-300 hover:bg-gray-800" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                  Cancel
                </button>
                <button onClick={() => confirmDelete.type === "employee" ? handleDeleteEmployee(confirmDelete.id) : handleDeleteLocation(confirmDelete.id)}
                  className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold transition-colors">
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <header className={`backdrop-blur-md border-b sticky top-0 z-30 shadow-sm ${isDark ? "bg-gray-900/80 border-gray-700" : "bg-white/80 border-gray-200"}`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/")}
              className={`flex items-center gap-2 transition-colors font-medium ${isDark ? "text-gray-400 hover:text-blue-400" : "text-gray-500 hover:text-blue-600"}`}>
              <ArrowLeft size={18} /> Back to Dashboard
            </button>
            <div className={`w-px h-6 ${isDark ? "bg-gray-700" : "bg-gray-200"}`} />
            <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-800"}`}>Team Management</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-full ${isDark ? "bg-gray-800 text-gray-400" : "bg-gray-100 text-gray-500"}`}>
              <Shield size={14} className="text-blue-600" /> Admin Controls
            </div>
            <button onClick={toggleTheme}
              className={`p-2.5 rounded-full border shadow-sm transition-all ${isDark ? "bg-gray-800/60 border-gray-700 hover:bg-gray-700 text-yellow-400" : "bg-white/60 border-gray-200 hover:bg-white text-gray-800"}`}>
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className={`flex gap-2 mb-8 p-1.5 rounded-2xl shadow-md border w-fit ${isDark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-100"}`}>
          {[
            { id: "employees", label: "Employees", icon: <Users size={16} />, count: users.length },
            { id: "locations", label: "Locations", icon: <MapPin size={16} />, count: locations.length },
          ].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 ${activeTab === tab.id
                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
                : isDark ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-800"
              }`}>
              {tab.icon} {tab.label}
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${activeTab === tab.id ? "bg-white/20" : isDark ? "bg-gray-800" : "bg-gray-100"}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "employees" && (
            <motion.div key="employees" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-4">
                <Card isDark={isDark}>
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
                        <UserPlus size={18} className="text-white" />
                      </div>
                      <h2 className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-800"}`}>
                        {editingEmpId ? "Edit Employee" : "Add Employee"}
                      </h2>
                    </div>
                    {editingEmpId && (
                      <button onClick={resetEmpForm} className={isDark ? "text-gray-500 hover:text-gray-300" : "text-gray-400 hover:text-gray-600"}>
                        <X size={18} />
                      </button>
                    )}
                  </div>

                  <form onSubmit={handleSaveEmployee} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={`text-xs font-semibold uppercase tracking-wide mb-1.5 block ${isDark ? "text-gray-400" : "text-gray-500"}`}>First Name</label>
                        <input className={inputCls} placeholder="John" value={empForm.firstName}
                          onChange={(e) => setEmpForm((f) => ({ ...f, firstName: e.target.value }))} />
                      </div>
                      <div>
                        <label className={`text-xs font-semibold uppercase tracking-wide mb-1.5 block ${isDark ? "text-gray-400" : "text-gray-500"}`}>Last Name</label>
                        <input className={inputCls} placeholder="Doe" value={empForm.lastName}
                          onChange={(e) => setEmpForm((f) => ({ ...f, lastName: e.target.value }))} />
                      </div>
                    </div>

                    <div>
                      <label className={`text-xs font-semibold uppercase tracking-wide mb-1.5 block ${isDark ? "text-gray-400" : "text-gray-500"}`}>Email</label>
                      <input type="email" className={inputCls} placeholder="john@example.com" value={empForm.email}
                        onChange={(e) => setEmpForm((f) => ({ ...f, email: e.target.value }))} />
                    </div>

                    <div>
                      <label className={`text-xs font-semibold uppercase tracking-wide mb-1.5 block ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                        Password {editingEmpId && <span className={`normal-case font-normal ${isDark ? "text-gray-500" : "text-gray-400"}`}>(leave blank to keep)</span>}
                      </label>
                      <input type="password" className={inputCls} placeholder={editingEmpId ? "••••••••" : "Min 8 characters"} value={empForm.password}
                        onChange={(e) => setEmpForm((f) => ({ ...f, password: e.target.value }))} />
                    </div>

                    <div>
                      <label className={`text-xs font-semibold uppercase tracking-wide mb-1.5 block ${isDark ? "text-gray-400" : "text-gray-500"}`}>Role</label>
                      <select className={inputCls} value={empForm.role}
                        onChange={(e) => setEmpForm((f) => ({ ...f, role: e.target.value }))}>
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className={`text-xs font-semibold uppercase tracking-wide mb-1.5 block ${isDark ? "text-gray-400" : "text-gray-500"}`}>Timezone</label>
                      <select className={inputCls} value={empForm.timezone}
                        onChange={(e) => setEmpForm((f) => ({ ...f, timezone: e.target.value }))}>
                        {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className={`text-xs font-semibold uppercase tracking-wide mb-1.5 block ${isDark ? "text-gray-400" : "text-gray-500"}`}>Desired hours / week</label>
                      <input type="number" min={0} max={80} className={inputCls} placeholder="e.g. 32"
                        value={empForm.desiredHoursPerWeek}
                        onChange={(e) => setEmpForm((f) => ({ ...f, desiredHoursPerWeek: e.target.value }))} />
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="rounded accent-blue-600"
                        checked={empForm.applyBusinessHours}
                        onChange={(e) => setEmpForm((f) => ({ ...f, applyBusinessHours: e.target.checked }))} />
                      <span className={`text-sm ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                        Mon–Fri 9:00–17:00 availability (in their timezone)
                      </span>
                    </label>

                    <div>
                      <label className={`text-xs font-semibold uppercase tracking-wide mb-1.5 block ${isDark ? "text-gray-400" : "text-gray-500"}`}>Skills</label>
                      <div className="flex gap-2 mb-2">
                        <input className={`flex-1 ${inputCls}`} placeholder="Add skill..." value={skillInput}
                          onChange={(e) => setSkillInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(skillInput); } }} />
                        <button type="button" onClick={() => addSkill(skillInput)}
                          className="px-3 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors">
                          <Plus size={16} />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {empForm.skills.map((s) => <SkillBadge key={s} skill={s} onRemove={removeSkill} isDark={isDark} />)}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {COMMON_SKILLS.filter((s) => !empForm.skills.includes(s)).map((s) => (
                          <button key={s} type="button" onClick={() => addSkill(s)}
                            className={`text-xs px-2 py-1 rounded-full transition-colors ${isDark ? "bg-gray-800 text-gray-400 hover:bg-blue-900/40 hover:text-blue-300" : "bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-blue-600"}`}>
                            + {s}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className={`text-xs font-semibold uppercase tracking-wide mb-1.5 block ${isDark ? "text-gray-400" : "text-gray-500"}`}>Assigned Locations</label>
                      <div className="space-y-1.5 max-h-32 overflow-y-auto">
                        {locations.length === 0 && (
                          <p className={`text-xs italic ${isDark ? "text-gray-500" : "text-gray-400"}`}>No locations yet — add some first</p>
                        )}
                        {locations.map((loc) => (
                          <label key={loc._id} className="flex items-center gap-2 cursor-pointer group">
                            <input type="checkbox" className="rounded accent-blue-600"
                              checked={empForm.locations.includes(loc._id)}
                              onChange={() => toggleLocation(loc._id)} />
                            <span className={`text-sm transition-colors group-hover:text-blue-600 ${isDark ? "text-gray-300" : "text-gray-600"}`}>{loc.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <button type="submit"
                      className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/20 transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2">
                      {editingEmpId ? <><Check size={16} /> Update Employee</> : <><UserPlus size={16} /> Add Employee</>}
                    </button>
                  </form>
                </Card>
              </div>

              <div className="lg:col-span-8">
                <SectionHeader icon={<Users size={18} />} title="All Employees" count={users.length} isDark={isDark} />
                <div className="space-y-3">
                  {users.length === 0 && (
                    <div className={`text-center py-16 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                      <Users size={48} className="mx-auto mb-3 opacity-30" />
                      <p className="font-medium">No employees yet</p>
                      <p className="text-sm">Add your first employee using the form</p>
                    </div>
                  )}
                  {users.map((user, i) => (
                    <motion.div key={user._id}
                      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      whileHover={{ scale: 1.01, boxShadow: "0 8px 30px rgba(59,130,246,0.1)" }}
                      className={`rounded-2xl p-5 flex items-center gap-4 group transition-all border-t-4 ${isDark ? "bg-linear-to-b from-gray-800 to-gray-900 border border-gray-700 border-t-blue-500" : "bg-linear-to-b from-[#e6eaef] to-[#ffffff] border border-gray-200 border-t-blue-600"}`}>
                      <div className="w-12 h-12 rounded-full bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-blue-500/30 shrink-0">
                        {user.name?.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className={`font-bold truncate ${isDark ? "text-white" : "text-gray-800"}`}>{user.name}</h3>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                            user.role === "Admin" ? "bg-purple-100 text-purple-700"
                            : user.role === "Manager" ? "bg-amber-100 text-amber-700"
                            : "bg-green-100 text-green-700"
                          }`}>{user.role}</span>
                        </div>
                        <p className={`text-sm truncate mb-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{user.email}</p>
                        <div className="flex flex-wrap gap-1">
                          {(user.skills || []).map((s) => <SkillBadge key={s} skill={s} isDark={isDark} />)}
                          {(user.skills || []).length === 0 && <span className={`text-xs italic ${isDark ? "text-gray-500" : "text-gray-400"}`}>No skills assigned</span>}
                        </div>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleEditEmployee(user)}
                          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${isDark ? "bg-blue-900/30 hover:bg-blue-900/50 text-blue-400" : "bg-blue-50 hover:bg-blue-100 text-blue-600"}`}>
                          <Edit2 size={15} />
                        </button>
                        <button onClick={() => setConfirmDelete({ id: user._id, name: user.name, type: "employee" })}
                          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${isDark ? "bg-red-900/30 hover:bg-red-900/50 text-red-400" : "bg-red-50 hover:bg-red-100 text-red-500"}`}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "locations" && (
            <motion.div key="locations" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-4">
                <Card isDark={isDark}>
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
                        <Building2 size={18} className="text-white" />
                      </div>
                      <h2 className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-800"}`}>
                        {editingLocId ? "Edit Location" : "Add Location"}
                      </h2>
                    </div>
                    {editingLocId && (
                      <button onClick={resetLocForm} className={isDark ? "text-gray-500 hover:text-gray-300" : "text-gray-400 hover:text-gray-600"}>
                        <X size={18} />
                      </button>
                    )}
                  </div>

                  <form onSubmit={handleSaveLocation} className="space-y-4">
                    <div>
                      <label className={`text-xs font-semibold uppercase tracking-wide mb-1.5 block ${isDark ? "text-gray-400" : "text-gray-500"}`}>Location Name</label>
                      <input className={inputCls} placeholder="e.g. Downtown Office" value={locForm.name}
                        onChange={(e) => setLocForm((f) => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div>
                      <label className={`text-xs font-semibold uppercase tracking-wide mb-1.5 block ${isDark ? "text-gray-400" : "text-gray-500"}`}>Address</label>
                      <input className={inputCls} placeholder="123 Main St, City" value={locForm.address}
                        onChange={(e) => setLocForm((f) => ({ ...f, address: e.target.value }))} />
                    </div>
                    <div>
                      <label className={`text-xs font-semibold uppercase tracking-wide mb-1.5 block ${isDark ? "text-gray-400" : "text-gray-500"}`}>Timezone</label>
                      <select className={inputCls} value={locForm.timezone}
                        onChange={(e) => setLocForm((f) => ({ ...f, timezone: e.target.value }))}>
                        {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                      </select>
                    </div>
                    <button type="submit"
                      className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/20 transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2">
                      {editingLocId ? <><Check size={16} /> Update Location</> : <><MapPin size={16} /> Add Location</>}
                    </button>
                  </form>
                </Card>
              </div>

              <div className="lg:col-span-8">
                <SectionHeader icon={<MapPin size={18} />} title="All Locations" count={locations.length} isDark={isDark} />
                <div className="space-y-3">
                  {locations.length === 0 && (
                    <div className={`text-center py-16 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                      <MapPin size={48} className="mx-auto mb-3 opacity-30" />
                      <p className="font-medium">No locations yet</p>
                      <p className="text-sm">Add your first location using the form</p>
                    </div>
                  )}
                  {locations.map((loc, i) => (
                    <motion.div key={loc._id}
                      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      whileHover={{ scale: 1.01, boxShadow: "0 8px 30px rgba(59,130,246,0.1)" }}
                      className={`rounded-2xl p-5 flex items-center gap-4 group transition-all border-t-4 ${isDark ? "bg-linear-to-b from-gray-800 to-gray-900 border border-gray-700 border-t-blue-500" : "bg-linear-to-b from-[#e6eaef] to-[#ffffff] border border-gray-200 border-t-blue-600"}`}>
                      <div className="w-12 h-12 rounded-full bg-linear-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30 shrink-0">
                        <MapPin size={22} className="text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className={`font-bold mb-1 ${isDark ? "text-white" : "text-gray-800"}`}>{loc.name}</h3>
                        <div className={`flex items-center gap-3 text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                          <span className="flex items-center gap-1"><Building2 size={12} /> {loc.address || "No address"}</span>
                          <span className="flex items-center gap-1"><Globe size={12} /> {loc.timezone}</span>
                        </div>
                      </div>
                      <div className={`text-center px-3 py-2 rounded-xl mr-2 ${isDark ? "bg-blue-900/30" : "bg-blue-50"}`}>
                        <p className={`text-lg font-bold ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                          {users.filter((u) => (u.locations || []).some((l) => (l._id || l).toString() === loc._id.toString())).length}
                        </p>
                        <p className={`text-xs ${isDark ? "text-blue-500" : "text-blue-400"}`}>Staff</p>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleEditLocation(loc)}
                          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${isDark ? "bg-blue-900/30 hover:bg-blue-900/50 text-blue-400" : "bg-blue-50 hover:bg-blue-100 text-blue-600"}`}>
                          <Edit2 size={15} />
                        </button>
                        <button onClick={() => setConfirmDelete({ id: loc._id, name: loc.name, type: "location" })}
                          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${isDark ? "bg-red-900/30 hover:bg-red-900/50 text-red-400" : "bg-red-50 hover:bg-red-100 text-red-500"}`}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
