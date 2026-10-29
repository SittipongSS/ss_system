// ── ประเมินจากแบบ งวด S2a กลุ่ม E: จอหน้างาน — รายการพื้นที่ · หน้าพื้นที่ · แถบของช่าง · กล่องส่งงาน · แผงแบบจากฝ่ายขาย ──
//
// ⭐ สามคนดู ใบเดียว (แผน survey-desk-assessment §3.4):
//   หัวหน้า   (`canDecide`)                  เห็นทุกพื้นที่พร้อมชิปวิธี — พื้นที่จากแบบเป็นงานของเขา (ขนาด + ภาพแบบ)
//   ช่าง      (เขียนได้ ไม่ได้เคาะ · `hideDrawing`) เห็นแต่พื้นที่ที่ต้องวัด + บรรทัดบอกว่ามีอีกกี่พื้นที่ที่ไม่ต้องวัด
//   ผู้วางคิว (อ่านอย่างเดียว)               เห็นทุกพื้นที่เหมือนหัวหน้า แต่ไม่มีป้ายงานของหัวหน้าและแก้อะไรไม่ได้
//
// 🔴 **ใบลงหน้างานล้วนต้องเท่าวันนี้ทุกตัวอักษร** — `TODAY_*` ข้างล่างคือผลที่จดจาก `surveyFieldView.js` **ก่อน** งวดนี้
//   (แถวสามแบบ: ไม่มีคีย์ `method` · `method: 'onsite'` · สี่คอลัมน์ใหม่เป็น null) ⇒ แก้ค่าที่จดไว้ได้ต่อเมื่อตั้งใจเปลี่ยนจอของ
//   ใบลงหน้างาน ไม่ใช่เพราะเทสต์แดง · คีย์ที่งวดนี้เพิ่ม (`method` · `chip` · `drawingCount` · `drawingNote` · `emptyReason`)
//   ถูกถอดออกก่อนเทียบ และถูกตรึงค่าแยกไว้ข้าง ๆ
// ⚠️ ทั้งไฟล์เป็นข้อมูลล้วน — ไม่มีฐานข้อมูล ไม่มีสวิตช์ (`SURVEY_DRAWING_METHOD` อ่านได้เฉพาะใต้ `src/app/api/`)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { surveyCrewGaps, surveyZoneSavePayload } from './survey.js';
import { surveySpotSubmitReason } from './surveySpotPhotos.js';
import {
  surveyDrawingZoneView,
  surveyFieldBarView,
  surveyJobHeaderView,
  surveyNextStep,
  surveySalesDrawingsView,
  surveySheetTotalsText,
  surveyDefaultZoneId,
  surveySubmitView,
  surveyZoneFooterView,
  surveyZoneListView,
  surveyZoneNeighbors,
  surveyZoneResaveText,
  surveyZoneSections,
  surveyZoneStateBadge,
} from './surveyFieldView.js';

// ── ของตั้งต้น ────────────────────────────────────────────────────────────────
const NB = ' ';
/* ชื่อพื้นที่ตามที่ `surveyZoneTitle` คืนจริง ("ชื่อ<NBSP>· ชั้น<NBSP>05") — เทสต์อ่านเหมือนคำบนบอร์ด */
const T = (text) => text.replace(' · ชั้น ', `${NB}· ชั้น${NB}`);

const part = (id, w, l, h, label = null) => ({ id, label, widthM: w, lengthM: l, heightM: h });
const file = (docType, fileName, extra = {}) => ({ id: fileName, docType, fileName, createdAt: '2026-10-07T03:30:00.000Z', ...extra });
const wide = (name) => file('survey_wide', name);
const linkedSpot = (name, spotId) => file('survey_spot', name, { metadata: { spotId } });
/* ไฟล์ในช่องผังของพื้นที่ — อยู่บน Drive ⇒ เปิดผ่าน proxy ของระบบ (`attachmentHref`) */
const planFile = (id, fileName, mimeType) => ({
  id, docType: 'survey_plan', fileName, mimeType, driveFileId: `drv-${id}`, fileUrl: null, createdAt: '2026-10-07T04:10:00.000Z',
});

// ใบลงหน้างาน (ชุดเดียวกับบอร์ดแบบ A): Reception 8 × 6 × 3 = 48 / 144 · MD 6 × 5 × 2.8 = 30 / 84 · Treatment ยังไม่วัด · ห้องน้ำชายตัดออก
const reception = (extra = {}) => ({
  id: 'z1', zoneId: 'SZN-1', zoneCode: 'ZN-1160-10254', zoneName: 'Reception', floor: '01', status: 'ok',
  parts: [part('p1', 8, 6, 3)],
  spots: [
    { id: 's1', label: 'มุมโซฟารับแขก', note: 'ปลั๊กอยู่ใต้โซฟา' },
    { id: 's2', label: 'ข้างเคาน์เตอร์ต้อนรับ', note: null },
    { id: 's3', label: 'เสาข้างประตูกระจก', note: null },
  ],
  note: '', packageQty: null,
  surveyedAt: '2026-10-07T03:36:00.000Z', surveyedByName: 'Phuwadol Aoonnankad',
  ...extra,
});
const md = (extra = {}) => ({
  id: 'z2', zoneId: 'SZN-2', zoneCode: 'ZN-1160-10255', zoneName: 'ห้อง MD', floor: '05', status: 'ok',
  parts: [part('p2', 6, 5, 2.8)],
  spots: [{ id: 's4', label: 'ชั้นวางหลังโต๊ะทำงาน', note: null }, { id: 's5', label: 'ข้างประตูห้องน้ำ', note: null }],
  note: '', packageQty: null, surveyedAt: '2026-10-07T03:50:00.000Z', surveyedByName: 'Phuwadol Aoonnankad',
  ...extra,
});
const treatment = (extra = {}) => ({
  id: 'z3', zoneId: 'SZN-3', zoneCode: 'ZN-1160-10256', zoneName: 'ห้อง Treatment', floor: '05', status: 'ok',
  parts: [], spots: [], note: '', packageQty: null, surveyedAt: null, surveyedByName: null,
  ...extra,
});
const cutZone = () => ({ id: 'z4', zoneName: 'ห้องน้ำชาย', status: 'cut', cutReason: 'ลูกค้าไม่ให้เข้า', parts: [], spots: [] });
const receptionFiles = () => [
  wide('IMG_2031.jpg'), wide('IMG_2032.jpg'),
  linkedSpot('IMG_2033.jpg', 's1'), linkedSpot('IMG_2034.jpg', 's2'), linkedSpot('IMG_2035.jpg', 's3'),
];
/* MD: จุดที่สอง (s5) ยังไม่มีรูป ⇒ ติดด่านรูปจุด */
const mdFilesShort = () => [wide('IMG_2040.jpg'), linkedSpot('IMG_2041.jpg', 's4')];
const mdFilesFull = () => [...mdFilesShort(), linkedSpot('IMG_2042.jpg', 's5')];
const onsiteFiles = () => ({ z1: receptionFiles(), z2: mdFilesShort() });

/* แถวสามแบบของใบลงหน้างาน — ต้องได้ผลเท่ากันทั้งก้อน */
const VARIANTS = {
  'ไม่มีคีย์ method (แถวก่อน mig 0408)': (z) => z,
  "method: 'onsite'": (z) => ({ ...z, method: 'onsite' }),
  'สี่คอลัมน์ใหม่เป็น null': (z) => ({ ...z, method: null, methodReason: null, methodChangedAt: null, methodChangedByName: null }),
};
const onsiteSheet = (as = (z) => z) => [reception(), md(), treatment(), cutZone()].map(as);

const VISIT = {
  id: 'SV-1', code: 'SV-26100011', status: 'in_progress', scheduledDate: '2026-10-07',
  startTime: '10:00:00', endTime: null, actualStartTime: '10:12:00', actualEndTime: null,
  assigneeId: 'u-pa', assigneeName: 'Phuwadol Aoonnankad',
};
const NOW = '2026-10-07 11:46';

// พื้นที่จากแบบ — กรณี A ของบอร์ด B1 (RQ-AS-26100345 · ประเมินจากแบบทั้งใบ 3 พื้นที่)
const drawing = (zone) => ({
  status: 'ok', spots: [], note: '', packageQty: null,
  method: 'drawing', methodReason: 'ฝ่ายขายขอประเมินจากแบบ',
  methodChangedAt: '2026-10-07T02:00:00.000Z', methodChangedByName: 'Arnon Aunsapwilai',
  ...zone,
});
const lobby = (extra = {}) => drawing({
  id: 'd1', zoneId: 'SZN-11', zoneCode: 'ZN-1188-10301', zoneName: 'โถงต้อนรับ', floor: '1',
  parts: [part('dp1', 8, 6, 3)], surveyedAt: '2026-10-07T04:00:00.000Z', surveyedByName: 'Arnon Aunsapwilai', ...extra,
});
const shop = (extra = {}) => drawing({
  id: 'd2', zoneId: 'SZN-12', zoneCode: 'ZN-1188-10302', zoneName: 'โซนขายหน้าร้าน', floor: '1',
  parts: [part('dp2', 12, 10, 4)], surveyedAt: '2026-10-07T04:20:00.000Z', surveyedByName: 'Arnon Aunsapwilai', ...extra,
});
const restroom = (extra = {}) => drawing({
  id: 'd3', zoneId: 'SZN-13', zoneCode: 'ZN-1188-10303', zoneName: 'ห้องน้ำลูกค้า', floor: '2',
  parts: [], surveyedAt: null, surveyedByName: null, ...extra,
});
const caseA = () => [lobby(), shop(), restroom()];
const caseAFiles = () => ({ d1: [planFile('ATT-21', 'แปลนชั้น 1 (โถง).jpg', 'image/jpeg')] });

/* ไฟล์แนบของคำร้องตามที่ GET ใบประเมินส่ง (`surveyRequestFileRows`) — กรณี A: แปลนสองรูป + PDF หนึ่งไฟล์ ลงมาเป็น `other` */
const requestFile = (id, fileName, mimeType, extra = {}) => ({
  id, docType: 'other', fileName, mimeType, sizeBytes: 1800000, driveFileId: `drv-${id}`, fileUrl: null,
  createdAt: '2026-10-07T01:00:00.000Z', uploadedByName: 'Lalida Chaiwanna', kind: null, ...extra,
});
const salesFiles = () => [
  requestFile('ATT-1', 'แปลนชั้น 1.jpg', 'image/jpeg'),
  requestFile('ATT-2', 'แปลนชั้น 2.jpg', 'image/jpeg'),
  requestFile('ATT-3', 'แบบตกแต่งทั้งร้าน.pdf', 'application/pdf'),
];
/* ไฟล์ในเธรดของคำร้องตามที่ GET ส่ง (`surveyThreadFileRows` ของกลุ่ม C) — ไม่มี `fileUrl` / `driveFileId` */
const threadFile = (updateId, index, fileName, mimeType) => ({
  updateId, index, fileName, mimeType, sizeBytes: 900000, createdAt: '2026-10-07T05:00:00.000Z', authorName: 'Lalida Chaiwanna',
});

// ใบผสม: Reception (ลงหน้างาน) · โซนขายหน้าร้าน (จากแบบ — อยู่กลางใบ) · ห้อง MD (ลงหน้างาน)
const mixedSheet = () => [reception(), shop(), md()];
/* พื้นที่จากแบบยังมีของเก่าจากตอนลงหน้างานค้างอยู่ (ภาพกว้าง 1 · จุด 2) — ต้องไม่เข้ายอดของงานที่ช่างส่ง */
const shopOld = () => shop({
  spots: [{ id: 'ds1', label: 'ข้างเคาน์เตอร์แคชเชียร์', note: null }, { id: 'ds2', label: 'เสากลางร้าน', note: null }],
});
const mixedFiles = ({ mdFull = true } = {}) => ({
  z1: receptionFiles(),
  z2: mdFull ? mdFilesFull() : mdFilesShort(),
  d2: [wide('IMG_1900.jpg')],
});

/* ถอดคีย์ที่งวดนี้เพิ่ม — ที่เหลือคือของวันนี้ */
const withoutMethodKeys = (rows) => rows.map(({ method, chip, addedLabel, ...rest }) => rest);

