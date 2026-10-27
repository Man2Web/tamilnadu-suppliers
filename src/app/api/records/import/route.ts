// ============================================================================
// IMPORT OF OLDER RECORDS FROM EXCEL
//   GET  -> downloads the Excel template
//   POST -> action=preview (validate only) | action=execute (validate again, then write)
// The file is always re-validated on the server; the preview shown to the user is never trusted.
// ============================================================================

import { NextResponse } from "next/server";
import store from "@/lib/db/store";
import { checkAnyPermissionGuardAsync, getActorFromRequestAsync } from "@/lib/auth/serverAuth";
import { ROUTE_PERMISSIONS } from "@/lib/auth/routePermissions";
import {
  buildImportTemplate,
  parseRecordsWorkbook,
  MAX_IMPORT_FILE_BYTES,
  type ImportContext,
} from "@/lib/excel/records-importer";
import { executeImport } from "@/lib/excel/records-import-executor";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await checkAnyPermissionGuardAsync(req, [...ROUTE_PERMISSIONS.recordsImport]);
  if (denied) return denied;
  const body = buildImportTemplate();
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="tamilnadu-suppliers-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}

async function buildContext(defaultCompanyId?: string): Promise<ImportContext> {
  const [companies, customers, bills, products, categories] = await Promise.all([
    store.getCompanies(),
    store.getCustomers(),
    store.getBills(),
    store.getProducts(),
    store.getCategories(),
  ]);
  return {
    companies: companies.map((c) => ({
      id: c.id,
      name: c.name,
      displayName: c.displayName,
      invoicePrefix: c.invoicePrefix,
      gstType: c.gstType,
      placeOfSupply: c.placeOfSupply,
    })),
    defaultCompanyId: defaultCompanyId || undefined,
    existingCustomers: customers.map((c) => ({ id: c.id, name: c.name, mobile: c.mobile })),
    existingBillNumbers: bills.map((b) => b.billNumber),
    existingProducts: products.map((p) => ({ id: p.id, name: p.name, categoryName: p.categoryName })),
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
  };
}

export async function POST(req: Request) {
  const denied = await checkAnyPermissionGuardAsync(req, [...ROUTE_PERMISSIONS.recordsImport]);
  if (denied) return denied;

  try {
    const form = await req.formData();
    const action = String(form.get("action") || "preview");
    const file = form.get("file");
    const defaultCompanyId = String(form.get("defaultCompanyId") || "") || undefined;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      return NextResponse.json({ error: "Please upload an Excel file (.xlsx or .xls)." }, { status: 400 });
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      return NextResponse.json({ error: `The file is larger than ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB.` }, { status: 413 });
    }
    if (action !== "preview" && action !== "execute") {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ctx = await buildContext(defaultCompanyId);
    const preview = parseRecordsWorkbook(buffer, ctx);

    if (action === "preview") {
      return NextResponse.json({ filename: file.name, preview });
    }

    if (!preview.summary.importable) {
      return NextResponse.json(
        { error: "Nothing can be imported. Fix the problems shown in the preview first.", preview },
        { status: 422 }
      );
    }

    const actor = await getActorFromRequestAsync(req);
    const result = await executeImport(store, preview, actor);
    return NextResponse.json({ filename: file.name, result });
  } catch (error: unknown) {
    console.error("POST /api/records/import failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "The import failed unexpectedly. Nothing further was written." }, { status: 500 });
  }
}
