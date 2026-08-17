// ผู้รับผิดชอบเอกสารใบเสนอราคา — บังคับให้ทุกช่องเป็น "ผู้ใช้จริง + role ตรง"
// (มติผู้ใช้ 2026-07-16). แทนที่ของเดิมที่เก็บชื่อ free-text ใน metadata โดยไม่ตรวจ
// ฝั่ง server (ปลอมชื่อผู้ดูแลได้). คงเก็บเป็น "ชื่อ" ใน metadata เพื่อให้
// เอกสาร/พิมพ์ใช้ค่าเดิมได้ แต่ตอนบันทึกต้องผ่านการ validate ว่าเป็นชื่อของผู้ใช้จริง
// ที่ถือ role ที่กำหนดของช่องนั้น.
//
//   ผู้ประสานงาน (preparedBy) = AC   ← ช่องเดียวที่ใบเสนอราคายังต้องให้คนเลือก
//
// บทบาทอีกสามอันบนใบ **ไม่ใช่ช่องที่เลือก** — มันมีคำตอบอยู่แล้วที่อื่น:
//
//   ผู้ดูแล / ผู้เสนอราคา = เจ้าของดีล (`deal.ownerId` / `ownerName`) อ่านสด
//     มติผู้ใช้ 2026-08-17 · เดิมเป็นดรอปดาวน์อิสระ ตั้งต้นจาก `project.aeOwner`
//     ⇒ ค่าที่กรอกกับคนที่อนุมัติจริงเป็นคนละคนได้ (โครงการหนึ่งมีหลายดีล + ดีลย้ายมือได้)
//     และไม่มีใครอ่านค่าที่กรอกเลย — เอกสารพิมพ์ `deal.ownerName` มาตลอด
//   ผู้จัดทำ = คนที่กดยื่นอนุมัติ (`approvalRequestedByName` ที่ mig 0156 เขียนให้)
//   ผู้ตรวจสอบ = **ไม่มีบนใบเสนอราคา** ขั้นตรวจอยู่ที่ใบสั่งขาย ซึ่งมีสองด่านของตัวเอง:
//     ฝ่ายขาย (`isSalesOrderReviewer`) + ฝ่ายบัญชี (`finance_*`) ดู salesOrderWorkflow.js
//
// ⚠️ คีย์ aeOwner / aeSupervisor ยังอยู่ในตารางข้างล่าง เพราะ **เอกสารโครงการ** มีสอง
// บทบาทนี้จริงและอ่าน role จากตารางนี้ (components/pm/ProjectDocumentView.js) —
// แค่ไม่ได้อยู่ใน QT_PEOPLE_FIELDS · metadata ของใบเก่ามีคีย์ค้างได้ ไม่มีใครอ่าน

export const QT_PEOPLE_FIELDS = ['preparedBy'];

// คีย์ metadata ที่เคยเป็นช่องของใบเสนอราคา — route ปอกทิ้งก่อนเขียนทุกครั้ง ไม่งั้น
// มันกลับมาเป็น free-text ที่ไม่มีใคร validate หลังถอดออกจาก QT_PEOPLE_FIELDS
export const QT_PEOPLE_RETIRED_FIELDS = ['aeOwner', 'aeSupervisor'];

// ตารางกลาง role ของแต่ละบทบาท — ใช้ทั้งใบเสนอราคาและเอกสารโครงการ
// (aeOwner/aeSupervisor เหลือไว้ให้เอกสารโครงการ ไม่ได้อยู่ใน QT_PEOPLE_FIELDS แล้ว)
export const QT_PEOPLE_ROLES = {
  aeOwner: ['ae', 'senior_ae'],
  preparedBy: ['ac'],
  aeSupervisor: ['ae_supervisor'],
};

export const QT_PEOPLE_LABELS = {
  aeOwner: 'ผู้ดูแล (AE)',
  preparedBy: 'ผู้ประสานงาน (AC)',
  aeSupervisor: 'ผู้ตรวจสอบ (AE Supervisor)',
};

