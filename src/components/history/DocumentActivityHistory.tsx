"use client";

import React, { useState, useEffect } from "react";
import {
  History,
  User,
  Shield,
  Clock,
  Calendar,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
  RefreshCw,
  FileText,
  Receipt,
  DollarSign,
  ArrowRight,
  Truck,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Layers,
} from "lucide-react";
import Link from "next/link";
import { AuditLog } from "@/lib/types";
import { formatINR } from "@/lib/calculations/financial";

interface DocumentActivityHistoryProps {
  entityType: "QUOTATION" | "BILL";
  entityId: string;
  documentNumber?: string;
  sourceQuotationId?: string | null;
  sourceQuotationNumber?: string | null;
  sourceQuotationHistory?: AuditLog[];
  className?: string;
  isSuperAdmin?: boolean;
  refreshTrigger?: any;
}

export function DocumentActivityHistory({
  entityType,
  entityId,
  documentNumber,
  sourceQuotationId,
  sourceQuotationNumber,
  sourceQuotationHistory = [],
  className = "",
  isSuperAdmin = true,
  refreshTrigger,
}: DocumentActivityHistoryProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<string>("ALL");
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"document" | "sourceQuote">("document");
  const [internalSourceQuoteId, setInternalSourceQuoteId] = useState<string | null>(null);
  const [internalSourceQuoteNumber, setInternalSourceQuoteNumber] = useState<string | null>(null);
  const [internalSourceQuoteHistory, setInternalSourceQuoteHistory] = useState<AuditLog[]>([]);
  const [convertedBillId, setConvertedBillId] = useState<string | null>(null);
  const [convertedBillNumber, setConvertedBillNumber] = useState<string | null>(null);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const url =
        entityType === "QUOTATION"
          ? `/api/quotations/${entityId}/history`
          : `/api/bills/${entityId}/history`;

      const res = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load activity history");
      }
      setLogs(data.history || []);
      if (data.sourceQuotationId) setInternalSourceQuoteId(data.sourceQuotationId);
      if (data.sourceQuotationNumber) setInternalSourceQuoteNumber(data.sourceQuotationNumber);
      if (data.sourceQuotationHistory) setInternalSourceQuoteHistory(data.sourceQuotationHistory);
      if (data.convertedBillId) setConvertedBillId(data.convertedBillId);
      if (data.convertedBillNumber) setConvertedBillNumber(data.convertedBillNumber);
    } catch (err: any) {
      setError(err.message || "Failed to load activity history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (entityId) {
      fetchHistory();
    }
  }, [entityId, entityType, refreshTrigger]);

  const toggleExpand = (id: string) => {
    setExpandedLogIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getActionBadgeColor = (action: string) => {
    if (action.includes("CREATE")) {
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    }
    if (action.includes("CONVERT")) {
      return "bg-purple-50 text-purple-700 border-purple-200";
    }
    if (action.includes("UPDATE")) {
      return "bg-sky-50 text-sky-700 border-sky-200";
    }
    if (action.includes("AMEND")) {
      return "bg-amber-50 text-amber-700 border-amber-200";
    }
    if (action.includes("PAYMENT")) {
      return "bg-blue-50 text-blue-700 border-blue-200";
    }
    if (action.includes("RETURN") || action.includes("DISPATCH")) {
      return "bg-amber-50 text-amber-700 border-amber-200";
    }
    if (action.includes("DAMAGE") || action.includes("INCIDENT")) {
      return "bg-rose-50 text-rose-700 border-rose-200";
    }
    if (action.includes("CLOSE")) {
      return "bg-slate-100 text-slate-800 border-slate-300";
    }
    if (action.includes("REOPEN")) {
      return "bg-amber-50 text-amber-800 border-amber-300";
    }
    if (action.includes("PDF")) {
      return "bg-indigo-50 text-indigo-700 border-indigo-200";
    }
    return "bg-slate-50 text-slate-700 border-slate-200";
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "SUPER_ADMIN":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
            <Shield className="w-2.5 h-2.5" />
            Super Admin
          </span>
        );
      case "ADMIN":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
            Admin
          </span>
        );
      case "BILLING":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            Billing
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
            {role}
          </span>
        );
    }
  };

  const activeQuoteHistory =
    sourceQuotationHistory && sourceQuotationHistory.length > 0
      ? sourceQuotationHistory
      : internalSourceQuoteHistory;

  const currentDisplayLogs = activeTab === "sourceQuote" ? activeQuoteHistory : logs;

  const filteredLogs = currentDisplayLogs.filter((log) => {
    if (!log) return false;
    const action = log.action || "";
    const actorName = log.actorName || "";
    const actorUsername = log.actorUsername || "";
    const summary = log.summary || log.details?.summary || log.actionLabel || "";

    // Search query
    const matchSearch =
      !searchQuery ||
      action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      actorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      actorUsername.toLowerCase().includes(searchQuery.toLowerCase()) ||
      summary.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchSearch) return false;

    // Category filter
    if (selectedFilter === "ALL") return true;
    if (selectedFilter === "EDITS") {
      return (
        action.includes("EDIT") ||
        action.includes("REVISE") ||
        action.includes("UPDATE") ||
        action.includes("CREATE")
      );
    }
    if (selectedFilter === "PAYMENTS") {
      return action.includes("PAYMENT");
    }
    if (selectedFilter === "LOGISTICS") {
      return (
        action.includes("RETURN") ||
        action.includes("DISPATCH") ||
        action.includes("INCIDENT") ||
        action.includes("DAMAGE")
      );
    }
    if (selectedFilter === "STATUS") {
      return (
        action.includes("CONVERT") ||
        action.includes("CLOSE") ||
        action.includes("REOPEN") ||
        action.includes("STATUS")
      );
    }
    return true;
  });

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts);
      return {
        date: d.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
        time: d.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        }),
      };
    } catch {
      return { date: ts, time: "" };
    }
  };

  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden ${className}`}
      id="document-activity-history-section"
    >
      {/* Header */}
      <div className="p-5 border-b border-slate-100 bg-slate-50/70 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shadow-xs">
            <History className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">
                Document Activity & Audit History
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-100 text-purple-800">
                {currentDisplayLogs.length} events
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Comprehensive chronological log of all changes, revisions, financial events, and who performed them.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchHistory}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-xs transition"
            title="Refresh history"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-purple-600" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Quotation Converted to Bill Banner */}
      {entityType === "QUOTATION" && convertedBillId && (
        <div className="px-5 py-2.5 bg-purple-50 border-b border-purple-100 flex items-center justify-between text-xs text-purple-900">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-purple-600" />
            <span className="font-semibold">
              Quotation Converted to Rental Bill {convertedBillNumber ? `#${convertedBillNumber}` : ""}
            </span>
          </div>
          <Link
            href={`/bills/${convertedBillId}`}
            className="inline-flex items-center gap-1 font-bold text-purple-700 hover:text-purple-900 underline"
          >
            <span>View Converted Bill</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Originating Quotation Banner / Tabs for Bill */}
      {(sourceQuotationId || internalSourceQuoteId) && (
        <div className="px-5 pt-3 border-b border-slate-100 bg-amber-50/40">
          <div className="flex items-center gap-4 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("document")}
              className={`pb-2.5 font-bold border-b-2 transition flex items-center gap-1.5 ${
                activeTab === "document"
                  ? "border-purple-600 text-purple-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Bill Lifecycle ({logs.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("sourceQuote")}
              className={`pb-2.5 font-bold border-b-2 transition flex items-center gap-1.5 ${
                activeTab === "sourceQuote"
                  ? "border-amber-600 text-amber-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>
                Originating Quotation {sourceQuotationNumber || internalSourceQuoteNumber ? `(${sourceQuotationNumber || internalSourceQuoteNumber})` : ""}
                {(sourceQuotationHistory.length > 0 ? sourceQuotationHistory : internalSourceQuoteHistory).length > 0
                  ? ` [${(sourceQuotationHistory.length > 0 ? sourceQuotationHistory : internalSourceQuoteHistory).length}]`
                  : ""}
              </span>
            </button>

            <div className="ml-auto pb-2">
              <Link
                href={`/quotations/${sourceQuotationId || internalSourceQuoteId}`}
                target="_blank"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:underline"
              >
                <span>View Full Quote</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="p-4 bg-white border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search action, actor, or detail..."
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {[
            { id: "ALL", label: "All" },
            { id: "EDITS", label: "Edits & Revisions" },
            { id: "PAYMENTS", label: "Payments" },
            { id: "LOGISTICS", label: "Dispatches & Returns" },
            { id: "STATUS", label: "Status & Conversions" },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setSelectedFilter(f.id)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg whitespace-nowrap transition ${
                selectedFilter === f.id
                  ? "bg-purple-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List / Timeline Content */}
      <div className="divide-y divide-slate-100 max-h-[580px] overflow-y-auto">
        {loading && logs.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-600" />
            <p className="text-xs">Loading activity audit logs...</p>
          </div>
        ) : error ? (
          <div className="p-6 text-center text-rose-600 text-xs">
            <p className="font-semibold">Error: {error}</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-xs font-medium">No activity log entries match your criteria.</p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isExpanded = expandedLogIds.has(log.id);
            const ts = formatTimestamp(log.createdAt);
            const hasDiff =
              log.details &&
              (log.details.previousValues ||
                log.details.newValues ||
                log.details.amount !== undefined ||
                log.details.returns ||
                log.details.incident ||
                log.details.sourceQuotationNumber ||
                log.details.convertedBillNumber ||
                (Array.isArray(log.details.changes) && log.details.changes.length > 0));

            return (
              <div
                key={log.id}
                className="p-4 hover:bg-slate-50/80 transition flex flex-col gap-2"
                id={`audit-entry-${log.id}`}
              >
                {/* Top Row: Timestamp, Performed By, Role, Action Badge */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${getActionBadgeColor(
                        log.action
                      )}`}
                    >
                      {log.action.replace(/_/g, " ")}
                    </span>

                    <span className="text-slate-300">|</span>

                    <div className="flex items-center gap-1.5 text-xs text-slate-800">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-bold">{log.actorName || "System Actor"}</span>
                      {log.actorUsername && (
                        <span className="text-slate-400 text-[11px] font-mono">
                          (@{log.actorUsername})
                        </span>
                      )}
                    </div>

                    {getRoleBadge(log.actorRole)}
                  </div>

                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-mono whitespace-nowrap">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    <span>{ts.date}</span>
                    <Clock className="w-3 h-3 text-slate-400 ml-1" />
                    <span>{ts.time}</span>
                  </div>
                </div>

                {/* Summary Row */}
                <div className="flex items-start justify-between gap-4">
                  <p className="text-xs text-slate-700 leading-relaxed font-medium">
                    {log.summary || log.details?.summary || log.actionLabel || "No additional description recorded."}
                  </p>

                  {hasDiff && (
                    <button
                      type="button"
                      onClick={() => toggleExpand(log.id)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 hover:text-purple-800 shrink-0 mt-0.5"
                    >
                      <span>{isExpanded ? "Hide Details" : "View Details"}</span>
                      {isExpanded ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>
                  )}
                </div>

                {/* Expandable Comparison / Values Diff */}
                {isExpanded && log.details && (
                  <div className="mt-2 p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
                    {/* Payment specifics */}
                    {log.details.amount !== undefined && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white p-2.5 rounded-lg border border-slate-100 font-mono text-[11px]">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase">
                            Amount Paid
                          </span>
                          <span className="font-bold text-emerald-700 text-xs">
                            {formatINR(log.details.amount)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase">Method</span>
                          <span className="font-semibold text-slate-800">
                            {log.details.method || "CASH"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase">Payment Type</span>
                          <span className="font-semibold text-slate-800">
                            {log.details.paymentType || "PAYMENT"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase">Reference</span>
                          <span className="font-semibold text-slate-600">
                            {log.details.reference || "None"}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Previous vs New Values Diff */}
                    {(log.details.previousValues || log.details.newValues) && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                          <span>Values Comparison</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {/* Previous Values */}
                          <div className="p-3 bg-rose-50/50 border border-rose-200 rounded-lg space-y-1.5">
                            <span className="text-[10px] font-bold uppercase text-rose-800 tracking-wider flex items-center gap-1">
                              <span>Previous Values</span>
                            </span>
                            {log.details.previousValues ? (
                              <pre className="text-[11px] font-mono text-slate-800 whitespace-pre-wrap max-h-48 overflow-y-auto bg-white p-2 rounded border border-rose-100">
                                {typeof log.details.previousValues === "object"
                                  ? JSON.stringify(log.details.previousValues, null, 2)
                                  : String(log.details.previousValues)}
                              </pre>
                            ) : (
                              <p className="text-[11px] text-slate-400 italic">None recorded</p>
                            )}
                          </div>

                          {/* New Values */}
                          <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-lg space-y-1.5">
                            <span className="text-[10px] font-bold uppercase text-emerald-800 tracking-wider flex items-center gap-1">
                              <span>New Values</span>
                            </span>
                            {log.details.newValues ? (
                              <pre className="text-[11px] font-mono text-slate-800 whitespace-pre-wrap max-h-48 overflow-y-auto bg-white p-2 rounded border border-emerald-100">
                                {typeof log.details.newValues === "object"
                                  ? JSON.stringify(log.details.newValues, null, 2)
                                  : String(log.details.newValues)}
                              </pre>
                            ) : (
                              <p className="text-[11px] text-slate-400 italic">None recorded</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Return/Logistics details */}
                    {log.details.returns && (
                      <div className="p-2.5 bg-white rounded-lg border border-slate-100">
                        <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                          Items Returned / Inspected
                        </span>
                        <pre className="text-[11px] font-mono text-slate-700 whitespace-pre-wrap">
                          {JSON.stringify(log.details.returns, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Specific Changes List */}
                    {Array.isArray(log.details.changes) && log.details.changes.length > 0 && (
                      <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1.5">
                        <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider block">
                          Specific Changes Made
                        </span>
                        <ul className="list-disc list-inside space-y-1 text-slate-800 text-[11px] font-medium">
                          {log.details.changes.map((ch: any, idx: number) => (
                            <li key={idx} className="leading-snug">{String(ch)}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Linked Target Bill Link */}
                    {log.details.convertedBillNumber && (
                      <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-900 flex items-center justify-between">
                        <span>Converted to Rental Bill: <strong className="font-mono">#{log.details.convertedBillNumber}</strong></span>
                        <Link href={`/bills/${log.details.convertedBillId}`} className="font-bold underline flex items-center gap-1 text-purple-700 hover:text-purple-900">
                          <span>Open Bill</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    )}

                    {/* Linked Source Quotation Link */}
                    {log.details.sourceQuotationNumber && (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-center justify-between">
                        <span>Originating Quotation: <strong className="font-mono">#{log.details.sourceQuotationNumber}</strong></span>
                        <Link href={`/quotations/${log.details.sourceQuotationId}`} className="font-bold underline flex items-center gap-1 text-amber-700 hover:text-amber-900">
                          <span>Open Quote</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    )}

                    {/* Metadata safe preview */}
                    <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between pt-1 border-t border-slate-200">
                      <span>Log ID: {log.id}</span>
                      {log.ipAddress && <span>IP: {log.ipAddress}</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer info */}
      <div className="p-3 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between px-5">
        <span>Document ID: <code className="font-mono text-slate-700">{entityId}</code></span>
        <span>Audit logs are immutable and tamper-resistant</span>
      </div>
    </div>
  );
}
export default DocumentActivityHistory;
