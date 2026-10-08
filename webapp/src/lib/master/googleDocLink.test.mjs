// ── ผูกลิงก์เอกสาร Google + สมุดสิทธิ์ (มติเจ้าของ 08/10/2569) ──────────────────
//
// กติกา: ปุ่ม "ผูกลิงก์" ผูกได้เฉพาะ Google Doc/Sheet ที่ **คนผูกเปิดได้อยู่แล้วบน Drive** ·
// ระบบไม่ให้สิทธิ์อะไรเพิ่มแก่คนผูก · คนที่เห็นระเบียนยังได้สิทธิ์เปิดเอกสารที่ผูกไว้ตามเดิม
//
// 🐞 ช่องเดิม: วางลิงก์ของไฟล์ไหนก็ได้ที่ service account มองเห็น (เอกสารของดีลอื่น · ไฟล์แนบ ·
// โฟลเดอร์) เข้างานของตัวเอง แล้วได้ writer ทันทีจาก `grantWriter` — และได้ซ้ำอีกรอบตอนเปิดรายการ
//
// ⚠️ Drive จริงเรียกไม่ได้นอก Vercel (WIF) ⇒ ทุกข้อยัดตัวปลอมผ่าน `deps.drive`
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileAccessRole, kindFromMime, GOOGLE_NATIVE_MIME } from '../drive.js';
import { parseDriveId } from '../driveId.js';
import {
  buildGoogleAttachment, GoogleDocError, stripDriveMetadata, DRIVE_OWNED_METADATA_KEYS,
} from './googleDocs.js';
import { ensureGoogleDocAccess, revokeAttachmentGrants, roleForViewer } from './googleDocAccess.js';

const ME = 'me@scentandsense.co.th';
const DOC = GOOGLE_NATIVE_MIME.gdoc;
const SHEET = GOOGLE_NATIVE_MIME.gsheet;

// ── 1) fileAccessRole — หลักฐานว่า "คนนี้เปิดไฟล์นี้ได้อยู่แล้ว" ────────────────
// googleapis ปลอม: คืน permission ทีละหน้าตามที่กำหนด และจดทุกคำขอไว้ตรวจ
function fakeGapi(pages) {
  const calls = [];
  return {
    calls,
    permissions: {
      list: async (params) => {
        calls.push(params);
        if (pages instanceof Error) throw pages;
        const index = params.pageToken ? Number(params.pageToken) : 0;
        const next = index + 1 < pages.length ? String(index + 1) : undefined;
        return { data: { permissions: pages[index], ...(next ? { nextPageToken: next } : {}) } };
      },
    },
  };
}
const access = (pages, email = ME) => fileAccessRole('FILE-1', email, { drive: fakeGapi(pages) });

test('fileAccessRole: สิทธิ์รายคนที่อยู่ตรงกัน — ไม่สนตัวพิมพ์เล็กใหญ่', async () => {
  assert.equal(await access([[{ type: 'user', emailAddress: ME, role: 'writer' }]]), 'writer');
  assert.equal(await access([[{ type: 'user', emailAddress: 'Me@ScentAndSense.co.th', role: 'reader' }]]), 'reader');
  assert.equal(await access([[{ type: 'user', emailAddress: ME, role: 'reader' }]], 'ME@SCENTANDSENSE.CO.TH'), 'reader');
  assert.equal(await access([[{ type: 'user', emailAddress: 'other@scentandsense.co.th', role: 'writer' }]]), null);
});

test('fileAccessRole: "ใครมีลิงก์ก็เปิดได้" และ "ทั้งโดเมน" นับ — แต่ต้องเป็นโดเมนเดียวกับอีเมล', async () => {
  assert.equal(await access([[{ type: 'anyone', role: 'reader' }]]), 'reader');
  assert.equal(await access([[{ type: 'domain', domain: 'scentandsense.co.th', role: 'writer' }]]), 'writer');
  assert.equal(await access([[{ type: 'domain', domain: 'ScentAndSense.CO.TH', role: 'commenter' }]]), 'reader');
  assert.equal(await access([[{ type: 'domain', domain: 'evil.example', role: 'writer' }]]), null);
  // โดเมนที่แค่ลงท้ายเหมือนกันไม่ใช่โดเมนเดียวกัน
  assert.equal(await access([[{ type: 'domain', domain: 'sense.co.th', role: 'writer' }]]), null);
});

test('🔴 fileAccessRole: สิทธิ์ผ่านกลุ่มไม่นับ — ระบบไม่รู้ว่าใครอยู่กลุ่มไหน (ปฏิเสธเกินดีกว่าปล่อยเกิน)', async () => {
  assert.equal(await access([[{ type: 'group', emailAddress: 'all@scentandsense.co.th', role: 'writer' }]]), null);
  // แม้ที่อยู่ของกลุ่มจะบังเอิญตรงกับอีเมลคนถาม ก็ยังเป็น permission ของกลุ่ม
  assert.equal(await access([[{ type: 'group', emailAddress: ME, role: 'writer' }]]), null);
  // ชนิดที่ไม่รู้จัก/ชื่อชนกับของใน prototype ก็ไม่นับ
  for (const type of ['constructor', 'toString', undefined, 'ของใหม่']) {
    assert.equal(await access([[{ type, emailAddress: ME, role: 'writer' }]]), null, String(type));
  }
});

test('fileAccessRole: permission ที่ถูกลบแล้ว (deleted) ไม่นับ', async () => {
  assert.equal(await access([[{ type: 'user', emailAddress: ME, role: 'writer', deleted: true }]]), null);
  assert.equal(await access([[
    { type: 'user', emailAddress: ME, role: 'writer', deleted: true },
    { type: 'anyone', role: 'reader' },
  ]]), 'reader');
});

