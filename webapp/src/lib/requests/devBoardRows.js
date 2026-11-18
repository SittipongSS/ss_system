// ── ของกลางของตาราง "สรุปทั้งใบ" สองสาย (พัฒนากลิ่น · พัฒนาสูตร) — ม-165 PR-2 · logic ล้วน ─────────────────
//
// ⭐ มติเจ้าของ 18/11/2026: แถวละบรรทัด · รอบแก้ซ้อนใต้ตัวแม่ · แถวจบแล้วจาง · หัวกลุ่มสรุปผล · สเปก PDR ครั้งเดียว ·
//   กดแถวเพื่อกางรายละเอียด · ถอดรางจุด (ทับมติ 25/08 + 18/08 เฉพาะสองตารางนี้ — `DocumentBoard` ยังเดิม)
// ⭐ **คำชุดเดียวกับการ์ด "สรุปใบนี้"** (`devSummary.js`): ยืนยัน · ขอแก้ · ไม่เอา · รอลูกค้าตอบ — ตารางกับการ์ดเรียกของชิ้นเดียวกันคำเดียวกัน
// ⚠️ ประกอบที่ lib ไม่ใช่ใน JSX (กฎหลังบั๊กรางซ้ำ #1033)
import { ROW_STAGE_LABELS, ROW_STAGE_TONES } from '@/lib/requests/rowStage';

/**
 * เรียงแถว **ตามสายพันธุ์** — ตัวต้นทางก่อน แล้วรอบแก้ที่แตกจากมัน (`parentId`) ตามมาทันที
 *
 * ⭐ ผู้ใช้ยืนยันรูปร่างจริง (2026-08-10): 1 บรีฟพัฒนา 2–3 direction · ลูกค้าขอแก้แล้วพัฒนาต่ออีก 2–3 ที่ผูกกลับไปหาต้นทาง
 * ⚠️ `depth` ใช้เยื้องบนจอเท่านั้น — จำกัดที่ 1 (รอบแก้ของรอบแก้ยังอ่านเป็น "ลูกของต้นทางเดิม" ได้ ไม่เยื้องจนคอลัมน์แรกหมดที่)
 * ⚠️ ตัวที่พ่อไม่อยู่ในชุดเดียวกัน (ข้อมูลเก่าก่อน #1049) = ราก — ห้ามหาย · แถวที่ไม่มี `parentId` ไม่ถูกเดาจากรหัส
 * ⭐ `childCount` = รอบแก้ที่แตกจากแถวนี้โดยตรง — ป้าย "แก้ n ตัว ↓" ของแถวแม่
 */
export function rowLineage(list = []) {
  const byId = new Map(list.map((d) => [d.id, d]));
  const children = new Map();
  for (const d of list) {
    if (!d.parentId || !byId.has(d.parentId)) continue;
    if (!children.has(d.parentId)) children.set(d.parentId, []);
    children.get(d.parentId).push(d);
  }
  const out = [];
  const push = (d, depth) => {
    const kids = children.get(d.id) || [];
    out.push({ ...d, depth, childCount: kids.length });
    for (const kid of kids) push(kid, 1);
  };
  for (const d of list) {
    if (d.parentId && byId.has(d.parentId)) continue;
    push(d, 0);
  }
  return out;
}

/**
 * ป้ายคอลัมน์ "ผลลูกค้า" + บรรทัดรอง — ลูกค้าตอบแล้ว = ผลของลูกค้า · ยังไม่ตอบ = ขั้นของแถว
 *
 * ⭐ บรรทัดรองตอบ "ต่อจากนี้คืออะไร" แทนรางจุดที่อ่านไม่ออก:
 *   ยืนยัน → ขั้นราคา/Ingredient List/เสร็จแล้ว · ขอแก้ → "แก้ n ตัว ↓" (หรือ "ยังไม่มีรอบแก้")
 * ⚠️ "ส่งลูกค้าแล้ว" อ่านเป็น "รอลูกค้าตอบ" — คำเดียวกับการ์ด (ของที่ส่งแล้วแต่ยังไม่ได้คำตอบคือสิ่งที่ค้างจริง)
 *
 * @param row แถวของตาราง (`stage` · `outcome` · `childCount` · `freebie`)
 */
