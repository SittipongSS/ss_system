// ── ตรวจใบคำร้องประเมินพื้นที่ก่อนแตะ DB (mig 0314) ─────────────────────
//
// ⭐ **หนึ่งใบ = หนึ่งไซต์ · หนึ่งรายการ = หนึ่งพื้นที่ (โซน)** — ไฟล์นี้ตรวจรูปร่าง
// ของ payload อย่างเดียว ไม่แตะ DB ⇒ ทั้งจอและ route เรียกตัวเดียวกัน
//
// 🔴 **ยามชื่อซ้ำต้องอยู่ที่นี่ด้วย ไม่ใช่ปล่อยให้ DB ตีกลับ** — `service_zones` มี
// `UNIQUE (siteId, lower(btrim(name)))` (mig 0297) ⇒ ปล่อยไปถึง insert จะได้ error ดิบ
// จาก Postgres ที่ไม่บอกว่าต้องทำอะไรต่อ
import { toHHMM } from '@/lib/service/sites';

// เทียบชื่อโซนแบบเดียวกับ unique index ของ DB เป๊ะ ๆ — ไม่งั้นด่านบนจอกับด่านที่ DB
// จะไม่ตรงกัน แล้วจะมีเคสที่ผ่านตรงนี้แต่ไปตายตอนบันทึก
export const zoneNameKey = (name) => String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const text = (value, max) => {
  const v = String(value ?? '').trim().replace(/\s+/g, ' ');
  return v.length > max ? null : (v || null);
};

/* ── สถานที่: เลือกของเดิม หรือสร้างใหม่ — อย่างใดอย่างหนึ่งเท่านั้น ─────
   ⚠️ ส่งมาทั้งคู่ = ฟอร์มกับใบไม่ตรงกัน ต้องตีกลับ ไม่ใช่เดาว่าอันไหนคือของจริง */
export function normalizeSurveySite(input = {}) {
  const siteId = String(input.siteId ?? '').trim();
  const draft = input.newSite && typeof input.newSite === 'object' ? input.newSite : null;
  if (siteId && draft) {
    return { value: null, error: 'เลือกสถานที่เดิมหรือสร้างใหม่ได้อย่างใดอย่างหนึ่ง' };
  }
  if (siteId) return { value: { siteId, newSite: null }, error: null };
  if (!draft) return { value: null, error: 'ต้องเลือกสถานที่ที่จะให้เข้าไปประเมิน' };
  const name = text(draft.name, 150);
  if (!name) return { value: null, error: 'สถานที่ใหม่ต้องมีชื่อ' };
  return { value: { siteId: null, newSite: { ...draft, name } }, error: null };
}

/* ── พื้นที่ที่ต้องประเมิน ────────────────────────────────────────────────
   แถวหนึ่งเป็นได้สองแบบ: โซนเดิม (`zoneId`) หรือพื้นที่ใหม่ (`name`)
   ⚠️ พื้นที่ใหม่ **ยังไม่มีรหัส ZN** จนกว่าจะกดส่งใบ — ที่นี่เก็บแค่ชื่อ
   ⭐ **ไม่มีช่องอาคาร/ชั้นบนใบ** ทั้งที่ `service_zones` มีคอลัมน์นั้น (mig 0314) —
      สองช่องนั้นเป็นของ *ทะเบียน* ที่ TS กรอกตอนไปยืนอยู่หน้างานจริง · ให้ SA เดา
      จากออฟฟิศแล้วเขียนทับทะเบียนคือทางที่ข้อมูลผิดเข้าระบบเงียบ ๆ */
