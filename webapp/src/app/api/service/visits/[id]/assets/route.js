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
import { normalizeAssetResult } from '@/lib/service/visitAssets';
import { loadAssets } from '@/lib/service/sitesRepo';
import { requireVisit } from '@/lib/service/visitsRepo';

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
    for (const row of raw) {
      const { value, error } = normalizeAssetResult(row);
      if (error) return badRequest(error);
      values.push(value);
    }

    /* ⚠️ **ทุกเครื่องต้องอยู่ในไซต์ของนัดนี้** — เชื่อ id ที่ client ส่งมาไม่ได้
       (แพตเทิร์นเดียวกับด่านโซนที่ assets/route.js ใช้อยู่) · รวมเครื่องที่เอามาแทนด้วย
       ไม่งั้นจะ "เปลี่ยนเป็นเครื่องของไซต์อื่น" ได้ แล้วทะเบียนสองไซต์พันกัน */
    const siteAssets = await loadAssets(supabase, visit.siteId);
    const allowed = new Set(siteAssets.map((a) => a.id));
    for (const v of values) {
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

    /* เขียนทับทั้งชุด: ลบของเดิมแล้วใส่ใหม่
       ⚠️ ไม่มีทรานแซกชันในชั้นนี้ (ทุก route ของโมดูลยิงทีละคำสั่ง) — ลบก่อนใส่จึงมี
       ช่วงที่ผลว่าง · ยอมรับได้เพราะเป็นข้อมูลที่ผู้ใช้กำลังกรอกอยู่คนเดียวต่อหนึ่งนัด
       และถ้า insert ล้ม เจ้าหน้าที่เห็น error แล้วกดบันทึกใหม่ได้ทันทีจากฟอร์มที่ยังคาอยู่ */
    const before = await loadResults(supabase, id);
    const { error: delError } = await supabase
      .from('service_visit_assets').delete().eq('visitId', id);
    if (delError) return fail(delError.message, 500);

    let saved = [];
    if (values.length) {
      const rows = values.map((v) => ({
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

    /* ⭐ เปลี่ยนเครื่อง = **เข้าทะเบียนจริง** ไม่ใช่ข้อความในหมายเหตุ (มติข้อ 7)
       ตัวเก่าถูกถอด · ตัวใหม่ถูกติดตั้ง ณ วันที่เข้าจริงของนัดนี้
       ⚠️ ไม่งั้นทะเบียนเครื่องเพี้ยนตั้งแต่เดือนแรก และประวัติการเข้าของเครื่องขาดตอน */
    const swaps = values.filter((v) => v.outcome === 'swapped');
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
        + (swaps.length ? ` · เปลี่ยนเครื่อง ${swaps.length}` : ''),
      request: req,
    });

    return ok(saved);
  } catch (e) {
    return fail(e.message, 500);
  }
});
