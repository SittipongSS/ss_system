/* ราคาทุน + รูปของแถว checklist ใบสเปค (มติเจ้าของ 08/10/2569 · ในระบบเท่านั้น) — ยามซอร์สของจอ
 *
 * จอเป็น JSX (เทสต์รันใต้ Node ดิบ เรนเดอร์ไม่ได้) ⇒ ตรรกะที่เป็นค่าล้วนเทสต์ที่ `productSpecView.test.mjs` ·
 * `fileIntake.test.mjs` · `attachmentsPanelRender.test.mjs` · ที่นี่ยาม "จอเรียกอะไร/วาดอะไร" ที่พังแล้วเงียบ:
 *   · กล่องรูปแถวละกล่องอัปขึ้น server ทันที — Ctrl+V ลอย ๆ ห้ามลงแถวแรก (paste focused + disabled ของ hook)
 *   · คอลัมน์ราคาทุนหลุดให้คนที่ไม่มีสิทธิ์เห็น · ผลแนบรูปลงผิดแถว (key ตามลำดับ)
 *   · บันทึก/โหลดทับ/ลบ ระหว่างรูปกำลังขึ้น · ราคาทุน/รูปหลุดไปจอเอกสาร (มติ: ไม่ลงกระดาษ ไม่ขึ้นจอเอกสาร)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = (rel) => fs.readFileSync(path.join(process.cwd(), 'src', rel), 'utf8');
const stripComments = (src) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\s\/\/ .*$/gm, '');

const cell = stripComments(read('components/database/SpecItemImageCell.js'));
const cellCss = read('components/database/SpecItemImageCell.module.css');
const form = stripComments(read('components/database/ProductSpecForm.js'));
const formCss = read('components/database/ProductSpecForm.module.css');
const page = stripComments(read('app/database/products/[id]/spec/page.js'));
const docContent = read('components/salesPlanning/SpecDocumentContent.js');

test('กล่องรูปของแถว: paste เฉพาะตอนโฟกัส · disabled ของ hook ครบสามเหตุ · ป้ายกล่องอยู่บน div ของตัวเอง', () => {
  assert.match(cell, /paste: "focused",/);
  assert.match(cell, /disabled: readOnly \|\| !canAttach \|\| busy,/, 'ปิดที่ hook ไม่ใช่แค่ปุ่ม — ไม่งั้นลากวาง/วางยังอัปได้ตอนยังไม่มีสเปค');
  assert.match(cell, /multiple: false,/);
  assert.match(cell, /accept: RULE\.accept,/);
  assert.match(cell, /maxBytes: RULE\.maxBytes,/);
  // zoneProps กางที่เดียว และอยู่บน <div> ของกล่อง — ไม่มี td/tr ในไฟล์นี้เลย
  const spreads = [...cell.matchAll(/<(\w+)[^<>]*\{\.\.\.intake\.zoneProps\}/g)].map((m) => m[1]);
  assert.deepEqual(spreads, ['div']);
  assert.doesNotMatch(cell, /<t[dr]\b/);
  assert.doesNotMatch(form, /zoneProps/, 'ฟอร์มไม่แตะป้ายกล่องรับไฟล์ — เซลล์/แถวของตารางห้ามเป็นกล่อง');
});

test('กล่องรูปของแถว: แนบผ่าน uploadAttachment ชนิด spec_item_image เท่านั้น · ไม่มี fetch ดิบ · ไม่เขียน input เอง', () => {
  assert.match(cell, /import \{ uploadAttachment \} from "@\/lib\/master\/attachmentUpload";/);
  assert.match(cell, /uploadAttachment\(\{\s*entityType: "product", entityId: productId, file, docType: SPEC_ITEM_IMAGE_DOC_TYPE,\s*\}\)/);
  assert.match(cell, /attachmentFileRuleError\(SPEC_ITEM_IMAGE_DOC_TYPE, file\)/);
  assert.doesNotMatch(cell, /\bfetch\(/);
  assert.doesNotMatch(cell, /apiFetch|apiJson/, 'เปลี่ยน/เอาออกแตะแค่ตัวชี้ในร่าง — จอนี้ไม่ลบไฟล์เอง');
  assert.doesNotMatch(cell, /type="file"/);
  assert.match(cell, /<input \{\.\.\.intake\.inputProps\} \/>/);
  assert.doesNotMatch(cell, /style=\{\{/);
});

test('กล่องรูปของแถว: นับงานค้าง +1 ก่อนอัป · −1 ใน finally ที่เดียว · ไม่ลดตอน unmount', () => {
  assert.equal([...cell.matchAll(/onBusy\?\.\(1\)/g)].length, 1);
  assert.equal([...cell.matchAll(/onBusy\?\.\(-1\)/g)].length, 1);
  assert.match(cell, /finally \{\s*setBusy\(false\);\s*onBusy\?\.\(-1\);\s*\}/);
  assert.ok(cell.indexOf('onBusy?.(1)') < cell.indexOf('await uploadAttachment('));
  // effect มีได้ตัวเดียว (ตัวคืนโฟกัส) — ไม่คืน cleanup และไม่แตะ onBusy: ลดตอน unmount = แถวที่ถูกลบระหว่างอัปลดซ้ำ
  const effects = [...cell.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\n  \}, \[([^\]]*)\]\);/g)];
  assert.equal([...cell.matchAll(/useEffect\(/g)].length, 1);
  assert.equal(effects.length, 1, 'effect ต้องเป็นทรง useEffect(() => { … }, [deps]) ที่ยามนี้อ่านตัวได้');
  assert.doesNotMatch(effects[0][1], /onBusy|setBusy/);
  assert.doesNotMatch(effects[0][1], /return\s*\(\s*\)\s*=>|return\s+function|return\s+[A-Za-z_$]/, 'effect ห้ามคืน cleanup');
});

test('กล่องรูปของแถว: แนบ/เอาออกแล้วโฟกัสกลับเข้ากล่อง — ธงตั้งสองทาง · ไม่แย่งโฟกัสที่ผู้ใช้ย้ายไปแล้ว', () => {
  assert.match(cell, /import \{ useEffect, useRef, useState \} from "react";/);
  assert.match(cell, /const refocus = useRef\(false\);/);
  // ทางแนบ: ตั้งธงก่อนส่งตัวชี้ขึ้นร่าง (เฉพาะตอนแนบสำเร็จ) · ทางเอาออก: ตั้งธงก่อน onChange(null)
  assert.match(cell, /if \(result\.attachment\?\.id\) \{ refocus\.current = true; onChange\?\.\(result\.attachment\.id\); \}/);
  assert.match(cell, /onClick=\{\(\) => \{ setError\(""\); refocus\.current = true; onChange\?\.\(null\); \}\}/);
  assert.equal([...cell.matchAll(/refocus\.current = true;/g)].length, 2);
  const [, body, deps] = cell.match(/useEffect\(\(\) => \{([\s\S]*?)\n  \}, \[([^\]]*)\]\);/);
  assert.equal(deps, 'value, busy', 'ผูก busy ด้วย — หลังอัปเสร็จปุ่มต้องกลับมากดได้ก่อน');
  assert.match(body, /if \(!refocus\.current \|\| busy\) return;\s*refocus\.current = false;/);
  assert.match(body, /if \(active && active !== document\.body && !cellRef\.current\?\.contains\(active\)\) return;/, 'ผู้ใช้ย้ายโฟกัสไปที่อื่นแล้ว = ไม่แย่งกลับ');
  assert.match(body, /cellRef\.current\?\.querySelector\("button:not\(\[disabled\]\)"\)\?\.focus\(\);/);
  assert.ok(body.indexOf('contains(active)') < body.indexOf('.focus()'));
  // ref ของตัวคืนโฟกัสอยู่บนแถวปุ่ม — <div> ของกล่องถือ ref ของ hook (zoneProps) อยู่แล้ว ใส่ซ้อน = ทับกัน
  assert.match(cell, /<div ref=\{cellRef\} className=\{styles\.row\}>/);
  assert.equal([...cell.matchAll(/\sref=\{/g)].length, 1);
});

test('กล่องรูปของแถว: รูปย่อเป็นลิงก์แท็บใหม่ขนาดตายตัว · ไม่มีของกดได้ซ้อนในลิงก์ · อ่านอย่างเดียว = รูปหรือขีด', () => {
  assert.match(cell, /const imageHref = \(id\) => `\/api\/master\/attachments\/\$\{encodeURIComponent\(id\)\}\/file`;/);
  const link = cell.slice(cell.indexOf('<a'), cell.indexOf('</a>'));
  assert.match(link, /target="_blank"/);
  assert.match(link, /rel="noopener noreferrer"/);
  assert.match(link, /<PhotoThumb src=\{imageHref\(value\)\}[^>]*label="" \/>/);
  assert.doesNotMatch(link, /<Button|<button/);
  assert.match(cell, /if \(readOnly\) return thumb \|\| naText\(null\);/);
  assert.match(cell, /export const SPEC_ITEM_IMAGE_NEEDS_SPEC = "สร้างสเปคก่อน จึงแนบรูปของแต่ละแถวได้";/);
  // เหตุที่กดไม่ได้ต้องเห็นบนจอ — **ครั้งเดียวเหนือตาราง** (ฟอร์ม) ไม่ใช่ซ้ำใต้ปุ่มทุกแถว (17 บรรทัด + แถวสูง 82px) · กล่องถือไว้เป็น title
  assert.match(form, /\{!readOnly && !specExists \? <p className=\{`form-note \$\{styles\.imageNote\}`\}>\{SPEC_ITEM_IMAGE_NEEDS_SPEC\}<\/p> : null\}/);
  assert.match(cell, /title=\{!canAttach && blockedReason \? blockedReason : undefined\}/);
  // ปุ่ม "เปลี่ยนรูป" ก็ต้องบอกเหตุเมื่อถูกปิด (หน้ากำลังบันทึก) — ไม่งั้นปุ่มดับโดยไม่มีคำอธิบาย
  assert.match(cell, /title=\{!canAttach && blockedReason \? blockedReason : \(busy \? "กำลังแนบ…" : "เปลี่ยนรูป"\)\}/);
  // ปุ่ม "เอารูปออก" ไม่ผูกกับ canAttach — แตะแค่ตัวชี้ในร่าง ไม่มีไฟล์ค้าง
  const removeBtn = cell.slice(cell.indexOf('iconOnly tone="danger"'), cell.indexOf('onChange?.(null)'));
  assert.match(removeBtn, /disabled=\{busy\}/);
  assert.doesNotMatch(removeBtn, /canAttach|blockedReason/);
  assert.doesNotMatch(cell, /<p[^>]*>\{blockedReason\}<\/p>/, 'ห้ามพิมพ์เหตุซ้ำใต้ปุ่มทุกแถว');
  // ขนาดรูปย่อตายตัวใน CSS (รูปโหลดแบบ lazy)
  const thumbRule = cellCss.slice(cellCss.indexOf('.thumb {'), cellCss.indexOf('}', cellCss.indexOf('.thumb {')));
  assert.match(thumbRule, /width: 36px;/);
  assert.match(thumbRule, /height: 36px;/);
  assert.match(thumbRule, /overflow: hidden;/);
});

test('CSS module: คลาสที่จอเรียกมีจริงทุกตัว และไม่มีคลาสค้างที่ไม่มีใครเรียก', () => {
  for (const [source, css, name] of [[cell, cellCss, 'SpecItemImageCell'], [form, formCss, 'ProductSpecForm']]) {
    const used = new Set([...source.matchAll(/styles\.([A-Za-z0-9_]+)/g)].map((m) => m[1]));
    const defined = new Set([...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.([A-Za-z][A-Za-z0-9_]*)\b(?=[^{}]*\{)/g)].map((m) => m[1]));
    assert.deepEqual([...used].filter((k) => !defined.has(k)), [], `${name}: เรียกคลาสที่ไม่มีใน CSS`);
    assert.deepEqual([...defined].filter((k) => !used.has(k)), [], `${name}: คลาสใน CSS ที่ไม่มีใครเรียก`);
  }
});

test('ฟอร์มสเปค: คอลัมน์ราคาทุนขึ้นเฉพาะ canSeeItemCost (ทั้งหัวและเซลล์) · แก้ได้เฉพาะ canEditItemCost', () => {
  assert.match(form, /const canSeeItemCost = Boolean\(permissions\?\.canSeeItemCost\);/);
  assert.match(form, /const canEditItemCost = !readOnly && Boolean\(permissions\?\.canEditItemCost\);/);
  assert.match(form, /\{canSeeItemCost \? <th className=\{`num \$\{styles\.colCost\}`\}>ราคาทุน<\/th> : null\}/);
  // คำว่า "ราคาทุน"/costPrice ทุกจุดในตารางอยู่หลังด่าน canSeeItemCost
  const table = form.slice(form.indexOf('<tbody>'), form.indexOf('</tbody>'));
  const gate = table.indexOf('{canSeeItemCost ? (');
  assert.notEqual(gate, -1);
  assert.ok(table.indexOf('costPrice') > gate, 'ไม่มีการอ่าน costPrice นอกด่าน');
  const costCell = table.slice(gate, table.indexOf(') : null}', gate));
  assert.match(costCell, /<td className="num">/);
  assert.match(costCell, /\{canEditItemCost \? \(\s*<MoneyInput/);
  assert.match(costCell, /value=\{row\.costPrice \?\? ""\}/);
  assert.match(costCell, /aria-label=\{`ราคาทุน \$\{rowLabel\}`\}/);
  assert.match(costCell, /Math\.min\(next, SPEC_ITEM_COST_MAX\)/);
  assert.match(costCell, /\) : fmtMoneyOrDash\(row\.costPrice\)\}/);
  assert.equal([...table.matchAll(/costPrice/g)].every((m) => m.index > gate && m.index < gate + costCell.length), true);
});

test('ฟอร์มสเปค: แถวอ้างด้วย _uid — key · ตัวแก้ · ลบ · และหัวการ์ดใช้ค่าคงที่ตัวเดียว', () => {
  assert.match(form, /<tr key=\{row\._uid\}>/);
  assert.doesNotMatch(form, /setItem\(index,|removeItem\(index\)/);
  assert.match(form, /onItems\(\(rows\) => rows\.filter\(\(row\) => row\._uid !== uid\)\)/);
  assert.match(form, /onItems\(\(rows\) => restoreChecklistItem\(rows, entry\.key\)\)/);
  assert.match(form, /onChange=\{\(imageAttachmentId\) => setItem\(uid, \{ imageAttachmentId \}\)\}/);
  assert.match(form, /title=\{PRODUCT_SPEC_CHECKLIST_TITLE\}/);
  assert.doesNotMatch(form, /Checklist บรรจุภัณฑ์/);
  assert.match(form, /<TableScroll family="editable" surface="embedded" minWidth=\{canSeeItemCost \? 1100 : 972\}>/);
  assert.doesNotMatch(form, /style=\{\{/);
  // ลำดับคอลัมน์: ลำดับ | สิ่งที่ต้องเตรียม | รายละเอียด | ผู้จัดเตรียม | ราคาทุน | รูป | หมายเหตุ | ลบ
  const head = form.slice(form.indexOf('<thead>'), form.indexOf('</thead>'));
  const order = ['ลำดับ', 'สิ่งที่ต้องเตรียม', 'รายละเอียด', 'ผู้จัดเตรียม', 'ราคาทุน', '>รูป<', 'หมายเหตุ', 'ลบแถว'].map((word) => head.indexOf(word));
  assert.equal(order.every((at) => at !== -1), true);
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test('หน้าสเปค: รูปของแถวกำลังขึ้น = ไม่บันทึก ไม่โหลดทับ ไม่ลบ · กันออกจากหน้า · การ์ดจัดการขึ้นสถานะกำลังทำ', () => {
  const body = (name) => {
    const at = page.indexOf(`const ${name} = async (`);
    assert.notEqual(at, -1, `ไม่มี ${name}`);
    return page.slice(at, page.indexOf('\n  };', at));
  };
  for (const name of ['write', 'reloadDiscarding', 'remove']) {
    assert.match(body(name), /^const \w+ = async \([^)]*\) => \{\s*if \(rowUploads > 0\) return;/, `${name} ต้องออกก่อนทำอะไรทั้งสิ้น`);
  }
  assert.match(page, /const \[rowUploads, setRowUploads\] = useState\(0\);/);
  assert.match(page, /useUnsavedChanges\(dirty \|\| captionDirty \|\| rowUploads > 0\);/);
  assert.match(page, /busy=\{Boolean\(busy\) \|\| rowUploads > 0\}/);
  assert.match(page, /uploading: rowUploads > 0,/);
  assert.match(page, /onRowUpload=\{trackRowUpload\}/);
});

test('หน้าสเปค: กำลังสร้าง/บันทึก/ลบ = เริ่มแนบรูปของแถวไม่ได้ (ทิศกลับของด่าน rowUploads) · เหตุขึ้นที่ title ของปุ่ม', () => {
  // ผลบันทึกที่กลับมาสร้างร่างใหม่ทั้งก้อน ⇒ รูปที่ขึ้นคร่อมการบันทึกไม่มีแถวให้ลง แล้วไฟล์ค้างโดยไม่มีใครชี้
  const formTag = page.slice(page.indexOf('<ProductSpecForm'), page.indexOf('/>', page.indexOf('<ProductSpecForm')));
  assert.match(formTag, /\bsaving=\{Boolean\(busy\)\}/, 'ทุกค่าของ busy (create · save · delete) ไม่ใช่เฉพาะ "save"');
  assert.match(form, /\breadOnly = false,\s*saving = false,/);
  assert.match(form, /const canAttachItemImage = !readOnly && !saving && Boolean\(permissions\?\.canAttachItemImage\);/);
  assert.match(form, /const SPEC_ITEM_IMAGE_SAVING = "กำลังบันทึก — รอสักครู่แล้วแนบรูปอีกครั้ง";/);
  assert.match(form, /const imageBlockedReason = saving \? SPEC_ITEM_IMAGE_SAVING : \(specExists \? "" : SPEC_ITEM_IMAGE_NEEDS_SPEC\);/);
  assert.match(form, /canAttach=\{canAttachItemImage\}\s*blockedReason=\{imageBlockedReason\}/);
  // ธงเดียวปิดครบสามทางเข้า (ปุ่ม · ลากวาง · วาง): กล่องส่ง !canAttach ให้ทั้ง attach() และ disabled ของ hook
  assert.match(cell, /if \(!file \|\| busy \|\| readOnly \|\| !canAttach\) return;/);
  // ราคาทุนไม่ผูกกับ saving — พิมพ์ระหว่างบันทึกเป็นพฤติกรรมเดิมของทุกช่อง
  assert.doesNotMatch(form, /canEditItemCost = [^;]*saving/);
});

test('หน้าสเปค: ส่งสิทธิ์ราคาทุนให้ก้อนบันทึก · ตัวตั้งแถวรับตัวแก้ · ผลแนบรูปของแถวที่หายไปไม่ปักของค้าง', () => {
  assert.match(page, /specSaveBody\(\s*\{ \.\.\.draft, expectedUpdatedAt: kind === "create" \? null : spec\?\.updatedAt \},\s*\{ canEditItemCost: permissions\.canEditItemCost \},\s*\)/);
  assert.match(page, /items: withRowUids\(typeof next === "function" \? next\(prev\.items\) : next\)/);
  const patch = page.slice(page.indexOf('const patchItem = (uid, patch) => {'), page.indexOf('const setCerts'));
  assert.match(patch, /if \(!itemsRef\.current\.some\(\(row\) => row\._uid === uid\)\) return;/);
  assert.match(patch, /if \(!prev\.items\.some\(\(row\) => row\._uid === uid\)\) return prev;/);
  assert.ok(patch.indexOf('return;') < patch.indexOf('mark();'), 'ไม่พบแถว = ออกก่อน mark()');
  for (const prop of ['permissions={permissions}', 'productId={id}', 'specExists={Boolean(spec)}', 'onItemPatch={patchItem}']) {
    assert.ok(page.includes(prop), `ProductSpecForm ต้องได้ ${prop}`);
  }
  assert.doesNotMatch(page, /\bfetch\(/);
});

test('จอเอกสาร FM-SA-04 ไม่มีราคาทุน/รูปของแถว — เปลี่ยนแค่ชื่อหัวการ์ด', () => {
  assert.doesNotMatch(docContent, /ราคาทุน|costPrice|imageAttachmentId|SpecItemImageCell/);
  assert.match(docContent, /title=\{`\$\{PRODUCT_SPEC_CHECKLIST_TITLE\} \(\$\{summary\.items\.length\}\)`\}/);
  assert.doesNotMatch(docContent, /Checklist บรรจุภัณฑ์/);
});
