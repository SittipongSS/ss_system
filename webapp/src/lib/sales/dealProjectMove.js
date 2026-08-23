// ── ย้ายดีลข้ามโครงการ ─────────────────────────────────────────────────────
//
// ดีลผูกโครงการได้ใบเดียว แต่ "ผูกผิดใบ" เกิดขึ้นจริงและเดิมแก้ไม่ได้เลย —
// API link-project ตีกลับ 409 ทุกครั้งที่ดีลมีโครงการอยู่แล้ว ทางออกเดียวคือลบดีล
// ทิ้งแล้วสร้างใหม่ ซึ่งพาไทม์ไลน์ ใบเสนอราคา และคำร้องหายไปทั้งชุด
//
// ⭐ กติกาของการย้าย: **ของที่ทำไปแล้วต้องย้ายตามไปครบ ไม่ใช่เริ่มนับหนึ่งใหม่**
// segment เดิมย้ายทั้งชุด (สถานะ/วันจริง/ผู้รับผิดชอบติดไปด้วย) และไม่มีการเลื่อนวัน
// ให้ — ต่างจากการผูกครั้งแรกที่ gen ชุดใหม่จาก template แล้ว anchor ที่วันเริ่ม
//
// ⚠️ สิ่งที่ **ไม่** ย้ายตาม: `project_products` (รายการ FG) — ตารางนั้นผูกกับ
// โครงการเท่านั้น ไม่มีคอลัมน์บอกว่า FG ชิ้นไหนมาจากดีลใบไหน เดาแล้วย้ายผิด
// เจ็บกว่าปล่อยไว้ ผู้เรียกจึงต้องบอกผู้ใช้ว่าต้องจัดการ FG เอง

// ตารางที่ snapshot `projectId` ไว้ข้าง `dealId` — โครงการของแถวพวกนี้คือ
// "โครงการของดีล" เสมอ (mirror) ดีลย้ายเมื่อไหร่ต้องย้ายตาม ไม่งั้นงาน/คำร้อง/
// ใบสั่งขาย/งานผลิตจะค้างชี้โครงการเก่า แล้วโผล่ผิดที่ทั้งสองฝั่ง
//
// ⚠️ `production_jobs` ก็อยู่ในชุดนี้: ใบงานผลิตก๊อป `projectId` มาจากใบสั่งขาย
// ตอน auto-draft (lib/pm/productionJobsRepo — approvedOrdersWithLines) ⇒ ย้ายดีล
// หลังมีงานผลิตแล้วโดยไม่ย้ายตาม = ใบงานชี้โครงการเก่าเงียบ ๆ
export const DEAL_PROJECT_MIRROR_TABLES = Object.freeze([
  'personal_tasks', 'dept_requests', 'sales_orders', 'production_jobs',
]);

/**
 * แผนย้าย segment: ต่อท้ายไทม์ไลน์ปลายทางโดยคงลำดับภายใน segment ไว้
 * `from` = ค่าเดิมของแต่ละแถว ไว้ถอนคืนเมื่อย้ายไม่สำเร็จกลางทาง
 */
export function planSegmentMove(tasks = [], baseOrder = 0, toProjectId = null) {
  return [...tasks]
    .sort((a, b) => (Number(a.stepOrder) || 0) - (Number(b.stepOrder) || 0))
    .map((task, index) => ({
      id: task.id,
      to: {
        projectId: toProjectId,
        stepOrder: baseOrder + index,
        // รากของ segment ต้อง pin ไว้เหมือนตอนผูกครั้งแรก ไม่งั้นวันเริ่มถูกดูดไป
        // ที่ anchor ของโครงการปลายทาง = งานที่ทำค้างอยู่เลื่อนวันเองเงียบ ๆ
        startLocked: (task.predecessors || []).length === 0 ? true : (task.startLocked ?? false),
      },
      from: {
        projectId: task.projectId ?? null,
        stepOrder: task.stepOrder ?? null,
        startLocked: task.startLocked ?? false,
      },
    }));
}

