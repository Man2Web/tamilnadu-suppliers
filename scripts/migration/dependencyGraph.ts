// ============================================================================
// TAMILNADU SUPPLIERS RENTAL ERP - DEPENDENCY GRAPH & TOPOLOGICAL ORDERING
// File: scripts/migration/dependencyGraph.ts
// ============================================================================

import { TableDependency } from "./types";

/**
 * Authoritative 26-table inventory derived directly from supabase/standalone-postgres-init.sql.
 * Defined with explicit foreign keys and dependency tiers.
 */
export const AUTHORITATIVE_TABLE_GRAPH: TableDependency[] = [
  // Tier 0: Root tables (no foreign keys to other tables)
  {
    name: "companies",
    tier: 0,
    primaryKey: "id",
    foreignKeys: [],
  },
  {
    name: "users",
    tier: 0,
    primaryKey: "id",
    foreignKeys: [],
  },
  {
    name: "customers",
    tier: 0,
    primaryKey: "id",
    foreignKeys: [],
  },
  {
    name: "login_rate_limits",
    tier: 0,
    primaryKey: "key",
    foreignKeys: [],
    // Policy decision: Can be initialized clean or migrated
    hasSpecialHandling: true,
  },
  {
    name: "categories",
    tier: 0,
    primaryKey: "id",
    foreignKeys: [
      {
        column: "parent_id",
        foreignTable: "categories",
        foreignColumn: "id",
        nullable: true,
        selfReferencing: true,
      },
    ],
    hasSpecialHandling: true, // Requires two-pass import for self-referencing parent_id
  },

  // Tier 1: Depends directly on Tier 0
  {
    name: "products",
    tier: 1,
    primaryKey: "id",
    foreignKeys: [
      { column: "category_id", foreignTable: "categories", foreignColumn: "id", nullable: true },
    ],
  },
  {
    name: "customer_branches",
    tier: 1,
    primaryKey: "id",
    foreignKeys: [
      { column: "customer_id", foreignTable: "customers", foreignColumn: "id", nullable: false },
    ],
  },
  {
    name: "product_imports",
    tier: 1,
    primaryKey: "id",
    foreignKeys: [
      { column: "created_by", foreignTable: "users", foreignColumn: "id", nullable: true },
    ],
  },
  {
    name: "sessions",
    tier: 1,
    primaryKey: "id",
    foreignKeys: [
      { column: "user_id", foreignTable: "users", foreignColumn: "id", nullable: false },
      { column: "rejected_by_user_id", foreignTable: "users", foreignColumn: "id", nullable: true },
    ],
    // Policy decision: Sessions are invalidated on cutover
    hasSpecialHandling: true,
  },
  {
    name: "activity_notifications",
    tier: 1,
    primaryKey: "id",
    foreignKeys: [
      { column: "user_id", foreignTable: "users", foreignColumn: "id", nullable: false },
    ],
  },
  {
    name: "audit_logs",
    tier: 1,
    primaryKey: "id",
    foreignKeys: [
      { column: "actor_id", foreignTable: "users", foreignColumn: "id", nullable: true },
    ],
  },
  {
    name: "whatsapp_logs",
    tier: 1,
    primaryKey: "id",
    foreignKeys: [
      { column: "created_by", foreignTable: "users", foreignColumn: "id", nullable: true },
    ],
  },

  // Tier 2: Commercial headers (Quotations)
  {
    name: "quotations",
    tier: 2,
    primaryKey: "id",
    foreignKeys: [
      { column: "company_id", foreignTable: "companies", foreignColumn: "id", nullable: false },
      { column: "created_by", foreignTable: "users", foreignColumn: "id", nullable: true },
    ],
  },
  {
    name: "quotation_branches",
    tier: 2,
    primaryKey: "id",
    foreignKeys: [
      { column: "quotation_id", foreignTable: "quotations", foreignColumn: "id", nullable: false },
      { column: "customer_branch_id", foreignTable: "customer_branches", foreignColumn: "id", nullable: true },
    ],
  },
  {
    name: "quotation_items",
    tier: 2,
    primaryKey: "id",
    foreignKeys: [
      { column: "quotation_branch_id", foreignTable: "quotation_branches", foreignColumn: "id", nullable: false },
      { column: "quotation_id", foreignTable: "quotations", foreignColumn: "id", nullable: false },
      { column: "product_id", foreignTable: "products", foreignColumn: "id", nullable: true },
    ],
  },

  // Tier 3: Bills and financial entities
  {
    name: "bills",
    tier: 3,
    primaryKey: "id",
    foreignKeys: [
      { column: "company_id", foreignTable: "companies", foreignColumn: "id", nullable: false },
      { column: "source_quotation_id", foreignTable: "quotations", foreignColumn: "id", nullable: true },
      { column: "created_by", foreignTable: "users", foreignColumn: "id", nullable: true },
    ],
  },
  {
    name: "bill_branches",
    tier: 3,
    primaryKey: "id",
    foreignKeys: [
      { column: "bill_id", foreignTable: "bills", foreignColumn: "id", nullable: false },
      { column: "customer_branch_id", foreignTable: "customer_branches", foreignColumn: "id", nullable: true },
    ],
  },
  {
    name: "bill_items",
    tier: 3,
    primaryKey: "id",
    foreignKeys: [
      { column: "bill_branch_id", foreignTable: "bill_branches", foreignColumn: "id", nullable: false },
      { column: "bill_id", foreignTable: "bills", foreignColumn: "id", nullable: false },
      { column: "product_id", foreignTable: "products", foreignColumn: "id", nullable: true },
    ],
  },
  {
    name: "payments",
    tier: 3,
    primaryKey: "id",
    foreignKeys: [
      { column: "bill_id", foreignTable: "bills", foreignColumn: "id", nullable: true },
      { column: "company_id", foreignTable: "companies", foreignColumn: "id", nullable: false },
      { column: "created_by", foreignTable: "users", foreignColumn: "id", nullable: true },
    ],
  },
  {
    name: "reservations",
    tier: 3,
    primaryKey: "id",
    foreignKeys: [
      { column: "quotation_id", foreignTable: "quotations", foreignColumn: "id", nullable: true },
      { column: "bill_id", foreignTable: "bills", foreignColumn: "id", nullable: true },
      { column: "company_id", foreignTable: "companies", foreignColumn: "id", nullable: false },
      { column: "created_by", foreignTable: "users", foreignColumn: "id", nullable: true },
    ],
  },
  {
    name: "reservation_items",
    tier: 3,
    primaryKey: "id",
    foreignKeys: [
      { column: "reservation_id", foreignTable: "reservations", foreignColumn: "id", nullable: false },
      { column: "product_id", foreignTable: "products", foreignColumn: "id", nullable: true },
    ],
  },

  // Tier 4: Warehouse operations and physical movements
  {
    name: "gate_passes",
    tier: 4,
    primaryKey: "id",
    foreignKeys: [
      { column: "company_id", foreignTable: "companies", foreignColumn: "id", nullable: false },
      { column: "reservation_id", foreignTable: "reservations", foreignColumn: "id", nullable: true },
      { column: "bill_id", foreignTable: "bills", foreignColumn: "id", nullable: true },
      { column: "created_by", foreignTable: "users", foreignColumn: "id", nullable: true },
    ],
  },
  {
    name: "gate_pass_items",
    tier: 4,
    primaryKey: "id",
    foreignKeys: [
      { column: "gate_pass_id", foreignTable: "gate_passes", foreignColumn: "id", nullable: false },
      { column: "product_id", foreignTable: "products", foreignColumn: "id", nullable: true },
    ],
  },
  {
    name: "returns",
    tier: 4,
    primaryKey: "id",
    foreignKeys: [
      { column: "gate_pass_id", foreignTable: "gate_passes", foreignColumn: "id", nullable: false },
      { column: "company_id", foreignTable: "companies", foreignColumn: "id", nullable: false },
      { column: "created_by", foreignTable: "users", foreignColumn: "id", nullable: true },
    ],
  },
  {
    name: "return_items",
    tier: 4,
    primaryKey: "id",
    foreignKeys: [
      { column: "return_id", foreignTable: "returns", foreignColumn: "id", nullable: false },
      { column: "product_id", foreignTable: "products", foreignColumn: "id", nullable: true },
      { column: "gate_pass_item_id", foreignTable: "gate_pass_items", foreignColumn: "id", nullable: true },
    ],
  },
  {
    name: "inventory_movements",
    tier: 4,
    primaryKey: "id",
    foreignKeys: [
      { column: "product_id", foreignTable: "products", foreignColumn: "id", nullable: false },
      { column: "created_by", foreignTable: "users", foreignColumn: "id", nullable: true },
    ],
  },
];

