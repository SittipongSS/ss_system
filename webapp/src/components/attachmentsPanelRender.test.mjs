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
   ⭐ สิ่งที่ต้องไม่หลุด: แผ่นสุดท้ายคือ "ถ่าย / เลือกรูป" · รูปที่กำลังส่งบอก % รายรูป · **ไม่มีปุ่มลบ 22px
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
  assert.match(tile, /width: 22, height: 22/);
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
import { ATTACHMENT_TYPES, productDocTypes, SPEC_ITEM_IMAGE_DOC_TYPE } from '../lib/master/attachmentTypes.js';

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

test('แผงกรองที่ต้นทางที่เดียว — ทุกจุดที่โชว์/นับอ่านรายการที่คัดแล้ว และยังแจ้งผู้เรียกด้วยรายการดิบ', () => {
  const source = code(fs.readFileSync(FILE, 'utf8'));
  assert.match(source, /const \[rawItems, setItems\] = useState\(\[\]\);\s*const items = panelVisibleItems\(rawItems, entityType, docTypes\);/);
  assert.match(source, /const byType = panelItemsByType\(items, types\);/);
  // รายการดิบถูกอ่านแค่สองที่: ตัวคัด กับการแจ้งผู้เรียก (ผู้เรียกคัดตาม docType เอง — ต้องได้ครบ)
  assert.match(source, /onItemsChange\?\.\(rawItems, \{ loaded \}\);/);
  assert.equal([...source.matchAll(/\brawItems\b/g)].length, 4, 'ประกาศ · ตัวคัด · แจ้งผู้เรียก · deps ของ effect');
});
