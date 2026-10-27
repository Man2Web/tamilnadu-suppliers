"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Plus,
  Trash2,
  Building2,
  Calendar,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Layers,
} from "lucide-react";
import { Company, Product, Customer } from "@/lib/types";
import {
  calculateRentalDays,
  calculateDocumentFinancials,
  formatINR,
} from "@/lib/calculations/financial";
import { generateUuid } from "@/lib/utils/uuid";

export interface FormLine {
  id: string;
  entryType: "product" | "note";
  position: number;
  text?: string;
  productId?: string;
  itemName?: string;
  sizeSpec?: string;
  quantity?: number;
  days?: number;
  unitPrice?: number;
  amount?: number;
  deliveryLocation?: string;
  notes?: string;
}

export default function CreateQuotationPage() {
  const router = useRouter();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerGstin, setCustomerGstin] = useState("");

  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [eventName, setEventName] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [quotationDate, setQuotationDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [rentalStartDate, setRentalStartDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [rentalEndDate, setRentalEndDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [rentalDays, setRentalDays] = useState(1);
  const [placeOfSupply, setPlaceOfSupply] = useState("Vellore");

  // Single unified ordered sequence of products and document notes
  const [lines, setLines] = useState<FormLine[]>([
    {
      id: generateUuid(),
      entryType: "product",
      position: 1,
      productId: "",
      itemName: "",
      sizeSpec: "",
      quantity: 1,
      days: 1,
      unitPrice: 0,
      amount: 0,
    },
  ]);

  // Charges
  const [transportCharges, setTransportCharges] = useState(0);
  const [loadingCharges, setLoadingCharges] = useState(0);
  const [laborCharges, setLaborCharges] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [advanceRequired, setAdvanceRequired] = useState(0);
  const [securityDepositRequired, setSecurityDepositRequired] = useState(0);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/companies")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setCompanies(data);
          if (data.length > 0) setSelectedCompanyId(data[0].id);
        }
      });

    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProducts(data);
      });

    fetch("/api/customers")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setCustomers(data);
      });
  }, []);

  useEffect(() => {
    const days = calculateRentalDays(rentalStartDate, rentalEndDate);
    setRentalDays(days);
    setLines((prev) =>
      prev.map((l) =>
        l.entryType === "product"
          ? {
              ...l,
              days,
              amount: Math.round((l.quantity || 1) * days * (l.unitPrice || 0) * 100) / 100,
            }
          : l
      )
    );
  }, [rentalStartDate, rentalEndDate]);

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) || companies[0];

  const handleCustomerSelect = (custId: string) => {
    setSelectedCustomerId(custId);
    const cust = customers.find((c) => c.id === custId);
    if (cust) {
      setCustomerName(cust.name);
      setCustomerPhone(cust.mobile);
      setCustomerAddress(cust.billingAddress);
      setCustomerGstin(cust.gstin || "");
    }
  };

  const handleAddItem = () => {
    setLines((prev) => [
      ...prev,
      {
        id: generateUuid(),
        entryType: "product",
        position: prev.length + 1,
        productId: "",
        itemName: "",
        sizeSpec: "",
        quantity: 1,
        days: rentalDays,
        unitPrice: 0,
        amount: 0,
      },
    ]);
  };

  const handleAddNote = () => {
    setLines((prev) => [
      ...prev,
      {
        id: generateUuid(),
        entryType: "note",
        position: prev.length + 1,
        text: "",
        itemName: "",
        quantity: 0,
        days: 0,
        unitPrice: 0,
        amount: 0,
      },
    ]);
  };

  const handleRemoveLine = (lineId: string) => {
    if (lines.length <= 1) return;
    setLines((prev) => {
      const filtered = prev.filter((l) => l.id !== lineId);
      return filtered.map((l, idx) => ({ ...l, position: idx + 1 }));
    });
  };

  const handleMoveLine = (idx: number, direction: "up" | "down") => {
    setLines((prev) => {
      const next = [...prev];
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= next.length) return prev;
      const temp = next[idx];
      next[idx] = next[targetIdx];
      next[targetIdx] = temp;
      return next.map((l, i) => ({ ...l, position: i + 1 }));
    });
  };

  const handleNoteTextChange = (lineId: string, text: string) => {
    setLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, text, itemName: text } : l))
    );
  };

  const handleProductSelect = (lineId: string, prodId: string) => {
    const prod = products.find((p) => p.id === prodId);
    setLines((prev) =>
      prev.map((it) => {
        if (it.id !== lineId) return it;
        const unitPrice = prod?.defaultRentalRate || 0;
        const q = it.quantity || 1;
        const d = it.days || rentalDays || 1;
        const amount = Math.round(q * d * unitPrice * 100) / 100;
        return {
          ...it,
          productId: prodId,
          itemName: prod?.name || "",
          sizeSpec: prod?.sizeSpec || "",
          unitPrice,
          amount,
        };
      })
    );
  };

  const handleItemChange = (lineId: string, field: keyof FormLine, value: any) => {
    setLines((prev) =>
      prev.map((it) => {
        if (it.id !== lineId) return it;
        const updated = { ...it, [field]: value };
        if (field === "quantity" || field === "days" || field === "unitPrice") {
          const q = Math.max(0, Number(field === "quantity" ? value : it.quantity) || 0);
          const d = Math.max(1, Number(field === "days" ? value : it.days) || 1);
          const p = Math.max(0, Number(field === "unitPrice" ? value : it.unitPrice) || 0);
          updated.amount = Math.round(q * d * p * 100) / 100;
        }
        return updated;
      })
    );
  };

  const itemsSubtotal = lines
    .filter((l) => l.entryType === "product")
    .reduce((sum, it) => sum + (it.amount || 0), 0);

  const financials = calculateDocumentFinancials({
    taxType: selectedCompany?.gstType || "NON_GST",
    branchSubtotals: [itemsSubtotal],
    transportCharges,
    loadingCharges,
    laborCharges,
    discountAmount,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedCompanyId) {
      setFormError("Issuing company is required. Please select a company.");
      return;
    }

    if (!customerName.trim() || !customerPhone.trim()) {
      setFormError("Customer name and phone number are required.");
      return;
    }

    const validLines = lines.map((l, idx) => ({ ...l, position: idx + 1 }));
    const validItems = validLines
      .filter(
        (l) =>
          (l.entryType === "product" && l.productId && (l.quantity || 0) > 0) ||
          (l.entryType === "note" && (l.text || "").trim().length > 0)
      )
      .map((l) => ({
        id: (l.id && l.id.length === 36 && !l.id.startsWith("it-") && !l.id.startsWith("note-")) ? l.id : generateUuid(),
        entryType: l.entryType,
        position: l.position,
        productId: l.entryType === "product" ? l.productId : undefined,
        itemName: l.entryType === "note" ? (l.text || "").trim() : l.itemName,
        text: l.entryType === "note" ? (l.text || "").trim() : undefined,
        sizeSpec: l.sizeSpec || "",
        quantity: l.entryType === "note" ? 0 : Number(l.quantity) || 1,
        days: l.entryType === "note" ? 0 : Number(l.days) || 1,
        unitPrice: l.entryType === "note" ? 0 : Number(l.unitPrice) || 0,
        amount: l.entryType === "note" ? 0 : Number(l.amount) || 0,
        deliveryLocation: l.deliveryLocation || deliveryLocation || null,
        notes: l.notes || null,
      }));

    if (!validItems.some((it) => it.entryType === "product")) {
      setFormError("Please add at least one valid rental item with quantity > 0.");
      return;
    }

    const validNotes = validLines
      .filter((l) => l.entryType === "note" && (l.text || "").trim())
      .map((l) => (l.text || "").trim());

    setSaving(true);
    try {
      const payload = {
        companyId: selectedCompanyId,
        customerId: selectedCustomerId || undefined,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        customerGstin: customerGstin.trim() || null,
        deliveryLocation: deliveryLocation.trim() || null,
        eventName: eventName.trim() || null,
        deliveryDate: deliveryDate || null,
        quotationDate,
        rentalStartDate,
        rentalEndDate,
        rentalDays,
        placeOfSupply,
        items: validItems,
        documentLines: validItems,
        notesList: validNotes,
        notes: validNotes.join("\n"),
        transportCharges: Number(transportCharges) || 0,
        loadingCharges: Number(loadingCharges) || 0,
        laborCharges: Number(laborCharges) || 0,
        discountAmount: Number(discountAmount) || 0,
        advanceRequired: Number(advanceRequired) || 0,
        securityDepositRequired: Number(securityDepositRequired) || 0,
      };

      const res = await fetch("/api/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data?.id) {
        router.push(`/quotations/${data.id}`);
      } else {
        const errorMsg = data.error || "Failed to create quotation in database.";
        setFormError(errorMsg);
        console.error("Quotation creation failed:", data);
      }
    } catch (e: any) {
      setFormError(e.message || "An unexpected network or system error occurred.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 bg-white">
      {/* Page Title */}
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <FileText className="w-5 h-5 text-indigo-600" />
          Create New Rental Quotation
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Generate an official estimate with alternating rental equipment and document notes in exact sequence.
        </p>
      </div>

      {formError && (
        <div className="p-3 bg-rose-50 border border-rose-300 rounded-lg text-rose-800 text-xs font-semibold flex items-center justify-between">
          <span>{formError}</span>
          <button
            type="button"
            onClick={() => setFormError(null)}
            className="text-rose-600 hover:text-rose-800 font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 text-xs">
        {/* Section 1: Company & Customer Details */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
          <div className="font-bold text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-2 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-600" />
              1. Issuing Company & Customer Information
            </span>
            {selectedCompany && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                selectedCompany.gstType === "GST_REGISTERED"
                  ? "bg-purple-50 text-purple-700 border-purple-200"
                  : "bg-amber-50 text-amber-800 border-amber-200"
              }`}>
                {selectedCompany.gstType === "GST_REGISTERED" ? "GST Registered (18%)" : "Non-GST Rental"}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Issuing Company Profile *
              </label>
              <select
                value={selectedCompanyId}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-medium"
                required
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName || c.name} ({c.gstType})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Select Existing Customer (Optional)
              </label>
              <select
                value={selectedCustomerId}
                onChange={(e) => handleCustomerSelect(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
              >
                <option value="">-- Choose Customer or Enter Below --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.mobile})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Customer Name *</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. VIT University"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-medium"
                required
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Mobile Contact *</label>
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="10-digit mobile"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Billing Address</label>
              <input
                type="text"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="Billing address"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Customer GSTIN</label>
              <input
                type="text"
                value={customerGstin}
                onChange={(e) => setCustomerGstin(e.target.value)}
                placeholder="GSTIN (optional)"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono uppercase"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Dates & Schedule */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
          <div className="font-bold text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-2 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-600" />
              2. Rental Dates & Event Schedule
            </span>
            <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
              {rentalDays} {rentalDays === 1 ? "Chargeable Day" : "Chargeable Days"}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Quotation Date</label>
              <input
                type="date"
                value={quotationDate}
                onChange={(e) => setQuotationDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Rental Start Date *</label>
              <input
                type="date"
                value={rentalStartDate}
                onChange={(e) => setRentalStartDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Rental End Date *</label>
              <input
                type="date"
                value={rentalEndDate}
                onChange={(e) => setRentalEndDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Delivery Location / Hall</label>
              <input
                type="text"
                value={deliveryLocation}
                onChange={(e) => setDeliveryLocation(e.target.value)}
                placeholder="e.g. Scudder Auditorium"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Event Name / Reference</label>
              <input
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="e.g. Annual Symposium / Conference"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Delivery Date (Optional)</label>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Rental Items & Document Notes */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span>Rental Items & Document Notes</span>
                <span className="text-[11px] font-normal text-slate-500">
                  ({lines.filter((l) => l.entryType === "product").length} products, {lines.filter((l) => l.entryType === "note").length} notes)
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Add products and notes in any order. The exact sequence is saved and rendered on the PDF.
              </p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleAddNote}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg border border-slate-300 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Note</span>
              </button>
              <button
                type="button"
                onClick={handleAddItem}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-lg shadow-xs transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Item / Product</span>
              </button>
            </div>
          </div>

          {/* Unified Items & Notes Sequence Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                <tr>
                  <th className="py-2.5 px-3 w-10 text-center">#</th>
                  <th className="py-2.5 px-3 min-w-[200px]">Product / Document Line Description</th>
                  <th className="py-2.5 px-3 w-28">Size / Spec</th>
                  <th className="py-2.5 px-3 min-w-[140px]">Delivery Loc / Dept</th>
                  <th className="py-2.5 px-3 w-20 text-center">Qty</th>
                  <th className="py-2.5 px-3 w-20 text-center">Days</th>
                  <th className="py-2.5 px-3 w-24 text-right">Rate (₹)</th>
                  <th className="py-2.5 px-3 w-24 text-right">Amount (₹)</th>
                  <th className="py-2.5 px-2 w-20 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((line, idx) => {
                  if (line.entryType === "note") {
                    return (
                      <tr key={line.id} className="bg-amber-50/40 hover:bg-amber-50/70 border-y border-amber-200/50">
                        <td className="p-2 text-center text-amber-800 font-mono font-bold">
                          {idx + 1}
                        </td>
                        <td colSpan={7} className="p-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wider bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded shrink-0">
                              Note
                            </span>
                            <input
                              type="text"
                              value={line.text || ""}
                              onChange={(e) => handleNoteTextChange(line.id, e.target.value)}
                              placeholder="e.g. VIT College — Main Auditorium or Deliver before 8:00 AM"
                              className="w-full bg-white border border-amber-300 rounded px-2.5 py-1 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                            />
                          </div>
                        </td>
                        <td className="p-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveLine(idx, "up")}
                              className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                              title="Move Up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === lines.length - 1}
                              onClick={() => handleMoveLine(idx, "down")}
                              className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                              title="Move Down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(line.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 transition"
                              title="Remove Note"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  // Product Row
                  return (
                    <tr key={line.id} className="hover:bg-slate-50/50">
                      <td className="p-2 text-center text-slate-400 font-mono">
                        {idx + 1}
                      </td>
                      <td className="p-2">
                        <select
                          value={line.productId}
                          onChange={(e) => handleProductSelect(line.id, e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 font-medium"
                          required
                        >
                          <option value="">-- Select Product --</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} {p.sizeSpec ? `(${p.sizeSpec})` : ""} - ₹{p.defaultRentalRate}/{p.unit}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={line.sizeSpec}
                          onChange={(e) => handleItemChange(line.id, "sizeSpec", e.target.value)}
                          placeholder="e.g. 4*18"
                          className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-slate-800"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={line.deliveryLocation || ""}
                          onChange={(e) => handleItemChange(line.id, "deliveryLocation", e.target.value)}
                          placeholder="Specific hall / room"
                          className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-slate-800"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <input
                          type="number"
                          min="1"
                          value={line.quantity || ""}
                          onChange={(e) => handleItemChange(line.id, "quantity", e.target.value)}
                          className="w-16 bg-white border border-slate-300 rounded px-2 py-1 text-slate-900 font-bold text-center"
                          required
                        />
                      </td>
                      <td className="p-2 text-center">
                        <input
                          type="number"
                          min="1"
                          value={line.days || ""}
                          onChange={(e) => handleItemChange(line.id, "days", e.target.value)}
                          className="w-14 bg-white border border-slate-300 rounded px-2 py-1 text-slate-900 font-bold text-center"
                          required
                        />
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unitPrice || ""}
                          onChange={(e) => handleItemChange(line.id, "unitPrice", e.target.value)}
                          className="w-20 bg-white border border-slate-300 rounded px-2 py-1 text-slate-900 font-mono text-right"
                          required
                        />
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-slate-900">
                        ₹{(line.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveLine(idx, "up")}
                            className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                            title="Move Up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === lines.length - 1}
                            onClick={() => handleMoveLine(idx, "down")}
                            className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                            title="Move Down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          {lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(line.id)}
                              className="p-1 text-slate-400 hover:text-red-600 transition"
                              title="Remove item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 4: Charges & Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Left: Additional Charges */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-3 text-xs">
            <div className="font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-1.5">
              4. Logistics & Extra Charges
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 mb-1">Transport Charges (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={transportCharges || ""}
                  onChange={(e) => setTransportCharges(Number(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">Loading Charges (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={loadingCharges || ""}
                  onChange={(e) => setLoadingCharges(Number(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">Labor Charges (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={laborCharges || ""}
                  onChange={(e) => setLaborCharges(Number(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">Discount (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={discountAmount || ""}
                  onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 font-mono text-rose-600"
                />
              </div>
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-slate-700 font-bold mb-1">Advance Required (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={advanceRequired || ""}
                  onChange={(e) => setAdvanceRequired(Number(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 font-mono font-bold text-indigo-700"
                />
              </div>
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-slate-700 font-bold mb-1">Security Deposit (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={securityDepositRequired || ""}
                  onChange={(e) => setSecurityDepositRequired(Number(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 font-mono font-bold text-amber-700"
                />
              </div>
            </div>
          </div>

          {/* Right: Financial Totals */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-2 text-xs">
            <div className="font-bold text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-1.5 flex justify-between">
              <span>Financial Summary</span>
              <span className="text-indigo-700">{selectedCompany?.displayName || selectedCompany?.name}</span>
            </div>

            <div className="space-y-1.5 pt-1 text-slate-700">
              <div className="flex justify-between">
                <span>Products Subtotal:</span>
                <span className="font-mono font-semibold">₹{itemsSubtotal.toFixed(2)}</span>
              </div>
              {transportCharges > 0 && (
                <div className="flex justify-between">
                  <span>Transport:</span>
                  <span className="font-mono">₹{transportCharges.toFixed(2)}</span>
                </div>
              )}
              {loadingCharges > 0 && (
                <div className="flex justify-between">
                  <span>Loading:</span>
                  <span className="font-mono">₹{loadingCharges.toFixed(2)}</span>
                </div>
              )}
              {laborCharges > 0 && (
                <div className="flex justify-between">
                  <span>Labor:</span>
                  <span className="font-mono">₹{laborCharges.toFixed(2)}</span>
                </div>
              )}
              {discountAmount > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>Discount:</span>
                  <span className="font-mono">-₹{discountAmount.toFixed(2)}</span>
                </div>
              )}

              {selectedCompany?.gstType === "GST_REGISTERED" && (
                <>
                  <div className="flex justify-between text-slate-600 pt-1 border-t border-slate-200">
                    <span>Taxable Value:</span>
                    <span className="font-mono">₹{financials.taxableAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>CGST ({financials.cgstRate}%):</span>
                    <span className="font-mono">₹{financials.cgstAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>SGST ({financials.sgstRate}%):</span>
                    <span className="font-mono">₹{financials.sgstAmount.toFixed(2)}</span>
                  </div>
                </>
              )}

              <div className="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t-2 border-slate-300">
                <span>Grand Total:</span>
                <span className="font-mono text-indigo-700 text-base">₹{financials.grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5"
          >
            <FileText className="w-4 h-4" />
            <span>{saving ? "Generating Quotation..." : "Create Quotation"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