// ── ค่าที่จดจาก surveyFieldView.js ก่อนงวด S2a (ใบลงหน้างานล้วน · นัดกำลังทำ) ─────────────────────────
const mark = (key, label, ok, value) => ({ key, label, ok, value });
const NO_TAGS = { added: false, cut: false, sentBack: false, headPending: false, editing: false };
/* หัวหน้า · สองบาน · เปิดห้อง Treatment ค้างค่าอยู่ */
const TODAY_LIST_HEAD = {
  rows: [
    {
      id: 'z1', index: 1, code: 'ZN-1160-10254', codeUnknown: false, name: 'Reception', title: T('Reception · ชั้น 01'),
      state: 'done', selected: false, areaText: '48 ตร.ม.', sizeText: '48 ตร.ม. · 144 ลบ.ม.',
      marks: [mark('size', 'ขนาด', true, '48 ตร.ม.'), mark('wide', 'ภาพกว้าง', true, 2), mark('spots', 'จุด', true, 3)],
      missingText: null, spotNote: null, detail: 'marks', cutReason: null,
      tags: { ...NO_TAGS, headPending: true },
    },
    {
      id: 'z2', index: 2, code: 'ZN-1160-10255', codeUnknown: false, name: 'ห้อง MD', title: T('ห้อง MD · ชั้น 05'),
      state: 'todo', selected: false, areaText: '30 ตร.ม.', sizeText: '30 ตร.ม. · 84 ลบ.ม.',
      marks: [mark('size', 'ขนาด', true, '30 ตร.ม.'), mark('wide', 'ภาพกว้าง', true, 1), mark('spots', 'จุด', true, 2)],
      missingText: 'จุด 2.2 ยังไม่มีรูป', spotNote: 'จุด 2.2 ยังไม่มีรูป', detail: 'missing', cutReason: null,
      tags: NO_TAGS,
    },
    {
      id: 'z3', index: 3, code: 'ZN-1160-10256', codeUnknown: false, name: 'ห้อง Treatment', title: T('ห้อง Treatment · ชั้น 05'),
      state: 'todo', selected: true, areaText: null, sizeText: null,
      marks: [mark('size', 'ขนาด', false, null), mark('wide', 'ภาพกว้าง', false, null), mark('spots', 'จุด', false, null)],
      missingText: 'ขาด: ขนาด · ภาพกว้าง · จุด', spotNote: null, detail: 'missing', cutReason: null,
      tags: { ...NO_TAGS, editing: true },
    },
    {
      id: 'z4', index: 4, code: null, codeUnknown: false, name: 'ห้องน้ำชาย', title: 'ห้องน้ำชาย',
      state: 'cut', selected: false, areaText: null, sizeText: null,
      marks: [], missingText: null, spotNote: null, detail: 'cut', cutReason: 'ลูกค้าไม่ให้เข้า',
      tags: { ...NO_TAGS, cut: true },
    },
  ],
  progress: { total: 3, done: 2, complete: false },
  progressText: 'วัดแล้ว 2 / 3 พื้นที่',
  leftNames: ['ห้อง Treatment'],
};
/* ช่าง · หน้าเดียว — ต่างจากของหัวหน้าสามจุด: ไม่มีป้ายงานของหัวหน้า · ไม่มีแถวที่เลือก · ไม่มีป้ายกำลังแก้ */
const TODAY_LIST_CREW = {
  ...TODAY_LIST_HEAD,
  rows: TODAY_LIST_HEAD.rows.map((row) => ({ ...row, selected: false, tags: { ...row.tags, headPending: false, editing: false } })),
};
const HEAD_LIST = { canDecide: true, split: true, selectedZoneId: 'z3', dirtyZoneId: 'z3', visit: VISIT };
const CREW_LIST = { canDecide: false, visit: VISIT };

const TODAY_SUBMIT_ROWS = [
  {
    id: 'z1', code: 'ZN-1160-10254', codeUnknown: false, name: 'Reception', title: T('Reception · ชั้น 01'), state: 'ok',
    figures: '48 ตร.ม. · 144 ลบ.ม.', counts: 'ภาพกว้าง 2 · จุด 3', note: null, go: false, wide: 2, spots: 3, kept: true,
  },
  {
    id: 'z2', code: 'ZN-1160-10255', codeUnknown: false, name: 'ห้อง MD', title: T('ห้อง MD · ชั้น 05'), state: 'miss',
    figures: '30 ตร.ม. · 84 ลบ.ม.', counts: 'ภาพกว้าง 1 · จุด 2', note: 'จุด 2.2 ยังไม่มีรูป', go: true, wide: 1, spots: 2, kept: true,
  },
  {
    id: 'z3', code: 'ZN-1160-10256', codeUnknown: false, name: 'ห้อง Treatment', title: T('ห้อง Treatment · ชั้น 05'), state: 'miss',
    figures: null, counts: 'ภาพกว้าง 0 · จุด 0', note: 'ขาด: ขนาด · ภาพกว้าง · จุด', go: true, wide: 0, spots: 0, kept: false,
  },
  {
    id: 'z4', code: null, codeUnknown: false, name: 'ห้องน้ำชาย', title: 'ห้องน้ำชาย', state: 'cut',
    figures: null, counts: null, note: 'ตัดออก — ไม่ต้องวัด', go: false, wide: 0, spots: 0, kept: false,
  },
];
const TODAY_SUBMIT_CREW = {
  title: 'ส่งงาน · SV-26100011',
  statusLabel: 'กำลังทำ',
  rows: TODAY_SUBMIT_ROWS,
  progressText: 'วัดแล้ว 2 / 3 พื้นที่',
  totals: { zones: 3, areaSqm: 78, volumeCbm: 228, wide: 3, spots: 5 },
  totalsText: { label: 'รวม 3 พื้นที่', figures: '78 ตร.ม. · 228 ลบ.ม.', counts: 'ภาพกว้าง 3 · จุด 5' },
  effects: [
    { key: 'close', code: 'SV-26100011', text: 'ปิดนัด SV-26100011 เป็น “เข้าแล้ว” (10:12–11:46)' },
    { key: 'notify', text: 'แจ้งหัวหน้า TS ให้เคาะจุดติดตั้งและแพ็คเกจ' },
    { key: 'edit', text: 'ยังแก้ผลวัดได้จนกว่าหัวหน้าจะส่งผลให้ฝ่ายขาย' },
  ],
  effectsCaption: 'กรณีเข้าพื้นที่ได้',
  enteredBlocker: null,
  blocker: 'ยังขาดผลวัด 2 พื้นที่ — กด “ไปแก้” หรือ “ตัดพื้นที่นี้ออก”',
  outcome: { tone: 'warn', text: 'ยังขาดผลวัด 2 พื้นที่ — กด “ไปแก้” หรือ “ตัดพื้นที่นี้ออก”' },
};
/* หัวหน้าส่งแทนช่าง · ห้อง MD มีค่าค้าง */
const TODAY_SUBMIT_HEAD = {
  ...TODAY_SUBMIT_CREW,
  rows: TODAY_SUBMIT_ROWS.map((row) => (row.id === 'z2' ? { ...row, state: 'dirty', note: 'ยังไม่บันทึก' } : row)),
  effects: [
    { key: 'close', code: 'SV-26100011', text: 'ปิดนัด SV-26100011 เป็น “เข้าแล้ว” (10:12–11:46)' },
    { key: 'notify', text: 'ส่งแทนช่าง — แจ้งหัวหน้า TS คนอื่นว่าช่างส่งงานแล้ว' },
    { key: 'next', text: 'คุณเคาะจุดติดตั้งและแพ็คเกจต่อได้ที่แท็บสรุปส่งผล' },
  ],
  blocker: 'มีค่าที่ยังไม่บันทึก: ห้อง MD — กด “บันทึกพื้นที่นี้” ก่อนส่งงาน',
  outcome: { tone: 'warn', text: 'มีค่าที่ยังไม่บันทึก: ห้อง MD — กด “บันทึกพื้นที่นี้” ก่อนส่งงาน' },
};
const TODAY_BAR_EMPTY = {
  label: 'งานของนัด SV-26100011', tone: 'plain', head: 'ยังไม่มีพื้นที่ให้วัด',
  sub: 'เพิ่มพื้นที่ที่เจอหน้างาน หรือเลือก “ไปแล้วเข้าไม่ได้”', sticky: true, late: false,
  action: { key: 'submit', label: 'ส่งงาน', blocker: 'ใบนี้ยังไม่มีพื้นที่ให้วัด', emphasis: 'quiet', gated: false },
};

// ══ ① ใบลงหน้างานล้วน = วันนี้ทุกตัวอักษร ══════════════════════════════════════════════════════

for (const [name, as] of Object.entries(VARIANTS)) {
  test(`🔴 รายการพื้นที่ของใบลงหน้างานล้วนเท่าวันนี้ — ${name}`, () => {
    const cases = [
      ['หัวหน้า', HEAD_LIST, TODAY_LIST_HEAD],
      ['ช่าง', CREW_LIST, TODAY_LIST_CREW],
      ['ช่าง (hideDrawing)', { ...CREW_LIST, hideDrawing: true }, TODAY_LIST_CREW],
    ];
    for (const [who, input, today] of cases) {
      const view = surveyZoneListView({ zones: onsiteSheet(as), filesByZone: onsiteFiles(), ...input });
      const { rows, drawingCount, drawingNote, emptyReason, ...rest } = view;
      assert.deepEqual(withoutMethodKeys(rows), today.rows, who);
      assert.deepEqual(rest, { progress: today.progress, progressText: today.progressText, leftNames: today.leftNames }, who);
      // คีย์ใหม่ของงวดนี้: ไม่มีชิปสักแถว ไม่มีบรรทัดของช่าง — จอของใบลงหน้างานไม่มีอะไรโผล่เพิ่ม
      assert.deepEqual(rows.map((r) => [r.method, r.chip]), rows.map(() => ['onsite', null]), who);
      // ป้ายที่มาของพื้นที่: ใบตัวอย่างไม่มีแถวที่ถูกเพิ่ม — ไม่มีคำไหนโผล่
      assert.deepEqual(rows.map((r) => r.addedLabel), rows.map(() => null), who);
      assert.deepEqual([drawingCount, drawingNote, emptyReason], [0, null, null], who);
      assert.deepEqual(Object.keys(view.progress), ['total', 'done', 'complete'], 'ไม่มีคีย์ drawing บนใบลงหน้างาน');
    }
  });

  test(`🔴 กล่องส่งงาน · บรรทัดรวม · แถบ ของใบลงหน้างานล้วนเท่าวันนี้ — ${name}`, () => {
    const base = { outcome: 'entered', visit: VISIT, zones: onsiteSheet(as), filesByZone: onsiteFiles(), nowKey: NOW };
    assert.deepEqual(surveySubmitView(base), TODAY_SUBMIT_CREW);
    assert.deepEqual(surveySubmitView({ ...base, viewerKind: 'head', dirtyZoneIds: ['z2'] }), TODAY_SUBMIT_HEAD);
    for (const hideDrawing of [undefined, false, true]) {
      assert.equal(surveySheetTotalsText({ zones: onsiteSheet(as), filesByZone: onsiteFiles(), hideDrawing }),
        'รวม 78 ตร.ม. · 228 ลบ.ม. · ภาพกว้าง 3 · จุด 5', `hideDrawing = ${hideDrawing}`);
    }
  });
}

test('🔴 แถบของช่างบนใบที่ไม่มีพื้นที่เลยยังบอก "ยังไม่มีพื้นที่ให้วัด" — ทั้งรูป progress เดิมและรูปที่มี drawing: 0', () => {
  assert.deepEqual(surveyFieldBarView({ visit: VISIT, progress: { done: 0, total: 0, cut: 0 }, nowKey: NOW }), TODAY_BAR_EMPTY);
  assert.deepEqual(surveyFieldBarView({ visit: VISIT, progress: { done: 0, total: 0, cut: 0, drawing: 0 }, nowKey: NOW }), TODAY_BAR_EMPTY,
    'การ์ดควบคุมส่ง `drawing: 0` มาเสมอ (กลุ่ม D) — ศูนย์ต้องไม่ปลดด่าน');
  assert.deepEqual(surveyFieldBarView({ visit: VISIT, progress: null, nowKey: NOW }), TODAY_BAR_EMPTY);
});

// ══ ② รายการพื้นที่: ใบผสม ══════════════════════════════════════════════════════════════════

test('ใบผสม · ช่าง (hideDrawing): เห็นสองแถวที่ต้องวัด + บรรทัด "อีก 1 พื้นที่หัวหน้าประเมินจากแบบ — ไม่ต้องวัด"', () => {
  const view = surveyZoneListView({ zones: mixedSheet(), filesByZone: mixedFiles(), ...CREW_LIST, hideDrawing: true });
  assert.deepEqual(view.rows.map((r) => r.id), ['z1', 'z2'], 'พื้นที่จากแบบไม่อยู่ในรายการของช่าง');
  /* มติเจ้าของ S2b-O6 (19/10): เลขแถว = ลำดับในใบ ตรงกับเลขจุด "จุด 3.2" — ห้อง MD เป็นพื้นที่ที่สามของใบ (เดิมนับเฉพาะแถวที่เห็น = 2) */
  assert.deepEqual(view.rows.map((r) => r.index), [1, 3], 'เลขแถวเป็นลำดับในใบ — เลขข้ามได้ บรรทัด drawingNote บอกเหตุ');
  assert.deepEqual(view.rows.map((r) => r.state), ['done', 'done']);
  assert.deepEqual(view.rows.map((r) => [r.method, r.chip]), [['onsite', 'ลงหน้างาน'], ['onsite', 'ลงหน้างาน']],
    'ชิปตามกติกาเดียวกับจอหัวหน้า (ใบมีพื้นที่จากแบบ) — จอของช่างจะวาดหรือไม่เป็นเรื่องของงวด S2b');
  assert.equal(view.drawingNote, 'อีก 1 พื้นที่หัวหน้าประเมินจากแบบ — ไม่ต้องวัด');
  assert.equal(view.drawingCount, 1);
  assert.equal(view.emptyReason, null, 'ยังมีพื้นที่ให้วัด');
  assert.equal(view.progressText, 'วัดแล้ว 2 / 2 พื้นที่ · จากแบบ 1');
  assert.deepEqual(view.progress, { total: 2, done: 2, complete: true, drawing: 1 });
  assert.deepEqual(view.leftNames, []);
  assert.equal(view.rows.some((r) => r.tags.headPending), false);
});

