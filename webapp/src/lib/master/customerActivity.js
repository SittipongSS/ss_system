// ── หน้าลูกค้าศูนย์รวม · ความเคลื่อนไหวรวม (งวด H3 · มติเจ้าของ 13/11/2026 ข้อ 7 · docs/customer-hub-plan.md) ─────
//
// รวมเธรด (`entity_updates`) ของทุกอย่างที่เป็นของลูกค้ารายนี้ไว้ในเส้นเดียว เรียงใหม่ไปเก่า โหลดเพิ่มทีละ 50:
//   ลูกค้า · ดีลของลูกค้า (รวมเหตุการณ์ QT/SO ที่ลงเธรดดีล) · คำร้อง · ลีดที่เปิดเป็นดีล · ทะเบียนสรรพสามิต
//
// 🔴 **สิทธิ์อ่านมาจากทะเบียนเธรดตัวเดียว** (`UPDATE_ENTITIES[...].canView` · lib/master/updateAccess.js) —
//    ด่านเดียวกับ GET /api/updates รายใบทุกตัวอักษร · ห้ามเขียนด่านใหม่ที่นี่ ไม่งั้นหน้ารวมเห็นมากกว่าใบ
//    (เปิดใบไม่ได้แต่อ่านเธรดผ่านหน้าลูกค้าได้ = รั่ว) หรือน้อยกว่า (หาย)
// ⚠️ แถวที่ถูกลบผ่าน `redactDeleted` เหมือนเธรดรายใบ (เหลือแต่รอย)
// ⚠️ `.in()` ซอยก้อนเสมอ (PostgREST 16 KB) · ทุก query มี `.limit()` (ไม่ไล่ทั้งตาราง)
import { UPDATE_ENTITIES } from '@/lib/master/updateAccess';
import { redactDeleted } from '@/lib/master/updateTypes';
import { canViewSalesPlanning } from '@/lib/salesPlanning';
import { canViewLeads } from '@/lib/sales/leads';
import { canViewRequests, can } from '@/lib/permissions';
import { fetchAll } from '@/lib/supabaseFetchAll';
import { fetchAllInChunks, IN_CHUNK_SIZE } from '@/lib/supabaseInChunks';

export const ACTIVITY_PAGE_SIZE = 50;
export const ACTIVITY_SOURCES = ['customer', 'deal', 'dept_request', 'lead', 'excise_registration'];

// ⚠️ ชุดคอลัมน์เป็นค่าคงที่ระดับไฟล์ (ไม่ใช่ช่องของอ็อบเจกต์) — check:columns แกะได้แค่รูปนี้ ไม่งั้นชื่อผิดไม่มีใครเทียบกับฐาน
const DEAL_PARENT_COLS = 'id, code, title, team, ownerId, leadId, customerId, createdAt';
const REQUEST_PARENT_COLS = 'id, docNo, title, dept, kind, status, requestedById, team, customerId, closedAt, createdAt';
const LEAD_PARENT_COLS = 'id, company, contactName, team, assigneeId, createdBy, createdAt';
const REGISTRATION_PARENT_COLS = 'id, fgCode, productName, team, ownerId, customerId, createdAt';

const byCustomer = (supabase, table, cols, customerId) => fetchAll(() => supabase
  .from(table).select(cols).eq('customerId', customerId)
  .order('createdAt', { ascending: false }).order('id', { ascending: true }));

async function keepVisible(supabase, type, rows, user) {
  const conf = UPDATE_ENTITIES[type];
  const out = [];
  for (const row of rows) if (await conf.canView(supabase, row, user)) out.push(row);
  return out;
}

/** ต้นทางของเธรดทุกชนิดที่ผู้ดูเปิดอ่านได้ — `{ customer, deal[], dept_request[], lead[], excise_registration[] }` */
export async function activityParents(supabase, customer, user) {
  const customerId = customer.id;
  const [deals, requests, registrations] = await Promise.all([
    canViewSalesPlanning(user) ? byCustomer(supabase, 'sales_deals', DEAL_PARENT_COLS, customerId) : [],
    canViewRequests(user) ? byCustomer(supabase, 'dept_requests', REQUEST_PARENT_COLS, customerId) : [],
    can(user?.role, 'history:view') ? byCustomer(supabase, 'excise_registrations', REGISTRATION_PARENT_COLS, customerId) : [],
  ]);
  // ลีดขึ้นผ่านดีลที่ผูกลีดเท่านั้น (มติ 3) — ลีดของดีลที่ผู้ดูเห็นได้ แล้วค่อยผ่านด่านลีดอีกชั้น
  const visibleDeals = await keepVisible(supabase, 'deal', deals, user);
  const leadIds = [...new Set(visibleDeals.map((d) => d.leadId).filter(Boolean))];
  const leads = leadIds.length && canViewLeads(user)
    ? await fetchAllInChunks(leadIds, (chunk) => supabase.from('sales_leads').select(LEAD_PARENT_COLS).in('id', chunk).order('id', { ascending: true }))
    : [];
  return {
    customer: (await UPDATE_ENTITIES.customer.canView(supabase, customer, user)) ? customer : null,
    deal: visibleDeals,
    dept_request: await keepVisible(supabase, 'dept_request', requests, user),
    lead: await keepVisible(supabase, 'lead', leads, user),
    excise_registration: await keepVisible(supabase, 'excise_registration', registrations, user),
  };
}

