"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  Users,
  Plus,
  Search,
  Building,
  X,
  Lock,
  LayoutGrid,
  Table as TableIcon,
  Phone,
  Mail,
  FileText,
  Edit2,
  Eye,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle2,
  Clock,
  MapPin,
  ExternalLink,
} from "lucide-react";
import { Customer } from "@/lib/types";
import { useAuth } from "@/lib/auth/AuthContext";

interface EnrichedCustomer extends Customer {
  totalBills?: number;
  outstandingBalance?: number;
  customerType?: string;
  status?: string;
}

export default function CustomersPage() {
  const { currentUser, isSuperAdmin, hasPermission } = useAuth();
  const [customers, setCustomers] = useState<EnrichedCustomer[]>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "COMMERCIAL" | "DIRECT">("ALL");
  const [viewMode, setViewMode] = useState<"card" | "table">("card");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  // Modals state
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<EnrichedCustomer | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<EnrichedCustomer | null>(null);

  const [customerForm, setCustomerForm] = useState({
    name: "",
    contactPerson: "",
    mobile: "",
    whatsapp: "",
    email: "",
    billingAddress: "",
    gstin: "",
    state: "Tamil Nadu",
    postalCode: "632001",
  });

  const loadCustomers = () => {
    fetch(`/api/customers?q=${encodeURIComponent(search)}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setCustomers(data);
      })
      .catch((err) => console.error("Error loading customers:", err));
  };

  useEffect(() => {
    loadCustomers();
  }, [search]);

  // Reset page when search or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterType]);

  // Filtered dataset
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      if (filterType === "COMMERCIAL") return !!c.gstin;
      if (filterType === "DIRECT") return !c.gstin;
      return true;
    });
  }, [customers, filterType]);

  // Pagination slice
  const totalPages = Math.ceil(filteredCustomers.length / pageSize) || 1;
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCustomers.slice(start, start + pageSize);
  }, [filteredCustomers, currentPage, pageSize]);

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customerForm),
      });
      if (res.ok) {
        alert("Customer created successfully!");
        setShowAddCustomer(false);
        setCustomerForm({
          name: "",
          contactPerson: "",
          mobile: "",
          whatsapp: "",
          email: "",
          billingAddress: "",
          gstin: "",
          state: "Tamil Nadu",
          postalCode: "632001",
        });
        loadCustomers();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to create customer");
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    try {
      const res = await fetch(`/api/customers/${editingCustomer.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingCustomer),
      });
      if (res.ok) {
        alert("Customer updated successfully!");
        setEditingCustomer(null);
        loadCustomers();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to update customer");
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Permission Guard: customers:view required
  if (!isSuperAdmin && !hasPermission("customers:view")) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4">
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-8 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-amber-900">Access Denied: Customer Master Access Restricted</h2>
          <p className="text-sm text-amber-800 max-w-lg mx-auto">
            Your current account (<strong>{currentUser?.name || "User"}</strong>, role: {currentUser?.role || "GUEST"}) does not have the <strong>View Customers</strong> permission.
          </p>
          <p className="text-xs text-amber-700 font-medium">
            Contact the Super Administrator or switch accounts to view customers.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header & View Switcher */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Users className="w-6 h-6 text-blue-600" />
            Customer Master & Ledger Directory
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage customer directories, addresses, GSTIN credentials, transaction volume, and outstanding balances.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-stretch sm:self-auto justify-between sm:justify-end">
          {/* View Selector Toggle */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
            <button
              onClick={() => setViewMode("card")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                viewMode === "card"
                  ? "bg-white text-blue-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Card View</span>
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                viewMode === "table"
                  ? "bg-white text-blue-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Table View</span>
            </button>
          </div>

          {(isSuperAdmin || hasPermission("customers:create")) && (
            <button
              onClick={() => setShowAddCustomer(true)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Customer</span>
              <span className="sm:hidden">Add</span>
            </button>
          )}
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white border border-slate-200 p-3 sm:p-4 rounded-xl shadow-xs flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by customer name, phone number, email, or GSTIN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All Customers ({customers.length})</option>
            <option value="COMMERCIAL">Commercial (GST Registered)</option>
            <option value="DIRECT">Direct / Retail (Non-GST)</option>
          </select>
        </div>
      </div>

      {/* Customer Count Summary */}
      <div className="flex items-center justify-between text-xs text-slate-500 px-1">
        <span>
          Showing {paginatedCustomers.length} of {filteredCustomers.length} customer records
        </span>
        {filteredCustomers.length > 0 && (
          <span>
            Page {currentPage} of {totalPages}
          </span>
        )}
      </div>

      {/* Content: Card View OR Table View */}
      {filteredCustomers.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
          <Users className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-base font-semibold text-slate-700">No Customers Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {search
              ? "No customers match your search criteria. Try a different query."
              : "No customer records currently exist. Click 'Add Customer' to create one."}
          </p>
        </div>
      ) : viewMode === "card" ? (
        /* CARD VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-5">
          {paginatedCustomers.map((c) => (
            <div
              key={c.id}
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:shadow-md transition flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-slate-900 truncate">{c.name}</h3>
                    {c.contactPerson && (
                      <p className="text-xs text-slate-500 font-medium">Attn: {c.contactPerson}</p>
                    )}
                  </div>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                      c.gstin
                        ? "bg-purple-50 text-purple-700 border border-purple-200"
                        : "bg-blue-50 text-blue-700 border border-blue-200"
                    }`}
                  >
                    {c.customerType || (c.gstin ? "Commercial (GST)" : "Direct / Retail")}
                  </span>
                </div>

                {/* Contact & GSTIN */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-1.5 truncate">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-medium text-slate-800">{c.mobile}</span>
                  </div>
                  {c.email ? (
                    <div className="flex items-center gap-1.5 truncate">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{c.email}</span>
                    </div>
                  ) : (
                    <div className="text-slate-400 text-[11px] italic">No email recorded</div>
                  )}
                  {c.gstin ? (
                    <div className="sm:col-span-2 text-[11px] font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                      GSTIN: {c.gstin}
                    </div>
                  ) : null}
                </div>

                {/* Address */}
                <div className="text-xs text-slate-600">
                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">
                    Billing Address
                  </div>
                  <p className="line-clamp-2 text-slate-700">{c.billingAddress}</p>
                </div>

                {/* Transaction Stats */}
                <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Bills</span>
                    <span className="font-bold text-slate-800">{c.totalBills ?? 0}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Outstanding Balance</span>
                    <span
                      className={`font-bold ${
                        (c.outstandingBalance || 0) > 0 ? "text-amber-600 font-mono" : "text-emerald-600"
                      }`}
                    >
                      ₹{(c.outstandingBalance || 0).toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  onClick={() => setViewingCustomer(c)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
                >
                  <Eye className="w-3.5 h-3.5 text-slate-500" />
                  <span>View Details</span>
                </button>
                {(isSuperAdmin || hasPermission("customers:edit")) && (
                  <button
                    onClick={() => setEditingCustomer(c)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-blue-500" />
                    <span>Edit</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">Customer Name</th>
                  <th className="py-3 px-4">Phone Number</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Customer Type</th>
                  <th className="py-3 px-4">GSTIN</th>
                  <th className="py-3 px-4">Address</th>
                  <th className="py-3 px-4 text-center">Total Bills</th>
                  <th className="py-3 px-4 text-right">Outstanding Balance</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedCustomers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{c.name}</div>
                      {c.contactPerson && (
                        <div className="text-[11px] text-slate-500">Attn: {c.contactPerson}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800 whitespace-nowrap">
                      {c.mobile}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {c.email ? <span className="truncate max-w-[150px] block">{c.email}</span> : "—"}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          c.gstin
                            ? "bg-purple-100 text-purple-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {c.customerType || (c.gstin ? "Commercial" : "Direct / Retail")}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] font-medium text-slate-700 whitespace-nowrap">
                      {c.gstin || "—"}
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-xs truncate" title={c.billingAddress}>
                      {c.billingAddress}
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-slate-800">
                      {c.totalBills ?? 0}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold whitespace-nowrap">
                      <span
                        className={
                          (c.outstandingBalance || 0) > 0 ? "text-amber-600" : "text-emerald-600"
                        }
                      >
                        ₹{(c.outstandingBalance || 0).toLocaleString("en-IN")}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        <span>{c.status || "Active"}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setViewingCustomer(c)}
                          title="View Details"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {(isSuperAdmin || hasPermission("customers:edit")) && (
                          <button
                            onClick={() => setEditingCustomer(c)}
                            title="Edit Customer"
                            className="p-1.5 rounded-lg text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white border border-slate-200 px-4 py-3 rounded-xl shadow-xs">
          <div className="text-xs text-slate-500">
            Showing Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* VIEW CUSTOMER MODAL */}
      {viewingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900">{viewingCustomer.name}</h3>
                <p className="text-xs text-slate-500 font-medium">Customer Profile & Summary</p>
              </div>
              <button
                onClick={() => setViewingCustomer(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Contact Person</span>
                  <span className="font-semibold text-slate-800">{viewingCustomer.contactPerson || "—"}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Customer Type</span>
                  <span className="font-semibold text-slate-800">{viewingCustomer.customerType}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Mobile Phone</span>
                  <span className="font-semibold text-slate-800">{viewingCustomer.mobile}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">WhatsApp</span>
                  <span className="font-semibold text-slate-800">{viewingCustomer.whatsapp || "—"}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Email Address</span>
                  <span className="font-semibold text-slate-800">{viewingCustomer.email || "—"}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">GSTIN</span>
                  <span className="font-mono font-bold text-slate-800">{viewingCustomer.gstin || "—"}</span>
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Billing Address</span>
                <p className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-700">
                  {viewingCustomer.billingAddress}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                <div>
                  <span className="text-[10px] uppercase font-bold text-blue-600 block">Total Bills Recorded</span>
                  <span className="text-lg font-bold text-slate-900">{viewingCustomer.totalBills ?? 0}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-blue-600 block">Net Outstanding Balance</span>
                  <span className="text-lg font-mono font-bold text-amber-700">
                    ₹{(viewingCustomer.outstandingBalance || 0).toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setViewingCustomer(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
              >
                Close
              </button>
              {(isSuperAdmin || hasPermission("customers:edit")) && (
                <button
                  onClick={() => {
                    const toEdit = viewingCustomer;
                    setViewingCustomer(null);
                    setEditingCustomer(toEdit);
                  }}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
                >
                  Edit Customer
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* EDIT CUSTOMER MODAL */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-lg w-full my-8 space-y-4 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-blue-600" />
                Edit Customer Details
              </h3>
              <button
                onClick={() => setEditingCustomer(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateCustomer} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Customer / Organization Name *</label>
                <input
                  type="text"
                  value={editingCustomer.name}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Mobile Phone *</label>
                  <input
                    type="text"
                    value={editingCustomer.mobile}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, mobile: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">WhatsApp Number</label>
                  <input
                    type="text"
                    value={editingCustomer.whatsapp || ""}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, whatsapp: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Email Address</label>
                  <input
                    type="email"
                    value={editingCustomer.email || ""}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, email: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">GSTIN (Optional)</label>
                  <input
                    type="text"
                    value={editingCustomer.gstin || ""}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, gstin: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Contact Person</label>
                <input
                  type="text"
                  value={editingCustomer.contactPerson || ""}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, contactPerson: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Billing Address *</label>
                <textarea
                  value={editingCustomer.billingAddress}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, billingAddress: e.target.value })}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingCustomer(null)}
                  className="px-4 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs transition"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD CUSTOMER MODAL */}
      {showAddCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-lg w-full my-8 space-y-4 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" />
                Add New Customer Master
              </h3>
              <button
                onClick={() => setShowAddCustomer(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Customer / Organization Name *</label>
                <input
                  type="text"
                  value={customerForm.name}
                  onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                  placeholder="e.g. ABC Hotels, CMC Vellore Association"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Mobile Number *</label>
                  <input
                    type="text"
                    value={customerForm.mobile}
                    onChange={(e) => setCustomerForm({ ...customerForm, mobile: e.target.value })}
                    placeholder="10-digit mobile number"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">WhatsApp Number</label>
                  <input
                    type="text"
                    value={customerForm.whatsapp}
                    onChange={(e) => setCustomerForm({ ...customerForm, whatsapp: e.target.value })}
                    placeholder="WhatsApp number if different"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Email Address</label>
                  <input
                    type="email"
                    value={customerForm.email}
                    onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                    placeholder="e.g. contact@domain.com"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">GSTIN (Optional)</label>
                  <input
                    type="text"
                    value={customerForm.gstin}
                    onChange={(e) => setCustomerForm({ ...customerForm, gstin: e.target.value })}
                    placeholder="e.g. 33AAAAA0000A1Z5"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Contact Person</label>
                <input
                  type="text"
                  value={customerForm.contactPerson}
                  onChange={(e) => setCustomerForm({ ...customerForm, contactPerson: e.target.value })}
                  placeholder="Primary liaison or event manager"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Billing Address *</label>
                <textarea
                  value={customerForm.billingAddress}
                  onChange={(e) => setCustomerForm({ ...customerForm, billingAddress: e.target.value })}
                  placeholder="Registered billing address"
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddCustomer(false)}
                  className="px-4 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs transition"
                >
                  Save Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
