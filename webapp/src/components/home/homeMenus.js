// ── หน้าแรก: จากทะเบียนเมนู → แผงที่วางบนกริด (ฟังก์ชันล้วน) ─────────────────
//
// ⭐ ทุกอย่างในไฟล์นี้คำนวณจาก **ข้อมูล** ไม่ใช่จากการวัดบนจอ (ADR 0016) — ความสูงของ
//    แผงเป็นพหุคูณของ "หนึ่งแถว" เสมอ ⇒ แถวเมนูของทุกคอลัมน์ตรงแนวกัน และไม่ขยับ
//    แม้แต่พิกเซลเดียวตอนตัวเลขมา/หาย/นับไม่สำเร็จ · ไม่มี JS วัดความกว้าง
// ⚠️ ห้ามแตะ DOM และห้ามอ่านนาฬิกาในไฟล์นี้ — เทสต์เรียกตรงทุกฟังก์ชัน
import { NAV_COUNT_KEYS, navCountFor } from '@/lib/nav/useNavCounts';
import { countScopeFor } from '@/lib/nav/countScope';

/** จำนวนคอลัมน์ที่ container query เลือกได้ (≤640px = คอลัมน์เดียวแบบ flex) */
export const FITS = [2, 3, 4];
/** สารบัญบนมือถือขึ้นเมื่อมีระบบตั้งแต่เท่านี้ — น้อยกว่านี้หน้ายาวไม่ถึงสองจอ */
export const INDEX_MIN_SYSTEMS = 4;
/** ช่องว่างก่อนกลุ่มเมนูอรรถประโยชน์ยืดได้ไม่เกิน ⅓ ของความสูงคอลัมน์ */
const GROW_LIMIT = 1 / 3;

/** คีย์ตัวเลขของเมนูหนึ่งแถว (ไม่มี = แถวนี้ไม่มีป้ายเลย) */
export function countKeyOf(item) {
  return NAV_COUNT_KEYS[item?.href] || null;
}

/**
 * แผงของแต่ละระบบ — ลำดับแถวเหมือนลิ้นชักจริง (เมนูงานก่อน อรรถประโยชน์ท้าย)
 * @returns [{ system, label, icon, disabled, flow: [item], util: [item] }]
 */
export function panelBlocks(groups = []) {
  return groups.map((group) => {
    if (group.disabled) {
      return { system: group.system, label: group.label, icon: group.icon, disabled: true, flow: [], util: [] };
    }
    /* แถว "ไปที่<ระบบ>" ขึ้นเฉพาะเมื่อหน้าแรกของระบบไม่ใช่เมนูใดเมนูหนึ่ง —
       กติกาเดียวกับดรอปดาวน์ของแถวระบบ (ตัดสินด้วย `match` ไม่ใช่เทียบ href ตรง ๆ) */
    const hasHomeItem = group.items.some((item) => item.match?.(group.home));
    const flow = group.items.filter((item) => !item.utility);
    return {
      system: group.system,
      label: group.label,
      icon: group.icon,
      disabled: false,
      flow: hasHomeItem ? flow : [{ href: group.home, name: `ไปที่${group.label}`, icon: group.icon }, ...flow],
      util: group.items.filter((item) => item.utility),
    };
  });
}

/** ความสูงของแผงเป็น "จำนวนแถว": หัว 1 + เมนู n + ช่องห่างท้าย 1 · ระบบที่ปิด = 2 */
export function blockUnits(block) {
  return block.disabled ? 2 : block.flow.length + block.util.length + 2;
}

const hasUtil = (block) => !block.disabled && block.util.length > 0;

/* ทุกวิธีแบ่ง blocks เป็น c ช่วงต่อเนื่อง (ลำดับตาม SYSTEM_CATALOG ห้ามสลับ) */
function partitions(n, c) {
  const out = [];
  const walk = (start, left, acc) => {
    if (left === 1) { out.push([...acc, [start, n]]); return; }
    for (let end = start + 1; end <= n - (left - 1); end++) walk(end, left - 1, [...acc, [start, end]]);
  };
  walk(0, c, []);
  return out;
}

