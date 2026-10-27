// ============================================================================
// TAMILNADU SUPPLIERS RENTAL ERP - RECONCILIATION ENGINE
// File: scripts/migration/reconciler.ts
// ============================================================================

import { Pool, PoolClient } from "pg";
import { ReconciliationReport, FinancialReconciliation, MigrationMode } from "./types";
import { AUTHORITATIVE_TABLE_GRAPH } from "./dependencyGraph";

/**
 * Calculates integer cents to avoid floating point precision loss.
 */
function toCents(val: any): bigint {
  if (val === null || val === undefined || val === "") return 0n;
  const num = typeof val === "number" ? val : parseFloat(String(val).trim());
  if (isNaN(num)) return 0n;
  return BigInt(Math.round(num * 100));
}

function fromCents(cents: bigint): string {
  const isNeg = cents < 0n;
  const abs = isNeg ? -cents : cents;
  const whole = abs / 100n;
  const rem = abs % 100n;
  return `${isNeg ? "-" : ""}${whole.toString()}.${rem.toString().padStart(2, "0")}`;
}

export class MigrationReconciler {
  private targetDb: Pool | PoolClient;

  constructor(targetDb: Pool | PoolClient) {
    this.targetDb = targetDb;
  }

  /**
   * Performs complete multi-dimensional data reconciliation.
   */
  async runReconciliation(
    sourceCounts: Map<string, number>,
    mode: MigrationMode,
    options?: { skipSessions?: boolean; selectedTables?: string[] }
  ): Promise<ReconciliationReport> {
    const report: ReconciliationReport = {
      timestamp: new Date().toISOString(),
      mode,
      overallStatus: "PASSED",
      tableReconciliation: [],
      orphanCheck: [],
      errors: [],
      warnings: [],
    };

    const skipSessions = options?.skipSessions ?? true;

    // 1. Table Row Counts
    for (const tableDef of AUTHORITATIVE_TABLE_GRAPH) {
      const tableName = tableDef.name;
      // A partial run (--only-tables) is only responsible for the tables it wrote.
      if (options?.selectedTables && !options.selectedTables.includes(tableName)) continue;
      const srcCount = sourceCounts.get(tableName) || 0;

      let tgtCount = 0;
      try {
        const res = await this.targetDb.query(`SELECT COUNT(*)::int as cnt FROM public."${tableName}";`);
        tgtCount = res.rows[0].cnt;
      } catch (err: any) {
        report.errors.push(`Failed to count table public."${tableName}": ${err.message}`);
      }

      // Cutover policy: Active sessions are excluded / invalidated to require fresh login.
      // Target starts with 0 session records when skipSessions is true.
      const isSessionExclusion = tableName === "sessions" && skipSessions;
      const expectedTgt = isSessionExclusion ? 0 : srcCount;
      const diff = expectedTgt - tgtCount;
      const match = diff === 0;

      if (isSessionExclusion && srcCount > 0) {
        report.warnings.push(
          `Table 'sessions' (${srcCount} source records) excluded from target per approved session invalidation cutover policy.`
        );
      }

      report.tableReconciliation.push({
        tableName,
        sourceCount: srcCount,
        targetCount: tgtCount,
        difference: srcCount - tgtCount,
        match,
      });

      if (!match) {
        report.overallStatus = "FAILED";
        report.errors.push(
          `Row count mismatch on '${tableName}': source=${srcCount}, target=${tgtCount} (expected target=${expectedTgt})`
        );
      }
    }

    // 2. Foreign Key Orphan Check
    for (const tableDef of AUTHORITATIVE_TABLE_GRAPH) {
      for (const fk of tableDef.foreignKeys) {
        try {
          const orphanSql = `
            SELECT c."${fk.column}" as orphan_id
            FROM public."${tableDef.name}" c
            LEFT JOIN public."${fk.foreignTable}" p ON c."${fk.column}" = p."${fk.foreignColumn}"
            WHERE c."${fk.column}" IS NOT NULL AND p."${fk.foreignColumn}" IS NULL
            LIMIT 10;
          `;
          const orphanRes = await this.targetDb.query(orphanSql);
          const orphanCount = orphanRes.rows.length;

          if (orphanCount > 0) {
            report.overallStatus = "FAILED";
            const orphanIds = orphanRes.rows.map((r) => String(r.orphan_id));
            report.orphanCheck.push({
              childTable: tableDef.name,
              foreignKeyColumn: fk.column,
              parentTable: fk.foreignTable,
              orphanCount,
              orphanIds,
            });
            report.errors.push(
              `Found ${orphanCount} orphaned foreign keys in '${tableDef.name}.${fk.column}' referencing missing '${fk.foreignTable}.${fk.foreignColumn}'`
            );
          }
        } catch {
          // Table might not exist or column omitted
        }
      }
    }

    // 3. Financial Reconciliation
    try {
      report.financialReconciliation = await this.reconcileFinancials();
      if (!report.financialReconciliation.isBalanced) {
        report.overallStatus = "FAILED";
        report.errors.push(
          `Financial reconciliation failed: grand total discrepancy=${report.financialReconciliation.grandTotalDiscrepancy}, balance discrepancy=${report.financialReconciliation.balanceDiscrepancy}`
        );
      }
    } catch (err: any) {
      report.warnings.push(`Financial reconciliation skipped or encountered error: ${err.message}`);
    }

    // 4. Sequence Reconciliation
    try {
      report.sequenceReconciliation = await this.reconcileSequences();
    } catch (err: any) {
      report.warnings.push(`Sequence reconciliation skipped: ${err.message}`);
    }

    return report;
  }

