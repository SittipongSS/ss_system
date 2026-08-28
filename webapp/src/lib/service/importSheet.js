// ── อ่านชีตเก่าเป็นร่างไซต์/โซน/เครื่อง (F-8) ──────────────────────────────
//
// ⭐ **ทำไมต้องจับคอลัมน์ด้วยชื่อหัวตาราง ไม่ใช่ตำแหน่ง**: ชีตที่ใช้กันมาหลายปี
// ถูกแทรก/ย้ายคอลัมน์นับครั้งไม่ถ้วน · จับด้วยตำแหน่ง (`คอลัมน์ AN`) จะพังทันที
// ที่มีคนแทรกคอลัมน์เพิ่ม และพังแบบ**เงียบ** คือได้ข้อมูลผิดช่องโดยไม่มีใครรู้
//
// ⚠️ **หัวตารางที่จับไม่ได้ ไม่เงียบ** — คืนออกมาเป็น `unmatched` ให้หน้าจอโชว์
// ว่า "คอลัมน์นี้ระบบไม่รู้จัก จะไม่ถูกนำเข้า" ให้คนแก้ชื่อหัวแล้วอัปโหลดใหม่
//
// 🔴 **สิ่งที่จงใจไม่นำเข้า** (มติ + แผน F-8):
//   - `ระยะเวลา (ปี)` — ชีตขัดกันเอง (Dapper 2 สาขา ช่วงวันเดียวกันใส่ `0.25`
//     กับ `1`) ⇒ ระยะเวลาคำนวณจากวันที่เสมอ ห้ามรับค่าที่พิมพ์มา
//   - `จำนวนแพ็ค` / `ลิตร-เดือน` — เป็นข้อผูกพันของ **รอบขาย** ซึ่งอยู่ที่
//     `service_zone_terms` และ term เกิดได้เฉพาะจากบรรทัดใบสั่งขายที่อนุมัติแล้ว
//     (mig 0297 `salesOrderLineId NOT NULL`) · ข้อมูลเก่าไม่มีใบสั่งขายในระบบ
//     ⇒ **ยัดลงฐานไม่ได้โดยไม่ปลอมใบสั่งขาย** จึงติดมากับรายงานให้คนใช้ตอนคีย์ SO
import { ASSET_KINDS } from './assetKinds';
import {
  isBlankCell,
  nameKey,
  packStdEquivalent,
  parseAssetKind,
  parseCount,
  parseGrade,
  parseImportDate,
  parsePacks,
  parseText,
  parseVolumeMl,
  parseWorkPause,
} from './importValues';

/* หนึ่งช่องเป้าหมาย = ชื่อไทยที่ใช้แสดง + ชื่อหัวตารางที่ยอมรับ
   ⚠️ alias เทียบด้วย nameKey (ตัดช่องว่าง/วงเล็บ/ขีด) — `ชื่อไซต์ (สาขา)` จึงตรงกับ
   `ชื่อไซต์ สาขา` · เพิ่ม alias ใหม่ได้เรื่อย ๆ โดยไม่ต้องแก้ที่อื่น */
