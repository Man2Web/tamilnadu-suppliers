// ============================================================================
// TAMILNADU SUPPLIERS - PERMISSION DEFINITIONS & MODULE GROUPINGS
// Configurable granular permissions per account
// ============================================================================

export type ModulePermissionId =
  // Dashboard
  | "dashboard:view"
  // Products and Inventory
  | "products:view"
  | "products:create"
  | "products:edit"
  | "categories:manage"
  | "inventory:availability"
  // Customers
  | "customers:view"
  | "customers:create"
  | "customers:edit"
  // Quotations
  | "quotations:view"
  | "quotations:create"
  | "quotations:edit"
  | "quotations:pdf"
  // Rental Billing
  | "bills:view"
  | "bills:create"
  | "bills:amend"
  | "payments:record"
  | "returns:process"
  | "damages:record"
  | "bills:close"
  | "bills:pdf"
  // Company and User Administration
  | "companies:manage"
  | "users:manage"
  | "permissions:assign"
  // Legacy aliases
  | "products:read"
  | "products:write"
  | "products:override_price"
  | "customers:manage"
  | "quotations:finalize"
  | "quotations:convert"
  | "quotations:share"
  | "bills:finalize"
  | "dispatch:manage"
  | "returns:record"
  | "stock:adjust"
  | "reports:view";

export interface PermissionDefinition {
  id: ModulePermissionId;
  label: string;
  name?: string;
  description: string;
}

export interface PermissionModule {
  id: string;
  name: string;
  module?: string;
  description: string;
  permissions: PermissionDefinition[];
}

export const PERMISSION_MODULES: PermissionModule[] = [
  {
    id: "dashboard",
    name: "Dashboard",
    description: "Main dashboard overview, rental KPI metrics, and operational registers",
    permissions: [
      {
        id: "dashboard:view",
        label: "View Dashboard",
        description: "Access main overview KPIs, revenue analytics, and quick status metrics",
      },
    ],
  },
  {
    id: "products",
    name: "Products and Inventory",
    description: "Central catalog, rental rates, stock adjustments, and categories",
    permissions: [
      {
        id: "products:view",
        label: "View Products",
        description: "Browse shared product catalog, specifications, and default rental rates",
      },
      {
        id: "products:create",
        label: "Add Products",
        description: "Create new catalog items with specifications, owned counts, and rates",
      },
      {
        id: "products:edit",
        label: "Edit Products",
        description: "Modify existing product details, rental prices, and replacement costs",
      },
      {
        id: "categories:manage",
        label: "Manage Categories",
        description: "Create and organize product categories",
      },
      {
        id: "inventory:availability",
        label: "View Stock Availability",
        description: "Check live stock availability: owned, rented, damaged, and available",
      },
    ],
  },
  {
    id: "customers",
    name: "Customers",
    description: "Customer directory and client contact records",
    permissions: [
      {
        id: "customers:view",
        label: "View Customers",
        description: "View customer directory, contact numbers, and billing addresses",
      },
      {
        id: "customers:create",
        label: "Add Customers",
        description: "Register new customers and organizations",
      },
      {
        id: "customers:edit",
        label: "Edit Customers",
        description: "Update client details, GSTIN, phone numbers, and addresses",
      },
    ],
  },
  {
    id: "quotations",
    name: "Quotations",
    description: "Quotation generation, revisions, PDF downloads, and conversions",
    permissions: [
      {
        id: "quotations:view",
        label: "View Quotations",
        description: "View existing quotations and revision history",
      },
      {
        id: "quotations:create",
        label: "Create Quotations",
        description: "Draft and issue new rental quotations for clients",
      },
      {
        id: "quotations:edit",
        label: "Edit Quotations",
        description: "Revise quotation rates, items, durations, and terms",
      },
      {
        id: "quotations:pdf",
        label: "Generate Quotation PDFs",
        description: "Download or view quotation PDF documents with company branding",
      },
    ],
  },
  {
    id: "billing",
    name: "Rental Billing",
    description: "Invoicing, dispatch, returns, damage settlements, payments, and closure",
    permissions: [
      {
        id: "bills:view",
        label: "View Rental Bills",
        description: "Access rental bills register, outstanding balances, and bill statuses",
      },
      {
        id: "bills:create",
        label: "Create Rental Bills",
        description: "Issue new rental bills directly or convert from accepted quotations",
      },
      {
        id: "bills:amend",
        label: "Amend Open Rental Bills",
        description: "Extend expected return dates, adjust durations, and append extra days",
      },
      {
        id: "payments:record",
        label: "Record Payments",
        description: "Record cash, UPI, or bank transfer payments and update balance due",
      },
      {
        id: "returns:process",
        label: "Process Returns",
        description: "Record returning rental goods and inspect product conditions",
      },
      {
        id: "damages:record",
        label: "Record Damaged or Missing Items",
        description: "Document damaged or missing quantities and resolve charge decisions",
      },
      {
        id: "bills:close",
        label: "Close Rental Bills",
        description: "Finalize bill settlement and close bills after full return and payment",
      },
      {
        id: "bills:pdf",
        label: "Generate Bill PDFs",
        description: "Download or print official rental invoice/bill PDFs",
      },
    ],
  },
  {
    id: "administration",
    name: "Company and User Administration",
    description: "Issuing company configurations, user account access, and permissions",
    permissions: [
      {
        id: "companies:manage",
        label: "Manage Companies",
        description: "Add, edit, activate, deactivate, or delete issuing companies (Super Admin)",
      },
      {
        id: "users:manage",
        label: "Manage User Accounts",
        description: "Create, edit, activate, deactivate, and reset user accounts (Super Admin)",
      },
      {
        id: "permissions:assign",
        label: "Assign Permissions",
        description: "Assign or modify granular permissions for user accounts (Super Admin)",
      },
    ],
  },
];

