// ── โซนบริการ (mig 0297) — logic ล้วน ─────────────────────────────────────
//
// ⭐ "โซน" = พื้นที่ย่อยในไซต์ (Lobby / Reception / ห้องน้ำชั้น 2) — entity ถาวร
// ไม่ตายตามใบสั่งขาย · ต่อสัญญา = SO ใหม่มาผูกโซนเดิม ประวัติ/consumption ต่อเนื่อง
// (มติผู้ใช้ 2026-08-27 · แผนระบบธุรกิจบริการ เฟส 2)
//
// ⚠️ คนละเรื่องกับ "เขตวิ่งงาน" (service_sites.routeZone — mig 0304) ที่ใช้จัดรอบวิ่ง
//
// ไฟล์นี้ไม่แตะ DB — ใช้ได้ทั้ง client (ฟอร์ม) และ server (validate ก่อน insert)
import { normalizeFloor } from '@/lib/service/zoneCode';

/* ── จุดติดตั้งของโซน (mig 0354) ─────────────────────────────────────────────
   ⭐ **จุดติดตั้ง = ตำแหน่งวางเครื่อง *ข้างใน* โซน** (คำตามมติ 2026-08-29 — "จุด" ห้ามใช้
     เรียกพื้นที่) · ไม่มีรหัส ไม่มี FK · รูปเดียวกับ spots ของใบประเมินพื้นที่ `{ id, label, note }`
     ไม่มี `selected` (จุดบนโซน = จุดที่มีอยู่จริง ไม่ใช่ "จุดที่ติดตั้งได้" ที่รอหัวหน้าเลือก)
   ⚠️ ฐานกันแค่ "ต้องเป็น array" — รูปของสมาชิกตรวจที่นี่ที่เดียว (ทั้งจอและ server เรียก)
   ⚠️ `id` ของจุด **ต้องคงเดิม** ข้ามการแก้ — วันหนึ่งเครื่องจะชี้จุดด้วย id นี้
     (แบบเดียวกับรูปในใบประเมินชี้ `metadata.spotId`) ⇒ จอส่ง id เดิมกลับมาเสมอ
     · ไม่มี id (จุดใหม่) = server ออกให้ */
export const ZONE_SPOT_MAX = 200;
export const ZONE_SPOT_LABEL_MAX = 100;
export const ZONE_SPOT_NOTE_MAX = 500;
const SPOT_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * ตรวจ/ทำความสะอาดรายการจุด — คืน `{ value, error }`
 * @param makeId ตัวออก id ของจุดใหม่ (server ส่ง genId มา · จอใช้ค่าชั่วคราวของตัวเอง)
 */
export function normalizeZoneSpots(raw, { makeId = null } = {}) {
  if (raw === undefined || raw === null) return { value: [], error: null };
  if (!Array.isArray(raw)) return { value: null, error: 'รายการจุดติดตั้งไม่ถูกต้อง' };
  if (raw.length > ZONE_SPOT_MAX) {
    return { value: null, error: `จุดติดตั้งเกิน ${ZONE_SPOT_MAX} จุดต่อโซน — แยกเป็นหลายโซน` };
  }
  const out = [];
  const ids = new Set();
  for (let i = 0; i < raw.length; i += 1) {
    const spot = raw[i] && typeof raw[i] === 'object' ? raw[i] : {};
    const label = String(spot.label ?? '').trim().replace(/\s+/g, ' ');
    if (!label) return { value: null, error: `จุดติดตั้งแถวที่ ${i + 1} ยังไม่มีชื่อ` };
    if (label.length > ZONE_SPOT_LABEL_MAX) {
      return { value: null, error: `ชื่อจุดติดตั้ง "${label.slice(0, 20)}…" ยาวเกิน ${ZONE_SPOT_LABEL_MAX} ตัวอักษร` };
    }
    const note = String(spot.note ?? '').trim();
    if (note.length > ZONE_SPOT_NOTE_MAX) {
      return { value: null, error: `หมายเหตุของจุด "${label}" ยาวเกิน ${ZONE_SPOT_NOTE_MAX} ตัวอักษร` };
    }
    /* id ชั่วคราวของจอ (`new-…` — แบบเดียวกับแถวใหม่ในใบประเมิน) ไม่ใช่ id จริง ⇒ ออกใหม่
       · id ซ้ำในรายการเดียว (ก๊อปแถว) ก็ออกใหม่ ไม่งั้นสองจุดชี้ตัวเดียวกัน */
    const given = String(spot.id ?? '').trim();
    const keep = SPOT_ID_RE.test(given) && !given.startsWith('new-') && !ids.has(given);
    const id = keep ? given : (makeId ? makeId() : '');
    if (id) ids.add(id);
    out.push({ id, label, note: note || null });
  }
  return { value: out, error: null };
}

