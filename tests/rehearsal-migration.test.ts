// ============================================================================
// TAMILNADU SUPPLIERS RENTAL ERP - FULL DISPOSABLE MIGRATION REHEARSAL
// File: tests/rehearsal-migration.test.ts
// Batch 6.5: End-to-end rehearsal against tns_disposable_rehearsal_2026
// ============================================================================

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { AUTHORITATIVE_TABLE_GRAPH, getTopologicalOrder } from "../scripts/migration/dependencyGraph";
import { InMemoryFixtureExtractor } from "../scripts/migration/extractor";
import { DataMigrator } from "../scripts/migration/migrator";
import { getTestDbConfig } from "./helpers/testDbConfig";
import { PostgresExecutor } from "../src/lib/db/postgresClient";
import { SupabaseStore } from "../src/lib/db/supabaseStore";

const testDb = getTestDbConfig();

const REHEARSAL_DB_NAME = "tns_disposable_rehearsal_2026";

// Construct the comprehensive 26-table representative synthetic dataset
function createRepresentativeDataset() {
  const companies = [
    {
      id: "comp-rehearsal-001",
      name: "Tamilnadu Suppliers Vellore",
      display_name: "TNS Vellore",
      gst_type: "GST_REGISTERED",
      gstin: "33AAAAA0000A1Z5",
      pan: "AAAAA0000A",
      address: "123 Katpadi Road, Vellore",
      state: "Tamil Nadu",
      state_code: "33",
      place_of_supply: "Vellore",
      email: "contact@tns-vellore.local",
      phone: "9842300001",
      bank_name: "City Union Bank",
      bank_account_no: "50010101010101",
      bank_ifsc: "CIUB0000065",
      bank_branch: "Katpadi",
      invoice_prefix: "TNS-",
      quotation_prefix: "TNQ-",
      gate_pass_prefix: "TNGP-",
      next_invoice_no: 1,
      next_quotation_no: 1,
      next_gate_pass_no: 1,
      terms_and_conditions: "Standard Rental Terms",
      authorized_signatory_title: "Proprietor",
      is_active: true,
      created_at: "2026-10-01T09:00:00.000Z",
      updated_at: "2026-10-01T09:00:00.000Z",
    },
    {
      id: "comp-rehearsal-002",
      name: "Tamilnadu Suppliers Chennai",
      display_name: "TNS Chennai",
      gst_type: "GST_REGISTERED",
      gstin: "33BBBBB0000B1Z6",
      pan: "BBBBB0000B",
      address: "45 Anna Salai, Chennai",
      state: "Tamil Nadu",
      state_code: "33",
      place_of_supply: "Chennai",
      email: "chennai@tns.local",
      phone: "9842300099",
      bank_name: "Indian Bank",
      bank_account_no: "60020202020202",
      bank_ifsc: "IDIB0000012",
      bank_branch: "Anna Salai",
      invoice_prefix: "TNSC-",
      quotation_prefix: "TNQC-",
      gate_pass_prefix: "TNGPC-",
      next_invoice_no: 1,
      next_quotation_no: 1,
      next_gate_pass_no: 1,
      terms_and_conditions: "Standard Rental Terms",
      authorized_signatory_title: "Branch Manager",
      is_active: true,
      created_at: "2026-10-01T09:00:00.000Z",
      updated_at: "2026-10-01T09:00:00.000Z",
    },
  ];

  const users = [
    {
      id: "user-rehearsal-admin",
      email: "admin@tns.local",
      username: "tns_admin",
      phone: "9842300002",
      name: "Admin Officer",
      password_hash: "$2a$10$abcdefghijklmnopqrstuvwxyz123456",
      role: "ADMIN",
      status: "ACTIVE",
      permissions: ["all"],
      created_at: "2026-10-01T09:00:00.000Z",
    },
    {
      id: "user-rehearsal-billing",
      email: "billing@tns.local",
      username: "tns_billing",
      phone: "9842300003",
      name: "Billing Clerk",
      password_hash: "$2a$10$abcdefghijklmnopqrstuvwxyz123456",
      role: "BILLING",
      status: "ACTIVE",
      permissions: ["bills:create", "payments:record"],
      created_at: "2026-10-01T09:00:00.000Z",
    },
    {
      id: "user-rehearsal-staff",
      email: "staff@tns.local",
      username: "tns_staff",
      phone: "9842300004",
      name: "Warehouse Staff",
      password_hash: "$2a$10$abcdefghijklmnopqrstuvwxyz123456",
      role: "EMPLOYEE",
      status: "ACTIVE",
      permissions: ["operations:dispatch", "operations:return"],
      created_at: "2026-10-01T09:00:00.000Z",
    },
  ];

  const customers = [
    {
      id: "cust-rehearsal-001",
      name: "Vellore Event Planners Pvt Ltd",
      contact_person: "K. Kumar",
      mobile: "9842300010",
      phone: "9842300010",
      billing_address: "45 Gandhi Road, Vellore",
      gstin: "33BBBBB1111B1Z2",
      state: "Tamil Nadu",
      postal_code: "632001",
      is_active: true,
      branches: [],
      created_at: "2026-10-01T09:00:00.000Z",
    },
    {
      id: "cust-rehearsal-002",
      name: "Arcot Wedding Decorators",
      contact_person: "M. Suresh",
      mobile: "9842300020",
      phone: "9842300020",
      billing_address: "12 Bazaar Street, Arcot",
      gstin: null,
      state: "Tamil Nadu",
      postal_code: "632503",
      is_active: true,
      branches: [],
      created_at: "2026-10-01T09:00:00.000Z",
    },
  ];

  const customer_branches = [
    {
      id: "cb-rehearsal-001",
      customer_id: "cust-rehearsal-001",
      branch_name: "Main Mandapam Site",
      contact_person: "K. Kumar",
      phone: "9842300010",
      address: "Katpadi Kalyana Mandapam, Vellore",
      created_at: "2026-10-01T09:00:00.000Z",
    },
    {
      id: "cb-rehearsal-002",
      customer_id: "cust-rehearsal-002",
      branch_name: "Arcot Palace Site",
      contact_person: "M. Suresh",
      phone: "9842300020",
      address: "Arcot Palace Hall, Arcot",
      created_at: "2026-10-01T09:00:00.000Z",
    },
  ];

  const categories = [
    {
      id: "cat-rehearsal-generators",
      name: "Power Generators",
      code: "GEN",
      parent_id: null,
      is_active: true,
      created_at: "2026-10-01T09:00:00.000Z",
    },
    {
      id: "cat-rehearsal-generators-diesel",
      name: "Diesel Generators",
      code: "DG",
      parent_id: "cat-rehearsal-generators", // Self-referencing FK
      is_active: true,
      created_at: "2026-10-01T09:00:00.000Z",
    },
    {
      id: "cat-rehearsal-lighting",
      name: "Stage Lighting",
      code: "LGT",
      parent_id: null,
      is_active: true,
      created_at: "2026-10-01T09:00:00.000Z",
    },
  ];

  const products = [
    {
      id: "prod-rehearsal-gen-5kva",
      name: "Silent Diesel Generator 5kVA",
      sku: "DG-5KVA",
      category_id: "cat-rehearsal-generators-diesel",
      category_name: "Diesel Generators",
      unit: "Nos",
      default_rental_rate: "2500.00",
      rental_rate_unit: "PER_DAY",
      min_rental_duration: 1,
      security_deposit_amount: "5000.00",
      replacement_value: "85000.00",
      total_owned_quantity: 10,
      available_quantity: 6,
      reserved_quantity: 0,
      rented_quantity: 3,
      damaged_quantity: 0,
      missing_quantity: 0,
      maintenance_quantity: 1,
      is_active: true,
      created_at: "2026-10-01T09:00:00.000Z",
    },
    {
      id: "prod-rehearsal-light-100w",
      name: "LED Floodlight 100W",
      sku: "LED-100W",
      category_id: "cat-rehearsal-lighting",
      category_name: "Stage Lighting",
      unit: "Nos",
      default_rental_rate: "400.00",
      rental_rate_unit: "PER_DAY",
      min_rental_duration: 1,
      security_deposit_amount: "1000.00",
      replacement_value: "4500.00",
      total_owned_quantity: 50,
      available_quantity: 35,
      reserved_quantity: 0,
      rented_quantity: 15,
      damaged_quantity: 0,
      missing_quantity: 0,
      maintenance_quantity: 0,
      is_active: true,
      created_at: "2026-10-01T09:00:00.000Z",
    },
  ];

  const product_imports = [
    {
      id: "pi-rehearsal-001",
      filename: "initial_products_2026.csv",
      total_rows: 2,
      imported_count: 2,
      skipped_count: 0,
      errors: [],
      created_by: "user-rehearsal-admin",
      created_at: "2026-10-01T09:00:00.000Z",
    },
  ];

  const sessions = [
    {
      id: "sess-rehearsal-001",
      user_id: "user-rehearsal-admin",
      token: "dummy-legacy-session-token",
      expires_at: "2026-11-01T00:00:00.000Z",
      is_active: true,
      created_at: "2026-10-01T09:00:00.000Z",
    },
  ];

  const login_rate_limits = [
    {
      key: "login:127.0.0.1:admin",
      attempts: 1,
      window_start: "2026-10-27T10:00:00.000Z",
      locked_until: null,
    },
  ];

  const activity_notifications = [
    {
      id: "notif-rehearsal-001",
      user_id: "user-rehearsal-admin",
      user_name: "Admin Officer",
      username: "tns_admin",
      role: "ADMIN",
      session_id: "sess-rehearsal-001",
      type: "INFO",
      title: "System Ready",
      message: "Synthetic Rehearsal Notification",
      is_read: false,
      created_at: "2026-10-01T09:00:00.000Z",
    },
  ];

  const audit_logs = [
    {
      id: "audit-rehearsal-001",
      entity_type: "COMPANY",
      entity_id: "comp-rehearsal-001",
      entity_number: "TNS-001",
      customer_name: "System",
      action: "CREATE",
      action_label: "Company Created",
      actor_id: "user-rehearsal-admin",
      actor_name: "Admin Officer",
      actor_role: "ADMIN",
      details: { note: "Initial setup" },
      created_at: "2026-10-01T09:00:00.000Z",
    },
  ];

  const whatsapp_logs = [
    {
      id: "walog-rehearsal-001",
      document_type: "QUOTATION",
      document_id: "quot-rehearsal-001",
      document_number: "TNQ-0001",
      recipient_phone: "9842300010",
      recipient_name: "K. Kumar",
      share_method: "HANDOFF_WEB",
      status: "SENT",
      message_payload: "Your Quotation TNQ-0001 is ready.",
      created_by: "user-rehearsal-admin",
      created_at: "2026-10-20T10:00:00.000Z",
    },
  ];

  const quotations = [
    {
      id: "quot-rehearsal-001",
      quotation_number: "TNQ-0001",
      company_id: "comp-rehearsal-001",
      company_snapshot: { name: "TNS Vellore" },
      customer_id: "cust-rehearsal-001",
      customer_name: "Vellore Event Planners Pvt Ltd",
      customer_phone: "9842300010",
      customer_address: "45 Gandhi Road, Vellore",
      quotation_date: "2026-10-20",
      rental_start_date: "2026-10-25",
      rental_end_date: "2026-10-27",
      rental_days: 2,
      status: "CONVERTED",
      tax_type: "GST",
      subtotal: "9000.00",
      total_tax: "1620.00",
      discount_amount: "500.00",
      grand_total: "10120.00",
      advance_required: "3000.00",
      amount_in_words: "Ten Thousand One Hundred Twenty Rupees",
      converted_bill_id: "bill-rehearsal-001",
      converted_bill_number: "TNS-0001",
      created_by: "user-rehearsal-admin",
      created_at: "2026-10-20T10:00:00.000Z",
      updated_at: "2026-10-20T10:00:00.000Z",
    },
    {
      id: "quot-rehearsal-002",
      quotation_number: "TNQ-0002",
      company_id: "comp-rehearsal-001",
      company_snapshot: { name: "TNS Vellore" },
      customer_id: "cust-rehearsal-002",
      customer_name: "Arcot Wedding Decorators",
      customer_phone: "9842300020",
      customer_address: "12 Bazaar Street, Arcot",
      quotation_date: "2026-10-26",
      rental_start_date: "2026-10-28",
      rental_end_date: "2026-10-30",
      rental_days: 2,
      status: "ISSUED",
      tax_type: "GST",
      subtotal: "5000.00",
      total_tax: "900.00",
      discount_amount: "0.00",
      grand_total: "5900.00",
      advance_required: "2000.00",
      amount_in_words: "Five Thousand Nine Hundred Rupees",
      created_by: "user-rehearsal-admin",
      created_at: "2026-10-26T10:00:00.000Z",
      updated_at: "2026-10-26T10:00:00.000Z",
    },
  ];

  const quotation_branches = [
    {
      id: "qb-rehearsal-001",
      quotation_id: "quot-rehearsal-001",
      customer_branch_id: "cb-rehearsal-001",
      branch_name: "Main Mandapam Site",
      delivery_address: "Katpadi Kalyana Mandapam, Vellore",
      section_order: 1,
      branch_subtotal: "9000.00",
      created_at: "2026-10-20T10:00:00.000Z",
    },
    {
      id: "qb-rehearsal-002",
      quotation_id: "quot-rehearsal-002",
      customer_branch_id: "cb-rehearsal-002",
      branch_name: "Arcot Palace Site",
      delivery_address: "Arcot Palace Hall, Arcot",
      section_order: 1,
      branch_subtotal: "5000.00",
      created_at: "2026-10-26T10:00:00.000Z",
    },
  ];

  const quotation_items = [
    {
      id: "qi-rehearsal-001",
      quotation_branch_id: "qb-rehearsal-001",
      quotation_id: "quot-rehearsal-001",
      product_id: "prod-rehearsal-gen-5kva",
      item_name: "Silent Diesel Generator 5kVA",
      quantity: 1,
      days: 2,
      unit_price: "2500.00",
      amount: "5000.00",
      entry_type: "product",
      position: 1,
      created_at: "2026-10-20T10:00:00.000Z",
    },
    {
      id: "qi-rehearsal-002",
      quotation_branch_id: "qb-rehearsal-001",
      quotation_id: "quot-rehearsal-001",
      product_id: "prod-rehearsal-light-100w",
      item_name: "LED Floodlight 100W",
      quantity: 5,
      days: 2,
      unit_price: "400.00",
      amount: "4000.00",
      entry_type: "product",
      position: 2,
      created_at: "2026-10-20T10:00:00.000Z",
    },
    {
      id: "qi-rehearsal-003",
      quotation_branch_id: "qb-rehearsal-001",
      quotation_id: "quot-rehearsal-001",
      product_id: null,
      item_name: "Note",
      quantity: 0,
      days: 0,
      unit_price: "0.00",
      amount: "0.00",
      entry_type: "note",
      text: "Includes operator and diesel delivery",
      position: 3,
      created_at: "2026-10-20T10:00:00.000Z",
    },
    {
      id: "qi-rehearsal-004",
      quotation_branch_id: "qb-rehearsal-002",
      quotation_id: "quot-rehearsal-002",
      product_id: "prod-rehearsal-gen-5kva",
      item_name: "Silent Diesel Generator 5kVA",
      quantity: 1,
      days: 2,
      unit_price: "2500.00",
      amount: "5000.00",
      entry_type: "product",
      position: 1,
      created_at: "2026-10-26T10:00:00.000Z",
    },
  ];

  const bills = [
    {
      id: "bill-rehearsal-001",
      bill_number: "TNS-0001",
      company_id: "comp-rehearsal-001",
      company_snapshot: { name: "TNS Vellore" },
      source_quotation_id: "quot-rehearsal-001",
      customer_id: "cust-rehearsal-001",
      customer_name: "Vellore Event Planners Pvt Ltd",
      customer_phone: "9842300010",
      customer_address: "45 Gandhi Road, Vellore",
      bill_date: "2026-10-21",
      rental_start_date: "2026-10-25",
      rental_end_date: "2026-10-27",
      rental_days: 2,
      status: "PAID",
      tax_type: "GST",
      subtotal: "9000.00",
      total_tax: "1620.00",
      discount_amount: "500.00",
      grand_total: "10120.00",
      advance_paid: "3000.00",
      amount_paid: "7120.00",
      balance_due: "0.00",
      amount_in_words: "Ten Thousand One Hundred Twenty Rupees",
      payment_status: "FULLY_PAID",
      created_by: "user-rehearsal-admin",
      created_at: "2026-10-21T10:00:00.000Z",
      updated_at: "2026-10-27T16:00:00.000Z",
    },
    {
      id: "bill-rehearsal-002",
      bill_number: "TNS-0002",
      company_id: "comp-rehearsal-001",
      company_snapshot: { name: "TNS Vellore" },
      source_quotation_id: null,
      customer_id: "cust-rehearsal-002",
      customer_name: "Arcot Wedding Decorators",
      customer_phone: "9842300020",
      customer_address: "12 Bazaar Street, Arcot",
      bill_date: "2026-10-22",
      rental_start_date: "2026-10-26",
      rental_end_date: "2026-10-28",
      rental_days: 2,
      status: "PARTIALLY_PAID",
      tax_type: "GST",
      subtotal: "8000.00",
      total_tax: "1440.00",
      discount_amount: "0.00",
      grand_total: "9440.00",
      advance_paid: "2000.00",
      amount_paid: "3000.00",
      balance_due: "4440.00",
      amount_in_words: "Nine Thousand Four Hundred Forty Rupees",
      payment_status: "PARTIALLY_PAID",
      created_by: "user-rehearsal-admin",
      created_at: "2026-10-22T10:00:00.000Z",
      updated_at: "2026-10-26T14:00:00.000Z",
    },
  ];

  const bill_branches = [
    {
      id: "bb-rehearsal-001",
      bill_id: "bill-rehearsal-001",
      customer_branch_id: "cb-rehearsal-001",
      branch_name: "Main Mandapam Site",
      delivery_address: "Katpadi Kalyana Mandapam, Vellore",
      section_order: 1,
      branch_subtotal: "9000.00",
      created_at: "2026-10-21T10:00:00.000Z",
    },
    {
      id: "bb-rehearsal-002",
      bill_id: "bill-rehearsal-002",
      customer_branch_id: "cb-rehearsal-002",
      branch_name: "Arcot Palace Site",
      delivery_address: "Arcot Palace Hall, Arcot",
      section_order: 1,
      branch_subtotal: "8000.00",
      created_at: "2026-10-22T10:00:00.000Z",
    },
  ];

  const bill_items = [
    {
      id: "bi-rehearsal-001",
      bill_branch_id: "bb-rehearsal-001",
      bill_id: "bill-rehearsal-001",
      product_id: "prod-rehearsal-gen-5kva",
      item_name: "Silent Diesel Generator 5kVA",
      quantity: 1,
      days: 2,
      unit_price: "2500.00",
      amount: "5000.00",
      entry_type: "product",
      position: 1,
      quantity_physically_returned: 1,
      created_at: "2026-10-21T10:00:00.000Z",
    },
    {
      id: "bi-rehearsal-002",
      bill_branch_id: "bb-rehearsal-001",
      bill_id: "bill-rehearsal-001",
      product_id: "prod-rehearsal-light-100w",
      item_name: "LED Floodlight 100W",
      quantity: 5,
      days: 2,
      unit_price: "400.00",
      amount: "4000.00",
      entry_type: "product",
      position: 2,
      quantity_physically_returned: 5,
      created_at: "2026-10-21T10:00:00.000Z",
    },
    {
      id: "bi-rehearsal-003",
      bill_branch_id: "bb-rehearsal-001",
      bill_id: "bill-rehearsal-001",
      product_id: null,
      item_name: "Note",
      quantity: 0,
      days: 0,
      unit_price: "0.00",
      amount: "0.00",
      entry_type: "note",
      text: "Includes delivery and pickup",
      position: 3,
      quantity_physically_returned: 0,
      created_at: "2026-10-21T10:00:00.000Z",
    },
    {
      id: "bi-rehearsal-004",
      bill_branch_id: "bb-rehearsal-002",
      bill_id: "bill-rehearsal-002",
      product_id: "prod-rehearsal-light-100w",
      item_name: "LED Floodlight 100W",
      quantity: 10,
      days: 2,
      unit_price: "400.00",
      amount: "8000.00",
      entry_type: "product",
      position: 1,
      quantity_physically_returned: 0,
      created_at: "2026-10-22T10:00:00.000Z",
    },
  ];

  const payments = [
    {
      id: "pay-rehearsal-001",
      payment_number: "PAY-0001",
      company_id: "comp-rehearsal-001",
      bill_id: "bill-rehearsal-001",
      customer_id: "cust-rehearsal-001",
      payment_date: "2026-10-21",
      amount: "3000.00",
      payment_method: "CASH",
      payment_type: "ADVANCE",
      is_reversed: false,
      created_by: "user-rehearsal-admin",
      created_at: "2026-10-21T10:00:00.000Z",
    },
    {
      id: "pay-rehearsal-002",
      payment_number: "PAY-0002",
      company_id: "comp-rehearsal-001",
      bill_id: "bill-rehearsal-001",
      customer_id: "cust-rehearsal-001",
      payment_date: "2026-10-27",
      amount: "7120.00",
      payment_method: "BANK_TRANSFER",
      payment_type: "RENTAL_PAYMENT",
      is_reversed: false,
      created_by: "user-rehearsal-admin",
      created_at: "2026-10-27T16:00:00.000Z",
    },
    {
      id: "pay-rehearsal-003",
      payment_number: "PAY-0003",
      company_id: "comp-rehearsal-001",
      bill_id: "bill-rehearsal-002",
      customer_id: "cust-rehearsal-002",
      payment_date: "2026-10-22",
      amount: "2000.00",
      payment_method: "UPI",
      payment_type: "ADVANCE",
      is_reversed: false,
      created_by: "user-rehearsal-admin",
      created_at: "2026-10-22T11:00:00.000Z",
    },
    {
      id: "pay-rehearsal-004",
      payment_number: "PAY-0004",
      company_id: "comp-rehearsal-001",
      bill_id: "bill-rehearsal-002",
      customer_id: "cust-rehearsal-002",
      payment_date: "2026-10-26",
      amount: "3000.00",
      payment_method: "UPI",
      payment_type: "RENTAL_PAYMENT",
      is_reversed: false,
      created_by: "user-rehearsal-admin",
      created_at: "2026-10-26T14:00:00.000Z",
    },
  ];

  const reservations = [
    {
      id: "res-rehearsal-001",
      reservation_number: "RES-0001",
      company_id: "comp-rehearsal-001",
      quotation_id: "quot-rehearsal-001",
      bill_id: "bill-rehearsal-001",
      customer_id: "cust-rehearsal-001",
      rental_start_date: "2026-10-25",
      rental_end_date: "2026-10-27",
      status: "COMPLETED",
      created_by: "user-rehearsal-admin",
      created_at: "2026-10-20T10:00:00.000Z",
    },
  ];

  const reservation_items = [
    {
      id: "resi-rehearsal-001",
      reservation_id: "res-rehearsal-001",
      product_id: "prod-rehearsal-gen-5kva",
      quantity_reserved: 1,
      quantity_dispatched: 1,
      quantity_returned: 1,
      created_at: "2026-10-20T10:00:00.000Z",
    },
  ];

  const gate_passes = [
    {
      id: "gp-rehearsal-001",
      gate_pass_number: "TNGP-0001",
      company_id: "comp-rehearsal-001",
      company_snapshot: { name: "TNS Vellore" },
      customer_id: "cust-rehearsal-001",
      customer_name: "Vellore Event Planners Pvt Ltd",
      destination_branch: "Main Mandapam Site",
      destination_address: "Katpadi Kalyana Mandapam, Vellore",
      reservation_id: "res-rehearsal-001",
      bill_id: "bill-rehearsal-001",
      dispatch_date: "2026-10-25T08:00:00.000Z",
      expected_return_date: "2026-10-27",
      vehicle_number: "TN-23-AB-1234",
      driver_name: "Ramesh",
      driver_phone: "9842399999",
      authorized_by: "Store Manager",
      status: "RETURNED",
      created_by: "user-rehearsal-admin",
      created_at: "2026-10-25T08:00:00.000Z",
    },
  ];

  const gate_pass_items = [
    {
      id: "gpi-rehearsal-001",
      gate_pass_id: "gp-rehearsal-001",
      product_id: "prod-rehearsal-gen-5kva",
      item_name: "Silent Diesel Generator 5kVA",
      quantity_dispatched: 1,
      quantity_returned: 1,
      quantity_damaged: 0,
      quantity_missing: 0,
      created_at: "2026-10-25T08:00:00.000Z",
    },
    {
      id: "gpi-rehearsal-002",
      gate_pass_id: "gp-rehearsal-001",
      product_id: "prod-rehearsal-light-100w",
      item_name: "LED Floodlight 100W",
      quantity_dispatched: 5,
      quantity_returned: 5,
      quantity_damaged: 0,
      quantity_missing: 0,
      created_at: "2026-10-25T08:00:00.000Z",
    },
  ];

  const returns = [
    {
      id: "ret-rehearsal-001",
      return_number: "RET-0001",
      company_id: "comp-rehearsal-001",
      gate_pass_id: "gp-rehearsal-001",
      customer_id: "cust-rehearsal-001",
      return_date: "2026-10-27T15:00:00.000Z",
      inspected_by: "Store Manager",
      damage_charges: "0.00",
      notes: "Returned on schedule in good condition",
      created_by: "user-rehearsal-admin",
      created_at: "2026-10-27T15:00:00.000Z",
    },
  ];

  const return_items = [
    {
      id: "ri-rehearsal-001",
      return_id: "ret-rehearsal-001",
      gate_pass_item_id: "gpi-rehearsal-001",
      product_id: "prod-rehearsal-gen-5kva",
      item_name: "Silent Diesel Generator 5kVA",
      quantity_expected: 1,
      quantity_returned_good: 1,
      quantity_damaged: 0,
      quantity_missing: 0,
      damage_notes: "Good working condition",
      created_at: "2026-10-27T15:00:00.000Z",
    },
    {
      id: "ri-rehearsal-002",
      return_id: "ret-rehearsal-001",
      gate_pass_item_id: "gpi-rehearsal-002",
      product_id: "prod-rehearsal-light-100w",
      item_name: "LED Floodlight 100W",
      quantity_expected: 5,
      quantity_returned_good: 5,
      quantity_damaged: 0,
      quantity_missing: 0,
      damage_notes: "All tested and functional",
      created_at: "2026-10-27T15:00:00.000Z",
    },
  ];

  const inventory_movements = [
    {
      id: "im-rehearsal-001",
      product_id: "prod-rehearsal-gen-5kva",
      movement_type: "DISPATCH",
      quantity_change: -1,
      reference_type: "GATE_PASS",
      reference_id: "gp-rehearsal-001",
      balance_after: 6,
      notes: "Dispatched under TNGP-0001",
      created_by: "user-rehearsal-admin",
      created_at: "2026-10-25T08:00:00.000Z",
    },
    {
      id: "im-rehearsal-002",
      product_id: "prod-rehearsal-light-100w",
      movement_type: "DISPATCH",
      quantity_change: -5,
      reference_type: "GATE_PASS",
      reference_id: "gp-rehearsal-001",
      balance_after: 35,
      notes: "Dispatched under TNGP-0001",
      created_by: "user-rehearsal-admin",
      created_at: "2026-10-25T08:00:00.000Z",
    },
    {
      id: "im-rehearsal-003",
      product_id: "prod-rehearsal-gen-5kva",
      movement_type: "RETURN_GOOD",
      quantity_change: 1,
      reference_type: "RETURN",
      reference_id: "ret-rehearsal-001",
      balance_after: 7,
      notes: "Returned under RET-0001",
      created_by: "user-rehearsal-admin",
      created_at: "2026-10-27T15:00:00.000Z",
    },
    {
      id: "im-rehearsal-004",
      product_id: "prod-rehearsal-light-100w",
      movement_type: "RETURN_GOOD",
      quantity_change: 5,
      reference_type: "RETURN",
      reference_id: "ret-rehearsal-001",
      balance_after: 40,
      notes: "Returned under RET-0001",
      created_by: "user-rehearsal-admin",
      created_at: "2026-10-27T15:00:00.000Z",
    },
  ];

  return {
    companies,
    users,
    customers,
    customer_branches,
    categories,
    products,
    product_imports,
    sessions,
    login_rate_limits,
    activity_notifications,
    audit_logs,
    whatsapp_logs,
    quotations,
    quotation_branches,
    quotation_items,
    bills,
    bill_branches,
    bill_items,
    payments,
    reservations,
    reservation_items,
    gate_passes,
    gate_pass_items,
    returns,
    return_items,
    inventory_movements,
  };
}

