import { buildProjectTasks, todayStr } from '@/lib/pm/schedule';
import { setHolidays } from '@/lib/pm/dateHelpers';
import { holidaySet } from '@/lib/master/holidays';
import { applyAutoStatuses } from '@/lib/pm/status';
import { categoryFlagsOf } from '@/lib/master/productTypes';
import { loadWorkflowTemplateForGeneration } from '@/lib/admin/workflowTemplates';
import { dealTypeFoundsProject, normalizeDealType } from '@/lib/salesPlanning';

/* แกนกลางการ gen ไทม์ไลน์ลอยของดีล (DL1 — task ที่ projectId ว่าง) ใช้ร่วมกัน 3 ทาง:
   - POST /deals              → gen อัตโนมัติตอนสร้างดีล (มติผู้ใช้ 2026-08-08:
                                "ไทม์ไลน์เปิดเสมอ ไม่ต้องกดเอง")
   - POST /deals/[id]/timeline → ปุ่มสร้างเอง (ดีลเก่าที่ยังไม่มี / สร้างใหม่หลังลบ)
   - PATCH /deals/[id]         → regen เมื่อประเภท/หมวดสินค้าเปลี่ยนและยังไม่เริ่มทำสักขั้น
   ห้ามคัดลอกลำดับ template→flags→build ไปประกอบเองอีกที่ — สามทางนี้ต้องได้ผลเหมือนกัน

   คืน { rows, genType, categoryCode, startDate, noTemplate } — rows ว่างได้ 2 กรณี
   ที่ caller ต้องแยกให้ออก:
     · noTemplate=true — ประเภทดีลนี้ **ไม่มีแม่แบบโดยเจตนา** (OTHER: ขายอย่างเดียว
       ไม่ก่อตั้งโครงการ — mig 0247) ⇒ "ไม่มีไทม์ไลน์" คือผลลัพธ์ที่ถูกต้อง ห้ามเตือน
     · noTemplate=false — template หลังกรองหมวดสินค้าไม่เหลือขั้นตอน = ตั้งค่าผิด ต้องเตือน
   โยน WorkflowTemplateError เมื่อไม่มี template เผยแพร่ของประเภทที่ควรมี */
export async function buildDealTimelineRows(supabase, deal, { type, categoryCode, startDate } = {}) {
  const genType = normalizeDealType(type ?? deal.dealType ?? deal.metadata?.projectType);
  const cat = (categoryCode ?? deal.categoryCode ?? '').trim() || null;
  // anchor เดียวกับกติกาเดิมของ route ไทม์ไลน์: ที่ส่งมา > วันเริ่มของดีล > วันนี้
  const anchor = startDate || deal.startDate || todayStr();

  // ออกก่อนแตะ DB — ยิง loadWorkflowTemplateForGeneration('OTHER') จะได้ WorkflowTemplateError
  // ที่บอกให้ "ไปตั้งค่า template" ซึ่งเป็นคำแนะนำที่ผิด (ประเภทนี้ไม่ควรมี template)
  if (!dealTypeFoundsProject(genType)) {
    return { rows: [], genType, categoryCode: cat, startDate: anchor, noTemplate: true };
  }

  setHolidays([...(await holidaySet())]);
  const templateOptions = await loadWorkflowTemplateForGeneration(supabase, genType);
  // ขั้นสรรพสามิตใน template ผูก token flag:excise (mig 0131) → ส่งธงของหมวดดีล
  templateOptions.categoryFlags = await categoryFlagsOf(cat);
  const rows = applyAutoStatuses(buildProjectTasks(
    // เทียบ field โครงการ: type = ประเภทดีล, productMainCategory = หมวดบนดีล
    { type: genType, productMainCategory: cat || '', startDate: anchor, aeOwner: deal.ownerName || '' },
    null, // projectId ว่าง = ไทม์ไลน์ลอยของดีล
    deal.id,
    templateOptions,
  ));
  return { rows, genType, categoryCode: cat, startDate: anchor, noTemplate: false };
}

/* สรุป "ขั้นตอนปัจจุบัน" ต่อดีลจาก task ที่เรียง stepOrder แล้ว — กติกาเดียวกับ
   getCurrentStep ของฝั่ง PM (lib/pm/derived.js): กำลังทำก่อน ไม่มีก็ขั้นแรกที่ยังไม่เสร็จ
   คืน null เมื่อไม่มีไทม์ไลน์ · current=null+total>0 = เสร็จครบทุกขั้น */
export function summarizeTimelineStep(tasks) {
  if (!tasks?.length) return null;
  const activeIndex = tasks.findIndex((t) => t.status === 'In Progress');
  const index = activeIndex >= 0 ? activeIndex : tasks.findIndex((t) => t.status !== 'Completed');
  if (index < 0) return { current: null, total: tasks.length, name: null };
  return { current: index + 1, total: tasks.length, name: tasks[index].name || '' };
}
