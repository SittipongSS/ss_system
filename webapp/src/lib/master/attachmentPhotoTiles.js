// ── โหมดแผ่นรูป (`photoTiles`) ของแผงไฟล์แนบ + ลูปอัปหนึ่งชุด — ตัวตัดสินล้วน ─────────────────
//    (แผน §10.5 จอหน้างานแบบ A · ชุด S6 · ม็อก A-3 · AT-2 · AW-1 · AO-3)
//
// ⭐ **ทำไมต้องมีโหมดนี้** — จอหน้างานของช่างวาดรูปเป็น "แผ่น" เรียงสามช่อง: รูปที่ขึ้นแล้ว (ป้าย "ขึ้นแล้ว")
//   → รูปที่กำลังส่ง ("กำลังส่ง 64%" + แถบ) → แผ่นสุดท้าย "ถ่าย / เลือกรูป"
//   🐞 ของเดิม: ปุ่ม "ถ่ายรูป" แยกแถวเหนือตะแกรง · ระหว่างอัปรู้แค่ "กำลังอัป…" ไม่รู้ว่ารูปไหนไปถึงไหน
//      (ช่างเลือกมาห้ารูปบนเน็ตมือถือ = ยืนรอโดยไม่รู้ว่าเหลืออีกเท่าไร) · ปุ่มลบ × มุมรูปกว้าง 22px
//      ต่ำกว่าเป้านิ้ว 44px ⇒ กดพลาดโดนรูปข้าง ๆ
//   ⇒ แผ่นรูปแตะแล้ว **เปิดดูอย่างเดียว** · ลบย้ายเข้ากล่องดูรูปเต็ม (ปุ่ม 44px + ถามก่อน)
//
// ⭐ **ลูปอัปอยู่ที่นี่ด้วย** (`runAttachmentUploads`) — ทุกทางเข้าไฟล์ของแผง (ปุ่ม · แผ่นถ่ายรูป · ลากวาง ·
//   Ctrl+V) ผ่านลูปตัวเดียว ⇒ ลำดับ "เปิด busy → อัปทีละไฟล์ → โหลดรายการใหม่ → ถอดแผ่น → ปิด busy"
//   เทสต์ได้ด้วยตัวอัปจำลอง ไม่ต้องมีเบราว์เซอร์
//   🔑 `setBusy` ถูกเรียก **จากลูปเอง** ไม่ใช่จาก effect ของแผง — หน้าพื้นที่ถูกปิดระหว่างอัป (ช่างกด
//      "ถัดไป" ตอนรูปยังขึ้นไม่เสร็จ) ลูปยังวิ่งต่อจนจบ และหน้าต้องได้ยิน "จบแล้ว" เพื่อโหลดตัวนับรูปใหม่
//      (แผนลงมือ §3.7) · effect ของคอมโพเนนต์ที่ถูกถอดแล้วไม่มีวันได้รัน
//
// ⚠️ ไฟล์นี้ไม่แตะ DOM/React และไม่ยิง API — แผงถือ state แล้วส่งฟังก์ชันเข้ามา ⇒ เทสต์ด้วยค่าล้วน
//    (`components/attachmentsPanelRender.test.mjs`)

export const PHOTO_TILE_ADD_LABEL = 'ถ่าย / เลือกรูป';
/* คำใบ้ของจอที่มีเมาส์ (AW-1) — แผงซ่อนบนจอสัมผัสด้วยคลาส `pointerOnly` (ไม่มีอะไรให้ลาก) */
export const PHOTO_TILE_DROP_HINT = 'หรือลากไฟล์มาวาง';
export const PHOTO_TILE_DONE_CHIP = 'ขึ้นแล้ว';
export const PHOTO_DELETE_LABEL = 'ลบรูปนี้';

const photoName = (item) => String(item?.fileName || '').trim() || 'รูปแนบ';

/**
 * ความคืบหน้า 0–1 → เปอร์เซ็นต์ที่โชว์
 * ⚠️ **ปัดลง** — 99.6% ยังไม่ใช่ 100 · 100 ต้องแปลว่าไบต์ขึ้นครบจริง (ตัวอัปรายงาน 1 เมื่อ PUT จบเท่านั้น)
 */
export function photoUploadPercent(fraction) {
  const n = Number(fraction);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 1) return 100;
  return Math.floor(n * 100);
}