const idsOf = (parents, type) => (type === 'customer' ? (parents.customer ? [parents.customer.id] : []) : (parents[type] || []).map((r) => r.id));

/** เคอร์เซอร์ = "createdAt|id" ของแถวสุดท้ายที่ส่งไปแล้ว · พังรูป = เริ่มหน้าแรก */
export function parseCursor(value) {
  const [at, id] = String(value || '').split('|');
  return at && id && Number.isFinite(Date.parse(at)) ? { at, id } : null;
}
export const cursorOf = (row) => (row ? `${row.createdAt}|${row.id}` : null);
const newer = (a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : (a.createdAt < b.createdAt ? 1 : -1));
const beforeCursor = (row, cursor) => !cursor || row.createdAt < cursor.at || (row.createdAt === cursor.at && row.id < cursor.id);

/**
 * หน้าหนึ่งของความเคลื่อนไหวรวม
 * ⭐ ไล่เคอร์เซอร์ด้วย `createdAt <= เคอร์เซอร์` แล้วตัดแถวที่เวลาเท่ากันแต่ id ไม่น้อยกว่าทิ้งฝั่งนี้ (เหตุการณ์ระบบหลายแถว
 *    ในทรานแซกชันเดียวเวลาชนกันได้) · ขอเกินมา (limit + 20) ต่อก้อน ให้การตัดไม่ทำหน้าขาด
 * @returns {{ items: object[], nextCursor: string|null }}
 */
export async function loadActivityPage(supabase, parents, { source = 'all', before = null, limit = ACTIVITY_PAGE_SIZE } = {}) {
  const cursor = parseCursor(before);
  const types = source === 'all' ? ACTIVITY_SOURCES : ACTIVITY_SOURCES.filter((t) => t === source);
  const fetchSize = limit + 20;
  const rows = [];
  for (const type of types) {
    const ids = idsOf(parents, type);
    for (let i = 0; i < ids.length; i += IN_CHUNK_SIZE) {
      let query = supabase.from('entity_updates').select('*')
        .eq('entityType', type).in('entityId', ids.slice(i, i + IN_CHUNK_SIZE));
      if (cursor) query = query.lte('createdAt', cursor.at);
      const { data, error } = await query.order('createdAt', { ascending: false }).order('id', { ascending: false }).limit(fetchSize);
      if (error) throw new Error(`อ่านความเคลื่อนไหวไม่สำเร็จ: ${error.message}`);
      rows.push(...(data || []).filter((r) => beforeCursor(r, cursor)));
    }
  }
  const sorted = rows.sort(newer);
  const items = sorted.slice(0, limit).map(redactDeleted);
  return { items, nextCursor: sorted.length > limit ? cursorOf(items[items.length - 1]) : null };
}

/** จำนวนแถวต่อแหล่ง (ชิปบนแท็บ) — นับเฉพาะหน้าแรก · ยอด "ทั้งหมด" = ผลรวม */
export async function activityCounts(supabase, parents) {
  const out = {};
  for (const type of ACTIVITY_SOURCES) {
    const ids = idsOf(parents, type);
    let total = 0;
    for (let i = 0; i < ids.length; i += IN_CHUNK_SIZE) {
      const { count, error } = await supabase.from('entity_updates').select('id', { count: 'exact', head: true })
        .eq('entityType', type).in('entityId', ids.slice(i, i + IN_CHUNK_SIZE));
      if (error) throw new Error(`นับความเคลื่อนไหวไม่สำเร็จ: ${error.message}`);
      total += count || 0;
    }
    out[type] = total;
  }
  out.all = ACTIVITY_SOURCES.reduce((s, t) => s + out[t], 0);
  return out;
}

/** ป้ายต้นทางของแถว (ชนิด · รหัส · ชื่อ · ลิงก์) — จอวาดชิปต้นทางจากตัวนี้ */
export function activitySources(parents) {
  const map = {};
  if (parents.customer) map[`customer:${parents.customer.id}`] = { type: 'customer', code: parents.customer.arCode || null, title: 'ลูกค้ารายนี้', href: null };
  for (const d of parents.deal || []) map[`deal:${d.id}`] = { type: 'deal', code: d.code, title: d.title, href: `/sa/deals/${d.id}` };
  for (const r of parents.dept_request || []) map[`dept_request:${r.id}`] = { type: 'dept_request', code: r.docNo, title: r.title, href: `/requests/${r.id}` };
  for (const l of parents.lead || []) map[`lead:${l.id}`] = { type: 'lead', code: null, title: l.company || l.contactName, href: `/sa/leads/${l.id}` };
  for (const e of parents.excise_registration || []) map[`excise_registration:${e.id}`] = { type: 'excise_registration', code: e.fgCode, title: e.productName, href: `/go/registration/${e.id}` };
  return map;
}