test('fileAccessRole: แปลง role ของ Drive เป็นสองระดับ และเอาตัวสูงสุด', async () => {
  for (const role of ['owner', 'organizer', 'fileOrganizer', 'writer']) {
    assert.equal(await access([[{ type: 'user', emailAddress: ME, role }]]), 'writer', role);
  }
  for (const role of ['commenter', 'reader']) {
    assert.equal(await access([[{ type: 'user', emailAddress: ME, role }]]), 'reader', role);
  }
  // role ที่ไม่รู้จัก = ไม่มีหลักฐาน ไม่ใช่เดาว่าเปิดได้
  assert.equal(await access([[{ type: 'user', emailAddress: ME, role: 'ของใหม่' }]]), null);
  // หลายทางพร้อมกัน — ตัวสูงสุดชนะ ไม่ว่าเรียงมาก่อนหลัง
  assert.equal(await access([[
    { type: 'anyone', role: 'reader' },
    { type: 'user', emailAddress: ME, role: 'writer' },
  ]]), 'writer');
  // ไฟล์บน Shared Drive: role ที่สืบทอดจากสมาชิกอยู่ใน permissionDetails
  assert.equal(await access([[{
    type: 'user', emailAddress: ME, role: 'reader',
    permissionDetails: [{ permissionType: 'file', role: 'reader' }, { permissionType: 'member', role: 'fileOrganizer', inherited: true }],
  }]]), 'writer');
});

test('🔴 fileAccessRole: อ่านทุกหน้า — สิทธิ์ที่อยู่หน้าสองต้องเจอ', async () => {
  const other = (n) => ({ type: 'user', emailAddress: `u${n}@scentandsense.co.th`, role: 'writer' });
  const gapi = fakeGapi([[other(1), other(2)], [other(3)], [{ type: 'user', emailAddress: ME, role: 'reader' }]]);
  assert.equal(await fileAccessRole('FILE-1', ME, { drive: gapi }), 'reader');
  assert.equal(gapi.calls.length, 3, 'ต้องเดินตาม nextPageToken จนหมด');
  assert.deepEqual(gapi.calls.map((c) => c.pageToken), [undefined, '1', '2']);
  for (const call of gapi.calls) {
    assert.equal(call.fileId, 'FILE-1');
    assert.equal(call.supportsAllDrives, true, 'ไฟล์อยู่บน Shared Drive — ไม่ส่งแล้ว Drive ตอบ 404');
    for (const field of ['nextPageToken', 'emailAddress', 'role', 'type', 'domain', 'deleted', 'permissionDetails']) {
      assert.ok(call.fields.includes(field), `fields ต้องขอ ${field}`);
    }
  }
});

test('🔴 fileAccessRole: Drive ตอบ error = โยนต่อ (ตรวจไม่ได้ต้องไม่ถูกอ่านเป็น "ไม่มีสิทธิ์")', async () => {
  await assert.rejects(() => access(new Error('insufficientFilePermissions')), /insufficientFilePermissions/);
});

test('🔴 fileAccessRole: Drive ส่ง nextPageToken ไม่จบ = โยน (อ่านไม่ครบ) ไม่วนต่อ และไม่คืน null', async () => {
  // Drive ปลอมที่ไม่มีหน้าสุดท้าย · ⚠️ ถูกถามเกินเพดานเมื่อไรโยนเองทันที — ถ้าด่านในโค้ดจริงหาย
  // เทสต์ต้อง **แดง** ไม่ใช่วนค้าง (ลูป await ล้วนไม่คืนคิวให้ตัวจับเวลาของ node:test ได้ทำงาน)
  const endless = (permissions) => {
    const calls = [];
    return {
      calls,
      permissions: { list: async (p) => {
        calls.push(p);
        if (calls.length > 50) throw new Error('ตัวปลอม: ถูกถามเกินเพดาน 50 หน้า');
        return { data: { permissions, nextPageToken: 't' } };
      } },
    };
  };
  const empty = endless([]);
  await assert.rejects(() => fileAccessRole('FILE-1', ME, { drive: empty }), /^Error: อ่านรายชื่อผู้มีสิทธิ์ของไฟล์ไม่ครบ \(เกิน 50 หน้า\)$/);
  assert.equal(empty.calls.length, 50);
  // เจอสิทธิ์อ่านตั้งแต่หน้าแรกแล้วก็ยังต้องโยน — อ่านไม่ครบห้ามคืนผลครึ่งทาง (หน้าหลังอาจมี writer)
  const partial = endless([{ type: 'user', emailAddress: ME, role: 'reader' }]);
  await assert.rejects(() => fileAccessRole('FILE-1', ME, { drive: partial }), /เกิน 50 หน้า\)$/);
  assert.equal(partial.calls.length, 50);
});

test('fileAccessRole: ไม่มี fileId หรือไม่มีอีเมล = null โดยไม่ยิง Drive', async () => {
  const gapi = fakeGapi([[{ type: 'anyone', role: 'writer' }]]);
  assert.equal(await fileAccessRole('', ME, { drive: gapi }), null);
  assert.equal(await fileAccessRole('FILE-1', null, { drive: gapi }), null);
  assert.equal(await fileAccessRole('FILE-1', '  ', { drive: gapi }), null);
  assert.equal(gapi.calls.length, 0);
});

// ── 2) buildGoogleAttachment — mode 'link' ──────────────────────────────────────
const LINK_URL = 'https://docs.google.com/document/d/FILE_ID_1234567890/edit';

// lib/drive ปลอม: จดทุกคำสั่งที่ **เปลี่ยนสิทธิ์/สร้างของ** ไว้ใน `writes`
function fakeDrive({ meta, role = 'writer', accessError = null, grantError = null, metaError = null } = {}) {
  const writes = [];
  const reads = [];
  return {
    writes,
    reads,
    parseDriveId,
    kindFromMime,
    GOOGLE_NATIVE_MIME,
    getFileMeta: async (fileId, fields) => {
      reads.push(['getFileMeta', fileId, fields]);
      if (metaError) throw metaError;
      return { id: fileId, name: 'แผนงาน', webViewLink: `https://docs.google.com/document/d/${fileId}/edit`, mimeType: DOC, ...meta };
    },
    fileAccessRole: async (fileId, email) => {
      reads.push(['fileAccessRole', fileId, email]);
      if (accessError) throw accessError;
      return role;
    },
    grantWriter: async (...args) => { writes.push(['grantWriter', ...args]); },
    grantFileRole: async (...args) => {
      if (grantError) throw grantError;
      writes.push(['grantFileRole', ...args]);
    },
    folderPathForEntity: async () => [{ name: 'ลูกค้า' }],
    ensureFolderPath: async () => 'FOLDER-1',
    createGoogleFile: async (folderId, name, type) => {
      writes.push(['createGoogleFile', folderId, name, type]);
      return { id: 'NEW-FILE-1', name, mimeType: GOOGLE_NATIVE_MIME[type], webViewLink: 'https://docs.google.com/document/d/NEW-FILE-1/edit' };
    },
  };
}