/**
 * ตำแหน่งของทุกแผงบนกริด เมื่อจอกว้างพอให้ `fit` คอลัมน์
 * @returns { cols, mode: 'row' | 'col' | 'none', place: [{ x, y, h, o, grow }] }
 *
 * โหมด `row` — ระบบที่เปิดใช้ ≤ fit: หนึ่งระบบหนึ่งคอลัมน์ (เหมือนดรอปดาวน์บนหัว
 *   กางพร้อมกัน) · ระบบที่ยังไม่เปิดใช้เป็นบรรทัดเดียวต่อท้ายคอลัมน์ของระบบก่อนหน้า
 *   ⇒ หัวแผงของทุกระบบอยู่บรรทัดเดียวกันพอดี
 * โหมด `col` — แบ่งตามลำดับ catalog ให้คอลัมน์สูงใกล้กัน · คอลัมน์ที่สั้นกว่าจบเส้น
 *   เดียวกับเพื่อนได้เฉพาะเมื่อมีแผงที่มีกลุ่มเมนูอรรถประโยชน์ (ช่องว่างไปอยู่ก่อนกลุ่มนั้น
 *   เหมือน `.topnav-menu-spacer` ของลิ้นชักจริง) · แผงที่ไม่มีกลุ่มนั้นห้ามยืด เพราะ
 *   หางขาวในแผงอ่านเป็น "เมนูหาย"
 */
export function sheetLayout(blocks = [], fit = 2) {
  const units = blocks.map(blockUnits);
  const place = blocks.map((_, i) => ({ x: 1, y: 1, h: units[i], o: 0, grow: 0 }));
  if (!blocks.length) return { cols: 1, mode: 'none', place };

  const enabled = blocks.filter((b) => !b.disabled).length;
  if (enabled <= fit) {
    const groups = [];
    let lead = [];
    blocks.forEach((b, i) => {
      if (!b.disabled) { groups.push([...lead, i]); lead = []; }
      else if (groups.length) groups[groups.length - 1].push(i);
      else lead.push(i);
    });
    if (lead.length) groups.push(lead);
    groups.forEach((group, gi) => {
      let y = 1;
      group.forEach((i) => {
        place[i] = { x: gi + 1, y, h: units[i], o: y === 1 ? 0 : 1, grow: 0 };
        y += units[i];
      });
    });
    return { cols: groups.length, mode: 'row', place };
  }

  const growable = (part, slack, height) =>
    slack > 0 && slack <= height * GROW_LIMIT && blocks.slice(part[0], part[1]).some(hasUtil);

  let best = null;
  for (let c = fit; c >= 2; c--) {
    for (const parts of partitions(blocks.length, c)) {
      // ทุกช่วงต้องมีระบบที่เปิดใช้ — คอลัมน์ที่มีแต่บรรทัดจางอ่านไม่ออกว่าเป็นคอลัมน์
      if (!parts.every((p) => blocks.slice(p[0], p[1]).some((b) => !b.disabled))) continue;
      const hs = parts.map((p) => units.slice(p[0], p[1]).reduce((a, u) => a + u, 0));
      const height = Math.max(...hs);
      let cost = 0;
      let ragged = 0;
      parts.forEach((p, ci) => {
        const slack = height - hs[ci];
        if (growable(p, slack, height)) cost += slack;
        else { cost += 2 * slack; ragged += slack; }   // ปล่อยแหว่ง = แพงเป็นสองเท่า
      });
      cost += 0.5 * (fit - c) * height;                // คอลัมน์ที่ไม่ได้ใช้ = ที่ว่างข้างแผ่น
      if (!best || cost < best.cost
        || (cost === best.cost && (height < best.height
          || (height === best.height && ragged < best.ragged)))) {
        best = { parts, hs, height, cost, ragged, cols: c };
      }
    }
  }

  best.parts.forEach((part, ci) => {
    const slack = best.height - best.hs[ci];
    let grow = -1;
    let tallest = -1;
    if (growable(part, slack, best.height)) {
      for (let i = part[0]; i < part[1]; i++) {
        if (hasUtil(blocks[i]) && units[i] >= tallest) { grow = i; tallest = units[i]; }
      }
    }
    const flush = slack === 0 || grow >= 0;   // คอลัมน์นี้จบเส้นเดียวกับคอลัมน์ที่สูงสุด
    let y = 1;
    for (let j = part[0]; j < part[1]; j++) {
      const h = units[j] + (j === grow ? slack : 0);
      place[j] = {
        x: ci + 1,
        y,
        h,
        o: y === 1 ? 0 : (j === part[1] - 1 && flush ? 2 : 1),
        grow: j === grow ? slack : 0,
      };
      y += h;
    }
  });
  return { cols: best.cols, mode: 'col', place };
}

