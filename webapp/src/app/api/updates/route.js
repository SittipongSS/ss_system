// ── API เธรดอัปเดตของกลาง (mig 0163) ─────────────────────────────────────
// GET  /api/updates?entityType=&entityId=   เธรดของ entity หนึ่ง (เก่า→ใหม่)
// POST /api/updates                          โพสต์ข้อความใหม่
//
// ⚠️ ด่านจริงอยู่ที่ทะเบียน lib/master/updateAccess.js ทั้งหมด — proxy เห็นแค่ role
// ไม่รู้จัก entity; route นี้ไม่ตัดสินสิทธิ์เองสักบรรทัด
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import {
  canPostUpdate, canViewUpdates, isUpdateEntity, loadUpdateParent, updateEntityConfig,
} from '@/lib/master/updateAccess';
import {
  defaultAuthorableKind, isAuthorableKind, kindAcceptsDueDate, sanitizeUpdateAttachments,
} from '@/lib/master/updateTypes';
import { quoteTargetError } from '@/lib/master/updateQuote';
import { sanitizeMentions } from '@/lib/master/mentions';
import { appendUpdate, findUpdate, listUpdates } from '@/lib/master/updates';
import { replyClearsClosure } from '@/lib/requests/closure';
import { requestIsThreadOnly } from '@/lib/requests/replyTurn';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const entityType = url.searchParams.get('entityType');
    const entityId = url.searchParams.get('entityId');
    if (!isUpdateEntity(entityType) || !entityId) {
      return Response.json({ error: 'entityType/entityId ไม่ถูกต้อง' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const user = await getCurrentUser();
    const parent = await loadUpdateParent(supabase, entityType, entityId);
    // ไม่มี entity หรือมองไม่เห็น = ตอบเหมือนกัน (ไม่บอกใบ้ว่ามีของอยู่)
    if (!parent || !(await canViewUpdates(supabase, entityType, parent, user))) {
      return Response.json({ error: 'ไม่พบรายการนี้' }, { status: 404 });
    }

    return Response.json({
      items: await listUpdates(supabase, entityType, entityId),
      canPost: await canPostUpdate(supabase, entityType, parent, user),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST { entityType, entityId, body?, kind?, dueDate?, attachments? }
//
// `kind` รับได้เฉพาะชนิดที่ entity นั้นประกาศว่า authorable (ฟีดดีลมี โทร/ประชุม/
// อีเมล/ขั้นถัดไป · ที่เหลือมี comment ตัวเดียว) — ชนิดของเหตุการณ์ระบบยังส่งจาก
// client ไม่ได้เด็ดขาด มันเขียนผ่าน appendUpdate ฝั่ง server ของโมดูลนั้นเท่านั้น
// (ปล่อยให้ client เลือก kind='status' เอง = ปลอมไทม์ไลน์ได้)
export async function POST(request) {
  try {
    const supabase = getSupabaseAdmin();
    const user = await getCurrentUser();
    const payload = await request.json().catch(() => ({}));
    const { entityType, entityId } = payload;
    if (!isUpdateEntity(entityType) || !entityId) {
      return Response.json({ error: 'entityType/entityId ไม่ถูกต้อง' }, { status: 400 });
    }

    const parent = await loadUpdateParent(supabase, entityType, entityId);
    if (!parent || !(await canViewUpdates(supabase, entityType, parent, user))) {
      return Response.json({ error: 'ไม่พบรายการนี้' }, { status: 404 });
    }
    if (!(await canPostUpdate(supabase, entityType, parent, user))) {
      return Response.json({ error: 'ไม่มีสิทธิ์โพสต์ในเธรดนี้' }, { status: 403 });
    }

    const text = String(payload.body ?? '').trim();
    const attachments = updateEntityConfig(entityType)?.attachments
      ? sanitizeUpdateAttachments(payload.attachments)
      : [];
    // ข้อความว่างได้ถ้ามีไฟล์ (โพสต์รูปล้วน) แต่ว่างทั้งคู่ไม่ได้
    if (!text && !attachments.length) {
      return Response.json({ error: 'ต้องพิมพ์ข้อความหรือแนบไฟล์' }, { status: 400 });
    }

    // ไม่ส่ง kind มา = ชนิดตั้งต้นของ entity · ส่งมาแต่ไม่ใช่ชนิดที่คนเลือกได้ = ตีกลับ
    // (ไม่ถอยไปใช้ค่าตั้งต้นเงียบ ๆ — ผู้ใช้ต้องรู้ว่าโพสต์ไม่ได้อย่างที่ตั้งใจ)
    const kind = payload.kind == null || payload.kind === ''
      ? defaultAuthorableKind(entityType)
      : String(payload.kind);
    if (!isAuthorableKind(entityType, kind)) {
      return Response.json({ error: 'ชนิดอัปเดตไม่ถูกต้อง' }, { status: 400 });
    }
    // กำหนดวันรับเฉพาะชนิดที่ประกาศว่ารับ — ชนิดอื่นส่งมาก็ทิ้ง ไม่ให้ meta มั่ว
    const meta = {};
    const dueDate = String(payload.dueDate ?? '').trim();
    if (dueDate && kindAcceptsDueDate(entityType, kind)) meta.dueDate = dueDate.slice(0, 10);

    // ยกคำพูด — ต้องยืนยันว่าข้อความต้นทางอยู่ในเธรดเดียวกันจริง ไม่ใช่เชื่อ id
    // ที่ client ส่งมา (กล่อง quote แสดงเนื้อความต้นทาง = ยก id ข้ามเธรดได้เท่ากับ
    // อ่านข้อความของเอกสารที่ตัวเองไม่มีสิทธิ์)
    const quotedId = String(payload.quotedId ?? '').trim();
    if (quotedId) {
      const quotedRow = await findUpdate(supabase, quotedId);
      const problem = quoteTargetError(quotedRow, { entityType, entityId });
      if (problem) return Response.json({ error: problem }, { status: 400 });
      meta.quotedId = quotedRow.id;
    }

    // ── กล่าวถึงคน ─────────────────────────────────────────────────────
    // 🔴 กรองด้วยด่านของ entity นี้เสมอ — @คนที่เปิดเธรดไม่ได้ = เขาได้แจ้งเตือน
    // ที่กดแล้วเจอ 404 และรู้ว่ามีเอกสารนี้อยู่ทั้งที่ไม่ควรรู้
    // เก็บทั้ง id (ใช้ส่งแจ้งเตือน) และชื่อ ณ ตอนพิมพ์ (ใช้ไฮไลต์ให้ตรงกับข้อความ
    // ที่บันทึกไว้ แม้เจ้าตัวจะเปลี่ยนชื่อทีหลัง)
    const mentions = await sanitizeMentions(supabase, entityType, parent, payload.mentions);
    if (mentions.length) {
      meta.mentions = mentions.map((m) => m.id);
      meta.mentionNames = mentions.map((m) => m.name).filter(Boolean);
    }

    // คนกดปุ่มส่ง = ต้องรู้ว่าไม่สำเร็จ ห้ามกลืน error แล้วตอบ 201
    const { row, error } = await appendUpdate(supabase, {
      entityType, entityId, kind, body: text || null, meta, attachments, user,
    });
    if (error) return Response.json({ error: `บันทึกอัปเดตไม่สำเร็จ: ${error}` }, { status: 500 });

    /* ⭐ **คำร้องจำว่า "ฝั่งไหนพูดล่าสุด"** (mig 0270 · มติผู้ใช้ 2026-08-20) — หัวข้อ
       ที่ทั้งใบคือเธรด (สอบถามข้อมูล) ไม่มีบรรทัดให้เดินสถานะ ⇒ คิวไม่มีทางรู้ว่าลูก
       ปิงปองอยู่ฝั่งไหน · ป้าย "รอ X ตอบ" อ่านค่านี้ (ดู `lib/requests/replyTurn.js`)
       ⚠️ **เฉพาะ `comment` = ข้อความที่คนพิมพ์** — เหตุการณ์ระบบ (รับเรื่อง · แจ้ง
       กำหนดส่ง · ส่งงาน) ไม่ใช่การตอบ และมีสถานะของตัวเองเล่าอยู่แล้ว
       ⚠️ ฝั่งตัดสินจาก **ฝ่ายของคนโพสต์เทียบฝ่ายปลายทางของใบ** ไม่ใช่ "เป็นคนเปิดใบ
       ไหม" — เพื่อนร่วมทีมของผู้ขอตอบแทนกันได้ และ RD คนไหนในฝ่ายก็นับเป็นฝั่งฝ่าย
       ⚠️ **กลืน error โดยตั้งใจ** — สัญญาเดียวกับ `appendUpdate`: เขียนของเสริมพลาด
       ต้องไม่ทำให้ข้อความที่บันทึกสำเร็จแล้วตอบ 500 · และรีโปที่ยังไม่ได้รัน mig 0270
       ต้องยังโพสต์ได้ตามปกติ */
    if (entityType === 'dept_request' && kind === 'comment') {
      const side = user?.department && user.department === parent?.dept ? 'dept' : 'requester';
      const turnPatch = { lastReplySide: side, lastReplyAt: row.createdAt };

      /* ⭐ **ถูกถามกลับ = ตราปิดของอีกฝั่งหลุดเอง** (มติผู้ใช้ 2026-08-20 · ปิดสองฝั่ง)
         *"แล้วถ้าตอบ แต่ต้องถามกลับล่ะ แบบโต้ตอบไปมา"* — ใบสอบถามไม่มีแถว เธรดคือ
         ตัวงาน ⇒ ข้อความจากอีกฝั่งคือหลักฐานว่ายังไม่จบ ไม่ต้องให้ใครไปกด "ยังไม่จบ"
         ⚠️ ใบที่มีแถวไม่หลุดตามข้อความ — ตัวงานคือแถว ถามกันระหว่างทางเป็นเรื่องปกติ */
      const clears = replyClearsClosure(parent, {
        side, threadOnly: requestIsThreadOnly(parent?.kind) && !(parent?.items || []).length,
      });
      if (clears === 'dept') Object.assign(turnPatch, { answeredAt: null, answeredById: null, answeredByName: null, status: 'acknowledged' });
      if (clears === 'requester') Object.assign(turnPatch, { closedAt: null, closedById: null, closedByName: null, status: 'acknowledged' });

      const { error: turnError } = await supabase.from('dept_requests')
        .update(turnPatch).eq('id', entityId);
      if (turnError) console.error('[updates] stamp lastReplySide failed', turnError.message);
    }

    await recordAudit({
      user, action: 'create', entityType: 'entity_update', entityId: row.id, after: row,
      summary: `โพสต์อัปเดตใน ${entityType} ${entityId}`, request,
    });
    return Response.json(row, { status: 201 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
