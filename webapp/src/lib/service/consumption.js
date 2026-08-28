// ── ใช้จริง เทียบ มาตรฐาน (รายโซน รายเดือน) ──────────────────────────────
//
// ⭐ **คำถามที่ทั้งบริษัทตอบไม่ได้มาตลอด**: โซนนี้เดือนที่แล้วใช้ไปเท่าไร เทียบกับ
//   ที่ตกลงขายไว้แล้วเกินหรือขาด · ข้อมูลมีครบใน DB ตั้งแต่ mig 0188/0297 แต่ไม่มี
//   จอไหนเอามาต่อกัน
//
// ⚠️ **เส้นทางเดียว**: `service_visit_items → service_assets.zoneId → โซน`
//   (mig 0298:13-14 · เทสต์ยาม serviceSchemaGuards คุมไม่ให้มี zoneId บน items)
//   ⇒ ของที่ใช้กับ "ทั้งไซต์" (น้ำยาเช็ดเครื่อง) ไม่มี assetId ⇒ **ไม่นับเข้าโซนไหน**
//   ซึ่งถูกแล้ว: มันไม่ใช่น้ำหอมของโซน
//
// ⚠️ **หน่วยต้องเป็น ml ทั้งหมดก่อนบวก** — ของจริงในชีตปนกัน (500 ML · 2 KG · 1 ขวด)
//   บวกข้ามหน่วยได้ตัวเลขที่ดูน่าเชื่อแต่ผิด ⇒ แถวที่แปลงไม่ได้ **ไม่ถูกกลืน**
//   แต่ถูกนับแยกไว้ใน `unconverted` ให้จอบอกผู้ใช้ว่ายังมีของที่ตัวเลขนี้ไม่ครอบ
//   (กติกาเดียวกับ "แถวที่แปลงไม่ได้ต้องค้างให้คนตัดสิน ห้ามใส่ค่า default แล้วเงียบ")
/* 🐞 **สองโมดูลมีฟังก์ชันชื่อ `businessMonthKey` เหมือนกันแต่คนละสัญญา** (พบตอน UAT
   2026-08-28 — หน้าโซนพังทั้งหน้าตั้งแต่วันแรก ไม่มีใครเปิดเจอ):
     `@/lib/datePeriods`  → `businessMonthKey(value)` **ต้องส่ง timestamp**
                            ไม่ส่ง = `Date.parse(undefined)` = NaN ⇒ คืน **null**
     `@/lib/businessDate` → `businessMonthKey()` ไม่รับอาร์กิวเมนต์ คืน 'YYMM' (ใช้ออกรหัส)
   ที่นี่ต้องการ "เดือนของวันนี้ตามนาฬิกาไทย" รูป `YYYY-MM` ⇒ ใช้ `businessDate()`
   แล้วตัดเอง ชัดเจนกว่าและไม่ชนกับชื่อที่ซ้ำกันสองที่ */
import { businessMonthKey } from '@/lib/datePeriods';   // ← รับ timestamp (ใช้กับวันที่เข้าจริง)
import { businessDate } from '@/lib/businessDate';      // ← วันนี้ตามนาฬิกาไทย

/* หน่วยที่แปลงเป็น ml ได้ตรง ๆ — ไม่มี "ขวด/กระป๋อง" เพราะขนาดขวดไม่คงที่
   ⚠️ กรัม/กิโลกรัมก็ไม่แปลง: น้ำหอมแต่ละสูตรความหนาแน่นไม่เท่ากัน การคูณ 1.0
   คือการเดาที่ดูเหมือนคำนวณ */
const ML_PER_UNIT = {
  ml: 1,
  มล: 1,
  มิลลิลิตร: 1,
  cc: 1,
  l: 1000,
  ลิตร: 1000,
  litre: 1000,
};

export function toMl(qty, unit) {
  const value = Number(qty);
  if (!Number.isFinite(value) || value <= 0) return null;
  const key = String(unit ?? '').trim().toLowerCase();
  if (!key) return null;                       // ไม่รู้หน่วย = แปลงไม่ได้ ไม่ใช่ ml
  const factor = ML_PER_UNIT[key];
  return factor ? value * factor : null;
}

/* ยอดใช้จริงรายเดือนของโซนหนึ่ง
   รับ: items ของทุกนัด + assets (รู้ว่าเครื่องไหนอยู่โซนไหน) + visits (รู้ว่านัดไหนวันไหน)
   คืน: Map<เดือน 'YYYY-MM', { ml, visits:Set, unconverted }>
   ⚠️ ใช้ **วันที่เข้าจริง** ไม่ใช่วันที่นัด — เข้าช้าข้ามเดือน ยอดต้องไปอยู่เดือนที่ไปจริง */
