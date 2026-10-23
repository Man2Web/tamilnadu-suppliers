"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Receipt,
  Plus,
  Download,
  Share2,
  Search,
  Truck,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
} from "lucide-react";
import { Bill } from "@/lib/types";
import { formatINR } from "@/lib/calculations/financial";

export default function BillsPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const loadBills = () => {
    fetch(`/api/bills?status=${encodeURIComponent(statusFilter)}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setBills(data);
      });
  };

  useEffect(() => {
    loadBills();
  }, [statusFilter]);

  const handleWhatsApp = async (bill: Bill) => {
    const phone = prompt("Enter customer WhatsApp phone number:", bill.customerPhone);
    if (!phone) return;

    try {
      const res = await fetch("/api/whatsapp/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: "BILL",
          documentId: bill.id,
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ISSUED":
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-50 text-blue-700 border border-blue-200">Issued</span>;
      case "OUT_ON_RENT":
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1 justify-center"><Truck className="w-3 h-3" /> Out on Rent</span>;
      case "PARTIALLY_RETURNED":
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-orange-50 text-orange-700 border border-orange-200 flex items-center gap-1 justify-center"><RotateCcw className="w-3 h-3" /> Part. Returned</span>;
      case "RETURN_INSPECTION":
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1 justify-center"><Clock className="w-3 h-3" /> Inspecting</span>;
      case "PENDING_SETTLEMENT":
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-yellow-50 text-yellow-800 border border-yellow-300 flex items-center gap-1 justify-center"><AlertTriangle className="w-3 h-3" /> Pending Settl.</span>;
      case "CLOSED":
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 justify-center"><CheckCircle2 className="w-3 h-3" /> Closed</span>;
      case "CANCELLED":
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-50 text-rose-700 border border-rose-200">Cancelled</span>;
      default:
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700 border border-slate-200">{status}</span>;
    }
  };

  const filtered = bills.filter(
    (b) =>
      b.billNumber.toLowerCase().includes(search.toLowerCase()) ||
      b.customerName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
            <Receipt className="w-6 h-6 text-emerald-600" />
            Rental Bills & Invoices Register
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Complete rental lifecycle: Issued &rarr; Out on Rent &rarr; Partial Returns &rarr; Inspection &rarr; Settlement &rarr; Closed.
          </p>
        </div>

        <Link
          href="/bills/create"
          className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>New Direct Bill</span>
        </Link>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 p-3 rounded-xl flex items-center gap-3 shadow-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search bills by bill number or customer name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:outline-none"
        >
          <option value="">All Lifecycle Statuses</option>
          <option value="ISSUED">Issued</option>
          <option value="OUT_ON_RENT">Out on Rent</option>
          <option value="PARTIALLY_RETURNED">Partially Returned</option>
          <option value="RETURN_INSPECTION">Return Inspection</option>
          <option value="PENDING_SETTLEMENT">Pending Settlement</option>
          <option value="CLOSED">Closed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Bill #</th>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Issuing Company</th>
                <th className="py-3 px-3">Customer</th>
                <th className="py-3 px-3 text-right">Grand Total</th>
                <th className="py-3 px-3 text-right">Paid</th>
                <th className="py-3 px-3 text-right">Balance Due</th>
                <th className="py-3 px-3 text-center">Lifecycle Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No bills found. Click &quot;New Direct Bill&quot; to create one.
                  </td>
                </tr>
              ) : (
                filtered.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4 font-mono font-bold text-emerald-600">
                      <Link href={`/bills/${b.id}`} className="hover:underline flex items-center gap-1">
                        {b.billNumber}
                        {b.isOverdue && (
                          <span className="text-[9px] bg-rose-100 text-rose-800 px-1 py-0.2 rounded font-mono font-bold">
                            OVERDUE
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                      {b.billDate}
                      {b.expectedReturnDate && (
                        <div className="text-[10px] text-slate-400">Due: {b.expectedReturnDate}</div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-600 truncate max-w-[150px]">
                      {b.companySnapshot?.displayName || "Tamilnadu Suppliers"}
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-900">{b.customerName}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                      {formatINR(b.grandTotal)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-600 font-medium">
                      {formatINR((b.amountPaid || 0) + (b.advancePaid || 0))}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-amber-600">
                      {formatINR(b.balanceDue)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {getStatusBadge(b.status)}
                    </td>
                    <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                      <Link
                        href={`/bills/${b.id}`}
                        className="inline-flex items-center gap-1 text-[11px] bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold px-2.5 py-1 rounded border border-blue-200 transition"
                        title="Manage Returns & Operations"
                      >
                        <span>Manage</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>

                      <a
                        href={`/api/documents/bill/${b.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-2 py-1 rounded transition border border-slate-200"
                        title="Download Bill PDF"
                      >
                        <Download className="w-3 h-3 text-blue-600" />
                        <span>PDF</span>
                      </a>

                      <button
                        onClick={() => handleWhatsApp(b)}
                        className="inline-flex items-center gap-1 text-[11px] bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-1 rounded transition"
                        title="Share on WhatsApp"
                      >
                        <Share2 className="w-3 h-3 text-emerald-600" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
