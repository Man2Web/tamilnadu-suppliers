// ============================================================================
// TAMILNADU SUPPLIERS - API ROUTE PERMISSION MATRIX
// Any-of permission sets used by server-side route guards. Each set lists every
// existing permission whose workflow legitimately needs the endpoint, so current
// ADMIN / BILLING / custom-permission accounts keep the access their screens use.
// ============================================================================

export const ROUTE_PERMISSIONS = {
  catalogRead: ["products:view", "products:read", "inventory:availability", "quotations:create", "quotations:edit", "bills:create", "bills:amend"],
  customerRead: ["customers:view", "customers:create", "customers:edit", "customers:manage", "quotations:create", "quotations:edit", "quotations:view", "bills:create", "bills:view"],
  customerCreate: ["customers:create", "customers:manage", "quotations:create", "bills:create"],
  customerEdit: ["customers:edit", "customers:manage"],
  quotationRead: ["quotations:view", "quotations:create", "quotations:edit", "bills:create"],
  quotationEdit: ["quotations:edit", "quotations:create"],
  quotationConvert: ["quotations:convert", "quotations:finalize", "bills:create"],
  quotationPdf: ["quotations:pdf", "quotations:view"],
  billRead: ["bills:view", "bills:create", "bills:amend", "payments:record", "returns:process", "returns:record", "damages:record", "bills:close"],
  billCreate: ["bills:create"],
  billWorkspaceSave: ["bills:amend", "bills:create", "payments:record", "returns:process", "returns:record", "damages:record", "bills:close", "bills:finalize"],
  billPdf: ["bills:pdf", "bills:view"],
  dispatch: ["dispatch:manage", "bills:create", "bills:amend"],
  returnsProcess: ["returns:process", "returns:record", "damages:record"],
  operationsRead: ["bills:view", "dispatch:manage", "returns:process", "returns:record", "damages:record"],
  share: ["quotations:share", "quotations:view", "bills:view"],
  productImport: ["products:create", "products:write"],
} as const;
