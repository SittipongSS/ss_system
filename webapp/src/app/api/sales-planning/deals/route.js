import { genId } from '@/lib/id';
import { generateEntityCode } from '@/lib/entityCode';
import { recordAudit } from '@/lib/audit';
import { autoProbability } from '@/lib/sales/dealProbability';
import { ownerLockedToSelf, validateDealOwner } from '@/lib/sales/dealOwner';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import {
  applyDealScope,
  canCreateDeal,
  canEditSalesPlanning,
  canViewSalesPlanning,
  dealAuditLabel,
  forecastAmount,
  inSalesEditScope,
  inSalesViewScope,
  monthKey,
  normalizeDealType,
  normalizeStage,
  toMoney,
  toProbability,
} from '@/lib/salesPlanning';
import { loadForecastDriftMap } from '@/lib/salesPlanningForecast';
import { buildDealTimelineRows, summarizeTimelineStep } from '@/lib/sales/dealTimelineGen';
import { isYearValue, monthRangeOfYear } from '@/lib/datePeriods';
import { isSuperuser } from '@/lib/permissions';
import { LEAD_TRANSITIONS, LEAD_STATUS_LABELS, sourceLeadIdOf, inLeadScope } from '@/lib/sales/leads';
import { activeProductTypeError } from '@/lib/master/productTypes';

export const dynamic = 'force-dynamic';

const selectDeal = `
  *,
  customer:customers(id, name, arCode)
`;

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const params = new URL(req.url).searchParams;
  const stage = params.get('stage');
  const month = monthKey(params.get('month'));
  // year=YYYY = "ทุกเดือนของปีนั้น" (ติ๊ก "ทุกเดือน" บน MonthPicker) — เดิมหน้าดีล
  // ตัดตัวกรองทิ้งทั้งก้อนแล้วดึงมาทุกปี ตัวเลขจึงไม่ตรงกับปีที่ค้างบนปุ่ม
  const year = isYearValue(params.get('year')) ? params.get('year') : null;

  let query = supabase
    .from('sales_deals')
    .select(selectDeal)
    .order('updatedAt', { ascending: false });
  query = applyDealScope(query, user);
  if (stage && stage !== 'all') query = query.eq('stage', normalizeStage(stage));
  if (month) query = query.eq('forecastMonth', month);
  else if (year) {
    const range = monthRangeOfYear(year);
    query = query.gte('forecastMonth', range.first).lte('forecastMonth', range.last);
  }

  const { data, error } = await query;
  if (error) return fail(error.message, 500);

  // Per-row edit flag so the UI hides actions that would 403 (AE sees the whole
  // team's pipeline but may only act on its own deals).
  const editor = canEditSalesPlanning(user);
  const driftMap = await loadForecastDriftMap(supabase, data || []).catch(() => new Map());
  const visible = (data || []).filter((d) => inSalesViewScope(user, d));

  /* ขั้นตอนปัจจุบันตามไทม์ไลน์ต่อดีล (คอลัมน์ "ขั้นตอน" — มติผู้ใช้ 2026-08-08)
     ดึง task ของทุกดีลที่เห็นในคำขอเดียวแล้วสรุปฝั่ง server — task ที่ถูกรับเลี้ยง
     เข้าโครงการแล้วยังถือ dealId เดิม (DL1) จึงตามด้วย dealId ได้ทั้งสองกรณี
     เลือกเฉพาะคอลัมน์ที่ใช้สรุป: ทั้งลิสต์คือหลักพันแถว อย่า select '*' */
  const stepMap = new Map();
  if (visible.length) {
    const { data: taskRows } = await supabase
      .from('project_tasks')
      .select('dealId, name, status, stepOrder')
      .in('dealId', visible.map((d) => d.id))
      .order('stepOrder', { ascending: true });
    for (const task of taskRows || []) {
      if (!stepMap.has(task.dealId)) stepMap.set(task.dealId, []);
      stepMap.get(task.dealId).push(task);
    }
  }

  const rows = visible.map((d) => ({
    ...d,
    canEdit: editor && inSalesEditScope(user, d),
    forecastDrift: driftMap.get(d.id) || null,
    timelineStep: summarizeTimelineStep(stepMap.get(d.id)),
  }));
  return ok(rows);
});

