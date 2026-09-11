// ── API ผลรายเครื่องของนัด (mig 0301 · F-4) ──────────────────────────────
// GET  → ผลที่บันทึกไว้แล้ว
// PUT  → บันทึกผลทั้งชุดในคำขอเดียว (เจ้าหน้าที่ติ๊กทีละตัวบนจอ แล้วกดบันทึกครั้งเดียว)
//
// ⚠️ เป็น **PUT ทั้งชุด ไม่ใช่ POST ทีละแถว** ต่างจาก `items` โดยตั้งใจ:
// ของที่ใช้เป็นรายการที่เพิ่มทีละชิ้นตามที่นึกออก แต่ผลรายเครื่องคือ "คำตอบของทั้งใบ"
// ที่ต้องอ่านพร้อมกันเพื่อสรุปสถานะ · ส่งทีละแถวเมื่อไรจะมีสถานะกลางทางที่ใบสรุปผิด
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict } from '@/lib/http';
import {
  ASSET_OUTCOME_LABELS, REMOVE_VISIT_KIND, frozenResultRows, normalizeAssetResult, sameAssetResult,
} from '@/lib/service/visitAssets';
import { findSite, loadAssets, loadAssetsByIds } from '@/lib/service/sitesRepo';
import { requireVisit } from '@/lib/service/visitsRepo';
import { IN_CHUNK_SIZE } from '@/lib/supabaseInChunks';
import { brokenReportPlan } from '@/lib/service/visitConditionReport';
import { commitAssetMove } from '@/lib/service/assetMoveCommit';
import { businessDate } from '@/lib/businessDate';

export const dynamic = 'force-dynamic';

async function loadResults(supabase, visitId) {
  const { data, error } = await supabase
    .from('service_visit_assets').select('*').eq('visitId', visitId)
    .order('createdAt', { ascending: true });
  if (error) throw error;
  return data || [];
}

export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireVisit({ user, supabase, id });
    if (access.response) return access.response;
    return ok(await loadResults(supabase, id));
  } catch (e) {
    return fail(e.message, 500);
  }
});