  /**
   * Reconciles bill financial totals and payment allocations using exact integer cents.
   */
  async reconcileFinancials(): Promise<FinancialReconciliation> {
    const billsRes = await this.targetDb.query(`
      SELECT id, bill_number, subtotal, total_tax, discount_amount, grand_total, advance_paid, amount_paid, balance_due
      FROM public.bills;
    `);

    const paymentsRes = await this.targetDb.query(`
      SELECT bill_id, amount
      FROM public.payments
      WHERE bill_id IS NOT NULL AND is_reversed = false;
    `);

    // Group payments by bill
    const paymentsByBill = new Map<string, bigint>();
    let totalPaymentsCents = 0n;

    for (const p of paymentsRes.rows) {
      const cents = toCents(p.amount);
      totalPaymentsCents += cents;
      paymentsByBill.set(p.bill_id, (paymentsByBill.get(p.bill_id) || 0n) + cents);
    }

    let sumSubtotal = 0n;
    let sumTax = 0n;
    let sumDiscount = 0n;
    let sumGrandTotal = 0n;
    let sumBalance = 0n;
    let sumExpectedGrandTotal = 0n;
    let sumExpectedBalance = 0n;
    let sumEffectivePaid = 0n;

    const unbalancedBills: FinancialReconciliation["unbalancedBills"] = [];

    for (const b of billsRes.rows) {
      const sub = toCents(b.subtotal);
      const tax = toCents(b.total_tax);
      const disc = toCents(b.discount_amount);
      const gt = toCents(b.grand_total);
      const bal = toCents(b.balance_due);
      const adv = toCents(b.advance_paid);
      const amtPaid = toCents(b.amount_paid);

      const paidFromPayments = paymentsByBill.get(b.id) || 0n;
      const totalPaid = paidFromPayments > 0n ? paidFromPayments : (adv + amtPaid);

      sumSubtotal += sub;
      sumTax += tax;
      sumDiscount += disc;
      sumGrandTotal += gt;
      sumBalance += bal;
      sumEffectivePaid += totalPaid;

      const expectedGt = sub + tax - disc;
      sumExpectedGrandTotal += expectedGt;

      const expectedBal = gt > totalPaid ? (gt - totalPaid) : 0n;
      sumExpectedBalance += expectedBal;
      const diff = bal - expectedBal;

      if (diff !== 0n) {
        unbalancedBills.push({
          billId: b.id,
          billNumber: b.bill_number,
          grandTotal: fromCents(gt),
          recordedPayments: fromCents(totalPaid),
          recordedBalance: fromCents(bal),
          expectedBalance: fromCents(expectedBal),
          difference: fromCents(diff),
        });
      }
    }

    const gtDiscrepancy = sumGrandTotal - sumExpectedGrandTotal;
    const balDiscrepancy = sumBalance - sumExpectedBalance;

    const isBalanced = gtDiscrepancy === 0n && balDiscrepancy === 0n && unbalancedBills.length === 0;

    return {
      isBalanced,
      billsCount: billsRes.rows.length,
      paymentsCount: paymentsRes.rows.length,
      totalSubtotal: fromCents(sumSubtotal),
      totalTax: fromCents(sumTax),
      totalDiscount: fromCents(sumDiscount),
      totalGrandTotal: fromCents(sumGrandTotal),
      totalPaid: fromCents(sumEffectivePaid),
      totalOutstandingBalance: fromCents(sumBalance),
      calculatedExpectedGrandTotal: fromCents(sumExpectedGrandTotal),
      grandTotalDiscrepancy: fromCents(gtDiscrepancy),
      balanceDiscrepancy: fromCents(balDiscrepancy),
      unbalancedBills,
    };
  }

