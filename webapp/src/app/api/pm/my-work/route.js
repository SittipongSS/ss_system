import { normalizeDepartment, pmTaskScopes, defaultScope, can } from '@/lib/permissions';
import { canQuoteMaterial } from '@/lib/materialPrices';
import { REQUEST_OPEN_STATUSES } from '@/lib/deptRequests';
import { withUser, ok, unauthorized, forbidden } from '@/lib/http';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { attachReworkRows } from '@/lib/requests/reworkRows';
import { loadTaskScopeClauses, whereForTaskClause } from '@/lib/pm/taskScope';
import { idListParam, idParam } from '@/lib/pm/dealTaskLink';
import { loadRequests } from '@/lib/materialPricesAdmin';
import { loadVisibleRequests, answerableDepts } from '@/lib/requests/visibleRows';
import { deptHasOwnModule, deptsInSharedQueue } from '@/lib/requests/modules';
import { inquiryQueueCount, inquiryQueueHref } from '@/lib/pm/inquiryQueueLink';

export const dynamic = 'force-dynamic';

/* ── ตัวช่วยของไฟล์นี้: อ่านงานให้ครบทุกแถว ─────────────────────────────────
   🐞 เพดาน Max rows = 1000 ของ PostgREST ตัดผลลัพธ์เงียบ ๆ ⇒ ต้องไล่ทีละหน้า
   ⚠️ คืน `{ data, error }` เหมือน query เดิม — ผู้เรียกในไฟล์นี้ยอมให้ error เงียบแล้ว
   ปล่อยลิสต์ว่าง ซึ่งเป็นพฤติกรรมเดิมที่ไม่ได้ตั้งใจเปลี่ยนในงานนี้

   🪤 **เคยดึง `project_tasks` ทั้งตารางที่นี่ด้วย — ถอดออกแล้ว (egress)**
   จอเดียวที่เรียก route นี้คือ `app/pm/tasks/page.js` ซึ่งเลิกอ่าน `projectTasks`
   ไปตั้งแต่ cb3f37a0 ("หน้างานเป็นรายการเดียวจาก personal_tasks") แต่ฝั่ง server
   ยังดึงต่ออีกหลายเดือน · `scope=all` = 4,653 แถว × `select('*')` = 3.45 MB
   ต่อการเปิดหน้าหนึ่งครั้ง ที่ไม่มีใครอ่าน
   ถ้าจะเอากลับมา ต้องเอากลับ **สองสาขา** ไม่ใช่สาขาเดียว: `projectId` (งานผูก
   โครงการ) และ `dealId` (ไทม์ไลน์ลอยของดีลที่ยังไม่ผูกโครงการ — DL1 ใน
   lib/pm/status.js) · กรองด้วย `projectId` ล้วนเคยทำงาน 81 แถวบน production
   หายจากสายตาหัวหน้าทีมมาแล้ว (2026-08-22) */

/* งานส่วนตัวเรียงตาม `createdAt` (ไม่มี `stepOrder`) — พ่วง `id` ด้วยเหตุผลเดียวกัน
   `personal_tasks` = 1,045 แถวตอนพบบั๊ก จึงเกินเพดานแล้วเช่นกัน */
const allPersonal = (supabase, where = (q) => q) => fetchAllResult(() => where(
  supabase.from('personal_tasks').select('*'),
).order('createdAt', { ascending: false }).order('id', { ascending: true }));

