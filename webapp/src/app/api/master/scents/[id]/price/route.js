// ── ใส่ราคา F (หัวน้ำหอม ฿/กก.) ให้กลิ่นในทะเบียน ─────────────────────────
// ราคาลง material_prices เป็น rev ปกติ (ก้อนเดียวกับขั้นใส่ราคาในสายคำร้อง —
// ดูเหตุผลที่ lib/master/registryPriceRoute.js)
import { withUser } from '@/lib/http';
import { makeRegistryPriceHandler } from '@/lib/master/registryPriceRoute';
import { findScent } from '@/lib/master/scentFormulaAdmin';
import { SCENT_STATUS_LABELS, isScentUsable } from '@/lib/master/scents';

export const dynamic = 'force-dynamic';

export const POST = withUser(makeRegistryPriceHandler({
  kind: 'RM_F',
  stampColumn: 'scentId',
  entityType: 'scent',
  entityLabel: 'กลิ่น',
  find: findScent,
  // ร่างยังอ้างในคำร้อง/ใบขอราคาผลิตไม่ได้ — ราคาก็ยังไม่ควรมีด้วยเหตุเดียวกัน
  usableError: (scent) => (isScentUsable(scent)
    ? null
    : `กลิ่นสถานะ "${SCENT_STATUS_LABELS[scent.status] || scent.status}" ยังใส่ราคาไม่ได้ — ต้องรับเข้าทะเบียนก่อน`),
}));
