// ============================================================================
// TAMILNADU SUPPLIERS - STANDALONE POSTGRESQL CLIENT & QUERY ADAPTER
// Type-safe, parameterized PostgreSQL query builder matching application requirements
// ============================================================================

import { Pool, PoolClient, QueryResult, types } from "pg";
import { cleanEnvValue } from "./guard";
import { validatePostgresDatabaseUrl } from "./provider";

// // Configure PostgreSQL type parsers to ensure type consistency:
// - TIMESTAMPTZ (1184) and TIMESTAMP (1114) normalized to ISO 8601 strings (safely handling infinity/-infinity)
// - DATE (1082) returned as date string "YYYY-MM-DD"
// - NUMERIC / DECIMAL (1700) parsed as float number to match JSON numbers
// - INT8 / BIGINT (20) parsed as integer number
export function safeParseTimestamp(val: string | null | undefined): string | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (!str) return str;

  // Preserve PostgreSQL special timestamps without throwing RangeError
  if (str === "infinity" || str === "-infinity") {
    return str;
  }

  // Check if string can be parsed as a valid date
  const candidate = str.endsWith("Z")
    ? str
    : str + (str.includes("+") || (str.includes("-") && str.lastIndexOf("-") > 7) ? "" : "Z");
  const parsed = new Date(candidate);
  if (isNaN(parsed.getTime())) {
    // Return raw string; do NOT throw RangeError and do NOT return a misleading date
    return str;
  }

  return parsed.toISOString();
}

types.setTypeParser(1184, (val: string) => safeParseTimestamp(val));
types.setTypeParser(1114, (val: string) => safeParseTimestamp(val));
types.setTypeParser(1082, (val: string) => val);
types.setTypeParser(1700, (val: string) => (val === null ? null : parseFloat(val)));
types.setTypeParser(20, (val: string) => (val === null ? null : parseInt(val, 10)));

