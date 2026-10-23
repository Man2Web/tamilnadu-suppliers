"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Package,
  FileText,
  Receipt,
  Truck,
  RotateCcw,
  Clock,
  AlertTriangle,
  Calendar,
  ShieldAlert,
  FileCheck,
  RefreshCw,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  ArrowUpRight,
  HelpCircle,
  Banknote,
  Search,
} from "lucide-react";
import { formatINR } from "@/lib/calculations/financial";
import { useAuth } from "@/lib/auth/AuthContext";

export default function DashboardPage() {
  const { currentUser, hasPermission } = useAuth();

  const [summaryCards, setSummaryCards] = useState({
    activeRentalBills: 0,
    productsAwaitingReturn: 0,
    overdueRentals: 0,
    quotationsAwaitingCustomerResponse: 0,
    returnsAwaitingInspection: 0,
    billsAwaitingPaymentOrClosure: 0,
  });

  const [charts, setCharts] = useState({
    rentalStatusDistribution: { active: 0, returned: 0, overdue: 0, closed: 0 },
    quotationWorkflow: { draft: 0, sent: 0, accepted: 0, rejected: 0, converted: 0 },
    returnsAndInspection: { awaitingReturn: 0, returnedGood: 0, damaged: 0, missing: 0, awaitingDecision: 0 },
    paymentOverview: { paid: 0, partiallyPaid: 0, outstanding: 0 },
    rentalActivityOverTime: [] as Array<{ date: string; label: string; quotations: number; bills: number; returns: number }>,
  });

  const [actionCenter, setActionCenter] = useState({
    overdueBills: [] as any[],
    productsAwaitingReturn: [] as any[],
    returnsAwaitingInspection: [] as any[],
    missingChargesAwaitingDecision: [] as any[],
    quotationsAwaitingAction: [] as any[],
    billsAwaitingPaymentOrClosure: [] as any[],
  });

  const [loading, setLoading] = useState(true);

  // Permission checks
  const canCreateQuote = hasPermission("quotations:create");
  const canViewQuotes = hasPermission("quotations:view") || canCreateQuote;
  const canCreateBill = hasPermission("bills:create");
  const canViewBills = hasPermission("bills:view") || canCreateBill;
  const canViewProducts = hasPermission("products:view") || hasPermission("inventory:availability");
  const canProcessReturns = hasPermission("returns:process") || canViewBills;

  // Single-roundtrip server-side aggregated dashboard data loading
  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/dashboard/summary", {
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.summaryCards) setSummaryCards(data.summaryCards);
        if (data.charts) setCharts(data.charts);
        if (data.actionCenter) setActionCenter(data.actionCenter);
      }
    } catch (err) {
      console.error("Failed to load dashboard summary:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Max value helper for charts
  const maxActivity = Math.max(
    1,
    ...charts.rentalActivityOverTime.map((d) => Math.max(d.quotations, d.bills, d.returns))
  );

  const totalRentalStatus =
    charts.rentalStatusDistribution.active +
    charts.rentalStatusDistribution.returned +
    charts.rentalStatusDistribution.overdue +
    charts.rentalStatusDistribution.closed;

  const totalQuotes =
    charts.quotationWorkflow.draft +
    charts.quotationWorkflow.sent +
    charts.quotationWorkflow.accepted +
    charts.quotationWorkflow.rejected +
    charts.quotationWorkflow.converted;

  const totalPayments =
    charts.paymentOverview.paid +
    charts.paymentOverview.partiallyPaid +
    charts.paymentOverview.outstanding;

  return (
    <div className="space-y-8 max-w-7xl mx-auto bg-white pb-20">
      {/* Header with Title and Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <span>Operations Dashboard & Action Center</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Operational status, rental dispatch workflow, return inspection pipeline, and payment settlement
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchDashboardData()}
            disabled={loading}
            className="p-2 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-xl hover:bg-slate-50 transition shadow-2xs"
            title="Refresh dashboard metrics"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-blue-600" : ""}`} />
          </button>

          {canCreateQuote && (
            <Link
              href="/quotations/create"
              className="text-xs font-semibold px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-2xs transition"
            >
              + New Quotation
            </Link>
          )}

          {canCreateBill && (
            <Link
              href="/bills/create"
              className="text-xs font-semibold px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition"
            >
              + New Bill
            </Link>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* SECTION 1: 6 OPERATIONAL SUMMARY CARDS                   */}
      {/* ======================================================== */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
          Real-Time Operational Summary
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {/* Card 1: Active Rental Bills */}
          <Link
            href="/bills?status=OUT_ON_RENT"
            className="group bg-white p-3.5 rounded-2xl border border-slate-200 hover:border-blue-300 shadow-2xs hover:shadow-md transition flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-[11px] font-bold text-slate-600 leading-tight">Active Bills</span>
              <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 group-hover:scale-105 transition">
                <Truck className="w-3.5 h-3.5" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-black text-slate-900">{summaryCards.activeRentalBills}</div>
              <p className="text-[10px] text-slate-500 mt-0.5">Currently out on site</p>
            </div>
          </Link>

          {/* Card 2: Products Awaiting Return */}
          <Link
            href="/inventory"
            className="group bg-white p-3.5 rounded-2xl border border-slate-200 hover:border-amber-300 shadow-2xs hover:shadow-md transition flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-[11px] font-bold text-slate-600 leading-tight">Units On Rent</span>
              <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600 group-hover:scale-105 transition">
                <Package className="w-3.5 h-3.5" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-black text-slate-900">{summaryCards.productsAwaitingReturn}</div>
              <p className="text-[10px] text-slate-500 mt-0.5">Awaiting return to depot</p>
            </div>
          </Link>

          {/* Card 3: Overdue Rentals */}
          <Link
            href="/bills?overdue=true"
            className="group bg-white p-3.5 rounded-2xl border border-rose-200 bg-rose-50/20 hover:border-rose-300 shadow-2xs hover:shadow-md transition flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-[11px] font-bold text-rose-700 leading-tight">Overdue Rentals</span>
              <div className="p-1.5 rounded-lg bg-rose-100 text-rose-700 group-hover:scale-105 transition">
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-black text-rose-700">{summaryCards.overdueRentals}</div>
              <p className="text-[10px] text-rose-600 mt-0.5 font-medium">Require follow-up</p>
            </div>
          </Link>

          {/* Card 4: Quotations Awaiting Response */}
          <Link
            href="/quotations?status=ISSUED"
            className="group bg-white p-3.5 rounded-2xl border border-slate-200 hover:border-indigo-300 shadow-2xs hover:shadow-md transition flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-[11px] font-bold text-slate-600 leading-tight">Open Quotations</span>
              <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 group-hover:scale-105 transition">
                <FileText className="w-3.5 h-3.5" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-black text-slate-900">{summaryCards.quotationsAwaitingCustomerResponse}</div>
              <p className="text-[10px] text-slate-500 mt-0.5">Awaiting client decision</p>
            </div>
          </Link>

          {/* Card 5: Returns Awaiting Inspection */}
          <Link
            href="/operations/returns"
            className="group bg-white p-3.5 rounded-2xl border border-slate-200 hover:border-amber-300 shadow-2xs hover:shadow-md transition flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-[11px] font-bold text-slate-600 leading-tight">Return Inspections</span>
              <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600 group-hover:scale-105 transition">
                <RotateCcw className="w-3.5 h-3.5" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-black text-slate-900">{summaryCards.returnsAwaitingInspection}</div>
              <p className="text-[10px] text-slate-500 mt-0.5">Goods at check-in gate</p>
            </div>
          </Link>

          {/* Card 6: Bills Awaiting Payment / Closure */}
          <Link
            href="/finance/settlements"
            className="group bg-white p-3.5 rounded-2xl border border-slate-200 hover:border-emerald-300 shadow-2xs hover:shadow-md transition flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-[11px] font-bold text-slate-600 leading-tight">Pending Closure</span>
              <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 group-hover:scale-105 transition">
                <Receipt className="w-3.5 h-3.5" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-black text-slate-900">{summaryCards.billsAwaitingPaymentOrClosure}</div>
              <p className="text-[10px] text-slate-500 mt-0.5">Balance due or settlement</p>
            </div>
          </Link>
        </div>
      </div>

      {/* ======================================================== */}
      {/* SECTION 2: 5 REAL-TIME OPERATIONAL CHARTS                */}
      {/* ======================================================== */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
          Operational Analytics & Distribution
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Chart 1: Rental Status Distribution */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  1. Rental Status Distribution
                </h3>
                <span className="text-[10px] font-bold text-slate-400 font-mono">
                  {totalRentalStatus} Total
                </span>
              </div>
              <p className="text-[11px] text-slate-500">Distribution of active, returned, and closed bills</p>
            </div>

            <div className="space-y-2.5">
              {[
                { label: "Active on Rent", count: charts.rentalStatusDistribution.active, color: "bg-blue-600" },
                { label: "Returned / Gate", count: charts.rentalStatusDistribution.returned, color: "bg-indigo-500" },
                { label: "Overdue", count: charts.rentalStatusDistribution.overdue, color: "bg-rose-500" },
                { label: "Closed & Settled", count: charts.rentalStatusDistribution.closed, color: "bg-emerald-600" },
              ].map((item) => {
                const pct = totalRentalStatus > 0 ? Math.round((item.count / totalRentalStatus) * 100) : 0;
                return (
                  <div key={item.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600 font-medium">{item.label}</span>
                      <span className="font-bold text-slate-900">
                        {item.count} <span className="text-[10px] text-slate-400">({pct}%)</span>
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Chart 2: Quotation Workflow Pipeline */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  2. Quotation Workflow
                </h3>
                <span className="text-[10px] font-bold text-slate-400 font-mono">
                  {totalQuotes} Total
                </span>
              </div>
              <p className="text-[11px] text-slate-500">Stages from quotation draft to bill conversion</p>
            </div>

            <div className="space-y-2.5">
              {[
                { label: "Draft", count: charts.quotationWorkflow.draft, color: "bg-slate-400" },
                { label: "Sent to Client", count: charts.quotationWorkflow.sent, color: "bg-indigo-500" },
                { label: "Accepted", count: charts.quotationWorkflow.accepted, color: "bg-emerald-500" },
                { label: "Converted to Bill", count: charts.quotationWorkflow.converted, color: "bg-blue-600" },
                { label: "Rejected", count: charts.quotationWorkflow.rejected, color: "bg-rose-400" },
              ].map((item) => {
                const pct = totalQuotes > 0 ? Math.round((item.count / totalQuotes) * 100) : 0;
                return (
                  <div key={item.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600 font-medium">{item.label}</span>
                      <span className="font-bold text-slate-900">
                        {item.count} <span className="text-[10px] text-slate-400">({pct}%)</span>
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Chart 3: Returns & Inspection Breakdown */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  3. Returns & Inspection Breakdown
                </h3>
                <span className="text-[10px] font-bold text-slate-400 font-mono">Units</span>
              </div>
              <p className="text-[11px] text-slate-500">Physical condition of dispatched and returned stock</p>
            </div>

            <div className="space-y-2.5">
              {[
                { label: "Awaiting Return", count: charts.returnsAndInspection.awaitingReturn, color: "bg-amber-500" },
                { label: "Returned Good (Reusable)", count: charts.returnsAndInspection.returnedGood, color: "bg-emerald-600" },
                { label: "Damaged Items", count: charts.returnsAndInspection.damaged, color: "bg-orange-500" },
                { label: "Missing Items", count: charts.returnsAndInspection.missing, color: "bg-rose-500" },
                { label: "Decision Pending", count: charts.returnsAndInspection.awaitingDecision, color: "bg-purple-500" },
              ].map((item) => {
                const totalUnits = Math.max(
                  1,
                  charts.returnsAndInspection.awaitingReturn +
                    charts.returnsAndInspection.returnedGood +
                    charts.returnsAndInspection.damaged +
                    charts.returnsAndInspection.missing
                );
                const pct = Math.min(100, Math.round((item.count / totalUnits) * 100));
                return (
                  <div key={item.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600 font-medium">{item.label}</span>
                      <span className="font-bold text-slate-900">{item.count} units</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Chart 4: Payment Overview */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  4. Payment Overview
                </h3>
                <span className="text-[10px] font-bold text-slate-400 font-mono">
                  {totalPayments} Invoices
                </span>
              </div>
              <p className="text-[11px] text-slate-500">Bill payment settlement status breakdown</p>
            </div>

            <div className="space-y-3">
              {[
                { label: "Fully Paid", count: charts.paymentOverview.paid, color: "bg-emerald-600" },
                { label: "Partially Paid", count: charts.paymentOverview.partiallyPaid, color: "bg-amber-500" },
                { label: "Outstanding (No Payment)", count: charts.paymentOverview.outstanding, color: "bg-rose-500" },
              ].map((item) => {
                const pct = totalPayments > 0 ? Math.round((item.count / totalPayments) * 100) : 0;
                return (
                  <div key={item.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600 font-medium">{item.label}</span>
                      <span className="font-bold text-slate-900">
                        {item.count} <span className="text-[10px] text-slate-400">({pct}%)</span>
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Chart 5: Rental Activity Over Time (Last 7 Days) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between space-y-4 lg:col-span-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  5. Rental Activity Over Time (Last 7 Days)
                </h3>
                <div className="flex items-center gap-3 text-[10px] font-semibold">
                  <span className="flex items-center gap-1 text-indigo-600">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" /> Quotes
                  </span>
                  <span className="flex items-center gap-1 text-blue-600">
                    <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" /> Bills
                  </span>
                  <span className="flex items-center gap-1 text-emerald-600">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Returns
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">Transaction counts recorded across recent calendar days</p>
            </div>

            {/* Daily Bar Activity Graph */}
            <div className="grid grid-cols-7 gap-2 pt-4 items-end h-28 border-b border-slate-100">
              {charts.rentalActivityOverTime.map((item) => (
                <div key={item.date} className="flex flex-col items-center gap-1.5 h-full justify-end">
                  <div className="flex items-end gap-1 h-20 w-full justify-center">
                    {/* Quotes */}
                    <div
                      title={`Quotes: ${item.quotations}`}
                      className="w-2.5 bg-indigo-400 rounded-t transition-all"
                      style={{ height: `${Math.max(4, (item.quotations / maxActivity) * 72)}px` }}
                    />
                    {/* Bills */}
                    <div
                      title={`Bills: ${item.bills}`}
                      className="w-2.5 bg-blue-600 rounded-t transition-all"
                      style={{ height: `${Math.max(4, (item.bills / maxActivity) * 72)}px` }}
                    />
                    {/* Returns */}
                    <div
                      title={`Returns: ${item.returns}`}
                      className="w-2.5 bg-emerald-500 rounded-t transition-all"
                      style={{ height: `${Math.max(4, (item.returns / maxActivity) * 72)}px` }}
                    />
                  </div>
                  <span className="text-[10px] font-medium text-slate-500 whitespace-nowrap">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* SECTION 3: WORKFLOW ACTION CENTER                        */}
      {/* ======================================================== */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-600" />
              <span>Workflow Action Center</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Priority operational tasks requiring immediate follow-up, inspection, or financial decision
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* List 1: Overdue Rental Bills Requiring Follow-up */}
          <div className="bg-white rounded-2xl border border-rose-200 shadow-2xs p-4 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-rose-100">
                <h3 className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  <span>Overdue Rentals ({actionCenter.overdueBills.length})</span>
                </h3>
                <Link href="/bills?overdue=true" className="text-[11px] text-rose-600 font-semibold hover:underline">
                  View All
                </Link>
              </div>

              {actionCenter.overdueBills.length === 0 ? (
                <div className="text-xs text-slate-400 italic py-6 text-center">
                  No rentals currently overdue. All returns on schedule.
                </div>
              ) : (
                <div className="space-y-2 mt-3">
                  {actionCenter.overdueBills.slice(0, 5).map((b) => (
                    <Link
                      key={b.id}
                      href={`/bills/${b.id}`}
                      className="block p-2.5 rounded-xl bg-rose-50/50 hover:bg-rose-100/60 border border-rose-100 transition text-xs space-y-1"
                    >
                      <div className="flex justify-between items-center font-bold">
                        <span className="text-rose-900">#{b.billNumber}</span>
                        <span className="text-[10px] text-rose-700 font-mono bg-rose-100 px-1.5 py-0.5 rounded">
                          {b.overdueDays}d overdue
                        </span>
                      </div>
                      <div className="text-slate-700 truncate font-medium">{b.customerName}</div>
                      <div className="flex justify-between text-[11px] text-slate-500">
                        <span>Due: {b.expectedReturnDate}</span>
                        <span className="font-semibold text-rose-700">₹{b.balanceDue?.toLocaleString("en-IN")}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* List 2: Products Awaiting Return */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-blue-600" />
                  <span>Products Awaiting Return ({actionCenter.productsAwaitingReturn.length})</span>
                </h3>
                <Link href="/operations/returns" className="text-[11px] text-blue-600 font-semibold hover:underline">
                  Gate In
                </Link>
              </div>

              {actionCenter.productsAwaitingReturn.length === 0 ? (
                <div className="text-xs text-slate-400 italic py-6 text-center">
                  No active rental items awaiting return.
                </div>
              ) : (
                <div className="space-y-2 mt-3">
                  {actionCenter.productsAwaitingReturn.slice(0, 5).map((b) => (
                    <Link
                      key={b.id}
                      href={`/bills/${b.id}`}
                      className="block p-2.5 rounded-xl bg-slate-50 hover:bg-blue-50/60 border border-slate-200 transition text-xs space-y-1"
                    >
                      <div className="flex justify-between items-center font-bold">
                        <span className="text-slate-900">#{b.billNumber}</span>
                        <span className="text-[10px] text-blue-700 font-mono bg-blue-100 px-1.5 py-0.5 rounded">
                          {b.rentedItems} units out
                        </span>
                      </div>
                      <div className="text-slate-700 truncate font-medium">{b.customerName}</div>
                      <div className="flex justify-between text-[11px] text-slate-500">
                        <span>Expected: {b.expectedReturnDate}</span>
                        <span>{b.status}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* List 3: Returns Awaiting Damage Inspection */}
          <div className="bg-white rounded-2xl border border-amber-200 shadow-2xs p-4 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-amber-100">
                <h3 className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                  <span>Awaiting Inspection ({actionCenter.returnsAwaitingInspection.length})</span>
                </h3>
                <Link href="/operations/returns" className="text-[11px] text-amber-700 font-semibold hover:underline">
                  Process
                </Link>
              </div>

              {actionCenter.returnsAwaitingInspection.length === 0 ? (
                <div className="text-xs text-slate-400 italic py-6 text-center">
                  No returned goods pending damage inspection.
                </div>
              ) : (
                <div className="space-y-2 mt-3">
                  {actionCenter.returnsAwaitingInspection.slice(0, 5).map((b) => (
                    <Link
                      key={b.id}
                      href={`/bills/${b.id}`}
                      className="block p-2.5 rounded-xl bg-amber-50/50 hover:bg-amber-100/60 border border-amber-200 transition text-xs space-y-1"
                    >
                      <div className="flex justify-between items-center font-bold">
                        <span className="text-amber-900">#{b.billNumber}</span>
                        <span className="text-[10px] text-amber-800 font-bold bg-amber-100 px-1.5 py-0.5 rounded">
                          Inspection Due
                        </span>
                      </div>
                      <div className="text-slate-700 truncate font-medium">{b.customerName}</div>
                      <div className="text-[11px] text-slate-500">
                        Returned on: {b.expectedReturnDate}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* List 4: Missing Charges & Incidents Awaiting Decision */}
          <div className="bg-white rounded-2xl border border-purple-200 shadow-2xs p-4 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-purple-100">
                <h3 className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-purple-600" />
                  <span>Incident Decisions ({actionCenter.missingChargesAwaitingDecision.length})</span>
                </h3>
                <Link href="/bills" className="text-[11px] text-purple-700 font-semibold hover:underline">
                  Review
                </Link>
              </div>

              {actionCenter.missingChargesAwaitingDecision.length === 0 ? (
                <div className="text-xs text-slate-400 italic py-6 text-center">
                  No damaged or missing item charge decisions pending.
                </div>
              ) : (
                <div className="space-y-2 mt-3">
                  {actionCenter.missingChargesAwaitingDecision.slice(0, 5).map((b) => (
                    <Link
                      key={b.id}
                      href={`/bills/${b.id}`}
                      className="block p-2.5 rounded-xl bg-purple-50/50 hover:bg-purple-100/60 border border-purple-200 transition text-xs space-y-1"
                    >
                      <div className="flex justify-between items-center font-bold">
                        <span className="text-purple-900">#{b.billNumber}</span>
                        <span className="text-[10px] text-purple-800 font-bold bg-purple-100 px-1.5 py-0.5 rounded">
                          {b.pendingIncidentsCount} Incidents
                        </span>
                      </div>
                      <div className="text-slate-700 truncate font-medium">{b.customerName}</div>
                      <div className="flex justify-between text-[11px] text-slate-500">
                        <span>Charge Approval Required</span>
                        <span className="font-semibold text-purple-700">₹{b.pendingIncidentsAmount?.toLocaleString("en-IN")}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* List 5: Quotations Awaiting Action */}
          <div className="bg-white rounded-2xl border border-indigo-200 shadow-2xs p-4 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-indigo-100">
                <h3 className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Quotations Pipeline ({actionCenter.quotationsAwaitingAction.length})</span>
                </h3>
                <Link href="/quotations" className="text-[11px] text-indigo-700 font-semibold hover:underline">
                  All Quotes
                </Link>
              </div>

              {actionCenter.quotationsAwaitingAction.length === 0 ? (
                <div className="text-xs text-slate-400 italic py-6 text-center">
                  No open quotations awaiting action or approval.
                </div>
              ) : (
                <div className="space-y-2 mt-3">
                  {actionCenter.quotationsAwaitingAction.slice(0, 5).map((q) => (
                    <Link
                      key={q.id}
                      href={`/quotations/${q.id}`}
                      className="block p-2.5 rounded-xl bg-indigo-50/50 hover:bg-indigo-100/60 border border-indigo-200 transition text-xs space-y-1"
                    >
                      <div className="flex justify-between items-center font-bold">
                        <span className="text-indigo-900">#{q.quotationNumber}</span>
                        <span className="text-[10px] text-indigo-800 font-bold bg-indigo-100 px-1.5 py-0.5 rounded">
                          {q.status}
                        </span>
                      </div>
                      <div className="text-slate-700 truncate font-medium">{q.customerName}</div>
                      <div className="flex justify-between text-[11px] text-slate-500">
                        <span>Grand Total</span>
                        <span className="font-semibold text-indigo-700">₹{q.grandTotal?.toLocaleString("en-IN")}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* List 6: Bills Awaiting Payment or Closure */}
          <div className="bg-white rounded-2xl border border-emerald-200 shadow-2xs p-4 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-emerald-100">
                <h3 className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Pending Payment / Closure ({actionCenter.billsAwaitingPaymentOrClosure.length})</span>
                </h3>
                <Link href="/bills" className="text-[11px] text-emerald-700 font-semibold hover:underline">
                  All Bills
                </Link>
              </div>

              {actionCenter.billsAwaitingPaymentOrClosure.length === 0 ? (
                <div className="text-xs text-slate-400 italic py-6 text-center">
                  No bills awaiting payment collection or final settlement.
                </div>
              ) : (
                <div className="space-y-2 mt-3">
                  {actionCenter.billsAwaitingPaymentOrClosure.slice(0, 5).map((b) => (
                    <Link
                      key={b.id}
                      href={`/bills/${b.id}`}
                      className="block p-2.5 rounded-xl bg-emerald-50/50 hover:bg-emerald-100/60 border border-emerald-200 transition text-xs space-y-1"
                    >
                      <div className="flex justify-between items-center font-bold">
                        <span className="text-emerald-900">#{b.billNumber}</span>
                        <span className="text-[10px] text-emerald-800 font-mono font-bold bg-emerald-100 px-1.5 py-0.5 rounded">
                          ₹{b.balanceDue?.toLocaleString("en-IN")} due
                        </span>
                      </div>
                      <div className="text-slate-700 truncate font-medium">{b.customerName}</div>
                      <div className="flex justify-between text-[11px] text-slate-500">
                        <span>Status: {b.status}</span>
                        <span>Total: ₹{b.grandTotal?.toLocaleString("en-IN")}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
