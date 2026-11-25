// ── ทะเบียนสิทธิ์เสริมรายคน (mig 0440 · รื้อระบบสิทธิ์งวด 2 · มติเจ้าของ 25/11/2026) ─────────────
//
// ⭐ ตาราง `user_capability_grants` คือของจริง · `app_metadata.extraCaps` เป็นสำเนาที่ `syncExtraCaps`
//    เขียนตามตารางทุกครั้งที่ให้/ถอน — proxy อ่าน `getUser().app_metadata` ทุกคำขอ จึงไม่ต้องอ่านตารางทุกคำขอ
//    🔴 **ห้ามเขียน `extraCaps` ตรงที่อื่น** (API แก้ผู้ใช้ปฏิเสธแล้ว) — ไม่งั้นสำเนาเดินออกจากตารางเงียบ ๆ
//
// มติที่ไฟล์นี้บังคับ (docs/permissions-rework.md):
//   2. เหตุผลบังคับทุกครั้ง
//   3. หมดอายุต้องเลือกทุกครั้ง ("ไม่มีกำหนด" หรือ "ถึงวันที่") · ครบวันถอดเอง + กระดิ่งคนให้และคนถือ
//      ⚠️ "ถึงวันที่ D" = ใช้ได้ถึงสิ้นวัน D (ปฏิทินไทย) · cron รายวัน 09:00 ถอดแถวที่ D < วันนี้
//      · เตือนล่วงหน้าเมื่อเหลือ ≤ GRANT_WARN_DAYS วัน (ครั้งเดียวต่อแถว — `warnedAt`)
//
// ⚠️ ฟังก์ชันที่เขียนฐานรับ `supabase` + ตัวเขียน audit/กระดิ่งเป็นพารามิเตอร์ — เทสต์ส่งตัวจำลองเข้าไป
//    (กฎ AGENTS.md: เทสต์ห้ามต่อฐานจริง)
import { businessDate } from '@/lib/businessDate';
import { addDays } from '@/lib/datePeriods';
import { GRANTABLE_CAP_LABELS, can, grantableNow, isModuleClosed } from '@/lib/permissions';

export const GRANT_TABLE = 'user_capability_grants';
export const GRANT_WARN_DAYS = 3;
export const GRANT_REASON_MAX = 500;

/** kind ของกระดิ่ง — ต้องอยู่ใน `GRANT_BELL_KINDS` (lib/notifications.js) ไม่งั้นไม่ขึ้นกระดิ่ง */
export const GRANT_EXPIRING_KIND = 'grant_expiring';
export const GRANT_EXPIRED_KIND = 'grant_expired';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const capLabel = (cap) => GRANTABLE_CAP_LABELS[cap] || cap;

/** แถวที่ยังไม่ถอน */
export const isActiveGrant = (row) => !!row && !row.revokedAt;

/** cap ที่ยังถืออยู่ เรียงตามรายการแจกได้ (ลำดับคงที่ — สำเนาใน app_metadata ไม่สลับไปมา) */
export function activeCapsFromRows(rows = []) {
  const caps = new Set((rows || []).filter(isActiveGrant).map((r) => r.cap));
  return Object.keys(GRANTABLE_CAP_LABELS).filter((cap) => caps.has(cap));
}

/**
 * หมดอายุที่ผู้ใช้เลือก → ค่าที่เก็บ
 * `{ kind: 'none' }` = ไม่มีกำหนด · `{ kind: 'date', date: 'YYYY-MM-DD' }` = ใช้ได้ถึงสิ้นวันนั้น
 * ⚠️ ไม่มีค่าตั้งต้น — ไม่ส่งมา = ปฏิเสธ (มติข้อ 3: ต้องเลือกทุกครั้ง)
 */
export function normalizeExpiry(expiry, today) {
  if (!expiry || (expiry.kind !== 'none' && expiry.kind !== 'date')) {
    return { error: 'ต้องเลือกวันหมดอายุ: ไม่มีกำหนด หรือ ถึงวันที่' };
  }
  if (expiry.kind === 'none') return { expiresOn: null };
  const date = String(expiry.date || '');
  if (!DAY.test(date)) return { error: 'เลือก "ถึงวันที่" แล้วต้องระบุวันที่' };
  if (date < today) return { error: 'วันหมดอายุต้องเป็นวันนี้หรือหลังจากนี้' };
  return { expiresOn: date };
}

/**
 * ตรวจคำขอให้สิทธิ์ — คืน `{ errors: [] }` เมื่อผ่าน (รวมทุกข้อที่ขาดเป็นข้อความเดียว · กฎฟอร์ม)
 * @param role        ตำแหน่งของคนที่จะได้
 * @param activeCaps  cap ที่ยังถืออยู่ (จากตาราง)
 */
