"use client";

import React, { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { ReturnRecord } from "@/lib/types";
import { formatINR } from "@/lib/calculations/financial";

export default function ReturnsPage() {
  const [returns, setReturns] = useState<ReturnRecord[]>([]);

  useEffect(() => {
    fetch("/api/operations/returns")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setReturns(data);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
          <RotateCcw className="w-6 h-6 text-amber-600" />
          Rental Returns & Damage Inspection
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Track products coming back from customers, separate good returns from damages and losses, and settle accounts before closing bills.
        </p>
      </div>

      {/* Purpose & Workflow Explanation Card */}
      <div className="bg-white border border-amber-200/80 rounded-xl p-4 shadow-xs text-xs space-y-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-50 text-amber-700 font-bold shrink-0">
            ℹ️
          </div>
          <div className="space-y-1">
            <h2 className="font-bold text-slate-900 text-sm">Returns & Damages Workflow</h2>
            <p className="text-slate-600 leading-relaxed">
              <strong>Purpose:</strong> Track products coming back from the customer. Items returned in good condition are immediately restored to available inventory, while damaged or missing items are quarantined and independently billed or waived according to management decisions.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-7 gap-2 pt-2 border-t border-slate-100">
          <div className="bg-slate-50 rounded-lg p-2 border border-slate-200">
            <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px] mb-1">Step 1</span>
            <p className="font-semibold text-slate-800 text-[11px]">Find Open Bill</p>
            <p className="text-slate-500 text-[10px] mt-0.5">Open the rental bill in the return workspace.</p>
          </div>

          <div className="bg-slate-50 rounded-lg p-2 border border-slate-200">
            <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px] mb-1">Step 2</span>
            <p className="font-semibold text-slate-800 text-[11px]">Record Good Units</p>
            <p className="text-slate-500 text-[10px] mt-0.5">Input units returned intact and ready for immediate reuse.</p>
          </div>

          <div className="bg-slate-50 rounded-lg p-2 border border-slate-200">
            <span className="inline-block px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-[10px] mb-1">Step 3</span>
            <p className="font-semibold text-slate-800 text-[11px]">Separate Incident Qty</p>
            <p className="text-slate-500 text-[10px] mt-0.5">Log damaged and missing counts independently.</p>
          </div>

          <div className="bg-slate-50 rounded-lg p-2 border border-slate-200">
            <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px] mb-1">Step 4</span>
            <p className="font-semibold text-slate-800 text-[11px]">Charge Decisions</p>
            <p className="text-slate-500 text-[10px] mt-0.5">Set Charge Customer, Waive, or Deduct from Deposit.</p>
          </div>

          <div className="bg-slate-50 rounded-lg p-2 border border-slate-200">
            <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px] mb-1">Step 5</span>
            <p className="font-semibold text-slate-800 text-[11px]">Check Late Days</p>
            <p className="text-slate-500 text-[10px] mt-0.5">Calculate additional rental days if returned past due date.</p>
          </div>

          <div className="bg-slate-50 rounded-lg p-2 border border-slate-200">
            <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px] mb-1">Step 6</span>
            <p className="font-semibold text-slate-800 text-[11px]">Update Stock</p>
            <p className="text-slate-500 text-[10px] mt-0.5">Available stock increases only for good returned units.</p>
          </div>

          <div className="bg-slate-50 rounded-lg p-2 border border-slate-200">
            <span className="inline-block px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px] mb-1">Step 7</span>
            <p className="font-semibold text-slate-800 text-[11px]">Final Settlement</p>
            <p className="text-slate-500 text-[10px] mt-0.5">Complete inspection & financial settlement before closing bill.</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
              <th className="py-3 px-4">Return #</th>
              <th className="py-3 px-3">Date</th>
              <th className="py-3 px-3">Customer</th>
              <th className="py-3 px-3">Inspector</th>
              <th className="py-3 px-3 text-right">Damage Charges</th>
              <th className="py-3 px-3 text-right">Late Fees</th>
              <th className="py-3 px-3 text-right">Deposit Adjustment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {returns.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  No return records registered yet.
                </td>
              </tr>
            ) : (
              returns.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition">
                  <td className="py-3 px-4 font-mono font-bold text-amber-600">{r.returnNumber}</td>
                  <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">{new Date(r.returnDate).toLocaleDateString()}</td>
                  <td className="py-3 px-3 text-slate-900 font-medium">{r.customerName}</td>
                  <td className="py-3 px-3 text-slate-600">{r.inspectedBy}</td>
                  <td className="py-3 px-3 text-right font-mono text-rose-600 font-bold">{formatINR(r.damageCharges)}</td>
                  <td className="py-3 px-3 text-right font-mono text-amber-600">{formatINR(r.lateFeeCharges)}</td>
                  <td className="py-3 px-3 text-right font-mono text-emerald-600 font-bold">{formatINR(r.depositAdjustment)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
