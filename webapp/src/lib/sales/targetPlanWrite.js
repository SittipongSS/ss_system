// ── ตัวช่วยวางเป้า → sales_targets: โหนดไหน "ได้เขียน" และการเขียนทับอะไรบ้าง ──
//
// 🔴 **โหนดที่ยอดเป็น 0 ต้องไม่ถูกเขียน** (แก้ 2026-08-24) — ของเดิม `confirmPlan`
// วนเขียนทุกโหนดเสมอ: บริษัท + ทุกทีม + AE ทุกคน · ใครยอด 0 ก็ยัง
// `distributeBySeasonal(0, profile)` = ศูนย์สิบสองตัว แล้ว upsert ทับแถวเดิม
// ⇒ รันตัวช่วยซ้ำกลางปี = เป้ารายคนที่ปรับมือไว้ทั้งปีหายเกลี้ยงโดยไม่มีอะไรบอก
// (ตารางเป้าหน้าแรกมีกันทับอยู่แล้ว — `hasUnevenMonths` ถามก่อนเกลี่ยทับ — แต่
// ตัวช่วยซึ่งเขียนหนักกว่ามาก กลับไม่มีด่านอะไรเลย)
//
// "ไม่เขียน" ต่างจาก "เขียน 0": แถวที่ไม่ถูกแตะยังถือค่าเดิมและยังนับเข้ายอดรวมทีม
// อยู่ ⇒ ต้องบอกคนกดด้วยว่าเหลืออะไรค้างไว้ (ดู `summarizeOverwrite().keep`)
// ไม่งั้นก็แค่ย้ายจาก "ข้อมูลหายเงียบ" ไปเป็น "ข้อมูลค้างเงียบ"

const num = (value) => Math.max(0, Math.round(Number(value) || 0));

/** คีย์ประจำโหนด — ต้องตรงกับคีย์ที่ API จับคู่ upsert คือ (team, ownerId)
 *  🪤 คนอยู่หลายทีมได้ ⇒ คีย์รายคนต้องมีทีมด้วย ไม่งั้นเป้าของคนเดียวสองทีมชนกัน */
export function planNodeKey({ team = null, ownerId = null } = {}) {
  return `${team || ''}|${ownerId || ''}`;
}

/**
 * โหนดที่ตัวช่วยจะเขียนจริง เรียง บริษัท → ทีม → คน
 * ยอด ≤ 0 ถูกคัดออกทั้งหมด (ดูเหตุผลบนหัวไฟล์)
 */
export function planNodes({
  finalTarget = 0,
  teams = [],
  teamTargets = {},
  teamMembers = {},
  personTargets = {},
} = {}) {
  const out = [];
  const push = (node) => { if (node.annual > 0) out.push({ ...node, key: planNodeKey(node) }); };

  push({ scope: 'company', team: null, ownerId: null, ownerName: null, annual: num(finalTarget) });
  for (const team of teams) {
    push({ scope: 'team', team, ownerId: null, ownerName: null, annual: num(teamTargets[team]) });
  }
  for (const team of teams) {
    for (const member of teamMembers[team] || []) {
      push({
        scope: 'owner',
        team,
        ownerId: member.id,
        ownerName: member.name || null,
        annual: num(personTargets[member.id]),
      });
    }
  }
  return out;
}

/**
 * เทียบแผนกับเป้าที่มีอยู่แล้วในปีนั้น → บอกสองกอง
 * · `overwrite` = แถวที่มีของอยู่และกำลังจะถูกทับ (ต้องถามก่อน)
 * · `keep`      = แถวที่มีของอยู่แต่แผนนี้ไม่แตะ — เป้าผี/คนที่ย้ายออก/โหนดที่ยอดเป็น 0
 *                 ค่าเดิมยังอยู่และยังนับเข้ายอดรวม ต้องบอกให้ไปเคลียร์เองที่ตารางเป้า
 *
 * `existingRows` = ผลจาก GET /api/sales-planning/targets?year=YYYY (ทุก periodType)
 */
export function summarizeOverwrite({ existingRows = [], nodes = [], year } = {}) {
  const planned = new Set(nodes.map((node) => node.key));
  const totals = new Map();

  for (const row of existingRows || []) {
    if (row?.periodType !== 'month') continue;
    if (year && String(row.period || '').slice(0, 4) !== String(year)) continue;
    const amount = Number(row.targetAmount || 0);
    if (!(amount > 0)) continue;
    const key = planNodeKey(row);
    const entry = totals.get(key) || {
      key,
      team: row.team || null,
      ownerId: row.ownerId || null,
      ownerName: row.ownerName || null,
      amount: 0,
    };
    entry.amount += amount;
    // ชื่อบนแถวเป็นสำเนา ณ ตอนวางเป้า — เอาไว้เรียกแถวเฉย ๆ ผู้เรียกควรหาชื่อ
    // ปัจจุบันจากบัญชีจริงก่อนถ้าหาได้ (กติกาเดียวกับตารางเป้า/หน้ายอดย้อนหลัง)
    entry.ownerName = entry.ownerName || row.ownerName || null;
    totals.set(key, entry);
  }

  const overwrite = [];
  const keep = [];
  for (const entry of totals.values()) {
    (planned.has(entry.key) ? overwrite : keep).push(entry);
  }
  return { overwrite, keep };
}