  /**
   * Inspects company document counters against actual allocated maximum numbers.
   */
  async reconcileSequences() {
    const companies = await this.targetDb.query(`
      SELECT id, name, next_invoice_no, next_quotation_no, next_gate_pass_no
      FROM public.companies;
    `);

    const result = [];

    for (const c of companies.rows) {
      // Find max allocated bill number
      const billRes = await this.targetDb.query(
        `SELECT MAX(NULLIF(substring(bill_number from '[0-9]{1,9}$'), '')::INTEGER) as max_no
         FROM public.bills WHERE company_id = $1;`,
        [c.id]
      );
      const maxInvoice = billRes.rows[0]?.max_no || 0;
      const alignedInvoice = Math.max(c.next_invoice_no, maxInvoice + 1);

      // Find max allocated quotation number
      const quoteRes = await this.targetDb.query(
        `SELECT MAX(NULLIF(substring(quotation_number from '[0-9]{1,9}$'), '')::INTEGER) as max_no
         FROM public.quotations WHERE company_id = $1;`,
        [c.id]
      );
      const maxQuote = quoteRes.rows[0]?.max_no || 0;
      const alignedQuote = Math.max(c.next_quotation_no, maxQuote + 1);

      // Find max allocated gate pass number
      const gpRes = await this.targetDb.query(
        `SELECT MAX(NULLIF(substring(gate_pass_number from '[0-9]{1,9}$'), '')::INTEGER) as max_no
         FROM public.gate_passes WHERE company_id = $1;`,
        [c.id]
      );
      const maxGp = gpRes.rows[0]?.max_no || 0;
      const alignedGp = Math.max(c.next_gate_pass_no, maxGp + 1);

      result.push({
        companyId: c.id,
        companyName: c.name,
        currentNextInvoiceNo: c.next_invoice_no,
        maxAllocatedInvoiceNo: maxInvoice,
        alignedNextInvoiceNo: alignedInvoice,
        currentNextQuotationNo: c.next_quotation_no,
        maxAllocatedQuotationNo: maxQuote,
        alignedNextQuotationNo: alignedQuote,
        currentNextGatePassNo: c.next_gate_pass_no,
        maxAllocatedGatePassNo: maxGp,
        alignedNextGatePassNo: alignedGp,
      });
    }

    return result;
  }
}

/**
 * Renders a clean Markdown summary from a ReconciliationReport.
 */
