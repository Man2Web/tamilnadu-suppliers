"use client";

import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, User, Eye, EyeOff, ShieldCheck, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/dashboard";
  const { setCurrentUser } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // Prevent duplicate requests
    setErrorMessage(null);

    const cleanUsername = username.trim();
    const cleanPassword = password.trim();

    if (!cleanUsername || !cleanPassword) {
      setErrorMessage("Please enter both username and password.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: cleanUsername,
          password: cleanPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Enforce generic message or rate limit message
        setErrorMessage(data.error || "Invalid username or password.");
        setLoading(false);
        return;
      }

      // Populate context state immediately
      if (data.user) {
        setCurrentUser(data.user);
      }

      // Fast client-side navigation without cold full-page reload
      const target = data.user?.mustChangePassword
        ? "/change-password"
        : from.startsWith("/")
        ? from
        : "/dashboard";

      router.replace(target);
      router.refresh();
    } catch (err) {
      console.error("Login failure:", err);
      setErrorMessage("Network error: Unable to connect to server. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-700 via-blue-600 to-indigo-600 text-white font-black text-2xl shadow-lg shadow-blue-500/20 mb-4 border border-blue-400/30">
          TS
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Tamilnadu Suppliers
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1.5 font-medium">
          Rental Inventory, Quotations & Billing System
        </p>
      </div>

      {/* Login Card */}
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-200/80 p-6 sm:p-8 backdrop-blur-xs">
        <div className="mb-6">
          <h2 className="text-lg font-bold text-slate-900">Sign in to your account</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Enter your credentials to access protected modules
          </p>
        </div>

        {/* Session Terminated Alert */}
        {searchParams.get("error") === "session_rejected" && (
          <div
            id="session-terminated-alert"
            role="alert"
            className="mb-5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5 animate-in fade-in slide-in-from-top-1 duration-200 shadow-xs"
          >
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-amber-950">Session Terminated</div>
              <div className="font-medium text-amber-800 mt-0.5">Your session has been terminated by the Super Admin. Please sign in again.</div>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div
            id="login-error-alert"
            role="alert"
            className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5 animate-in fade-in slide-in-from-top-1 duration-200"
          >
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="font-semibold leading-relaxed">{errorMessage}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username / Login Identifier */}
          <div>
            <label
              htmlFor="login-username-input"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Username / Login Identifier
            </label>
            <div className="relative rounded-xl shadow-2xs">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </div>
              <input
                id="login-username-input"
                name="username"
                type="text"
                autoComplete="username"
                required
                disabled={loading}
                placeholder="e.g. admin@tamilnadusuppliers.com"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 font-medium transition outline-none disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Password with Show/Hide Toggle */}
          <div>
            <label
              htmlFor="login-password-input"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Password
            </label>
            <div className="relative rounded-xl shadow-2xs">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="login-password-input"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                disabled={loading}
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-11 py-2.5 bg-slate-50 border border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 font-medium transition outline-none disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                id="toggle-password-visibility"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              id="login-submit-button"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-[0.99] text-white text-xs sm:text-sm font-bold shadow-md shadow-blue-500/20 transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Security Assurance Notice */}
        <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-center gap-2 text-slate-400 text-[11px] font-medium">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Server-Enforced Session & Rate-Limit Protected</span>
        </div>
      </div>

      {/* Footer Info */}
      <div className="mt-8 text-center text-xs text-slate-400 space-y-1">
        <div>Tamilnadu Suppliers • Vellore, Tamil Nadu</div>
        <div className="text-[11px] text-slate-400">
          Strict Role-Based Access: Super Admin • Admin • Billing
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[350px]">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

