// ── แนบ "เอกสารมีชีวิต" (Google Doc/Sheet) เข้า entity ใดก็ได้ ──────────
// ที่เดียวที่รู้ว่าการสร้าง/ผูกเอกสาร Google ต้องทำอะไรบ้าง — เรียกจาก
// `POST /api/attachments` ทางเดียวทั้งระบบ
//
// ⚠️ ห้ามก๊อปตรรกะนี้ไปไว้ใน route — สองชุดจะเพี้ยนหากันเสมอ และของที่เพี้ยน
// เงียบที่สุดคือ "ไฟล์ไปอยู่โฟลเดอร์ผิด" ซึ่งไม่มี error ให้เห็นเลย
// (เคยมี `/api/mgmt/docs` เป็นชุดที่สอง — ยุบทิ้งแล้ว)
//
// ⚠️ server-only + ต้องรันบน Node runtime — โหลด `lib/drive` แบบ dynamic เพื่อไม่ให้
// googleapis ถูก bundle เข้า route ที่ไม่ได้แตะ Drive
import { driveEnvStatus } from '@/lib/drive';
import { isPhoneLogin } from '@/lib/auth/loginIdentity';

// error ที่ผู้เรียกเอา .status ไปตอบได้ตรง ๆ — แยก "ผู้ใช้ส่งมาผิด" (400) ออกจาก
// "คุยกับ Drive ไม่สำเร็จ" (500) ไม่งั้นทุกอย่างกลายเป็น 500 แล้วตามต่อไม่ได้
export class GoogleDocError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// ตั้งค่าครบไหม — เช็คก่อนเสมอ เพื่อให้ "ยังไม่ได้ตั้งค่า" ต่างจาก "ตั้งแล้วแต่ Drive ปฏิเสธ"
export function googleDocsEnvError() {
  const env = driveEnvStatus();
  if (env.ok) return null;
  return `ยังตั้งค่า Google Drive ไม่ครบ (ขาด ${env.missing.join(', ')}) — ดูได้ที่ ตั้งค่า → ที่เก็บไฟล์`;
}

const DEFAULT_NAME = { gsheet: 'ตารางใหม่', gdoc: 'เอกสารใหม่' };

// ช่องที่ขอจาก Drive ตอนผูกลิงก์ — `trashed` ไว้กันผูกของในถังขยะ
const LINK_META_FIELDS = 'id, name, mimeType, webViewLink, trashed';

// คำตอบเดียวของ mode 'link' สำหรับคนที่พิสูจน์สิทธิ์บนไฟล์ไม่ได้ — ครอบทั้ง "ไม่มีไฟล์นี้"
// และ "มีแต่คุณเปิดไม่ได้" โดยตั้งใจ (ลิงก์พิมพ์ผิดก็ตกที่นี่ จึงบอกให้ตรวจลิงก์ด้วย)
// ⚠️ ห้ามแตกเป็นหลายข้อความตามสาเหตุ — ข้อความที่ต่างกันคือช่องถามว่าไฟล์ไหนมีอยู่จริง
const LINK_NO_ACCESS = 'ผูกได้เฉพาะเอกสารที่มีอยู่และคุณเปิดได้อยู่แล้ว — ตรวจลิงก์ หรือขอสิทธิ์จากเจ้าของเอกสารก่อน';

// Drive ตอบว่า "ไม่มีไฟล์นี้" (404) หรือ "ไม่ให้ดู" (403) ไหม — googleapis วางรหัสไว้ได้สามที่
// ⚠️ 403 ที่เป็นเรื่องโควตา (`userRateLimitExceeded` · `dailyLimitExceeded` · `quotaExceeded` ฯลฯ)
//    **ไม่ใช่** คำตอบเรื่องสิทธิ์ — ต้องตกทาง "ตรวจไม่ได้ ลองใหม่" ไม่งั้นคนที่มีสิทธิ์จริงโดนบอก
//    ว่าไม่มีสิทธิ์เพียงเพราะ Drive ยุ่ง
const DRIVE_QUOTA_REASON = /limit|quota/i;
function driveSaysNoAccess(err) {
  const status = Number(err?.code ?? err?.status ?? err?.response?.status);
  if (status === 404) return true;
  if (status !== 403) return false;
  const reasons = Array.isArray(err?.errors) ? err.errors.map((e) => String(e?.reason || '')) : [];
  return !reasons.some((reason) => DRIVE_QUOTA_REASON.test(reason));
}