export interface PostgresQueryError {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

export interface PostgresQueryResult<T = any> {
  data: T | null;
  error: PostgresQueryError | null;
  count?: number | null;
  status?: number;
  statusText?: string;
}

export interface SelectOptions {
  count?: "exact";
  head?: boolean;
}

export interface OrderOptions {
  ascending?: boolean;
  nullsFirst?: boolean;
}

// Allowlist of application tables to prevent any unauthorized table access
export const KNOWN_APPLICATION_TABLES = new Set([
  "companies",
  "categories",
  "products",
  "customers",
  "customer_branches",
  "quotations",
  "quotation_branches",
  "quotation_items",
  "bills",
  "bill_branches",
  "bill_items",
  "payments",
  "gate_passes",
  "gate_pass_items",
  "returns",
  "return_items",
  "inventory_movements",
  "users",
  "sessions",
  "audit_logs",
  "activity_notifications",
  "login_rate_limits",
]);

// Allowlist of application RPC functions to prevent unauthorized function calls
export const KNOWN_RPC_FUNCTIONS = new Set([
  "login_rate_limit_status",
  "login_rate_limit_record_failure",
  "login_rate_limit_clear",
]);

const IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Validates that an identifier (table name, column name, argument name, or function name)
 * contains only safe SQL identifier characters and matches the expected format.
 * Prevents any identifier-based SQL injection.
 */
export function assertValidIdentifier(
  name: string,
  kind: "table" | "column" | "argument" | "function" = "column"
): string {
  if (!name || typeof name !== "string") {
    throw new Error(`[POSTGRES ADAPTER SECURITY ERROR] Missing or invalid SQL ${kind} identifier.`);
  }
  const trimmed = name.trim();
  if (!IDENTIFIER_REGEX.test(trimmed)) {
    throw new Error(`[POSTGRES ADAPTER SECURITY ERROR] Unsafe SQL ${kind} identifier: "${trimmed}".`);
  }
  if (kind === "table" && !KNOWN_APPLICATION_TABLES.has(trimmed.toLowerCase())) {
    throw new Error(`[POSTGRES ADAPTER SECURITY ERROR] Unauthorized table name: "${trimmed}".`);
  }
  if (kind === "function" && !KNOWN_RPC_FUNCTIONS.has(trimmed.toLowerCase())) {
    throw new Error(`[POSTGRES ADAPTER SECURITY ERROR] Unauthorized function name: "${trimmed}".`);
  }
  return trimmed;
}

/**
 * Splits an .or() expression string by top-level commas, respecting quotes.
 * Fails closed by throwing if quotes are unclosed, if an empty clause is encountered,
 * or if a trailing comma is present.
 */
export function splitOrExpression(expr: string): string[] {
  if (!expr || typeof expr !== "string" || !expr.trim()) {
    throw new Error("[POSTGRES ADAPTER SECURITY ERROR] Empty or missing .or() expression.");
  }

  const parts: string[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";

  for (let i = 0; i < expr.length; i++) {
    const char = expr[i];
    if ((char === '"' || char === "'") && (i === 0 || expr[i - 1] !== "\\")) {
      if (!inQuote) {
        inQuote = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuote = false;
        quoteChar = "";
      }
      current += char;
    } else if (char === "," && !inQuote) {
      const trimmed = current.trim();
      if (!trimmed) {
        throw new Error("[POSTGRES ADAPTER SECURITY ERROR] Malformed .or() expression: empty clause between commas.");
      }
      parts.push(trimmed);
      current = "";
    } else {
      current += char;
    }
  }

  if (inQuote) {
    throw new Error("[POSTGRES ADAPTER SECURITY ERROR] Malformed .or() expression: unclosed quote.");
  }

  const lastTrimmed = current.trim();
  if (!lastTrimmed) {
    throw new Error("[POSTGRES ADAPTER SECURITY ERROR] Malformed .or() expression: trailing comma.");
  }
  parts.push(lastTrimmed);

  if (parts.length === 0) {
    throw new Error("[POSTGRES ADAPTER SECURITY ERROR] Empty .or() expression.");
  }

  return parts;
}

/**
 * Converts JavaScript values into PostgreSQL-safe parameter values.
 * Correctly serializes objects and arrays to JSON strings for JSONB columns,
 * formats Date instances to ISO strings, and normalizes null/undefined.
 */
export function serializePgParam(val: any): any {
  if (val === undefined || val === null) {
    return null;
  }
  if (val instanceof Date) {
    return val.toISOString();
  }
  if (typeof val === "object" && !Buffer.isBuffer(val)) {
    return JSON.stringify(val);
  }
  return val;
}

export type QueryRunner = (sql: string, params: any[]) => Promise<QueryResult<any>>;

let poolInstance: Pool | null = null;

export function getDatabaseUrl(): string {
  return cleanEnvValue(process.env.DATABASE_URL);
}

/**
 * Returns the active connection pool for PostgreSQL.
 */
export function getPostgresPool(): Pool {
  if (poolInstance) {
    return poolInstance;
  }

  const rawUrl = getDatabaseUrl();
  const validation = validatePostgresDatabaseUrl(rawUrl);
  if (!validation.isValid) {
    throw new Error(`[POSTGRES CONFIG ERROR] ${validation.error}`);
  }

  const minPool = parseInt(process.env.DATABASE_POOL_MIN || "2", 10);
  const maxPool = parseInt(process.env.DATABASE_POOL_MAX || "10", 10);

  poolInstance = new Pool({
    connectionString: rawUrl,
    min: minPool,
    max: maxPool,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  poolInstance.on("error", (err) => {
    console.error("[POSTGRES POOL ERROR] Unexpected client error:", err.message);
  });

  return poolInstance;
}

/**
 * Gracefully shuts down the connection pool (useful during tests or server shutdown).
 */
export async function closePostgresPool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}

/**
 * Parameterized query builder supporting only the methods required by Tamilnadu Suppliers ERP.
 */
export class PostgresQueryBuilder implements PromiseLike<PostgresQueryResult<any>> {
  private tableName: string;
  private runner: QueryRunner;
  private op: "SELECT" | "INSERT" | "UPDATE" | "DELETE" = "SELECT";
  private selectCols: string = "*";
  private returningCols: string = "";
  private insertData: any = null;
  private updateData: any = null;
  private whereClauses: string[] = [];
  private params: any[] = [];
  private orderClauses: string[] = [];
  private limitCount: number | null = null;
  private isSingle: boolean = false;
  private isMaybeSingle: boolean = false;
  private isCountExact: boolean = false;
  private isHead: boolean = false;
  private isForUpdate: boolean = false;

  constructor(tableName: string, runner: QueryRunner) {
    this.tableName = assertValidIdentifier(tableName, "table");
    this.runner = runner;
  }

  select(fields: string = "*", options?: SelectOptions): this {
    if (this.op === "INSERT" || this.op === "UPDATE" || this.op === "DELETE") {
      // Writes followed by select().single() or select().maybeSingle()
      this.returningCols = fields || "*";
    } else {
      this.op = "SELECT";
      this.selectCols = fields || "*";
    }

    if (options?.count === "exact") {
      this.isCountExact = true;
    }
    if (options?.head === true) {
      this.isHead = true;
    }
    return this;
  }

  /**
   * Appends FOR UPDATE to row-level SELECT queries, locking rows against concurrent transactions
   * until the active transaction commits or rolls back.
   */
  forUpdate(): this {
    if (this.op !== "SELECT" || this.isHead) {
      throw new Error("[POSTGRES ADAPTER SECURITY ERROR] FOR UPDATE is only supported on row-level SELECT queries.");
    }
    this.isForUpdate = true;
    return this;
  }

  insert(data: Record<string, any> | Record<string, any>[]): this {
    this.op = "INSERT";
    this.insertData = data;
    this.returningCols = "*";
    return this;
  }

  update(data: Record<string, any>): this {
    this.op = "UPDATE";
    this.updateData = data;
    this.returningCols = "*";
    return this;
  }

  delete(): this {
    this.op = "DELETE";
    this.returningCols = "";
    return this;
  }

  eq(column: string, value: any): this {
    const safeCol = assertValidIdentifier(column, "column");
    if (value === null || value === undefined) {
      this.whereClauses.push(`"${safeCol}" IS NULL`);
    } else {
      this.params.push(serializePgParam(value));
      this.whereClauses.push(`"${safeCol}" = $${this.params.length}`);
    }
    return this;
  }

  neq(column: string, value: any): this {
    const safeCol = assertValidIdentifier(column, "column");
    if (value === null || value === undefined) {
      this.whereClauses.push(`"${safeCol}" IS NOT NULL`);
    } else {
      this.params.push(serializePgParam(value));
      this.whereClauses.push(`"${safeCol}" != $${this.params.length}`);
    }
    return this;
  }

  is(column: string, value: any): this {
    const safeCol = assertValidIdentifier(column, "column");
    if (value === null || value === undefined) {
      this.whereClauses.push(`"${safeCol}" IS NULL`);
    } else {
      this.params.push(serializePgParam(value));
      this.whereClauses.push(`"${safeCol}" IS $${this.params.length}`);
    }
    return this;
  }

  in(column: string, values: any[]): this {
    const safeCol = assertValidIdentifier(column, "column");
    if (!Array.isArray(values) || values.length === 0) {
      this.whereClauses.push("1=0");
      return this;
    }
    const placeholders = values.map((val) => {
      this.params.push(serializePgParam(val));
      return `$${this.params.length}`;
    });
    this.whereClauses.push(`"${safeCol}" IN (${placeholders.join(", ")})`);
    return this;
  }

  ilike(column: string, pattern: string): this {
    const safeCol = assertValidIdentifier(column, "column");
    this.params.push(serializePgParam(pattern));
    this.whereClauses.push(`"${safeCol}" ILIKE $${this.params.length}`);
    return this;
  }

  /**
   * Supports PostgREST-style OR conditions, e.g.:
   * .or("id.eq.val,sku.eq.val")
   * Validates each column identifier and parameterizes all values.
   * FAILS CLOSED: Rejects malformed, empty, or unsupported syntax with an explicit error.
   */
  or(expression: string): this {
    const parts = splitOrExpression(expression);
    const subClauses: string[] = [];

    for (const part of parts) {
      // Matches: col.op.val where op is strictly eq, neq, ilike, or like
      const match = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\.(eq|neq|ilike|like)\.(.*)$/);
      if (!match) {
        throw new Error(`[POSTGRES ADAPTER SECURITY ERROR] Unsupported or malformed .or() subclause: "${part}".`);
      }

      const col = assertValidIdentifier(match[1], "column");
      const opStr = match[2];
      let val = match[3];

      // Strip surrounding quotes if present (allowing commas inside quotes)
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }

      this.params.push(serializePgParam(val));
      const pIndex = `$${this.params.length}`;

      if (opStr === "eq") subClauses.push(`"${col}" = ${pIndex}`);
      else if (opStr === "neq") subClauses.push(`"${col}" != ${pIndex}`);
      else if (opStr === "ilike") subClauses.push(`"${col}" ILIKE ${pIndex}`);
      else if (opStr === "like") subClauses.push(`"${col}" LIKE ${pIndex}`);
    }

    if (subClauses.length === 0) {
      throw new Error("[POSTGRES ADAPTER SECURITY ERROR] No valid conditions parsed from .or() expression.");
    }

    this.whereClauses.push(`(${subClauses.join(" OR ")})`);
    return this;
  }

  order(column: string, options?: OrderOptions): this {
    const safeCol = assertValidIdentifier(column, "column");
    const dir = options?.ascending === false ? "DESC" : "ASC";
    const nulls = options?.nullsFirst === true ? " NULLS FIRST" : options?.nullsFirst === false ? " NULLS LAST" : "";
    this.orderClauses.push(`"${safeCol}" ${dir}${nulls}`);
    return this;
  }

  limit(count: number): this {
    if (typeof count === "number" && count >= 0) {
      this.limitCount = count;
    }
    return this;
  }

  single(): this {
    this.isSingle = true;
    return this;
  }

  maybeSingle(): this {
    this.isMaybeSingle = true;
    return this;
  }

  buildQuery(): { sql: string; params: any[] } {
    const table = `public."${this.tableName}"`;
    const where = this.whereClauses.length > 0 ? `WHERE ${this.whereClauses.join(" AND ")}` : "";
    const order = this.orderClauses.length > 0 ? `ORDER BY ${this.orderClauses.join(", ")}` : "";

    // 1. SELECT queries
    if (this.op === "SELECT") {
      if (this.isHead) {
        const parts = [`SELECT COUNT(*)::int AS count FROM ${table}`];
        if (where) parts.push(where);
        return { sql: parts.join(" "), params: [...this.params] };
      }

      let cols = "*";
      if (this.selectCols && this.selectCols !== "*") {
        cols = this.selectCols
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)
          .map((c) => `"${assertValidIdentifier(c, "column")}"`)
          .join(", ");
      }

      const parts = [`SELECT ${cols} FROM ${table}`];
      if (where) parts.push(where);
      if (order) parts.push(order);
      if (this.limitCount !== null) {
        parts.push(`LIMIT ${this.limitCount}`);
      } else if (this.isSingle || this.isMaybeSingle) {
        parts.push(`LIMIT 2`); // Fetch 2 to detect multiple-row violation for single/maybeSingle
      }
      if (this.isForUpdate) {
        parts.push("FOR UPDATE");
      }
      return { sql: parts.join(" "), params: [...this.params] };
    }

    // 2. INSERT queries
    if (this.op === "INSERT") {
      const rows = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
      if (rows.length === 0 || !rows[0] || typeof rows[0] !== "object") {
        return { sql: `SELECT 1 WHERE 1=0`, params: [] };
      }

      // Compute the union of column keys across all inserted rows, preserving deterministic order
      const keySet = new Set<string>();
      for (const row of rows) {
        if (row && typeof row === "object") {
          for (const k of Object.keys(row)) {
            keySet.add(assertValidIdentifier(k, "column"));
          }
        }
      }

      const keys = Array.from(keySet);
      if (keys.length === 0) {
        return { sql: `SELECT 1 WHERE 1=0`, params: [] };
      }

      const colList = keys.map((k) => `"${k}"`).join(", ");
      const valueTuples: string[] = [];
      const params: any[] = [];

      for (const row of rows) {
        const rowPlaceholders: string[] = [];
        for (const k of keys) {
          // If key is missing from a row, serializePgParam(undefined) safely pushes null
          const rawVal = row ? row[k] : undefined;
          params.push(serializePgParam(rawVal));
          rowPlaceholders.push(`$${params.length}`);
        }
        valueTuples.push(`(${rowPlaceholders.join(", ")})`);
      }

      let returning = "";
      if (this.returningCols) {
        returning = this.returningCols === "*"
          ? " RETURNING *"
          : ` RETURNING ${this.returningCols.split(",").map((c) => `"${assertValidIdentifier(c.trim(), "column")}"`).join(", ")}`;
      }

      const sql = `INSERT INTO ${table} (${colList}) VALUES ${valueTuples.join(", ")}${returning}`;
      return { sql, params };
    }

    // 3. UPDATE queries
    if (this.op === "UPDATE") {
      const updateObj = this.updateData || {};
      const keys = Object.keys(updateObj).map((k) => assertValidIdentifier(k, "column"));
      if (keys.length === 0) {
        return { sql: `SELECT 1 WHERE 1=0`, params: [] };
      }

      const setClauses: string[] = [];
      const params: any[] = [];

      for (const k of keys) {
        params.push(serializePgParam(updateObj[k]));
        setClauses.push(`"${k}" = $${params.length}`);
      }

      // Remap where clause parameters to follow SET parameters
      const offset = params.length;
      const remappedWhereClauses = this.whereClauses.map((clause) =>
        clause.replace(/\$(\d+)/g, (_, num) => `$${parseInt(num, 10) + offset}`)
      );
      params.push(...this.params);

      const whereStr = remappedWhereClauses.length > 0 ? `WHERE ${remappedWhereClauses.join(" AND ")}` : "";
      let returning = "";
      if (this.returningCols) {
        returning = this.returningCols === "*"
          ? "RETURNING *"
          : `RETURNING ${this.returningCols.split(",").map((c) => `"${assertValidIdentifier(c.trim(), "column")}"`).join(", ")}`;
      }

      const parts = [`UPDATE ${table} SET ${setClauses.join(", ")}`];
      if (whereStr) parts.push(whereStr);
      if (returning) parts.push(returning);
      return { sql: parts.join(" "), params };
    }

    // 4. DELETE queries
    if (this.op === "DELETE") {
      let returning = "";
      if (this.returningCols) {
        returning = this.returningCols === "*"
          ? "RETURNING *"
          : `RETURNING ${this.returningCols.split(",").map((c) => `"${assertValidIdentifier(c.trim(), "column")}"`).join(", ")}`;
      }
      const parts = [`DELETE FROM ${table}`];
      if (where) parts.push(where);
      if (returning) parts.push(returning);
      return { sql: parts.join(" "), params: [...this.params] };
    }

    throw new Error(`[POSTGRES ADAPTER ERROR] Unsupported operation: ${this.op}`);
  }

