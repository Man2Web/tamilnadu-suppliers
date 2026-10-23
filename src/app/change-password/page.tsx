"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Lock, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { setCurrentUser } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // Prevent duplicate requests
    setErrorMessage(null);

    if (!currentPassword) {
      setErrorMessage("Please enter your current temporary password.");
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setErrorMessage("New password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("New password and confirmation do not match.");
      return;
    }

    if (newPassword === currentPassword) {
      setErrorMessage("New password must be different from the temporary password.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || "Failed to update password.");
        setLoading(false);
        return;
      }

      // Successful password change — update state and navigate to dashboard
      if (data.user) {
        setCurrentUser(data.user);
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      console.error("Password update error:", err);
      setErrorMessage("Network error: Could not complete password update.");
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-600 to-orange-500 text-white font-black text-2xl shadow-lg shadow-amber-500/20 mb-4 border border-amber-400/30">
          <KeyRound className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Set Permanent Password
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1.5 font-medium">
          Security requirement: Change your temporary password on first login
        </p>
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-200/80 p-6 sm:p-8 backdrop-blur-xs">
        <div className="mb-5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
          <div className="font-bold flex items-center gap-1.5 mb-1">
            <Lock className="w-4 h-4 text-amber-600" />
            <span>First-Login Security Requirement</span>
          </div>
          <p className="text-amber-800 leading-relaxed">
            Your Super Admin account was initialized with a temporary password. You must set a permanent password before accessing the dashboard and application features.
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div
            id="change-password-error-alert"
            role="alert"
            className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5 animate-in fade-in slide-in-from-top-1 duration-200"
          >
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="font-semibold leading-relaxed">{errorMessage}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Current Temporary Password */}
          <div>
            <label
              htmlFor="current-password-input"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Current Temporary Password
            </label>
            <div className="relative rounded-xl shadow-2xs">
              <input
                id="current-password-input"
                name="currentPassword"
                type={showCurrent ? "text" : "password"}
                required
                disabled={loading}
                placeholder="Enter the temporary password used to sign in"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full pl-3.5 pr-11 py-2.5 bg-slate-50 border border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 rounded-xl text-xs sm:text-sm text-slate-900 font-mono transition outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((prev) => !prev)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div>
            <label
              htmlFor="new-password-input"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              New Permanent Password (min 6 characters)
            </label>
            <div className="relative rounded-xl shadow-2xs">
              <input
                id="new-password-input"
                name="newPassword"
                type={showNew ? "text" : "password"}
                required
                disabled={loading}
                placeholder="Enter your new secure password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full pl-3.5 pr-11 py-2.5 bg-slate-50 border border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 rounded-xl text-xs sm:text-sm text-slate-900 font-mono transition outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowNew((prev) => !prev)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm New Password */}
          <div>
            <label
              htmlFor="confirm-password-input"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Confirm New Password
            </label>
            <div className="relative rounded-xl shadow-2xs">
              <input
                id="confirm-password-input"
                name="confirmPassword"
                type={showConfirm ? "text" : "password"}
                required
                disabled={loading}
                placeholder="Re-enter your new secure password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full pl-3.5 pr-11 py-2.5 bg-slate-50 border border-slate-300 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 rounded-xl text-xs sm:text-sm text-slate-900 font-mono transition outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((prev) => !prev)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              id="change-password-submit-button"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-[0.99] text-white text-xs sm:text-sm font-bold shadow-md shadow-blue-500/20 transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Updating Password...</span>
                </>
              ) : (
                <>
                  <span>Save Password & Continue to Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
