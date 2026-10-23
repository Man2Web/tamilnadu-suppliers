"use client";

import React, { useEffect, useState } from "react";
import { Boxes } from "lucide-react";
import { Product } from "@/lib/types";

export default function AvailabilityPage() {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProducts(data);
      });
  }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
          <Boxes className="w-6 h-6 text-blue-600" />
          Rental Stock Availability & Allocation
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Exact stock availability formula: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">Available = Owned - (Reserved + Rented + Damaged + Missing + Maintenance)</code>.
        </p>
      </div>

      <div className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
              <th className="py-3 px-4">Item Name</th>
              <th className="py-3 px-3">Category</th>
              <th className="py-3 px-3 text-center">Total Owned</th>
              <th className="py-3 px-3 text-center">Available Now</th>
              <th className="py-3 px-3 text-center">On Rental</th>
              <th className="py-3 px-3 text-center">Damaged</th>
              <th className="py-3 px-3 text-center">Missing</th>
              <th className="py-3 px-4 text-center">Stock Utilization</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {products.map((p) => {
              const utilPercent =
                p.totalOwnedQuantity > 0
                  ? Math.round((p.rentedQuantity / p.totalOwnedQuantity) * 100)
                  : 0;
              return (
                <tr key={p.id} className="hover:bg-slate-50 transition">
                  <td className="py-2.5 px-4 font-semibold text-slate-900">{p.name}</td>
                  <td className="py-2.5 px-3 text-slate-600">{p.categoryName || "General"}</td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900">
                    {p.totalOwnedQuantity}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-600 text-sm">
                    {p.availableQuantity}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-amber-600">
                    {p.rentedQuantity}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-rose-600">
                    {p.damagedQuantity}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono text-slate-600">
                    {p.missingQuantity}
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    <div className="w-24 bg-slate-100 h-2 rounded-full mx-auto overflow-hidden border border-slate-200">
                      <div
                        className="bg-blue-600 h-full rounded-full"
                        style={{ width: `${Math.min(100, utilPercent)}%` }}
                      ></div>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
                      {utilPercent}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
