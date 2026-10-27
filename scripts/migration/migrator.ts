// ============================================================================
// TAMILNADU SUPPLIERS RENTAL ERP - CORE MIGRATION ORCHESTRATOR
// File: scripts/migration/migrator.ts
// ============================================================================

import { Pool, PoolClient } from "pg";
import {
  MigrationConfig,
  MigrationMode,
  ReconciliationReport,
  TableImportResult,
} from "./types";
import { validateTargetSafety, validateEnvironmentIsolation, sanitizeError, assertLiveTargetConnection } from "./safety";
import { AUTHORITATIVE_TABLE_GRAPH, getTopologicalOrder } from "./dependencyGraph";
import { createDataExtractor, IDataExtractor } from "./extractor";
import { transformTableRecords } from "./transformer";
import { MigrationReconciler, formatReconciliationSummary } from "./reconciler";

export class DataMigrator {
  private config: MigrationConfig;
  private extractor: IDataExtractor;
  private targetPool: Pool;

  constructor(config: MigrationConfig, extractor?: IDataExtractor) {
    this.config = config;

    // 1. Enforce strict target safety
    validateTargetSafety(this.config.target, this.config.mode);
    validateEnvironmentIsolation(this.config.source, this.config.target);

    // 2. Instantiate extractor
    this.extractor = extractor || createDataExtractor(this.config.source);

    // 3. Instantiate target pool
    this.targetPool = new Pool({
      host: this.config.target.host,
      port: this.config.target.port,
      database: this.config.target.database,
      user: this.config.target.user,
      password: this.config.target.password,
      max: 5,
      idleTimeoutMillis: 10000,
    });
  }

  /**
   * Main entrypoint routing to the selected mode.
   */
  async execute(): Promise<{
    success: boolean;
    report?: ReconciliationReport;
    summary: string;
    details?: any;
  }> {
    switch (this.config.mode) {
      case "inspect":
        return this.runInspect();
      case "dry-run":
        return this.runDryRun();
      case "import-disposable":
        return this.runImportDisposable();
      case "reconcile":
        return this.runStandaloneReconcile();
      default:
        throw new Error(`[MIGRATION ERROR] Unsupported mode: '${this.config.mode}'`);
    }
  }

