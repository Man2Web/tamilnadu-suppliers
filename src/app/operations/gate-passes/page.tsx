"use client";

import React, { useEffect, useState } from "react";
import { Truck } from "lucide-react";
import { GatePass } from "@/lib/types";

export default function GatePassesPage() {
  const [gatePasses, setGatePasses] = useState<GatePass[]>([]);

  useEffect(() => {
    fetch("/api/operations/gate-passes")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setGatePasses(data);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
          <Truck className="w-6 h-6 text-blue-600" />
          Gate Pass & Dispatch Management
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Track products leaving the warehouse for customer rentals, generate outbound dispatch slips, and allocate inventory.
        </p>
      </div>

      {/* Purpose & Workflow Explanation Card */}
      <div className="bg-white border border-blue-200/80 rounded-xl p-4 shadow-xs text-xs space-y-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-700 font-bold shrink-0">
            ℹ️
          </div>
          <div className="space-y-1">
            <h2 className="font-bold text-slate-900 text-sm">Gate Passes & Dispatch Workflow</h2>
            <p className="text-slate-600 leading-relaxed">
              <strong>Purpose:</strong> Track products leaving the warehouse for a customer rental. The system updates rented and dispatched quantities accurately and prevents unavailable stock from being dispatched.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-2 border-t border-slate-100">
          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <span className="inline-block px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px] mb-1">Step 1</span>
            <p className="font-semibold text-slate-800 text-[11px]">Open Bill / Order</p>
            <p className="text-slate-500 text-[10px] mt-0.5">Locate the active rental bill or order requiring dispatch.</p>
          </div>

          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <span className="inline-block px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px] mb-1">Step 2</span>
            <p className="font-semibold text-slate-800 text-[11px]">Verify Items</p>
            <p className="text-slate-500 text-[10px] mt-0.5">Check product specifications, available stock, and line quantities.</p>
          </div>

          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <span className="inline-block px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px] mb-1">Step 3</span>
            <p className="font-semibold text-slate-800 text-[11px]">Record Logistics</p>
            <p className="text-slate-500 text-[10px] mt-0.5">Enter dispatch date, destination, vehicle number, and driver.</p>
          </div>

          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <span className="inline-block px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px] mb-1">Step 4</span>
            <p className="font-semibold text-slate-800 text-[11px]">Generate Gate Pass</p>
            <p className="text-slate-500 text-[10px] mt-0.5">Generate official printable pass with security & transit details.</p>
          </div>

          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <span className="inline-block px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px] mb-1">Step 5</span>
            <p className="font-semibold text-slate-800 text-[11px]">Update Inventory</p>
            <p className="text-slate-500 text-[10px] mt-0.5">Deduct available stock and mark items as actively out on rent.</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
              <th className="py-3 px-4">Gate Pass #</th>
              <th className="py-3 px-3">Customer</th>
              <th className="py-3 px-3">Destination</th>
              <th className="py-3 px-3">Dispatch Date</th>
              <th className="py-3 px-3">Expected Return</th>
              <th className="py-3 px-3">Vehicle / Driver</th>
              <th className="py-3 px-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {gatePasses.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  No gate passes created yet. Gate passes are generated when rental orders are dispatched.
                </td>
              </tr>
            ) : (
              gatePasses.map((gp) => (
                <tr key={gp.id} className="hover:bg-slate-50 transition">
                  <td className="py-3 px-4 font-mono font-bold text-blue-600">{gp.gatePassNumber}</td>
                  <td className="py-3 px-3 text-slate-900 font-medium">{gp.customerName}</td>
                  <td className="py-3 px-3 text-slate-600">{gp.destinationBranch}</td>
                  <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">{new Date(gp.dispatchDate).toLocaleDateString()}</td>
                  <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">{gp.expectedReturnDate}</td>
                  <td className="py-3 px-3 text-slate-600">
                    {gp.vehicleNumber || "N/A"} • {gp.driverName || "Driver"}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-blue-50 text-blue-700 border border-blue-200">
                      {gp.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
