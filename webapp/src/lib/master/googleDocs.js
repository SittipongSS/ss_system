// ── แนบ "เอกสารมีชีวิต" (Google Doc/Sheet) เข้า entity ใดก็ได้ ──────────
// ที่เดียวที่รู้ว่าการสร้าง/ผูกเอกสาร Google ต้องทำอะไรบ้าง — `/api/attachments`
// (ทุกโมดูล) และ `/api/mgmt/docs` (งานบริหาร) เรียกตัวนี้ตัวเดียวกัน
//
// ⚠️ ห้ามก๊อปตรรกะนี้ไปไว้ใน route — สองชุดจะเพี้ยนหากันเสมอ และของที่เพี้ยน
// เงียบที่สุดคือ "ไฟล์ไปอยู่โฟลเดอร์ผิด" ซึ่งไม่มี error ให้เห็นเลย
//
// ⚠️ server-only + ต้องรันบน Node runtime — โหลด `lib/drive` แบบ dynamic เพื่อไม่ให้
// googleapis ถูก bundle เข้า route ที่ไม่ได้แตะ Drive
import { driveEnvStatus } from '@/lib/drive';

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

// รับคำสั่งจาก client แล้วคืน "ส่วนของแถว attachments ที่เกี่ยวกับไฟล์" พร้อม insert
//
// mode 'create' — สร้างไฟล์เปล่าในโฟลเดอร์ของ entity นั้นบน Shared Drive
// mode 'link'   — ผูกไฟล์ที่มีอยู่แล้ว (อ่าน metadata มาเก็บ ไม่ย้ายไฟล์)
//
// ⚠️ **client ไม่เคยส่ง fileUrl มาเอง** — ที่อยู่มาจาก Drive เท่านั้น นี่คือเหตุผล
// ที่ทางนี้ข้ามด่าน attachmentUrlError ได้อย่างปลอดภัย (ดู lib/master/attachmentStorage)
export async function buildGoogleAttachment({
  entityType, entityId, mode, type, url, name, grantEmail,
}) {
  const drive = await import('@/lib/drive');

  let file; // { id, name, mimeType, webViewLink }
  try {
    if (mode === 'link') {
      const fileId = drive.parseDriveId(url);
      if (!fileId) throw new GoogleDocError('ลิงก์ Google Drive ไม่ถูกต้อง');
      file = await drive.getFileMeta(fileId);
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

  // best-effort: ให้สิทธิ์ writer แก่อีเมล Workspace ของคนกด — เผื่อคนนั้นไม่ได้เป็น
  // สมาชิก Shared Drive · ล้มก็ไม่ทำให้การแนบล้ม (ไฟล์ยังอยู่ในที่ที่ถูกแล้ว)
  if (grantEmail) await drive.grantWriter(file.id, grantEmail);

  return {
    fileUrl: file.webViewLink,
    // เอกสาร native เปิดผ่าน webViewLink ตรง ไม่ผ่าน proxy stream — ตัว proxy
    // สตรีมไฟล์ไบนารี ส่วนนี่คือหน้าเว็บของ Google ที่ต้องใช้ session ของผู้ใช้เอง
    driveFileId: null,
    fileName: file.name || null,
    mimeType: file.mimeType || null,
    metadata: { kind: drive.kindFromMime(file.mimeType) || 'link', googleFileId: file.id },
  };
}

// อีเมล Workspace ของผู้ใช้ (ใช้ตอน grantWriter) — แยกออกมาเพราะทั้งสอง route
// ต้องขุดจาก auth admin เหมือนกัน และล้มแล้วต้องไม่ทำให้การแนบล้ม
export async function workspaceEmail(supabase, userId) {
  if (!userId) return null;
  try {
    const { data } = await supabase.auth.admin.getUserById(userId);
    return data?.user?.email || null;
  } catch {
    return null;
  }
}