// PUT { results: [{ assetId, outcome, reason?, replacedByAssetId? }] }
export const PUT = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireVisit({ user, supabase, id, edit: true });
    if (access.response) return access.response;
    const visit = access.visit;

    const body = await req.json().catch(() => ({}));
    const raw = Array.isArray(body.results) ? body.results : null;
    if (!raw) return badRequest('ต้องส่งผลรายเครื่องมาเป็นรายการ');

    const values = [];
    // เครื่องที่ช่างติ๊ก "เครื่องชำรุด" — ไม่ใช่คอลัมน์ของผลรายนัด (ดู normalizeAssetResult)
    const reports = [];
    for (const row of raw) {
      const { value, broken, error } = normalizeAssetResult(row);
      if (error) return badRequest(error);
      values.push(value);
      if (broken) reports.push({ assetId: value.assetId, reason: value.reason });
    }

    /* ⚠️ นัดถอนเครื่องไม่มี "เปลี่ยนเครื่อง" — เอาเครื่องสำรองมาใส่แทนในวันที่ลูกค้าเลิก
       สัญญาคือการติดตั้งใหม่ ไม่ใช่การถอน · แผ่นปิดงานซ่อนตัวเลือกนี้แล้ว ด่านนี้กันเส้นตรง */
    if (visit.kind === REMOVE_VISIT_KIND && values.some((v) => v.outcome === 'swapped')) {
      return badRequest(`นัดถอนเครื่องใช้ “${ASSET_OUTCOME_LABELS.swapped}” ไม่ได้ — เลือก “ถอนแล้ว” หรือ “ถอนไม่ได้”`);
    }

    /* ⚠️ **ทุกเครื่องต้องอยู่ในไซต์ของนัดนี้** — เชื่อ id ที่ client ส่งมาไม่ได้
       (แพตเทิร์นเดียวกับด่านโซนที่ assets/route.js ใช้อยู่) · รวมเครื่องที่เอามาแทนด้วย
       ไม่งั้นจะ "เปลี่ยนเป็นเครื่องของไซต์อื่น" ได้ แล้วทะเบียนสองไซต์พันกัน */
    const siteAssets = await loadAssets(supabase, visit.siteId);
    const before = await loadResults(supabase, id);

    /* 🔒 **ผลของเครื่องที่ไม่ได้ติดตั้งอยู่ที่ไซต์นี้แล้ว = ประวัติ แก้จากแผ่นนี้ไม่ได้**
       🐞 ของเดิมลบทุกแถวของนัดแล้วใส่ใหม่เฉพาะที่จอส่งมา · แต่จอกางเฉพาะเครื่อง "ใช้งาน"
         ⇒ กด "แก้ผลการเข้า" ทีไร ผลของเครื่องที่ถูกเปลี่ยน/ส่งซ่อม/ถอนออกไปแล้ว **หายเงียบ**
         (นัดถอนเครื่องหนักสุด: ทุกเครื่องที่ถอนแล้วไม่มีไซต์ ⇒ ใบส่งงานว่างทั้งใบ)
       ⇒ แถวพวกนี้ไม่ถูกลบ · ส่งมาซ้ำแบบเดิมทุกช่อง = เงียบ (จอเก่า) · ส่งมาแก้ = ตีกลับ */
    const frozen = frozenResultRows(before, siteAssets);
    const frozenById = new Map(frozen.map((r) => [r.assetId, r]));
    if (frozen.length) {
      const labels = new Map((await loadAssetsByIds(supabase, [...frozenById.keys()]))
        .map((a) => [a.id, a.label || a.code || a.id]));
      for (const v of values) {
        const kept = frozenById.get(v.assetId);
        if (kept && !sameAssetResult(kept, v)) {
          /* ทางแก้ต้องมีอยู่จริง — "ติดตั้งเข้าไซต์" ใช้ได้กับเครื่องที่ถูกถอน (ว่าง) เท่านั้น
             เครื่องที่ถูกเปลี่ยนออก (ปลดระวาง) หรือส่งซ่อม ไม่มีคำสั่งนั้นให้กด */
          return conflict(`“${labels.get(v.assetId) || v.assetId}” ไม่ได้ติดตั้งอยู่ที่ไซต์นี้แล้ว — ผลที่บันทึกไว้ของเครื่องนี้แก้ไม่ได้`
            + (visit.kind === REMOVE_VISIT_KIND ? ' · ถ้าถอนผิด ให้ผู้จัดคิวสั่ง “ติดตั้งเข้าไซต์” ที่หน้าเครื่อง' : ''));
        }
      }
    }
    // ⚠️ แถวที่ส่งมาซ้ำกับของแช่แข็งทิ้งไป — มันอยู่ในฐานแล้ว (ใส่ซ้ำ = แถวซ้ำ)
    const incoming = values.filter((v) => !frozenById.has(v.assetId));

    /* 🔴 **นัดถอนรับเครื่องที่ติดตั้งหลังวันที่ของนัดไม่ได้** — เครื่องที่มาติดตั้งที่ไซต์นี้ *หลัง*
       วันที่ไปถอน (ลูกค้ากลับมาต่อสัญญา) ไม่ใช่งานของนัดนั้น · ปล่อยให้เพิ่มแถว "ถอนแล้ว" ย้อนหลัง
       = ถอนเครื่องของสัญญาใหม่ออกจากทะเบียนผ่านนัดเก่า
       ⚠️ ตัดสินด้วย **วันติดตั้ง** ไม่ใช่ "เคยมีผลในนัดนี้หรือยัง" — รุ่นนั้นทำให้นัดที่ปิดว่า
          "ไปแล้วเข้าไม่ได้" (ยังไม่มีผลสักแถว) กลับไปบันทึกการถอนทีหลังไม่ได้เลย
       ⚠️ เครื่องที่มีผลในนัดนี้อยู่แล้วผ่านเสมอ (เช่นถูกติดตั้งคืนหลังถอนผิด แล้วส่งค่าเดิมกลับมา)
       ⚠️ ตรวจที่นี่ ไม่ใช่ปล่อยให้ด่านวันที่ตอนปิดใบจับ — ถึงตอนนั้นแถวลงฐานไปแล้ว และจะค้าง
          ขวางการบันทึกนัดนี้ทุกครั้งหลังจากนั้น */
    if (visit.kind === REMOVE_VISIT_KIND && visit.actualDate) {
      const inVisit = new Set(before.map((r) => r.assetId));
      const assetById = new Map(siteAssets.map((a) => [a.id, a]));
      const later = incoming
        .filter((v) => v.outcome === 'done' && !inVisit.has(v.assetId))
        .map((v) => assetById.get(v.assetId))
        .filter((a) => a?.installedAt && String(a.installedAt) > String(visit.actualDate));
      if (later.length) {
        return badRequest(`${later.map((a) => `“${a.label || a.code || a.id}”`).join(' · ')} ติดตั้งที่ไซต์นี้หลังวันที่ของนัดนี้ `
          + `(${visit.actualDate}) — ไม่ใช่เครื่องของนัดนี้ · ถ้าวันติดตั้งในทะเบียนผิด ให้ผู้จัดคิวแก้ที่หน้าเครื่องก่อน`);
      }
    }

    const allowed = new Set(siteAssets.map((a) => a.id));
    for (const v of incoming) {
      if (!allowed.has(v.assetId)) return badRequest('มีอุปกรณ์ที่ไม่ได้อยู่ในไซต์ของนัดนี้');
      if (v.replacedByAssetId && !allowed.has(v.replacedByAssetId)) {
        return badRequest('เครื่องที่เอามาแทนต้องอยู่ในไซต์เดียวกัน — เพิ่มเครื่องใหม่เข้าไซต์ก่อน แล้วค่อยเลือก');
      }
    }
    const seen = new Set();
    for (const v of values) {
      if (seen.has(v.assetId)) return badRequest('มีอุปกรณ์ซ้ำในรายการ — หนึ่งเครื่องมีผลได้ค่าเดียวต่อหนึ่งนัด');
      seen.add(v.assetId);
    }

    /* ── แจ้งเครื่องชำรุด (ข้อ H) — ตรวจ **ก่อนเขียนอะไรเลย** ─────────────────────
       เครื่องที่แจ้งไม่ได้ (ไม่ได้ติดตั้งอยู่ที่ไซต์นี้ · ปลดระวางแล้ว) ต้องตีกลับทั้งคำขอ
       ไม่ใช่บันทึกผลไปครึ่งหนึ่งแล้วค่อยบอกว่าแจ้งไม่ได้ (เหตุผลเต็มที่ visitConditionReport.js) */
    const brokenPlan = brokenReportPlan({ visit, reports, siteAssets, today: businessDate() });
    if (brokenPlan.errors.length) return badRequest(brokenPlan.errors.map((e) => e.error).join(' · '));
    // โหลดไซต์ก่อนเขียน — โยนหลังเขียนผลไปแล้ว = ผลบันทึกแต่ไม่มีเครื่องไหนถูกแจ้งชำรุด + 500
    const reportSite = brokenPlan.moves.length ? await findSite(supabase, visit.siteId) : null;

    /* เขียนทับทั้งชุด **เฉพาะแถวที่ยังแก้ได้**: ลบของเดิมแล้วใส่ใหม่
       ⚠️ ไม่มีทรานแซกชันในชั้นนี้ (ทุก route ของโมดูลยิงทีละคำสั่ง) — ลบก่อนใส่จึงมี
       ช่วงที่ผลว่าง · ยอมรับได้เพราะเป็นข้อมูลที่ผู้ใช้กำลังกรอกอยู่คนเดียวต่อหนึ่งนัด
       และถ้า insert ล้ม เจ้าหน้าที่เห็น error แล้วกดบันทึกใหม่ได้ทันทีจากฟอร์มที่ยังคาอยู่
       ⚠️ ลบด้วย **id ของแถว** ไม่ใช่ `visitId` ทั้งใบ — ไม่งั้นแถวที่แช่แข็งไว้หายไปด้วย */
    const editableIds = before.filter((r) => !frozenById.has(r.assetId)).map((r) => r.id);
    for (let from = 0; from < editableIds.length; from += IN_CHUNK_SIZE) {
      const { error: delError } = await supabase
        .from('service_visit_assets').delete()
        .eq('visitId', id).in('id', editableIds.slice(from, from + IN_CHUNK_SIZE));
      if (delError) return fail(delError.message, 500);
    }

    let saved = [];
    if (incoming.length) {
      const rows = incoming.map((v) => ({
        id: genId('SVR'),
        visitId: id,
        ...v,
        createdById: user.id ? String(user.id) : null,
        createdByName: user.name || null,
      }));
      const { data, error: insError } = await supabase
        .from('service_visit_assets').insert(rows).select();
      if (insError) {
        if (insError.code === '23503') {
          return conflict('อุปกรณ์บางตัวถูกลบไปแล้วระหว่างที่กรอก — โหลดหน้าใหม่แล้วลองอีกครั้ง');
        }
        return fail(insError.message, 500);
      }
      saved = data || [];
    }
    // คืนผลทั้งใบ (ที่แก้ได้ + ที่แช่แข็งไว้) — จอใช้นับว่าใบนี้จะปิดเป็นอะไร
    saved = [...frozen, ...saved];

    /* ⭐ เปลี่ยนเครื่อง = **เข้าทะเบียนจริง** ไม่ใช่ข้อความในหมายเหตุ (มติข้อ 7)
       ตัวเก่าถูกถอด · ตัวใหม่ถูกติดตั้ง ณ วันที่เข้าจริงของนัดนี้
       ⚠️ ไม่งั้นทะเบียนเครื่องเพี้ยนตั้งแต่เดือนแรก และประวัติการเข้าของเครื่องขาดตอน */
    /* ⭐ แจ้งชำรุด = คำสั่ง `condition` ตัวเดียวกับหน้าเครื่อง (ทางเขียนเดียว `commitAssetMove`)
       ⚠️ ทำ **ก่อน** วงเปลี่ยนเครื่อง — เครื่องที่ช่างแจ้งว่าเสียแล้วเปลี่ยนออกในรอบเดียวกัน
          ต้องมีประวัติว่าเสียก่อนถูกเอาออก ไม่ใช่เงียบหายไปพร้อมสถานะปลดระวาง
       ⚠️ guard `condition: 'ok'` — สองคนแจ้งพร้อมกัน/ผู้จัดคิวแก้สภาพระหว่างทาง ต้องไม่ได้แถว
          ประวัติ "แจ้งว่าชำรุด" ซ้อนสองแถว */
    const reported = { moved: [], failed: [] };
    if (brokenPlan.moves.length) {
      for (const { asset, input } of brokenPlan.moves) {
        const label = asset.label || asset.code || asset.id;
        const result = await commitAssetMove(supabase, {
          asset, kind: 'condition', input, fromSite: reportSite, user,
          guard: { siteId: visit.siteId, condition: asset.condition },
        });
        if (result.error) {
          reported.failed.push(label);
          continue;
        }
        reported.moved.push(label);
        await recordAudit({
          user, action: 'update', entityType: 'service_asset', entityId: asset.id,
          before: asset, after: result.asset,
          summary: `แจ้งชำรุด ${asset.serial || label} · จากนัด ${visit.code || id} — ${input.reason}`,
          request: req,
        });
      }
    }

    // ⚠️ เฉพาะแถวที่เพิ่งเขียน — ของที่แช่แข็งไว้ถูกเปลี่ยนไปแล้ว (ยิงซ้ำ = ปลดระวางซ้ำ)
    const swaps = incoming.filter((v) => v.outcome === 'swapped');
    const stampDate = visit.actualDate || visit.scheduledDate;
    for (const swap of swaps) {
      await supabase.from('service_assets')
        .update({ status: 'removed', removedAt: stampDate, updatedAt: new Date().toISOString() })
        .eq('id', swap.assetId).eq('siteId', visit.siteId);
      const target = siteAssets.find((a) => a.id === swap.replacedByAssetId);
      // เครื่องแทนที่ยังไม่เคยระบุวันติดตั้ง = เพิ่งเอาเข้ามาวันนี้
      if (target && !target.installedAt) {
        await supabase.from('service_assets')
          .update({ installedAt: stampDate, updatedAt: new Date().toISOString() })
          .eq('id', target.id).eq('siteId', visit.siteId);
      }
    }

    await recordAudit({
      user, action: 'update', entityType: 'service_visit', entityId: id,
      before: { results: before }, after: { results: saved },
      summary: `บันทึกผลรายเครื่องของนัด ${visit.code || id} · ${saved.length} รายการ`
        + (swaps.length ? ` · เปลี่ยนเครื่อง ${swaps.length}` : '')
        + (reported.moved.length ? ` · แจ้งชำรุด ${reported.moved.length}` : ''),
      request: req,
    });

    /* แจ้งชำรุดล้ม (สภาพเปลี่ยนไประหว่างทาง) — ผลรายเครื่องบันทึกแล้ว แต่ต้องไม่ปล่อยให้จอ
       ไปปิดใบต่อทั้งที่ทะเบียนยังไม่รู้ว่าเครื่องเสีย ⇒ 409 ให้กดบันทึกอีกครั้ง (ยิงซ้ำปลอดภัย:
       เครื่องที่แจ้งสำเร็จแล้วถูกข้าม · ผลรายเครื่องเขียนทับค่าเดิม) */
    if (reported.failed.length) {
      return conflict(`บันทึกผลแล้ว แต่แจ้งชำรุดไม่สำเร็จ ${reported.failed.length} เครื่อง (${reported.failed.join(' · ')}) — กดบันทึกอีกครั้ง`);
    }
    return ok(saved);
  } catch (e) {
    return fail(e.message, 500);
  }
});