test('ใบผสม · หัวหน้า: สามแถวพร้อมชิป ลงหน้างาน / จากแบบ · ไม่มีบรรทัดของช่าง · พื้นที่จากแบบไม่เข้า "ยังขาด" ของแถบ', () => {
  const view = surveyZoneListView({ zones: mixedSheet(), filesByZone: mixedFiles(), canDecide: true, visit: VISIT });
  assert.deepEqual(view.rows.map((r) => [r.id, r.index, r.method, r.chip]), [
    ['z1', 1, 'onsite', 'ลงหน้างาน'],
    ['d2', 2, 'drawing', 'จากแบบ'],
    ['z2', 3, 'onsite', 'ลงหน้างาน'],
  ]);
  assert.equal(view.drawingNote, null);
  assert.equal(view.emptyReason, null);
  assert.equal(view.drawingCount, 1);
  assert.equal(view.progressText, 'วัดแล้ว 2 / 2 พื้นที่ · จากแบบ 1', 'พื้นที่จากแบบไม่ถูกเรียกว่า "วัดแล้ว"');

  // พื้นที่จากแบบ: ขนาดบันทึกแล้ว ยังไม่มีภาพแบบ ⇒ ยังไม่ครบ — แต่ไม่ใช่ของที่ช่างต้องไปเก็บ
  const row = view.rows[1];
  assert.equal(row.state, 'todo');
  assert.deepEqual(row.marks, [mark('size', 'ขนาด', true, '120 ตร.ม.'), mark('plan', 'ภาพแบบ', false, null)]);
  assert.equal(row.missingText, 'ขาด: ภาพแบบ');
  assert.equal(row.detail, 'missing', 'นัดเริ่มแล้ว — แถวที่ยังขาดเล่าเป็นบรรทัด "ขาด: …" เหมือนแถวลงหน้างานบนรายการเดียวกัน');
  assert.deepEqual(view.leftNames, [], '🔴 แถบของช่างอ่านลิสต์นี้เป็น "ยังขาด …" — พื้นที่จากแบบไม่มีข้อของช่าง');
});

test('ใบผสม · ผู้วางคิว (อ่านอย่างเดียว): เห็นทุกพื้นที่พร้อมชิป แต่ไม่มีป้ายงานของหัวหน้า', () => {
  const zones = [reception(), lobby(), md()];
  const files = { ...mixedFiles(), ...caseAFiles() };
  const planner = surveyZoneListView({ zones, filesByZone: files, canDecide: false, visit: VISIT });
  assert.deepEqual(planner.rows.map((r) => [r.id, r.chip, r.state]), [
    ['z1', 'ลงหน้างาน', 'done'], ['d1', 'จากแบบ', 'done'], ['z2', 'ลงหน้างาน', 'done'],
  ]);
  assert.equal(planner.drawingNote, null);
  assert.equal(planner.rows.some((r) => r.tags.headPending), false);
  const head = surveyZoneListView({ zones, filesByZone: files, canDecide: true, visit: VISIT });
  assert.deepEqual(head.rows.map((r) => r.tags.headPending), [true, true, true]);
});

test('ใบผสม: เลขจุดในหมายเหตุยังเป็นลำดับในใบ (ตัวเดียวกับ route ปิดนัด) — ไม่เลื่อนตามแถวที่ซ่อนจากช่าง', () => {
  const files = mixedFiles({ mdFull: false });
  const crew = surveyZoneListView({ zones: mixedSheet(), filesByZone: files, ...CREW_LIST, hideDrawing: true });
  const row = crew.rows[1];
  assert.deepEqual([row.id, row.index, row.state], ['z2', 3, 'todo'], 'เลขแถวตรงกับเลขจุดในหมายเหตุ (มติ S2b-O6)');
  assert.equal(row.spotNote, 'จุด 3.2 ยังไม่มีรูป', 'ห้อง MD เป็นพื้นที่ที่สามของใบ');
  assert.equal(surveySpotSubmitReason(mixedSheet(), files), 'ห้อง MD · จุด 3.2 ยังไม่มีรูป', 'แถบและ route พูดเลขเดียวกับแถว');
  assert.deepEqual(crew.leftNames, [], 'ขาดแค่รูปจุดไม่อยู่ใน "ยังขาด" (กติกาเดิม)');
});

test('ใบผสม: ชื่อในประโยคของแถวช่างสะกดจากทั้งใบ — ชื่อฐานซ้ำกับพื้นที่จากแบบที่ซ่อนอยู่ = ยังใช้หัวเต็ม', () => {
  const zones = [reception(), drawing({ id: 'd9', zoneName: 'Reception', floor: '02', parts: [] })];
  const crew = surveyZoneListView({ zones, filesByZone: { z1: receptionFiles() }, ...CREW_LIST, hideDrawing: true });
  const submit = surveySubmitView({ outcome: 'entered', visit: VISIT, zones, filesByZone: { z1: receptionFiles() }, nowKey: NOW });
  assert.equal(crew.rows[0].name, T('Reception · ชั้น 01'));
  assert.equal(submit.rows[0].name, crew.rows[0].name, 'รายการ · กล่องส่งงาน · "ถัดไป" ใช้ตัวสะกดเดียวกัน');
});

// ══ ③ รายการพื้นที่: จากแบบทั้งใบ (กรณี A · บอร์ด B1) ═══════════════════════════════════════════

test('จากแบบทั้งใบ · หัวหน้า (B1): โถงต้อนรับครบ · โซนขายหน้าร้านมีขนาดยังไม่มีภาพแบบ · ห้องน้ำลูกค้ายังว่าง', () => {
  const view = surveyZoneListView({ zones: caseA(), filesByZone: caseAFiles(), canDecide: true, split: true, selectedZoneId: 'd2' });
  const [r1, r2, r3] = view.rows;

  assert.deepEqual([r1.code, r1.title, r1.state, r1.chip, r1.method], ['ZN-1188-10301', T('โถงต้อนรับ · ชั้น 1'), 'done', 'จากแบบ', 'drawing']);
  assert.deepEqual(r1.marks, [mark('size', 'ขนาด', true, '48 ตร.ม.'), mark('plan', 'ภาพแบบ', true, 1)]);
  assert.equal(r1.sizeText, '48 ตร.ม. · 144 ลบ.ม.');
  assert.equal(r1.missingText, null);
  assert.equal(r1.tags.headPending, true, 'ขนาดกับภาพแบบครบแล้ว เหลือเคาะแพ็คเกจ');

  assert.deepEqual([r2.state, r2.selected, r2.areaText], ['todo', true, '120 ตร.ม.']);
  assert.deepEqual(r2.marks, [mark('size', 'ขนาด', true, '120 ตร.ม.'), mark('plan', 'ภาพแบบ', false, null)]);
  assert.equal(r2.missingText, 'ขาด: ภาพแบบ');
  assert.equal(r2.tags.headPending, false, 'แถวที่ยังขาด บรรทัด "ขาด: …" พูดอยู่แล้ว');

  assert.deepEqual([r3.state, r3.areaText, r3.sizeText], ['todo', null, null]);
  assert.deepEqual(r3.marks, [mark('size', 'ขนาด', false, null), mark('plan', 'ภาพแบบ', false, null)]);
  assert.equal(r3.missingText, 'ขาด: ขนาด · ภาพแบบ');

  for (const row of view.rows) {
    assert.equal(row.spotNote, null, 'พื้นที่จากแบบไม่มีด่านรูปจุด');
    assert.equal(row.detail, 'marks', 'ไม่มีนัด = ยังไม่มีใครต้องไปเก็บของ (วงเปล่า/ติ๊ก ตามบอร์ด)');
    assert.doesNotMatch(JSON.stringify(row.marks), /ภาพกว้าง|"จุด"/, 'ไม่มีข้อที่ต้องยืนหน้างาน');
  }
  assert.equal(view.drawingNote, null);
  assert.equal(view.emptyReason, null);
  assert.equal(view.drawingCount, 3);
  assert.deepEqual(view.progress, { total: 0, done: 0, complete: false, drawing: 3 });
  assert.equal(view.progressText, 'จากแบบ 3 พื้นที่');
  assert.deepEqual(view.leftNames, []);
});

test('พื้นที่จากแบบ: ไฟล์ผังที่ไม่ใช่ JPG/PNG ยังไม่ติ๊กภาพแบบ · เคาะแพ็คเกจแล้วป้ายงานของหัวหน้าหาย · ตัดออกแล้วไม่มีวง', () => {
  const pdfOnly = surveyZoneListView({
    zones: [lobby()], filesByZone: { d1: [planFile('ATT-22', 'แบบตกแต่ง.pdf', 'application/pdf')] }, canDecide: true,
  }).rows[0];
  assert.deepEqual(pdfOnly.marks[1], mark('plan', 'ภาพแบบ', false, 1), 'มีไฟล์หนึ่งไฟล์ แต่ลงเอกสารไม่ได้ ⇒ ยังไม่ผ่าน');
  assert.deepEqual([pdfOnly.state, pdfOnly.missingText], ['todo', 'ขาด: ภาพแบบ']);

  const decided = surveyZoneListView({
    zones: [lobby({ packageQty: 1, packageSize: 'ST' })], filesByZone: caseAFiles(), canDecide: true,
  }).rows[0];
  assert.deepEqual([decided.state, decided.tags.headPending], ['done', false]);

  const cut = surveyZoneListView({
    zones: [lobby({ status: 'cut', cutReason: 'ลูกค้ายกเลิกโซนนี้' }), shop()], filesByZone: caseAFiles(), canDecide: true,
  });
  assert.deepEqual([cut.rows[0].state, cut.rows[0].marks, cut.rows[0].missingText, cut.rows[0].cutReason],
    ['cut', [], null, 'ลูกค้ายกเลิกโซนนี้']);
  assert.equal(cut.drawingCount, 1, 'นับเฉพาะพื้นที่จากแบบที่ยังอยู่ในใบ');
  assert.equal(cut.progressText, 'จากแบบ 1 พื้นที่');
});

test('ชิปวิธีขึ้นเมื่อใบมีพื้นที่จากแบบที่ยังใช้อยู่เท่านั้น — พื้นที่จากแบบที่ตัดไปแล้วไม่ทำให้ใบลงหน้างานมีชิป', () => {
  const view = surveyZoneListView({
    zones: [reception(), shop({ status: 'cut', cutReason: 'ยังก่อสร้างไม่เสร็จ' })], filesByZone: { z1: receptionFiles() }, canDecide: true,
  });
  assert.deepEqual(view.rows.map((r) => [r.method, r.chip]), [['onsite', null], ['drawing', null]]);
  assert.equal(view.drawingCount, 0);
  assert.equal(view.progressText, 'วัดแล้ว 1 / 1 พื้นที่');
});

// ══ ④ ช่างอยู่หน้างาน หัวหน้าสลับพื้นที่สุดท้ายเป็นจากแบบ (D12) ═══════════════════════════════════

test('ช่างบนใบที่ไม่เหลือพื้นที่ลงหน้างาน: รายการว่าง + บรรทัดของช่างขึ้นแทนข้อความ "ยังไม่มีพื้นที่"', () => {
  const zones = [shop()];
  const list = surveyZoneListView({ zones, filesByZone: {}, ...CREW_LIST, hideDrawing: true });
  assert.deepEqual(list.rows, []);
  // S2b แก้หลังตรวจจอ crew-q6: ไม่มีแถวให้เห็นเลย = "ทั้ง n …" (เดิม "อีก" ไม่มีอะไรนำหน้า)
  assert.equal(list.drawingNote, 'ทั้ง 1 พื้นที่หัวหน้าประเมินจากแบบ — ไม่ต้องวัด');
  assert.equal(list.emptyReason, 'drawing');
  assert.equal(list.progressText, 'จากแบบ 1 พื้นที่');

  // พื้นที่ลงหน้างานถูกตัดหมด เหลือแต่จากแบบ — ยังมีแถวที่ตัดให้เปิดดู แต่เหตุที่ไม่มีอะไรให้วัดคือเรื่องเดียวกัน
  // ⇒ คำ "ทั้ง" ตามสัญญาณเดียวกับ `emptyReason` (แถวที่ตัดไม่ทำให้กลับเป็น "อีก" · crew-q6 รอบตรวจ)
  const allCut = surveyZoneListView({ zones: [cutZone(), shop(), restroom()], filesByZone: {}, ...CREW_LIST, hideDrawing: true });
  assert.deepEqual(allCut.rows.map((r) => [r.id, r.state]), [['z4', 'cut']]);
  assert.equal(allCut.drawingNote, 'ทั้ง 2 พื้นที่หัวหน้าประเมินจากแบบ — ไม่ต้องวัด');
  assert.equal(allCut.emptyReason, 'drawing');

  // หัวหน้า (ไม่ซ่อน) ไม่มีทั้งบรรทัดและเหตุ — เขาเห็นแถวจริง
  const head = surveyZoneListView({ zones, filesByZone: {}, canDecide: true, visit: VISIT });
  assert.deepEqual([head.rows.length, head.drawingNote, head.emptyReason], [1, null, null]);

  // ใบที่ไม่มีพื้นที่เลย = ข้อความว่างเดิมของจอ
  const none = surveyZoneListView({ zones: [], filesByZone: {}, ...CREW_LIST, hideDrawing: true });
  assert.deepEqual([none.rows, none.drawingNote, none.emptyReason, none.drawingCount], [[], null, null, 0]);
  // พื้นที่จากแบบถูกตัดหมด = ไม่มีอะไรให้ช่างรู้
  const drawingCut = surveyZoneListView({ zones: [shop({ status: 'cut' })], filesByZone: {}, ...CREW_LIST, hideDrawing: true });
  assert.deepEqual([drawingCut.rows, drawingCut.drawingNote, drawingCut.emptyReason], [[], null, null]);
});

