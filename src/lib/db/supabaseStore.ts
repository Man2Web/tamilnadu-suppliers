// ============================================================================
// TAMILNADU SUPPLIERS - SUPABASE DATA ACCESS SERVICE LAYER
// Supabase PostgreSQL is the SINGLE SOURCE OF TRUTH for all application data
// ============================================================================

import bcrypt from "bcryptjs";
import crypto from "crypto";
import { getSupabaseAdminClient } from "./supabaseClient";
import {
  mapCompanyFromRow,
  mapCompanyToRow,
  mapCategoryFromRow,
  mapCategoryToRow,
  mapProductFromRow,
  mapProductToRow,
  mapCustomerFromRow,
  mapCustomerToRow,
  mapQuotationFromRow,
  mapQuotationToRow,
  mapBillFromRow,
  mapBillToRow,
  mapPaymentFromRow,
  mapPaymentToRow,
  mapGatePassFromRow,
  mapGatePassToRow,
  mapGatePassItemFromRow,
  mapReturnRecordFromRow,
  mapReturnRecordToRow,
  mapUserFromRow,
  mapUserToRow,
  mapSessionFromRow,
  mapSessionToRow,
  mapAuditLogFromRow,
  mapAuditLogToRow,
  mapNotificationFromRow,
  mapNotificationToRow,
  mapQuotationItemFromRow,
  mapBillItemFromRow,
} from "./mappers";
import {
  Company,
  Category,
  Product,
  Customer,
  Quotation,
  QuotationBranch,
  Bill,
  BillBranch,
  Payment,
  GatePass,
  GatePassItem,
  ReturnRecord,
  User,
  UserSession,
  AuditLog,
  ActivityNotification,
  BillItem,
  QuotationItem,
  BillAmendment,
  DamageMissingIncident,
  IncidentChargeStatus,
} from "../types";
import {
  calculateDocumentFinancials,
  calculateRentalDays,
  calculateOverdueDetails,
  calculateFinalSettlement,
  numberToIndianWords,
  round2,
} from "../calculations/financial";
import {
  SUPER_ADMIN_PERMISSIONS,
  ADMIN_PRESET_PERMISSIONS,
  BILLING_PRESET_PERMISSIONS,
  checkUserPermission,
} from "../types/permissions";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function toValidUuid(val?: string | null): string {
  if (val && UUID_REGEX.test(String(val).trim())) {
    return String(val).trim();
  }
  return crypto.randomUUID();
}

export class SupabaseStore {

  private get supabase() {
    return getSupabaseAdminClient();
  }

  resolveActor(actorOrId?: any): { id: string; name: string; role: string; username?: string } {
    if (!actorOrId) return { id: "system", name: "System Administrator", role: "SUPER_ADMIN" };
    if (typeof actorOrId === "object") {
      return {
        id: actorOrId.id || actorOrId.userId || "system",
        name: actorOrId.name || actorOrId.username || "System",
        role: actorOrId.role || "SUPER_ADMIN",
        username: actorOrId.username,
      };
    }
    return { id: String(actorOrId), name: "User", role: "SUPER_ADMIN" };
  }

  validateRolePermission(role: string, requiredPermission: string): boolean {
    if (role === "SUPER_ADMIN") return true;
    if (role === "ADMIN") return ADMIN_PRESET_PERMISSIONS.includes(requiredPermission as any);
    if (role === "BILLING") return BILLING_PRESET_PERMISSIONS.includes(requiredPermission as any);
    return false;
  }


  // ==========================================================================
  // COMPANIES
  // ==========================================================================
  async getCompanies(): Promise<Company[]> {
    const { data, error } = await this.supabase
      .from("companies")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(`Supabase error fetching companies: ${error.message}`);
    return (data || []).map(mapCompanyFromRow);
  }

