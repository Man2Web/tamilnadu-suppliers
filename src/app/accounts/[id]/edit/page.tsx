"use client";

import React, { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  UserCog,
  ArrowLeft,
  Save,
  ShieldCheck,
  KeyRound,
  Eye,
  EyeOff,
  Wand2,
  Check,
  Layers,
  Sparkles,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { User, UserRole } from "@/lib/types";
import {
  PERMISSION_MODULES,
  ADMIN_PRESET_PERMISSIONS,
  BILLING_PRESET_PERMISSIONS,
  SUPER_ADMIN_PERMISSIONS,
  ModulePermissionId,
} from "@/lib/types/permissions";
import { useAuth } from "@/lib/auth/AuthContext";

export default function EditAccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const userId = resolvedParams.id;
  const router = useRouter();
  const { currentUser, isSuperAdmin, hasPermission, fetchWithAuth, refreshUsers } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form State
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<UserRole>("BILLING");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [changePassword, setChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<ModulePermissionId[]>([]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/users/${userId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setUser(data);
        setName(data.name || "");
        setUsername(data.username || "");
        setEmail(data.email || "");
        setPhone(data.phone || "");
        setRole(data.role || "BILLING");
        setStatus(data.status || "ACTIVE");
        setSelectedPermissions(data.permissions || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [userId]);

  const generateStrongPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
    let pwd = "";
    for (let i = 0; i < 12; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(pwd);
    setShowPassword(true);
  };

  const handleRolePresetChange = (newRole: UserRole) => {
    setRole(newRole);
    if (newRole === "SUPER_ADMIN") {
      setSelectedPermissions([...SUPER_ADMIN_PERMISSIONS]);
    } else if (newRole === "ADMIN") {
      setSelectedPermissions([...ADMIN_PRESET_PERMISSIONS]);
    } else {
      setSelectedPermissions([...BILLING_PRESET_PERMISSIONS]);
    }
  };

  const togglePermission = (permId: ModulePermissionId) => {
    setSelectedPermissions((prev) =>
      prev.includes(permId) ? prev.filter((p) => p !== permId) : [...prev, permId]
    );
  };

  const toggleModulePermissions = (modulePermIds: ModulePermissionId[]) => {
    const allSelected = modulePermIds.every((id) => selectedPermissions.includes(id));
    if (allSelected) {
      setSelectedPermissions((prev) => prev.filter((id) => !modulePermIds.includes(id)));
    } else {
      setSelectedPermissions((prev) => Array.from(new Set([...prev, ...modulePermIds])));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Full Name is required.");
      return;
    }
    if (changePassword && (!newPassword || newPassword.length < 6)) {
      setError("New password must be at least 6 characters.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload: any = {
        name: name.trim(),
        username: username.trim() || undefined,
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        role,
        status,
        permissions: role === "SUPER_ADMIN" ? [...SUPER_ADMIN_PERMISSIONS] : selectedPermissions,
      };

      if (changePassword && newPassword) {
        payload.password = newPassword;
      }

      const res = await fetchWithAuth(`/api/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update account");

      refreshUsers();
      setSuccess("Account details and permissions updated successfully!");
      setTimeout(() => router.push("/admin/users"), 1200);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4 text-center text-slate-500 font-medium">
        Loading user account details...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4 text-center">
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-8">
          <h2 className="text-lg font-bold text-rose-900">User Not Found</h2>
          <p className="text-sm text-rose-700 mt-2">{error || "Could not retrieve the requested account."}</p>
          <Link
            href="/admin/users"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Accounts
          </Link>
        </div>
      </div>
    );
  }

  if (!isSuperAdmin && !hasPermission("users:manage")) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4 text-center">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8">
          <h2 className="text-lg font-bold text-amber-900">Access Restricted</h2>
          <p className="text-sm text-amber-700 mt-2">
            Super Administrator authorization is required to edit user accounts.
          </p>
          <Link
            href="/admin/users"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Account Management
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/users"
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <UserCog className="w-6 h-6 text-blue-600" />
              Edit Account: {user.name}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Update credentials, role assignment, active status, and granular permissions.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? "Saving Changes..." : "Save Changes"}</span>
        </button>
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
        {/* Section 1: Credentials & Role */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            1. Account Identity & Credentials
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Full Employee Name *</label>
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
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
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
              <label className="block text-slate-700 font-semibold mb-1">Mobile Number</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Role & Status */}
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Account Role *</label>
              <select
                value={role}
                onChange={(e) => handleRolePresetChange(e.target.value as UserRole)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="BILLING">Billing Operator</option>
                <option value="ADMIN">Administrator</option>
                {isSuperAdmin && (
                  <option value="SUPER_ADMIN">Super Administrator</option>
                )}
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Account Status *</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "ACTIVE" | "INACTIVE")}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive (Suspended)</option>
              </select>
            </div>

            {/* Password Reset Accordion */}
            <div className="md:col-span-2 p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-slate-700 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={changePassword}
                    onChange={(e) => setChangePassword(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Change or Reset Password for this user</span>
                </label>

                {changePassword && (
                  <button
                    type="button"
                    onClick={generateStrongPassword}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200"
                  >
                    <Wand2 className="w-3 h-3" /> Generate Strong Password
                  </button>
                )}
              </div>

              {changePassword && (
                <div className="pt-2 space-y-1">
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new secure password (min 6 chars)"
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 pr-10 font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Passwords are never displayed in tables or stored in plaintext.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 2: Permission Assignments */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-blue-600" />
                2. Granular Module Permissions ({selectedPermissions.length} selected)
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Quick-select standard presets or customize checkboxes per module.
              </p>
            </div>

            {/* Presets */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedPermissions([...BILLING_PRESET_PERMISSIONS])}
                className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md hover:bg-emerald-100"
              >
                Billing Preset
              </button>
              <button
                type="button"
                onClick={() => setSelectedPermissions([...ADMIN_PRESET_PERMISSIONS])}
                className="px-2.5 py-1 text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-md hover:bg-blue-100"
              >
                Admin Preset
              </button>
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => setSelectedPermissions([...SUPER_ADMIN_PERMISSIONS])}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 rounded-md hover:bg-purple-100"
                >
                  All (Super Admin)
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            {PERMISSION_MODULES.map((mod) => {
              const modPermIds = mod.permissions.map((p) => p.id as ModulePermissionId);
              const allChecked = modPermIds.every((id) => selectedPermissions.includes(id));

              return (
                <div key={mod.id} className="bg-slate-50/70 border border-slate-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                    <span className="font-bold text-slate-900 text-xs">{mod.name}</span>
                    <button
                      type="button"
                      onClick={() => toggleModulePermissions(modPermIds)}
                      className="text-[10px] text-blue-600 font-semibold hover:underline"
                    >
                      {allChecked ? "Deselect All" : "Select All"}
                    </button>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    {mod.permissions.map((p) => {
                      const isChecked = selectedPermissions.includes(p.id as ModulePermissionId);
                      return (
                        <label
                          key={p.id}
                          className="flex items-start gap-2 cursor-pointer hover:bg-white p-1 rounded transition"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => togglePermission(p.id as ModulePermissionId)}
                            className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <div>
                            <span className="font-semibold text-slate-800 block text-[11px]">
                              {p.label || p.id}
                            </span>
                            <span className="text-[10px] text-slate-500 block leading-tight">
                              {p.description}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200">
          <Link
            href="/admin/users"
            className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? "Saving Changes..." : "Save Changes"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
