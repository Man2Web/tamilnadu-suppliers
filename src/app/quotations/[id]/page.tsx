"use client";

import React, { useEffect, useState, useRef, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  Building2,
  Calendar,
  User,
  MapPin,
  Clock,
  Plus,
  Trash2,
  Download,
  Share2,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  History,
  Layers,
  Edit3,
  Check,
  X,
  CreditCard,
  DollarSign,
  Receipt,
  Eye,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Quotation, Product, Company, Customer, QuotationItem } from "@/lib/types";
import {
  calculateRentalDays,
  calculateDocumentFinancials,
  isGstRegistered,
  formatINR,
  numberToIndianWords,
} from "@/lib/calculations/financial";
import { useAuth } from "@/lib/auth/AuthContext";
import { DocumentActivityHistory } from "@/components/history/DocumentActivityHistory";

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

export default function QuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const resolvedParams = use(params);
  const quotationId = resolvedParams.id;
  const { isSuperAdmin } = useAuth();

  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reference lists for dropdowns
  const [products, setProducts] = useState<Product[]>([]);

  // Editable Form State
  const [quotationDate, setQuotationDate] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [rentalStartDate, setRentalStartDate] = useState("");
  const [rentalEndDate, setRentalEndDate] = useState("");
  const [rentalDays, setRentalDays] = useState(1);
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [eventName, setEventName] = useState("");
  const [placeOfSupply, setPlaceOfSupply] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerGstin, setCustomerGstin] = useState("");

  // Single unified ordered sequence of products and document notes
  const [lines, setLines] = useState<FormLine[]>([]);

  const [transportCharges, setTransportCharges] = useState(0);
  const [loadingCharges, setLoadingCharges] = useState(0);
  const [laborCharges, setLaborCharges] = useState(0);
  const [otherCharges, setOtherCharges] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [advanceRequired, setAdvanceRequired] = useState(0);
  const [securityDepositRequired, setSecurityDepositRequired] = useState(0);

  // Autosave State
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveVersionRef = useRef<number>(0);

  // State ref for latest values during autosave debouncing
  const stateRef = useRef({
    quotationDate,
    validUntil,
    rentalStartDate,
    rentalEndDate,
    rentalDays,
    deliveryLocation,
    eventName,
    placeOfSupply,
    customerName,
    customerPhone,
    customerAddress,
    customerGstin,
    lines,
    transportCharges,
    loadingCharges,
    laborCharges,
    otherCharges,
    discountAmount,
    advanceRequired,
    securityDepositRequired,
  });

  useEffect(() => {
    stateRef.current = {
      quotationDate,
      validUntil,
      rentalStartDate,
      rentalEndDate,
      rentalDays,
      deliveryLocation,
      eventName,
      placeOfSupply,
      customerName,
      customerPhone,
      customerAddress,
      customerGstin,
      lines,
      transportCharges,
      loadingCharges,
      laborCharges,
      otherCharges,
      discountAmount,
      advanceRequired,
      securityDepositRequired,
    };
  });

  // Modal States
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [advancePaidInput, setAdvancePaidInput] = useState<number>(0);
  const [paymentModeInput, setPaymentModeInput] = useState<string>("CASH");
  const [converting, setConverting] = useState(false);

  const [showReviseModal, setShowReviseModal] = useState(false);
  const [revisionNotesInput, setRevisionNotesInput] = useState("");
  const [revising, setRevising] = useState(false);

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  // Authoritative Converted Status
  const isConverted = quotation
    ? quotation.status === "CONVERTED" || Boolean(quotation.convertedBillId)
    : false;
  const isCancelled = quotation ? quotation.status === "CANCELLED" : false;
  const canEdit = !isConverted && !isCancelled;

  // Fetch Quotation Data
  const fetchQuotation = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/quotations/${quotationId}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to load quotation");
      }
      const data: Quotation = await res.json();
      setQuotation(data);

      // Populate Form State
      setQuotationDate(data.quotationDate || "");
      setValidUntil(data.validUntil || data.expectedReturnDate || data.rentalEndDate || "");
      setRentalStartDate(data.rentalStartDate || "");
      setRentalEndDate(data.rentalEndDate || "");
      setRentalDays(data.rentalDays || 1);
      setDeliveryLocation(data.deliveryLocation || "");
      setEventName(data.eventName || "");
      setPlaceOfSupply(data.placeOfSupply || "Vellore");

      setCustomerName(data.customerName || "");
      setCustomerPhone(data.customerPhone || "");
      setCustomerAddress(data.customerAddress || "");
      setCustomerGstin(data.customerGstin || "");

      // Populate Ordered Lines (Products + Document Notes)
      let initialLines: FormLine[] = [];
      if (data.documentLines && data.documentLines.length > 0) {
        initialLines = data.documentLines.map((l, idx) => ({
          id: l.id || `line-${idx}-${Date.now()}`,
          entryType: l.entryType || (l.productId ? "product" : "note"),
          position: l.position || idx + 1,
          text: l.text || (l.entryType === "note" ? l.itemName : ""),
          productId: l.productId || "",
          itemName: l.itemName || (l.entryType === "note" ? (l.text || "Note") : ""),
          sizeSpec: l.sizeSpec || "",
          quantity: l.quantity ?? (l.entryType === "note" ? 0 : 1),
          days: l.days ?? (l.entryType === "note" ? 0 : data.rentalDays || 1),
          unitPrice: l.unitPrice ?? 0,
          amount: l.amount ?? 0,
          deliveryLocation: l.deliveryLocation || data.deliveryLocation || "",
          notes: l.notes || "",
        }));
      } else {
        const rawItems = (data.items && data.items.length > 0)
          ? data.items
          : (data.branches || []).flatMap((b) => b.items || []);

        if (rawItems.some((it) => it.entryType === "note")) {
          initialLines = rawItems.map((it, idx) => ({
            id: it.id || `line-${idx}-${Date.now()}`,
            entryType: it.entryType || (it.productId ? "product" : "note"),
            position: it.position || it.itemOrder || idx + 1,
            text: it.text || (it.entryType === "note" ? it.itemName : ""),
            productId: it.productId || "",
            itemName: it.itemName || "",
            sizeSpec: it.sizeSpec || "",
            quantity: it.quantity ?? 1,
            days: it.days ?? data.rentalDays ?? 1,
            unitPrice: it.unitPrice ?? 0,
            amount: it.amount ?? 0,
            deliveryLocation: it.deliveryLocation || data.deliveryLocation || "",
            notes: it.notes || "",
          }));
        } else {
          // Backward compatibility: load products then notes
          const prodLines: FormLine[] = rawItems.map((it, idx) => ({
            id: it.id || `it-${idx}-${Date.now()}`,
            entryType: "product",
            position: idx + 1,
            productId: it.productId || "",
            itemName: it.itemName || "",
            sizeSpec: it.sizeSpec || "",
            quantity: it.quantity ?? 1,
            days: it.days ?? data.rentalDays ?? 1,
            unitPrice: it.unitPrice ?? 0,
            amount: it.amount ?? 0,
            deliveryLocation: it.deliveryLocation || data.deliveryLocation || "",
            notes: it.notes || "",
          }));

          const rawNotes = (data.notesList && data.notesList.length > 0)
            ? data.notesList
            : data.notes
            ? data.notes.split("\n").filter(Boolean)
            : [];

          const noteLines: FormLine[] = rawNotes.map((text, idx) => ({
            id: `note-${idx}-${Date.now()}`,
            entryType: "note",
            position: prodLines.length + idx + 1,
            text,
            itemName: text,
            quantity: 0,
            days: 0,
            unitPrice: 0,
            amount: 0,
          }));

          initialLines = [...prodLines, ...noteLines];
        }
      }

      initialLines.sort((a, b) => a.position - b.position);
      setLines(initialLines);

      setTransportCharges(data.transportCharges || 0);
      setLoadingCharges(data.loadingCharges || 0);
      setLaborCharges(data.laborCharges || 0);
      setOtherCharges(data.otherCharges || 0);
      setDiscountAmount(data.discountAmount || 0);
      setAdvanceRequired(data.advanceRequired || 0);
      setSecurityDepositRequired(data.securityDepositRequired || 0);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotation();
    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProducts(data);
      });
  }, [quotationId]);

  // Recalculate duration when dates change
  const handleStartDateChange = (val: string) => {
    setRentalStartDate(val);
    if (val && rentalEndDate) {
      const days = Math.max(1, calculateRentalDays(val, rentalEndDate)); // a same-day rental is billed as 1 day
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
    }
    triggerAutoSave();
  };

  const handleEndDateChange = (val: string) => {
    setRentalEndDate(val);
    if (rentalStartDate && val) {
      const days = Math.max(1, calculateRentalDays(rentalStartDate, val)); // a same-day rental is billed as 1 day
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
    }
    triggerAutoSave();
  };

  // Live item subtotal and recalculation ignoring note lines
  const itemsSubtotal = lines
    .filter((l) => l.entryType === "product")
    .reduce((sum, it) => sum + (it.amount || 0), 0);

  const liveFinancials = calculateDocumentFinancials({
    taxType: quotation?.taxType || "NON_GST",
    branchSubtotals: [itemsSubtotal],
    transportCharges,
    loadingCharges,
    laborCharges,
    otherCharges,
    discountAmount,
  });

  // Autosave execution - strictly disabled for converted quotations
  const triggerAutoSave = (immediate = false) => {
    if (!quotation || isConverted || quotation.status === "CANCELLED") return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    if (immediate) {
      performAutoSave();
    } else {
      setAutoSaveStatus("saving");
      saveTimeoutRef.current = setTimeout(() => {
        performAutoSave();
      }, 600);
    }
  };

  const performAutoSave = async () => {
    if (!quotation || isConverted || quotation.status === "CANCELLED") return;
    const version = ++saveVersionRef.current;
    setAutoSaveStatus("saving");
    setAutoSaveError(null);

    const cur = stateRef.current;
    const validLines = cur.lines.map((l, idx) => ({
      ...l,
      position: idx + 1,
    }));

    const validItems = validLines
      .filter(
        (l) =>
          (l.entryType === "product" && l.productId && (l.quantity || 0) > 0) ||
          (l.entryType === "note" && (l.text || "").trim().length > 0)
      )
      .map((l) => ({
        id: l.id,
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
        deliveryLocation: l.deliveryLocation || cur.deliveryLocation || null,
        notes: l.notes || null,
      }));

    const noteTexts = validLines
      .filter((l) => l.entryType === "note" && (l.text || "").trim())
      .map((l) => (l.text || "").trim());

    try {
      const payload = {
        action: "update",
        quotationDate: cur.quotationDate,
        validUntil: cur.validUntil,
        rentalStartDate: cur.rentalStartDate,
        rentalEndDate: cur.rentalEndDate,
        rentalDays: cur.rentalDays,
        expectedReturnDate: cur.rentalEndDate,
        deliveryLocation: cur.deliveryLocation.trim() || null,
        eventName: cur.eventName.trim() || null,
        placeOfSupply: cur.placeOfSupply.trim() || null,
        customerName: cur.customerName.trim(),
        customerPhone: cur.customerPhone.trim(),
        customerAddress: cur.customerAddress.trim(),
        customerGstin: cur.customerGstin.trim() || null,
        items: validItems,
        documentLines: validItems,
        notesList: noteTexts,
        notes: noteTexts.join("\n"),
        transportCharges: Number(cur.transportCharges) || 0,
        loadingCharges: Number(cur.loadingCharges) || 0,
        laborCharges: Number(cur.laborCharges) || 0,
        otherCharges: Number(cur.otherCharges) || 0,
        discountAmount: Number(cur.discountAmount) || 0,
        advanceRequired: Number(cur.advanceRequired) || 0,
        securityDepositRequired: Number(cur.securityDepositRequired) || 0,
      };

      const res = await fetch(`/api/quotations/${quotation.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save quotation changes");

      if (version === saveVersionRef.current) {
        setAutoSaveStatus("saved");
        setQuotation(data.quotation || data);
        setHistoryRefreshKey((k) => k + 1);
        setTimeout(() => {
          if (version === saveVersionRef.current) {
            setAutoSaveStatus("idle");
          }
        }, 2000);
      }
    } catch (e: any) {
      if (version === saveVersionRef.current) {
        setAutoSaveStatus("error");
        setAutoSaveError(e.message || "Failed to save quotation");
      }
    }
  };

  // Line Sequence Management: Add Item / Product
  const handleAddItem = () => {
    if (!canEdit) return;
    const newProd: FormLine = {
      id: `it-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      entryType: "product",
      position: lines.length + 1,
      productId: "",
      itemName: "",
      sizeSpec: "",
      quantity: 1,
      days: rentalDays,
      unitPrice: 0,
      amount: 0,
      deliveryLocation,
      notes: "",
    };
    setLines((prev) => [...prev, newProd]);
    triggerAutoSave();
  };

  // Line Sequence Management: Add Note
  const handleAddNote = (presetText?: string) => {
    if (!canEdit) return;
    const newNote: FormLine = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      entryType: "note",
      position: lines.length + 1,
      text: presetText || "",
      itemName: presetText || "",
      quantity: 0,
      days: 0,
      unitPrice: 0,
      amount: 0,
    };
    setLines((prev) => [...prev, newNote]);
    triggerAutoSave();
  };

  const handleRemoveLine = (lineId: string) => {
    if (!canEdit) return;
    setLines((prev) => {
      const filtered = prev.filter((l) => l.id !== lineId);
      return filtered.map((l, idx) => ({ ...l, position: idx + 1 }));
    });
    triggerAutoSave();
  };

  const handleMoveLine = (idx: number, direction: "up" | "down") => {
    if (!canEdit) return;
    setLines((prev) => {
      const next = [...prev];
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= next.length) return prev;
      const temp = next[idx];
      next[idx] = next[targetIdx];
      next[targetIdx] = temp;
      return next.map((l, i) => ({ ...l, position: i + 1 }));
    });
    triggerAutoSave();
  };

  const handleProductSelect = (lineId: string, prodId: string) => {
    if (!canEdit) return;
    const prod = products.find((p) => p.id === prodId);
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        const price = prod?.defaultRentalRate || 0;
        const q = l.quantity || 1;
        const d = l.days || rentalDays || 1;
        return {
          ...l,
          productId: prodId,
          itemName: prod?.name || "Rental Product",
          sizeSpec: prod?.sizeSpec || "",
          unitPrice: price,
          amount: Math.round(q * d * price * 100) / 100,
        };
      })
    );
    triggerAutoSave();
  };

  const handleProductFieldChange = (lineId: string, field: keyof FormLine, value: any) => {
    if (!canEdit) return;
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        const updated = { ...l, [field]: value };
        if (field === "quantity" || field === "days" || field === "unitPrice") {
          const q = Math.max(0, Number(field === "quantity" ? value : l.quantity) || 0);
          const d = Math.max(1, Number(field === "days" ? value : l.days) || 1);
          const p = Math.max(0, Number(field === "unitPrice" ? value : l.unitPrice) || 0);
          updated.amount = Math.round(q * d * p * 100) / 100;
        }
        return updated;
      })
    );
    triggerAutoSave();
  };

  const handleNoteTextChange = (lineId: string, text: string) => {
    if (!canEdit) return;
    setLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, text, itemName: text } : l))
    );
    triggerAutoSave();
  };

  // Quotation-to-Bill Conversion
  const handleConfirmConvert = async () => {
    if (!quotation || isConverted) return;
    setConverting(true);
    try {
      const res = await fetch(`/api/quotations/${quotation.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          advancePaid: advancePaidInput,
          paymentMethod: paymentModeInput,
        }),
      });
      const data = await res.json();
      if (data.success && data.bill?.id) {
        setShowConvertModal(false);
        router.push(`/bills/${data.bill.id}`);
      } else {
        alert(data.error || "Failed to convert quotation to bill.");
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setConverting(false);
    }
  };

  // Save Explicit New Revision
  const handleSaveRevision = async () => {
    if (!quotation || !canEdit) return;
    setRevising(true);
    try {
      const validLines = lines.map((l, idx) => ({ ...l, position: idx + 1 }));
      const validItems = validLines
        .filter(
          (l) =>
            (l.entryType === "product" && l.productId && (l.quantity || 0) > 0) ||
            (l.entryType === "note" && (l.text || "").trim().length > 0)
        )
        .map((l) => ({
          id: l.id,
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

      const noteTexts = validLines
        .filter((l) => l.entryType === "note" && (l.text || "").trim())
        .map((l) => (l.text || "").trim());

      const res = await fetch(`/api/quotations/${quotation.id}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: revisionNotesInput.trim() || "Customer requested changes",
          rentalStartDate,
          rentalEndDate,
          rentalDays,
          items: validItems,
          documentLines: validItems,
          notesList: noteTexts,
          transportCharges,
          loadingCharges,
          laborCharges,
          otherCharges,
          discountAmount,
          advanceRequired,
          securityDepositRequired,
        }),
      });
      const data = await res.json();
      if (data.success && data.quotation) {
        setQuotation(data.quotation);
        setShowReviseModal(false);
        setRevisionNotesInput("");
        alert(`New Revision Rev ${data.quotation.revisionNumber} saved successfully!`);
      } else {
        alert(data.error || "Failed to save revision");
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setRevising(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-12 text-center text-slate-500 font-medium">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600 mb-3" />
        Loading Quotation details...
      </div>
    );
  }

  if (error || !quotation) {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <div className="bg-rose-50 border border-rose-300 rounded-xl p-6 text-center text-rose-800">
          <AlertCircle className="w-10 h-10 text-rose-600 mx-auto mb-2" />
          <h2 className="text-base font-bold">Failed to Load Quotation</h2>
          <p className="text-xs mt-1">{error || "Quotation not found"}</p>
          <Link
            href="/quotations"
            className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 bg-rose-600 text-white rounded-lg text-xs font-semibold hover:bg-rose-700 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Quotations List
          </Link>
        </div>
      </div>
    );
  }

  const isGst = isGstRegistered(quotation.taxType);
  const comp = quotation.companySnapshot || {};

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-24">
      {/* Top Navigation & Status Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/quotations"
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition"
            title="Back to Quotations"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 font-mono tracking-tight">
                {quotation.quotationNumber}
              </h1>
              {(quotation.revisionNumber || 1) > 1 && (
                <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  Rev {quotation.revisionNumber}
                </span>
              )}
              <span
                className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border ${
                  isConverted
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : quotation.status === "ACCEPTED"
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : quotation.status === "SENT"
                    ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                    : quotation.status === "REQUIRES_REVISION"
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : quotation.status === "CANCELLED"
                    ? "bg-rose-50 text-rose-700 border-rose-200"
                    : "bg-slate-100 text-slate-700 border-slate-200"
                }`}
              >
                {isConverted ? "CONVERTED TO BILL" : quotation.status}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Issued by <strong className="text-slate-700">{comp.displayName || comp.name || "Tamilnadu Suppliers"}</strong> • {quotation.quotationDate}
            </p>
          </div>
        </div>

        {/* Header Autosave Status & Primary Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Autosave Status Indicator - shown only when editable */}
          {canEdit && (
            <div className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border mr-2 bg-slate-50 border-slate-200">
              {autoSaveStatus === "saving" && (
                <>
                  <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
                  <span className="text-indigo-600">Saving...</span>
                </>
              )}
              {autoSaveStatus === "saved" && (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Saved</span>
                </>
              )}
              {autoSaveStatus === "error" && (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                  <span className="text-rose-700">Save Failed</span>
                </>
              )}
              {autoSaveStatus === "idle" && (
                <span className="text-slate-400 font-normal">Auto-save ready</span>
              )}
            </div>
          )}

          {/* Download PDF Action - ALWAYS available */}
          <a
            href={`/api/documents/quotation/${quotation.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200 transition"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>Download PDF</span>
          </a>

          {/* Share via WhatsApp */}
          <a
            href={`https://wa.me/${quotation.customerPhone?.replace(/\D/g, "")}?text=${encodeURIComponent(
              `Hello ${quotation.customerName}, here is your rental quotation #${quotation.quotationNumber} from ${comp.displayName || "Tamilnadu Suppliers"}. Total Amount: ${formatINR(quotation.grandTotal)}. Valid for 7 days.`
            )}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-semibold border border-emerald-200 transition"
          >
            <Share2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>WhatsApp</span>
          </a>

          {/* Previous Revisions */}
          {quotation.revisionHistory && quotation.revisionHistory.length > 0 && (
            <button
              onClick={() => setShowHistoryModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-xs font-semibold border border-amber-200 transition"
            >
              <History className="w-3.5 h-3.5 text-amber-600" />
              <span>Revisions ({quotation.revisionHistory.length})</span>
            </button>
          )}

          {/* Activity History Link */}
          <a
            href="#document-activity-history-section"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-semibold border border-purple-200 transition"
          >
            <History className="w-3.5 h-3.5 text-purple-600" />
            <span>Activity History</span>
          </a>

          {/* Save New Revision Button - ONLY available before conversion */}
          {canEdit && (
            <button
              onClick={() => setShowReviseModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold border border-indigo-200 transition"
            >
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              <span>New Revision</span>
            </button>
          )}

          {/* Convert to Bill Button - ONLY available before conversion */}
          {canEdit && (
            <button
              onClick={() => {
                setAdvancePaidInput(quotation.advanceRequired || 0);
                setShowConvertModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Convert to Bill</span>
            </button>
          )}
        </div>
      </div>

      {/* Auto-Save Error Alert Banner */}
      {autoSaveError && (
        <div className="bg-rose-50 border border-rose-300 rounded-xl p-3 text-xs text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{autoSaveError}</span>
          </div>
          <button
            onClick={() => setAutoSaveError(null)}
            className="text-rose-600 hover:text-rose-800 font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Finalized / Converted Banner */}
      {isConverted && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <h3 className="text-xs font-bold text-emerald-900">
                Converted to Rental Bill #{quotation.convertedBillNumber || "GENERATED"}
              </h3>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                This quotation was officially converted into a bill. Further editing is locked to preserve legal & accounting records. View and PDF generation remain available.
              </p>
            </div>
          </div>
          {quotation.convertedBillId && (
            <Link
              href={`/bills/${quotation.convertedBillId}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition shrink-0"
            >
              <span>View Generated Bill</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      )}

      {/* Top 3 Information Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Quotation & Schedule */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <span>Quotation Schedule</span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Quotation Date:</span>
              {canEdit ? (
                <input
                  type="date"
                  value={quotationDate}
                  onChange={(e) => {
                    setQuotationDate(e.target.value);
                    triggerAutoSave();
                  }}
                  className="border border-slate-200 rounded px-2 py-0.5 text-xs text-slate-900 font-mono focus:ring-1 focus:ring-indigo-500"
                />
              ) : (
                <span className="font-mono font-semibold text-slate-800">{quotationDate}</span>
              )}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Rental Start:</span>
              {canEdit ? (
                <input
                  type="date"
                  value={rentalStartDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="border border-slate-200 rounded px-2 py-0.5 text-xs text-slate-900 font-mono focus:ring-1 focus:ring-indigo-500"
                />
              ) : (
                <span className="font-mono font-semibold text-slate-800">{rentalStartDate}</span>
              )}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Rental End:</span>
              {canEdit ? (
                <input
                  type="date"
                  value={rentalEndDate}
                  onChange={(e) => handleEndDateChange(e.target.value)}
                  className="border border-slate-200 rounded px-2 py-0.5 text-xs text-slate-900 font-mono focus:ring-1 focus:ring-indigo-500"
                />
              ) : (
                <span className="font-mono font-semibold text-slate-800">{rentalEndDate}</span>
              )}
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-slate-100">
              <span className="text-slate-500 font-medium">Total Duration:</span>
              <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded text-[11px]">
                {rentalDays} {rentalDays === 1 ? "Day" : "Days"}
              </span>
            </div>

            <div>
              <label className="block text-slate-500 font-medium">Delivery Location / Dept</label>
              {canEdit ? (
                <input
                  type="text"
                  value={deliveryLocation}
                  onChange={(e) => {
                    setDeliveryLocation(e.target.value);
                    triggerAutoSave();
                  }}
                  placeholder="e.g. Site 4, Mechanical Dept"
                  className="w-full mt-0.5 border border-slate-200 rounded px-2 py-1 text-slate-900 focus:ring-1 focus:ring-indigo-500"
                />
              ) : (
                <div className="font-semibold text-slate-900 mt-0.5">{deliveryLocation || "Standard Site"}</div>
              )}
            </div>

            <div>
              <label className="block text-slate-500 font-medium">Event Name / Reference</label>
              {canEdit ? (
                <input
                  type="text"
                  value={eventName}
                  onChange={(e) => {
                    setEventName(e.target.value);
                    triggerAutoSave();
                  }}
                  placeholder="e.g. Vellore Tech Summit"
                  className="w-full mt-0.5 border border-slate-200 rounded px-2 py-1 text-slate-900 focus:ring-1 focus:ring-indigo-500"
                />
              ) : (
                <div className="font-semibold text-slate-900 mt-0.5">{eventName || "—"}</div>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: Customer Details */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
            <User className="w-4 h-4 text-indigo-600" />
            <span>Customer Information</span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div>
              <label className="block text-slate-500 font-medium">Customer Name *</label>
              {canEdit ? (
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    triggerAutoSave();
                  }}
                  className="w-full mt-0.5 border border-slate-200 rounded px-2 py-1 font-semibold text-slate-900 focus:ring-1 focus:ring-indigo-500"
                  required
                />
              ) : (
                <div className="font-bold text-slate-900 text-sm mt-0.5">{customerName}</div>
              )}
            </div>

            <div>
              <label className="block text-slate-500 font-medium">Mobile Contact *</label>
              {canEdit ? (
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => {
                    setCustomerPhone(e.target.value);
                    triggerAutoSave();
                  }}
                  className="w-full mt-0.5 border border-slate-200 rounded px-2 py-1 font-mono text-slate-900 focus:ring-1 focus:ring-indigo-500"
                  required
                />
              ) : (
                <div className="font-mono text-slate-800 mt-0.5">{customerPhone}</div>
              )}
            </div>

            <div>
              <label className="block text-slate-500 font-medium">Billing Address</label>
              {canEdit ? (
                <textarea
                  value={customerAddress}
                  onChange={(e) => {
                    setCustomerAddress(e.target.value);
                    triggerAutoSave();
                  }}
                  rows={2}
                  className="w-full mt-0.5 border border-slate-200 rounded px-2 py-1 text-slate-900 focus:ring-1 focus:ring-indigo-500"
                />
              ) : (
                <div className="text-slate-700 mt-0.5">{customerAddress || "Vellore, Tamil Nadu"}</div>
              )}
            </div>

            <div>
              <label className="block text-slate-500 font-medium">Customer GSTIN</label>
              {canEdit ? (
                <input
                  type="text"
                  value={customerGstin}
                  onChange={(e) => {
                    setCustomerGstin(e.target.value);
                    triggerAutoSave();
                  }}
                  placeholder="e.g. 33AAAAA0000A1Z5"
                  className="w-full mt-0.5 border border-slate-200 rounded px-2 py-1 font-mono text-slate-900 focus:ring-1 focus:ring-indigo-500 uppercase"
                />
              ) : (
                <div className="font-mono text-slate-700 mt-0.5">{customerGstin || "Unregistered / Consumer"}</div>
              )}
            </div>
          </div>
        </div>

        {/* Card 3: Issuing Company Profile */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
            <Building2 className="w-4 h-4 text-indigo-600" />
            <span>Issuing Company (Snapshot)</span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="font-bold text-sm text-slate-900">
              {comp.displayName || comp.name || "TAMILNADU SUPPLIERS"}
            </div>
            <div className="text-slate-600">
              {comp.address || "Vellore, Tamil Nadu - 632012"}
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>Phone:</span>
              <span className="font-mono font-semibold">{comp.phone || "9842345678"}</span>
            </div>
            {comp.gstin && (
              <div className="flex items-center justify-between text-slate-600">
                <span>GSTIN:</span>
                <span className="font-mono font-bold text-slate-900">{comp.gstin}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-1 border-t border-slate-100">
              <span className="text-slate-500 font-medium">Tax Registration:</span>
              <span
                className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                  isGst
                    ? "bg-purple-50 text-purple-700 border border-purple-200"
                    : "bg-amber-50 text-amber-800 border border-amber-200"
                }`}
              >
                {isGst ? "GST REGISTERED (18%)" : "NON-GST RENTAL"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Place of Supply:</span>
              <span className="font-semibold text-slate-800">{quotation.placeOfSupply || "Tamil Nadu"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Unified Rental Items & Document Notes Area */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50/70">
          <div>
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>Rental Items & Document Notes</span>
              <span className="text-[11px] font-normal text-slate-500">
                ({lines.filter((l) => l.entryType === "product").length} products, {lines.filter((l) => l.entryType === "note").length} notes)
              </span>
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Add products and inline document notes in any alternating order. The exact sequence is permanently preserved in the ERP and PDF.
            </p>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleAddNote()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold border border-slate-300 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Note</span>
              </button>
              <button
                type="button"
                onClick={handleAddItem}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Item / Product</span>
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                <th className="py-2.5 px-3 w-10 text-center">#</th>
                <th className="py-2.5 px-3 min-w-[220px]">Product / Document Line Description</th>
                <th className="py-2.5 px-3 min-w-[140px]">Delivery Location</th>
                <th className="py-2.5 px-3 text-center w-24">Qty</th>
                <th className="py-2.5 px-3 text-center w-24">Days</th>
                <th className="py-2.5 px-3 text-right w-28">Daily Rate (₹)</th>
                <th className="py-2.5 px-3 text-right w-32">Amount (₹)</th>
                {canEdit && <th className="py-2.5 px-3 text-center w-20">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 8 : 7} className="py-8 text-center text-slate-400">
                    No rental items or notes added yet. Click &quot;+ Add Item / Product&quot; or &quot;+ Add Note&quot; to begin.
                  </td>
                </tr>
              ) : (
                lines.map((line, idx) => {
                  if (line.entryType === "note") {
                    return (
                      <tr key={line.id} className="bg-amber-50/40 hover:bg-amber-50/70 transition border-y border-amber-200/50">
                        <td className="py-2.5 px-3 text-center text-amber-800 font-mono font-bold">
                          {idx + 1}
                        </td>
                        <td colSpan={6} className="py-2 px-3">
                          {canEdit ? (
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black uppercase tracking-wider bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded shrink-0">
                                Note
                              </span>
                              <input
                                type="text"
                                value={line.text || ""}
                                onChange={(e) => handleNoteTextChange(line.id, e.target.value)}
                                placeholder="e.g. VIT College — Main Auditorium or Deliver before 8:00 AM"
                                className="w-full bg-white border border-amber-300 rounded px-2.5 py-1 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 py-1">
                              <span className="text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 px-2 py-0.5 rounded shrink-0">
                                Note
                              </span>
                              <span className="font-semibold text-slate-900 text-xs">
                                {line.text || line.itemName}
                              </span>
                            </div>
                          )}
                        </td>
                        {canEdit && (
                          <td className="py-2 px-3 text-center">
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
                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                                title="Remove Note"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  }

                  // Product Row
                  return (
                    <tr key={line.id} className="hover:bg-slate-50/50 transition">
                      <td className="py-2.5 px-3 text-center text-slate-400 font-mono">
                        {idx + 1}
                      </td>

                      {/* Product Name & Size Spec */}
                      <td className="py-2.5 px-3">
                        {canEdit ? (
                          <div className="space-y-1">
                            <select
                              value={line.productId || ""}
                              onChange={(e) => handleProductSelect(line.id, e.target.value)}
                              className="w-full border border-slate-200 rounded px-2 py-1 text-xs font-semibold text-slate-900 bg-white focus:ring-1 focus:ring-indigo-500"
                            >
                              <option value="">-- Choose Rental Product --</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} {p.sizeSpec ? `(${p.sizeSpec})` : ""} — ₹{p.defaultRentalRate}/{p.unit}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={line.sizeSpec || ""}
                              onChange={(e) =>
                                handleProductFieldChange(line.id, "sizeSpec", e.target.value)
                              }
                              placeholder="Size / Spec (e.g. 4*18, 15kg)"
                              className="w-full border border-slate-200 rounded px-2 py-0.5 text-[11px] text-slate-600 focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                        ) : (
                          <div>
                            <div className="font-bold text-slate-900">{line.itemName}</div>
                            {line.sizeSpec && (
                              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                Spec: {line.sizeSpec}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Delivery Location */}
                      <td className="py-2.5 px-3">
                        {canEdit ? (
                          <input
                            type="text"
                            value={line.deliveryLocation || ""}
                            onChange={(e) =>
                              handleProductFieldChange(line.id, "deliveryLocation", e.target.value)
                            }
                            placeholder="e.g. Auditorium / Site"
                            className="w-full border border-slate-200 rounded px-2 py-1 text-xs text-slate-800 focus:ring-1 focus:ring-indigo-500"
                          />
                        ) : (
                          <div className="text-slate-700 text-xs">
                            {line.deliveryLocation || deliveryLocation || "—"}
                          </div>
                        )}
                      </td>

                      {/* Quantity */}
                      <td className="py-2.5 px-3 text-center">
                        {canEdit ? (
                          <input
                            type="number"
                            min={1}
                            value={line.quantity || ""}
                            onChange={(e) =>
                              handleProductFieldChange(line.id, "quantity", e.target.value)
                            }
                            className="w-16 border border-slate-200 rounded px-1.5 py-1 text-center font-bold text-slate-900 focus:ring-1 focus:ring-indigo-500"
                          />
                        ) : (
                          <div className="font-bold font-mono text-slate-900">{line.quantity}</div>
                        )}
                      </td>

                      {/* Days */}
                      <td className="py-2.5 px-3 text-center">
                        {canEdit ? (
                          <input
                            type="number"
                            min={1}
                            value={line.days || ""}
                            onChange={(e) =>
                              handleProductFieldChange(line.id, "days", e.target.value)
                            }
                            className="w-14 border border-slate-200 rounded px-1.5 py-1 text-center font-semibold text-slate-800 focus:ring-1 focus:ring-indigo-500"
                          />
                        ) : (
                          <div className="font-semibold font-mono text-slate-700">{line.days}</div>
                        )}
                      </td>

                      {/* Daily Rate */}
                      <td className="py-2.5 px-3 text-right">
                        {canEdit ? (
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.unitPrice || ""}
                            onChange={(e) =>
                              handleProductFieldChange(line.id, "unitPrice", e.target.value)
                            }
                            className="w-20 border border-slate-200 rounded px-2 py-1 text-right font-mono text-slate-900 focus:ring-1 focus:ring-indigo-500"
                          />
                        ) : (
                          <div className="font-mono text-slate-800">
                            ₹{Number(line.unitPrice).toFixed(2)}
                          </div>
                        )}
                      </td>

                      {/* Calculated Amount */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        ₹{Number(line.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>

                      {/* Reorder and Delete Actions */}
                      {canEdit && (
                        <td className="py-2.5 px-3 text-center">
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
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                              title="Remove Item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Grid: Terms & Conditions + Financial Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Document Terms & Rental Conditions */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
            <FileText className="w-4 h-4 text-indigo-600" />
            <span>Rental Conditions & Company Policies</span>
          </div>

          <div className="space-y-2 text-xs text-slate-600">
            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
              <span className="font-semibold text-slate-800 block text-[11px] mb-1">Standard Rental Terms:</span>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600">
                <li>Material delivery subject to 100% advance or approved credit terms.</li>
                <li>Loading and unloading at delivery venue strictly in customer scope.</li>
                <li>Transportation charges extra as per actual distance and vehicle type.</li>
                <li>Breakages, burns, damages, or missing items charged as per replacement schedule.</li>
              </ul>
            </div>

            {canEdit && (
              <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
                <span className="text-[10px] text-slate-400 self-center">Quick Preset Notes:</span>
                <button
                  type="button"
                  onClick={() => handleAddNote("Transportation charges extra at actuals.")}
                  className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition"
                >
                  + Transport Extra
                </button>
                <button
                  type="button"
                  onClick={() => handleAddNote("Loading & Unloading at site in customer scope.")}
                  className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition"
                >
                  + Loading Scope
                </button>
                <button
                  type="button"
                  onClick={() => handleAddNote("100% advance required before material dispatch.")}
                  className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition"
                >
                  + Advance Mandatory
                </button>
                <button
                  type="button"
                  onClick={() => handleAddNote("Damage or missing materials charged as per replacement schedule.")}
                  className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition"
                >
                  + Breakage Policy
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Financial Summary Breakdown */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
            <DollarSign className="w-4 h-4 text-indigo-600" />
            <span>Financial Summary & Tax Details</span>
          </div>

          <div className="space-y-2 text-xs">
            {/* Products Subtotal */}
            <div className="flex items-center justify-between text-slate-700">
              <span>Products Subtotal:</span>
              <span className="font-mono font-semibold text-slate-900">
                ₹{liveFinancials.subtotal.toFixed(2)}
              </span>
            </div>

            {/* Transport Charges */}
            <div className="flex items-center justify-between text-slate-700">
              <span>Transportation Charges:</span>
              {canEdit ? (
                <input
                  type="number"
                  min={0}
                  value={transportCharges || ""}
                  onChange={(e) => {
                    setTransportCharges(Number(e.target.value) || 0);
                    triggerAutoSave();
                  }}
                  className="w-24 border border-slate-200 rounded px-2 py-0.5 text-right font-mono"
                  placeholder="0.00"
                />
              ) : (
                <span className="font-mono font-semibold text-slate-900">
                  ₹{transportCharges.toFixed(2)}
                </span>
              )}
            </div>

            {/* Loading Charges */}
            <div className="flex items-center justify-between text-slate-700">
              <span>Loading / Unloading:</span>
              {canEdit ? (
                <input
                  type="number"
                  min={0}
                  value={loadingCharges || ""}
                  onChange={(e) => {
                    setLoadingCharges(Number(e.target.value) || 0);
                    triggerAutoSave();
                  }}
                  className="w-24 border border-slate-200 rounded px-2 py-0.5 text-right font-mono"
                  placeholder="0.00"
                />
              ) : (
                <span className="font-mono font-semibold text-slate-900">
                  ₹{loadingCharges.toFixed(2)}
                </span>
              )}
            </div>

            {/* Labor Charges */}
            <div className="flex items-center justify-between text-slate-700">
              <span>Labor / Setup Charges:</span>
              {canEdit ? (
                <input
                  type="number"
                  min={0}
                  value={laborCharges || ""}
                  onChange={(e) => {
                    setLaborCharges(Number(e.target.value) || 0);
                    triggerAutoSave();
                  }}
                  className="w-24 border border-slate-200 rounded px-2 py-0.5 text-right font-mono"
                  placeholder="0.00"
                />
              ) : (
                <span className="font-mono font-semibold text-slate-900">
                  ₹{laborCharges.toFixed(2)}
                </span>
              )}
            </div>

            {/* Other Charges */}
            <div className="flex items-center justify-between text-slate-700">
              <span>Other Charges:</span>
              {canEdit ? (
                <input
                  type="number"
                  min={0}
                  value={otherCharges || ""}
                  onChange={(e) => {
                    setOtherCharges(Number(e.target.value) || 0);
                    triggerAutoSave();
                  }}
                  className="w-24 border border-slate-200 rounded px-2 py-0.5 text-right font-mono"
                  placeholder="0.00"
                />
              ) : (
                <span className="font-mono font-semibold text-slate-900">
                  ₹{otherCharges.toFixed(2)}
                </span>
              )}
            </div>

            {/* Discount */}
            <div className="flex items-center justify-between text-slate-700">
              <span>Special Discount:</span>
              {canEdit ? (
                <input
                  type="number"
                  min={0}
                  value={discountAmount || ""}
                  onChange={(e) => {
                    setDiscountAmount(Number(e.target.value) || 0);
                    triggerAutoSave();
                  }}
                  className="w-24 border border-slate-200 rounded px-2 py-0.5 text-right font-mono text-rose-600"
                  placeholder="0.00"
                />
              ) : (
                <span className="font-mono text-rose-600">
                  -₹{discountAmount.toFixed(2)}
                </span>
              )}
            </div>

            {/* Taxable Amount */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-100 font-semibold text-slate-800">
              <span>Taxable Value:</span>
              <span className="font-mono">₹{liveFinancials.taxableAmount.toFixed(2)}</span>
            </div>

            {/* GST Breakdown */}
            {isGst ? (
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1 text-[11px]">
                <div className="flex items-center justify-between text-slate-600">
                  <span>CGST ({liveFinancials.cgstRate}%):</span>
                  <span className="font-mono font-semibold">₹{liveFinancials.cgstAmount.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>SGST ({liveFinancials.sgstRate}%):</span>
                  <span className="font-mono font-semibold">₹{liveFinancials.sgstAmount.toFixed(2)}</span>
                </div>
                {liveFinancials.igstAmount > 0 && (
                  <div className="flex items-center justify-between text-slate-600">
                    <span>IGST ({liveFinancials.igstRate}%):</span>
                    <span className="font-mono font-semibold">₹{liveFinancials.igstAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between font-bold text-slate-700 pt-1 border-t border-slate-200">
                  <span>Total GST (18%):</span>
                  <span className="font-mono text-indigo-700">₹{liveFinancials.totalTax.toFixed(2)}</span>
                </div>
              </div>
            ) : (
              <div className="bg-amber-50/50 p-2 rounded border border-amber-200/50 text-[11px] text-amber-800">
                Non-GST Bill • GST not applicable
              </div>
            )}

            {/* Final Grand Total */}
            <div className="flex items-center justify-between pt-2 border-t-2 border-slate-200 text-sm font-bold text-indigo-900">
              <span>Quoted Grand Total:</span>
              <span className="font-mono text-base text-indigo-600">
                ₹{liveFinancials.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>

            {/* Amount In Words */}
            <div className="text-[11px] text-slate-500 italic bg-slate-50 p-2 rounded">
              {numberToIndianWords(liveFinancials.grandTotal)}
            </div>

            {/* Advance & Security Deposit Required */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-slate-500 font-medium text-[11px]">Advance Required (₹)</label>
                {canEdit ? (
                  <input
                    type="number"
                    min={0}
                    value={advanceRequired || ""}
                    onChange={(e) => {
                      setAdvanceRequired(Number(e.target.value) || 0);
                      triggerAutoSave();
                    }}
                    className="w-full mt-0.5 border border-slate-200 rounded px-2 py-1 font-mono font-semibold text-slate-900"
                    placeholder="0.00"
                  />
                ) : (
                  <div className="font-mono font-semibold text-slate-900 mt-0.5">
                    ₹{advanceRequired.toFixed(2)}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-slate-500 font-medium text-[11px]">Security Deposit (₹)</label>
                {canEdit ? (
                  <input
                    type="number"
                    min={0}
                    value={securityDepositRequired || ""}
                    onChange={(e) => {
                      setSecurityDepositRequired(Number(e.target.value) || 0);
                      triggerAutoSave();
                    }}
                    className="w-full mt-0.5 border border-slate-200 rounded px-2 py-1 font-mono font-semibold text-slate-900"
                    placeholder="0.00"
                  />
                ) : (
                  <div className="font-mono font-semibold text-slate-900 mt-0.5">
                    ₹{securityDepositRequired.toFixed(2)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Activity History Section */}
      <div className="pt-2">
        <DocumentActivityHistory
          entityType="QUOTATION"
          entityId={quotation.id}
          documentNumber={quotation.quotationNumber}
          isSuperAdmin={isSuperAdmin}
          refreshTrigger={historyRefreshKey}
        />
      </div>

      {/* Convert to Bill Modal */}
      {showConvertModal && canEdit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Convert Quotation to Bill
                </h3>
              </div>
              <button
                onClick={() => setShowConvertModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Converting quotation <strong className="text-slate-900">{quotation.quotationNumber}</strong> will create an official Rental Bill with all saved products, rates, dates, and locations.
            </p>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>Customer:</span>
                  <span className="font-semibold text-slate-900">{quotation.customerName}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Grand Total:</span>
                  <span className="font-mono font-bold text-slate-900">{formatINR(liveFinancials.grandTotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Recommended Advance:</span>
                  <span className="font-mono font-semibold text-emerald-700">{formatINR(advanceRequired)}</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Advance Paid Amount (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  max={liveFinancials.grandTotal}
                  value={advancePaidInput || ""}
                  onChange={(e) => setAdvancePaidInput(Number(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Payment Method</label>
                <select
                  value={paymentModeInput}
                  onChange={(e) => setPaymentModeInput(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI / GPay / PhonePe</option>
                  <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowConvertModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmConvert}
                disabled={converting}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition"
              >
                {converting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Converting...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Confirm & Generate Bill</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revise Modal */}
      {showReviseModal && canEdit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Save as New Revision (Rev {(quotation.revisionNumber || 1) + 1})
                </h3>
              </div>
              <button
                onClick={() => setShowReviseModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              This will snapshot the current state into revision history and increment the revision version counter.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason / Note for Revision
              </label>
              <textarea
                value={revisionNotesInput}
                onChange={(e) => setRevisionNotesInput(e.target.value)}
                placeholder="e.g. Customer requested 2 extra canopies and extended duration"
                rows={3}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowReviseModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveRevision}
                disabled={revising}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition"
              >
                {revising ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Revision</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revision History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl space-y-4 max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Revision History ({quotation.revisionHistory?.length || 0})
                </h3>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto space-y-3 pr-1 text-xs">
              {(quotation.revisionHistory || []).map((rev) => (
                <div
                  key={rev.revisionNumber}
                  className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-sm">
                      Rev {rev.revisionNumber}
                    </span>
                    <span className="text-slate-500 font-mono text-[11px]">
                      {rev.createdAt}
                    </span>
                  </div>
                  {rev.reason && (
                    <div className="text-slate-700 italic bg-white p-2 rounded border border-slate-100">
                      &quot;{rev.reason}&quot;
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[11px] text-slate-600">
                    <div>Days: <strong>{rev.rentalDays}</strong></div>
                    <div>Items: <strong>{(rev.items || []).length}</strong></div>
                    <div>Grand Total: <strong className="text-indigo-700">{formatINR(rev.grandTotal)}</strong></div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