export function monthlyUsageOfZone({ zoneId, items = [], assets = [], visits = [] } = {}) {
  const zoneAssets = new Set(assets.filter((a) => a.zoneId === zoneId).map((a) => a.id));
  const visitById = new Map(visits.map((v) => [v.id, v]));
  const months = new Map();

  for (const item of items) {
    if (!item.assetId || !zoneAssets.has(item.assetId)) continue;
    const visit = visitById.get(item.visitId);
    const date = visit?.actualDate || null;
    if (!date) continue;                        // ยังไม่ได้ไปถึง = ยังไม่มียอด
    const key = businessMonthKey(date);
    const row = months.get(key) || { month: key, ml: 0, visits: new Set(), unconverted: 0 };
    const ml = toMl(item.qty, item.unit);
    if (ml == null) row.unconverted += 1;
    else row.ml += ml;
    row.visits.add(item.visitId);
    months.set(key, row);
  }
  return months;
}

/* ตารางเทียบ 6 เดือนล่าสุด (หรือกี่เดือนก็ได้) — เดือนที่ไม่มีการเข้าเลยต้องมีแถว
   ⚠️ **เดือนที่ว่างคือคำตอบ ไม่ใช่ช่องว่าง** — "มิ.ย. ไม่ได้เข้า" คือสิ่งที่หัวหน้า
   ต้องเห็น ถ้าข้ามแถวไป ตารางจะดูเหมือนทุกเดือนปกติ */
export function usageVsStandard({
  zoneId, items = [], assets = [], visits = [], standardMlPerMonth = null,
  months = 6, todayMonth = null,
} = {}) {
  const usage = monthlyUsageOfZone({ zoneId, items, assets, visits });
  const anchor = todayMonth || businessDate().slice(0, 7);
  const [year, month] = anchor.split('-').map(Number);

  const rows = [];
  for (let back = months - 1; back >= 0; back -= 1) {
    const d = new Date(Date.UTC(year, month - 1 - back, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const row = usage.get(key);
    const used = row ? row.ml : 0;
    const std = Number(standardMlPerMonth);
    const hasStd = Number.isFinite(std) && std > 0;
    rows.push({
      month: key,
      visits: row ? row.visits.size : 0,
      standardMl: hasStd ? std : null,
      usedMl: row ? used : null,               // null = ไม่ได้เข้าเลย ต่างจาก 0 ml
      diffMl: hasStd && row ? used - std : null,
      ratio: hasStd && row && std > 0 ? used / std : null,
      unconverted: row ? row.unconverted : 0,
    });
  }
  return rows;
}

/* สรุปหัวตาราง — เฉลี่ยเทียบมาตรฐานของเดือนที่ **มีการเข้าจริง** เท่านั้น
   ⚠️ ถ้าเอาเดือนที่ไม่ได้เข้าไปหารด้วย ค่าเฉลี่ยจะต่ำลงทุกครั้งที่ช่างไม่ได้ไป
   แล้วอ่านออกมาเป็น "ลูกค้าใช้น้อยลง" ซึ่งตรงข้ามกับความจริง */
export function usageSummary(rows = []) {
  const active = rows.filter((r) => r.ratio != null);
  if (!active.length) return { months: 0, avgRatio: null, missedMonths: rows.filter((r) => r.usedMl == null).length };
  const avg = active.reduce((sum, r) => sum + r.ratio, 0) / active.length;
  return {
    months: active.length,
    avgRatio: avg,
    missedMonths: rows.filter((r) => r.usedMl == null).length,
    unconverted: rows.reduce((sum, r) => sum + r.unconverted, 0),
  };
}

/* ป้ายสรุปสำหรับหัวการ์ด — เกิน/ต่ำกว่ามาตรฐานกี่เปอร์เซ็นต์
   ⚠️ ไม่ตัดสินว่า "ผิด" — เกินมาตรฐานอาจแปลว่าขายไว้ต่ำไป ไม่ใช่ช่างเติมเกิน */
export function usageBadge(summary) {
  if (!summary || summary.avgRatio == null) return null;
  const pct = Math.round((summary.avgRatio - 1) * 100);
  if (Math.abs(pct) < 5) return { tone: 'good', text: 'ใกล้เคียงมาตรฐาน' };
  return pct > 0
    ? { tone: 'warning', text: `เฉลี่ยเกิน ${pct}%` }
    : { tone: 'info', text: `เฉลี่ยต่ำกว่า ${Math.abs(pct)}%` };
}