test('แถบของช่าง: นัดกำลังทำ · ไม่เหลือพื้นที่ลงหน้างาน · มีพื้นที่จากแบบหนึ่ง = ครบสำหรับช่าง ส่งงานได้', () => {
  const zones = [shop()];
  const list = surveyZoneListView({ zones, filesByZone: {}, ...CREW_LIST, hideDrawing: true });
  const input = {
    visit: VISIT, leftNames: list.leftNames, crewGaps: surveyCrewGaps(zones, {}), spotReason: surveySpotSubmitReason(zones, {}), nowKey: NOW,
  };
  // รูปของ `surveyFieldProgress` (คีย์ drawing มีเมื่อมากกว่าศูนย์) และรูปของการ์ดควบคุม (มี cut · drawing เป็นเลขเสมอ)
  for (const progress of [list.progress, { done: 0, total: 0, complete: false, percent: 0, cut: 0, drawing: 1 }]) {
    const bar = surveyFieldBarView({ ...input, progress });
    assert.equal(bar.action.blocker, null);
    assert.deepEqual([bar.action.key, bar.action.label, bar.action.emphasis], ['submit', 'ส่งงาน', 'primary']);
    assert.deepEqual([bar.head, bar.sub], ['ครบทุกพื้นที่แล้ว', 'ส่งได้ · เริ่มงาน 10:12'], 'ยืมคำของทาง "พร้อมส่ง" เดิม — ไม่มีประโยคใหม่');
    assert.doesNotMatch(`${bar.head} ${bar.sub}`, /ยังไม่มีพื้นที่ให้วัด/);
  }
  // มีพื้นที่ลงหน้างานเหลือ = กติกาเดิมทุกข้อ
  const mixed = surveyFieldBarView({ ...input, progress: { done: 1, total: 2, cut: 0, drawing: 1 }, leftNames: ['ห้อง MD'] });
  assert.deepEqual([mixed.head, mixed.sub, mixed.action.blocker], ['ยังส่งไม่ได้', 'ยังขาด ห้อง MD', 'ยังขาด ห้อง MD']);
});

// ══ ⑤ กล่องส่งงาน + บรรทัดรวม ════════════════════════════════════════════════════════════════

test('กล่องส่งงานของใบผสม: มีแต่พื้นที่ลงหน้างานสองแถว · ยอดรวมไม่นับของพื้นที่จากแบบ — ทั้งช่างและหัวหน้า', () => {
  const zones = [reception(), shopOld(), md()];
  for (const viewerKind of ['crew', 'senior', 'head']) {
    const view = surveySubmitView({ outcome: 'entered', visit: VISIT, zones, filesByZone: mixedFiles(), viewerKind, nowKey: NOW });
    assert.equal(view.rows.length, 2, viewerKind);
    assert.deepEqual(view.rows.map((r) => r.id), ['z1', 'z2'], 'ไม่มีแถวของพื้นที่จากแบบ');
    assert.deepEqual(view.rows.map((r) => r.state), ['ok', 'ok']);
    assert.match(view.totalsText.label, /^รวม 2 พื้นที่/);
    assert.deepEqual(view.totalsText, { label: 'รวม 2 พื้นที่', figures: '78 ตร.ม. · 228 ลบ.ม.', counts: 'ภาพกว้าง 3 · จุด 5' },
      'ภาพกว้าง 1 · จุด 2 · 120 ตร.ม. ของพื้นที่จากแบบไม่เข้ายอดของงานที่ส่ง');
    assert.deepEqual(view.totals, { zones: 2, areaSqm: 78, volumeCbm: 228, wide: 3, spots: 5 });
    assert.equal(view.progressText, 'วัดแล้ว 2 / 2 พื้นที่ · จากแบบ 1');
    assert.equal(view.blocker, null, 'ของช่างครบ — พื้นที่จากแบบที่ยังไม่มีภาพแบบไม่ใช่เหตุที่ส่งงานไม่ได้');
    assert.equal(view.outcome.tone, 'ok');
  }
});

test('กล่องส่งงานของใบผสม: ด่านของช่างยังจับพื้นที่ลงหน้างานที่ขาด — เลขจุดตรงกับ route', () => {
  const short = surveySubmitView({
    outcome: 'entered', visit: VISIT, zones: mixedSheet(), filesByZone: mixedFiles({ mdFull: false }), nowKey: NOW,
  });
  assert.deepEqual(short.rows.map((r) => [r.id, r.state, r.note]), [['z1', 'ok', null], ['z2', 'miss', 'จุด 3.2 ยังไม่มีรูป']]);
  assert.match(short.blocker, /ห้อง MD · จุด 3\.2 ยังไม่มีรูป/);

  const gap = surveySubmitView({
    outcome: 'entered', visit: VISIT, zones: [reception(), shop(), treatment()], filesByZone: mixedFiles(), nowKey: NOW,
  });
  assert.equal(gap.blocker, 'ยังขาดผลวัด 1 พื้นที่ — กด “ไปแก้” หรือ “ตัดพื้นที่นี้ออก”');
  assert.equal(gap.progressText, 'วัดแล้ว 1 / 2 พื้นที่ · จากแบบ 1');

  // ค่าค้างของพื้นที่จากแบบ (หัวหน้าพิมพ์ค้างไว้) ไม่ใช่ของงานที่ส่ง — กล่องไม่มีแถวนั้นให้กด "ไปแก้"
  const dirtyDrawing = surveySubmitView({
    outcome: 'entered', visit: VISIT, zones: mixedSheet(), filesByZone: mixedFiles(), dirtyZoneIds: ['d2'], viewerKind: 'senior', nowKey: NOW,
  });
  assert.equal(dirtyDrawing.blocker, null);
});

test('กล่องส่งงาน: ไม่เหลือพื้นที่ลงหน้างานแต่มีพื้นที่จากแบบ = ไม่ติด "ยังไม่มีพื้นที่ให้วัด" · ใบที่ไม่มีพื้นที่เลยยังติดเหมือนเดิม', () => {
  const view = surveySubmitView({ outcome: 'entered', visit: VISIT, zones: [shop()], filesByZone: {}, nowKey: NOW });
  assert.deepEqual(view.rows, []);
  assert.equal(view.blocker, null);
  assert.equal(view.progressText, 'จากแบบ 1 พื้นที่');
  assert.equal(view.totals.zones, 0);
  assert.equal(view.outcome.text, 'ปิดนัด SV-26100011 เป็น “เข้าแล้ว” (10:12–11:46) · แจ้งหัวหน้า TS ให้เคาะจุดติดตั้งและแพ็คเกจ');

  const none = surveySubmitView({ outcome: 'entered', visit: VISIT, zones: [], filesByZone: {}, nowKey: NOW });
  assert.equal(none.blocker, 'ใบนี้ยังไม่มีพื้นที่ให้วัด — เพิ่มพื้นที่ที่เจอหน้างานก่อน หรือเลือก “ไปแล้วเข้าไม่ได้”');
  // ลำดับเหตุเดิมยังอยู่ก่อน: ยังไม่เลือกผลของการเข้า
  const unpicked = surveySubmitView({ outcome: null, visit: VISIT, zones: [shop()], filesByZone: {}, nowKey: NOW });
  assert.equal(unpicked.blocker, 'เลือกผลของการเข้าครั้งนี้ก่อน');
});

test('บรรทัดรวมท้ายแถบแท็บ: ซ่อนพื้นที่จากแบบ (จอช่าง) = 2 พื้นที่ เท่ากล่องส่งงาน · ไม่ซ่อน (จอหัวหน้า) = 3 พื้นที่', () => {
  const zones = [reception(), shopOld(), md()];
  const files = mixedFiles();
  const submit = surveySubmitView({ outcome: 'entered', visit: VISIT, zones, filesByZone: files, nowKey: NOW });
  const crewLine = surveySheetTotalsText({ zones, filesByZone: files, hideDrawing: true });
  assert.equal(crewLine, 'รวม 78 ตร.ม. · 228 ลบ.ม. · ภาพกว้าง 3 · จุด 5');
  assert.equal(crewLine, `รวม ${submit.totalsText.figures} · ${submit.totalsText.counts}`, 'จอเดียวกันสองที่บอกเลขเดียวกัน');
  /* งวด S2b §2.5 i — ตัวเลขพื้นที่/ปริมาตรยังเป็นของทั้งใบ (48 + 120 + 30) แต่ภาพกว้าง/จุดนับเฉพาะพื้นที่ลงหน้างาน:
     ภาพกว้างที่ค้างบนพื้นที่จากแบบ (1) กับจุดของมัน (2) ไม่ลงเอกสาร จึงไม่ถูกนับ · ต่อ "ภาพแบบ k" = รูปแบบที่ลงเอกสารได้ */
  assert.equal(surveySheetTotalsText({ zones, filesByZone: files }),
    'รวม 198 ตร.ม. · 708 ลบ.ม. · ภาพกว้าง 3 · จุด 5 · ภาพแบบ 0', 'หัวหน้า: ตัวเลขทั้งใบ · ภาพกว้าง/จุดเฉพาะลงหน้างาน');
  assert.equal(surveySheetTotalsText({ zones, filesByZone: files, hideDrawing: false }),
    surveySheetTotalsText({ zones, filesByZone: files }));
  // จากแบบทั้งใบ: จอช่างไม่มีพื้นที่ให้รวม = ไม่มีบรรทัด (ไม่ใช่ "รวม 0")
  assert.equal(surveySheetTotalsText({ zones: caseA(), filesByZone: caseAFiles(), hideDrawing: true }), null);
  // จอหัวหน้า: จากแบบทั้งใบไม่มีตัวนับภาพกว้าง/จุด (วิธีนี้ไม่ขอสองอย่างนั้น) — เหลือ "ภาพแบบ k"
  assert.equal(surveySheetTotalsText({ zones: caseA(), filesByZone: caseAFiles() }), 'รวม 168 ตร.ม. · 624 ลบ.ม. · ภาพแบบ 1');
});

test('หัวงาน (`surveyJobHeaderView`) ไม่มีตัวนับพื้นที่ของตัวเอง — ไม่มีคำว่า "วัดแล้ว" ให้เพี้ยนบนใบจากแบบ', () => {
  const view = surveyJobHeaderView({ request: { docNo: 'RQ-AS-26100345', title: 'ประเมินพื้นที่ตามแปลน' }, visit: VISIT });
  assert.deepEqual(view.facts.map((f) => f.key), ['visit', 'crew', 'access', 'note']);
  assert.doesNotMatch(JSON.stringify(view), /วัดแล้ว/);
});

// ══ ⑥ หน้าพื้นที่ของพื้นที่จากแบบ ════════════════════════════════════════════════════════════

const REJECT = 'ไฟล์นี้ลงเอกสารไม่ได้ (PDF/TIFF) — แคปเป็น PNG แล้วแนบใหม่';

