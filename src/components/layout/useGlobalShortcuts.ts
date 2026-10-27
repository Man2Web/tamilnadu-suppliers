"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { ModulePermissionId } from "@/lib/types/permissions";

export interface AppShortcut {
  key: string;
  label: string;
  href: string;
  permission: ModulePermissionId;
}

// Routes are the same ones the sidebar and list pages link to.
export const APP_SHORTCUTS: AppShortcut[] = [
  { key: "b", label: "New Bill", href: "/bills/create", permission: "bills:create" },
  { key: "q", label: "New Quotation", href: "/quotations/create", permission: "quotations:create" },
  { key: "c", label: "Customer Master", href: "/customers", permission: "customers:view" },
];

export function shortcutHint(key: string): string {
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || "");
  return `${isMac ? "⌘" : "Ctrl+"}${key.toUpperCase()}`;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  return Boolean(el.closest?.('[contenteditable="true"],[role="combobox"],[role="textbox"],[role="searchbox"]'));
}

function isDialogOpen(): boolean {
  return Boolean(
    document.querySelector('[role="dialog"],[aria-modal="true"]') ||
      Array.from(document.querySelectorAll<HTMLElement>(".fixed.inset-0")).some(
        (el) => el.getAttribute("aria-label") !== "Close sidebar backdrop" && el.offsetParent !== null
      )
  );
}

/**
 * Ctrl/Cmd + B / Q / C navigation. Mounted once (in AppShell). Does nothing while typing, while a dialog is open,
 * or when the user lacks the permission for the target page. Ctrl/Cmd+C is left to the browser whenever text is selected,
 * so copying still works.
 */
export function useGlobalShortcuts() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const permRef = useRef(hasPermission);
  useEffect(() => {
    permRef.current = hasPermission;
  }, [hasPermission]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.altKey || e.shiftKey) return;
      if (!(e.ctrlKey || e.metaKey) || (e.ctrlKey && e.metaKey)) return;
      const shortcut = APP_SHORTCUTS.find((s) => s.key === e.key.toLowerCase());
      if (!shortcut) return;
      if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;
      if (isDialogOpen()) return;
      if (e.key.toLowerCase() === "c" && String(window.getSelection?.() || "").length > 0) return; // keep native copy
      if (!permRef.current(shortcut.permission)) return;
      e.preventDefault();
      router.push(shortcut.href);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);
}
