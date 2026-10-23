"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  UserCog,
  Plus,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Edit2,
  Trash2,
  Power,
  Eye,
  EyeOff,
  Wand2,
  X,
  Lock,
  Layers,
  Sparkles,
  Info,
  Calendar,
  RotateCw,
  Search,
  Users,
} from "lucide-react";
import { User } from "@/lib/types";
import { useAuth } from "@/lib/auth/AuthContext";

export default function AccountManagementPage() {
  const { currentUser, isSuperAdmin, users, refreshUsers, fetchWithAuth } = useAuth();

  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tabFilter, setTabFilter] = useState<"EMPLOYEES" | "ALL" | "SUPER_ADMIN">("EMPLOYEES");
  const [searchTerm, setSearchTerm] = useState("");
  const [alert, setAlert] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // View Details Modal State
  const [viewDetailsUser, setViewDetailsUser] = useState<User | null>(null);

  // Password reset modal
  const [resetModalUser, setResetModalUser] = useState<User | null>(null);
  const [newResetPassword, setNewResetPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);

  // Expanded permission views in user list
  const [expandedUserPerms, setExpandedUserPerms] = useState<Record<string, boolean>>({});

  // Auto-fetch user accounts on mount
  useEffect(() => {
    setIsRefreshing(true);
    refreshUsers().finally(() => setIsRefreshing(false));
  }, [refreshUsers]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await refreshUsers();
    setIsRefreshing(false);
  };

  const showAlert = (text: string, type: "success" | "error") => {
    setAlert({ text, type });
    setTimeout(() => setAlert(null), 6000);
  };

  const generateStrongPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
    let pwd = "";
    for (let i = 0; i < 12; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  };

  const handleToggleStatus = async (user: User) => {
    if (user.role === "SUPER_ADMIN" && isSuperAdmin) {
      if (!confirm("Are you sure you want to toggle the status of a Super Admin account?")) {
        return;
      }
    }

    try {
      const res = await fetchWithAuth(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle-status" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update status");

      showAlert(
        `Account status updated: ${user.name} is now ${data.status === "ACTIVE" ? "Active" : "Inactive"}.`,
        "success"
      );
      refreshUsers();
    } catch (e: any) {
      showAlert(e.message, "error");
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (user.role === "SUPER_ADMIN") {
      showAlert("Super Admin accounts cannot be deleted.", "error");
      return;
    }

    if (!confirm(`Are you sure you want to permanently delete account "${user.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetchWithAuth(`/api/users/${user.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete account");

      showAlert(`Account "${user.name}" deleted successfully.`, "success");
      refreshUsers();
    } catch (e: any) {
      showAlert(e.message, "error");
    }
  };

  const handleConfirmPasswordReset = async () => {
    if (!resetModalUser) return;
    if (!newResetPassword || newResetPassword.length < 6) {
      showAlert("Password must be at least 6 characters long.", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/users/${resetModalUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset-password",
          password: newResetPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reset password");

      showAlert(
        `Password for ${resetModalUser.name} has been updated successfully. Passwords are never stored in plaintext.`,
        "success"
      );
      setResetModalUser(null);
      setNewResetPassword("");
      refreshUsers();
    } catch (e: any) {
      showAlert(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // Permission Guard: Only Super Admin can access
  if (!isSuperAdmin) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4">
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-8 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-amber-900">Access Denied: Super Admin Authority Required</h2>
          <p className="text-sm text-amber-800 max-w-lg mx-auto">
            Account and permission management is strictly reserved for the <strong>Super Administrator</strong>.
            Ordinary Admin or Billing accounts cannot create accounts or grant themselves elevated privileges.
          </p>
        </div>
      </div>
    );
  }

  const employeeAccounts = useMemo(() => users.filter((u) => u.role !== "SUPER_ADMIN"), [users]);
  const superAdminAccounts = useMemo(() => users.filter((u) => u.role === "SUPER_ADMIN"), [users]);

  const filteredUsers = useMemo(() => {
    let list = users;
    if (tabFilter === "EMPLOYEES") {
      list = employeeAccounts;
    } else if (tabFilter === "SUPER_ADMIN") {
      list = superAdminAccounts;
    }

    if (!searchTerm.trim()) return list;

    const query = searchTerm.toLowerCase().trim();
    return list.filter(
      (u) =>
        (u.name && u.name.toLowerCase().includes(query)) ||
        (u.username && u.username.toLowerCase().includes(query)) ||
        (u.email && u.email.toLowerCase().includes(query)) ||
        (u.role && u.role.toLowerCase().includes(query))
    );
  }, [users, tabFilter, employeeAccounts, superAdminAccounts, searchTerm]);

  const activeCount = users.filter((u) => u.status === "ACTIVE").length;
  const adminCount = users.filter((u) => u.role === "ADMIN" || u.role === "SUPER_ADMIN").length;
  const billingCount = users.filter((u) => u.role === "BILLING").length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto bg-white pb-12">
      {/* Alert Notification */}
      {alert && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between text-xs font-semibold shadow-xs ${
            alert.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-300"
              : "bg-red-50 text-red-800 border border-red-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {alert.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{alert.text}</span>
          </div>
          <button onClick={() => setAlert(null)} className="text-slate-400 hover:text-slate-600 font-bold ml-4">
            ✕
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-purple-100 text-purple-700 rounded-lg">
              <UserCog className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Account & Permission Management
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Super Admin Console — Create user accounts, configure module access, and control permissions
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            title="Refresh user accounts from database"
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs shadow-2xs transition disabled:opacity-60"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-blue-600" : ""}`} />
            <span>{isRefreshing ? "Syncing..." : "Refresh"}</span>
          </button>

          <Link
            href="/accounts/new"
            id="btn-create-account"
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-md transition shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add User Account</span>
          </Link>
        </div>
      </div>

      {/* Overview Metric Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Accounts</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{users.length}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Configured users</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active Status</div>
          <div className="text-2xl font-black text-emerald-600 mt-1">{activeCount}</div>
          <div className="text-[11px] text-emerald-700 font-medium mt-0.5">Ready to login</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Admin Accounts</div>
          <div className="text-2xl font-black text-blue-600 mt-1">{adminCount}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Super Admin & Admin</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Billing Accounts</div>
          <div className="text-2xl font-black text-indigo-600 mt-1">{billingCount}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Counter & Billing staff</div>
        </div>
      </div>

      {/* Users Directory Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {/* Table Header & Controls */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                {tabFilter === "EMPLOYEES"
                  ? "Configured Employee Accounts"
                  : tabFilter === "SUPER_ADMIN"
                  ? "Super Administrator Root Account"
                  : "All System Accounts"}
              </h3>
              <span className="text-xs font-semibold px-2.5 py-0.5 bg-slate-100 text-slate-700 rounded-full border border-slate-200">
                {filteredUsers.length} {filteredUsers.length === 1 ? "Record" : "Records"}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {tabFilter === "EMPLOYEES"
                ? "Employee and staff accounts configured for counter, billing, and operational modules."
                : tabFilter === "SUPER_ADMIN"
                ? "Protected root administrator account with master privileges."
                : "Complete roster of all system accounts including administrative and employee profiles."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* View Tabs */}
            <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setTabFilter("EMPLOYEES")}
                className={`px-3 py-1.5 rounded-lg transition ${
                  tabFilter === "EMPLOYEES"
                    ? "bg-white text-blue-600 shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Employees ({employeeAccounts.length})
              </button>
              <button
                type="button"
                onClick={() => setTabFilter("ALL")}
                className={`px-3 py-1.5 rounded-lg transition ${
                  tabFilter === "ALL"
                    ? "bg-white text-blue-600 shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                All Accounts ({users.length})
              </button>
              <button
                type="button"
                onClick={() => setTabFilter("SUPER_ADMIN")}
                className={`px-3 py-1.5 rounded-lg transition ${
                  tabFilter === "SUPER_ADMIN"
                    ? "bg-white text-purple-600 shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Super Admin ({superAdminAccounts.length})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative min-w-[200px] sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search name, email, username..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-600 border-b border-slate-200 uppercase font-bold text-[10px] tracking-wider">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Permissions Summary</th>
                <th className="px-4 py-3">Created Date</th>
                <th className="px-4 py-3">Last Updated</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {isRefreshing && users.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <RotateCw className="w-6 h-6 text-blue-600 animate-spin" />
                      <span className="text-xs text-slate-500 font-medium">Loading user accounts from Supabase...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                        <UserCog className="w-6 h-6" />
                      </div>
                      <div className="text-sm font-bold text-slate-700">No accounts found</div>
                      <p className="text-xs text-slate-500 max-w-sm">
                        {searchTerm
                          ? `No accounts match "${searchTerm}".`
                          : tabFilter === "EMPLOYEES"
                          ? "No employee accounts found. Use the 'Add User Account' button above to configure staff."
                          : "No accounts found in this view."}
                      </p>
                      <Link
                        href="/accounts/new"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add User Account</span>
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const isSuperAdminUser = user.role === "SUPER_ADMIN";
                  const isExpanded = !!expandedUserPerms[user.id];
                  const permCount = (user.permissions || []).length;
                  const createdDateStr = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—";
                  const updatedDateStr = user.updatedAt ? new Date(user.updatedAt).toLocaleDateString() : "—";
                  const avatarText = (user.name || user.username || user.email || "US").slice(0, 2).toUpperCase();

                  return (
                    <tr key={user.id} className="hover:bg-slate-50/60 transition">
                      {/* Name */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                              isSuperAdminUser
                                ? "bg-purple-100 text-purple-700"
                                : user.role === "ADMIN"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {avatarText}
                          </div>
                          <div className="font-bold text-slate-900 text-sm">{user.name}</div>
                        </div>
                      </td>

                    {/* Username */}
                    <td className="px-4 py-4 font-mono text-slate-600">
                      {user.username || "—"}
                    </td>

                    {/* Email */}
                    <td className="px-4 py-4 font-mono text-slate-600">
                      {user.email}
                    </td>

                    {/* Role badge */}
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold ${
                          isSuperAdminUser
                            ? "bg-purple-50 text-purple-700 border border-purple-200"
                            : user.role === "ADMIN"
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        }`}
                      >
                        {isSuperAdminUser ? "Super Admin" : user.role === "ADMIN" ? "Admin" : "Billing"}
                      </span>
                    </td>

                    {/* Status badge with active toggle */}
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(user)}
                        title={`Click to ${user.status === "ACTIVE" ? "deactivate" : "activate"}`}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${
                          user.status === "ACTIVE"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                            : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            user.status === "ACTIVE" ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                          }`}
                        />
                        <span>{user.status === "ACTIVE" ? "Active" : "Inactive"}</span>
                      </button>
                    </td>

                    {/* Permissions summary */}
                    <td className="px-4 py-4 max-w-xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800 text-xs">
                            {isSuperAdminUser ? "All Permissions" : `${permCount} Granted`}
                          </span>
                          {!isSuperAdminUser && permCount > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedUserPerms((prev) => ({
                                  ...prev,
                                  [user.id]: !prev[user.id],
                                }))
                              }
                              className="text-[10px] text-blue-600 hover:underline font-semibold"
                            >
                              {isExpanded ? "Hide" : "View"}
                            </button>
                          )}
                        </div>

                        {/* Expandable badges */}
                        {isExpanded && !isSuperAdminUser && (
                          <div className="flex flex-wrap gap-1 pt-1 max-h-24 overflow-y-auto">
                            {user.permissions?.map((p) => (
                              <span
                                key={p}
                                className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-mono border border-slate-200"
                              >
                                {p}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Created Date */}
                    <td className="px-4 py-4 text-slate-500 text-[11px] whitespace-nowrap">
                      {createdDateStr}
                    </td>

                    {/* Last Updated Date */}
                    <td className="px-4 py-4 text-slate-500 text-[11px] whitespace-nowrap">
                      {updatedDateStr}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* View Details */}
                        <button
                          type="button"
                          onClick={() => setViewDetailsUser(user)}
                          title="View Account Details"
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition"
                        >
                          <Info className="w-4 h-4" />
                        </button>

                        {/* Edit Account (Full page) */}
                        <Link
                          href={`/accounts/${user.id}/edit`}
                          title="Edit Account & Permissions"
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition inline-flex items-center justify-center"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Link>

                        {/* Change / Reset Password */}
                        <button
                          type="button"
                          onClick={() => {
                            setResetModalUser(user);
                            const autoPwd = generateStrongPassword();
                            setNewResetPassword(autoPwd);
                            setShowResetPassword(true);
                          }}
                          title="Change or Reset Password"
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-amber-600 hover:bg-amber-50 transition"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>

                        {/* Activate / Deactivate Toggle */}
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(user)}
                          title={user.status === "ACTIVE" ? "Deactivate Account" : "Activate Account"}
                          className={`p-1.5 rounded-lg border border-slate-200 transition ${
                            user.status === "ACTIVE"
                              ? "text-slate-600 hover:text-amber-600 hover:bg-amber-50"
                              : "text-emerald-600 hover:bg-emerald-50"
                          }`}
                        >
                          <Power className="w-4 h-4" />
                        </button>

                        {!isSuperAdminUser && (
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(user)}
                            title="Delete Account"
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Details Modal */}
      {viewDetailsUser && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                  <UserCog className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{viewDetailsUser.name}</h3>
                  <p className="text-xs text-slate-500 font-mono">{viewDetailsUser.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewDetailsUser(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">Username</span>
                  <span className="font-mono font-semibold text-slate-900">{viewDetailsUser.username || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">Phone</span>
                  <span className="font-semibold text-slate-900">{viewDetailsUser.phone || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">Role</span>
                  <span className="font-bold text-blue-700">{viewDetailsUser.role}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">Account Status</span>
                  <span className={viewDetailsUser.status === "ACTIVE" ? "text-emerald-700 font-bold" : "text-rose-700 font-bold"}>
                    {viewDetailsUser.status}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">Created Date</span>
                  <span className="text-slate-700">{viewDetailsUser.createdAt ? new Date(viewDetailsUser.createdAt).toLocaleString() : "—"}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px] uppercase">Last Updated</span>
                  <span className="text-slate-700">{viewDetailsUser.updatedAt ? new Date(viewDetailsUser.updatedAt).toLocaleString() : "—"}</span>
                </div>
              </div>

              <div>
                <span className="text-slate-700 font-bold block mb-1">
                  Granted Permissions ({viewDetailsUser.role === "SUPER_ADMIN" ? "All Full Access" : (viewDetailsUser.permissions || []).length}):
                </span>
                <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-lg">
                  {viewDetailsUser.role === "SUPER_ADMIN" ? (
                    <span className="text-xs text-purple-700 font-semibold">Unrestricted Super Administrator access</span>
                  ) : (
                    (viewDetailsUser.permissions || []).map((p) => (
                      <span key={p} className="px-2 py-0.5 rounded bg-white text-slate-800 text-[10px] font-mono border border-slate-200">
                        {p}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-between pt-3 border-t border-slate-200">
              <Link
                href={`/accounts/${viewDetailsUser.id}/edit`}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold"
              >
                Edit Account Page
              </Link>
              <button
                type="button"
                onClick={() => setViewDetailsUser(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {resetModalUser && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Change or Reset Password</h3>
                  <p className="text-xs text-slate-500">For user: {resetModalUser.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResetModalUser(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <label className="text-slate-700 font-semibold">New Password</label>
                <button
                  type="button"
                  onClick={() => setNewResetPassword(generateStrongPassword())}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline"
                >
                  <Wand2 className="w-3 h-3" /> Generate Password
                </button>
              </div>

              <div className="relative">
                <input
                  type={showResetPassword ? "text" : "password"}
                  value={newResetPassword}
                  onChange={(e) => setNewResetPassword(e.target.value)}
                  placeholder="Enter new secure password (min 6 chars)"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 pr-10 font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowResetPassword(!showResetPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <p className="text-[11px] text-slate-500">
                Passwords are never stored in plaintext and cannot be viewed once saved.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setResetModalUser(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={handleConfirmPasswordReset}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-xs transition"
              >
                {loading ? "Updating..." : "Confirm Password Update"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