export const IMPORT_FIELDS = [
  { key: 'customerName', label: 'ลูกค้า', required: true,
    aliases: ['ลูกค้า', 'ชื่อลูกค้า', 'customer', 'customer name', 'บริษัท', 'account'] },
  { key: 'siteName', label: 'ชื่อไซต์', required: true,
    aliases: ['ชื่อไซต์', 'ไซต์', 'สาขา', 'ชื่อสาขา', 'site', 'site name', 'brand', 'location', 'สถานที่'] },
  { key: 'zoneName', label: 'โซน',
    aliases: ['โซน', 'zone', 'พื้นที่', 'area', 'ชั้น/โซน', 'จุดติดตั้ง'] },
  { key: 'routeZone', label: 'เขตวิ่งงาน',
    aliases: ['เขตวิ่งงาน', 'เขต', 'route', 'route zone', 'สายวิ่ง'] },
  { key: 'address', label: 'ที่อยู่', aliases: ['ที่อยู่', 'address', 'ที่ตั้ง'] },
  { key: 'contactName', label: 'ผู้ติดต่อ', aliases: ['ผู้ติดต่อ', 'contact', 'contact name', 'ผู้ประสานงาน'] },
  { key: 'contactPhone', label: 'เบอร์ติดต่อ', aliases: ['เบอร์', 'เบอร์โทร', 'โทร', 'phone', 'tel', 'contact phone'] },

  { key: 'assetKind', label: 'ชนิดอุปกรณ์', aliases: ['ชนิดอุปกรณ์', 'ชนิด', 'ประเภทอุปกรณ์', 'kind', 'type', 'ประเภท'] },
  { key: 'assetCount', label: 'จำนวนเครื่อง',
    aliases: ['จำนวนเครื่อง', 'จำนวน', 'เครื่อง', 'qty', 'quantity', 'จำนวนจุด', 'position no'] },
  { key: 'model', label: 'รุ่น', aliases: ['รุ่น', 'model', 'โมเดล'] },
  { key: 'colour', label: 'สี', aliases: ['สี', 'colour', 'color'] },
  { key: 'floor', label: 'ชั้น', aliases: ['ชั้น', 'floor', 'ชั้นที่'] },
  { key: 'spot', label: 'จุดติดตั้งย่อย', aliases: ['จุด', 'spot', 'ตำแหน่ง', 'position'] },
  { key: 'serial', label: 'ซีเรียล', aliases: ['ซีเรียล', 'serial', 'serial no', 's/n', 'sn'] },
  { key: 'scentName', label: 'กลิ่น', aliases: ['กลิ่น', 'scent', 'scent name', 'น้ำหอม', 'ชื่อกลิ่น'] },
  { key: 'bottleMl', label: 'ขนาดขวด', aliases: ['ขนาดขวด', 'ขวด', 'bottle', 'bottle ml', 'ขนาดถัง'] },
  { key: 'workPause', label: 'พ่น/พัก', aliases: ['พ่น/พัก', 'work/pause', 'work pause', 'กระจายกลิ่น', 'setting'] },
  { key: 'grade', label: 'เกรด', aliases: ['เกรด', 'grade'] },
  { key: 'schedule', label: 'ช่วงเวลาทำงาน', aliases: ['ช่วงเวลา', 'timetable', 'เวลาทำงาน', 'schedule'] },
  { key: 'installedAt', label: 'วันติดตั้ง',
    aliases: ['วันติดตั้ง', 'วันที่ติดตั้ง', 'วันเริ่ม', 'วันเริ่มบริการ', 'install date', 'installed', 'start date', 'วันที่เริ่มสัญญา'] },
  { key: 'note', label: 'หมายเหตุ', aliases: ['หมายเหตุ', 'note', 'remark', 'remarks'] },

  // ── ติดมากับรายงานเท่านั้น ไม่ลงฐาน ──
  { key: 'packStd', label: 'แพ็ค STD', carriedOnly: true, aliases: ['pkg std', 'package std', 'แพ็ค std', 'std'] },
  { key: 'packSm', label: 'แพ็ค SM', carriedOnly: true, aliases: ['pkg sm', 'package sm', 'แพ็ค sm', 'sm'] },
  { key: 'packs', label: 'จำนวนแพ็ค', carriedOnly: true, aliases: ['จำนวนแพ็ค', 'แพ็ค', 'package', 'pack'] },
  { key: 'mlPerMonth', label: 'ปริมาณต่อเดือน', carriedOnly: true,
    aliases: ['ลิตร/เดือน', 'ลิตรต่อเดือน', 'ปริมาณต่อเดือน', 'ml/เดือน', 'liter per month'] },
  { key: 'contractStart', label: 'วันเริ่มสัญญา', carriedOnly: true, aliases: ['เริ่มสัญญา', 'contract start'] },
  { key: 'contractEnd', label: 'วันสิ้นสุดสัญญา', carriedOnly: true, aliases: ['สิ้นสุดสัญญา', 'contract end', 'วันหมดสัญญา'] },
];

