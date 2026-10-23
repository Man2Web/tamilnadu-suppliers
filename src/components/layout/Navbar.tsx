"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Plus,
  Menu,
  X,
  LogOut,
  User,
  KeyRound,
  Shield,
  Settings,
  ChevronDown,
  Bell,
  LogIn,
  ShieldAlert,
  CheckCheck,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { ActivityNotification } from "@/lib/types";

interface NavbarProps {
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

export default function Navbar({ onToggleSidebar, isSidebarOpen }: NavbarProps) {
  const { currentUser, hasPermission, logout, isSuperAdmin } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Super Admin Notifications state
  const [notifications, setNotifications] = useState<ActivityNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [rejectingSessionId, setRejectingSessionId] = useState<string | null>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    if (!isSuperAdmin) return;
    try {
      const res = await fetch("/api/admin/notifications?limit=25", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.notifications)) {
          setNotifications(data.notifications);
          setUnreadCount(data.unreadCount || 0);
        }
      }
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    }
  }, [isSuperAdmin]);

  // Initial fetch and 10s polling for live notifications
  useEffect(() => {
    if (isSuperAdmin) {
      fetchNotifications();
      const interval = setInterval(() => {
        if (document.visibilityState === "visible") {
          fetchNotifications();
        }
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [isSuperAdmin, fetchNotifications]);

  // Close menus on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    }
    if (isMenuOpen || isNotificationsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen, isNotificationsOpen]);

  const markAllAsRead = async () => {
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        setUnreadCount(0);
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      }
    } catch (err) {
      console.error("Failed to mark notifications read:", err);
    }
  };

  const handleRejectSessionFromNotif = async (sessionId: string, empName: string) => {
    if (rejectingSessionId) return;
    const confirmPrompt = window.confirm(
      `Terminate session for ${empName}?\n\nThis will immediately disconnect the user and redirect them to the login screen.`
    );
    if (!confirmPrompt) return;

    setRejectingSessionId(sessionId);
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}/reject`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.sessionId === sessionId ? { ...n, isRejected: true } : n))
        );
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || "Failed to terminate session.");
      }
    } catch (err) {
      console.error("Failed to reject session:", err);
      alert("Network error: Unable to terminate session.");
    } finally {
      setRejectingSessionId(null);
    }
  };

  const initials = currentUser?.name
    ? currentUser.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "SA";

  const canManageAccounts = isSuperAdmin || currentUser?.role === "ADMIN" || hasPermission("users:manage");

  return (
    <header className="h-16 border-b border-slate-200 bg-white sticky top-0 z-30 px-3 sm:px-6 flex items-center justify-between gap-3 shrink-0">
      {/* Left: Mobile Hamburger Menu & Clean Application Identity */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Three-horizontal-line hamburger button: Strictly HIDDEN on laptops and desktops (lg:hidden) */}
        <button
          onClick={onToggleSidebar}
          aria-label="Toggle navigation menu"
          id="hamburger-menu-button"
          className="lg:hidden p-2 -ml-1 rounded-lg text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {isSidebarOpen ? (
            <X className="w-5 h-5 text-slate-700" />
          ) : (
            <Menu className="w-5 h-5 text-slate-700" />
          )}
        </button>

        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-xs shrink-0">
            TS
          </div>
          <div className="min-w-0">
            <span className="font-bold text-sm text-slate-900 tracking-tight leading-tight block truncate">
              Tamilnadu Suppliers
            </span>
            <span className="text-[10px] text-slate-500 font-medium block truncate">
              Rental Inventory & Billing
            </span>
          </div>
        </div>
      </div>

      {/* Right: Primary Actions & Compact Account Avatar Menu */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {hasPermission("quotations:create") && (
          <Link
            href="/quotations/create"
            className="flex items-center gap-1.5 text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-2xs transition"
          >
            <Plus className="w-3.5 h-3.5 text-indigo-600" />
            <span className="hidden sm:inline">New Quotation</span>
            <span className="sm:hidden">Quote</span>
          </Link>
        )}

        {hasPermission("bills:create") && (
          <Link
            href="/bills/create"
            className="flex items-center gap-1.5 text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Bill</span>
            <span className="sm:hidden">Bill</span>
          </Link>
        )}

        {/* Super Admin In-App Account Activity Notifications */}
        {isSuperAdmin && (
          <div className="relative" ref={notificationsRef}>
            <button
              onClick={() => {
                setIsNotificationsOpen((prev) => !prev);
                if (!isNotificationsOpen && unreadCount > 0) {
                  markAllAsRead();
                }
              }}
              aria-label="Account Activity Notifications"
              aria-expanded={isNotificationsOpen}
              className="relative p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <Bell className="w-5 h-5 text-slate-700" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white font-black text-[10px] flex items-center justify-center shadow-xs animate-in zoom-in">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {/* Notifications Popover */}
            {isNotificationsOpen && (
              <div
                id="notifications-popover"
                className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150"
              >
                {/* Popover Header */}
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-xs text-slate-900">
                      Login & Logout Activity
                    </span>
                    {unreadCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={fetchNotifications}
                      title="Refresh activity"
                      className="p-1 rounded-lg hover:bg-slate-200 text-slate-500 transition"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        title="Mark all as read"
                        className="p-1 rounded-lg hover:bg-slate-200 text-blue-600 font-semibold text-[11px] flex items-center gap-1 transition"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        Mark Read
                      </button>
                    )}
                  </div>
                </div>

                {/* Notifications List */}
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {notifications.length === 0 ? (
                    <div className="py-8 px-4 text-center text-xs text-slate-400">
                      No sign-in or sign-out activity recorded yet.
                    </div>
                  ) : (
                    notifications.map((notif) => {
                      const isSignIn = notif.type === "SIGN_IN";
                      return (
                        <div
                          key={notif.id}
                          className={`p-3 text-xs transition ${
                            notif.isRead ? "bg-white hover:bg-slate-50/70" : "bg-blue-50/30 hover:bg-blue-50/50"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2.5 min-w-0">
                              <div
                                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                                  isSignIn
                                    ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                                    : "bg-slate-100 text-slate-600 border border-slate-200"
                                }`}
                              >
                                {isSignIn ? <LogIn className="w-3.5 h-3.5" /> : <LogOut className="w-3.5 h-3.5" />}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-slate-900 truncate">
                                    {notif.userName}
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                                      notif.role === "ADMIN"
                                        ? "bg-blue-100 text-blue-700"
                                        : "bg-emerald-100 text-emerald-700"
                                    }`}
                                  >
                                    {notif.role}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 font-mono truncate">
                                  {notif.username}
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                                  <span>{new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                  <span>•</span>
                                  <span className="font-mono">SID: {notif.sessionId.slice(0, 6)}...</span>
                                </div>
                              </div>
                            </div>

                            {/* Rejection action (strictly rejection-only, NO APPROVE BUTTON) */}
                            {isSignIn && !notif.isRejected && (
                              <button
                                onClick={() => handleRejectSessionFromNotif(notif.sessionId, notif.userName)}
                                disabled={rejectingSessionId === notif.sessionId}
                                title="Terminate this login session"
                                className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-md bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition disabled:opacity-50"
                              >
                                {rejectingSessionId === notif.sessionId ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  "Reject"
                                )}
                              </button>
                            )}
                            {notif.isRejected && (
                              <span className="shrink-0 text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                                Terminated
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Popover Footer */}
                <div className="p-2.5 bg-slate-50 border-t border-slate-200 text-center">
                  <Link
                    href="/admin/sessions"
                    onClick={() => setIsNotificationsOpen(false)}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-700 hover:underline inline-flex items-center gap-1"
                  >
                    View All Login Activity & Sessions →
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Compact Super Admin / User Avatar Menu */}
        {currentUser && (
          <div className="relative pl-2 sm:pl-3 border-l border-slate-200" ref={menuRef}>
            <button
              onClick={() => setIsMenuOpen((prev) => !prev)}
              aria-expanded={isMenuOpen}
              aria-haspopup="true"
              id="avatar-menu-button"
              className="flex items-center gap-2 p-1 rounded-full md:rounded-xl hover:bg-slate-100 transition focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold shadow-xs transition ${
                  isSuperAdmin
                    ? "bg-purple-600 text-white ring-2 ring-purple-300"
                    : currentUser.role === "ADMIN"
                    ? "bg-blue-600 text-white ring-2 ring-blue-300"
                    : "bg-emerald-600 text-white ring-2 ring-emerald-300"
                }`}
              >
                {initials}
              </div>
              <div className="hidden md:flex flex-col text-left">
                <span className="text-xs font-semibold text-slate-900 leading-tight truncate max-w-[110px]">
                  {currentUser.name}
                </span>
                <span className="text-[10px] text-slate-500 font-medium leading-none">
                  {isSuperAdmin
                    ? "Super Admin"
                    : currentUser.role === "ADMIN"
                    ? "Administrator"
                    : "Billing Operator"}
                </span>
              </div>
              <ChevronDown className="hidden md:block w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* Dropdown Menu */}
            {isMenuOpen && (
              <div
                id="user-account-dropdown"
                role="menu"
                className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150"
              >
                {/* User info banner */}
                <div className="px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/70">
                  <div className="font-semibold text-xs text-slate-900 truncate">
                    {currentUser.name}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate mt-0.5">
                    {currentUser.email || currentUser.username}
                  </div>
                  <div className="mt-1.5">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        isSuperAdmin
                          ? "bg-purple-100 text-purple-700 border border-purple-200"
                          : currentUser.role === "ADMIN"
                          ? "bg-blue-100 text-blue-700 border border-blue-200"
                          : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                      }`}
                    >
                      {isSuperAdmin
                        ? "SUPER ADMIN"
                        : currentUser.role === "ADMIN"
                        ? "ADMIN"
                        : "BILLING OPERATOR"}
                    </span>
                  </div>
                </div>

                {/* Menu items */}
                <div className="py-1">
                  <Link
                    href="/my-account"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
                  >
                    <User className="w-4 h-4 text-slate-500" />
                    <span>My Account</span>
                  </Link>

                  <Link
                    href="/my-account"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
                  >
                    <Settings className="w-4 h-4 text-slate-500" />
                    <span>Account Details</span>
                  </Link>

                  <Link
                    href="/change-password"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
                  >
                    <KeyRound className="w-4 h-4 text-slate-500" />
                    <span>Change Password</span>
                  </Link>

                  {canManageAccounts && (
                    <Link
                      href="/admin/users"
                      onClick={() => setIsMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition"
                    >
                      <Shield className="w-4 h-4 text-purple-600" />
                      <span>Account Management</span>
                    </Link>
                  )}
                </div>

                {/* Sign Out Action inside Avatar Menu */}
                <div className="border-t border-slate-100 pt-1 mt-1">
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      logout();
                    }}
                    id="menu-logout-button"
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition text-left"
                  >
                    <LogOut className="w-4 h-4 text-rose-500" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