const link = (drive, over = {}) => buildGoogleAttachment({
  entityType: 'personal_task', entityId: 'T-1', mode: 'link', url: LINK_URL, grantEmail: ME, ...over,
}, { drive });

const rejectsWith = async (promise, status, pattern) => {
  await assert.rejects(promise, (err) => {
    assert.ok(err instanceof GoogleDocError, `ต้องเป็น GoogleDocError (ได้ ${err?.message})`);
    assert.equal(err.status, status);
    assert.match(err.message, pattern);
    return true;
  });
};

test('🔴 ผูกลิงก์: ชนิดอื่นนอกจาก Doc/Sheet ถูกปฏิเสธ — โฟลเดอร์ · PDF · รูป · Slides · Forms', async () => {
  for (const mimeType of [
    'application/vnd.google-apps.folder',
    'application/pdf',
    'image/png',
    'application/vnd.google-apps.presentation',
    'application/vnd.google-apps.form',
    'application/vnd.google-apps.shortcut',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    undefined,
  ]) {
    const drive = fakeDrive({ meta: { mimeType } });
    await rejectsWith(link(drive), 400, /^ผูกได้เฉพาะ Google Doc หรือ Google Sheet — ไฟล์ชนิดอื่นให้อัปโหลดเป็นไฟล์แนบแทน$/);
    assert.deepEqual(drive.writes, [], `${mimeType}: ห้ามแตะสิทธิ์`);
  }
});

test('🔴 ผูกลิงก์: เอกสารในถังขยะถูกปฏิเสธ — บอกเหตุเฉพาะคนที่พิสูจน์แล้วว่าเปิดได้', async () => {
  for (const role of ['writer', 'reader']) {
    const drive = fakeDrive({ role, meta: { trashed: true } });
    await rejectsWith(link(drive), 400, /ถังขยะ/);
    assert.deepEqual(drive.writes, []);
  }
});

test('ผูกลิงก์: ขอ metadata ครบช่องที่ใช้ตัดสิน (รวม trashed)', async () => {
  const drive = fakeDrive();
  await link(drive);
  const [, fileId, fields] = drive.reads.find(([name]) => name === 'getFileMeta');
  assert.equal(fileId, 'FILE_ID_1234567890');
  assert.equal(fields, 'id, name, mimeType, webViewLink, trashed');
});

test('🔴 ผูกลิงก์: บัญชีที่ไม่มีอีเมล Google (ล็อกอินด้วยเบอร์) ผูกไม่ได้ — บอกให้ใช้ปุ่มสร้างแทน', async () => {
  for (const grantEmail of [null, undefined, '']) {
    const drive = fakeDrive();
    await rejectsWith(link(drive, { grantEmail }), 403, /ใช้ปุ่มสร้าง Doc หรือ Sheet แทน/);
    assert.deepEqual(drive.writes, []);
    assert.deepEqual(drive.reads, [], 'ไม่มีหลักฐานให้เทียบ — ไม่ต้องถาม Drive เลย');
  }
});

// คำตอบเดียวของคนที่พิสูจน์สิทธิ์ไม่ได้ — ทั้งข้อความ ทั้งสถานะ ต้องเหมือนกันทุกสาเหตุ
const NO_ACCESS = /^ผูกได้เฉพาะเอกสารที่มีอยู่และคุณเปิดได้อยู่แล้ว — ตรวจลิงก์ หรือขอสิทธิ์จากเจ้าของเอกสารก่อน$/;
// error หน้าตาแบบ googleapis — รหัสอยู่ได้สามที่ (`code` · `status` · `response.status`)
const driveError = (where, status, reason) => {
  const err = new Error(`Drive ${status}`);
  if (where === 'response') err.response = { status };
  else err[where] = status;
  if (reason) err.errors = [{ reason }];
  return err;
};

test('🔴 ผูกลิงก์: คนผูกไม่มีสิทธิ์บนเอกสาร = 403 และไม่มีการให้สิทธิ์', async () => {
  // null = ไม่มีสิทธิ์ · ค่าที่ไม่ใช่ 'writer'/'reader' ก็ไม่ใช่หลักฐาน (ตกทางปฏิเสธ)
  for (const role of [null, '', 'owner', true]) {
    const drive = fakeDrive({ role });
    await rejectsWith(link(drive), 403, NO_ACCESS);
    assert.deepEqual(drive.writes, []);
  }
});

test('🔴 ผูกลิงก์: พิสูจน์สิทธิ์ก่อนอ่านอะไรของไฟล์ — fileAccessRole มาก่อน getFileMeta เสมอ', async () => {
  const drive = fakeDrive({ role: 'reader' });
  await link(drive);
  assert.deepEqual(drive.reads.map(([name]) => name), ['fileAccessRole', 'getFileMeta']);
  assert.deepEqual(drive.reads[0], ['fileAccessRole', 'FILE_ID_1234567890', ME], 'ถามด้วย id ที่แกะจากลิงก์ ไม่ใช่ id จาก metadata');
});