// All distinct permissions flattened
export const ALL_PERMISSIONS: ModulePermissionId[] = PERMISSION_MODULES.flatMap((m) =>
  m.permissions.map((p) => p.id)
);

// Standard Presets
export const ADMIN_PRESET_PERMISSIONS: ModulePermissionId[] = [
  "dashboard:view",
  "products:view",
  "products:create",
  "products:edit",
  "categories:manage",
  "inventory:availability",
  "customers:view",
  "customers:create",
  "customers:edit",
  "quotations:view",
  "quotations:create",
  "quotations:edit",
  "quotations:pdf",
  "bills:view",
  "bills:create",
  "bills:amend",
  "payments:record",
  "returns:process",
  "damages:record",
  "bills:close",
  "bills:pdf",
];

export const BILLING_PRESET_PERMISSIONS: ModulePermissionId[] = [
  "dashboard:view",
  "customers:view",
  "customers:create",
  "quotations:view",
  "quotations:create",
  "quotations:pdf",
  "bills:view",
  "bills:create",
  "bills:amend",
  "payments:record",
  "returns:process",
  "damages:record",
  "bills:close",
  "bills:pdf",
];

export const SUPER_ADMIN_PERMISSIONS: ModulePermissionId[] = [...ALL_PERMISSIONS];

/**
 * Normalizes and checks if a user has a specific permission.
 * Super Admin accounts always have full access.
 */
export function checkUserPermission(
  user: { role: string; permissions?: (string | ModulePermissionId)[]; status?: string } | null | undefined,
  requiredPermission: ModulePermissionId | string
): boolean {
  if (!user) return false;
  if (user.status === "INACTIVE") return false;
  if (user.role === "SUPER_ADMIN") return true;

  const userPerms = user.permissions || [];
  if (userPerms.includes(requiredPermission as any)) return true;

  // Handle aliases
  if (requiredPermission === "products:view" && userPerms.includes("products:read")) return true;
  if (requiredPermission === "products:create" && userPerms.includes("products:write")) return true;
  if (requiredPermission === "bills:close" && userPerms.includes("bills:finalize")) return true;
  if (requiredPermission === "returns:process" && userPerms.includes("returns:record")) return true;
  if (requiredPermission === "quotations:create" && userPerms.includes("quotations:create")) return true;

  return false;
}
