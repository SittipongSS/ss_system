// ── API หน้างานติดตั้งของช่าง (ขั้นเข้าติดตั้ง PR-5a · ม็อก C1/C2/C3 · mig 0425 + 0429) ────────────────────────
//
//   GET  /api/service/visits/[id]/install   ภาพงาน: โซน › จุด (เครื่องที่วาง + ชื่อจุด + รูป + ผล) · โซนที่อยู่นัดอื่น · ผู้ติดต่อ
//   PUT  …/install `{ assetId, spotName?, photoUrl?, photoName?, outcome?, reason? }`  บันทึกจุดหนึ่งจุด
//        …/install `{ zoneId, note }`                                                หมายเหตุโซน
//   POST …/install `{ zones: { [zoneId]: { resolution, reason? } }, note? }`           ส่งงาน
//
// ⭐ ผลรายเครื่องเขียน `service_visit_assets` (ตารางเดิม · ขั้นของคำขออ่านที่นั่น) · ชื่อจุด/รูปเขียนแถวเครื่องที่วาง (0429)
// ⭐ ส่งงาน = ผลของจุดที่ยังไม่มีผล (ติดไม่ได้ทั้งโซน) › คำสั่งย้าย 'install' ทีละเครื่อง (ทะเบียนเครื่อง + ประวัติย้าย ·
//    ชื่อจุดลง `service_assets.spot`) › ปิดนัด (done/partial/unable + เวลาจบ) — **ทำซ้ำได้**: เครื่องที่ย้ายขึ้นไซต์แล้ว
//    ข้าม · ย้ายพลาดสักเครื่อง = หยุดก่อนปิดนัด (กดส่งใหม่ได้ ไม่มีอะไรซ้อน)
// ⭐ ตรรกะอยู่ที่นี่ · ตัวเขียนเธรด/audit/กระดิ่ง/ย้ายเครื่อง ส่งเข้ามาได้ ⇒ เทสต์ไม่แตะฐานจริง
// ⚠️ ด่านสิทธิ์อยู่ที่ route (`requireVisit` · ช่างต้องกดเริ่มงานก่อน) — ไฟล์นี้รับ visit ที่ผ่านด่านแล้ว
import { recordAudit } from '@/lib/audit';
import { businessDate } from '@/lib/businessDate';
import { genId } from '@/lib/id';
import { appendUpdate } from '@/lib/master/updates';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { assetMoveError } from './assetMoves';
import { commitAssetMove } from './assetMoveCommit';
import { INSTALL_JOB_TEXT, installJobView, installSendInput, installSpotInput, installZoneNoteInput } from './installJob';
import { notifyInstallDone } from './installNotify';
import { isInstallStepVisit } from './visitGate';
import { isDraftVisit, isOpenVisit } from './visitStatus';
import { stampVisitTimes } from './visitStamp';

const reply = (status, body) => ({ status, body });
const failWith = (status, error, extra = {}) => reply(status, { error, ...extra });
const orThrow = (label, res) => {
  if (res.error) throw new Error(`${label}ไม่สำเร็จ: ${res.error.message}`);
  return res.data || [];
};

