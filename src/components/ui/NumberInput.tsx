"use client";

import React, { useState } from "react";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "step" | "min"> & {
  value: number | string | null | undefined;
  /** Receives an event-like object whose target.value is the clean numeric string ("1234.5", never "1,234.50" or "Rs") */
  onChange: (e: { target: { value: string } }) => void;
  /** "0.01" or "any" allows two decimals (money); otherwise whole numbers only, like a native number input */
  step?: string | number;
  min?: string | number;
};

/** "1234.5" -> "1,234.50" (Indian grouping). Display only - the stored/edited value is always the plain number. */
export function formatNumberDisplay(raw: string, decimals: number): string {
  if (raw === "" || raw === "-" || raw === ".") return raw;
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Numeric text input. While focused it shows the plain number so typing, deleting and pasting behave normally; when it
 * loses focus it shows Indian digit grouping (1,23,456.00). Pasted text with commas or a rupee sign is cleaned.
 * Drop-in for <input type="number"> in the billing and quotation forms.
 */
export default function NumberInput({ value, onChange, step, min, className, onFocus, onBlur, ...rest }: Props) {
  const decimals = step === "0.01" || step === 0.01 || step === "any" ? 2 : 0;
  const allowNegative = min !== undefined && Number(min) < 0;
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");

  const plain = value === null || value === undefined || value === "" ? "" : String(value);

  const sanitize = (text: string): string => {
    let t = text.replace(/[^0-9.\-]/g, "");
    if (!allowNegative) t = t.replace(/-/g, "");
    else t = t.replace(/(?!^)-/g, "");
    const dot = t.indexOf(".");
    if (decimals === 0) return dot >= 0 ? t.slice(0, dot) : t;
    if (dot >= 0) t = t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, "").slice(0, decimals);
    return t;
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode={decimals ? "decimal" : "numeric"}
      autoComplete="off"
      className={className}
      value={focused ? draft : formatNumberDisplay(plain, plain === "" ? 0 : decimals)}
      onFocus={(e) => {
        setDraft(plain);
        setFocused(true);
        onFocus?.(e);
        // select the number so typing replaces it, as with the old number input
        const el = e.currentTarget;
        requestAnimationFrame(() => el.select());
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      onChange={(e) => {
        const clean = sanitize(e.target.value);
        setDraft(clean);
        onChange({ target: { value: clean } });
      }}
    />
  );
}
