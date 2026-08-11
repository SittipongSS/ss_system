// Master-data namespace alias (ดูเหตุผลที่ ../route.js) — ค้นลูกค้าจากเลขผู้เสียภาษี
// ⚠️ namespace /api/master/* เป็นไฟล์ alias จริง ไม่ใช่ rewrite — ไม่เพิ่มที่นี่ = 404
export { GET } from "../../../customers/by-tax-id/route";
