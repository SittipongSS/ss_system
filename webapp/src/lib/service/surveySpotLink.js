// ── ตัวรัน PATCH การผูกรูปจุดติดตั้งกับจุด (`metadata.spotId`) — PR-S · มติเจ้าของ Q1(a) ──────────
//
// ⭐ เรียกจาก `PATCH /api/attachments/[id]` เฉพาะคำขอที่แก้ `spotId` คีย์เดียวของไฟล์ผลวัดพื้นที่
//   (`isSpotLinkPatch`) — แยกออกมาให้เทสต์ได้ด้วยฐานปลอม · route เหลือแค่ต่อสาย
// ⭐ ลำดับ: พื้นที่ของรูปมีจริง (404 · อ่านพัง 500) → สิทธิ์ (403) → ชนิดรูป/รูปร่าง (400)
//   → จุดต้องอยู่ในรายการที่บันทึกแล้ว (409 — รายการจุดเปลี่ยนจากอีกเครื่องได้) → เขียน metadata
// ⭐ ผ่านด้วยข้อยกเว้นของใบที่ส่งผลแล้ว (`locked`) = **ลง audit ที่ใบคำร้องทุกครั้ง** — เป็นการแก้ของบนใบ
//   ที่ฝ่ายขายรับไปแล้ว ต้องสืบย้อนได้ว่าใครย้ายรูปไหนจากจุดไหนไปจุดไหน (ตัวเลขไม่ขยับ แต่เอกสารที่ออกทีหลังขยับ)
// ⚠️ supabase ไม่ throw — อ่าน `error` เองทุกครั้ง
import { recordAudit } from '@/lib/audit';
import { surveySpotLinkAccess } from '@/lib/master/costingAttachmentAccess';
import { SURVEY_DOC_SPOT, surveyZoneName } from '@/lib/service/survey';
import {
  SPOT_TRAY_LABEL, normalizeSpotId, photoSpotId, spotIdError, spotLinkError, withSpotLink,
} from '@/lib/service/surveySpotPhotos';

const reply = (status, body) => ({ status, body });

/* ชื่อจุดสำหรับบรรทัด audit — ไม่ผูก = ชื่อถาด · id ที่ไม่มีในรายการแล้ว = บอกตรง ๆ ว่าจุดนั้นไม่มีแล้ว */
function spotName(spots, id) {
  if (!id) return SPOT_TRAY_LABEL;
  const spot = (Array.isArray(spots) ? spots : []).find((s) => normalizeSpotId(s?.id) === id);
  return String(spot?.label ?? '').trim() || `จุดที่ไม่มีแล้ว (${id})`;
}

/**
 * @param att     แถว `attachments` ของรูป (ผู้เรียกโหลดมาแล้ว)
 * @param spotId  จุดปลายทาง · `null`/ว่าง = ถอดการผูก (รูปกลับลงถาด)
 * @param request Request ของ Next (ใช้ดึง IP ให้ audit)
 * @param audit   ตัวลง audit (เทสต์ใส่ของปลอม)
 * @returns `{ status, body }` — ผู้เรียกตอบ `Response.json(body, { status })` ตรง ๆ
 */
export async function runSurveySpotLink({ supabase, att, spotId, user, request = null, audit = recordAudit }) {
  const { data: zone, error: zoneError } = await supabase
    .from('service_survey_zones').select('*').eq('id', att.entityId).maybeSingle();
  if (zoneError) return reply(500, { error: zoneError.message });
  if (!zone) return reply(404, { error: 'ไม่พบพื้นที่ของรูปนี้' });

  const access = await surveySpotLinkAccess(supabase, zone, user);
  if (!access.ok) return reply(403, { error: access.error || 'forbidden' });

  if (att.docType !== SURVEY_DOC_SPOT) return reply(400, { error: 'ผูกจุดได้เฉพาะภาพจุดติดตั้ง' });
  const shape = spotIdError(spotId);
  if (shape) return reply(400, { error: shape });
  const missing = spotLinkError({ file: att, spotId, spots: zone.spots });
  if (missing) return reply(409, { error: missing });

  const from = photoSpotId(att);
  const to = normalizeSpotId(spotId);
  // ผูกซ้ำจุดเดิม (สองแท็บ · กดซ้ำ) — ไม่เขียน ไม่ลง audit
  if (from === to) return reply(200, att);

  const { data, error } = await supabase
    .from('attachments').update({ metadata: withSpotLink(att.metadata, to) }).eq('id', att.id).select().maybeSingle();
  if (error) return reply(500, { error: error.message });
  if (!data) return reply(404, { error: 'ไม่พบเอกสารแนบ' });

  if (access.locked) {
    const req = access.request || {};
    await audit({
      user,
      action: 'update',
      entityType: 'dept_request',
      entityId: req.id || zone.requestId,
      before: { attachmentId: att.id, zoneId: zone.id, spotId: from },
      after: { attachmentId: att.id, zoneId: zone.id, spotId: to },
      summary: `ผูกรูปจุดติดตั้งบนใบที่ส่งผลแล้ว ${req.docNo || req.id || zone.requestId} · ${surveyZoneName(zone)}`
        + ` · ${att.fileName || att.id}: ${spotName(zone.spots, from)} → ${spotName(zone.spots, to)}`,
      request,
    });
  }
  return reply(200, data);
}