/** stepOrder ถัดไปของโครงการปลายทาง (ต่อท้าย ไม่แทรกกลาง) */
export const nextStepOrder = (tasks = []) =>
  tasks.reduce((max, task) => Math.max(max, Number(task.stepOrder ?? 0)), -1) + 1;

// ── ตัวย้ายจริง (ต้องมี supabase) ─────────────────────────────────────────
// คืน `applied` = สิ่งที่ย้ายไปแล้ว ผู้เรียกเก็บไว้ถอนคืนเมื่อขั้นถัดไปพัง

export async function moveSegmentTasks(supabase, moves = []) {
  const applied = [];
  for (const move of moves) {
    const { error } = await supabase.from('project_tasks').update(move.to).eq('id', move.id);
    if (error) {
      await rollbackSegmentTasks(supabase, applied);
      throw new Error(`ย้ายไทม์ไลน์ของดีลไม่สำเร็จ: ${error.message}`);
    }
    applied.push(move);
  }
  return applied;
}

export async function rollbackSegmentTasks(supabase, applied = []) {
  for (const move of applied) {
    await supabase.from('project_tasks').update(move.from).eq('id', move.id);
  }
}

/**
 * ย้ายของที่ mirror โครงการจากดีล (งาน/คำร้อง/ใบสั่งขาย)
 * เก็บค่าเดิมรายแถวก่อนเขียน — ถอนคืนได้ตรงตัว ไม่ใช่เดาว่าเดิมทุกแถวชี้ที่เดียวกัน
 * (งานเก่าบางใบ projectId ว่างอยู่ ถ้าถอนคืนแบบเหมารวมมันจะได้โครงการเกินมา)
 */
export async function moveDealMirrors(supabase, { dealId, toProjectId }) {
  const applied = [];
  for (const table of DEAL_PROJECT_MIRROR_TABLES) {
    const { data, error } = await supabase.from(table).select('id, projectId').eq('dealId', dealId);
    // อ่านไม่ได้ = ยังไม่รู้ว่ามีอะไรต้องย้าย — หยุดแล้วถอนคืน ดีกว่าเดินต่อแบบตาบอด
    if (error) {
      await rollbackDealMirrors(supabase, applied);
      throw new Error(`อ่าน ${table} ที่ผูกดีลไม่สำเร็จ: ${error.message}`);
    }
    // ⚠️ ก๊อปค่าเดิมออกมาเป็นของตัวเอง ไม่ถือ reference ของแถว — ค่าถอนคืนต้องเป็น
    // "ค่าก่อนเขียน" เสมอ ไม่ใช่ค่าที่เพิ่งถูกเขียนทับไปแล้ว
    const rows = (data || [])
      .filter((row) => String(row.projectId || '') !== String(toProjectId))
      .map((row) => ({ id: row.id, projectId: row.projectId ?? null }));
    if (!rows.length) continue;
    const { error: updateError } = await supabase
      .from(table).update({ projectId: toProjectId }).in('id', rows.map((row) => row.id));
    if (updateError) {
      await rollbackDealMirrors(supabase, applied);
      throw new Error(`ย้าย ${table} ตามดีลไม่สำเร็จ: ${updateError.message}`);
    }
    applied.push({ table, rows });
  }
  return applied;
}

export async function rollbackDealMirrors(supabase, applied = []) {
  for (const { table, rows } of applied) {
    // จัดกลุ่มตามค่าเดิม — คืนทีละกลุ่ม ไม่ใช่ยัดค่าเดียวทับทั้งชุด
    const byProject = new Map();
    for (const row of rows) {
      const key = row.projectId ?? null;
      if (!byProject.has(key)) byProject.set(key, []);
      byProject.get(key).push(row.id);
    }
    for (const [projectId, ids] of byProject) {
      await supabase.from(table).update({ projectId }).in('id', ids);
    }
  }
}

/** สรุปจำนวนที่ย้าย ไว้เขียนลง audit/เธรด — `[{ table, rows }]` → `{ table: n }` */
export const mirrorCounts = (applied = []) =>
  Object.fromEntries(applied.map(({ table, rows }) => [table, rows.length]));
