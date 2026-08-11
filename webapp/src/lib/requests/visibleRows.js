// ── แถวคำร้องที่ผู้ใช้คนหนึ่งมองเห็น — จุดเดียวของทั้งระบบ ────────────────
//
// ทำไมต้องแยกออกมา: ตัวเลขบนเมนู ("คำร้อง 6") กับจำนวนแถวในหน้าคิวต้องมาจาก
// ชุดเดียวกัน ไม่งั้นคนกดเข้าไปแล้วนับไม่ตรงกับที่เมนูบอก แล้วจะเลิกเชื่อตัวเลข
// ⇒ ทั้ง GET /api/sa/requests และ GET /api/nav/counts เรียกฟังก์ชันนี้ตัวเดียวกัน
//
// ⚠️ **ด่านขอบเขตอยู่ที่นี่ ไม่ใช่ที่จอ** (กฎเดียวกับ lib/requests/scope.js) —
// กรองที่จอแปลว่าใบของทีมอื่นถูกส่งถึงเบราว์เซอร์แล้วค่อยซ่อน เปิดดูได้จากแท็บ Network
import {
  REQUEST_ANSWER_DEPARTMENTS, canAnswerRequestsFor, isSuperuser,
} from '@/lib/permissions';
import { REQUEST_SCOPES, resolveScope, scopeFilter } from '@/lib/requests/scope';
import { loadRequests } from '@/lib/materialPricesAdmin';

/**
 * @param supabase   client ที่มีสิทธิ์อ่านแล้ว (ด่านสิทธิ์ของ role อยู่ที่ผู้เรียก)
 * @param user       ผู้ใช้ที่ล็อกอินอยู่
 * @param scopeParam ค่าดิบจาก `?scope=` — null/ไม่รู้จัก = ไม่ได้ระบุ
 * @param status     กรองสถานะ (ถ้ามี)
 * @returns { rows, scope, explicit }
 *   rows     ติดธง `_mine` มาแล้ว
 *   scope    ขอบเขตที่ใช้จริงหลังถอยตามสิทธิ์ — 'all' เมื่อ admin ไม่ได้ระบุมา
 *   explicit ผู้เรียกระบุ `?scope=` มาเองหรือไม่
 *
 * ⚠️ `_mine` ที่นี่ = "ฉันเป็นคนเปิดใบนี้" เท่านั้น ไม่ใช่ "ฉันจัดการได้" —
 * ตั้งแต่เปิดให้ทีมทำแทนกันได้ (ม-100) สองอย่างนี้ไม่เท่ากันแล้ว · หน้ารายละเอียด
 * ติดธงชื่อเดียวกันแต่คนละความหมาย อย่า "แก้ให้ตรงกัน" โดยไม่อ่านสองที่ก่อน
 */
export async function loadVisibleRequests(supabase, user, { scopeParam = null, status = null } = {}) {
  const scope = resolveScope(user, scopeParam);
  const explicit = REQUEST_SCOPES.includes(scopeParam);
  const scopeWhere = scopeFilter(user, scope);
  const decorate = (rows) => rows.map((r) => ({ ...r, _mine: r.requestedById === user?.id }));

  // ⚠️ **ผู้ดูแลระบบที่ไม่ได้ระบุขอบเขตต้องเห็นทุกใบ** — ของเดิมเอาค่าตั้งต้น "ของฉัน"
  // มาใช้ ⇒ admin ที่ไม่ได้เปิดใบเองเห็นคิวว่างทั้งที่มีงานอยู่จริง (ผู้ใช้เจอเองบนจอ)
  // ระบุ `?scope=` มาเมื่อไรก็ยังเคารพเหมือนเดิม — ที่แก้คือค่าตั้งต้น ไม่ใช่ด่าน
  if (isSuperuser(user?.role)) {
    const adminWhere = explicit ? (scopeWhere || {}) : {};
    return {
      rows: decorate(await loadRequests(supabase, { status, ...adminWhere })),
      scope: explicit ? scope : 'all',
      explicit,
    };
  }

  // ผู้ใช้ทั่วไป: `scopeWhere` แคบกว่าหรือเท่ากับ "ของตัวเอง" เสมอ (resolveScope
  // ไม่มีทางคืน 'all' ให้คนที่ไม่ใช่ผู้ดูแล) ⇒ ใช้แทนตัวกรองเดิมได้ตรง ๆ
  const mine = await loadRequests(supabase, { status, ...(scopeWhere || {}) });
  // ฝ่ายที่ผู้ใช้คนนี้รับคำร้องได้ — อ่านจากลิสต์กลาง ไม่สะกดเองในนี้
  const dept = REQUEST_ANSWER_DEPARTMENTS.find((d) => canAnswerRequestsFor(user, d));
  if (!dept) return { rows: decorate(mine), scope, explicit };

  const queue = await loadRequests(supabase, { status, dept });
  const byId = new Map([...queue, ...mine].map((r) => [r.id, r]));
  // ร่างของคนอื่นยังไม่ถูกส่ง = ยังไม่ใช่งานของฝ่าย ไม่ควรโผล่ในคิว
  const rows = [...byId.values()]
    .filter((r) => r.status !== 'draft' || r.requestedById === user?.id)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return { rows: decorate(rows), scope, explicit };
}

/** ฝ่ายที่ผู้ใช้คนนี้รับคำร้องได้ — ตัวเดียวกับที่หน้าคิวใช้คำนวณแท็บ "รอฉันตอบ" */
export function answerableDepts(user) {
  return REQUEST_ANSWER_DEPARTMENTS.filter((d) => canAnswerRequestsFor(user, d));
}