export function validateGrantRequest({ caps, reason, expiry } = {}, { role, activeCaps = [], today } = {}) {
  const errors = [];
  const list = [...new Set((Array.isArray(caps) ? caps : []).map(String))];
  if (!list.length) errors.push('เลือกสิทธิ์ที่จะให้อย่างน้อยหนึ่งข้อ');
  for (const cap of list) {
    if (!(cap in GRANTABLE_CAP_LABELS)) errors.push(`"${cap}" แจกรายคนไม่ได้`);
    else if (isModuleClosed(cap.split(':')[0])) errors.push(`"${capLabel(cap)}" แจกใหม่ไม่ได้ เพราะระบบนี้ปิดอยู่ทั้งระบบ`);
    else if (!grantableNow(cap)) errors.push(`"${capLabel(cap)}" แจกตอนนี้ไม่ได้`);
    else if (can(role, cap)) errors.push(`"${capLabel(cap)}" ตำแหน่งนี้มีอยู่แล้ว`);
    else if (activeCaps.includes(cap)) errors.push(`"${capLabel(cap)}" ถืออยู่แล้ว — ถอนก่อนถ้าจะเปลี่ยนเหตุผล/วันหมดอายุ`);
  }
  const why = String(reason || '').trim();
  if (!why) errors.push('ต้องกรอกเหตุผล');
  else if (why.length > GRANT_REASON_MAX) errors.push(`เหตุผลยาวเกิน ${GRANT_REASON_MAX} ตัวอักษร`);
  const exp = normalizeExpiry(expiry, today);
  if (exp.error) errors.push(exp.error);
  return { errors, caps: list, reason: why, expiresOn: exp.expiresOn ?? null };
}

/** งานของ cron วันนี้ — ตัดสินด้วยฟังก์ชันเดียว ไม่เขียนเงื่อนไขวันที่ซ้ำใน SQL */
export function expiryActions(rows = [], today) {
  const warnUntil = addDays(today, GRANT_WARN_DAYS);
  const expire = [];
  const warn = [];
  for (const row of rows || []) {
    if (!isActiveGrant(row) || !row.expiresOn) continue;
    if (row.expiresOn < today) expire.push(row);
    else if (row.expiresOn <= warnUntil && !row.warnedAt) warn.push(row);
  }
  return { expire, warn };
}

/** วันที่แบบ DD/MM/YYYY (ค.ศ. — กติกา lib/format) จากสตริงวัน */
export const fmtDay = (day) => (DAY.test(String(day || '')) ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : '');

/** ข้อความกระดิ่ง — คนถืออ่านแบบ "ของคุณ" · คนให้อ่านแบบ "ของ <ชื่อ>" */
export function grantNotice(row, { kind, holderName = '', forHolder }) {
  const label = capLabel(row.cap);
  const whose = forHolder ? 'ของคุณ' : `ของ ${holderName || 'ผู้ใช้'}`;
  if (kind === GRANT_EXPIRED_KIND) {
    return {
      title: `สิทธิ์เสริมหมดอายุแล้ว: ${label}`,
      body: `สิทธิ์เสริม "${label}" ${whose} ครบกำหนดวันที่ ${fmtDay(row.expiresOn)} — ระบบถอดให้แล้ว`,
    };
  }
  return {
    title: `สิทธิ์เสริมใกล้หมดอายุ: ${label}`,
    body: `สิทธิ์เสริม "${label}" ${whose} ใช้ได้ถึงวันที่ ${fmtDay(row.expiresOn)}${forHolder ? '' : ' — ต่ออายุได้ด้วยการให้สิทธิ์ใหม่หลังหมดอายุ'}`,
  };
}

// ── เขียนฐาน ───────────────────────────────────────────────────────────────────

const personName = (u) => {
  const m = u?.user_metadata || {};
  return m.name || `${m.firstName || ''} ${m.lastName || ''}`.trim() || u?.email || '';
};

export async function listGrants(supabase, userId) {
  const { data, error } = await supabase.from(GRANT_TABLE).select('*')
    .eq('userId', String(userId)).order('grantedAt', { ascending: false }).limit(200);
  if (error) throw error;
  return data || [];
}

