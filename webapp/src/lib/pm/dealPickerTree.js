// ── ตัวเลือกดีลแบบสองชั้น (โครงการ → ดีล) — ตรรกะล้วน ────────────────────────
//
// ⭐ ทำไมเป็นสองชั้น (มติผู้ใช้ 2026-08-06): ลิสต์ดีลบน prod ยาวเป็นร้อยใบ ชั้นเดียว
// ต้องเลื่อนยาวหรือรู้ชื่อดีลก่อนถึงจะค้นได้ · เวลาทำงานจริงคนคิดเป็น "โครงการนี้มีดีล
// อะไรบ้าง" แผงซ้ายจึงเป็นโครงการพร้อมจำนวนดีล แผงขวาเป็นดีลของโครงการนั้น
// แพตเทิร์นเดียวกับปุ่มตัวกรอง (components/ui/FilterPopover) ที่คนในระบบคุ้นอยู่แล้ว
//
// ถังพิเศษสองใบที่ต้องมีเสมอ:
//   · "ดีลทั้งหมด"        — คนที่จำได้แค่ชื่อดีลต้องค้นข้ามโครงการได้ในคลิกเดียว
//   · "ยังไม่ผูกโครงการ"  — ดีลกลุ่มนี้มีจริงและผูกงานได้ ถ้าไม่มีถังมันจะหายไปเฉย ๆ

export const ALL_DEALS_BUCKET = '__all_deals__';
export const NO_PROJECT_BUCKET = '__no_project__';

export const projectLabelOf = (project) => (project
  ? `${project.code ? `${project.code} · ` : ''}${project.name || ''}`.trim()
  : '');

/** ข้อความที่ใช้ค้นดีลหนึ่งใบ — รวมชื่อโครงการด้วย เพื่อให้พิมพ์รหัสโครงการแล้วเจอดีล */
export const dealSearchText = (deal, projectLabel = '') => [
  deal?.code, deal?.title, deal?.customerName, deal?.forecastMonth, projectLabel,
].filter(Boolean).join(' ');

/** ข้อความที่ใช้ค้นโครงการ — รหัส ชื่อโครงการ **และชื่อลูกค้า** (มติผู้ใช้ 2026-08-06) */
export const projectSearchText = (project) => [
  project?.code, project?.name, project?.customerName,
].filter(Boolean).join(' ');

// คำค้นหลายคำ = ต้องเจอ **ทุกคำ** (ไม่ใช่ทั้งประโยคติดกัน) — คนพิมพ์ "rinvala 2026-08"
// โดยคาดว่าจะได้ดีลรินวาลาของเดือนนั้น ไม่ใช่ผลลัพธ์ว่างเพราะสองคำนี้ไม่ติดกันในข้อความ
const matches = (text, needle) => {
  const hay = String(text || '').toLocaleLowerCase('th');
  return String(needle || '')
    .toLocaleLowerCase('th')
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => hay.includes(token));
};

/**
 * ถังฝั่งซ้าย: ดีลทั้งหมด → โครงการ (เรียงตามป้ายที่คนเห็น) → ยังไม่ผูกโครงการ
 * โครงการที่ไม่มีดีลไม่ถูกใส่มา — ถังที่เปิดแล้วว่างเปล่าคือคำโกหกว่ามีของให้เลือก
 */
export function buildDealBuckets(deals = [], projects = []) {
  const byProject = new Map();
  for (const deal of deals) {
    const key = deal.projectId || NO_PROJECT_BUCKET;
    if (!byProject.has(key)) byProject.set(key, []);
    byProject.get(key).push(deal);
  }

  const projectBuckets = [...byProject.entries()]
    .filter(([key]) => key !== NO_PROJECT_BUCKET)
    .map(([key, rows]) => {
      const project = projects.find((p) => p.id === key);
      return {
        key,
        // โครงการที่อยู่นอกรายการที่โหลดมา (ทีมอื่น) ยังต้องมีถังให้ดีลของมันอยู่
        label: projectLabelOf(project) || 'โครงการอื่น',
        // แยก code/name ออกจาก label เพราะแผงซ้ายวางคนละบรรทัด: ชื่อโครงการได้เต็ม
        // บรรทัด ส่วนรหัส (ยาวและหน้าตาคล้ายกันทุกใบ) ลงไปอยู่บรรทัดรองคู่กับลูกค้า
        code: project?.code || '',
        name: project?.name || '',
        // ชื่อลูกค้าโชว์เป็นบรรทัดรอง — โครงการชื่อคล้ายกันแยกออกได้ด้วยลูกค้า
        // (ไม่มีในโครงการนอกลิสต์ → fallback เป็นลูกค้าของดีลใบแรกในถัง)
        customerName: project?.customerName || rows.find((row) => row.customerName)?.customerName || '',
        search: `${projectSearchText(project)} ${rows.map((row) => row.customerName).filter(Boolean).join(' ')}`,
        deals: rows,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'th'));

  const unlinked = byProject.get(NO_PROJECT_BUCKET) || [];
  return [
    { key: ALL_DEALS_BUCKET, label: 'ดีลทั้งหมด', search: 'ดีลทั้งหมด all', deals },
    ...projectBuckets,
    ...(unlinked.length
      ? [{ key: NO_PROJECT_BUCKET, label: 'ยังไม่ผูกโครงการ', search: 'ยังไม่ผูกโครงการ', deals: unlinked }]
      : []),
  ];
}

/** กรองฝั่งซ้ายด้วยคำค้น — ถัง "ดีลทั้งหมด" ไม่เคยถูกกรองทิ้ง มันคือทางออกเมื่อหาไม่เจอ */
export function filterBuckets(buckets = [], query = '') {
  const needle = query.trim();
  if (!needle) return buckets;
  return buckets.filter((bucket) => bucket.key === ALL_DEALS_BUCKET || matches(bucket.search || bucket.label, needle));
}

/** กรองฝั่งขวาด้วยคำค้น (ชื่อดีล/ลูกค้า/รหัส/เดือน FC/ชื่อโครงการ) */
export function filterDeals(deals = [], query = '', labelOf = () => '') {
  const needle = query.trim();
  if (!needle) return deals;
  return deals.filter((deal) => matches(dealSearchText(deal, labelOf(deal)), needle));
}

/** ถังที่ควรเปิดค้างไว้ตอนกางแผง — ของดีลที่เลือกอยู่ ไม่ใช่ถังแรกเสมอ */
export function initialBucketKey(deal) {
  if (!deal) return ALL_DEALS_BUCKET;
  return deal.projectId || NO_PROJECT_BUCKET;
}
