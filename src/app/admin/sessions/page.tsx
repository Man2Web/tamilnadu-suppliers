"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldAlert,
  ShieldCheck,
  Search,
  Filter,
  RefreshCw,
  Clock,
  User,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Laptop,
} from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { UserSession, SessionStatus } from "@/lib/types";

export default function AdminSessionsPage() {
  const router = useRouter();
  const { currentUser, isSuperAdmin, loading: authLoading } = useAuth();

  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [rejectingSessionId, setRejectingSessionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/sessions", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.sessions) {
          setSessions(data.sessions);
        }
      } else if (res.status === 403 || res.status === 401) {
        router.replace("/dashboard");
      }
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!authLoading && !isSuperAdmin) {
      router.replace("/dashboard");
      return;
    }
    if (isSuperAdmin) {
      fetchSessions();
    }
  }, [authLoading, isSuperAdmin, fetchSessions, router]);

  // Reject session handler
  const handleRejectSession = async (session: UserSession) => {
    if (rejectingSessionId) return; // Prevent duplicate rejection requests
    const displayName = session.userName || session.username || "User";
    const displayUsername = session.username || "Account";
    const confirmPrompt = window.confirm(
      `Are you sure you want to terminate this active session for ${displayName} (${displayUsername})?\n\nThis will immediately revoke their access and redirect them to the login screen.`
    );
    if (!confirmPrompt) return;

    setRejectingSessionId(session.id);
    setFeedback(null);

    try {
      const res = await fetch(`/api/admin/sessions/${session.id}/reject`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      if (res.ok) {
        setFeedback({
          type: "success",
          message: data.message || `Session for ${session.userName} terminated successfully.`,
        });
        // Update local session state immediately
        setSessions((prev) =>
          prev.map((s) => (s.id === session.id ? { ...s, status: "REJECTED", rejectedAt: new Date().toISOString(), rejectedBy: currentUser?.name || "Super Admin" } : s))
        );
      } else {
        setFeedback({
          type: "error",
          message: data.error || "Failed to terminate session.",
        });
      }
    } catch (err) {
      console.error("Session rejection error:", err);
      setFeedback({
        type: "error",
        message: "Network error: Unable to terminate session.",
      });
    } finally {
      setRejectingSessionId(null);
    }
  };

  // Filtered sessions
  const filteredSessions = sessions.filter((s) => {
    const term = searchTerm.trim().toLowerCase();
    const uName = (s.userName || "").toLowerCase();
    const uUser = (s.username || "").toLowerCase();
    const uRole = (s.role || "").toLowerCase();
    const uId = (s.id || "").toLowerCase();

    const matchesSearch =
      term === "" ||
      uName.includes(term) ||
      uUser.includes(term) ||
      uRole.includes(term) ||
      uId.includes(term);

    const matchesStatus = statusFilter === "ALL" || s.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredSessions.length / pageSize) || 1;
  const pagedSessions = filteredSessions.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const getStatusBadge = (status: SessionStatus) => {
    switch (status) {
      case "ACTIVE":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Active
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-500" />
            Rejected
          </span>
        );
      case "SIGNED_OUT":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            <LogOut className="w-3.5 h-3.5 text-slate-400" />
            Signed Out
          </span>
        );
      case "EXPIRED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            Expired
          </span>
        );
      default:
        return <span className="text-xs text-slate-500">{status}</span>;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "SUPER_ADMIN":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
            Super Admin
          </span>
        );
      case "ADMIN":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            Admin
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Billing
          </span>
        );
    }
  };

  const formatDateTime = (isoString?: string | null) => {
    if (!isoString) return "—";
    try {
      const d = new Date(isoString);
      return d.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return isoString;
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 pb-16">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-200">
                Super Admin Only
              </span>
              <span className="text-xs font-semibold text-slate-400">•</span>
              <span className="text-xs font-medium text-slate-500">Security & Access Audits</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
              Login Activity & Sessions
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Real-time audit log of user logins with single-session rejection control.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchSessions}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 shadow-2xs transition disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-blue-600" : "text-slate-500"}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-6">
        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`mb-6 p-4 rounded-xl text-xs sm:text-sm flex items-start justify-between gap-3 shadow-xs border ${
              feedback.type === "success"
                ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                : "bg-rose-50 text-rose-900 border-rose-200"
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              )}
              <span className="font-semibold">{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-xs font-bold underline hover:opacity-80"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Filters Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-6 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by employee, username, or role..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            <span className="text-xs font-bold text-slate-500 flex items-center gap-1 shrink-0">
              <Filter className="w-3.5 h-3.5" /> Filter Status:
            </span>
            {["ALL", "ACTIVE", "REJECTED", "SIGNED_OUT"].map((st) => (
              <button
                key={st}
                onClick={() => {
                  setStatusFilter(st);
                  setCurrentPage(1);
                }}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
                  statusFilter === st
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {st === "ALL" ? "All Sessions" : st.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        {/* Sessions Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3.5 px-4">Employee</th>
                  <th className="py-3.5 px-4">Role</th>
                  <th className="py-3.5 px-4">Login Timestamp</th>
                  <th className="py-3.5 px-4">Last Activity</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Rejection Details</th>
                  <th className="py-3.5 px-4 text-right">Session Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                        <span className="text-xs font-medium">Loading session activity...</span>
                      </div>
                    </td>
                  </tr>
                ) : pagedSessions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-1.5">
                        <Laptop className="w-8 h-8 text-slate-300" />
                        <span className="font-semibold text-slate-700">No login sessions found</span>
                        <span className="text-xs text-slate-400">
                          {searchTerm || statusFilter !== "ALL"
                            ? "Try adjusting your search or filters."
                            : "User logins will appear here in real time."}
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  pagedSessions.map((sess) => {
                    const isSelf = sess.id === currentUser?.id || sess.userId === currentUser?.id;
                    const canReject = sess.status === "ACTIVE" && !isSelf && sess.role !== "SUPER_ADMIN";
                    const isRejecting = rejectingSessionId === sess.id;

                    return (
                      <tr key={sess.id} className="hover:bg-slate-50/70 transition">
                        {/* Employee Name & Username */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-[10px] shrink-0 border border-slate-200">
                              {((sess.userName || sess.username || "US").slice(0, 2)).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 truncate">
                                {sess.userName || sess.username || "Unknown User"}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono truncate">
                                {sess.username || "—"}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                                SID: {(sess.id || "").slice(0, 8)}...
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Role */}
                        <td className="py-3.5 px-4">
                          {getRoleBadge(sess.role)}
                        </td>

                        {/* Login Date & Time */}
                        <td className="py-3.5 px-4 text-slate-700 font-medium">
                          {formatDateTime(sess.createdAt)}
                          {sess.ipAddress && (
                            <span className="block text-[10px] text-slate-400 font-mono mt-0.5">
                              IP: {sess.ipAddress}
                            </span>
                          )}
                        </td>

                        {/* Last Activity */}
                        <td className="py-3.5 px-4 text-slate-600 font-medium">
                          {formatDateTime(sess.lastActivityAt || sess.createdAt)}
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          {getStatusBadge(sess.status)}
                        </td>

                        {/* Rejection Details */}
                        <td className="py-3.5 px-4 text-slate-600">
                          {sess.status === "REJECTED" ? (
                            <div>
                              <span className="text-[11px] font-bold text-rose-700 block">
                                By: {sess.rejectedBy || "Super Admin"}
                              </span>
                              <span className="text-[10px] text-slate-400 block mt-0.5">
                                {formatDateTime(sess.rejectedAt)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>

                        {/* Actions (Rejection-Only: STRICTLY NO APPROVE BUTTON) */}
                        <td className="py-3.5 px-4 text-right">
                          {canReject ? (
                            <button
                              onClick={() => handleRejectSession(sess)}
                              disabled={isRejecting}
                              title="Immediately terminate this session and revoke application access"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 hover:text-rose-800 border border-rose-200 rounded-lg shadow-2xs transition disabled:opacity-50"
                            >
                              {isRejecting ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Terminating...</span>
                                </>
                              ) : (
                                <>
                                  <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                                  <span>Reject Session</span>
                                </>
                              )}
                            </button>
                          ) : sess.status === "REJECTED" ? (
                            <span className="text-[11px] font-bold text-rose-600/80 italic">
                              Terminated
                            </span>
                          ) : sess.role === "SUPER_ADMIN" ? (
                            <span className="text-[11px] font-medium text-slate-400">
                              Super Admin
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {filteredSessions.length > pageSize && (
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
              <div>
                Showing {(currentPage - 1) * pageSize + 1} to{" "}
                {Math.min(currentPage * pageSize, filteredSessions.length)} of{" "}
                {filteredSessions.length} sessions
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-bold">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
