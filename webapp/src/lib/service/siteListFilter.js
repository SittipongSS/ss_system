// ── ตัวกรองของทะเบียนไซต์ (/database/sites) — ตารางกับเลขบนตัวเลือกใช้ตัวเดียวกัน (ตรวจตัวเลข M21c · 20/10) ──
//
// 🐞 ตัวเลือก "รวมไซต์ที่ปิดใช้งาน (n)" นับไซต์ปิดใช้งานทุกไซต์ในทะเบียน ทั้งที่ตารางกรองจังหวัด/ลูกค้า/เขต/คำค้นอยู่
//    ⇒ กรองจังหวัดเชียงใหม่ (ไม่มีไซต์ปิด) ตัวเลือกยังบอก (n) แต่ติ๊กแล้วแถวไม่เพิ่มเลย
// ⭐ ตัวกรองยกมาไว้ที่นี่ · เลขบนตัวเลือก = แถวที่ **เพิ่มขึ้น** เมื่อติ๊ก (สูตรเดียวกับทะเบียนสินค้า/ลูกค้า)
// ⚠️ แถบตัวเลขข้างทะเบียน (ทั้งหมด · ใช้งาน · ปิดใช้งาน) เป็นยอดทั้งทะเบียนที่แยกใช้งาน/ปิดใช้งานให้เห็นชัด — ไม่ได้มาจากตัวนี้
//
// ทุกฟังก์ชันบริสุทธิ์ ไม่มี React ไม่มี DB

const lower = (value) => String(value ?? '').toLocaleLowerCase('th');

/** ช่องที่คำค้นวิ่งไล่ — ตาเห็นบนแถว = ค้นเจอ
 *  จังหวัดเข้าชุดค้นด้วย (mig 0315) — เป็นตัวตนถาวรของไซต์ คนถามหา "ไซต์ที่เชียงใหม่"
 *  รหัสลูกค้า (AR) โชว์บนแถวแล้ว ⇒ ต้องค้นเจอด้วย */
function searchHaystack(site) {
  return [site.name, site.customerName, site.customerArCode, site.routeZone, site.code, site.province];
}

/**
 * @param search       คำค้น (ยังไม่ trim/lowercase ก็ได้)
 * @param provinces    จังหวัดที่เลือก — ว่าง = ทั้งหมด
 * @param customers    รหัสลูกค้า (customerId) ที่เลือก — ว่าง = ทั้งหมด
 * @param zones        เขตวิ่งงานที่เลือก — ว่าง = ทั้งหมด
 * @param showInactive true = รวมไซต์ที่ปิดใช้งาน (ค่าตั้งต้นซ่อน — แพตเทิร์นเดียวกับหน้าสินค้า/ลูกค้า)
 */
export function filterSites(sites = [], {
  search = '', provinces = [], customers = [], zones = [], showInactive = false,
} = {}) {
  const q = lower(String(search || '').trim());
  return (sites || []).filter((site) => {
    if (!showInactive && site.isActive === false) return false;
    if (provinces.length && !provinces.includes(site.province)) return false;
    if (customers.length && !customers.includes(site.customerId)) return false;
    if (zones.length && !zones.includes(site.routeZone)) return false;
    if (!q) return true;
    return searchHaystack(site).filter(Boolean).some((field) => lower(field).includes(q));
  });
}

/** เลขบนตัวเลือก "รวมไซต์ที่ปิดใช้งาน (n)" — แถวที่เพิ่มขึ้นเมื่อติ๊ก ภายใต้คำค้น/ตัวกรองอื่นที่ติดอยู่ */
export function siteFilterFacets(sites = [], state = {}) {
  const rows = (extra) => filterSites(sites, { ...state, ...extra }).length;
  return {
    inactive: rows({ showInactive: true }) - rows({ showInactive: false }),
  };
}
