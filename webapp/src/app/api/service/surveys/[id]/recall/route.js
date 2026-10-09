// ── ดึงผลประเมินกลับมาแก้ (§5E ④ · มติข้อ 25) ────────────────────────────
//
// ⭐ **"ดึงกลับ" ไม่ใช่ "ตีกลับ"** — คำนี้ล็อกไว้ทั้งระบบแล้ว (`hops.js`):
//   ตีกลับ = ผู้รับส่งคืน · ดึงกลับ = คนที่ส่งเอาคืนเอง ⇒ คนที่ส่งผลคือ TS
//
// 🔴 **เป็นความสามารถใหม่ ไม่ใช่การใช้ของเดิมซ้ำ** — `reopenRequestError` บล็อก `closed`
//   ไว้ชัดเจน แต่กรณีนี้คือ *หลัง SA ปิดใบไปแล้ว* พอดี ⇒ ต้องมีด่านของตัวเอง
//   ⚠️ **ไม่แตะ `reopenRequestError`** ซึ่งเป็นกติกากลางของทุกหัวข้อ — เปิดกว้างที่นั่น
//     เมื่อไร ทุกฝ่ายลากใบที่ปิดครบสองฝั่งแล้วกลับมาได้ · ประตูนี้แคบเฉพาะใบประเมิน
//
// 🔴 **จุดอันตรายที่สุดของทั้งแผน** — SA อาจเอาตัวเลขผิดไปเสนอราคาไปแล้ว
//   ⇒ ต้อง **ตรึงตัวเลขที่ส่งไปแล้ว** ไว้ในเธรด เพื่อให้ตอนส่งรอบใหม่บอกส่วนต่างได้
//     (เก็บใน `entity_updates.meta` — ไม่ต้องมีคอลัมน์ใหม่)
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound, conflict } from '@/lib/http';
import { canSendSurveyResult } from '@/lib/permissions';
import { appendUpdate } from '@/lib/master/updates';
import { canAnswerRequest } from '@/lib/requests/access';
import { loadSurveyZones } from '@/lib/service/surveyRepo';
import { surveyPackagesText, surveyRecallError, surveyTotals } from '@/lib/service/survey';
/* ⚠️ เอกสารประเมิน: import ได้เฉพาะตัวอ่านแถว (`surveyReportRows`) — เส้นนี้ต้องไม่ลาก sharp / chromium เข้ามา
   (สเปก PR-2 มติ 24 · ด่าน `check-doc-tracing.mjs` ตรวจผล build) */
import { surveyReportVoided } from '@/lib/service/surveyReportRows';

export const dynamic = 'force-dynamic';

/* กระดิ่งพิมพ์ข้อความของแถวเธรดแค่ 500 ตัวแรก (`notifyThreadUpdate` · `lib/notifications.js`) — แถวเธรดเองเก็บได้ 4,000 */
const BELL_BODY_LIMIT = 500;