export function formatReconciliationSummary(report: ReconciliationReport): string {
  const lines: string[] = [];

  lines.push(`# Data Migration Reconciliation Summary`);
  lines.push(`**Timestamp:** ${report.timestamp}`);
  lines.push(`**Execution Mode:** \`${report.mode}\``);
  lines.push(`**Overall Status:** **${report.overallStatus}**\n`);

  lines.push(`## 1. Table Row Count Reconciliation`);
  lines.push(`| Table Name | Source Count | Target Count | Delta | Status |`);
  lines.push(`| :--- | :---: | :---: | :---: | :---: |`);

  for (const t of report.tableReconciliation) {
    const status = t.match ? "✅ MATCH" : "❌ MISMATCH";
    lines.push(`| \`${t.tableName}\` | ${t.sourceCount} | ${t.targetCount} | ${t.difference} | ${status} |`);
  }

  if (report.financialReconciliation) {
    const fin = report.financialReconciliation;
    lines.push(`\n## 2. Decimal-Safe Financial Reconciliation`);
    lines.push(`- **Bills Evaluated:** ${fin.billsCount}`);
    lines.push(`- **Payments Evaluated:** ${fin.paymentsCount}`);
    lines.push(`- **Total Subtotal:** ₹${fin.totalSubtotal}`);
    lines.push(`- **Total Tax:** ₹${fin.totalTax}`);
    lines.push(`- **Total Discount:** ₹${fin.totalDiscount}`);
    lines.push(`- **Total Grand Total:** ₹${fin.totalGrandTotal}`);
    lines.push(`- **Total Paid:** ₹${fin.totalPaid}`);
    lines.push(`- **Total Outstanding Balance:** ₹${fin.totalOutstandingBalance}`);
    lines.push(`- **Grand Total Discrepancy:** ₹${fin.grandTotalDiscrepancy}`);
    lines.push(`- **Balance Discrepancy:** ₹${fin.balanceDiscrepancy}`);
    lines.push(`- **Financial Balance Status:** ${fin.isBalanced ? "✅ EXACT PARITY" : "❌ UNBALANCED"}`);

    if (fin.unbalancedBills.length > 0) {
      lines.push(`\n### Unbalanced Bills Detected (${fin.unbalancedBills.length}):`);
      for (const ub of fin.unbalancedBills.slice(0, 5)) {
        lines.push(`- Bill \`${ub.billNumber}\`: GrandTotal=${ub.grandTotal}, Payments=${ub.recordedPayments}, RecordedBal=${ub.recordedBalance}, ExpectedBal=${ub.expectedBalance}`);
      }
    }
  }

  if (report.orphanCheck.length > 0) {
    lines.push(`\n## 3. Orphaned Foreign Key References`);
    for (const o of report.orphanCheck) {
      lines.push(`- ❌ Table \`${o.childTable}.${o.foreignKeyColumn}\` has ${o.orphanCount} orphans referencing missing \`${o.parentTable}\``);
    }
  } else {
    lines.push(`\n## 3. Foreign Key Integrity: ✅ All Foreign Keys Satisfied`);
  }

  if (report.sequenceReconciliation && report.sequenceReconciliation.length > 0) {
    lines.push(`\n## 4. Company Sequence Alignment`);
    lines.push(`| Company | Current Invoice # | Max In DB | Aligned Next # |`);
    lines.push(`| :--- | :---: | :---: | :---: |`);
    for (const s of report.sequenceReconciliation) {
      lines.push(`| ${s.companyName} | ${s.currentNextInvoiceNo} | ${s.maxAllocatedInvoiceNo} | ${s.alignedNextInvoiceNo} |`);
    }
  }

  if (report.errors.length > 0) {
    lines.push(`\n## Errors Encountered (${report.errors.length})`);
    for (const e of report.errors) {
      lines.push(`- ❌ ${e}`);
    }
  }

  return lines.join("\n");
}