test('🔴 ผูกลิงก์: คนที่ไม่มีสิทธิ์ได้คำตอบเดียวกันทุก id — โฟลเดอร์ · PDF · ถังขยะ · ไม่มีไฟล์ (ห้ามใช้ถามว่าไฟล์ไหนมีอยู่)', async () => {
  const seen = new Set();
  const cases = [
    ['เอกสารปกติ', { role: null }],
    ['โฟลเดอร์', { role: null, meta: { mimeType: 'application/vnd.google-apps.folder' } }],
    ['PDF', { role: null, meta: { mimeType: 'application/pdf' } }],
    ['อยู่ในถังขยะ', { role: null, meta: { trashed: true } }],
    ['ถังขยะ + ไม่ใช่ Doc', { role: null, meta: { trashed: true, mimeType: 'image/png' } }],
    ['ไม่มีไฟล์ (metadata ก็อ่านไม่ได้)', { role: null, metaError: driveError('code', 404) }],
    ['ไม่มีไฟล์ — permissions.list ตอบ 404 (code)', { accessError: driveError('code', 404), metaError: driveError('code', 404) }],
    ['ไม่มีไฟล์ — 404 (status)', { accessError: driveError('status', 404) }],
    ['ไม่มีไฟล์ — 404 (response.status)', { accessError: driveError('response', 404) }],
    ['Drive ไม่ให้ดู — 403', { accessError: driveError('code', 403, 'insufficientFilePermissions') }],
    ['Drive ไม่ให้ดู — 403 ไม่มีรายละเอียด', { accessError: driveError('response', 403) }],
  ];
  for (const [label, options] of cases) {
    const drive = fakeDrive(options);
    await assert.rejects(link(drive), (err) => {
      assert.ok(err instanceof GoogleDocError, label);
      seen.add(`${err.status}|${err.message}`);
      return true;
    });
    assert.deepEqual(drive.reads.map(([name]) => name), ['fileAccessRole'], `${label}: ห้ามอ่าน metadata ของไฟล์ที่ยังพิสูจน์สิทธิ์ไม่ได้`);
    assert.deepEqual(drive.writes, [], label);
  }
  assert.equal(seen.size, 1, `ต้องมีคำตอบแบบเดียว ได้ ${[...seen].join(' || ')}`);
  const [only] = [...seen];
  assert.match(only, /^403\|/);
  assert.match(only.slice(4), NO_ACCESS);
});

test('🔴 ผูกลิงก์: ไฟล์หาย/ถูกปิดหลังพิสูจน์สิทธิ์ผ่าน (getFileMeta ตอบ 404/403) = คำตอบเดียวกับไม่มีสิทธิ์', async () => {
  for (const metaError of [driveError('code', 404), driveError('status', 403), driveError('response', 404)]) {
    const drive = fakeDrive({ role: 'writer', metaError });
    await rejectsWith(link(drive), 403, NO_ACCESS);
    assert.deepEqual(drive.writes, []);
  }
});

test('🔴 ผูกลิงก์: Drive ล่ม/โควตาเต็มตอนถามสิทธิ์ = 502 ให้ลองใหม่ ไม่ใช่ "ไม่มีสิทธิ์"', async () => {
  for (const accessError of [
    driveError('code', 500), driveError('response', 503), driveError('code', 429),
    driveError('code', 403, 'userRateLimitExceeded'), driveError('code', 403, 'rateLimitExceeded'),
    driveError('code', 403, 'dailyLimitExceeded'), driveError('code', 403, 'quotaExceeded'),
  ]) {
    const drive = fakeDrive({ accessError });
    await rejectsWith(link(drive), 502, /ตรวจสิทธิ์ของคุณบนเอกสารนี้ไม่สำเร็จ/);
    assert.deepEqual(drive.reads.map(([name]) => name), ['fileAccessRole']);
    assert.deepEqual(drive.writes, []);
  }
});

test('🔴 ผูกลิงก์: อ่านสิทธิ์ไม่สำเร็จ = ไม่ผูก (fail closed) ไม่ใช่ปล่อยผ่าน', async () => {
  const drive = fakeDrive({ accessError: new Error('Drive ล่ม') });
  await rejectsWith(link(drive), 502, /ตรวจสิทธิ์ของคุณบนเอกสารนี้ไม่สำเร็จ/);
  assert.deepEqual(drive.writes, []);
});

test('ผูกลิงก์: Drive อ่าน metadata ไม่ได้ด้วยเหตุอื่น (ไม่ใช่ 404/403) = ข้อความกลาง 500 (ไม่คายข้อความดิบของ Google)', async () => {
  for (const metaError of [new Error('File not found: xyz'), driveError('code', 500), driveError('code', 403, 'rateLimitExceeded')]) {
    const drive = fakeDrive({ metaError });
    await rejectsWith(link(drive), 500, /^ดำเนินการกับ Google Drive ไม่สำเร็จ$/);
    assert.deepEqual(drive.writes, []);
  }
});

test('ผูกลิงก์: ลิงก์ที่แกะ id ไม่ได้ = 400', async () => {
  const drive = fakeDrive();
  await rejectsWith(link(drive, { url: 'https://example.com/nothing' }), 400, /ลิงก์ Google Drive ไม่ถูกต้อง/);
  assert.deepEqual(drive.reads, []);
});

test('🔴 ผูกลิงก์สำเร็จ: ไม่ให้สิทธิ์อะไรแก่คนผูก และจด role ที่พิสูจน์ได้ไว้ใน linkRole', async () => {
  for (const [role, mimeType, kind] of [['writer', DOC, 'gdoc'], ['reader', SHEET, 'gsheet']]) {
    const drive = fakeDrive({ role, meta: { mimeType } });
    const out = await link(drive);
    assert.deepEqual(drive.writes, [], 'mode link ต้องไม่มี grantWriter/grantFileRole เลย');
    assert.deepEqual(drive.reads.find(([name]) => name === 'fileAccessRole'), ['fileAccessRole', 'FILE_ID_1234567890', ME]);
    assert.deepEqual(out.metadata, { kind, googleFileId: 'FILE_ID_1234567890', linkRole: role, linkedBy: ME });
    assert.equal(out.driveFileId, null);
    assert.equal(out.fileUrl, 'https://docs.google.com/document/d/FILE_ID_1234567890/edit', 'ที่อยู่มาจาก Drive ไม่ใช่จากที่ client พิมพ์');
    assert.equal(out.mimeType, mimeType);
    // ⚠️ ไม่จดคนผูกลงสมุดสิทธิ์ — ระบบไม่ได้ให้ จึงต้องไม่ถูกถอนตอนลบแถว
    assert.equal('accessGranted' in out.metadata, false);
    assert.equal('accessRoles' in out.metadata, false);
  }
});

test('🔴 ผูกลิงก์สำเร็จ: จดคนผูกไว้ใน linkedBy เป็นตัวพิมพ์เล็กตัดช่องว่าง — ตัวให้สิทธิ์ใช้แยกคนผูกออกจากคนดู', async () => {
  const drive = fakeDrive({ role: 'writer' });
  const out = await link(drive, { grantEmail: '  Me@ScentAndSense.CO.TH ' });
  assert.equal(out.metadata.linkedBy, ME);
});

