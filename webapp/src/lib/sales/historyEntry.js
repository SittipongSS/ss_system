// ตรรกะล้วนของหน้ากรอก "ยอดขายย้อนหลัง" (/sa/targets/history)
//
// **2026-08-03 ผู้ใช้สั่งเปิดให้กรอกรายทีม/รายคนได้ "หากมี"** — กลับมติ 2026-07-26 ที่ล็อก
// ไว้ระดับบริษัทอย่างเดียว
// เหตุผลเดิมยังจริงอยู่และไม่ได้หายไป: ทีมขายเพิ่งแบ่งจริงเมื่อ มิ.ย. 2026 เดือนก่อนหน้านั้น
// ไม่มีเจ้าของทีม การกรอกย้อนหลังรายทีมจึงเป็นการ *เดา* ที่ไปโผล่บนกราฟเหมือนข้อมูลจริง
// จึงคุมด้วยกติกาว่า **ทุกช่องเป็นทางเลือก ปล่อยว่างได้ ไม่กรอก = ไม่มีแถวในฐานข้อมูล**
// (ต่างจากใส่ 0 ซึ่งแปลว่า "ขายไม่ได้เลย") — คนกรอกเลือกเองว่าปีไหนแยกได้จริง

export const MONTHS_IN_YEAR = 12;

// ปีปัจจุบัน + ย้อนหลัง 3 ปี — ต้องมีปีปัจจุบันด้วยเพราะเดือนต้นปีที่ยังไม่ได้ใช้ระบบ
// (ม.ค.–พ.ค. 2026) ก็ต้องกรอกย้อนหลังเหมือนกัน
export function historyYearOptions(now = new Date(), span = 4) {
  const current = now.getFullYear();
  return Array.from({ length: span }, (_, i) => String(current - i));
}

// เดือนที่ยังมาไม่ถึงกรอกไม่ได้ — ยอดขายของอนาคตไม่มีอยู่จริง
export function isMonthEditable(year, monthIdx, now = new Date()) {
  const y = Number(year);
  if (!Number.isFinite(y) || monthIdx < 0 || monthIdx >= MONTHS_IN_YEAR) return false;
  const currentYear = now.getFullYear();
  if (y < currentYear) return true;
  if (y > currentYear) return false;
  return monthIdx <= now.getMonth();
}

export function monthsSum(values = []) {
  return values.reduce((sum, value) => {
    const n = Number(value);
    return Number.isFinite(n) ? sum + n : sum;
  }, 0);
}

// ยอดรวมทั้งปีที่แก้เองได้: ตราบใดที่ผู้ใช้ยังไม่แตะช่องนี้ ให้ตามผลรวมรายเดือนไป
// (ปีที่มีตัวเลขรายเดือนครบ) · แตะเมื่อไรถือว่าคนคุมเอง ห้ามเขียนทับ (บางปีรู้แค่ยอดรวม)
export function resolveYearTotal({ months = [], override = null }) {
  const sum = monthsSum(months);
  if (override === null || override === undefined || override === '') return { total: sum, mismatch: false };
  const typed = Number(override);
  if (!Number.isFinite(typed)) return { total: sum, mismatch: false };
  // ต่างกันเกิน 1 บาทถึงเตือน — กันเตือนเพราะเศษสตางค์จากการปัด
  return { total: typed, mismatch: sum > 0 && Math.abs(typed - sum) > 1 };
}

/**
 * คีย์ประจำแถว — ต้อง**ตรงกับคีย์ที่ API ใช้จับคู่ upsert** คือ (team, ownerId)
 *
 * 🪤 คีย์รายคนต้องมีทีมด้วย ห้ามใช้ ownerId เดี่ยว ๆ — คนที่ย้ายทีมมีแถวค้างได้
 * *สองทีมพร้อมกัน* (ยอดเก่าผูกทีมเดิม ยอดใหม่ผูกทีมปัจจุบัน) ถ้าคีย์ชนกันสองแถวจะ
 * แชร์ค่าที่กรอกก้อนเดียวกัน แล้วบันทึกทับกันเงียบ ๆ (เทสต์จับไว้แล้ว)
 */
export function historyRowKey({ team = null, ownerId = null } = {}) {
  if (ownerId) return `owner:${team || '-'}:${ownerId}`;
  if (team) return `team:${team}`;
  return 'company';
}

