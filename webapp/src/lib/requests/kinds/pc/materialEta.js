// ── PC · ติดตามของเข้า ──────────────────────────────────────────────────
// เปิดจากพาเนลของเข้าในหน้าโครงการ (endpoint request-update) ซึ่งบางแถวไม่มีดีล
// → ไม่บังคับอะไรเลย · ⚠️ ยังไม่ได้ทบทวนในรอบนี้เช่นกัน
const materialEta = {
  key: 'material_eta',
  label: 'ติดตามของเข้า (PM/RM)',
  dept: 'PC', scope: 'RQ', hasItems: false,
  needs: [],
  stepKey: 'npd-38',
  form: {
    titlePlaceholder: 'เช่น ขออัปเดตกำหนดของเข้าล็อตเดือนนี้',
    bodyLabel: 'รายละเอียด',
    bodyPlaceholder: 'ของกลุ่มไหน · ต้องใช้ผลิตวันไหน',
  },
  hint: 'ขอให้ฝ่ายจัดซื้ออัปเดตกำหนดของเข้าทั้งชุด',
};

export default materialEta;