// ── 3) buildGoogleAttachment — mode 'create' ────────────────────────────────────
const create = (drive, over = {}) => buildGoogleAttachment({
  entityType: 'personal_task', entityId: 'T-1', mode: 'create', type: 'gdoc', name: 'ร่างแผน', grantEmail: ME, ...over,
}, { drive });

test('สร้างเอกสาร: ให้ writer แก่คนสร้างและจดลงสมุดสิทธิ์ทันที (ลบแถวก่อนเปิดรายการก็ยังถอนเจอ)', async () => {
  const drive = fakeDrive();
  const out = await create(drive);
  assert.deepEqual(drive.writes, [
    ['createGoogleFile', 'FOLDER-1', 'ร่างแผน', 'gdoc'],
    ['grantFileRole', 'NEW-FILE-1', ME, 'writer'],
  ]);
  assert.deepEqual(out.metadata, {
    kind: 'gdoc', googleFileId: 'NEW-FILE-1', accessGranted: [ME], accessRoles: { [ME]: 'writer' },
  });
  assert.equal('linkRole' in out.metadata, false, 'เอกสารที่ระบบสร้างเองไม่มีเพดาน — เดินแบบเดิม');
  assert.equal('linkedBy' in out.metadata, false, 'เอกสารที่ระบบสร้างเองไม่มีคนผูก — คนสร้างต้องได้สิทธิ์ตามปกติ');
  assert.deepEqual(drive.reads, [], 'สร้างเอกสารไม่ต้องพิสูจน์สิทธิ์ — ไฟล์เป็นของระบบ');
});

test('🔴 สร้างเอกสาร: ให้สิทธิ์ล้ม = ไม่จดว่าให้แล้ว (รอบเปิดรายการจะให้ซ้ำเอง) และการแนบไม่ล้ม', async () => {
  const drive = fakeDrive({ grantError: new Error('Drive ล่ม') });
  const out = await create(drive);
  assert.deepEqual(out.metadata, { kind: 'gdoc', googleFileId: 'NEW-FILE-1' });
  assert.equal(out.fileUrl, 'https://docs.google.com/document/d/NEW-FILE-1/edit');
});

test('สร้างเอกสาร: คนที่ไม่มีอีเมล Google ยังสร้างได้ — แค่ไม่มีการให้สิทธิ์', async () => {
  const drive = fakeDrive();
  const out = await create(drive, { grantEmail: null });
  assert.deepEqual(drive.writes, [['createGoogleFile', 'FOLDER-1', 'ร่างแผน', 'gdoc']]);
  assert.deepEqual(out.metadata, { kind: 'gdoc', googleFileId: 'NEW-FILE-1' });
});

test('mode/ชนิดที่ไม่รู้จัก = 400 เหมือนเดิม', async () => {
  await rejectsWith(create(fakeDrive(), { type: 'gslide' }), 400, /ชนิดเอกสารไม่รองรับ/);
  await rejectsWith(buildGoogleAttachment({ mode: 'อื่น' }, { drive: fakeDrive() }), 400, /mode ไม่ถูกต้อง/);
});

// ── 4) ensureGoogleDocAccess — ให้สิทธิ์ตอนเปิดรายการ ───────────────────────────
function fakeDb() {
  const updates = [];
  return {
    updates,
    from: () => ({
      update: (patch) => ({ eq: async (_c, id) => { updates.push({ id, metadata: patch.metadata }); return { error: null }; } }),
    }),
  };
}
// Drive ปลอมฝั่งให้สิทธิ์: `current` = สิทธิ์ที่คนดูมีอยู่แล้วบนไฟล์
function grantDrive({ current = null, accessError = null } = {}) {
  const grants = [];
  const asked = [];
  return {
    grants,
    asked,
    fileAccessRole: async (fileId, email) => {
      asked.push([fileId, email]);
      if (accessError) throw accessError;
      return typeof current === 'function' ? current(fileId) : current;
    },
    grantFileRole: async (fileId, email, role) => { grants.push([fileId, email, role]); },
  };
}
const linked = (id, linkRole, extra = {}) => ({
  id, metadata: { kind: 'gdoc', googleFileId: `F-${id}`, linkRole, ...extra },
});

test('roleForViewer: แถวที่ผูกมาให้ไม่เกิน linkRole · แถวอื่นไม่ถูกแตะ', () => {
  assert.equal(roleForViewer(linked('A', 'reader'), 'writer'), 'reader');
  assert.equal(roleForViewer(linked('A', 'reader'), 'reader'), 'reader');
  assert.equal(roleForViewer(linked('A', 'writer'), 'writer'), 'writer');
  assert.equal(roleForViewer(linked('A', 'writer'), 'reader'), 'reader');
  // ค่าแปลกปลอมตกทางแคบ
  assert.equal(roleForViewer(linked('A', 'owner'), 'writer'), 'reader');
  // ไม่มี linkRole (ระบบสร้างเอง / ผูกไว้ก่อนมีกติกานี้) = ตามที่ระบบอยากให้
  assert.equal(roleForViewer({ metadata: { kind: 'gdoc', googleFileId: 'F' } }, 'writer'), 'writer');
  assert.equal(roleForViewer({ metadata: { kind: 'gdoc', googleFileId: 'F', linkRole: null } }, 'writer'), 'writer');
});

test('🔴 แถวที่คนผูกอ่านได้อย่างเดียว ไม่มีวันพา writer ไปให้ใคร แม้คนนั้นแก้ระเบียนได้', async () => {
  const db = fakeDb();
  const drive = grantDrive({ current: null });
  const n = await ensureGoogleDocAccess(db, [linked('A', 'reader')], { email: ME, role: 'writer' }, { drive });
  assert.equal(n, 1);
  assert.deepEqual(drive.grants, [['F-A', ME, 'reader']]);
  assert.deepEqual(db.updates, [{
    id: 'A',
    metadata: { kind: 'gdoc', googleFileId: 'F-A', linkRole: 'reader', accessGranted: [ME], accessRoles: { [ME]: 'reader' } },
  }]);
  // รอบถัดไป: จดไว้แล้วด้วย role ที่ให้จริง ⇒ ไม่ยิง Drive ซ้ำ และไม่พยายามยกเป็น writer
  const again = grantDrive();
  const row = { id: 'A', metadata: db.updates[0].metadata };
  assert.equal(await ensureGoogleDocAccess(fakeDb(), [row], { email: ME, role: 'writer' }, { drive: again }), 0);
  assert.deepEqual([again.asked, again.grants], [[], []]);
});