/**
 * Performs Kahn's algorithm topological sort on the table dependency graph.
 * Detects cyclic dependencies and returns tables in strict insertion order.
 */
export function getTopologicalOrder(tables: TableDependency[] = AUTHORITATIVE_TABLE_GRAPH): string[] {
  const inDegree: Map<string, number> = new Map();
  const adjList: Map<string, string[]> = new Map();

  for (const t of tables) {
    inDegree.set(t.name, 0);
    adjList.set(t.name, []);
  }

  for (const t of tables) {
    for (const fk of t.foreignKeys) {
      if (fk.selfReferencing || fk.foreignTable === t.name) {
        // Self-references are handled in a second pass; skip for inter-table topological sorting
        continue;
      }
      if (adjList.has(fk.foreignTable)) {
        adjList.get(fk.foreignTable)!.push(t.name);
        inDegree.set(t.name, (inDegree.get(t.name) || 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const [name, deg] of inDegree.entries()) {
    if (deg === 0) {
      queue.push(name);
    }
  }

  const sorted: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    const dependents = adjList.get(current) || [];
    for (const dep of dependents) {
      inDegree.set(dep, inDegree.get(dep)! - 1);
      if (inDegree.get(dep) === 0) {
        queue.push(dep);
      }
    }
  }

  if (sorted.length !== tables.length) {
    const unvisited = tables.filter((t) => !sorted.includes(t.name)).map((t) => t.name);
    throw new Error(
      `[CYCLIC DEPENDENCY DETECTED] Topological sort failed. Cycle detected involving tables: ${unvisited.join(", ")}`
    );
  }

  return sorted;
}
