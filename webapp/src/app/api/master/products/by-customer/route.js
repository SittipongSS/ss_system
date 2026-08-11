// Master-data namespace alias (ดูเหตุผลที่ ../route.js) — FG ของลูกค้ารายหนึ่ง
// ⚠️ namespace /api/master/* เป็นไฟล์ alias จริง ไม่ใช่ rewrite — ไม่เพิ่มที่นี่ = 404
export { GET } from "../../../products/by-customer/route";
