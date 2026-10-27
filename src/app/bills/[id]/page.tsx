"use client";

import React, { useEffect, useState, use } from "react";
import NumberInput from "@/components/ui/NumberInput";
import SearchableSelect from "@/components/ui/SearchableSelect";
import Link from "next/link";
import {
  Receipt,
  ArrowLeft,
  Truck,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Download,
  Share2,
  FileCheck,
  Calendar,
  Lock,
  PlusCircle,
  CreditCard,
  DollarSign,
  Info,
  ChevronDown,
  ChevronUp,
  XCircle,
  FileText,
  Trash2,
  Plus,
  ArrowUp,
  ArrowDown,
  Layers,
  History,
} from "lucide-react";
import { Bill, IncidentChargeStatus, Product } from "@/lib/types";
import { formatINR, calculateRentalDays } from "@/lib/calculations/financial";
import { useAuth } from "@/lib/auth/AuthContext";
import { DocumentActivityHistory } from "@/components/history/DocumentActivityHistory";

interface RowState {
  returnedGood: number;
  damaged: number;
  missing: number;
  physicalReturned?: number;
  damageChargeDecision: IncidentChargeStatus;
  damageChargeAmount: number;
  missingChargeDecision: IncidentChargeStatus;
  missingChargeAmount: number;
  damageNotes: string;
  missingNotes: string;
  deliveryLocation: string;
  pickupLocation: string;
  notes: string;
}