export function devRowResult(row = {}) {
  if (row.outcome === 'confirmed') {
    const sub = row.stage === 'done' ? 'เสร็จแล้ว' : ROW_STAGE_LABELS[row.stage] || null;
    return { label: row.freebie ? 'ยืนยัน · แถม' : 'ยืนยัน', tone: 'success', sub };
  }
  if (row.outcome === 'revise') {
    return { label: 'ขอแก้', tone: 'info', sub: row.childCount ? `แก้ ${row.childCount} ตัว ↓` : 'ยังไม่มีรอบแก้' };
  }
  if (row.outcome === 'rejected' || row.stage === 'declined') return { label: 'ไม่เอา', tone: 'neutral', sub: null };
  if (row.stage === 'sent') return { label: 'รอลูกค้าตอบ', tone: 'warning', sub: null };
  return { label: ROW_STAGE_LABELS[row.stage] || row.stage || '—', tone: ROW_STAGE_TONES[row.stage] || 'neutral', sub: null };
}

/**
 * แถวที่ "จบแล้ว" สำหรับจอ — จาง/เตี้ย ไม่มีกล่องแนบไฟล์ค้าง
 * ⚠️ ยืนยันแล้วแต่ยังรอราคา/Ingredient List **ไม่จบ** (ยังมีงาน) · ขอแก้ที่แตกรอบแก้แล้ว = จบ (งานไปต่อที่แถวลูก)
 */
export const devRowSettled = (row = {}) => row.stage === 'declined' || row.stage === 'done'
  || (row.outcome === 'revise' && row.childCount > 0);

/**
 * รอบแก้ที่สเปกเหมือนตัวแม่ไม่ต้องพิมพ์ซ้ำ — ใบที่สเปกต่างกันตามกลุ่มกลิ่น (ยกขึ้นหัวตารางไม่ได้) ยังเห็นสเปกครั้งเดียวต่อสาย
 * ⚠️ เทียบกับแม่ตรงตัว (`parentId`) เท่านั้น · สเปกต่างจากแม่ = ของใหม่ของรอบนั้น ต้องโชว์
 */
export function dropInheritedSpec(rows = []) {
  const specOf = new Map(rows.map((r) => [r.id, String(r.spec || '').trim()]));
  return rows.map((r) => (r.parentId && r.spec && specOf.get(r.parentId) === String(r.spec).trim() ? { ...r, spec: null } : r));
}

/**
 * สเปกที่ทุกแถวพูดเหมือนกัน (สายพัฒนาสูตร: "ตามแบบฟอร์ม PDR: …" ถูกคัดลอกลงทุกแถว) — ขึ้นครั้งเดียวที่หัวตาราง
 * คืน `{ shared, rows }` — `rows` ล้าง `spec` ที่ซ้ำกับ `shared` ออก · มีแถวเดียว/สเปกไม่เหมือนกัน = ไม่ยก
 */
export function liftSharedSpec(rows = []) {
  const specs = rows.map((r) => String(r.spec || '').trim());
  const first = specs[0];
  const shared = rows.length > 1 && first && specs.every((s) => s === first) ? first : null;
  return { shared, rows: shared ? rows.map((r) => ({ ...r, spec: null })) : rows };
}

/** ป้ายหัวกลุ่มบรีฟ — "5 direction · ยืนยัน 1 · ขอแก้ 1 · ไม่เอา 3" (ศูนย์ไม่พิมพ์ · คำเดียวกับการ์ด) */
export function groupResultText(summary = {}) {
  const parts = [`${summary.total || 0} direction`];
  if (summary.confirmed) parts.push(`ยืนยัน ${summary.confirmed}`);
  if (summary.revise) parts.push(`ขอแก้ ${summary.revise}`);
  if (summary.rejected) parts.push(`ไม่เอา ${summary.rejected}`);
  return parts.join(' · ');
}