export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    const body = await req.json().catch(() => ({}));
    const reason = String(body.reason ?? '').trim();

    const { data: request, error: reqError } = await supabase
      .from('dept_requests').select('*').eq('id', id).maybeSingle();
    if (reqError) return fail(reqError.message, 500);
    if (!request) return notFound('ไม่พบใบคำร้อง');

    /* 🔴 **ประตูนี้เป็นของใบประเมินพื้นที่ที่ส่งถึงฝ่ายเราเท่านั้น** — ด่านข้างล่างถามแค่ตำแหน่ง · สถานะ · เหตุผล
       🐞 เดิม (ตั้งแต่ #1645) ไม่ถามหัวข้อและไม่ถามฝ่าย ⇒ หัวหน้าฝ่ายบริการยิง id ของคำร้องหัวข้ออื่น (เช่นใบที่ RD ตอบแล้ว
          ฝ่ายขายปิดแล้ว) มาที่เส้นนี้ได้: คำตอบกับตราปิดถูกล้าง ใบกลับเป็น `acknowledged` และผู้ขอได้กระดิ่ง
          "TS ดึงผลประเมินกลับมาแก้ … 0 พื้นที่" · ไม่มีจอไหนพามาถึง (ยิง API ตรงเท่านั้น) แต่เส้นส่งผลกันไว้แล้ว เส้นนี้ต้องกันด้วย
       ⚠️ ถามฝ่าย (`canAnswerRequest` — ตัวเดียวกับเส้นส่งผล) เฉพาะคนที่ผ่านด่านหัวหน้าแล้ว — ช่างยังได้ข้อความเดิมของ
          `surveyRecallError` ("ได้เฉพาะหัวหน้าฝ่ายบริการ") ไม่ใช่ "เฉพาะฝ่าย TS" ซึ่งเขาอยู่ในฝ่ายนั้นเอง */
    if (request.kind !== 'site_survey') return notFound('ไม่พบใบประเมินพื้นที่');
    const canRecall = canSendSurveyResult(user);
    if (canRecall && !canAnswerRequest(user, request)) return forbidden(`ดึงผลกลับได้เฉพาะฝ่าย ${request.dept}`);

    /* 🔑 ด่านตัวเดียวกับที่ปุ่มบนจอใช้ — สิทธิ์ · สถานะ · เหตุผล อยู่ในนั้นครบ */
    const gate = surveyRecallError(request, { reason, canRecall });
    if (gate) {
      if (/ต้องบอกเหตุผล/.test(gate)) return badRequest(gate);
      if (/ได้เฉพาะหัวหน้า/.test(gate)) return forbidden(gate);
      return conflict(gate);
    }

    /* ตัวเลขที่ส่งไปแล้ว — ตรึงไว้ในเธรดเพื่อให้รอบส่งถัดไปบอกส่วนต่างได้
       ⚠️ อ่านจากแถวผลวัดจริง ไม่ใช่จาก audit เก่า — ระหว่างที่ใบปิดอยู่ไม่มีใครแก้ได้ (`surveyEditLockError` ล็อกไว้)
          ⇒ ค่านี้ = ค่าที่ SA ได้รับไป
       🔴 **อ่านก่อน update เสมอ** — สองเหตุผล:
          ① `loadSurveyZones` โยนเมื่ออ่านพลาด · 🐞 เดิมอ่านหลัง update: update commit ไปแล้ว (คำตอบถูกล้าง ทริกเกอร์ 0401 ⑤
             แทนที่เอกสารแล้ว) แล้วเส้นตอบ 500 โดยไม่มีแถวเธรด ไม่มีกระดิ่ง ไม่มี audit · กดใหม่ได้ 409 "ถูกดึงผลกลับไปแล้ว"
             ⇒ ฝ่ายขายไม่มีวันรู้ว่าตัวเลขถูกดึงกลับและเอกสารใช้ไม่ได้แล้ว · อ่านก่อน = พลาดแล้วยังไม่มีอะไรถูกเขียน กดใหม่ได้
          ② หลัง update ใบปลดล็อกแล้ว — ช่างที่บันทึกแทรกในช่องนั้นทำให้ "ตัวเลขที่ส่งไปแล้ว" กลายเป็นตัวเลขที่ไม่เคยถูกส่ง
       ⚠️ อยู่หลังด่าน — คำขอที่ถูกตีกลับไม่ต้องแตะตารางผลวัด */
    const totals = surveyTotals(await loadSurveyZones(supabase, id));

    const nowIso = new Date().toISOString();
    /* ⭐ **ถอยไปขั้น "ส่งผลประเมิน" ไม่ถอยถึงลงคิว** (แผน §5E ④) — ขนาดวัดมาแล้ว
       แค่ตัวเลขผิด ⇒ ล้างตราปิดทั้งสองฝั่ง แล้วใบกลับเป็น `acknowledged`
       ⚠️ ล้าง `closedAt` ด้วย ไม่ใช่แค่ `answeredAt` — ไม่งั้นใบค้างสถานะที่ผู้ขอ
         ปิดไปแล้วแต่ฝ่ายยังไม่ตอบ ซึ่งเป็นสภาพที่ไม่มีปุ่มไหนพาออกมาได้
       ⚠️ **ไม่แตะ `committedDueDate`** — ต่างจาก §5E ② ตรงนี้ไม่ต้องไปวัดใหม่
       ⭐ **ล้างคำตอบ "ต้องยืนยันหน้างานไหม" ไปด้วย** (`surveyConfirm` · mig 0408 · งวด S2a) — คำตอบนั้นเป็นของรอบที่ส่งไปแล้ว
          ระหว่างแก้ วิธีประเมินของพื้นที่เปลี่ยนได้ ⇒ ส่งรอบใหม่หัวหน้าต้องเลือกใหม่ (เส้นส่งผลเขียนคอลัมน์นี้เฉพาะใบที่มีพื้นที่จากแบบ
          ถ้าไม่ล้าง ใบที่กลับมาเป็นลงหน้างานล้วนจะถือคำตอบเก่าค้างไว้) · ไม่มีการปฏิเสธเพิ่ม ทุกใบได้คีย์นี้เป็น null */
    const patch = {
      answeredAt: null, answeredById: null, answeredByName: null,
      closedAt: null, closedById: null, closedByName: null,
      status: 'acknowledged',
      surveyConfirm: null,
      updatedAt: nowIso,
    };
    /* 🔴 **กดซ้ำ / สองจอกดพร้อมกัน ต้องได้ผลครั้งเดียว** (สเปก PR-2 §6) — ทั้งสองคำขออ่านใบตอนยังตอบอยู่และผ่านด่าน
       ข้างบนทั้งคู่ ⇒ ตัวตัดสินคือ update เอง: เขียนเฉพาะแถวที่ `answeredAt` ยังไม่ว่าง · ไม่มีแถว = อีกคำขอดึงไปแล้ว
       🐞 เดิม (`.eq('id')` ล้วน + `.single()`) คำขอที่สองเขียนทับสำเร็จ ⇒ เธรดสองแถว กระดิ่งสองรอบถึงฝ่ายขาย
       ⚠️ `.maybeSingle()` ไม่ใช่ `.single()` — ศูนย์แถวที่นี่คือคำตอบ ไม่ใช่ error */
    const { data, error } = await supabase
      .from('dept_requests').update(patch).eq('id', id)
      .not('answeredAt', 'is', null)
      .select().maybeSingle();
    if (error) return fail(error.message, 500);
    if (!data) return conflict('ใบนี้ถูกดึงผลกลับไปแล้ว — โหลดหน้าใหม่');

    /* ⭐ **เอกสารประเมินที่เพิ่งใช้ไม่ได้** (mig 0401 ⑤) — ที่นี่ไม่มีโค้ดแทนที่เอกสาร: ทริกเกอร์ของฐานทำในคำสั่ง update
          ข้างบนเอง · เส้นนี้แค่ **อ่านเลขที่** มาบอกฝ่ายขาย ซึ่งอาจส่ง PDF ฉบับลูกค้าออกไปแล้ว
       🔴 **อ่านหลัง update เสมอ ไม่อ่านล่วงหน้า** (กลับด้านกับผลวัดข้างบน) — RPC ออกเลขถือล็อกแถวคำร้อง: การดึงกลับที่มาถึง
          กลาง RPC ต้องรอ แล้วทริกเกอร์แทนที่แถวที่ RPC เพิ่งเขียน ซึ่งการอ่านก่อน update ไม่มีทางเห็น
       ⚠️ ส่ง `answeredAt` ที่อ่านไว้ **ก่อน** update (บนแถวตอนนี้ถูกล้างแล้ว) — ตัวอ่านเทียบกับ `approvedAt` ของฉบับ
          ล่าสุด: เอกสารของรอบส่งก่อนหน้า หรือแถวที่ยังเป็นฉบับใช้อยู่ (ทริกเกอร์ไม่ยิง · ลง log) = `null`
          ⇒ เธรดไม่อ้างสิ่งที่ฐานไม่ได้ทำ
       ⚠️ **หลัง update เหลือแต่ของที่ไม่โยน** — ตัวอ่านนี้ไม่โยน (อ่านพลาด = `null`) · `appendUpdate` กับ `recordAudit` กลืน
          error ของตัวเอง ⇒ การดึงกลับที่ commit แล้วไม่จบที่ 500 ก่อนถึงแถวเธรดกับ audit · เพิ่มการอ่านที่โยนได้ไว้ตรงนี้ไม่ได้ */
    const voidedDocNo = await surveyReportVoided(supabase, { requestId: id, answeredAt: request.answeredAt });
    const voidedNote = voidedDocNo
      ? ` · เอกสาร ${voidedDocNo} ใช้ไม่ได้แล้ว ห้ามใช้ฉบับที่ส่งลูกค้าไปแล้ว`
      : '';

    /* บรรทัดในเธรดคือตัวที่แจกกระดิ่ง — SA ต้องรู้ทันทีว่าตัวเลขที่ถืออยู่กำลังจะเปลี่ยน
       ⚠️ meta พก `totals` ไว้ให้รอบส่งถัดไปหยิบมาเทียบ (ไม่ต้องมีคอลัมน์ใหม่)
       ⚠️ ประโยคเอกสารต่อ **ท้ายตัวเลข** เท่านั้น — `surveyRecallRecord` แกะเหตุผลด้วยการตัดทุกอย่างหลัง
          "· ตัวเลขที่ส่งไปแล้ว" ทิ้ง ⇒ ต่อไว้หน้านั้นเมื่อไร เลข SU จะปนเข้าไปในเหตุผลที่จอโชว์
       🔴 **ทั้งบรรทัดต้องอยู่ในขอบของกระดิ่ง** (`BELL_BODY_LIMIT`) — ประโยคเอกสารอยู่ท้ายสุด จึงเป็นของชิ้นแรกที่หลุดขอบ
          🐞 เหตุผลตัดที่ 300 ตายตัว: ใบ 12 พื้นที่ สี่ขนาด เหตุผลยาว = 505 ตัวขึ้นไป ⇒ กระดิ่งขาด "…ส่งลูกค้าไปแล้ว" (วัดจริง 01/10)
          ⇒ ของที่ยอมสั้นลงคือ **เหตุผล** (ฉบับเต็มอยู่ในสรุป audit) ไม่ใช่ตัวเลขหรือคำเตือน · ใบทั่วไปยังได้ 300 ตัวเท่าเดิม
          ⚠️ พื้น 100 ตัว — เหตุผลต้องยังอ่านรู้เรื่อง (ถึงพื้นได้ก็ต่อเมื่อทะเบียนมีขนาดหลายสิบขนาด) */
    const lineHead = 'TS ดึงผลประเมินกลับมาแก้ — ';
    const lineTail = ` · ตัวเลขที่ส่งไปแล้ว ${totals.zones} พื้นที่ · ${totals.areaSqm} ตร.ม.`
      + ` · ${surveyPackagesText(totals)} — อย่าเพิ่งใช้ตั้งราคา`
      + voidedNote;
    const reasonRoom = Math.min(300, Math.max(100, BELL_BODY_LIMIT - lineHead.length - lineTail.length));
    const line = {
      body: `${lineHead}${reason.slice(0, reasonRoom)}${lineTail}`,
      meta: { totals },
    };
    if (voidedDocNo) line.meta.supersededDocNo = voidedDocNo;
    await appendUpdate(supabase, {
      entityType: 'dept_request', entityId: id, kind: 'recall',
      ...line,
      user,
    });

    await recordAudit({
      user, action: 'update', entityType: 'dept_request', entityId: id,
      before: request, after: data,
      summary: `ดึงผลประเมินกลับมาแก้ ${request.docNo || id} — ${reason}`
        + ` · ตัวเลขเดิม ${totals.zones} พื้นที่ · ${totals.areaSqm} ตร.ม. · ${surveyPackagesText(totals)}`
        + voidedNote,
      request: req,
    });
    /* `supersededReport` = เลขที่เอกสารที่เพิ่งใช้ไม่ได้ (`'SU-…-n'`) หรือ `null` — เลขอย่างเดียว ไม่ใช่แถว:
       id ของแถวเอกสารคือที่อยู่ไฟล์ PDF (มติ 16) ห้ามออก payload */
    return ok({ request: data, totals, supersededReport: voidedDocNo });
  } catch (e) {
    return fail(e.message, 500);
  }
});