export default function BillWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const billId = resolvedParams.id;
  const { currentUser, isSuperAdmin, hasPermission, fetchWithAuth } = useAuth();

  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Silent, High-Performance Auto-Save Engine Refs
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const saveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const saveVersionRef = React.useRef<number>(0);
  const isSavingRef = React.useRef<boolean>(false);
  const hasPendingChangesRef = React.useRef<boolean>(false);
  const lastSavedPayloadRef = React.useRef<string>("");
  const retryCountRef = React.useRef<number>(0);
  const retryTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Clean up timers on unmount
  React.useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, []);

  // Return Date, Delivery Location, Event Name
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split("T")[0]);
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [eventName, setEventName] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [applyOverdueCharges, setApplyOverdueCharges] = useState(false);

  // Location filter for products table
  const [selectedLocationFilter, setSelectedLocationFilter] = useState("ALL");

  // Ordered bill lines (products and inline document notes)
  const [billLines, setBillLines] = useState<any[]>([]);

  // Compact Inline Table Row States (keyed by item id)
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});

  // Products reference for adding items
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);

  // Ref to hold live state for debounced auto-save
  const stateRef = React.useRef({
    rowStates,
    returnDate,
    deliveryLocation,
    eventName,
    deliveryDate,
    applyOverdueCharges,
    billLines,
  });

  // True once goods have left on a gate pass. From then on physical return quantities can only be changed through the
  // formal return endpoint, so the autosave must not resend them (the server rejects it).
  const dispatchedRef = React.useRef(false);

  // Keep stateRef up to date
  React.useEffect(() => {
    stateRef.current = {
      rowStates,
      returnDate,
      deliveryLocation,
      eventName,
      deliveryDate,
      applyOverdueCharges,
      billLines,
    };
  }, [rowStates, returnDate, deliveryLocation, eventName, deliveryDate, applyOverdueCharges, billLines]);

  // Inline Amend Panel State
  const [showAmendPanel, setShowAmendPanel] = useState(false);
  const [amendReason, setAmendReason] = useState("");
  const [amendReturnDate, setAmendReturnDate] = useState("");
  const [amendExtraDays, setAmendExtraDays] = useState(0);
  const [amendExtraCharges, setAmendExtraCharges] = useState(0);
  const [amendNotes, setAmendNotes] = useState("");

  // Inline Payment Panel State
  const [showPaymentPanel, setShowPaymentPanel] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentType, setPaymentType] = useState("RENTAL_PAYMENT");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  // Close Bill & Cash Payment Confirmation State
  const [closePaymentInFull, setClosePaymentInFull] = useState(false);
  const [closePaymentMethod, setClosePaymentMethod] = useState("CASH");
  const [closeAmountReceived, setCloseAmountReceived] = useState<number>(0);
  const [closePaymentDate, setClosePaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [closePaymentNotes, setClosePaymentNotes] = useState("");
  const [closureNotes, setClosureNotes] = useState("");

  // Quick WhatsApp Phone State
  const [showWhatsAppInput, setShowWhatsAppInput] = useState(false);
  const [whatsAppPhone, setWhatsAppPhone] = useState("");
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const fetchBill = async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth(`/api/bills/${billId}`);
      if (!res.ok) throw new Error("Bill not found");
      const data: Bill = await res.json();
      setBill(data);
      dispatchedRef.current =
        (data.totalDispatched || 0) > 0 || !["ACTIVE", "ISSUED", "DRAFT"].includes(String(data.status));

      if (data.expectedReturnDate) {
        setAmendReturnDate(data.expectedReturnDate);
      }
      if (data.actualReturnDate) {
        setReturnDate(data.actualReturnDate);
      }
      if (data.deliveryLocation) {
        setDeliveryLocation(data.deliveryLocation);
      }
      if (data.eventName) {
        setEventName(data.eventName);
      }
      if (data.deliveryDate) {
        setDeliveryDate(data.deliveryDate);
      }
      if (data.customerPhone) {
        setWhatsAppPhone(data.customerPhone);
      }
      if (data.balanceDue > 0) {
        setPaymentAmount(data.balanceDue);
        setCloseAmountReceived(data.balanceDue);
      } else {
        setPaymentAmount(0);
        setCloseAmountReceived(0);
      }

      // Populate bill lines preserving document notes and products
      const branchesList = data.branches || [];
      const flat = (data.documentLines && data.documentLines.length > 0)
        ? data.documentLines
        : branchesList.length > 0
        ? branchesList.flatMap((b: any) => b.items || [])
        : data.items || [];

      setBillLines(flat);

      // Populate row states for all items
      const initialStates: Record<string, RowState> = {};
      flat.forEach((item: any) => {
        const damageInc = data.incidents?.find(
          (inc) => inc.productId === item.productId && inc.type === "DAMAGED"
        );
        const missingInc = data.incidents?.find(
          (inc) => inc.productId === item.productId && inc.type === "MISSING"
        );

        const dispatchedQty = Math.max(0, Number(item.quantity || item.dispatchedQuantity || 0));
        let damagedQty = Math.max(0, Number(item.quantityDamaged ?? (damageInc?.quantityAffected || 0)));
        let missingQty = Math.max(0, Number(item.quantityMissing ?? (missingInc?.quantityAffected || 0)));

        // Never allow negative quantities or total of damaged + missing greater than dispatched quantity
        if (damagedQty + missingQty > dispatchedQty) {
          damagedQty = Math.min(dispatchedQty, damagedQty);
          missingQty = Math.max(0, dispatchedQty - damagedQty);
        }

        // Formula: Returned Good = Dispatched Quantity − Damaged Quantity − Missing Quantity
        const calculatedReturnedGood = item.entryType === "note" ? 0 : Math.max(0, dispatchedQty - damagedQty - missingQty);

        const damageDecision: IncidentChargeStatus =
          item.damageChargeDecision ||
          damageInc?.chargeApprovalStatus ||
          (item.chargeDecision && damagedQty > 0 ? item.chargeDecision : damagedQty > 0 ? "PENDING_DECISION" : "NO_CHARGE");

        const damageAmount =
          item.damageChargeAmount !== undefined
            ? item.damageChargeAmount
            : damageInc?.finalApprovedCharge || damageInc?.proposedCharge || (damagedQty > 0 ? item.chargeAmount || 0 : 0);

        const missingDecision: IncidentChargeStatus =
          item.missingChargeDecision ||
          missingInc?.chargeApprovalStatus ||
          (item.chargeDecision && missingQty > 0 ? item.chargeDecision : missingQty > 0 ? "PENDING_DECISION" : "NO_CHARGE");

        const missingAmount =
          item.missingChargeAmount !== undefined
            ? item.missingChargeAmount
            : missingInc?.finalApprovedCharge || missingInc?.proposedCharge || (missingQty > 0 ? item.chargeAmount || 0 : 0);

        initialStates[item.id] = {
          returnedGood: calculatedReturnedGood,
          damaged: damagedQty,
          missing: missingQty,
          physicalReturned: calculatedReturnedGood + damagedQty,
          damageChargeDecision: damageDecision,
          damageChargeAmount: damageAmount,
          missingChargeDecision: missingDecision,
          missingChargeAmount: missingAmount,
          damageNotes: item.damageNotes || damageInc?.description || "",
          missingNotes: item.missingNotes || missingInc?.description || "",
          deliveryLocation: item.deliveryLocation || data.deliveryLocation || "",
          pickupLocation: item.pickupLocation || item.deliveryLocation || data.deliveryLocation || "",
          notes: item.notes || item.text || "",
        };
      });
      setRowStates(initialStates);
      stateRef.current.rowStates = initialStates;
      stateRef.current.billLines = flat;
      stateRef.current.returnDate = data.actualReturnDate || new Date().toISOString().split("T")[0];
      stateRef.current.deliveryLocation = data.deliveryLocation || "";
      stateRef.current.eventName = data.eventName || "";
      stateRef.current.deliveryDate = data.deliveryDate || "";

      // Initialize snapshot baseline to prevent redundant saves on initial load
      const initialItemsPayload = flat.map((it, idx) => {
        const state = initialStates[it.id] || {
          returnedGood: 0,
          damaged: 0,
          missing: 0,
          physicalReturned: 0,
          damageChargeDecision: "NO_CHARGE",
          damageChargeAmount: 0,
          missingChargeDecision: "NO_CHARGE",
          missingChargeAmount: 0,
          damageNotes: "",
          missingNotes: "",
          deliveryLocation: it.deliveryLocation || "",
          pickupLocation: it.pickupLocation || it.deliveryLocation || "",
          notes: it.notes || it.text || "",
        };
        return {
          id: it.id,
          entryType: it.entryType || (it.productId ? "product" : "note"),
          position: idx + 1,
          productId: it.entryType === "note" ? undefined : it.productId,
          itemName: it.itemName,
          text: it.entryType === "note" ? (state.notes || it.text || it.itemName) : undefined,
          quantity: it.entryType === "note" ? 0 : it.quantity,
          days: it.entryType === "note" ? 0 : it.days,
          unitPrice: it.entryType === "note" ? 0 : it.unitPrice,
          amount: it.entryType === "note" ? 0 : it.amount,
          quantityPhysicallyReturned: state.physicalReturned,
          quantityReturnedGood: it.entryType === "note" ? 0 : state.returnedGood,
          quantityDamaged: it.entryType === "note" ? 0 : state.damaged,
          quantityMissing: it.entryType === "note" ? 0 : state.missing,
          damageChargeDecision: state.damageChargeDecision,
          damageChargeAmount: state.damageChargeAmount,
          missingChargeDecision: state.missingChargeDecision,
          missingChargeAmount: state.missingChargeAmount,
          damageNotes: state.damageNotes || state.notes || "",
          missingNotes: state.missingNotes || state.notes || "",
          deliveryLocation: state.deliveryLocation || it.deliveryLocation || "",
          pickupLocation: state.pickupLocation || state.deliveryLocation || "",
          notes: state.notes || "",
        };
      });

      lastSavedPayloadRef.current = JSON.stringify({
        actualReturnDate: stateRef.current.returnDate,
        deliveryLocation: stateRef.current.deliveryLocation,
        eventName: stateRef.current.eventName,
        deliveryDate: stateRef.current.deliveryDate,
        applyOverdueCharges: false,
        items: initialItemsPayload,
        documentLines: initialItemsPayload,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBill();
    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setAvailableProducts(data);
      });
  }, [billId]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-8 text-center text-slate-500 font-medium">
        Loading Rental Bill workspace...
      </div>
    );
  }

  if (error || !bill) {
    return (
      <div className="max-w-7xl mx-auto p-8 space-y-4">
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm">
          {error || "Bill not found"}
        </div>
        <Link
          href="/bills"
          className="inline-flex items-center gap-2 text-xs font-semibold text-blue-600 hover:underline"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Rental Register
        </Link>
      </div>
    );
  }

  const productLines = billLines.filter((l) => l.entryType !== "note");
  const canRecordReturn =
    ((bill.totalDispatched || 0) > 0 || !["ACTIVE", "ISSUED", "DRAFT"].includes(String(bill.status))) &&
    bill.status !== "CLOSED" &&
    bill.status !== "CANCELLED";
  // A bill that has not been dispatched yet has nothing dispatched or returned, whatever the pre-filled return fields say
  const isUndispatched = !bill.totalDispatched && (bill.status === "ACTIVE" || bill.status === "ISSUED");
  const totalDispatched = isUndispatched ? 0 : bill.totalDispatched || productLines.reduce((acc, it) => acc + (it.quantity || 0), 0);

  // Live row calculations
  let liveGood = 0;
  let liveDamaged = 0;
  let liveMissing = 0;
  let liveDamageCharges = 0;
  let liveMissingCharges = 0;

  productLines.forEach((it) => {
    const state = rowStates[it.id];
    if (state) {
      liveGood += state.returnedGood || 0;
      liveDamaged += state.damaged || 0;
      liveMissing += state.missing || 0;
      if (state.damageChargeDecision === "ADD_CHARGE") {
        liveDamageCharges += state.damageChargeAmount || 0;
      }
      if (state.missingChargeDecision === "ADD_CHARGE") {
        liveMissingCharges += state.missingChargeAmount || 0;
      }
    }
  });

  const totalAccounted = isUndispatched ? 0 : liveGood + liveDamaged + liveMissing;

  // Check if any product row has pending decisions
  const hasPendingDecisions = productLines.some((it) => {
    const state = rowStates[it.id];
    if (!state) return false;
    return (
      (state.damaged > 0 && state.damageChargeDecision === "PENDING_DECISION") ||
      (state.missing > 0 && state.missingChargeDecision === "PENDING_DECISION")
    );
  });

  // Unique delivery locations across all items for filtering
  const uniqueLocations = Array.from(
    new Set(
      billLines
        .map((it) => (rowStates[it.id]?.deliveryLocation || it.deliveryLocation || "").trim())
        .filter(Boolean)
    )
  );

  const displayedLines =
    selectedLocationFilter === "ALL"
      ? billLines
      : billLines.filter(
          (it) =>
            it.entryType === "note" ||
            (rowStates[it.id]?.deliveryLocation || it.deliveryLocation || "Unassigned").trim() ===
              selectedLocationFilter
        );

  // Status Badges
  const getOperationalStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
      case "ISSUED":
        return <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full font-bold text-xs">Issued</span>;
      case "OUT_ON_RENT":
        return <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full font-bold text-xs flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> Out on Rent</span>;
      case "PARTIALLY_RETURNED":
        return <span className="px-2.5 py-1 bg-orange-50 text-orange-700 border border-orange-200 rounded-full font-bold text-xs flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> Partially Returned</span>;
      case "RETURN_INSPECTION":
        return <span className="px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full font-bold text-xs flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Return Inspection</span>;
      case "PENDING_SETTLEMENT":
        return <span className="px-2.5 py-1 bg-yellow-50 text-yellow-800 border border-yellow-300 rounded-full font-bold text-xs flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Pending Settlement</span>;
      case "CLOSED":
        return <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-bold text-xs flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Closed</span>;
      case "CANCELLED":
        return <span className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-full font-bold text-xs">Cancelled</span>;
      default:
        return <span className="px-2.5 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-full font-bold text-xs">{status}</span>;
    }
  };

  const getPaymentStatusBadge = (status?: string) => {
    switch (status) {
      case "FULLY_PAID":
        return <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-bold text-xs flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Fully Paid</span>;
      case "OVERPAID":
        return <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full font-bold text-xs flex items-center gap-1"><DollarSign className="w-3 h-3" /> Overpaid / Credit Due</span>;
      case "PARTIALLY_PAID":
        return <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full font-bold text-xs flex items-center gap-1"><Clock className="w-3 h-3" /> Partially Paid</span>;
      default:
        return <span className="px-2.5 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-full font-bold text-xs">Unpaid</span>;
    }
  };

  // Silent, High-Performance Debounced Auto-Save Engine
  const triggerAutoSave = (immediate = false) => {
    if (!bill || bill.status === "CLOSED") return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    if (immediate) {
      performAutoSave();
    } else {
      saveTimeoutRef.current = setTimeout(() => {
        performAutoSave();
      }, 500); // 500ms debounce
    }
  };

  const performAutoSave = async () => {
    if (!bill || bill.status === "CLOSED") return;

    // Concurrency Lock: only one save in flight per bill at any time
    if (isSavingRef.current) {
      hasPendingChangesRef.current = true;
      return;
    }

    const cur = stateRef.current;
    const itemsPayload = cur.billLines.map((it, idx) => {
      const state = cur.rowStates[it.id] || {
        returnedGood: it.quantityReturnedGood ?? 0,
        damaged: it.quantityDamaged ?? 0,
        missing: it.quantityMissing ?? 0,
        physicalReturned: it.quantityPhysicallyReturned,
        damageChargeDecision: "NO_CHARGE",
        damageChargeAmount: 0,
        missingChargeDecision: "NO_CHARGE",
        missingChargeAmount: 0,
        damageNotes: "",
        missingNotes: "",
        deliveryLocation: it.deliveryLocation || "",
        pickupLocation: it.pickupLocation || it.deliveryLocation || "",
        notes: it.notes || it.text || "",
      };
      return {
        id: it.id,
        entryType: it.entryType || (it.productId ? "product" : "note"),
        position: idx + 1,
        productId: it.entryType === "note" ? undefined : it.productId,
        itemName: it.entryType === "note" ? (state.notes || it.text || it.itemName) : it.itemName,
        text: it.entryType === "note" ? (state.notes || it.text || it.itemName) : undefined,
        quantity: it.entryType === "note" ? 0 : it.quantity,
        days: it.entryType === "note" ? 0 : it.days,
        unitPrice: it.entryType === "note" ? 0 : it.unitPrice,
        amount: it.entryType === "note" ? 0 : it.amount,
        // Once dispatched, send what the server has already recorded; new returns go through "Record Return"
        quantityPhysicallyReturned: dispatchedRef.current ? it.quantityPhysicallyReturned : state.physicalReturned,
        quantityReturnedGood: it.entryType === "note" ? 0 : dispatchedRef.current ? it.quantityReturnedGood ?? 0 : state.returnedGood,
        quantityDamaged: it.entryType === "note" ? 0 : dispatchedRef.current ? it.quantityDamaged ?? 0 : state.damaged,
        quantityMissing: it.entryType === "note" ? 0 : dispatchedRef.current ? it.quantityMissing ?? 0 : state.missing,
        damageChargeDecision: state.damageChargeDecision,
        damageChargeAmount: state.damageChargeAmount,
        missingChargeDecision: state.missingChargeDecision,
        missingChargeAmount: state.missingChargeAmount,
        damageNotes: state.damageNotes || state.notes || "",
        missingNotes: state.missingNotes || state.notes || "",
        deliveryLocation: state.deliveryLocation || it.deliveryLocation || "",
        pickupLocation: state.pickupLocation || state.deliveryLocation || "",
        notes: state.notes || "",
      };
    });

    const payload = {
      actualReturnDate: cur.returnDate,
      deliveryLocation: cur.deliveryLocation,
      eventName: cur.eventName,
      deliveryDate: cur.deliveryDate,
      applyOverdueCharges: cur.applyOverdueCharges,
      items: itemsPayload,
      documentLines: itemsPayload,
    };

    const payloadStr = JSON.stringify(payload);
    // Dirty check: skip save if identical to last confirmed save and no queued pending changes
    if (payloadStr === lastSavedPayloadRef.current && !hasPendingChangesRef.current) {
      return;
    }

    isSavingRef.current = true;
    const version = ++saveVersionRef.current;

    try {
      const res = await fetchWithAuth(`/api/bills/${bill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: payloadStr,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);

      // Persisted and confirmed
      lastSavedPayloadRef.current = payloadStr;
      retryCountRef.current = 0;
      setAutoSaveError(null);
      setHistoryRefreshKey((k) => k + 1);

      // Only update metadata financials if this is still the newest version
      if (version === saveVersionRef.current) {
        setBill((prev) =>
          prev
            ? {
                ...prev,
                grandTotal: data.bill?.grandTotal ?? prev.grandTotal,
                balanceDue: data.bill?.balanceDue ?? prev.balanceDue,
                amountPaid: data.bill?.amountPaid ?? prev.amountPaid,
                status: data.bill?.status ?? prev.status,
                approvedDamageCharges: data.bill?.approvedDamageCharges ?? prev.approvedDamageCharges,
                approvedMissingCharges: data.bill?.approvedMissingCharges ?? prev.approvedMissingCharges,
                totalReturnedGood: data.bill?.totalReturnedGood ?? prev.totalReturnedGood,
                totalDamaged: data.bill?.totalDamaged ?? prev.totalDamaged,
                totalMissing: data.bill?.totalMissing ?? prev.totalMissing,
              }
            : data.bill
        );
      }
    } catch (err: any) {
      console.warn("[Autosave] Transient save error:", err.message);
      // Auto-retry transient failures (up to 2 retries with backoff)
      if (retryCountRef.current < 2) {
        retryCountRef.current++;
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = setTimeout(() => {
          performAutoSave();
        }, 1000);
      } else {
        setAutoSaveError(err.message || "Failed to sync changes with server");
      }
    } finally {
      isSavingRef.current = false;
      // If user typed/edited during this save request, process queued changes immediately
      if (hasPendingChangesRef.current) {
        hasPendingChangesRef.current = false;
        performAutoSave();
      }
    }
  };

  // Formula: Returned Good = Dispatched Quantity − Damaged Quantity − Missing Quantity
  const updateRowState = (
    itemId: string,
    updates: Partial<RowState>,
    immediate = false
  ) => {
    setRowStates((prev) => {
      const current = prev[itemId] || {
        returnedGood: 0,
        damaged: 0,
        missing: 0,
        damageChargeDecision: "NO_CHARGE",
        damageChargeAmount: 0,
        missingChargeDecision: "NO_CHARGE",
        missingChargeAmount: 0,
        damageNotes: "",
        missingNotes: "",
        deliveryLocation: "",
        pickupLocation: "",
        notes: "",
      };

      const line = (stateRef.current.billLines || []).find((l: any) => l.id === itemId);
      const dispatched = Math.max(0, Number(line?.quantity || 0));

      let nextDamaged = updates.damaged !== undefined ? Math.max(0, Number(updates.damaged)) : (current.damaged || 0);
      let nextMissing = updates.missing !== undefined ? Math.max(0, Number(updates.missing)) : (current.missing || 0);

      // Never allow negative quantities or total of damaged + missing greater than dispatched
      if (updates.damaged !== undefined) {
        if (nextDamaged + nextMissing > dispatched) {
          nextDamaged = Math.max(0, dispatched - nextMissing);
        }
      }
      if (updates.missing !== undefined) {
        if (nextDamaged + nextMissing > dispatched) {
          nextMissing = Math.max(0, dispatched - nextDamaged);
        }
      }

      // Automatically calculate: Returned Good = Dispatched Quantity − Damaged Quantity − Missing Quantity
      const returnedGood = Math.max(0, dispatched - nextDamaged - nextMissing);
      const physicalReturned = returnedGood + nextDamaged;

      const next: RowState = {
        ...current,
        ...updates,
        damaged: nextDamaged,
        missing: nextMissing,
        returnedGood,
        physicalReturned,
      };

      const nextMap = { ...prev, [itemId]: next };
      stateRef.current.rowStates = nextMap;
      return nextMap;
    });

    triggerAutoSave(immediate);
  };

  // Line additions for open bill
  const handleAddBillNote = () => {
    if (!bill || bill.status === "CLOSED") return;
    const newNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      entryType: "note",
      position: billLines.length + 1,
      text: "",
      itemName: "Note",
      quantity: 0,
      days: 0,
      unitPrice: 0,
      amount: 0,
    };
    setBillLines((prev) => [...prev, newNote]);
    updateRowState(newNote.id, { notes: "" }, true);
  };

  const handleAddBillProduct = () => {
    if (!bill || bill.status === "CLOSED") return;
    const prod = availableProducts[0];
    const newProd = {
      id: `it-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      entryType: "product",
      position: billLines.length + 1,
      productId: prod?.id || "",
      itemName: prod?.name || "Rental Product",
      sizeSpec: prod?.sizeSpec || "",
      quantity: 1,
      days: bill.rentalDays || 1,
      unitPrice: prod?.defaultRentalRate || 0,
      amount: prod?.defaultRentalRate || 0,
      deliveryLocation: bill.deliveryLocation || "",
    };
    setBillLines((prev) => [...prev, newProd]);
    updateRowState(
      newProd.id,
      {
        returnedGood: 0,
        damaged: 0,
        missing: 0,
        damageChargeDecision: "NO_CHARGE",
        damageChargeAmount: 0,
        missingChargeDecision: "NO_CHARGE",
        missingChargeAmount: 0,
        damageNotes: "",
        missingNotes: "",
        deliveryLocation: newProd.deliveryLocation,
        pickupLocation: newProd.deliveryLocation,
        notes: "",
      },
      true
    );
  };

  const handleRemoveBillLine = (lineId: string) => {
    if (!bill || bill.status === "CLOSED") return;
    setBillLines((prev) => prev.filter((l) => l.id !== lineId));
    triggerAutoSave(true);
  };

  // AMEND OPEN RENTAL BILL (Authorized Workflow Preserved)
  const handleAmendBill = async () => {
    if (!amendReason.trim()) {
      setActionError("Please provide a reason for amending this rental bill.");
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    setSubmitting(true);

    try {
      const res = await fetchWithAuth(`/api/bills/${bill.id}/amend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: amendReason,
          newExpectedReturnDate: amendReturnDate || undefined,
          additionalRentalDays: amendExtraDays,
          additionalCharges: amendExtraCharges,
          notes: amendNotes,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to amend bill");

      setActionSuccess(`Rental Bill #${bill.billNumber} successfully amended!`);
      setShowAmendPanel(false);
      setAmendReason("");
      setAmendExtraDays(0);
      setAmendExtraCharges(0);
      setAmendNotes("");
      fetchBill();
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // RECORD PAYMENT (Authorized Workflow Preserved)
  const handleRecordPayment = async () => {
    if (!paymentAmount || paymentAmount <= 0) {
      setActionError("Please enter a valid positive payment amount.");
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    setSubmitting(true);

    try {
      const res = await fetchWithAuth(`/api/bills/${bill.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: paymentAmount,
          paymentType,
          paymentMethod,
          paymentDate,
          referenceNumber,
          notes: paymentNotes,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to record payment");

      setActionSuccess(`Payment of ${formatINR(paymentAmount)} recorded successfully!`);
      setShowPaymentPanel(false);
      setReferenceNumber("");
      setPaymentNotes("");
      fetchBill();
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // CLOSE BILL (Authorized Workflow Preserved)
  const handleCloseBill = async () => {
    setActionError(null);
    setActionSuccess(null);

    if (hasPendingDecisions) {
      setActionError("Cannot close bill: One or more damaged/missing incident items have 'Decision Pending'. Please approve charge or select No Charge.");
      return;
    }

    if (bill.balanceDue > 0 && !closePaymentInFull) {
      setActionError(
        `Cannot close bill: Outstanding balance of ${formatINR(bill.balanceDue)} remains. Either check 'Receive full payment at closing' or record payments before closing.`
      );
      return;
    }

    if (closePaymentInFull && bill.balanceDue > 0) {
      if (!closeAmountReceived || closeAmountReceived < bill.balanceDue) {
        setActionError(
          `Cannot close bill: Amount received (${formatINR(closeAmountReceived)}) is less than the balance of ${formatINR(bill.balanceDue)}.`
        );
        return;
      }
    }

    if (!confirm(`Confirm closing Rental Bill #${bill.billNumber}? This will mark the operational rental transaction as closed and finalized.`)) {
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetchWithAuth(`/api/bills/${bill.id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentReceivedInFull: closePaymentInFull,
          paymentMethod: closePaymentMethod,
          amountReceived: closeAmountReceived,
          paymentDate: closePaymentDate,
          paymentNotes: closePaymentNotes,
          notes: closureNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to close bill");
      setActionSuccess(`Rental Bill #${bill.billNumber} has been successfully closed!`);
      setClosePaymentInFull(false);
      fetchBill();
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // REOPEN RENTAL BILL (Authorized Workflow)
  const handleReopenBill = async () => {
    const reason = prompt("Enter the reason for reopening this closed bill:");
    if (!reason || !reason.trim()) return;

    setSubmitting(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetchWithAuth(`/api/bills/${bill.id}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reopen bill");
      setActionSuccess(`Rental Bill #${bill.billNumber} has been reopened successfully!`);
      fetchBill();
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Dispatch Action
  const handleDispatch = async () => {
    if (!confirm("Confirm dispatching items to customer? This transitions status to Out on Rent and reserves equipment from warehouse.")) return;
    setSubmitting(true);
    try {
      const send = (extra: Record<string, unknown> = {}) =>
        fetch(`/api/bills/${bill.id}/dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(extra),
        });
      let res = await send();
      let data = await res.json();
      // Recorded stock is short: an administrator can approve a logged exception with a reason (checked again on the server)
      if (!data.success && /Insufficient stock/i.test(String(data.error || "")) && ["ADMIN", "SUPER_ADMIN", "OWNER"].includes(String(currentUser?.role || "").toUpperCase())) {
        const reason = window.prompt(
          `${data.error}

The recorded stock is lower than the quantity being dispatched. To dispatch anyway, type the reason (it is saved in the audit history). Leave empty to cancel.`
        );
        if (reason && reason.trim().length >= 5) {
          res = await send({ allowStockShortfall: true, stockShortfallReason: reason.trim() });
          data = await res.json();
        } else if (reason !== null) {
          setActionError("A reason of at least 5 characters is needed to dispatch beyond the recorded stock.");
          return;
        }
      }
      if (data.success) {
        setActionSuccess("Products dispatched successfully! Rental status is now Out on Rent.");
        fetchBill();
      } else {
        setActionError(data.error || "Dispatch failed");
      }
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Record Return: sends only the NEW units (entered minus already recorded) to the formal return endpoint
  const handleRecordReturn = async () => {
    if (!bill) return;
    setActionError(null);
    setActionSuccess(null);
    setSubmitting(true);
    try {
      const gpRes = await fetchWithAuth("/api/operations/gate-passes");
      const gpData = await gpRes.json();
      const gatePasses = (Array.isArray(gpData) ? gpData : gpData.gatePasses || []).filter((g: any) => g.billId === bill.id);
      const gpItems: any[] = gatePasses.flatMap((g: any) => g.items || []);
      if (gpItems.length === 0) throw new Error("This bill has no dispatch yet. Dispatch the items before recording a return.");

      const used = new Set<string>();
      const items: any[] = [];
      for (const line of billLines) {
        if (line.entryType === "note" || !line.productId) continue;
        const st = rowStates[line.id];
        if (!st) continue;
        const goodNow = Math.max(0, (st.returnedGood || 0) - (line.quantityReturnedGood ?? 0));
        const damagedNow = Math.max(0, (st.damaged || 0) - (line.quantityDamaged ?? 0));
        const missingNow = Math.max(0, (st.missing || 0) - (line.quantityMissing ?? 0));
        if (goodNow + damagedNow + missingNow === 0) continue;
        const gpItem = gpItems.find((g) => g.productId === line.productId && !used.has(g.id));
        if (!gpItem) throw new Error(`"${line.itemName}" was not part of the dispatch.`);
        used.add(gpItem.id);
        items.push({
          gatePassItemId: gpItem.id,
          productId: line.productId,
          itemName: line.itemName,
          goodQuantity: goodNow,
          damagedQuantity: damagedNow,
          missingQuantity: missingNow,
          damageNotes: st.damageNotes || "",
          missingNotes: st.missingNotes || "",
        });
      }
      if (items.length === 0) throw new Error("Nothing new to record. Enter the damaged or missing units first (good units are the rest).");

      const res = await fetchWithAuth(`/api/bills/${bill.id}/returns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnDate: stateRef.current.returnDate, items }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Return could not be recorded (HTTP ${res.status})`);
      setActionSuccess("Return recorded. Stock has been updated; decide any damage or missing charges below.");
      await fetchBill();
      setHistoryRefreshKey((k) => k + 1);
    } catch (e: any) {
      setActionError(e.message || "Return could not be recorded.");
    } finally {
      setSubmitting(false);
    }
  };

  // WhatsApp Share Action
  const handleWhatsAppShare = async () => {
    if (!whatsAppPhone) {
      setActionError("Please enter customer WhatsApp phone number.");
      return;
    }
    try {
      const res = await fetch("/api/whatsapp/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: "BILL",
          documentId: bill.id,
          phone: whatsAppPhone,
        }),
      });
      const data = await res.json();
      if (data.handoffUrl) {
        window.open(data.handoffUrl, "_blank");
        setShowWhatsAppInput(false);
      } else {
        setActionError(data.error || "Could not prepare WhatsApp share");
      }
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-24">
      {/* 1. Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/bills"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Rental Register
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-emerald-600" />
              Bill #{bill.billNumber}
            </h1>
            {getOperationalStatusBadge(bill.status)}
            {getPaymentStatusBadge(bill.paymentStatus)}
            {bill.isOverdue && (
              <span className="px-2.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-full font-bold text-[11px] flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-rose-600" /> Overdue ({bill.overdueDays}d)
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Issuing Company: <strong className="text-slate-800">{bill.companySnapshot?.displayName || "Tamilnadu Suppliers"}</strong>
          </p>
        </div>

        {/* Global Bill Utilities - Ordinary "Edit Bill" button removed per Requirement 2 */}
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={`/api/documents/bill/${bill.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-3 py-1.5 rounded-lg border border-slate-200 shadow-xs transition"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>Generate / View PDF</span>
          </a>

          <button
            onClick={() => setShowWhatsAppInput(!showWhatsAppInput)}
            className="inline-flex items-center gap-1.5 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold px-3 py-1.5 rounded-lg border border-emerald-200 shadow-xs transition"
          >
            <Share2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>WhatsApp Share</span>
          </button>

          <a
            href="#document-activity-history-section"
            className="inline-flex items-center gap-1.5 text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold px-3 py-1.5 rounded-lg border border-purple-200 shadow-xs transition"
          >
            <History className="w-3.5 h-3.5 text-purple-600" />
            <span>Activity History</span>
          </a>

          {(bill.status === "ISSUED" || bill.status === "ACTIVE") && (
            <button
              onClick={handleDispatch}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 text-xs bg-amber-600 hover:bg-amber-500 text-white font-semibold px-3.5 py-1.5 rounded-lg shadow-xs transition"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Dispatch Items</span>
            </button>
          )}
        </div>
      </div>

      {/* WhatsApp Inline Quick Bar */}
      {showWhatsAppInput && (
        <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center gap-3 text-xs">
          <Share2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold text-emerald-900">WhatsApp Recipient Phone:</span>
          <input
            type="text"
            value={whatsAppPhone}
            onChange={(e) => setWhatsAppPhone(e.target.value)}
            placeholder="+91..."
            className="bg-white border border-emerald-300 rounded px-2.5 py-1 text-xs text-slate-900 w-44 font-mono"
          />
          <button
            onClick={handleWhatsAppShare}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3 py-1 rounded text-xs transition"
          >
            Send WhatsApp
          </button>
          <button
            onClick={() => setShowWhatsAppInput(false)}
            className="text-slate-400 hover:text-slate-600 text-xs ml-auto"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Feedback Banners */}
      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-600 font-bold hover:text-emerald-800">✕</button>
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-xs text-rose-800">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-rose-600 font-bold hover:text-rose-800">✕</button>
        </div>
      )}

      {/* 2. Bill & Customer Information Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-600" />
            Bill & Rental Information
          </h2>
          <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
            <span>Bill Date: <strong className="text-slate-700">{bill.billDate}</strong></span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="p-3 bg-slate-50/70 rounded-lg border border-slate-100">
            <div className="text-slate-400 font-medium">Customer Details</div>
            <div className="text-sm font-bold text-slate-900 mt-1">{bill.customerName}</div>
            <div className="text-slate-500 mt-0.5">{bill.customerPhone}</div>
            <div className="text-slate-400 text-[11px] mt-0.5 truncate">{bill.customerAddress}</div>
            {bill.customerGstin && (
              <div className="text-[10px] text-slate-500 font-mono mt-1">GSTIN: {bill.customerGstin}</div>
            )}
          </div>

          <div className="p-3 bg-blue-50/40 rounded-lg border border-blue-100 space-y-2">
            <div className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">
              <span>Delivery Location / Dept</span>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-0.5">Location / Department</label>
              <input
                type="text"
                value={deliveryLocation}
                disabled={bill.status === "CLOSED"}
                onChange={(e) => {
                  setDeliveryLocation(e.target.value);
                  stateRef.current.deliveryLocation = e.target.value;
                  triggerAutoSave(false);
                }}
                onBlur={() => triggerAutoSave(true)}
                placeholder="e.g. VIT College — Main Auditorium"
                className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-900 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">Event Name</label>
                <input
                  type="text"
                  value={eventName}
                  disabled={bill.status === "CLOSED"}
                  onChange={(e) => {
                    setEventName(e.target.value);
                    stateRef.current.eventName = e.target.value;
                    triggerAutoSave(false);
                  }}
                  onBlur={() => triggerAutoSave(true)}
                  placeholder="e.g. Riviera 2026"
                  className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-0.5">Delivery Date</label>
                <input
                  type="date"
                  value={deliveryDate}
                  disabled={bill.status === "CLOSED"}
                  onChange={(e) => {
                    setDeliveryDate(e.target.value);
                    stateRef.current.deliveryDate = e.target.value;
                    triggerAutoSave(true);
                  }}
                  className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-800 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="p-3 bg-slate-50/70 rounded-lg border border-slate-100">
            <div className="text-slate-400 font-medium">Rental Schedule</div>
            <div className="mt-1 space-y-1">
              <div>Start Date: <strong className="font-mono text-slate-800">{bill.rentalStartDate}</strong></div>
              <div>Expected Return: <strong className="font-mono text-slate-800">{bill.expectedReturnDate}</strong></div>
              <div>Duration: <strong className="text-slate-800">{bill.rentalDays} days</strong></div>
              <div className="flex items-center gap-1 pt-1">
                <span className="text-slate-600 text-[11px]">Actual Return:</span>
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => {
                    setReturnDate(e.target.value);
                    stateRef.current.returnDate = e.target.value;
                    triggerAutoSave(true);
                  }}
                  disabled={bill.status === "CLOSED"}
                  className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs text-slate-900 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="p-3 bg-slate-50/70 rounded-lg border border-slate-100">
            <div className="text-slate-400 font-medium">Operational Progress</div>
            <div className="mt-1 space-y-1">
              <div className="flex justify-between">
                <span>Dispatched:</span>
                <strong className="font-mono text-slate-800">{totalDispatched} units</strong>
              </div>
              <div className="flex justify-between">
                <span>Accounted For:</span>
                <strong className="font-mono text-emerald-700">{totalAccounted} units</strong>
              </div>
              {bill.isOverdue && (
                <div className="pt-1 text-[11px] text-rose-700 font-semibold">
                  <span>Overdue by {bill.overdueDays} days</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Rental Items & Document Notes Area */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              Rental Items & Document Notes
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {canRecordReturn
                ? "Enter the damaged and missing quantities (good units are the rest), then press Record Return. Damage and missing charges are decided afterwards."
                : "Enter return quantities, independent damage charges, and missing-item charges. Notes appear inline in sequence."}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {canRecordReturn && (
              <button
                type="button"
                onClick={handleRecordReturn}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> {submitting ? "Recording..." : "Record Return"}
              </button>
            )}
            {/* Location Filter Dropdown */}
            {uniqueLocations.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500 font-semibold">Location:</span>
                <select
                  value={selectedLocationFilter}
                  onChange={(e) => setSelectedLocationFilter(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="ALL">All Locations ({billLines.length} lines)</option>
                  {uniqueLocations.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Section 6 buttons: + Add Note & + Add Item / Product */}
            {bill.status !== "CLOSED" && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleAddBillNote}
                  className="inline-flex items-center gap-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2.5 py-1 rounded-lg border border-slate-300 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Add Note</span>
                </button>
                <button
                  type="button"
                  onClick={handleAddBillProduct}
                  className="inline-flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-2.5 py-1 rounded-lg shadow-xs transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Add Item / Product</span>
                </button>
              </div>
            )}

            {hasPendingDecisions && (
              <span className="text-[11px] bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1 rounded-full font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Pending Decisions Block Closure
              </span>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                <th className="py-2.5 px-3 min-w-[190px]">Product / Document Line</th>
                <th className="py-2.5 px-2 text-center w-16">Dispatched</th>
                <th className="py-2.5 px-2 text-center bg-emerald-50/50 text-emerald-800 w-24">Returned Good</th>
                <th className="py-2.5 px-2 text-center bg-rose-50/50 text-rose-800 w-20">Damaged Qty</th>
                <th className="py-2.5 px-2 text-center bg-purple-50/50 text-purple-800 w-20">Missing Qty</th>
                <th className="py-2.5 px-2 text-right w-20">Daily Rate</th>
                <th className="py-2.5 px-3 bg-rose-50/30 text-rose-900 min-w-[210px]">Damage Charge & Decision</th>
                <th className="py-2.5 px-3 bg-purple-50/30 text-purple-900 min-w-[210px]">Missing Charge & Decision</th>
                <th className="py-2.5 px-3 min-w-[180px]">Pickup Location & Notes</th>
                {bill.status !== "CLOSED" && <th className="py-2.5 px-2 text-center w-12"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedLines.map((item, idx) => {
                const state = rowStates[item.id] || {
                  returnedGood: 0,
                  damaged: 0,
                  missing: 0,
                  damageChargeDecision: "NO_CHARGE",
                  damageChargeAmount: 0,
                  missingChargeDecision: "NO_CHARGE",
                  missingChargeAmount: 0,
                  damageNotes: "",
                  missingNotes: "",
                  deliveryLocation: item.deliveryLocation || "",
                  pickupLocation: item.pickupLocation || item.deliveryLocation || "",
                  notes: item.notes || item.text || "",
                };

                // Render Document Note Row
                if (item.entryType === "note") {
                  return (
                    <tr key={item.id} className="bg-amber-50/40 hover:bg-amber-50/70 transition border-y border-amber-200/50">
                      <td colSpan={9} className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded shrink-0">
                            Note #{idx + 1}
                          </span>
                          {bill.status !== "CLOSED" ? (
                            <input
                              type="text"
                              value={state.notes || item.text || item.itemName || ""}
                              onChange={(e) => updateRowState(item.id, { notes: e.target.value }, false)}
                              onBlur={() => triggerAutoSave(true)}
                              placeholder="e.g. VIT College — Main Auditorium or Deliver before 8:00 AM"
                              className="w-full bg-white border border-amber-300 rounded px-2.5 py-1 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          ) : (
                            <span className="font-semibold text-slate-900 text-xs">
                              {item.text || item.itemName}
                            </span>
                          )}
                        </div>
                      </td>
                      {bill.status !== "CLOSED" && (
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveBillLine(item.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                            title="Remove Note"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                }

                const itemLoc = state.deliveryLocation || item.deliveryLocation || "";

                return (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition">
                    {/* Product Name */}
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900">{item.itemName}</div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {item.sizeSpec && (
                          <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                            {item.sizeSpec}
                          </span>
                        )}
                        {itemLoc && (
                          <span className="text-[10px] text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded font-medium">
                            📍 {itemLoc}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Dispatched Quantity */}
                    <td className="py-2.5 px-2 text-center font-mono text-slate-700 font-bold">
                      {item.quantity}
                    </td>

                    {/* Returned in Good Condition - READ-ONLY AUTO-CALCULATED */}
                    <td className="py-2.5 px-2 text-center bg-emerald-50/20">
                      <input
                        type="number"
                        readOnly
                        tabIndex={-1}
                        aria-label="Returned Good Quantity"
                        value={state.returnedGood}
                        title={`Returned Good = Dispatched (${item.quantity}) − Damaged (${state.damaged}) − Missing (${state.missing}) = ${state.returnedGood}`}
                        className="w-16 text-center bg-emerald-50 border border-emerald-300 rounded px-1 py-1 text-xs font-mono font-bold text-emerald-800 cursor-not-allowed select-none shadow-xs"
                      />
                    </td>

                    {/* Damaged Quantity */}
                    <td className="py-2.5 px-2 text-center bg-rose-50/20">
                      <input
                        type="number"
                        min="0"
                        max={Math.max(0, (item.quantity || 0) - (state.missing || 0))}
                        value={state.damaged}
                        placeholder="0"
                        disabled={bill.status === "CLOSED"}
                        onChange={(e) => {
                          const rawVal = Math.max(0, Number(e.target.value) || 0);
                          const maxVal = Math.max(0, (item.quantity || 0) - (state.missing || 0));
                          const val = Math.min(rawVal, maxVal);
                          const updates: Partial<RowState> = { damaged: val };
                          if (val > 0 && state.damageChargeDecision === "NO_CHARGE") {
                            updates.damageChargeDecision = "PENDING_DECISION";
                          } else if (val === 0 && state.damageChargeDecision === "PENDING_DECISION") {
                            updates.damageChargeDecision = "NO_CHARGE";
                            updates.damageChargeAmount = 0;
                          }
                          updateRowState(item.id, updates, false);
                        }}
                        onBlur={() => triggerAutoSave(true)}
                        className="w-16 text-center bg-white border border-rose-300 rounded px-1 py-1 text-xs font-mono font-bold text-rose-700 focus:outline-none focus:ring-1 focus:ring-rose-500"
                      />
                    </td>

                    {/* Missing Quantity */}
                    <td className="py-2.5 px-2 text-center bg-purple-50/20">
                      <input
                        type="number"
                        min="0"
                        max={Math.max(0, (item.quantity || 0) - (state.damaged || 0))}
                        value={state.missing}
                        placeholder="0"
                        disabled={bill.status === "CLOSED"}
                        onChange={(e) => {
                          const rawVal = Math.max(0, Number(e.target.value) || 0);
                          const maxVal = Math.max(0, (item.quantity || 0) - (state.damaged || 0));
                          const val = Math.min(rawVal, maxVal);
                          const updates: Partial<RowState> = { missing: val };
                          if (val > 0 && state.missingChargeDecision === "NO_CHARGE") {
                            updates.missingChargeDecision = "PENDING_DECISION";
                          } else if (val === 0 && state.missingChargeDecision === "PENDING_DECISION") {
                            updates.missingChargeDecision = "NO_CHARGE";
                            updates.missingChargeAmount = 0;
                          }
                          updateRowState(item.id, updates, false);
                        }}
                        onBlur={() => triggerAutoSave(true)}
                        className="w-16 text-center bg-white border border-purple-300 rounded px-1 py-1 text-xs font-mono font-bold text-purple-700 focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </td>

                    {/* Daily Rate */}
                    <td className="py-2.5 px-2 text-right font-mono text-slate-600">
                      {formatINR(item.unitPrice)}
                    </td>

                    {/* Damage Charge Decision & Amount */}
                    <td className="py-2.5 px-3 bg-rose-50/10">
                      {state.damaged > 0 ? (
                        <div className="space-y-1.5">
                          <select
                            value={state.damageChargeDecision}
                            disabled={bill.status === "CLOSED"}
                            onChange={(e) => {
                              const dec = e.target.value as IncidentChargeStatus;
                              updateRowState(item.id, { damageChargeDecision: dec }, true);
                            }}
                            className={`w-full text-[11px] font-bold rounded px-2 py-1 border ${
                              state.damageChargeDecision === "ADD_CHARGE"
                                ? "bg-rose-100 text-rose-900 border-rose-300"
                                : state.damageChargeDecision === "PENDING_DECISION"
                                ? "bg-amber-100 text-amber-900 border-amber-300"
                                : "bg-slate-100 text-slate-700 border-slate-300"
                            }`}
                          >
                            <option value="NO_CHARGE">No Charge (Waived)</option>
                            <option value="PENDING_DECISION">Decision Pending</option>
                            <option value="ADD_CHARGE">Charge Customer</option>
                          </select>

                          {state.damageChargeDecision === "ADD_CHARGE" && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-slate-500 font-semibold">₹</span>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                placeholder="Damage charge amount"
                                value={state.damageChargeAmount || ""}
                                disabled={bill.status === "CLOSED"}
                                onChange={(e) =>
                                  updateRowState(
                                    item.id,
                                    { damageChargeAmount: Math.max(0, Number(e.target.value) || 0) },
                                    false
                                  )
                                }
                                onBlur={() => triggerAutoSave(true)}
                                className="w-full text-[11px] font-mono font-bold bg-white border border-rose-300 rounded px-2 py-0.5 text-rose-800 focus:outline-none focus:ring-1 focus:ring-rose-500"
                              />
                            </div>
                          )}

                          {state.damageChargeDecision === "PENDING_DECISION" && (
                            <span className="text-[10px] text-amber-700 block italic font-semibold">
                              * Unapproved — blocks closure until decided
                            </span>
                          )}
                          {state.damageChargeDecision === "NO_CHARGE" && (
                            <span className="text-[10px] text-emerald-700 block italic font-semibold">
                              ✓ Waived (₹0 charge)
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">No damaged items</span>
                      )}
                    </td>

                    {/* Missing Charge Decision & Amount */}
                    <td className="py-2.5 px-3 bg-purple-50/10">
                      {state.missing > 0 ? (
                        <div className="space-y-1.5">
                          <select
                            value={state.missingChargeDecision}
                            disabled={bill.status === "CLOSED"}
                            onChange={(e) => {
                              const dec = e.target.value as IncidentChargeStatus;
                              updateRowState(item.id, { missingChargeDecision: dec }, true);
                            }}
                            className={`w-full text-[11px] font-bold rounded px-2 py-1 border ${
                              state.missingChargeDecision === "ADD_CHARGE"
                                ? "bg-purple-100 text-purple-900 border-purple-300"
                                : state.missingChargeDecision === "PENDING_DECISION"
                                ? "bg-amber-100 text-amber-900 border-amber-300"
                                : "bg-slate-100 text-slate-700 border-slate-300"
                            }`}
                          >
                            <option value="NO_CHARGE">No Charge (Waived)</option>
                            <option value="PENDING_DECISION">Decision Pending</option>
                            <option value="ADD_CHARGE">Charge Customer</option>
                          </select>

                          {state.missingChargeDecision === "ADD_CHARGE" && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-slate-500 font-semibold">₹</span>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                placeholder="Replacement cost"
                                value={state.missingChargeAmount || ""}
                                disabled={bill.status === "CLOSED"}
                                onChange={(e) =>
                                  updateRowState(
                                    item.id,
                                    { missingChargeAmount: Math.max(0, Number(e.target.value) || 0) },
                                    false
                                  )
                                }
                                onBlur={() => triggerAutoSave(true)}
                                className="w-full text-[11px] font-mono font-bold bg-white border border-purple-300 rounded px-2 py-0.5 text-purple-800 focus:outline-none focus:ring-1 focus:ring-purple-500"
                              />
                            </div>
                          )}

                          {state.missingChargeDecision === "PENDING_DECISION" && (
                            <span className="text-[10px] text-amber-700 block italic font-semibold">
                              * Unapproved — blocks closure until decided
                            </span>
                          )}
                          {state.missingChargeDecision === "NO_CHARGE" && (
                            <span className="text-[10px] text-emerald-700 block italic font-semibold">
                              ✓ Waived (₹0 charge)
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">No missing items</span>
                      )}
                    </td>

                    {/* Pickup Location & Notes */}
                    <td className="py-2.5 px-3 space-y-1.5">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-400 shrink-0">Pickup:</span>
                        <input
                          type="text"
                          placeholder="e.g. Auditorium Stage"
                          value={state.pickupLocation || ""}
                          disabled={bill.status === "CLOSED"}
                          onChange={(e) => updateRowState(item.id, { pickupLocation: e.target.value }, false)}
                          onBlur={() => triggerAutoSave(true)}
                          className="w-full text-[11px] bg-white border border-slate-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="Condition / damage / missing notes..."
                        value={state.notes || ""}
                        disabled={bill.status === "CLOSED"}
                        onChange={(e) => updateRowState(item.id, { notes: e.target.value, damageNotes: e.target.value, missingNotes: e.target.value }, false)}
                        onBlur={() => triggerAutoSave(true)}
                        className="w-full text-[11px] bg-white border border-slate-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>

                    {bill.status !== "CLOSED" && (
                      <td className="py-2.5 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveBillLine(item.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                          title="Remove Line"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Additional Rental Days & Charges Section */}
      {(bill.additionalRentalDays || 0) > 0 || (bill.additionalRentalCharges || 0) > 0 || bill.isOverdue ? (
        <div className="bg-white rounded-xl border border-indigo-100 p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs">
            <div className="font-bold text-indigo-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600" />
              Additional Rental Days & Charges Summary
            </div>
            <div className="font-mono font-bold text-indigo-700">
              +{formatINR(bill.additionalRentalCharges || 0)}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600 pt-1">
            <div className="p-2.5 bg-indigo-50/40 rounded-lg border border-indigo-100">
              <span className="text-slate-400 block text-[11px]">Additional Chargeable Days</span>
              <span className="font-mono font-bold text-slate-800 text-sm">{bill.additionalRentalDays || 0} days</span>
            </div>
            <div className="p-2.5 bg-indigo-50/40 rounded-lg border border-indigo-100">
              <span className="text-slate-400 block text-[11px]">Overdue Tracking</span>
              <span className="font-mono font-bold text-slate-800 text-sm">
                {bill.isOverdue ? `${bill.overdueDays} days overdue` : "On schedule"}
              </span>
            </div>
            <div className="p-2.5 bg-indigo-50/40 rounded-lg border border-indigo-100">
              <span className="text-slate-400 block text-[11px]">Total Extra Rental Amount</span>
              <span className="font-mono font-bold text-indigo-700 text-sm">{formatINR(bill.additionalRentalCharges || 0)}</span>
            </div>
          </div>
          {bill.isOverdue && (
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-2 border-t border-indigo-50">
              <input
                type="checkbox"
                checked={applyOverdueCharges}
                disabled={bill.status === "CLOSED"}
                onChange={(e) => {
                  setApplyOverdueCharges(e.target.checked);
                  stateRef.current.applyOverdueCharges = e.target.checked;
                  triggerAutoSave(true);
                }}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <span>Apply calculated overdue charges for {bill.overdueDays} days</span>
            </label>
          )}
        </div>
      ) : null}

      {/* 5. Payments History, Security Deposit & Inline Payment Entry */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-600" />
              Payment History & Security Deposit Summary
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Advances and payments allocated to this bill. Security deposits held in custody are accounted separately.
            </p>
          </div>

          {bill.status !== "CLOSED" && (
            <button
              onClick={() => setShowPaymentPanel(!showPaymentPanel)}
              className="inline-flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3 py-1.5 rounded-lg shadow-xs transition"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>{showPaymentPanel ? "Close Payment Form" : "Record Payment"}</span>
            </button>
          )}
        </div>

        {/* Inline Record Payment Form */}
        {showPaymentPanel && (
          <div className="p-4 bg-emerald-50/40 border border-emerald-200 rounded-xl space-y-3">
            <div className="font-bold text-xs text-emerald-900 flex items-center justify-between">
              <span>Record New Payment Against Bill #{bill.billNumber}</span>
              <span className="text-[11px] font-normal text-emerald-700">Immediate server recalculation without popups</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Amount (₹) *</label>
                <NumberInput
                  
                  min="1"
                  step="0.01"
                  value={paymentAmount || ""}
                  onChange={(e) => setPaymentAmount(Number(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Payment Type</label>
                <select
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="RENTAL_PAYMENT">Rental Payment</option>
                  <option value="ADVANCE">Advance Allocation</option>
                  <option value="SECURITY_DEPOSIT">Security Deposit</option>
                  <option value="DAMAGE_SETTLEMENT">Damage Settlement</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Payment Date</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Reference / UTR #</label>
                <input
                  type="text"
                  placeholder="Txn ID (optional)"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-emerald-200/60">
              <button
                onClick={() => setShowPaymentPanel(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-emerald-100/50 rounded transition"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordPayment}
                disabled={submitting}
                className="px-4 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded shadow-xs transition"
              >
                Submit Payment
              </button>
            </div>
          </div>
        )}

        {/* Existing Payments Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <th className="py-2 px-3">Date</th>
                <th className="py-2 px-3">Receipt / Ref #</th>
                <th className="py-2 px-3">Type</th>
                <th className="py-2 px-3">Method</th>
                <th className="py-2 px-3 text-right">Amount</th>
                <th className="py-2 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(bill.payments || (bill as any).paymentRecords) && (bill.payments || (bill as any).paymentRecords).length > 0 ? (
                (bill.payments || (bill as any).paymentRecords).map((p: any) => (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="py-2 px-3 font-mono">{p.paymentDate}</td>
                    <td className="py-2 px-3 font-mono text-slate-700 font-medium">
                      {p.receiptNumber || p.referenceNumber || "—"}
                    </td>
                    <td className="py-2 px-3 font-semibold text-slate-700">{p.type}</td>
                    <td className="py-2 px-3 text-slate-600">{p.paymentMethod}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                      {formatINR(p.amount)}
                    </td>
                    <td className="py-2 px-3">
                      <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-bold">
                        {p.status || "CONFIRMED"}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-400 italic">
                    No individual payment records logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Live Financial Settlement Bar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-indigo-600" />
            Live Financial Settlement
          </h2>
          <span className="text-xs text-slate-500 font-mono">
            Final Payable Grand Total: <strong className="text-slate-900 font-bold">{formatINR(bill.grandTotal)}</strong>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div className="text-[11px] text-slate-500 font-bold uppercase">Rental Subtotal</div>
            <div className="text-sm font-bold text-slate-900 mt-1">{formatINR(bill.subtotal)}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{bill.rentalDays} days baseline</div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div className="text-[11px] text-slate-500 font-bold uppercase">Incident Charges</div>
            <div className="text-sm font-bold text-rose-700 mt-1">
              +{formatINR(((bill.approvedDamageCharges || 0) + (bill.approvedMissingCharges || 0)) || (liveDamageCharges + liveMissingCharges))}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Approved damages & missing</div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div className="text-[11px] text-slate-500 font-bold uppercase">Logistics & Extra</div>
            <div className="text-sm font-bold text-slate-900 mt-1">
              +{formatINR((bill.transportCharges || 0) + (bill.loadingCharges || 0) + (bill.laborCharges || 0))}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Transport, load & labor</div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div className="text-[11px] text-slate-500 font-bold uppercase">Advance Paid</div>
            <div className="text-sm font-black text-emerald-700 mt-1">
              {formatINR(bill.advancePaid || 0)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Initial advance deducted</div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div className="text-[11px] text-slate-500 font-bold uppercase">Total Paid</div>
            <div className="text-sm font-black text-slate-900 mt-1">
              {formatINR((bill.amountPaid || 0) + (bill.advancePaid || 0) + (bill.depositAdjustment || 0))}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Allocated to rent</div>
          </div>

          {/* NET BALANCE DUE */}
          <div className={`p-3 rounded-xl border shadow-xs ${
            bill.balanceDue === 0
              ? "bg-emerald-50 border-emerald-300"
              : "bg-rose-50 border-rose-300"
          }`}>
            <div className={`text-[11px] font-bold uppercase ${
              bill.balanceDue === 0 ? "text-emerald-800" : "text-rose-700"
            }`}>
              Net Balance Due
            </div>
            <div className={`text-base font-black mt-1 ${
              bill.balanceDue === 0 ? "text-emerald-700" : "text-rose-700"
            }`}>
              {formatINR(bill.balanceDue)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {bill.balanceDue === 0 ? "Fully paid" : "Pending collection"}
            </div>
          </div>
        </div>

        {/* Overpayment / Credit Display */}
        {(bill.customerCredit || 0) > 0 && (
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-indigo-900">
              <CheckCircle2 className="w-4 h-4 text-indigo-600" />
              <span>Customer has overpaid this bill. Refund or apply credit to future invoices:</span>
            </div>
            <div className="font-mono font-bold text-sm text-indigo-700">
              Customer Credit: {formatINR(bill.customerCredit || 0)}
            </div>
          </div>
        )}
      </div>

      {/* 7. Inline Amend Drawer (Toggled by "Amend Open Rental Bill") */}
      {showAmendPanel && bill.status !== "CLOSED" && (
        <div className="bg-white rounded-xl border-2 border-blue-400 shadow-md p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                Amend Open Rental Bill
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Extend return dates, add permitted rental charges, or update delivery terms without opening separate popups.
              </p>
            </div>
            <button
              onClick={() => setShowAmendPanel(false)}
              className="text-slate-400 hover:text-slate-600 text-xs font-bold"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Reason for Amendment *</label>
              <input
                type="text"
                placeholder="e.g. Customer requested 2-day reception extension"
                value={amendReason}
                onChange={(e) => setAmendReason(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">New Expected Return Date</label>
              <input
                type="date"
                value={amendReturnDate}
                onChange={(e) => setAmendReturnDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Additional Rental Days</label>
              <input
                type="number"
                min="0"
                value={amendExtraDays || ""}
                onChange={(e) => setAmendExtraDays(Number(e.target.value) || 0)}
                placeholder="0"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Additional Charges (₹)</label>
              <input
                type="number"
                min="0"
                value={amendExtraCharges || ""}
                onChange={(e) => setAmendExtraCharges(Number(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 font-semibold mb-1 text-xs">Amendment Notes & Terms</label>
            <input
              type="text"
              placeholder="Authorized instructions or special terms..."
              value={amendNotes}
              onChange={(e) => setAmendNotes(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              onClick={() => setShowAmendPanel(false)}
              className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              onClick={handleAmendBill}
              disabled={submitting}
              className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-sm transition"
            >
              Save Amendment
            </button>
          </div>
        </div>
      )}

      {/* 8. Closure Readiness Checklist & Bottom Actions Bar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-emerald-600" />
            Rental Bill Closure Readiness Checklist
          </h3>
          <span className="text-xs text-slate-500">
            {bill.status === "CLOSED" ? "Transaction Closed" : "All conditions required before final closure"}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {/* Condition 1 */}
          <div className={`p-3 rounded-xl border flex items-start gap-2.5 ${isUndispatched ? "bg-amber-50/60 border-amber-200" : "bg-emerald-50/60 border-emerald-200"}`}>
            {isUndispatched ? (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="font-bold text-slate-900">1. Product Returns Tracked</div>
              <div className="text-slate-600 mt-0.5">
                {isUndispatched
                  ? "Not dispatched yet. Dispatch the items first; returns are recorded after dispatch."
                  : `${totalAccounted} of ${totalDispatched} units accounted for.`}
              </div>
              <div className="text-[11px] font-mono mt-0.5 text-slate-500">
                Returned Good: {liveGood} | Damaged: {liveDamaged} | Missing: {liveMissing}
              </div>
            </div>
          </div>

          {/* Condition 2 */}
          <div className={`p-3 rounded-xl border flex items-start gap-2.5 ${
            !hasPendingDecisions ? "bg-emerald-50/60 border-emerald-200" : "bg-amber-50/60 border-amber-200"
          }`}>
            {!hasPendingDecisions ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="font-bold text-slate-900">2. Incident Decisions Resolved</div>
              <div className="text-slate-600 mt-0.5">
                {!hasPendingDecisions ? "No pending damage/missing items" : "Decision pending on items"}
              </div>
              <div className="text-[11px] font-mono mt-0.5 text-slate-500">
                {!hasPendingDecisions ? "All charges finalized or waived" : "Must select Charge Customer or No Charge"}
              </div>
            </div>
          </div>

          {/* Condition 3 */}
          <div className={`p-3 rounded-xl border flex items-start gap-2.5 ${
            bill.balanceDue === 0 ? "bg-emerald-50/60 border-emerald-200" : closePaymentInFull ? "bg-blue-50/60 border-blue-200" : "bg-amber-50/60 border-amber-200"
          }`}>
            {bill.balanceDue === 0 ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : closePaymentInFull ? (
              <Clock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="font-bold text-slate-900">3. Financial Settlement</div>
              <div className="text-slate-600 mt-0.5">
                Net Balance Due: <span className="font-mono font-bold text-slate-900">{formatINR(bill.balanceDue)}</span>
              </div>
              <div className="text-[11px] font-mono mt-0.5 text-slate-500">
                {bill.balanceDue === 0
                  ? "Fully Paid (Settled)"
                  : closePaymentInFull
                  ? `Full payment of ${formatINR(closeAmountReceived)} confirmed for closure`
                  : "Requires payment or full cash confirmation"}
              </div>
            </div>
          </div>
        </div>

        {bill.status !== "CLOSED" && (
          <div className="pt-3 space-y-3 text-xs border-t border-slate-100">
            {bill.balanceDue > 0 ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <div className="font-bold text-slate-800 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    <span>Cash / Final Payment Confirmation:</span>
                    <span className="font-mono text-rose-700 font-black text-sm">
                      Net Balance Due: {formatINR(bill.balanceDue)}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Must receive full payment or record transaction to close
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Payment Method</label>
                    <select
                      value={closePaymentMethod}
                      onChange={(e) => setClosePaymentMethod(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                    >
                      <option value="CASH">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="CARD">Card</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Amount Received (₹) *</label>
                    <input
                      type="number"
                      min="0"
                      value={closeAmountReceived || ""}
                      onChange={(e) => setCloseAmountReceived(Number(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Payment Date</label>
                    <input
                      type="date"
                      value={closePaymentDate}
                      onChange={(e) => setClosePaymentDate(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Receipt / Ref Notes</label>
                    <input
                      type="text"
                      placeholder="e.g. Received cash at dispatch counter"
                      value={closePaymentNotes}
                      onChange={(e) => setClosePaymentNotes(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs font-semibold text-emerald-800 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={closePaymentInFull}
                    onChange={(e) => {
                      setClosePaymentInFull(e.target.checked);
                      if (e.target.checked) {
                        setCloseAmountReceived(bill.balanceDue);
                      }
                    }}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                  />
                  <span>Confirm full cash/settlement payment of {formatINR(bill.balanceDue)} received now</span>
                </label>
              </div>
            ) : null}

            <div>
              <label className="block text-slate-700 font-semibold mb-1 text-xs">Closure Summary & Customer Remarks</label>
              <input
                type="text"
                placeholder="Inspection notes or final closure clearance notes..."
                value={closureNotes}
                onChange={(e) => setClosureNotes(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {/* Action Buttons - Ordinary Edit Bill removed, authorized workflows preserved */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 flex-wrap">
          {/* Action A: Amend Open Rental Bill */}
          {bill.status !== "CLOSED" ? (
            <button
              onClick={() => setShowAmendPanel(!showAmendPanel)}
              className="inline-flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2.5 rounded-xl shadow-xs transition"
            >
              <FileText className="w-4 h-4" />
              <span>Amend Open Rental Bill</span>
            </button>
          ) : (
            <span className="text-xs text-slate-400 italic px-2 py-1">
              * Closed bills cannot be amended
            </span>
          )}

          {/* Action B: Close Rental Bill */}
          {bill.status !== "CLOSED" && (
            <button
              onClick={handleCloseBill}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2.5 rounded-xl shadow-xs transition"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Close Rental Bill</span>
            </button>
          )}

          {bill.status === "CLOSED" && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-700 font-bold px-4 py-2 rounded-xl border border-emerald-200">
                <Lock className="w-4 h-4 text-emerald-600" />
                Bill Closed & Finalized
              </span>
              {(isSuperAdmin || hasPermission("bills:update")) && (
                <button
                  type="button"
                  onClick={handleReopenBill}
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 text-xs bg-amber-600 hover:bg-amber-500 text-white font-bold px-4 py-2 rounded-xl shadow-xs transition"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Reopen Rental Bill</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Document Activity History & Audit Trail */}
      <DocumentActivityHistory
        entityType="BILL"
        entityId={bill.id}
        documentNumber={bill.billNumber}
        sourceQuotationId={bill.sourceQuotationId}
        isSuperAdmin={isSuperAdmin}
        refreshTrigger={historyRefreshKey}
      />

      {/* Subtle, Non-blocking Error Notification Banner */}
      {autoSaveError && (
        <div
          role="alert"
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3.5 py-2.5 bg-slate-900 text-slate-100 text-xs rounded-xl shadow-xl border border-slate-700 animate-in fade-in slide-in-from-bottom-2"
        >
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Sync issue: {autoSaveError}. Changes will sync automatically when reconnected.</span>
          <button
            type="button"
            onClick={() => setAutoSaveError(null)}
            className="ml-2 text-slate-400 hover:text-white text-xs font-bold px-1"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