/* 🔴 คอลัมน์ที่รู้จักแต่ **ตั้งใจไม่นำเข้า** — โชว์ให้เห็นว่าเห็นแล้วและทิ้งเพราะอะไร
   (ต่างจาก unmatched ที่แปลว่า "ไม่รู้จัก") */
export const IGNORED_COLUMNS = [
  { aliases: ['ระยะเวลา', 'ระยะเวลา (ปี)', 'ระยะเวลาปี', 'duration', 'duration year', 'ปี'],
    label: 'ระยะเวลา (ปี)',
    reason: 'ชีตขัดกันเอง (ช่วงวันเดียวกันใส่ 0.25 กับ 1) — ระบบคำนวณจากวันที่เสมอ' },
  { aliases: ['สถานะสัญญา', 'contract status', 'กำหนดวันที่ได้รับสัญญา'],
    label: 'สถานะสัญญา',
    reason: 'ระบบสัญญาบริการยังไม่เปิด (รอต้นฉบับสัญญาจ้างบริการ)' },
  { aliases: ['so express', 'เลข iv', 'invoice no'],
    label: 'เอกสารการเงิน',
    reason: 'ผูกกับใบสั่งขาย/ใบแจ้งหนี้ในระบบ ไม่ใช่ทะเบียนไซต์' },
];

const FIELD_BY_ALIAS = new Map();
for (const field of IMPORT_FIELDS) {
  for (const alias of [field.label, ...field.aliases]) FIELD_BY_ALIAS.set(nameKey(alias), field.key);
}
const IGNORED_BY_ALIAS = new Map();
for (const item of IGNORED_COLUMNS) {
  for (const alias of [item.label, ...item.aliases]) IGNORED_BY_ALIAS.set(nameKey(alias), item);
}

/* จับหัวตาราง → { map: {fieldKey: columnIndex}, unmatched, ignored, missingRequired }
   ⚠️ หัวซ้ำสองคอลัมน์ให้ยึด**คอลัมน์แรก** และรายงานตัวที่สองเป็น unmatched —
   เดาว่าตัวไหนคือตัวจริงไม่ได้ และการเงียบคือการเลือกแทนคนใช้ */
export function matchHeaders(headers = []) {
  const map = {};
  const unmatched = [];
  const ignored = [];

  headers.forEach((raw, index) => {
    const text = String(raw ?? '').trim();
    if (!text) return;
    const key = nameKey(text);

    const ignoredHit = IGNORED_BY_ALIAS.get(key);
    if (ignoredHit) { ignored.push({ header: text, label: ignoredHit.label, reason: ignoredHit.reason }); return; }

    const fieldKey = FIELD_BY_ALIAS.get(key);
    if (!fieldKey) { unmatched.push({ header: text, index }); return; }
    if (map[fieldKey] !== undefined) {
      unmatched.push({ header: text, index, duplicateOf: fieldKey });
      return;
    }
    map[fieldKey] = index;
  });

  const missingRequired = IMPORT_FIELDS
    .filter((field) => field.required && map[field.key] === undefined)
    .map((field) => field.label);

  return { map, unmatched, ignored, missingRequired };
}

// เพดานการแตกแถวเครื่องต่อหนึ่งบรรทัดชีต — กันเลขที่กรอกผิดช่อง (`242` ในช่อง
// จำนวนเครื่อง) กลายเป็นขยะ 242 แถวที่ต้องมานั่งลบทีละแถว
export const MAX_ASSETS_PER_ROW = 60;

