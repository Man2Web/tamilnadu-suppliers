// ============================================================================
// WHATSAPP DOCUMENT SHARING ENGINE
// Web Handoff & WhatsApp Business Platform API Preparation
// ============================================================================

import { Bill, Quotation, WhatsAppLog } from "../types";
import { formatINR } from "../calculations/financial";

export interface WhatsAppShareOptions {
  recipientPhone: string;
  recipientName: string;
  documentType: "QUOTATION" | "BILL" | "GATE_PASS" | "RECEIPT";
  documentId: string;
  documentNumber: string;
  customNote?: string;
}

export function formatWhatsAppPhone(phone: string): string {
  // Normalize phone number to 91XXXXXXXXXX
  let cleaned = phone.replace(/[^0-9]/g, "");
  if (cleaned.length === 10) {
    cleaned = "91" + cleaned;
  }
  return cleaned;
}

/**
 * Builds standard pre-composed message for quotations
 */
export function buildQuotationWhatsAppMessage(
  quote: Quotation,
  appUrl: string = "http://localhost:3000"
): string {
  const compName = quote.companySnapshot?.name || "Tamilnadu Suppliers";
  return (
    `*RENTAL QUOTATION - ${compName}*\n\n` +
    `Dear ${quote.customerName},\n` +
    `Thank you for your enquiry. Please find your rental quotation details below:\n\n` +
    `📄 *Quotation No:* ${quote.quotationNumber}\n` +
    `📅 *Rental Period:* ${quote.rentalStartDate} to ${quote.rentalEndDate} (${quote.rentalDays} Days)\n` +
    `📍 *Place of Supply:* ${quote.placeOfSupply}\n` +
    `💰 *Quoted Total:* ${formatINR(quote.grandTotal)}\n` +
    (quote.advanceRequired > 0 ? `💵 *Advance Required:* ${formatINR(quote.advanceRequired)}\n` : "") +
    (quote.securityDepositRequired > 0 ? `🛡️ *Security Deposit:* ${formatINR(quote.securityDepositRequired)}\n` : "") +
    `\nView or download quotation:\n${appUrl}/api/documents/quotation/${quote.id}/download\n\n` +
    `Please reply with *ACCEPT* to confirm your rental reservation.\n` +
    `For queries, call ${quote.companySnapshot?.phone || "9842345678"}.`
  );
}

/**
 * Builds standard pre-composed message for bills
 */
export function buildBillWhatsAppMessage(
  bill: Bill,
  appUrl: string = "http://localhost:3000"
): string {
  const compName = bill.companySnapshot?.name || "Tamilnadu Suppliers";
  return (
    `*RENTAL BILL - ${compName}*\n\n` +
    `Dear ${bill.customerName},\n` +
    `Your rental bill has been generated:\n\n` +
    `📄 *Bill No:* ${bill.billNumber}\n` +
    `📅 *Date:* ${bill.billDate}\n` +
    `📍 *Place of Supply:* ${bill.placeOfSupply}\n` +
    `💰 *Grand Total:* ${formatINR(bill.grandTotal)}\n` +
    `💳 *Amount Paid:* ${formatINR(bill.amountPaid + bill.advancePaid)}\n` +
    `⚖️ *Balance Due:* ${formatINR(bill.balanceDue)}\n\n` +
    `Download your formal bill copy:\n${appUrl}/api/documents/bill/${bill.id}/download\n\n` +
    `Thank you for choosing Tamilnadu Suppliers!`
  );
}

/**
 * Generates WhatsApp Click-to-Chat Web Handoff Link
 */
export function generateWhatsAppHandoffUrl(
  phone: string,
  message: string
): string {
  const cleanPhone = formatWhatsAppPhone(phone);
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${cleanPhone}?text=${encoded}`;
}

/**
 * Creates a log record for WhatsApp sharing action
 */
export function createWhatsAppLogRecord(
  options: WhatsAppShareOptions,
  messagePayload: string,
  shareMethod: "HANDOFF_WEB" | "API_CLOUD" = "HANDOFF_WEB"
): WhatsAppLog {
  return {
    id: crypto.randomUUID(),
    documentType: options.documentType,
    documentId: options.documentId,
    documentNumber: options.documentNumber,
    recipientPhone: options.recipientPhone,
    recipientName: options.recipientName,
    shareMethod,
    status: "PREPARED",
    messagePayload,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export interface WhatsAppSharePayloadInput {
  customerPhone: string;
  customerName: string;
  documentNumber: string;
  documentType: "QUOTATION" | "BILL" | "GATE_PASS" | "RECEIPT";
  companyName: string;
  grandTotal: number;
  balanceDue?: number;
  documentUrl?: string;
}

export function formatWhatsAppMessage(input: WhatsAppSharePayloadInput): string {
  const docTitle = input.documentType === "BILL" ? "RENTAL BILL" : "RENTAL QUOTATION";
  return (
    `*${docTitle} - ${input.companyName}*\n\n` +
    `Dear ${input.customerName},\n` +
    `Your ${input.documentType.toLowerCase()} #${input.documentNumber} has been generated.\n` +
    `💰 Total: ₹${input.grandTotal.toLocaleString("en-IN")}\n` +
    (input.balanceDue !== undefined ? `⚖️ Balance Due: ₹${input.balanceDue.toLocaleString("en-IN")}\n` : "") +
    (input.documentUrl ? `\nView/Download: ${input.documentUrl}\n\n` : "\n") +
    `Thank you for choosing ${input.companyName}!`
  );
}

export function generateWhatsAppSharePayload(input: WhatsAppSharePayloadInput): {
  phone: string;
  message: string;
  shareUrl: string;
} {
  const phone = formatWhatsAppPhone(input.customerPhone);
  const message = formatWhatsAppMessage(input);
  const shareUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
  return {
    phone,
    message,
    shareUrl,
  };
}

