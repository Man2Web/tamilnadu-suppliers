// ============================================================================
// EXCEL PRODUCT IMPORT ENGINE
// Specialized for Catalog Item Lists (e.g., Comp0006_ListofItems.xlsx)
// ============================================================================

import * as XLSX from "xlsx";
import { Product } from "../types";

export interface ExcelImportRow {
  rowIndex: number;
  name: string;
  alias?: string | null;
  underGroup: string;
  isValid: boolean;
  validationError?: string;
}

export interface ExcelImportPreview {
  filename: string;
  totalRowsFound: number;
  detectedHeaderRow: number;
  validRowsCount: number;
  invalidRowsCount: number;
  duplicateRowsCount: number;
  categoriesFound: string[];
  previewRows: ExcelImportRow[];
  allRows: ExcelImportRow[];
}

export interface ImportResult {
  totalProcessed: number;
  importedCount: number;
  skippedCount: number;
  createdCategories: string[];
  importedProducts: Partial<Product>[];
  errors: Array<{ row: number; item: string; error: string }>;
}

/**
 * Parses an Excel buffer or file path, scans for headers, and validates rows
 */
export function previewProductExcel(
  fileBufferOrPath: Buffer | string,
  filename: string,
  existingProductNames: string[] = []
): ExcelImportPreview {
  let workbook: XLSX.WorkBook;

  if (typeof fileBufferOrPath === "string") {
    workbook = XLSX.readFile(fileBufferOrPath);
  } else {
    workbook = XLSX.read(fileBufferOrPath, { type: "buffer" });
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  let detectedHeaderRow = -1;
  let nameColIdx = 0;
  let aliasColIdx = 1;
  let groupColIdx = 2;

  // 1. Locate true header row (look for "Name" and either "Alias" or "Under Group")
  for (let r = 0; r < Math.min(rawRows.length, 25); r++) {
    const row = rawRows[r] || [];
    const rowStrings = row.map((c) => String(c || "").trim().toLowerCase());

    const nIdx = rowStrings.indexOf("name");
    const gIdx = rowStrings.findIndex((s) => s.includes("group") || s.includes("category"));

    if (nIdx !== -1) {
      detectedHeaderRow = r;
      nameColIdx = nIdx;
      const aIdx = rowStrings.indexOf("alias");
      if (aIdx !== -1) aliasColIdx = aIdx;
      if (gIdx !== -1) groupColIdx = gIdx;
      break;
    }
  }

  // Fallback if header not explicitly labeled
  if (detectedHeaderRow === -1) {
    detectedHeaderRow = 4; // Standard row 4 in exported List of Items sheets
  }

  const existingSet = new Set(existingProductNames.map((n) => n.trim().toLowerCase()));
  const seenInFile = new Set<string>();
  const categoriesSet = new Set<string>();

  const allRows: ExcelImportRow[] = [];
  let validRowsCount = 0;
  let invalidRowsCount = 0;
  let duplicateRowsCount = 0;

  for (let r = detectedHeaderRow + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    const rawName = row[nameColIdx];
    if (!rawName || typeof rawName !== "string" || rawName.trim().length === 0) {
      continue; // Skip blank / metadata rows
    }

    const name = String(rawName).trim();
    const rawAlias = row[aliasColIdx];
    const alias = rawAlias ? String(rawAlias).trim() : null;
    const rawGroup = row[groupColIdx];
    const underGroup = rawGroup ? String(rawGroup).trim() : "General";

    categoriesSet.add(underGroup);

    const nameLower = name.toLowerCase();
    let isValid = true;
    let validationError: string | undefined;

    if (seenInFile.has(nameLower)) {
      isValid = false;
      validationError = "Duplicate item name within Excel file";
      duplicateRowsCount++;
    } else if (existingSet.has(nameLower)) {
      isValid = false;
      validationError = "Item name already exists in database";
      duplicateRowsCount++;
    } else {
      seenInFile.add(nameLower);
      validRowsCount++;
    }

    if (!isValid) {
      invalidRowsCount++;
    }

    allRows.push({
      rowIndex: r + 1,
      name,
      alias,
      underGroup,
      isValid,
      validationError,
    });
  }

  return {
    filename,
    totalRowsFound: rawRows.length,
    detectedHeaderRow: detectedHeaderRow + 1,
    validRowsCount,
    invalidRowsCount,
    duplicateRowsCount,
    categoriesFound: Array.from(categoriesSet),
    previewRows: allRows.slice(0, 50),
    allRows,
  };
}

/**
 * Transforms validated rows into Product master records
 * Does NOT fabricate rental prices or inventory stock counts.
 */
export function buildProductsFromImport(
  rows: ExcelImportRow[],
  categoryMap: Record<string, string> = {} // groupName -> categoryId
): ImportResult {
  const importedProducts: Partial<Product>[] = [];
  const errors: Array<{ row: number; item: string; error: string }> = [];
  const createdCategories: string[] = [];

  for (const row of rows) {
    if (!row.isValid) {
      errors.push({
        row: row.rowIndex,
        item: row.name,
        error: row.validationError || "Invalid row",
      });
      continue;
    }

    const categoryId = categoryMap[row.underGroup] || null;

    importedProducts.push({
      name: row.name,
      alias: row.alias || null,
      categoryId,
      categoryName: row.underGroup,
      unit: "Nos",
      defaultRentalRate: 0.0, // NOT fabricated; configured manually by admin
      rentalRateUnit: "PER_DAY",
      minRentalDuration: 1,
      securityDepositAmount: 0.0,
      replacementValue: 0.0,
      totalOwnedQuantity: 0, // NOT fabricated; set through physical stock audit
      availableQuantity: 0,
      reservedQuantity: 0,
      rentedQuantity: 0,
      damagedQuantity: 0,
      missingQuantity: 0,
      maintenanceQuantity: 0,
      isActive: true,
      notes: `Imported from Excel (${row.underGroup})`,
    });
  }

  return {
    totalProcessed: rows.length,
    importedCount: importedProducts.length,
    skippedCount: errors.length,
    createdCategories,
    importedProducts,
    errors,
  };
}