const ROLE_LABEL = { ae: 'AE', senior_ae: 'Senior AE', ac: 'AC', ae_supervisor: 'AE Supervisor' };

// ข้อความ role ที่ช่องนั้นรับได้ — ใช้ทั้งข้อความ error ฝั่ง server และคำเตือนในฟอร์ม
// เพื่อไม่ให้สองที่บอกผู้ใช้คนละอย่าง
export const qtRoleText = (field) => (QT_PEOPLE_ROLES[field] || []).map((r) => ROLE_LABEL[r] || r).join(' / ');

// ชื่อที่แสดงของผู้ใช้จาก /api/pm/assignable-users — ต้องได้ค่าเดียวกับที่ฝั่ง server
// จับคู่ (user_metadata.name → email) ไม่งั้นฟอร์มกับ validate จะเห็นไม่ตรงกัน
export const assignableUserName = (u) => (
  (u?.name || '').trim() || `${u?.firstName || ''} ${u?.lastName || ''}`.trim() || (u?.email || '').trim()
);

// ชื่อนี้ใส่ช่องนี้ได้ไหม — เช็คฝั่ง client ด้วยกติกาเดียวกับ validateQuotationPeople
// (ค่าว่าง = ได้; ยังไม่รู้รายชื่อ = ยังตัดสินไม่ได้ ให้ถือว่าได้ไปก่อน)
export function quotationPersonAllowed(users, field, name) {
  if (!name) return true;
  if (!Array.isArray(users) || !users.length) return true;
  const allowed = QT_PEOPLE_ROLES[field] || [];
  return users.some((u) => allowed.includes(u?.role) && assignableUserName(u) === name);
}

// name -> { roles:Set, active:bool } จาก auth directory (เฉพาะผู้ใช้ที่มี role).
async function loadRoleDirectory(supabase) {
  const byName = new Map();
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const users = data?.users || [];
    if (!users.length) break;
    for (const u of users) {
      const role = u.app_metadata?.role;
      if (!role || role === 'user') continue;
      const name = (u.user_metadata?.name || u.email || '').trim();
      if (!name) continue;
      const disabled = !!u.banned_until && new Date(u.banned_until) > new Date();
      const entry = byName.get(name) || { roles: new Set(), active: false };
      entry.roles.add(role);
      if (!disabled) entry.active = true;
      byName.set(name, entry);
    }
    page++;
  }
  return byName;
}

// ตรวจ + normalize ชื่อผู้รับผิดชอบกับผู้ใช้จริง/role.
//   people: { preparedBy } (ชื่อ, อาจเป็น "")
//   opts.require = true → ทุกช่องต้องมีค่า (ใช้ตอน "ยื่นอนุมัติ" — จุดที่เอกสาร
//   ออกจากมือผู้จัดทำไปเข้าคิวเจ้าของดีล ดู api/.../[id]/submit/route.js)
// คืน { ok, error, people } (people = ชื่อที่ผ่านการตรวจ, ค่าว่าง = "")
export async function validateQuotationPeople(supabase, people, opts = {}) {
  const want = {};
  for (const f of QT_PEOPLE_FIELDS) want[f] = String(people?.[f] ?? '').trim();

  if (opts.require) {
    const missing = QT_PEOPLE_FIELDS.filter((f) => !want[f]);
    if (missing.length) {
      return { ok: false, error: `ต้องระบุ ${missing.map((f) => QT_PEOPLE_LABELS[f]).join(', ')} ก่อนยื่นอนุมัติ` };
    }
  }

  const provided = QT_PEOPLE_FIELDS.filter((f) => want[f]);
  if (!provided.length) return { ok: true, people: want };

  const dir = await loadRoleDirectory(supabase);
  for (const f of provided) {
    const entry = dir.get(want[f]);
    const allowed = QT_PEOPLE_ROLES[f];
    if (!entry || !entry.active || !allowed.some((r) => entry.roles.has(r))) {
      return { ok: false, error: `${QT_PEOPLE_LABELS[f]} ต้องเลือกจากผู้ใช้จริงที่เป็น ${qtRoleText(f)}` };
    }
  }
  return { ok: true, people: want };
}