/**
 * เขียนสำเนา `app_metadata.extraCaps` ตามตาราง — เรียกหลังให้/ถอนทุกครั้ง
 * ⚠️ `updateUserById` **merge** คีย์ชั้นบนของ app_metadata ⇒ ส่งแค่ extraCaps ก็พอ แต่ส่งทั้งก้อนเดิม
 *    เพื่อให้ผลไม่ขึ้นกับพฤติกรรม merge (แบบเดียวกับ api/users/[id])
 */
export async function syncExtraCaps(supabase, userId) {
  const { data: rows, error } = await supabase.from(GRANT_TABLE).select('cap, revokedAt')
    .eq('userId', String(userId)).is('revokedAt', null);
  if (error) throw error;
  const extraCaps = activeCapsFromRows(rows);
  const { data: found, error: findErr } = await supabase.auth.admin.getUserById(String(userId));
  if (findErr || !found?.user) throw findErr || new Error('ไม่พบผู้ใช้รายนี้');
  const meta = found.user.app_metadata || {};
  const { error: upErr } = await supabase.auth.admin.updateUserById(String(userId), {
    app_metadata: { ...meta, extraCaps },
  });
  if (upErr) throw upErr;
  return { before: meta.extraCaps || [], extraCaps, user: found.user };
}

/**
 * ให้สิทธิ์ (หลาย cap · เหตุผล/หมดอายุชุดเดียวกัน) — ตรวจแล้วเขียนแถว → สำเนา → audit
 * @returns {{ errors?: string[], rows?: object[], extraCaps?: string[] }}
 */
export async function grantCaps(supabase, { targetId, actor, caps, reason, expiry, now = new Date() }, { audit } = {}) {
  const { data: found, error: findErr } = await supabase.auth.admin.getUserById(String(targetId));
  if (findErr || !found?.user) return { errors: ['ไม่พบผู้ใช้รายนี้'], status: 404 };
  const role = found.user.app_metadata?.role;
  const active = await listGrants(supabase, targetId).then((rows) => activeCapsFromRows(rows));
  const today = businessDate(now);
  const checked = validateGrantRequest({ caps, reason, expiry }, { role, activeCaps: active, today });
  if (checked.errors.length) return { errors: checked.errors, status: 400 };

  const stamp = now.toISOString();
  const rows = checked.caps.map((cap) => ({
    userId: String(targetId), cap, reason: checked.reason, expiresOn: checked.expiresOn,
    grantedById: actor?.id != null ? String(actor.id) : null, grantedByName: actor?.name || 'ไม่ทราบชื่อ', grantedAt: stamp,
  }));
  const { data: inserted, error } = await supabase.from(GRANT_TABLE).insert(rows).select('*');
  if (error) {
    // 23505 = ชน unique index (มีคนให้ cap เดียวกันไปพร้อมกันพอดี) — บอกเป็นภาษาคน ไม่ใช่ error ดิบ
    if (error.code === '23505') return { errors: ['มีคนให้สิทธิ์นี้ไปแล้วเมื่อครู่ — โหลดใหม่แล้วดูอีกครั้ง'], status: 409 };
    throw error;
  }
  const synced = await syncExtraCaps(supabase, targetId);
  await audit?.({
    user: actor, action: 'update', entityType: 'user', entityId: String(targetId),
    before: { email: found.user.email, extraCaps: synced.before },
    after: { email: found.user.email, extraCaps: synced.extraCaps },
    summary: `ให้สิทธิ์เสริม ${checked.caps.map(capLabel).join(' · ')} แก่ ${personName(found.user)}`
      + ` — ${checked.expiresOn ? `ถึง ${fmtDay(checked.expiresOn)}` : 'ไม่มีกำหนด'} · เหตุผล: ${checked.reason}`,
  });
  return { rows: inserted || [], extraCaps: synced.extraCaps };
}

/** ถอนสิทธิ์หนึ่งแถว (มือ) — แถวที่ถอนไปแล้ว/ไม่ใช่ของคนนี้ = 404 */
export async function revokeGrant(supabase, { targetId, grantId, actor, note = '', now = new Date() }, { audit } = {}) {
  const { data: row, error } = await supabase.from(GRANT_TABLE)
    .update({
      revokedAt: now.toISOString(), revokeKind: 'manual',
      revokedById: actor?.id != null ? String(actor.id) : null, revokedByName: actor?.name || 'ไม่ทราบชื่อ',
      revokeNote: String(note || '').trim().slice(0, GRANT_REASON_MAX) || null,
    })
    .eq('id', String(grantId)).eq('userId', String(targetId)).is('revokedAt', null)
    .select('*').maybeSingle();
  if (error) throw error;
  if (!row) return { errors: ['ไม่พบสิทธิ์เสริมนี้ หรือถูกถอนไปแล้ว'], status: 404 };
  const synced = await syncExtraCaps(supabase, targetId);
  await audit?.({
    user: actor, action: 'update', entityType: 'user', entityId: String(targetId),
    before: { email: synced.user.email, extraCaps: synced.before },
    after: { email: synced.user.email, extraCaps: synced.extraCaps },
    summary: `ถอนสิทธิ์เสริม ${capLabel(row.cap)} ของ ${personName(synced.user)}${row.revokeNote ? ` — ${row.revokeNote}` : ''}`,
  });
  return { row, extraCaps: synced.extraCaps };
}

