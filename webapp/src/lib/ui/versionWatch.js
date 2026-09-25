// ── แท็บที่เปิดค้างรู้ตัวเมื่อระบบอัปเดต (เจ้าของสั่ง "บังคับรีเฟรชทุกแอคเค้า" 25/09/2026) ──────────
//
// ⭐ สิทธิ์/บทบาทอ่านสดทุกครั้งที่ **เปิดหน้าใหม่** อยู่แล้ว (AppLayout + proxy เรียก getUser()) — ที่ค้างคือ
//   แท็บที่เปิดทิ้งไว้ข้าม deploy: ยังรันโค้ดชุดเก่า ไม่เห็นหน้าที่เพิ่งขึ้น ไม่เห็นบทบาทที่เพิ่งย้าย จนกว่าจะกด F5 เอง
// ⭐ วิธี: เลขคอมมิตของ build ฝังในโค้ดฝั่งเบราว์เซอร์ตอน build (next.config.mjs → `NEXT_PUBLIC_BUILD_SHA`)
//   แล้วแท็บถาม `/api/version` (ไม่มีด่าน session · ไม่แตะฐาน) เป็นระยะ · ไม่ตรงกัน = มีเวอร์ชันใหม่
// ⚠️ **ไม่รีโหลดกลางหน้าที่คนกำลังใช้** — ฟอร์มที่พิมพ์ค้างจะหาย · รีโหลดเมื่อ "เปลี่ยนหน้า" เท่านั้น
//   (ถึงตอนนั้นตัวกันงานหาย `useUnsavedChanges` ของหน้าเดิมได้ถามคนใช้ไปแล้ว) + แถบให้กดรีเฟรชเอง
// ⚠️ **ไม่ดักคลิกลิงก์เอง** — `useUnsavedChanges` ดักคลิกระดับ capture อยู่แล้ว ตัวดักตัวที่สองที่ลงทะเบียน
//   ก่อนมันจะพาออกจากหน้าไปโดยไม่ถาม "ทิ้งการแก้ไข?" เลย ⇒ รอให้การเปลี่ยนหน้าเกิดจริงก่อนค่อยรีโหลด

/** ถามเซิร์ฟเวอร์ทุก 5 นาที (เฉพาะตอนแท็บเปิดอยู่) */
export const VERSION_POLL_MS = 5 * 60 * 1000;
/** กลับมาดูแท็บ/โฟกัสหน้าต่างถี่ ๆ ไม่ยิงซ้ำภายใน 1 นาที */
export const VERSION_MIN_GAP_MS = 60 * 1000;
export const RELOAD_MARK_KEY = 'ss:versionReloadFor';

const clean = (sha) => String(sha ?? '').trim();

/** เวอร์ชันบนเซิร์ฟเวอร์ต่างจากโค้ดที่แท็บนี้รันไหม — รู้ไม่ครบสองฝั่ง (เครื่อง dev · ถามไม่สำเร็จ) = ไม่ */
export function isNewVersion(buildSha, serverSha) {
  const built = clean(buildSha);
  const served = clean(serverSha);
  return Boolean(built && served && built !== served);
}

/**
 * รีโหลดเองได้ไหม — กันวน: แท็บนี้รีโหลดเพื่อ sha นี้ไปแล้ว แต่ยังได้โค้ดชุดเก่ากลับมา (แคชขอบ/deploy
 * ยังไม่เสร็จ) ⇒ ไม่รีโหลดซ้ำ เหลือแถบให้กดเอง
 * ⚠️ fail-closed: ไม่มี storage / storage โยน error (โหมดส่วนตัว) = ไม่รีโหลดเอง — รีโหลดวนแย่กว่าไม่รีโหลด
 */
export function canAutoReload(serverSha, storage) {
  if (!storage) return false;
  try {
    return storage.getItem(RELOAD_MARK_KEY) !== clean(serverSha);
  } catch {
    return false;
  }
}

/** จดไว้ก่อนรีโหลด · คืน false = จดไม่ได้ ⇒ ผู้เรียกต้องไม่รีโหลด (ไม่งั้นกันวนไม่ได้) */
export function markAutoReload(serverSha, storage) {
  if (!storage) return false;
  try {
    storage.setItem(RELOAD_MARK_KEY, clean(serverSha));
    return storage.getItem(RELOAD_MARK_KEY) === clean(serverSha);
  } catch {
    return false;
  }
}
