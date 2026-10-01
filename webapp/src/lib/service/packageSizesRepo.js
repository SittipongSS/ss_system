// ── Data access ของทะเบียนขนาดแพ็คเกจ (mig 0398 · มติเจ้าของ 01/10) ───────────────────
// แยกจาก route.js เพราะไฟล์ route ของ Next ส่งออกได้เฉพาะ HTTP method
//
// ⭐ **ตัวเขียนทั้งสามอยู่ที่นี่ ไม่ใช่ใน route** — คืน `{ status, error }` หรือ `{ status, data, audit }` ให้ route
//   แปลงเป็นคำตอบ + เรียก `recordAudit` ⇒ กติกา (403 · 404 · 409 · รหัสแก้ไม่ได้ · ขนาดสุดท้ายลบไม่ได้) มีเทสต์ที่รัน
//   กับฐานปลอมจริง ไม่ใช่แค่ยามที่อ่านซอร์สของ route (`packageSizesRoute.test.mjs`)
// ⚠️ supabase **ไม่ throw** — ทุก query ที่นี่เช็ก `error` เอง · ตัวนับการใช้ **โยน** เมื่ออ่านพลาด (นับไม่ได้ ≠ ศูนย์)
import { fetchAll } from '@/lib/supabaseFetchAll';
import { fetchAllInChunks } from '@/lib/supabaseInChunks';
import { SERVICE_DEPARTMENT } from '@/lib/permissions';
import { REQUEST_OPEN_STATUSES } from '@/lib/requests/statuses';
import {
  PACKAGE_SIZE_NOT_FOUND, normalizePackageSizeCode, normalizePackageSizeInput, packageSizeBandText,
  packageSizeError, packageSizeUsageText, sortPackageSizes,
} from './packageSizes';
import { SITE_REQUEST_KINDS } from './surveyQueue';

/* ⚠️ ชื่อตารางเขียนเป็นสตริงตรง ๆ ทุกจุด (ไม่ผ่านตัวแปร) — ด่าน `check:columns` มองไม่เห็น `.from(<ตัวแปร>)` */
export const PACKAGE_SIZE_ENTITY = 'service_package_size';

/* คอลัมน์ของทะเบียน — ทุกช่องต้องมีจริงบนฐาน (ด่าน `check:columns` อ่านค่าคงที่นี้)
   ⚠️ ด่านนั้นจะแดงจนกว่าเจ้าของรัน 0398 บนฐานจริง — ตารางนี้เกิดจาก migration นั้น (ไม่ใช่บั๊ก ห้ามเลี่ยง) */
export const PACKAGE_SIZE_COLUMNS = 'code, "nameEn", "maxCbm", "autoSuggest", note, "updatedById", "updatedByName", "createdAt", "updatedAt"';

/* แถวผลวัดที่ตัวนับการใช้ต้องอ่าน — แค่พอรู้ว่า "ใบไหน เคาะขนาดอะไร ยังอยู่ในใบไหม" */
export const PACKAGE_SIZE_USAGE_ZONE_COLUMNS = 'id, "requestId", "packageSize", status';

/* ── ข้อความของความล้มเหลวฝั่งฐานข้อมูล ───────────────────────────────────────────
   🐞 UAT PR-P 01/10: จอทะเบียนขึ้น "Could not find the table 'public.service_package_sizes' in the schema cache" ใต้หัวข้อไทย
      — ข้อความดิบของฐานข้อมูล (อังกฤษ + ชื่อตาราง/คอลัมน์) ไม่ใช่ของที่ผู้ใช้อ่านแล้วทำอะไรต่อได้ และเผยโครงสร้างฐาน
   ⇒ ข้อความดิบลง log ของ server · จอได้ประโยคไทยที่บอกว่าทำอะไรต่อ */
export const PACKAGE_SIZE_READ_FAILED = 'ระบบอ่านทะเบียนขนาดแพ็คเกจจากฐานข้อมูลไม่ได้ — ลองใหม่อีกครั้ง ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบ';
export const PACKAGE_SIZE_WRITE_FAILED = 'บันทึกทะเบียนขนาดแพ็คเกจลงฐานข้อมูลไม่ได้ — ลองใหม่อีกครั้ง ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบ';