test('🔴 คนดูมีสิทธิ์บนเอกสารที่ผูกมาอยู่แล้ว = ไม่แตะ (ไม่ลด ไม่ยก) และไม่จดชื่อ', async () => {
  for (const [current, want] of [['writer', 'reader'], ['reader', 'writer'], ['reader', 'reader'], ['writer', 'writer']]) {
    const db = fakeDb();
    const drive = grantDrive({ current });
    const n = await ensureGoogleDocAccess(db, [linked('A', 'writer')], { email: ME, role: want }, { drive });
    assert.equal(n, 0, `${current}→${want}`);
    assert.deepEqual(drive.asked, [['F-A', ME]]);
    assert.deepEqual(drive.grants, [], `${current}→${want}: ห้ามเขียนทับสิทธิ์ที่ระบบไม่ได้ให้`);
    assert.deepEqual(db.updates, [], 'ไม่จด = ลบแถวแล้วสิทธิ์ของเขาไม่ถูกถอน');
  }
});

test('คนดูยังไม่มีสิทธิ์บนเอกสารที่ผูกมา = สร้างให้แล้วจด', async () => {
  const db = fakeDb();
  const drive = grantDrive({ current: null });
  const n = await ensureGoogleDocAccess(db, [linked('A', 'writer')], { email: ME, role: 'writer' }, { drive });
  assert.equal(n, 1);
  assert.deepEqual(drive.grants, [['F-A', ME, 'writer']]);
  assert.deepEqual(db.updates[0].metadata.accessGranted, [ME]);
  assert.deepEqual(db.updates[0].metadata.accessRoles, { [ME]: 'writer' });
  assert.equal(db.updates[0].metadata.linkRole, 'writer', 'จดสิทธิ์แล้วเพดานของแถวต้องยังอยู่');
});

// ── คนผูก (`linkedBy`) กับแถวที่ตัวเองผูก ──
const LINKER = 'linker@scentandsense.co.th';
const ownLink = (id, linkRole, extra = {}) => linked(id, linkRole, { linkedBy: LINKER, ...extra });

test('🔴 คนผูกที่ยังมีสิทธิ์บนเอกสาร: แถวของตัวเองไม่แตะอะไรเลย — ไม่ถาม Drive ไม่เขียนสิทธิ์ ไม่จด', async () => {
  for (const [linkRole, role] of [['writer', 'writer'], ['writer', 'reader'], ['reader', 'writer'], ['reader', 'reader']]) {
    const db = fakeDb();
    const drive = grantDrive({ current: 'writer' });
    assert.equal(await ensureGoogleDocAccess(db, [ownLink('A', linkRole)], { email: LINKER, role }, { drive }), 0);
    assert.deepEqual([drive.asked, drive.grants, db.updates], [[], [], []], `${linkRole}/${role}`);
  }
});

test('🔴 คนผูกที่ถูกถอนสิทธิ์ไปแล้ว: เปิดรายการของแถวที่ตัวเองผูกกี่รอบ ระบบก็ไม่สร้างสิทธิ์คืนให้', async () => {
  // Drive ตอบ null = ไม่มีสิทธิ์เหลือแล้ว (ย้ายทีม/ถูกกดโล่/เจ้าของเลิกแชร์) — เคสที่เดิมได้ writer คืน
  for (const email of [LINKER, 'Linker@ScentAndSense.co.th', '  LINKER@SCENTANDSENSE.CO.TH ']) {
    const db = fakeDb();
    const drive = grantDrive({ current: null });
    assert.equal(await ensureGoogleDocAccess(db, [ownLink('A', 'writer')], { email, role: 'writer' }, { drive }), 0, email);
    assert.deepEqual(drive.grants, [], `${email}: ห้าม grant คนผูกผ่านแถวของตัวเอง`);
    assert.deepEqual(db.updates, [], 'ไม่จดชื่อคนผูกลงสมุดสิทธิ์');
    assert.deepEqual(drive.asked, [], 'ตัดสินก่อนถาม Drive — ไม่เสีย permissions.list ต่อการเปิดหนึ่งครั้ง');
  }
  // แม้สมุดสิทธิ์จะมีชื่อคนผูกหลงอยู่ (ไม่ควรเกิด) ก็ไม่มีการตั้ง role ให้ใหม่
  const stale = ownLink('A', 'writer', { accessGranted: [LINKER], accessRoles: { [LINKER]: 'reader' } });
  const drive = grantDrive({ current: null });
  const db = fakeDb();
  assert.equal(await ensureGoogleDocAccess(db, [stale], { email: LINKER, role: 'writer' }, { drive }), 0);
  assert.deepEqual([drive.asked, drive.grants, db.updates], [[], [], []]);
});

test('🔴 คนดูคนอื่นของแถวที่ผูกมา ยังได้สิทธิ์ตามเดิม (ไม่เกิน linkRole) และถูกจด — คนผูกหลุดสิทธิ์ไปแล้วก็ไม่เกี่ยว', async () => {
  for (const [linkRole, want, give] of [['writer', 'writer', 'writer'], ['writer', 'reader', 'reader'], ['reader', 'writer', 'reader']]) {
    const db = fakeDb();
    const drive = grantDrive({ current: null });
    const n = await ensureGoogleDocAccess(db, [ownLink('A', linkRole)], { email: ME, role: want }, { drive });
    assert.equal(n, 1, `${linkRole}/${want}`);
    assert.deepEqual(drive.asked, [['F-A', ME]]);
    assert.deepEqual(drive.grants, [['F-A', ME, give]], `${linkRole}/${want}: ให้ไม่เกินเพดานของแถว`);
    assert.deepEqual(db.updates, [{
      id: 'A',
      metadata: { kind: 'gdoc', googleFileId: 'F-A', linkRole, linkedBy: LINKER, accessGranted: [ME], accessRoles: { [ME]: give } },
    }], 'จดคนดู และ linkedBy/linkRole ของแถวต้องยังอยู่');
  }
});