/**
 * แถวที่หน้าต้องแสดง เรียงเป็น บริษัท → ทีม → คนในทีม
 *
 * ⚠️ **คนที่มีข้อมูลบันทึกไว้แต่ไม่ได้อยู่ทีมนั้นแล้วต้องโผล่ด้วย** (ย้ายทีม/ลาออก) —
 * แถวเหล่านี้ยังถูกนับอยู่ในฐานข้อมูล ถ้าไม่แสดงก็จะกลายเป็นตัวเลขผีที่แก้ไม่ได้
 * และมองไม่เห็น (บทเรียนเดียวกับ "เป้าผี" ที่หน้าวางเป้าเจอมาก่อน)
 */
export function buildHistoryRows({ teams = [], users = [], savedRows = [], ownerRoles = [] } = {}) {
  const rows = [{ key: 'company', scope: 'company', team: null, ownerId: null, ownerName: null }];

  // ownerId → ทีมที่ "แถวที่บันทึกไว้" ผูกอยู่ (ไม่ใช่ทีมปัจจุบันของคนนั้น)
  const savedOwners = new Map();
  for (const row of savedRows) {
    if (!row?.ownerId || savedOwners.has(row.ownerId)) continue;
    savedOwners.set(row.ownerId, { team: row.team || null, ownerName: row.ownerName || null });
  }

  for (const team of teams) {
    rows.push({ key: historyRowKey({ team }), scope: 'team', team, ownerId: null, ownerName: null });

    const members = new Set();
    for (const user of users) {
      if (!ownerRoles.includes(user.role) || user.team !== team) continue;
      members.add(user.id);
      rows.push({ key: historyRowKey({ team, ownerId: user.id }), scope: 'owner', team, ownerId: user.id, ownerName: user.name || user.id });
    }

    /* แถวค้างของทีม *นี้* — คนที่ยอดเก่าผูกทีมนี้ไว้แต่ตอนนี้ไม่ได้อยู่ทีมนี้แล้ว
       (ย้ายไปทีมอื่น = โผล่สองที่โดยตั้งใจ ทีมละยอดของมันเอง · ออกจากระบบ = โผล่ที่เดียว) */
    for (const [ownerId, info] of savedOwners) {
      if (members.has(ownerId) || info.team !== team) continue;
      const still = users.find((user) => user.id === ownerId);
      rows.push({
        key: historyRowKey({ team, ownerId }),
        scope: 'owner',
        team,
        ownerId,
        ownerName: info.ownerName || ownerId,
        // ผู้เรียกเป็นคนเรียบเรียงข้อความเอง — โมดูลนี้ไม่ถือคำแสดงผล
        detached: still ? { movedTo: still.team || null } : { gone: true },
      });
    }
  }

  return rows;
}

/**
 * แปลงค่าที่กรอกเป็น items ของ POST /api/sales-planning/history
 *
 * กติกา: **ช่องว่าง = ไม่ส่ง** ไม่ใช่ส่ง 0 — แถวที่ไม่มีในฐานข้อมูลแปลว่า "ไม่มีข้อมูล
 * แยกระดับนี้" ส่วน 0 แปลว่า "ระดับนี้ขายไม่ได้เลย" ซึ่งคนละเรื่องกันบนกราฟ
 */
export function historySaveItems({ rows = [], values = {}, year, now = new Date() } = {}) {
  const items = [];
  for (const row of rows) {
    const value = values[row.key];
    if (!value) continue;
    const months = value.months || [];

    months.forEach((amount, monthIdx) => {
      // เดือนที่ยังมาไม่ถึงไม่ส่งขึ้น server แม้จะมีค่าค้างจาก pre-fill
      if (amount === '' || amount == null || !isMonthEditable(year, monthIdx, now)) return;
      items.push({
        period: `${year}-${String(monthIdx + 1).padStart(2, '0')}`,
        periodType: 'month',
        team: row.team,
        ownerId: row.ownerId,
        ownerName: row.ownerName,
        actualAmount: Number(amount) || 0,
        source: 'manual',
      });
    });

    /* แถวรายปี — ตัวช่วยวางเป้าอ่านแถวนี้
       ⚠️ ห้ามส่ง targetAmount เด็ดขาด ไม่งั้นเป้าที่วางไว้ในแถวเดียวกันถูกเขียนทับเป็น 0 */
    const { total } = resolveYearTotal({ months, override: value.yearOverride });
    if (total > 0) {
      items.push({
        period: String(year),
        periodType: 'year',
        team: row.team,
        ownerId: row.ownerId,
        ownerName: row.ownerName,
        actualAmount: total,
        source: 'manual',
      });
    }
  }
  return items;
}
