"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

export interface SearchableOption {
  value: string;
  label: string;
  /** Extra text that also matches the search (mobile number, size, code ...) */
  searchText?: string;
  /** Secondary line shown under the label */
  hint?: string;
}

interface SearchableSelectProps {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  required?: boolean;
  disabled?: boolean;
  /** Offer a "clear selection" row/button (for optional fields) */
  clearLabel?: string;
  className?: string;
  ariaLabel?: string;
}

const MAX_VISIBLE = 100; // keeps very large lists responsive; the search narrows them

/**
 * A select with a search box inside the open list. Filters as you type (case-insensitive, partial match on the label,
 * hint and extra search text), supports Arrow/Enter/Escape, keeps the chosen value, and works inside scrolling tables.
 */
export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "-- Select --",
  searchPlaceholder = "Type to search...",
  emptyText = "No matches found",
  required,
  disabled,
  clearLabel,
  className = "",
  ariaLabel,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return options;
    return options.filter((o) => {
      const haystack = `${o.label} ${o.hint || ""} ${o.searchText || ""}`.toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });
  }, [options, query]);
  const visible = filtered.slice(0, MAX_VISIBLE);

  const openPopup = () => {
    if (disabled) return;
    const r = buttonRef.current?.getBoundingClientRect();
    if (r) {
      const spaceBelow = window.innerHeight - r.bottom;
      setRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 260), up: spaceBelow < 280 && r.top > spaceBelow });
    }
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const choose = (v: string) => {
    onChange(v);
    close();
  };

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popupRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScrollOrResize = (e: Event) => {
      if (popupRef.current && e.target instanceof Node && popupRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(visible.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault(); // never submit the surrounding form from the search box
      const opt = visible[active];
      if (opt) choose(opt.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? close(false) : openPopup())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            openPopup();
          }
        }}
        className="w-full flex items-center justify-between gap-2 bg-white border border-slate-300 rounded-lg px-3 py-2 text-left text-slate-900 disabled:opacity-60 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <span className={`truncate ${selected ? "" : "text-slate-400"}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>

      {/* Lets the browser's required-field check work with a custom control */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          value={value}
          onChange={() => undefined}
          onFocus={() => buttonRef.current?.focus()}
          className="absolute inset-x-0 bottom-0 h-px w-full opacity-0 pointer-events-none"
        />
      )}

      {open && rect && (
        <div
          ref={popupRef}
          style={{
            position: "fixed",
            left: rect.left,
            width: rect.width,
            ...(rect.up ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.top }),
            zIndex: 1000,
          }}
          className="bg-white border border-slate-300 rounded-lg shadow-xl text-xs"
        >
          <div className="flex items-center gap-2 px-2.5 py-2 border-b border-slate-200">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              ref={searchRef}
              type="text"
              role="searchbox"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onSearchKey}
              placeholder={searchPlaceholder}
              aria-controls={listId}
              className="w-full bg-transparent outline-none text-slate-900 placeholder:text-slate-400"
            />
            {query && (
              <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="text-slate-400 hover:text-slate-700">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <ul ref={listRef} id={listId} role="listbox" className="max-h-60 overflow-y-auto py-1">
            {clearLabel && !query && (
              <li
                role="option"
                aria-selected={value === ""}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose("")}
                className="px-3 py-1.5 cursor-pointer text-slate-500 hover:bg-slate-100"
              >
                {clearLabel}
              </li>
            )}
            {visible.length === 0 ? (
              <li className="px-3 py-3 text-center text-slate-500">{emptyText}</li>
            ) : (
              visible.map((o, i) => (
                <li
                  key={o.value}
                  data-idx={i}
                  role="option"
                  aria-selected={o.value === value}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(o.value)}
                  className={`px-3 py-1.5 cursor-pointer ${i === active ? "bg-blue-50" : ""} ${
                    o.value === value ? "font-semibold text-blue-700" : "text-slate-800"
                  }`}
                >
                  <div className="truncate">{o.label}</div>
                  {o.hint && <div className="text-[10px] text-slate-500 truncate">{o.hint}</div>}
                </li>
              ))
            )}
            {filtered.length > MAX_VISIBLE && (
              <li className="px-3 py-1.5 text-center text-[10px] text-slate-400">
                Showing first {MAX_VISIBLE} of {filtered.length} - keep typing to narrow the list
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
