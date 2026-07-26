// Helper เปิดหน้าต่างพิมพ์เอกสารขาย (ใบเสนอราคา/ใบสั่งขาย).
// การสร้าง HTML เอกสารจริงย้ายไปที่ quotationMasterDocument (buildQuotationMasterHTML)
// ตั้งแต่ Phase 7C (ใบเสนอราคา) และ 7D (ใบสั่งขาย) แล้ว — ไฟล์นี้เหลือเฉพาะ
// helper จัดการหน้าต่างพิมพ์ (เปิดแท็บระหว่าง click, เขียน HTML, แจ้ง error).
import { buildQuotationMasterHTML } from '@/lib/sales/quotationMasterDocument';
import { getCompanyProfileForPrint } from '@/lib/companyProfile';
import { notifyToast } from '@/lib/feedback';
import { printPlaceholderHtml } from '@/lib/printTheme';
import {
  getDocumentStandardsForPrint,
  resolveDocumentAccentKey,
  resolveDocumentForm,
  resolveDocumentTitleTh,
} from '@/lib/documentStandards';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ต้องเปิด window ภายใน call stack ของ click โดยตรง มิฉะนั้น Chromium จะบล็อก popup
// เมื่อมี fetch/save ที่ await ก่อน window.open.
export function prepareQuotePrintWindow(documentLabel = 'ใบเสนอราคา') {
  // ไม่ระบุ window features เพื่อให้ browser เปิดพรีวิวเป็นแท็บใหม่แทน popup window.
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    notifyToast.error('ไม่สามารถเปิดหน้าต่างพิมพ์ได้ กรุณาอนุญาต popup สำหรับเว็บไซต์นี้');
    return null;
  }
  try { printWindow.opener = null; } catch { /* browser บางรุ่นไม่อนุญาตให้แก้ opener */ }
  printWindow.document.write(printPlaceholderHtml({
    title: `กำลังเตรียม${documentLabel}…`,
    message: "กำลังเตรียมเอกสารสำหรับพิมพ์…",
  }));
  printWindow.document.close();
  return printWindow;
}

export function showQuotePrintError(printWindow, message = 'ไม่สามารถโหลดข้อมูลใบเสนอราคาได้', documentLabel = 'ใบเสนอราคา') {
  if (!printWindow || printWindow.closed) return;
  printWindow.document.open();
  printWindow.document.write(printPlaceholderHtml({
    title: `ไม่สามารถพิมพ์${documentLabel}`,
    message,
    tone: "error",
    closeButton: true,
  }));
  printWindow.document.close();
}

export function openQuotePrintWindow(quote, preparedWindow = null, company = null, standard = null) {
  const win = preparedWindow || prepareQuotePrintWindow();
  if (!win) return;
  win.document.open();
  // Phase 7C (Direction B): ใบเสนอราคาที่ยังไม่ตรึง snapshot ก็ต้องพิมพ์ด้วยหน้าตา V4
  // (เครื่องยนต์เดียวกับฉบับที่ตรึง) เพื่อให้ทุกใบหน้าตาเดียวกัน
  // company/standard = บล็อกบริษัท + มาตรฐานเอกสารที่เผยแพร่ (ไม่ส่ง → builder fallback)
  // ลายเซ็นผู้เสนอราคา: server ฝังรูป+วันที่+Evidence มาให้จากหลักฐานที่ตรึงตอนยื่น
  // (mig 0155, API detail) — ใบที่ยังไม่ยื่นไม่มีค่านี้ → ช่องเซ็นเปล่าเหมือนเดิม
  const proposer = quote?.proposerSignature;
  win.document.write(buildQuotationMasterHTML(quote, {
    company,
    form: resolveDocumentForm(standard, 'quotation'),
    accentKey: resolveDocumentAccentKey(standard, 'quotation'),
    documentTitleTh: resolveDocumentTitleTh(standard, 'quotation'),
    proposerSignatureImage: proposer?.imageDataUri || null,
    proposerEvidence: proposer?.imageDataUri
      ? { id: proposer.evidenceId, signerName: proposer.signerName, signedAt: proposer.signedAt }
      : null,
  }));
  win.document.close();
  return win;
}

// บริษัท + มาตรฐานเอกสาร ดึงคู่กันเสมอตอนสร้างเอกสารสด — ทั้งคู่มีค่าสำรองในตัวเอง
async function livePrintContext() {
  const [company, standards] = await Promise.all([
    getCompanyProfileForPrint(),
    getDocumentStandardsForPrint(),
  ]);
  return { company, standard: standards?.quotation || null };
}

function writeToPrintWindow(win, html) {
  win.document.open();
  win.document.write(html);
  win.document.close();
  return win;
}

// พิมพ์ใบเสนอราคา = ถ้าเคยออกจริงแล้ว (อนุมัติ → Phase 7B ตรึง snapshot ไว้)
// ต้อง "เล่นไฟล์ที่ตรึงไว้" ไม่ใช่สร้าง HTML ใหม่จากข้อมูลสด
//
// สำคัญ: ถ้าไม่ทำแบบนี้ การแก้กติกาแบ่งหน้าใน buildQuotationMasterHTML จะทำให้ใบที่
// อนุมัติไปแล้วพิมพ์ออกมาหน้าตาไม่เหมือนฉบับที่ลูกค้าได้รับ ซึ่งขัดกับ ADR 0011
// (issued document ต้องไม่เปลี่ยน) — ฉบับที่ยังไม่อนุมัติไม่มี snapshot จึงสร้างสด
export async function openQuotePrintWindowPreferIssued(quote, preparedWindow = null) {
  const win = preparedWindow || prepareQuotePrintWindow();
  if (!win) return undefined;
  const id = quote?.id;
  // สร้างสด: ดึงบริษัท + มาตรฐานที่เผยแพร่มาใส่ (window เปิดแล้วจาก prepare — await ตรงนี้ปลอดภัย)
  if (!id) {
    const { company, standard } = await livePrintContext();
    return openQuotePrintWindow(quote, win, company, standard);
  }
  try {
    const res = await fetch(`/api/sales-planning/quotations/${encodeURIComponent(id)}/issued?render=latest`, {
      cache: 'no-store',
    });
    // 404 = ยังไม่เคยออกจริง (ฉบับร่าง/รออนุมัติ) → สร้างจากข้อมูลสดตามปกติ
    // ฉบับที่ตรึงแล้วมีบล็อกบริษัทฝังในไฟล์ (ตรึงตอนอนุมัติ) จึงไม่ต้องดึงเพิ่ม
    if (res.ok) return writeToPrintWindow(win, await res.text());
  } catch {
    // โหลดฉบับตรึงไม่ได้ = ไม่บล็อกการพิมพ์ ตกไปใช้ข้อมูลสดแทน
  }
  const { company, standard } = await livePrintContext();
  return openQuotePrintWindow(quote, win, company, standard);
}