/* ⭐ จุดโหลดเดียวของงานติดตั้งหนึ่งนัด · อ่านพัง = throw (ห้ามตอบงานว่างที่อ่านเป็น "ไม่มีจุด") */
export async function loadInstallJob(supabase, visit) {
  const [vzRes, plannedRes, resultRes, requestRes, siteRes] = await Promise.all([
    supabase.from('service_visit_zones').select('"zoneId", note').eq('visitId', visit.id),
    supabase.from('service_visit_planned_assets')
      .select('"zoneId", "assetId", "sortOrder", "spotName", "photoUrl", "photoName", "savedAt", "savedByName"').eq('visitId', visit.id),
    supabase.from('service_visit_assets').select('id, "assetId", outcome, reason').eq('visitId', visit.id),
    supabase.from('service_install_requests').select('*').eq('id', visit.installRequestId).maybeSingle(),
    supabase.from('service_sites').select('*').eq('id', visit.siteId).maybeSingle(),
  ]);
  const visitZones = orThrow('อ่านโซนของนัด', vzRes);
  const planned = orThrow('อ่านเครื่องที่วาง', plannedRes);
  const results = orThrow('อ่านผลรายเครื่อง', resultRes);
  if (requestRes.error) throw new Error(`อ่านคำขอติดตั้งไม่สำเร็จ: ${requestRes.error.message}`);
  if (siteRes.error) throw new Error(`อ่านไซต์ไม่สำเร็จ: ${siteRes.error.message}`);
  const request = requestRes.data || null;

  /* โซนของคำขอที่อยู่นัดอื่นที่ยังมีชีวิต — "นัดแยก SV-… · วันที่" (ม็อก C1 แถวเทา) */
  let elsewhere = [];
  let requestZoneIds = [];
  if (request) {
    const [rzRes, otherRes] = await Promise.all([
      supabase.from('service_install_request_zones').select('"zoneId"').eq('requestId', request.id),
      fetchAllResult(() => supabase.from('service_visits').select('id, code, status, "scheduledDate"')
        .eq('installRequestId', request.id).neq('id', visit.id).order('id', { ascending: true })),
    ]);
    requestZoneIds = orThrow('อ่านโซนที่ขอ', rzRes).map((r) => r.zoneId);
    const others = orThrow('อ่านนัดอื่นของคำขอ', otherRes).filter((v) => isDraftVisit(v) || isOpenVisit(v));
    if (others.length) {
      const ozRes = await supabase.from('service_visit_zones').select('"visitId", "zoneId"').in('visitId', others.map((v) => v.id));
      const byId = new Map(others.map((v) => [v.id, v]));
      elsewhere = orThrow('อ่านโซนของนัดอื่น', ozRes).map((row) => ({
        zoneId: row.zoneId, visitCode: byId.get(row.visitId)?.code || null, scheduledDate: byId.get(row.visitId)?.scheduledDate || null,
      }));
    }
  }
  const zoneIds = [...new Set([...visitZones.map((z) => z.zoneId), ...elsewhere.map((e) => e.zoneId), ...requestZoneIds])];
  const assetIds = [...new Set(planned.map((p) => p.assetId))];
  /* ⚠️ ไล่ทีละหน้า + ลำดับนิ่ง (check:rowcap) — ชุดมาจากงานเดียวแต่ด่านไม่รู้ขนาด */
  const [zoneRes, assetRes] = await Promise.all([
    zoneIds.length
      ? fetchAllResult(() => supabase.from('service_zones').select('id, code, name, "siteId"').in('id', zoneIds).order('id', { ascending: true }))
      : { data: [], error: null },
    assetIds.length
      ? fetchAllResult(() => supabase.from('service_assets')
        .select('id, code, label, model, colour, status, "siteId", "zoneId", spot, condition, "installedAt"')
        .in('id', assetIds).order('id', { ascending: true }))
      : { data: [], error: null },
  ]);
  const zonesById = new Map(orThrow('อ่านโซน', zoneRes).map((z) => [z.id, z]));
  const assetsById = new Map(orThrow('อ่านทะเบียนเครื่อง', assetRes).map((a) => [a.id, a]));
  return {
    request, site: siteRes.data || null, visitZones, planned, results, assetsById, zonesById, elsewhere,
    view: installJobView({ visitZones, planned, results, zonesById, assetsById, elsewhere }),
  };
}

/* นัดนี้เป็นงานติดตั้งจากคำขอคิวไหม — เส้นนี้ใช้กับนัดชนิดอื่นไม่ได้ */
const notInstall = (visit) => (isInstallStepVisit(visit) ? null : failWith(400, INSTALL_JOB_TEXT.notInstall));
/* บันทึกผล/ส่งงานได้เฉพาะงานที่กำลังทำ — ช่างโดน `requireVisit({ running })` แล้ว · หัวหน้าก็ต้องเริ่มงานก่อนเหมือนกัน */
const notRunning = (visit) => (visit?.status === 'in_progress' ? null : failWith(409, INSTALL_JOB_TEXT.notRunning));

/* ── GET ── */
export async function installJobGet({ supabase, visit, load = loadInstallJob }) {
  const bad = notInstall(visit);
  if (bad) return bad;
  try {
    const job = await load(supabase, visit);
    return reply(200, {
      view: job.view,
      request: job.request ? {
        contactName: job.request.contactName || null, contactPhone: job.request.contactPhone || null, note: job.request.note || null,
      } : null,
      canRecord: visit.status === 'in_progress',
    });
  } catch (error) {
    return failWith(500, error?.message || 'โหลดงานติดตั้งไม่สำเร็จ');
  }
}

