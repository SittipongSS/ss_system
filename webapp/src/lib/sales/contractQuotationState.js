// ── "ใบเสนอราคาที่สัญญาอ้างถึงยังใช้ได้อยู่ไหม" ──────────────────────────────
//
// ⭐ มติผู้ใช้ 2026-08-22: ใบเสนอราคาถูกปิดเมื่อไร **ร่างสัญญาปิดตาม · ใบที่ออกเลขแล้ว
//    แค่เตือน** — สัญญาที่ออกเลข/ลงนามแล้วเป็นเอกสารผูกพัน ระบบยกเลิกแทนคนไม่ได้
//    (เดิมไม่มีอะไรเชื่อมกันเลย: ใบเสนอราคาถูก Rev./ยกเลิก แล้วสัญญายังนิ่งเฉย
//     ไม่มีใครรู้ว่ากระดาษที่ถืออยู่อ้างราคาที่ไม่ใช่ของจริงแล้ว)
//
// ⚠️ ไฟล์นี้ **ไม่แตะฐานข้อมูล** — เป็นกติกาล้วนเพื่อให้จอ · API · ตัวไล่ปิด อ่านคำตอบ
//    เดียวกัน (สามที่คิดเองแยกกันเมื่อไร คือสามคำตอบที่ค่อย ๆ เพี้ยนจากกัน)

/* เหตุที่นับว่า "ใบเสนอราคาถูกปิด" (มติผู้ใช้ 2026-08-22)
   ⚠️ `revised` มาก่อนเสมอ — ใบที่ออก Rev. แล้วยัง `approvalStatus = 'approved'` ค้างอยู่
      ถ้าเช็คสถานะอนุมัติก่อนจะได้เหตุผลผิด ("อนุมัติถูกถอน" ทั้งที่จริงคือถูกแทนด้วยฉบับใหม่) */
export function quotationClosure(quotation) {
  if (!quotation) return null;
  if (quotation.status === 'revised') {
    return { code: 'revised', label: 'ถูกแทนด้วยฉบับแก้ไข (Rev.)' };
  }
  if (quotation.status === 'cancelled') return { code: 'cancelled', label: 'ถูกยกเลิก' };
  if (quotation.status === 'rejected') return { code: 'rejected', label: 'ลูกค้าไม่รับ' };
  // ด่านออกสัญญาคือ approvalStatus = 'approved' ⇒ หลุดจากอนุมัติเมื่อไร ฐานที่ใช้ออกใบก็หายไป
  if (quotation.approvalStatus && quotation.approvalStatus !== 'approved') {
    return { code: 'approval_lost', label: 'สถานะอนุมัติถูกถอน/รีเซ็ต' };
  }
  return null;
}

/* ใบเสนอราคาใบอื่นของดีลเดียวกันที่อนุมัติทีหลัง (มติผู้ใช้: "อนุมัติที่ใบอื่น")
   ⚠️ **เตือนอย่างเดียว ไม่ปิดร่างตาม** — ดีลหนึ่งมีใบอนุมัติหลายใบพร้อมกันได้จริง
      (ออกแบบกลิ่นใบหนึ่ง ผลิตอีกใบหนึ่ง) ปิดร่างเพราะเจอใบใหม่กว่า = ปิดผิดตัว */
export function newerApprovedQuotation(quotation, siblings = []) {
  if (!quotation) return null;
  const since = String(quotation.approvedAt || quotation.createdAt || '');
  return (siblings || [])
    .filter((row) => row.id !== quotation.id)
    .filter((row) => row.approvalStatus === 'approved' && !quotationClosure(row))
    .filter((row) => String(row.approvedAt || row.createdAt || '') > since)
    .sort((a, b) => String(b.approvedAt || b.createdAt || '').localeCompare(String(a.approvedAt || a.createdAt || '')))[0] || null;
}

// ร่างที่ยังไม่ออกเลข = ยกเลิกตามได้ · ใบที่ออกเลขแล้ว (รอลงนาม/ลงนามแล้ว) = แตะไม่ได้
export function contractFollowsQuotationClosure(contract) {
  return contract?.status === 'draft' && !contract?.contractNo;
}

// ข้อความบนใบ — ต้องบอก *ทำอะไรต่อ* ไม่ใช่แค่ว่ามีอะไรผิด
export function contractQuotationNotice(contract, quotation, { newerApproved = null } = {}) {
  const closure = quotationClosure(quotation);
  const quoteNo = quotation?.quoteNumber || 'ใบเสนอราคาที่อ้างถึง';
  if (closure) {
    if (contract?.status === 'signed') {
      return {
        tone: 'warning',
        title: `${quoteNo} ${closure.label}`,
        body: 'สัญญาฉบับนี้ลงนามแล้ว จึงยังมีผลตามเอกสาร — หากเงื่อนไขเปลี่ยนจริงให้ทำบันทึกเพิ่มเติมสัญญา',
      };
    }
    if (contractFollowsQuotationClosure(contract)) {
      return {
        tone: 'warning',
        title: `${quoteNo} ${closure.label}`,
        body: 'ร่างนี้จะถูกยกเลิกตามใบเสนอราคา — เริ่มใหม่จากใบที่อนุมัติแล้วแทน',
      };
    }
    return {
      tone: 'warning',
      title: `${quoteNo} ${closure.label}`,
      body: 'สัญญาใบนี้ออกเลขแล้ว ระบบจึงไม่ยกเลิกให้ — ตรวจแล้วกดยกเลิก หรือออกฉบับแก้ไขเอง',
    };
  }
  if (newerApproved) {
    return {
      tone: 'info',
      title: `ดีลนี้มีใบเสนอราคาที่อนุมัติทีหลัง (${newerApproved.quoteNumber})`,
      body: 'ตรวจว่าสัญญาใบนี้ยังอ้างใบที่ถูกต้องอยู่ — ระบบไม่เปลี่ยนให้เอง',
    };
  }
  return null;
}

// เหตุผลที่เขียนลงแถวตอนยกเลิกตาม — ต้องอ่านย้อนหลังรู้เรื่องว่าใครสั่งปิดและเพราะอะไร
export function closureCancelReason(quotation) {
  const closure = quotationClosure(quotation);
  if (!closure) return null;
  return `ใบเสนอราคา ${quotation?.quoteNumber || ''} ${closure.label} — ร่างสัญญาถูกยกเลิกตามอัตโนมัติ`.replace(/\s+/g, ' ').trim();
}