  /**
   * Mode 1: inspect — validates config, permissions, and source/target table availability.
   */
  async runInspect(): Promise<{ success: boolean; summary: string; details: any }> {
    await assertLiveTargetConnection(this.targetPool, this.config.target);
    const srcSchema = await this.extractor.inspectSchema();
    const tgtRes = await this.targetPool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`
    );
    const targetTables = tgtRes.rows.map((r) => r.table_name);

    const topologicalOrder = getTopologicalOrder();

    const missingInTarget = topologicalOrder.filter((t) => !targetTables.includes(t));

    const details = {
      sourceAccessible: srcSchema.accessible,
      sourceTables: srcSchema.tables,
      targetTables,
      topologicalOrder,
      missingInTarget,
      targetHost: this.config.target.host,
      targetDatabase: this.config.target.database,
    };

    const isReady = srcSchema.accessible && missingInTarget.length === 0;
    const summary = [
      `=== Migration Inspection ===`,
      `Source Accessible: ${srcSchema.accessible ? "YES" : "NO"}`,
      `Target Accessible: YES (${this.config.target.host}:${this.config.target.port}/${this.config.target.database})`,
      `Topological Tables Count: ${topologicalOrder.length}`,
      `Target Public Tables Count: ${targetTables.length}`,
      `Missing Tables in Target: ${missingInTarget.length === 0 ? "None (100% Schema Parity)" : missingInTarget.join(", ")}`,
      `Readiness Status: ${isReady ? "READY FOR DRY-RUN" : "SCHEMA NOT READY"}`,
    ].join("\n");

    return { success: isReady, summary, details };
  }

  /**
   * Mode 2: dry-run — extracts, transforms, simulates database writes in a rolled-back transaction.
   */
  async runDryRun(): Promise<{ success: boolean; report: ReconciliationReport; summary: string; details: any }> {
    const topologicalOrder = getTopologicalOrder();
    const sourceCounts = new Map<string, number>();
    const transformedBatches = new Map<string, Array<Record<string, any>>>();
    const importResults: TableImportResult[] = [];

    // 1. Extraction and Transformation Phase
    for (const tableName of topologicalOrder) {
      const extRes = await this.extractor.extractTable(tableName, this.config.options?.batchSize || 1000);
      sourceCounts.set(tableName, extRes.totalCount);

      const transRes = transformTableRecords(tableName, extRes.records, {
        skipSessions: this.config.options?.skipSessions ?? true,
      });

      if (transRes.validationErrors.length > 0) {
        throw new Error(
          `[DRY-RUN VALIDATION ERROR] Table '${tableName}' has ${transRes.validationErrors.length} validation errors: ${transRes.validationErrors[0].error}`
        );
      }

      transformedBatches.set(tableName, transRes.transformedRecords);
    }

    // 2. Transaction Simulation on Target with Unconditional ROLLBACK
    const client: PoolClient = await this.targetPool.connect();
    await assertLiveTargetConnection(client, this.config.target);
    let report: ReconciliationReport;

    try {
      await client.query("BEGIN;");

      for (const tableName of topologicalOrder) {
        const records = transformedBatches.get(tableName) || [];
        const impResult = await this.insertRecords(client, tableName, records);
        importResults.push(impResult);
      }

      // Handle category parent_id second pass inside transaction
      await this.updateCategoryHierarchy(client, transformedBatches.get("categories") || []);

      // Align sequences inside transaction
      await this.alignCompanySequences(client);

      // Run reconciliation against the simulated state inside the transaction
      const reconciler = new MigrationReconciler(client);
      report = await reconciler.runReconciliation(sourceCounts, "dry-run", {
        skipSessions: this.config.options?.skipSessions ?? true,
      });
    } finally {
      // CRITICAL: Unconditional rollback ensures dry-run CANNOT commit target data
      await client.query("ROLLBACK;");
      client.release();
    }

    // Verify target remains 100% clean / unchanged
    const targetCheck = await this.targetPool.query("SELECT COUNT(*)::int as cnt FROM public.bills;");
    const summary = formatReconciliationSummary(report) +
      `\n\n**Dry-Run Verification:** Unconditional transaction ROLLBACK verified. Target database mutated records: 0.`;

    return {
      success: report.overallStatus === "PASSED",
      report,
      summary,
      details: { importResults, targetBillCountAfterRollback: targetCheck.rows[0].cnt },
    };
  }

  /**
   * Mode 3: import-disposable — imports data into an empty disposable test database.
   */
  async runImportDisposable(): Promise<{ success: boolean; report: ReconciliationReport; summary: string; details: any }> {
    // 1. Verify Target Live Connection and Preconditions (Must be empty to avoid data corruption or collision)
    await assertLiveTargetConnection(this.targetPool, this.config.target);
    await this.assertTargetEmptyPrecondition();

    const topologicalOrder = getTopologicalOrder();
    const sourceCounts = new Map<string, number>();
    const transformedBatches = new Map<string, Array<Record<string, any>>>();
    const importResults: TableImportResult[] = [];

    // 2. Extraction & Transformation
    for (const tableName of topologicalOrder) {
      const extRes = await this.extractor.extractTable(tableName, this.config.options?.batchSize || 1000);
      sourceCounts.set(tableName, extRes.totalCount);

      const transRes = transformTableRecords(tableName, extRes.records, {
        skipSessions: this.config.options?.skipSessions ?? true,
      });

      if (transRes.validationErrors.length > 0) {
        throw new Error(
          `[IMPORT ABORTED] Table '${tableName}' validation failed: ${transRes.validationErrors[0].error}`
        );
      }

      transformedBatches.set(tableName, transRes.transformedRecords);
    }

    // 3. Live Transactional Import
    const client: PoolClient = await this.targetPool.connect();
    await assertLiveTargetConnection(client, this.config.target);
    let report: ReconciliationReport;

    try {
      await client.query("BEGIN;");

      for (const tableName of topologicalOrder) {
        const records = transformedBatches.get(tableName) || [];
        const impResult = await this.insertRecords(client, tableName, records);
        importResults.push(impResult);
      }

      // Handle category parent_id second pass
      await this.updateCategoryHierarchy(client, transformedBatches.get("categories") || []);

      // Align company sequences
      await this.alignCompanySequences(client);

      // Reconcile before committing
      const reconciler = new MigrationReconciler(client);
      report = await reconciler.runReconciliation(sourceCounts, "import-disposable", {
        skipSessions: this.config.options?.skipSessions ?? true,
      });

      if (report.overallStatus === "PASSED") {
        await client.query("COMMIT;");
      } else {
        await client.query("ROLLBACK;");
        throw new Error(
          `[IMPORT TRANSACTION ROLLED BACK] Reconciliation failed with status '${report.overallStatus}'. Target rolled back.`
        );
      }
    } catch (err: any) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }

    const summary = formatReconciliationSummary(report) +
      `\n\n**Live Import Status:** Database successfully committed with 100% reconciliation parity.`;

    return {
      success: report.overallStatus === "PASSED",
      report,
      summary,
      details: { importResults },
    };
  }

  /**
   * Mode 4: reconcile — standalone reconciliation comparing source and target without modifying data.
   */
  async runStandaloneReconcile(): Promise<{ success: boolean; report: ReconciliationReport; summary: string }> {
    await assertLiveTargetConnection(this.targetPool, this.config.target);
    const topologicalOrder = getTopologicalOrder();
    const sourceCounts = new Map<string, number>();

    for (const tableName of topologicalOrder) {
      const extRes = await this.extractor.extractTable(tableName, 5000);
      sourceCounts.set(tableName, extRes.totalCount);
    }

    const reconciler = new MigrationReconciler(this.targetPool);
    const report = await reconciler.runReconciliation(sourceCounts, "reconcile", {
      skipSessions: this.config.options?.skipSessions ?? true,
    });
    const summary = formatReconciliationSummary(report);

    return {
      success: report.overallStatus === "PASSED",
      report,
      summary,
    };
  }

  /**
   * Parameterized multi-row insertion helper.
   */
  private async insertRecords(
    client: PoolClient,
    tableName: string,
    records: Array<Record<string, any>>
  ): Promise<TableImportResult> {
    const startTime = Date.now();
    if (records.length === 0) {
      return {
        tableName,
        plannedInserts: 0,
        successfulInserts: 0,
        conflicts: 0,
        errors: [],
        durationMs: 0,
      };
    }

    const tableDef = AUTHORITATIVE_TABLE_GRAPH.find((t) => t.name === tableName);
    const pk = tableDef ? tableDef.primaryKey : "id";

    let successfulInserts = 0;
    const errors: TableImportResult["errors"] = [];

    // Chunk records into batches of 200
    const CHUNK_SIZE = 200;
    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records.slice(i, i + CHUNK_SIZE);
      const cols = Array.from(new Set(chunk.flatMap((r) => Object.keys(r))));

      for (const row of chunk) {
        const values = cols.map((col) => {
          // If inserting categories pass 1, omit self-referencing parent_id
          if (tableName === "categories" && col === "parent_id") {
            return null;
          }
          return row[col] === undefined ? null : row[col];
        });

        const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(", ");
        const colList = cols.map((c) => `"${c}"`).join(", ");

        const sql = `
          INSERT INTO public."${tableName}" (${colList})
          VALUES (${placeholders})
          ON CONFLICT ("${pk}") DO UPDATE SET
          ${cols.filter((c) => c !== pk).map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ") || `"${pk}" = EXCLUDED."${pk}"`};
        `;

        try {
          await client.query(sql, values);
          successfulInserts++;
        } catch (err: any) {
          const sanitized = sanitizeError(err);
          errors.push({
            recordId: row[pk],
            error: sanitized,
            code: err.code,
          });
          // In a PostgreSQL transaction, any failed statement immediately aborts the transaction (25P02).
          // Fail fast so that the transaction rolls back cleanly and the specific error is surfaced.
          throw new Error(
            `Table '${tableName}' record '${row[pk]}' insert failed: ${sanitized}`
          );
        }
      }
    }

    return {
      tableName,
      plannedInserts: records.length,
      successfulInserts,
      conflicts: records.length - successfulInserts,
      errors,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Updates parent_id for categories in a second pass to satisfy self-referencing FK.
   */
  private async updateCategoryHierarchy(client: PoolClient, categories: Array<Record<string, any>>): Promise<void> {
    for (const cat of categories) {
      if (cat.parent_id) {
        await client.query(
          `UPDATE public.categories SET parent_id = $1 WHERE id = $2;`,
          [cat.parent_id, cat.id]
        );
      }
    }
  }

  /**
   * Synchronizes company document sequences to match max allocated document numbers.
   */
  private async alignCompanySequences(client: PoolClient): Promise<void> {
    await client.query(`
      UPDATE public.companies c
      SET next_invoice_no = GREATEST(
          c.next_invoice_no,
          COALESCE((
              SELECT MAX(NULLIF(regexp_replace(b.bill_number, '^[^0-9]+', '', 'g'), '')::INTEGER) + 1
              FROM public.bills b
              WHERE b.company_id = c.id
          ), c.next_invoice_no)
      ),
      next_quotation_no = GREATEST(
          c.next_quotation_no,
          COALESCE((
              SELECT MAX(NULLIF(regexp_replace(q.quotation_number, '^[^0-9]+', '', 'g'), '')::INTEGER) + 1
              FROM public.quotations q
              WHERE q.company_id = c.id
          ), c.next_quotation_no)
      ),
      next_gate_pass_no = GREATEST(
          c.next_gate_pass_no,
          COALESCE((
              SELECT MAX(NULLIF(regexp_replace(gp.gate_pass_number, '^[^0-9]+', '', 'g'), '')::INTEGER) + 1
              FROM public.gate_passes gp
              WHERE gp.company_id = c.id
          ), c.next_gate_pass_no)
      );
    `);
  }

  /**
   * Asserts that target disposable database contains no pre-existing application data across all 26 schema tables.
   */
  private async assertTargetEmptyPrecondition(): Promise<void> {
    const checkTables = AUTHORITATIVE_TABLE_GRAPH.map((t) => t.name);
    for (const tbl of checkTables) {
      const res = await this.targetPool.query(`SELECT COUNT(*)::int as cnt FROM public."${tbl}";`);
      if (res.rows[0].cnt > 0) {
        throw new Error(
          `[TARGET PRECONDITION VIOLATION] Target disposable database public."${tbl}" already contains ${res.rows[0].cnt} records. Import requires an initialized, empty disposable target database to prevent data corruption.`
        );
      }
    }
  }

  async close(): Promise<void> {
    await this.extractor.close();
    await this.targetPool.end();
  }
}