// รับคำสั่งจาก client แล้วคืน "ส่วนของแถว attachments ที่เกี่ยวกับไฟล์" พร้อม insert
//
// mode 'create' — สร้างไฟล์เปล่าในโฟลเดอร์ของ entity นั้นบน Shared Drive
// mode 'link'   — ผูกไฟล์ที่มีอยู่แล้ว (อ่าน metadata มาเก็บ ไม่ย้ายไฟล์)
//
// ⚠️ **client ไม่เคยส่ง fileUrl มาเอง** — ที่อยู่มาจาก Drive เท่านั้น นี่คือเหตุผล
// ที่ทางนี้ข้ามด่าน attachmentUrlError ได้อย่างปลอดภัย (ดู lib/master/attachmentStorage)
//
// 🔴 **กติกาของ mode 'link' (มติเจ้าของ 08/10/2569)** — ผูกได้เฉพาะ Google Doc/Sheet ที่
// **คนผูกเปิดได้อยู่แล้วบน Drive** และระบบ **ไม่ให้สิทธิ์อะไรเพิ่มแก่คนผูก**
// 🐞 เดิม: แกะ id จากลิงก์ → อ่าน metadata ด้วย service account → `grantWriter` ให้คนกด
//    ⇒ ใครก็ตามที่แนบไฟล์เข้าระเบียนของตัวเองได้ วางลิงก์ของไฟล์ไหนก็ได้ที่ service account
//    มองเห็น (เอกสารของดีลอื่น · ไฟล์แนบ · แม้แต่โฟลเดอร์) แล้วได้สิทธิ์ **แก้** ทันที
//    · service account เห็นทั้ง Shared Drive ⇒ "ระบบอ่านได้" ไม่ใช่หลักฐานว่าคนกดเปิดได้
// ⇒ ตอนนี้ เรียงตามนี้: (1) คนผูกต้องมี permission บนไฟล์อยู่แล้ว — ถาม Drive ตรง ๆ ด้วย
//    `fileAccessRole` **ก่อนอ่านอะไรของไฟล์ทั้งสิ้น** (2) ไม่อยู่ในถังขยะ (3) ชนิดต้องเป็น
//    Doc/Sheet เท่านั้น (4) ไม่มีการ grant ตอนผูก (5) จด role ที่พิสูจน์ได้ไว้ใน
//    `metadata.linkRole` เป็นเพดานของสิทธิ์ที่แถวนี้จะพาไปให้คนอื่นตอนเปิดรายการ (ดู
//    ensureGoogleDocAccess) — คนที่อ่านได้อย่างเดียวผูกแล้วต้องไม่มีใครได้สิทธิ์แก้ผ่าน
//    แถวนั้น รวมถึงตัวเขาเอง (6) จดอีเมลคนผูกไว้ใน `metadata.linkedBy` — แถวนี้ **ไม่มีวัน
//    สร้าง permission ให้คนผูกเอง** แม้สิทธิ์ของเขาบนไฟล์จะถูกถอนไปทีหลัง
// 🐞 ทำไมข้อ (1) ต้องมาก่อน: เดิมอ่าน metadata ด้วย service account ก่อนแล้วค่อยถามสิทธิ์ ⇒
//    id ไหนก็ตามได้คำตอบสี่แบบที่แยกกันออก (ไม่มีไฟล์ · อยู่ถังขยะ · ไม่ใช่ Doc/Sheet · มีอยู่
//    แต่ไม่มีสิทธิ์) = ใช้ถามได้ว่าไฟล์ที่ตัวเองเปิดไม่ได้ "มีอยู่ไหม เป็นชนิดไหน ถูกทิ้งหรือยัง"
//    ⇒ คนที่พิสูจน์สิทธิ์ไม่ได้ต้องได้ **คำตอบเดียว** (403 ข้อความเดียว) ไม่ว่า id นั้นคืออะไร
//
// `deps.drive` มีไว้ให้เทสต์ยัดตัวปลอม (Drive จริงเรียกได้เฉพาะบน Vercel) — โค้ดจริงไม่เคยส่ง
export async function buildGoogleAttachment({
  entityType, entityId, mode, type, url, name, grantEmail,
}, deps = {}) {
  const drive = deps.drive || await import('@/lib/drive');

  let file; // { id, name, mimeType, webViewLink }
  let linkRole = null; // role ที่คนผูกพิสูจน์ได้ — มีค่าเฉพาะ mode 'link'
  let linkedBy = null; // อีเมลคนผูก (ตัวพิมพ์เล็ก) — มีค่าเฉพาะ mode 'link'
  try {
    if (mode === 'link') {
      const fileId = drive.parseDriveId(url);
      if (!fileId) throw new GoogleDocError('ลิงก์ Google Drive ไม่ถูกต้อง');
      // บัญชีที่ล็อกอินด้วยเบอร์ไม่มีอีเมล Google (workspaceEmail คืน null) ⇒ ไม่มีอะไร
      // ให้เทียบกับ permission ของไฟล์ · ปฏิเสธก่อนแตะ Drive — ไม่มีหลักฐาน = ไม่ผูก
      if (!grantEmail) {
        throw new GoogleDocError('บัญชีนี้ไม่มีอีเมล Google ให้ตรวจสิทธิ์ จึงผูกลิงก์เอกสารไม่ได้ — ใช้ปุ่มสร้าง Doc หรือ Sheet แทน', 403);
      }
      // 🔴 **พิสูจน์สิทธิ์ก่อนอ่านอะไรของไฟล์** (ดูหัวฟังก์ชัน) — ถามด้วย id ที่แกะจากลิงก์ตรง ๆ
      let role;
      try {
        role = await drive.fileAccessRole(fileId, grantEmail);
      } catch (err) {
        // Drive ตอบ "ไม่มีไฟล์/ไม่ให้ดู" = ไม่มีหลักฐานว่าเปิดได้ ⇒ ลงคำตอบเดียวกับ "ไม่มีสิทธิ์"
        // ⚠️ อย่างอื่นทั้งหมด = **ตรวจไม่ได้ = ไม่ผูก** (fail closed) — ปล่อยผ่านตอน Drive งอแง
        //    คือเปิดช่องเดิมกลับมา
        console.error('[googleDocs] อ่านสิทธิ์ของคนผูกบนไฟล์ไม่สำเร็จ', entityType, entityId, fileId, err?.message);
        if (!driveSaysNoAccess(err)) {
          throw new GoogleDocError('ตรวจสิทธิ์ของคุณบนเอกสารนี้ไม่สำเร็จ จึงยังผูกไม่ได้ — ลองใหม่อีกครั้ง', 502);
        }
        role = null;
      }
      if (role !== 'writer' && role !== 'reader') throw new GoogleDocError(LINK_NO_ACCESS, 403);
      try {
        file = await drive.getFileMeta(fileId, LINK_META_FIELDS);
      } catch (err) {
        // ไฟล์หาย/ถูกปิดระหว่างสองคำขอ = คำตอบเดียวกัน · อย่างอื่นปล่อยไปเป็นข้อความกลาง 500 ข้างล่าง
        if (driveSaysNoAccess(err)) throw new GoogleDocError(LINK_NO_ACCESS, 403);
        throw err;
      }
      // ⚠️ สองด่านข้างล่างบอกรายละเอียดของไฟล์ — ถึงตรงนี้ได้เฉพาะคนที่พิสูจน์แล้วว่าเปิดได้
      if (file?.trashed) {
        throw new GoogleDocError('เอกสารนี้อยู่ในถังขยะของ Drive จึงผูกไม่ได้ — กู้คืนเอกสารก่อนแล้วผูกใหม่');
      }
      // ⚠️ เทียบชนิดแบบ **รายชื่อที่อนุญาต** — โฟลเดอร์ · ไฟล์ไบนารี (PDF/รูป) · Slides/Forms
      // และชนิด native อื่นตกหมด · โฟลเดอร์คือเคสที่แรงสุด: สิทธิ์บนโฟลเดอร์ไหลลงทุกไฟล์ข้างใน
      if (!drive.kindFromMime(file?.mimeType)) {
        throw new GoogleDocError('ผูกได้เฉพาะ Google Doc หรือ Google Sheet — ไฟล์ชนิดอื่นให้อัปโหลดเป็นไฟล์แนบแทน');
      }
      linkRole = role;
      linkedBy = String(grantEmail).trim().toLowerCase();
    } else if (mode === 'create') {
      if (!drive.GOOGLE_NATIVE_MIME[type]) {
        throw new GoogleDocError('ชนิดเอกสารไม่รองรับ (gdoc/gsheet)');
      }
      // 🐞 หาที่เก็บล้มได้สองแบบที่คนละเรื่องกันสิ้นเชิง — ต้องแยกให้ขาด:
      //   • **ข้อมูลยังไม่ครบ** เช่นดีลที่ยังไม่ผูกลูกค้า (โฟลเดอร์ของดีลอยู่ใต้ลูกค้า)
      //     คนแก้เองได้ใน 10 วินาที ⇒ ต้องบอกตรง ๆ ว่าขาดอะไร
      //   • **Drive ปฏิเสธ/ล่ม** token หมดอายุ สิทธิ์ไม่พอ ⇒ ข้อความดิบของ Google
      //     ไม่ช่วยใครและไม่ใช่ความผิดคนกด ⇒ ข้อความกลาง + log ไว้ให้คนดูแลระบบ
      //
      // ⚠️ แยกด้วย**ขั้นตอน ไม่ใช่การเดาจากหน้าตาของ error**: `folderPathForEntity`
      // อ่านแต่ฐานข้อมูล (ไม่แตะ Drive เลย) — อะไรที่ล้มตรงนั้นคือข้อมูลล้วน ๆ
      let path;
      try {
        path = await drive.folderPathForEntity(entityType, entityId);
      } catch (err) {
        throw new GoogleDocError(`สร้างเอกสารไม่ได้ — ${err?.message || 'หาที่เก็บบน Drive ไม่เจอ'}`);
      }
      const folderId = await drive.ensureFolderPath(path);
      file = await drive.createGoogleFile(folderId, (name || '').trim() || DEFAULT_NAME[type], type);
    } else {
      throw new GoogleDocError('mode ไม่ถูกต้อง (link/create)');
    }
  } catch (err) {
    if (err instanceof GoogleDocError) throw err;
    console.error('[googleDocs] Drive ปฏิเสธ', entityType, entityId, mode, err?.message);
    throw new GoogleDocError('ดำเนินการกับ Google Drive ไม่สำเร็จ', 500);
  }

  // mode 'create' เท่านั้น: ให้สิทธิ์ writer แก่อีเมล Workspace ของคนกด — เผื่อคนนั้นไม่ได้เป็น
  // สมาชิก Shared Drive · ล้มก็ไม่ทำให้การแนบล้ม (ไฟล์ยังอยู่ในที่ที่ถูกแล้ว)
  // ⚠️ mode 'link' **ไม่ grant อะไรเลย** — คนผูกพิสูจน์แล้วว่าเปิดได้อยู่ก่อน (ดูหัวฟังก์ชัน)
  //
  // 🐞 เดิมใช้ `grantWriter` ซึ่งกลืน error และไม่จดอะไร ⇒ สองช่อง:
  //   · ให้สำเร็จแต่ไม่จด — ลบแถวก่อนมีใครเปิดรายการ = สิทธิ์ค้างบน Drive ที่ตัวถอนหาไม่เจอ
  //   · ถ้าจดโดยไม่ดูผล — ให้ล้มแต่จดว่า "ให้แล้ว" ⇒ `needsGrant` ไม่ลองซ้ำอีกเลย คนสร้างเปิด
  //     เอกสารที่ตัวเองเพิ่งสร้างไม่ได้
  // ⇒ ใช้ `grantFileRole` (โยน error) แล้ว **จดเฉพาะเมื่อสำเร็จ** · ล้ม = ไม่จด ⇒ รอบเปิด
  //    รายการถัดไป ensureGoogleDocAccess ให้ซ้ำเอง
  let granted = null;
  if (mode === 'create' && grantEmail) {
    try {
      await drive.grantFileRole(file.id, grantEmail, 'writer');
      granted = { accessGranted: [grantEmail], accessRoles: { [grantEmail]: 'writer' } };
    } catch (err) {
      console.error('[googleDocs] ให้สิทธิ์คนสร้างเอกสารไม่สำเร็จ (จะลองใหม่ตอนเปิดรายการ)', file.id, grantEmail, err?.message);
    }
  }

  return {
    fileUrl: file.webViewLink,
    // เอกสาร native เปิดผ่าน webViewLink ตรง ไม่ผ่าน proxy stream — ตัว proxy
    // สตรีมไฟล์ไบนารี ส่วนนี่คือหน้าเว็บของ Google ที่ต้องใช้ session ของผู้ใช้เอง
    driveFileId: null,
    fileName: file.name || null,
    mimeType: file.mimeType || null,
    metadata: {
      ...driveMetadata(drive.kindFromMime(file.mimeType) || 'link', file.id),
      ...(granted || {}),
      ...(linkRole ? { linkRole, linkedBy } : {}),
    },
  };
}