/** @param kind `'read' | 'write'` · @param error ของ Supabase/ที่ถูกโยน — ลง log แล้วคืนข้อความไทยของจอ */
export function packageSizeDbFailure(kind, error) {
  console.error(`[packageSizes] ${kind === 'read' ? 'อ่าน' : 'เขียน'}ทะเบียนขนาดแพ็คเกจไม่สำเร็จ`, error?.message || error);
  return kind === 'read' ? PACKAGE_SIZE_READ_FAILED : PACKAGE_SIZE_WRITE_FAILED;
}

/**
 * ทะเบียนทั้งชุด เรียงตามกติกาเดียวกับแถบเลือกและตาราง (`sortPackageSizes`)
 * @throws error ของ Supabase — ผู้เรียกที่ต้องการ "อ่านไม่สำเร็จ = null" ใช้ `loadPackageSizesOrNull`
 * ⚠️ ทะเบียนนี้ไม่โตตามธุรกรรม (ไม่กี่ขนาด) ⇒ ไม่ต้องไล่หน้า
 */
export async function loadPackageSizes(supabase) {
  const { data, error } = await supabase.from('service_package_sizes').select(PACKAGE_SIZE_COLUMNS).order('code', { ascending: true });
  if (error) throw error;
  return sortPackageSizes(data || []);
}

/**
 * ทะเบียน หรือ `null` เมื่ออ่านไม่สำเร็จ — ทางของ GET ใบประเมิน · PUT เคาะ · POST ส่งผล
 * 🔴 **`null` ไม่ใช่ `[]`** — `[]` อ่านว่า "ทะเบียนว่าง" (ทุกขนาดถูกลบ) ส่วน `null` คือ "ไม่รู้" ⇒ ด่านปลายทาง
 *    (`surveyPackageSizeGates` · `surveyPackageDecision`) ปฏิเสธด้วยข้อความ "อ่านทะเบียนไม่สำเร็จ — ลองใหม่"
 *    แทนที่จะบอกหัวหน้าว่าขนาดที่เขาเคาะ "ถูกลบ" ทั้งที่ยังอยู่
 * ⚠️ ไม่ลากทั้งเส้นล้ม — ผลวัดซึ่งเป็นเนื้อหลักของจออ่านได้แล้ว (กติกาเดียวกับชิ้นประกอบอื่นของ GET ใบประเมิน)
 */
export async function loadPackageSizesOrNull(supabase) {
  try {
    return await loadPackageSizes(supabase);
  } catch (e) {
    console.error('[packageSizes] อ่านทะเบียนขนาดแพ็คเกจไม่สำเร็จ', e?.message || e);
    return null;
  }
}

