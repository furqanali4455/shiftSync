"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { User, Lock, Mail, Eye, EyeOff, Calendar } from "lucide-react";
import { Toaster, toast } from "react-hot-toast";

export default function Signup() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!firstName) return toast.error("First name is required");
    if (!lastName) return toast.error("Last name is required");
    if (!email) return toast.error("Email is required");
    if (!password) return toast.error("Password is required");
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirmPassword) return toast.error("Passwords do not match");

    setLoading(true);
    const tid = toast.loading("Creating your account...");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Signup failed", { id: tid });
      } else {
        toast.success("Account created!", { id: tid });
        localStorage.setItem("shiftsync_user", JSON.stringify(data));
        setTimeout(() => router.push("/"), 800);
      }
    } catch {
      toast.error("Network error", { id: tid });
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl py-3 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all";

  return (
    <div className="flex justify-center items-center min-h-screen bg-[#f5f7fa] p-6 font-sans">
      <Toaster position="top-right" toastOptions={{ style: { borderRadius: "12px" } }} />

      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-indigo-100/60 rounded-full blur-[100px]" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] bg-blue-100/40 rounded-full blur-[100px]" />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10">
        <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-10">
          <div className="flex justify-center mb-6">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/30">
              <Calendar size={24} className="text-white" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-1">Create account</h2>
          <p className="text-center text-gray-500 text-sm mb-8">Get started with ShiftSync</p>

          <form onSubmit={handleSignup} className="space-y-4" noValidate>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-gray-700 text-xs font-semibold uppercase tracking-wider block mb-1.5">First Name</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input type="text" className={`${inputCls} pl-10 pr-4`} placeholder="John" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-gray-700 text-xs font-semibold uppercase tracking-wider block mb-1.5">Last Name</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input type="text" className={`${inputCls} pl-10 pr-4`} placeholder="Doe" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>
            </div>

            <div>
              <label className="text-gray-700 text-xs font-semibold uppercase tracking-wider block mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input type="email" className={`${inputCls} pl-10 pr-4`} placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="text-gray-700 text-xs font-semibold uppercase tracking-wider block mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input type={showPassword ? "text" : "password"} className={`${inputCls} pl-10 pr-10`} placeholder="Min 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" tabIndex="-1" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-gray-700 text-xs font-semibold uppercase tracking-wider block mb-1.5">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input type={showConfirm ? "text" : "password"} className={`${inputCls} pl-10 pr-10`} placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                <button type="button" tabIndex="-1" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" onClick={() => setShowConfirm(!showConfirm)}>
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-70 text-white text-sm font-semibold rounded-xl shadow-sm shadow-blue-600/20 transition-all active:scale-[0.98]">
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>

          <p className="mt-6 text-center text-gray-500 text-sm">
            Already have an account?{" "}
            <button onClick={() => router.push("/login")} className="text-blue-600 hover:text-blue-700 font-semibold transition-colors">Sign in</button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
