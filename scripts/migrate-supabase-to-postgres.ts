#!/usr/bin/env node
// ============================================================================
// TAMILNADU SUPPLIERS RENTAL ERP - SUPABASE TO POSTGRESQL MIGRATION TOOL
// File: scripts/migrate-supabase-to-postgres.ts
//
// USAGE:
//   npx tsx scripts/migrate-supabase-to-postgres.ts --mode <inspect|dry-run|import-disposable|reconcile> [options]
//
// SAFETY:
//   - Requires an explicit mode argument.
//   - Rejects remote hosts, production databases, and Supabase target URLs.
//   - Does NOT run automatically on app boot or build.
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { MigrationConfig, MigrationMode, SourceConfig, TargetConfig } from "./migration/types";
import { DataMigrator } from "./migration/migrator";
import { sanitizeError, redactUrl } from "./migration/safety";

function printUsage(): void {
  console.log(`
Tamilnadu Suppliers Rental ERP — Data Migration Tool (Supabase -> PostgreSQL)

USAGE:
  npx tsx scripts/migrate-supabase-to-postgres.ts --mode <MODE> [OPTIONS]

MODES (Explicit mode required; absence will not default to import):
  inspect            Validate schema parity, foreign keys, and connectivity without writing data
  dry-run            Extract, transform, and simulate import inside a rolled-back transaction
  import-disposable  Execute import into an approved empty disposable test database
  import-production  Import into the empty production database 'tamilnadu_suppliers' (requires --confirm-production)
  reconcile          Reconcile row counts, foreign key integrity, and financial arithmetic

OPTIONS:
  --source-type <type>        'postgres' or 'supabase-api' (env: MIGRATION_SOURCE_TYPE)
  --source-conn <connString>  Source connection string (env: MIGRATION_SOURCE_CONN or SOURCE_DATABASE_URL)
  --source-url <url>          Source Supabase URL (env: MIGRATION_SOURCE_URL or NEXT_PUBLIC_SUPABASE_URL)
  --source-key <key>          Source Service Role Key (env: MIGRATION_SOURCE_KEY or SUPABASE_SERVICE_ROLE_KEY)
  --target-host <host>        Target PostgreSQL host (default: 127.0.0.1, env: TEST_DB_HOST)
  --target-port <port>        Target PostgreSQL port (default: 5432, env: TEST_DB_PORT)
  --target-db <name>          Target database name (default: tns_disposable_test_2026, env: TEST_DB_NAME)
  --target-user <user>        Target username (default: tns_app_user, env: TEST_DB_USER)
  --target-password <pass>    Target password (env: TEST_DB_PASSWORD or TARGET_DB_PASSWORD)
  --batch-size <size>         Batch size for extraction/insertion (default: 1000)
  --confirm-production <phrase>  Unlocks the production target (must equal IMPORT-INTO-tamilnadu_suppliers). Also
                              allows inspect/dry-run/reconcile against it. Target must be empty for import.
  --only-tables <a,b,...>     Copy only these tables plus their foreign-key parents; all other tables stay empty
  --skip-sessions             Exclude user sessions from migration per cutover policy (default: true)
  --output <filePath>         Optional file path to write full JSON reconciliation report
  --help                      Print this usage screen
`);
}

