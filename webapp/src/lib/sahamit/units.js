// SAHAMIT — หน่วยจำนวน: ชิ้น (pieces) ⇄ ลัง (cases/cartons).
//
// ชิ้นเป็น canonical ทั้งระบบ (DB qty ทั้ง forecast/PO เก็บเป็นชิ้น). ลังเป็นค่าที่
// คำนวณมาเพื่อ "แสดง/รับกรอก" ต่อ SKU จาก products.piecesPerCase (ชิ้นต่อลัง).
// piecesPerCase ว่าง/≤0 = ยังไม่รู้ชิ้นต่อลัง → โชว์เฉพาะชิ้น (แปลงลังไม่ได้).
//
// สหมิตรคุยกับลูกค้าเป็น "ลัง" แต่ตกลงจำนวนชิ้นกันเองด้วย — จึงโชว์ชิ้นเป็นหลัก
// และลังเป็นวงเล็บรอง.

const NF = (n) => Number(n || 0).toLocaleString("th-TH");

// จำนวนชิ้นต่อลังที่ใช้ได้จริง (บวก) หรือ null.
export function ppcOf(product) {
  const k = Number(product?.piecesPerCase);
  return Number.isFinite(k) && k > 0 ? k : null;
}

// ชิ้น → ลัง (null ถ้าไม่รู้ชิ้นต่อลัง).
export function casesFromPieces(pieces, ppc) {
  const p = Number(pieces), k = Number(ppc);
  if (!Number.isFinite(p) || !Number.isFinite(k) || k <= 0) return null;
  return p / k;
}

// ลัง → ชิ้น (null ถ้าไม่รู้ชิ้นต่อลัง). ปัดเป็นจำนวนเต็มชิ้น.
export function piecesFromCases(cases, ppc) {
  const c = Number(cases), k = Number(ppc);
  if (!Number.isFinite(c) || !Number.isFinite(k) || k <= 0) return null;
  return Math.round(c * k);
}

// ข้อความจำนวนลัง เช่น "120 ลัง" หรือ "12.5 ลัง" (เศษลัง 2 ตำแหน่ง). null ถ้าแปลงไม่ได้.
export function casesText(pieces, ppc) {
  const cases = casesFromPieces(pieces, ppc);
  if (cases == null) return null;
  const t = Number.isInteger(cases)
    ? NF(cases)
    : cases.toLocaleString("th-TH", { maximumFractionDigits: 2 });
  return `${t} ลัง`;
}

// แปลงค่าที่กรอกในช่อง เมื่อ "สลับหน่วย" ชิ้น⇄ลัง โดยคงจำนวนชิ้นจริงไว้เท่าเดิม —
// ให้เลขในกริดสลับตามหน่วยที่เลือก (ไม่ใช่แค่เปลี่ยนป้ายหน่วยแล้วตีความใหม่ = ข้อมูลเพี้ยน).
//   piece→case: หารด้วยชิ้นต่อลัง (เศษลังทศนิยม 4 ตำแหน่ง กัน float เพี้ยนตอนสลับกลับ)
//   case→piece: คูณชิ้นต่อลัง ปัดเป็นจำนวนชิ้นเต็ม
// คืนค่าเป็น string (ใส่ใน input ได้ตรง). ช่องว่าง/ค่าไม่ถูกต้อง/ยังไม่รู้ชิ้นต่อลัง →
// คืนค่าเดิม (แปลงไม่ได้ — ผู้เรียกกันไว้ด้วย missingPpc ตอนบันทึกอยู่แล้ว).
export function convertEntryUnit(value, fromUnit, toUnit, ppc) {
  if (fromUnit === toUnit) return value;
  if (value === "" || value == null) return value;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return value;
  const k = Number(ppc);
  if (!Number.isFinite(k) || k <= 0) return value; // แปลงไม่ได้ถ้าไม่รู้ชิ้นต่อลัง
  if (fromUnit === "piece" && toUnit === "case") {
    const c = n / k;
    return String(Number.isInteger(c) ? c : Number(c.toFixed(4)));
  }
  if (fromUnit === "case" && toUnit === "piece") {
    return String(Math.round(n * k));
  }
  return value;
}

// จำนวนแบบเต็ม: ชิ้นเป็นหลัก + ลังในวงเล็บ (ถ้ารู้ชิ้นต่อลัง).
//   fmtQty(1440, 12) → "1,440 ชิ้น (120 ลัง)"
//   fmtQty(1440, null) → "1,440 ชิ้น"
// opts.unit=false ตัดคำว่า "ชิ้น" ออก (เมื่อหัวคอลัมน์บอกหน่วยแล้ว).
export function fmtQty(pieces, ppc, { unit = true } = {}) {
  const base = NF(pieces) + (unit ? " ชิ้น" : "");
  const c = casesText(pieces, ppc);
  return c ? `${base} (${c})` : base;
}
