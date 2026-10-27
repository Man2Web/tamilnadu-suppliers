// ============================================================================
// TAMILNADU SUPPLIERS RENTAL ERP - DATA EXTRACTOR (POSTGREST & DIRECT PG)
// File: scripts/migration/extractor.ts
// ============================================================================

import { Pool } from "pg";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { SourceConfig, TableExtractionResult } from "./types";
import { AUTHORITATIVE_TABLE_GRAPH } from "./dependencyGraph";

/**
 * Interface for pluggable data extraction providers.
 */
export interface IDataExtractor {
  extractTable(tableName: string, batchSize?: number): Promise<TableExtractionResult>;
  inspectSchema(): Promise<{ tables: string[]; accessible: boolean }>;
  close(): Promise<void>;
}

/**
 * Direct PostgreSQL Extractor using keyset / chunked streaming.
 */
export class PostgresDataExtractor implements IDataExtractor {
  private pool: Pool;
  private schema: string;

  constructor(connectionString: string, schema: string = "public") {
    this.pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 10000,
    });
    this.schema = schema;
  }

  async inspectSchema(): Promise<{ tables: string[]; accessible: boolean }> {
    const res = await this.pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name;`,
      [this.schema]
    );
    const tables = res.rows.map((r) => r.table_name);
    return { tables, accessible: true };
  }

  async extractTable(tableName: string, batchSize: number = 1000): Promise<TableExtractionResult> {
    const startTime = Date.now();
    const tableDef = AUTHORITATIVE_TABLE_GRAPH.find((t) => t.name === tableName);
    const pk = tableDef ? tableDef.primaryKey : "id";

    const records: Array<Record<string, any>> = [];
    let lastId: any = null;
    let hasMore = true;
    let pageCount = 0;

    while (hasMore) {
      let query: string;
      let params: any[];

      if (lastId === null) {
        query = `SELECT * FROM "${this.schema}"."${tableName}" ORDER BY "${pk}" ASC LIMIT $1;`;
        params = [batchSize];
      } else {
        query = `SELECT * FROM "${this.schema}"."${tableName}" WHERE "${pk}" > $1 ORDER BY "${pk}" ASC LIMIT $2;`;
        params = [lastId, batchSize];
      }

      const res = await this.pool.query(query, params);
      pageCount++;

      if (res.rows.length === 0) {
        hasMore = false;
        break;
      }

      for (const row of res.rows) {
        records.push(row);
      }

      const currentLastId = res.rows[res.rows.length - 1][pk];
      if (currentLastId === lastId) {
        throw new Error(
          `[EXTRACTION STALL DETECTED] Keyset pagination stalled on table '${tableName}' with key '${currentLastId}'`
        );
      }
      lastId = currentLastId;

      if (res.rows.length < batchSize) {
        hasMore = false;
      }
    }

    return {
      tableName,
      records,
      totalCount: records.length,
      extractedPages: pageCount,
      durationMs: Date.now() - startTime,
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Supabase / PostgREST Extractor with deterministic keyset pagination.
 */
export class SupabaseApiExtractor implements IDataExtractor {
  private client: SupabaseClient;

  constructor(url: string, key: string) {
    this.client = createClient(url, key, {
      auth: { persistSession: false },
    });
  }

  async inspectSchema(): Promise<{ tables: string[]; accessible: boolean }> {
    // Probe a root table (companies) to verify connectivity
    const { error } = await this.client.from("companies").select("id").limit(1);
    if (error) {
      return { tables: [], accessible: false };
    }
    const tables = AUTHORITATIVE_TABLE_GRAPH.map((t) => t.name);
    return { tables, accessible: true };
  }

  async extractTable(tableName: string, batchSize: number = 1000): Promise<TableExtractionResult> {
    const startTime = Date.now();
    const tableDef = AUTHORITATIVE_TABLE_GRAPH.find((t) => t.name === tableName);
    const pk = tableDef ? tableDef.primaryKey : "id";

    const records: Array<Record<string, any>> = [];
    let lastId: any = null;
    let hasMore = true;
    let pageCount = 0;

    while (hasMore) {
      let query = this.client
        .from(tableName)
        .select("*")
        .order(pk, { ascending: true })
        .limit(batchSize);

      if (lastId !== null) {
        query = query.gt(pk, lastId);
      }

      const { data, error } = await query;
      pageCount++;

      if (error) {
        throw new Error(`[POSTGREST EXTRACTION FAILED] Table '${tableName}': ${error.message}`);
      }

      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }

      for (const row of data) {
        records.push(row);
      }

      const currentLastId = data[data.length - 1][pk];
      if (currentLastId === lastId) {
        throw new Error(
          `[EXTRACTION STALL DETECTED] Keyset pagination stalled on table '${tableName}' with key '${currentLastId}'`
        );
      }
      lastId = currentLastId;

      if (data.length < batchSize) {
        hasMore = false;
      }
    }

    return {
      tableName,
      records,
      totalCount: records.length,
      extractedPages: pageCount,
      durationMs: Date.now() - startTime,
    };
  }

  async close(): Promise<void> {
    // No persistent connection pool for HTTP client
  }
}

/**
 * In-Memory Synthetic Extractor for unit tests, offline simulations, and safe fixtures.
 */
export class InMemoryFixtureExtractor implements IDataExtractor {
  private fixtures: Record<string, Array<Record<string, any>>>;

  constructor(fixtures: Record<string, Array<Record<string, any>>> = {}) {
    this.fixtures = fixtures;
  }

  async inspectSchema(): Promise<{ tables: string[]; accessible: boolean }> {
    return {
      tables: Object.keys(this.fixtures),
      accessible: true,
    };
  }

  async extractTable(tableName: string, batchSize: number = 1000): Promise<TableExtractionResult> {
    const startTime = Date.now();
    const rows = this.fixtures[tableName] || [];
    const tableDef = AUTHORITATIVE_TABLE_GRAPH.find((t) => t.name === tableName);
    const pk = tableDef ? tableDef.primaryKey : "id";

    // Simulate keyset pagination across batchSize
    const sorted = [...rows].sort((a, b) => String(a[pk] || "").localeCompare(String(b[pk] || "")));
    const pages = Math.ceil(sorted.length / batchSize) || 1;

    return {
      tableName,
      records: sorted,
      totalCount: sorted.length,
      extractedPages: pages,
      durationMs: Date.now() - startTime,
    };
  }

  async close(): Promise<void> {}
}

/**
 * Factory creating the appropriate extractor based on source configuration.
 */
export function createDataExtractor(source: SourceConfig): IDataExtractor {
  if (source.type === "postgres" && source.connectionString) {
    return new PostgresDataExtractor(source.connectionString, source.schema || "public");
  }
  if (source.type === "supabase-api" && source.url && source.serviceRoleKey) {
    return new SupabaseApiExtractor(source.url, source.serviceRoleKey);
  }
  throw new Error(
    `[EXTRACTOR CONFIG ERROR] Unsupported or incomplete source configuration: type='${source.type}'`
  );
}