/**
 * ต่อรูปชุดใหม่ท้ายกองกำลังส่ง — ตามลำดับที่ผู้ใช้เลือก
 * `fraction: null` = ยังไม่ถึงคิว (ลูปอัปทีละไฟล์ ⇒ รูปที่สองรอรูปแรก) — ต่างจาก 0 ที่แปลว่าเริ่มส่งแล้ว
 * @param {Array} uploads กองเดิม
 * @param {Array<{key: string, name?: string}>} batch
 */
export function photoUploadsAdd(uploads = [], batch = []) {
  return [
    ...uploads,
    ...batch.map(({ key, name }) => ({ key, name: String(name || ''), fraction: null })),
  ];
}

/**
 * รายงานความคืบหน้าของรูปหนึ่งรูป
 * ⚠️ **แถบไม่ถอยหลัง** — ตัวอัปถอยไปเส้นสำรอง (ผ่าน API · ไม่มี %) ได้กลางทาง ค่าที่มาช้ากว่าต้องไม่ดึงแถบกลับ
 * ⚠️ คีย์ที่ไม่อยู่ในกองแล้ว (ชุดจบไปก่อน xhr ตัวสุดท้ายรายงาน) = คืนกองเดิม **ตัวเดิม** ⇒ React ไม่วาดใหม่
 */
export function photoUploadsProgress(uploads = [], key, fraction) {
  if (!uploads.some((u) => u.key === key)) return uploads;
  const n = Number(fraction);
  const next = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
  return uploads.map((u) => (u.key === key ? { ...u, fraction: Math.max(u.fraction ?? 0, next) } : u));
}

export function photoUploadsRemove(uploads = [], keys = []) {
  const drop = new Set(keys);
  return uploads.filter((u) => !drop.has(u.key));
}

/**
 * แผงจะวาดแผ่นอะไรบ้าง ตามลำดับ
 * @param photos    รูปที่ขึ้นระบบแล้ว (แถวไฟล์แนบที่เปิดดูเป็นรูปได้ · กรองตามหัวข้อของแผงมาแล้ว)
 * @param uploads   กองกำลังส่ง (`photoUploadsAdd`/`photoUploadsProgress`)
 * @param canAdd    มีแผ่นถ่ายรูปไหม (แนบได้ + แผงเปิดทางอัปไฟล์)
 * @param canDelete (item) => ลบรูปนี้ได้ไหม — ใช้แค่ป้ายอ่านออกเสียง ปุ่มลบจริงอยู่ในกล่องดูรูปเต็ม
 * @returns {{ tiles: Array<
 *   {kind:'photo', key, item, name, chip, ariaLabel}
 *   | {kind:'upload', key, name, text, value, ariaLabel}
 *   | {kind:'add', key, label, hint}> }}
 */
export function photoTilesView({ photos = [], uploads = [], canAdd = false, canDelete = () => false } = {}) {
  const tiles = [];
  for (const item of photos) {
    const name = photoName(item);
    tiles.push({
      kind: 'photo',
      key: item.id,
      item,
      name,
      chip: PHOTO_TILE_DONE_CHIP,
      // แตะแผ่น = เปิดกล่องดูรูปเต็ม · คนที่ลบได้ต้องรู้ว่าทางลบอยู่ในนั้น
      ariaLabel: canDelete(item) ? `ดูหรือลบรูป ${name}` : `ดูรูป ${name}`,
    });
  }
  for (const u of uploads) {
    const name = String(u.name || '').trim() || 'รูปแนบ';
    const waiting = u.fraction === null || u.fraction === undefined;
    tiles.push({
      kind: 'upload',
      key: u.key,
      name,
      text: waiting ? 'รอส่ง' : `กำลังส่ง ${photoUploadPercent(u.fraction)}%`,
      value: waiting ? 0 : Math.min(1, Math.max(0, u.fraction)),
      ariaLabel: `กำลังส่งรูป ${name}`,
    });
  }
  if (canAdd) tiles.push({ kind: 'add', key: 'add', label: PHOTO_TILE_ADD_LABEL, hint: PHOTO_TILE_DROP_HINT });
  return { tiles };
}

/**
 * คำถามก่อนลบรูปจากกล่องดูรูปเต็ม (ส่งเข้า `confirmAction`)
 * ⚠️ "หายจากที่นี่" ไม่ใช่ "หายจากระบบ" — บางชนิดเอกสาร (ภาพประกอบใบสเปคที่ใบอนุมัติแล้วอ้างอยู่) ถูก
 *    **ปลดระวาง** แทนการลบ (mig 0370) · สองกรณีตรงกันแค่ว่ารูปหายจากรายการนี้
 */
export function photoDeleteConfirm(item) {
  return {
    title: 'ลบรูปนี้?',
    description: `${photoName(item)} จะหายจากที่นี่ทันที`,
    confirmLabel: 'ลบรูป',
    danger: true,
  };
}

