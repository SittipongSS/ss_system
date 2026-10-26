// ── ตัวกรองของหน้าทะเบียนลูกค้า — ตารางกับเลขบนตัวเลือกใช้ตัวเดียวกัน (ตรวจตัวเลข M21b · 20/10) ──
//
// คู่แฝดของ `productFilter.js` · 🐞 เดิมตัวกรองเขียนสดในหน้า และตัวเลือก "รวมลูกค้าที่เลิกใช้ (n)" นับใบเลิกใช้
// ทุกใบในทะเบียน ⇒ ค้นหา/กรองทีมอยู่แล้วติ๊ก แถวเพิ่มขึ้นไม่เท่าเลขบนตัวเลือก
//
// ทุกฟังก์ชันบริสุทธิ์ ไม่มี React ไม่มี DB
import { passesApprovalFilters } from '@/lib/master/pendingApprovalLinks';
import { masterRecordTeams } from '@/lib/master/approvalControl';
import { brandEn, brandTh } from '@/lib/master/brands';

/** ช่องที่คำค้นวิ่งไล่ — ตาเห็นบนแถว = ต้องค้นเจอ
 *  ⚠️ ชื่ออังกฤษต้องค้นเจอด้วย (กติกา entity: ค้นหาต้องเจอทุกภาษาที่มี) — ลูกค้าที่มีแต่ชื่ออังกฤษจะหาไม่เจอเลยถ้าลืมคีย์นี้
 *  รหัสสาขาเป็นคอลัมน์บนตารางและเป็นครึ่งหนึ่งของคีย์ซ้ำ (เลขผู้เสียภาษี + สาขา) ⇒ คนที่ถือเลขสาขาจากเอกสาร
 *  ต้องค้นเจอใบที่ถูกต้องได้ */
function searchHaystack(c) {
  return [c.arCode, c.name, c.nameEn, c.taxId, c.branchCode, c.phone, ...(c.brands || []).flatMap((b) => [brandTh(b), brandEn(b)])];
}

/**
 * กรองทะเบียนลูกค้าตามชุดตัวกรองของหน้า list
 *
 * @param search       คำค้น (ยังไม่ trim/lowercase ก็ได้)
 * @param statuses     สถานะอนุมัติที่เลือก — ว่าง = ทั้งหมด
 * @param teams        ทีมดูแลที่เลือก — ว่าง = ทั้งหมด (ลูกค้าอยู่หลายทีมได้ · ตรงทีมใดทีมหนึ่งก็ผ่าน)
 * @param showInactive true = รวมลูกค้าที่เลิกใช้
 *   ⚠️ ใบเลิกใช้ซ่อนเป็นค่าตั้งต้น แต่ใบที่รออนุมัติยังขึ้นในตัวกรอง "รออนุมัติ" (มติเจ้าของ 19/10 · H3)
 *   ⇒ `?count=customers` เปิดเจอครบทุกใบที่ป้ายเมนู/การ์ดภาพรวมนับ · ตัวตัดสินเดียวกับทะเบียนสินค้า
 */
export function filterCustomers(customers = [], {
  search = '', statuses = [], teams = [], showInactive = false,
} = {}) {
  const q = String(search || '').trim().toLowerCase();
  return (customers || []).filter((c) => {
    if (!passesApprovalFilters(c, { statuses, showInactive })) return false;
    if (teams.length && !masterRecordTeams(c).some((t) => teams.includes(t))) return false;
    if (!q) return true;
    return searchHaystack(c).some((v) => (v || '').toLowerCase().includes(q));
  });
}

/**
 * เลขบนตัวเลือกในปุ่มตัวกรอง — นับพร้อมตัวกรองอื่นที่ติดอยู่
 * - `inactive` = แถวที่ **เพิ่มขึ้น** เมื่อติ๊ก "รวมลูกค้าที่เลิกใช้" (สูตรเดียวกับ `productFilterFacets`)
 *   ⚠️ ขณะกรอง "รออนุมัติ" ใบเลิกใช้ที่รออนุมัติขึ้นอยู่แล้ว (H3) ⇒ ไม่นับซ้ำ
 */
export function customerFilterFacets(customers = [], state = {}) {
  const rows = (extra) => filterCustomers(customers, { ...state, ...extra }).length;
  return {
    inactive: rows({ showInactive: true }) - rows({ showInactive: false }),
  };
}
