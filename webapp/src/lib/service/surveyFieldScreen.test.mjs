// ── จอหน้างานแบบ A: รายการ ↔ หน้าพื้นที่ · สองบาน (แผน §10.5 S7) — ยามอ่านซอร์สจอ ─────────────────────────
//
// ⭐ เทสต์ชุดนี้รันใต้ Node ล้วน (เรนเดอร์ JSX ไม่ได้) ⇒ ตรรกะทั้งหมดอยู่ในตัวตัดสินที่มีเทสต์ของมันเอง
//   (surveyFieldView · surveyZoneRoute · surveyZoneRouteRunner) · ที่นี่ตรึงแค่ "จอเรียกอะไร/ประกาศอะไร" ซึ่งพังเงียบได้:
//   แถวที่กลายเป็นลิงก์ (ค่าค้างหายโดยไม่ถาม) · ท้ายหน้าที่ลืมหลบแป้นพิมพ์ · หน้าเต็มจอที่ประกาศผิดจังหวะ · ช่องวัดที่ iOS ซูม
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const css = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '');
// แท็กเปิดของ JSX ทั้งแท็ก — นับวงเล็บปีกกา เพราะ `=>` / `>` ในค่า prop ไม่ใช่จุดปิดแท็ก
const jsxOpenTags = (src, start) => [...src.matchAll(start)].map((m) => {
  let depth = 0;
  for (let i = m.index + 1; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') depth -= 1;
    else if (src[i] === '>' && depth === 0) return src.slice(m.index, i + 1);
  }
  return src.slice(m.index);
});

const PAGE = code(read('../../app/service/surveys/[id]/page.js'));
const LIST = code(read('../../components/service/SurveyZoneList.js'));
const PAGER = code(read('../../components/service/SurveyZonePager.js'));
const ZONE = code(read('../../components/service/SurveyZonePage.js'));
const WORKSPACE = code(read('../../components/service/SurveyFieldWorkspace.js'));
const ROUTE = code(read('../../components/service/useSurveyZoneRoute.js'));

test('🔴 แถวพื้นที่ · จุด · ‹ › · "ถัดไป" เป็นปุ่ม ไม่ใช่ลิงก์ — ลิงก์ที่ search ต่างกันโหลดหน้าใหม่ทั้งหน้า (ค่าค้างหายไม่ถาม)', () => {
  for (const [name, src] of [['SurveyZoneList', LIST], ['SurveyZonePager', PAGER], ['SurveyZonePage', ZONE]]) {
    assert.doesNotMatch(src, /<a\s|<Link\b|from "next\/link"/, `${name} ต้องไม่มีลิงก์ในหน้า`);
  }
  assert.match(LIST, /<button\s+type="button"\s+id=\{surveyZoneRowId\(row\.id\)\}/, 'แถวทั้งแถวเป็นปุ่มเดียว');
  assert.match(LIST, /aria-current=\{split && row\.selected \? "true" : undefined\}/, 'สองบาน: แถวที่บานขวาเปิดอยู่');
  assert.match(ZONE, /className=\{styles\.nextBtn\}/);
});

test('หน้าพื้นที่: ท้ายหน้าหลบแป้นพิมพ์บนจอ · ช่องวัดเป็นช่องข้อความ + แป้นทศนิยม · แผ่นรูปนับชุดที่กำลังส่ง', () => {
  assert.match(ZONE, /<footer\s+className=\{styles\.foot\} data-osk-hide="" data-toast-avoid=""/,
    '🐞 review 26/09: toast "บันทึกแล้ว" ทับปุ่ม "ถัดไป" — ท้ายหน้ายก toast ขึ้นพ้นตัวเอง');
  assert.match(ZONE, /type="text" inputMode="decimal" enterKeyHint="next"/,
    '"7,5" ต้องพิมพ์ได้ (type="number" ทิ้งค่าเงียบ) · Enter = ช่องถัดไป');
  assert.match(ZONE, /surveyNextDimField\(parts, partId, field\)/);
  assert.match(ZONE, /photoCapture photoTiles/);
  assert.match(ZONE, /onBusyChange=\{handleBusy\}/, 'ยิงจากลูปอัปของแผง — ยังยิงแม้หน้านี้ถูกถอดกลางการอัป');
  assert.match(ZONE, /onUploadBusy\?\.\(isBusy\)/);
  assert.doesNotMatch(ZONE, /<CollapsibleCard|onToggle|foldDefaults/, 'หน้าพื้นที่ไม่พับ (แบบที่ถูกตีกลับ 16/09)');
});

test('ช่องวัด 18px สูง 52px — ใหญ่กว่าช่องหน้างานอื่นอีกขั้น (iOS ซูมทั้งหน้าเมื่อช่องต่ำกว่า 16px)', () => {
  const zoneCss = css('../../components/service/SurveyZonePage.module.css');
  const rule = zoneCss.slice(zoneCss.indexOf('.dim .dimInput {'), zoneCss.indexOf('}', zoneCss.indexOf('.dim .dimInput {')));
  assert.match(rule, /font-size: var\(--fs-11\)/);
  assert.match(rule, /height: calc\(var\(--ctl-h-touch\) \+ var\(--space-2\)\)/);
});

