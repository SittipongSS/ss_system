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

/* ⭐ **ทีมขายใหม่สร้างได้แล้ว** (มติผู้ใช้ 2026-09-07) — ของเดิมบล็อกไว้เพราะทางเขียนทุกเส้น
   กรองรหัสทีมผ่านค่าคงที่ `TEAMS` ในโค้ด ⇒ สร้างได้แต่ย้ายคนเข้าไม่ได้ และรหัสถูก **ทิ้งเงียบ ๆ**
   ตอนบันทึกบัญชี (ตอบสำเร็จทั้งที่ไม่มีทีม)
   ⇒ วันนี้ทางเขียนเทียบกับทะเบียนสด (`loadSalesTeamCodes`) แล้ว ทั้งสร้างบัญชี · แก้บัญชี ·
   ย้ายทีม · ยกลูกค้าให้ทีม · คัดกรองลีด
   ✅ **ไม่ต้องทำอะไรด้วยมือแล้ว** (2026-09-07 รอบสอง) — `TEAM_LABELS` ถูกลบทิ้ง
   ชื่อทีมมีบ้านเดียวคือทะเบียน · ทุกจอและทุกไฟล์ export อ่านจากที่นั่น
   ⚠️ ด่าน `npm run check:teams` เปลี่ยนหน้าที่แล้ว: เดิมห้ามมีทีมนอกค่าคงที่ · ตอนนี้ยืนยันว่า
   **สามทีมตั้งต้นต้องไม่หายไปจากทะเบียน** ซึ่งเป็นสิ่งที่มีค่าจริง (รหัสถูกอ้างใน 19 ตาราง) */

/* บ้านของทะเบียนทีมแต่ละฝ่าย — หน้าเดียวกันถูก mount สองที่ (มติ 2026-08-28)
   ⚠️ เพิ่มฝ่ายใหม่ต้องเพิ่มที่นี่ **พร้อมกับ** สร้าง route จริง ไม่งั้นลิงก์บนแถวพาไป 404 */
export const TEAMS_BASE_PATH = { SA: '/sa/teams', TS: '/service/teams' };

export function teamsBasePath(department) {
  return TEAMS_BASE_PATH[String(department ?? '').trim()] || null;
}

/* แผนของการกด "บันทึกสมาชิก" หนึ่งครั้ง — ตรรกะล้วน แยกออกมาจาก route เพื่อให้เทสต์ได้
   ⭐ **ติ๊กคนที่อยู่ทีมอื่น = ย้ายให้** (มติ 2026-09-06) — กติกา "คนหนึ่งอยู่ทีมปฏิบัติงาน
   ได้ทีมเดียวต่อฝ่าย" ยังเหมือนเดิม เปลี่ยนแค่ว่าระบบบังคับให้แทนที่จะตีกลับทั้งชุด
   ⚠️ คนที่ **อยู่ทีมนี้อยู่แล้ว** ไม่นับว่าย้าย (ไม่งั้นทุกครั้งที่กดบันทึกจะรายงานว่าย้าย
   ทั้งทีม) · คนที่ถูกติ๊กออกไม่ได้ถูกย้ายไปไหน เขาจะกลายเป็น "ยังไม่อยู่ทีมไหน" */
export function planCrewRoster({ code, userIds = [], existingMembers = [] } = {}) {
  const ids = [...new Set(userIds.map((v) => String(v ?? '').trim()).filter(Boolean))];
  const here = existingMembers.filter((m) => m.teamCode === code);
  const movedFrom = existingMembers.filter((m) => m.teamCode !== code && ids.includes(m.userId));
  const leaving = here.filter((m) => !ids.includes(m.userId));
  return {
    ids,
    movedFrom,
    leaving,
    beforeIds: here.map((m) => m.userId),
    fromTeamCodes: [...new Set(movedFrom.map((m) => m.teamCode))],
  };
}

/* ป้ายของรหัสทีมสำหรับ **ฝั่งเซิร์ฟเวอร์** — 🔴 **ไม่รู้จัก = คืนรหัสดิบ ห้ามถอยไป `TEAM_LABELS`**
   แมปมาจากฐานสด ⇒ ถ้ามีรหัสนั้นก็คือชื่อจริง · ถอยไปค่าคงที่มีผลเฉพาะตอนอ่านฐานพลาด
   ซึ่งตอนนั้น **รหัสดิบคือความจริง ส่วนชื่อเก่าคือคำโกหกที่ดูเหมือนปกติ** — ทีมที่ถูก
   เปลี่ยนชื่อในทะเบียนจะพิมพ์ชื่อเก่าลงไฟล์ Excel ตลอดไปโดยไม่มีอะไรบอกว่าเพี้ยน
   ⚠️ ไม่เติมขีด/ช่องว่างแทนค่าว่างให้ — แต่ละที่ใช้คนละอย่างโดยตั้งใจ (Excel ใช้ "" ·
   รายงานภาษีใช้ "-") ⇒ คืนค่าที่รับมาตามเดิมเมื่อไม่มีรหัส */
export function teamNameOf(names, code) {
  if (!code) return code;
  return names?.get?.(code) || code;
}

