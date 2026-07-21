// SAHAMIT — กติกาการแก้/ลบ PO (pure — route ดึง dependent มาให้ แล้วได้คำตอบกลับ)
//
// PO ไม่ได้ลอย: ผูกโครงการ PM (sahamit_pos.projectId), ผูกดีลตอน settle
// (sales_deals.metadata.sahamitPoId — JSON ไม่มี FK จริง ดู [[no-real-fk-constraints]]),
// แตก PO ยอดเหลือ (splitFromPoId), และ material ผูกรายบรรทัด (poLineId).
// มติผู้ใช้ 2026-07-17:
//   • ลบ PO: ห้ามลบถ้ายังผูกอะไรอยู่ — บอกให้ชัดว่าติดอะไร (ไม่ใช่ 403 เปล่า ๆ)
//   • แก้บรรทัด: ล็อกเฉพาะบรรทัดที่ผูกแล้ว บรรทัดอื่นในใบเดียวกันยังแก้/ลบ/เพิ่มได้
// บรรทัดที่ settle แล้ว (เชื่อมดีลรวม + ออก QT ราย poLineId — ดู settleLines.js)
// ต้องล็อกด้วย: แก้จำนวน = QT/ดีลเพี้ยนจาก PO เงียบ ๆ; ลบแล้วเพิ่ม fgCode เดิม =
// ได้ id ใหม่ที่ดูยังไม่เชื่อม → settle ซ้ำเป็นดีล/QT ซ้ำซ้อน

import { referencedBlock } from '@/lib/deletion';

// เหตุผลที่บรรทัดนี้ถูกล็อก (null = แก้ได้). เรียงจากเหตุที่ผู้ใช้แก้ได้ยากสุดก่อน
// เพื่อให้ข้อความบอกต้นตอจริง ไม่ใช่อาการปลายทาง.
export function lineLockReason(line, { hasMaterial = false, isSplitParent = false, isSettled = false } = {}) {
  if (!line) return null;
  if (line.splitFromPoLineId) return 'มาจากการแบ่งส่ง';
  if (isSplitParent) return 'ถูกแบ่งส่งไปแล้ว';
  if (isSettled) return 'เชื่อมดีล/ออกใบเสนอราคาแล้ว';
  if (line.actualDeliveredDate) return 'ส่งของแล้ว';
  if (line.status && line.status !== 'open') return `สถานะ ${line.status}`;
  if (hasMaterial) return 'มีข้อมูลวัสดุแล้ว';
  return null;
}

// ลบทั้ง PO ได้ไหม — คืนข้อความบล็อก (string) หรือ null ถ้าลบได้
export function poDeleteBlock({
  projectId = null, splitChildCount = 0, settledDealCount = 0,
  materialLineCount = 0, deliveredLineCount = 0,
} = {}) {
  const refs = [];
  if (projectId) refs.push('โครงการ PM ที่สร้างจาก PO นี้');
  if (settledDealCount) refs.push(`${settledDealCount} ดีลที่เชื่อมไว้`);
  if (splitChildCount) refs.push(`${splitChildCount} PO ยอดเหลือจากการแบ่งส่ง`);
  if (materialLineCount) refs.push(`${materialLineCount} รายการที่มีข้อมูลวัสดุ`);
  if (deliveredLineCount) refs.push(`${deliveredLineCount} รายการที่ส่งของแล้ว`);
  return referencedBlock('PO ', refs);
}

// diff บรรทัด: เทียบของเดิมกับที่ฟอร์มส่งมา (ฟอร์มเดียวกับตอนสร้าง) แล้วบอกว่าจะ
// เพิ่ม/แก้/ลบอะไร. บรรทัดใหม่ไม่มี id; บรรทัดเดิมส่ง id กลับมา.
// คืน { insert, update, remove, blocked } — blocked = แตะบรรทัดที่ล็อกอยู่
export function diffPoLines(existing = [], incoming = [], lockOf = () => null) {
  const byId = new Map(existing.map((l) => [l.id, l]));
  const keepIds = new Set();
  const insert = [];
  const update = [];
  const remove = [];
  const blocked = [];

  for (const row of incoming) {
    const qty = Number(row.qty);
    if (!row.fgCode || !Number.isFinite(qty) || qty <= 0) continue;
    const current = row.id ? byId.get(row.id) : null;
    if (!current) {
      // id ที่ไม่รู้จัก = ของ PO อื่น/ค้างจากหน้าเก่า — ถือเป็นบรรทัดใหม่ ไม่ใช่แก้ข้ามใบ
      insert.push({ fgCode: String(row.fgCode).trim(), qty });
      continue;
    }
    keepIds.add(current.id);
    if (Number(current.qty) === qty) continue; // ไม่เปลี่ยน = ไม่ต้องเขียน DB
    const lock = lockOf(current);
    if (lock) { blocked.push({ fgCode: current.fgCode, reason: lock, action: 'แก้จำนวน' }); continue; }
    update.push({ id: current.id, qty });
  }

  for (const line of existing) {
    if (keepIds.has(line.id)) continue;
    const lock = lockOf(line);
    if (lock) blocked.push({ fgCode: line.fgCode, reason: lock, action: 'ลบ' });
    else remove.push(line.id);
  }

  return { insert, update, remove, blocked };
}

// ข้อความรวมตอนแก้ไม่ผ่านเพราะแตะบรรทัดที่ล็อก
export function blockedLinesMessage(blocked = []) {
  if (!blocked.length) return null;
  const parts = blocked.map((b) => `${b.fgCode} (${b.reason} — ${b.action}ไม่ได้)`);
  return `บันทึกไม่ได้: มีรายการที่ถูกล็อก — ${parts.join(', ')}`;
}