// ── metadata ที่ "เป็นของ Drive" — client แตะไม่ได้ ────────────────────────
//
// 🐞 **ช่องที่ปิดด้วยก้อนนี้ (ผลตรวจรอบ 13 · ค-1)** — `POST /api/attachments` รับ
// `metadata` จาก client แล้วให้ของจาก Drive วางทับ · **แต่วางทับเกิดเฉพาะตอนสร้าง
// ผ่านสาขา Google** ⇒ สาขาไฟล์ธรรมดาไม่มีอะไรมาทับ ค่าจาก client อยู่ครบ
//
// `isGoogleDoc()` ตัดสินจาก `metadata.kind` และตัวให้สิทธิ์อ่าน `metadata.googleFileId`
// ⇒ ตั้งสองค่านี้เองได้ = สั่งให้ **service account** แชร์ไฟล์ Drive id ไหนก็ได้ให้ตัวเอง
// ระดับ writer เพียงแค่แนบไฟล์เข้าระเบียนที่ตัวเองแก้ได้แล้วเปิดหน้านั้น
//
// ⚠️ **allowlist ไม่ใช่ blocklist** — ที่นี่เป็นแหล่งเดียวที่ผลิตสองคีย์นี้ ⇒ เพิ่มคีย์
// ใหม่ที่นี่แล้ว `stripDriveMetadata` ตัดตามเองโดยไม่ต้องไปจำอีกที่
//
// 🔴 **สมุดสิทธิ์ก็เป็นของเซิร์ฟเวอร์** (08/10/2569) — `accessGranted`/`accessRoles`
// (ใครได้สิทธิ์อะไรไปแล้ว · lib/master/googleDocAccess) · `linkRole` (เพดานสิทธิ์ของแถวที่ผูกมา)
// และ `linkedBy` (ใครเป็นคนผูก — คนเดียวที่แถวนั้นไม่มีวันสร้าง permission ให้)
// 🐞 เดิมสามคีย์แรกไม่ถูกตัด ⇒ คนที่แก้แท็คของแถวได้ส่ง `accessGranted: []` ให้ระบบ
//    "ลืม" ว่าเคยให้ใคร (ตัวถอนหาไม่เจออีก) หรือส่ง `linkRole: 'writer'` ยกเพดานของแถว
//    ที่ผูกมาด้วยสิทธิ์อ่านอย่างเดียว · `linkedBy` ถ้าแก้ได้ = คนผูกเปลี่ยนชื่อตัวเองออก
//    แล้วให้แถวของตัวเองคืนสิทธิ์ที่ถูกถอนไปแล้วให้
// ⚠️ ตัวเขียนของเซิร์ฟเวอร์เอง (buildGoogleAttachment · ensureGoogleDocAccess ·
//    revokeGoogleDocAccess) เขียนตรงลงแถว ไม่ผ่าน `stripDriveMetadata` จึงไม่โดนตัด ·
//    PATCH merge ทับของเดิมบนแถว (`{ ...att.metadata, ...requested }`) ⇒ ตัดจากฝั่ง
//    client แล้วค่าเดิมยังอยู่ครบ
export const DRIVE_OWNED_METADATA_KEYS = Object.freeze([
  'kind', 'googleFileId', 'accessGranted', 'accessRoles', 'linkRole', 'linkedBy',
]);