  async execute(): Promise<PostgresQueryResult<any>> {
    try {
      const { sql, params } = this.buildQuery();
      const res = await this.runner(sql, params);

      // Handle Head count queries: .select("*", { count: "exact", head: true })
      if (this.isHead) {
        const countVal = Number(res.rows[0]?.count || 0);
        return { data: null, error: null, count: countVal, status: 200, statusText: "OK" };
      }

      // SELECT results
      if (this.op === "SELECT") {
        const rows = res.rows;
        if (this.isMaybeSingle) {
          if (rows.length === 0) {
            return { data: null, error: null, status: 200, statusText: "OK" };
          }
          if (rows.length > 1) {
            return {
              data: null,
              error: {
                message: "JSON object requested, multiple (or no) rows returned",
                code: "PGRST116",
                details: "The result contains 2 or more rows while maybeSingle was requested",
              },
              status: 406,
              statusText: "Not Acceptable",
            };
          }
          return { data: rows[0], error: null, status: 200, statusText: "OK" };
        }

        if (this.isSingle) {
          if (rows.length !== 1) {
            return {
              data: null,
              error: {
                message: "JSON object requested, multiple (or no) rows returned",
                code: "PGRST116",
                details: `The result contains ${rows.length} rows while single was requested`,
              },
              status: 406,
              statusText: "Not Acceptable",
            };
          }
          return { data: rows[0], error: null, status: 200, statusText: "OK" };
        }

        const countVal = this.isCountExact ? rows.length : undefined;
        return { data: rows, error: null, count: countVal, status: 200, statusText: "OK" };
      }

      // INSERT results
      if (this.op === "INSERT") {
        const rows = res.rows;
        if (this.isSingle) {
          if (rows.length !== 1) {
            return {
              data: null,
              error: {
                message: "JSON object requested, multiple (or no) rows returned",
                code: "PGRST116",
                details: `The result contains ${rows.length} rows while single was requested`,
              },
              status: 406,
              statusText: "Not Acceptable",
            };
          }
          return { data: rows[0], error: null, status: 201, statusText: "Created" };
        }
        if (this.isMaybeSingle) {
          if (rows.length === 0) {
            return { data: null, error: null, status: 200, statusText: "OK" };
          }
          if (rows.length > 1) {
            return {
              data: null,
              error: {
                message: "JSON object requested, multiple (or no) rows returned",
                code: "PGRST116",
                details: "The result contains 2 or more rows while maybeSingle was requested",
              },
              status: 406,
              statusText: "Not Acceptable",
            };
          }
          return { data: rows[0], error: null, status: 201, statusText: "Created" };
        }
        if (Array.isArray(this.insertData)) {
          return { data: rows, error: null, status: 201, statusText: "Created" };
        }
        return { data: rows[0] || null, error: null, status: 201, statusText: "Created" };
      }

      // UPDATE results
      if (this.op === "UPDATE") {
        const rows = res.rows;
        if (this.isSingle) {
          if (rows.length !== 1) {
            return {
              data: null,
              error: {
                message: "JSON object requested, multiple (or no) rows returned",
                code: "PGRST116",
                details: `The result contains ${rows.length} rows while single was requested`,
              },
              status: 406,
              statusText: "Not Acceptable",
            };
          }
          return { data: rows[0], error: null, status: 200, statusText: "OK" };
        }
        if (this.isMaybeSingle) {
          if (rows.length === 0) {
            return { data: null, error: null, status: 200, statusText: "OK" };
          }
          if (rows.length > 1) {
            return {
              data: null,
              error: {
                message: "JSON object requested, multiple (or no) rows returned",
                code: "PGRST116",
                details: "The result contains 2 or more rows while maybeSingle was requested",
              },
              status: 406,
              statusText: "Not Acceptable",
            };
          }
          return { data: rows[0], error: null, status: 200, statusText: "OK" };
        }
        return { data: rows, error: null, status: 200, statusText: "OK" };
      }

      // DELETE results
      if (this.op === "DELETE") {
        return {
          data: this.returningCols ? res.rows : null,
          error: null,
          status: 200,
          statusText: "OK",
        };
      }

      return { data: res.rows, error: null, status: 200, statusText: "OK" };
    } catch (err: any) {
      return {
        data: null,
        error: {
          message: err.message || String(err),
          code: err.code || "PG_ERROR",
          details: err.detail || null,
          hint: err.hint || null,
        },
        status: 500,
        statusText: "Internal Server Error",
      };
    }
  }