/**
 * อัปไฟล์หนึ่งชุด ทีละไฟล์ตามลำดับ
 *
 * @param batch      [{ key, name, file }] — `key` ไม่ซ้ำตลอดอายุแผง (แผงนับเลขเอง)
 * @param upload     (file, onProgress|null) => Promise<boolean> — `true` = ขึ้นระบบแล้ว (แสดงข้อผิดพลาดเอง)
 * @param setUploads (updater) => void แบบ setState · **ไม่ส่ง = ไม่นับ %** (โหมดเดิมไม่วาดใหม่ทุกจังหวะของ xhr)
 * @param setBusy    (busy) => void — ยิง `true` ก่อนไฟล์แรก และ `false` ใน finally **เสมอ** (พังกลางทางก็ปิด)
 * @param reload     () => Promise — โหลดรายการใหม่ · เรียกเฉพาะเมื่อมีรูปขึ้นอย่างน้อยหนึ่งรูป
 * @param onError    (err) => void — ตัวอัปโยนข้อผิดพลาดที่ไม่ได้คาด (รายรูป — รูปที่เหลือยังส่งต่อ) · โหลดรายการพัง
 * @returns {Promise<{landed: number, failed: number}>}
 *
 * 🔑 ลำดับตอนจบ: **โหลดรายการใหม่ก่อน แล้วค่อยถอดแผ่นกำลังส่ง** — กลับกันแล้วมีจังหวะที่รูปหายไปทั้งแผ่น
 *    (แผ่น 100% หาย แต่รายการใหม่ยังไม่มา) ช่างเห็นแล้วกดถ่ายซ้ำ
 */
export async function runAttachmentUploads({
  batch = [], upload, setUploads = null, setBusy = null, reload = null, onError = null,
} = {}) {
  const keys = batch.map((b) => b.key);
  let landed = 0;
  let failed = 0;
  // โยนกลางทาง = ไม่รู้ผล (ไบต์ขึ้น + แถวอาจลงแล้วแต่คำตอบหาย) ⇒ ต้องโหลดรายการใหม่ด้วย ไม่งั้นรูปที่ลงแล้วไม่โผล่ ช่างถ่ายซ้ำ
  let uncertain = 0;
  setUploads?.((prev) => photoUploadsAdd(prev, batch));
  setBusy?.(true);
  try {
    for (const { key, file } of batch) {
      const onProgress = setUploads
        ? (fraction) => setUploads((prev) => photoUploadsProgress(prev, key, fraction))
        : null;
      /* 🐞 review 26/09 — ตัวอัปโยน (ไบต์ขึ้น Drive แล้วแต่ POST แถวสะดุด = ApiNetworkError เพราะ POST ไม่ลองใหม่) เดิมหลุดออก
         จากลูปทั้งชุด ⇒ รูปถัดไปไม่ถูกส่งเงียบ ๆ และข้ามการโหลดรายการ ⇒ รูปที่ขึ้นแล้วหายจากแผง ช่างถ่ายซ้ำ
         ⇒ พังเป็นรายรูป: รูปนั้นนับว่าไม่สำเร็จ แจ้งเหตุ แล้วไปรูปถัดไป */
      let ok = false;
      try {
        ok = await upload(file, onProgress);
      } catch (err) {
        uncertain += 1;
        onError?.(err);
      }
      if (ok) {
        landed += 1;
        // ไบต์ขึ้นครบ + แถวบันทึกแล้ว — ค้างแผ่นไว้ที่ 100% จนรายการใหม่มา (ดู 🔑 ข้างบน)
        setUploads?.((prev) => photoUploadsProgress(prev, key, 1));
      } else {
        failed += 1;
        // ส่งไม่สำเร็จ = ถอดแผ่นทันที (ตัวอัปแจ้งเหตุแล้ว) · แผ่นค้างจะอ่านเหมือนยังส่งอยู่
        setUploads?.((prev) => photoUploadsRemove(prev, [key]));
      }
    }
  } finally {
    // โหลดรายการใหม่ก่อนถอดแผ่น (🔑 ข้างบน) — อยู่ใน finally: อะไรหลุดมาก็ยังโหลด รูปที่ขึ้นแล้วไม่หายจากแผง
    if (landed > 0 || uncertain > 0) {
      try {
        await reload?.();
      } catch (err) {
        onError?.(err);
      }
    }
    setUploads?.((prev) => photoUploadsRemove(prev, keys));
    setBusy?.(false);
  }
  return { landed, failed };
}