// GET /api/pm/my-work?scope=mine|team|all[&dealId=a,b][&projectId=p]
// คืน { scope, personalTasks, inquiries, inquiryQueue, projects, deals } — scope ถูกบังคับตาม role
// ฝั่ง server. งานส่วนตัว = ของฉันเสมอ (ไม่ปนของคนอื่นแม้ scope ทีม/ทั้งหมด).
// ⭐ `dealId` / `projectId` **ไม่ได้กรองงาน** — แค่การันตีว่าดีล/โครงการที่ลิงก์จากหน้าดีล/หน้าโครงการส่งมามีอยู่ใน
//    แผนที่ `deals`/`projects` (พร้อม `projectId` ของดีล) แม้ยังไม่มีงานสักใบผูกตรง ๆ — ตัวกรองดีลของคิว (`isDealTask`)
//    ต้องรู้โครงการของดีลถึงจะนับงานเดิมของโครงการ (ไม่มี dealId) ได้ตรงกับป้าย "ค้าง n" บนหน้าดีล (M8b/M8c)
export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!can(user.role, 'pm:view')) return forbidden(); // PM เป็นเครื่องมือฝ่ายขาย — RA ไม่มีสิทธิ์

  const allowed = pmTaskScopes(user.role);
  // ค่าตั้งต้นมาจากตัวกลาง `defaultScope` = แคบสุดที่ไม่ว่างโดยโครงสร้าง (มติผู้ใช้
  // 2026-09-08) — ตัวเดียวกับที่จอใช้ ⇒ จอกับ API ตอบตรงกันตั้งแต่รอบแรก ไม่ต้องรอ
  // ให้ API แก้ค่าให้แล้วโหลดซ้ำ · ผู้สังเกตการณ์มีขอบเขตเดียวคือ 'all' จึงไม่ตกไป 'mine'
  const searchParams = new URL(req.url).searchParams;
  const requested = searchParams.get('scope');
  const scope = allowed.includes(requested) ? requested : defaultScope(allowed, user, 'tasks');
  const facetDealIds = idListParam(searchParams.get('dealId'));
  const facetProjectId = idParam(searchParams.get('projectId'));

  // ── งาน personal_tasks (ระบบติดตามงาน — ผู้มีสิทธิ์ต้องเห็น "งาน" ทั้งหมดในขอบเขต) ──
  //   • mine = งานที่ฉันเป็นเจ้าของ ถูกมอบหมายให้ฉัน ดึงมาทำแทน (proxyBy) หรือฉันมอบหมาย (assignedBy)
  //   • team = งานทุกงานที่คนในทีมฉันเป็นเจ้าของ/ผู้รับมอบ + งานที่ผูกโครงการ/ดีลของทีม
  //   • all  = ทุกงานในระบบ (admin / sales head ติดตามได้ทุกทีม — วัดผลได้)
  // เดิม team/all ดึงเฉพาะงานที่ "มอบหมาย/ผูกโครงการ" ทำให้งานที่ผู้ใช้สร้างให้ตัวเอง
  // (ไม่มอบหมาย + ไม่ผูกโครงการ เช่นผูกแค่ดีลหรือไม่ผูกเลย) หลุดจากสายตา admin — แก้แล้ว.
  /* ⭐ นิยามขอบเขตย้ายไป `lib/pm/taskScope.js` (ตรวจตัวเลข M8b · 20/10/2026) — ป้าย "ค้าง n" บนหน้าดีลต้องนับแถว
     ชุดเดียวกับที่คิวนี้โหลด ⇒ ทั้งสองที่เรียกตัวโหลดตัวเดียวกัน ไม่ใช่คัดลอกกติกาไปเขียนซ้ำ
     ⚠️ พฤติกรรมเดิมทุกสาขา: "ทั้งหมด" รับ error (supabase ไม่ throw — ทิ้ง error = แดชบอร์ดขาดงานเงียบ ๆ) ·
        สาขาอื่นยังกลืน error เป็นลิสต์ว่างเหมือนเดิม (ไม่ได้ตั้งใจเปลี่ยนในงานนี้) · ตัดการโหลดสี่สาขา "ของฉัน"
        ที่เดิมยิงทุกขอบเขตแล้วทิ้งเมื่อไม่ใช่ "ของฉัน" (ผลบนจอเท่าเดิม) */
  const clauses = await loadTaskScopeClauses(supabase, user, scope);
  let scopedPersonal = [];
  if (clauses === null) {
    const { data, error } = await allPersonal(supabase);
    if (error) throw error;
    scopedPersonal = data || [];
  } else {
    const results = await Promise.all(clauses.map((clause) => allPersonal(supabase, whereForTaskClause(clause))));
    scopedPersonal = results.flatMap((r) => r.data || []);
  }
  const seenP = new Set();
  const personalTasks = (scopedPersonal || [])
    .filter((t) => (seenP.has(t.id) ? false : seenP.add(t.id)));

  // ── คำร้องข้ามฝ่ายที่ค้างอยู่ของฝ่ายฉัน (mig 0173): คิวเดียวกับงาน ──
  // "เก็บแยก โชว์รวม": เรื่องที่ยังไม่ปิดของฝ่ายฉันขึ้นในงานของฉัน จะได้เปิดหน้าเดียว
  // เห็นทุกอย่างที่ต้องทำ (ตอบที่ /sa/requests/[id])
  //
  // ⚠️ เดิมดึงจากตาราง inquiries และกั้นด้วย cap inquiries:respond ซึ่งมีแต่ role rd
  // → ฝ่ายจัดซื้อ (PC) ไม่เคยเห็นคิวของตัวเองในหน้านี้เลยทั้งที่มีงานรออยู่จริง
  // ตอนนี้ทั้งสองฝ่ายใช้ตารางเดียวกัน จึงกั้นด้วย "ตอบคำร้องของฝ่ายนี้ได้ไหม" แทน
  let inquiries = [];
  let inquiryQueue = null;
  {
    const myDept = normalizeDepartment(user.department);
    if (myDept && canQuoteMaterial(user, myDept)) {
      let requestQuery = supabase
        .from('dept_requests').select('*')
        .eq('dept', myDept).in('status', REQUEST_OPEN_STATUSES);
      // "ของฉัน" = ที่ฉันรับเรื่องไว้ + ที่ยังไม่มีใครรับ (ยังเป็นงานของทุกคนในฝ่าย)
      if (scope === 'mine') {
        requestQuery = requestQuery.or(`acknowledgedById.eq.${user.id},acknowledgedById.is.null`);
      }
      const { data, error } = await requestQuery.order('committedDueDate', { ascending: true });
      if (error) throw error;
      // ⚠️ เหตุผลเดียวกับ `/api/sales-planning/my-schedule` — ป้าย "เลยกำหนด" ของจอนี้
      // ต้องไม่นับวันของรอบที่ส่งไปแล้ว (ดู lib/requests/reworkRows.js)
      inquiries = await attachReworkRows(supabase, data || []);
      /* ⭐ ป้าย "n รอตอบ" + ลิงก์ "ดูทั้งหมด" = แท็บ "รอตอบ" ของคิวปลายทาง (ตรวจตัวเลข M8d · 20/10/2026)
         🐞 เดิมป้ายนับใบเปิดของฝ่าย (ที่ฉันรับไว้/ยังไม่มีใครรับ) แล้วลิงก์ไป `/requests` ซึ่ง **ไม่มีคิวของ RD เลย**
            (`deptsInSharedQueue` ตัดฝ่ายที่มีโมดูลของตัวเองทิ้ง) ⇒ กดแล้วไม่เจอสักใบจาก n ใบ
         ⇒ ปลายทาง = คิวในบ้านของฝ่าย (`/rd/requests?tab=todo`) หรือคิวรวม (`/requests?tab=todo`) · นับด้วยตัวตัดสินของแท็บนั้น
            บนแถวชุดเดียวกับที่หน้านั้นโหลด (คิวฝ่าย = ตัวโหลดเดียวกับป้ายเมนู `deptRequestsTodoCount` · คิวรวม = ขอบเขต "ของฉัน")
         ⚠️ ลิสต์ 8 แถวข้างล่างยังเป็นตัวอย่างของ "ที่ฉันรับไว้/ยังไม่มีใครรับ" ตามเดิม — ป้ายเป็นของลิงก์ ไม่ใช่ของลิสต์
         ⚠️ คำนวณเฉพาะตอนมีแถวให้โชว์ (บล็อกนี้ขึ้นจอเฉพาะตอน `inquiries` ไม่ว่าง) — ไม่ยิงโหลดเพิ่มให้คนที่ไม่เห็นบล็อก
         🔴 ตัวนับห้ามล้มทั้ง route — `loadRequests`/`loadVisibleRequests` **throw** เมื่อ PostgREST ตอบ error (`fetchAll`)
            และ `withUser` ไม่จับ ⇒ ป้ายตัวเดียวพังแล้วจอได้ 500 → `loadWork` อ่านเป็น `{}` → คิวงานทั้งหน้าว่าง ("ยังไม่มีงาน")
            ⇒ นับไม่ได้ = `count: null` (จอไม่โชว์เลข — ไม่ใช่ 0 ที่อ่านว่า "ไม่มีค้าง") · ลิงก์ยังพาไปคิวที่ถูกได้ (ไม่แตะ DB) */
      if (inquiries.length) {
        inquiryQueue = { href: inquiryQueueHref(myDept), count: null };
        try {
          const rows = deptHasOwnModule(myDept)
            ? await loadRequests(supabase, { dept: myDept, lean: true })
            : (await loadVisibleRequests(supabase, user, { scopeParam: 'mine', lean: true })).rows;
          inquiryQueue.count = inquiryQueueCount(rows, { dept: myDept, myDepts: deptsInSharedQueue(answerableDepts(user)) });
        } catch (countError) {
          console.warn('[my-work] inquiry queue count failed:', countError?.message || countError);
        }
      }
    }
  }

  // ── projects map สำหรับแสดงรหัส/ชื่อ (รวมโครงการที่งานเพิ่มเติมผูกไว้ด้วย) ──
  const projIds = [...new Set([...personalTasks.map((t) => t.projectId).filter(Boolean), facetProjectId].filter(Boolean))];
  let projects = {};
  if (projIds.length) {
    const { data: ps } = await supabase
      .from('projects').select('id, code, name, aeOwner, team, customerName').in('id', projIds);
    projects = Object.fromEntries((ps || []).map((p) => [p.id, p]));
  }

  // ── deals map สำหรับงานที่ผูกดีล ──
  // ⚠️ `projectId` ต้องมาด้วย — ตัวกรองดีลของคิวตัดสินงานเดิมของโครงการ (ไม่มี dealId) จากโครงการของดีล (`isDealTask`)
  const dealIds = [...new Set([...personalTasks.map((t) => t.dealId).filter(Boolean), ...facetDealIds])];
  let deals = {};
  if (dealIds.length) {
    const { data: ds } = await supabase
      .from('sales_deals').select('id, title, customerName, team, stage, projectId').in('id', dealIds);
    deals = Object.fromEntries((ds || []).map((d) => [d.id, d]));
  }

  return ok({
    scope,
    allowedScopes: allowed,
    me: { id: user.id, name: user.name, role: user.role, team: user.team ?? null, teams: user.teams ?? [], department: normalizeDepartment(user.department) },
    personalTasks: personalTasks || [],
    inquiries,
    inquiryQueue,
    projects,
    deals,
  });
});