test('🐞 ทุกช่องพิมพ์ของจอหน้างาน ≥16px (`touch`) — UAT 25/09: ช่อง 14px ทำให้ iOS ซูมทุกช่องที่ช่างแตะ', () => {
  const globals = css('../../app/globals.css');
  assert.match(globals, /\.premium-input\.touch \{\s*font-size: var\(--fs-10\);/);
  assert.match(globals, /input\.premium-input\.touch \{\s*height: var\(--ctl-h-touch\);/);
  assert.match(code(read('../../components/ui/Input.js')), /touch \? "touch" : null/);
  assert.match(code(read('../../components/ui/ReasonDialog.js')), /touch=\{touch\}/);
  const sources = {
    SurveyZonePage: ZONE,
    SurveySubmitDialog: code(read('../../components/service/SurveySubmitDialog.js')),
    SurveySendBackCard: code(read('../../components/service/SurveySendBackCard.js')),
    SurveyResultTable: code(read('../../components/service/SurveyResultTable.js')),
    page: PAGE,
  };
  for (const [name, src] of Object.entries(sources)) {
    // ทุก <Input>/<Textarea>/<ReasonDialog> ต้องมี touch · ยกเว้นช่องที่มีคลาส 16px+ ของตัวเอง (ช่องวัด · ช่องจุด)
    const tags = jsxOpenTags(src, /<(Input|Textarea|ReasonDialog)\b/g);
    assert.ok(tags.length, `${name} ต้องมีช่องให้ตรวจ`);
    for (const tag of tags) {
      if (/className=\{styles\.(dimInput|spotInput)\}/.test(tag)) continue;
      assert.match(tag, /\btouch\b/, `${name}: ${tag.slice(0, 80)}…`);
    }
  }
});

test('หน้าเต็มจอประกาศเฉพาะโหมดหน้า + เปิดพื้นที่อยู่ · ซ่อนด้วย hidden (ไม่ถอด — รายการกลับมาที่ตำแหน่งเดิม)', () => {
  assert.match(WORKSPACE, /data-immersive-page=\{pages && zoneOpen \? "" : undefined\}/);
  assert.match(WORKSPACE, /hidden=\{pages && zoneOpen\}/);
  assert.match(WORKSPACE, /hidden=\{pages && !zoneOpen\}/);
  const wsCss = css('../../components/service/SurveyFieldWorkspace.module.css');
  assert.match(wsCss, /\.listCol\[hidden\],\s*\.zonePane\[hidden\] \{\s*display: none;/,
    'คลาสของบานมี display ของตัวเอง — ต้องประกาศทับให้ hidden ทำงาน');
  assert.match(wsCss, /grid-template-columns: 320px minmax\(0, 1fr\)/);
});

test('หน้า: เส้นจอ 1000/1200 จากตัวตัดสิน · แป้นพิมพ์เรียกที่เดียว · ย้าย/ย้อน/สลับแท็บผ่านตัวต่อสายประวัติ', () => {
  assert.match(PAGE, /useMediaQuery\(SURVEY_SPLIT_QUERY\)/);
  assert.match(PAGE, /useMediaQuery\(SURVEY_RAIL_QUERY\)/);
  assert.equal((PAGE.match(/useOnScreenKeyboard\(\)/g) || []).length, 1, 'ธงแป้นอยู่ที่ <html> — เรียกซ้อนแล้วตัวหนึ่งถอดธงของอีกตัว');
  assert.match(PAGE, /const goTab = route\.goTab;/, 'สลับแท็บตอนมีค่าค้างต้องถามก่อน');
  assert.match(PAGE, /onChange=\{goTab\}/);
  assert.match(PAGE, /onOpen=\{route\.open\}/);
  assert.match(PAGE, /onList=\{split \? undefined : route\.toList\}/, 'สองบานไม่มีหน้ารายการให้กลับ');
  assert.match(PAGE, /key=\{`\$\{shownZone\.id\}:\$\{draftEpoch\}`\}/, 'ทิ้งร่าง = เปลี่ยน key · หมุนจอไม่เปลี่ยน');
  assert.match(PAGE, /onUploadBusy=\{handleUploadBusy\}/);
  assert.match(PAGE, /if \(was > 0 && uploadsBusy === 0\) load\(\{ background: true \}\)/,
    'รูปชุดสุดท้ายขึ้นเสร็จ = อ่านใบใหม่ (พื้นที่ที่ออกไประหว่างส่ง ตัวนับต้องขยับ)');
  assert.doesNotMatch(PAGE, /nextGapZone|toggleAllZones|collapsibleBodyId/, 'ของลิสต์การ์ดพับได้ต้องไม่เหลือ');
});

test('ตัวต่อสายประวัติ: เขียนด้วย history ของเบราว์เซอร์ (Next หุ้มให้) · ไม่ใช่ router.push · ไม่แตะรายการของ path อื่น', () => {
  assert.doesNotMatch(ROUTE, /router\.(push|replace)|useRouter/);
  assert.match(ROUTE, /window\.history\.pushState\(data, "", url\)/);
  assert.match(ROUTE, /window\.location\.pathname !== surveySheetHref\(latest\.current\.requestId\)/);
  assert.match(ROUTE, /createSurveyZoneRouteRunner\(/, 'ลำดับการทำตามอยู่ที่ตัวทำที่มีเทสต์ ไม่ใช่เขียนซ้ำใน hook');
});

test('กล่อง "ทิ้งค่าที่ยังไม่บันทึก?" ใช้คำจากตัวตัดสิน · ปุ่มยืนยันโทนอันตราย (ปุ่มกลับไปบันทึกเป็นโฟกัสตั้งต้น)', () => {
  const ask = PAGE.slice(PAGE.indexOf('const askDiscard'), PAGE.indexOf('const resetDraft'));
  assert.match(ask, /surveyDiscardConfirm\(/);
  assert.match(ask, /confirmAction\(\{/);
  assert.match(ask, /tone: "danger"/);
});

/* ══ ชุด S8 — แถบของช่าง · กล่องส่งงานแบบ A · แถวทางออก · การ์ดส่งกลับ (แผน §10.5 S8) ═══════════════════════ */
const BAR = code(read('../../components/service/SurveyFieldBar.js'));
const SUBMIT = code(read('../../components/service/SurveySubmitDialog.js'));
const SEND_BACK = code(read('../../components/service/SurveySendBackCard.js'));

test('แถบของช่าง: วาดจากตัวตัดสินอย่างเดียว · หลบแป้นพิมพ์บนจอ · ส่งงานไม่ติดด่าน (กล่องบอกรายพื้นที่) · ปุ่มอื่นติดด่านแบบระบบ', () => {
  assert.match(BAR, /data-osk-hide=""/, 'แถบที่ค้างเหนือแป้นบีบช่องที่กำลังพิมพ์ (บทเรียน 16/09)');
  assert.doesNotMatch(BAR, /isClosedVisit|visit\.status|progress\?\.|sendBack\?\./, 'กติกาของแถบอยู่ที่ surveyFieldBarView');
  assert.match(BAR, /<GatedAction/);
  assert.match(BAR, /blocker=\{action\.gated \? action\.blocker \|\| "" : ""\}/);
  assert.match(BAR, /tone=\{primary \? "primary" : "neutral"\}/, 'ปุ่มกรมท่าปุ่มเดียวต่อจอ — ตัวตัดสินเลือกให้');
  assert.match(PAGE, /const fieldBarView = showFieldBar \? surveyFieldBarView\(\{/);
  assert.match(PAGE, /layout=\{split \? "pane" : "page"\}/);
  const barCss = css('../../components/service/SurveyFieldBar.module.css');
  assert.match(barCss, /\.bar\[data-layout="page"\] \{[^}]*margin-inline: calc\(-1 \* var\(--page-gutter-tablet\)\);/,
    'หน้าเดียว: แถบชนขอบจอ (ถอยเท่าระยะขอบของ .page พอดี — ไม่ล้นแนวนอน)');
  assert.match(barCss, /\.bar:not\(\[data-sticky\]\) \{ position: static;/, 'ส่งงานแล้ว = บอกผล ไม่ติดขอบ');
});

test('นับถอยหลังของแถบเดินทีละนาทีจากนาฬิกาไทย (ตัวตัดสินไม่อ่านนาฬิกาเอง)', () => {
  const clock = code(read('../../components/service/useSurveyClock.js'));
  assert.match(clock, /surveyNowKey\(new Date\(\)\.toISOString\(\)\)/);
  assert.match(clock, /setTimeout\(tick, MINUTE_MS - \(Date\.now\(\) % MINUTE_MS\)\)/, 'เดินตรงขอบนาที');
  assert.match(clock, /clearTimeout\(timer\)/);
  assert.equal((PAGE.match(/useSurveyClock\(\)/g) || []).length, 1, 'แถบกับกล่องส่งงานอ่านนาฬิกาตัวเดียว');
  assert.match(PAGE, /nowKey=\{nowKey\}/);
});

test('กล่องส่งงาน: เปลือกเดียวกับโมดัลจัดคิว · ผลของการเข้าไม่มีค่าตั้งต้น · ทุกคำ/ด่านจากตัวตัดสิน', () => {
  assert.match(SUBMIT, /import ScheduleModalShell from "\.\/ScheduleModalShell";/);
  assert.equal((SUBMIT.match(/<ScheduleModalShell\b/g) || []).length, 1);
  assert.match(SUBMIT, /layout="split"/);
  assert.match(SUBMIT, /useState\(initialOutcome \?\? null\)/, '🐞 เดิมเลือก "เข้าพื้นที่ได้" ไว้ให้ (pain B12)');
  assert.match(SUBMIT, /setOutcome\(initialOutcome \?\? null\)/, 'เปิดใหม่ทุกครั้ง = ล้างผลที่เลือกค้าง (#1690)');
  assert.match(SUBMIT, /<OptionTiles/);
  assert.doesNotMatch(SUBMIT, /ChoiceChips|surveyFieldSubmitError|surveyFieldMissing/, 'ด่าน/ของขาดมาจาก surveySubmitView');
  assert.match(SUBMIT, /surveySubmitView\(\{/);
  assert.match(SUBMIT, /blocker: view\.blocker,/, 'ปุ่มหลักติดด่านแบบระบบ (กดได้ แล้วบอกเหตุ)');
  assert.match(SUBMIT, /outcome=\{view\.outcome\}/);
  assert.doesNotMatch(SUBMIT, /from "@\/components\/Modal"|tone="primary"|style=\{\{/, 'เปลือกเป็นคนวาด Modal และปุ่มหลัก');
  // เปิดจากแถว "ไปแล้วเข้าไม่ได้" เท่านั้นที่เลือกไว้ให้
  assert.match(PAGE, /initialOutcome=\{submitInitial\}/);
  assert.match(PAGE, /onEscape=\{canReportUnable \? \(\) => openSubmit\("unable"\) : undefined\}/);
  assert.match(PAGE, /setSubmitInitial\(initial === "unable" && canReportUnable \? "unable" : null\)/);
});

test('แถว "ไปแล้วเข้าไม่ได้" อยู่ใต้รายการ (ไม่ซ่อนในกล่องส่งงาน) · ด่านจากตัวตัดสิน', () => {
  assert.match(LIST, /escape\?\.show && onEscape/);
  assert.match(LIST, /tone="danger" variant="outline"/);
  assert.match(PAGE, /const escape = surveyEscapeView\(\{/);
  assert.match(PAGE, /escape=\{escape\}/);
});

test('การ์ดส่งกลับ (A-5): ช่องติ๊กจริง · ปุ่มพาไปเป็นพี่น้อง ไม่ซ้อนในป้าย · แจ้งแก้แล้วยิงจากแถบพร้อมข้อที่ติ๊ก · ไม่มีกล่องยืนยันซ้ำ', () => {
  assert.match(SEND_BACK, /type="checkbox"/);
  const label = SEND_BACK.slice(SEND_BACK.indexOf('<label className={styles.askMain}>'), SEND_BACK.indexOf('</label>'));
  assert.doesNotMatch(label, /<button/, 'ปุ่มในป้ายของช่องติ๊ก = กดพาไปแล้วติ๊กไปด้วย');
  assert.match(SEND_BACK, /<button type="button" className=\{styles\.go\} aria-label=\{item\.goAria\}/);
  assert.match(SEND_BACK, /maxLength=\{NOTE_MAX\}/);
  assert.match(SEND_BACK, /const NOTE_MAX = 300;/, 'เพดานเดียวกับ route send-back-done');
  assert.match(PAGE, /json: \{ note: fixedNote\.trim\(\), doneItems, sendBackId: sentBackId \}/, 'บอกรอบที่ติ๊ก — รอบใหม่ = 409');
  assert.match(PAGE, /if \(e\.status === 409\) await load\(\{ background: true \}\);/, 'ชนรอบใหม่ = ดึงใบใหม่ให้เห็นข้อของรอบใหม่');
  assert.match(PAGE, /reportFixed\(sendBackView\?\.doneItems \?\? \[\]\)/);
  assert.match(PAGE, /surveySendBackItemsView\(\{/);
  assert.doesNotMatch(PAGE, /reportingFixed|title="แจ้งหัวหน้าว่าแก้แล้ว"/, 'กล่องยืนยันเดิมถามซ้ำเรื่องที่การ์ดบอกแล้ว');
  assert.match(PAGE, /const sendBackTicks = fixedTicks\.id === sentBackId \? fixedTicks\.items : \[\];/,
    'ติ๊กผูกกับรอบที่ส่งกลับ — รอบใหม่ไม่รับติ๊กของรอบเก่า');
});

/* ══ ชุด S9 — หัวงาน · เปลือกของใบ · รางของหัวหน้า ≥1200 · ช่างไม่มีแท็บ/การ์ด (แผน §10.5 S9) ═══════════════════════ */
const SHEET = code(read('../../components/service/SurveySheetLayout.js'));
const HEADER = code(read('../../components/service/SurveyJobHeader.js'));
const ABOUT = code(read('../../components/service/SurveyAboutRequest.js'));

test('หน้าใช้เปลือก SurveySheetLayout ทั้งสองแท็บ — หัวใบ/รางของบ้าน (DetailOverview · DetailPageLayout) ถอดแล้ว', () => {
  assert.doesNotMatch(PAGE, /DetailOverview|DetailPageLayout|DetailStateBadge/,
    'รางของ DetailPageLayout ปักที่ 1051 — คนละเส้นกับสองบาน (1000) และราง (1200) ของจอนี้');
  assert.equal((PAGE.match(/<SurveySheetLayout\b/g) || []).length, 1, 'เปลือกเดียวทั้งสองแท็บ (สลับแท็บไม่สร้างหัวงานใหม่)');
  assert.match(PAGE, /header=\{<SurveyJobHeader view=\{headerView\} layout=\{split \? "band" : "card"\} \/>\}/);
  assert.match(PAGE, /const headerView = surveyJobHeaderView\(\{/);
  assert.match(PAGE, /immersive=\{immersive\}/, 'หน้าพื้นที่เต็มจอ: หัวงาน/แท็บหลบ');
});

test('รางของหัวหน้า ≥1200 เท่านั้น · ต่ำกว่านั้นการ์ดอยู่ในบานรายการ (หน้างาน) หรือไหลตามหน้า (สรุป) · ช่างไม่มีแท็บ ไม่มีการ์ด', () => {
  assert.match(PAGE, /const rail = railWide && canDecide;/);
  assert.match(PAGE, /rail=\{rail \? controlCard : null\}/);
  assert.match(PAGE, /const cardInList = tab === "field" && canDecide && !railWide;/);
  assert.match(PAGE, /const cardInFlow = tab === "result" && canDecide && !railWide;/);
  assert.match(PAGE, /tabs=\{canDecide \? \(/, 'แท็บเป็นของคนเคาะ (ม็อก A-1 · AT-1 · AW-1 ไม่มีแท็บให้ช่าง)');
  assert.match(PAGE, /onChange=\{goTab\}/);
  assert.match(PAGE, /tabsNote=\{canDecide \? surveySheetTotalsText\(\{ zones, filesByZone \}\) : null\}/);
  assert.match(PAGE, /inPane=\{split\}/, 'การ์ดในบาน 320px ไม่แบ่งสองคอลัมน์ตามเส้นจอของการ์ดกลาง');
  assert.match(PAGE, /oneColumn=\{rail \|\| \(split && !railWide\)\}/,
    'ข้างรางที่ 1200 บานเหลือ ~460px · 🐞 สองบาน 1024 บานเหลือ ~630px — สองคอลัมน์ได้ช่องวัดที่ "12.5" ถูกตัด');
  assert.match(ZONE, /data-cols=\{oneColumn \? "1" : undefined\}/);
  const zoneCss = css('../../components/service/SurveyZonePage.module.css');
  assert.match(zoneCss, /\.page\[data-cols="1"\] \.body \{\s*grid-template-columns: minmax\(0, 1fr\);\s*grid-template-areas: none;/);
  const sheetCss = css('../../components/service/SurveySheetLayout.module.css');
  assert.match(sheetCss, /grid-template-columns: minmax\(0, 1fr\) 330px;/);
  assert.match(sheetCss, /\.rail \{[^}]*position: sticky;[^}]*max-height: var\(--pinned-box-max\);/);
  assert.deepEqual((sheetCss.match(/@media[^{]*/g) || []).map((m) => m.trim()), ['@media (max-width: 680px)'],
    'เส้นจอของรางเป็นของ JS (SURVEY_RAIL_QUERY) ที่เดียว — @media ตัวเดียวคือบรรทัดรวมบนมือถือ');
  const phone = sheetCss.slice(sheetCss.indexOf('@media (max-width: 680px)'), sheetCss.indexOf('.sheet[data-rail] {'));
  assert.doesNotMatch(phone, /rail/, 'ในมีเดียของมือถือไม่มีกฎของราง');
  assert.match(SHEET, /data-rail=\{rail \? "" : undefined\}/);
});

test('ช่าง: กล่องแจ้งบนสุดของรายการแทนการ์ด · ไม่มีจอสรุปส่งผล (มติ 26/09) · คนดูอย่างเดียวไปสรุปจาก "เกี่ยวกับคำร้อง" แล้วกลับด้วย "← หน้างาน"', () => {
  assert.match(PAGE, /const sheetNotices = canDecide \? \[\] : surveySheetNotices\(view\);/,
    'หัวหน้าเห็นเรื่องเดียวกันในการ์ดแล้ว — ไม่วาดซ้ำ');
  assert.match(PAGE, /<StatusNotice key=\{notice\.key\} tone=\{notice\.tone\}/);
  assert.match(PAGE, /onResult=\{canDecide \? undefined : \(\) => goTab\("result"\)\}/);
  assert.match(PAGE, /canWrite: view\.flags\.canWrite, canOpenRequest/, 'ตัวตัดสินแถวสรุปรู้ว่าใครคือช่าง');
  assert.match(PAGE, /const crewOnly = !!data && view\.flags\.canWrite && !canDecide;/);
  assert.match(PAGE, /if \(crewOnly && tab === "result"\) applyTab\("field"\);/, 'ลิงก์เก่า ?tab=result ของช่างพากลับหน้างาน');
  assert.match(PAGE, /\{tab === "result" && !crewOnly \? resultMain : fieldMain\}/);
  assert.match(PAGE, /if \(tab === "result" && !crewOnly\) router\.replace/);
  assert.match(PAGE, /onClick=\{\(\) => goTab\("field"\)\}/);
  assert.match(ABOUT, /\{link \? \(/, 'แถวลิงก์ขึ้นตามตัวตัดสิน (canOpenRequest ของ server) — ไม่มีสิทธิ์ = ไม่มีแถว');
  assert.match(ABOUT, /aria-expanded=\{open\} aria-controls=\{bodyId\}/, 'รายละเอียดคำร้องกางในที่ (ช่างเปิดหน้าคำร้องไม่ได้)');
  assert.doesNotMatch(ABOUT, /\?tab=result/, 'สลับแท็บต้องผ่านตัวต่อสายประวัติ (ถามก่อนทิ้งค่าค้าง)');
});

test('แถวย้อน: h1 = รหัสคำร้อง + ป้ายนัดจากตัวตัดสิน · หัวงาน: ปุ่มโทร/นำทางเป็นปุ่มจริง · ปุ่มกางที่อยู่ขึ้นเมื่อถูกตัดจริง', () => {
  assert.match(PAGE, /<h1 className=\{styles\.docNo\}>/);
  assert.match(PAGE, /<StatusBadge tone=\{visitBadge\.tone\} dot/);
  assert.match(HEADER, /<Button as="a" href=\{call\.href\}/);
  assert.match(HEADER, /as="a" href=\{nav\.href\} target="_blank" rel="noopener noreferrer"/,
    'แผนที่เปิดแท็บใหม่ — ใบนี้กับค่าที่พิมพ์ค้างอยู่ที่เดิม');
  assert.match(HEADER, /new ResizeObserver\(measure\)/);
  assert.match(HEADER, /const showToggle = !!address && \(clipped \|\| open\);/, 'ปุ่มที่กดแล้วไม่มีอะไรกางคือปุ่มที่โกหก');
  assert.doesNotMatch(HEADER, /isClosedVisit|accessConflict|visit\.status/, 'กติกาของหัวงานอยู่ที่ surveyJobHeaderView');
  const headerCss = css('../../components/service/SurveyJobHeader.module.css');
  assert.match(headerCss, /\.act \{[^}]*min-height: var\(--ctl-h-touch\);/);
  assert.match(headerCss, /\.toggle \{[^}]*width: var\(--ctl-h-touch\);[^}]*height: var\(--ctl-h-touch\);/);
  assert.match(headerCss, /\.address \{[^}]*white-space: nowrap;[^}]*text-overflow: ellipsis;/, 'ที่อยู่บรรทัดเดียว (มติเจ้าของข้อ 4)');
});

test('🐞 ตัดบรรทัดไทย (UAT 25/09): จุดคั่นเวลาจริงติดท้ายค่านัด · ชื่อปุ่มในคำพูดบนแถบไม่ขาดกลาง', () => {
  const header = code(read('../../components/service/SurveyJobHeader.js'));
  assert.match(header, /\{"\\u00a0· "\}<span className=\{styles\.stamp\}>\{fact\.sub\}<\/span>/,
    'บรรทัดใหม่ต้องไม่ขึ้นต้นด้วย "·" — กติกาเดียวกับแถวทีม');
  assert.doesNotMatch(header, /`· \$\{fact\.sub\}`/);
  const bar = code(read('../../components/service/SurveyFieldBar.js'));
  assert.match(bar, /<KeepQuoted text=\{view\.sub\} \/>/);
  assert.match(bar, /split\(\/\(“\[\^”\]\*”\)\/\)/);
  assert.match(css('../../components/service/SurveyFieldBar.module.css'), /\.keep \{ white-space: nowrap; \}/);
});

test('🐞 จุดบนตัวเลื่อนเป็นตัวบอก (role="img") ไม่ใช่ปุ่ม · ✓ = วัดแล้ว · ที่ไม่พอเปลี่ยนเป็น "n / t" ไม่บีบจุด (UAT 25/09)', () => {
  assert.doesNotMatch(PAGER, /className=\{styles\.dot\}[^>]*onClick/, 'จุดกดไม่ได้ — ย้ายด้วย ‹ › หรือรายการ');
  assert.match(PAGER, /<span className=\{styles\.indicator\} role="img" aria-label=\{nav\.ariaLabel \|\| undefined\}>/);
  assert.match(PAGER, /dot\.state === "done" \? <Check /);
  assert.match(PAGER, /data-n=\{nav\.dots\.length\}/);
  const pagerCss = css('../../components/service/SurveyZonePager.module.css');
  assert.doesNotMatch(pagerCss, /min-width: 10px|flex: 0 1 16px/, 'จุดห้ามหด');
  assert.doesNotMatch(pagerCss, /outline-offset: 1px/, 'วงของจุดปัจจุบันเป็น inset ไม่ล้นไปทับจุดข้าง ๆ');
  for (let n = 2; n <= 8; n += 1) {
    assert.match(pagerCss, new RegExp(`@container zsteps \\(max-width: ${89 + 16 * n}px\\) \\{ \\.dots\\[data-n="${n}"\\] \\{ display: none; \\}`));
  }
});

test('🐞 พื้นที่ที่ยังไม่มีรหัสในทะเบียนขึ้น "—" ไม่ใช่ช่องว่าง (กติกาค่าว่างทั้งระบบ · UAT 25/09)', () => {
  const dialog = code(read('../../components/service/SurveySubmitDialog.js'));
  for (const src of [LIST, dialog]) {
    assert.match(src, /row\.codeUnknown \? SURVEY_UNKNOWN_TEXT : naText\(row\.code\)/);
    assert.doesNotMatch(src, /row\.code \|\| ""/);
  }
});

test('🐞 แถบงานของช่างเป็นพี่น้องของกล่องเลื่อนรายการ ไม่ใช่ลูก — สองบานเห็นปุ่มตั้งแต่เปิดหน้า · หน้าเดียวแถบ/ท้ายหน้าชิดล่าง (UAT 25/09)', () => {
  assert.match(WORKSPACE, /<div className=\{styles\.listPane\}>\s*\{list\}\s*<\/div>\s*\{bar\}/,
    'แถบอยู่นอกกล่องเลื่อน — sticky ของมันอ้างจอ ไม่ใช่กล่องที่เริ่มใต้หัวงาน');
  assert.match(WORKSPACE, /querySelector\(":scope > \[data-survey-bar\]"\)/);
  assert.match(code(read('../../components/service/SurveyFieldBar.js')), /data-survey-bar=""/);
  const wsCss = css('../../components/service/SurveyFieldWorkspace.module.css');
  // ยืดคอลัมน์เฉพาะตอนมีแถบที่ติดขอบ (🐞 review 26/09: "ส่งงานแล้ว" ถูกดันห่างรายการ · คนไม่มีแถบได้ที่ว่างเลื่อนเปล่า)
  assert.doesNotMatch(wsCss, /^\.listCol \{[^}]*min-height/m);
  assert.match(wsCss, /\.listCol:has\(> \[data-survey-bar\]\[data-sticky\]\),\s*\.barColumn:has\(> \[data-survey-bar\]\[data-sticky\]\) \{\s*min-height: calc\(100dvh - var\(--scroll-anchor-top\) - var\(--mobile-nav-h, 0px\)\);/);
  assert.match(wsCss, /\.listCol > \[data-survey-bar\]\[data-sticky\],\s*\.barColumn > \[data-survey-bar\]\[data-sticky\] \{ margin-top: auto; \}/);
  assert.match(PAGE, /const resultMain = \(\s*<SurveyBarColumn>/, 'แท็บสรุปส่งผลใช้กติกาแถบชิดล่างชุดเดียวกัน');
  assert.match(code(read('../../components/service/SurveySheetLayout.js')), /data-header-last=\{last \? "" : undefined\}/);
  assert.match(css('../../components/service/SurveySheetLayout.module.css'), /\.sheet\[data-header-last\] > \.head \{ margin-bottom: var\(--space-6\); \}/);
  assert.match(wsCss, /\.workspace\[data-layout="split"\] \.listCol \{\s*align-self: stretch;/);
  assert.match(wsCss, /max-height: calc\(var\(--pinned-box-max\) - var\(--survey-bar-h\) - var\(--space-4\)\);/);
  const zoneCss = css('../../components/service/SurveyZonePage.module.css');
  assert.match(zoneCss, /\.page\[data-layout="page"\] \{ min-height: 100dvh; \}/);
  assert.match(zoneCss, /\.foot \{[^}]*margin-top: auto;/);
});

test('🐞 ท้ายหน้าพื้นที่กันช่องที่โฟกัสไม่ให้จมใต้ตัวเอง (WCAG 2.4.11) · กันเฉพาะของที่อยู่บนจอ · แป้นขึ้น = ไม่กัน', () => {
  const zoneCss = css('../../components/service/SurveyZonePage.module.css');
  assert.match(zoneCss, /:global\(html\):not\(\[data-osk="up"\]\):has\(\.foot:not\(\[hidden\] \*\)\) \{\s*scroll-padding-bottom:/);
  assert.match(zoneCss, /\.foot :is\(button, a\) \{\s*scroll-margin-bottom: calc\(-1 \*/);
  const barCss = css('../../components/service/SurveyFieldBar.module.css');
  assert.match(barCss, /:has\(\.bar\[data-sticky\]:not\(\[hidden\] \*\)\)/, 'แถบในรายการที่ถูกซ่อน (หน้าเต็มจอ) ต้องไม่กันท้ายหน้า');
});

test('🐞 ปุ่มท้ายหน้าที่ยังกดไม่ได้อ่านออก (พื้นเทาทึบ ไม่จางซ้อน) · ปุ่มทางออกของแถบ "ถูกแก้จากที่อื่น" สูง 44px (UAT 25/09)', () => {
  const zoneCss = css('../../components/service/SurveyZonePage.module.css');
  assert.match(zoneCss, /\.foot \.saveBtn:disabled,\s*\.foot \.nextBtn:disabled \{\s*opacity: 1;/);
  assert.doesNotMatch(zoneCss, /\.btnText small \{[^}]*opacity/);
  assert.match(ZONE, /<Button variant="outline" className=\{styles\.touchBtn\} onClick=\{\(\) => adoptRow\(zoneRef\.current\)\}>/);
});

test('🐞 กรมท่าปุ่มเดียวต่อจอ: ปุ่มส่งผลของการ์ดที่ติดด่านเป็นหน้าตาติดด่าน · แถบรู้ว่าการ์ดเป็นปุ่มหลัก (UAT 25/09)', () => {
  const card = code(read('../../components/service/SurveyControlCard.js'));
  assert.match(card, /<DocumentControlCard\s+className=\{styles\.card\}/);
  assert.match(css('../../components/service/SurveyControlCard.module.css'),
    /\.card :global\(\.btn-primary\[aria-disabled="true"\]\) \{\s*opacity: 1;/);
  assert.match(PAGE, /cardPrimary: canDecide && view\.send\.show && view\.send\.allowed,/);
});

test('🐞 ช่องภาพผังของหัวหน้าใช้แผ่นรูป (photoTiles) — ไม่ใช่ × 22px มุมรูปของแบบตั้งต้น (UAT 25/09 · AW-3)', () => {
  const table = code(read('../../components/service/SurveyResultTable.js'));
  assert.match(table, /inlineUpload docTypes=\{PLAN_DOC_TYPES\}[\s\S]{0,200}photoCapture\s+photoTiles/);
  const tableCss = css('../../components/service/SurveyResultTable.module.css');
  assert.match(tableCss, /\.planCell \{\s*--attach-tile-cols: 1;\s*--attach-tile-h: 72px;/);
});

/* ══ 🐞 UAT 25/09 — เส้นประวัติของจอหน้างาน (รีวิว #15–#18) · ตรรกะอยู่ในตัวตัดสิน/ตัวทำ ที่นี่ตรึงการต่อสาย ══════ */

test('🐞 ตัวต่อสายเริ่มด้วยกุญแจชั้นพื้นที่ของรายการที่เปิดอยู่ (รีเฟรชไม่ดันชั้นซ้อน) · คำขอเปิดที่ยังไม่มาถึงไม่ถูกล้างตอนเริ่ม', () => {
  assert.match(ROUTE, /const layerHere = \(\) => idOf\(window\.history\.state\?\.surveyZone\);/);
  assert.match(ROUTE, /engine\.dispatch\(\{ type: "init", zoneId: pendingKnown \? pending : idOf\(initialZoneId\), here: layerHere\(\) \}\);/);
  assert.match(ROUTE, /if \(pendingKnown\) pendingOpenRef\.current = null;/, 'เดิมล้างทิ้งทุกครั้ง — พื้นที่ที่เพิ่งเพิ่มไม่เปิด');
  assert.match(ROUTE, /if \(snapshot && pending !== null && !latest\.current\.zoneIds\.includes\(pending\)\) pendingOpenRef\.current = null;/,
    'โหลดเสร็จแล้วพื้นที่ที่จองไว้ไม่มา = ทิ้งคำขอ (ไม่พาไปกลางคันทีหลัง)');
});

test('🐞 กดแท็บเดิมซ้ำ = ไม่ทำอะไร · แท็บพกชั้นพื้นที่ไปเขียน URL (หน้างาน = ?zone= เดิม ไม่ใช่ใบเปล่า)', () => {
  assert.match(ROUTE, /if \(next === latest\.current\.tab\) return;/);
  assert.match(ROUTE, /latest\.current\.onTab\?\.\(next, layerHere\(\), window\.history\.state\?\.surveyLayer === true\);/);
  const apply = PAGE.slice(PAGE.indexOf('const applyTab'), PAGE.indexOf('const zonesRef'));
  assert.match(apply, /zoneId \? \{ surveyZone: String\(zoneId\) \} : layer \? \{ surveyLayer: true \} : \{ surveySheet: true \}/,
    'แท็บสรุปคงกุญแจชั้นพื้นที่ · ชั้นเปล่าคงกุญแจชั้นเปล่า (review 26/09 รอบสาม)');
  assert.match(apply, /surveySheetHref\(id, \{ tab: next, zoneId \}\)/);
  const call = PAGE.slice(PAGE.indexOf('const route = useSurveyZoneRoute({'), PAGE.indexOf('const goTab = route.goTab;'));
  assert.match(call, /\n\s+tab,\n/, 'ตัวต่อสายต้องรู้แท็บที่เปิดอยู่');
  // 🐞 review 26/09 เริ่มเมื่อข้อมูลมา ทั้งสองแท็บ — แท็บหน้างานเป็นตัวกั้นการตามทันในตัวต่อสายเอง (เดิม: รอแท็บหน้างานถึงเริ่ม)
  assert.match(call, /\n\s+ready: !loading && !!data,\n/);
  assert.doesNotMatch(call, /active:|tab === "field"/);
  assert.match(call, /snapshot: loadSettled,/, 'นับทั้งรอบที่พัง — โหลดเบื้องหลังพังต้องทิ้งคำขอเปิดพื้นที่ด้วย');
  assert.match(PAGE, /if \(isLatest\(\)\) \{\s*setLoading\(false\);\s*setLoadSettled\(\(n\) => n \+ 1\);/);
});

test('🐞 สองบานย้อนออกจากหน้า: ของค้างระดับหน้าเข้าตัวต่อสาย · ถามด้วยกล่องของการออกจากหน้า (surveyLeaveConfirm)', () => {
  assert.match(PAGE, /const pageDirty = pendingDecisionZoneIds\.length > 0 \|\| fixedNote\.trim\(\) !== "" \|\| uploadsBusy > 0;/);
  const call = PAGE.slice(PAGE.indexOf('const route = useSurveyZoneRoute({'), PAGE.indexOf('const goTab = route.goTab;'));
  assert.match(call, /\n\s+pageDirty,\n/);
  const ask = PAGE.slice(PAGE.indexOf('const askDiscard'), PAGE.indexOf('const resetDraft'));
  assert.match(ask, /if \(via === "leave"\) \{[\s\S]*?surveyLeaveConfirm\(\{[\s\S]*?\.\.\.leaveRef\.current/);
  assert.match(ask, /if \(!box\) return Promise\.resolve\(true\);\s*[\s\S]{0,160}return confirmAction\(box\)\.then\(/);
});

test('🐞 ท้ายตารางสรุปสัญญาเฉพาะทางที่ถามจริงทุกจอ (ลิงก์ · รีเฟรช · ปิดแท็บ) — ปุ่มย้อนของมือถือออกหน้าได้โดยไม่ถาม', () => {
  const table = code(read('../../components/service/SurveyResultTable.js'));
  assert.doesNotMatch(table, /ออกจากหน้านี้ก่อนบันทึก ระบบจะถามก่อนทิ้ง/);
  assert.match(table, /กดลิงก์ออก รีเฟรช หรือปิดแท็บก่อนบันทึก ระบบจะถามก่อนทิ้ง/);
});

test('🐞 นัดปิดแล้วถูกส่งกลับ (หน้าเดียว): หัวงานลงท้ายเนื้อ ⇒ การ์ดส่งกลับเป็นของแรกของใบ — ม็อก A-5 · UAT 25/09 จอ 360', () => {
  assert.match(PAGE, /const headerLast = tab === "field" && !split && sendBackView\?\.mode === "report" && !!sendBackCard;/);
  assert.match(PAGE, /headerLast=\{headerLast\}/);
  // ⚠️ การ์ดอยู่ในคอลัมน์รายการเสมอ — ยกไปเหนือเปลือกแล้วแถบ sticky ค้างกลางจอ (ขอบบนของคอลัมน์ต่ำเกิน)
  assert.match(PAGE, /\{noticeStack\}\s*\{sendBackCard\}/);
  const layout = code(read('../../components/service/SurveySheetLayout.js'));
  assert.match(layout, /\{last \? null : headNode\}/);
  assert.match(layout, /<div className=\{styles\.main\}>\{children\}<\/div>\s*\{last \? headNode : null\}/);
  assert.match(layout, /const last = headerLast && !rail;/, 'มีราง = หัวงานอยู่แถวบนของกริดเสมอ');
});

test('🐞 review 26/09: "ถัดไป: ส่งงาน" เฉพาะคนที่ทำหน้าที่ช่าง · แถบของช่างส่ง toast ขึ้นบน', () => {
  assert.match(PAGE, /canSubmit: canSubmitField && actsAsCrew,/);
  assert.match(code(read('../../components/service/SurveyFieldBar.js')), /data-toast-top=""/);
});

test('🐞 review 26/09: ป้ายปุ่มโทรตัดท้ายในปุ่ม (ชื่อผู้ติดต่อยาว) ไม่ล้นทับปุ่มนำทาง · ชื่อเต็มอยู่ใน title', () => {
  const header = code(read('../../components/service/SurveyJobHeader.js'));
  assert.match(header, /title=\{call\.label\}[\s\S]{0,120}<span className=\{styles\.actLabel\}>\{call\.label\}<\/span>/);
  const headerCss = css('../../components/service/SurveyJobHeader.module.css');
  assert.match(headerCss, /\.act \{[^}]*justify-content: safe center;/);
  assert.match(headerCss, /\.actLabel \{\s*min-width: 0;\s*overflow: hidden;\s*text-overflow: ellipsis;/);
});

test('🐞 review 26/09: ท้ายหน้าที่ไม่มีปุ่ม (คนอ่านอย่างเดียว) ไม่เป็นแถบว่าง — บรรทัดสถานะกลับมาบนมือถือ', () => {
  assert.match(ZONE, /data-empty=\{footer\.next \|\| footer\.save\.show \? undefined : ""\}/);
  assert.match(css('../../components/service/SurveyZonePage.module.css'),
    /\.foot\[data-empty\] \.footCopy \{\s*position: static;[^}]*clip-path: none;/);
});

test('review 26/09: ปุ่มเล็กของการเคาะบนแท็บสรุปเป็นเป้านิ้ว 44px บนจอสัมผัส', () => {
  const table = code(read('../../components/service/SurveyResultTable.js'));
  assert.equal((table.match(/size="sm"[^>]*className=\{styles\.coarseTouch\}/g) || []).length, 3);
  assert.match(css('../../components/service/SurveyResultTable.module.css'),
    /@media \(pointer: coarse\) \{\s*\.coarseTouch:global\(\.btn\.sm\) \{ min-height: var\(--ctl-h-touch\); \}/,
    'ต้องชนะ .btn.sm ของ globals ด้วยความจำเพาะ');
});

test('🐞 review 26/09: หัวพื้นที่ที่ติดบนกันช่องที่โฟกัส (scroll-padding-top เท่าหัวจริง) — WCAG 2.4.11', () => {
  assert.match(ZONE, /<header ref=\{headRef\} className=\{styles\.head\}>/);
  assert.match(ZONE, /root\.style\.setProperty\("--survey-zone-head-h", `\$\{Math\.ceil\(node\.offsetHeight\)\}px`\)/);
  assert.match(ZONE, /root\.style\.removeProperty\("--survey-zone-head-h"\);/, 'ถอดค่าเมื่อหน้าพื้นที่ถูกถอด');
  const zoneCss = css('../../components/service/SurveyZonePage.module.css');
  assert.match(zoneCss, /:global\(html\):has\(\.page\[data-layout="page"\] \.head:not\(\[hidden\] \*\)\) \{\s*scroll-padding-top: var\(--survey-zone-head-h\);/);
  assert.match(zoneCss, /\.head :is\(button, a\) \{\s*scroll-margin-top: calc\(-1 \* var\(--survey-zone-head-h\)\);/);
  // รอบสาม: บานขวาไม่ใส่ scroll-padding ที่ <html> (ซ้อนกับ scroll-margin ของบาน ⇒ ย้ายพื้นที่แล้วบานจอดต่ำ) — กันที่ช่องในบานแทน
  assert.doesNotMatch(zoneCss, /:global\(html\):has\(\.page\[data-layout="pane"\]/);
  assert.match(zoneCss, /\.page\[data-layout="pane"\] :is\(\.body, \.cutBody\) :is\(input, textarea, select, button, a\) \{\s*scroll-margin-top: calc\(var\(--scroll-anchor-top\) \+ var\(--survey-zone-head-h\)\);/);
});
