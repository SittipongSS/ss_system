// ── ทะเบียนทีม (mig 0310) — logic ล้วน ────────────────────────────────────
//
// ⭐ **มติผู้ใช้ 2026-08-28** (docs/team-management-plan.md): จัดทีมเองได้ไม่ต้องรอ
//   แอดมิน · แยกเฉพาะฝ่าย · และ *"TS ก็มีแยกทีม"*
//
// ⚠️ **สองแกนที่ห้ามปน**
//   · `sales` — ทีมขาย: ผูกสิทธิ์/ยอด · **สมาชิกอยู่ที่ `app_metadata.team/teams`**
//     ทะเบียนนี้ถือแค่ชื่อ/หัวหน้า/ลำดับ/สถานะ ไม่ใช่รายชื่อสมาชิก
//   · `crew`  — ทีมปฏิบัติงาน: สมาชิกอยู่ที่ `team_members` และ **ไม่แตะสิทธิ์เลย**
//   ปนเมื่อไรจะได้ทะเบียนสองเล่มที่ไม่ตรงกัน (ด่านสิทธิ์อ่านเล่มหนึ่ง จอจัดทีมอ่านอีกเล่ม)
//
// ⚠️ **รหัสทีมเปลี่ยนไม่ได้** — ถูกก๊อปเป็นข้อความลง 20 คอลัมน์ใน 19 ตารางและอยู่ใน
//   กุญแจของ unique index 3 ตัว · เปลี่ยนรหัส = แถวเก่าทั้งหมดชี้ทีมที่ไม่มีอยู่

export const TEAM_KINDS = ['sales', 'crew'];

export const TEAM_KIND_LABELS = {
  sales: 'ทีมขาย',
  crew: 'ทีมปฏิบัติงาน',
};

export const TEAM_KIND_HINTS = {
  sales: 'ผูกกับสิทธิ์การเห็นข้อมูลและยอดขาย — สมาชิกตั้งที่บัญชีผู้ใช้',
  crew: 'ใช้จัดคนอย่างเดียว ไม่กระทบสิทธิ์ — ฝ่ายไหนก็มีได้',
};

/* ฝ่ายที่ใช้ทีมแบบไหน — ฝ่ายขายใช้ทีมขาย (ของเดิม) · ฝ่ายอื่นใช้ทีมปฏิบัติงาน
   ⚠️ ฝ่ายขายสร้างทีม `crew` เพิ่มได้ในอนาคต แต่ **ฝ่ายอื่นสร้าง `sales` ไม่ได้**
   เพราะทีมขายผูกสิทธิ์ ซึ่งวันนี้ผูกกับ role ฝ่ายขายเท่านั้น */
export const SALES_TEAM_DEPARTMENT = 'SA';

export function allowedKindsFor(department) {
  return String(department ?? '').trim() === SALES_TEAM_DEPARTMENT ? ['sales', 'crew'] : ['crew'];
}

/* รหัสทีมจากชื่อ — ฝ่ายนำหน้าเสมอเพื่อไม่ให้ทีมของสองฝ่ายชนรหัสกัน
   (ทีมขายเดิม ODM/KA/SV ไม่มีคำนำหน้า เพราะรหัสถูกเขียนลง 19 ตารางไปแล้ว) */