export async function findPackageSize(supabase, code) {
  const key = normalizePackageSizeCode(code);
  if (!key) return null;
  const { data, error } = await supabase.from('service_package_sizes').select(PACKAGE_SIZE_COLUMNS).eq('code', key).maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * ใบประเมินที่ **ยังไม่ส่งผล** ใช้ขนาดไหนอยู่กี่ใบ — `{ [code]: { surveys, zones, docNos } }`
 *
 * ⭐ ตัวเลขของกล่องยืนยันลบ ("ใบประเมินที่ยังไม่ส่งผล 3 ใบ (5 พื้นที่) ใช้ขนาดนี้") และสรุป audit ตอนลบ
 *   — ใบเหล่านี้คือใบที่หัวหน้าต้องเลือกขนาดใหม่ก่อนส่งผล (`surveyPackageSizeGates`)
 * ⚠️ "ยังไม่ส่งผล" = คำร้องประเมินของฝ่ายบริการที่ยังเดินอยู่ และไม่มีตรา ส่งผล/ยกเลิก/ปิด — ชุดเดียวกับที่
 *    `surveyEditLockError` ยอมให้แก้ (ใบที่ล็อกแล้วถือรหัสเป็นภาพนิ่ง ไม่มีใครต้องเลือกใหม่)
 * ⚠️ พื้นที่ที่ถูกตัดออก/ยังไม่เคาะขนาด ไม่นับ — ด่านส่งผลก็ไม่นับ
 * ⚠️ ไล่หน้า (คำร้อง/ผลวัดโตตามธุรกรรม · เพดาน 1,000 แถว) และซอยลิสต์ id (URL 16 KB)
 * @throws error ของ Supabase ตัวแรก — 🔴 **ห้ามกลืนเป็น `{}`**: "นับไม่ได้" อ่านเป็น "ไม่มีใบใช้" = กล่องลบโกหก
 */
export async function packageSizeUsage(supabase) {
  const requests = await fetchAll(() => supabase
    .from('dept_requests').select('id, "docNo"')
    .eq('dept', SERVICE_DEPARTMENT)
    .in('kind', SITE_REQUEST_KINDS)
    .in('status', REQUEST_OPEN_STATUSES)
    .is('answeredAt', null)
    .is('cancelledAt', null)
    .is('closedAt', null)
    .order('id', { ascending: true }));
  const docNoOf = new Map(requests.map((r) => [r.id, r.docNo || r.id]));

  const zones = await fetchAllInChunks([...docNoOf.keys()], (chunk) => supabase
    .from('service_survey_zones').select(PACKAGE_SIZE_USAGE_ZONE_COLUMNS)
    .in('requestId', chunk)
    .not('packageSize', 'is', null)
    .order('id', { ascending: true }));

  const byCode = new Map();
  for (const zone of zones) {
    const code = normalizePackageSizeCode(zone?.packageSize);
    if (!code || zone.status === 'cut') continue;
    if (!byCode.has(code)) byCode.set(code, { zones: 0, requestIds: new Set() });
    const entry = byCode.get(code);
    entry.zones += 1;
    entry.requestIds.add(zone.requestId);
  }
  const out = {};
  for (const [code, entry] of byCode) {
    out[code] = {
      surveys: entry.requestIds.size,
      zones: entry.zones,
      docNos: [...entry.requestIds].map((id) => docNoOf.get(id) || id).sort(),
    };
  }
  return out;
}

const stamp = (user) => ({
  updatedById: user?.id ? String(user.id) : null,
  updatedByName: user?.name || null,
});
const describe = (size, sizes) => `${size.code} (${size.nameEn}) · ${packageSizeBandText(size, sizes)}`;
/* ชนที่ฐาน (PK รหัส · unique index ช่วง · unique index ไม่มีเพดาน) = สองคนกดพร้อมกัน — error ดิบอ่านไม่รู้เรื่อง */
const raceText = (value) => `รหัส ${value.code} หรือช่วงพื้นที่นี้มีอยู่แล้วในทะเบียน — มีคนเพิ่งแก้ทะเบียน โหลดหน้าใหม่แล้วลองอีกครั้ง`;
const statusOf = (gate) => (gate === PACKAGE_SIZE_NOT_FOUND ? 404 : 400);

/**
 * เพิ่มขนาด — `{ status, error }` | `{ status: 201, data, audit }`
 * @param ctx.canEdit `canManagePackageSizes(user)` — ผู้เรียกคำนวณมาให้ (route ตัดก่อนแล้ว ที่นี่กันซ้ำ)
 */
export async function createPackageSize(supabase, { user = null, body = {}, canEdit = false } = {}) {
  if (!canEdit) return { status: 403, error: packageSizeError('create', body, { canEdit: false }) };
  const sizes = await loadPackageSizes(supabase);
  // 🔑 ด่านตัวเดียวกับที่ฟอร์มใช้ปิดปุ่ม
  const gate = packageSizeError('create', body, { canEdit, sizes });
  if (gate) return { status: statusOf(gate), error: gate };
  const { value } = normalizePackageSizeInput(body);

  const { data, error } = await supabase.from('service_package_sizes')
    .insert({ ...value, ...stamp(user) }).select(PACKAGE_SIZE_COLUMNS).single();
  if (error) {
    if (error.code === '23505') return { status: 409, error: raceText(value) };
    return { status: 500, error: packageSizeDbFailure('write', error) };
  }
  return {
    status: 201,
    data,
    audit: {
      action: 'create', entityType: PACKAGE_SIZE_ENTITY, entityId: data.code, after: data,
      summary: `เพิ่มขนาดแพ็คเกจ ${describe(data, [...sizes, data])}`,
    },
  };
}

/**
 * แก้ขนาด — รหัสแก้ไม่ได้ (พื้นที่ที่เคาะแล้วเก็บรหัสเป็นภาพนิ่ง) · คืนทรงเดียวกับ `createPackageSize`
 * ⚠️ **รวมค่าเดิมก่อนตรวจ** — ฟอร์มแก้ส่งมาเฉพาะช่องที่แตะ (กติกาเดียวกับ PATCH ของรุ่นเครื่อง)
 * ⚠️ แก้ช่วง/วิธีเลือก มีผลกับ **การเคาะครั้งถัดไป** เท่านั้น — แถวที่เคาะไปแล้วถือภาพนิ่งของตัวเอง
 */
export async function updatePackageSize(supabase, { user = null, code = '', body = {}, canEdit = false } = {}) {
  if (!canEdit) return { status: 403, error: packageSizeError('update', body, { canEdit: false }) };
  const before = await findPackageSize(supabase, code);
  if (!before) return { status: 404, error: PACKAGE_SIZE_NOT_FOUND };
  const sizes = await loadPackageSizes(supabase);
  const merged = { ...before, ...(body && typeof body === 'object' ? body : {}) };
  const gate = packageSizeError('update', merged, { canEdit, before, sizes });
  if (gate) return { status: statusOf(gate), error: gate };
  const { value } = normalizePackageSizeInput(merged);

  const { data, error } = await supabase.from('service_package_sizes')
    .update({
      nameEn: value.nameEn, maxCbm: value.maxCbm, autoSuggest: value.autoSuggest, note: value.note,
      ...stamp(user), updatedAt: new Date().toISOString(),
    })
    .eq('code', before.code).select(PACKAGE_SIZE_COLUMNS).single();
  if (error) {
    if (error.code === '23505') return { status: 409, error: raceText(value) };
    return { status: 500, error: packageSizeDbFailure('write', error) };
  }
  return {
    status: 200,
    data,
    audit: {
      action: 'update', entityType: PACKAGE_SIZE_ENTITY, entityId: before.code, before, after: data,
      summary: `แก้ขนาดแพ็คเกจ ${describe(data, sizes.map((s) => (s.code === data.code ? data : s)))}`,
    },
  };
}

/* ชื่อใบในสรุป audit — พอให้ตามไปเปิดได้ ไม่ใช่ทั้งลิสต์ (ลบขนาดที่ร้อยใบใช้อยู่ = บรรทัดที่ไม่มีใครอ่าน) */
const AUDIT_DOC_NOS = 10;

/**
 * ลบขนาด — `{ status, error }` | `{ status: 200, data: { code, usage }, audit }`
 *
 * ⭐ **ลบได้แม้มีใบใช้อยู่** (มติเจ้าของ 01/10) — ไม่มี FK ไม่มี cascade: แถวผลวัดไม่ถูกแตะ · ใบที่ส่งผลแล้วถือรหัสเดิม
 *   ใบที่ยังไม่ส่งถูกด่าน "ขนาดถูกลบ" บังคับให้เลือกใหม่ ⇒ `usage` ที่คืนไปคือจำนวนใบที่กระทบ (จอบอกผลหลังลบ)
 * 🔴 **นับการใช้ก่อนลบ และนับไม่ได้ = ไม่ลบ** (`packageSizeUsage` โยน) — audit ของการลบต้องบอกได้ว่ากระทบใบไหน
 *   (ระบบไม่มีถังขยะ · `audit.before` คือทางเดียวที่กู้แถวทะเบียนกลับ)
 */
export async function deletePackageSize(supabase, { code = '', canEdit = false } = {}) {
  if (!canEdit) return { status: 403, error: packageSizeError('delete', {}, { canEdit: false }) };
  const before = await findPackageSize(supabase, code);
  if (!before) return { status: 404, error: PACKAGE_SIZE_NOT_FOUND };
  const sizes = await loadPackageSizes(supabase);
  const gate = packageSizeError('delete', {}, { canEdit, before, sizes });
  if (gate) return { status: statusOf(gate), error: gate };
  const usage = (await packageSizeUsage(supabase))[before.code] || { surveys: 0, zones: 0, docNos: [] };

  const { error } = await supabase.from('service_package_sizes').delete().eq('code', before.code);
  if (error) return { status: 500, error: packageSizeDbFailure('write', error) };

  const names = usage.docNos.slice(0, AUDIT_DOC_NOS).join(', ')
    + (usage.docNos.length > AUDIT_DOC_NOS ? ` และอีก ${usage.docNos.length - AUDIT_DOC_NOS} ใบ` : '');
  return {
    status: 200,
    data: { code: before.code, usage },
    audit: {
      action: 'delete', entityType: PACKAGE_SIZE_ENTITY, entityId: before.code, before,
      summary: `ลบขนาดแพ็คเกจ ${before.code} (${before.nameEn}) · ${packageSizeUsageText(usage)}`
        + (usage.surveys > 0 ? ` — ต้องเลือกขนาดใหม่ก่อนส่งผล: ${names}` : ''),
    },
  };
}
