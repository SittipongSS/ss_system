// ── คำร้องที่หายพ่วงไปกับการลบดีล/โครงการ ────────────────────────────────────
//
// 🐞 **ของจริง (ตรวจ 2026-09-25):** ลบดีลหนึ่งใบ = คำร้องทุกใบที่ผูกดีลนั้นถูกลบผ่าน RPC
//    `force_delete_dept_request` เงียบ ๆ — ทั้งทางปกติของ AE ไม่ใช่แค่ทางบังคับลบของแอดมิน
//    และไม่มี audit ของตัวคำร้องสักแถว ⇒ ตามไม่ได้ว่าใครลบ และกู้ได้เฉพาะจาก snapshot ของ
//    การแก้ไขครั้งสุดท้าย · หายจริง 11 ใบ เช่น RQ-IQ-26090026 (RD ตอบราคาแล้ว) และ
//    RQ-IQ-26090079/82 (RD ยังทำอยู่ — หลุดคิวไปเลย)
//    ต้นทางคือ AE เปลี่ยนลูกค้าของดีลไม่ได้เมื่อมีคำร้องผูกอยู่ จึงเปิดดีลใหม่แล้วลบใบเก่าทิ้ง
//
// ⭐ **กติกาเดียวกับ trigger `guard_dept_request` (mig 0173)** — คำร้องที่เคยส่งแล้ว
//    ลบได้เฉพาะผู้ดูแลระบบ · ทางลบดีล/โครงการเคยเดินอ้อมกติกานี้ด้วย RPC บังคับลบ
//    ⇒ ตอนนี้ทางปกติต้องหยุดด้วยเงื่อนไขเดียวกับ trigger: ร่างที่ยังไม่เคยส่งเท่านั้นที่ลบพ่วงได้
//
// ⭐ **ทางบังคับลบต้องเขียน audit ของคำร้องทีละใบก่อนลบ** — `audit_logs.before` คือทางกู้
//    ทางเดียว (ระบบไม่มีถังขยะ) · อ่านไม่ขึ้น = หยุด ไม่ใช่ลบต่อโดยไม่มีร่องรอย

/** ร่างที่ยังไม่เคยส่ง — ตรงกับเงื่อนไขที่ trigger ยอมให้ลบตรง */
export function isUnsentDraft(row) {
  return row?.status === 'draft' && !row?.submittedAt;
}

/** คำร้องที่ถึงมือฝ่ายอื่นแล้ว (รวมใบที่ตีกลับ/ปิด/ยกเลิก) — ลบพ่วงไม่ได้ */
export function isSentRequest(row) {
  return Boolean(row) && !isUnsentDraft(row);
}

function requestLabel(row) {
  return row?.docNo || row?.id || '';
}

const LISTED = 5;

/** รายการเลขที่ย่อ: 5 ใบแรก + "อีก N ใบ" */
function requestList(rows) {
  const labels = rows.map(requestLabel).filter(Boolean);
  const head = labels.slice(0, LISTED).join(' · ');
  const more = labels.length - LISTED;
  return more > 0 ? `${head} และอีก ${more} ใบ` : head;
}

/**
 * ข้อความของด่าน — บอกว่าติดใบไหน ทำไมลบไม่ได้ และทางออก
 * `owner` = 'ดีล' | 'โครงการ'
 */
export function sentRequestsBlockMessage(rows, owner = 'ดีล') {
  const sent = (rows || []).filter(isSentRequest);
  if (!sent.length) return null;
  const way = owner === 'ดีล'
    ? 'ถ้าดีลนี้ไม่ไปต่อแล้วให้ปิดเป็น Lost แทนการลบ · ถ้าต้องลบจริงให้ผู้ดูแลระบบลบ'
    : 'ถ้าต้องลบจริงให้ผู้ดูแลระบบลบ';
  return `${owner}นี้มีคำร้องที่ส่งถึงฝ่ายอื่นแล้ว ${sent.length} ใบ (${requestList(sent)})`
    + ` — ลบ${owner}ไม่ได้ เพราะคำร้องพร้อมคำตอบของฝ่ายนั้นจะหายไปด้วยและกู้คืนไม่ได้ · ${way}`;
}

/** บรรทัดเตือนในพรีวิวบังคับลบของแอดมิน — null ถ้าไม่มีใบที่ส่งแล้ว */
export function sentRequestsForceNote(rows) {
  const sent = (rows || []).filter(isSentRequest);
  if (!sent.length) return null;
  return `⚠️ คำร้องที่ส่งถึงฝ่ายอื่นแล้ว ${sent.length} ใบ (${requestList(sent)}) จะถูกลบพร้อมเธรด`
    + ' — กู้คืนได้จากประวัติการแก้ไข (audit) เท่านั้น';
}

/**
 * คำร้องที่ผูก `column = value` (dealId / projectId) — อ่านไม่ขึ้นต้องโยน
 * ⚠️ supabase ไม่ throw: นับไม่ขึ้น = ได้ [] = ด่านเปิดเอง แล้วคำร้องหายเงียบเหมือนเดิม
 */
export async function requestsLinkedTo(supabase, column, value) {
  const { data, error } = await supabase
    .from('dept_requests').select('id, docNo, status, submittedAt').eq(column, value);
  if (error) throw new Error(`อ่านคำร้องที่ผูก${column === 'dealId' ? 'ดีล' : 'โครงการ'}ไม่สำเร็จ: ${error.message}`);
  return data || [];
}

/**
 * snapshot เต็มแถว + เธรดของคำร้องที่กำลังจะถูกลบ — ใช้เป็น `before` ของ audit
 * ⚠️ อ่านไม่ขึ้นต้องโยน: ผู้เรียกกำลังจะลบ ถ้าไม่มี snapshot = หายแบบกู้ไม่ได้
 */
export async function snapshotRequestsForAudit(supabase, ids) {
  const list = (ids || []).filter(Boolean);
  if (!list.length) return [];
  const [rows, thread] = await Promise.all([
    supabase.from('dept_requests').select('*').in('id', list),
    supabase.from('entity_updates').select('*').eq('entityType', 'dept_request').in('entityId', list),
  ]);
  if (rows.error) throw new Error(`อ่านคำร้องก่อนลบไม่สำเร็จ: ${rows.error.message}`);
  if (thread.error) throw new Error(`อ่านเธรดคำร้องก่อนลบไม่สำเร็จ: ${thread.error.message}`);
  const byRequest = new Map();
  for (const post of thread.data || []) {
    const key = String(post.entityId);
    if (!byRequest.has(key)) byRequest.set(key, []);
    byRequest.get(key).push(post);
  }
  return (rows.data || []).map((row) => ({ ...row, thread: byRequest.get(String(row.id)) || [] }));
}

/** summary ของ audit ต่อใบ — `cause` เช่น "ลบดีล DL-260900432" */
export function requestCascadeSummary(row, cause) {
  const title = row?.title ? ` ${row.title}` : '';
  return `ลบคำร้อง ${requestLabel(row) || '(ร่าง)'}${title} พ่วง${cause}`;
}