export function suggestTeamCode(department, name, existingCodes = []) {
  const dept = String(department ?? '').trim().toUpperCase();
  /* 🐞 ของเดิมยอมให้ **ภาษาไทยเข้ารหัส** แล้ว `.slice(0, 12)` ตัดกลางคำ ⇒ ตั้งทีมชื่อ
     "ทีมกรุงเทพตะวันออก" ได้รหัส `TS-UAT-ทีมกรุงเ` (พบตอน UAT 2026-08-28)
     - รหัสนี้เป็น **route param** (`/api/teams/[code]`) ⇒ ไทยใน URL ต้อง percent-encode
     - และขัดกับรหัสอื่นทั้งระบบที่เป็น ASCII ล้วน (`SS-26080005` · `ZN-…` · `AR-306`)
     ⇒ เอาเฉพาะ A-Z0-9 · ตัดที่ขอบคำ (ไม่ตัดกลางท่อน) · ชื่อไทยล้วนถอยไปใช้เลขรัน */
  const base = String(name ?? '').trim().toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-').reduce((acc, part) => (
      !part ? acc : (!acc ? part : (`${acc}-${part}`.length <= 12 ? `${acc}-${part}` : acc))
    ), '')
    .slice(0, 12);
  const stem = base ? `${dept}-${base}` : dept;
  if (!existingCodes.includes(stem)) return stem;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${stem}-${n}`;
    if (!existingCodes.includes(candidate)) return candidate;
  }
  return `${stem}-${Date.now()}`;
}

export function normalizeTeamInput(body = {}, { department = null } = {}) {
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return { value: null, error: 'ต้องระบุชื่อทีม' };
  if (name.length > 100) return { value: null, error: 'ชื่อทีมยาวเกิน 100 ตัวอักษร' };

  const dept = String(department ?? body.department ?? '').trim();
  if (!dept) return { value: null, error: 'ต้องระบุฝ่ายเจ้าของทีม' };

  const kind = String(body.kind ?? '').trim() || 'crew';
  if (!TEAM_KINDS.includes(kind)) return { value: null, error: 'ชนิดทีมไม่ถูกต้อง' };
  if (!allowedKindsFor(dept).includes(kind)) {
    return { value: null, error: `ฝ่าย ${dept} สร้างทีมขายไม่ได้ — ทีมขายผูกกับสิทธิ์ของฝ่ายขาย` };
  }

  const note = String(body.note ?? '').trim();
  if (note.length > 500) return { value: null, error: 'หมายเหตุยาวเกิน 500 ตัวอักษร' };

  const sortOrder = Number(body.sortOrder);

  return {
    value: {
      name,
      department: dept,
      kind,
      leadId: String(body.leadId ?? '').trim() || null,
      leadName: String(body.leadName ?? '').trim() || null,
      isActive: body.isActive === undefined ? true : !!body.isActive,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 100,
      note: note || null,
    },
    error: null,
  };
}

/* ปิดทีมได้ไหม — ทีมที่ยังมีคนอยู่ปิดไม่ได้ เพราะคนจะหลุดออกจากทุกจอเงียบ ๆ
   ⚠️ คืน **เหตุผล** ไม่ใช่ boolean — ปุ่มที่กดไม่ได้ต้องบอกได้ว่าเพราะอะไร */
export function closeTeamBlocker(team, { memberCount = 0 } = {}) {
  if (!team) return 'ไม่พบทีม';
  if (team.isActive === false) return '';
  if (memberCount > 0) {
    return `ทีมนี้ยังมีสมาชิก ${memberCount} คน — ย้ายคนออกให้หมดก่อนปิดทีม`;
  }
  return '';
}

/* จัดกลุ่มทีมสำหรับหน้าจัดทีม — ทีมที่ยังใช้งานเรียงตาม sortOrder แล้วค่อยชื่อ
   ทีมที่ปิดแล้วไปกองท้าย **ไม่หายไปจากจอ** (รหัสยังถูกอ้างในรายงานย้อนหลัง) */
export function sortTeams(teams = []) {
  return [...teams].sort((a, b) => {
    if ((a.isActive === false) !== (b.isActive === false)) return a.isActive === false ? 1 : -1;
    if ((a.sortOrder ?? 100) !== (b.sortOrder ?? 100)) return (a.sortOrder ?? 100) - (b.sortOrder ?? 100);
    return String(a.name || '').localeCompare(String(b.name || ''), 'th');
  });
}

/* คนที่ยังไม่อยู่ทีมไหนของฝ่ายนี้ — **ถังนี้ต้องมีเสมอแม้ว่าง**
   ถังที่หายไปคือคนที่หายไปจากสายตา (โรคเดียวกับแดชบอร์ดที่เคยตัดถัง null ทิ้ง
   จนยอดรวมบริษัทไม่ตรงกับผลรวมรายทีม) */
export function unassignedMembers(users = [], memberships = [], department) {
  const inTeam = new Set(memberships.map((m) => m.userId));
  return users.filter((u) => u.department === department && !inTeam.has(u.id));
}

/* ผลข้างเคียงของการย้ายทีมขาย — หน้าจอต้องบอกก่อนกด ไม่ใช่ให้รู้ทีหลัง
   ⚠️ ระบบ **ไม่ย้ายให้อัตโนมัติ** โดยเจตนา: ย้ายให้เอง = เขียนทับเจ้าของงานหลายสิบใบ
   ในคลิกเดียว และมติเดิมบอกว่าดีลเดือนเก่ารายงานใต้ทีมเดิมถูกต้องแล้ว */
export function teamMoveEffects({ openDeals = 0, futureTargets = 0, sharedDocs = 0 } = {}) {
  const rows = [];
  if (openDeals > 0) rows.push({ key: 'deals', count: openDeals, text: `ดีลที่ยังเปิดอยู่ ${openDeals} ใบ ยังนับเป็นของทีมเดิม — แก้ทีละใบที่หน้าดีล` });
  if (futureTargets > 0) rows.push({ key: 'targets', count: futureTargets, text: `เป้าเดือนข้างหน้า ${futureTargets} เดือน ยังอยู่ใต้ทีมเดิม — ย้ายที่หน้าวางเป้า` });
  if (sharedDocs > 0) rows.push({ key: 'docs', count: sharedDocs, text: `เอกสารร่วมที่แชร์ไว้ ${sharedDocs} ไฟล์ ยังเปิดได้ — ถอนสิทธิ์ที่หน้าผู้ใช้` });
  return rows;
}