/* ── PUT: จุดหนึ่งจุด หรือ หมายเหตุโซน ── */
export async function installSpotPut({
  supabase, user, visit, body, now = () => new Date().toISOString(), load = loadInstallJob,
}) {
  const bad = notInstall(visit) || notRunning(visit);
  if (bad) return bad;
  let job;
  try { job = await load(supabase, visit); }
  catch (error) { return failWith(500, error?.message || 'โหลดงานติดตั้งไม่สำเร็จ'); }

  if (!body?.assetId && body?.zoneId) {
    const { value, error } = installZoneNoteInput(body, { view: job.view });
    if (error) return failWith(400, error);
    const { error: writeError } = await supabase.from('service_visit_zones')
      .update({ note: value.note }).eq('visitId', visit.id).eq('zoneId', value.zoneId);
    if (writeError) return failWith(500, `บันทึกหมายเหตุโซนไม่สำเร็จ: ${writeError.message}`);
    return reply(200, { zoneId: value.zoneId, note: value.note });
  }

  const photoUrls = new Set((Array.isArray(visit.attachments) ? visit.attachments : []).map((a) => a?.url).filter(Boolean));
  const { value, error } = installSpotInput(body || {}, { view: job.view, photoUrls });
  if (error) return failWith(400, error);
  const stamp = now();
  const { error: plannedError } = await supabase.from('service_visit_planned_assets').update({
    spotName: value.spotName, photoUrl: value.photoUrl, photoName: value.photoName,
    savedAt: stamp, savedById: user?.id ? String(user.id) : null, savedByName: user?.name || user?.email || null,
  }).eq('visitId', visit.id).eq('assetId', value.assetId);
  if (plannedError) return failWith(500, `บันทึกจุดไม่สำเร็จ: ${plannedError.message}`);

  /* ผลรายเครื่อง — upsert ตามคู่ (นัด, เครื่อง) (UNIQUE `service_visit_assets_once`) · ไม่มีผล = ลบแถว (ยังไม่ตอบ) */
  if (value.outcome) {
    const prior = job.results.find((r) => String(r.assetId) === String(value.assetId));
    const { error: resultError } = await supabase.from('service_visit_assets').upsert({
      id: prior?.id || genId('SVR'), visitId: visit.id, assetId: value.assetId, outcome: value.outcome, reason: value.reason, updatedAt: stamp,
    }, { onConflict: 'visitId,assetId' });
    if (resultError) return failWith(500, `บันทึกผลของจุดไม่สำเร็จ: ${resultError.message}`);
  } else {
    const { error: clearError } = await supabase.from('service_visit_assets').delete().eq('visitId', visit.id).eq('assetId', value.assetId);
    if (clearError) return failWith(500, `ล้างผลของจุดไม่สำเร็จ: ${clearError.message}`);
  }
  return reply(200, { spot: value });
}

