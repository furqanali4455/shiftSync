"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, Calendar, Database, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import { Toaster, toast } from "react-hot-toast";

const DEMO_ACCOUNTS = [
  { role: "Admin", name: "Sarah Admin", email: "admin@shiftsync.com", password: "admin123!" },
  { role: "Manager", name: "Alice Manager", email: "alice@shiftsync.com", password: "password123" },
  { role: "Staff", name: "Bob Wilson", email: "bob@shiftsync.com", password: "password123" },
  { role: "Staff", name: "Carol Davis", email: "carol@shiftsync.com", password: "password123" },
  { role: "Staff", name: "David Chen", email: "david@shiftsync.com", password: "password123" },
];

const ROLE_COLORS = {
  Admin: "bg-purple-100 text-purple-700",
  Manager: "bg-amber-100 text-amber-700",
  Staff: "bg-emerald-100 text-emerald-700",
};

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email) return toast.error("Please enter your email");
    if (!password) return toast.error("Please enter your password");

    setLoading(true);
    const tid = toast.loading("Signing you in...");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Login failed", { id: tid });
      } else {
        toast.success(`Welcome back, ${data.name}!`, { id: tid });
        localStorage.setItem("shiftsync_user", JSON.stringify(data));
        setTimeout(() => router.push("/"), 800);
      }
    } catch {
      toast.error("Network error", { id: tid });
    } finally {
      setLoading(false);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    const tid = toast.loading("Seeding database with demo data...");
    try {
      const res = await fetch("/api/seed", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Seed failed", { id: tid });
      } else {
        toast.success("Demo data loaded! Use the credentials below to log in.", { id: tid });
        setSeeded(true);
        setShowAccounts(true);
      }
    } catch {
      toast.error("Seed failed", { id: tid });
    } finally {
      setSeeding(false);
    }
  };

  const fillCredentials = (account, idx) => {
    setEmail(account.email);
    setPassword(account.password);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-[#f5f7fa] p-6 font-sans">
      <Toaster position="top-right" toastOptions={{ style: { borderRadius: "12px" } }} />

      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-blue-100/60 rounded-full blur-[100px]" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-indigo-100/40 rounded-full blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10 flex flex-col gap-4"
      >
        <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-10">
          <div className="flex justify-center mb-6">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/30">
              <Calendar size={24} className="text-white" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-1">Welcome back</h2>
          <p className="text-center text-gray-500 text-sm mb-8">Sign in to your ShiftSync account</p>

          <form onSubmit={handleLogin} className="space-y-5" noValidate>
            <div>
              <label className="text-gray-700 text-xs font-semibold uppercase tracking-wider block mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input type="email"
                  className="w-full bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl py-3 pl-10 pr-4 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
                  placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="text-gray-700 text-xs font-semibold uppercase tracking-wider block mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input type={showPassword ? "text" : "password"}
                  className="w-full bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl py-3 pl-10 pr-10 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
                  placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" tabIndex="-1"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-70 text-white text-sm font-semibold rounded-xl shadow-sm shadow-blue-600/20 transition-all active:scale-[0.98]">
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className="mt-6 text-center text-gray-500 text-sm">
            Don&apos;t have an account?{" "}
            <button onClick={() => router.push("/signup")} className="text-blue-600 hover:text-blue-700 font-semibold transition-colors">Sign up</button>
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden">
          <div className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                <Database size={16} className="text-orange-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">First time? Load demo data</h3>
                <p className="text-xs text-gray-500">Seeds the database with sample users, locations & shifts</p>
              </div>
            </div>

            <button onClick={handleSeed} disabled={seeding}
              className={`w-full py-2.5 text-sm font-semibold rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
                seeded
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-orange-500 hover:bg-orange-600 disabled:opacity-70 text-white shadow-sm shadow-orange-500/20"
              }`}>
              {seeding ? (
                <><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Seeding...</>
              ) : seeded ? (
                <><Check size={16} /> Database Seeded</>
              ) : (
                <><Database size={16} /> Seed Demo Data</>
              )}
            </button>
          </div>

          <div className={`border-t border-gray-100 ${!seeded && "opacity-50"}`}>
            <button onClick={() => setShowAccounts(!showAccounts)}
              className="w-full px-5 py-3 flex items-center justify-between text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              <span className="font-medium">Demo Accounts ({DEMO_ACCOUNTS.length})</span>
              {showAccounts ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            <AnimatePresence>
              {showAccounts && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 space-y-2">
                    {DEMO_ACCOUNTS.map((acc, i) => (
                      <button key={acc.email} onClick={() => fillCredentials(acc, i)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/50 transition-all text-left group">
                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">
                          {acc.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900 truncate">{acc.name}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${ROLE_COLORS[acc.role]}`}>{acc.role}</span>
                          </div>
                          <p className="text-xs text-gray-400 truncate">{acc.email} / {acc.password}</p>
                        </div>
                        <div className="shrink-0">
                          {copiedIdx === i ? (
                            <Check size={14} className="text-emerald-500" />
                          ) : (
                            <Copy size={14} className="text-gray-300 group-hover:text-blue-500 transition-colors" />
                          )}
                        </div>
                      </button>
                    ))}
                    <p className="text-[11px] text-gray-400 text-center pt-1">Click any account to auto-fill the login form</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