const driveMetadata = (kind, googleFileId) => ({ kind, googleFileId });

/**
 * ล้างคีย์ที่เป็นของ Drive ออกจาก metadata ที่ client ส่งมา
 *
 * ⚠️ ต้องเรียก **ทุกเส้นที่รับ metadata จากผู้ใช้** ไม่ใช่เฉพาะเส้นที่นึกออก —
 * ค่าที่หลุดเข้าไปไม่ได้ทำอะไรตอนเขียน มันไปออกฤทธิ์ตอน **อ่าน** ครั้งถัดไป
 */
export function stripDriveMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const safe = { ...metadata };
  for (const key of DRIVE_OWNED_METADATA_KEYS) delete safe[key];
  return safe;
}

// อ่านบัญชีไม่ได้ "ชั่วคราว" ไหม — 4xx (ยกเว้น 408/429) คือ auth ตอบชัดว่าไม่มีบัญชีนี้
// = "ไม่มีอีเมล" จริง · อย่างอื่นทั้งหมด (5xx · หมดเวลา · ต่อไม่ติด = status 0/ไม่มี) = ยังไม่รู้
// รหัสผู้ใช้ที่ไม่ใช่ UUID (devBypass `local-dev`) auth-js โยน Error เปล่าก่อนยิงจริง ไม่มี status
// ⇒ ต้องดูข้อความ ไม่งั้นถูกนับเป็น "ชั่วคราว" แล้วได้ 502 ตลอดไป
function authLookupTransient(err) {
  if (/Expected parameter to be UUID/i.test(String(err?.message || ''))) return false;
  const status = Number(err?.status);
  if (!(status >= 400 && status < 500)) return true;
  return status === 408 || status === 429;
}

