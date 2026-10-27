// ============================================================================
// WRITES VALIDATED IMPORT ROWS (customers, products, bills + payments)
// Separate from the route so it can be exercised against a real database in scripts/tests.
// ============================================================================

import type { ParsedBill, RecordsPreview } from "./records-importer";

type Store = typeof import("../db/store").default;

export interface ImportResult {
  customersCreated: number;
  productsCreated: number;
  productsUpdated: number;
  billsCreated: number;
  paymentsCreated: number;
  skipped: number;
  failures: Array<{ kind: string; ref: string; error: string }>;
}

export async function executeImport(store: Store, preview: RecordsPreview, actor: unknown): Promise<ImportResult> {
  const result: ImportResult = {
    customersCreated: 0,
    productsCreated: 0,
    productsUpdated: 0,
    billsCreated: 0,
    paymentsCreated: 0,
    skipped: 0,
    failures: [],
  };
  const fail = (kind: string, ref: string, e: unknown) =>
    result.failures.push({ kind, ref, error: e instanceof Error ? e.message.slice(0, 300) : "Unknown error" });

  // 1. Customers
  for (const c of preview.customers) {
    if (c.action !== "create" || c.errors.length > 0) {
      result.skipped++;
      continue;
    }
    try {
      await store.createCustomer({
        name: c.name,
        contactPerson: c.contactPerson,
        mobile: c.mobile,
        email: c.email,
        billingAddress: c.billingAddress,
        gstin: c.gstin,
        state: c.state,
        postalCode: c.postalCode,
        notes: c.notes,
      });
      result.customersCreated++;
    } catch (e) {
      fail("customer", `row ${c.row} (${c.name})`, e);
    }
  }

  // 2. Products (create or update only the filled columns; never touches stock movements)
  for (const p of preview.products) {
    if (p.action === "skip" || p.errors.length > 0) {
      result.skipped++;
      continue;
    }
    try {
      if (p.action === "create") {
        await store.createProduct({
          name: p.name,
          categoryId: p.categoryId,
          categoryName: p.categoryName,
          sizeSpec: p.sizeSpec,
          unit: p.unit || "pcs",
          defaultRentalRate: p.rentalRate ?? 0,
          rentalRateUnit: "PER_DAY",
          minRentalDuration: 1,
          securityDepositAmount: p.securityDeposit ?? 0,
          replacementValue: p.replacementValue ?? 0,
          totalOwnedQuantity: p.totalStock ?? 0,
        });
        result.productsCreated++;
      } else if (p.existingProductId) {
        const existing = await store.getProduct(p.existingProductId);
        if (!existing) throw new Error("Product no longer exists.");
        const updates: Record<string, unknown> = {};
        if (p.rentalRate !== null) updates.defaultRentalRate = p.rentalRate;
        if (p.securityDeposit !== null) updates.securityDepositAmount = p.securityDeposit;
        if (p.replacementValue !== null) updates.replacementValue = p.replacementValue;
        if (p.categoryId) {
          updates.categoryId = p.categoryId;
          updates.categoryName = p.categoryName;
        }
        if (p.totalStock !== null) {
          const committed =
            (existing.reservedQuantity || 0) +
            (existing.rentedQuantity || 0) +
            (existing.damagedQuantity || 0) +
            (existing.missingQuantity || 0) +
            (existing.maintenanceQuantity || 0);
          updates.totalOwnedQuantity = p.totalStock;
          updates.availableQuantity = Math.max(0, p.totalStock - committed);
        }
        await store.updateProduct(p.existingProductId, updates);
        result.productsUpdated++;
      }
    } catch (e) {
      fail("product", `row ${p.row} (${p.name})`, e);
    }
  }

  // 3. Bills and their payments: each bill is written atomically on PostgreSQL
  for (const b of preview.bills) {
    if (b.action !== "create" || b.errors.length > 0 || !b.companyId) {
      result.skipped++;
      continue;
    }
    try {
      const validPayments = b.payments.filter((p) => p.errors.length === 0);
      const created = await store.withTransaction(async (tx) => {
        const bill = await tx.createBill(toBillInput(b, actor));
        for (const p of validPayments) {
          await tx.recordPayment({
            billId: bill.id,
            companyId: bill.companyId,
            customerId: bill.customerId,
            customerName: bill.customerName,
            paymentType: p.type,
            amount: p.amount,
            paymentDate: p.paymentDate,
            paymentMethod: p.method,
            paymentNumber: p.paymentNumber,
            referenceNumber: p.reference,
            notes: "Imported historical payment",
            actor,
          });
        }
        return bill;
      });
      result.billsCreated++;
      result.paymentsCreated += validPayments.length;
      void created;
    } catch (e) {
      fail("bill", b.billNumber, e);
    }
  }

  return result;
}

function toBillInput(b: ParsedBill, actor: unknown) {
  return {
    billNumber: b.billNumber,
    companyId: b.companyId,
    billDate: b.billDate,
    supplyDate: b.rentalStartDate,
    rentalStartDate: b.rentalStartDate,
    rentalEndDate: b.rentalEndDate,
    rentalDays: b.rentalDays,
    customerName: b.customerName,
    customerPhone: b.customerPhone,
    customerAddress: b.customerAddress,
    customerGstin: b.customerGstin,
    transportCharges: b.transportCharges,
    loadingCharges: b.loadingCharges,
    laborCharges: b.laborCharges,
    otherCharges: b.otherCharges,
    discountAmount: b.discountAmount,
    notes: ["Imported historical record.", b.notes].filter(Boolean).join(" "),
    items: b.items.map((i, idx) => ({
      entryType: "product",
      position: idx + 1,
      productId: i.productId || undefined,
      itemName: i.itemName,
      sizeSpec: i.sizeSpec,
      quantity: i.quantity,
      days: i.days,
      unitPrice: i.unitPrice,
      amount: i.amount,
    })),
    actor,
  };
}
