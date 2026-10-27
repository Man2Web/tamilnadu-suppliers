// ============================================================================
// TAMILNADU SUPPLIERS RENTAL ERP - DATA MIGRATION TYPES & INTERFACES
// File: scripts/migration/types.ts
// ============================================================================

export type MigrationMode = "inspect" | "dry-run" | "import-disposable" | "import-production" | "reconcile";

export interface MigrationConfig {
  mode: MigrationMode;
  source: SourceConfig;
  target: TargetConfig;
  options?: MigrationOptions;
}

export interface SourceConfig {
  type: "postgres" | "supabase-api";
  url?: string;
  connectionString?: string;
  serviceRoleKey?: string;
  schema?: string;
}

export interface TargetConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  schema?: string;
}

export interface MigrationOptions {
  batchSize?: number;
  verbose?: boolean;
  skipSessions?: boolean;
  cleanRateLimits?: boolean;
  outputPath?: string;
  stopOnError?: boolean;
  /**
   * Explicit opt-in to target the approved production database instead of a loopback disposable one.
   * Requires an exact confirmation phrase (see PRODUCTION_CONFIRM_PREFIX in safety.ts).
   */
  productionTarget?: { confirm: string };
}

export interface TableDependency {
  name: string;
  tier: number;
  primaryKey: string;
  foreignKeys: Array<{
    column: string;
    foreignTable: string;
    foreignColumn: string;
    nullable: boolean;
    selfReferencing?: boolean;
  }>;
  hasSpecialHandling?: boolean;
  skipMigration?: boolean;
}

export interface TableExtractionResult {
  tableName: string;
  records: Array<Record<string, any>>;
  totalCount: number;
  extractedPages: number;
  durationMs: number;
}

export interface TableTransformResult {
  tableName: string;
  transformedRecords: Array<Record<string, any>>;
  validationErrors: Array<{
    recordId: string;
    column?: string;
    error: string;
  }>;
}

export interface TableImportResult {
  tableName: string;
  plannedInserts: number;
  successfulInserts: number;
  conflicts: number;
  errors: Array<{
    recordId?: string;
    error: string;
    code?: string;
  }>;
  durationMs: number;
}

export interface FinancialReconciliation {
  isBalanced: boolean;
  billsCount: number;
  paymentsCount: number;
  totalSubtotal: string;
  totalTax: string;
  totalDiscount: string;
  totalGrandTotal: string;
  totalPaid: string;
  totalOutstandingBalance: string;
  calculatedExpectedGrandTotal: string;
  grandTotalDiscrepancy: string;
  balanceDiscrepancy: string;
  unbalancedBills: Array<{
    billId: string;
    billNumber: string;
    grandTotal: string;
    recordedPayments: string;
    recordedBalance: string;
    expectedBalance: string;
    difference: string;
  }>;
}

export interface ReconciliationReport {
  timestamp: string;
  mode: MigrationMode;
  overallStatus: "PASSED" | "FAILED" | "WARNING";
  tableReconciliation: Array<{
    tableName: string;
    sourceCount: number;
    targetCount: number;
    difference: number;
    match: boolean;
  }>;
  orphanCheck: Array<{
    childTable: string;
    foreignKeyColumn: string;
    parentTable: string;
    orphanCount: number;
    orphanIds: string[];
  }>;
  financialReconciliation?: FinancialReconciliation;
  sequenceReconciliation?: Array<{
    companyId: string;
    companyName: string;
    currentNextInvoiceNo: number;
    maxAllocatedInvoiceNo: number;
    alignedNextInvoiceNo: number;
    currentNextQuotationNo: number;
    maxAllocatedQuotationNo: number;
    alignedNextQuotationNo: number;
    currentNextGatePassNo: number;
    maxAllocatedGatePassNo: number;
    alignedNextGatePassNo: number;
  }>;
  inventoryReconciliation?: {
    totalProductsChecked: number;
    discrepancyCount: number;
    discrepancies: Array<{
      productId: string;
      sku: string;
      recordedStock: number;
      expectedStock: number;
      delta: number;
    }>;
  };
  errors: string[];
  warnings: string[];
}