/**
 * งานพ่วงของ cron รายวัน — ถอดแถวที่ครบกำหนด + เตือนแถวที่ใกล้ครบ (กระดิ่งคนถือ + คนให้)
 * ⚠️ แต่ละแถว CAS ด้วย `revokedAt IS NULL` / `warnedAt IS NULL` — แอดมินถอนพร้อมกันพอดี หรือ cron รันซ้ำ
 *    (แอดมินเปิดทดสอบเอง) ไม่ถอดซ้ำ/ไม่เตือนซ้ำ · กระดิ่งมี dedupeKey อีกชั้น
 * ⚠️ แจ้งเตือน/audit พลาดต้องไม่ทำให้รอบล้ม — ตัวเขียนทั้งสองกลืน error เองอยู่แล้ว
 */
export async function runGrantExpiry(supabase, { now = new Date(), notify, audit } = {}) {
  const today = businessDate(now);
  const { data, error } = await supabase.from(GRANT_TABLE).select('*')
    .is('revokedAt', null).not('expiresOn', 'is', null)
    .lte('expiresOn', addDays(today, GRANT_WARN_DAYS)).limit(500);
  if (error) throw error;
  const { expire, warn } = expiryActions(data || [], today);

  const users = new Map();
  const userOf = async (id) => {
    if (!users.has(id)) {
      const { data: found } = await supabase.auth.admin.getUserById(String(id));
      users.set(id, found?.user || null);
    }
    return users.get(id);
  };
  const bell = async (row, kind) => {
    const holder = await userOf(row.userId);
    const holderName = personName(holder);
    const base = { entityType: 'user_grant', entityId: row.id, kind, actorName: 'ระบบ' };
    await notify?.({ ...base, userIds: [row.userId], href: '/account', dedupeKey: `GRANT-${row.id}-${kind}-holder`,
      ...grantNotice(row, { kind, holderName, forHolder: true }) });
    if (row.grantedById && row.grantedById !== row.userId) {
      await notify?.({ ...base, userIds: [row.grantedById], href: '/users', dedupeKey: `GRANT-${row.id}-${kind}-granter`,
        ...grantNotice(row, { kind, holderName, forHolder: false }) });
    }
  };

  const expired = [];
  const touched = new Set();
  for (const row of expire) {
    const { data: done, error: upErr } = await supabase.from(GRANT_TABLE)
      .update({ revokedAt: now.toISOString(), revokeKind: 'expired', revokedByName: 'ระบบ (ครบกำหนด)' })
      .eq('id', row.id).is('revokedAt', null).select('*').maybeSingle();
    if (upErr || !done) continue;
    expired.push(done);
    touched.add(done.userId);
  }
  for (const userId of touched) {
    try {
      const synced = await syncExtraCaps(supabase, userId);
      const caps = expired.filter((r) => r.userId === userId).map((r) => capLabel(r.cap));
      await audit?.({
        user: { id: null, name: 'ระบบ (สิทธิ์เสริมครบกำหนด)' }, action: 'update', entityType: 'user', entityId: String(userId),
        before: { email: synced.user.email, extraCaps: synced.before },
        after: { email: synced.user.email, extraCaps: synced.extraCaps },
        summary: `สิทธิ์เสริมครบกำหนด ระบบถอด ${caps.join(' · ')} ของ ${personName(synced.user)}`,
      });
    } catch (e) {
      console.error('[grants] sync after expiry failed', userId, e?.message || e);
    }
  }
  for (const row of expired) await bell(row, GRANT_EXPIRED_KIND);

  const warned = [];
  for (const row of warn) {
    const { data: done, error: upErr } = await supabase.from(GRANT_TABLE)
      .update({ warnedAt: now.toISOString() })
      .eq('id', row.id).is('revokedAt', null).is('warnedAt', null).select('*').maybeSingle();
    if (upErr || !done) continue;
    warned.push(done);
    await bell(done, GRANT_EXPIRING_KIND);
  }
  return { today, expired: expired.length, warned: warned.length };
}
