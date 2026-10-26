import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/* ── แผงไฟล์แนบห้ามประกาศ component ข้างในฟังก์ชันของตัวเอง ────────────────
   🐞 2026-09-22 ช่องคำบรรยายภาพของใบสเปคสินค้า (FM-SA-04) พิมพ์ได้ทีละตัวแล้วเคอร์เซอร์หลุด ·
   `PhotoRows` เคยเป็น `const PhotoRows = (...) => …` ข้างใน `AttachmentsPanel` แล้วถูกวาดเป็น
   `<PhotoRows />` ⇒ ทุกการวาดใหม่ได้ "ชนิด component ใหม่" React ทิ้งทั้งกิ่งแล้วสร้างใหม่
   ⇒ ช่องกรอกที่ผู้เรียกฝากมาผ่าน `photoRows` หลุดโฟกัสทุกตัวอักษร
   ด่านนี้: ของที่ประกาศข้างในต้องเป็นฟังก์ชันวาดชื่อตัวเล็ก (`renderX`) และเรียกเป็นฟังก์ชัน */
const FILE = path.join(process.cwd(), 'src/components/AttachmentsPanel.js');

test('AttachmentsPanel ไม่ประกาศ component ชื่อตัวใหญ่ข้างในตัวเอง (ประกาศแล้ว = remount ทุกการวาด)', () => {
  const source = fs.readFileSync(FILE, 'utf8');
  // ⚠️ นับเฉพาะบรรทัดที่เยื้อง — ระดับไฟล์ (ไม่เยื้อง) ประกาศ component ได้ปกติ
  const nested = [...source.matchAll(/^[ \t]+const ([A-Z][A-Za-z0-9]*)\s*=\s*\(\s*\{/gm)].map((m) => m[1]);
  assert.deepEqual(nested, [], `component ที่ประกาศข้างใน AttachmentsPanel: ${nested.join(', ')}`);
});

test('ฟังก์ชันวาดของแผงไม่ถูกใช้เป็น JSX tag', () => {
  const source = fs.readFileSync(FILE, 'utf8');
  const asTag = [...source.matchAll(/<(render[A-Z][A-Za-z0-9]*|PhotoRows|PhotoTile|PhotoGrid|FileRow|IssuedDateRow)\b/g)].map((m) => m[1]);
  assert.deepEqual(asTag, [], `ใช้เป็น tag: ${asTag.join(', ')}`);
});

/* ══ โหมดแผ่นรูป `photoTiles` (แผน §10.5 จอหน้างานแบบ A · S6 · ม็อก A-3 · AT-2 · AW-1) ═════════════
   ⭐ สิ่งที่ต้องไม่หลุด: แผ่นสุดท้ายคือ "ถ่าย / เลือกรูป" · รูปที่กำลังส่งบอก % รายรูป · **ไม่มีปุ่มลบ 24px
   บนแผ่นรูป** (ต่ำกว่าเป้านิ้ว 44px — กดพลาดโดนรูปข้าง ๆ) ⇒ ลบอยู่ในกล่องดูรูปเต็ม ปุ่ม 44px ·
   โหมดเดิม (ตะแกรง/รายแถว) ต้องเหมือนเดิมเป๊ะ — ผู้เรียกที่ไม่ได้ขอแผ่นรูปมีอยู่ทั่วระบบ
   ⚠️ แผงเป็น JSX (เทสต์รันใต้ Node ดิบ เรนเดอร์ไม่ได้) ⇒ ตรรกะอยู่ที่ `lib/master/attachmentPhotoTiles.js`
      เทสต์ด้วยค่าล้วน · ส่วนที่เป็น "แผงเรียกอะไร/วาดอะไร" ยามด้วยซอร์ส */
import {
  PHOTO_DELETE_LABEL,
  PHOTO_TILE_ADD_LABEL,
  photoDeleteConfirm,
  photoTilesView,
  photoUploadPercent,
  photoUploadsAdd,
  photoUploadsOf,
  photoUploadsProgress,
  photoUploadsRemove,
  runAttachmentUploads,
} from '../lib/master/attachmentPhotoTiles.js';

const CSS = path.join(process.cwd(), 'src/components/AttachmentsPanel.module.css');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const cssRule = (css, selector) => {
  const at = css.indexOf(`${selector} {`);
  assert.notEqual(at, -1, `ไม่มีกฎ ${selector}`);
  return css.slice(at, css.indexOf('}', at));
};
/* ตัดเนื้อฟังก์ชันวาดหนึ่งตัวออกมา (จากชื่อถึงฟังก์ชันวาดตัวถัดไป) — ยามเฉพาะส่วนนั้น ไม่ใช่ทั้งไฟล์ */
const renderBody = (source, name) => {
  const at = source.indexOf(`const ${name} = `);
  assert.notEqual(at, -1, `ไม่มีฟังก์ชันวาด ${name}`);
  const next = source.indexOf('\n  const ', at + 1);
  return source.slice(at, next === -1 ? undefined : next);
};

const photo = (id, fileName = `IMG_${id}.jpg`) => ({ id, fileName, mimeType: 'image/jpeg' });

test('แผ่นรูป: รูปที่ขึ้นแล้ว → รูปที่กำลังส่ง → แผ่น "ถ่าย / เลือกรูป" เป็นแผ่นสุดท้าย (A-3)', () => {
  const uploads = photoUploadsProgress(photoUploadsAdd([], [{ key: 'u1', name: 'IMG_2047.jpg' }]), 'u1', 0.64);
  const { tiles } = photoTilesView({
    photos: [photo('2046')], uploads, canAdd: true, canDelete: () => true,
  });
  assert.deepEqual(tiles.map((t) => t.kind), ['photo', 'upload', 'add']);
  assert.equal(tiles[0].chip, 'ขึ้นแล้ว');
  assert.equal(tiles[0].name, 'IMG_2046.jpg');
  assert.equal(tiles[0].ariaLabel, 'ดูหรือลบรูป IMG_2046.jpg');
  assert.equal(tiles[1].text, 'กำลังส่ง 64%');
  assert.equal(tiles[1].name, 'IMG_2047.jpg');
  assert.equal(tiles[1].value, 0.64);
  assert.equal(tiles[2].label, PHOTO_TILE_ADD_LABEL);
  assert.equal(PHOTO_TILE_ADD_LABEL, 'ถ่าย / เลือกรูป');
  assert.equal(tiles[2].hint, 'หรือลากไฟล์มาวาง', 'จอคอม (AW-1) — ลากไฟล์มาวางได้ · ซ่อนบนจอสัมผัส');
});

test('แผ่นรูป: อ่านอย่างเดียว = ไม่มีแผ่นถ่ายรูป · ลบไม่ได้ = ป้ายอ่านออกเสียงไม่ชวนลบ · ไม่มีรูป = ไม่มีแผ่น', () => {
  const view = photoTilesView({ photos: [photo('1')], canAdd: false, canDelete: () => false });
  assert.deepEqual(view.tiles.map((t) => t.kind), ['photo']);
  assert.equal(view.tiles[0].ariaLabel, 'ดูรูป IMG_1.jpg');
  assert.deepEqual(photoTilesView({ photos: [], canAdd: false }).tiles, []);
  assert.deepEqual(photoTilesView().tiles, [], 'เรียกเปล่าต้องไม่ระเบิด');
  assert.equal(photoTilesView({ photos: [{ id: 'x' }] }).tiles[0].name, 'รูปแนบ', 'ไฟล์ไม่มีชื่อยังมีป้าย');
});

test('รูปที่กำลังส่ง: ยังไม่ถึงคิว = "รอส่ง" · % ปัดลง (99.6 ยังไม่ใช่ 100) · 100 = ไบต์ขึ้นครบ', () => {
  let uploads = photoUploadsAdd([], [{ key: 'a', name: 'a.jpg' }, { key: 'b', name: 'b.jpg' }]);
  let tiles = photoTilesView({ uploads }).tiles;
  assert.deepEqual(tiles.map((t) => t.text), ['รอส่ง', 'รอส่ง']);
  uploads = photoUploadsProgress(uploads, 'a', 0.996);
  assert.equal(photoTilesView({ uploads }).tiles[0].text, 'กำลังส่ง 99%');
  uploads = photoUploadsProgress(uploads, 'a', 1);
  assert.equal(photoTilesView({ uploads }).tiles[0].text, 'กำลังส่ง 100%');
  assert.equal(photoUploadPercent(-1), 0);
  assert.equal(photoUploadPercent(Number.NaN), 0);
  assert.equal(photoUploadPercent(2), 100);
  // แถบไม่ถอยหลัง — เส้นสำรองของการอัปไม่รายงาน % ต่อ ถ้ารายงานค่าต่ำกว่าก็ต้องไม่ย้อน
  uploads = photoUploadsProgress(uploads, 'b', 0.5);
  uploads = photoUploadsProgress(uploads, 'b', 0.2);
  tiles = photoTilesView({ uploads }).tiles;
  assert.equal(tiles[1].text, 'กำลังส่ง 50%');
  assert.deepEqual(photoUploadsRemove(uploads, ['a']).map((u) => u.key), ['b']);
  assert.equal(photoUploadsProgress(uploads, 'ไม่มี', 0.5), uploads, 'คีย์ที่ไม่อยู่ในกอง = ของเดิมตัวเดิม');
});

test('ลูปอัป (onProgress จำลอง): แผ่นบอก % ระหว่างส่ง · onBusyChange เปิดก่อนไฟล์แรก ปิดหลังโหลดรายการใหม่', async () => {
  let uploads = [];
  const log = [];
  const seen = [];
  const result = await runAttachmentUploads({
    batch: [{ key: 'u1', name: 'IMG_2047.jpg', file: 'f1' }, { key: 'u2', name: 'IMG_2048.jpg', file: 'f2' }],
    upload: async (file, onProgress) => {
      log.push(`upload:${file}`);
      onProgress(0.1);
      onProgress(0.64);
      seen.push(photoTilesView({ uploads, canAdd: true }).tiles.map((t) => t.text || t.kind));
      return true;
    },
    setUploads: (fn) => { uploads = fn(uploads); },
    setBusy: (busy) => log.push(`busy:${busy}`),
    reload: async () => { log.push(`reload:${uploads.length}`); },
  });
  assert.deepEqual(seen[0], ['กำลังส่ง 64%', 'รอส่ง', 'add']);
  assert.deepEqual(seen[1], ['กำลังส่ง 100%', 'กำลังส่ง 64%', 'add'], 'รูปแรกขึ้นแล้ว รอรายการใหม่ · รูปสองกำลังส่ง');
  assert.deepEqual(log, ['busy:true', 'upload:f1', 'upload:f2', 'reload:2', 'busy:false'],
    'แผ่นกำลังส่งยังอยู่ตอนโหลดรายการใหม่ (ไม่มีจังหวะที่รูปหายไปทั้งแผ่น) แล้วค่อยถอด');
  assert.deepEqual(uploads, []);
  assert.deepEqual(result, { landed: 2, failed: 0 });
});

test('ลูปอัป: รูปที่ส่งไม่สำเร็จถอดแผ่นทันที · ไม่มีรูปไหนขึ้น = ไม่โหลดรายการใหม่ · พังกลางทางยังปิด busy', async () => {
  let uploads = [];
  const log = [];
  const result = await runAttachmentUploads({
    batch: [{ key: 'u1', name: 'a.jpg', file: 'a' }, { key: 'u2', name: 'b.jpg', file: 'b' }],
    upload: async (file) => {
      if (file === 'b') log.push(`tiles:${uploads.map((u) => u.key).join(',')}`);
      return false;
    },
    setUploads: (fn) => { uploads = fn(uploads); },
    setBusy: (busy) => log.push(`busy:${busy}`),
    reload: async () => log.push('reload'),
  });
  assert.deepEqual(log, ['busy:true', 'tiles:u2', 'busy:false']);
  assert.deepEqual(result, { landed: 0, failed: 2 });

  const errors = [];
  const busy = [];
  uploads = [];
  await runAttachmentUploads({
    batch: [{ key: 'x', name: 'x.jpg', file: 'x' }],
    upload: async () => { throw new Error('เน็ตหลุด'); },
    setUploads: (fn) => { uploads = fn(uploads); },
    setBusy: (b) => busy.push(b),
    onError: (err) => errors.push(err.message),
  });
  assert.deepEqual(errors, ['เน็ตหลุด']);
  assert.deepEqual(busy, [true, false], '🔴 busy ค้าง = หน้าคิดว่ายังอัปอยู่ตลอดไป (ถามก่อนออกทุกครั้ง)');
  assert.deepEqual(uploads, []);
});

test('🐞 ลูปอัป: รูปกลางชุดโยน = พังรายรูป — รูปถัดไปยังส่ง · โหลดรายการใหม่ (รูปที่ขึ้นแล้วไม่หายจากแผง) · review 26/09', async () => {
  const log = [];
  let uploads = [];
  const result = await runAttachmentUploads({
    batch: [{ key: 'a', name: 'a', file: 'a' }, { key: 'b', name: 'b', file: 'b' }, { key: 'c', name: 'c', file: 'c' }],
    upload: async (file) => {
      log.push(`upload:${file}`);
      if (file === 'b') throw new Error('POST แถวสะดุด');
      return true;
    },
    setUploads: (fn) => { uploads = fn(uploads); },
    reload: async () => { log.push(`reload tiles:${uploads.map((u) => u.key).join(',')}`); },
    onError: (err) => log.push(`err:${err.message}`),
  });
  assert.deepEqual(log, ['upload:a', 'upload:b', 'err:POST แถวสะดุด', 'upload:c', 'reload tiles:a,c'],
    'รูป c ยังถูกส่ง · โหลดรายการก่อนถอดแผ่น a/c ที่ขึ้นแล้ว');
  assert.deepEqual(result, { landed: 2, failed: 1 });
  assert.deepEqual(uploads, []);
});

test('🐞 review 26/09 รอบสาม: รูปเดียวที่โยน (ไม่รู้ผล — แถวอาจลงแล้ว) ยังโหลดรายการใหม่ · ส่งไม่สำเร็จชัด ๆ (false) ไม่โหลด', async () => {
  let reloads = 0;
  await runAttachmentUploads({
    batch: [{ key: 'a', name: 'a', file: 'a' }],
    upload: async () => { throw new Error('คำตอบหาย'); },
    reload: async () => { reloads += 1; },
  });
  assert.equal(reloads, 1);
  await runAttachmentUploads({ batch: [{ key: 'b', name: 'b', file: 'b' }], upload: async () => false, reload: async () => { reloads += 1; } });
  assert.equal(reloads, 1, 'ตัวอัปบอกเองว่าไม่สำเร็จ = ไม่มีอะไรลง ไม่ต้องโหลด');
});

test('ลูปอัปโหมดเดิม (ไม่นับ %): ไม่ส่ง setUploads = ไม่ส่ง onProgress ให้ตัวอัป', async () => {
  const got = [];
  const result = await runAttachmentUploads({
    batch: [{ key: 'k', name: 'n', file: 'f' }],
    upload: async (file, onProgress) => { got.push(onProgress); return true; },
  });
  assert.deepEqual(got, [null], 'โหมดเดิมไม่วาดใหม่ทุกจังหวะของ xhr');
  assert.deepEqual(result, { landed: 1, failed: 0 });
});

test('ลบรูปจากกล่องดูรูปเต็ม: ถามก่อน · โทนอันตราย · บอกชื่อรูป', () => {
  const ask = photoDeleteConfirm(photo('2046'));
  assert.equal(ask.title, 'ลบรูปนี้?');
  assert.match(ask.description, /IMG_2046\.jpg/);
  assert.equal(ask.danger, true);
  assert.equal(ask.confirmLabel, 'ลบรูป');
  assert.equal(PHOTO_DELETE_LABEL, 'ลบรูปนี้');
  assert.match(photoDeleteConfirm(null).description, /รูปแนบ/);
});

test('แผง: โหมดแผ่นรูปวาดจากตัวตัดสิน · แผ่นรูปไม่มีปุ่มลบ · ลบอยู่ในกล่องดูรูปเต็ม ปุ่ม 44px', () => {
  const source = code(fs.readFileSync(FILE, 'utf8'));
  const css = code(fs.readFileSync(CSS, 'utf8'));
  assert.match(source, /photoTiles = false/, 'opt-in — ไม่ส่ง = หน้าตาเดิม');
  assert.match(source, /const tilesMode = photoTiles && inlineUpload && photoCapture;/);

  const tiles = renderBody(source, 'renderPhotoTiles');
  assert.match(tiles, /photoTilesView\(/);
  assert.doesNotMatch(tiles, /handleDelete|Trash2|width: 22/, 'ห้ามมีปุ่มลบบนแผ่นรูป');
  assert.doesNotMatch(tiles, /style=\{/, 'ห้ามเพิ่ม inline style (audit:ui นับเพดานไว้)');
  assert.match(tiles, /<progress/, '% มาทาง attribute ของ <progress> ไม่ใช่ style={{ width }}');
  assert.match(tiles, /onClick=\{\(\) => pickForType\(addType, group\)\}/,
    'แผ่นสุดท้ายเปิดตัวเลือกรูปของแผงเอง (โหมด photoGroups: จองแถวที่กดไว้ด้วย · โหมดเดิม group = null)');
  assert.match(source, /renderPhotoTiles\(\{ photos: tilePhotos, canAdd: canEdit && fileUploads, addType: inlineType \}\)/,
    'แผ่นถ่ายรูปเคารพ `fileUploads` เหมือนปุ่มเดิม (ปิดทางอัป = ไม่มีแผ่น) · อัปเข้าหัวข้อของแผงเอง');

  // กล่องดูรูปเต็ม: ปุ่มลบมีเฉพาะโหมดแผ่นรูป · ผ่านด่านรายไฟล์ `mayDelete` · ขนาดนิ้ว
  assert.match(source, /tilesMode && preview && mayDelete\(preview\)/);
  assert.match(source, /className=\{styles\.lightboxBtn\}[^]*?\{PHOTO_DELETE_LABEL\}/);
  assert.match(cssRule(css, '.lightboxBtn'), /min-height: var\(--ctl-h-touch\)/);
  assert.match(source, /photoDeleteConfirm\(/);
});

test('แผง: โหมดเดิมไม่เปลี่ยน — ตะแกรง/รายแถวยังวาดแผ่นรูปตัวเดิม (ปุ่มลบมุมรูปอยู่ที่เดิม)', () => {
  const source = code(fs.readFileSync(FILE, 'utf8'));
  const tile = renderBody(source, 'renderPhotoTile');
  /* 22 → 24 (layout-nits D4 · WCAG 2.2 SC 2.5.8) — ปุ่มยังอยู่มุมรูปที่เดิม แค่เป้ากดเป็นจัตุรัสถึงเกณฑ์
     · style object ของปุ่มเหลือแค่ตำแหน่ง/ขนาด (วงกลมย้ายลง `.tileDeleteDot` — เหตุผลอยู่ที่เทสต์ "ปุ่มลบ: เป้ากด ≥ 24×24") */
  assert.match(tile, /className=\{styles\.tileDelete\}\s*style=\{\{ position: "absolute", top: 4, right: 4, width: 24, height: 24 \}\}/);
  assert.match(tile, /handleDelete\(it\.id\)/);
  assert.match(source, /!tilesMode && photos\.length > 0 && \(rowsOf \? renderPhotoRows\(\{ photos, rows: rowsOf \}\) : renderPhotoGrid\(\{ photos \}\)\)/);
  // แถวหัว (คำใบ้ลากวาง · ปุ่มถ่ายรูป · ตัวนับ) ยังอยู่ในโหมดเดิม — โหมดแผ่นรูปเท่านั้นที่ไม่มี
  assert.match(source, /\(\(canEdit && fileUploads\) \|\| showCount\) && !tilesMode/);
});

test('แผง: onBusyChange ยิงจากลูปอัปเอง ไม่ใช่จาก effect — ยังยิงแม้หน้าพื้นที่ปิดไปแล้วระหว่างอัป', () => {
  const source = code(fs.readFileSync(FILE, 'utf8'));
  assert.doesNotMatch(source, /useEffect\(\(\) => \{[^}]*onBusyChange\?\.\(/,
    'effect ไม่ยิงหลังแผงถูกถอด ⇒ ตัวนับของหน้าค้างที่ "กำลังอัป" ตลอดไป');
  assert.match(source, /onBusyChangeRef\.current\?\.\(busy\)/);
  // ทางเข้าไฟล์ทั้งสอง (ปุ่ม/แผ่นถ่ายรูป · ลากวาง/Ctrl+V) ผ่านลูปตัวเดียว
  assert.equal((source.match(/await uploadBatch\(typeKey, ok(?:, group)?\)/g) || []).length, 2,
    'ปุ่ม/แผ่นถ่ายรูป (handleCardFile · พกแถวที่กดไว้) + ลากวาง/Ctrl+V (acceptFiles · ไม่รู้แถว) — ไม่มีลูปอัปตัวที่สอง');
  assert.match(source, /await uploadBatch\(typeKey, ok, group\)/, 'แผ่นถ่ายรูปของแถวอัปพร้อมแถวนั้น');
  assert.doesNotMatch(source, /for \(const f of (ok|files)\)/, 'ลูปอัปเขียนเองในแผง = ทางที่ไม่ยิง onBusyChange');
  assert.match(source, /runAttachmentUploads\(/);
});

/* ══ โหมดแถวรายกลุ่ม `photoGroups` (PR-S · จุดติดตั้ง: จุดหนึ่งจุด = หนึ่งแถว รูป + ชื่อ + รายละเอียด) ═══════════════
   ⭐ ยังเป็นแผงตัวเดียว: ดึงรายการครั้งเดียว · ลูปอัปตัวเดียว · แผ่นถ่ายรูปของแถวอัปพร้อม meta ของแถว (`{ spotId }`)
   ⭐ ถาดของรูปที่ไม่เข้ากลุ่ม · ย้ายเข้ากลุ่ม = PATCH metadata แล้วโหลดรายการใหม่ (ไม่แก้ในมือ — ดูเหตุในแผง) */
test('แถวรายกลุ่ม: แผ่นกำลังส่งติดแถวที่กดถ่าย · ไม่มีแถว (ลากวาง/Ctrl+V) = ขึ้นที่ถาด · โหมดเดิมเห็นครบทุกแผ่น', () => {
  const uploads = photoUploadsAdd(
    photoUploadsAdd([], [{ key: 'a', name: 'a.jpg', group: 'SPT-1' }, { key: 'b', name: 'b.jpg', group: 'SPT-2' }]),
    [{ key: 'c', name: 'c.jpg' }],
  );
  assert.deepEqual(uploads.map((u) => [u.key, u.group]), [['a', 'SPT-1'], ['b', 'SPT-2'], ['c', null]]);
  assert.deepEqual(photoUploadsOf(uploads, 'SPT-1').map((u) => u.key), ['a']);
  assert.deepEqual(photoUploadsOf(uploads, null).map((u) => u.key), ['c'], 'ไม่รู้แถว = ถาด');
  assert.deepEqual(photoUploadsOf(uploads, undefined).map((u) => u.key), ['c']);
  // โหมดเดิมไม่มีคีย์ group เลย ⇒ ทุกแผ่นเป็น null = เห็นครบเหมือนเดิม
  const plain = photoUploadsAdd([], [{ key: 'x', name: 'x.jpg' }, { key: 'y', name: 'y.jpg' }]);
  assert.deepEqual(photoUploadsOf(plain).map((u) => u.key), ['x', 'y']);
  assert.deepEqual(photoUploadsOf(null), []);
  // ความคืบหน้า/ถอดแผ่นยังเป็นตัวเดิม (ไม่ทำคีย์ group หาย)
  assert.equal(photoUploadsProgress(uploads, 'a', 0.5)[0].group, 'SPT-1');
});

test('แผง: photoGroups — แถวละกรอบ (ของผู้เรียก + แผ่นรูปของกลุ่ม) · ถาดไม่มีแผ่นถ่ายรูป · meta ของแถวไปกับรูป', () => {
  const source = code(fs.readFileSync(FILE, 'utf8'));
  const css = code(fs.readFileSync(CSS, 'utf8'));
  assert.match(source, /photoGroups,/, 'opt-in — ไม่ส่ง = แผ่นรูปแบบเดิม');
  assert.match(source, /const groupsView = tilesMode && typeof photoGroups === "function"/, 'มีความหมายเฉพาะโหมดแผ่นรูป');
  assert.match(source, /\{tilesMode && !groupsView && renderPhotoTiles\(\{ photos: tilePhotos/, 'ไม่มีกลุ่ม = แผ่นรูปตัวเดิมเป๊ะ');

  const groups = renderBody(source, 'renderPhotoGroups');
  assert.match(groups, /\{row\.content\}/);
  assert.match(groups, /group: \{ key: row\.key, meta: row\.meta \|\| null, label: row\.label \|\| "" \}/);
  assert.match(groups, /renderPhotoTiles\(\{ photos: \[it\], canAdd: false, addType, pending: \[\] \}\)/,
    'รูปในถาด: ไม่มีแผ่นถ่ายรูป · ไม่วาดแผ่น % ซ้ำทุกรูป');
  assert.match(groups, /view\.relinkControl\?\.\(it, relinkArgs\(it\)\)/, 'ตัวเลือกย้ายเข้ากลุ่มอยู่ข้างรูปในถาด');
  assert.doesNotMatch(groups, /style=\{/, 'ห้ามเพิ่ม inline style (audit:ui นับเพดานไว้)');

  const tiles = renderBody(source, 'renderPhotoTiles');
  assert.match(tiles, /pending = photoUploadsOf\(uploads, group\?\.key\)/, 'แผ่น % เฉพาะของแถวนั้น');
  assert.match(tiles, /aria-label=\{group\?\.label \? `\$\{tile\.label\} · \$\{group\.label\}` : undefined\}/,
    'แผ่นถ่ายรูปทุกแถวตาเห็นคำเดียวกัน — โปรแกรมอ่านจอต้องได้ยินว่าของจุดไหน');

  // อัป: แถวที่กด → metadata ของรูป · ลากวาง/Ctrl+V ไม่รู้แถว = `{}`
  assert.match(source, /pendingGroupRef\.current = group;/);
  assert.match(source, /upload\(file, typeKey, group\?\.meta \? \{ \.\.\.group\.meta \} : \{\}, onProgress\)/);
  assert.match(source, /group: group\?\.key \?\? null/);

  // กล่องดูรูปเต็ม: ย้ายกลุ่มได้ (ผู้เรียกวาดตัวเลือก) · ผ่านแล้วปิดกล่อง
  assert.match(source, /if \(await relinkPhoto\(preview, patch\)\) setPreview\(null\);/);
  /* 🐞 UAT 01/10 — ตัวเลือกย้ายเคยอยู่ใต้รูป 70vh ⇒ ตกใต้ขอบกล่องที่ 1024×768/1280×720/1366×768 (รูปที่ผูกแล้วย้ายจุด
     ได้ทางเดียวคือกล่องนี้) ⇒ ต้องอยู่แถบท้ายที่ไม่เลื่อนตามเนื้อ */
  const box = source.slice(source.indexOf('const lightbox = ('), source.indexOf('const docViewer = ('));
  const foot = box.slice(box.indexOf('footer={'), box.indexOf(') : undefined}'));
  assert.match(foot, /\{previewRelink \? <div className=\{styles\.lightboxRelink\}>\{previewRelink\}<\/div> : null\}/,
    'ตัวเลือกย้ายอยู่ในแถบท้าย');
  assert.equal((box.match(/previewRelink/g) || []).length, 2, 'ไม่มีตัวเลือกย้ายชุดที่สองใต้รูป');
  assert.match(box, /className=\{tilesMode \? styles\.lightbox : ""\}/, 'ปุ่มปิดขนาดนิ้วเฉพาะโหมดแผ่นรูป (โหมดอื่นหน้าตาเดิม)');
  assert.match(cssRule(css, '.lightbox :global(.drawer-close)'), /width: var\(--ctl-h-touch\);[^}]*height: var\(--ctl-h-touch\);/);
  assert.match(cssRule(css, '.lightboxFoot'), /flex-wrap: wrap;/, 'ที่ไม่พอ = ตัวเลือกย้ายขึ้นแถวบน ปุ่มลงแถวล่าง');

  assert.match(cssRule(css, '.looseItem'), /--attach-tile-cols: 1;/);
  assert.match(cssRule(css, '.group[data-kind="loose"]'), /border-style: dashed;/);
});

test('🐞 แผง: ย้ายรูปเข้ากลุ่ม = PATCH metadata แล้วโหลดรายการใหม่ — ไม่แก้รายการในมือ (รายการเก่าของแผงนี้จะทับภาพกว้างที่เพิ่งอัป)', () => {
  const source = code(fs.readFileSync(FILE, 'utf8'));
  const body = source.slice(source.indexOf('const relinkPhoto = async'), source.indexOf('const relinkArgs = '));
  assert.match(body, /await apiJson\(`\/api\/master\/attachments\/\$\{it\.id\}`, \{\s*method: "PATCH", json: \{ metadata: patch \}/,
    'ผ่าน apiJson (json ถูกแกะเป็น body ที่ตัวห่อ) — ไม่ใช่ fetch ดิบ');
  assert.match(body, /await fetchItems\(\);/);
  assert.doesNotMatch(body, /setItems\(/, 'แก้ในมือ = แผงรายงานรายการเก่าขึ้นไปทับก้อนรวมของหน้า');
  assert.match(body, /notifyToast\.error\(/, 'ผูกไม่สำเร็จต้องพูดออกมา (409 จุดยังไม่บันทึก · 403 ใบล็อก)');
  assert.doesNotMatch(body, /retry: true/, 'PATCH ไม่ลองใหม่เอง');
});

/* ══ ชนิดที่ไม่ขึ้นแผง (รูปของแถว checklist ใบสเปค · 08/10/2569) ═══════════════════════════════════
   🐞 แผงดึงไฟล์ทุกใบของ entity แล้วโยน docType ที่ไม่มีการ์ดลง "เอกสารอื่นๆ" ⇒ รูปของแถว checklist ไปโผล่บนหน้าสินค้า
      ถูกนับในหัวแผง และมีปุ่มลบ ทั้งที่แถว checklist ยังชี้อยู่ · ตัวคัดอยู่ที่ `attachmentsPanelItems.js` (ค่าล้วน) */
import { panelItemsByType, panelVisibleItems } from './attachmentsPanelItems.js';
import {
  ATTACHMENT_TYPES, productDocTypes, SPEC_ILLUSTRATION_DOC_TYPE, SPEC_ITEM_IMAGE_DOC_TYPE,
} from '../lib/master/attachmentTypes.js';

const att = (id, docType) => ({ id, docType, fileName: `${id}.png`, mimeType: 'image/png' });

test('แผงเอกสารของสินค้า: รูปของแถว checklist ไม่อยู่กองไหนและไม่ถูกนับ · docType ที่ไม่มีการ์ดยังลง "อื่นๆ"', () => {
  const items = [att('A1', SPEC_ITEM_IMAGE_DOC_TYPE), att('A2', 'ไม่มีในทะเบียน'), att('A3', 'other')];
  // หน้าสินค้าส่งการ์ดของตัวเอง (ไม่มีชนิดนี้) · แผงที่ไม่ส่ง docTypes ใช้ทะเบียนของ entity ซึ่ง **มี** ชนิดนี้ใน union
  for (const docTypes of [productDocTypes({}), undefined]) {
    const types = docTypes?.length ? docTypes : ATTACHMENT_TYPES.product;
    const visible = panelVisibleItems(items, 'product', docTypes);
    assert.deepEqual(visible.map((it) => it.id), ['A2', 'A3'], 'เลขในหัวแผง = จำนวนนี้');
    const byType = panelItemsByType(visible, types);
    assert.deepEqual(Object.values(byType).flat().map((it) => it.id).sort(), ['A2', 'A3']);
    assert.deepEqual(byType.other.map((it) => it.id), ['A2', 'A3'], 'ชนิดที่ไม่มีการ์ดยังตกกอง "อื่นๆ" เหมือนเดิม');
    assert.equal(SPEC_ITEM_IMAGE_DOC_TYPE in byType, false);
  }
  // เหลือแต่รูปของแถว = แผงว่าง (ขึ้น "ยังไม่มีเอกสารแนบ" ไม่ใช่รายการเปล่า)
  assert.deepEqual(panelVisibleItems([att('A1', SPEC_ITEM_IMAGE_DOC_TYPE)], 'product', undefined), []);
});

test('แผงที่ขอชนิดนั้นมาเองยังได้ไฟล์ครบ · entity อื่นไม่ถูกแตะ', () => {
  const items = [att('A1', SPEC_ITEM_IMAGE_DOC_TYPE), att('A2', 'other')];
  const asked = [{ key: SPEC_ITEM_IMAGE_DOC_TYPE, label: 'รูปของแถว' }];
  const visible = panelVisibleItems(items, 'product', asked);
  assert.deepEqual(visible.map((it) => it.id), ['A1', 'A2']);
  assert.deepEqual(panelItemsByType(visible, asked)[SPEC_ITEM_IMAGE_DOC_TYPE].map((it) => it.id), ['A1']);
  // ชนิดเดียวกันบน entity อื่น (ไม่ได้ประกาศซ่อน) = แถวธรรมดา
  assert.deepEqual(panelVisibleItems(items, 'customer', undefined).map((it) => it.id), ['A1', 'A2']);
  assert.deepEqual(panelVisibleItems(null, 'product', undefined), []);
});

/* ⭐ ภาพประกอบใบสเปค (มติเจ้าของ 08/10/2569) — ของจริงที่เห็นบนจอก่อนแก้: สินค้าที่มีแต่ภาพประกอบ 2 รูป หัวแผงเอกสารของสินค้า
      ขึ้น "(2)" และทั้งสองรูปอยู่ใต้ "เอกสารอื่นๆ" พร้อมปุ่มลบ */
test('แผงเอกสารของสินค้า: ภาพประกอบใบสเปคไม่อยู่กองไหนและไม่ถูกนับ · การ์ดภาพประกอบของหน้าสเปคยังได้ครบ', () => {
  const items = [
    att('I1', SPEC_ILLUSTRATION_DOC_TYPE), att('I2', SPEC_ILLUSTRATION_DOC_TYPE),
    att('R1', SPEC_ITEM_IMAGE_DOC_TYPE), att('W1', 'artwork'), att('O1', 'other'),
  ];
  // หน้าสินค้า (การ์ดของทะเบียน) และแผงที่ไม่ส่ง docTypes — เหลือแต่เอกสารของทะเบียนจริง
  for (const docTypes of [productDocTypes({}), undefined]) {
    const types = docTypes?.length ? docTypes : ATTACHMENT_TYPES.product;
    const visible = panelVisibleItems(items, 'product', docTypes);
    assert.deepEqual(visible.map((it) => it.id), ['W1', 'O1'], 'เลขในหัวแผง = 2 ไม่ใช่ 5');
    const byType = panelItemsByType(visible, types);
    assert.deepEqual(byType.artwork.map((it) => it.id), ['W1']);
    assert.deepEqual(byType.other.map((it) => it.id), ['O1'], 'ภาพประกอบต้องไม่ตกกอง "อื่นๆ"');
    assert.equal(SPEC_ILLUSTRATION_DOC_TYPE in byType, false);
  }
  // มีแต่ภาพประกอบ = แผงของหน้าสินค้าว่าง
  assert.deepEqual(panelVisibleItems([att('I1', SPEC_ILLUSTRATION_DOC_TYPE)], 'product', productDocTypes({})), []);

  // การ์ดภาพประกอบของหน้าสเปคขอคีย์นี้มาเอง (ProductSpecIllustrations) ⇒ ได้ภาพประกอบครบ และยังไม่เห็นรูปของแถว checklist
  const asked = [{ key: SPEC_ILLUSTRATION_DOC_TYPE, label: 'ภาพประกอบใบสเปคสินค้า' }];
  const visible = panelVisibleItems(items, 'product', asked);
  assert.deepEqual(visible.filter((it) => it.docType === SPEC_ILLUSTRATION_DOC_TYPE).map((it) => it.id), ['I1', 'I2']);
  assert.equal(visible.some((it) => it.docType === SPEC_ITEM_IMAGE_DOC_TYPE), false);
  assert.deepEqual(panelItemsByType(visible, asked)[SPEC_ILLUSTRATION_DOC_TYPE].map((it) => it.id), ['I1', 'I2']);
  // คีย์เดียวกันบน entity อื่น = แถวธรรมดา
  assert.deepEqual(panelVisibleItems([att('I1', SPEC_ILLUSTRATION_DOC_TYPE)], 'customer', undefined).map((it) => it.id), ['I1']);
});

test('การ์ดภาพประกอบของหน้าสเปคขอคีย์ภาพประกอบเองผ่าน docTypes — ถอดบรรทัดนี้ = การ์ดว่างทั้งที่มีรูป', () => {
  const card = code(fs.readFileSync(path.join(path.dirname(FILE), 'database/ProductSpecIllustrations.js'), 'utf8'));
  assert.match(card, /entityType="product"/);
  assert.match(card, /docTypes=\{\[\{ key: SPEC_ILLUSTRATION_DOC_TYPE, label: "[^"]+" \}\]\}/);
});

/* ภาพปลดระวางไม่ถูกวาดเป็นรูปในการ์ด และไม่ขึ้นหน้าสินค้าแล้ว ⇒ ทางลบทางเดียวที่เหลือคือรายการนี้ */
test('การ์ดภาพประกอบ: ภาพที่ซ่อนไว้มีรายการ + ปุ่มลบไฟล์ของตัวเอง (เฉพาะคนแก้สเปคได้) · ผล "ยังมีเอกสารใช้อยู่" ไม่ถือว่าลบแล้ว', () => {
  const card = code(fs.readFileSync(path.join(path.dirname(FILE), 'database/ProductSpecIllustrations.js'), 'utf8'));
  // รายการมาจากตัวคัดกลาง (มีเทสต์) และตัดแถวที่เพิ่งลบจริงออก
  assert.match(card, /setRetiredRows\(retiredIllustrations\(next\)\);/);
  assert.match(card, /const hidden = retiredRows\.filter\(\(row\) => !purgedIds\.has\(row\.id\)\);/);
  assert.match(card, /\{canEdit && retired \? \(/, 'คนที่แก้สเปคไม่ได้ต้องไม่เห็นปุ่มลบ');
  assert.match(card, /\{hidden\.map\(\(row\) => \(/);
  assert.match(card, /onClick=\{\(\) => removeHidden\(row\)\}/);
  // ลบ = ถามก่อน → เส้น DELETE ของไฟล์แนบผ่านตัวห่อ (ไม่ใช่ fetch ดิบ)
  const fn = card.slice(card.indexOf('const removeHidden = async'), card.indexOf('const photoRows ='));
  assert.ok(fn.indexOf('await confirmAction(') > 0 && fn.indexOf('await confirmAction(') < fn.indexOf('apiJson('), 'ต้องถามยืนยันก่อนยิงลบ');
  // กดยกเลิก = ออกทันที ก่อนล็อกการ์ดและก่อนยิงลบ (ลำดับอย่างเดียวไม่พอ — ผลของคำถามต้องถูกใช้)
  assert.match(fn, /if \(!\(await confirmAction\([\s\S]*?\)\)\) return;\s*setBusyId\(row\.id\);/, 'กดยกเลิกต้องไม่ยิงลบ');
  assert.match(fn, /apiJson\(`\/api\/attachments\/\$\{row\.id\}`, \{ method: "DELETE"/);
  assert.doesNotMatch(card, /[^a-zA-Z]fetch\(/);
  // ผลทุกแบบตัดสินที่ตัวเดียว (มีเทสต์ค่า: productSpecView.test.mjs) — ทั้งคำตอบที่ผ่านและที่ล้ม
  assert.match(fn, /outcome = hiddenIllustrationDeleteOutcome\(\{ body \}\);/);
  assert.match(fn, /catch \(removeError\) \{\s*outcome = hiddenIllustrationDeleteOutcome\(\{ error: removeError \}\);/);
  // แถวต้องคงอยู่เมื่อ ล้ม/ยังมีเอกสารใช้อยู่ — สองทางออกนี้ต้องมาก่อนการตัดแถวออกจากรายการ
  const failedAt = fn.indexOf('if (outcome.kind === "failed") { setError(outcome.message); return; }');
  const keptAt = fn.indexOf('if (outcome.kind === "kept") { notifyToast.info(outcome.message); return; }');
  const purgeAt = fn.indexOf('setPurgedIds((prev) => new Set(prev).add(row.id));');
  assert.ok(failedAt > 0 && keptAt > failedAt && purgeAt > keptAt, 'ล้ม/ยังใช้อยู่ ต้องออกก่อนถึงบรรทัดตัดแถว');
  assert.equal((fn.match(/setPurgedIds\(/g) || []).length, 1, 'ตัดแถวได้ทางเดียว');
  // ลบสำเร็จแล้วปุ่มถูกถอด ⇒ คืนโฟกัสคีย์บอร์ดให้รายการ/หมายเหตุของการ์ด
  assert.match(fn, /refocusHidden\.current = true;\s*setPurgedIds\(/);
  assert.match(card, /wrap\?\.querySelector\("li button:not\(\[disabled\]\)"\)\s*\|\| wrap\?\.querySelector\("\[data-hidden-note\]"\)\s*\|\| wrap\?\.parentElement\?\.querySelector\("button:not\(\[disabled\]\)"\)/);
  assert.match(card, /tabIndex=\{-1\} data-hidden-note=""/);
});

test('การ์ดภาพประกอบ: งานของการ์ดไม่ซ้อนกัน — ทุกปุ่มล็อกด้วยธงเดียว และงานที่จบปล่อยเฉพาะธงของตัวเอง', () => {
  const card = code(fs.readFileSync(path.join(path.dirname(FILE), 'database/ProductSpecIllustrations.js'), 'utf8'));
  // 🐞 ปุ่มบันทึกคำบรรยายเคยล็อกเฉพาะแถวตัวเอง ⇒ กดบันทึกระหว่างลบภาพซ่อนได้ แล้วตัวที่จบก่อนล้างธงของอีกตัว
  assert.doesNotMatch(card, /disabled=\{busyId === row\.id\}/);
  assert.match(card, /<Button size="sm" tone="primary" disabled=\{Boolean\(busyId\)\}\s*onClick=\{\(\) => save\(row\.id, caption\.trim\(\)\)\}>/);
  assert.doesNotMatch(card, /setBusyId\(""\)/, 'ห้ามล้างธงแบบไม่ดูว่าเป็นของใคร');
  assert.equal((card.match(/setBusyId\(\(current\) => \(current === [^?]+ \? "" : current\)\)/g) || []).length, 3, 'save · move · removeHidden');
});

test('แผงไฟล์แนบ: เส้นลบตอบ "ปลดระวาง" = แถวยังอยู่ในฐาน ⇒ โหลดรายการใหม่ ไม่ตัดแถวทิ้งจากรายการในมือ', () => {
  const source = code(fs.readFileSync(FILE, 'utf8'));
  const fn = source.slice(source.indexOf('const handleDelete = async'), source.indexOf('const deletePreview'));
  // 🐞 เดิมตัดแถวก่อนอ่านคำตอบ ⇒ ภาพที่เพิ่งถูกปลดระวางหายจากรายการที่แจ้งผู้เรียก: เลข "ซ่อนไว้ N ภาพ" และรายการภาพที่ซ่อนไว้ขาดไปหนึ่ง
  assert.match(fn, /const body = await res\.json\(\)\.catch\(\(\) => null\);\s*if \(body\?\.retired\) \{\s*if \(body\.message\) notifyToast\.info\(body\.message\);\s*await fetchItems\(\);\s*\} else \{\s*setItems\(\(prev\) => prev\.filter\(\(it\) => it\.id !== id\)\);\s*\}\s*return true;/);
  assert.equal((fn.match(/prev\.filter\(\(it\) => it\.id !== id\)/g) || []).length, 1);
});

test('แผงกรองที่ต้นทางที่เดียว — ทุกจุดที่โชว์/นับอ่านรายการที่คัดแล้ว และยังแจ้งผู้เรียกด้วยรายการดิบ', () => {
  const source = code(fs.readFileSync(FILE, 'utf8'));
  assert.match(source, /const \[rawItems, setItems\] = useState\(\[\]\);\s*const items = panelVisibleItems\(rawItems, entityType, docTypes\);/);
  assert.match(source, /const byType = panelItemsByType\(items, types\);/);
  // รายการดิบถูกอ่านแค่สองที่: ตัวคัด กับการแจ้งผู้เรียก (ผู้เรียกคัดตาม docType เอง — ต้องได้ครบ)
  assert.match(source, /onItemsChange\?\.\(rawItems, \{ loaded \}\);/);
  assert.equal([...source.matchAll(/\brawItems\b/g)].length, 4, 'ประกาศ · ตัวคัด · แจ้งผู้เรียก · deps ของ effect');
});

/* ══ ด่านไฟล์ของผู้เรียก `fileGate` + `reloadKey` (ประเมินจากแบบ · งวด S2b §2.3) ═══════════════════════════
   ⭐ ช่องภาพแบบของพื้นที่จากแบบรับเฉพาะ JPG/PNG (กระดาษวาดได้สองชนิดนี้) — ด่านต้องกันครบสามทางเข้า:
      ปุ่มเลือกไฟล์ · ลากมาวาง · Ctrl+V · ไฟล์ที่ผ่านยังอัปต่อ · แจ้งเหตุหนึ่งครั้งต่อชุด
   🔴 ผู้เรียกที่ไม่ส่ง prop สองตัวนี้ต้องได้แผงเดิมทุกจุด (ตัวคัดคืนชุดเดิม ไม่มีข้อความ) */
import { panelFileGate } from './attachmentsPanelItems.js';
import { isJpgOrPngFile } from '../lib/service/surveyMethod.js';

const PLAN_REJECT = 'ไฟล์นี้ลงเอกสารไม่ได้ (PDF/TIFF) — แคปเป็น PNG แล้วแนบใหม่';
const planGate = {
  accept: 'image/jpeg,image/png',
  test: (file) => isJpgOrPngFile({ fileName: file.name, mimeType: file.type }),
  rejectText: PLAN_REJECT,
  pickLabel: 'เลือกรูปแบบ',
  hideDropHint: true,
};
const fakeFile = (name, type) => ({ name, type, size: 1024 });

test('fileGate · ตัวคัด: TIFF กับ PDF ถูกทิ้งพร้อมข้อความของผู้เรียกหนึ่งครั้ง · PNG/JPG ผ่านและยังอยู่ในชุดที่อัป', () => {
  const png = fakeFile('plan.png', 'image/png');
  const jpg = fakeFile('plan.jpg', 'image/jpeg');
  const tiff = fakeFile('plan.tiff', 'image/tiff');
  const pdf = fakeFile('plan.pdf', 'application/pdf');
  assert.deepEqual(panelFileGate(planGate, [tiff]), { accepted: [], rejectText: PLAN_REJECT });
  assert.deepEqual(panelFileGate(planGate, [pdf]), { accepted: [], rejectText: PLAN_REJECT });
  // ชุดผสม: ของที่ผ่านอัปต่อ ลำดับเดิม · ข้อความเดียวแม้ถูกทิ้งสองไฟล์
  const mixed = panelFileGate(planGate, [png, tiff, jpg, pdf]);
  assert.deepEqual(mixed.accepted, [png, jpg]);
  assert.equal(mixed.rejectText, PLAN_REJECT);
  assert.deepEqual(panelFileGate(planGate, [png]), { accepted: [png], rejectText: null });
  // TIFF ที่ตั้งชื่อลงท้าย .png — ตัวตัดสินของผู้เรียกดูชนิดก่อนชื่อ
  assert.deepEqual(panelFileGate(planGate, [fakeFile('plan.png', 'image/tiff')]).accepted, []);
  // ลากวางจากบางเบราว์เซอร์ไม่มีชนิด ⇒ ดูนามสกุล
  assert.deepEqual(panelFileGate(planGate, [fakeFile('plan.PNG', '')]).accepted.length, 1);
});

test('fileGate · ไม่มีด่าน / ด่านไม่มีตัวตัดสิน = ชุดเดิมทั้งชุด ไม่มีข้อความ (พฤติกรรมของวันนี้)', () => {
  const files = [fakeFile('a.tiff', 'image/tiff'), fakeFile('b.pdf', 'application/pdf')];
  for (const gate of [null, undefined, {}, { accept: 'image/png' }, { test: 'ไม่ใช่ฟังก์ชัน' }]) {
    const out = panelFileGate(gate, files);
    assert.deepEqual(out.accepted, files);
    assert.equal(out.rejectText, null);
  }
  assert.deepEqual(panelFileGate(planGate, []), { accepted: [], rejectText: null });
  assert.deepEqual(panelFileGate(planGate, null), { accepted: [], rejectText: null });
  // ตัวตัดสินที่โยน = ไฟล์นั้นไม่ผ่าน (ปิดไว้ก่อน) ไม่ใช่ล้มทั้งชุด
  const boom = panelFileGate({ test: () => { throw new Error('x'); }, rejectText: 'ไม่รับ' }, files);
  assert.deepEqual(boom, { accepted: [], rejectText: 'ไม่รับ' });
});

test('fileGate · แผง: ทางเข้าไฟล์ทั้งสอง (ปุ่ม · ลากวาง/Ctrl+V) ผ่านตัวคัด **ก่อน** กติการาย docType · ช่องเลือกไฟล์ใช้ accept ของด่าน', () => {
  const source = code(fs.readFileSync(FILE, 'utf8'));
  assert.match(source, /fileGate = null,/);
  assert.match(source, /reloadKey = 0,/);
  const pick = source.slice(source.indexOf('const handleCardFile = async'), source.indexOf('const acceptFiles = useCallback'));
  assert.match(pick, /const files = splitByFileRule\(typeKey, gateFiles\(picked\)\);/);
  const drop = source.slice(source.indexOf('const acceptFiles = useCallback'), source.indexOf('const intake = useFileIntake'));
  assert.match(drop, /const files = splitByFileRule\(typeKey, gateFiles\(Array\.from\(fileList \|\| \[\]\)\.filter\(Boolean\)\)\);/);
  // ลากวางกับ Ctrl+V ใช้ตัวรับเดียวกัน (`useFileIntake` → `acceptFiles`) ⇒ สองทางนั้นผ่านด่านเดียว
  assert.match(source, /onFiles: acceptFiles,/);
  assert.equal([...source.matchAll(/\bgateFiles\(/g)].length, 2, 'ปุ่ม · ลากวาง/วาง');
  // แจ้งเหตุหนึ่งครั้งต่อชุด — ตัวคัดคืนข้อความเดียว แผงยิง toast ที่เดียว
  assert.match(source, /const \{ accepted, rejectText \} = panelFileGate\(fileGateRef\.current, files\);\s*if \(rejectText\) notifyToast\.error\(rejectText\);\s*return accepted;/);
  assert.match(source, /const acceptFor = \(typeKey\) => fileGate\?\.accept \|\| docTypeFileRule\(typeKey\)\?\.accept \|\| defaultAccept;/);
});

test('fileGate · แผง: ป้ายแผ่นสุดท้ายและคำใบ้ลากวางเปลี่ยนเฉพาะเมื่อด่านขอ · reloadKey เปลี่ยน = โหลดรายการใหม่ (0 = ไม่โหลดซ้ำ)', () => {
  const source = code(fs.readFileSync(FILE, 'utf8'));
  assert.match(source, /const addLabel = group \? tile\.label : \(fileGate\?\.pickLabel \|\| tile\.label\);/);
  assert.match(source, /<Camera size=\{22\} aria-hidden="true" \/>\s*\{addLabel\}/);
  assert.match(source, /\{group \|\| hideDropHint \? null : <small className=\{`\$\{styles\.tileHint\} \$\{styles\.pointerOnly\}`\}>\{tile\.hint\}<\/small>\}/);
  assert.match(source, /const hideDropHint = fileGate\?\.hideDropHint === true;/);
  // คำใบ้สองบรรทัดของโหมด inline และแผงเต็ม ซ่อนตามธงเดียวกัน — ไม่มีธง = เงื่อนไขเดิม
  assert.match(source, /\{canEdit && fileUploads && !hideDropHint && \(\s*<p className=\{`mr-auto/);
  assert.match(source, /\{canEdit && !loading && !hideDropHint && \(\s*<p className="mt-3/);
  /* 🐞 review S2b — แผงที่เมานต์ตอนเลขไม่ใช่ศูนย์ (ผู้เรียกนับต่อทั้งหน้า แผงเมานต์ใหม่ทุกพื้นที่) ต้องไม่ยิงซ้ำกับรอบเมานต์:
     โหลดใหม่เฉพาะตอนเลข **เปลี่ยนจากที่เห็นล่าสุด** */
  assert.match(source, /const seenReloadKey = useRef\(reloadKey\);\s*useEffect\(\(\) => \{\s*if \(reloadKey === seenReloadKey\.current\) return;\s*seenReloadKey\.current = reloadKey;\s*fetchItems\(\);\s*\}, \[reloadKey, fetchItems\]\);/);
  assert.doesNotMatch(source, /if \(reloadKey\) fetchItems\(\)/);
});


/* ══ ตะแกรงรูปของโหมด inline: ชื่อไฟล์ · ป้ายชนิดเอกสาร (ผู้เรียกเปิดเอง) · ปุ่มลบ 24px (layout-nits D4 — ของเก่าบน main) ═════════
   🐞 การ์ด "ไฟล์แนบของคำร้อง" ที่ 375: รูปไม่บอกชื่อ (อยู่แค่ alt/title — มือถือไม่มี hover) · ไม่บอกว่าเป็นสเปกหรือรูปอ้างอิง
      ทั้งที่การ์ดกองทุกชนิดไว้ด้วยกัน · ปุ่มลบของแถวไฟล์ 17×17 ชื่อ "ลบ" เฉย ๆ · ปุ่มลบมุมรูป 22×22 ติดขอบปุ่มเปิดรูป
   ⚠️ แผงเป็น JSX (Node ดิบเรนเดอร์ไม่ได้) ⇒ ยามด้วยซอร์สของฟังก์ชันวาดแต่ละตัว + กฎ CSS ที่ทำให้ "บรรทัดเดียว" เป็นจริง */
const SRC = path.join(process.cwd(), 'src');

test('ตะแกรงรูป: ชื่อไฟล์บรรทัดเดียวใต้รูป ("…" + ชื่อเต็มที่ title) · ไม่อ่านออกเสียงซ้ำ · รายการรายแถวไม่ซ้ำชื่อของผู้เรียก', () => {
  const source = code(fs.readFileSync(FILE, 'utf8'));
  const css = code(fs.readFileSync(CSS, 'utf8'));
  const tile = renderBody(source, 'renderPhotoTile');
  assert.match(tile, /const renderPhotoTile = \(\{ it, caption = false \}\) =>/, 'ไม่ส่ง caption = หน้าตาเดิม');
  assert.match(tile, /\{caption && \(\s*<span className=\{styles\.thumbCaption\}>\s*<span className=\{styles\.thumbName\} title=\{it\.fileName \|\| "รูปแนบ"\} aria-hidden="true">\{it\.fileName \|\| "รูปแนบ"\}<\/span>/,
    'ชื่อใต้รูปเป็นของตาอย่างเดียว — ชื่อของปุ่มเปิดรูปมาจาก alt (= ชื่อไฟล์) แล้ว ไม่ซ่อน = ได้ยินชื่อซ้ำสองรอบติดกัน');
  assert.match(tile, /alt=\{it\.fileName \|\| "รูปแนบ"\}/, 'ชื่อที่โปรแกรมอ่านจอได้ยินยังอยู่ที่ปุ่มเปิดรูป');
  assert.ok(tile.indexOf('styles.thumbCaption') > tile.indexOf('</button>'), 'คำบรรยายอยู่หลังปุ่มเปิดรูป ไม่ใช่ข้างใน');
  assert.equal((tile.match(/style=\{\{/g) || []).length, 4, 'ห้ามเพิ่ม inline style (audit:ui นับเพดานไว้) — ของใหม่อยู่ใน module');
  assert.match(renderBody(source, 'renderPhotoGrid'), /renderPhotoTile\(\{ it, caption: true \}\)/);
  assert.match(renderBody(source, 'renderPhotoRows'), /renderPhotoTile\(\{ it \}\)/,
    'รายการรายแถว (ใบสเปค) เขียน "ภาพที่ n · ชื่อไฟล์" ไว้ฝั่งขวาเองแล้ว');

  const name = cssRule(css, '.thumbName');
  for (const rule of [/white-space: nowrap;/, /text-overflow: ellipsis;/, /overflow: hidden;/, /max-width: 100%;/]) {
    assert.match(name, rule, `ชื่อไฟล์ต้องบรรทัดเดียว: ${rule}`);
  }
  assert.match(name, /line-height: var\(--lh-thai\);/, 'overflow: hidden + กล่องบรรทัดเตี้ย = สระบน/ล่างของไทยขาด');
  assert.match(cssRule(css, '.thumbCaption'), /min-width: 0;/, 'ช่องของตะแกรงเป็น minmax(0, 148px) — ชื่อยาวต้องไม่ดันช่องกว้าง');
});

test('ป้ายชนิดเอกสาร: ค่าตั้งต้นปิด (`typePills`) · ชนิดตั้งต้นไม่มีป้ายทั้งรูปและ PDF · รูปและแถวไฟล์วาดผ่านตัวเดียว', () => {
  const source = code(fs.readFileSync(FILE, 'utf8'));
  const css = code(fs.readFileSync(CSS, 'utf8'));
  /* 🔴 โหมด inline ไม่มีที่ให้เลือกชนิด — ทุกไฟล์ที่แนบผ่านแผงลง `types[0]` ⇒ เปิดให้ทุกแผง = รูปสลิปมัดจำของดีลขึ้น
     "บรีฟจากลูกค้า" · ทุกรูปของ SO ขึ้น "เอกสารจากลูกค้า" (ค่าตั้งต้นที่ไม่มีใครเลือก บนจอขาย) */
  assert.match(source, /\n  typePills = false,\n\}\) \{/, 'ค่าตั้งต้นต้องปิด — ผู้เรียกเปิดเอง');
  assert.match(source, /const pillsOn = typePills && inlineUpload && !tilesMode && !scoped && types\.length > 1;/,
    'แผงหัวข้อเดียว / ทะเบียนชนิดเดียว / แผ่นรูป = ป้ายซ้ำหัวข้อของผู้เรียกทุกรูป');
  assert.equal((source.match(/const inlineType = /g) || []).length, 1, 'ชนิดตั้งต้นของ inline ประกาศที่เดียว (ป้ายกับปุ่มแนบถามตัวเดียวกัน)');
  assert.match(source, /const inlineType = types\[0\]\?\.key \|\| "other";/);
  assert.equal((source.match(/const scoped = /g) || []).length, 1);

  /* 🔴 ป้ายขึ้นเฉพาะชนิดที่มีคนเลือก — สองชนิดตั้งต้นไม่มีป้าย **ทั้งรูปและ PDF**
     · `inlineType`: การ์ดคำร้องลงทุกไฟล์เป็น "รูปอ้างอิง / ตัวอย่าง" (ผัง/บรีฟก็ด้วย)
     · `other`: `uploadDraftFiles` ของ /requests/new ลงทุกไฟล์เป็น `other`
     ⇒ รอบแรกยกเว้นแค่ PDF ที่เป็น `inlineType` = รูปเดียวกันขึ้นคนละป้ายตามจอที่แนบ (ป้ายบอกทาง ไม่ใช่ชนิด) */
  const pill = source.slice(source.indexOf('const typePillOf = '), source.indexOf('const [rawItems, setItems]'));
  assert.match(pill, /if \(!pillsOn \|\| !it\) return null;/);
  assert.match(pill, /const own = types\.find\(\(t\) => t\.key === it\.docType\);\s*if \(!own \|\| own\.key === inlineType \|\| own\.key === "other"\) return null;\s*return own\.label;/,
    'ชนิดตั้งต้นของแผง · `other` · docType ที่ทะเบียนไม่รู้จัก (= กองของ "อื่น ๆ") ไม่มีป้าย');
  assert.doesNotMatch(pill, /isPreviewableImage/, 'กติกาไม่แยกรูปกับ PDF — ชนิดตั้งต้นบนรูปก็ไม่มีใครเลือกเหมือนกัน');
  assert.doesNotMatch(pill, /attachmentTypeLabel/, 'ไม่ตกไปหาป้ายของทะเบียนกลาง — ชนิดที่แผงไม่รู้จักไม่มีป้าย');

  /* ทะเบียนของคำร้อง (ผู้เรียกที่เดียวของ `typePills`) — กติกาข้างบนเหลือป้ายให้ `spec` ชนิดเดียว ต่อเมื่อลำดับยังเป็นแบบนี้:
     ชนิดแรก (= `inlineType` ที่การ์ดลงให้ทุกไฟล์) เป็นรูปอ้างอิง · ย้าย `spec` ขึ้นเป็นชนิดแรก = ทุกไฟล์บนการ์ดกลายเป็น "สเปก" เงียบ ๆ */
  assert.deepEqual(ATTACHMENT_TYPES.dept_request.map((t) => t.key), ['reference_image', 'spec', 'other']);

  assert.match(renderBody(source, 'renderTypePill'),
    /\(label\s*\?\s*<span className=\{`\$\{styles\.typePill\} \$\{extraClass\}`\.trim\(\)\} title=\{label\}>\{label\}<\/span>\s*:\s*null\)/);
  const tile = renderBody(source, 'renderPhotoTile');
  assert.match(tile, /const typeLabel = caption \? typePillOf\(it\) : null;/, 'บนรูปมีป้ายเฉพาะคำบรรยายของตะแกรง');
  assert.match(tile, /\{renderTypePill\(typeLabel\)\}/);
  const row = renderBody(source, 'renderFileRow');
  const at = row.indexOf('{renderTypePill(typePillOf(it), styles.rowPill)}');
  assert.ok(at > row.lastIndexOf('</a>') && at < row.indexOf('flex items-center gap-1 shrink-0'),
    'แถวไฟล์: ป้ายอยู่ระหว่างชื่อไฟล์กับกลุ่มปุ่ม — ไม่อยู่ในลิงก์ (ชื่อของลิงก์ = ชื่อไฟล์เท่านั้น)');

  const rule = cssRule(css, '.typePill');
  assert.match(rule, /font-size: var\(--fs-2\);/);
  assert.match(rule, /white-space: nowrap;/, 'ป้ายยาวกว่าช่อง 148px ("สเปก / แบบงาน / บรีฟ" ที่จอแคบ) = "…" ไม่ตัดบรรทัด');
  assert.match(rule, /text-overflow: ellipsis;/);
  assert.doesNotMatch(rule, /min-height/, 'ป้ายย่อ — ไม่ใช่ .status-pill เต็มขนาด (24px) ใต้รูปทุกช่อง');
  const rowRule = cssRule(css, '.rowPill');
  assert.match(rowRule, /flex: none;/, 'ชื่อไฟล์ (truncate) ตัด "…" ก่อนป้าย');
  assert.match(rowRule, /margin-inline-start: auto;/, 'แถวเป็น justify-between — ไม่ดัน = ป้ายลอยกลางที่ว่าง');
  assert.match(rowRule, /max-width: 10rem;/);
  assert.ok(css.indexOf('.rowPill {') > css.indexOf('.typePill {'), '.rowPill ต้องตามหลัง .typePill (max-width ทับกัน — ลำดับตัดสิน)');
});

test('ป้ายชนิดเอกสาร: เปิดที่การ์ด "ไฟล์แนบของคำร้อง" ที่เดียว — แผงที่ผู้เรียกไม่เปิด (ดีล) ไม่มีป้าย', () => {
  const users = fs.readdirSync(SRC, { recursive: true })
    .filter((f) => f.endsWith('.js') && !f.endsWith('AttachmentsPanel.js'))
    .filter((f) => /\btypePills\b/.test(code(fs.readFileSync(path.join(SRC, f), 'utf8'))))
    .map((f) => f.split(path.sep).join('/'));
  assert.deepEqual(users, ['app/requests/[id]/page.js'],
    'เปิดป้ายที่แผงใหม่ = ชนิดของ entity นั้นต้องมีทางเขียนอื่นจริง ไม่ใช่ค่าตั้งต้นของแผงทุกไฟล์ (เหตุผลอยู่ที่ prop `typePills`)');

  const page = code(fs.readFileSync(path.join(SRC, 'app/requests/[id]/page.js'), 'utf8'));
  const from = page.indexOf('title="ไฟล์แนบของคำร้อง"');
  assert.notEqual(from, -1);
  assert.match(page.slice(from, page.indexOf('</DetailCard>', from)),
    /<AttachmentsPanel\s+entityType="dept_request"[\s\S]*?\binlineUpload\s+(?:\{\.\.\.\(requiredFilesSpec \? \{ onItemsChange: onAttachmentsChange, reloadKey: attachmentsReloadKey \} : \{\}\)\}\s+)?typePills\s*\/>/);
  // ⤴ ช่องว่างระหว่าง inlineUpload กับ typePills = ตัวซิงก์กับบล็อกไฟล์บังคับของ S4 (ประเมินจากแบบ) เท่านั้น

  // ตัวอย่างฝั่งลบ: แผงดีลเป็นทางเขียนไฟล์ของดีลทางเดียว ⇒ ทุกรูปเป็นชนิดตั้งต้น "บรีฟจากลูกค้า"
  const deal = code(fs.readFileSync(path.join(SRC, 'components/salesPlanning/EntityDocumentsPanel.js'), 'utf8'));
  assert.match(deal, /<AttachmentsPanel/);
  assert.doesNotMatch(deal, /typePills/);
});

test('ปุ่มลบ: เป้ากด ≥ 24×24 (WCAG 2.2 SC 2.5.8) และชื่อที่อ่านออกเสียงบอกว่าลบไฟล์ไหน', () => {
  const source = code(fs.readFileSync(FILE, 'utf8'));
  const css = code(fs.readFileSync(CSS, 'utf8'));
  // แถวไฟล์ (โหมด inline · โหมดการ์ด)
  const row = renderBody(source, 'renderFileRow');
  assert.match(row, /className=\{`\$\{styles\.rowDelete\} text-\[var\(--red\)\] hover:opacity-70`\}\s*aria-label=\{`ลบ \$\{it\.fileName \|\| "ไฟล์แนบ"\}`\}/);
  assert.doesNotMatch(row, /p-0\.5/, 'ปุ่มเดิม 17×17 (ไอคอน 13px + p-0.5)');
  const del = cssRule(css, '.rowDelete');
  assert.match(del, /width: var\(--space-6\);\s*height: var\(--space-6\);/, '24px');
  assert.match(del, /margin-block: calc\(-1 \* var\(--space-1\)\);/, 'ขอบลบเท่า py-1 ของแถว — แถวไม่สูงขึ้น');
  assert.match(del, /border-radius: 0;/, 'มุมโค้งตัดมุมกล่องออกจากพื้นที่กด — จัตุรัส 24×24 ต้องอยู่ในเป้าทั้งตัว');
  /* มุมรูปของตะแกรง/รายแถว — 2.5.8 ต้องมี **จัตุรัส** 24×24 ทั้งตัวอยู่ในพื้นที่กด (docs/wcag-2.2-reference.md §4.3)
     🐞 รอบแรก: กล่อง 24×24 แต่ `borderRadius: "50%"` บนตัวปุ่ม ⇒ พื้นที่กด = วงกลม 24px · กดมุมกล่องเข้า 1px = เปิดรูปแทน
        และข้อยกเว้นระยะห่างใช้ไม่ได้ (× วางทับปุ่มเปิดรูป) ⇒ ขอบโค้งต้องไม่อยู่บนตัวปุ่ม — วงกลมที่ตาเห็นเป็นของ span ข้างใน */
  const tile = renderBody(source, 'renderPhotoTile');
  assert.match(tile, /aria-label=\{`ลบ \$\{it\.fileName \|\| "รูปแนบ"\}`\}/);
  assert.doesNotMatch(tile, /width: 22|height: 22/);
  const delBtn = tile.slice(tile.indexOf('onClick={() => handleDelete(it.id)}'), tile.indexOf('</button>', tile.indexOf('handleDelete(it.id)')));
  assert.match(delBtn, /style=\{\{ position: "absolute", top: 4, right: 4, width: 24, height: 24 \}\}/, 'กล่องของปุ่ม = 24×24');
  assert.doesNotMatch(delBtn, /borderRadius/, 'ขอบโค้งบนตัวปุ่มตัดพื้นที่กดเป็นวงกลม');
  assert.match(delBtn, /<span className=\{styles\.tileDeleteDot\} aria-hidden="true">\s*<Trash2 size=\{12\} \/>\s*<\/span>/,
    'วงกลมสีกรมที่ตาเห็นอยู่บน span ข้างใน');
  const square = cssRule(css, '.tileDelete');
  assert.match(square, /border-radius: 0;/, 'ต้องเขียนเอง — ไม่พึ่ง preflight');
  assert.match(square, /background: transparent;/);
  assert.match(square, /padding: 0;/);
  assert.doesNotMatch(square, /^\s*(?:width|height):/m, 'ขนาดอยู่ใน style object ของปุ่ม (ด่าน audit:ui นับเลขดิบสองทาง) — สองที่ = เพี้ยนกันวันหนึ่ง');
  const dot = cssRule(css, '.tileDeleteDot');
  assert.match(dot, /border-radius: var\(--radius-full\);/);
  assert.match(dot, /width: 100%;\s*height: 100%;/, 'วงกลมเต็มกล่องของปุ่ม — หน้าตาเท่ารอบก่อน');
  assert.match(dot, /pointer-events: none;/);
});