export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  // สร้างดีลได้เฉพาะ AE/Senior AE (+ superuser กำกับดูแล) — AC เปิดดีลไม่ได้ (มติผู้ใช้)
  if (!canCreateDeal(user)) return forbidden('เปิดดีลได้เฉพาะ AE / AC / Senior AE');

  const body = await req.json();
  if (!body.title?.trim()) return badRequest('ต้องระบุชื่อดีล');
  const categoryCode = (body.categoryCode || '').trim() || null;
  const categoryError = await activeProductTypeError(categoryCode);
  if (categoryError) return badRequest(categoryError);

  /* ผู้รับผิดชอบ (AE) — ดีลเป็นหน้าที่ของ ae/senior_ae (มติผู้ใช้ 2026-08-08)
     ⚠️ ห้ามเชื่อ body: `ownerName` เป็นสตริงอิสระที่ถูกเก็บเป็น snapshot แล้วโชว์บน
     ตาราง/KPI และ `ownerId` มั่ว ๆ จะได้ดีลที่เจ้าของแตะไม่ได้ (ดู lib/sales/dealOwner.js)
     ae/senior_ae ไม่ระบุ = ตัวเองเป็นเจ้าของ (ฟอร์มล็อกชื่อตัวเองอยู่แล้ว)
     ส่วน ac / ae_supervisor / admin ปล่อยว่างไม่ได้ — ดีลจะตกเป็นของผู้ประสาน/
     ผู้กำกับเงียบ ๆ แล้วไม่มี AE คนไหนเห็นมันในคิว "ของฉัน" เลย */
  if (!body.ownerId && !ownerLockedToSelf(user.role)) {
    return badRequest('ต้องเลือกผู้รับผิดชอบ (AE) ของดีลนี้');
  }
  let owner = null;
  if (body.ownerId) {
    const checked = await validateDealOwner(supabase, body.ownerId, user);
    if (!checked.ok) return badRequest(checked.error);
    owner = checked;
  }

  let customerName = body.customerName || null;
  if (body.customerId) {
    const { data: customer } = await supabase
      .from('customers')
      .select('id, name')
      .eq('id', body.customerId)
      .maybeSingle();
    customerName = customer?.name || customerName;
  }

  // ลีดต้นทาง: ตัดสินครั้งเดียวจากทั้งสองช่อง แล้วใช้ค่านี้ทั้งด่านตรวจสิทธิ์และคอลัมน์
  // (ดูเหตุผลเต็มที่ sourceLeadIdOf) — ห้ามอ่าน body.leadId / metadata.leadId ตรง ๆ อีก
  const leadSource = sourceLeadIdOf(body);
  if (leadSource.error) return badRequest(leadSource.error);
  const sourceLeadId = leadSource.leadId;

  let stage = normalizeStage(body.stage);
  // in_project ถูกยุบเป็น won แล้ว (mig 0082 ตัดออกจาก CHECK) — กัน insert พัง 500
  // ถ้า client ยังส่งค่าเก่ามา ให้ถือเป็น won.
  if (stage === 'in_project') stage = 'won';
  // ปิด Won ตอนสร้างดีลต้องผ่านเงื่อนไขเดียวกับ win-flow: มัดจำ + มูลค่าปิดจริง>0 (M5)
  // ⚠️ ยกเว้น **ดีลเก่าจากระบบเดิม** (มติผู้ใช้ 2026-08-08 — สวิตช์เปิดถาวรทุกคน):
  // ช่วงย้ายระบบมีดีลที่ Won ไปแล้วในระบบเก่าและต้องมาติดตามงานต่อ — ติดธง
  // `metadata.legacy` แล้วสร้างที่ Won ได้เลย · wonValue/confirmedAt คงเป็น null
  // (ยอดจริงมาจากใบสั่งขายที่จะผูกภายหลัง ตามมติ Won = Actual เดิม — ไม่ปั้นตัวเลข)
  if (stage === 'won' && !body.metadata?.legacy) {
    return badRequest('สร้างดีลเป็น Won โดยตรงไม่ได้ ต้องปิด Won ผ่านใบเสนอราคา — ยกเว้นดีลเก่าจากระบบเดิม (เปิดสวิตช์ในฟอร์ม)');
  }
  // รหัสดีลฐาน DL-YYMMXXXX (atomic ต่อเดือน — mig 0096). แสดง DL-YYMMXXXX-0 ที่ UI/เอกสาร.
  const dealCode = await generateEntityCode(supabase, 'DL');
  const row = {
    id: genId('DEAL'),
    code: dealCode,
    customerId: body.customerId || null,
    customerName,
    title: body.title.trim(),
    stage,
    projectValue: toMoney(body.projectValue),
    // ดีลเก่าที่สร้างเป็น Won (ผ่านธง legacy เท่านั้น — ด่านข้างบน): ฟอร์มส่งช่อง
    // "มูลค่าที่ปิด" มาในคีย์ projectValue เดิม → เข้า wonValue เป็นยอดจริงทันที
    // (metadata.actualSource = 'legacy' ข้างล่างคือตัวปลดให้ dashboard อ่านค่านี้)
    wonValue: stage === 'won' ? toMoney(body.projectValue) : null,
    // FC% มาจากกติกา ไม่ใช่จากฟอร์ม (มติผู้ใช้ 2026-08-05)
    // 🐞 ค่าตั้งต้นของฟอร์มคือ "50" มาตลอด ทั้งที่ขั้นตั้งต้นคือ 'lead' ⇒ ดีลใหม่ทุกใบ
    // เกิดมาที่ 50% ทั้งที่ยังไม่มีใบเสนอราคาสักใบ (ระดับ 50 = ออกใบเสนอราคาแล้ว)
    // ดีลตอนสร้างยังไม่ผูกโครงการ (POST ไม่รับ projectId — ผูกทีหลังที่ link-project
    // ซึ่งคิด FC ใหม่ให้) จึงไม่ต้องหาพี่น้อง SCENT ตรงนี้
    probability: autoProbability({ stage, dealType: normalizeDealType(body.dealType ?? body.projectType ?? body.metadata?.projectType) }),
    // เดือน FC อนุมานจากวันที่คาดปิดเสมอ (มติผู้ใช้ 2026-07-16 — ฟอร์มไม่มีช่องเดือนแล้ว
    // และไม่รับค่าจาก client); ไม่ระบุวันที่คาดปิด → ตกเป็นเดือนปัจจุบัน (default เดิมของฟอร์ม)
    forecastMonth: monthKey(body.expectedCloseDate) || monthKey(new Date().toISOString()),
    expectedCloseDate: body.expectedCloseDate || null,
    // ดีลเก่า Won: ช่อง "วันที่ปิด" (ส่งมาในคีย์ expectedCloseDate) = วันที่ปิดจริง
    // ในระบบเดิม → ลง confirmedAt ให้ wonMonthOf นับยอดเข้าเดือนนั้นย้อนหลังได้
    confirmedAt: stage === 'won' ? (body.expectedCloseDate || null) : null,
    lostReason: stage === 'lost' ? (body.lostReason || null) : null,
    notes: body.notes || null,
    ownerId: owner?.ownerId || user.id || null,
    // ชื่อมาจาก server เสมอเมื่อมีการเลือกเจ้าของ — ไม่รับ body.ownerName อีก
    ownerName: owner?.ownerName || user.name || null,
    // ทีมตามเจ้าของ ไม่ใช่ตามคนกด — ไม่งั้นดีลที่ AC มอบให้ AE ทีมอื่นจะติดทีมของ AC
    // (เจ้าของมองไม่เห็นดีลตัวเอง) · เจ้าของที่ไม่มีทีม (admin) ตกกลับไปใช้ทีมคนกด
    team: owner?.team || body.team || user.team || null,
    // ประเภทดีล 3 ค่า (SCENT/NPD/RE-ORDER) = คอลัมน์จริง (mig 0088) — ค่าตรงกับ
    // projects.type ส่งต่อเป็น template ตอนสร้างโครงการ PM. transition: เขียน
    // metadata.projectType คู่ไว้ 1 เฟส ให้โค้ด/แคชเก่าอ่านได้.
    dealType: normalizeDealType(body.dealType ?? body.projectType ?? body.metadata?.projectType),
    // ชื่อสูตรกลิ่น (ดีล SCENT — จุดปลั๊กอิน RD ในอนาคต)
    formulaName: (body.formulaName || '').trim() || null,
    // หมวดสินค้า (DL1 — mig 0094): ใช้เลือก timeline template ตามหมวด
    categoryCode,
    // วันที่เริ่ม/สิ้นสุดของดีล (mig 0095) — startDate ใช้เป็น anchor gen ไทม์ไลน์
    startDate: body.startDate || null,
    endDate: body.endDate || null,
    metadata: {
      ...(body.metadata || {}),
      projectType: normalizeDealType(body.dealType ?? body.projectType ?? body.metadata?.projectType),
      brand: (body.brand ?? body.metadata?.brand ?? '') || '',
      // ⚠️ ห้าม client กำหนด actualSource เอง (อยู่หลัง spread จึงทับค่าที่แอบส่งมาเสมอ)
      // — เขียนได้ทางเดียวที่นี่: ดีลเก่าที่สร้างเป็น Won = 'legacy' (ยอด "มูลค่าที่ปิด"
      // ใน wonValue นับเป็น Actual ได้ · dealActualFromSalesOrders อ่านสองแหล่งนี้เท่านั้น)
      // สาย SO จริงเป็นของ trigger DB (0107/0108) ฝั่ง UPDATE — undefined = คีย์หายไปเอง
      actualSource: stage === 'won' ? 'legacy' : undefined,
      // สะท้อนคอลัมน์เสมอ กันไม่ให้เกิดสองความจริงในแถวเดียว (ผู้อ่านใหม่ต้องใช้คอลัมน์)
      ...(sourceLeadId ? { leadId: sourceLeadId } : {}),
    },
    leadId: sourceLeadId,
  };

  // The creator may only mint deals within its own edit scope: an AE cannot
  // hand ownership to another user, and team-scoped roles cannot create for
  // another team. Superusers (scope 'all') are unrestricted.
  if (!inSalesEditScope(user, row)) return forbidden();

  // แตกดีลจากลีด: deal-POST คือทางเดียวที่ปิดลีด (transition route ปิด create_deal
  // ของตัวเองไว้) — ต้อง re-implement guard เหมือน transition route: ห้ามแตะลีดนอก
  // scope ของผู้แก้ และลีดต้องอยู่สถานะที่แตกดีลได้ (contacted/meeting/qualified).
  // เชื่อค่าที่ client ส่งมาดิบ ๆ ไม่ได้ (เดิมยิงลีดทีมอื่น/สถานะใดก็บังคับ qualified ได้)
  // ⚠️ ด่านนี้ต้องผูกกับ `row.leadId` เท่านั้น = ค่าเดียวกับที่เขียนลงคอลัมน์ ห้ามเพิ่ม
  // เงื่อนไขอย่าง metadata.source มาคั่น ไม่งั้นจะกลับไปมี "ทางเขียนคอลัมน์ที่ไม่ผ่านด่าน"
  let sourceLead = null;
  if (row.leadId) {
    const { data: lead, error: leadError } = await supabase.from('sales_leads')
      .select('id, status, team, assigneeId, createdBy').eq('id', row.leadId).maybeSingle();
    if (leadError) return fail(leadError.message, 500);
    if (!lead) return badRequest('ไม่พบลีดต้นทาง');
    if (!inLeadScope(user, lead)) return forbidden('ไม่มีสิทธิ์แตกดีลจากลีดนี้');
    if (!LEAD_TRANSITIONS[lead.status]?.includes('create_deal')) {
      return badRequest(`ลีดสถานะ "${LEAD_STATUS_LABELS[lead.status] || lead.status}" ยังแตกดีลไม่ได้`);
    }
    sourceLead = lead;
  }

  const { data, error } = await supabase.from('sales_deals').insert(row).select(selectDeal).single();
  if (error) return fail(error.message, 500);

  /* ไทม์ไลน์เกิดพร้อมดีลเสมอ ไม่ต้องกดสร้างเอง (มติผู้ใช้ 2026-08-08) — ฟอร์มสร้าง
     มีครบทุกอย่างที่ template ใช้แล้ว (ประเภทดีล/หมวดสินค้า/วันที่เริ่ม/เจ้าของ)
     · ไม่ขยับ stage เป็นเสนอไทม์ไลน์ — นั่นคือความหมายของ "การกดเสนอ" ที่ผู้ใช้ทำเอง
       (ปุ่มเดิมที่หน้าดีลยังอยู่สำหรับดีลเก่า/สร้างใหม่หลังลบ)
     · gen ไม่ได้ (template ไม่เผยแพร่/หมวดไม่ตรงสักขั้น) = ดีลต้องสร้างสำเร็จอยู่ดี
       ตอบ timelineWarning ให้ UI เตือน ไม่ใช่ล้มทั้งคำขอ */
  let timelineWarning = null;
  if (stage !== 'lost') {
    try {
      const { rows: timelineRows, genType } = await buildDealTimelineRows(supabase, data);
      if (!timelineRows.length) {
        timelineWarning = categoryCode
          ? `Workflow Template ${genType} ไม่มีขั้นตอนที่ตรงกับหมวดสินค้า ${categoryCode} — ดีลนี้ยังไม่มีไทม์ไลน์`
          : `Workflow Template ${genType} ที่เผยแพร่อยู่ไม่มีขั้นตอน — ดีลนี้ยังไม่มีไทม์ไลน์`;
      } else {
        const { error: timelineError } = await supabase.from('project_tasks').insert(timelineRows);
        if (timelineError) timelineWarning = `สร้างไทม์ไลน์ไม่สำเร็จ: ${timelineError.message}`;
      }
    } catch (timelineErr) {
      timelineWarning = `สร้างไทม์ไลน์ไม่สำเร็จ: ${timelineErr.message}`;
    }
  }

  await supabase.from('sales_deal_stage_history').insert({
    id: genId('DSH'),
    dealId: data.id,
    fromStage: null,
    toStage: data.stage,
    changedBy: user.id || null,
    changedByName: user.name || null,
  });
  await supabase.from('sales_deal_forecasts').insert({
    id: genId('DFC'),
    dealId: data.id,
    forecastMonth: data.forecastMonth || monthKey(new Date().toISOString()),
    forecastAmount: forecastAmount(data),
    probability: data.probability,
    source: 'sales',
    createdBy: user.id || null,
    createdByName: user.name || null,
  });

  await recordAudit({
    user,
    action: 'create',
    entityType: 'sales_deal',
    entityId: data.id,
    after: data,
    summary: `สร้าง sales deal ${dealAuditLabel(data)}`,
    request: req,
  });

  // ถ้าดีลนี้สร้างมาจากลีด (ผ่าน guard ด้านบนแล้ว): เปลี่ยนสถานะลีดเป็น qualified
  // (ครั้งแรก) + บันทึก event "create_deal" ทุกครั้ง (ลีด 1 ใบมีได้หลายดีล — นับ conversion ครบ)
  if (sourceLead) {
    const leadId = sourceLead.id;
    const lead = sourceLead;
    {
      const now = new Date().toISOString();
      // อัปเดตสถานะเฉพาะครั้งแรก (ยังไม่ qualified) — ครั้งถัดไปคงสถานะเดิม
      if (lead.status !== 'qualified') {
        const { data: updatedLead } = await supabase.from('sales_leads')
          .update({ status: 'qualified', closedAt: now, updatedAt: now }).eq('id', leadId).select().single();
        await recordAudit({
          user, action: 'update', entityType: 'sales_lead', entityId: leadId,
          before: lead, after: updatedLead || { ...lead, status: 'qualified' },
          summary: `ลีด → qualified (สร้างดีล ${dealAuditLabel(data)})`, request: req,
        });
      }
      // event ต่อดีล — บันทึกทุกครั้ง (แม้ลีด qualified อยู่แล้ว) เพื่อให้ conversion นับครบ
      //
      // 🐞 เส้นนี้ล้มเหลว **เงียบ** มาตลอด: CHECK ของ lead_events.kind (mig 0091) ไม่มี
      // ค่า 'create_deal' อยู่ในชุด → insert ชน constraint ทุกครั้ง แล้ว error ถูกทิ้ง
      // เพราะไม่ได้อ่าน (mig 0199 เปิดค่านี้ให้แล้ว). เจตนา "นับ conversion ครบ" จึงไม่
      // เคยทำงานจริง และไม่มีอะไรบนหน้าจอบอกให้รู้
      // ⚠️ ยังไม่ทำให้ทั้ง request ล้ม — ดีลถูกสร้าง+ลีดถูกปิดไปแล้วก่อนถึงบรรทัดนี้
      // การตอบ 500 จะทำให้หน้าเว็บเข้าใจว่าเปิดดีลไม่สำเร็จทั้งที่สำเร็จ; แต่ต้อง log
      // ไม่ใช่กลืน — ประวัติที่หายต้องมีร่องรอยให้ตามได้
      const { error: leadEventError } = await supabase.from('lead_events').insert({
        id: genId('LEV'),
        leadId,
        kind: 'create_deal',
        fromStatus: lead.status,
        toStatus: 'qualified',
        createdBy: user.id || null,
        createdByName: user.name || null,
        eventAt: now,
      });
      if (leadEventError) {
        console.error(`[deal-create] บันทึก lead_event create_deal ของลีด ${leadId} ไม่สำเร็จ:`, leadEventError.message);
      }
    }
  }

  // timelineWarning: ดีลสร้างสำเร็จแต่ไทม์ไลน์ไม่เกิด — โมดัลใช้แจ้งต่อ (ไม่ใช่ error)
  return ok(timelineWarning ? { ...data, timelineWarning } : data, 201);
});