// อีเมล Workspace ของผู้ใช้ (ใช้ตอนให้สิทธิ์/ตรวจสิทธิ์บน Drive) — แยกออกมาเพราะทั้งสอง route
// ต้องขุดจาก auth admin เหมือนกัน และล้มแล้วต้องไม่ทำให้การแนบล้ม
//
// `strict` (ใช้กับโหมดผูกลิงก์เท่านั้น): ที่นั่น null = ปฏิเสธถาวร "บัญชีนี้ไม่มีอีเมล Google"
// ⇒ การอ่านบัญชีที่สะดุดชั่วคราวต้องไม่ถูกเล่าเป็นเหตุถาวร — โยน 502 ให้ลองใหม่แทน
// (supabase-js ไม่ throw — คืน `{ data, error }` · ไม่อ่าน error = แยกสองกรณีนี้ไม่ออก)
export async function workspaceEmail(supabase, userId, { strict = false } = {}) {
  if (!userId) return null;
  try {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error) throw error;
    const email = data?.user?.email || null;
    /* 🔴 **ที่อยู่ล็อกอินด้วยเบอร์ไม่ใช่อีเมลจริง** (lib/auth/loginIdentity.js) — โดเมน
       ภายในไม่มีกล่องจดหมายและไม่ใช่บัญชี Google ⇒ เอาไปสั่งแชร์ Drive = สร้าง
       permission ให้ที่อยู่ที่ไม่มีใครเปิดได้ (หรือโดน API ตีกลับ) แล้วระบบจะบอกว่า
       "แชร์ให้แล้ว" ทั้งที่คนนั้นเปิดเอกสารไม่ได้ · คืน null = "คนนี้ไม่มีอีเมล" ซึ่งจริง */
    return email && !isPhoneLogin(email) ? email : null;
  } catch (err) {
    if (strict && authLookupTransient(err)) {
      console.error('[googleDocs] อ่านอีเมลของบัญชีไม่สำเร็จ', userId, err?.message);
      throw new GoogleDocError('ตรวจอีเมลของบัญชีคุณไม่สำเร็จ จึงยังผูกไม่ได้ — ลองใหม่อีกครั้ง', 502);
    }
    return null;
  }
}