function parseArgs(): { mode: MigrationMode; config: MigrationConfig; outputPath?: string } {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const getArg = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    if (idx !== -1 && idx + 1 < args.length) {
      return args[idx + 1];
    }
    return undefined;
  };

  const rawMode = getArg("--mode");
  if (!rawMode) {
    console.error("\n❌ [ERROR] Missing required argument: --mode <inspect|dry-run|import-disposable|reconcile>");
    printUsage();
    process.exit(1);
  }

  const validModes: MigrationMode[] = ["inspect", "dry-run", "import-disposable", "import-production", "reconcile"];
  if (!validModes.includes(rawMode as MigrationMode)) {
    console.error(`\n❌ [ERROR] Invalid mode: '${rawMode}'. Must be one of: ${validModes.join(", ")}`);
    process.exit(1);
  }
  const mode = rawMode as MigrationMode;

  // Resolve source configuration
  const sourceType = (
    getArg("--source-type") ||
    process.env.MIGRATION_SOURCE_TYPE ||
    (process.env.SOURCE_DATABASE_URL ? "postgres" : "supabase-api")
  ) as "postgres" | "supabase-api";

  const sourceConn =
    getArg("--source-conn") ||
    process.env.MIGRATION_SOURCE_CONN ||
    process.env.SOURCE_DATABASE_URL;

  const sourceUrl =
    getArg("--source-url") ||
    process.env.MIGRATION_SOURCE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const sourceKey =
    getArg("--source-key") ||
    process.env.MIGRATION_SOURCE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  const source: SourceConfig = {
    type: sourceType,
    connectionString: sourceConn,
    url: sourceUrl,
    serviceRoleKey: sourceKey,
  };

  // Resolve target configuration
  const targetHost = getArg("--target-host") || process.env.TEST_DB_HOST || "127.0.0.1";
  const targetPort = parseInt(getArg("--target-port") || process.env.TEST_DB_PORT || "5432", 10);
  const targetDb = getArg("--target-db") || process.env.TEST_DB_NAME || "tns_disposable_test_2026";
  const targetUser = getArg("--target-user") || process.env.TEST_DB_USER || "tns_app_user";
  const targetPassword = getArg("--target-password") || process.env.TEST_DB_PASSWORD || process.env.TARGET_DB_PASSWORD || "";

  const target: TargetConfig = {
    host: targetHost,
    port: targetPort,
    database: targetDb,
    user: targetUser,
    password: targetPassword,
  };

  const batchSize = parseInt(getArg("--batch-size") || "1000", 10);
  const skipSessions = !args.includes("--include-sessions");
  const outputPath = getArg("--output");

  const config: MigrationConfig = {
    mode,
    source,
    target,
    options: {
      batchSize,
      skipSessions,
      outputPath,
      verbose: args.includes("--verbose"),
      onlyTables: getArg("--only-tables")?.split(",").map((t) => t.trim()).filter(Boolean),
      productionTarget: getArg("--confirm-production") ? { confirm: getArg("--confirm-production") as string } : undefined,
    },
  };

  return { mode, config, outputPath };
}

async function main(): Promise<void> {
  const { mode, config, outputPath } = parseArgs();

  console.log(`================================================================`);
  console.log(`  TAMILNADU SUPPLIERS — POSTGRESQL DATA MIGRATION RUNNER        `);
  console.log(`================================================================`);
  console.log(`Execution Mode : ${mode.toUpperCase()}`);
  console.log(`Target Host    : ${config.target.host}:${config.target.port}`);
  console.log(`Target Database: ${config.target.database} (User: ${config.target.user})`);
  console.log(`Source Type    : ${config.source.type} (${redactUrl(config.source.url || config.source.connectionString)})`);
  console.log(`================================================================\n`);

  if (!config.target.password) {
    console.error(`❌ [ERROR] Target database password is missing. Set TEST_DB_PASSWORD / TARGET_DB_PASSWORD or pass --target-password.`);
    process.exit(1);
  }

  let migrator: DataMigrator;
  try {
    migrator = new DataMigrator(config);
  } catch (err: any) {
    console.error(`❌ [CONFIGURATION ERROR] ${sanitizeError(err)}`);
    process.exit(1);
  }

  try {
    const result = await migrator.execute();
    console.log(result.summary);

    if (outputPath && result.report) {
      const fullPath = path.resolve(process.cwd(), outputPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, JSON.stringify(result.report, null, 2), "utf8");
      console.log(`\n📄 Reconciliation report saved to: ${fullPath}`);
    }

    await migrator.close();

    if (!result.success) {
      console.error(`\n❌ Migration failed validation checks.`);
      process.exit(1);
    }

    console.log(`\n✅ Migration run completed successfully.`);
    process.exit(0);
  } catch (err: any) {
    console.error(`\n💥 [FATAL EXECUTION FAILURE] ${sanitizeError(err)}`);
    await migrator.close().catch(() => {});
    process.exit(1);
  }
}

// Only execute main if invoked directly as CLI script
if (require.main === module || process.argv[1]?.endsWith("migrate-supabase-to-postgres.ts")) {
  main();
}
