/* ── ช่องบังคับของดีล — สูตรเดียว ใช้ทั้งจอสร้าง จอแก้ และ server ────────────
 *
 * 🐞 **ที่มา (มติผู้ใช้ 2026-09-02):** กติกา "บังคับกรอก" เคยอยู่ในโมดัลสร้างที่เดียว
 *    ⇒ **ฟอร์มแก้บันทึกโดยไม่มีวันเริ่ม/วันสิ้นสุดได้** และ server ก็ไม่ตรวจเลย
 *    (`startDate: body.startDate || null`) · ผลคือของจริง 2026-09-02: 70 ดีลจาก 305 ที่
 *    มียอด (26,534,973 บาท = 42% ของยอด) ไม่มีวันสิ้นสุด ⇒ รายงาน FC วางแผนผลิตต้อง
 *    เดาเดือนส่งของจากวันปิดการขายแทน
 *
 * ⭐ **วันสิ้นสุด = วันที่ลูกค้ารับของ** จึงเป็นช่องที่ขาดไม่ได้จริง ๆ ไม่ใช่ช่องเสริม —
 *    ฝ่ายวางแผนผลิต/จัดซื้ออ่านเดือนของมันเป็นเดือนที่ต้องมีของ
 *
 * ⚠️ ไฟล์นี้เป็นสูตรล้วน (จอ import ได้) — ห้ามใส่อะไรที่แตะฐานหรือ session
 */

/** ป้ายของแต่ละช่อง — ต้องเรียกชื่อ **เหมือนที่ตาเห็นบนฟอร์ม** ไม่งั้นคนอ่าน error
 *  แล้วหาช่องไม่เจอ · ดีลเก่าที่สร้างเป็น Won เปลี่ยนป้ายสองช่องตามฟอร์ม */
export function dealFieldLabels({ legacyWon = false } = {}) {
  return {
    stage: 'สถานะ',
    valueItems: `${legacyWon ? 'มูลค่าที่ปิด' : 'มูลค่าคาดการณ์'} (อย่างน้อย 1 หมวดสินค้า)`,
    expectedCloseDate: legacyWon ? 'วันที่ปิด' : 'วันที่คาดการณ์ปิด',
    startDate: 'วันที่เริ่ม',
    endDate: 'วันที่สิ้นสุด (ลูกค้าต้องการรับ)',
  };
}

/** ช่องที่ยังขาด — คืนเป็น **คีย์** ให้ผู้เรียกแปลงเป็นป้ายเอง (server ไม่ต้องรู้ภาษาจอ) */
export function missingDealFieldKeys(draft = {}) {
  const blank = (value) => !String(value ?? '').trim();
  return [
    ['stage', blank(draft.stage)],
    ['valueItems', !(draft.valueItems || []).length],
    ['expectedCloseDate', blank(draft.expectedCloseDate)],
    ['startDate', blank(draft.startDate)],
    ['endDate', blank(draft.endDate)],
  ].filter(([, absent]) => absent).map(([key]) => key);
}

/** ข้อความเดียวที่บอกทุกช่องที่ขาด — กดครั้งเดียวรู้ครบ ไม่ใช่เจอทีละช่อง */
export function missingDealFieldsMessage(draft = {}, { legacyWon = false, title = null } = {}) {
  const keys = missingDealFieldKeys(draft);
  if (!keys.length) return null;
  const labels = dealFieldLabels({ legacyWon });
  const named = keys.map((key) => labels[key] || key).join(' · ');
  return `กรุณากรอก ${named} ให้ครบทุกใบ${title ? ` — "${title}"` : ''}`;
}

/* ── ฝั่ง server ────────────────────────────────────────────────────────────
 *
 * ⚠️ **ตรวจจาก "ดีลหลังบันทึก" ไม่ใช่จาก body** — ฟอร์มแก้ส่งทั้งก้อนก็จริง แต่ PATCH
 *    เส้นเดียวกันนี้ยังมีผู้เรียกแบบ action (เปลี่ยนขั้น · ผูกโครงการ) ที่ส่งมาไม่กี่ช่อง
 *    ถ้าตรวจจาก body ตรง ๆ การกดปุ่มพวกนั้นบนดีลเก่าที่ยังไม่มีวันจะถูกบล็อกทันที
 *    ทั้งที่ไม่ได้แตะวันเลย
 *
 * ⚠️ **สายสหมิตรไม่ผ่านเส้นนี้** — `create-sales-deal` / `sync-sales-planning` เขียน
 *    `sales_deals` ตรง ๆ ด้วย service-role ⇒ ด่านนี้ไม่กระทบมัน (ตั้งใจ: FC สหมิตรมา
 *    จากรอบพยากรณ์ ไม่ใช่ดีลที่คนกรอกเอง)
 */

/** ดีลจะถือว่าครบเมื่อมีวันเริ่ม + วันสิ้นสุด — สองช่องที่รายงานวางแผนผลิตต้องใช้ */
export const REQUIRED_DEAL_DATES = ['startDate', 'endDate'];

/**
 * ตรวจว่าคำขอนี้ทำให้ดีล "ยังขาดวัน" อยู่หรือไม่
 * @param before  แถวดีลปัจจุบัน (null เมื่อสร้างใหม่)
 * @param body    payload ที่ส่งมา
 * @returns ชื่อช่องที่ขาดหลังบันทึก (ว่าง = ผ่าน)
 */
export function missingDealDatesAfterWrite(before, body = {}) {
  const resolved = (key) => (key in body ? body[key] : before?.[key]);
  return REQUIRED_DEAL_DATES.filter((key) => !String(resolved(key) ?? '').trim());
}

/* คำขอที่ถือว่าเป็น "การบันทึกจากฟอร์มดีล" — ฟอร์มส่งชื่อดีลมาด้วยเสมอ ส่วนปุ่ม
   action (เปลี่ยนขั้น/ผูกโครงการ/ปลดโครงการ) ไม่เคยส่ง `title` มา
   ⇒ ใช้เป็นเส้นแบ่งว่าจะบังคับวันหรือไม่ · แคบและอ่านออก ดีกว่าเดาจากจำนวนคีย์ */
export const isDealFormSave = (body = {}) => 'title' in body;
