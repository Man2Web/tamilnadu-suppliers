// ============================================================================
// PDF GENERATION ENGINE
// Matches exact visual design of 742 MATCON - 2026.pdf
// Supports Multi-Branch Sections, INR Amount in Words, Bank Details
// ============================================================================

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Bill, Quotation, GatePass } from "../types";
import { formatINR, numberToIndianWords, isGstRegistered } from "../calculations/financial";

/**
 * Generates Rental Bill / Invoice PDF matching 742 MATCON - 2026.pdf
 */
export function generateBillPDF(bill: Bill): jsPDF {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - 2 * margin;

  const comp = bill.companySnapshot || {};
  const isGst = isGstRegistered(bill.taxType);

  // Outer border
  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.3);
  doc.rect(margin, margin, contentWidth, pageHeight - 2 * margin);

  // Top right header tag
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("Original Copy", pageWidth - margin - 3, margin + 5, { align: "right" });

  // Document Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(isGst ? "TAX INVOICE / BILL" : "B  I  L  L", pageWidth / 2, margin + 9, {
    align: "center",
  });

  // Company Name
  doc.setFontSize(14);
  const companyName = (comp.name || "TAMILNADU SUPPLIERS").toUpperCase();
  doc.text(companyName, pageWidth / 2, margin + 15, { align: "center" });

  // Company Address & Phone
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const addressText = comp.address || "Vellore, Tamil Nadu - 632012.";
  doc.text(addressText, pageWidth / 2, margin + 19, { align: "center" });
  const phoneText = `Mob. : ${comp.phone || "9842345678"}${comp.gstin ? `  |  GSTIN : ${comp.gstin}` : ""}`;
  doc.text(phoneText, pageWidth / 2, margin + 23, { align: "center" });

  // Horizontal divider
  let curY = margin + 26;
  doc.line(margin, curY, pageWidth - margin, curY);

  // Meta grid (Bill No, Date, Supply Date, Place of Supply)
  const metaHeight = 14;
  doc.setFontSize(8.5);

  doc.setFont("helvetica", "bold");
  doc.text("Bill No.", margin + 3, curY + 5);
  doc.setFont("helvetica", "normal");
  doc.text(`: ${bill.billNumber}`, margin + 22, curY + 5);

  doc.setFont("helvetica", "bold");
  doc.text("Dated", margin + 3, curY + 10);
  doc.setFont("helvetica", "normal");
  doc.text(`: ${bill.billDate}`, margin + 22, curY + 10);

  const midX = pageWidth / 2 + 5;
  doc.setFont("helvetica", "bold");
  doc.text("Date of Supply", midX, curY + 5);
  doc.setFont("helvetica", "normal");
  doc.text(`: ${bill.supplyDate || bill.rentalStartDate}`, midX + 28, curY + 5);

  doc.setFont("helvetica", "bold");
  doc.text("Place of Supply", midX, curY + 10);
  doc.setFont("helvetica", "normal");
  doc.text(`: ${bill.placeOfSupply || "Vellore"}`, midX + 28, curY + 10);

  curY += metaHeight;
  doc.line(margin, curY, pageWidth - margin, curY);

  // Customer Grid (Billed To vs Shipped To)
  const custHeight = 24;
  doc.setFont("helvetica", "bold");
  doc.text("Billed to :", margin + 3, curY + 4.5);
  doc.setFont("helvetica", "bold");
  doc.text((bill.customerName || "Customer").toUpperCase(), margin + 3, curY + 9);
  doc.setFont("helvetica", "normal");
  const billingLines = doc.splitTextToSize(bill.customerAddress || "Vellore", contentWidth / 2 - 10);
  doc.text(billingLines, margin + 3, curY + 13);
  if (bill.customerGstin) {
    doc.text(`GSTIN: ${bill.customerGstin}`, margin + 3, curY + 21);
  }

  // Shipped to
  doc.line(pageWidth / 2, curY, pageWidth / 2, curY + custHeight);
  doc.setFont("helvetica", "bold");
  doc.text("Shipped to :", midX, curY + 4.5);
  doc.text((bill.customerName || "Customer").toUpperCase(), midX, curY + 9);
  doc.setFont("helvetica", "normal");
  let deliveryAddress =
    bill.branches?.[0]?.deliveryAddress || bill.customerAddress || bill.placeOfSupply || "Vellore";
  if (bill.deliveryLocation) {
    deliveryAddress = `Dept / Loc: ${bill.deliveryLocation}\n${deliveryAddress}`;
  }
  if (bill.eventName) {
    deliveryAddress = `Event: ${bill.eventName} | ${deliveryAddress}`;
  }
  const shippingLines = doc.splitTextToSize(deliveryAddress, contentWidth / 2 - 10);
  doc.text(shippingLines, midX, curY + 13);

  curY += custHeight;
  doc.line(margin, curY, pageWidth - margin, curY);

  // Table items generation (Single straightforward list of rental products)
  const tableRows: any[] = [];
  let serialNo = 1;

  const allBillItems = (bill.items && bill.items.length > 0)
    ? bill.items
    : (bill.branches || []).flatMap((b) => b.items || []);
  for (const item of allBillItems) {
    const isNote = item.entryType === "note" || (!item.productId && (item.text || (item.itemName && !item.quantity)));
    if (isNote) {
      const noteContent = (item.text || item.itemName || "").trim();
      if (noteContent) {
        tableRows.push([
          {
            content: noteContent,
            colSpan: 7,
            styles: {
              fontStyle: "bold",
              fillColor: [248, 250, 252],
              textColor: [30, 41, 59],
              halign: "left",
              cellPadding: 2,
            },
          },
        ]);
      }
      continue;
    }

    let itemDesc = item.itemName;
    if (item.deliveryLocation) {
      itemDesc += `\nLoc: ${item.deliveryLocation}`;
    }
    const good = item.returnedGoodQuantity ?? item.quantityReturnedGood ?? 0;
    const damaged = item.quantityDamaged ?? 0;
    const missing = item.quantityMissing ?? 0;
    const dispatched = item.dispatchedQuantity ?? item.quantity;
    if (good > 0 || damaged > 0 || missing > 0 || (bill.status && bill.status !== "ISSUED")) {
      itemDesc += `\n[Disp: ${dispatched} | Ret Good: ${good} | Damaged: ${damaged} | Missing: ${missing}]`;
    }
    tableRows.push([
      serialNo++,
      itemDesc,
      item.sizeSpec || "-",
      item.quantity,
      item.days || 1,
      Number(item.unitPrice).toFixed(2),
      Number(item.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
    ]);
  }

  // Summary Rows
  if (bill.transportCharges > 0) {
    tableRows.push([
      { content: "Add : To and Fro Transportation", colSpan: 6, styles: { halign: "right" } },
      Number(bill.transportCharges).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
    ]);
  }
  if (bill.loadingCharges > 0) {
    tableRows.push([
      { content: "Add : Loading / Unloading Charges", colSpan: 6, styles: { halign: "right" } },
      Number(bill.loadingCharges).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
    ]);
  }
  if (bill.laborCharges > 0) {
    tableRows.push([
      { content: "Add : Labor / Setup Charges", colSpan: 6, styles: { halign: "right" } },
      Number(bill.laborCharges).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
    ]);
  }
  if (bill.discountAmount > 0) {
    tableRows.push([
      { content: "Less : Discount", colSpan: 6, styles: { halign: "right" } },
      `-${Number(bill.discountAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
    ]);
  }
  if (isGst && bill.cgstAmount > 0) {
    tableRows.push([
      {
        content: `Add : CGST (${bill.cgstRate}%)`,
        colSpan: 6,
        styles: { halign: "right" },
      },
      Number(bill.cgstAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
    ]);
    tableRows.push([
      {
        content: `Add : SGST (${bill.sgstRate}%)`,
        colSpan: 6,
        styles: { halign: "right" },
      },
      Number(bill.sgstAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
    ]);
  }
  if (isGst && bill.igstAmount > 0) {
    tableRows.push([
      {
        content: `Add : IGST (${bill.igstRate}%)`,
        colSpan: 6,
        styles: { halign: "right" },
      },
      Number(bill.igstAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
    ]);
  }

  // Additional Rental Days Charges
  if ((bill.additionalRentalCharges || 0) > 0) {
    const daysLabel = bill.additionalRentalDays
      ? ` (${bill.additionalRentalDays} Additional Chargeable Days)`
      : " (Additional Days)";
    tableRows.push([
      {
        content: `Add : Additional Rental Days Charges${daysLabel}`,
        colSpan: 6,
        styles: { halign: "right", fontStyle: "bold" },
      },
      Number(bill.additionalRentalCharges).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
    ]);
  }

  // Damaged Goods Charges
  if ((bill.approvedDamageCharges || 0) > 0) {
    const damagedCount = bill.totalDamaged ? ` (${bill.totalDamaged} Damaged Items)` : "";
    tableRows.push([
      {
        content: `Add : Damaged Goods Charges${damagedCount}`,
        colSpan: 6,
        styles: { halign: "right", fontStyle: "bold", textColor: [180, 20, 20] },
      },
      Number(bill.approvedDamageCharges).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
    ]);
  }

  // Missing Goods Charges
  if ((bill.approvedMissingCharges || 0) > 0) {
    const missingCount = bill.totalMissing ? ` (${bill.totalMissing} Missing Items)` : "";
    tableRows.push([
      {
        content: `Add : Missing Goods Charges${missingCount}`,
        colSpan: 6,
        styles: { halign: "right", fontStyle: "bold", textColor: [180, 20, 20] },
      },
      Number(bill.approvedMissingCharges).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
    ]);
  }

  // Late Return Fee Charges
  if ((bill.lateFeeCharges || 0) > 0) {
    tableRows.push([
      {
        content: "Add : Late Return Fee Charges",
        colSpan: 6,
        styles: { halign: "right", fontStyle: "bold" },
      },
      Number(bill.lateFeeCharges).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
    ]);
  }

  // Grand Total Row
  tableRows.push([
    {
      content: "Grand Total  `",
      colSpan: 6,
      styles: { halign: "right", fontStyle: "bold", fontSize: 9.5 },
    },
    {
      content: Number(bill.grandTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
      styles: { fontStyle: "bold", fontSize: 9.5 },
    },
  ]);

  if ((bill.advancePaid || 0) > 0) {
    tableRows.push([
      {
        content: "Less : Advance Received",
        colSpan: 6,
        styles: { halign: "right", fontStyle: "bold" },
      },
      `-${Number(bill.advancePaid).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
    ]);
  }
  if ((bill.amountPaid || 0) > 0) {
    tableRows.push([
      {
        content: "Less : Other Payments Received",
        colSpan: 6,
        styles: { halign: "right", fontStyle: "bold" },
      },
      `-${Number(bill.amountPaid).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
    ]);
  }
  if ((bill.advancePaid || 0) > 0 || (bill.amountPaid || 0) > 0) {
    tableRows.push([
      {
        content: "Net Balance Due  `",
        colSpan: 6,
        styles: { halign: "right", fontStyle: "bold", fontSize: 9.5, textColor: [180, 20, 20] },
      },
      {
        content: Number(bill.balanceDue ?? bill.grandTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
        styles: { fontStyle: "bold", fontSize: 9.5, textColor: [180, 20, 20] },
      },
    ]);
  }

  autoTable(doc, {
    startY: curY,
    margin: { left: margin, right: margin },
    tableWidth: contentWidth,
    head: [["S.N.", "Description of Goods", "Size", "Qty/\nSqFt", "Days", "Price", "Amount ( ` )"]],
    body: tableRows,
    theme: "plain",
    styles: {
      fontSize: 8.5,
      cellPadding: 1.6,
      lineColor: [100, 100, 100],
      lineWidth: 0.1,
      textColor: [20, 20, 20],
    },
    headStyles: {
      fillColor: [248, 248, 248],
      fontStyle: "bold",
      textColor: [0, 0, 0],
      lineWidth: 0.2,
      lineColor: [60, 60, 60],
      halign: "center",
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 20, halign: "center" },
      3: { cellWidth: 15, halign: "center" },
      4: { cellWidth: 14, halign: "center" },
      5: { cellWidth: 22, halign: "right" },
      6: { cellWidth: 26, halign: "right" },
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY || curY + 80;

  // Amount in Words
  let footerY = Math.max(finalY + 2, pageHeight - margin - 42);
  doc.line(margin, footerY, pageWidth - margin, footerY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const wordsText = bill.amountInWords || numberToIndianWords(bill.grandTotal);
  doc.text(wordsText, margin + 3, footerY + 5);

  footerY += 8;
  doc.line(margin, footerY, pageWidth - margin, footerY);

  // Footer: Bank details (Left) & Authorised Signatory (Right)
  const bankDetailsY = footerY + 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("Bank Details:", margin + 3, bankDetailsY);
  doc.setFont("helvetica", "normal");
  doc.text(`A/c. No.    : ${comp.bankAccountNo || "510909010078513"}`, margin + 3, bankDetailsY + 4.5);
  doc.text(
    `Bank Name: ${comp.bankName || "City Union Bank"}, ${comp.bankBranch || "Vellore Branch"}`,
    margin + 3,
    bankDetailsY + 9
  );
  doc.text(`IFSC Code  : ${comp.bankIfsc || "CIUB0000065"}`, margin + 3, bankDetailsY + 13.5);

  const rawNotesList = (bill.notesList && bill.notesList.length > 0)
    ? bill.notesList
    : bill.notes && bill.notes.trim()
    ? bill.notes.trim().split("\n").filter(Boolean)
    : [];

  if (rawNotesList.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("Notes / Special Instructions:", margin + 3, bankDetailsY + 18);
    doc.setFont("helvetica", "normal");
    const formattedNotes = rawNotesList.map((n) => `• ${n.replace(/^[•\-\*]\s*/, "")}`).join("\n");
    const noteLines = doc.splitTextToSize(formattedNotes, contentWidth / 2 - 5);
    doc.text(noteLines, margin + 3, bankDetailsY + 22);
  } else {
    doc.setFont("helvetica", "normal");
    doc.text("Terms and Conditions:", margin + 3, bankDetailsY + 19);
    doc.text("Subject to Vellore Jurisdiction.", margin + 3, bankDetailsY + 23);
  }

  // Right side: Company signature
  const signX = pageWidth - margin - 5;
  doc.setFont("helvetica", "normal");
  doc.text(`for ${companyName}`, signX, bankDetailsY + 2, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.text(comp.authorizedSignatoryTitle || "Authorised Signatory", signX, bankDetailsY + 23, {
    align: "right",
  });

  return doc;
}

/**
 * Generates Quotation PDF
 */
export function generateQuotationPDF(quote: Quotation): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - 2 * margin;

  const comp = quote.companySnapshot || {};

  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.3);
  doc.rect(margin, margin, contentWidth, pageHeight - 2 * margin);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("Rental Quotation", pageWidth - margin - 3, margin + 5, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Q U O T A T I O N", pageWidth / 2, margin + 9, { align: "center" });

  doc.setFontSize(14);
  const companyName = (comp.name || "TAMILNADU SUPPLIERS").toUpperCase();
  doc.text(companyName, pageWidth / 2, margin + 15, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(comp.address || "Vellore, Tamil Nadu - 632012.", pageWidth / 2, margin + 19, {
    align: "center",
  });
  doc.text(`Mob. : ${comp.phone || "9842345678"}`, pageWidth / 2, margin + 23, { align: "center" });

  let curY = margin + 26;
  doc.line(margin, curY, pageWidth - margin, curY);

  // Metadata
  doc.setFont("helvetica", "bold");
  doc.text("Quotation No.", margin + 3, curY + 5);
  doc.setFont("helvetica", "normal");
  const revSuffix = quote.revisionNumber && quote.revisionNumber > 1 ? ` (Rev ${quote.revisionNumber})` : "";
  doc.text(`: ${quote.quotationNumber}${revSuffix}`, margin + 28, curY + 5);

  doc.setFont("helvetica", "bold");
  doc.text("Quotation Date", margin + 3, curY + 10);
  doc.setFont("helvetica", "normal");
  doc.text(`: ${quote.quotationDate}`, margin + 28, curY + 10);

  const midX = pageWidth / 2 + 5;
  doc.setFont("helvetica", "bold");
  doc.text("Rental Period", midX, curY + 5);
  doc.setFont("helvetica", "normal");
  doc.text(`: ${quote.rentalStartDate} to ${quote.rentalEndDate} (${quote.rentalDays} days)`, midX + 26, curY + 5);

  doc.setFont("helvetica", "bold");
  doc.text("Place of Supply", midX, curY + 10);
  doc.setFont("helvetica", "normal");
  doc.text(`: ${quote.placeOfSupply || "Vellore"}`, midX + 26, curY + 10);

  curY += 14;
  doc.line(margin, curY, pageWidth - margin, curY);

  // Customer
  doc.setFont("helvetica", "bold");
  doc.text("Prepared for :", margin + 3, curY + 4.5);
  doc.text((quote.customerName || "Customer").toUpperCase(), margin + 3, curY + 9);
  doc.setFont("helvetica", "normal");
  let customerDetails = quote.customerAddress || "Vellore";
  if (quote.deliveryLocation) {
    customerDetails = `Dept / Loc: ${quote.deliveryLocation} | ${customerDetails}`;
  }
  if (quote.eventName) {
    customerDetails = `Event: ${quote.eventName} | ${customerDetails}`;
  }
  const custLines = doc.splitTextToSize(customerDetails, contentWidth - 10);
  doc.text(custLines, margin + 3, curY + 13);
  doc.text(`Contact: ${quote.customerPhone}`, margin + 3, curY + 18);

  curY += 21;
  doc.line(margin, curY, pageWidth - margin, curY);

  // Items (Single straightforward list of rental products)
  const tableRows: any[] = [];
  let serialNo = 1;

  const allQuoteItems = (quote.items && quote.items.length > 0)
    ? quote.items
    : (quote.branches || []).flatMap((b) => b.items || []);
  for (const item of allQuoteItems) {
    const isNote = item.entryType === "note" || (!item.productId && (item.text || (item.itemName && !item.quantity)));
    if (isNote) {
      const noteContent = (item.text || item.itemName || "").trim();
      if (noteContent) {
        tableRows.push([
          {
            content: noteContent,
            colSpan: 7,
            styles: {
              fontStyle: "bold",
              fillColor: [248, 250, 252],
              textColor: [30, 41, 59],
              halign: "left",
              cellPadding: 2,
            },
          },
        ]);
      }
      continue;
    }

    let itemDesc = item.itemName;
    if (item.deliveryLocation) {
      itemDesc += `\nLoc: ${item.deliveryLocation}`;
    }
    tableRows.push([
      serialNo++,
      itemDesc,
      item.sizeSpec || "-",
      item.quantity,
      item.days || 1,
      Number(item.unitPrice).toFixed(2),
      Number(item.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
    ]);
  }

  // Summary charges
  if (quote.transportCharges > 0) {
    tableRows.push([
      { content: "Add : Transportation", colSpan: 6, styles: { halign: "right" } },
      Number(quote.transportCharges).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
    ]);
  }
  if (quote.loadingCharges > 0) {
    tableRows.push([
      { content: "Add : Loading / Unloading Charges", colSpan: 6, styles: { halign: "right" } },
      Number(quote.loadingCharges).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
    ]);
  }
  if (quote.grandTotal > 0) {
    tableRows.push([
      {
        content: "Quoted Total  `",
        colSpan: 6,
        styles: { halign: "right", fontStyle: "bold", fontSize: 9.5 },
      },
      {
        content: Number(quote.grandTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 }),
        styles: { fontStyle: "bold", fontSize: 9.5 },
      },
    ]);
  }

  autoTable(doc, {
    startY: curY,
    margin: { left: margin, right: margin },
    tableWidth: contentWidth,
    head: [["S.N.", "Description of Goods", "Size", "Qty/\nSqFt", "Days", "Price", "Amount ( ` )"]],
    body: tableRows,
    theme: "plain",
    styles: { fontSize: 8.5, cellPadding: 1.6, lineColor: [100, 100, 100], lineWidth: 0.1 },
    headStyles: { fillColor: [248, 248, 248], fontStyle: "bold" },
  });

  const finalY = (doc as any).lastAutoTable.finalY || curY + 60;
  let footerY = Math.max(finalY + 4, pageHeight - margin - 35);
  doc.line(margin, footerY, pageWidth - margin, footerY);

  doc.setFont("helvetica", "bold");
  doc.text(`Advance Required: ₹ ${Number(quote.advanceRequired).toLocaleString("en-IN")}`, margin + 3, footerY + 5);
  doc.text(`Security Deposit: ₹ ${Number(quote.securityDepositRequired).toLocaleString("en-IN")}`, margin + 65, footerY + 5);

  doc.setFont("helvetica", "normal");
  doc.text(quote.amountInWords || numberToIndianWords(quote.grandTotal), margin + 3, footerY + 10);

  doc.line(margin, footerY + 13, pageWidth - margin, footerY + 13);
  const rawQuoteNotesList = (quote.notesList && quote.notesList.length > 0)
    ? quote.notesList
    : quote.notes && quote.notes.trim()
    ? quote.notes.trim().split("\n").filter(Boolean)
    : [];

  if (rawQuoteNotesList.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("Notes / Special Instructions:", margin + 3, footerY + 17);
    doc.setFont("helvetica", "normal");
    const formattedNotes = rawQuoteNotesList.map((n) => `• ${n.replace(/^[•\-\*]\s*/, "")}`).join("\n");
    const noteLines = doc.splitTextToSize(formattedNotes, contentWidth / 2 - 5);
    doc.text(noteLines, margin + 3, footerY + 21);
  } else {
    doc.text("Terms: 1. Quotation valid for 7 days. 2. Advance mandatory for reservation.", margin + 3, footerY + 18);
  }
  doc.text(`for ${companyName}`, pageWidth - margin - 5, footerY + 18, { align: "right" });
  doc.text("Authorised Signatory", pageWidth - margin - 5, footerY + 28, { align: "right" });

  return doc;
}

/**
 * Generates Gate Pass PDF
 */
export function generateGatePassPDF(gp: GatePass): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - 2 * margin;

  const comp = gp.companySnapshot || {};

  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.3);
  doc.rect(margin, margin, contentWidth, pageHeight - 2 * margin);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("GATE PASS / DISPATCH SLIP", pageWidth / 2, margin + 10, { align: "center" });

  doc.setFontSize(12);
  doc.text((comp.name || "TAMILNADU SUPPLIERS").toUpperCase(), pageWidth / 2, margin + 16, {
    align: "center",
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(`Gate Pass No: ${gp.gatePassNumber}   |   Dispatch Date: ${new Date(gp.dispatchDate).toLocaleString()}`, margin + 5, margin + 25);
  doc.text(`Customer: ${gp.customerName}   |   Destination: ${gp.destinationBranch}`, margin + 5, margin + 30);
  doc.text(`Vehicle No: ${gp.vehicleNumber || "N/A"}   |   Driver: ${gp.driverName || "N/A"} (${gp.driverPhone || "-"})`, margin + 5, margin + 35);
  doc.text(`Expected Return Date: ${gp.expectedReturnDate}`, margin + 5, margin + 40);

  const rows = (gp.items || []).map((it, idx) => [
    idx + 1,
    (it as any).deliveryLocation ? `${it.itemName}\nLoc: ${(it as any).deliveryLocation}` : it.itemName,
    it.sizeSpec || "-",
    it.quantityDispatched,
    it.quantityReturned || 0,
    it.quantityDamaged || 0,
    it.quantityMissing || 0,
  ]);

  autoTable(doc, {
    startY: margin + 45,
    margin: { left: margin, right: margin },
    head: [["S.N.", "Item Name", "Size", "Dispatched", "Returned", "Damaged", "Missing"]],
    body: rows,
    theme: "grid",
    styles: { fontSize: 8.5 },
  });

  const finalY = (doc as any).lastAutoTable.finalY || margin + 80;
  doc.setFontSize(9);
  doc.text("Driver Signature: _______________________", margin + 5, finalY + 25);
  doc.text("Store In-charge: _______________________", pageWidth - margin - 55, finalY + 25);

  return doc;
}
