"use client";

import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, UploadCloud, XCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import type { RecordsPreview } from "@/lib/excel/records-importer";

interface CompanyOption {
  id: string;
  name: string;
  displayName?: string;
}

interface ImportResult {
  customersCreated: number;
  productsCreated: number;
  productsUpdated: number;
  billsCreated: number;
  paymentsCreated: number;
  skipped: number;
  failures: Array<{ kind: string; ref: string; error: string }>;
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ImportRecordsPage() {
  const { fetchWithAuth, hasPermission } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "execute">("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RecordsPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    fetchWithAuth("/api/companies")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const list: CompanyOption[] = Array.isArray(d) ? d : d?.companies || [];
        setCompanies(list);
        if (list.length === 1) setCompanyId(list[0].id);
      })
      .catch(() => setCompanies([]));
  }, [fetchWithAuth]);

  const submit = async (action: "preview" | "execute") => {
    if (!file) return;
    setBusy(action);
    setError(null);
    if (action === "preview") {
      setResult(null);
      setPreview(null);
    }
    try {
      const form = new FormData();
      form.set("action", action);
      form.set("file", file);
      if (companyId) form.set("defaultCompanyId", companyId);
      const res = await fetchWithAuth("/api/records/import", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `The server answered with HTTP ${res.status}.`);
        if (data.preview) setPreview(data.preview);
        return;
      }
      if (action === "preview") setPreview(data.preview);
      else {
        setResult(data.result);
        setPreview(null);
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
      }
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy("");
    }
  };

  if (!hasPermission("bills:create")) {
    return <p className="text-sm text-slate-500">You do not have permission to import records.</p>;
  }

  const s = preview?.summary;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Import Older Records</h1>
        <p className="text-sm text-slate-500 mt-1">
          Upload an Excel file with old customers, bills with their payments, or product updates. You see a full preview
          first; nothing is saved until you confirm.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 bg-white border border-slate-200 rounded-xl p-5">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-800">1. Get the template</p>
          <a
            href="/api/records/import"
            className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            <Download className="w-4 h-4" /> Download Excel template
          </a>
          <p className="text-xs text-slate-500">Sheets: Customers, Bills (one row per item), Payments, Products.</p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-800">2. Choose company and file</p>
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white"
            aria-label="Default company for bills without a Company column"
          >
            <option value="">Default company for bills (optional)</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName || c.name}
              </option>
            ))}
          </select>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setPreview(null);
              setResult(null);
              setError(null);
            }}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-blue-700"
          />
          <button
            onClick={() => submit("preview")}
            disabled={!file || busy !== ""}
            className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50"
          >
            {busy === "preview" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            Check file
          </button>
        </div>
      </div>

      {error && (
        <div className="flex gap-2 items-start text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg p-3">
          <XCircle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-2">
          <p className="flex items-center gap-2 font-semibold text-green-800">
            <CheckCircle2 className="w-5 h-5" /> Import finished
          </p>
          <ul className="text-sm text-green-900 grid sm:grid-cols-3 gap-x-6 gap-y-1">
            <li>Bills created: <b>{result.billsCreated}</b></li>
            <li>Payments created: <b>{result.paymentsCreated}</b></li>
            <li>Customers created: <b>{result.customersCreated}</b></li>
            <li>Products created: <b>{result.productsCreated}</b></li>
            <li>Products updated: <b>{result.productsUpdated}</b></li>
            <li>Skipped: <b>{result.skipped}</b></li>
          </ul>
          {result.failures.length > 0 && (
            <div className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="font-semibold">{result.failures.length} record(s) could not be saved:</p>
              <ul className="list-disc ml-5">
                {result.failures.map((f, i) => (
                  <li key={i}>{f.kind} {f.ref}: {f.error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {preview && s && (
        <div className="space-y-4">
          {preview.fatalErrors.map((m, i) => (
            <div key={i} className="flex gap-2 items-start text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg p-3">
              <XCircle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{m}</span>
            </div>
          ))}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ["Bills to import", s.billsToCreate],
              ["Payments", s.paymentsToCreate],
              ["Customers to add", s.customersToCreate],
              ["Products add/update", s.productsToCreate + s.productsToUpdate],
              ["Skipped (already there)", s.billsSkipped + s.customersSkipped],
              ["Rows with errors", s.rowsWithErrors],
              ["Rows with warnings", s.rowsWithWarnings],
            ].map(([label, value]) => (
              <div key={label as string} className="bg-white border border-slate-200 rounded-lg p-3">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-lg font-bold text-slate-900">{value}</p>
              </div>
            ))}
          </div>

          {preview.bills.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="text-left p-3">Bill</th>
                    <th className="text-left p-3">Date</th>
                    <th className="text-left p-3">Customer</th>
                    <th className="text-right p-3">Items</th>
                    <th className="text-right p-3">Total</th>
                    <th className="text-right p-3">Paid</th>
                    <th className="text-left p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.bills.slice(0, 200).map((b, i) => (
                    <tr key={`${b.billNumber}-${i}`} className="border-t border-slate-100 align-top">
                      <td className="p-3 font-mono text-xs">{b.billNumber || `row ${b.rows[0]}`}</td>
                      <td className="p-3">{b.billDate || "—"}</td>
                      <td className="p-3">{b.customerName || "—"}</td>
                      <td className="p-3 text-right">{b.items.length}</td>
                      <td className="p-3 text-right">{inr(b.computedGrandTotal)}</td>
                      <td className="p-3 text-right">{inr(b.totalPaid)}</td>
                      <td className="p-3 space-y-1">
                        {b.errors.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-red-700 font-semibold"><XCircle className="w-4 h-4" /> Error</span>
                        ) : b.action === "skip" ? (
                          <span className="text-slate-500 font-semibold">Skipped</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-green-700 font-semibold"><CheckCircle2 className="w-4 h-4" /> Ready</span>
                        )}
                        {[...b.errors, ...b.payments.flatMap((p) => p.errors)].map((m, j) => (
                          <p key={`e${j}`} className="text-xs text-red-700">{m}</p>
                        ))}
                        {b.warnings.map((m, j) => (
                          <p key={`w${j}`} className="text-xs text-amber-700 flex gap-1"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{m}</p>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.bills.length > 200 && <p className="text-xs text-slate-500 p-3">Showing the first 200 of {preview.bills.length} bills.</p>}
            </div>
          )}

          {[...preview.customers.filter((c) => c.errors.length || c.warnings.length), ...preview.products.filter((p) => p.errors.length || p.warnings.length)].length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
              <p className="text-sm font-semibold text-slate-800">Customer and product notes</p>
              {preview.customers.filter((c) => c.errors.length || c.warnings.length).slice(0, 100).map((c) => (
                <p key={`c${c.row}`} className="text-xs">
                  <b>Customers row {c.row}</b> ({c.name || "no name"}): <span className="text-red-700">{c.errors.join(" ")}</span> <span className="text-amber-700">{c.warnings.join(" ")}</span>
                </p>
              ))}
              {preview.products.filter((p) => p.errors.length || p.warnings.length).slice(0, 100).map((p) => (
                <p key={`p${p.row}`} className="text-xs">
                  <b>Products row {p.row}</b> ({p.name || "no name"}): <span className="text-red-700">{p.errors.join(" ")}</span> <span className="text-amber-700">{p.warnings.join(" ")}</span>
                </p>
              ))}
            </div>
          )}

          {preview.orphanPayments.length > 0 && (
            <div className="bg-white border border-red-200 rounded-xl p-4 space-y-1">
              <p className="text-sm font-semibold text-red-800">Payments that cannot be attached</p>
              {preview.orphanPayments.map((p) => (
                <p key={p.row} className="text-xs text-red-700">Payments row {p.row}: {p.errors.join(" ")}</p>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => submit("execute")}
              disabled={!s.importable || busy !== ""}
              className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-lg bg-green-600 text-white disabled:opacity-50"
            >
              {busy === "execute" ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
              Import {s.billsToCreate + s.customersToCreate + s.productsToCreate + s.productsToUpdate} records
            </button>
            <p className="text-xs text-slate-500">
              Rows with errors and records that already exist are skipped. Imported bills never change stock.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