export function teamHref(department, code) {
  const base = teamsBasePath(department);
  return base && code ? `${base}/${encodeURIComponent(code)}` : null;
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

/* ── รหัสทีมที่คนพิมพ์เอง (มติผู้ใช้ 2026-09-07) ──────────────────────────────
   ⭐ ของเดิมรหัสมาจาก `suggestTeamCode` อย่างเดียว ⇒ ชื่อไทยล้วนได้ `SA` · `SA-2` · `SA-3`
      ซึ่งอ่านไม่ออกว่าเป็นทีมไหน และมันคือรหัสที่จะถูกก๊อปลง 20+ คอลัมน์ตลอดไป
   ⚠️ ตัวสร้างอัตโนมัติยังอยู่ — มันคือ **ค่าตั้งต้นในช่อง** ไม่ใช่คำตอบสุดท้ายอีกต่อไป

   กติกา (ทุกข้อมีเหตุผลด้านข้อมูล ไม่ใช่รสนิยม):
   · `A-Z0-9-` เท่านั้น — รหัสเป็น route param (`/api/teams/[code]`) และถูกเขียนลง
     ไฟล์ export · ไทย/ช่องว่างเคยหลุดเข้ามาแล้วครั้งหนึ่ง (`TS-UAT-ทีมกรุงเ`)
   · ขึ้นต้นด้วย `<ฝ่าย>-` — ทีมของสองฝ่ายชนรหัสกันไม่ได้
   · ห้ามรูป `<ฝ่าย>-<เลข>` — ตัวสร้างอัตโนมัติจองรูปนี้ไว้เป็นตัวหนีรหัสซ้ำ
     คนจองไปเอง = รอบหน้าตัวสร้างวิ่งชนแล้วต้องข้ามไปเรื่อย ๆ
   · ห้ามชนรหัสที่มีอยู่ (เช็คบนจอ + เซิร์ฟเวอร์เช็คซ้ำอีกชั้นด้วย 23505) */
export const TEAM_CODE_MAX = 20;

/* รหัสที่ถือว่า "ถูกใช้ไปแล้ว" สำหรับฟอร์มหนึ่งใบ — ตอนแก้ต้องไม่นับรหัสของทีมที่กำลังแก้
   🐞 **บั๊กจริงที่รอบตรวจจับได้ก่อน merge (2026-09-07)** — ของเดิมกรองด้วย **ค่าที่พิมพ์อยู่**
   (`c !== value.code`) ซึ่งตัดรหัสที่ซ้ำออกจากลิสต์เสมอ ⇒ สาขา "รหัสถูกใช้ไปแล้ว" ของ
   `normalizeTeamCode` **ตายสนิท** ⇒ พิมพ์รหัสที่มีอยู่แล้ว ปุ่มดับเงียบ ๆ โดยไม่มีอะไรบอกเหตุ
   ซึ่งเป็นสิ่งที่คอมเมนต์ในไฟล์นั้นเขียนไว้เองว่ามีไว้กัน (และผิดกฎ GatedAction ของ repo)
   ⇒ ต้องกรองด้วย **รหัสเดิมของทีม** ที่ส่งมาแยกต่างหาก ไม่ใช่ค่าที่พิมพ์
   ⚠️ ตอนสร้าง ไม่มีรหัสเดิม ⇒ ไม่กรองอะไรทั้งนั้น */
export function otherTeamCodes(existingCodes = [], ownCode = null) {
  const own = String(ownCode ?? '').trim().toUpperCase();
  if (!own) return [...existingCodes];
  return existingCodes.filter((c) => String(c ?? '').toUpperCase() !== own);
}

export function normalizeTeamCode(raw, { department = '', existingCodes = [] } = {}) {
  const dept = String(department ?? '').trim().toUpperCase();
  const code = String(raw ?? '').trim().toUpperCase();
  if (!dept) return { value: null, error: 'ต้องระบุฝ่ายเจ้าของทีม' };
  if (!code) return { value: null, error: 'ต้องระบุรหัสทีม' };
  if (!/^[A-Z0-9-]+$/.test(code)) {
    return { value: null, error: 'รหัสทีมใช้ได้เฉพาะ A-Z 0-9 และขีด (-)' };
  }
  if (code.startsWith('-') || code.endsWith('-') || code.includes('--')) {
    return { value: null, error: 'ขีดต้องอยู่ระหว่างตัวอักษร ห้ามขึ้นต้น ลงท้าย หรือติดกันสองตัว' };
  }
  if (code.length > TEAM_CODE_MAX) {
    return { value: null, error: `รหัสทีมยาวเกิน ${TEAM_CODE_MAX} ตัวอักษร` };
  }
  if (!code.startsWith(`${dept}-`)) {
    return { value: null, error: `รหัสทีมต้องขึ้นต้นด้วย ${dept}- (กันรหัสชนกับทีมของฝ่ายอื่น)` };
  }
  if (new RegExp(`^${dept}-\\d+$`).test(code)) {
    return {
      value: null,
      error: `${dept}-<ตัวเลข> เป็นรูปที่ระบบใช้ตั้งรหัสให้อัตโนมัติ — ตั้งรหัสที่อ่านออกว่าเป็นทีมไหน`,
    };
  }
  if (existingCodes.includes(code)) {
    return { value: null, error: `รหัส ${code} ถูกใช้ไปแล้ว` };
  }
  return { value: code, error: null };
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