/**
 * สถานะของแถวหนึ่ง
 * @returns 'plain' (ไม่มีตัวนับ) | 'off' | 'loading' | 'count' | 'zero' | 'failed'
 */
export function rowState(item, state, user) {
  if (item?.disabled) return 'off';
  const key = countKeyOf(item);
  // เป็น "เลน" ก็ต่อเมื่อ route ยิงตัวนับคีย์นี้ให้คนนี้จริง (ถามด่านเดียวกับ route)
  const lane = !!key && !!countScopeFor(key, user);
  if (!lane) return 'plain';
  if (state?.status === 'loading') return 'loading';
  if (state?.status === 'error') return 'failed';
  if (state?.failed?.has(key)) return 'failed';
  if (navCountFor(state?.counts, item.href)) return 'count';
  // payload รุ่นเก่ายังไม่มี `_attempted` ⇒ ไม่รู้ว่าคีย์ไหนถูกนับ ให้ถือว่าเป็นศูนย์
  if (!state?.attempted) return 'zero';
  /* ไม่อยู่ใน attempted = route ไม่ได้ยิงคีย์นี้ให้เขา ทั้งที่ countScopeFor บอกว่ามี
     ⇒ สองที่เพี้ยนกัน · คืนช่องว่างไว้ก่อน ดีกว่าโชว์ศูนย์ที่ไม่มีใครนับ */
  return state.attempted.has(key) ? 'zero' : 'plain';
}

/** ขอบเขตของแถว: 'mine' = ป้ายทึบ · อื่น ๆ = ป้ายโปร่งมีขอบ */
export function rowScope(item, user) {
  const key = countKeyOf(item);
  return countScopeFor(key, user) === 'mine' ? 'mine' : 'shared';
}

/**
 * ยอดของแผงหนึ่ง — คิดจาก **แถวที่วาดในแผงนั้นจริง** เท่านั้น
 * ⚠️ ห้ามใช้ `navCountForSystem` — มันนับเอกสารร่วมไว้ใต้ salesplan เสมอ ⇒ ยอดของ
 *    FN / RD / TS จะไม่เท่าผลรวมป้ายที่ตาเห็นในแผงของเขา
 * ⚠️ ของฉันกับของฝ่าย **ไม่รวมเป็นยอดเดียว** — ป้ายทึบ 226 ที่จริงเป็นงานทั้งบริษัท
 *    216 คือป้ายที่โกหกคนอ่าน
 */
export function panelTotal(block, state, user) {
  const total = { mine: 0, shared: 0, failed: 0, loading: false };
  for (const item of [...block.flow, ...block.util]) {
    const kind = rowState(item, state, user);
    if (kind === 'count') total[rowScope(item, user)] += navCountFor(state?.counts, item.href) || 0;
    else if (kind === 'failed') total.failed += 1;
    else if (kind === 'loading') total.loading = true;
  }
  return total;
}

/**
 * คำอธิบายป้าย — บอกเฉพาะรูปป้ายที่อยู่บนจอจริง
 * ⚠️ นับจาก **แถวที่วาด** ไม่ใช่จาก `_failed` ดิบ — ตัวนับของระบบที่ปิดอยู่ (mgmtTasks ·
 *    productionJobs) ยังถูกยิงที่ server แต่ไม่มีแถวบนหน้าให้ใครเห็น
 */
export function legendState(blocks = [], state, user) {
  let mine = false;
  let shared = false;
  let failedCount = 0;
  let hasCount = false;
  const loading = state?.status === 'loading';
  for (const block of blocks) {
    for (const item of [...block.flow, ...block.util]) {
      const kind = rowState(item, state, user);
      if (kind === 'count') {
        hasCount = true;
        if (rowScope(item, user) === 'mine') mine = true; else shared = true;
      } else if (kind === 'failed') failedCount += 1;
    }
  }
  return {
    mine,
    shared,
    failedCount,
    loading,
    // พูดว่า "ไม่มีงานค้าง" ได้ต่อเมื่อนับครบแล้วจริง และไม่มีแถวไหนนับไม่สำเร็จ
    allZero: !loading && !hasCount && failedCount === 0,
    stale: !!state?.stale,
  };
}
