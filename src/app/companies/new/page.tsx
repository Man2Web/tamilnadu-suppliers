"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  ArrowLeft,
  Save,
  ShieldCheck,
  Landmark,
  FileText,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Company, GstType } from "@/lib/types";
import { useAuth } from "@/lib/auth/AuthContext";

export default function NewCompanyPage() {
  const router = useRouter();
  const { currentUser, isSuperAdmin, hasPermission, fetchWithAuth } = useAuth();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [company, setCompany] = useState<Partial<Company>>({
    name: "",
    displayName: "",
    gstType: "GST_REGISTERED",
    gstin: "",
    pan: "",
    email: "",
    phone: "",
    address: "",
    state: "Tamil Nadu",
    stateCode: "33",
    placeOfSupply: "Vellore",
    bankName: "City Union Bank",
    bankAccountNo: "",
    bankIfsc: "",
    bankBranch: "Vellore Branch",
    invoicePrefix: "TNS-",
    quotationPrefix: "TNQ-",
    gatePassPrefix: "TNGP-",
    termsAndConditions: "Subject to Vellore Jurisdiction. Breakage must be compensated as per actuals.",
    authorizedSignatoryTitle: "Authorised Signatory",
    logoUrl: "",
    isActive: true,
  });

  const handleChange = (field: keyof Company, value: any) => {
    setCompany((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company.name || !company.displayName) {
      setError("Company legal name and display name are required.");
      return;
    }
    if (company.gstType === "GST_REGISTERED" && !company.gstin) {
      setError("GSTIN is required for GST Registered entities.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetchWithAuth("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(company),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create company");

      router.push("/companies");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isSuperAdmin && !hasPermission("companies:manage")) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4 text-center">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8">
          <h2 className="text-lg font-bold text-amber-900">Access Restricted</h2>
          <p className="text-sm text-amber-700 mt-2">
            Super Admin or Company Management privileges are required to create new issuing companies.
          </p>
          <Link
            href="/companies"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Companies
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
            href="/companies"
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-6 h-6 text-blue-600" />
              Add Issuing Company
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Create a dedicated billing profile for issuing rental quotations, tax invoices, and receipts.
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
          <span>{saving ? "Creating Company..." : "Save Company"}</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2 font-medium">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Basic Identity & GST Registration */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            1. Legal Entity & GST Registration
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Company Legal Name *</label>
              <input
                type="text"
                required
                value={company.name || ""}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="e.g. Tamilnadu Suppliers Private Limited"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Display / Trade Name *</label>
              <input
                type="text"
                required
                value={company.displayName || ""}
                onChange={(e) => handleChange("displayName", e.target.value)}
                placeholder="e.g. Tamilnadu Suppliers"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">GST Registration Status *</label>
              <select
                value={company.gstType || "GST_REGISTERED"}
                onChange={(e) => handleChange("gstType", e.target.value as GstType)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="GST_REGISTERED">GST Registered (Tax Invoices with CGST/SGST/IGST)</option>
                <option value="NON_GST">Non-GST Entity (Bill of Supply / Delivery Challan)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                GSTIN {company.gstType === "GST_REGISTERED" && <span className="text-rose-600">*</span>}
              </label>
              <input
                type="text"
                required={company.gstType === "GST_REGISTERED"}
                value={company.gstin || ""}
                onChange={(e) => handleChange("gstin", e.target.value.toUpperCase())}
                placeholder="e.g. 33AAAAA0000A1Z5"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-mono uppercase text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">PAN Number</label>
              <input
                type="text"
                value={company.pan || ""}
                onChange={(e) => handleChange("pan", e.target.value.toUpperCase())}
                placeholder="e.g. AAAAA0000A"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-mono uppercase text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Company Logo URL</label>
              <input
                type="text"
                value={company.logoUrl || ""}
                onChange={(e) => handleChange("logoUrl", e.target.value)}
                placeholder="https://... or /logo.png"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Contact & Operating Address */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-blue-600" />
            2. Contact & Registered Address
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Official Email Address</label>
              <input
                type="email"
                value={company.email || ""}
                onChange={(e) => handleChange("email", e.target.value)}
                placeholder="billing@tamilnadusuppliers.com"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Contact Phone / Mobile</label>
              <input
                type="text"
                value={company.phone || ""}
                onChange={(e) => handleChange("phone", e.target.value)}
                placeholder="+91 94432 00000"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-slate-700 font-semibold mb-1">Complete Address</label>
              <textarea
                rows={2}
                value={company.address || ""}
                onChange={(e) => handleChange("address", e.target.value)}
                placeholder="Door No, Street Name, Landmark, City, State - PIN"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">State</label>
              <input
                type="text"
                value={company.state || "Tamil Nadu"}
                onChange={(e) => handleChange("state", e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">State Code</label>
                <input
                  type="text"
                  value={company.stateCode || "33"}
                  onChange={(e) => handleChange("stateCode", e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Place of Supply</label>
                <input
                  type="text"
                  value={company.placeOfSupply || "Vellore"}
                  onChange={(e) => handleChange("placeOfSupply", e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Banking & Prefixes */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Landmark className="w-4 h-4 text-blue-600" />
            3. Banking Details & Document Numbering
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Bank Name</label>
              <input
                type="text"
                value={company.bankName || ""}
                onChange={(e) => handleChange("bankName", e.target.value)}
                placeholder="e.g. City Union Bank"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Bank Account Number</label>
              <input
                type="text"
                value={company.bankAccountNo || ""}
                onChange={(e) => handleChange("bankAccountNo", e.target.value)}
                placeholder="e.g. 500101011234567"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">IFSC Code</label>
              <input
                type="text"
                value={company.bankIfsc || ""}
                onChange={(e) => handleChange("bankIfsc", e.target.value.toUpperCase())}
                placeholder="e.g. CIUB0000123"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-mono uppercase text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Bank Branch</label>
              <input
                type="text"
                value={company.bankBranch || ""}
                onChange={(e) => handleChange("bankBranch", e.target.value)}
                placeholder="e.g. Vellore Main Branch"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="md:col-span-2 pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Invoice Prefix</label>
                <input
                  type="text"
                  value={company.invoicePrefix || "TNS-"}
                  onChange={(e) => handleChange("invoicePrefix", e.target.value)}
                  placeholder="e.g. TNS-"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Quotation Prefix</label>
                <input
                  type="text"
                  value={company.quotationPrefix || "TNQ-"}
                  onChange={(e) => handleChange("quotationPrefix", e.target.value)}
                  placeholder="e.g. TNQ-"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Gate Pass Prefix</label>
                <input
                  type="text"
                  value={company.gatePassPrefix || "TNGP-"}
                  onChange={(e) => handleChange("gatePassPrefix", e.target.value)}
                  placeholder="e.g. TNGP-"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Terms & Signatory */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-blue-600" />
            4. Terms, Legal Declarations & Signatory
          </h2>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Standard Terms & Conditions</label>
              <textarea
                rows={3}
                value={company.termsAndConditions || ""}
                onChange={(e) => handleChange("termsAndConditions", e.target.value)}
                placeholder="Jurisdiction, payment terms, loss and damage liability clauses..."
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Authorized Signatory Title</label>
              <input
                type="text"
                value={company.authorizedSignatoryTitle || "Authorised Signatory"}
                onChange={(e) => handleChange("authorizedSignatoryTitle", e.target.value)}
                placeholder="Authorised Signatory / Managing Partner"
                className="w-full max-w-sm bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200">
          <Link
            href="/companies"
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
            <span>{saving ? "Creating Company..." : "Save Company"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