test('หน้าพื้นที่จากแบบ · หัวหน้า: ทุกป้ายและคำใบ้ตามลำดับจอ — ขนาด → ภาพแบบ → จุดโดยประมาณ → หมายเหตุ · ไม่มีหัวข้อภาพกว้าง', () => {
  const files = [
    planFile('ATT-31', 'แปลนชั้น 1.jpg', 'image/jpeg'),
    planFile('ATT-32', 'แบบตกแต่งทั้งร้าน.pdf', 'application/pdf'),
    planFile('ATT-33', 'scan.tiff', 'image/tiff'),
    { ...wide('IMG_1900.jpg'), driveFileId: 'drv-w' },
    { ...linkedSpot('IMG_1901.jpg', 'ds1'), driveFileId: 'drv-s1' },
    { ...linkedSpot('IMG_1902.jpg', 'ds2'), fileUrl: 'https://files.example.test/IMG_1902.jpg' },
  ];
  const view = surveyDrawingZoneView({ zone: shopOld(), files, canDecide: true, locked: false });
  assert.deepEqual(view, {
    chip: 'ประเมินจากแบบ',
    addedLabel: null,
    editable: true,
    readOnlyReason: null,
    size: { label: 'ขนาด ก × ย × ส', hint: 'อ่านขนาดจากแบบ หรือใช้ค่าที่วัดไว้แล้ว' },
    plan: {
      label: 'ภาพแบบของพื้นที่ (บังคับ · JPG/PNG)',
      hint: 'แนบรูปแบบของพื้นที่นี้ (JPG/PNG) — มาร์กจุดหรือไม่ก็ได้',
      accept: 'image/jpeg,image/png',
      rejectText: REJECT,
      files: [
        { id: 'ATT-31', name: 'แปลนชั้น 1.jpg', href: '/api/master/attachments/ATT-31/file', printable: true, note: null },
        { id: 'ATT-32', name: 'แบบตกแต่งทั้งร้าน.pdf', href: '/api/master/attachments/ATT-32/file', printable: false, note: REJECT },
        { id: 'ATT-33', name: 'scan.tiff', href: '/api/master/attachments/ATT-33/file', printable: false, note: REJECT },
      ],
      missing: null,
    },
    spots: { label: 'จุดติดตั้งโดยประมาณ (ไม่บังคับ)', hint: 'มาร์กตำแหน่งคร่าว ๆ จากแบบได้', photos: false },
    note: { label: 'หมายเหตุพื้นที่' },
    save: { label: 'บันทึกพื้นที่นี้' },
    wide: null,
    oldFiles: {
      label: 'ไฟล์เดิมก่อนเปลี่ยนเป็นประเมินจากแบบ (3) — ไม่ลงเอกสาร',
      files: [
        { id: 'IMG_1900.jpg', name: 'IMG_1900.jpg', href: '/api/master/attachments/IMG_1900.jpg/file' },
        { id: 'IMG_1901.jpg', name: 'IMG_1901.jpg', href: '/api/master/attachments/IMG_1901.jpg/file' },
        { id: 'IMG_1902.jpg', name: 'IMG_1902.jpg', href: 'https://files.example.test/IMG_1902.jpg' },
      ],
      deleteOnly: true,
    },
  });
  assert.doesNotMatch(JSON.stringify(view), /Ctrl|วาง \(/, 'ไม่มีคำใบ้ "วาง (Ctrl+V)" ในหน้านี้');
});

test('หน้าพื้นที่จากแบบ: ไฟล์ผังที่ลงเอกสารไม่ได้ (PDF · TIFF) ไม่ปลดด่าน — ข้อความขาดเป็นคำของด่านตัวเดียวกับ server', () => {
  const GATE = 'ยังไม่มีภาพแบบของพื้นที่ (ต้องเป็นรูป JPG/PNG — ไฟล์ PDF/TIFF ลงเอกสารไม่ได้)';
  const blocked = surveyDrawingZoneView({
    zone: shop(),
    files: [planFile('ATT-32', 'แบบตกแต่งทั้งร้าน.pdf', 'application/pdf'), planFile('ATT-33', 'scan.tif', '')],
    canDecide: true,
  });
  assert.deepEqual(blocked.plan.files.map((f) => [f.printable, f.note]), [[false, REJECT], [false, REJECT]]);
  assert.equal(blocked.plan.missing, GATE);
  assert.equal(blocked.oldFiles, null, 'ไม่มีไฟล์เดิม = ไม่มีกล่อง');

  const empty = surveyDrawingZoneView({ zone: shop(), files: [], canDecide: true });
  assert.deepEqual([empty.plan.files, empty.plan.missing, empty.oldFiles], [[], GATE, null]);

  // เบราว์เซอร์ไม่ส่งชนิดไฟล์มา = ดูนามสกุล (ตัวตัดสินเดียวกับด่าน)
  const byName = surveyDrawingZoneView({ zone: shop(), files: [planFile('ATT-34', 'Floor-2.PNG', '')], canDecide: true });
  assert.deepEqual([byName.plan.files[0].printable, byName.plan.files[0].note, byName.plan.missing], [true, null, null]);
});

test('หน้าพื้นที่จากแบบ: ผู้วางคิว/ช่างดูได้อย่างเดียวพร้อมเหตุ · ใบล็อกแล้วหัวหน้าก็แก้ไม่ได้ · พื้นที่ลงหน้างาน = null', () => {
  const planner = surveyDrawingZoneView({ zone: shop(), files: [], canDecide: false, locked: false });
  assert.equal(planner.editable, false);
  assert.equal(planner.readOnlyReason, 'พื้นที่นี้หัวหน้าประเมินจากแบบ — ไม่ต้องวัดหน้างาน');

  const locked = surveyDrawingZoneView({ zone: shop(), files: [], canDecide: true, locked: true });
  assert.deepEqual([locked.editable, locked.readOnlyReason], [false, null], 'เหตุของใบที่ล็อกอยู่ที่กล่องสถานะของใบ ไม่ซ้ำที่นี่');

  const cut = surveyDrawingZoneView({ zone: shop({ status: 'cut', cutReason: 'ยังก่อสร้าง' }), files: [], canDecide: true });
  assert.deepEqual([cut.editable, cut.plan.missing], [false, null], 'พื้นที่ที่ตัดออกแก้ไม่ได้และไม่มีด่าน');

  for (const [name, as] of Object.entries(VARIANTS)) {
    assert.equal(surveyDrawingZoneView({ zone: as(reception()), files: receptionFiles(), canDecide: true }), null, name);
  }
  assert.equal(surveyDrawingZoneView({ zone: null, files: [] }), null);
  assert.equal(surveyDrawingZoneView(), null);
});

// ══ ⑦ แผง "แบบจากฝ่ายขาย" ════════════════════════════════════════════════════════════════════

const REUSE_LABEL = 'ใช้รูปนี้เป็นภาพแบบของพื้นที่นี้';
const REUSE_NO = 'ไฟล์นี้ลงเอกสารไม่ได้ — แคปหน้าที่ต้องการเป็น PNG แล้วแนบ';
/* งวด S2b — ขนาด · คนแนบ · วันไทยของเวลาที่แนบ (แถวของ `requestFile` / `threadFile` ข้างบน) */
const SALES_META = '1.7 MB · Lalida Chaiwanna · พ. 7 ต.ค.';
const THREAD_META = '879 KB · Lalida Chaiwanna · พ. 7 ต.ค.';

test('แบบจากฝ่ายขาย (กรณี A): แปลนสองรูปใช้เป็นภาพแบบได้ · PDF กดไม่ได้พร้อมเหตุ', () => {
  const view = surveySalesDrawingsView({ requestFiles: salesFiles(), threadFiles: [], zone: shop() });
  assert.deepEqual(view, {
    label: 'แบบจากฝ่ายขาย',
    empty: null,
    unknown: false,
    countText: '3 ไฟล์',
    files: [
      {
        key: 'request:ATT-1', name: 'แปลนชั้น 1.jpg', href: '/api/master/attachments/ATT-1/file', image: true,
        source: 'request', sourceLabel: null, reuse: { label: REUSE_LABEL, enabled: true, reason: null },
        ref: { kind: 'request', attachmentId: 'ATT-1' }, typeText: 'JPG', metaText: SALES_META,
      },
      {
        key: 'request:ATT-2', name: 'แปลนชั้น 2.jpg', href: '/api/master/attachments/ATT-2/file', image: true,
        source: 'request', sourceLabel: null, reuse: { label: REUSE_LABEL, enabled: true, reason: null },
        ref: { kind: 'request', attachmentId: 'ATT-2' }, typeText: 'JPG', metaText: SALES_META,
      },
      {
        key: 'request:ATT-3', name: 'แบบตกแต่งทั้งร้าน.pdf', href: '/api/master/attachments/ATT-3/file', image: false,
        source: 'request', sourceLabel: null, reuse: { label: REUSE_LABEL, enabled: false, reason: REUSE_NO },
        ref: { kind: 'request', attachmentId: 'ATT-3' }, typeText: 'PDF', metaText: SALES_META,
      },
    ],
  });
});

test('แบบจากฝ่ายขาย: ไฟล์จากเธรดเปิดผ่าน proxy ของเธรดพร้อมป้าย "จากเธรด" · ลำดับ = ไฟล์สเปก → ไฟล์อื่นของคำร้อง → ไฟล์เธรด', () => {
  const view = surveySalesDrawingsView({
    requestFiles: [
      requestFile('ATT-1', 'รูปหน้าร้าน.jpg', 'image/jpeg'),
      requestFile('ATT-2', 'แปลนชั้น 1.png', 'image/png', { docType: 'spec' }),
      requestFile('ATT-3', 'แบบตกแต่ง.pdf', 'application/pdf'),
    ],
    threadFiles: [threadFile('EU-9', 0, 'รายการวัสดุ.xlsx', 'application/vnd.ms-excel'), threadFile('EU-9', 1, 'แปลนแก้ไข.jpg', 'image/jpeg')],
    zone: shop(),
  });
  assert.deepEqual(view.files.map((f) => f.key), ['request:ATT-2', 'request:ATT-1', 'request:ATT-3', 'thread:EU-9:0', 'thread:EU-9:1']);
  assert.deepEqual(view.files[4], {
    key: 'thread:EU-9:1', name: 'แปลนแก้ไข.jpg', href: '/api/updates/EU-9/file?i=1', image: true,
    source: 'thread', sourceLabel: 'จากเธรด', reuse: { label: REUSE_LABEL, enabled: true, reason: null },
    ref: { kind: 'thread', updateId: 'EU-9', index: 1 }, typeText: 'JPG', metaText: THREAD_META,
  });
  assert.equal(view.countText, '5 ไฟล์');
  assert.deepEqual([view.files[3].href, view.files[3].image, view.files[3].reuse.enabled, view.files[3].reuse.reason],
    ['/api/updates/EU-9/file?i=0', false, false, REUSE_NO]);
  assert.deepEqual(view.files.slice(0, 3).map((f) => f.sourceLabel), [null, null, null]);
});

test('แบบจากฝ่ายขาย: ปุ่ม "ใช้รูปนี้…" มีเฉพาะพื้นที่จากแบบที่ยังอยู่ในใบ — พื้นที่ลงหน้างานยังใช้กติกาเดิม (ไม่มีปุ่ม)', () => {
  const input = { requestFiles: salesFiles(), threadFiles: [threadFile('EU-9', 0, 'แปลนแก้ไข.jpg', 'image/jpeg')] };
  const zones = [
    ...Object.values(VARIANTS).map((as) => as(reception())),
    null, undefined,
    shop({ status: 'cut', cutReason: 'ยังก่อสร้าง' }),
  ];
  for (const zone of zones) {
    const view = surveySalesDrawingsView({ ...input, zone });
    assert.equal(view.files.length, 4);
    assert.deepEqual(view.files.map((f) => f.reuse), [null, null, null, null]);
    assert.deepEqual(view.files.map((f) => f.image), [true, true, false, true], 'รูปยังกดขยายได้เหมือนกันทุกพื้นที่');
  }
  assert.equal(surveySalesDrawingsView(input).files.every((f) => f.reuse === null), true, 'ไม่ส่งพื้นที่มา = ไม่มีปุ่ม');
});

test('แบบจากฝ่ายขาย: TIFF เบราว์เซอร์วาดไม่ขึ้น = แผ่นลิงก์เปิดแท็บใหม่ และใช้เป็นภาพแบบไม่ได้ · เอกสาร Google เปิดที่ลิงก์ของมันและไม่มีวันกดใช้ได้', () => {
  const view = surveySalesDrawingsView({
    requestFiles: [
      requestFile('ATT-4', 'scan.tiff', 'image/tiff'),
      requestFile('ATT-5', 'บรีฟหน้าร้าน', null, { kind: 'gdoc', driveFileId: null, fileUrl: 'https://docs.google.com/document/d/abc' }),
      /* แถวที่ถูกติดป้ายเอกสาร Google แต่ชื่อลงท้ายเหมือนรูป — ไม่มีไบต์ให้คัดลอก */
      requestFile('ATT-6', 'plan.png', null, { kind: 'gsheet', driveFileId: null, fileUrl: 'https://docs.google.com/spreadsheets/d/xyz' }),
      requestFile('ATT-7', 'ไม่มีที่อยู่.jpg', 'image/jpeg', { driveFileId: null, fileUrl: null }),
      { ...requestFile(null, 'ไม่มีรหัส.jpg', 'image/jpeg') },
    ],
    threadFiles: [{ index: 0, fileName: 'ไม่มีรหัสข้อความ.jpg', mimeType: 'image/jpeg' }, threadFile('EU-3', -1, 'เลขผิด.jpg', 'image/jpeg')],
    zone: shop(),
  });
  assert.deepEqual(view.files.map((f) => [f.key, f.href, f.image, f.reuse.enabled, f.reuse.reason]), [
    ['request:ATT-4', '/api/master/attachments/ATT-4/file', false, false, REUSE_NO],
    ['request:ATT-5', 'https://docs.google.com/document/d/abc', false, false, REUSE_NO],
    ['request:ATT-6', 'https://docs.google.com/spreadsheets/d/xyz', false, false, REUSE_NO],
  ], 'แถวที่ไม่มีรหัส/ไม่มีที่อยู่ให้เปิดไม่ถูกลิสต์ (ลิงก์ที่ไม่มีปลายทาง)');
});

test('แบบจากฝ่ายขาย: ไม่มีไฟล์เลย = คำชวนขอในเธรด · อ่านไม่สำเร็จ ≠ ไม่มีไฟล์', () => {
  const none = surveySalesDrawingsView({ requestFiles: [], threadFiles: [], zone: shop() });
  assert.deepEqual(none, { label: 'แบบจากฝ่ายขาย', empty: 'ยังไม่มีไฟล์แบบจากฝ่ายขาย — ขอในเธรดของคำร้อง', unknown: false, countText: '0 ไฟล์', files: [] });
  assert.deepEqual(surveySalesDrawingsView(), none);

  for (const unknown of [{ requestFiles: true }, { threadFiles: true }]) {
    const view = surveySalesDrawingsView({ requestFiles: [], threadFiles: [], zone: shop(), unknown });
    assert.deepEqual([view.unknown, view.empty, view.files], [true, null, []], '🔴 อ่านไม่ออกห้ามบอกว่า "ยังไม่มีไฟล์"');
    assert.equal(view.countText, null, 'อ่านไม่ครบ = ไม่นับ');
  }
  const partial = surveySalesDrawingsView({ requestFiles: salesFiles(), threadFiles: [], unknown: { threadFiles: true } });
  assert.deepEqual([partial.unknown, partial.empty, partial.files.length], [true, null, 3]);
});

// ══ ⑧ ยามซอร์สของไฟล์นี้ ═════════════════════════════════════════════════════════════════════

test('surveyFieldView.js ยังเป็นไฟล์ล้วน: ไม่อ่านสวิตช์ · ไม่อ่าน env · ชนิดไฟล์ของช่องภาพแบบไม่ใช้ดอกจัน · คำของวิธีไม่ถูกพิมพ์ซ้ำ', () => {
  const source = readFileSync(new URL('./surveyFieldView.js', import.meta.url), 'utf8');
  const code = source.replace(new RegExp('\\/\\*[\\s\\S]*?\\*\\/', 'g'), '').replace(/(^|\s)\/\/.*$/gm, '$1');
  assert.doesNotMatch(code, /surveyDrawingFlag|surveyDrawingMethodEnabled|SURVEY_DRAWING_METHOD|process\.env/);
  assert.doesNotMatch(code, /from ['"]next\//);
  /* ชนิดไฟล์แบบ "รูปทุกชนิด" มีทับตามด้วยดอกจัน — ตัวตัดคอมเมนต์ของยามซอร์สจออ่านเป็นจุดเปิดคอมเมนต์แล้วกลืนโค้ดที่เหลือ
     (และชุดนั้นรวม TIFF/HEIC ที่ลงเอกสารไม่ได้) ⇒ ตรวจจากซอร์สดิบ: ตัวตัดคอมเมนต์ข้างบนก็กลืนมันไปเหมือนกัน */
  assert.doesNotMatch(source, new RegExp('image/' + '\\*'));
  assert.match(code, /from '\.\/surveyMethodSwitch'/, 'คำของวิธีประเมินมาจากไฟล์กลาง');
  assert.doesNotMatch(code, /['"`](?:จากแบบ|ประเมินจากแบบ|ลงหน้างาน)['"`]/, 'ชิป/ป้ายวิธีไม่ถูกพิมพ์ซ้ำที่นี่');
});

// ══ รอบแก้หลังรีวิว S2a — ตัวช่วยของหน้าพื้นที่รู้จักวิธีประเมิน (บอร์ด B1) ══════════════════════════════

test('🔴 ป้ายหัวหน้าพื้นที่ของพื้นที่จากแบบ: ครบ = ขนาด + ภาพแบบ และไม่เคยขึ้น "วัดแล้ว" · ขาดข้อใดข้อหนึ่ง = "ยังไม่ครบ"', () => {
  const files = caseAFiles();
  // โถงต้อนรับ: มีขนาด + ภาพแบบ JPG = ครบ
  assert.deepEqual(surveyZoneStateBadge({ zone: lobby(), files: files.d1 }),
    { key: 'done', tone: 'success', text: 'ครบแล้ว', added: false, addedLabel: null });
  // โซนขายหน้าร้าน: มีขนาด ยังไม่มีภาพแบบ — เดิมถูกอ่านว่า "วัดแล้ว" เพราะไม่มีข้อของช่างให้ขาด
  assert.deepEqual(surveyZoneStateBadge({ zone: shop(), files: [] }),
    { key: 'todo', tone: 'warning', text: 'ยังไม่ครบ', added: false, addedLabel: null });
  // ภาพแบบที่ลงเอกสารไม่ได้ (PDF) ไม่ปลดข้อ
  assert.equal(surveyZoneStateBadge({ zone: lobby(), files: [planFile('ATT-9', 'แบบ.pdf', 'application/pdf')] }).key, 'todo');
  assert.equal(surveyZoneStateBadge({ zone: restroom(), files: [] }).key, 'todo');
  // ป้ายตามความเร่งยังชนะเหมือนเดิม
  assert.equal(surveyZoneStateBadge({ zone: lobby(), files: files.d1, dirty: true }).text, 'ยังไม่บันทึก');
  assert.equal(surveyZoneStateBadge({ zone: lobby({ status: 'cut', cutReason: 'ไม่เอาแล้ว' }), files: files.d1 }).text, 'ตัดออก');
  // พื้นที่ที่หัวหน้าเพิ่มบนใบงานโต๊ะ — ไม่ใช่ "เพิ่มหน้างาน"
  const added = surveyZoneStateBadge({ zone: lobby({ status: 'added' }), files: files.d1, dept: 'TS' });
  assert.equal(added.added, true);
  assert.equal(added.addedLabel, 'เพิ่มโดย TS');
  // ไม่มีผลไหนของพื้นที่จากแบบพูดว่า "วัดแล้ว"
  for (const zone of [lobby(), shop(), restroom(), lobby({ status: 'added' })]) {
    for (const fs of [[], files.d1]) assert.doesNotMatch(JSON.stringify(surveyZoneStateBadge({ zone, files: fs })), /วัดแล้ว/);
  }
});

test('🔴 พื้นที่ตั้งต้นและจุดเลื่อน: พื้นที่จากแบบที่ยังขาดขนาด / ภาพแบบ = ยังไม่ครบ (ของหัวหน้า) · จอของช่างข้ามพื้นที่จากแบบ', () => {
  const files = caseAFiles();
  // ใบจากแบบทั้งใบ: โถง (ครบ) · โซนขาย (ขาดภาพแบบ) · ห้องน้ำ (ยังไม่กรอก) — หัวหน้าถูกพาไปพื้นที่แรกที่ยังขาด ไม่ใช่พื้นที่แรกของใบ
  assert.equal(surveyDefaultZoneId(caseA(), files, { editable: true }), 'd2');
  assert.equal(surveyDefaultZoneId(caseA(), files, { editable: false }), 'd1');
  const dots = surveyZoneNeighbors(caseA(), 'd2', files);
  assert.deepEqual(dots.dots.map((d) => [d.id, d.state]), [['d1', 'done'], ['d2', 'todo'], ['d3', 'todo']]);
  assert.deepEqual([dots.prev, dots.next], ['d1', 'd3']);
  assert.equal(dots.ariaLabel, 'พื้นที่ที่ 2 จาก 3 · วัดแล้ว 0 · จากแบบ 3', 'พื้นที่จากแบบไม่ถูกนับเป็น "วัดแล้ว"');

  // ใบผสม (Reception ครบ · โซนขายจากแบบขาดภาพแบบ · ห้อง MD ยังไม่วัดขนาด)
  const mixedRows = () => [reception(), shop(), md({ parts: [] })];
  const mixed = mixedFiles({ mdFull: false });
  assert.equal(surveyDefaultZoneId(mixedRows(), mixed, { editable: true }), 'd2', 'หัวหน้า: พื้นที่แรกที่ยังขาด รวมพื้นที่จากแบบ');
  assert.equal(surveyDefaultZoneId(mixedRows(), mixed, { editable: true, hideDrawing: true }), 'z2', 'ช่าง: ข้ามพื้นที่จากแบบ');
  const crewDots = surveyZoneNeighbors(mixedRows(), 'z1', mixed, { hideDrawing: true });
  assert.deepEqual(crewDots.dots.map((d) => [d.id, d.state]), [['z1', 'done'], ['z2', 'todo']]);
  assert.equal(crewDots.next, 'z2');
  assert.equal(crewDots.ariaLabel, 'พื้นที่ที่ 1 จาก 2 · วัดแล้ว 1');
  assert.equal(surveyZoneNeighbors(mixedRows(), 'z1', mixed).ariaLabel, 'พื้นที่ที่ 1 จาก 3 · วัดแล้ว 1 · จากแบบ 1');
  // ช่างบนใบจากแบบทั้งใบ: ไม่มีพื้นที่ให้เปิดเอง
  assert.equal(surveyDefaultZoneId(caseA(), files, { editable: true, hideDrawing: true }), null);

  // 🔴 ใบลงหน้างานล้วน: ผลเดิมทุกตัว (ตัวเลือกใหม่ไม่มีผล)
  for (const as of Object.values(VARIANTS)) {
    const rows = onsiteSheet(as);
    assert.equal(surveyDefaultZoneId(rows, onsiteFiles(), { editable: true }), 'z3');
    assert.equal(surveyDefaultZoneId(rows, onsiteFiles(), { editable: true, hideDrawing: true }), 'z3');
    const today = surveyZoneNeighbors(rows, 'z1', onsiteFiles());
    assert.deepEqual(surveyZoneNeighbors(rows, 'z1', onsiteFiles(), { hideDrawing: true }), today);
    assert.deepEqual(today.dots.map((d) => d.state), ['done', 'done', 'todo', 'cut']);
    assert.equal(today.ariaLabel, 'พื้นที่ที่ 1 จาก 4 · วัดแล้ว 2');
  }
});

test('ป้ายหัวข้อและท้ายหน้าของพื้นที่จากแบบ: หัวข้อภาพแบบแทนภาพกว้าง · จุดไม่บังคับ · "ขาด: ขนาด · ภาพแบบ" · พื้นที่ลงหน้างานได้สี่คีย์เดิม', () => {
  const files = caseAFiles();
  const full = surveyZoneSections({ zone: lobby(), files: files.d1 });
  assert.deepEqual(Object.keys(full), ['size', 'wide', 'plan', 'spots', 'note']);
  assert.equal(full.wide, null);
  assert.deepEqual(full.size.chip, { tone: 'success', text: 'บันทึกแล้ว', check: true });
  assert.deepEqual(full.plan, { mark: 'done', chip: { tone: 'success', text: 'ขึ้นแล้ว 1 รูป', check: true } });
  assert.deepEqual(full.spots, { mark: 'todo', chip: null }, 'จุดของพื้นที่จากแบบไม่บังคับ — ไม่มีป้าย "ยังไม่มี"');
  // PDF อย่างเดียว = ยังไม่มีภาพแบบที่ลงเอกสารได้
  const pdfOnly = surveyZoneSections({ zone: lobby(), files: [planFile('ATT-9', 'แบบ.pdf', 'application/pdf')] });
  assert.deepEqual(pdfOnly.plan, { mark: 'todo', chip: { tone: 'neutral', text: 'ยังไม่มี', check: false } });
  // จุดที่มาร์กจากแบบ: นับจุดอย่างเดียว ไม่ต่อจำนวนรูป (ไฟล์รูปจุดเก่าไม่ใช่ของหน้านี้)
  const marked = surveyZoneSections({ zone: shopOld(), files: [linkedSpot('IMG_1901.jpg', 'ds1')] });
  assert.deepEqual(marked.spots.chip, { tone: 'success', text: '2 จุด', check: true });

  // ท้ายหน้า: "ครบ" และ "ขาด" ถามสองข้อของพื้นที่จากแบบ — รูปของหน้านี้คือภาพแบบ
  const done = surveyZoneFooterView({ zone: lobby(), files: files.d1, viewerKind: 'head' });
  assert.ok(done.head.startsWith('บันทึกครบแล้ว'), done.head);
  const gap = surveyZoneFooterView({ zone: shop(), files: [], viewerKind: 'head' });
  assert.ok(gap.head.startsWith('บันทึกแล้ว ·'), gap.head);
  assert.equal(gap.sub, 'ขาด: ภาพแบบ');
  assert.equal(surveyZoneFooterView({ zone: restroom(), files: [], viewerKind: 'head' }).sub, 'ขาด: ขนาด · ภาพแบบ');
  const typing = surveyZoneFooterView({ zone: lobby(), files: files.d1, viewerKind: 'head', dirty: true, draftSummary: 'ขนาด 1 ส่วน' });
  assert.equal(typing.sub, 'ภาพแบบขึ้นแล้ว 1 · รูปไม่ต้องรอบันทึก');
  for (const view of [done, gap, typing]) assert.doesNotMatch(JSON.stringify(view), /ภาพกว้าง|วัดแล้ว/);

  // 🔴 พื้นที่ลงหน้างาน: สี่คีย์เดิม ไม่มีคีย์ภาพแบบ · ท้ายหน้าพูดเรื่องภาพกว้างตามเดิม
  for (const as of Object.values(VARIANTS)) {
    const zone = as(md());
    assert.deepEqual(Object.keys(surveyZoneSections({ zone, files: mdFilesShort() })), ['size', 'wide', 'spots', 'note']);
    const foot = surveyZoneFooterView({ zone, files: mdFilesShort(), viewerKind: 'crew', dirty: true });
    assert.equal(foot.sub, 'ภาพกว้างขึ้นแล้ว 1 · รูปไม่ต้องรอบันทึก');
  }
});

test('ป้ายที่มาของพื้นที่ที่ถูกเพิ่ม (`addedLabel`): รายการ · หน้าพื้นที่จากแบบ — หัวหน้าเพิ่มที่โต๊ะ = "เพิ่มโดย {ฝ่าย}" ไม่ใช่ "เพิ่มหน้างาน"', () => {
  const sheet = [reception({ status: 'added' }), shop({ status: 'added' }), md()];
  const view = surveyZoneListView({ zones: sheet, filesByZone: mixedFiles(), canDecide: true, dept: 'TS' });
  assert.deepEqual(view.rows.map((r) => [r.tags.added, r.addedLabel]), [[true, 'เพิ่มหน้างาน'], [true, 'เพิ่มโดย TS'], [false, null]]);
  // ไม่ส่งฝ่าย = TS
  assert.equal(surveyZoneListView({ zones: sheet, filesByZone: mixedFiles() }).rows[1].addedLabel, 'เพิ่มโดย TS');
  assert.equal(surveyDrawingZoneView({ zone: shop({ status: 'added' }), files: [], canDecide: true, dept: 'TS' }).addedLabel, 'เพิ่มโดย TS');
  assert.equal(surveyDrawingZoneView({ zone: shop(), files: [], canDecide: true }).addedLabel, null);
});

/* ── UAT ถ่ายจอ S2b · บทบาทช่าง (12/10) ─────────────────────────────────────────────────────────── */

/* ประโยคของด่านขนาด (`survey.js`) — S2b แก้หลังตรวจจอ crew-q3 + head-rc-q2 (รวมสองมติ · FIX-PLAN §0.1): บันทึกครั้งเดียวยืนยันทั้งขนาดและภาพกว้าง */
const RESAVE = 'พื้นที่นี้เพิ่งกลับมาเป็นลงหน้างาน — ตรวจขนาดและภาพกว้างแล้วกดบันทึกอีกครั้ง';
/* ห้อง MD ที่เคยเป็นจากแบบแล้วถูกสลับกลับ — ของครบทุกข้อจากรอบก่อน เหลือแค่ "ยังไม่ถูกบันทึกหลังสลับ" */
const mdBack = (extra = {}) => md({ method: 'onsite', methodChangedAt: '2026-10-08T02:00:00.000Z', ...extra });

test('🔑 เพิ่งสลับกลับมาเป็นลงหน้างาน: ปุ่มบันทึกเปิดทั้งที่ไม่มีค่าค้าง + ประโยคของด่านอยู่บนหน้าพื้นที่ · หัวข้อขนาดไม่ติ๊กเขียว', () => {
  assert.equal(surveyZoneResaveText(mdBack(), mdFilesFull()), RESAVE);

  const foot = surveyZoneFooterView({ zone: mdBack(), files: mdFilesFull(), viewerKind: 'crew' });
  assert.equal(foot.tone, 'dirty');
  assert.equal(foot.head, RESAVE);
  assert.equal(foot.sub, 'ขาด: ขนาด');
  assert.deepEqual(foot.save, { show: true, label: 'บันทึกพื้นที่นี้', enabled: true, reason: null, emphasis: 'primary' });
  assert.equal(foot.resave, true);

  const size = surveyZoneSections({ zone: mdBack(), files: mdFilesFull() }).size;
  assert.deepEqual(size, { mark: 'todo', chip: null, note: RESAVE });
  // พิมพ์แก้ขนาดแล้ว = ป้าย "ยังไม่บันทึก" ตามเดิม ประโยคยังอยู่จนกว่าจะบันทึก
  const typing = surveyZoneSections({
    zone: mdBack(), files: mdFilesFull(), dirty: true, draft: { ...mdBack(), parts: [part('p2', 6.5, 5, 2.8)] },
  }).size;
  assert.equal(typing.chip.text, 'ยังไม่บันทึก');
  assert.equal(typing.note, RESAVE);

  // แถวของรายการ: ขนาดที่ด่านยังไม่รับไม่ขึ้นเป็นตัวเลขของแถว
  const row = surveyZoneListView({ zones: [mdBack()], filesByZone: { z2: mdFilesFull() }, visit: { status: 'in_progress' } }).rows[0];
  assert.equal(row.areaText, null);
  assert.equal(row.missingText, 'ขาด: ขนาด');
});

/* UAT S06 รอบหัวหน้า (`desk-back-to-onsite` · `o3-desk-back-after-visit`): กล่องผลลัพธ์ของโมดัลบอก "ต้องวัดขนาดจริงแล้วบันทึกอีกครั้ง"
   แต่ใบของหัวหน้าไม่ถาม และทำตามไม่ได้ (ปุ่มบันทึกดับ) — ทางแก้ของรอบช่างไม่ผูกกับบทบาท: ข้อนี้ตรึงว่าหัวหน้าได้ครบทุกผิวเหมือนกัน
   รวมตอนนัดปิดไปแล้ว (มติ 12/10 ข้อ O3: ใบอยู่ขั้นเดิม หัวหน้าตรวจแล้วกดบันทึกยืนยันเองได้) */
test('🔑 เพิ่งสลับกลับมาเป็นลงหน้างาน — ใบของหัวหน้าพูดตรงกับกล่องผลลัพธ์: แถวรายการ · หัวข้อขนาด · ท้ายหน้า · ป้ายหัว (นัดเปิดหรือปิดแล้วก็เหมือนกัน)', () => {
  for (const viewerKind of ['head', 'senior']) {
    const foot = surveyZoneFooterView({ zone: mdBack(), files: mdFilesFull(), viewerKind });
    assert.equal(foot.head, RESAVE, viewerKind);
    assert.equal(foot.sub, 'ขาด: ขนาด', viewerKind);
    assert.deepEqual(foot.save, { show: true, label: 'บันทึกพื้นที่นี้', enabled: true, reason: null, emphasis: 'primary' }, viewerKind);
    assert.equal(foot.resave, true, viewerKind);
  }
  assert.deepEqual(surveyZoneStateBadge({ zone: mdBack(), files: mdFilesFull() }), {
    key: 'todo', tone: 'warning', text: 'ยังไม่ครบ', added: false, addedLabel: null,
  });
  for (const status of ['in_progress', 'done', 'partial']) {
    const row = surveyZoneListView({
      zones: [mdBack(), shop()], filesByZone: { z2: mdFilesFull() }, canDecide: true, visit: { status },
    }).rows[0];
    assert.equal(row.state, 'todo', status);
    assert.equal(row.detail, 'missing', status);
    assert.equal(row.missingText, 'ขาด: ขนาด', status);
    assert.equal(row.areaText, null, status);
    assert.equal(row.sizeText, null, status);
    assert.deepEqual(row.marks.find((m) => m.key === 'size'), mark('size', 'ขนาด', false, null), status);
    // ของหัวหน้าไม่ขึ้นซ้อนบนแถวที่ยังขาดของหน้างาน
    assert.equal(row.tags.headPending, false, status);
  }
  // บันทึกยืนยันหลังสลับแล้ว = ทุกผิวกลับเป็น "ครบ" พร้อมกัน
  const saved = mdBack({ surveyedAt: '2026-10-08T03:00:00.000Z' });
  assert.equal(surveyZoneListView({ zones: [saved], filesByZone: { z2: mdFilesFull() }, canDecide: true, visit: { status: 'done' } }).rows[0].missingText, null);
  assert.equal(surveyZoneStateBadge({ zone: saved, files: mdFilesFull() }).text, 'วัดแล้ว');
});

test('เพิ่งสลับกลับมา — ที่ไม่เข้าทางนี้: บันทึกหลังสลับแล้ว · ขนาดยังไม่ครบ · ตัดออก · จากแบบ · คนอ่านอย่างเดียว · แถวที่ไม่เคยสลับ', () => {
  const saved = mdBack({ surveyedAt: '2026-10-08T03:00:00.000Z' });
  assert.equal(surveyZoneResaveText(saved, mdFilesFull()), null);
  assert.ok(surveyZoneFooterView({ zone: saved, files: mdFilesFull() }).head.startsWith('บันทึกครบแล้ว'));
  assert.equal(surveyZoneSections({ zone: saved, files: mdFilesFull() }).size.chip.text, 'บันทึกแล้ว');

  assert.equal(surveyZoneResaveText(mdBack({ parts: [] }), mdFilesFull()), null);
  assert.equal(surveyZoneResaveText(mdBack({ status: 'cut', cutReason: 'ปิดปรับปรุง' }), mdFilesFull()), null);
  assert.equal(surveyZoneResaveText(lobby({ methodChangedAt: '2026-10-08T02:00:00.000Z' }), []), null);

  const reader = surveyZoneFooterView({ zone: mdBack(), files: mdFilesFull(), viewerKind: 'readonly' });
  assert.ok(reader.head.startsWith('บันทึกแล้ว ·'), reader.head);
  assert.equal(reader.resave, false);

  for (const as of Object.values(VARIANTS)) {
    const foot = surveyZoneFooterView({ zone: as(md()), files: mdFilesFull() });
    assert.equal(foot.save.enabled, false);
    assert.equal(foot.save.reason, 'ยังไม่ได้แก้อะไร');
    assert.equal(foot.resave, false);
    assert.equal('note' in surveyZoneSections({ zone: as(md()), files: mdFilesFull() }).size, false);
  }
});

test('🐞 "ถัดไป" ของช่าง (hideDrawing) ไม่พาเข้าพื้นที่จากแบบที่รายการซ่อนไว้ — คนอื่นเดินตามลำดับเหมือนเดิม', () => {
  const sheet = [md(), lobby(), shop()];
  const files = { z2: mdFilesFull() };
  // นัดยังไม่เริ่ม (ส่งงานไม่ได้) · ไม่มีพื้นที่ลงหน้างานอื่นที่ขาด
  assert.equal(surveyNextStep({ zones: sheet, filesByZone: files, zoneId: 'z2', hideDrawing: true }).target, null);
  assert.equal(surveyNextStep({ zones: sheet, filesByZone: files, zoneId: 'z2' }).label, 'ถัดไป: โถงต้อนรับ');
  // ช่างที่ตามลิงก์เข้าพื้นที่จากแบบ: ไม่ถูกพาไล่พื้นที่จากแบบตัวถัดไป · พื้นที่ลงหน้างานที่อยู่ถัดไปยังไปได้
  assert.equal(surveyNextStep({ zones: sheet, filesByZone: files, zoneId: 'd1', hideDrawing: true }).target, null);
  const next = surveyNextStep({ zones: [lobby(), md()], filesByZone: files, zoneId: 'd1', hideDrawing: true });
  assert.equal(next.label, 'ถัดไป: ห้อง MD');
});

/* ══ S2b แก้หลังตรวจจอ — กลุ่ม G (รายการ · ท้ายหน้าพื้นที่ · ตัวเลื่อน · "ถัดไป" · กล่องส่งงาน/ยอดรวม · จอของรายการ) ══════════ */

test('S2b-O6 · ช่าง: พื้นที่จากแบบอยู่ลำดับแรก — แถวที่เห็นได้เลข 2 กับ 3 (ลำดับในใบ) ตรงกับเลขจุดในหมายเหตุ · หัวหน้าเห็นเลขเดียวกัน', () => {
  const zones = [shop(), reception(), md()];
  const files = { z1: receptionFiles(), z2: mdFilesShort() };
  const crew = surveyZoneListView({ zones, filesByZone: files, ...CREW_LIST, hideDrawing: true });
  assert.deepEqual(crew.rows.map((r) => [r.id, r.index]), [['z1', 2], ['z2', 3]]);
  assert.equal(crew.rows[1].spotNote, 'จุด 3.2 ยังไม่มีรูป', 'เลขบนวงของแถว (3) = เลขหน้าจุด 3.x');
  assert.equal(crew.drawingNote, 'อีก 1 พื้นที่หัวหน้าประเมินจากแบบ — ไม่ต้องวัด', 'บรรทัดที่บอกเหตุที่เลข 1 หายไป');
  const head = surveyZoneListView({ zones, filesByZone: files, canDecide: true, visit: VISIT });
  assert.deepEqual(head.rows.map((r) => [r.id, r.index]), [['d2', 1], ['z1', 2], ['z2', 3]]);
  // แถวที่ตัดนับอยู่ในลำดับใบ (ตัวนับ k ของรูปจุดก็นับ) — แถวหลังมันไม่เลื่อนเลข
  const withCut = surveyZoneListView({ zones: [cutZone(), shop(), md()], filesByZone: files, ...CREW_LIST, hideDrawing: true });
  assert.deepEqual(withCut.rows.map((r) => [r.id, r.index]), [['z4', 1], ['z2', 3]]);
});

test('crew-q6 · จอช่างของใบจากแบบทั้งใบ: บรรทัด "ทั้ง n …" · หัวรายการ "พื้นที่" · สองบานที่บานขวาว่างพิมพ์ประโยคที่เดียว', () => {
  const desk = surveyZoneListView({ zones: caseA(), filesByZone: caseAFiles(), ...CREW_LIST, hideDrawing: true });
  assert.deepEqual([desk.rows, desk.emptyReason], [[], 'drawing']);
  assert.equal(desk.drawingNote, 'ทั้ง 3 พื้นที่หัวหน้าประเมินจากแบบ — ไม่ต้องวัด');
  // แถวที่ตัดหนึ่งแถว + ที่เหลือจากแบบ = ยังไม่มีอะไรให้วัด ⇒ "ทั้ง" — หัว · คำ · การพิมพ์ที่เดียว เดินตามสัญญาณเดียว (`emptyReason`)
  // 🐞 รอบตรวจ: เดิมเลือกคำจากจำนวนแถวที่เห็น (นับแถวที่ตัด) ⇒ หัว "พื้นที่" แต่บานขวาว่างพิมพ์ "อีก 1 …" ไม่มีอะไรนำหน้า
  const cutOnly = surveyZoneListView({ zones: [cutZone(), shop()], filesByZone: {}, ...CREW_LIST, hideDrawing: true });
  assert.deepEqual([cutOnly.rows.length, cutOnly.emptyReason, cutOnly.drawingNote],
    [1, 'drawing', 'ทั้ง 1 พื้นที่หัวหน้าประเมินจากแบบ — ไม่ต้องวัด']);
  // ยังมีพื้นที่ลงหน้างานให้วัด = "อีก" เดิม · ไม่มีเหตุว่าง (รายการพิมพ์บรรทัดเองตามเดิม)
  const mixed = surveyZoneListView({ zones: [reception(), shop()], filesByZone: {}, ...CREW_LIST, hideDrawing: true });
  assert.deepEqual([mixed.rows.length, mixed.emptyReason, mixed.drawingNote],
    [1, null, 'อีก 1 พื้นที่หัวหน้าประเมินจากแบบ — ไม่ต้องวัด']);

  const LIST = readFileSync(new URL('../../components/service/SurveyZoneList.js', import.meta.url), 'utf8');
  const PAGE = readFileSync(new URL('../../app/service/surveys/[id]/page.js', import.meta.url), 'utf8');
  assert.match(LIST, /const deskOnlyForCrew = view\?\.emptyReason === "drawing";/);
  assert.match(LIST, /\{labelled \|\| deskOnlyForCrew \? "พื้นที่" : "พื้นที่ที่ต้องวัด"\}/);
  assert.match(LIST, /const view = paneEmpty && listView\?\.emptyReason === "drawing" \? \{ \.\.\.listView, drawingNote: null \} : listView;/,
    'บานขวาว่างพูดประโยคนี้แล้ว ⇒ รายการไม่พิมพ์ซ้ำ');
  assert.match(PAGE, /paneEmpty=\{split && !shownZone\}/);
  assert.match(PAGE, /\{listView\.emptyReason === "drawing" \? listView\.drawingNote/, 'สถานะว่างของบานขวายังพูดบรรทัดของตัวตัดสิน');
});

test('crew-q5 · ท้ายหน้าของคนดูอย่างเดียว: พื้นที่จากแบบที่ยังว่าง = "ยังไม่มีผลประเมินจากแบบ" · ลงหน้างาน = "ยังไม่มีผลวัด" · คนแก้ได้คำเดิม', () => {
  const drawingFoot = surveyZoneFooterView({ zone: restroom(), files: [], viewerKind: 'readonly' });
  assert.deepEqual([drawingFoot.tone, drawingFoot.head, drawingFoot.sub], ['plain', 'ยังไม่มีผลประเมินจากแบบ', 'ขาด: ขนาด · ภาพแบบ']);
  const onsiteFoot = surveyZoneFooterView({ zone: treatment(), files: [], viewerKind: 'readonly' });
  assert.deepEqual([onsiteFoot.tone, onsiteFoot.head], ['plain', 'ยังไม่มีผลวัด']);
  assert.equal(surveyZoneFooterView({ zone: restroom(), files: [], viewerKind: 'head' }).head, 'ยังไม่ได้บันทึกค่าของพื้นที่นี้');
});

test('head-r3-34 · พื้นที่จากแบบที่ยังไม่มีภาพแบบ: พิมพ์อยู่/กำลังบันทึก บรรทัดที่สองยังเป็น "ขาด: ภาพแบบ" · มีภาพแบบแล้ว = บรรทัดรูปเดิม', () => {
  const typing = surveyZoneFooterView({ zone: shop(), files: [], viewerKind: 'head', dirty: true, draftSummary: 'ขนาด 1 ส่วน' });
  assert.deepEqual([typing.head, typing.sub], ['กดบันทึกเพื่อเก็บ ขนาด 1 ส่วน', 'ขาด: ภาพแบบ']);
  assert.equal(surveyZoneFooterView({ zone: shop(), files: [], viewerKind: 'head', busy: true }).sub, 'ขาด: ภาพแบบ');
  // PDF ในช่องผังไม่ปลดข้อ · กำลังส่งรูป = ต่อจำนวนที่กำลังส่ง (คำเดิมของบรรทัดรูป)
  const pdf = [planFile('ATT-9', 'แบบ.pdf', 'application/pdf')];
  assert.equal(surveyZoneFooterView({ zone: shop(), files: pdf, viewerKind: 'head', dirty: true }).sub, 'ขาด: ภาพแบบ');
  assert.equal(surveyZoneFooterView({ zone: shop(), files: [], viewerKind: 'head', dirty: true, uploading: 1 }).sub, 'ขาด: ภาพแบบ · กำลังส่ง 1');
  assert.equal(surveyZoneFooterView({ zone: lobby(), files: caseAFiles().d1, viewerKind: 'head', dirty: true }).sub,
    'ภาพแบบขึ้นแล้ว 1 · รูปไม่ต้องรอบันทึก');

  // รอบตรวจ: ค่าที่พิมพ์ยังติดด่าน (พิมพ์กว้างช่องแรก — ของจริงจาก `surveyZoneSavePayload`) = "ขาด: ภาพแบบ" ยังอยู่หน้าคำแนะนำเดิม
  const { blocker } = surveyZoneSavePayload({ parts: [{ id: 'p1', label: 'A', widthM: 4, lengthM: null, heightM: null }] });
  assert.ok(blocker, 'ขนาดไม่ครบต้องติดด่าน');
  const half = surveyZoneFooterView({ zone: shop(), files: [], viewerKind: 'head', dirty: true, saveBlocker: blocker });
  assert.deepEqual([half.tone, half.head, half.sub, half.save.enabled], ['dirty', blocker,
    'ขาด: ภาพแบบ · แก้ให้ครบแล้วกดบันทึก · ออกจากพื้นที่นี้ก่อนบันทึก ระบบจะถามก่อนทิ้งค่าที่พิมพ์', false]);
  // มีภาพแบบแล้ว / ลงหน้างาน = คำแนะนำเดิมทุกตัวอักษร
  for (const [zone, files] of [[lobby(), caseAFiles().d1], [treatment(), []]]) {
    assert.equal(surveyZoneFooterView({ zone, files, viewerKind: 'head', dirty: true, saveBlocker: blocker }).sub,
      'แก้ให้ครบแล้วกดบันทึก · ออกจากพื้นที่นี้ก่อนบันทึก ระบบจะถามก่อนทิ้งค่าที่พิมพ์');
  }
});

test('crew-q8 · ช่างตามลิงก์เข้าพื้นที่จากแบบ: ไม่มีตัวเลื่อน (ไม่มีจุดกลวง ไม่มีลูกศรที่กดไม่ได้) · พื้นที่ของเขาเองยังเลื่อนได้', () => {
  const zones = [reception(), shop(), md()];
  const files = mixedFiles();
  assert.deepEqual(surveyZoneNeighbors(zones, 'd2', files, { hideDrawing: true }),
    { index: 0, total: 0, prev: null, next: null, dots: [], ariaLabel: '', compactText: null });
  const own = surveyZoneNeighbors(zones, 'z1', files, { hideDrawing: true });
  assert.deepEqual([own.index, own.total, own.next, own.dots.length], [1, 2, 'z2', 2]);
  const head = surveyZoneNeighbors(zones, 'd2', files);
  assert.deepEqual([head.index, head.total, head.prev, head.next], [2, 3, 'z1', 'z2'], 'หัวหน้า/ผู้วางคิวเลื่อนผ่านพื้นที่จากแบบตามเดิม');
});

test('head-rc-r2-3 · "ถัดไป" ของหัวหน้าที่กรอกพื้นที่จากแบบได้: พื้นที่สุดท้ายของใบจากแบบ = "กลับไปที่ {พื้นที่ที่ขาด}" · คนอื่นผลเดิม', () => {
  const restroomDone = restroom({ parts: [part('dp3', 4, 3, 2.6)], surveyedAt: '2026-10-07T04:40:00.000Z', surveyedByName: 'Arnon Aunsapwilai' });
  const sheet = [lobby(), shop(), restroomDone];
  const files = { ...caseAFiles(), d3: [planFile('ATT-23', 'แปลนชั้น 2.jpg', 'image/jpeg')] }; // โซนขายหน้าร้าน (d2) ยังไม่มีภาพแบบ
  const last = surveyNextStep({ zones: sheet, filesByZone: files, zoneId: 'd3', drawingEditable: true });
  assert.deepEqual([last.target?.id, last.target?.back, last.label], ['d2', true, 'กลับไปที่ โซนขายหน้าร้าน']);
  assert.equal(surveyNextStep({ zones: sheet, filesByZone: files, zoneId: 'd1', drawingEditable: true }).label, 'ถัดไป: โซนขายหน้าร้าน');
  // ผู้วางคิว (ไม่ส่ง / false) = ผลเดิม: ยืนที่พื้นที่สุดท้ายไม่มีปลายทาง
  assert.equal(surveyNextStep({ zones: sheet, filesByZone: files, zoneId: 'd3' }).target, null);
  assert.equal(surveyNextStep({ zones: sheet, filesByZone: files, zoneId: 'd3', drawingEditable: false }).target, null);

  // ใบผสม: งานของนัดมาก่อน — ช่างขาดที่อื่น > "ถัดไป: ส่งงาน" > พื้นที่จากแบบที่ยังขาด
  const mixed = [reception(), shop(), md()];
  const step = (extra) => surveyNextStep({ zones: mixed, filesByZone: mixedFiles(), zoneId: 'z1', drawingEditable: true, ...extra }).label;
  assert.equal(step({ canSubmit: true }), 'ถัดไป: ส่งงาน');
  assert.equal(step({ canSubmit: false }), 'ถัดไป: โซนขายหน้าร้าน');
  const crewGap = surveyNextStep({
    zones: [reception(), shop(), md({ parts: [] })], filesByZone: mixedFiles(), zoneId: 'z1', drawingEditable: true,
  });
  assert.equal(crewGap.label, 'ถัดไป: ห้อง MD', 'ของช่างที่ยังขาดมาก่อนพื้นที่จากแบบ');
  // หน้าส่งธงนี้เฉพาะหัวหน้าบนใบที่ยังไม่ล็อก
  const PAGE = readFileSync(new URL('../../app/service/surveys/[id]/page.js', import.meta.url), 'utf8');
  assert.match(PAGE, /drawingEditable: canDecide && !view\.flags\.locked,/);
});

test('crew-q4 · พื้นที่ที่สลับกลับยังไม่บันทึกยืนยัน: กล่องส่งงานไม่พิมพ์ขนาดเดิม · ยอดรวมและบรรทัดข้างแท็บไม่นับ ตร.ม./ลบ.ม. ของมัน · ภาพกว้างยังนับ', () => {
  const zones = [reception(), mdBack()];
  const files = { z1: receptionFiles(), z2: mdFilesFull() };
  for (const viewerKind of ['crew', 'senior', 'head']) {
    const view = surveySubmitView({ outcome: 'entered', visit: VISIT, zones, filesByZone: files, viewerKind, nowKey: NOW });
    const row = view.rows.find((r) => r.id === 'z2');
    assert.deepEqual([row.state, row.figures, row.note], ['miss', null, 'ขาด: ขนาด'], viewerKind);
    assert.deepEqual(view.totals, { zones: 2, areaSqm: 48, volumeCbm: 144, wide: 3, spots: 5 }, viewerKind);
    assert.deepEqual(view.totalsText, { label: 'รวม 2 พื้นที่', figures: '48 ตร.ม. · 144 ลบ.ม.', counts: 'ภาพกว้าง 3 · จุด 5' }, viewerKind);
  }
  for (const hideDrawing of [false, true]) {
    assert.equal(surveySheetTotalsText({ zones, filesByZone: files, hideDrawing }), 'รวม 48 ตร.ม. · 144 ลบ.ม. · ภาพกว้าง 3 · จุด 5',
      `hideDrawing = ${hideDrawing}`);
  }
  // บันทึกยืนยันหลังสลับแล้ว = นับตามเดิมทุกที่
  const saved = [reception(), mdBack({ surveyedAt: '2026-10-08T03:00:00.000Z' })];
  assert.equal(surveySheetTotalsText({ zones: saved, filesByZone: files }), 'รวม 78 ตร.ม. · 228 ลบ.ม. · ภาพกว้าง 3 · จุด 5');
  const after = surveySubmitView({ outcome: 'entered', visit: VISIT, zones: saved, filesByZone: files, nowKey: NOW });
  assert.equal(after.rows.find((r) => r.id === 'z2').figures, '30 ตร.ม. · 84 ลบ.ม.');
  assert.equal(after.totals.areaSqm, 78);
});

test('planner-minor-3 · บานซ้ายของใบที่มีพื้นที่จากแบบ: ข้อขนาดที่มีตัวเลขซ่อนคำ "ขนาด" จากตา + ช่องไฟข้อแคบลง — สามข้อของแถวลงหน้างานอยู่บรรทัดเดียว', () => {
  const CSS = readFileSync(new URL('../../components/service/SurveyZoneList.module.css', import.meta.url), 'utf8');
  assert.match(CSS, /\.wrap\[data-layout="split"\] \.row:has\(\.codeLine\[data-tagged\]\) \.marks \{ column-gap: var\(--space-2\); \}/);
  assert.match(CSS, /\.wrap\[data-layout="split"\] \.row:has\(\.codeLine\[data-tagged\]\) \.mark\[data-key="size"\]:has\(\.markValue\) \.markLabel \{\s*position: absolute;[^}]*clip-path: inset\(50%\);/,
    'ซ่อนจากตาแบบเดียวกับทรงคอลัมน์ — โปรแกรมอ่านจอยังอ่าน "ขนาด"');
  // ผูกกับ data-tagged — แถวของใบลงหน้างานล้วน (ไม่มีป้ายวิธี) ไม่ถูกแตะ
  const rules = CSS.match(/[^{}]*\{[^}]*column-gap: var\(--space-2\)[^}]*\}/g) || [];
  assert.equal(rules.length, 1);
  assert.ok(rules.every((r) => r.includes('[data-tagged]')), rules.join('\n'));
});
