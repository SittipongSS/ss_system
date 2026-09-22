// ── ทีมเจ้าหน้าที่บริการบนหน้าจัดคิว (mig 0310 · งวด T-4) ─────────────────────────────
//
// ⭐ *"TS ก็มีแยกทีม"* — พอฝ่ายบริการมีทีมจริง หน้าจัดคิวต้องอ่านได้ว่า **ทีมไหนแน่นทีมไหนว่าง**
//   ไม่ใช่เห็นเจ้าหน้าที่ 12 คนเรียงกันโดยไม่รู้ว่าใครอยู่กลุ่มไหน
//
// ⚠️ **ทีมเจ้าหน้าที่บริการเป็นมุมมอง ไม่ใช่ด่านสิทธิ์** (docs/team-management-plan.md §2) —
//   กรองด้วยทีมแล้วยัง *เห็น* งานของทีมอื่นได้เสมอถ้าเลือกดู · ตัวกั้นจริงยังเป็น
//   `canEditService` ที่ดูจากฝ่าย · ถ้าวันหนึ่งอยากให้ทีมกั้นการเห็น ต้องเป็นมติใหม่
//   ไม่ใช่ผลข้างเคียงของตัวกรองบนจอ

export const ALL_TEAMS = '__all__';
export const NO_TEAM = '__none__';

/* userId → teamCode (ทีมปฏิบัติงานมีได้ทีมเดียวต่อฝ่าย จึงเป็น 1:1) */
export function teamByUser(members = []) {
  const map = new Map();
  for (const row of members) map.set(row.userId, row.teamCode);
  return map;
}

/* ตัวเลือกตัวกรอง — **ต้องมีถัง "ยังไม่อยู่ทีมไหน" เสมอเมื่อมีคนอยู่ในถังนั้นจริง**
   ถังที่หายไปคือเจ้าหน้าที่ที่หลุดจากสายตาคนจัดคิว */
export function teamFilterOptions(teams = [], rows = [], byUser = new Map()) {
  const used = new Set(rows.map((r) => byUser.get(r.key) || NO_TEAM));
  const options = [{ value: ALL_TEAMS, label: 'ทุกทีม' }];
  for (const team of teams) {
    if (team.kind !== 'crew') continue;
    if (team.isActive === false && !used.has(team.code)) continue;  // ทีมปิดที่ไม่มีงานค้าง ไม่ต้องรก
    options.push({ value: team.code, label: team.name });
  }
  if (used.has(NO_TEAM)) options.push({ value: NO_TEAM, label: 'ยังไม่อยู่ทีมไหน' });
  return options;
}

/* กรองแถวของกริดตามทีม — `ALL_TEAMS` คืนทุกแถว
   ⚠️ แถว "ยังไม่มอบหมาย" ของกริด (ไม่มี assigneeId) ไม่ได้อยู่ทีมไหน จึงตกถัง NO_TEAM
   ซึ่งถูกแล้ว: งานที่ยังไม่มีคนรับไม่ใช่ภาระของทีมใดทีมหนึ่ง */
export function filterRowsByTeam(rows = [], teamCode = ALL_TEAMS, byUser = new Map()) {
  if (!teamCode || teamCode === ALL_TEAMS) return rows;
  return rows.filter((row) => (byUser.get(row.key) || NO_TEAM) === teamCode);
}

/* แถวของกริดที่ **มองจากทีมหนึ่ง** — แถวของทีมนั้น + แถว "ยังไม่มอบหมาย" ต่อท้ายเสมอ
   ⭐ มติผู้ใช้ 2026-09-22: ตัวกรองทีมคุมทั้งหน้า และ **งานที่ยังไม่มีเจ้าหน้าที่ขึ้นให้ทุกทีมเห็น**
      (รายการงานใช้ `teamViewVisit` กติกาเดียวกัน) — ซ่อนแถวนี้เมื่อเลือกทีม = ซ่อนเหตุติดด่าน
      ที่พบบ่อยที่สุดจากหัวหน้าทีม ซึ่งเป็นคนที่หยิบงานไปให้ลูกทีมได้
   ⚠️ **ไม่แก้ `filterRowsByTeam`** — ตัวนั้นยังตอบคำถาม "แถวของทีมนี้คือแถวไหน" ถูกอยู่ และภาระรายทีม
      (`teamLoad`) ต้องไม่นับงานไร้เจ้าของเข้าทีมไหน
   ⚠️ เลือก `NO_TEAM` แล้ว `filterRowsByTeam` คืนแถวไม่มอบหมายมาด้วยอยู่แล้ว (มันตกถังนั้น) ⇒ ตัดออก
      ก่อนแล้วค่อยต่อท้าย ไม่งั้นแถวซ้ำสองแถวด้วย key เดียวกัน */
export function teamViewRows(rows = [], teamCode = ALL_TEAMS, byUser = new Map(), unassignedKey) {
  if (!teamCode || teamCode === ALL_TEAMS) return rows;
  const isUnassigned = (row) => unassignedKey != null && row.key === unassignedKey;
  const own = filterRowsByTeam(rows, teamCode, byUser).filter((row) => !isUnassigned(row));
  const unassigned = rows.find(isUnassigned);
  return unassigned ? [...own, unassigned] : own;
}

/* ภาระรายทีมของช่วงที่เปิดอยู่ — นับ **นัด** กับ **คน** แยกกัน
   ⚠️ ทีมที่มีคนแต่ไม่มีนัดต้องขึ้นเป็น 0 ไม่ใช่หายไป — ทีมว่างคือข้อมูลที่คนจัดคิว
   ต้องเห็นมากที่สุด (มันคือทีมที่รับงานเพิ่มได้) */
export function teamLoad({ teams = [], rows = [], members = [], byUser = teamByUser(members) } = {}) {
  const crew = teams.filter((t) => t.kind === 'crew' && t.isActive !== false);
  const headcount = new Map();
  for (const row of members) headcount.set(row.teamCode, (headcount.get(row.teamCode) || 0) + 1);

  const visitsByTeam = new Map();
  for (const row of rows) {
    const code = byUser.get(row.key) || NO_TEAM;
    visitsByTeam.set(code, (visitsByTeam.get(code) || 0) + (row.visits?.length || 0));
  }

  const out = crew.map((team) => ({
    code: team.code,
    name: team.name,
    people: headcount.get(team.code) || 0,
    visits: visitsByTeam.get(team.code) || 0,
  }));

  const orphan = visitsByTeam.get(NO_TEAM) || 0;
  if (orphan > 0) out.push({ code: NO_TEAM, name: 'ยังไม่อยู่ทีมไหน', people: 0, visits: orphan });
  return out;
}
