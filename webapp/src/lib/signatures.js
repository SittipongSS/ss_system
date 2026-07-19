export const SIGNATURE_BUCKET = 'signature-assets';
export const SIGNATURE_MIME = 'image/png';
export const SIGNATURE_MAX_BYTES = 1024 * 1024;
export const SIGNATURE_MIN_WIDTH = 120;
export const SIGNATURE_MAX_WIDTH = 2400;
export const SIGNATURE_MIN_HEIGHT = 40;
export const SIGNATURE_MAX_HEIGHT = 1200;

const PNG_MAGIC = [137, 80, 78, 71, 13, 10, 26, 10];

function uint32(bytes, offset) {
  return (((bytes[offset] << 24) >>> 0)
    + (bytes[offset + 1] << 16)
    + (bytes[offset + 2] << 8)
    + bytes[offset + 3]) >>> 0;
}

function chunkType(bytes, offset) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function validBitDepth(colorType, bitDepth) {
  const allowed = {
    0: [1, 2, 4, 8, 16],
    2: [8, 16],
    3: [1, 2, 4, 8],
    4: [8, 16],
    6: [8, 16],
  };
  return allowed[colorType]?.includes(bitDepth) || false;
}

function invalid(error) {
  return { error, value: null };
}

export function inspectSignaturePng(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || []);
  if (!bytes.length) return invalid('กรุณาเลือกไฟล์ PNG');
  if (bytes.length > SIGNATURE_MAX_BYTES) return invalid('ไฟล์ใหญ่เกิน 1 MB');
  if (bytes.length < PNG_MAGIC.length || PNG_MAGIC.some((value, index) => bytes[index] !== value)) {
    return invalid('ไฟล์ต้องเป็น PNG จริง ไม่ใช่เพียงเปลี่ยนนามสกุล');
  }
  if (bytes.length < 45) return invalid('โครงสร้างไฟล์ PNG ไม่สมบูรณ์');

  let offset = 8;
  let width = 0;
  let height = 0;
  let sawHeader = false;
  let sawImageData = false;
  let sawEnd = false;

  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) return invalid('โครงสร้างไฟล์ PNG ไม่สมบูรณ์');
    const length = uint32(bytes, offset);
    const type = chunkType(bytes, offset + 4);
    const dataStart = offset + 8;
    const next = dataStart + length + 4;
    if (next > bytes.length || next < dataStart) return invalid('โครงสร้างไฟล์ PNG ไม่สมบูรณ์');

    if (!sawHeader) {
      if (type !== 'IHDR' || length !== 13) return invalid('ไฟล์ PNG ไม่มี IHDR ที่ถูกต้อง');
      width = uint32(bytes, dataStart);
      height = uint32(bytes, dataStart + 4);
      const bitDepth = bytes[dataStart + 8];
      const colorType = bytes[dataStart + 9];
      const compression = bytes[dataStart + 10];
      const filter = bytes[dataStart + 11];
      const interlace = bytes[dataStart + 12];
      if (!validBitDepth(colorType, bitDepth) || compression !== 0 || filter !== 0 || ![0, 1].includes(interlace)) {
        return invalid('รูปแบบ PNG นี้ไม่รองรับ');
      }
      sawHeader = true;
    } else if (type === 'IHDR') {
      return invalid('ไฟล์ PNG มี IHDR ซ้ำ');
    }

    if (type === 'IDAT') sawImageData = true;
    if (type === 'IEND') {
      if (length !== 0 || !sawImageData || next !== bytes.length) {
        return invalid('ไฟล์ PNG ปิดท้ายไม่ถูกต้อง');
      }
      sawEnd = true;
      break;
    }
    offset = next;
  }

  if (!sawHeader || !sawImageData || !sawEnd) return invalid('โครงสร้างไฟล์ PNG ไม่สมบูรณ์');
  if (width < SIGNATURE_MIN_WIDTH || width > SIGNATURE_MAX_WIDTH) {
    return invalid(`ความกว้างต้องอยู่ระหว่าง ${SIGNATURE_MIN_WIDTH}–${SIGNATURE_MAX_WIDTH} px`);
  }
  if (height < SIGNATURE_MIN_HEIGHT || height > SIGNATURE_MAX_HEIGHT) {
    return invalid(`ความสูงต้องอยู่ระหว่าง ${SIGNATURE_MIN_HEIGHT}–${SIGNATURE_MAX_HEIGHT} px`);
  }

  return {
    error: null,
    value: { mimeType: SIGNATURE_MIME, sizeBytes: bytes.length, width, height },
  };
}

export function normalizeSignatureRevokeReason(value) {
  const reason = String(value || '').trim();
  if (!reason) return { error: 'กรุณาระบุเหตุผลที่ยกเลิกลายเซ็น', value: null };
  if (reason.length > 500) return { error: 'เหตุผลต้องไม่เกิน 500 ตัวอักษร', value: null };
  return { error: null, value: reason };
}

export function signatureOwnerKey(userId) {
  return String(userId || '').replace(/[^a-zA-Z0-9_-]+/g, '_');
}

export function signatureStoragePrefix(userId) {
  return `users/${signatureOwnerKey(userId)}/`;
}

export function isSignatureStoragePathForUser(userId, storagePath) {
  return !!signatureOwnerKey(userId) && String(storagePath || '').startsWith(signatureStoragePrefix(userId));
}

export function signatureVersionState(versionId, activeVersionId, events = []) {
  if (versionId === activeVersionId) return 'active';
  const revoked = events.some((event) => event.action === 'revoke' && event.versionId === versionId);
  return revoked ? 'revoked' : 'superseded';
}