test('🔴 หลายแถวในรายการเดียว: ข้ามเฉพาะแถวที่คนดูเป็นคนผูกเอง — แถวที่คนอื่นผูกและแถวของระบบเดินตามปกติ', async () => {
  const db = fakeDb();
  const drive = grantDrive({ current: null });
  const rows = [
    ownLink('A', 'writer'),                                   // ผูกเอง ⇒ ข้าม
    linked('B', 'reader', { linkedBy: ME }),                  // คนอื่นผูก ⇒ ได้ไม่เกิน reader
    { id: 'C', metadata: { kind: 'gdoc', googleFileId: 'F-C' } }, // ระบบสร้าง ⇒ ได้ตามสิทธิ์ในระบบ
    { id: 'D', metadata: { kind: 'gdoc', googleFileId: 'F-D', linkedBy: LINKER } }, // linkedBy ลอย ๆ ไม่มี linkRole ⇒ ไม่ใช่แถวที่ผูกมา
  ];
  assert.equal(await ensureGoogleDocAccess(db, rows, { email: LINKER, role: 'writer' }, { drive }), 3);
  assert.deepEqual(drive.asked, [['F-B', LINKER]]);
  assert.deepEqual(drive.grants, [['F-B', LINKER, 'reader'], ['F-C', LINKER, 'writer'], ['F-D', LINKER, 'writer']]);
  assert.deepEqual(db.updates.map((u) => u.id), ['B', 'C', 'D']);
});

test('แถวที่ผูกมาแต่ไม่มี linkedBy (ไม่รู้ว่าใครผูก) เดินแบบคนดูทั่วไปเหมือนเดิม — ไม่มีสิทธิ์ = สร้างให้แล้วจด', async () => {
  for (const linkedBy of [undefined, null, '', 42, [LINKER]]) {
    const db = fakeDb();
    const drive = grantDrive({ current: null });
    const row = linked('A', 'writer', linkedBy === undefined ? {} : { linkedBy });
    assert.equal(await ensureGoogleDocAccess(db, [row], { email: LINKER, role: 'writer' }, { drive }), 1, String(linkedBy));
    assert.deepEqual(drive.asked, [['F-A', LINKER]]);
    assert.deepEqual(drive.grants, [['F-A', LINKER, 'writer']]);
    assert.deepEqual(db.updates.map((u) => u.id), ['A']);
  }
});

test('🔴 ถามสิทธิ์เดิมของคนดูไม่สำเร็จ = ข้ามใบนั้น (ไม่ให้ ไม่จด) แต่ใบอื่นเดินต่อ รายการไม่ล้ม', async () => {
  const db = fakeDb();
  const drive = grantDrive();
  drive.fileAccessRole = async (fileId) => { if (fileId === 'F-A') throw new Error('Drive ล่ม'); return null; };
  const n = await ensureGoogleDocAccess(db, [linked('A', 'writer'), linked('B', 'writer')], { email: ME, role: 'reader' }, { drive });
  assert.equal(n, 1);
  assert.deepEqual(drive.grants, [['F-B', ME, 'reader']]);
  assert.deepEqual(db.updates.map((u) => u.id), ['B']);
});

test('สิทธิ์ที่ระบบสร้างเองบนแถวที่ผูกมา ยังเดินตามสิทธิ์ในระบบ (ลดเป็น reader เมื่อหลุดขอบเขต) ไม่เกินเพดาน', async () => {
  // จดไว้แล้วว่า writer (ระบบเป็นคนสร้าง) → คราวนี้ดูได้อย่างเดียว ⇒ ต้องลด โดยไม่ต้องถาม Drive ก่อน
  const row = linked('A', 'writer', { accessGranted: [ME], accessRoles: { [ME]: 'writer' } });
  const db = fakeDb();
  const drive = grantDrive({ current: 'writer' });
  assert.equal(await ensureGoogleDocAccess(db, [row], { email: ME, role: 'reader' }, { drive }), 1);
  assert.deepEqual(drive.asked, []);
  assert.deepEqual(drive.grants, [['F-A', ME, 'reader']]);
  assert.deepEqual(db.updates[0].metadata.accessRoles, { [ME]: 'reader' });
});

test('แถวที่ระบบสร้างเอง/ผูกไว้ก่อนมี linkRole เดินแบบเดิมทุกประการ — ไม่ถาม Drive ก่อน ให้ตาม role ของระบบ', async () => {
  const db = fakeDb();
  const drive = grantDrive({ current: 'reader' });
  const rows = [
    { id: 'C', metadata: { kind: 'gdoc', googleFileId: 'F-C' } },
    { id: 'D', metadata: { kind: 'gsheet', googleFileId: 'F-D', accessGranted: [ME], accessRoles: { [ME]: 'reader' } } },
    { id: 'E', metadata: { kind: 'gdoc', googleFileId: 'F-E', accessGranted: [ME], accessRoles: { [ME]: 'writer' } } },
  ];
  assert.equal(await ensureGoogleDocAccess(db, rows, { email: ME, role: 'writer' }, { drive }), 2);
  assert.deepEqual(drive.asked, [], 'ไม่มี linkRole = ไม่มีการถามสิทธิ์เดิม');
  assert.deepEqual(drive.grants, [['F-C', ME, 'writer'], ['F-D', ME, 'writer']]);
  assert.deepEqual(db.updates.map((u) => u.id), ['C', 'D']);
});

// ── 5) revokeAttachmentGrants — ลบแถวแล้วถอนเฉพาะสิทธิ์ที่ไม่มีแถวอื่นใช้ ───────
function siblingDb(result) {
  const queries = [];
  return {
    queries,
    from: (table) => ({
      select: (cols) => ({
        contains: (col, value) => ({
          limit: async (n) => { queries.push({ table, cols, col, value, limit: n }); return result; },
        }),
      }),
    }),
  };
}
const revokeDrive = () => {
  const calls = [];
  return { calls, revokeFileRole: async (fileId, email) => { calls.push([fileId, email]); return true; } };
};
const ATT = { id: 'A1', metadata: { kind: 'gdoc', googleFileId: 'F1', accessGranted: ['a@x.co', 'b@x.co'] } };

