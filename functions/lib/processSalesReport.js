"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processSalesReport = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const papaparse_1 = __importDefault(require("papaparse"));
const exceljs_1 = __importDefault(require("exceljs"));
/**
 * Parse a number from various formats and convert to standard JavaScript number format.
 * Converts formats like "2.832,79" → 2832.79 (standard format with dot as decimal separator)
 *
 * Supports formats like:
 * - "2.990,80" (European: dot for thousands, comma for decimal) → 2990.8
 * - "2.832,79" (European: dot for thousands, comma for decimal) → 2832.79
 * - "2,990.80" (US: comma for thousands, dot for decimal) → 2990.8
 * - "2990.80" (simple decimal) → 2990.8
 * - "£2,990.80" or "£2.990,80" (with currency symbol) → 2990.8
 * - "2 990,80" (space as thousands separator) → 2990.8
 * - "367,40" (European decimal, no thousands) → 367.4
 */
function parseNumber(value) {
    if (value === null || value === undefined || value === '') {
        return 0;
    }
    // If already a number, return it (already in standard format)
    if (typeof value === 'number') {
        return isNaN(value) ? 0 : value;
    }
    // Convert to string and clean
    let str = String(value).trim();
    // Remove currency symbols, currency words (GBP, USD, EUR, etc.), and spaces
    str = str.replace(/[£$€₺¥₹\s]/g, '');
    // Remove common currency codes (case insensitive)
    str = str.replace(/\b(GBP|USD|EUR|TRY|JPY|INR|GBP|£|\$|€)\b/gi, '');
    // Remove any remaining non-numeric characters except dots, commas, and minus
    // But keep the structure for format detection
    str = str.trim();
    // If empty after cleaning, return 0
    if (!str || str === '-' || str === '--') {
        return 0;
    }
    // Try direct parse first (for simple numbers without separators)
    // But skip if it has dots or commas (might be formatted number)
    if (!str.includes(',') && !str.includes('.')) {
        const directParse = Number(str);
        if (!isNaN(directParse)) {
            return directParse;
        }
    }
    // Detect format by counting dots and commas
    const dotCount = (str.match(/\./g) || []).length;
    const commaCount = (str.match(/,/g) || []).length;
    // European format: "2.832,79" or "2.990,80" (dot = thousands, comma = decimal)
    // Pattern: has dots AND comma, comma comes after last dot
    if (dotCount > 0 && commaCount === 1 && str.lastIndexOf(',') > str.lastIndexOf('.')) {
        // Remove all dots (thousands separators), replace comma with dot (decimal separator)
        str = str.replace(/\./g, '').replace(',', '.');
        const parsed = Number(str);
        return isNaN(parsed) ? 0 : parsed;
    }
    // European format without thousands: "367,40" (only comma, likely decimal)
    if (commaCount === 1 && dotCount === 0) {
        // Check if comma is likely decimal (2-3 digits after comma)
        const commaIndex = str.indexOf(',');
        const afterComma = str.substring(commaIndex + 1);
        if (afterComma.length <= 3 && /^\d+$/.test(afterComma)) {
            // Likely decimal separator
            str = str.replace(',', '.');
            const parsed = Number(str);
            if (!isNaN(parsed)) {
                return parsed;
            }
        }
    }
    // US format: "2,990.80" (comma = thousands, dot = decimal)
    // Pattern: has comma AND dot, dot comes after last comma
    if (commaCount > 0 && dotCount === 1 && str.lastIndexOf('.') > str.lastIndexOf(',')) {
        // Remove all commas (thousands separators), keep dot (decimal separator)
        str = str.replace(/,/g, '');
        const parsed = Number(str);
        return isNaN(parsed) ? 0 : parsed;
    }
    // Multiple dots or commas - try European format first (last comma is decimal)
    if (commaCount > 0) {
        // Remove all dots, replace last comma with dot
        const lastCommaIndex = str.lastIndexOf(',');
        if (lastCommaIndex > 0) {
            const beforeComma = str.substring(0, lastCommaIndex).replace(/\./g, '');
            const afterComma = str.substring(lastCommaIndex + 1);
            str = beforeComma + '.' + afterComma;
            const parsed = Number(str);
            if (!isNaN(parsed)) {
                return parsed;
            }
        }
    }
    // Multiple dots - assume US format (last dot is decimal)
    if (dotCount > 1) {
        // Remove all commas, keep only last dot
        const lastDotIndex = str.lastIndexOf('.');
        if (lastDotIndex > 0) {
            const beforeDot = str.substring(0, lastDotIndex).replace(/,/g, '').replace(/\./g, '');
            const afterDot = str.substring(lastDotIndex + 1);
            str = beforeDot + '.' + afterDot;
            const parsed = Number(str);
            if (!isNaN(parsed)) {
                return parsed;
            }
        }
    }
    // Single dot - could be decimal or thousands separator
    if (dotCount === 1 && commaCount === 0) {
        const dotIndex = str.indexOf('.');
        const afterDot = str.substring(dotIndex + 1);
        // If 2-3 digits after dot, likely decimal
        if (afterDot.length <= 3 && /^\d+$/.test(afterDot)) {
            const parsed = Number(str);
            if (!isNaN(parsed)) {
                return parsed;
            }
        }
        // Otherwise treat as thousands separator
        const parsed = Number(str.replace(/\./g, ''));
        if (!isNaN(parsed)) {
            return parsed;
        }
    }
    // Single comma - could be decimal or thousands separator
    if (commaCount === 1 && dotCount === 0) {
        const commaIndex = str.indexOf(',');
        const afterComma = str.substring(commaIndex + 1);
        // If 2-3 digits after comma, likely decimal (European format)
        if (afterComma.length <= 3 && /^\d+$/.test(afterComma)) {
            const parsed = Number(str.replace(',', '.'));
            if (!isNaN(parsed)) {
                return parsed;
            }
        }
        // Otherwise treat as thousands separator
        const parsed = Number(str.replace(/,/g, ''));
        if (!isNaN(parsed)) {
            return parsed;
        }
    }
    // Last resort: try to extract any numbers (remove all non-numeric except one dot)
    const numbersOnly = str.replace(/[^\d.,-]/g, '');
    if (numbersOnly) {
        // Try with last separator as decimal
        if (numbersOnly.includes(',')) {
            const lastComma = numbersOnly.lastIndexOf(',');
            const cleaned = numbersOnly.substring(0, lastComma).replace(/[,.]/g, '') + '.' + numbersOnly.substring(lastComma + 1);
            const parsed = Number(cleaned);
            if (!isNaN(parsed)) {
                return parsed;
            }
        }
        if (numbersOnly.includes('.')) {
            const lastDot = numbersOnly.lastIndexOf('.');
            const cleaned = numbersOnly.substring(0, lastDot).replace(/[,.]/g, '') + '.' + numbersOnly.substring(lastDot + 1);
            const parsed = Number(cleaned);
            if (!isNaN(parsed)) {
                return parsed;
            }
        }
        // No separators, just numbers
        const parsed = Number(numbersOnly.replace(/[^\d-]/g, ''));
        if (!isNaN(parsed)) {
            return parsed;
        }
    }
    return 0;
}
// Helper function to remove undefined and NaN values from objects (Firestore doesn't allow undefined, and NaN causes display issues)
function removeUndefinedValues(obj) {
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
        // Skip undefined values
        if (value === undefined)
            continue;
        // Convert NaN to 0 for numeric fields (amount, quantity, unitPrice)
        if (typeof value === 'number' && isNaN(value)) {
            if (key === 'amount' || key === 'quantity' || key === 'unitPrice') {
                cleaned[key] = 0;
            }
            else {
                continue; // Skip NaN for non-numeric fields
            }
        }
        else {
            cleaned[key] = value;
        }
    }
    return cleaned;
}
exports.processSalesReport = functions
    .region('europe-west1')
    .firestore.document('tenants/{tenantId}/workspaces/{workspaceId}/salesReports/{reportId}')
    .onWrite(async (change, context) => {
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const after = change.after.data();
    if (!after)
        return;
    const beforeStatus = change.before.data()?.status;
    if (beforeStatus === after.status && after.status !== 'uploaded') {
        return;
    }
    if (after.status !== 'uploaded' && after.status !== 'processing')
        return;
    await change.after.ref.update({ status: 'processing', errorMessage: admin.firestore.FieldValue.delete() });
    const tempFilePath = path.join(os.tmpdir(), path.basename(after.originalFilePath));
    await bucket.file(after.originalFilePath).download({ destination: tempFilePath });
    try {
        const rows = await parseReportFile(tempFilePath);
        const scopePath = `tenants/${context.params.tenantId}/workspaces/${context.params.workspaceId}`;
        // First, load saved product mappings (highest priority)
        const savedMappingsSnapshot = await db.collection(`${scopePath}/productMappings`).get();
        const savedMappings = new Map();
        savedMappingsSnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            savedMappings.set(data.unmappedProductName, data.productId);
        });
        const productsSnapshot = await db.collection(`${scopePath}/products`).get();
        const productMap = new Map();
        // Build multiple indexes for better matching
        productsSnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const normalizedName = data.name.toLowerCase().trim();
            // Primary index: exact name match
            productMap.set(normalizedName, { id: docSnap.id, ...data });
            // Secondary index: POS code if available
            if (data.posCode) {
                productMap.set(data.posCode.toLowerCase().trim(), { id: docSnap.id, ...data });
            }
        });
        const menuGroupConfig = await db.doc(`${scopePath}/settings/menuGroupsConfig`).get();
        const menuGroupLabel = new Map();
        menuGroupConfig.data()?.groups?.forEach((group) => {
            menuGroupLabel.set(group.id, group.label);
        });
        const mapping = after.columnMapping ?? {
            productName: 'Product Name',
            quantity: 'Quantity',
            amount: 'Amount',
        };
        const parsed = rows
            .map((row, index) => {
            const rawQuantity = row[mapping.quantity];
            const rawAmount = row[mapping.amount];
            const quantity = parseNumber(rawQuantity);
            const amount = parseNumber(rawAmount);
            // Debug logging for first few rows to understand what we're parsing
            if (index < 3) {
                console.log(`[processSalesReport] Parsing row ${index + 1}:`, {
                    rawQuantity: rawQuantity,
                    rawAmount: rawAmount,
                    parsedQuantity: quantity,
                    parsedAmount: amount,
                    quantityType: typeof rawQuantity,
                    amountType: typeof rawAmount,
                });
            }
            return {
                productNameRaw: String(row[mapping.productName] ?? '').trim(),
                quantity,
                amount,
            };
        })
            .filter((row) => row.productNameRaw);
        const unmapped = new Set();
        const productMapping = after.productMapping ?? {};
        const matchedLines = parsed.map((row) => {
            const normalizedName = row.productNameRaw.toLowerCase().trim();
            let product = undefined;
            // PRIORITY 1: Check saved mappings (workspace-level saved mappings - highest priority)
            const savedProductId = savedMappings.get(row.productNameRaw);
            if (savedProductId) {
                const savedProduct = productsSnapshot.docs.find((doc) => doc.id === savedProductId);
                if (savedProduct) {
                    product = { id: savedProduct.id, ...savedProduct.data() };
                }
            }
            // PRIORITY 2: Check report-specific manual mapping (from this report's productMapping field)
            if (!product && productMapping[row.productNameRaw]) {
                const mappedProductId = productMapping[row.productNameRaw];
                const mappedProduct = productsSnapshot.docs.find((doc) => doc.id === mappedProductId);
                if (mappedProduct) {
                    product = { id: mappedProduct.id, ...mappedProduct.data() };
                }
            }
            // PRIORITY 3: Try exact match (by name) if no saved/manual mapping
            if (!product) {
                product = productMap.get(normalizedName);
            }
            // PRIORITY 4: Try partial match (contains) if exact match failed
            if (!product) {
                for (const [key, value] of productMap.entries()) {
                    // Skip if this is a POS code entry (we'll check those separately)
                    const productData = value;
                    if (productData.posCode && key === productData.posCode.toLowerCase().trim()) {
                        continue; // This is a POS code entry, skip in name matching
                    }
                    if (key.includes(normalizedName) || normalizedName.includes(key)) {
                        product = value;
                        break;
                    }
                }
            }
            if (!product) {
                unmapped.add(row.productNameRaw);
            }
            return { row, product };
        });
        // Count how many products were successfully matched
        const matchedCount = matchedLines.filter((line) => line.product !== undefined).length;
        const unmappedArray = Array.from(unmapped);
        // If there are unmapped products but we have productMapping and some matches,
        // process the matched products and skip unmapped ones
        if (unmapped.size > 0) {
            // If we have productMapping and at least some products matched, process them
            if (Object.keys(productMapping).length > 0 && matchedCount > 0) {
                // Continue processing - unmapped products will be skipped (product is undefined)
                // Update report to keep unmapped products for future mapping
                await change.after.ref.update({
                    unmappedProducts: unmappedArray,
                });
                // Continue to process matched products below
            }
            else {
                // No productMapping or no matches - need mapping
                await change.after.ref.update({
                    status: 'needs_mapping',
                    unmappedProducts: unmappedArray,
                });
                return;
            }
        }
        const periodKey = after.periodKey ?? after.reportDate.toDate().toISOString().slice(0, 7);
        const linesCollection = db.collection(`${scopePath}/salesLines`);
        const metricsCollection = db.collection(`${scopePath}/metrics`);
        // Delete existing salesLines for this report to prevent duplicates
        // This ensures that if a report is reprocessed, we don't have duplicate entries
        console.log(`[processSalesReport] Deleting existing salesLines for reportId: ${change.after.id}`);
        const existingLinesSnapshot = await linesCollection
            .where('reportId', '==', change.after.id)
            .get();
        if (!existingLinesSnapshot.empty) {
            console.log(`[processSalesReport] Found ${existingLinesSnapshot.docs.length} existing salesLines to delete`);
            const deleteBatch = db.batch();
            existingLinesSnapshot.docs.forEach((doc) => {
                deleteBatch.delete(doc.ref);
            });
            await deleteBatch.commit();
            console.log(`[processSalesReport] Deleted ${existingLinesSnapshot.docs.length} existing salesLines`);
        }
        let totalAmount = 0;
        let totalQuantity = 0;
        const productTotals = new Map();
        const categoryTotals = new Map();
        // Process salesLines in batches (Firestore batch limit is 500)
        const BATCH_SIZE = 500;
        let currentBatch = db.batch();
        let batchCount = 0;
        console.log(`[processSalesReport] Starting to process ${matchedLines.length} matched lines`);
        console.log(`[processSalesReport] Matched count: ${matchedCount}, Unmapped count: ${unmappedArray.length}`);
        for (const { row, product } of matchedLines) {
            if (!product)
                continue;
            const lineRef = linesCollection.doc();
            // Ensure quantity and amount are valid numbers (not NaN)
            const quantity = isNaN(row.quantity) ? 0 : row.quantity;
            const amount = isNaN(row.amount) ? 0 : row.amount;
            const unitPrice = amount / Math.max(quantity || 1, 1);
            const lineData = {
                reportId: change.after.id,
                productId: product.id,
                productNameRaw: row.productNameRaw,
                quantity,
                amount,
                unitPrice: isNaN(unitPrice) ? 0 : unitPrice,
                productNameAtSale: product.name,
                menuGroupAtSale: product.menuGroupId,
                isExtraAtSale: product.isExtra ?? false,
                periodKey,
                reportDate: after.reportDate,
            };
            // Only include menuSubGroupAtSale if it exists (Firestore doesn't allow undefined)
            if (product.menuSubGroupId) {
                lineData.menuSubGroupAtSale = product.menuSubGroupId;
            }
            // Remove any undefined values before saving to Firestore
            const cleanedLineData = removeUndefinedValues(lineData);
            currentBatch.set(lineRef, cleanedLineData);
            totalAmount += row.amount;
            totalQuantity += row.quantity;
            batchCount++;
            // Commit batch when it reaches the limit
            if (batchCount >= BATCH_SIZE) {
                console.log(`[processSalesReport] Committing batch of ${batchCount} salesLines`);
                await currentBatch.commit();
                currentBatch = db.batch();
                batchCount = 0;
            }
            const productKey = `${periodKey}_${product.id}`;
            let productAggregate = productTotals.get(productKey);
            if (!productAggregate) {
                productAggregate = {
                    qty: 0,
                    amount: 0,
                    menuGroup: product.menuGroupId,
                    name: product.name,
                };
                // Only set menuSubGroup if it exists (don't set undefined)
                if (product.menuSubGroupId) {
                    productAggregate.menuSubGroup = product.menuSubGroupId;
                }
            }
            productAggregate.qty += row.quantity;
            productAggregate.amount += row.amount;
            productTotals.set(productKey, productAggregate);
            const label = menuGroupLabel.get(product.menuGroupId) ?? product.menuGroupId;
            const categoryKey = `${periodKey}_${product.menuGroupId}`;
            const categoryAggregate = categoryTotals.get(categoryKey) ?? {
                qty: 0,
                amount: 0,
                menuGroupId: product.menuGroupId,
                menuGroupLabel: label,
            };
            categoryAggregate.qty += row.quantity;
            categoryAggregate.amount += row.amount;
            categoryTotals.set(categoryKey, categoryAggregate);
        }
        // Commit remaining salesLines batch
        if (batchCount > 0) {
            console.log(`[processSalesReport] Committing final batch of ${batchCount} salesLines`);
            await currentBatch.commit();
        }
        console.log(`[processSalesReport] Total salesLines created: ${batchCount > 0 ? (Math.floor(matchedCount / BATCH_SIZE) * BATCH_SIZE) + batchCount : matchedCount}`);
        console.log(`[processSalesReport] Total amount: ${totalAmount}, Total quantity: ${totalQuantity}`);
        // If no salesLines were created, mark as needs_mapping
        if (totalAmount === 0 && totalQuantity === 0) {
            console.log(`[processSalesReport] No salesLines created, marking as needs_mapping`);
            await change.after.ref.update({
                status: 'needs_mapping',
                unmappedProducts: unmappedArray,
            });
            return;
        }
        // Create metrics batch
        const metricsBatch = db.batch();
        productTotals.forEach((aggregate, key) => {
            const [, productId] = key.split('_');
            const metricRef = metricsCollection.doc(`monthlyProductSummary_${periodKey}_${productId}`);
            const metricData = {
                type: 'monthlyProductSummary',
                periodKey,
                productId,
                productNameSnapshot: aggregate.name,
                totalQty: aggregate.qty,
                totalAmount: aggregate.amount,
                avgUnitPrice: aggregate.amount / Math.max(aggregate.qty || 1, 1),
                menuGroupSnapshot: aggregate.menuGroup,
            };
            // Only include menuSubGroupSnapshot if it exists (Firestore doesn't allow undefined)
            if (aggregate.menuSubGroup) {
                metricData.menuSubGroupSnapshot = aggregate.menuSubGroup;
            }
            // Remove any undefined values before saving to Firestore
            const cleanedMetricData = removeUndefinedValues(metricData);
            metricsBatch.set(metricRef, cleanedMetricData, { merge: true });
        });
        categoryTotals.forEach((aggregate, key) => {
            const [, menuGroupId] = key.split('_');
            const metricRef = metricsCollection.doc(`monthlyCategorySummary_${periodKey}_${menuGroupId}`);
            metricsBatch.set(metricRef, {
                type: 'monthlyCategorySummary',
                periodKey,
                menuGroupId,
                menuGroupLabelSnapshot: aggregate.menuGroupLabel,
                totalQty: aggregate.qty,
                totalAmount: aggregate.amount,
            }, { merge: true });
        });
        metricsBatch.update(change.after.ref, {
            status: 'processed',
            totalAmount,
            totalQuantity,
            unmappedProducts: admin.firestore.FieldValue.delete(),
        });
        await metricsBatch.commit();
    }
    catch (error) {
        console.error(error);
        await change.after.ref.update({
            status: 'error',
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
    }
    finally {
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
    }
});
async function parseReportFile(filePath) {
    if (filePath.endsWith('.csv')) {
        const content = fs.readFileSync(filePath, 'utf8');
        const parsed = papaparse_1.default.parse(content, { header: true });
        return parsed.data.filter(Boolean);
    }
    const buffer = fs.readFileSync(filePath);
    const workbook = new exceljs_1.default.Workbook();
    // Convert Buffer to ArrayBuffer for exceljs
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    await workbook.xlsx.load(arrayBuffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet)
        return [];
    const rows = [];
    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1)
            return; // Skip header
        const rowData = {};
        row.eachCell((cell, colNumber) => {
            const headerCell = worksheet.getRow(1).getCell(colNumber);
            const header = headerCell.text || `Column${colNumber}`;
            const value = cell.value;
            // Always prefer cell.text for formatted values (especially for currency/number formats)
            // This ensures we get the exact format as displayed in Excel (e.g., "2.990,80")
            const cellText = cell.text?.trim();
            if (cellText && cellText !== '') {
                // Use formatted text if available - this preserves European number formats
                // This is critical for currency cells that display "2.990,80" but have numeric value
                rowData[header] = cellText;
            }
            else if (value === null || value === undefined) {
                rowData[header] = '';
            }
            else if (typeof value === 'number') {
                // If no formatted text but value is a number, convert to string
                // This allows parseNumber to handle it properly
                // Note: ExcelJS sometimes returns numbers even for formatted currency cells
                rowData[header] = String(value);
            }
            else if (typeof value === 'object' && value !== null) {
                // Handle ExcelJS cell value objects (formula results, dates, etc.)
                if ('result' in value) {
                    const result = value.result;
                    if (typeof result === 'number') {
                        // Convert number result to string for consistent parsing
                        rowData[header] = String(result);
                    }
                    else if (result !== null && result !== undefined) {
                        rowData[header] = String(result);
                    }
                    else {
                        rowData[header] = '';
                    }
                }
                else if ('text' in value) {
                    rowData[header] = String(value.text);
                }
                else {
                    rowData[header] = String(value);
                }
            }
            else {
                rowData[header] = String(value);
            }
        });
        if (Object.keys(rowData).length > 0) {
            rows.push(rowData);
        }
    });
    return rows;
}
