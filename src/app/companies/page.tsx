"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Edit2,
  Trash2,
  Plus,
  Landmark,
  FileText,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Power,
} from "lucide-react";
import { Company } from "@/lib/types";
import { useAuth } from "@/lib/auth/AuthContext";
import { isGstRegistered } from "@/lib/calculations/financial";

export default function CompaniesPage() {
  const { currentUser, isSuperAdmin, hasPermission, fetchWithAuth } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertMessage, setAlertMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const loadCompanies = () => {
    setLoading(true);
    fetch("/api/companies")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setCompanies(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadCompanies();
  }, []);

  const showAlert = (text: string, type: "success" | "error") => {
    setAlertMessage({ text, type });
    setTimeout(() => setAlertMessage(null), 6000);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) return;

    try {
      const res = await fetchWithAuth(`/api/companies?id=${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        showAlert("Company deleted successfully.", "success");
        loadCompanies();
      } else {
        showAlert(data.error || "Failed to delete company.", "error");
      }
    } catch (e: any) {
      showAlert(e.message, "error");
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const res = await fetchWithAuth(`/api/companies`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, isActive: !currentActive }),
      });
      const data = await res.json();
      if (res.ok) {
        showAlert(
          `Company ${!currentActive ? "activated" : "deactivated"} successfully.`,
          "success"
        );
        loadCompanies();
      } else {
        showAlert(data.error || "Failed to update company status.", "error");
      }
    } catch (e: any) {
      showAlert(e.message, "error");
    }
  };

  // Permission Guard: companies:manage
  if (!isSuperAdmin && !hasPermission("companies:manage")) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4">
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-8 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-amber-900">Access Denied: Super Admin Permission Required</h2>
          <p className="text-sm text-amber-800 max-w-lg mx-auto">
            Company Management is restricted to the Super Administrator or accounts explicitly granted the <strong>Manage Companies</strong> permission.
            Your current account (<strong>{currentUser?.name || "User"}</strong>, role: {currentUser?.role || "GUEST"}) does not have access.
          </p>
          <p className="text-xs text-amber-700 font-medium">
            Switch to the Super Admin account via the active user switcher in the sidebar to configure issuing companies.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto bg-white pb-12">
      {/* Alert Banner */}
      {alertMessage && (
        <div
          className={`p-4 rounded-lg flex items-center justify-between text-xs font-semibold shadow-xs ${
            alertMessage.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-300"
              : "bg-red-50 text-red-800 border border-red-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {alertMessage.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{alertMessage.text}</span>
          </div>
          <button
            onClick={() => setAlertMessage(null)}
            className="text-slate-400 hover:text-slate-600 font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header & Role Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-6 h-6 text-blue-600" />
              Company Management
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-blue-600" />
              Super Admin Only
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Configure issuing companies, toggle GST registration, manage bank profiles, and oversee document numbering. Historical quotations and bills preserve original issuing snapshots.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <Link
            href="/companies/new"
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            <span>Add Company</span>
          </Link>
        </div>
      </div>

      {/* List of Companies */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-500 font-medium">Loading companies...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {companies.map((c) => (
            <div
              key={c.id}
              className={`bg-white rounded-xl p-5 border shadow-xs space-y-4 transition ${
                c.isActive ? "border-slate-200" : "border-slate-200 bg-slate-50/50 opacity-75"
              } border-t-4 ${
                isGstRegistered(c.gstType) ? "border-t-emerald-600" : "border-t-amber-500"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-bold text-slate-900">{c.displayName}</h2>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isGstRegistered(c.gstType)
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}
                    >
                      {isGstRegistered(c.gstType) ? "GST Registered" : "Non-GST"}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        c.isActive
                          ? "bg-slate-100 text-slate-700 border border-slate-200"
                          : "bg-red-50 text-red-700 border border-red-200"
                      }`}
                    >
                      {c.isActive ? "Active" : "Deactivated"}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-slate-600 mt-0.5">{c.name}</div>
                </div>

                <div className="flex items-center gap-1.5">
                  <Link
                    href={`/companies/${c.id}/edit`}
                    className="p-1.5 rounded-md hover:bg-slate-100 text-blue-600 transition"
                    title="Edit Company"
                  >
                    <Edit2 className="w-4 h-4" />
                  </Link>
                  <button
                    onClick={() => handleToggleActive(c.id, c.isActive)}
                    className={`p-1.5 rounded-md transition ${
                      c.isActive ? "text-amber-600 hover:bg-amber-50" : "text-emerald-600 hover:bg-emerald-50"
                    }`}
                    title={c.isActive ? "Deactivate Company" : "Activate Company"}
                  >
                    <Power className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(c.id, c.displayName)}
                    className="p-1.5 rounded-md hover:bg-red-50 text-red-600 transition"
                    title="Delete Company"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="text-xs text-slate-600 space-y-1">
                <div>📍 {c.address}</div>
                <div className="flex gap-4">
                  <span>📞 {c.phone || "Not set"}</span>
                  <span>✉️ {c.email || "Not set"}</span>
                </div>
              </div>

              {/* GST & Tax treatment */}
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">GST Registration:</span>
                  <span className="font-semibold text-slate-900">
                    {isGstRegistered(c.gstType) ? "GST Registered (18% Tax Rate)" : "Non-GST Registered"}
                  </span>
                </div>
                {isGstRegistered(c.gstType) && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">GSTIN:</span>
                    <span className="font-mono text-slate-900 font-semibold">{c.gstin || "Not specified"}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">State / Code:</span>
                  <span className="text-slate-900">{c.state} ({c.stateCode})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Default Place of Supply:</span>
                  <span className="text-slate-900">{c.placeOfSupply}</span>
                </div>
              </div>

              {/* Bank details & Numbering */}
              <div className="grid grid-cols-2 gap-3 text-[11px] pt-2 border-t border-slate-100">
                <div className="space-y-0.5">
                  <div className="text-slate-500 font-bold uppercase flex items-center gap-1">
                    <Landmark className="w-3 h-3 text-blue-600" /> Bank Details
                  </div>
                  <div className="text-slate-900 font-semibold">{c.bankName}</div>
                  <div className="font-mono text-slate-600">A/C: {c.bankAccountNo}</div>
                  <div className="font-mono text-slate-600">IFSC: {c.bankIfsc}</div>
                </div>

                <div className="space-y-0.5">
                  <div className="text-slate-500 font-bold uppercase flex items-center gap-1">
                    <FileText className="w-3 h-3 text-indigo-600" /> Sequential Numbering
                  </div>
                  <div className="text-slate-700">Inv: <code className="text-blue-700 font-bold">{c.invoicePrefix}</code> (#{c.nextInvoiceNo})</div>
                  <div className="text-slate-700">Quote: <code className="text-indigo-700 font-bold">{c.quotationPrefix}</code> (#{c.nextQuotationNo})</div>
                  <div className="text-slate-700">Gate Pass: <code className="text-emerald-700 font-bold">{c.gatePassPrefix}</code> (#{c.nextGatePassNo})</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