test('🔴 ลบแถว: อีเมลที่แถวอื่นของไฟล์เดียวกันยังจดอยู่ ไม่ถูกถอน', async () => {
  const drive = revokeDrive();
  const supabase = siblingDb({
    data: [
      { id: 'A1', metadata: { googleFileId: 'F1', accessGranted: ['a@x.co', 'b@x.co'] } }, // ตัวเอง (กรณียังไม่ถูกลบ) ไม่นับ
      { id: 'A2', metadata: { googleFileId: 'F1', accessGranted: ['b@x.co', 'c@x.co'] } },
      { id: 'A3', metadata: { googleFileId: 'F-อื่น', accessGranted: ['a@x.co'] } },      // คนละไฟล์ ไม่นับ
    ],
    error: null,
  });
  assert.equal(await revokeAttachmentGrants(ATT, { drive, supabase }), 1);
  assert.deepEqual(drive.calls, [['F1', 'a@x.co']], 'b ยังถูกจดในแถว A2 — สิทธิ์ต้องอยู่');
  // อ่านครั้งเดียว มีขอบเขต และกรองด้วยไฟล์ใบนี้
  assert.equal(supabase.queries.length, 1);
  assert.equal(supabase.queries[0].table, 'attachments');
  assert.deepEqual(supabase.queries[0].value, { googleFileId: 'F1' });
  assert.ok(supabase.queries[0].limit > 0 && supabase.queries[0].limit <= 1000, 'ต้องมี limit ที่ไม่เกินเพดานของ PostgREST');
});

test('🔴 ลบแถว: อ่านแถวพี่น้องไม่ได้ = ไม่ถอนใครเลย (ไม่แน่ใจห้ามทำสิทธิ์ที่ยังควรมีหาย)', async () => {
  for (const result of [
    { data: null, error: { message: 'ฐานข้อมูลล่ม' } },
    { data: null, error: null },
    { data: Array.from({ length: 200 }, (_, i) => ({ id: `X${i}`, metadata: { googleFileId: 'F1' } })), error: null }, // เต็มเพดาน = อาจถูกตัด
  ]) {
    const drive = revokeDrive();
    assert.equal(await revokeAttachmentGrants(ATT, { drive, supabase: siblingDb(result) }), 0);
    assert.deepEqual(drive.calls, []);
  }
  // ตัวอ่านโยน (ไม่ควรเกิดกับ supabase-js แต่ต้องไม่หลุดเป็น error ของการลบแถว)
  const drive = revokeDrive();
  const broken = { from: () => { throw new Error('พัง'); } };
  assert.equal(await revokeAttachmentGrants(ATT, { drive, supabase: broken }), 0);
  assert.deepEqual(drive.calls, []);
});

test('🔴 ลบแถว: googleFileId ที่หลุดรูป id ของ Drive ไม่ถูกส่งเข้าตัวกรอง และไม่มีการถอน', async () => {
  const drive = revokeDrive();
  const supabase = siblingDb({ data: [], error: null });
  const att = { id: 'A1', metadata: { googleFileId: 'F1,id.neq.x)', accessGranted: ['a@x.co'] } };
  assert.equal(await revokeAttachmentGrants(att, { drive, supabase }), 0);
  assert.deepEqual(supabase.queries, []);
  assert.deepEqual(drive.calls, []);
});

test('ลบแถว: ไม่มีแถวอื่นผูกไฟล์นี้ = ถอนครบทุกอีเมลเหมือนเดิม', async () => {
  const drive = revokeDrive();
  assert.equal(await revokeAttachmentGrants(ATT, { drive, supabase: siblingDb({ data: [], error: null }) }), 2);
  assert.deepEqual(drive.calls, [['F1', 'a@x.co'], ['F1', 'b@x.co']]);
});

// ── 6) สมุดสิทธิ์เป็นของเซิร์ฟเวอร์ — client ส่งมาเองไม่ได้ ──────────────────────
test('🔴 stripDriveMetadata ตัด accessGranted / accessRoles / linkRole / linkedBy ออกจากของที่ client ส่ง', () => {
  const dirty = {
    issuedDate: '2026-10-08', note: 'ของผู้ใช้',
    kind: 'gdoc', googleFileId: 'F-ของคนอื่น',
    accessGranted: [], accessRoles: {}, linkRole: 'writer', linkedBy: 'someone-else@scentandsense.co.th',
  };
  assert.deepEqual(stripDriveMetadata(dirty), { issuedDate: '2026-10-08', note: 'ของผู้ใช้' });
  for (const key of ['kind', 'googleFileId', 'accessGranted', 'accessRoles', 'linkRole', 'linkedBy']) {
    assert.ok(DRIVE_OWNED_METADATA_KEYS.includes(key), key);
  }
  assert.equal(dirty.linkRole, 'writer', 'ห้ามแก้ object ที่รับมา');
});

test('🔴 ทุกคีย์ที่ buildGoogleAttachment ผลิต อยู่ในรายการที่ client แตะไม่ได้ (ratchet)', async () => {
  const outputs = [await link(fakeDrive({ role: 'reader' })), await create(fakeDrive())];
  for (const out of outputs) {
    for (const key of Object.keys(out.metadata)) {
      assert.ok(DRIVE_OWNED_METADATA_KEYS.includes(key), `metadata.${key} ผลิตโดยเซิร์ฟเวอร์แต่ client ยังส่งทับได้`);
    }
  }
});

test('PATCH merge ทับของเดิมบนแถว — ตัดคีย์จากฝั่ง client แล้วสมุดสิทธิ์เดิมต้องยังอยู่', () => {
  // จำลองบรรทัด `{ ...(att.metadata || {}), ...requested }` ของ PATCH /api/attachments/[id]
  const stored = { kind: 'gdoc', googleFileId: 'F1', linkRole: 'reader', linkedBy: ME, accessGranted: [ME], accessRoles: { [ME]: 'reader' } };
  const requested = stripDriveMetadata({ issuedDate: '2026-10-08', linkRole: 'writer', accessGranted: [], linkedBy: '' });
  assert.deepEqual({ ...stored, ...requested }, { ...stored, issuedDate: '2026-10-08' });
});
