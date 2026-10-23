// ============================================================================
// TAMILNADU SUPPLIERS - DATABASE SCHEMA MAPPERS
// Bidirectional mapping between camelCase application models and snake_case PostgreSQL rows
// ============================================================================

import {
  Company,
  Category,
  Product,
  Customer,
  Quotation,
  QuotationItem,
  Bill,
  BillItem,
  Payment,
  GatePass,
  GatePassItem,
  ReturnRecord,
  User,
  UserRole,
  ModulePermissionId,
  UserSession,
  AuditLog,
  ActivityNotification,
} from "../types";

// --- COMPANIES ---
export function mapCompanyFromRow(row: any): Company {
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name,
    gstType: (row.gst_type === "GST_REGISTERED" || row.gst_type === "GST") ? "GST" : "NON_GST",
    gstin: row.gstin,
    pan: row.pan,
    email: row.email,
    phone: row.phone,
    address: row.address,
    state: row.state,
    stateCode: row.state_code,
    placeOfSupply: row.place_of_supply,
    bankName: row.bank_name,
    bankAccountNo: row.bank_account_no,
    bankIfsc: row.bank_ifsc,
    bankBranch: row.bank_branch,
    invoicePrefix: row.invoice_prefix,
    quotationPrefix: row.quotation_prefix,
    gatePassPrefix: row.gate_pass_prefix,
    nextInvoiceNo: Number(row.next_invoice_no || 1),
    nextQuotationNo: Number(row.next_quotation_no || 1),
    nextGatePassNo: Number(row.next_gate_pass_no || 1),
    logoUrl: row.logo_url,
    termsAndConditions: row.terms_and_conditions || "",
    authorizedSignatoryTitle: row.authorized_signatory_title || "Authorised Signatory",
    notes: row.notes,
    isActive: row.is_active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCompanyToRow(company: Partial<Company>): Record<string, any> {
  const row: Record<string, any> = {};
  if (company.id !== undefined) row.id = company.id;
  if (company.name !== undefined) {
    row.name = company.name;
    row.display_name = company.displayName || company.name;
  } else if (company.displayName !== undefined) {
    row.display_name = company.displayName;
  }
  if (!row.display_name && company.name) row.display_name = company.name;
  if (company.gstType !== undefined) {
    row.gst_type = (company.gstType === "GST" || company.gstType === "GST_REGISTERED") ? "GST_REGISTERED" : "NON_GST";
  }
  if (company.gstin !== undefined) row.gstin = company.gstin;
  if (company.pan !== undefined) row.pan = company.pan;
  if (company.email !== undefined) row.email = company.email;
  if (company.phone !== undefined) row.phone = company.phone;
  row.address = company.address || "123 Main Street, Tamil Nadu";
  row.bank_name = company.bankName || "City Union Bank";
  row.bank_account_no = company.bankAccountNo || "510909010078513";
  row.bank_ifsc = company.bankIfsc || "CIUB0000065";
  row.bank_branch = company.bankBranch || "Vellore Branch";
  if (company.address !== undefined) row.address = company.address;
  if (company.state !== undefined) row.state = company.state;
  if (company.stateCode !== undefined) row.state_code = company.stateCode;
  if (company.placeOfSupply !== undefined) row.place_of_supply = company.placeOfSupply;
  if (company.bankName !== undefined) row.bank_name = company.bankName;
  if (company.bankAccountNo !== undefined) row.bank_account_no = company.bankAccountNo;
  if (company.bankIfsc !== undefined) row.bank_ifsc = company.bankIfsc;
  if (company.bankBranch !== undefined) row.bank_branch = company.bankBranch;
  if (company.invoicePrefix !== undefined) row.invoice_prefix = company.invoicePrefix;
  if (company.quotationPrefix !== undefined) row.quotation_prefix = company.quotationPrefix;
  if (company.gatePassPrefix !== undefined) row.gate_pass_prefix = company.gatePassPrefix;
  if (company.nextInvoiceNo !== undefined) row.next_invoice_no = company.nextInvoiceNo;
  if (company.nextQuotationNo !== undefined) row.next_quotation_no = company.nextQuotationNo;
  if (company.nextGatePassNo !== undefined) row.next_gate_pass_no = company.nextGatePassNo;
  if (company.logoUrl !== undefined) row.logo_url = company.logoUrl;
  if (company.termsAndConditions !== undefined) row.terms_and_conditions = company.termsAndConditions;
  if (company.authorizedSignatoryTitle !== undefined) row.authorized_signatory_title = company.authorizedSignatoryTitle;
  if (company.notes !== undefined) row.notes = company.notes;
  if (company.isActive !== undefined) row.is_active = company.isActive;
  if (company.createdAt !== undefined) row.created_at = company.createdAt;
  if (company.updatedAt !== undefined) row.updated_at = company.updatedAt;
  return row;
}

// --- CATEGORIES ---
export function mapCategoryFromRow(row: any): Category {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    parentId: row.parent_id,
    isActive: row.is_active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCategoryToRow(category: Partial<Category>): Record<string, any> {
  const row: Record<string, any> = {};
  if (category.id !== undefined) row.id = category.id;
  if (category.name !== undefined) row.name = category.name;
  if (category.code !== undefined) row.code = category.code;
  if (category.description !== undefined) row.description = category.description;
  if (category.parentId !== undefined) row.parent_id = category.parentId;
  if (category.isActive !== undefined) row.is_active = category.isActive;
  if (category.createdAt !== undefined) row.created_at = category.createdAt;
  if (category.updatedAt !== undefined) row.updated_at = category.updatedAt;
  return row;
}

// --- PRODUCTS ---
export function mapProductFromRow(row: any): Product {
  return {
    id: row.id,
    name: row.name,
    alias: row.alias,
    sku: row.sku,
    categoryId: row.category_id,
    categoryName: row.category_name,
    description: row.description,
    sizeSpec: row.size_spec,
    unit: row.unit || "Nos",
    defaultRentalRate: Number(row.default_rental_rate || 0),
    rentalRate: Number(row.default_rental_rate || 0),
    rentalRateUnit: row.rental_rate_unit || "PER_DAY",
    minRentalDuration: Number(row.min_rental_duration || 1),
    securityDepositAmount: Number(row.security_deposit_amount || 0),
    replacementValue: Number(row.replacement_value || 0),
    totalOwnedQuantity: Number(row.total_owned_quantity || 0),
    availableQuantity: Number(row.available_quantity || 0),
    reservedQuantity: Number(row.reserved_quantity || 0),
    rentedQuantity: Number(row.rented_quantity || 0),
    damagedQuantity: Number(row.damaged_quantity || 0),
    missingQuantity: Number(row.missing_quantity || 0),
    maintenanceQuantity: Number(row.maintenance_quantity || 0),
    isActive: row.is_active !== false,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapProductToRow(product: Partial<Product>): Record<string, any> {
  const row: Record<string, any> = {};
  if (product.id !== undefined) row.id = product.id;
  if (product.name !== undefined) row.name = product.name;
  if (product.alias !== undefined) row.alias = product.alias;
  if (product.sku !== undefined) row.sku = product.sku;
  if (product.categoryId !== undefined) row.category_id = product.categoryId;
  if (product.categoryName !== undefined) row.category_name = product.categoryName;
  if (product.description !== undefined) row.description = product.description;
  if (product.sizeSpec !== undefined) row.size_spec = product.sizeSpec;
  if (product.unit !== undefined) row.unit = product.unit;
  if (product.defaultRentalRate !== undefined || (product as any).rentalRate !== undefined) {
    row.default_rental_rate = product.defaultRentalRate !== undefined ? product.defaultRentalRate : (product as any).rentalRate;
  }
  if (product.rentalRateUnit !== undefined) row.rental_rate_unit = product.rentalRateUnit;
  if (product.minRentalDuration !== undefined) row.min_rental_duration = product.minRentalDuration;
  if (product.securityDepositAmount !== undefined) row.security_deposit_amount = product.securityDepositAmount;
  if (product.replacementValue !== undefined) row.replacement_value = product.replacementValue;
  if (product.totalOwnedQuantity !== undefined) row.total_owned_quantity = product.totalOwnedQuantity;
  if (product.availableQuantity !== undefined) row.available_quantity = product.availableQuantity;
  if (product.reservedQuantity !== undefined) row.reserved_quantity = product.reservedQuantity;
  if (product.rentedQuantity !== undefined) row.rented_quantity = product.rentedQuantity;
  if (product.damagedQuantity !== undefined) row.damaged_quantity = product.damagedQuantity;
  if (product.missingQuantity !== undefined) row.missing_quantity = product.missingQuantity;
  if (product.maintenanceQuantity !== undefined) row.maintenance_quantity = product.maintenanceQuantity;
  if (product.isActive !== undefined) row.is_active = product.isActive;
  if (product.notes !== undefined) row.notes = product.notes;
  if (product.createdAt !== undefined) row.created_at = product.createdAt;
  if (product.updatedAt !== undefined) row.updated_at = product.updatedAt;
  return row;
}

// --- CUSTOMERS ---
export function mapCustomerFromRow(row: any): Customer & { phone: string; address: string } {
  const c: any = {
    id: row.id,
    name: row.name,
    contactPerson: row.contact_person,
    mobile: row.mobile || row.phone || "",
    phone: row.mobile || row.phone || "",
    whatsapp: row.whatsapp,
    email: row.email,
    billingAddress: row.billing_address || "",
    address: row.billing_address || "",
    gstin: row.gstin,
    state: row.state || "Tamil Nadu",
    postalCode: row.postal_code,
    notes: row.notes,
    isActive: row.is_active !== false,
    branches: Array.isArray(row.branches) ? row.branches : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  return c;
}

export function mapCustomerToRow(cust: Partial<Customer> & { phone?: string; address?: string }): Record<string, any> {
  const row: Record<string, any> = {};
  if (cust.id !== undefined) row.id = cust.id;
  if (cust.name !== undefined) row.name = cust.name;
  if (cust.contactPerson !== undefined) row.contact_person = cust.contactPerson;
  if (cust.mobile !== undefined) {
    row.mobile = cust.mobile;
  } else if (cust.phone !== undefined) {
    row.mobile = cust.phone;
  }
  if (cust.whatsapp !== undefined) row.whatsapp = cust.whatsapp;
  if (cust.email !== undefined) row.email = cust.email;
  if (cust.billingAddress !== undefined) {
    row.billing_address = cust.billingAddress;
  } else if (cust.address !== undefined) {
    row.billing_address = cust.address;
  }
  if (!row.billing_address) {
    row.billing_address = "Tamil Nadu, India";
  }
  if (cust.gstin !== undefined) row.gstin = cust.gstin;
  if (cust.state !== undefined) row.state = cust.state;
  if (cust.postalCode !== undefined) row.postal_code = cust.postalCode;
  if (cust.notes !== undefined) row.notes = cust.notes;
  if (cust.isActive !== undefined) row.is_active = cust.isActive;
  if (cust.createdAt !== undefined) row.created_at = cust.createdAt;
  if (cust.updatedAt !== undefined) row.updated_at = cust.updatedAt;
  return row;
}

// --- ITEM MAPPERS ---
export function mapQuotationItemFromRow(row: any): QuotationItem {
  return {
    id: row.id,
    quotationId: row.quotation_id,
    quotationBranchId: row.quotation_branch_id,
    entryType: row.entry_type || "product",
    position: Number(row.position || 0),
    productId: row.product_id,
    itemName: row.item_name,
    sizeSpec: row.size_spec,
    quantity: Number(row.quantity || 0),
    days: Number(row.days || 1),
    unitPrice: Number(row.unit_price || 0),
    amount: Number(row.amount || 0),
    itemOrder: Number(row.item_order || row.position || 0),
    notes: row.notes,
    text: row.text,
  };
}

export function mapBillItemFromRow(row: any): BillItem {
  return {
    id: row.id,
    billId: row.bill_id,
    billBranchId: row.bill_branch_id,
    entryType: row.entry_type || "product",
    position: Number(row.position || 0),
    productId: row.product_id,
    itemName: row.item_name,
    sizeSpec: row.size_spec,
    quantity: Number(row.quantity || 0),
    days: Number(row.days || 1),
    unitPrice: Number(row.unit_price || 0),
    amount: Number(row.amount || 0),
    itemOrder: Number(row.item_order || row.position || 0),
    notes: row.notes,
    text: row.text,
    dispatchedQuantity: Number(row.quantity || 0),
    returnedGoodQuantity: Number(row.quantity_physically_returned || 0),
    quantityReturnedGood: Number(row.quantity_physically_returned || 0),
    quantityDamaged: 0,
    quantityMissing: 0,
    outstandingQuantity: Math.max(0, Number(row.quantity || 0) - Number(row.quantity_physically_returned || 0)),
    damageChargeDecision: "NO_CHARGE",
    damageChargeAmount: 0,
    missingChargeDecision: "NO_CHARGE",
    missingChargeAmount: 0,
  };
}

// --- QUOTATIONS ---
export function mapQuotationFromRow(row: any, items: QuotationItem[] = []): Quotation {
  const mappedItems = items.map((it: any) => (it.item_name !== undefined ? mapQuotationItemFromRow(it) : it));
  return {
    id: row.id,
    quotationNumber: row.quotation_number,
    revisionNumber: Number(row.revision_number || 1),
    companyId: row.company_id,
    companySnapshot: row.company_snapshot || null,
    customerId: row.customer_id,
    customerName: row.customer_name,

    customerPhone: row.customer_phone,
    customerAddress: row.customer_address,
    customerGstin: row.customer_gstin,
    quotationDate: row.quotation_date,
    supplyDate: row.supply_date,
    placeOfSupply: row.place_of_supply,
    rentalStartDate: row.rental_start_date,
    rentalEndDate: row.rental_end_date,
    rentalDays: Number(row.rental_days || 1),
    status: row.status,
    taxType: row.tax_type,
    subtotal: Number(row.subtotal || 0),
    transportCharges: Number(row.transport_charges || 0),
    loadingCharges: Number(row.loading_charges || 0),
    laborCharges: Number(row.labor_charges || 0),
    otherCharges: Number(row.other_charges || 0),
    discountAmount: Number(row.discount_amount || 0),
    taxableAmount: Number(row.taxable_amount || 0),
    cgstRate: Number(row.cgst_rate || 0),
    cgstAmount: Number(row.cgst_amount || 0),
    sgstRate: Number(row.sgst_rate || 0),
    sgstAmount: Number(row.sgst_amount || 0),
    igstRate: Number(row.igst_rate || 0),
    igstAmount: Number(row.igst_amount || 0),
    totalTax: Number(row.total_tax || 0),
    grandTotal: Number(row.grand_total || 0),
    advanceRequired: Number(row.advance_required || 0),
    securityDepositRequired: Number(row.security_deposit_required || 0),
    amountInWords: row.amount_in_words || "",
    notes: row.notes,
    notesList: row.notes ? row.notes.split("\n").filter(Boolean) : null,
    termsAndConditions: row.terms_and_conditions,
    convertedBillId: row.converted_bill_id,
    convertedBillNumber: row.converted_bill_number,
    convertedAt: row.converted_at,
    documentLines: Array.isArray(row.document_lines) ? row.document_lines : [],
    items: mappedItems,
    branches: (Array.isArray(row.branches) && row.branches.length > 0)
      ? row.branches
      : [
          {
            branchName: "Main Branch",
            branchAddress: row.customer_address || "",
            items: mappedItems,
          },
        ],
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapQuotationToRow(quote: Partial<Quotation>): Record<string, any> {
  const row: Record<string, any> = {};
  if (quote.id !== undefined) row.id = quote.id;
  if (quote.quotationNumber !== undefined) row.quotation_number = quote.quotationNumber;
  if (quote.companyId !== undefined) row.company_id = quote.companyId;
  if (quote.companySnapshot !== undefined) row.company_snapshot = quote.companySnapshot;
  if (quote.customerId !== undefined) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(quote.customerId || "");
    if (isUuid) {
      row.customer_id = quote.customerId;
    }
  }
  if (quote.customerName !== undefined) row.customer_name = quote.customerName;
  if (quote.customerPhone !== undefined) row.customer_phone = quote.customerPhone;
  if (quote.customerAddress !== undefined) row.customer_address = quote.customerAddress;
  if (quote.customerGstin !== undefined) row.customer_gstin = quote.customerGstin;
  if (quote.quotationDate !== undefined) row.quotation_date = quote.quotationDate;
  if (quote.supplyDate !== undefined) row.supply_date = quote.supplyDate;
  if (quote.placeOfSupply !== undefined) row.place_of_supply = quote.placeOfSupply;
  if (quote.rentalStartDate !== undefined) row.rental_start_date = quote.rentalStartDate;
  if (quote.rentalEndDate !== undefined) row.rental_end_date = quote.rentalEndDate;
  if (quote.rentalDays !== undefined) row.rental_days = quote.rentalDays;
  if (quote.status !== undefined) {
    const s = String(quote.status).toUpperCase();
    row.status = s === "APPROVED" ? "ACCEPTED" : s;
  }
  if (quote.taxType !== undefined) {
    row.tax_type = (quote.taxType === "GST" || quote.taxType === "GST_REGISTERED") ? "GST" : "NON_GST";
  }
  if (quote.subtotal !== undefined) row.subtotal = quote.subtotal;
  if (quote.transportCharges !== undefined) row.transport_charges = quote.transportCharges;
  if (quote.loadingCharges !== undefined) row.loading_charges = quote.loadingCharges;
  if (quote.laborCharges !== undefined) row.labor_charges = quote.laborCharges;
  if (quote.otherCharges !== undefined) row.other_charges = quote.otherCharges;
  if (quote.discountAmount !== undefined) row.discount_amount = quote.discountAmount;
  if (quote.taxableAmount !== undefined) row.taxable_amount = quote.taxableAmount;
  if (quote.cgstRate !== undefined) row.cgst_rate = quote.cgstRate;
  if (quote.cgstAmount !== undefined) row.cgst_amount = quote.cgstAmount;
  if (quote.sgstRate !== undefined) row.sgst_rate = quote.sgstRate;
  if (quote.sgstAmount !== undefined) row.sgst_amount = quote.sgstAmount;
  if (quote.igstRate !== undefined) row.igst_rate = quote.igstRate;
  if (quote.igstAmount !== undefined) row.igst_amount = quote.igstAmount;
  if (quote.totalTax !== undefined) row.total_tax = quote.totalTax;
  if (quote.grandTotal !== undefined) row.grand_total = quote.grandTotal;
  if (quote.advanceRequired !== undefined) row.advance_required = quote.advanceRequired;
  if (quote.securityDepositRequired !== undefined) row.security_deposit_required = quote.securityDepositRequired;
  if (quote.amountInWords !== undefined) row.amount_in_words = quote.amountInWords;
  if (quote.notes !== undefined) {
    row.notes = quote.notes;
  } else if (quote.notesList && Array.isArray(quote.notesList)) {
    row.notes = quote.notesList.join("\n");
  }
  if (quote.termsAndConditions !== undefined) row.terms_and_conditions = quote.termsAndConditions;
  if (quote.convertedBillId !== undefined) row.converted_bill_id = quote.convertedBillId;
  if (quote.convertedBillNumber !== undefined) row.converted_bill_number = quote.convertedBillNumber;
  if (quote.convertedAt !== undefined) row.converted_at = quote.convertedAt;
  if (quote.documentLines !== undefined) {
    row.document_lines = quote.documentLines;
  } else if ((quote as any).items !== undefined) {
    row.document_lines = (quote as any).items;
  }
  if (quote.createdBy !== undefined) {
    if (quote.createdBy && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(quote.createdBy)) {
      row.created_by = quote.createdBy;
    } else {
      row.created_by = null;
    }
  }
  if (quote.createdAt !== undefined) row.created_at = quote.createdAt;
  if (quote.updatedAt !== undefined) row.updated_at = quote.updatedAt;
  return row;
}

// --- BILLS ---
export function mapBillFromRow(row: any, items: BillItem[] = []): Bill {
  const mappedItems = items.map((it: any) => (it.item_name !== undefined ? mapBillItemFromRow(it) : it));
  return {
    id: row.id,
    billNumber: row.bill_number,
    companyId: row.company_id,
    companySnapshot: row.company_snapshot || null,
    sourceQuotationId: row.source_quotation_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerAddress: row.customer_address,
    customerGstin: row.customer_gstin,
    billDate: row.bill_date,
    supplyDate: row.supply_date,
    placeOfSupply: row.place_of_supply,
    rentalStartDate: row.rental_start_date,
    rentalEndDate: row.rental_end_date,
    expectedReturnDate: row.expected_return_date || row.rental_end_date,
    actualReturnDate: row.actual_return_date || null,
    rentalDays: Number(row.rental_days || 1),
    rentalDuration: Number(row.rental_duration || row.rental_days || 1),
    rentalBillingUnit: row.rental_billing_unit || "PER_DAY",
    originalRentalDuration: Number(row.original_rental_duration || row.rental_days || 1),
    agreedRentalRate: Number(row.agreed_rental_rate || 0),
    lateReturnPolicy: row.late_return_policy || "DAILY_RATE",
    status: (row.status === "ISSUED" || !row.status)
      ? "ACTIVE"
      : (row.status === "PAID" ? "CLOSED" : row.status),
    taxType: row.tax_type,
    subtotal: Number(row.subtotal || 0),

    transportCharges: Number(row.transport_charges || 0),
    loadingCharges: Number(row.loading_charges || 0),
    laborCharges: Number(row.labor_charges || 0),
    otherCharges: Number(row.other_charges || 0),
    discountAmount: Number(row.discount_amount || 0),
    taxableAmount: Number(row.taxable_amount || 0),
    cgstRate: Number(row.cgst_rate || 0),
    cgstAmount: Number(row.cgst_amount || 0),
    sgstRate: Number(row.sgst_rate || 0),
    sgstAmount: Number(row.sgst_amount || 0),
    igstRate: Number(row.igst_rate || 0),
    igstAmount: Number(row.igst_amount || 0),
    totalTax: Number(row.total_tax || 0),
    grandTotal: Number(row.grand_total || 0),
    originalGrandTotal: row.original_grand_total ? Number(row.original_grand_total) : Number(row.grand_total || 0),
    additionalRentalCharges: Number(row.additional_rental_charges || 0),
    approvedDamageCharges: Number(row.approved_damage_charges || 0),
    approvedMissingCharges: Number(row.approved_missing_charges || 0),
    lateFeeCharges: Number(row.late_fee_charges || 0),
    depositAdjustment: Number(row.deposit_adjustment || 0),
    depositRefundDue: Number(row.deposit_refund_due || 0),
    customerCredit: Number(row.customer_credit || 0),
    paymentStatus: row.payment_status || (Number(row.balance_due || 0) <= 0 && (Number(row.amount_paid || 0) > 0 || Number(row.advance_paid || 0) > 0) ? "FULLY_PAID" : (Number(row.amount_paid || 0) > 0 || Number(row.advance_paid || 0) > 0) ? "PARTIALLY_PAID" : "UNPAID"),
    isOverdue: Boolean(row.is_overdue),
    totalReturnedGood: Number(row.total_returned_good || 0),
    totalDamaged: Number(row.total_damaged || 0),
    totalMissing: Number(row.total_missing || 0),
    incidents: Array.isArray(row.incidents) ? row.incidents : [],
    amendments: Array.isArray(row.amendments) ? row.amendments : [],
    notesList: row.notes ? row.notes.split("\n").filter(Boolean) : null,
    branches: (Array.isArray(row.branches) && row.branches.length > 0)
      ? row.branches
      : [
          {
            branchName: "Main Branch",
            branchAddress: row.customer_address || "",
            items: mappedItems,
          },
        ],
    advancePaid: Number(row.advance_paid || 0),
    advanceAmount: Number(row.advance_paid || 0),
    securityDepositHeld: Number(row.security_deposit_held || 0),
    amountPaid: Number(row.amount_paid || 0),
    paidAmount: Number(row.amount_paid || 0),
    balanceDue: Number(row.balance_due || 0),
    amountInWords: row.amount_in_words || "",
    notes: row.notes,
    termsAndConditions: row.terms_and_conditions,
    documentLines: Array.isArray(row.document_lines) ? row.document_lines : [],
    items: mappedItems,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapBillToRow(bill: Partial<Bill>): Record<string, any> {
  const row: Record<string, any> = {};
  if (bill.id !== undefined) row.id = bill.id;
  if (bill.billNumber !== undefined) row.bill_number = bill.billNumber;
  if (bill.companyId !== undefined) row.company_id = bill.companyId;
  if (bill.companySnapshot !== undefined) row.company_snapshot = bill.companySnapshot;
  if (bill.sourceQuotationId !== undefined) row.source_quotation_id = bill.sourceQuotationId || null;
  if (bill.customerId !== undefined) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bill.customerId || "");
    if (isUuid) {
      row.customer_id = bill.customerId;
    }
  }
  if (bill.customerName !== undefined) row.customer_name = bill.customerName;
  if (bill.customerPhone !== undefined) row.customer_phone = bill.customerPhone;
  if (bill.customerAddress !== undefined) row.customer_address = bill.customerAddress;
  if (bill.customerGstin !== undefined) row.customer_gstin = bill.customerGstin || null;
  if (bill.billDate !== undefined) row.bill_date = bill.billDate;
  if (bill.supplyDate !== undefined) row.supply_date = bill.supplyDate;
  if (bill.placeOfSupply !== undefined) row.place_of_supply = bill.placeOfSupply;
  if (bill.rentalStartDate !== undefined) row.rental_start_date = bill.rentalStartDate;
  if (bill.rentalEndDate !== undefined) {
    row.rental_end_date = bill.rentalEndDate;
  } else if (bill.expectedReturnDate !== undefined) {
    row.rental_end_date = bill.expectedReturnDate;
  }
  if (bill.rentalDays !== undefined || bill.rentalDuration !== undefined) {
    row.rental_days = bill.rentalDays ?? bill.rentalDuration;
  }
  if (bill.status !== undefined) {
    const s = String(bill.status).toUpperCase();
    if (s === "CLOSED" || s === "SETTLED") {
      row.status = "PAID";
    } else if (s === "ACTIVE" || s === "ISSUED") {
      row.status = "ISSUED";
    } else if (["PARTIALLY_PAID", "PAID", "CANCELLED"].includes(s)) {
      row.status = s;
    } else if (s === "FULLY_PAID") {
      row.status = "PAID";
    } else {
      row.status = "ISSUED";
    }
  }
  if (bill.taxType !== undefined) {
    row.tax_type = (bill.taxType === "GST" || bill.taxType === "GST_REGISTERED") ? "GST" : "NON_GST";
  }
  if (bill.subtotal !== undefined) row.subtotal = bill.subtotal;
  if (bill.transportCharges !== undefined) row.transport_charges = bill.transportCharges;
  if (bill.loadingCharges !== undefined) row.loading_charges = bill.loadingCharges;
  if (bill.laborCharges !== undefined) row.labor_charges = bill.laborCharges;
  if (bill.otherCharges !== undefined) row.other_charges = bill.otherCharges;
  if (bill.discountAmount !== undefined) row.discount_amount = bill.discountAmount;
  if (bill.taxableAmount !== undefined) row.taxable_amount = bill.taxableAmount;
  if (bill.cgstRate !== undefined) row.cgst_rate = bill.cgstRate;
  if (bill.cgstAmount !== undefined) row.cgst_amount = bill.cgstAmount;
  if (bill.sgstRate !== undefined) row.sgst_rate = bill.sgstRate;
  if (bill.sgstAmount !== undefined) row.sgst_amount = bill.sgstAmount;
  if (bill.igstRate !== undefined) row.igst_rate = bill.igstRate;
  if (bill.igstAmount !== undefined) row.igst_amount = bill.igstAmount;
  if (bill.totalTax !== undefined) row.total_tax = bill.totalTax;
  if (bill.grandTotal !== undefined) row.grand_total = bill.grandTotal;
  if (bill.advancePaid !== undefined) row.advance_paid = bill.advancePaid;
  if (bill.securityDepositHeld !== undefined) row.security_deposit_held = bill.securityDepositHeld;
  if (bill.amountPaid !== undefined) row.amount_paid = bill.amountPaid;
  if (bill.balanceDue !== undefined) row.balance_due = bill.balanceDue;
  if (bill.amountInWords !== undefined) row.amount_in_words = bill.amountInWords;
  if (bill.notes !== undefined) {
    row.notes = bill.notes;
  } else if (bill.notesList && Array.isArray(bill.notesList)) {
    row.notes = bill.notesList.join("\n");
  }
  if (bill.termsAndConditions !== undefined) row.terms_and_conditions = bill.termsAndConditions;
  if (bill.documentLines !== undefined) {
    row.document_lines = bill.documentLines;
  } else if ((bill as any).items !== undefined) {
    row.document_lines = (bill as any).items;
  }
  if (bill.createdBy !== undefined) {
    if (bill.createdBy && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bill.createdBy)) {
      row.created_by = bill.createdBy;
    } else {
      row.created_by = null;
    }
  }
  if (bill.createdAt !== undefined) row.created_at = bill.createdAt;
  if (bill.updatedAt !== undefined) row.updated_at = bill.updatedAt;
  return row;
}

// --- PAYMENTS ---
export function mapPaymentFromRow(row: any): Payment {
  return {
    id: row.id,
    paymentNumber: row.payment_number,
    billId: row.bill_id,
    companyId: row.company_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    paymentType: row.payment_type,
    amount: Number(row.amount || 0),
    paymentDate: row.payment_date,
    paymentMethod: row.payment_method,
    referenceNumber: row.reference_number,
    notes: row.notes,
    isReversed: Boolean(row.is_reversed),
    reversedAt: row.reversed_at,
    reversalReason: row.reversal_reason,
    createdAt: row.created_at,
  };
}

export function mapPaymentToRow(payment: Partial<Payment>): Record<string, any> {
  const row: Record<string, any> = {};
  if (payment.id !== undefined) row.id = payment.id;
  if (payment.paymentNumber !== undefined) row.payment_number = payment.paymentNumber;
  if (payment.billId !== undefined) row.bill_id = payment.billId;
  if (payment.companyId !== undefined) row.company_id = payment.companyId;
  if (payment.customerId !== undefined) row.customer_id = payment.customerId;
  if (payment.paymentType) {
    const t = String(payment.paymentType).toUpperCase();
    if (["RENTAL_PAYMENT", "ADVANCE", "SECURITY_DEPOSIT", "DEPOSIT_REFUND", "DAMAGE_SETTLEMENT"].includes(t)) {
      row.payment_type = t;
    } else if (t === "PAYMENT" || t === "PARTIAL_PAYMENT") {
      row.payment_type = "RENTAL_PAYMENT";
    } else {
      row.payment_type = "RENTAL_PAYMENT";
    }
  } else {
    row.payment_type = "RENTAL_PAYMENT";
  }
  if (payment.amount !== undefined) row.amount = payment.amount;
  row.payment_date = payment.paymentDate || new Date().toISOString().split("T")[0];
  if (payment.paymentMethod) {
    const m = String(payment.paymentMethod).toUpperCase();
    if (["NEFT", "RTGS", "IMPS", "BANK_TRANSFER", "TRANSFER", "NET_BANKING"].includes(m)) {
      row.payment_method = "BANK_TRANSFER";
    } else if (["UPI", "GPAY", "PHONEPE"].includes(m)) {
      row.payment_method = "UPI";
    } else if (["CHEQUE", "CHECK"].includes(m)) {
      row.payment_method = "CHEQUE";
    } else if (["ONLINE", "CARD", "CREDIT_CARD", "DEBIT_CARD"].includes(m)) {
      row.payment_method = "ONLINE";
    } else if (m === "CASH") {
      row.payment_method = "CASH";
    } else {
      row.payment_method = "BANK_TRANSFER";
    }
  } else {
    row.payment_method = "CASH";
  }
  if (payment.referenceNumber !== undefined) row.reference_number = payment.referenceNumber;
  if (payment.notes !== undefined) row.notes = payment.notes;
  if (payment.isReversed !== undefined) row.is_reversed = payment.isReversed;
  if (payment.reversedAt !== undefined) row.reversed_at = payment.reversedAt;
  if (payment.reversalReason !== undefined) row.reversal_reason = payment.reversalReason;
  if ((payment as any).createdBy !== undefined) row.created_by = (payment as any).createdBy;
  if (payment.createdAt !== undefined) row.created_at = payment.createdAt;
  return row;
}

// --- USERS ---
export function mapUserFromRow(row: any, includeSensitive = false): User {
  let effectiveRole: UserRole = row.role;
  const perms: string[] = Array.isArray(row.permissions) ? row.permissions : [];
  if (row.role !== "SUPER_ADMIN") {
    if (perms.includes("role:ADMIN")) effectiveRole = "ADMIN";
    else if (perms.includes("role:BILLING")) effectiveRole = "BILLING";
    else if (perms.includes("role:SUPER_ADMIN")) effectiveRole = "SUPER_ADMIN";
    else effectiveRole = "EMPLOYEE";
  }

  const user: User = {
    id: row.id,
    email: row.email,
    username: row.username || (row.email ? row.email.split("@")[0] : ""),
    name: row.name,
    phone: row.phone,
    role: effectiveRole,
    status: row.status,
    mustChangePassword: false,
    permissions: perms.filter((p) => !p.startsWith("role:")) as ModulePermissionId[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (includeSensitive && row.password_hash) {
    user.passwordHash = row.password_hash;
  }
  return user;
}

export function mapUserToRow(user: Partial<User>): Record<string, any> {
  const row: Record<string, any> = {};
  if (user.id !== undefined) row.id = user.id;
  if (user.email !== undefined) row.email = user.email;
  if (user.name !== undefined) row.name = user.name;
  if (user.phone !== undefined) row.phone = user.phone;

  // Role mapping: Database check constraint enforces ('SUPER_ADMIN', 'EMPLOYEE')
  let perms: string[] = Array.isArray(user.permissions) ? [...user.permissions] : [];
  if (user.role !== undefined) {
    if (user.role === "SUPER_ADMIN") {
      row.role = "SUPER_ADMIN";
    } else {
      row.role = "EMPLOYEE";
      if (user.role === "ADMIN" && !perms.includes("role:ADMIN")) {
        perms.push("role:ADMIN");
      } else if (user.role === "BILLING" && !perms.includes("role:BILLING")) {
        perms.push("role:BILLING");
      }
    }
  }

  if (user.permissions !== undefined || perms.length > 0) {
    row.permissions = perms;
  }

  if (user.status !== undefined) row.status = user.status;
  if (user.passwordHash !== undefined) row.password_hash = user.passwordHash;
  if (user.createdAt !== undefined) row.created_at = user.createdAt;
  if (user.updatedAt !== undefined) row.updated_at = user.updatedAt;
  return row;
}

// --- SESSIONS ---
export function mapSessionFromRow(row: any): UserSession {
  return {
    id: row.id || "",
    userId: row.user_id || "",
    userName: row.user_name || row.username || "User",
    username: row.username || row.user_name || "user",
    userEmail: row.username || row.user_name || "",
    role: row.user_role || "EMPLOYEE",
    ipAddress: row.ip_address || "127.0.0.1",
    userAgent: row.user_agent || "",
    createdAt: row.created_at,
    lastActivityAt: row.last_activity_at || row.created_at,
    expiresAt: row.expires_at,
    status: row.status || "ACTIVE",
    rejectedAt: row.rejected_at,
    rejectedBy: row.rejected_by,
    rejectedByUserId: row.rejected_by_user_id,
  };
}

export function mapSessionToRow(s: Partial<UserSession>): Record<string, any> {
  const row: Record<string, any> = {};
  if (s.id !== undefined) {
    row.id = s.id;
    row.token = s.id;
  }
  if (!row.token) {
    row.token = crypto.randomUUID();
  }
  if (s.userId !== undefined) row.user_id = s.userId;
  if (s.userName !== undefined) row.user_name = s.userName;
  if (s.username !== undefined) row.username = s.username;
  if (s.role !== undefined) row.user_role = s.role;
  if (s.ipAddress !== undefined) row.ip_address = s.ipAddress;
  if (s.userAgent !== undefined) row.user_agent = s.userAgent;
  if (s.createdAt !== undefined) row.created_at = s.createdAt;
  if (s.lastActivityAt !== undefined) row.last_activity_at = s.lastActivityAt;
  if (s.expiresAt !== undefined) row.expires_at = s.expiresAt;
  if (s.status !== undefined) row.status = s.status;
  if (s.rejectedAt !== undefined) row.rejected_at = s.rejectedAt;
  if (s.rejectedBy !== undefined) row.rejected_by = s.rejectedBy;
  if (s.rejectedByUserId !== undefined) {
    row.rejected_by_user_id = (s.rejectedByUserId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.rejectedByUserId))
      ? s.rejectedByUserId
      : null;
  }
  return row;
}

// --- AUDIT LOGS ---
export function mapAuditLogFromRow(row: any): AuditLog {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityNumber: row.entity_number,
    customerName: row.customer_name,
    action: row.action,
    actionLabel: row.action_label,
    actorId: row.actor_id,
    actorName: row.actor_name,
    actorUsername: row.actor_username,
    actorRole: row.actor_role,
    details: row.details || {},
    ipAddress: row.ip_address,
    createdAt: row.created_at,
  };
}

export function mapAuditLogToRow(l: Partial<AuditLog> & { actor?: any }): Record<string, any> {
  const row: Record<string, any> = {};
  if (l.id !== undefined) row.id = l.id;
  if (l.entityType !== undefined) row.entity_type = l.entityType;
  if (l.entityId !== undefined) row.entity_id = l.entityId;
  if (l.entityNumber !== undefined) row.entity_number = l.entityNumber;
  if (l.customerName !== undefined) row.customer_name = l.customerName;
  if (l.action !== undefined) row.action = l.action;
  if (l.actionLabel !== undefined) row.action_label = l.actionLabel;

  const actor = l.actor || {};
  const actorId = l.actorId ?? actor.id ?? actor.userId;
  if (actorId !== undefined) {
    row.actor_id = (actorId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actorId))
      ? actorId
      : null;
  }
  const actorName = l.actorName ?? actor.name ?? actor.userName;
  if (actorName !== undefined) row.actor_name = actorName;
  const actorUsername = l.actorUsername ?? actor.username;
  if (actorUsername !== undefined) row.actor_username = actorUsername;
  const actorRole = l.actorRole ?? actor.role;
  if (actorRole !== undefined) row.actor_role = actorRole;

  if (l.details !== undefined) row.details = l.details;
  if (l.ipAddress !== undefined) row.ip_address = l.ipAddress;
  if (l.createdAt !== undefined) row.created_at = l.createdAt;
  return row;
}

// --- NOTIFICATIONS ---
export function mapNotificationFromRow(row: any): ActivityNotification {
  return {
    id: row.id,
    type: row.type,
    userId: row.user_id,
    userName: row.user_name,
    username: row.username,
    role: row.role,
    sessionId: row.session_id,
    title: row.title,
    message: row.message,
    isRead: Boolean(row.is_read),
    readAt: row.read_at,
    isRejected: Boolean(row.is_rejected),
    createdAt: row.created_at,
  };
}

export function mapNotificationToRow(n: Partial<ActivityNotification>): Record<string, any> {
  const row: Record<string, any> = {};
  if (n.id !== undefined) row.id = n.id;
  if (n.type !== undefined) row.type = n.type;
  if (n.userId !== undefined) row.user_id = n.userId;
  if (n.userName !== undefined) row.user_name = n.userName;
  if (n.username !== undefined) row.username = n.username;
  if (n.role !== undefined) row.role = n.role;
  if (n.sessionId !== undefined) row.session_id = n.sessionId;
  if (n.title !== undefined) row.title = n.title;
  if (n.message !== undefined) row.message = n.message;
  if (n.isRead !== undefined) row.is_read = n.isRead;
  if (n.readAt !== undefined) row.read_at = n.readAt;
  if (n.isRejected !== undefined) row.is_rejected = n.isRejected;
  if (n.createdAt !== undefined) row.created_at = n.createdAt;
  return row;
}

// --- GATE PASSES ---
export function mapGatePassItemFromRow(row: any): GatePassItem {
  return {
    id: row.id,
    gatePassId: row.gate_pass_id,
    productId: row.product_id,
    itemName: row.item_name,
    sizeSpec: row.size_spec || null,
    quantityDispatched: Number(row.quantity_dispatched || 0),
    quantityReturned: Number(row.quantity_returned || 0),
    quantityDamaged: Number(row.quantity_damaged || 0),
    quantityMissing: Number(row.quantity_missing || 0),
  };
}

export function mapGatePassFromRow(row: any, items: GatePassItem[] = []): GatePass {
  return {
    id: row.id,
    gatePassNumber: row.gate_pass_number,
    companyId: row.company_id,
    companySnapshot: row.company_snapshot || null,
    customerId: row.customer_id,
    customerName: row.customer_name,
    destinationBranch: row.destination_branch,
    destinationAddress: row.destination_address,
    billId: row.bill_id,
    dispatchDate: row.dispatch_date,
    expectedReturnDate: row.expected_return_date,
    vehicleNumber: row.vehicle_number,
    driverName: row.driver_name,
    driverPhone: row.driver_phone,
    authorizedBy: row.authorized_by,
    notes: row.notes,
    status: row.status,
    items: items.length > 0 ? items : (Array.isArray(row.items) ? row.items : []),
    createdAt: row.created_at,
  };
}

export function mapGatePassToRow(gp: Partial<GatePass>): Record<string, any> {
  const row: Record<string, any> = {};
  if (gp.id !== undefined) row.id = gp.id;
  if (gp.gatePassNumber !== undefined) row.gate_pass_number = gp.gatePassNumber;
  if (gp.companyId !== undefined) row.company_id = gp.companyId;
  if (gp.companySnapshot !== undefined) row.company_snapshot = gp.companySnapshot;
  if (gp.customerId !== undefined) row.customer_id = gp.customerId;
  if (gp.customerName !== undefined) row.customer_name = gp.customerName;
  if (gp.destinationBranch !== undefined) row.destination_branch = gp.destinationBranch;
  if (gp.destinationAddress !== undefined) row.destination_address = gp.destinationAddress;
  if (gp.billId !== undefined) row.bill_id = gp.billId;
  if (gp.dispatchDate !== undefined) row.dispatch_date = gp.dispatchDate;
  if (gp.expectedReturnDate !== undefined) row.expected_return_date = gp.expectedReturnDate;
  if (gp.vehicleNumber !== undefined) row.vehicle_number = gp.vehicleNumber;
  if (gp.driverName !== undefined) row.driver_name = gp.driverName;
  if (gp.driverPhone !== undefined) row.driver_phone = gp.driverPhone;
  if (gp.authorizedBy !== undefined) row.authorized_by = gp.authorizedBy;
  if (gp.notes !== undefined) row.notes = gp.notes;
  if (gp.status !== undefined) row.status = gp.status;
  if (gp.createdAt !== undefined) row.created_at = gp.createdAt;
  return row;
}

// --- RETURNS ---
export function mapReturnRecordFromRow(row: any): ReturnRecord {
  return {
    id: row.id,
    returnNumber: row.return_number,
    gatePassId: row.gate_pass_id,
    companyId: row.company_id,
    customerId: row.customer_id,
    customerName: row.customer_name || "",
    returnDate: row.return_date,

    inspectedBy: row.inspected_by,
    damageCharges: Number(row.damage_charges || 0),
    lateFeeCharges: Number(row.late_fee_charges || 0),
    depositAdjustment: Number(row.deposit_adjustment || 0),
    notes: row.notes,
    items: Array.isArray(row.items) ? row.items : [],
    createdAt: row.created_at,
  };
}

export function mapReturnRecordToRow(ret: Partial<ReturnRecord>): Record<string, any> {
  const row: Record<string, any> = {};
  if (ret.id !== undefined) row.id = ret.id;
  if (ret.returnNumber !== undefined) row.return_number = ret.returnNumber;
  if (ret.gatePassId !== undefined) row.gate_pass_id = ret.gatePassId;
  if (ret.companyId !== undefined) row.company_id = ret.companyId;
  if (ret.customerId !== undefined) row.customer_id = ret.customerId;
  if (ret.returnDate !== undefined) row.return_date = ret.returnDate;
  if (ret.inspectedBy !== undefined) row.inspected_by = ret.inspectedBy;
  if (ret.damageCharges !== undefined) row.damage_charges = ret.damageCharges;
  if (ret.lateFeeCharges !== undefined) row.late_fee_charges = ret.lateFeeCharges;
  if (ret.depositAdjustment !== undefined) row.deposit_adjustment = ret.depositAdjustment;
  if (ret.notes !== undefined) row.notes = ret.notes;
  if (ret.createdAt !== undefined) row.created_at = ret.createdAt;
  return row;
}