/** ชื่อของจุดที่ "เพิ่มหลายจุด" — ชีตเก่ามักมีแค่จำนวนจุด ไม่มีชื่อ
 *  ⚠️ นับต่อจากจำนวนที่มีอยู่ ⇒ กดสองรอบไม่ได้ "จุดที่ 1" ซ้ำสองแถว */
export function spotBatchLabels(existingCount = 0, count = 0) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const start = Math.max(0, Math.floor(Number(existingCount) || 0));
  return Array.from({ length: n }, (_, i) => `จุดที่ ${start + i + 1}`);
}

/** เลขเริ่มของ "เพิ่มหลายจุด" — มากกว่าทั้งจำนวนจุดและเลขสูงสุดของ "จุดที่ N" ที่มีอยู่
 *  🐞 นับจากจำนวนอย่างเดียว: มี "จุดที่ 1–3" ลบ "จุดที่ 2" แล้วเพิ่มอีก 1 = ได้ "จุดที่ 3" ซ้ำ */
export function spotBatchStart(spots = []) {
  const list = Array.isArray(spots) ? spots : [];
  const numbered = list
    .map((s) => /^จุดที่\s*(\d+)$/.exec(String(s?.label ?? '').trim())?.[1])
    .filter(Boolean)
    .map(Number);
  return Math.max(list.length, 0, ...numbered);
}

/** @param makeSpotId ตัวออก id ของจุดใหม่ — server ส่ง `() => genId('SPT')` · จอไม่ต้องส่ง */
export function normalizeZoneInput(body = {}, { makeSpotId = null } = {}) {
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return { value: null, error: 'ต้องระบุชื่อโซน' };
  if (name.length > 150) return { value: null, error: 'ชื่อโซนยาวเกิน 150 ตัวอักษร' };

  const note = String(body.note ?? '').trim();
  if (note.length > 1000) return { value: null, error: 'หมายเหตุยาวเกิน 1000 ตัวอักษร' };

  /* ── ชั้น + อาคาร (mig 0314 · บังคับตั้งแต่ 0315) ──────────────────────
     ⭐ **ชั้นเป็นส่วนหนึ่งของรหัสโซน** `ZN-CCCC-FF-DDDDD` (มติผู้ใช้ 2026-08-29)
        ไม่ใช่ข้อมูลประกอบ ⇒ บังคับกรอกทุกโซน และเก็บเป็นค่ามาตรฐาน (04 · GF · B1)
        ไม่ใช่ข้อความอิสระ ไม่งั้นอาคารเดียวจะมี 'G' 'g' 'ชั้น G' ปนกันในรหัส
     ⚠️ **แก้ชั้นทีหลังไม่แก้รหัส** — รหัสคือตัวตน ไม่ใช่สรุปสถานะปัจจุบัน
     ⚠️ อาคารเป็นข้อความอิสระได้ เพราะไม่ได้อยู่ในรหัส (ไซต์ใหญ่มีตึก A/B/C) */
  const floor = normalizeFloor(body.floor);
  if (floor.error) return { value: null, error: floor.error };

  const building = String(body.building ?? '').trim().replace(/\s+/g, ' ');
  if (building.length > 60) return { value: null, error: 'ชื่ออาคารยาวเกิน 60 ตัวอักษร' };

  /* ⚠️ **เขียน `spots` เฉพาะเมื่อผู้เรียกส่งมา** — ทางสร้างโซนอื่น (ใบประเมิน · งานเข้าใหม่ ·
     ตัวนำเข้า) ไม่มีจุดให้ส่ง ⇒ ไม่แตะคอลัมน์เลย ปล่อยค่าตั้งต้น '[]' ของฐาน · และโค้ดชุดนี้
     ไม่พังในช่วงสั้น ๆ ที่ deploy แล้วแต่ยังไม่ได้รัน mig 0354 สำหรับทางที่ไม่เกี่ยวกับจุด */
  let spots;
  if (body.spots !== undefined) {
    const normalized = normalizeZoneSpots(body.spots, { makeId: makeSpotId });
    if (normalized.error) return { value: null, error: normalized.error };
    spots = normalized.value;
  }

  return {
    value: {
      name,
      note: note || null,
      floor: floor.value,
      building: building || null,
      isActive: body.isActive === undefined ? true : !!body.isActive,
      ...(spots !== undefined ? { spots } : {}),
    },
    error: null,
  };
}
