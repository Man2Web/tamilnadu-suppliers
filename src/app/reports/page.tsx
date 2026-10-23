"use client";

import React, { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { Bill, Quotation, Product } from "@/lib/types";
import { formatINR } from "@/lib/calculations/financial";

export default function ReportsPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    fetch("/api/bills").then((res) => res.json()).then((d) => Array.isArray(d) && setBills(d));
    fetch("/api/quotations").then((res) => res.json()).then((d) => Array.isArray(d) && setQuotations(d));
    fetch("/api/products").then((res) => res.json()).then((d) => Array.isArray(d) && setProducts(d));
  }, []);

  const totalRevenue = bills.reduce((sum, b) => sum + (b.grandTotal || 0), 0);
  const totalBalanceDue = bills.reduce((sum, b) => sum + (b.balanceDue || 0), 0);
  const totalDeposits = bills.reduce((sum, b) => sum + (b.securityDepositHeld || 0), 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
          <BarChart3 className="w-6 h-6 text-indigo-600" />
          Financial & Inventory Business Registers
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Complete statutory reporting: Rental Sales Register, Customer Ledgers, Stock Utilization, and Custodian Deposits.
        </p>
      </div>

      {/* Purpose & Workflow Explanation Card */}
      <div className="bg-white border border-indigo-200/80 rounded-xl p-4 shadow-xs text-xs space-y-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-indigo-50 text-indigo-700 font-bold shrink-0">
            ℹ️
          </div>
          <div className="space-y-1">
            <h2 className="font-bold text-slate-900 text-sm">Reports & Registers Workflow</h2>
            <p className="text-slate-600 leading-relaxed">
              <strong>Purpose:</strong> Review rental activity, inventory movement, outstanding payments, and transaction records. Reports use actual saved records and accurate calculations without fabricated totals or duplicate payments.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100">
          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold text-[10px] mb-1">Step 1</span>
            <p className="font-semibold text-slate-800 text-[11px]">Select Register</p>
            <p className="text-slate-500 text-[10px] mt-0.5">Choose Sales Register, Outstanding Receivables, or Deposits Ledger.</p>
          </div>

          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold text-[10px] mb-1">Step 2</span>
            <p className="font-semibold text-slate-800 text-[11px]">Apply Filters</p>
            <p className="text-slate-500 text-[10px] mt-0.5">Filter by date interval, customer account, company profile, or status.</p>
          </div>

          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold text-[10px] mb-1">Step 3</span>
            <p className="font-semibold text-slate-800 text-[11px]">Review Results</p>
            <p className="text-slate-500 text-[10px] mt-0.5">Inspect GST breakdowns, audited totals, and live item movements.</p>
          </div>

          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold text-[10px] mb-1">Step 4</span>
            <p className="font-semibold text-slate-800 text-[11px]">Export & Audit</p>
            <p className="text-slate-500 text-[10px] mt-0.5">Export verified ledger records for accounting & statutory tax filings.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-emerald-500">
          <div className="text-xs text-slate-500 font-semibold uppercase">Total Invoiced Sales</div>
          <div className="text-2xl font-bold text-slate-900 font-mono mt-1">{formatINR(totalRevenue)}</div>
          <div className="text-[11px] text-slate-400 mt-1">{bills.length} bills generated</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-amber-500">
          <div className="text-xs text-slate-500 font-semibold uppercase">Accounts Receivable (Outstanding)</div>
          <div className="text-2xl font-bold text-amber-600 font-mono mt-1">{formatINR(totalBalanceDue)}</div>
          <div className="text-[11px] text-slate-400 mt-1">Pending settlement from clients</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-blue-500">
          <div className="text-xs text-slate-500 font-semibold uppercase">Security Deposits in Custody</div>
          <div className="text-2xl font-bold text-blue-600 font-mono mt-1">{formatINR(totalDeposits)}</div>
          <div className="text-[11px] text-slate-400 mt-1">Refundable upon damage inspection</div>
        </div>
      </div>

      {/* Bill Register Summary */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center justify-between">
          <span>Billing Register (GST & Non-GST Breakdown)</span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <th className="py-2.5 px-3">Bill No</th>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Company Profile</th>
                <th className="py-2.5 px-3">Customer</th>
                <th className="py-2.5 px-3 text-right">Taxable</th>
                <th className="py-2.5 px-3 text-right">Taxes</th>
                <th className="py-2.5 px-3 text-right">Grand Total</th>
                <th className="py-2.5 px-3 text-right">Balance Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono bg-white">
              {bills.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50 transition">
                  <td className="py-2 px-3 text-emerald-600 font-bold">{b.billNumber}</td>
                  <td className="py-2 px-3 text-slate-500">{b.billDate}</td>
                  <td className="py-2 px-3 font-sans text-slate-700">{b.companySnapshot?.displayName}</td>
                  <td className="py-2 px-3 font-sans text-slate-900 font-medium">{b.customerName}</td>
                  <td className="py-2 px-3 text-right text-slate-700">{formatINR(b.taxableAmount)}</td>
                  <td className="py-2 px-3 text-right text-emerald-600">{formatINR(b.totalTax)}</td>
                  <td className="py-2 px-3 text-right font-bold text-slate-900">{formatINR(b.grandTotal)}</td>
                  <td className="py-2 px-3 text-right text-amber-600 font-semibold">{formatINR(b.balanceDue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
