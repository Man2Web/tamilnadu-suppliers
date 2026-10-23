"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  User,
  ShieldCheck,
  KeyRound,
  Save,
  CheckCircle2,
  AlertCircle,
  Layers,
  ArrowLeft,
  Calendar,
} from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";

export default function MyAccountPage() {
  const { currentUser, isSuperAdmin, fetchWithAuth, refreshUsers } = useAuth();

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || "");
      setUsername(currentUser.username || "");
      setEmail(currentUser.email || "");
      setPhone(currentUser.phone || "");
    }
  }, [currentUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!name.trim()) {
      setError("Full Name is required.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetchWithAuth(`/api/users/${currentUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          username: username.trim() || undefined,
          email: email.trim().toLowerCase(),
          phone: phone.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update profile");

      setSuccess("Profile details saved successfully!");
      refreshUsers();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4 text-center text-slate-500 font-medium">
        Loading account details...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <User className="w-6 h-6 text-blue-600" />
              My Account & Profile
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              View and manage your personal user credentials, profile information, and security settings.
            </p>
          </div>
        </div>

        <Link
          href="/change-password"
          className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-semibold shadow-2xs transition"
        >
          <KeyRound className="w-4 h-4 text-amber-600" />
          <span>Change Password</span>
        </Link>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2 font-medium">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Profile Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-5">
          <div className="flex items-center gap-4 pb-4 border-b border-slate-200">
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg shrink-0 shadow-inner ${
                currentUser.role === "SUPER_ADMIN"
                  ? "bg-purple-100 text-purple-700"
                  : currentUser.role === "ADMIN"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {currentUser.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-slate-900">{currentUser.name}</h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    currentUser.role === "SUPER_ADMIN"
                      ? "bg-purple-50 text-purple-700 border border-purple-200"
                      : currentUser.role === "ADMIN"
                      ? "bg-blue-50 text-blue-700 border border-blue-200"
                      : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  }`}
                >
                  {currentUser.role === "SUPER_ADMIN"
                    ? "Super Administrator"
                    : currentUser.role === "ADMIN"
                    ? "Administrator"
                    : "Billing Operator"}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Active
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono mt-0.5">{currentUser.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
                placeholder="e.g. admin"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Login Email Address *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Contact Phone</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 94432 00000"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-slate-100">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? "Saving Changes..." : "Save Profile Details"}</span>
            </button>
          </div>
        </div>

        {/* Permissions Overview */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-blue-600" />
              Assigned Permissions & Capabilities
            </h3>
            <span className="text-[11px] font-semibold text-slate-500">
              {currentUser.role === "SUPER_ADMIN"
                ? "Full Administrator Rights"
                : `${(currentUser.permissions || []).length} Modules Granted`}
            </span>
          </div>

          {currentUser.role === "SUPER_ADMIN" ? (
            <div className="p-3 bg-purple-50 rounded-lg border border-purple-200 text-xs text-purple-900">
              Your account has full, unrestricted Super Administrator access across all billing, operations, inventory, customer master, company settings, and user administration features.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 rounded-lg border border-slate-200 max-h-48 overflow-y-auto">
              {(currentUser.permissions || []).map((p) => (
                <span
                  key={p}
                  className="px-2 py-1 rounded bg-white text-slate-800 text-[11px] font-mono border border-slate-200"
                >
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
