"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { User, UserRole } from "@/lib/types";
import { ModulePermissionId, checkUserPermission } from "@/lib/types/permissions";

interface AuthContextType {
  currentUser: User | null;
  users: User[];
  loading: boolean;
  setCurrentUser: (user: User | null) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshUsers: () => Promise<void>;
  hasPermission: (permission: ModulePermissionId | string) => boolean;
  hasAnyPermission: (permissions: (ModulePermissionId | string)[]) => boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isBilling: boolean;
  fetchWithAuth: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [currentUser, setCurrentUserState] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const isLoggingOutRef = useRef(false);
  const isFetchingSessionRef = useRef(false);

  // Directly set authenticated user state (e.g. after fast client-side login)
  const setCurrentUser = useCallback((user: User | null) => {
    setCurrentUserState(user);
    setLoading(false);
  }, []);

  // Load current authenticated user session from server-side HttpOnly cookie
  const refreshUser = useCallback(async () => {
    if (isFetchingSessionRef.current) return;
    isFetchingSessionRef.current = true;
    try {
      const res = await fetch("/api/auth/me", {
        headers: { "Cache-Control": "no-cache" },
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          setCurrentUserState(data.user);
        } else {
          setCurrentUserState(null);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setCurrentUserState(null);
        if (data.isSessionRejected || data.code === "SESSION_REJECTED") {
          router.replace("/login?error=session_rejected");
        }
      }
    } catch (err) {
      console.error("Failed to fetch session:", err);
      setCurrentUserState(null);
    } finally {
      isFetchingSessionRef.current = false;
      setLoading(false);
    }
  }, [router]);

  // Fetch full user list on-demand (strictly on Account Management screen, not eagerly on all pages)
  const refreshUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/users", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setUsers(data);
        }
      }
    } catch (err) {
      console.error("Failed to load user list:", err);
    }
  }, []);

  useEffect(() => {
    refreshUser();
    // Heartbeat check every 12 seconds to instantly detect session termination by Super Admin
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshUser();
      }
    }, 12000);
    return () => clearInterval(interval);
  }, [refreshUser]);

  // Fast, debounced client-side logout without cold browser reload
  const logout = useCallback(async () => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;

    try {
      // Optimistically clear local state immediately
      setCurrentUserState(null);
      setUsers([]);

      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("Logout request failed:", err);
    } finally {
      isLoggingOutRef.current = false;
      router.replace("/login");
      router.refresh();
    }
  }, [router]);

  const hasPermission = useCallback(
    (permission: ModulePermissionId | string): boolean => {
      if (!currentUser || currentUser.status !== "ACTIVE") return false;
      if (currentUser.role === "SUPER_ADMIN") return true;
      return checkUserPermission(currentUser, permission);
    },
    [currentUser]
  );

  const hasAnyPermission = useCallback(
    (permissions: (ModulePermissionId | string)[]): boolean => {
      if (!currentUser || currentUser.status !== "ACTIVE") return false;
      if (currentUser.role === "SUPER_ADMIN") return true;
      return permissions.some((p) => hasPermission(p));
    },
    [currentUser, hasPermission]
  );

  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN" && currentUser?.status === "ACTIVE";
  const isAdmin =
    (currentUser?.role === "ADMIN" || currentUser?.role === "SUPER_ADMIN") &&
    currentUser?.status === "ACTIVE";
  const isBilling = currentUser?.role === "BILLING" && currentUser?.status === "ACTIVE";

  const fetchWithAuth = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const res = await fetch(input, {
        ...init,
        credentials: "include",
      });

      if (res.status === 401) {
        try {
          const clone = res.clone();
          const data = await clone.json();
          if (data?.isSessionRejected || data?.code === "SESSION_REJECTED") {
            setCurrentUserState(null);
            router.replace("/login?error=session_rejected");
          }
        } catch {
          // ignore non-json
        }
      }

      return res;
    },
    [router]
  );

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        users,
        loading,
        setCurrentUser,
        logout,
        refreshUser,
        refreshUsers,
        hasPermission,
        hasAnyPermission,
        isSuperAdmin,
        isAdmin,
        isBilling,
        fetchWithAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function PermissionGate({
  permission,
  children,
  fallback = null,
}: {
  permission: ModulePermissionId | string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { hasPermission } = useAuth();
  if (!hasPermission(permission)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
}