export function normalizeSurveyZones(input) {
  const rows = Array.isArray(input) ? input : [];
  if (!rows.length) return { value: null, error: 'ต้องมีพื้นที่ที่ต้องประเมินอย่างน้อย 1 รายการ' };
  if (rows.length > 60) return { value: null, error: 'พื้นที่ในใบเดียวเกิน 60 รายการ — แยกเป็นหลายใบ' };

  const out = [];
  const seenZone = new Set();
  const seenName = new Map();   // คีย์ชื่อ → ลำดับแถวที่เจอก่อน (ไว้บอกว่าซ้ำกับอันไหน)

  for (const [index, raw] of rows.entries()) {
    const at = `พื้นที่รายการที่ ${index + 1}`;
    const zoneId = String(raw?.zoneId ?? '').trim();
    const name = text(raw?.name, 150);

    if (zoneId) {
      // โซนเดิม — ชื่อมาจากทะเบียน ไม่ใช่จาก client (ชื่อที่ client ส่งอาจเก่า)
      if (seenZone.has(zoneId)) return { value: null, error: `${at}: เลือกพื้นที่เดิมซ้ำกับรายการก่อนหน้า` };
      seenZone.add(zoneId);
      out.push({ zoneId, name: null, sortOrder: index, note: text(raw?.note, 1000) });
      continue;
    }

    if (!name) return { value: null, error: `${at}: ต้องระบุชื่อพื้นที่` };
    const key = zoneNameKey(name);
    if (seenName.has(key)) {
      return { value: null, error: `${at}: ชื่อ "${name}" ซ้ำกับรายการที่ ${seenName.get(key) + 1} ในใบเดียวกัน` };
    }
    seenName.set(key, index);
    out.push({ zoneId: null, name, sortOrder: index, note: text(raw?.note, 1000) });
  }
  return { value: out, error: null };
}

/* ── ชื่อพื้นที่ใหม่ชนกับโซนที่มีอยู่แล้วในไซต์นั้น ───────────────────────
   ⚠️ ต้องเรียกหลังรู้ว่าไซต์ไหน (route อ่านโซนของไซต์นั้นมาส่งให้)
   ⭐ ข้อความต้องบอก **รหัส ZN** ของตัวที่ชน — ไม่งั้นคนหาไม่เจอว่าซ้ำกับอันไหน */
export function surveyZoneNameClash(zones = [], existing = []) {
  const byKey = new Map();
  for (const row of existing) byKey.set(zoneNameKey(row?.name), row);
  for (const [index, zone] of (zones || []).entries()) {
    if (!zone?.name) continue;
    const hit = byKey.get(zoneNameKey(zone.name));
    if (hit) {
      return `พื้นที่รายการที่ ${index + 1}: สถานที่นี้มีพื้นที่ชื่อ "${zone.name}" อยู่แล้ว (${hit.code || hit.id}) — เลือกจากพื้นที่เดิมแทน`;
    }
  }
  return null;
}

/* ── เวลาที่ต้องการให้เข้าพื้นที่ ────────────────────────────────────────
   ⚠️ **วันที่ใช้คอลัมน์เดิม (`requestedDueDate`) เปลี่ยนแค่ป้าย** — เพิ่มคอลัมน์
      วันที่ตัวที่สองคือความสับสนที่หัวข้อนี้ตั้งใจแก้ · ที่เพิ่มมีแค่ "เวลา" */
export function normalizeSurveyTime(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { value: null, error: null };
  const hhmm = toHHMM(raw);
  if (!hhmm) return { value: null, error: 'เวลาที่ต้องการไม่ถูกต้อง' };
  return { value: hhmm, error: null };
}

/* ── ตรวจทั้ง payload ในครั้งเดียว ─────────────────────────────────────── */
export function normalizeSurveyRequest(body = {}) {
  const site = normalizeSurveySite(body);
  if (site.error) return { value: null, error: site.error };
  const zones = normalizeSurveyZones(body.zones);
  if (zones.error) return { value: null, error: zones.error };
  const time = normalizeSurveyTime(body.requestedDueTime);
  if (time.error) return { value: null, error: time.error };
  return { value: { ...site.value, zones: zones.value, requestedDueTime: time.value }, error: null };
}
