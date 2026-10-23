import { NextResponse } from "next/server";
import { checkAnyPermissionGuardAsync } from "@/lib/auth/serverAuth";
import { ROUTE_PERMISSIONS } from "@/lib/auth/routePermissions";
import path from "path";
import fs from "fs";
import store from "@/lib/db/store";
import { previewProductExcel, buildProductsFromImport } from "@/lib/excel/product-importer";

export async function POST(req: Request) {
  const denied = await checkAnyPermissionGuardAsync(req, [...ROUTE_PERMISSIONS.productImport]);
  if (denied) return denied;
  try {
    const formData = await req.formData();
    const action = formData.get("action") as string; // 'preview' | 'execute'
    const file = formData.get("file") as File | null;
    const useSample = formData.get("useSample") === "true";

    let buffer: Buffer;
    let filename = "uploaded_file.xlsx";

    if (useSample) {
      const samplePath = path.join(process.cwd(), "data", "Comp0006_ListofItems.xlsx");
      if (!fs.existsSync(samplePath)) {
        return NextResponse.json({ error: "Sample Excel file not found on server" }, { status: 404 });
      }
      buffer = fs.readFileSync(samplePath);
      filename = "Comp0006_ListofItems.xlsx";
    } else if (file) {
      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      filename = file.name;
    } else {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const allProds = await store.getProducts();
    const existingNames = allProds.map((p) => p.name);
    const preview = previewProductExcel(buffer, filename, existingNames);

    if (action === "preview") {
      return NextResponse.json(preview);
    }

    // Execute Import
    const categories = await store.getCategories();
    const catMap: Record<string, string> = {};
    categories.forEach((c) => (catMap[c.name] = c.id));

    // Create any missing categories
    for (const catName of preview.categoriesFound) {
      if (!catMap[catName]) {
        const newCat = await store.createCategory({ name: catName });
        catMap[catName] = newCat.id;
      }
    }

    const importResult = buildProductsFromImport(preview.allRows, catMap);

    // Save into Product Master without fabricating prices or quantities
    let importedCount = 0;
    for (const prodData of importResult.importedProducts) {
      await store.createProduct(prodData as any);
      importedCount++;
    }

    return NextResponse.json({
      success: true,
      filename,
      totalProcessed: preview.allRows.length,
      importedCount,
      skippedCount: importResult.skippedCount,
      errors: importResult.errors,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
