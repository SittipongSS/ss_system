// Back-compat shim — the print builder is module-agnostic and now lives in
// lib/reports/reportPrint.js (shared by tax / master / pm reports). Kept here so
// existing `@/lib/tax/reportPrint` imports keep working.
export { buildReportPrintHTML, openReportPrintWindow } from '@/lib/reports/reportPrint';
