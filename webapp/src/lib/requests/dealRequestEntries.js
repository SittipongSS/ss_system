// ── "ดีลใบนี้เปิดคำร้องหัวข้อไหนได้บ้าง" ──────────────────────────────────────
//
// ⭐ **มติผู้ใช้ 2026-08-22** — หน้าดีลกับหน้าโครงการเป็นศูนย์กลางการควบคุม จึงต้อง
//    เปิดคำร้องได้จากตรงนั้น · ก่อนหน้านี้หน้าดีลมีทางลัดหัวข้อเดียว (พัฒนาสูตร)
//    ที่เหลือต้องไปเริ่มที่คิว `/requests` แล้วเลือกดีลใหม่เอง
//
// ⚠️⚠️ **"เลือกดีลแล้วเปิดได้ทุกหัวข้อ" ไม่จริง** — 6 หัวข้อในทะเบียนอ้างของคนละอย่าง:
//
//    · `info` · `document` · `formula_dev`  → needs project + deal   ⇒ ดีลพอ
//    · `scent_dev`                          → needs **salesOrder**   ⇒ ต้องมี SO อนุมัติ
//    · `billing_doc`                        → needs **quotation**    ⇒ ต้องมี QT อนุมัติ
//    · `material_eta`                       → needs **[]**           ⇒ ไม่ผูกอะไรเลย
//
//    `material_eta` ไม่ผูกดีล **โดยเจตนา** (มติ 2026-08-03 · ดู `lib/master/requestTypes`:
//    ราคาวัสดุเป็นข้อมูลกลางที่ใช้ข้ามงาน — ผูกดีลคือมัดมันไว้กับรอบเดียว) ⇒ ห้ามเอา
//    ขึ้นหน้าดีล ไม่ใช่เพราะทำไม่ได้ แต่เพราะจะสอนผิดว่าของกลางเป็นของดีล
//
// ⚠️ **ด่านจริงอยู่ที่ server เสมอ** — ที่นี่ตอบแค่ "ปุ่มนี้กดแล้วไปต่อได้ไหม และถ้าไม่ได้
//    เพราะอะไร" · เหตุผลของ SO/QT ยกมาจาก `scentDesignOrderError` / `billingQuotationError`
//    ซึ่งเป็นฟังก์ชันตัวเดียวกับที่ฟอร์มและ handler ใช้ ห้ามเขียนเงื่อนไขใหม่ที่นี่
import { REQUEST_KIND_LIST, requestKindLabel, requestNeeds } from '@/lib/master/requestTypes';
import { billingQuotationOptions } from '@/lib/requests/billingQuotations';
import { scentDesignOrderOptions } from '@/lib/requests/scentDesignOrders';

// หัวข้อที่ "ดีลอย่างเดียวพอ" — คิดจากทะเบียน ไม่ใช่รายชื่อที่ก๊อปมาวาง
// (เพิ่มหัวข้อใหม่ที่ needs = project/deal แล้วปุ่มขึ้นเองโดยไม่ต้องแก้ไฟล์นี้)
export function dealScopedRequestKinds() {
  return REQUEST_KIND_LIST.filter((kind) => {
    const needs = requestNeeds(kind);
    return needs.length > 0 && needs.every((ref) => ref === 'project' || ref === 'deal');
  });
}

/**
 * รายการปุ่ม "เปิดคำร้อง" ของดีลใบหนึ่ง
 *
 * @param deal          แถวดีล (ต้องมี `id` · `projectId`)
 * @param quotations    ใบเสนอราคาของดีลนี้ (สำหรับ `billing_doc`)
 * @param salesOrders   ใบสั่งขายของดีลนี้ พร้อม `lines` (สำหรับ `scent_dev`)
 * @param returnTo      เส้นทางที่จะกลับมาหลังยกเลิก/บันทึก
 * @returns [{ kind, label, blocker, href }] — `blocker` ว่าง = กดได้
 */
export function dealRequestEntries(deal, { quotations = [], salesOrders = [], returnTo = '' } = {}) {
  const link = (params) => {
    const q = new URLSearchParams(params);
    if (returnTo) q.set('returnTo', returnTo);
    return `/requests/new?${q.toString()}`;
  };
  /* ⚠️ ไม่มีดีล = ไม่มีอะไรให้เปิด — เกิดจริงบนหน้าโครงการก่อนผู้ใช้เลือกดีล
     (คืนลิสต์เปล่าดีกว่าคืนปุ่มที่บอกเหตุไม่ได้) */
  if (!deal?.id) return [];

  /* ⚠️ **ดีลลอยเปิดคำร้องไม่ได้** — `REQUEST_NEEDS.project` derive จากดีล ⇒ ดีลที่ยัง
     ไม่ผูกโครงการทำให้ทุกหัวข้อที่ผูกดีลตกด่านที่ server · เกิดบ่อยมากบน prod
     (2026-08-03: 122 จาก 136 ดีลยังไม่ผูกโครงการ) จึงต้องบอกเป็นข้อความ ไม่ใช่ปล่อย
     ให้ไปตายที่หน้าฟอร์ม */
  const noProject = deal.projectId ? '' : 'ดีลนี้ยังไม่ผูกโครงการ — ผูกโครงการก่อนจึงเปิดคำร้องได้';

  const entries = dealScopedRequestKinds().map((kind) => ({
    kind,
    label: requestKindLabel(kind),
    blocker: noProject,
    href: link({ kind, dealId: deal.id, ...(deal.projectId ? { projectId: deal.projectId } : {}) }),
  }));

  /* ⭐ บรีฟกลิ่นเริ่มที่ **ใบสั่งขาย** ไม่ใช่ดีล (ม-40) — บนหน้าดีลจึงขึ้นได้ก็ต่อเมื่อ
     ดีลนี้มี SO ที่เปิดบรีฟได้จริงสักใบ · เลือกใบให้เลยเมื่อมีใบเดียว ส่วนหลายใบ
     ปล่อยให้ฟอร์มถาม (เลือกให้เองตอนมีหลายใบ = เดาแทนผู้ใช้) */
  const scentOrders = scentDesignOrderOptions(salesOrders);
  entries.push({
    kind: 'scent_dev',
    label: requestKindLabel('scent_dev'),
    blocker: scentOrders.length ? '' : 'ดีลนี้ยังไม่มีใบสั่งขายที่เปิดบรีฟกลิ่นได้ — ใบต้องอนุมัติแล้วและมีบรรทัดงานออกแบบกลิ่น',
    href: link({ kind: 'scent_dev', ...(scentOrders.length === 1 ? { salesOrderId: scentOrders[0].id } : {}) }),
  });

  // ขอใบวางบิลเริ่มที่ **ใบเสนอราคาที่อนุมัติแล้ว** (ม-ค) — กติกาเดียวกับข้างบน
  const billQuotes = billingQuotationOptions(quotations);
  entries.push({
    kind: 'billing_doc',
    label: requestKindLabel('billing_doc'),
    blocker: billQuotes.length ? '' : 'ดีลนี้ยังไม่มีใบเสนอราคาที่วางบิลได้ — ใบต้องอนุมัติแล้วและมียอด',
    href: link({ kind: 'billing_doc', ...(billQuotes.length === 1 ? { quotationId: billQuotes[0].id } : {}) }),
  });

  return entries;
}
