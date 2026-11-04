// ตัวเทียบค่าของการเรียง — แยกออกมาจาก `useSortableTable.js` ("use client") ให้โค้ดฝั่ง server เรียกได้
// (route ส่งออก Excel ของคิวลง BOM เรียงด้วยกติกาเดียวกับจอ · 04/11/2026) · `useSortableTable` re-export ตัวนี้
/**
 * ตัวเทียบค่าชุดเดียวกับหัวตารางเรียงได้ — ค่าว่างไว้ท้ายเสมอ (ไม่ว่าจะเรียงทางไหน)
 * · ตัวเลข/วันที่เทียบตรง · ข้อความเรียงแบบไทยนับเลข ("BKK-2" มาก่อน "BKK-10")
 * ⭐ หน้าที่ย้ายการเรียงไปไว้บนแถบเครื่องมือ (SortMenu) เรียกตัวนี้ ไม่เขียนกติกาใหม่เอง
 *
 * @param {"asc"|"desc"} dir
 */
export function compareSortValues(va, vb, dir = "asc") {
  const mul = dir === "desc" ? -1 : 1;
  const ea = va == null || va === "";
  const eb = vb == null || vb === "";
  if (ea && eb) return 0;
  if (ea) return 1;
  if (eb) return -1;
  if (typeof va === "number" && typeof vb === "number") return (va - vb) * mul;
  if (va instanceof Date && vb instanceof Date) return (va - vb) * mul;
  return String(va).localeCompare(String(vb), "th", { numeric: true }) * mul;
}