describe("Batch 6.5 — Full Disposable Migration Rehearsal", { skip: !testDb.isConfigured ? testDb.skipReason : false }, () => {
  let targetPool: Pool;
  let testPool: Pool;

  const targetConfig = {
    host: testDb.config!.host,
    port: testDb.config!.port,
    database: REHEARSAL_DB_NAME,
    user: testDb.config!.user,
    password: testDb.config!.password,
  };

  before(async () => {
    targetPool = new Pool(targetConfig);
    testPool = new Pool(testDb.getPoolConfig());
  });

  after(async () => {
    if (targetPool) await targetPool.end();
    if (testPool) await testPool.end();
  });

  // ==========================================================================
  // SECTION 2: PREFLIGHT VERIFICATION
  // ==========================================================================
  describe("1. Preflight Safety & Environment Isolation", () => {
    it("confirms target connection resolves strictly to local loopback", async () => {
      const res = await targetPool.query(`
        SELECT host(inet_server_addr())::text AS server_addr, current_database() AS current_db, current_user AS current_user;
      `);
      assert.equal(res.rows[0].current_db, REHEARSAL_DB_NAME);
      assert.equal(res.rows[0].current_user, testDb.config!.user);
      assert.equal(res.rows[0].server_addr, "127.0.0.1");
    });

    it("confirms test database tns_disposable_test_2026 is completely isolated and preserved", async () => {
      const res = await testPool.query(`SELECT current_database() as db;`);
      assert.equal(res.rows[0].db, testDb.config!.database);
      assert.notEqual(res.rows[0].db, REHEARSAL_DB_NAME);
    });

    it("verifies rehearsal target database has all 26 public schema tables initialized", async () => {
      const res = await targetPool.query(`
        SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
      `);
      const targetTables = res.rows.map((r) => r.table_name);
      assert.equal(targetTables.length, 26);
      for (const t of AUTHORITATIVE_TABLE_GRAPH) {
        assert.ok(targetTables.includes(t.name), `Target must contain table '${t.name}'`);
      }
    });

    it("verifies rehearsal target database is initially 100% empty (0 rows across all 26 tables)", async () => {
      let totalRows = 0;
      for (const t of AUTHORITATIVE_TABLE_GRAPH) {
        const c = await targetPool.query(`SELECT COUNT(*)::int as cnt FROM public."${t.name}";`);
        totalRows += c.rows[0].cnt;
      }
      assert.equal(totalRows, 0, "Target rehearsal database must be completely empty prior to rehearsal");
    });
  });

  // ==========================================================================
  // SECTION 3: REPRESENTATIVE SYNTHETIC DATASET INTEGRITY
  // ==========================================================================
  describe("2. Representative Synthetic Dataset Integrity", () => {
    it("dataset includes records for all 26 schema tables", () => {
      const dataset = createRepresentativeDataset();
      const keys = Object.keys(dataset);
      assert.equal(keys.length, 26);
      for (const t of AUTHORITATIVE_TABLE_GRAPH) {
        assert.ok(keys.includes(t.name), `Dataset must contain table '${t.name}'`);
        assert.ok((dataset as any)[t.name].length > 0, `Table '${t.name}' must have at least 1 record`);
      }
    });

    it("preserves foreign key relationships across all parent-child tiers", () => {
      const dataset = createRepresentativeDataset();
      const companyIds = dataset.companies.map((c) => c.id);
      const userIds = dataset.users.map((u) => u.id);
      const customerIds = dataset.customers.map((c) => c.id);

      assert.ok(companyIds.includes(dataset.quotations[0].company_id));
      assert.ok(userIds.includes(dataset.quotations[0].created_by));
      assert.ok(customerIds.includes(dataset.quotations[0].customer_id));
      assert.ok(dataset.bills.some((b) => b.source_quotation_id === dataset.quotations[0].id));
      assert.ok(dataset.gate_passes.some((gp) => gp.bill_id === dataset.bills[0].id));
      assert.ok(dataset.returns.some((r) => r.gate_pass_id === dataset.gate_passes[0].id));
    });
  });

  // ==========================================================================
  // SECTION 4: DRY-RUN FIRST EXECUTION
  // ==========================================================================
  describe("3. Dry-Run Mode Simulation & Zero-Mutation Rollback", () => {
    it("processes all 26 tables, executes keyset pagination, and rolls back with zero mutated records", async () => {
      const dataset = createRepresentativeDataset();
      const extractor = new InMemoryFixtureExtractor(dataset);

      const migrator = new DataMigrator(
        {
          mode: "dry-run",
          source: { type: "supabase-api", url: "https://synthetic-source.local", serviceRoleKey: "dummy" },
          target: targetConfig,
          options: {
            batchSize: 2, // Force keyset pagination across batches of 2!
            skipSessions: true,
          },
        },
        extractor
      );

      const result = await migrator.execute();
      assert.ok(result.success, "Dry-run should report success");
      assert.equal(result.report?.overallStatus, "PASSED");
      assert.equal(result.report?.financialReconciliation?.isBalanced, true);
      assert.equal(result.report?.financialReconciliation?.grandTotalDiscrepancy, "0.00");
      assert.equal(result.report?.financialReconciliation?.balanceDiscrepancy, "0.00");
      assert.equal(result.report?.orphanCheck.length, 0);

      // Verify that after dry-run, target database remains 100% empty
      let totalRowsAfter = 0;
      for (const t of AUTHORITATIVE_TABLE_GRAPH) {
        const c = await targetPool.query(`SELECT COUNT(*)::int as cnt FROM public."${t.name}";`);
        totalRowsAfter += c.rows[0].cnt;
      }
      assert.equal(totalRowsAfter, 0, "Dry-run must leave ZERO rows committed on target database");
      await migrator.close();
    });
  });

  // ==========================================================================
  // SECTION 6: FAILURE INJECTION & RECOVERY
  // ==========================================================================
  describe("4. Failure Injection & Atomic Rollback Recovery", () => {
    it("Test 4.1: Source extraction error aborts cleanly without database writes", async () => {
      const brokenExtractor = {
        inspectSchema: async () => ({ accessible: true, tables: ["companies"] }),
        extractTable: async () => {
          throw new Error("INJECTED_EXTRACTION_FAILURE: Network timeout reading source");
        },
        close: async () => {},
      };

      const migrator = new DataMigrator(
        {
          mode: "dry-run",
          source: { type: "supabase-api", url: "https://synthetic-source.local", serviceRoleKey: "dummy" },
          target: targetConfig,
        },
        brokenExtractor as any
      );

      await assert.rejects(
        () => migrator.execute(),
        /INJECTED_EXTRACTION_FAILURE/
      );

      const check = await targetPool.query("SELECT COUNT(*)::int as cnt FROM public.companies;");
      assert.equal(check.rows[0].cnt, 0);
      await migrator.close();
    });

    it("Test 4.2: Transformation error on malformed decimal aborts before target writes", async () => {
      const dataset = createRepresentativeDataset();
      // Inject corrupted numeric value in bill grand_total
      (dataset.bills[0] as any).grand_total = "NOT_A_NUMBER";

      const extractor = new InMemoryFixtureExtractor(dataset);
      const migrator = new DataMigrator(
        {
          mode: "dry-run",
          source: { type: "supabase-api", url: "https://synthetic-source.local", serviceRoleKey: "dummy" },
          target: targetConfig,
        },
        extractor
      );

      await assert.rejects(
        () => migrator.execute(),
        /DRY-RUN VALIDATION ERROR.*invalid numeric representation/
      );

      const check = await targetPool.query("SELECT COUNT(*)::int as cnt FROM public.bills;");
      assert.equal(check.rows[0].cnt, 0);
      await migrator.close();
    });

    it("Test 4.3: Foreign key constraint violation triggers clean transaction rollback", async () => {
      const dataset = createRepresentativeDataset();
      // Inject non-existent company_id on bill
      dataset.bills[0].company_id = "non-existent-company-uuid";

      const extractor = new InMemoryFixtureExtractor(dataset);
      const migrator = new DataMigrator(
        {
          mode: "dry-run",
          source: { type: "supabase-api", url: "https://synthetic-source.local", serviceRoleKey: "dummy" },
          target: targetConfig,
          options: { stopOnError: true },
        },
        extractor
      );

      await assert.rejects(
        () => migrator.execute(),
        /violates foreign key constraint/
      );

      // Verify rollback
      const check = await targetPool.query("SELECT COUNT(*)::int as cnt FROM public.companies;");
      assert.equal(check.rows[0].cnt, 0);
      await migrator.close();
    });

    it("Test 4.4: Injected financial imbalance prevents successful migration result", async () => {
      const dataset = createRepresentativeDataset();
      // Tamper with balance_due so grand_total - total_paid != balance_due
      dataset.bills[0].balance_due = "9999.00"; // Should be 0.00

      const extractor = new InMemoryFixtureExtractor(dataset);
      const migrator = new DataMigrator(
        {
          mode: "dry-run",
          source: { type: "supabase-api", url: "https://synthetic-source.local", serviceRoleKey: "dummy" },
          target: targetConfig,
        },
        extractor
      );

      const res = await migrator.execute();
      assert.equal(res.success, false, "Migration must fail when financial reconciliation fails");
      assert.equal(res.report?.overallStatus, "FAILED");
      assert.ok(res.report?.financialReconciliation?.unbalancedBills.length! > 0);
      await migrator.close();
    });

    it("Test 4.5: Precondition check prevents import-disposable into a non-empty target", async () => {
      // Temporarily insert a row into companies
      await targetPool.query(`
        INSERT INTO public.companies (id, name, display_name, gst_type, address, bank_account_no, bank_ifsc) 
        VALUES ('pre-existing-company', 'Existing Corp', 'Existing', 'NON_GST', 'Vellore', '1234567890', 'CIUB0001');
      `);

      const dataset = createRepresentativeDataset();
      const extractor = new InMemoryFixtureExtractor(dataset);

      const migrator = new DataMigrator(
        {
          mode: "import-disposable",
          source: { type: "supabase-api", url: "https://synthetic-source.local", serviceRoleKey: "dummy" },
          target: targetConfig,
        },
        extractor
      );

      await assert.rejects(
        () => migrator.execute(),
        /TARGET PRECONDITION VIOLATION.*already contains 1 records/
      );

      // Clean up the single inserted test guard row
      await targetPool.query(`DELETE FROM public.companies WHERE id = 'pre-existing-company';`);
      await migrator.close();
    });
  });

  // ==========================================================================
  // SECTION 5: DISPOSABLE IMPORT REHEARSAL
  // ==========================================================================
  describe("5. Disposable Import Rehearsal Execution", () => {
    it("executes import-disposable into verified empty rehearsal database and commits atomically", async () => {
      const dataset = createRepresentativeDataset();
      const extractor = new InMemoryFixtureExtractor(dataset);

      const migrator = new DataMigrator(
        {
          mode: "import-disposable",
          source: { type: "supabase-api", url: "https://synthetic-source.local", serviceRoleKey: "dummy" },
          target: targetConfig,
          options: {
            batchSize: 50,
            skipSessions: true,
          },
        },
        extractor
      );

      const res = await migrator.execute();
      assert.ok(res.success, "import-disposable must report success");
      assert.equal(res.report?.overallStatus, "PASSED");
      assert.equal(res.report?.financialReconciliation?.isBalanced, true);
      assert.equal(res.report?.financialReconciliation?.grandTotalDiscrepancy, "0.00");
      assert.equal(res.report?.financialReconciliation?.balanceDiscrepancy, "0.00");
      assert.equal(res.report?.orphanCheck.length, 0);

      // Verify row counts in the target database
      const compCheck = await targetPool.query("SELECT COUNT(*)::int as cnt FROM public.companies;");
      assert.equal(compCheck.rows[0].cnt, 2);

      const custCheck = await targetPool.query("SELECT COUNT(*)::int as cnt FROM public.customers;");
      assert.equal(custCheck.rows[0].cnt, 2);

      const prodCheck = await targetPool.query("SELECT COUNT(*)::int as cnt FROM public.products;");
      assert.equal(prodCheck.rows[0].cnt, 2);

      const billCheck = await targetPool.query("SELECT COUNT(*)::int as cnt FROM public.bills;");
      assert.equal(billCheck.rows[0].cnt, 2);

      const payCheck = await targetPool.query("SELECT COUNT(*)::int as cnt FROM public.payments;");
      assert.equal(payCheck.rows[0].cnt, 4);

      // Verify session exclusion policy
      const sessCheck = await targetPool.query("SELECT COUNT(*)::int as cnt FROM public.sessions;");
      assert.equal(sessCheck.rows[0].cnt, 0, "Sessions must be 0 per session exclusion policy");

      // Verify company sequence alignment
      const seqCheck = await targetPool.query("SELECT next_invoice_no, next_quotation_no, next_gate_pass_no FROM public.companies WHERE id = 'comp-rehearsal-001';");
      assert.ok(seqCheck.rows[0].next_invoice_no >= 3, "next_invoice_no must be aligned past TNS-0002");
      assert.ok(seqCheck.rows[0].next_quotation_no >= 3, "next_quotation_no must be aligned past TNQ-0002");
      assert.ok(seqCheck.rows[0].next_gate_pass_no >= 2, "next_gate_pass_no must be aligned past TNGP-0001");

      await migrator.close();
    });
  });

  // ==========================================================================
  // SECTION 7: BUSINESS-LEVEL SMOKE TESTS (AGAINST IMPORTED DATA)
  // ==========================================================================
  describe("6. Business-Level Smoke Tests on Imported Data", () => {
    let store: SupabaseStore;
    let executor: PostgresExecutor;

    before(() => {
      executor = new PostgresExecutor(targetPool);
      // Instantiate SupabaseStore using Postgres executor
      store = new SupabaseStore(executor as any);
    });

    it("Smoke 6.1: Reads imported customers and products with stock quantities intact", async () => {
      const customers = await store.getCustomers();
      assert.ok(customers.length >= 2);
      const c1 = customers.find((c) => c.id === "cust-rehearsal-001");
      assert.ok(c1);
      assert.equal(c1.name, "Vellore Event Planners Pvt Ltd");
      assert.equal(c1.gstin, "33BBBBB1111B1Z2");

      const products = await store.getProducts();
      assert.ok(products.length >= 2);
      const p1 = products.find((p) => p.id === "prod-rehearsal-gen-5kva");
      assert.ok(p1);
      assert.equal(p1.defaultRentalRate, 2500);
      assert.equal(p1.availableQuantity, 6);
      assert.equal(p1.rentedQuantity, 3);
    });

    it("Smoke 6.2: Reads imported bills and verifies exact financial properties", async () => {
      const bill = await store.getBill("bill-rehearsal-001");
      assert.ok(bill);
      assert.equal(bill.billNumber, "TNS-0001");
      assert.equal(bill.grandTotal, 10120);
      assert.equal(bill.advancePaid, 3000);
      assert.equal(bill.amountPaid, 7120);
      assert.equal(bill.balanceDue, 0);
      assert.equal(bill.status, "CLOSED"); // Paid bill is mapped to CLOSED operational status
      assert.equal(bill.items.length, 3);
      assert.equal(bill.payments?.length, 2);
    });

    it("Smoke 6.3: Converts a pending imported quotation (quot-002) to a new bill atomically", async () => {
      const conversionResult = await store.convertQuotationToBill(
        "quot-rehearsal-002",
        {
          advancePaid: 2000,
          paymentMethod: "UPI",
          rentalStartDate: "2026-10-28",
          rentalEndDate: "2026-10-30",
        },
        { id: "user-rehearsal-admin", name: "Admin Officer", role: "ADMIN" }
      );

      assert.ok(conversionResult);
      assert.ok(conversionResult.billId);
      assert.ok(conversionResult.billNumber.startsWith("TNS-"));

      // Verify newly created bill
      const newBill = await store.getBill(conversionResult.billId);
      assert.ok(newBill);
      assert.equal(newBill.sourceQuotationId, "quot-rehearsal-002");
      assert.equal(newBill.advancePaid, 2000);
      assert.equal(newBill.grandTotal, 5900);
      assert.equal(newBill.balanceDue, 3900);

      // Verify original quotation status transitioned to CONVERTED
      const origQuotation = await store.getQuotation("quot-rehearsal-002");
      assert.equal(origQuotation?.status, "CONVERTED");
    });

    it("Smoke 6.4: Records a partial payment and updates outstanding balance accurately", async () => {
      const beforeBill = await store.getBill("bill-rehearsal-002");
      assert.ok(beforeBill);
      const startingBalance = beforeBill.balanceDue; // 4440

      const payment = await store.recordPayment(
        {
          billId: "bill-rehearsal-002",
          companyId: "comp-rehearsal-001",
          amount: 1440,
          paymentMethod: "CASH",
          paymentType: "RENTAL_PAYMENT",
          notes: "Counter cash collection",
        },
        { id: "user-rehearsal-billing", name: "Billing Clerk", role: "BILLING" }
      );

      assert.ok(payment);
      assert.equal(payment.amount, 1440);

      // Verify updated bill balance
      const afterBill = await store.getBill("bill-rehearsal-002");
      assert.ok(afterBill);
      assert.equal(afterBill.balanceDue, startingBalance - 1440);
      assert.equal(afterBill.amountPaid, 4440); // 3000 + 1440
      assert.equal(afterBill.paymentStatus, "PARTIALLY_PAID");
    });

    it("Smoke 6.5: Verifies inventory movements and return inspection integrity", async () => {
      const movementsRes = await targetPool.query(`
        SELECT movement_type, SUM(ABS(quantity_change))::int as total_qty
        FROM public.inventory_movements
        GROUP BY movement_type;
      `);
      const movements = Object.fromEntries(movementsRes.rows.map((r) => [r.movement_type, r.total_qty]));
      assert.equal(movements.DISPATCH, 6); // 1 gen + 5 lights
      assert.equal(movements.RETURN_GOOD, 6); // 1 gen + 5 lights returned
    });
  });
});