const take = (row, map, key) => (map[key] === undefined ? '' : row[map[key]]);

/* หนึ่งบรรทัดชีต → ร่างที่พร้อมเทียบกับฐาน
   คืน { rowNumber, customerName, site, zone, assets, carried, issues } */
export function buildDraft(row, map, { rowNumber = 0 } = {}) {
  const issues = [];
  const read = (key, parser, options) => {
    const raw = take(row, map, key);
    const result = parser(raw, options);
    if (result.issue) {
      const field = IMPORT_FIELDS.find((item) => item.key === key);
      issues.push({ field: field?.label || key, message: result.issue, raw: result.raw });
    }
    return result;
  };

  const customerName = read('customerName', parseText, { max: 200, label: 'ชื่อลูกค้า' }).value;
  const siteName = read('siteName', parseText, { max: 150, label: 'ชื่อไซต์' }).value;
  if (!customerName) issues.push({ field: 'ลูกค้า', message: 'ต้องมีชื่อลูกค้า', raw: null });
  if (!siteName) issues.push({ field: 'ชื่อไซต์', message: 'ต้องมีชื่อไซต์', raw: null });

  const zoneName = read('zoneName', parseText, { max: 150, label: 'ชื่อโซน' }).value;
  const site = {
    name: siteName,
    routeZone: read('routeZone', parseText, { max: 50, label: 'เขตวิ่งงาน' }).value,
    address: read('address', parseText, { max: 500, label: 'ที่อยู่' }).value,
    contactName: read('contactName', parseText, { max: 100, label: 'ผู้ติดต่อ' }).value,
    contactPhone: read('contactPhone', parseText, { max: 50, label: 'เบอร์ติดต่อ' }).value,
  };

  // ── อุปกรณ์ ──
  const kindCell = take(row, map, 'assetKind');
  let kind = 'diffuser';
  if (!isBlankCell(kindCell)) {
    const parsed = parseAssetKind(kindCell);
    if (parsed.value) kind = parsed.value;
    // ⚠️ ชนิดที่เดาไม่ออก **ไม่ตกเป็น diffuser เงียบ ๆ** — ของที่ไม่ใช่เครื่อง
    //   กระจายกลิ่นแล้วถูกนับเป็นเครื่อง จะบวมเข้าไปในภาระช่างทุกวันหลังจากนั้น
    else issues.push({ field: 'ชนิดอุปกรณ์', message: parsed.issue, raw: parsed.raw });
  } else if (!isBlankCell(take(row, map, 'assetCount'))) {
    // ไม่มีคอลัมน์ชนิดเลย = ชีตเก่าที่นับแต่เครื่องกระจายกลิ่น (ค่าตั้งต้นตามชีต)
    kind = 'diffuser';
  }
  if (!ASSET_KINDS.includes(kind)) kind = 'diffuser';

  const count = read('assetCount', parseCount);
  const pending = count.note === 'รอติดตั้ง';
  const installedAt = read('installedAt', parseImportDate).value;
  const bottleMl = read('bottleMl', parseVolumeMl, { bareUnit: 'ml' }).value;
  const workPause = read('workPause', parseWorkPause).value;
  const grade = read('grade', parseGrade).value;
  const schedule = read('schedule', parseText, { max: 150, label: 'ช่วงเวลาทำงาน' }).value;
  const model = read('model', parseText, { max: 100, label: 'รุ่น' }).value;
  const colour = read('colour', parseText, { max: 100, label: 'สี' }).value;
  const floor = read('floor', parseText, { max: 100, label: 'ชั้น' }).value;
  const spot = read('spot', parseText, { max: 150, label: 'จุดติดตั้ง' }).value;
  const serial = read('serial', parseText, { max: 100, label: 'ซีเรียล' }).value;
  const scentName = read('scentName', parseText, { max: 150, label: 'กลิ่น' }).value;
  const note = read('note', parseText, { max: 1000, label: 'หมายเหตุ' }).value;

  const settings = {};
  if (kind === 'diffuser') {
    if (workPause) { settings.workSec = workPause.workSec; settings.pauseSec = workPause.pauseSec; }
    if (grade) settings.grade = grade;
    if (schedule) settings.schedule = schedule;
  }

  const assets = [];
  const qty = count.value;
  const perUnit = kind === 'diffuser';
  if (qty !== null && qty > 0) {
    if (perUnit && qty > MAX_ASSETS_PER_ROW) {
      issues.push({
        field: 'จำนวนเครื่อง',
        message: `${qty} เครื่องในบรรทัดเดียวเกินเพดาน ${MAX_ASSETS_PER_ROW} — ตรวจว่ากรอกถูกช่องหรือแยกบรรทัด`,
        raw: String(qty),
      });
    } else if (perUnit) {
      // ⭐ diffuser = 1 แถว 1 เครื่อง (มติสี่หน่วย §2A.1) · ชีตเก่าให้มาแค่ "8 เครื่อง"
      //   ⇒ สร้างแถวเปล่าไว้รอช่างเติมรายละเอียดตอนเข้าไซต์ครั้งแรก
      if (serial && qty > 1) {
        issues.push({ field: 'ซีเรียล', message: `มีซีเรียลเดียวแต่ ${qty} เครื่อง — ใส่ซีเรียลได้เฉพาะบรรทัดที่มีเครื่องเดียว`, raw: serial });
      }
      for (let i = 1; i <= qty; i += 1) {
        assets.push({
          kind, label: qty === 1 ? (spot || 'เครื่องที่ 1') : `เครื่องที่ ${i}`,
          qty: null, serial: qty === 1 ? serial : null,
          model, colour, floor, spot, productName: scentName, bottleMl,
          installedAt, status: 'active', settings, note,
        });
      }
    } else {
      // reed/soap/alcohol = 1 แถว + จำนวนจุด (242 แถวคือขยะ)
      assets.push({
        kind, label: spot || zoneName || 'ชุดอุปกรณ์', qty, serial: null,
        model, colour, floor, spot, productName: scentName, bottleMl,
        installedAt, status: 'active', settings, note,
      });
    }
  }
  if (pending) {
    issues.push({ field: 'จำนวนเครื่อง', message: 'ชีตระบุ “รอติดตั้ง” — ยังไม่สร้างเครื่อง สร้างเฉพาะไซต์/โซน', raw: count.raw });
  }

  // ── ค่าที่ติดมากับรายงาน ไม่ลงฐาน ──
  const packStd = parsePacks(take(row, map, 'packStd')).value;
  const packSm = parsePacks(take(row, map, 'packSm')).value;
  const packsDirect = parsePacks(take(row, map, 'packs')).value;
  const mlPerMonth = parseVolumeMl(take(row, map, 'mlPerMonth'));
  const carried = {
    packs: packStdEquivalent(packStd, packSm) ?? packsDirect ?? null,
    mlPerMonth: mlPerMonth.value,
    mlPerMonthRaw: mlPerMonth.issue ? mlPerMonth.raw : null,
    contractStart: parseImportDate(take(row, map, 'contractStart')).value,
    contractEnd: parseImportDate(take(row, map, 'contractEnd')).value,
  };

  return {
    rowNumber,
    customerName,
    site,
    zone: zoneName ? { name: zoneName } : null,
    assets,
    carried,
    issues,
  };
}

/* ทั้งชีต → ร่างทุกแถว (ข้ามแถวว่างล้วน) */
export function buildDrafts(rows = [], map = {}, { startRow = 2 } = {}) {
  const drafts = [];
  rows.forEach((row, index) => {
    if (!row || row.every((cell) => isBlankCell(cell))) return;
    drafts.push(buildDraft(row, map, { rowNumber: startRow + index }));
  });
  return drafts;
}
