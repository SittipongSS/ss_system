// Back-compat shim — the exporter is module-agnostic and now lives in
// lib/reports/exportExcel.js (shared by tax / master / pm reports). Kept here so
// existing `@/lib/tax/exportExcel` imports keep working.
export { reportToXlsxBuffer } from '@/lib/reports/exportExcel';