  then<TResult1 = PostgresQueryResult<any>, TResult2 = never>(
    onfulfilled?: ((value: PostgresQueryResult<any>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<PostgresQueryResult<any> | TResult> {
    return this.execute().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<PostgresQueryResult<any>> {
    return this.execute().finally(onfinally);
  }
}

export interface PostgresPoolLike {
  connect: () => Promise<PoolClient>;
  query: (sql: string, params?: any[]) => Promise<any>;
}

export interface PostgresClientLike {
  query: (sql: string, params?: any[]) => Promise<any>;
  release: () => void;
}

export type PostgresConnectionSource =
  | PostgresClientLike
  | PostgresPoolLike
  | PoolClient
  | Pool
  | QueryRunner;

/**
 * Universal executor conforming to the interface expected by SupabaseStore methods,
 * supporting both autocommit pool queries and transactional single-client queries with savepoints.
 */
export class PostgresExecutor {
  private runner: QueryRunner;
  private client: (PoolClient | PostgresClientLike) | null = null;
  private customPool: (Pool | PostgresPoolLike) | null = null;
  private isTransaction: boolean = false;
  private isCompleted: boolean = false;
  private savepointCounter: number = 0;

  constructor(
    clientOrPoolOrRunner?: PostgresConnectionSource,
    isTransaction: boolean = false
  ) {
    this.isTransaction = isTransaction;

    if (
      clientOrPoolOrRunner &&
      typeof (clientOrPoolOrRunner as any).query === "function" &&
      typeof (clientOrPoolOrRunner as any).release === "function"
    ) {
      // Dedicated checked-out connection / PoolClient
      this.client = clientOrPoolOrRunner as PoolClient;
      this.runner = (sql, params) => {
        this.assertNotCompleted();
        return this.client!.query(sql, params);
      };
    } else if (
      clientOrPoolOrRunner &&
      typeof (clientOrPoolOrRunner as any).query === "function" &&
      typeof (clientOrPoolOrRunner as any).connect === "function"
    ) {
      // Connection Pool instance
      this.customPool = clientOrPoolOrRunner as Pool;
      this.runner = (sql, params) => {
        this.assertNotCompleted();
        return this.customPool!.query(sql, params);
      };
    } else if (typeof clientOrPoolOrRunner === "function") {
      // Direct QueryRunner function
      this.runner = (sql, params) => {
        this.assertNotCompleted();
        return (clientOrPoolOrRunner as QueryRunner)(sql, params);
      };
    } else if (clientOrPoolOrRunner) {
      // Generic queryable object
      this.runner = (sql, params) => {
        this.assertNotCompleted();
        return (clientOrPoolOrRunner as any).query(sql, params);
      };
    } else {
      // Default: active connection pool
      this.runner = (sql, params) => {
        this.assertNotCompleted();
        return getPostgresPool().query(sql, params);
      };
    }
  }

  /**
   * Asserts that this executor has not completed or released its transaction.
   * Throws an explicit error if a caller attempts to execute queries after COMMIT or ROLLBACK.
   */
  private assertNotCompleted(): void {
    if (this.isCompleted) {
      throw new Error(
        "[POSTGRES TRANSACTION ERROR] Cannot execute query: transaction has already completed (committed or rolled back)."
      );
    }
  }

  /**
   * Marks this transaction-scoped executor as completed and invalidates future queries.
   */
  public markCompleted(): void {
    this.isCompleted = true;
  }

  /**
   * Returns whether this executor is running inside an active transaction.
   */
  public get inTransaction(): boolean {
    return this.isTransaction;
  }

  from(tableName: string): PostgresQueryBuilder {
    this.assertNotCompleted();
    return new PostgresQueryBuilder(tableName, this.runner);
  }

  /**
   * Invokes a PostgreSQL stored function using explicit named parameter mapping.
   * Format: SELECT * FROM public."fn"("arg1" => $1, "arg2" => $2)
   */
  async rpc(fn: string, args: Record<string, any> = {}): Promise<PostgresQueryResult<any>> {
    this.assertNotCompleted();
    try {
      const safeFn = assertValidIdentifier(fn, "function");
      const argKeys = Object.keys(args);
      const params: any[] = [];
      const namedPlaceholders: string[] = [];

      for (const key of argKeys) {
        const safeKey = assertValidIdentifier(key, "argument");
        params.push(serializePgParam(args[key]));
        namedPlaceholders.push(`"${safeKey}" => $${params.length}`);
      }

      const sql = `SELECT * FROM public."${safeFn}"(${namedPlaceholders.join(", ")})`;
      const res = await this.runner(sql, params);
      return { data: res.rows, error: null, status: 200, statusText: "OK" };
    } catch (err: any) {
      return {
        data: null,
        error: {
          message: err.message || String(err),
          code: err.code || "PG_RPC_ERROR",
          details: err.detail || null,
          hint: err.hint || null,
        },
        status: 500,
        statusText: "Internal Server Error",
      };
    }
  }

  /**
   * Executes a callback within a managed PostgreSQL transaction.
   *
   * Root Transaction Guarantees:
   * 1. Checks out one dedicated PoolClient from the connection pool.
   * 2. Issues BEGIN on that dedicated client.
   * 3. Passes a transaction-scoped PostgresExecutor bound exclusively to that client.
   * 4. Issues COMMIT on that client if the callback succeeds.
   * 5. Issues ROLLBACK on that client if the callback throws an error.
   * 6. Always releases the client in finally block.
   * 7. Marks the transaction-scoped executor as completed to prevent post-transaction queries.
   * 8. If ROLLBACK also fails, logs the rollback failure and re-throws the original error without masking it.
   *
   * Nested Transaction Guarantees:
   * 1. If called on an active transaction executor, creates an isolated SAVEPOINT (sp_1, sp_2, ...).
   * 2. Issues RELEASE SAVEPOINT on success.
   * 3. Issues ROLLBACK TO SAVEPOINT on error and re-throws the error.
   * 4. Callers can safely catch nested errors without invalidating the outer transaction.
   */
  async transaction<T>(callback: (tx: PostgresExecutor) => Promise<T>): Promise<T> {
    this.assertNotCompleted();

    // 1. NESTED TRANSACTION (SAVEPOINT)
    if (this.client) {
      const spIndex = ++this.savepointCounter;
      const spName = `sp_${spIndex}`;
      await this.client.query(`SAVEPOINT ${spName}`);
      try {
        const result = await callback(this);
        await this.client.query(`RELEASE SAVEPOINT ${spName}`);
        return result;
      } catch (nestedErr) {
        try {
          await this.client.query(`ROLLBACK TO SAVEPOINT ${spName}`);
        } catch (spRollbackErr: any) {
          console.error(
            `[POSTGRES TRANSACTION ERROR] Rollback to savepoint "${spName}" failed:`,
            spRollbackErr?.message || String(spRollbackErr)
          );
          if (nestedErr && typeof nestedErr === "object") {
            try {
              (nestedErr as any).rollbackError = spRollbackErr;
            } catch {
              // Ignore if frozen
            }
          }
        }
        throw nestedErr;
      }
    }

    // 2. ROOT TRANSACTION (BEGIN / COMMIT / ROLLBACK)
    const pool = this.customPool || getPostgresPool();
    const client = await pool.connect();
    const txExecutor = new PostgresExecutor(client, true);

    try {
      await client.query("BEGIN");
      const result = await callback(txExecutor);
      await client.query("COMMIT");
      return result;
    } catch (originalErr) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackErr: any) {
        console.error(
          "[POSTGRES TRANSACTION ROLLBACK ERROR] Rollback failed:",
          rollbackErr?.message || String(rollbackErr)
        );
        if (originalErr && typeof originalErr === "object") {
          try {
            (originalErr as any).rollbackError = rollbackErr;
          } catch {
            // Ignore if frozen
          }
        }
      }
      throw originalErr;
    } finally {
      txExecutor.markCompleted();
      try {
        client.release();
      } catch (releaseErr: any) {
        console.error(
          "[POSTGRES CLIENT RELEASE ERROR] Failed to release pool client:",
          releaseErr?.message || String(releaseErr)
        );
      }
    }
  }
}

export const postgresExecutor = new PostgresExecutor();

