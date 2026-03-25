"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRightLeft, Moon, Sun } from "lucide-react";
import { Toaster, toast } from "react-hot-toast";

function shiftLabel(sh) {
  if (!sh) return "—";
  const t = sh.title || "Shift";
  const loc = sh.location?.name || "";
  return loc ? `${t} @ ${loc}` : t;
}

function isAssignedToMe(shift, meId) {
  if (!shift || !meId) return false;
  const id = String(meId);
  const au = shift.assignedUsers || [];
  if (au.length) {
    return au.some((u) => String(u._id || u) === id);
  }
  return String(shift.user?._id || shift.user || "") === id;
}

export default function SwapsPage() {
  const router = useRouter();
  const [theme, setTheme] = useState("light");
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [users, setUsers] = useState([]);
  const [kind, setKind] = useState("swap");
  const [shiftId, setShiftId] = useState("");
  const [targetUserId, setTargetUserId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, sRes, uRes] = await Promise.all([
        fetch("/api/swap-requests"),
        fetch("/api/shifts"),
        fetch("/api/users"),
      ]);
      if (rRes.status === 401 || sRes.status === 401 || uRes.status === 401) {
        localStorage.removeItem("shiftsync_user");
        router.push("/login");
        return;
      }
      if (rRes.ok) setRequests(await rRes.json());
      if (sRes.ok) setShifts(await sRes.json());
      if (uRes.ok) setUsers(await uRes.json());
    } catch {
      toast.error("Failed to load");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const raw = localStorage.getItem("shiftsync_user");
    if (!raw) {
      router.push("/login");
      return;
    }
    try {
      setCurrentUser(JSON.parse(raw));
    } catch {
      router.push("/login");
      return;
    }
    const st = localStorage.getItem("shiftsync_theme");
    if (st) setTheme(st);
    load();
  }, [router, load]);

  const isDark = theme === "dark";
  const cardCls = `rounded-2xl shadow-lg border p-6 ${isDark ? "bg-gray-900/80 border-gray-800" : "bg-white border-gray-100"}`;
  const inputCls = `w-full rounded-xl px-4 py-3 text-sm ${isDark ? "bg-gray-800 border border-gray-700 text-white" : "bg-gray-50 border border-gray-200"}`;

  const myShifts = shifts.filter((s) => isAssignedToMe(s, currentUser?._id));
  const staffPeers = users.filter(
    (u) => u.role === "Staff" && String(u._id) !== String(currentUser?._id),
  );

  const swapAction = async (id, action) => {
    const tid = toast.loading("Updating…");
    try {
      const res = await fetch(`/api/swap-requests/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed", { id: tid });
        return;
      }
      toast.success("Updated", { id: tid });
      load();
    } catch {
      toast.error("Network error", { id: tid });
    }
  };

  const createRequest = async (e) => {
    e.preventDefault();
    if (!shiftId) return toast.error("Select a shift");
    if (kind === "swap" && !targetUserId) return toast.error("Select a colleague for swap");
    const tid = toast.loading("Submitting…");
    try {
      const body = { kind, shiftId };
      if (kind === "swap") body.targetUserId = targetUserId;
      const res = await fetch("/api/swap-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed", { id: tid });
        return;
      }
      toast.success("Request created", { id: tid });
      setShiftId("");
      setTargetUserId("");
      load();
    } catch {
      toast.error("Network error", { id: tid });
    }
  };

  if (!currentUser && loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? "bg-[#0f0f0f]" : "bg-[#f5f7fa]"}`}>
        <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className={`min-h-screen font-sans ${isDark ? "bg-[#0f0f0f] text-gray-100" : "bg-[#f5f7fa] text-gray-800"}`}>
      <Toaster position="top-right" />
      <header className={`sticky top-0 z-20 border-b backdrop-blur-xl px-6 py-4 flex flex-wrap items-center justify-between gap-3 ${isDark ? "border-gray-800 bg-[#0f0f0f]/80" : "border-gray-200 bg-white/80"}`}>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => router.push("/")} className={`flex items-center gap-2 text-sm ${isDark ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-gray-900"}`}>
            <ArrowLeft size={18} /> Dashboard
          </button>
          <ArrowRightLeft className={isDark ? "text-blue-400" : "text-blue-600"} size={22} />
          <h1 className="text-lg font-bold">Swaps & coverage</h1>
        </div>
        <button
          type="button"
          onClick={() => {
            const t = theme === "light" ? "dark" : "light";
            setTheme(t);
            localStorage.setItem("shiftsync_theme", t);
          }}
          className={`p-2 rounded-xl ${isDark ? "bg-gray-800 text-yellow-400" : "bg-white border border-gray-200"}`}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {currentUser?.role === "Staff" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cardCls}>
            <h2 className={`text-base font-bold mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>New request</h2>
            <form onSubmit={createRequest} className="space-y-4">
              <div>
                <label className={`text-xs font-semibold uppercase mb-1 block ${isDark ? "text-gray-400" : "text-gray-500"}`}>Type</label>
                <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="swap">Swap (needs peer acceptance)</option>
                  <option value="drop">Drop (open pickup)</option>
                </select>
              </div>
              <div>
                <label className={`text-xs font-semibold uppercase mb-1 block ${isDark ? "text-gray-400" : "text-gray-500"}`}>Your shift</label>
                <select className={inputCls} value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
                  <option value="">Select…</option>
                  {myShifts.map((s) => (
                    <option key={s._id} value={s._id}>{shiftLabel(s)}</option>
                  ))}
                </select>
              </div>
              {kind === "swap" && (
                <div>
                  <label className={`text-xs font-semibold uppercase mb-1 block ${isDark ? "text-gray-400" : "text-gray-500"}`}>Swap with</label>
                  <select className={inputCls} value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)}>
                    <option value="">Select colleague…</option>
                    {staffPeers.map((u) => (
                      <option key={u._id} value={u._id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <button type="submit" className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold">
                Submit
              </button>
            </form>
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cardCls}>
          <h2 className={`text-base font-bold mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>
            {currentUser?.role === "Staff" ? "Your requests" : "Pending manager approval"}
          </h2>
          {loading ? (
            <p className={isDark ? "text-gray-500" : "text-gray-400"}>Loading…</p>
          ) : requests.length === 0 ? (
            <p className={isDark ? "text-gray-500" : "text-gray-400"}>No open requests.</p>
          ) : (
            <ul className="space-y-3">
              {requests.map((req) => {
                const sid = String(req._id);
                const me = String(currentUser?._id);
                const isRequester = String(req.requester?._id || req.requester) === me;
                const isTarget = String(req.targetUser?._id || req.targetUser) === me;
                return (
                  <li key={sid} className={`rounded-xl p-4 text-sm ${isDark ? "bg-gray-800/60" : "bg-gray-50"}`}>
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <p className={`font-semibold ${isDark ? "text-gray-100" : "text-gray-900"}`}>
                          {req.kind} · {req.status.replace(/_/g, " ")}
                        </p>
                        <p className={isDark ? "text-gray-400" : "text-gray-600"}>{shiftLabel(req.shift)}</p>
                        <p className={`text-xs mt-1 ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                          From {req.requester?.name || "—"}
                          {req.targetUser ? ` → ${req.targetUser.name}` : ""}
                          {req.claimedBy ? ` · Claimed: ${req.claimedBy.name}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {currentUser?.role === "Staff" && req.status === "pending_target" && isTarget && (
                          <button type="button" onClick={() => swapAction(sid, "accept_swap")}
                            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold">Accept swap</button>
                        )}
                        {currentUser?.role === "Staff" && req.status === "open_pickup" && !isRequester && (
                          <button type="button" onClick={() => swapAction(sid, "claim_drop")}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold">Claim coverage</button>
                        )}
                        {currentUser?.role === "Staff" && isRequester && ["pending_target", "open_pickup"].includes(req.status) && (
                          <button type="button" onClick={() => swapAction(sid, "cancel")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${isDark ? "bg-gray-700" : "bg-gray-200"}`}>Cancel</button>
                        )}
                        {(currentUser?.role === "Manager" || currentUser?.role === "Admin") && req.status === "pending_manager" && (
                          <>
                            <button type="button" onClick={() => swapAction(sid, "approve")}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold">Approve</button>
                            <button type="button" onClick={() => swapAction(sid, "reject")}
                              className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold">Reject</button>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </motion.div>
      </main>
    </div>
  );
}