  async getCompany(id: string): Promise<Company | undefined> {
    const { data, error } = await this.supabase
      .from("companies")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Supabase error fetching company ${id}: ${error.message}`);
    return data ? mapCompanyFromRow(data) : undefined;
  }

  async createCompany(data: any, actorRole?: string): Promise<Company> {
    if (actorRole && actorRole !== "SUPER_ADMIN") {
      throw new Error("Forbidden: Only Super Administrator can create issuing companies.");
    }

    const id = data.id || crypto.randomUUID();
    const code = (data.name || "TNS")
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .split(" ")
      .filter(Boolean)
      .map((w: string) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 4) || "TNS";
    const randSuffix = Math.floor(100 + Math.random() * 900);

    const newCompany: Company = {
      ...data,
      id,
      invoicePrefix: data.invoicePrefix || `${code}${randSuffix}-`,
      quotationPrefix: data.quotationPrefix || `${code}${randSuffix}Q-`,
      gatePassPrefix: data.gatePassPrefix || `${code}${randSuffix}GP-`,
      nextInvoiceNo: Number(data.nextInvoiceNo || 1),
      nextQuotationNo: Number(data.nextQuotationNo || 1),
      nextGatePassNo: Number(data.nextGatePassNo || 1),
      isActive: data.isActive !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const row = mapCompanyToRow(newCompany);
    const { data: inserted, error } = await this.supabase
      .from("companies")
      .insert(row)
      .select()
      .single();

    if (error) throw new Error(`Supabase error creating company: ${error.message}`);
    return mapCompanyFromRow(inserted);
  }

  async updateCompany(id: string, updates: Partial<Company>, actorRole?: string): Promise<Company> {
    if (actorRole && actorRole !== "SUPER_ADMIN") {
      throw new Error("Forbidden: Only Super Administrator can update issuing companies.");
    }

    const row = mapCompanyToRow({ ...updates, updatedAt: new Date().toISOString() });
    delete row.id;

    const { data: updated, error } = await this.supabase
      .from("companies")
      .update(row)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`Supabase error updating company ${id}: ${error.message}`);
    return mapCompanyFromRow(updated);
  }

  async deleteCompany(id: string, actorRole?: string): Promise<{ success: boolean; message: string }> {
    if (actorRole && actorRole !== "SUPER_ADMIN") {
      throw new Error("Forbidden: Only Super Administrator can delete issuing companies.");
    }

    const { error } = await this.supabase.from("companies").delete().eq("id", id);
    if (error) throw new Error(`Supabase error deleting company: ${error.message}`);
    return { success: true, message: "Company deleted successfully." };
  }

  async activateCompany(id: string, actorRole?: string): Promise<Company> {
    return this.updateCompany(id, { isActive: true }, actorRole);
  }

  async deactivateCompany(id: string, actorRole?: string): Promise<Company> {
    return this.updateCompany(id, { isActive: false }, actorRole);
  }

  async getNextDocumentNumber(companyId: string, docType: "INVOICE" | "QUOTATION" | "GATE_PASS"): Promise<string> {
    const comp = await this.getCompany(companyId);
    if (!comp) throw new Error("Issuing company not found");

    let num = 1;
    let prefix = "TNS-";

    if (docType === "INVOICE") {
      num = comp.nextInvoiceNo || 1;
      prefix = comp.invoicePrefix || "TNS-";
      let candidate = `${prefix}${String(num).padStart(4, "0")}`;
      while (true) {
        candidate = `${prefix}${String(num).padStart(4, "0")}`;
        const { data } = await this.supabase
          .from("bills")
          .select("id")
          .eq("invoice_number", candidate)
          .maybeSingle();
        if (!data) break;
        num++;
      }
      await this.updateCompany(companyId, { nextInvoiceNo: num + 1 });
      return candidate;
    } else if (docType === "QUOTATION") {
      num = comp.nextQuotationNo || 1;
      prefix = comp.quotationPrefix || "TNQ-";
      let candidate = `${prefix}${String(num).padStart(4, "0")}`;
      while (true) {
        candidate = `${prefix}${String(num).padStart(4, "0")}`;
        const { data } = await this.supabase
          .from("quotations")
          .select("id")
          .eq("quotation_number", candidate)
          .maybeSingle();
        if (!data) break;
        num++;
      }
      await this.updateCompany(companyId, { nextQuotationNo: num + 1 });
      return candidate;
    } else {
      num = comp.nextGatePassNo || 1;
      prefix = comp.gatePassPrefix || "TNGP-";
      let candidate = `${prefix}${String(num).padStart(4, "0")}`;
      while (true) {
        candidate = `${prefix}${String(num).padStart(4, "0")}`;
        const { data } = await this.supabase
          .from("gate_passes")
          .select("id")
          .eq("gate_pass_number", candidate)
          .maybeSingle();
        if (!data) break;
        num++;
      }
      await this.updateCompany(companyId, { nextGatePassNo: num + 1 });
      return candidate;
    }
  }

  // ==========================================================================
  // CATEGORIES
  // ==========================================================================
  async getCategories(): Promise<Category[]> {
    const { data, error } = await this.supabase
      .from("categories")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw new Error(`Supabase error fetching categories: ${error.message}`);
    return (data || []).map(mapCategoryFromRow);
  }

  async getCategory(id: string): Promise<Category | undefined> {
    const { data, error } = await this.supabase
      .from("categories")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Supabase error fetching category ${id}: ${error.message}`);
    return data ? mapCategoryFromRow(data) : undefined;
  }

  async createCategory(data: Partial<Category>): Promise<Category> {
    const id = data.id || crypto.randomUUID();
    const newCat: Category = {
      id,
      name: data.name!,
      code: data.code || data.name!.slice(0, 4).toUpperCase(),
      description: data.description || "",
      parentId: data.parentId || null,
      isActive: data.isActive !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const row = mapCategoryToRow(newCat);
    const { data: inserted, error } = await this.supabase
      .from("categories")
      .insert(row)
      .select()
      .single();

    if (error) throw new Error(`Supabase error creating category: ${error.message}`);
    return mapCategoryFromRow(inserted);
  }

  // ==========================================================================
  // PRODUCTS & SHARED INVENTORY
  // ==========================================================================
  async getProducts(): Promise<Product[]> {
    const { data, error } = await this.supabase
      .from("products")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw new Error(`Supabase error fetching products: ${error.message}`);
    return (data || []).map(mapProductFromRow);
  }

  async getProduct(id: string): Promise<Product | undefined> {
    // Look up by ID or SKU (supports both legacy p1 and new UUIDs)
    const { data, error } = await this.supabase
      .from("products")
      .select("*")
      .or(`id.eq.${id},sku.eq.${id}`)
      .maybeSingle();

    if (error) throw new Error(`Supabase error fetching product ${id}: ${error.message}`);
    return data ? mapProductFromRow(data) : undefined;
  }

  async createProduct(data: any): Promise<Product> {
    const id = data.id || crypto.randomUUID();
    const totalOwned = Number(data.totalOwnedQuantity || 0);
    const available = data.availableQuantity !== undefined ? Number(data.availableQuantity) : totalOwned;

    const newProduct: Product = {
      ...data,
      id,
      sku: data.sku || id,
      totalOwnedQuantity: totalOwned,
      availableQuantity: available,
      reservedQuantity: Number(data.reservedQuantity || 0),
      rentedQuantity: Number(data.rentedQuantity || 0),
      damagedQuantity: Number(data.damagedQuantity || 0),
      missingQuantity: Number(data.missingQuantity || 0),
      maintenanceQuantity: Number(data.maintenanceQuantity || 0),
      defaultRentalRate: Number(data.defaultRentalRate || 0),
      securityDepositAmount: Number(data.securityDepositAmount || 0),
      replacementValue: Number(data.replacementValue || 0),
      isActive: data.isActive !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const row = mapProductToRow(newProduct);
    const { data: inserted, error } = await this.supabase
      .from("products")
      .insert(row)
      .select()
      .single();

    if (error) throw new Error(`Supabase error creating product: ${error.message}`);
    return mapProductFromRow(inserted);
  }

  async updateProduct(id: string, updates: Partial<Product>): Promise<Product> {
    const existing = await this.getProduct(id);
    if (!existing) throw new Error(`Product ${id} not found`);

    const row = mapProductToRow({
      ...updates,
      updatedAt: new Date().toISOString(),
    });
    delete row.id;

    const { data: updated, error } = await this.supabase
      .from("products")
      .update(row)
      .eq("id", existing.id)
      .select()
      .single();

    if (error) throw new Error(`Supabase error updating product ${id}: ${error.message}`);
    return mapProductFromRow(updated);
  }

  async deleteProduct(id: string): Promise<boolean> {
    const existing = await this.getProduct(id);
    if (!existing) return false;

    const { error } = await this.supabase.from("products").delete().eq("id", existing.id);
    if (error) throw new Error(`Supabase error deleting product ${id}: ${error.message}`);
    return true;
  }

  // ==========================================================================
  // CUSTOMERS
  // ==========================================================================
  async getCustomers(): Promise<Customer[]> {
    const { data, error } = await this.supabase
      .from("customers")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw new Error(`Supabase error fetching customers: ${error.message}`);
    return (data || []).map(mapCustomerFromRow);
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    const { data, error } = await this.supabase
      .from("customers")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Supabase error fetching customer ${id}: ${error.message}`);
    return data ? mapCustomerFromRow(data) : undefined;
  }

  async createCustomer(data: any): Promise<Customer> {
    const id = data.id || crypto.randomUUID();
    const newCustomer: Customer = {
      ...data,
      id,
      mobile: data.mobile || data.phone || "",
      billingAddress: data.billingAddress || data.address || "",
      state: data.state || "Tamil Nadu",
      isActive: data.isActive !== false,
      branches: Array.isArray(data.branches) ? data.branches : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const row = mapCustomerToRow(newCustomer);
    const { data: inserted, error } = await this.supabase
      .from("customers")
      .insert(row)
      .select()
      .single();

    if (error) throw new Error(`Supabase error creating customer: ${error.message}`);
    return mapCustomerFromRow(inserted);
  }

  async updateCustomer(id: string, updates: Partial<Customer>): Promise<Customer> {
    const row = mapCustomerToRow({
      ...updates,
      updatedAt: new Date().toISOString(),
    });
    delete row.id;

    const { data: updated, error } = await this.supabase
      .from("customers")
      .update(row)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`Supabase error updating customer ${id}: ${error.message}`);
    return mapCustomerFromRow(updated);
  }

  async deleteCustomer(id: string): Promise<boolean> {
    const { error } = await this.supabase.from("customers").delete().eq("id", id);
    if (error) throw new Error(`Supabase error deleting customer ${id}: ${error.message}`);
    return true;
  }

  /**
   * Ensures a valid UUID customerId is always resolved and referenced in the database.
   * If an existing customer matches the phone or name, their UUID is reused.
   * If the customer does not exist, a customer master record is automatically created in Supabase.
   */
  async ensureCustomerId(data: {
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    customerAddress?: string;
    customerGstin?: string | null;
    companyId?: string;
  }): Promise<string> {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (data.customerId && UUID_REGEX.test(data.customerId)) {
      return data.customerId;
    }

    const phone = (data.customerPhone || "").trim();
    const name = (data.customerName || "").trim();

    // 1. Try finding existing customer by phone
    if (phone) {
      const { data: existingByPhone } = await this.supabase
        .from("customers")
        .select("id")
        .eq("mobile", phone)
        .limit(1)
        .maybeSingle();
      if (existingByPhone?.id) return existingByPhone.id;
    }

    // 2. Try finding existing customer by name
    if (name) {
      const { data: existingByName } = await this.supabase
        .from("customers")
        .select("id")
        .ilike("name", name)
        .limit(1)
        .maybeSingle();
      if (existingByName?.id) return existingByName.id;
    }

    // 3. Auto-create new customer in customers table
    const newCustId = crypto.randomUUID();
    const newCustRow = mapCustomerToRow({
      id: newCustId,
      name: name || "Direct Customer",
      mobile: phone || "0000000000",
      billingAddress: data.customerAddress || "Tamil Nadu",
      gstin: data.customerGstin || null,
      state: "Tamil Nadu",
      isActive: true,
      branches: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const { data: inserted, error } = await this.supabase
      .from("customers")
      .insert(newCustRow)
      .select("id")
      .single();

    if (error) {
      console.warn("Auto-create customer returned notice:", error.message);
      return newCustId;
    }

    return inserted?.id || newCustId;
  }

  // ==========================================================================
  // QUOTATIONS
  // ==========================================================================
  async getQuotations(): Promise<Quotation[]> {
    const { data, error } = await this.supabase
      .from("quotations")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Supabase error fetching quotations: ${error.message}`);
    return (data || []).map((row) => mapQuotationFromRow(row));
  }

  async getQuotation(id: string): Promise<Quotation | undefined> {
    const { data, error } = await this.supabase
      .from("quotations")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Supabase error fetching quotation ${id}: ${error.message}`);
    if (!data) return undefined;

    // Fetch quotation items
    const { data: items } = await this.supabase
      .from("quotation_items")
      .select("*")
      .eq("quotation_id", id)
      .order("position", { ascending: true });

    // Fetch quotation branches
    const { data: branches } = await this.supabase
      .from("quotation_branches")
      .select("*")
      .eq("quotation_id", id)
      .order("section_order", { ascending: true });

    const mappedItems = (items || []).map(mapQuotationItemFromRow);
    const quote = mapQuotationFromRow(data, mappedItems);

    if (branches && branches.length > 0) {
      quote.branches = branches.map((b) => ({
        id: b.id,
        quotationId: b.quotation_id,
        branchName: b.branch_name,
        deliveryAddress: b.delivery_address,
        sectionOrder: b.section_order,
        branchSubtotal: Number(b.branch_subtotal || 0),
        items: mappedItems.filter((it) => !it.quotationBranchId || it.quotationBranchId === b.id),
      }));
    }

    return quote;
  }

  async createQuotation(data: any): Promise<Quotation> {
    const company = await this.getCompany(data.companyId);
    if (!company) throw new Error("Issuing company required");

    const quotationNumber = await this.getNextDocumentNumber(data.companyId, "QUOTATION");
    const quoteId = toValidUuid(data.id);

    const calculatedDays =
      data.rentalStartDate && data.rentalEndDate
        ? calculateRentalDays(data.rentalStartDate, data.rentalEndDate)
        : 1;
    const rentalDuration = data.rentalDays !== undefined ? Number(data.rentalDays) : calculatedDays;

    const branchItems = data.branches && Array.isArray(data.branches)
      ? data.branches.flatMap((b: any) => b.items || [])
      : [];
    const inputLines = (data.documentLines && data.documentLines.length > 0)
      ? data.documentLines
      : (data.items && data.items.length > 0)
      ? data.items
      : branchItems;

    const flatItems: QuotationItem[] = [];

    inputLines.forEach((it: any, itIdx: number) => {
      const isNote = it.entryType === "note" || (!it.productId && (it.text || it.itemName));
      const pos = it.position !== undefined ? Number(it.position) : itIdx + 1;

      if (isNote) {
        flatItems.push({
          id: toValidUuid(it.id),
          quotationId: quoteId,
          entryType: "note",
          position: pos,
          itemOrder: pos,
          text: it.text || it.itemName || "",
          productId: "",
          itemName: it.text || it.itemName || "Note",
          sizeSpec: "",
          quantity: 0,
          days: 0,
          unitPrice: 0,
          amount: 0,
          notes: null,
        });
      } else {
        const qty = Number(it.quantity) || 1;
        const days = it.days !== undefined ? Number(it.days) : (it.rentalDurationDays !== undefined ? Number(it.rentalDurationDays) : rentalDuration);
        const unitPrice = Number(it.unitPrice ?? it.rentalRate ?? 0);
        const amount = it.amount !== undefined ? Number(it.amount) : (it.lineTotal !== undefined ? Number(it.lineTotal) : Math.round(qty * days * unitPrice * 100) / 100);

        flatItems.push({
          id: toValidUuid(it.id),
          quotationId: quoteId,
          entryType: "product",
          position: pos,
          itemOrder: pos,
          text: null,
          productId: it.productId,
          itemName: it.itemName,
          sizeSpec: it.sizeSpec || "",
          quantity: qty,
          days,
          unitPrice,
          amount,
          notes: it.notes || null,
        });
      }
    });

    const subtotal = flatItems.reduce((acc, it) => acc + (it.amount || 0), 0);
    const transport = Number(data.transportCharges || 0);
    const loading = Number(data.loadingCharges || 0);
    const labor = Number(data.laborCharges || 0);
    const other = Number(data.otherCharges || 0);
    const discount = Number(data.discountAmount || 0);

    const isInterState = Boolean(
      company.placeOfSupply &&
      data.placeOfSupply &&
      company.placeOfSupply.toLowerCase() !== data.placeOfSupply.toLowerCase()
    );

    const financials = calculateDocumentFinancials({
      taxType: company.gstType,
      itemsSubtotal: subtotal,
      transportCharges: transport,
      loadingCharges: loading,
      laborCharges: labor,
      otherCharges: other,
      discountAmount: discount,
      isInterState,
    });

    const notesList = Array.isArray(data.notesList)
      ? data.notesList
      : data.notes
      ? data.notes.split("\n").map((n: string) => n.trim()).filter(Boolean)
      : [];

    const rentalStartDate = data.rentalStartDate || new Date().toISOString().split("T")[0];
    const rentalEndDate = data.rentalEndDate || new Date(Date.now() + 86400000 * rentalDuration).toISOString().split("T")[0];

    const customerId = await this.ensureCustomerId({
      customerId: data.customerId,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerAddress: data.customerAddress,
      customerGstin: data.customerGstin,
      companyId: data.companyId,
    });

    const newQuote: Quotation = {
      id: quoteId,
      quotationNumber,
      revisionNumber: 1,
      companyId: data.companyId,
      companySnapshot: company,
      customerId,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerAddress: data.customerAddress || "",
      customerGstin: data.customerGstin || null,
      quotationDate: data.quotationDate || new Date().toISOString().split("T")[0],
      supplyDate: data.supplyDate || rentalStartDate,
      placeOfSupply: data.placeOfSupply || company.placeOfSupply,
      rentalStartDate,
      rentalEndDate,
      rentalDays: rentalDuration,
      status: (data.status as any) || "ISSUED",
      taxType: company.gstType,
      subtotal: financials.subtotal,

      transportCharges: transport,
      loadingCharges: loading,
      laborCharges: labor,
      otherCharges: other,
      discountAmount: discount,
      taxableAmount: financials.taxableAmount,
      cgstRate: financials.cgstRate,
      cgstAmount: financials.cgstAmount,
      sgstRate: financials.sgstRate,
      sgstAmount: financials.sgstAmount,
      igstRate: financials.igstRate,
      igstAmount: financials.igstAmount,
      totalTax: financials.totalTax,
      grandTotal: financials.grandTotal,
      advanceRequired: Number(data.advanceRequired || 0),
      securityDepositRequired: Number(data.securityDepositRequired || 0),
      amountInWords: numberToIndianWords(financials.grandTotal),
      notes: data.notes || null,
      notesList,
      termsAndConditions: data.termsAndConditions || company.termsAndConditions,
      documentLines: flatItems.map((it) => ({
        id: it.id,
        entryType: it.entryType || "product",
        position: it.position || it.itemOrder,
        text: it.text || (it.entryType === "note" ? it.itemName : undefined),
        productId: it.productId,
        itemName: it.itemName,
        sizeSpec: it.sizeSpec,
        quantity: it.quantity,
        days: it.days,
        unitPrice: it.unitPrice,
        amount: it.amount,
        notes: it.notes,
      })),
      items: flatItems,
      createdBy: data.actor?.name || "System",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const row = mapQuotationToRow(newQuote);
    const { data: inserted, error } = await this.supabase
      .from("quotations")
      .insert(row)
      .select()
      .single();

    if (error) throw new Error(`Supabase error creating quotation: ${error.message}`);

    // Insert quotation branches and quotation items
    const branchesToInsert = (data.branches && Array.isArray(data.branches) && data.branches.length > 0)
      ? data.branches
      : [
          {
            branchName: "Main Branch",
            branchAddress: data.customerAddress || "Tamil Nadu",
            items: flatItems,
          },
        ];

    const createdBranches: QuotationBranch[] = [];

    for (let bIdx = 0; bIdx < branchesToInsert.length; bIdx++) {
      const b = branchesToInsert[bIdx];
      const branchId = toValidUuid(b.id);
      const bItems = b.items && b.items.length > 0 ? b.items : flatItems;
      const bSubtotal = bItems.reduce((acc: number, it: any) => acc + (Number(it.amount || it.lineTotal) || 0), 0);

      await this.supabase.from("quotation_branches").insert({
        id: branchId,
        quotation_id: quoteId,
        branch_name: b.branchName || "Main Branch",
        delivery_address: b.branchAddress || data.customerAddress || "Tamil Nadu",
        section_order: bIdx + 1,
        branch_subtotal: bSubtotal || financials.subtotal,
        created_at: new Date().toISOString(),
      });

      const branchQuotationItems: QuotationItem[] = [];

      const itemRows = bItems.map((it: any, itIdx: number) => {
        const qty = Number(it.quantity) || 1;
        const days = it.days !== undefined ? Number(it.days) : (it.rentalDurationDays !== undefined ? Number(it.rentalDurationDays) : rentalDuration);
        const unitPrice = Number(it.unitPrice ?? it.rentalRate ?? 0);
        const amount = it.amount !== undefined ? Number(it.amount) : (it.lineTotal !== undefined ? Number(it.lineTotal) : Math.round(qty * days * unitPrice * 100) / 100);
        const qItem: QuotationItem = {
          id: toValidUuid(it.id),
          quotationId: quoteId,
          quotationBranchId: branchId,
          entryType: it.entryType || "product",
          position: it.position !== undefined ? Number(it.position) : itIdx + 1,
          text: it.text || null,
          productId: it.productId || null,
          itemName: it.itemName,
          sizeSpec: it.sizeSpec || null,
          quantity: qty,
          days,
          unitPrice,
          amount,
          itemOrder: it.itemOrder !== undefined ? Number(it.itemOrder) : itIdx + 1,
          notes: it.notes || null,
        };
        branchQuotationItems.push(qItem);

        return {
          id: qItem.id,
          quotation_id: quoteId,
          quotation_branch_id: branchId,
          entry_type: qItem.entryType,
          position: qItem.position,
          text: qItem.text,
          product_id: qItem.productId,
          item_name: qItem.itemName,
          size_spec: qItem.sizeSpec,
          quantity: qItem.quantity,
          days: qItem.days,
          unit_price: qItem.unitPrice,
          amount: qItem.amount,
          item_order: qItem.itemOrder,
          notes: qItem.notes,
          created_at: new Date().toISOString(),
        };
      });

      if (itemRows.length > 0) {
        const { error: itemErr } = await this.supabase.from("quotation_items").insert(itemRows);
        if (itemErr) throw new Error(`Supabase error inserting quotation items: ${itemErr.message}`);
      }

      createdBranches.push({
        id: branchId,
        quotationId: quoteId,
        branchName: b.branchName || "Main Branch",
        deliveryAddress: b.branchAddress || data.customerAddress || "Tamil Nadu",
        sectionOrder: bIdx + 1,
        branchSubtotal: bSubtotal || financials.subtotal,
        items: branchQuotationItems,
      });
    }

    const result = mapQuotationFromRow(inserted, flatItems);
    result.branches = createdBranches;

    try {
      const resolvedActor = this.resolveActor(data.actor);
      await this.recordAuditLog({
        entityType: "QUOTATION",
        entityId: result.id,
        entityNumber: result.quotationNumber,
        customerName: result.customerName,
        action: "QUOTATION_CREATED",
        actionLabel: "Quotation Created",
        actor: resolvedActor,
        details: {
          summary: `Quotation #${result.quotationNumber} created for ${result.customerName} by ${resolvedActor.name} (${resolvedActor.role})`,
          grandTotal: result.grandTotal,
          rentalDays: result.rentalDays,
          itemsCount: flatItems.length,
        },
      });
    } catch (auditErr) {
      console.error("[createQuotation] Failed to record audit log:", auditErr);
    }

    return result;
  }

  async updateQuotation(id: string, updates: Partial<Quotation>, actor?: any): Promise<Quotation> {
    const existing = await this.getQuotation(id);
    if (!existing) throw new Error(`Quotation ${id} not found`);

    if (existing.status === "CONVERTED" || existing.convertedBillId) {
      throw new Error("Quotation is converted to a bill and locked against further edits.");
    }

    const lines = updates.documentLines || updates.items;
    if (Array.isArray(lines)) {
      await this.supabase.from("quotation_items").delete().eq("quotation_id", id);
      const branchId = existing.branches?.[0]?.id || toValidUuid(crypto.randomUUID());
      const itemRows = lines.map((it: any, idx: number) => ({
        id: toValidUuid(it.id),
        quotation_id: id,
        quotation_branch_id: branchId,
        entry_type: it.entryType || "product",
        position: it.position !== undefined ? Number(it.position) : idx + 1,
        text: it.text || null,
        product_id: it.productId || null,
        item_name: it.itemName || (it.entryType === "note" ? it.text : "Item"),
        size_spec: it.sizeSpec || null,
        quantity: it.entryType === "note" ? 0 : Number(it.quantity) || 1,
        days: it.entryType === "note" ? 0 : Number(it.days) || 1,
        unit_price: it.entryType === "note" ? 0 : Number(it.unitPrice) || 0,
        amount: it.entryType === "note" ? 0 : Number(it.amount) || 0,
        item_order: it.position !== undefined ? Number(it.position) : idx + 1,
        notes: it.notes || null,
        created_at: new Date().toISOString(),
      }));
      if (itemRows.length > 0) {
        await this.supabase.from("quotation_items").insert(itemRows);
      }
    }

    const row = mapQuotationToRow({ ...updates, updatedAt: new Date().toISOString() });
    delete row.id;

    const { data: updated, error } = await this.supabase
      .from("quotations")
      .update(row)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`Supabase error updating quotation ${id}: ${error.message}`);

    if (updates.status !== "CONVERTED") {
      try {
        const resolvedActor = this.resolveActor(actor);
        const changesSummary: string[] = [];
        if (updates.grandTotal !== undefined && Number(updates.grandTotal) !== Number(existing.grandTotal)) {
          changesSummary.push(`Grand total changed from ₹${existing.grandTotal} to ₹${updates.grandTotal}`);
        }
        if (updates.rentalDays !== undefined && Number(updates.rentalDays) !== Number(existing.rentalDays)) {
          changesSummary.push(`Rental days: ${existing.rentalDays}d → ${updates.rentalDays}d`);
        }
        if (updates.advanceRequired !== undefined && Number(updates.advanceRequired) !== Number(existing.advanceRequired)) {
          changesSummary.push(`Advance required: ₹${existing.advanceRequired} → ₹${updates.advanceRequired}`);
        }
        if (updates.customerName && updates.customerName !== existing.customerName) {
          changesSummary.push(`Customer changed to "${updates.customerName}"`);
        }
        if (updates.notes !== undefined && updates.notes !== existing.notes) {
          changesSummary.push("Notes updated");
        }
        if (Array.isArray(lines)) {
          changesSummary.push(`${lines.length} items/lines updated`);
        }

        const summaryText = changesSummary.length > 0
          ? `Quotation #${existing.quotationNumber} updated by ${resolvedActor.name}: ${changesSummary.join("; ")}`
          : `Quotation #${existing.quotationNumber} changes saved by ${resolvedActor.name} (${resolvedActor.role})`;

        // Check if the last log was within 10 seconds to coalesce rapid auto-save ticks
        const { data: recentLogs } = await this.supabase
          .from("audit_logs")
          .select("id, created_at, action, actor_name")
          .eq("entity_id", id)
          .eq("action", "QUOTATION_UPDATED")
          .order("created_at", { ascending: false })
          .limit(1);

        const lastLog = recentLogs?.[0];
        const isRecent = lastLog && (Date.now() - new Date(lastLog.created_at).getTime() < 10000);

        const details = {
          summary: summaryText,
          changes: changesSummary,
          previousGrandTotal: existing.grandTotal,
          newGrandTotal: updates.grandTotal ?? existing.grandTotal,
          itemsCount: lines ? lines.length : existing.items?.length,
        };

        if (isRecent) {
          await this.supabase
            .from("audit_logs")
            .update({
              details,
              action_label: "Quotation Changes Saved",
              created_at: new Date().toISOString(),
            })
            .eq("id", lastLog.id);
        } else {
          await this.recordAuditLog({
            entityType: "QUOTATION",
            entityId: id,
            entityNumber: existing.quotationNumber,
            customerName: updates.customerName || existing.customerName,
            action: "QUOTATION_UPDATED",
            actionLabel: "Quotation Changes Saved",
            actor: resolvedActor,
            details,
          });
        }
      } catch (auditErr) {
        console.error("[updateQuotation] Failed to record quotation update audit log:", auditErr);
      }
    }

    return mapQuotationFromRow(updated);
  }

  async updateQuotationStatus(id: string, status: any, actor?: any): Promise<Quotation> {
    return this.updateQuotation(id, { status }, actor);
  }

  async reviseQuotation(id: string, data: any, actor?: any): Promise<Quotation> {
    return this.updateQuotation(id, data, actor);
  }

  // ==========================================================================
  // BILLS & INVOICES
  // ==========================================================================
  async getBills(): Promise<Bill[]> {
    const { data, error } = await this.supabase
      .from("bills")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Supabase error fetching bills: ${error.message}`);
    return (data || []).map((row) => mapBillFromRow(row));
  }

  async getBill(id: string): Promise<Bill | undefined> {
    const { data, error } = await this.supabase
      .from("bills")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Supabase error fetching bill ${id}: ${error.message}`);
    if (!data) return undefined;

    // Fetch bill items, branches, payments, and gate passes in PARALLEL to reduce cloud latency
    const [
      { data: items },
      { data: branches },
      { data: payments },
      { data: gatePasses },
    ] = await Promise.all([
      this.supabase.from("bill_items").select("*").eq("bill_id", id).order("position", { ascending: true }),
      this.supabase.from("bill_branches").select("*").eq("bill_id", id).order("section_order", { ascending: true }),
      this.supabase.from("payments").select("*").eq("bill_id", id).eq("is_reversed", false),
      this.supabase.from("gate_passes").select("id").eq("bill_id", id),
    ]);

    let totalReturnedGood = 0;
    let totalDamaged = 0;
    let totalMissing = 0;
    let approvedDamageCharges = 0;
    let approvedMissingCharges = 0;

    const gpIds = (gatePasses || []).map((gp) => gp.id);
    if (gpIds.length > 0) {
      const { data: returnsData } = await this.supabase
        .from("returns")
        .select("*")
        .in("gate_pass_id", gpIds);

      for (const ret of returnsData || []) {
        approvedDamageCharges += Number(ret.damage_charges || 0);

        if (ret.notes) {
          try {
            const parsed = JSON.parse(ret.notes);
            if (parsed.approvedMissingCharges) approvedMissingCharges += Number(parsed.approvedMissingCharges);
            if (parsed.missingCharges) approvedMissingCharges += Number(parsed.missingCharges);
            if (parsed.totalReturnedGood) totalReturnedGood += Number(parsed.totalReturnedGood);
            if (parsed.totalDamaged) totalDamaged += Number(parsed.totalDamaged);
            if (parsed.totalMissing) totalMissing += Number(parsed.totalMissing);
          } catch {
            // Not JSON
          }
        }

        const { data: retItems } = await this.supabase
          .from("return_items")
          .select("*")
          .eq("return_id", ret.id);

        for (const ri of retItems || []) {
          totalReturnedGood += Number(ri.quantity_returned_good || 0);
          totalDamaged += Number(ri.quantity_damaged || 0);
          totalMissing += Number(ri.quantity_missing || 0);
        }
      }
    }

    const mappedItems = (items || []).map(mapBillItemFromRow);
    const bill = mapBillFromRow(data, mappedItems);
    bill.payments = (payments || []).map(mapPaymentFromRow);

    if (totalReturnedGood > 0) bill.totalReturnedGood = totalReturnedGood;
    if (totalDamaged > 0) bill.totalDamaged = totalDamaged;
    if (totalMissing > 0) bill.totalMissing = totalMissing;
    if (approvedDamageCharges > 0) bill.approvedDamageCharges = approvedDamageCharges;
    if (approvedMissingCharges > 0) bill.approvedMissingCharges = approvedMissingCharges;

    // Document lines aggregation for returns & incidents
    if (bill.documentLines && Array.isArray(bill.documentLines) && bill.documentLines.length > 0) {
      let docGood = 0;
      let docDamaged = 0;
      let docMissing = 0;
      let docApprovedDamages = 0;
      let docApprovedMissing = 0;
      const docIncidents: DamageMissingIncident[] = [];

      for (const line of bill.documentLines) {
        if (line.entryType === "note") continue;
        const lineDispatched = Math.max(0, Number(line.quantity || 0));
        const lineDamaged = Math.max(0, Number(line.quantityDamaged || 0));
        const lineMissing = Math.max(0, Number(line.quantityMissing || 0));
        const lineGood = Math.max(0, lineDispatched - lineDamaged - lineMissing);

        docGood += lineGood;
        docDamaged += lineDamaged;
        docMissing += lineMissing;

        if (lineDamaged > 0) {
          const status = line.damageChargeDecision || "PENDING_DECISION";
          const amt = status === "ADD_CHARGE" ? Number(line.damageChargeAmount || 0) : 0;
          docApprovedDamages += amt;
          docIncidents.push({
            id: `inc-dam-${line.id || line.productId}`,
            billId: id,
            productId: line.productId,
            productName: line.itemName || "Rental Product",
            quantityAffected: lineDamaged,
            type: "DAMAGED",
            description: line.damageNotes || line.notes || "Damaged during rental",
            inspectionDate: bill.actualReturnDate || bill.updatedAt?.split("T")[0] || new Date().toISOString().split("T")[0],
            proposedCharge: Number(line.damageChargeAmount || 0),
            finalApprovedCharge: amt,
            chargeApprovalStatus: status,
          });
        }

        if (lineMissing > 0) {
          const status = line.missingChargeDecision || "PENDING_DECISION";
          const amt = status === "ADD_CHARGE" ? Number(line.missingChargeAmount || 0) : 0;
          docApprovedMissing += amt;
          docIncidents.push({
            id: `inc-mis-${line.id || line.productId}`,
            billId: id,
            productId: line.productId,
            productName: line.itemName || "Rental Product",
            quantityAffected: lineMissing,
            type: "MISSING",
            description: line.missingNotes || line.notes || "Missing during rental",
            inspectionDate: bill.actualReturnDate || bill.updatedAt?.split("T")[0] || new Date().toISOString().split("T")[0],
            proposedCharge: Number(line.missingChargeAmount || 0),
            finalApprovedCharge: amt,
            chargeApprovalStatus: status,
          });
        }
      }

      if (totalReturnedGood === 0 && docGood > 0) bill.totalReturnedGood = docGood;
      if (totalDamaged === 0 && docDamaged > 0) bill.totalDamaged = docDamaged;
      if (totalMissing === 0 && docMissing > 0) bill.totalMissing = docMissing;
      if (approvedDamageCharges === 0 && docApprovedDamages > 0) bill.approvedDamageCharges = docApprovedDamages;
      if (approvedMissingCharges === 0 && docApprovedMissing > 0) bill.approvedMissingCharges = docApprovedMissing;
      if (!bill.incidents || bill.incidents.length === 0) bill.incidents = docIncidents;

      // Ensure bill.items (mappedItems) reflects saved return quantities from documentLines
      const docLineMap = new Map<string, any>();
      for (const dl of bill.documentLines) {
        if (dl.id) docLineMap.set(dl.id, dl);
        if (dl.productId) docLineMap.set(`prod-${dl.productId}`, dl);
      }
      for (const it of mappedItems) {
        const matchingDoc = docLineMap.get(it.id) || (it.productId ? docLineMap.get(`prod-${it.productId}`) : undefined);
        if (matchingDoc) {
          if (matchingDoc.quantityReturnedGood !== undefined) it.quantityReturnedGood = matchingDoc.quantityReturnedGood;
          if (matchingDoc.returnedGoodQuantity !== undefined) it.returnedGoodQuantity = matchingDoc.returnedGoodQuantity;
          if (matchingDoc.quantityDamaged !== undefined) it.quantityDamaged = matchingDoc.quantityDamaged;
          if (matchingDoc.quantityMissing !== undefined) it.quantityMissing = matchingDoc.quantityMissing;
          if (matchingDoc.damageChargeDecision !== undefined) it.damageChargeDecision = matchingDoc.damageChargeDecision;
          if (matchingDoc.damageChargeAmount !== undefined) it.damageChargeAmount = matchingDoc.damageChargeAmount;
          if (matchingDoc.missingChargeDecision !== undefined) it.missingChargeDecision = matchingDoc.missingChargeDecision;
          if (matchingDoc.missingChargeAmount !== undefined) it.missingChargeAmount = matchingDoc.missingChargeAmount;
          if (matchingDoc.quantityPhysicallyReturned !== undefined) it.quantityPhysicallyReturned = matchingDoc.quantityPhysicallyReturned;
        }
      }
    }

    if (bill.status !== "CLOSED") {
      const totalDispatched = bill.totalDispatched || (bill.documentLines || []).reduce((acc, l) => acc + (l.entryType === "note" ? 0 : Number(l.quantity || 0)), 0);
      const accounted = (bill.totalReturnedGood || 0) + (bill.totalDamaged || 0) + (bill.totalMissing || 0);
      const hasPending = (bill.incidents || []).some((i) => i.chargeApprovalStatus === "PENDING_DECISION");

      if (totalDispatched > 0 && accounted >= totalDispatched) {
        bill.status = hasPending ? "RETURN_INSPECTION" : "PENDING_SETTLEMENT";
      } else if (accounted > 0) {
        bill.status = "PARTIALLY_RETURNED";
      }
    }

    if (branches && branches.length > 0) {
      bill.branches = branches.map((b) => ({
        id: b.id,
        billId: b.bill_id,
        branchName: b.branch_name,
        deliveryAddress: b.delivery_address,
        sectionOrder: b.section_order,
        branchSubtotal: Number(b.branch_subtotal || 0),
        items: mappedItems.filter((it) => !it.billBranchId || it.billBranchId === b.id),
      }));
    }

    return bill;
  }

  async createBill(data: any): Promise<Bill> {
    const company = await this.getCompany(data.companyId);
    if (!company) throw new Error("Issuing company required");

    const billNumber = await this.getNextDocumentNumber(data.companyId, "INVOICE");
    const billId = toValidUuid(data.id);

    const calculatedDays =
      data.rentalStartDate && data.rentalEndDate
        ? calculateRentalDays(data.rentalStartDate, data.rentalEndDate)
        : 1;
    const rentalDuration = data.rentalDays !== undefined ? Number(data.rentalDays) : calculatedDays;

    const branchItems = data.branches && Array.isArray(data.branches)
      ? data.branches.flatMap((b: any) => b.items || [])
      : [];
    const inputLines = (data.documentLines && data.documentLines.length > 0)
      ? data.documentLines
      : (data.items && data.items.length > 0)
      ? data.items
      : branchItems;

    const flatItems: BillItem[] = [];

    inputLines.forEach((it: any, itIdx: number) => {
      const isNote = it.entryType === "note" || (!it.productId && (it.text || it.itemName));
      const pos = it.position !== undefined ? Number(it.position) : itIdx + 1;

      if (isNote) {
        flatItems.push({
          id: toValidUuid(it.id),
          billId,
          entryType: "note",
          position: pos,
          itemOrder: pos,
          text: it.text || it.itemName || "",
          productId: "",
          itemName: it.text || it.itemName || "Note",
          sizeSpec: "",
          quantity: 0,
          days: 0,
          unitPrice: 0,
          amount: 0,
          notes: null,
          dispatchedQuantity: 0,
          returnedGoodQuantity: 0,
          quantityReturnedGood: 0,
          quantityDamaged: 0,
          quantityMissing: 0,
          outstandingQuantity: 0,
          damageChargeDecision: "NO_CHARGE",
          damageChargeAmount: 0,
          missingChargeDecision: "NO_CHARGE",
          missingChargeAmount: 0,
        });
      } else {
        const qty = Number(it.quantity) || 1;
        const days = it.days !== undefined ? Number(it.days) : (it.rentalDurationDays !== undefined ? Number(it.rentalDurationDays) : rentalDuration);
        const unitPrice = Number(it.unitPrice ?? it.rentalRate ?? 0);
        const amount = it.amount !== undefined ? Number(it.amount) : (it.lineTotal !== undefined ? Number(it.lineTotal) : Math.round(qty * days * unitPrice * 100) / 100);

        flatItems.push({
          id: toValidUuid(it.id),
          billId,
          entryType: "product",
          position: pos,
          itemOrder: pos,
          text: null,
          productId: it.productId,
          itemName: it.itemName,
          sizeSpec: it.sizeSpec || "",
          quantity: qty,
          days,
          unitPrice,
          amount,
          notes: it.notes || null,
          dispatchedQuantity: qty,
          returnedGoodQuantity: 0,
          quantityReturnedGood: 0,
          quantityDamaged: 0,
          quantityMissing: 0,
          outstandingQuantity: qty,
          damageChargeDecision: "NO_CHARGE",
          damageChargeAmount: 0,
          missingChargeDecision: "NO_CHARGE",
          missingChargeAmount: 0,
        });
      }
    });

    const subtotal = flatItems.reduce((acc, it) => acc + (it.amount || 0), 0);
    const transport = Number(data.transportCharges || 0);
    const loading = Number(data.loadingCharges || 0);
    const labor = Number(data.laborCharges || 0);
    const other = Number(data.otherCharges || 0);
    const discount = Number(data.discountAmount || 0);

    const isInterState = Boolean(
      company.placeOfSupply &&
      data.placeOfSupply &&
      company.placeOfSupply.toLowerCase() !== data.placeOfSupply.toLowerCase()
    );

    const financials = calculateDocumentFinancials({
      taxType: company.gstType,
      itemsSubtotal: subtotal,
      transportCharges: transport,
      loadingCharges: loading,
      laborCharges: labor,
      otherCharges: other,
      discountAmount: discount,
      isInterState,
    });

    const initialAdvance = Number(data.advancePaid || 0);
    const balanceDue = Math.max(0, round2(financials.grandTotal - initialAdvance));

    const rentalStartDate = data.rentalStartDate || new Date().toISOString().split("T")[0];
    const rentalEndDate = data.rentalEndDate || new Date(Date.now() + 86400000 * rentalDuration).toISOString().split("T")[0];

    const customerId = await this.ensureCustomerId({
      customerId: data.customerId,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerAddress: data.customerAddress,
      customerGstin: data.customerGstin,
      companyId: data.companyId,
    });

    const newBill: Bill = {
      id: billId,
      billNumber,
      companyId: data.companyId,
      companySnapshot: company,
      sourceQuotationId: data.sourceQuotationId || null,
      customerId,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerAddress: data.customerAddress || "",
      customerGstin: data.customerGstin || null,
      billDate: data.billDate || new Date().toISOString().split("T")[0],
      supplyDate: data.supplyDate || rentalStartDate,
      placeOfSupply: data.placeOfSupply || company.placeOfSupply,
      rentalStartDate,
      rentalEndDate,
      expectedReturnDate: data.expectedReturnDate || rentalEndDate,
      rentalDays: rentalDuration,
      rentalDuration,
      rentalBillingUnit: data.rentalBillingUnit || "PER_DAY",
      originalRentalDuration: rentalDuration,
      agreedRentalRate: Number(data.agreedRentalRate || 0),
      lateReturnPolicy: data.lateReturnPolicy || "DAILY_RATE",
      status: (data.status as any) || "ISSUED",
      taxType: company.gstType,
      subtotal: financials.subtotal,

      transportCharges: transport,
      loadingCharges: loading,
      laborCharges: labor,
      otherCharges: other,
      discountAmount: discount,
      taxableAmount: financials.taxableAmount,
      cgstRate: financials.cgstRate,
      cgstAmount: financials.cgstAmount,
      sgstRate: financials.sgstRate,
      sgstAmount: financials.sgstAmount,
      igstRate: financials.igstRate,
      igstAmount: financials.igstAmount,
      totalTax: financials.totalTax,
      originalGrandTotal: financials.grandTotal,
      grandTotal: financials.grandTotal,
      advancePaid: 0,
      advanceAmount: 0,
      securityDepositHeld: Number(data.securityDepositHeld || 0),
      amountPaid: 0,
      paidAmount: 0,
      balanceDue: financials.grandTotal,
      amountInWords: numberToIndianWords(financials.grandTotal),
      paymentStatus: "UNPAID",
      notes: data.notes || null,
      termsAndConditions: data.termsAndConditions || company.termsAndConditions,
      documentLines: flatItems.map((it) => ({
        id: it.id,
        entryType: it.entryType || "product",
        position: it.position || it.itemOrder,
        text: it.text || (it.entryType === "note" ? it.itemName : undefined),
        productId: it.productId,
        itemName: it.itemName,
        sizeSpec: it.sizeSpec,
        quantity: it.quantity,
        days: it.days,
        unitPrice: it.unitPrice,
        amount: it.amount,
        notes: it.notes,
      })),
      items: flatItems,
      createdBy: data.actor?.name || "System",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const row = mapBillToRow(newBill);
    const { data: inserted, error } = await this.supabase
      .from("bills")
      .insert(row)
      .select()
      .single();

    if (error) throw new Error(`Supabase error creating bill: ${error.message}`);

    // Insert bill branches and bill items
    const branchesToInsert = (data.branches && Array.isArray(data.branches) && data.branches.length > 0)
      ? data.branches
      : [
          {
            branchName: "Main Branch",
            branchAddress: data.customerAddress || "Tamil Nadu",
            items: flatItems,
          },
        ];

    const createdBranches: BillBranch[] = [];

    for (let bIdx = 0; bIdx < branchesToInsert.length; bIdx++) {
      const b = branchesToInsert[bIdx];
      const branchId = toValidUuid(b.id);
      const bItems = b.items && b.items.length > 0 ? b.items : flatItems;
      const bSubtotal = bItems.reduce((acc: number, it: any) => acc + (Number(it.amount || it.lineTotal) || 0), 0);

      await this.supabase.from("bill_branches").insert({
        id: branchId,
        bill_id: billId,
        branch_name: b.branchName || "Main Branch",
        delivery_address: b.branchAddress || data.customerAddress || "Tamil Nadu",
        section_order: bIdx + 1,
        branch_subtotal: bSubtotal || financials.subtotal,
        created_at: new Date().toISOString(),
      });

      const branchBillItems: BillItem[] = [];

      const itemRows = bItems.map((it: any, itIdx: number) => {
        const qty = Number(it.quantity) || 1;
        const days = it.days !== undefined ? Number(it.days) : (it.rentalDurationDays !== undefined ? Number(it.rentalDurationDays) : rentalDuration);
        const unitPrice = Number(it.unitPrice ?? it.rentalRate ?? 0);
        const amount = it.amount !== undefined ? Number(it.amount) : (it.lineTotal !== undefined ? Number(it.lineTotal) : Math.round(qty * days * unitPrice * 100) / 100);

        const bItem: BillItem = {
          id: toValidUuid(it.id),
          billId,
          billBranchId: branchId,
          entryType: it.entryType || "product",
          position: it.position !== undefined ? Number(it.position) : itIdx + 1,
          text: it.text || null,
          productId: it.productId || null,
          itemName: it.itemName,
          sizeSpec: it.sizeSpec || null,
          quantity: qty,
          days,
          unitPrice,
          amount,
          itemOrder: it.itemOrder !== undefined ? Number(it.itemOrder) : itIdx + 1,
          notes: it.notes || null,
          dispatchedQuantity: qty,
          returnedGoodQuantity: 0,
          quantityReturnedGood: 0,
          quantityDamaged: 0,
          quantityMissing: 0,
          outstandingQuantity: qty,
          damageChargeDecision: "NO_CHARGE",
          damageChargeAmount: 0,
          missingChargeDecision: "NO_CHARGE",
          missingChargeAmount: 0,
        };
        branchBillItems.push(bItem);

        return {
          id: bItem.id,
          bill_id: billId,
          bill_branch_id: branchId,
          entry_type: bItem.entryType,
          position: bItem.position,
          text: bItem.text,
          product_id: bItem.productId,
          item_name: bItem.itemName,
          size_spec: bItem.sizeSpec,
          quantity: bItem.quantity,
          days: bItem.days,
          unit_price: bItem.unitPrice,
          amount: bItem.amount,
          item_order: bItem.itemOrder,
          notes: bItem.notes,
          quantity_physically_returned: 0,
          created_at: new Date().toISOString(),
        };
      });

      if (itemRows.length > 0) {
        const { error: itemErr } = await this.supabase.from("bill_items").insert(itemRows);
        if (itemErr) throw new Error(`Supabase error inserting bill items: ${itemErr.message}`);
      }

      createdBranches.push({
        id: branchId,
        billId,
        branchName: b.branchName || "Main Branch",
        deliveryAddress: b.branchAddress || data.customerAddress || "Tamil Nadu",
        sectionOrder: bIdx + 1,
        branchSubtotal: bSubtotal || financials.subtotal,
        items: branchBillItems,
      });
    }

    // Record advance payment if present
    if (initialAdvance > 0) {
      await this.recordPayment({
        billId,
        companyId: newBill.companyId,
        customerId: newBill.customerId,
        customerName: newBill.customerName,
        paymentType: "ADVANCE",
        amount: initialAdvance,
        paymentDate: newBill.billDate,
        paymentMethod: data.paymentMethod || "CASH",
        referenceNumber: `Advance for Bill ${newBill.billNumber}`,
        notes: `Initial advance recorded on bill creation`,
      });
    }

    const result = mapBillFromRow(inserted, flatItems);
    result.branches = createdBranches;
    if (initialAdvance > 0) {
      result.advancePaid = initialAdvance;
      result.advanceAmount = initialAdvance;
      result.balanceDue = balanceDue;
      result.paymentStatus = initialAdvance >= financials.grandTotal ? "FULLY_PAID" : "PARTIALLY_PAID";
    }

    if (!data.sourceQuotationId) {
      try {
        const resolvedActor = this.resolveActor(data.actor);
        await this.recordAuditLog({
          entityType: "BILL",
          entityId: result.id,
          entityNumber: result.billNumber,
          customerName: result.customerName,
          action: "BILL_CREATED",
          actionLabel: "Direct Bill Created",
          actor: resolvedActor,
          details: {
            summary: `Direct rental bill #${result.billNumber} created for ${result.customerName} by ${resolvedActor.name} (${resolvedActor.role})`,
            grandTotal: result.grandTotal,
            advancePaid: initialAdvance,
            rentalDays: result.rentalDays,
            itemsCount: flatItems.length,
          },
        });
      } catch (auditErr) {
        console.error("[createBill] Failed to record direct bill audit log:", auditErr);
      }
    }

    return result;
  }

  async convertQuotationToBill(quoteId: string, customData?: any, opts?: any): Promise<Bill> {
    const quote = await this.getQuotation(quoteId);
    if (!quote) throw new Error(`Quotation ${quoteId} not found`);

    if (quote.status === "CONVERTED" || quote.convertedBillId) {
      throw new Error(`Quotation ${quote.quotationNumber} is already converted.`);
    }

    const company = await this.getCompany(quote.companyId);
    if (!company) throw new Error("Company not found");

    const bill = await this.createBill({
      companyId: quote.companyId,
      customerId: quote.customerId,
      customerName: quote.customerName,
      customerPhone: quote.customerPhone,
      customerAddress: quote.customerAddress,
      customerGstin: quote.customerGstin,
      rentalStartDate: quote.rentalStartDate,
      rentalEndDate: quote.rentalEndDate,
      rentalDays: quote.rentalDays,
      documentLines: quote.documentLines || quote.items || [],
      transportCharges: quote.transportCharges,
      loadingCharges: quote.loadingCharges,
      laborCharges: quote.laborCharges,
      otherCharges: quote.otherCharges,
      discountAmount: quote.discountAmount,
      advancePaid: opts?.advancePaid !== undefined ? Number(opts.advancePaid) : (opts?.advanceAmount !== undefined ? Number(opts.advanceAmount) : (quote.advanceRequired || 0)),
      paymentMethod: opts?.paymentMethod || "CASH",
      notes: quote.notes,
      sourceQuotationId: quote.id,
      actor: opts?.actor,
      ...customData,
    });

    // Mark quotation as converted
    await this.updateQuotation(quoteId, {
      status: "CONVERTED",
      convertedBillId: bill.id,
      convertedBillNumber: bill.billNumber,
      convertedAt: new Date().toISOString(),
    });

    try {
      const resolvedActor = this.resolveActor(opts?.actor);
      // 1. Audit event on Quotation
      await this.recordAuditLog({
        entityType: "QUOTATION",
        entityId: quote.id,
        entityNumber: quote.quotationNumber,
        customerName: quote.customerName,
        action: "QUOTATION_CONVERTED",
        actionLabel: "Quotation Converted to Bill",
        actor: resolvedActor,
        details: {
          summary: `Quotation #${quote.quotationNumber} converted to Bill #${bill.billNumber} by ${resolvedActor.name} (${resolvedActor.role})`,
          convertedBillId: bill.id,
          convertedBillNumber: bill.billNumber,
          advancePaid: opts?.advancePaid || 0,
        },
      });

      // 2. Audit event on Bill
      await this.recordAuditLog({
        entityType: "BILL",
        entityId: bill.id,
        entityNumber: bill.billNumber,
        customerName: bill.customerName,
        action: "BILL_CREATED_FROM_QUOTE",
        actionLabel: "Bill Created from Quotation",
        actor: resolvedActor,
        details: {
          summary: `Bill #${bill.billNumber} created from Quotation #${quote.quotationNumber} by ${resolvedActor.name} (${resolvedActor.role})`,
          sourceQuotationId: quote.id,
          sourceQuotationNumber: quote.quotationNumber,
          grandTotal: bill.grandTotal,
          advancePaid: opts?.advancePaid || 0,
        },
      });
    } catch (auditErr) {
      console.error("[convertQuotationToBill] Failed to record conversion audit logs:", auditErr);
    }

    return bill;
  }

  async updateBill(id: string, updates: Partial<Bill>, actor?: any): Promise<Bill> {
    const row = mapBillToRow({ ...updates, updatedAt: new Date().toISOString() });
    delete row.id;

    const { data: updated, error } = await this.supabase
      .from("bills")
      .update(row)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`Supabase error updating bill ${id}: ${error.message}`);
    const mapped = mapBillFromRow(updated);
    if (updates.additionalRentalCharges !== undefined) mapped.additionalRentalCharges = updates.additionalRentalCharges;
    if (updates.additionalRentalDays !== undefined) mapped.additionalRentalDays = updates.additionalRentalDays;
    if (updates.expectedReturnDate !== undefined) mapped.expectedReturnDate = updates.expectedReturnDate;
    if (updates.rentalDuration !== undefined) mapped.rentalDuration = updates.rentalDuration;
    if (updates.amendments !== undefined) mapped.amendments = updates.amendments;
    if (updates.incidents !== undefined) mapped.incidents = updates.incidents;
    if (updates.totalReturnedGood !== undefined) mapped.totalReturnedGood = updates.totalReturnedGood;
    if (updates.totalDamaged !== undefined) mapped.totalDamaged = updates.totalDamaged;
    if (updates.totalMissing !== undefined) mapped.totalMissing = updates.totalMissing;
    if (updates.approvedDamageCharges !== undefined) mapped.approvedDamageCharges = updates.approvedDamageCharges;
    if (updates.approvedMissingCharges !== undefined) mapped.approvedMissingCharges = updates.approvedMissingCharges;
    if (updates.documentLines !== undefined) mapped.documentLines = updates.documentLines;
    return mapped;
  }

  async saveBillWorkspaceChanges(billId: string, payload: any, actorId?: any): Promise<Bill> {
    const bill = await this.getBill(billId);
    if (!bill) throw new Error(`Bill ${billId} not found`);

    if (bill.status === "CLOSED") {
      throw new Error("Cannot modify a closed bill.");
    }

    const updates: Partial<Bill> = {};
    if (payload.status) updates.status = payload.status;
    if (payload.notes !== undefined) updates.notes = payload.notes;
    if (payload.actualReturnDate) updates.actualReturnDate = payload.actualReturnDate;
    if (payload.deliveryLocation) updates.placeOfSupply = payload.deliveryLocation;

    const rawLines = payload.documentLines || payload.items;
    if (Array.isArray(rawLines)) {
      // Map previous lines to calculate idempotent stock delta
      const prevLinesMap = new Map<string, any>();
      for (const pl of (bill.documentLines || [])) {
        if (pl.id) prevLinesMap.set(pl.id, pl);
        if (pl.productId) prevLinesMap.set(`prod-${pl.productId}`, pl);
      }

      let totalGood = 0;
      let totalDamaged = 0;
      let totalMissing = 0;
      let approvedDamages = 0;
      let approvedMissing = 0;

      const verifiedLines: any[] = [];
      const incidents: DamageMissingIncident[] = [];

      for (const raw of rawLines) {
        if (raw.entryType === "note") {
          verifiedLines.push({
            ...raw,
            quantity: 0,
            quantityPhysicallyReturned: 0,
            quantityReturnedGood: 0,
            quantityDamaged: 0,
            quantityMissing: 0,
          });
          continue;
        }

        const dispatched = Math.max(0, Number(raw.quantity || 0));
        let damaged = Math.max(0, Number(raw.quantityDamaged ?? raw.damaged ?? 0));
        let missing = Math.max(0, Number(raw.quantityMissing ?? raw.missing ?? 0));

        // Validation rule: Never allow negative quantities or total of damaged + missing greater than dispatched
        if (damaged + missing > dispatched) {
          if (damaged > dispatched) damaged = dispatched;
          if (damaged + missing > dispatched) missing = Math.max(0, dispatched - damaged);
        }

        // Formula: Returned Good = Dispatched Quantity − Damaged Quantity − Missing Quantity
        // Use the same calculation on the server as a validation rule. Never trust a client-submitted Returned Good value.
        const returnedGood = Math.max(0, dispatched - damaged - missing);
        const physicalReturned = returnedGood + damaged;

        totalGood += returnedGood;
        totalDamaged += damaged;
        totalMissing += missing;

        const damageDecision: IncidentChargeStatus =
          damaged > 0
            ? (raw.damageChargeDecision || "PENDING_DECISION")
            : "NO_CHARGE";
        const damageAmount =
          damaged > 0 && damageDecision === "ADD_CHARGE"
            ? Math.max(0, Number(raw.damageChargeAmount || 0))
            : 0;

        const missingDecision: IncidentChargeStatus =
          missing > 0
            ? (raw.missingChargeDecision || "PENDING_DECISION")
            : "NO_CHARGE";
        const missingAmount =
          missing > 0 && missingDecision === "ADD_CHARGE"
            ? Math.max(0, Number(raw.missingChargeAmount || 0))
            : 0;

        approvedDamages += damageAmount;
        approvedMissing += missingAmount;

        if (damaged > 0) {
          incidents.push({
            id: `inc-dam-${raw.id || raw.productId}`,
            billId,
            productId: raw.productId,
            productName: raw.itemName || "Rental Product",
            quantityAffected: damaged,
            type: "DAMAGED",
            description: raw.damageNotes || raw.notes || "Damaged during rental",
            inspectionDate: payload.actualReturnDate || new Date().toISOString().split("T")[0],
            proposedCharge: Number(raw.damageChargeAmount || 0),
            finalApprovedCharge: damageAmount,
            chargeApprovalStatus: damageDecision,
          });
        }

        if (missing > 0) {
          incidents.push({
            id: `inc-mis-${raw.id || raw.productId}`,
            billId,
            productId: raw.productId,
            productName: raw.itemName || "Rental Product",
            quantityAffected: missing,
            type: "MISSING",
            description: raw.missingNotes || raw.notes || "Missing during rental",
            inspectionDate: payload.actualReturnDate || new Date().toISOString().split("T")[0],
            proposedCharge: Number(raw.missingChargeAmount || 0),
            finalApprovedCharge: missingAmount,
            chargeApprovalStatus: missingDecision,
          });
        }

        // Idempotent delta stock restoration:
        // Ensure stock is restored only for usable returned goods. Damaged goods must not be added to usable stock, and missing goods must not be restored to stock.
        // Prevent repeated submissions from restoring stock or applying damage/missing charges twice.
        if (raw.productId) {
          const prevLine = prevLinesMap.get(raw.id) || prevLinesMap.get(`prod-${raw.productId}`);
          const prevGood =
            prevLine && prevLine.quantityReturnedGood !== undefined
              ? Math.max(0, Number(prevLine.quantityReturnedGood))
              : 0;
          const prevDamaged =
            prevLine && prevLine.quantityDamaged !== undefined
              ? Math.max(0, Number(prevLine.quantityDamaged))
              : 0;
          const prevMissing =
            prevLine && prevLine.quantityMissing !== undefined
              ? Math.max(0, Number(prevLine.quantityMissing))
              : 0;

          const deltaGood = returnedGood - prevGood;
          const deltaDamaged = damaged - prevDamaged;
          const deltaMissing = missing - prevMissing;
          const deltaRented = (returnedGood + damaged + missing) - (prevGood + prevDamaged + prevMissing);

          if (deltaGood !== 0 || deltaDamaged !== 0 || deltaMissing !== 0 || deltaRented !== 0) {
            const prod = await this.getProduct(raw.productId);
            if (prod) {
              const newAvail = Math.max(0, (prod.availableQuantity || 0) + deltaGood);
              const newRented = Math.max(0, (prod.rentedQuantity || 0) - deltaRented);
              const newDamaged = Math.max(0, (prod.damagedQuantity || 0) + deltaDamaged);
              const newMissing = Math.max(0, (prod.missingQuantity || 0) + deltaMissing);

              await this.updateProduct(raw.productId, {
                availableQuantity: newAvail,
                rentedQuantity: newRented,
                damagedQuantity: newDamaged,
                missingQuantity: newMissing,
              });

              if (deltaGood !== 0) {
                await this.supabase.from("inventory_movements").insert({
                  product_id: raw.productId,
                  movement_type: "RETURN_GOOD",
                  quantity_change: deltaGood,
                  reference_type: "BILL",
                  reference_id: billId,
                  balance_after: newAvail,
                  notes: `Bill ${bill.billNumber} return adjustment: ${deltaGood > 0 ? "+" : ""}${deltaGood} good condition units restored to stock`,
                });
              }
              if (deltaDamaged !== 0) {
                await this.supabase.from("inventory_movements").insert({
                  product_id: raw.productId,
                  movement_type: "RETURN_DAMAGED",
                  quantity_change: deltaDamaged,
                  reference_type: "BILL",
                  reference_id: billId,
                  balance_after: newAvail,
                  notes: `Bill ${bill.billNumber} damage inspection: ${deltaDamaged > 0 ? "+" : ""}${deltaDamaged} damaged units`,
                });
              }
              if (deltaMissing !== 0) {
                await this.supabase.from("inventory_movements").insert({
                  product_id: raw.productId,
                  movement_type: "RETURN_MISSING",
                  quantity_change: -deltaMissing,
                  reference_type: "BILL",
                  reference_id: billId,
                  balance_after: newAvail,
                  notes: `Bill ${bill.billNumber} missing inspection: ${deltaMissing > 0 ? "+" : ""}${deltaMissing} missing units`,
                });
              }
            }
          }
        }

        verifiedLines.push({
          ...raw,
          quantity: dispatched,
          quantityPhysicallyReturned: physicalReturned,
          quantityReturnedGood: returnedGood,
          returnedGoodQuantity: returnedGood,
          quantityDamaged: damaged,
          quantityMissing: missing,
          damageChargeDecision: damageDecision,
          damageChargeAmount: damageAmount,
          missingChargeDecision: missingDecision,
          missingChargeAmount: missingAmount,
        });
      }

      // Update bill_items table concurrently
      const billItemUpdates = verifiedLines
        .filter((vl) => vl.id && vl.entryType !== "note")
        .map((vl) =>
          this.supabase
            .from("bill_items")
            .update({
              quantity_physically_returned: vl.quantityPhysicallyReturned,
              notes: vl.notes || vl.damageNotes || vl.missingNotes || null,
            })
            .eq("id", vl.id)
        );
      if (billItemUpdates.length > 0) {
        await Promise.all(billItemUpdates);
      }

      updates.documentLines = verifiedLines;
      bill.documentLines = verifiedLines;
      bill.totalReturnedGood = totalGood;
      bill.totalDamaged = totalDamaged;
      bill.totalMissing = totalMissing;
      bill.approvedDamageCharges = approvedDamages;
      bill.approvedMissingCharges = approvedMissing;
      bill.incidents = incidents;

      const totalDispatched = bill.totalDispatched || verifiedLines.reduce((acc, l) => acc + (l.entryType === "note" ? 0 : Number(l.quantity || 0)), 0);
      const totalAccounted = totalGood + totalDamaged + totalMissing;
      const hasPendingIncidents = incidents.some((i) => i.chargeApprovalStatus === "PENDING_DECISION");

      if (totalDispatched > 0 && totalAccounted >= totalDispatched) {
        updates.status = hasPendingIncidents ? "RETURN_INSPECTION" : "PENDING_SETTLEMENT";
      } else if (totalAccounted > 0) {
        updates.status = "PARTIALLY_RETURNED";
      }
      bill.status = updates.status || bill.status;

      if (payload.additionalRentalCharges !== undefined) {
        bill.additionalRentalCharges = Number(payload.additionalRentalCharges);
        updates.additionalRentalCharges = bill.additionalRentalCharges;
      }

      const payments = bill.payments && bill.payments.length > 0 ? bill.payments : await this.getPayments(billId);
      this.recalculateBillFinancials(bill, payments);

      updates.grandTotal = bill.grandTotal;
      updates.balanceDue = bill.balanceDue;
      updates.amountInWords = bill.amountInWords;
      updates.approvedDamageCharges = approvedDamages;
      updates.approvedMissingCharges = approvedMissing;
      updates.incidents = incidents;
    } else {
      if (payload.approvedDamageCharges !== undefined) updates.approvedDamageCharges = Number(payload.approvedDamageCharges);
      if (payload.approvedMissingCharges !== undefined) updates.approvedMissingCharges = Number(payload.approvedMissingCharges);
      if (payload.additionalRentalCharges !== undefined) updates.additionalRentalCharges = Number(payload.additionalRentalCharges);
      if (payload.incidents) updates.incidents = payload.incidents;
    }

    const updated = await this.updateBill(billId, updates, actorId);
    if (updates.documentLines) updated.documentLines = updates.documentLines;
    if (updates.incidents) updated.incidents = updates.incidents;
    if (updates.approvedDamageCharges !== undefined) updated.approvedDamageCharges = updates.approvedDamageCharges;
    if (updates.approvedMissingCharges !== undefined) updated.approvedMissingCharges = updates.approvedMissingCharges;
    if (updates.totalReturnedGood !== undefined) updated.totalReturnedGood = updates.totalReturnedGood;
    if (updates.totalDamaged !== undefined) updated.totalDamaged = updates.totalDamaged;
    if (updates.totalMissing !== undefined) updated.totalMissing = updates.totalMissing;

    try {
      const resolvedActor = this.resolveActor(actorId || payload.actor);
      await this.recordAuditLog({
        entityType: "BILL",
        entityId: bill.id,
        entityNumber: bill.billNumber,
        customerName: bill.customerName,
        action: "BILL_UPDATED",
        actionLabel: "Bill Changes Saved",
        actor: resolvedActor,
        details: {
          summary: `Bill #${bill.billNumber} modified by ${resolvedActor.name} (${resolvedActor.role})`,
          status: updates.status,
          notes: payload.notes,
          grandTotal: updated.grandTotal,
          balanceDue: updated.balanceDue,
        },
      });
    } catch (auditErr) {
      console.error("[saveBillWorkspaceChanges] Failed to record audit log:", auditErr);
    }

    return updated;
  }

  async closeBill(billId: string, payload: any = {}, actor?: any): Promise<Bill> {
    const bill = await this.getBill(billId);
    if (!bill) throw new Error(`Bill ${billId} not found`);

    if (bill.status === "CLOSED" && bill.balanceDue === 0) {
      return bill;
    }

    // Preserve the existing decision and approval workflow for damage and missing charges.
    // Pending decisions must continue to block bill closure as intended.
    const hasPendingIncidents =
      bill.incidents?.some((i) => i.chargeApprovalStatus === "PENDING_DECISION") ||
      (bill.documentLines || []).some(
        (it) =>
          ((it.quantityDamaged || 0) > 0 && it.damageChargeDecision === "PENDING_DECISION") ||
          ((it.quantityMissing || 0) > 0 && it.missingChargeDecision === "PENDING_DECISION")
      );
    if (hasPendingIncidents) {
      throw new Error(
        "Cannot close bill: One or more damaged/missing incident items have 'Decision Pending'. All decisions must be decided (charged or waived) before closure."
      );
    }

    if (bill.balanceDue > 0) {
      if (!payload.paymentReceivedInFull && !payload.allowOutstandingClose && !payload.forceClose) {
        throw new Error(
          `Cannot close bill: Outstanding balance of ₹${bill.balanceDue.toFixed(2)} remains unpaid. Full payment or authorized waiver required.`
        );
      }

      if (payload.paymentReceivedInFull) {
        const receivedAmt = Number(payload.amountReceived ?? bill.balanceDue);
        if (receivedAmt < bill.balanceDue && !payload.allowOutstandingClose) {
          throw new Error(
            `Cannot close bill: Amount received (₹${receivedAmt.toFixed(2)}) is less than balance due (₹${bill.balanceDue.toFixed(2)}).`
          );
        }
        await this.recordPayment({
          companyId: bill.companyId,
          customerId: bill.customerId,
          billId: bill.id,
          amount: receivedAmt,
          paymentMethod: payload.paymentMethod || "CASH",
          paymentType: "RENTAL_PAYMENT",
          notes: payload.paymentNotes || payload.notes || "Final settlement at bill closure",
          actor: actor || payload.actor,
        });
      }
    }

    const updated = await this.updateBill(billId, { status: "CLOSED", notes: payload.notes || bill.notes }, actor);

    try {
      const resolvedActor = this.resolveActor(actor || payload.actor);
      await this.recordAuditLog({
        entityType: "BILL",
        entityId: bill.id,
        entityNumber: bill.billNumber,
        customerName: bill.customerName,
        action: "BILL_CLOSED",
        actionLabel: "Rental Bill Closed",
        actor: resolvedActor,
        details: {
          summary: `Rental bill #${bill.billNumber} closed by ${resolvedActor.name} (${resolvedActor.role})`,
          closureNotes: payload.notes || bill.notes || "Final settlement & closure",
          finalGrandTotal: bill.grandTotal,
          paymentReceivedInFull: Boolean(payload.paymentReceivedInFull),
          amountReceived: payload.amountReceived,
        },
      });
    } catch (auditErr) {
      console.error("[closeBill] Failed to record audit log:", auditErr);
    }

    return updated;
  }

  async reopenBill(billId: string, reason?: string, actor?: any): Promise<Bill> {
    const bill = await this.getBill(billId);
    const updated = await this.updateBill(billId, { status: "ISSUED" }, actor);
    if (bill) {
      try {
        const resolvedActor = this.resolveActor(actor);
        await this.recordAuditLog({
          entityType: "BILL",
          entityId: bill.id,
          entityNumber: bill.billNumber,
          customerName: bill.customerName,
          action: "BILL_REOPENED",
          actionLabel: "Rental Bill Reopened",
          actor: resolvedActor,
          details: {
            summary: `Rental bill #${bill.billNumber} reopened by ${resolvedActor.name} (${resolvedActor.role})`,
            reason: reason || "Administrative reopening",
          },
        });
      } catch (auditErr) {
        console.error("[reopenBill] Failed to record audit log:", auditErr);
      }
    }
    return updated;
  }

  async dispatchBillItems(billId: string, payload: any, actor?: any): Promise<Bill> {
    return this.updateBill(billId, { status: "OUT_ON_RENT" }, actor);
  }

  recalculateBillFinancials(bill: Bill, billPayments: Payment[] = []): void {
    const origGrand = bill.originalGrandTotal ?? bill.grandTotal;
    bill.originalGrandTotal = origGrand;

    const additionalDays = bill.additionalRentalCharges || 0;
    const damages = bill.approvedDamageCharges || 0;
    const missing = bill.approvedMissingCharges || 0;
    const lateFees = bill.lateFeeCharges || 0;
    const discount = bill.discountAmount || 0;

    const activePayments = billPayments.filter((p) => !p.isReversed);
    const advancePayments = activePayments
      .filter((p) => p.paymentType === "ADVANCE")
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const regularPayments = activePayments
      .filter((p) => p.paymentType !== "SECURITY_DEPOSIT" && p.paymentType !== "ADVANCE")
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const recordedDeposits = activePayments
      .filter((p) => p.paymentType === "SECURITY_DEPOSIT")
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const effectiveAdvance = Math.max(bill.advancePaid || 0, advancePayments);
    bill.advancePaid = effectiveAdvance;

    const actualAmountPaid = Math.max(bill.amountPaid || 0, regularPayments);
    const actualDepositHeld = Math.max(bill.securityDepositHeld || 0, recordedDeposits);
    bill.amountPaid = actualAmountPaid;
    bill.securityDepositHeld = actualDepositHeld;

    const settlement = calculateFinalSettlement({
      originalGrandTotal: origGrand,
      additionalRentalCharges: additionalDays,
      approvedDamageCharges: damages,
      approvedMissingCharges: missing,
      lateFeeCharges: lateFees,
      discountAmount: (bill as any).settlementDiscountAmount || 0,
      paymentsReceived: actualAmountPaid,
      advancePaid: effectiveAdvance,
      securityDepositReceived: actualDepositHeld,
      authorizedDepositDeductions: bill.depositAdjustment || 0,
    });

    bill.grandTotal = settlement.revisedGrandTotal;
    bill.amountInWords = numberToIndianWords(settlement.revisedGrandTotal);
    bill.depositRefundDue = settlement.depositRefundDue;

    const totalPaidTowardsRent = round2(actualAmountPaid + effectiveAdvance + (bill.depositAdjustment || 0));
    if (totalPaidTowardsRent >= settlement.revisedGrandTotal) {
      bill.balanceDue = 0;
      bill.customerCredit = round2(totalPaidTowardsRent - settlement.revisedGrandTotal);
      bill.paymentStatus = bill.customerCredit > 0 ? "OVERPAID" : "FULLY_PAID";
    } else if (totalPaidTowardsRent > 0) {
      bill.balanceDue = round2(settlement.revisedGrandTotal - totalPaidTowardsRent);
      bill.customerCredit = 0;
      bill.paymentStatus = "PARTIALLY_PAID";
    } else {
      bill.balanceDue = settlement.revisedGrandTotal;
      bill.customerCredit = 0;
      bill.paymentStatus = "UNPAID";
    }

    bill.updatedAt = new Date().toISOString();
  }

  async amendBill(
    billId: string,
    amendment: { reason: string; changes?: any; [key: string]: any },
    actorId?: any
  ): Promise<Bill> {
    const bill = await this.getBill(billId);
    if (!bill) throw new Error("Bill not found");
    if (bill.status === "CLOSED") {
      throw new Error("Closed bills cannot be edited. Any subsequent adjustments require reopening authorization.");
    }
    if (amendment.changes?.totalDispatched !== undefined && amendment.changes.totalDispatched !== bill.totalDispatched) {
      throw new Error("Dispatched quantities cannot be silently modified. Use additional dispatch or return records.");
    }

    const actor = this.resolveActor(actorId || amendment.changes?.actor);

    if (!bill.amendments) bill.amendments = [];
    const amendmentRecord: BillAmendment = {
      id: crypto.randomUUID(),
      billId,
      amendmentNumber: bill.amendments.length + 1,
      reason: amendment.reason || "Authorized rental amendment",
      changes: JSON.parse(JSON.stringify(amendment.changes || {})),
      createdAt: new Date().toISOString(),
      authorizedBy: actor.name,
    };
    bill.amendments.push(amendmentRecord);

    const c = amendment.changes || {};
    if (c.expectedReturnDate) {
      bill.expectedReturnDate = c.expectedReturnDate;
      bill.rentalEndDate = c.expectedReturnDate;
      if (bill.rentalStartDate) {
        bill.rentalDuration = calculateRentalDays(bill.rentalStartDate, c.expectedReturnDate);
        bill.rentalDays = bill.rentalDuration;
      }
    }
    if (c.rentalEndDate) {
      bill.rentalEndDate = c.rentalEndDate;
      bill.expectedReturnDate = c.rentalEndDate;
      if (bill.rentalStartDate) {
        bill.rentalDuration = calculateRentalDays(bill.rentalStartDate, c.rentalEndDate);
        bill.rentalDays = bill.rentalDuration;
      }
    }
    if (c.notes !== undefined) bill.notes = c.notes;
    if (c.additionalRentalDays !== undefined) bill.additionalRentalDays = Number(c.additionalRentalDays);
    if (c.additionalRentalCharges !== undefined) bill.additionalRentalCharges = Number(c.additionalRentalCharges);
    if (c.lateFeeCharges !== undefined) bill.lateFeeCharges = Number(c.lateFeeCharges);

    const payments = await this.getPayments(billId);
    this.recalculateBillFinancials(bill, payments);

    const updatedBill = await this.updateBill(billId, bill, actor);

    await this.recordAuditLog({
      entityType: "BILL",
      entityId: bill.id,
      entityNumber: bill.billNumber,
      customerName: bill.customerName,
      action: "BILL_AMENDED",
      actionLabel: `Bill Amended (#${amendmentRecord.amendmentNumber})`,
      actor,
      details: {
        summary: `Amended bill #${bill.billNumber}: ${amendment.reason}`,
        amendmentNumber: amendmentRecord.amendmentNumber,
        reason: amendment.reason,
        changes: amendment.changes,
        newValues: {
          grandTotal: bill.grandTotal,
          balanceDue: bill.balanceDue,
        },
      },
    });

    return updatedBill;
  }

  async resolveDamageMissingIncident(
    billId: string,
    incidentId: string,
    decision: { action: "ADD_CHARGE" | "NO_CHARGE"; finalApprovedCharge?: number; decisionNotes?: string; actor?: any },
    actorId?: any
  ): Promise<Bill> {
    const bill = await this.getBill(billId);
    if (!bill) throw new Error("Bill not found");

    const incident = bill.incidents?.find((i) => i.id === incidentId);
    if (!incident) throw new Error("Incident not found");

    const actor = this.resolveActor(actorId || decision.actor);

    if (decision.action === "ADD_CHARGE") {
      const charge = Number(decision.finalApprovedCharge) || incident.proposedCharge || 0;
      incident.chargeApprovalStatus = "ADD_CHARGE";
      incident.finalApprovedCharge = charge;
      incident.decisionNotes = decision.decisionNotes || "Charge approved and added to customer bill";
      incident.resolvedAt = new Date().toISOString();
      incident.resolvedBy = actor.name;
    } else {
      incident.chargeApprovalStatus = "NO_CHARGE";
      incident.finalApprovedCharge = 0;
      incident.decisionNotes = decision.decisionNotes || "Recorded incident without charging customer";
      incident.resolvedAt = new Date().toISOString();
      incident.resolvedBy = actor.name;
    }

    bill.approvedDamageCharges = (bill.incidents || [])
      .filter((inc) => inc.type === "DAMAGED" && inc.chargeApprovalStatus === "ADD_CHARGE")
      .reduce((sum, inc) => sum + (inc.finalApprovedCharge || 0), 0);
    bill.approvedMissingCharges = (bill.incidents || [])
      .filter((inc) => inc.type === "MISSING" && inc.chargeApprovalStatus === "ADD_CHARGE")
      .reduce((sum, inc) => sum + (inc.finalApprovedCharge || 0), 0);

    const allIncidentsResolved = !bill.incidents?.some((i) => i.chargeApprovalStatus === "PENDING_DECISION");
    const totalDispatched = bill.totalDispatched || 0;
    const totalAccounted = (bill.totalReturnedGood || 0) + (bill.totalDamaged || 0) + (bill.totalMissing || 0);

    if (allIncidentsResolved && totalAccounted >= totalDispatched && totalDispatched > 0) {
      bill.status = "PENDING_SETTLEMENT";
    }

    const payments = await this.getPayments(billId);
    this.recalculateBillFinancials(bill, payments);

    const updatedBill = await this.updateBill(billId, bill, actor);

    await this.recordAuditLog({
      entityType: "BILL",
      entityId: bill.id,
      entityNumber: bill.billNumber,
      customerName: bill.customerName,
      action: "INCIDENT_RESOLVED",
      actionLabel: `Incident Resolved (${incident.type})`,
      actor,
      details: {
        incidentId,
        type: incident.type,
        decision: decision.action,
        finalApprovedCharge: incident.finalApprovedCharge,
        decisionNotes: incident.decisionNotes,
      },
    });

    return updatedBill;
  }

  async resolveIncident(billId: string, incidentId: string, payload: any, actor?: any): Promise<Bill> {
    return this.resolveDamageMissingIncident(billId, incidentId, payload, actor);
  }

  async recordIncident(billId: string, payload: any, actor?: any): Promise<Bill> {
    const bill = await this.getBill(billId);
    if (!bill) throw new Error(`Bill ${billId} not found`);

    const incidents = [...(bill.incidents || []), payload];
    return this.updateBill(billId, { incidents }, actor);
  }

  async recordBillReturn(
    billId: string,
    data: any,
    actorId?: any
  ): Promise<{ bill: Bill; returnRecord: ReturnRecord }> {
    const bill = await this.getBill(billId);
    if (!bill) throw new Error("Bill not found");
    if (bill.status === "CLOSED") {
      throw new Error("Cannot record return for a Closed bill.");
    }

    const returnNumber = `RET-${Date.now().toString().slice(-6)}`;
    const retId = crypto.randomUUID();
    const returnDate = data.returnDate || new Date().toISOString().split("T")[0];

    let newGoodTotal = 0;
    let newDamagedTotal = 0;
    let newMissingTotal = 0;

    const returnItems: any[] = [];

    for (const it of (data.items || [])) {
      if (it.entryType === "note") continue;
      const damaged = Number(it.damagedQuantity ?? it.quantityDamaged ?? 0) || 0;
      const missing = Number(it.missingQuantity ?? it.quantityMissing ?? 0) || 0;
      let good = 0;
      if (it.quantityPhysicallyReturned !== undefined || it.physicalReturned !== undefined) {
        const physical = Number(it.quantityPhysicallyReturned ?? it.physicalReturned) || 0;
        good = Math.max(0, physical - damaged);
      } else {
        good = Number(it.goodQuantity ?? it.quantityReturnedGood ?? it.returnedGoodQuantity ?? 0) || 0;
      }
      const itemTotalReturning = good + damaged + missing;

      newGoodTotal += good;
      newDamagedTotal += damaged;
      newMissingTotal += missing;

      if (it.productId) {
        const prod = await this.getProduct(it.productId);
        if (prod) {
          const newAvail = (prod.availableQuantity || 0) + good;
          await this.updateProduct(it.productId, {
            rentedQuantity: Math.max(0, (prod.rentedQuantity || 0) - itemTotalReturning),
            availableQuantity: newAvail,
            damagedQuantity: (prod.damagedQuantity || 0) + damaged,
            missingQuantity: (prod.missingQuantity || 0) + missing,
          });

          if (good > 0) {
            await this.supabase.from("inventory_movements").insert({
              product_id: it.productId,
              movement_type: "RETURN_GOOD",
              quantity_change: good,
              reference_type: "RETURN",
              reference_id: retId,
              balance_after: newAvail,
              notes: `Returned ${good} good condition units under Return ${returnNumber}`,
            });
          }
          if (damaged > 0) {
            await this.supabase.from("inventory_movements").insert({
              product_id: it.productId,
              movement_type: "RETURN_DAMAGED",
              quantity_change: damaged,
              reference_type: "RETURN",
              reference_id: retId,
              balance_after: newAvail,
              notes: `Returned ${damaged} damaged units under Return ${returnNumber}`,
            });
          }
          if (missing > 0) {
            await this.supabase.from("inventory_movements").insert({
              product_id: it.productId,
              movement_type: "RETURN_MISSING",
              quantity_change: -missing,
              reference_type: "RETURN",
              reference_id: retId,
              balance_after: newAvail,
              notes: `${missing} units reported missing under Return ${returnNumber}`,
            });
          }
        }
      }

      if (damaged > 0) {
        if (!bill.incidents) bill.incidents = [];
        const rawDecision = it.damageChargeDecision || it.chargeApprovalStatus;
        const damageAmount = Number(it.repairCost ?? it.damageChargeAmount ?? it.damageCharge ?? 0) || 0;
        const damageDecision: IncidentChargeStatus =
          rawDecision === "CHARGE_CUSTOMER" || rawDecision === "ADD_CHARGE"
            ? "ADD_CHARGE"
            : rawDecision === "NO_CHARGE" || rawDecision === "WAIVE" || rawDecision === "WAIVED"
            ? "NO_CHARGE"
            : (damageAmount > 0 ? "ADD_CHARGE" : "PENDING_DECISION");

        const incident: DamageMissingIncident = {
          id: crypto.randomUUID(),
          billId,
          productId: it.productId,
          productName: it.itemName || "Rental Product",
          quantityAffected: damaged,
          type: "DAMAGED",
          description: it.damageDescription || it.damageNotes || "Damaged during rental",
          inspectionDate: returnDate,
          proposedCharge: damageAmount,
          finalApprovedCharge: damageDecision === "ADD_CHARGE" ? damageAmount : 0,
          chargeApprovalStatus: damageDecision,
        };
        bill.incidents.push(incident);
        if (incident.chargeApprovalStatus === "ADD_CHARGE") {
          bill.approvedDamageCharges = (bill.approvedDamageCharges || 0) + incident.finalApprovedCharge;
        }
      }

      if (missing > 0) {
        if (!bill.incidents) bill.incidents = [];
        const rawDecision = it.missingChargeDecision || it.chargeApprovalStatus;
        const missingAmount = Number(it.replacementCost ?? it.missingChargeAmount ?? it.missingCharge ?? 0) || 0;
        const missingDecision: IncidentChargeStatus =
          rawDecision === "CHARGE_CUSTOMER" || rawDecision === "ADD_CHARGE"
            ? "ADD_CHARGE"
            : rawDecision === "NO_CHARGE" || rawDecision === "WAIVE" || rawDecision === "WAIVED"
            ? "NO_CHARGE"
            : (missingAmount > 0 ? "ADD_CHARGE" : "PENDING_DECISION");

        const incident: DamageMissingIncident = {
          id: crypto.randomUUID(),
          billId,
          productId: it.productId,
          productName: it.itemName || "Rental Product",
          quantityAffected: missing,
          type: "MISSING",
          description: it.missingDescription || it.missingNotes || "Missing upon return inspection",
          inspectionDate: returnDate,
          proposedCharge: missingAmount,
          finalApprovedCharge: missingDecision === "ADD_CHARGE" ? missingAmount : 0,
          chargeApprovalStatus: missingDecision,
        };
        bill.incidents.push(incident);
        if (incident.chargeApprovalStatus === "ADD_CHARGE") {
          bill.approvedMissingCharges = (bill.approvedMissingCharges || 0) + incident.finalApprovedCharge;
        }
      }

      for (const branch of (bill.branches || [])) {
        const bItem = branch.items.find((bi) => bi.id === it.id || bi.productId === it.productId);
        if (bItem) {
          bItem.quantityReturnedGood = (bItem.quantityReturnedGood || 0) + good;
          bItem.returnedGoodQuantity = bItem.quantityReturnedGood;
          bItem.quantityDamaged = (bItem.quantityDamaged || 0) + damaged;
          bItem.quantityMissing = (bItem.quantityMissing || 0) + missing;
          const dispatched = bItem.dispatchedQuantity || bItem.quantity || 0;
          bItem.outstandingQuantity = Math.max(0, dispatched - bItem.quantityReturnedGood - bItem.quantityDamaged - bItem.quantityMissing);
        }
      }

      returnItems.push({
        id: crypto.randomUUID(),
        returnId: retId,
        productId: it.productId,
        itemName: it.itemName,
        sizeSpec: it.sizeSpec || "",
        quantityReturnedGood: good,
        quantityDamaged: damaged,
        quantityMissing: missing,
        damageNotes: it.damageNotes || null,
        missingNotes: it.missingNotes || null,
        damageCharge: damaged > 0 ? Number(it.damageChargeAmount || it.damageCharge || 0) : 0,
        missingCharge: missing > 0 ? Number(it.missingChargeAmount || it.missingCharge || 0) : 0,
        conditionStatus: damaged > 0 ? "DAMAGED" : missing > 0 ? "MISSING" : "GOOD",
      });
    }

    bill.totalReturnedGood = (bill.totalReturnedGood || 0) + newGoodTotal;
    bill.totalDamaged = (bill.totalDamaged || 0) + newDamagedTotal;
    bill.totalMissing = (bill.totalMissing || 0) + newMissingTotal;
    bill.actualReturnDate = returnDate;

    const totalDispatched = bill.totalDispatched || 0;
    const totalAccounted = bill.totalReturnedGood + bill.totalDamaged + bill.totalMissing;
    const hasPendingIncidents = bill.incidents?.some((i) => i.chargeApprovalStatus === "PENDING_DECISION");

    if (totalAccounted >= totalDispatched && totalDispatched > 0) {
      if (hasPendingIncidents) {
        bill.status = "RETURN_INSPECTION";
      } else {
        bill.status = "PENDING_SETTLEMENT";
      }
    } else if (totalAccounted > 0) {
      bill.status = "PARTIALLY_RETURNED";
    }

    const payments = await this.getPayments(billId);
    this.recalculateBillFinancials(bill, payments);

    const actor = this.resolveActor(actorId || data.actor);

    // Ensure a valid gate pass exists for this return
    let gatePassId = data.gatePassId;
    if (!gatePassId) {
      const { data: gps } = await this.supabase
        .from("gate_passes")
        .select("id")
        .eq("bill_id", billId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (gps && gps.length > 0) {
        gatePassId = gps[0].id;
      } else {
        const gp = await this.createGatePass({
          companyId: bill.companyId,
          customerId: bill.customerId,
          customerName: bill.customerName,
          destinationBranch: "Main Site",
          destinationAddress: bill.customerAddress || "Tamil Nadu",
          billId: bill.id,
          expectedReturnDate: bill.expectedReturnDate || returnDate,
        });
        gatePassId = gp.id;
      }
    }

    const returnRecord: ReturnRecord = {
      id: retId,
      returnNumber,
      gatePassId,
      companyId: bill.companyId,
      customerId: bill.customerId,
      customerName: bill.customerName,
      returnDate,
      inspectedBy: data.receivedBy || actor.name || "Store Executive",
      damageCharges: bill.approvedDamageCharges || 0,
      lateFeeCharges: bill.lateFeeCharges || 0,
      depositAdjustment: bill.depositAdjustment || 0,
      items: returnItems,
      notes: JSON.stringify({
        userNotes: data.notes || null,
        totalReturnedGood: newGoodTotal,
        totalDamaged: newDamagedTotal,
        totalMissing: newMissingTotal,
        approvedDamageCharges: bill.approvedDamageCharges || 0,
        approvedMissingCharges: bill.approvedMissingCharges || 0,
      }),
      createdAt: new Date().toISOString(),
    };

    await this.recordReturn(returnRecord);

    // Insert into return_items if matching gate pass items are present
    if (gatePassId && returnItems.length > 0) {
      const { data: gpItems } = await this.supabase
        .from("gate_pass_items")
        .select("id, product_id")
        .eq("gate_pass_id", gatePassId);

      if (gpItems && gpItems.length > 0) {
        const retItemRows = [];
        for (const it of returnItems) {
          if (!it.productId) continue;
          const matchingGp = gpItems.find((gpi: any) => gpi.product_id === it.productId);
          if (matchingGp) {
            retItemRows.push({
              id: it.id,
              return_id: retId,
              product_id: it.productId,
              gate_pass_item_id: matchingGp.id,
              item_name: it.itemName,
              quantity_expected: it.quantityReturnedGood + it.quantityDamaged + it.quantityMissing,
              quantity_returned_good: it.quantityReturnedGood,
              quantity_damaged: it.quantityDamaged,
              quantity_missing: it.quantityMissing,
              damage_notes: it.damageNotes || null,
            });
          }
        }
        if (retItemRows.length > 0) {
          await this.supabase.from("return_items").insert(retItemRows);
        }
      }
    }

    const updatedBill = await this.updateBill(billId, bill, actor);
    updatedBill.totalReturnedGood = bill.totalReturnedGood;
    updatedBill.totalDamaged = bill.totalDamaged;
    updatedBill.totalMissing = bill.totalMissing;
    updatedBill.approvedDamageCharges = bill.approvedDamageCharges;
    updatedBill.approvedMissingCharges = bill.approvedMissingCharges;

    await this.recordAuditLog({
      entityType: "BILL",
      entityId: bill.id,
      entityNumber: bill.billNumber,
      customerName: bill.customerName,
      action: "RETURN_RECORDED",
      actionLabel: `Return Recorded (${returnNumber})`,
      actor,
      details: {
        returnNumber,
        good: newGoodTotal,
        damaged: newDamagedTotal,
        missing: newMissingTotal,
        newStatus: bill.status,
      },
    });

    return { bill: updatedBill, returnRecord, id: retId } as any;
  }


  // ==========================================================================
  // PAYMENTS
  // ==========================================================================
  async getPayments(billId?: string): Promise<Payment[]> {
    let query = this.supabase.from("payments").select("*").order("created_at", { ascending: false });
    if (billId) {
      query = query.eq("bill_id", billId);
    }
    const { data, error } = await query;
    if (error) throw new Error(`Supabase error fetching payments: ${error.message}`);
    return (data || []).map(mapPaymentFromRow);
  }

  async recordPayment(data: any): Promise<Payment> {
    const id = data.id || crypto.randomUUID();
    const paymentNumber = data.paymentNumber || `RCPT-${Date.now().toString().slice(-6)}`;

    const paymentType = data.paymentType || "RENTAL_PAYMENT";
    const paymentMethod = data.paymentMethod || "CASH";
    const newPayment: Payment = {
      ...data,
      id,
      paymentNumber,
      paymentType,
      paymentMethod,
      amount: Number(data.amount || 0),
      paymentDate: data.paymentDate || new Date().toISOString().split("T")[0],
      isReversed: false,
      createdAt: new Date().toISOString(),
    };

    const row = mapPaymentToRow(newPayment);
    const { data: inserted, error } = await this.supabase
      .from("payments")
      .insert(row)
      .select()
      .single();

    if (error) throw new Error(`Supabase error recording payment: ${error.message}`);

    // Update bill payment balances if attached to a bill
    if (data.billId) {
      const bill = await this.getBill(data.billId);
      if (bill) {
        const isAdvance = data.paymentType === "ADVANCE";
        const currentPaid = bill.amountPaid || 0;
        const currentAdvance = bill.advancePaid || 0;

        const newPaid = isAdvance ? currentPaid : currentPaid + newPayment.amount;
        const newAdvance = isAdvance ? currentAdvance + newPayment.amount : currentAdvance;
        const totalPaid = newPaid + newAdvance;
        const newBalance = Math.max(0, round2(bill.grandTotal - totalPaid));
        const paymentStatus = newBalance === 0 ? "FULLY_PAID" : totalPaid > 0 ? "PARTIALLY_PAID" : "UNPAID";

        await this.updateBill(data.billId, {
          amountPaid: newPaid,
          advancePaid: newAdvance,
          balanceDue: newBalance,
          paymentStatus,
        });

        try {
          const resolvedActor = this.resolveActor(data.actor);
          await this.recordAuditLog({
            entityType: "BILL",
            entityId: data.billId,
            entityNumber: bill.billNumber,
            customerName: bill.customerName,
            action: "PAYMENT_RECORDED",
            actionLabel: `Payment Recorded (${newPayment.paymentType})`,
            actor: resolvedActor,
            details: {
              summary: `Payment of ₹${newPayment.amount.toFixed(2)} recorded via ${newPayment.paymentMethod} by ${resolvedActor.name} (${resolvedActor.role})`,
              paymentNumber: newPayment.paymentNumber,
              paymentType: newPayment.paymentType,
              paymentMethod: newPayment.paymentMethod,
              amount: newPayment.amount,
              newBalanceDue: newBalance,
              paymentStatus,
              notes: newPayment.notes,
            },
          });
        } catch (auditErr) {
          console.error("[recordPayment] Failed to record payment audit log:", auditErr);
        }
      }
    }

    return mapPaymentFromRow(inserted);
  }

  // ==========================================================================
  // OPERATIONS: GATE PASSES & RETURNS
  // ==========================================================================
  async getGatePasses(): Promise<GatePass[]> {
    const { data, error } = await this.supabase
      .from("gate_passes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Supabase error fetching gate passes: ${error.message}`);
    
    const gatePasses: GatePass[] = [];
    for (const gpRow of data || []) {
      const { data: itemRows } = await this.supabase
        .from("gate_pass_items")
        .select("*")
        .eq("gate_pass_id", gpRow.id);
      const items = (itemRows || []).map(mapGatePassItemFromRow);
      gatePasses.push(mapGatePassFromRow(gpRow, items));
    }
    return gatePasses;
  }

  async getGatePass(id: string): Promise<GatePass | null> {
    const { data, error } = await this.supabase
      .from("gate_passes")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;

    const { data: itemRows } = await this.supabase
      .from("gate_pass_items")
      .select("*")
      .eq("gate_pass_id", id);
    const items = (itemRows || []).map(mapGatePassItemFromRow);
    return mapGatePassFromRow(data, items);
  }

  async createGatePass(data: any): Promise<GatePass> {
    const id = data.id || crypto.randomUUID();
    const gatePassNumber = data.gatePassNumber || (await this.getNextDocumentNumber(data.companyId, "GATE_PASS"));
    const company = await this.getCompany(data.companyId);

    const newGP: GatePass = {
      ...data,
      id,
      gatePassNumber,
      companySnapshot: data.companySnapshot || (company ? {
        id: company.id,
        name: company.name,
        gstin: company.gstin,
        phone: company.phone,
        address: company.address,
      } : {}),
      destinationBranch: data.destinationBranch || "Main Site",
      destinationAddress: data.destinationAddress || data.destinationBranch || "Tamil Nadu, India",
      expectedReturnDate: data.expectedReturnDate || new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
      status: data.status || "DISPATCHED",
      createdAt: new Date().toISOString(),
    };

    const row = mapGatePassToRow(newGP);
    const { data: inserted, error } = await this.supabase
      .from("gate_passes")
      .insert(row)
      .select()
      .single();

    if (error) throw new Error(`Supabase error creating gate pass: ${error.message}`);

    const createdItems: GatePassItem[] = [];
    if (data.items && Array.isArray(data.items) && data.items.length > 0) {
      for (const it of data.items) {
        const qty = Number(it.quantityDispatched || it.quantity || 1);
        if (qty <= 0) continue;
        const gpItemId = toValidUuid(it.id);

        // 1. Insert into gate_pass_items
        if (it.productId) {
          const { data: gpItemRow, error: gpItemErr } = await this.supabase
            .from("gate_pass_items")
            .insert({
              id: gpItemId,
              gate_pass_id: id,
              product_id: it.productId,
              item_name: it.itemName || "Dispatched Item",
              size_spec: it.sizeSpec || null,
              quantity_dispatched: qty,
              quantity_returned: 0,
              quantity_damaged: 0,
              quantity_missing: 0,
            })
            .select()
            .single();

          if (!gpItemErr && gpItemRow) {
            createdItems.push(mapGatePassItemFromRow(gpItemRow));
          }

          // 2. Adjust product stock & inventory ledger
          const prod = await this.getProduct(it.productId);
          if (prod) {
            const newAvail = Math.max(0, (prod.availableQuantity || 0) - qty);
            const newRented = (prod.rentedQuantity || 0) + qty;
            await this.updateProduct(it.productId, {
              availableQuantity: newAvail,
              rentedQuantity: newRented,
            });

            await this.supabase.from("inventory_movements").insert({
              product_id: it.productId,
              movement_type: "DISPATCH",
              quantity_change: -qty,
              reference_type: "GATE_PASS",
              reference_id: id,
              balance_after: newAvail,
              notes: `Dispatched ${qty} units under Gate Pass ${gatePassNumber}`,
            });
          }
        }
      }
    }

    if (data.billId) {
      try {
        const bill = await this.getBill(data.billId);
        if (bill) {
          const resolvedActor = this.resolveActor(data.actor);
          await this.recordAuditLog({
            entityType: "BILL",
            entityId: data.billId,
            entityNumber: bill.billNumber,
            customerName: bill.customerName,
            action: "DISPATCH_CREATED",
            actionLabel: `Gate Pass Dispatched (${gatePassNumber})`,
            actor: resolvedActor,
            details: {
              summary: `Dispatched equipment under Gate Pass #${gatePassNumber} by ${resolvedActor.name} (${resolvedActor.role})`,
              gatePassNumber,
              vehicleNumber: data.vehicleNumber,
              driverName: data.driverName,
              itemsCount: createdItems.length,
            },
          });
        }
      } catch (auditErr) {
        console.error("[createGatePass] Failed to record dispatch audit log:", auditErr);
      }
    }

    return mapGatePassFromRow(inserted, createdItems);
  }

  async getReturns(): Promise<ReturnRecord[]> {
    const { data, error } = await this.supabase
      .from("returns")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Supabase error fetching returns: ${error.message}`);
    return (data || []).map(mapReturnRecordFromRow);
  }

  async recordReturn(data: any): Promise<ReturnRecord> {
    const id = data.id || crypto.randomUUID();
    const returnNumber = data.returnNumber || `RET-${Date.now().toString().slice(-6)}`;

    const newReturn: ReturnRecord = {
      ...data,
      id,
      returnNumber,
      createdAt: new Date().toISOString(),
    };

    const row = mapReturnRecordToRow(newReturn);
    const { data: inserted, error } = await this.supabase
      .from("returns")
      .insert(row)
      .select()
      .single();

    if (error) throw new Error(`Supabase error recording return: ${error.message}`);
    return mapReturnRecordFromRow(inserted);
  }

  // ==========================================================================
  // USERS, ROLES & AUTHENTICATION
  // ==========================================================================
  async getUsers(): Promise<User[]> {
    const { data, error } = await this.supabase
      .from("users")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(`Supabase error fetching users: ${error.message}`);
    return (data || []).map((row) => mapUserFromRow(row, false));
  }

  async getUser(id: string, includeSensitive = false): Promise<User | undefined> {
    const { data, error } = await this.supabase
      .from("users")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(`Supabase error fetching user ${id}: ${error.message}`);
    return data ? mapUserFromRow(data, includeSensitive) : undefined;
  }

  async getUserByEmail(email: string, includeSensitive = false): Promise<User | undefined> {
    const { data, error } = await this.supabase
      .from("users")
      .select("*")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();

    if (error) throw new Error(`Supabase error fetching user by email: ${error.message}`);
    return data ? mapUserFromRow(data, includeSensitive) : undefined;
  }

  async getUserByUsernameOrEmail(identifier: string, includeSensitive = false): Promise<User | undefined> {
    const trimmed = identifier.trim().toLowerCase();
    const emailToSearch = trimmed.includes("@") ? trimmed : `${trimmed}@tamilnadusuppliers.com`;

    let { data, error } = await this.supabase
      .from("users")
      .select("*")
      .eq("email", emailToSearch)
      .maybeSingle();

    if (!data && !trimmed.includes("@")) {
      const res = await this.supabase
        .from("users")
        .select("*")
        .ilike("email", `${trimmed}%`)
        .maybeSingle();
      data = res.data;
    }

    if (error) throw new Error(`Supabase error fetching user ${identifier}: ${error.message}`);
    return data ? mapUserFromRow(data, includeSensitive) : undefined;
  }

  async createUser(data: any, actorRole?: string): Promise<User> {
    if (actorRole && actorRole !== "SUPER_ADMIN") {
      throw new Error("Forbidden: Only Super Administrator can create user accounts.");
    }

    const id = data.id || crypto.randomUUID();
    const passwordHash = data.password ? await bcrypt.hash(data.password, 10) : data.passwordHash;

    const defaultPerms = data.role === "ADMIN"
      ? ADMIN_PRESET_PERMISSIONS
      : data.role === "BILLING"
      ? BILLING_PRESET_PERMISSIONS
      : data.role === "SUPER_ADMIN"
      ? SUPER_ADMIN_PERMISSIONS
      : [];

    const permissions = (Array.isArray(data.permissions) && data.permissions.length > 0)
      ? data.permissions
      : defaultPerms;

    const newUser: User = {
      ...data,
      id,
      email: data.email.trim().toLowerCase(),
      username: data.username ? data.username.trim().toLowerCase() : data.email.trim().toLowerCase(),
      role: data.role || "EMPLOYEE",
      status: data.status || "ACTIVE",
      passwordHash,
      mustChangePassword: data.mustChangePassword !== false,
      permissions,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const row = mapUserToRow(newUser);
    const { data: inserted, error } = await this.supabase
      .from("users")
      .insert(row)
      .select()
      .single();

    if (error) throw new Error(`Supabase error creating user: ${error.message}`);
    return mapUserFromRow(inserted, false);
  }

  async updateUser(id: string, updates: Partial<User>, actorRole?: string): Promise<User> {
    if (actorRole && actorRole !== "SUPER_ADMIN") {
      throw new Error("Forbidden: Only Super Administrator can update accounts.");
    }

    const row = mapUserToRow({ ...updates, updatedAt: new Date().toISOString() });
    delete row.id;

    const { data: updated, error } = await this.supabase
      .from("users")
      .update(row)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`Supabase error updating user ${id}: ${error.message}`);
    return mapUserFromRow(updated, false);
  }

  async deleteUser(id: string, actorRole?: string): Promise<boolean> {
    if (actorRole && actorRole !== "SUPER_ADMIN") {
      throw new Error("Forbidden: Only Super Administrator can delete accounts.");
    }

    const user = await this.getUser(id);
    if (user?.role === "SUPER_ADMIN") {
      throw new Error("Forbidden: The Super Administrator account cannot be deleted.");
    }

    const { error } = await this.supabase.from("users").delete().eq("id", id);
    if (error) throw new Error(`Supabase error deleting user: ${error.message}`);
    return true;
  }

  async toggleUserStatus(id: string, actorRole?: string): Promise<User> {
    const user = await this.getUser(id);
    if (!user) throw new Error("User not found");
    if (user.role === "SUPER_ADMIN") {
      throw new Error("Forbidden: Super Administrator account status cannot be deactivated.");
    }

    const newStatus = user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    return this.updateUser(id, { status: newStatus }, actorRole);
  }

  async resetUserPassword(id: string, newPassword: string, actorRole?: string): Promise<boolean> {
    if (actorRole && actorRole !== "SUPER_ADMIN") {
      throw new Error("Forbidden: Only Super Administrator can reset user passwords.");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.updateUser(id, { passwordHash, mustChangePassword: true }, actorRole);
    return true;
  }

  async changePassword(userId: string, oldPass: string, newPass: string): Promise<{ success: boolean; user: User }> {
    const user = await this.getUser(userId, true);
    if (!user || !user.passwordHash) {
      throw new Error("User not found or credentials invalid.");
    }

    const valid = await bcrypt.compare(oldPass, user.passwordHash);
    if (!valid) {
      throw new Error("Current password verification failed.");
    }

    const newHash = await bcrypt.hash(newPass, 10);
    const updated = await this.updateUser(userId, { passwordHash: newHash, mustChangePassword: false });
    return { success: true, user: updated };
  }

  async verifyCredentialsAsync(username: string, password: string): Promise<User | null> {
    const user = await this.getUserByUsernameOrEmail(username, true);
    if (!user) {
      console.warn(`[login:credential-lookup] User '${username}' not found in database`);
      return null;
    }
    if (user.status !== "ACTIVE") {
      console.warn(`[login:credential-lookup] User '${username}' account status is '${user.status}' (not ACTIVE)`);
      return null;
    }
    if (!user.passwordHash) {
      console.warn(`[login:credential-lookup] User '${username}' has no password hash configured`);
      return null;
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      console.warn(`[login:password-verification] Password hash comparison failed for user '${username}'`);
      return null;
    }

    return mapUserFromRow(user, false);
  }

  async isSuperAdminInitialized(): Promise<boolean> {
    const { count, error } = await this.supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("role", "SUPER_ADMIN");

    if (error) return false;
    return (count || 0) > 0;
  }

  async getSuperAdmin(): Promise<User | undefined> {
    const { data } = await this.supabase
      .from("users")
      .select("*")
      .eq("role", "SUPER_ADMIN")
      .maybeSingle();

    return data ? mapUserFromRow(data, false) : undefined;
  }

  async setupInitialSuperAdmin(data: any): Promise<User> {
    const alreadyInit = await this.isSuperAdminInitialized();
    if (alreadyInit) {
      throw new Error("Super Administrator account is already initialized.");
    }

    return this.createUser({
      ...data,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      permissions: SUPER_ADMIN_PERMISSIONS,
      mustChangePassword: false,
    });
  }

  // ==========================================================================
  // SESSIONS
  // ==========================================================================
  async getSessions(filter?: { status?: string; userId?: string; search?: string }): Promise<UserSession[]> {
    let query = this.supabase
      .from("sessions")
      .select("*")
      .order("created_at", { ascending: false });

    if (filter?.status) {
      query = query.eq("status", filter.status);
    }
    if (filter?.userId) {
      query = query.eq("user_id", filter.userId);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Supabase error fetching sessions: ${error.message}`);
    let sessions = (data || []).map(mapSessionFromRow);
    if (filter?.search) {
      const s = filter.search.toLowerCase();
      sessions = sessions.filter(
        (sess) =>
          (sess.userName && sess.userName.toLowerCase().includes(s)) ||
          (sess.username && sess.username.toLowerCase().includes(s)) ||
          (sess.ipAddress && sess.ipAddress.includes(s))
      );
    }
    return sessions;
  }

  async getSession(id: string): Promise<UserSession | undefined> {
    const { data, error } = await this.supabase
      .from("sessions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) return undefined;
    return data ? mapSessionFromRow(data) : undefined;
  }

  async createSession(dataOrUserId: any, userAgent?: string, ipAddress?: string): Promise<UserSession> {
    const data = typeof dataOrUserId === "string"
      ? { userId: dataOrUserId, userAgent: userAgent || "Unknown", ipAddress: ipAddress || "127.0.0.1" }
      : dataOrUserId;

    const id = data.id || crypto.randomUUID();
    const session: UserSession = {
      ...data,
      id,
      userId: data.userId,
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      expiresAt: data.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const row = mapSessionToRow(session);
    const { data: inserted, error } = await this.supabase
      .from("sessions")
      .insert(row)
      .select()
      .single();

    if (error) throw new Error(`Supabase error creating session: ${error.message}`);
    return mapSessionFromRow(inserted);
  }

  async touchSession(id: string): Promise<void> {
    await this.supabase
      .from("sessions")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", id);
  }

  async deleteSession(id: string): Promise<void> {
    await this.supabase.from("sessions").delete().eq("id", id);
  }

  async rejectSession(id: string, actorOrName?: any): Promise<UserSession> {
    const actor = this.resolveActor(actorOrName);
    const { data, error } = await this.supabase
      .from("sessions")
      .update({
        status: "REJECTED",
        rejected_at: new Date().toISOString(),
        rejected_by: actor.name,
        rejected_by_user_id: actor.id !== "system" ? actor.id : null,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`Supabase error rejecting session: ${error.message}`);
    return mapSessionFromRow(data);
  }

  async markSessionSignedOut(sessionId: string): Promise<UserSession | null> {
    const { data, error } = await this.supabase
      .from("sessions")
      .update({ status: "SIGNED_OUT", last_activity_at: new Date().toISOString() })
      .eq("id", sessionId)
      .select()
      .maybeSingle();

    if (error) throw new Error(`Supabase error signing out session: ${error.message}`);
    return data ? mapSessionFromRow(data) : null;
  }

  // ==========================================================================
  // AUDIT LOGS & NOTIFICATIONS
  // ==========================================================================
  async recordAuditLog(log: any): Promise<AuditLog> {
    const actor = this.resolveActor(log.actor || {
      id: log.actorId,
      name: log.actorName,
      username: log.actorUsername,
      role: log.actorRole,
    });
    const id = log.id || crypto.randomUUID();
    const newLog: AuditLog = {
      ...log,
      id,
      actorId: actor.id,
      actorName: actor.name,
      actorUsername: actor.username || actor.name,
      actorRole: actor.role as any,
      createdAt: log.createdAt || new Date().toISOString(),
    };

    const row = mapAuditLogToRow({ ...newLog, actor });
    const { data: inserted, error } = await this.supabase
      .from("audit_logs")
      .insert(row)
      .select()
      .single();

    if (error) {
      console.error(`[SupabaseStore] Supabase error recording audit log: ${error.message}`, error);
      throw new Error(`Supabase error recording audit log: ${error.message}`);
    }
    return mapAuditLogFromRow(inserted);
  }

  async getAuditLogs(filters?: any): Promise<{ logs: AuditLog[]; totalCount: number }> {
    let query = this.supabase
      .from("audit_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (filters?.entityType) query = query.eq("entity_type", filters.entityType);
    if (filters?.entityId) query = query.eq("entity_id", filters.entityId);
    if (filters?.actorId) query = query.eq("actor_id", filters.actorId);
    if (filters?.limit) query = query.limit(filters.limit);

    const { data, count, error } = await query;
    if (error) throw new Error(`Supabase error fetching audit logs: ${error.message}`);

    return {
      logs: (data || []).map(mapAuditLogFromRow),
      totalCount: count || (data || []).length,
    };
  }

  async createActivityNotification(data: any): Promise<ActivityNotification> {
    const id = data.id || crypto.randomUUID();
    let userName = data.userName;
    let username = data.username;
    let role = data.role;

    if (data.userId && (!userName || !username || !role)) {
      const u = await this.getUser(data.userId);
      if (u) {
        if (!userName) userName = u.name;
        if (!username) username = u.username || u.email.split("@")[0];
        if (!role) role = u.role;
      }
    }

    const newNotif: ActivityNotification = {
      ...data,
      id,
      type: data.type || "SIGN_IN",
      sessionId: data.sessionId || crypto.randomUUID(),
      userName: userName || "System User",
      username: username || "system",
      role: role || "SUPER_ADMIN",
      isRead: false,
      isRejected: false,
      createdAt: new Date().toISOString(),
    };

    const row = mapNotificationToRow(newNotif);
    const { data: inserted, error } = await this.supabase
      .from("activity_notifications")
      .insert(row)
      .select()
      .single();

    if (error) throw new Error(`Supabase error creating notification: ${error.message}`);
    return mapNotificationFromRow(inserted);
  }

  async createNotification(data: any): Promise<ActivityNotification> {
    return this.createActivityNotification(data);
  }

  async getActivityNotifications(userId?: string, role?: string): Promise<ActivityNotification[]> {
    let query = this.supabase
      .from("activity_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    const { data, error } = await query;
    if (error) throw new Error(`Supabase error fetching notifications: ${error.message}`);
    return (data || []).map(mapNotificationFromRow);
  }

  async getNotifications(filter?: { unreadOnly?: boolean; limit?: number }): Promise<{
    notifications: ActivityNotification[];
    unreadCount: number;
  }> {
    let query = this.supabase
      .from("activity_notifications")
      .select("*")
      .order("created_at", { ascending: false });

    if (filter?.unreadOnly) {
      query = query.eq("is_read", false);
    }
    if (filter?.limit) {
      query = query.limit(filter.limit);
    } else {
      query = query.limit(50);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Supabase error fetching notifications: ${error.message}`);

    const { count } = await this.supabase
      .from("activity_notifications")
      .select("*", { count: "exact", head: true })
      .eq("is_read", false);

    return {
      notifications: (data || []).map(mapNotificationFromRow),
      unreadCount: count || 0,
    };
  }

  async markNotificationRead(id: string): Promise<boolean> {
    const { error } = await this.supabase
      .from("activity_notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", id);

    return !error;
  }

  async markNotificationsRead(notificationIds?: string[]): Promise<void> {
    const now = new Date().toISOString();
    let query = this.supabase
      .from("activity_notifications")
      .update({ is_read: true, read_at: now });

    if (notificationIds && notificationIds.length > 0) {
      query = query.in("id", notificationIds);
    } else {
      query = query.eq("is_read", false);
    }

    const { error } = await query;
    if (error) throw new Error(`Supabase error marking notifications read: ${error.message}`);
  }


  // ==========================================================================
  // DASHBOARD SUMMARY (Live Aggregated from Supabase)
  // ==========================================================================
  async getDashboardSummary(): Promise<any> {
    const [bills, quotations, products, payments] = await Promise.all([
      this.getBills(),
      this.getQuotations(),
      this.getProducts(),
      this.getPayments(),
    ]);

    const activeBills = bills.filter((b) => b.status !== "CLOSED" && b.status !== "CANCELLED");
    const overdueBills = bills.filter((b) => b.isOverdue);
    const totalRevenue = payments.reduce((sum, p) => sum + (p.isReversed ? 0 : Number(p.amount || 0)), 0);
    const totalOutstanding = activeBills.reduce((sum, b) => sum + Number(b.balanceDue || 0), 0);

    const totalOwnedStock = products.reduce((sum, p) => sum + Number(p.totalOwnedQuantity || 0), 0);
    const availableStock = products.reduce((sum, p) => sum + Number(p.availableQuantity || 0), 0);
    const rentedStock = products.reduce((sum, p) => sum + Number(p.rentedQuantity || 0), 0);

    return {
      totalBills: bills.length,
      totalQuotations: quotations.length,
      totalProducts: products.length,
      summaryCards: {
        activeRentalBills: activeBills.length,
        productsAwaitingReturn: rentedStock,
        overdueRentals: overdueBills.length,
        quotationsAwaitingCustomerResponse: quotations.filter((q) => q.status === "SENT" || q.status === "ISSUED").length,
        returnsAwaitingInspection: bills.filter((b) => b.status === "RETURN_INSPECTION").length,
        billsAwaitingPaymentOrClosure: bills.filter((b) => b.balanceDue > 0).length,
      },
      charts: {
        rentalStatusDistribution: {
          active: activeBills.length,
          returned: bills.filter((b) => b.status === "CLOSED").length,
          overdue: overdueBills.length,
          closed: bills.filter((b) => b.status === "CLOSED").length,
        },
        quotationWorkflow: {
          draft: quotations.filter((q) => q.status === "DRAFT").length,
          sent: quotations.filter((q) => q.status === "SENT").length,
          accepted: quotations.filter((q) => q.status === "ACCEPTED").length,
          rejected: quotations.filter((q) => q.status === "REJECTED").length,
          converted: quotations.filter((q) => q.status === "CONVERTED").length,
        },
        returnsAndInspection: {
          awaitingReturn: rentedStock,
          returnedGood: 0,
          damaged: products.reduce((sum, p) => sum + Number(p.damagedQuantity || 0), 0),
          missing: products.reduce((sum, p) => sum + Number(p.missingQuantity || 0), 0),
          awaitingDecision: 0,
        },
        paymentOverview: {
          paid: totalRevenue,
          partiallyPaid: bills.filter((b) => b.paymentStatus === "PARTIALLY_PAID").length,
          outstanding: totalOutstanding,
        },
        rentalActivityOverTime: [],
      },
      actionCenter: {
        overdueBills,
        productsAwaitingReturn: [],
        returnsAwaitingInspection: [],
        missingChargesAwaitingDecision: [],
        quotationsAwaitingAction: quotations.filter((q) => q.status === "ISSUED" || q.status === "SENT"),
        billsAwaitingPaymentOrClosure: bills.filter((b) => b.balanceDue > 0),
      },
      stats: {
        totalProducts: products.length,
        totalOwnedStock,
        availableStock,
        rentedStock,
        billsCount: bills.length,
        totalRevenue,
        totalOutstanding,
        securityDepositHeld: bills.reduce((sum, b) => sum + Number(b.securityDepositHeld || 0), 0),
        quotationsCount: quotations.length,
        quotesAwaitingApprovalCount: 0,
        quotesRequiringRevisionCount: quotations.filter((q) => q.status === "REQUIRES_REVISION").length,
        quotesAwaitingConversionCount: quotations.filter((q) => q.status === "ACCEPTED").length,
        billsOutOnRentCount: bills.filter((b) => b.status === "OUT_ON_RENT").length,
        billsDueTodayCount: 0,
        billsOverdueCount: overdueBills.length,
        billsPartiallyReturnedCount: bills.filter((b) => b.status === "PARTIALLY_RETURNED").length,
        billsAwaitingInspectionCount: bills.filter((b) => b.status === "RETURN_INSPECTION").length,
        billsPendingDamageDecisionsCount: 0,
        billsPendingSettlementCount: bills.filter((b) => b.status === "PENDING_SETTLEMENT").length,
        billsClosedCount: bills.filter((b) => b.status === "CLOSED").length,
      },
      operational: {
        quotesAwaitingApproval: [],
        quotesRequiringRevision: [],
        quotesAwaitingConversion: [],
        billsOutOnRent: [],
        billsDueToday: [],
        billsOverdue: [],
        billsPartiallyReturned: [],
        billsAwaitingInspection: [],
        billsPendingDamageDecisions: [],
        billsPendingSettlement: [],
        billsClosed: [],
      },
    };
  }
}

export const supabaseStore = new SupabaseStore();
export default supabaseStore;

