// ── ใบสเปคสินค้า FM-SA-04 — ชั้นอ่าน/เขียนฐาน (mig 0364) ─────────────────────
//
// ⚠️ **ด่านทั้งหมดอยู่ที่ `productSpecWorkflow.js`** ที่นี่ทำแค่หยิบของกับเขียนของ
// ⚠️ **supabase ไม่ throw** — ทุก query ต้องเช็ค `error` เอง ไม่งั้นด่านที่นับจาก
//    ผลลัพธ์จะ "เปิดเอง" เมื่อ query พัง (memory: supabase-never-throws)
import { genId } from '@/lib/id';
import { productSpecChecklistSeed } from '@/lib/sales/productSpecChecklist';
import { productSpecDocNoParts } from '@/lib/sales/productSpecDocNo';

const SPEC_CONTENT_FIELDS = Object.freeze([
  'texture', 'standardPackaging',
  'targetGroup', 'keySellingPoint', 'pricingTier',
  'productBenefit', 'longevity', 'dosagePerUse',
]);

export { SPEC_CONTENT_FIELDS };

/** ใบของสินค้าหนึ่งตัว พร้อมฉบับทุกฉบับ (ใหม่ก่อน) และประวัติการออกเอกสาร */
export async function loadProductSpec(supabase, productId) {
  const { data: spec, error } = await supabase
    .from('product_specs').select('*').eq('productId', productId).maybeSingle();
  if (error) return { error: error.message };
  if (!spec) return { spec: null, revisions: [], issues: [] };

  const [revs, issues] = await Promise.all([
    supabase.from('product_spec_revisions').select('*')
      .eq('specId', spec.id).order('revNo', { ascending: false }),
    supabase.from('product_spec_issues').select('*')
      .eq('specId', spec.id).order('createdAt', { ascending: false }),
  ]);
  if (revs.error) return { error: revs.error.message };
  if (issues.error) return { error: issues.error.message };

  const revisionIds = (revs.data || []).map((row) => row.id);
  let items = [];
  if (revisionIds.length) {
    // ⚠️ ลิสต์นี้โตตามจำนวนฉบับของสินค้าตัวเดียว — หลักสิบ ไม่ใช่หลักพัน
    //    (เพดาน 16 KB ของ PostgREST ยังห่างมาก · memory: postgrest-16kb-filter)
    const res = await supabase.from('product_spec_revision_items').select('*')
      .in('revisionId', revisionIds).order('sortOrder', { ascending: true });
    if (res.error) return { error: res.error.message };
    items = res.data || [];
  }
  const itemsByRevision = new Map();
  for (const row of items) {
    if (!itemsByRevision.has(row.revisionId)) itemsByRevision.set(row.revisionId, []);
    itemsByRevision.get(row.revisionId).push(row);
  }
  return {
    spec,
    revisions: (revs.data || []).map((row) => ({ ...row, items: itemsByRevision.get(row.id) || [] })),
    issues: issues.data || [],
  };
}

export const latestRevisionOf = (revisions = []) => revisions[0] || null;

export const approvedRevisionOf = (revisions = []) => revisions
  .find((row) => row.status === 'approved') || null;

/** สร้างใบ + ฉบับ Rev.01 + checklist 17 แถว (ยกค่าจากฉบับก่อนถ้าส่งมา) */
export async function createSpecRevision(supabase, {
  specId, revNo, previousItems = [], content = {}, user,
}) {
  const revisionId = genId('PSR');
  const payload = {
    id: revisionId,
    specId,
    revNo,
    status: 'draft',
    createdBy: user?.id || null,
    createdByName: user?.name || null,
  };
  for (const field of SPEC_CONTENT_FIELDS) {
    if (content[field] !== undefined) payload[field] = content[field];
  }
  const { data, error } = await supabase
    .from('product_spec_revisions').insert(payload).select('*').maybeSingle();
  if (error) return { error: error.message };

  const seed = productSpecChecklistSeed(previousItems).map((row) => ({
    id: genId('PSI'),
    revisionId,
    ...row,
  }));
  const itemsRes = await supabase.from('product_spec_revision_items').insert(seed);
  if (itemsRes.error) return { error: itemsRes.error.message };
  return { revision: { ...data, items: seed } };
}

/** ออกเอกสารหนึ่งครั้ง — RPC ออกเลขพร้อม INSERT ในคำสั่งเดียว */
export async function issueProductSpec(supabase, { specId, snapshot, user, now = new Date() }) {
  const { month, prefix, like, width } = productSpecDocNoParts(now);
  const { data, error } = await supabase.rpc('create_product_spec_issue', {
    p_issue_id: genId('PSD'),
    p_spec_id: specId,
    p_month: month,
    p_prefix: prefix,
    p_like: like,
    p_width: width,
    p_payload: {
      ...snapshot,
      createdBy: user?.id || null,
      createdByName: user?.name || null,
    },
  });
  if (error) return { error: error.message };
  return { issue: data };
}

/**
 * ซิงก์สองช่องสเปกถาวรลงทะเบียนสินค้า — เรียกตอน **อนุมัติ** เท่านั้น
 *
 * ⚠️ ไม่ใช่ตอนพิมพ์ในฟอร์ม — ไม่งั้นทะเบียนเดินตามฉบับร่างที่ยังไม่มีใครรับรอง
 * ⚠️ ล้มเหลวที่นี่ **ไม่ล้มการอนุมัติ** — ฉบับที่อนุมัติแล้วคือความจริง ส่วนกระจก
 *    ในทะเบียนซ่อมได้ทีหลัง · แต่ต้องคืนข้อความเตือนขึ้นไปให้จอบอก ไม่ใช่เงียบ
 */
export async function syncProductSpecMirror(supabase, { productId, revision }) {
  const { error } = await supabase.from('products').update({
    texture: revision.texture ?? null,
    standardPackaging: revision.standardPackaging ?? null,
    updatedAt: new Date().toISOString(),
  }).eq('id', productId);
  return error ? { warning: `อนุมัติแล้ว แต่ซิงก์สเปกลงทะเบียนสินค้าไม่สำเร็จ: ${error.message}` } : {};
}