/* ── POST: ส่งงาน ── */
export async function installSendPost({
  supabase, user, visit, body, request = null, now = () => new Date().toISOString(), todayIso = businessDate(),
  load = loadInstallJob, move = commitAssetMove, audit = recordAudit, thread = appendUpdate, notify = notifyInstallDone,
}) {
  const bad = notInstall(visit) || notRunning(visit);
  if (bad) return bad;
  let job;
  try { job = await load(supabase, visit); }
  catch (error) { return failWith(500, error?.message || 'โหลดงานติดตั้งไม่สำเร็จ'); }
  const { value, error, zoneId } = installSendInput(body || {}, { view: job.view });
  if (error) return failWith(400, error, zoneId ? { zoneId } : {});
  if (!job.site) return failWith(409, 'ไม่พบไซต์ของนัดนี้');
  const stamp = now();

  /* 1) จุดที่ยังไม่มีผลในโซน "ติดไม่ได้ทั้งโซน" → แถวผล unable (upsert · ส่งซ้ำได้) */
  const fresh = value.unable.filter((u) => !u.saved);
  if (fresh.length) {
    const priorId = new Map(job.results.map((r) => [String(r.assetId), r.id]));
    const { error: unableError } = await supabase.from('service_visit_assets').upsert(fresh.map((u) => ({
      id: priorId.get(String(u.assetId)) || genId('SVR'), visitId: visit.id, assetId: u.assetId, outcome: 'unable', reason: u.reason, updatedAt: stamp,
    })), { onConflict: 'visitId,assetId' });
    if (unableError) return failWith(500, `บันทึกผลโซนที่ติดไม่ได้ไม่สำเร็จ: ${unableError.message}`);
  }

  /* 2) ย้ายเครื่องที่ติดตั้งแล้วขึ้นโซน — ทีละเครื่อง · เครื่องที่ขึ้นไซต์นี้แล้ว (ส่งรอบก่อนค้างกลางทาง) ข้าม */
  const failures = [];
  for (const item of value.installs) {
    const asset = job.assetsById.get(item.assetId);
    if (!asset) { failures.push(`${item.assetId}: ไม่พบในทะเบียน`); continue; }
    if (asset.status === 'active' && asset.siteId === visit.siteId) continue;
    const input = { movedAt: todayIso, toSiteId: visit.siteId, toZoneId: item.zoneId, spot: item.spotName, note: `ติดตั้งจากนัด ${visit.code || visit.id}` };
    const blocked = assetMoveError(asset, 'install', input, { canEdit: true, toSite: job.site });
    if (blocked) { failures.push(`${asset.code || asset.id}: ${blocked}`); continue; }
    const result = await move(supabase, { asset, kind: 'install', input, fromSite: null, toSite: job.site, user });
    if (result?.error) failures.push(`${asset.code || asset.id}: ${result.error}`);
  }
  if (failures.length) {
    return failWith(409, `ย้ายเครื่องขึ้นไซต์ไม่ครบ — ยังไม่ปิดงาน กดส่งใหม่ได้: ${failures.join(' · ')}`);
  }

  /* 3) ปิดนัด — สถานะจากแผน (ไม่ใช่ deriveVisitStatus ของนัดตามรอบ) · ประทับเวลาจบ · CAS กำลังทำ */
  const reasons = [...new Set(value.unable.map((u) => u.reason).filter(Boolean))];
  const unableReason = value.status === 'unable'
    ? `ติดตั้งไม่ได้ทุกจุด: ${reasons.join(' · ')}`.slice(0, 500)
    : null;
  const patch = stampVisitTimes({
    status: value.status,
    unableReason,
    actualDate: visit.actualDate || null,
    actualStartTime: visit.actualStartTime || null,
    updatedAt: stamp,
  }, { stamp: 'end', nowIso: stamp, hasEndDateColumn: 'actualEndDate' in visit });
  const { data: closed, error: closeError } = await supabase.from('service_visits').update(patch)
    .eq('id', visit.id).eq('status', 'in_progress').select('*').maybeSingle();
  if (closeError) return failWith(500, `ปิดงานไม่สำเร็จ: ${closeError.message}`);
  if (!closed) return failWith(409, 'งานนี้เพิ่งถูกปิด/แก้จากอีกเครื่อง — โหลดใหม่');

  const summary = `ส่งงานติดตั้ง ${visit.code || visit.id} · ติดตั้งแล้ว ${value.installs.length}/${job.view.total} จุด`
    + (value.unable.length ? ` · ติดไม่ได้ ${value.unable.length}` : '')
    + (value.later.length ? ` · ไปทำต่อ ${value.later.length} โซน` : '');
  await thread(supabase, {
    entityType: 'service_visit', entityId: visit.id, kind: 'done', user,
    body: `${summary}${value.note ? ` — ${value.note}` : ''}`,
  });
  await audit({ user, action: 'update', entityType: 'service_visit', entityId: visit.id, before: visit, after: closed, summary, request });
  notify(supabase, {
    visit: closed, request: job.request, site: job.site, installed: value.installs.length, total: job.view.total,
    later: value.later.length, unable: value.unable.length, note: value.note,
    actor: { id: user?.id ?? null, name: user?.name || user?.email || null },
  });
  return reply(200, { visit: closed, installed: value.installs.length, total: job.view.total, status: value.status });
}
