"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  FileText,
  Plus,
  Download,
  Share2,
  CheckCircle2,
  Search,
  History,
  Edit3,
  Calendar,
  X,
  Eye,
} from "lucide-react";
import { Quotation, QuotationRevision } from "@/lib/types";
import { formatINR } from "@/lib/calculations/financial";

export default function QuotationsPage() {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [convertingId, setConvertingId] = useState<string | null>(null);

  // Conversion Modal with single Advance Paid (₹) input
  const [convertModalQuote, setConvertModalQuote] = useState<Quotation | null>(null);
  const [advancePaidInput, setAdvancePaidInput] = useState<number>(0);
  const [paymentModeInput, setPaymentModeInput] = useState<string>("CASH");

  // History Modal State
  const [historyQuote, setHistoryQuote] = useState<Quotation | null>(null);

  // Revise Modal State
  const [reviseQuote, setReviseQuote] = useState<Quotation | null>(null);
  const [reviseStartDate, setReviseStartDate] = useState("");
  const [reviseEndDate, setReviseEndDate] = useState("");
  const [reviseDays, setReviseDays] = useState(1);
  const [reviseTransport, setReviseTransport] = useState(0);
  const [reviseNotes, setReviseNotes] = useState("");
  const [reviseSubmitting, setReviseSubmitting] = useState(false);

  const loadQuotations = () => {
    fetch(`/api/quotations?status=${encodeURIComponent(statusFilter)}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setQuotations(data);
      });
  };

  useEffect(() => {
    loadQuotations();
  }, [statusFilter]);

  const handleConfirmConvert = async () => {
    if (!convertModalQuote) return;
    setConvertingId(convertModalQuote.id);
    try {
      const res = await fetch(`/api/quotations/${convertModalQuote.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          advancePaid: advancePaidInput,
          paymentMethod: paymentModeInput,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`Successfully converted! Created Rental Bill #${data.bill?.billNumber || ""}`);
        setConvertModalQuote(null);
        loadQuotations();
      } else {
        alert(data.error || "Conversion failed");
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setConvertingId(null);
    }
  };

  const handleOpenRevise = (q: Quotation) => {
    setReviseQuote(q);
    setReviseStartDate(q.rentalStartDate);
    setReviseEndDate(q.rentalEndDate);
    setReviseDays(q.rentalDays || 1);
    setReviseTransport(q.transportCharges || 0);
    setReviseNotes(q.notes || "");
  };

  const handleSaveRevision = async () => {
    if (!reviseQuote) return;
    setReviseSubmitting(true);
    try {
      const res = await fetch(`/api/quotations/${reviseQuote.id}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rentalStartDate: reviseStartDate,
          rentalEndDate: reviseEndDate,
          rentalDays: reviseDays,
          transportCharges: reviseTransport,
          notes: reviseNotes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`Saved new revision! Quotation is now Revision #${data.quotation.revisionNumber}`);
        setReviseQuote(null);
        loadQuotations();
      } else {
        alert(data.error || "Failed to revise quotation");
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setReviseSubmitting(false);
    }
  };

  const handleWhatsApp = async (quote: Quotation) => {
    const phone = prompt("Enter customer WhatsApp phone number:", quote.customerPhone);
    if (!phone) return;

    try {
      const res = await fetch("/api/whatsapp/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: "QUOTATION",
          documentId: quote.id,
          phone,
        }),
      });
      const data = await res.json();
      if (data.handoffUrl) {
        window.open(data.handoffUrl, "_blank");
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  const filtered = quotations.filter(
    (q) =>
      q.quotationNumber.toLowerCase().includes(search.toLowerCase()) ||
      q.customerName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-indigo-600" />
            Rental Quotations Module
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Rental quotations with revisions history, PDF generation, WhatsApp sharing, and 1-Click Bill Conversion.
          </p>
        </div>

        <Link
          href="/quotations/create"
          className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>New Quotation</span>
        </Link>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 p-3 rounded-xl flex items-center gap-3 shadow-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search quotations by number or customer name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="ISSUED">Issued</option>
          <option value="ACCEPTED">Accepted</option>
          <option value="CONVERTED">Converted</option>
          <option value="REQUIRES_REVISION">Requires Revision</option>
          <option value="DRAFT">Draft</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Quote #</th>
                <th className="py-3 px-3">Company</th>
                <th className="py-3 px-3">Customer</th>
                <th className="py-3 px-3">Rental Period</th>
                <th className="py-3 px-3 text-center">Items</th>
                <th className="py-3 px-3 text-right">Grand Total</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No quotations found. Click &quot;New Quotation&quot; to create one.
                  </td>
                </tr>
              ) : (
                filtered.map((q) => (
                  <tr key={q.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4 font-mono font-bold text-indigo-600">
                      <Link
                        href={`/quotations/${q.id}`}
                        className="hover:underline flex items-center gap-1.5"
                      >
                        <span>{q.quotationNumber}</span>
                        {(q.revisionNumber || 1) > 1 && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-amber-100 text-amber-800">
                            Rev {q.revisionNumber}
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="py-3 px-3 text-slate-600 truncate max-w-[150px]">
                      {q.companySnapshot?.displayName || "Tamilnadu Suppliers"}
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-900">{q.customerName}</td>
                    <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                      {q.rentalStartDate} to {q.rentalEndDate} ({q.rentalDays}d)
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-blue-600">
                      {(q.items || (q.branches || []).flatMap((b) => b.items) || []).length}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                      {formatINR(q.grandTotal)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold ${
                          q.status === "CONVERTED"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : q.status === "ACCEPTED"
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : q.status === "REQUIRES_REVISION"
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-slate-100 text-slate-700 border border-slate-200"
                        }`}
                      >
                        {q.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                      {/* View / Edit Action */}
                      <Link
                        href={`/quotations/${q.id}`}
                        className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded transition font-semibold ${
                          q.status === "CONVERTED" || Boolean(q.convertedBillId)
                            ? "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                            : "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200"
                        }`}
                        title={q.status === "CONVERTED" || Boolean(q.convertedBillId) ? "View Quotation" : "Edit Quotation"}
                      >
                        <Eye className="w-3 h-3 text-indigo-600" />
                        <span>{q.status === "CONVERTED" || Boolean(q.convertedBillId) ? "View Quotation" : "Edit Quotation"}</span>
                      </Link>
                      {/* Revision History */}
                      {q.revisionHistory && q.revisionHistory.length > 0 && (
                        <button
                          onClick={() => setHistoryQuote(q)}
                          className="inline-flex items-center gap-1 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 px-2 py-1 rounded transition"
                          title="View Previous Revisions"
                        >
                          <History className="w-3 h-3 text-amber-600" />
                          <span>History ({q.revisionHistory.length})</span>
                        </button>
                      )}

                      {/* Revise Quotation Action */}
                      {q.status !== "CONVERTED" && !q.convertedBillId && (
                        <button
                          onClick={() => handleOpenRevise(q)}
                          className="inline-flex items-center gap-1 text-[11px] bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-2 py-1 rounded transition font-semibold"
                          title="Revise Quotation"
                        >
                          <Edit3 className="w-3 h-3 text-amber-600" />
                          <span>Revise</span>
                        </button>
                      )}

                      <a
                        href={`/api/documents/quotation/${q.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 px-2 py-1 rounded transition"
                        title="Download PDF"
                      >
                        <Download className="w-3 h-3 text-blue-600" />
                        <span>PDF</span>
                      </a>

                      <button
                        onClick={() => handleWhatsApp(q)}
                        className="inline-flex items-center gap-1 text-[11px] bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-1 rounded transition"
                        title="Share WhatsApp"
                      >
                        <Share2 className="w-3 h-3 text-emerald-600" />
                      </button>

                      {q.status !== "CONVERTED" && !q.convertedBillId ? (
                        <button
                          onClick={() => {
                            setConvertModalQuote(q);
                            setAdvancePaidInput(0);
                          }}
                          disabled={convertingId === q.id}
                          className="inline-flex items-center gap-1 text-[11px] bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-2.5 py-1 rounded shadow-xs transition"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Convert to Bill</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-mono">
                          Bill: {q.convertedBillNumber}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Revision History Modal */}
      {historyQuote && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-xl border border-slate-200 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <History className="w-4 h-4 text-amber-600" />
                  Revision History — {historyQuote.quotationNumber}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Current: <strong className="text-slate-800">Revision {historyQuote.revisionNumber || 1}</strong> • Total {historyQuote.revisionHistory?.length || 0} historical revisions preserved
                </p>
              </div>
              <button
                onClick={() => setHistoryQuote(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              {(historyQuote.revisionHistory || []).map((rev, idx) => (
                <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 font-mono text-sm">
                      Revision #{rev.revisionNumber}
                    </span>
                    <span className="text-slate-500 text-[11px] font-mono">
                      Archived: {new Date(rev.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-200 text-[11px]">
                    <div>
                      <span className="text-slate-400 block">Dates</span>
                      <span className="font-medium text-slate-700">{rev.rentalStartDate} to {rev.rentalEndDate} ({rev.rentalDays}d)</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Items</span>
                      <span className="font-medium text-slate-700">{(rev.items || rev.branches?.flatMap(b => b.items) || []).length} items</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Grand Total</span>
                      <span className="font-bold font-mono text-slate-900">{formatINR(rev.grandTotal)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Notes</span>
                      <span className="text-slate-600 truncate">{rev.notes || "None"}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setHistoryQuote(null)}
                className="px-4 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revise Quotation Modal */}
      {reviseQuote && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-amber-600" />
                  Save New Revision — {reviseQuote.quotationNumber}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Saving increments revision from Rev {reviseQuote.revisionNumber || 1} to Rev {(reviseQuote.revisionNumber || 1) + 1} and preserves previous snapshot.
                </p>
              </div>
              <button
                onClick={() => setReviseQuote(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Rental Start Date</label>
                  <input
                    type="date"
                    value={reviseStartDate}
                    onChange={(e) => setReviseStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Rental End Date</label>
                  <input
                    type="date"
                    value={reviseEndDate}
                    onChange={(e) => setReviseEndDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Rental Days</label>
                  <input
                    type="number"
                    min="1"
                    value={reviseDays}
                    onChange={(e) => setReviseDays(Number(e.target.value) || 1)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Transport Charges (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={reviseTransport}
                    onChange={(e) => setReviseTransport(Number(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Revision Notes / Reason</label>
                <textarea
                  rows={3}
                  value={reviseNotes}
                  onChange={(e) => setReviseNotes(e.target.value)}
                  placeholder="e.g., Customer requested revised duration and transport rate"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setReviseQuote(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRevision}
                disabled={reviseSubmitting}
                className="px-4 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg shadow-xs transition"
              >
                Save as Revision {(reviseQuote.revisionNumber || 1) + 1}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quotation-to-Bill Conversion Modal with Single Advance Paid (₹) Input */}
      {convertModalQuote && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-indigo-600" />
                  Convert Quotation to Bill
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  #{convertModalQuote.quotationNumber} • {convertModalQuote.customerName}
                </p>
              </div>
              <button
                onClick={() => setConvertModalQuote(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Grand Total Preserved */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Preserved Quotation Grand Total
                  </span>
                  <span className="text-lg font-bold text-slate-900">
                    {formatINR(convertModalQuote.grandTotal)}
                  </span>
                </div>
                <div className="text-right text-[11px] text-slate-500 font-medium">
                  {convertModalQuote.rentalDays || 1} rental day(s)
                </div>
              </div>

              {/* Single Advance Paid (₹) Field */}
              <div>
                <label className="block text-slate-800 font-bold mb-1.5 text-xs">
                  Advance Paid (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  max={convertModalQuote.grandTotal}
                  value={advancePaidInput === 0 ? "" : advancePaidInput}
                  onChange={(e) => {
                    const val = Number(e.target.value) || 0;
                    setAdvancePaidInput(Math.min(convertModalQuote.grandTotal, Math.max(0, val)));
                  }}
                  placeholder="0.00"
                  className="w-full bg-slate-50 border border-slate-300 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 outline-none transition"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Enter any initial advance received now. Deducted immediately from payable balance.
                </p>
              </div>

              {/* Payment Mode Selection */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Payment Method
                </label>
                <select
                  value={paymentModeInput}
                  onChange={(e) => setPaymentModeInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800"
                >
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
                  <option value="UPI">UPI / GPay / PhonePe</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>

              {/* Live Remaining Balance Calculation */}
              <div className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-100 space-y-2">
                <div className="flex justify-between text-slate-600">
                  <span>Grand Total:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {formatINR(convertModalQuote.grandTotal)}
                  </span>
                </div>
                <div className="flex justify-between text-indigo-700">
                  <span>Advance Paid:</span>
                  <span className="font-mono font-bold">
                    - {formatINR(advancePaidInput)}
                  </span>
                </div>
                <div className="pt-2 border-t border-indigo-200 flex justify-between text-sm font-black text-slate-900">
                  <span>Remaining Balance:</span>
                  <span className="font-mono text-indigo-700">
                    {formatINR(Math.max(0, convertModalQuote.grandTotal - advancePaidInput))}
                  </span>
                </div>
                <p className="text-[10px] text-indigo-800 font-medium pt-1">
                  Formula: Remaining Balance = Grand Total − Advance Paid
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setConvertModalQuote(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmConvert}
                disabled={convertingId === convertModalQuote.id}
                className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs transition disabled:opacity-50"
              >
                {convertingId === convertModalQuote.id ? "Converting..." : "Confirm & Generate Rental Bill"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
