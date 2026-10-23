"use client";

import React, { useEffect, useState } from "react";
import { IndianRupee, Plus, X, Lock } from "lucide-react";
import { Payment } from "@/lib/types";
import { formatINR } from "@/lib/calculations/financial";
import { useAuth } from "@/lib/auth/AuthContext";

export default function PaymentsPage() {
  const { currentUser, isSuperAdmin, hasPermission, fetchWithAuth } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  const [form, setForm] = useState({
    customerName: "",
    amount: 0,
    paymentType: "RENTAL_PAYMENT",
    paymentMethod: "UPI",
    referenceNumber: "",
    notes: "",
  });

  const loadPayments = () => {
    fetchWithAuth("/api/finance/payments")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setPayments(data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadPayments();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetchWithAuth("/api/finance/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        alert("Payment recorded successfully!");
        setShowAddModal(false);
        loadPayments();
      } else {
        const err = await res.json();
        alert(err.error || "Failed");
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Permission Guard: payments:record or Super Admin
  if (!isSuperAdmin && !hasPermission("payments:record")) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4">
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-8 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-amber-900">Access Denied: Payment Recording Restricted</h2>
          <p className="text-sm text-amber-800 max-w-lg mx-auto">
            Your current account (<strong>{currentUser?.name || "User"}</strong>, role: {currentUser?.role || "GUEST"}) does not have the <strong>Record Payments</strong> permission.
          </p>
          <p className="text-xs text-amber-700 font-medium">
            Contact the Super Administrator or switch to an authorized billing account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
            <IndianRupee className="w-6 h-6 text-emerald-600" />
            Payments & Security Deposits Ledger
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Rental revenue advances, regular payments, and refundable security deposits tracked with individual ledgers.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>Record Payment / Deposit</span>
        </button>
      </div>

      {/* Purpose & Workflow Explanation Card */}
      <div className="bg-white border border-emerald-200/80 rounded-xl p-4 shadow-xs text-xs space-y-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700 font-bold shrink-0">
            ℹ️
          </div>
          <div className="space-y-1">
            <h2 className="font-bold text-slate-900 text-sm">Payments & Deposits Workflow</h2>
            <p className="text-slate-600 leading-relaxed">
              <strong>Purpose:</strong> Record and track money received or held against rental transactions. <em>Important:</em> Security deposits remain strictly distinct from rental revenue and are held in custody until inspection settlement.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-6 gap-2 pt-2 border-t border-slate-100">
          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px] mb-1">Step 1</span>
            <p className="font-semibold text-slate-800 text-[11px]">Select Transaction</p>
            <p className="text-slate-500 text-[10px] mt-0.5">Open the customer bill or transaction record.</p>
          </div>

          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px] mb-1">Step 2</span>
            <p className="font-semibold text-slate-800 text-[11px]">Select Type</p>
            <p className="text-slate-500 text-[10px] mt-0.5">Specify Rental Advance, Bill Payment, or Security Deposit.</p>
          </div>

          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px] mb-1">Step 3</span>
            <p className="font-semibold text-slate-800 text-[11px]">Payment Details</p>
            <p className="text-slate-500 text-[10px] mt-0.5">Enter amount, method (UPI, Bank, Cash), date, & reference #.</p>
          </div>

          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px] mb-1">Step 4</span>
            <p className="font-semibold text-slate-800 text-[11px]">Ledger Allocation</p>
            <p className="text-slate-500 text-[10px] mt-0.5">Allocate funds directly to bill balance or deposit ledger.</p>
          </div>

          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px] mb-1">Step 5</span>
            <p className="font-semibold text-slate-800 text-[11px]">Recalculate Due</p>
            <p className="text-slate-500 text-[10px] mt-0.5">Server updates total paid and live outstanding balance due.</p>
          </div>

          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px] mb-1">Step 6</span>
            <p className="font-semibold text-slate-800 text-[11px]">Preserve History</p>
            <p className="text-slate-500 text-[10px] mt-0.5">Receipt recorded permanently in customer & financial registers.</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
              <th className="py-3 px-4">Receipt #</th>
              <th className="py-3 px-3">Date</th>
              <th className="py-3 px-3">Customer</th>
              <th className="py-3 px-3">Type</th>
              <th className="py-3 px-3">Method</th>
              <th className="py-3 px-3 font-mono">Ref # / UTR</th>
              <th className="py-3 px-4 text-right">Amount (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {payments.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  No payment transactions posted yet.
                </td>
              </tr>
            ) : (
              payments.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition">
                  <td className="py-3 px-4 font-mono font-bold text-emerald-600">{p.paymentNumber}</td>
                  <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">{p.paymentDate}</td>
                  <td className="py-3 px-3 text-slate-900 font-medium">{p.customerName}</td>
                  <td className="py-3 px-3">
                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold ${
                        p.paymentType === "SECURITY_DEPOSIT"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      }`}
                    >
                      {p.paymentType === "SECURITY_DEPOSIT" ? "Security Deposit" : "Rental Revenue"}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-700 font-medium">{p.paymentMethod}</td>
                  <td className="py-3 px-3 font-mono text-slate-500">{p.referenceNumber || "-"}</td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 text-sm">
                    {formatINR(p.amount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-md w-full my-8 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <IndianRupee className="w-5 h-5 text-emerald-600" />
                Record Payment or Deposit
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Customer Name *</label>
                <input
                  type="text"
                  value={form.customerName}
                  onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Payment Type</label>
                  <select
                    value={form.paymentType}
                    onChange={(e) => setForm({ ...form, paymentType: e.target.value as any })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="RENTAL_PAYMENT">Rental Payment</option>
                    <option value="ADVANCE">Advance Payment</option>
                    <option value="SECURITY_DEPOSIT">Security Deposit (Refundable)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Payment Method</label>
                  <select
                    value={form.paymentMethod}
                    onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as any })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="UPI">UPI (GPay / PhonePe)</option>
                    <option value="BANK_TRANSFER">Bank Transfer (NEFT/RTGS)</option>
                    <option value="CASH">Cash</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Amount Received (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-mono font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Reference No / UTR / Cheque No</label>
                <input
                  type="text"
                  value={form.referenceNumber}
                  onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })}
                  placeholder="e.g. 423985729182"
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-sm"
                >
                  Post Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
