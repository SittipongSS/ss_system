// ⚠️ Phase 7C (Direction B, 2026-07-21): เอกสารใบเสนอราคาที่ "พิมพ์จริง + ตรึง snapshot +
// หน้า preview" ย้ายไปเรนเดอร์ด้วย lib/sales/quotationMasterDocument.js (server string builder
// ที่คัดลอกหน้าตา/CSS จาก component นี้) แล้ว. component React นี้ไม่ได้ถูกใช้ในแอปแล้ว —
// เก็บไว้เป็นต้นฉบับหน้าตา V4 อ้างอิง. **ถ้าจะแก้หน้าตา V4 ต้องแก้ที่ quotationMasterDocument.js
// (DOCUMENT_CSS + render*) ด้วย ไม่งั้นเอกสารจริงจะไม่เปลี่ยนตาม** (พิจารณาปลดระวาง component นี้ทีเดียว).
import { SYSTEM_DOCUMENT_LOGO_URL } from '@/lib/documentBrand';
import styles from './QuotationMasterDocument.module.css';

const money = (value) => Number(value || 0).toLocaleString('th-TH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function DocumentHeader({ model }) {
  return (
    <header className={styles.documentHeader}>
      <div className={styles.brandBlock}>
        {/* Print documents use the embedded, theme-independent logo source shared by Production. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={SYSTEM_DOCUMENT_LOGO_URL} width="160" height="54" alt="Scent and Sense" />
        <div>
          <strong>{model.company.nameTh}</strong>
          <span>{model.company.nameEn}</span>
          <p>{model.company.address}</p>
          <p>เลขประจำตัวผู้เสียภาษี {model.company.taxId}</p>
        </div>
      </div>
      <div className={styles.identityBlock}>
        <div className={styles.formLine}>{model.formLine}</div>
        <h1>{model.standard.titleTh}</h1>
        <div className={styles.englishTitle}>{model.standard.titleEn}</div>
        <dl>
          <div><dt>เลขที่</dt><dd>{model.document.number}</dd></div>
          <div><dt>วันที่</dt><dd>{model.document.issueDate}</dd></div>
          <div><dt>ยืนราคาถึง</dt><dd>{model.document.validUntil}</dd></div>
        </dl>
      </div>
    </header>
  );
}

function PartyGrid({ model }) {
  return (
    <section className={styles.partyGrid} aria-label="ข้อมูลลูกค้าและข้อมูลอ้างอิง">
      <div>
        <h2>ผู้ซื้อ <span>/ CUSTOMER</span></h2>
        <strong>{model.customer.name}</strong>
        <p>{model.customer.address}</p>
        <dl>
          <div><dt>เลขผู้เสียภาษี</dt><dd>{model.customer.taxId}</dd></div>
          <div><dt>ที่อยู่จัดส่ง</dt><dd>{model.customer.shippingAddress || model.customer.address}</dd></div>
          <div><dt>ผู้ติดต่อ</dt><dd>{model.customer.contactName}{model.customer.contactPhone ? ` · ${model.customer.contactPhone}` : ''}</dd></div>
        </dl>
      </div>
      <div>
        <h2>ข้อมูลอ้างอิง <span>/ REFERENCE</span></h2>
        <dl>
          <div><dt>ดีล</dt><dd>{model.references.deal}</dd></div>
          <div><dt>โครงการ</dt><dd>{model.references.project}</dd></div>
          <div><dt>ผู้เสนอราคา</dt><dd>{model.references.salesOwner}</dd></div>
          {model.references.salesOwnerPhone && <div><dt>เบอร์ผู้เสนอราคา</dt><dd>{model.references.salesOwnerPhone}</dd></div>}
          <div><dt>ติดต่อบริษัท</dt><dd>{model.company.phone} · Line {model.company.line}</dd></div>
        </dl>
      </div>
    </section>
  );
}

function ItemTable({ lines, startIndex }) {
  return (
    <table className={styles.itemTable}>
      <thead>
        <tr>
          <th className={styles.center}>ลำดับ</th>
          <th>รายละเอียดสินค้า / บริการ</th>
          <th className={styles.number}>จำนวน</th>
          <th className={styles.center}>หน่วย</th>
          <th className={styles.number}>ราคา/หน่วย</th>
          <th className={styles.number}>จำนวนเงิน</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line, index) => (
          <tr key={line.id}>
            <td className={styles.center}>{startIndex + index + 1}</td>
            <td>
              <strong>{line.description}</strong>
              <span className={styles.itemCode}>{line.fgCode}</span>
              {line.note && <span className={styles.itemNote}>{line.note}</span>}
            </td>
            <td className={styles.number}>{Number(line.qty).toLocaleString('th-TH')}</td>
            <td className={styles.center}>{line.unit}</td>
            <td className={styles.number}>{money(line.unitPrice)}</td>
            <td className={styles.number}>{money(line.lineTotal)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Totals({ model }) {
  const { totals } = model;
  return (
    <section className={styles.totals} aria-label="สรุปยอด">
      <div><span>รวมสินค้า / บริการ</span><strong>{money(totals.subtotal)}</strong></div>
      {totals.discountAmount > 0 && (
        <>
          <div><span>หัก ส่วนลด{model.discount.type === 'percent' ? ` ${model.discount.value}%` : ''}</span><strong>-{money(totals.discountAmount)}</strong></div>
          <div className={styles.afterDiscount}><span>ยอดหลังหักส่วนลด</span><strong>{money(totals.afterDiscount)}</strong></div>
        </>
      )}
      <div><span>ภาษีมูลค่าเพิ่ม {model.vatRate}%</span><strong>{money(totals.vatAmount)}</strong></div>
      <div className={styles.grandTotal}><span>ยอดรวมทั้งสิ้น</span><strong>{money(totals.totalAmount)} บาท</strong></div>
    </section>
  );
}

function InstallmentTable({ model }) {
  return (
    <section className={styles.installmentSection}>
      <h2>งวดชำระเงิน <span>/ PAYMENT SCHEDULE</span></h2>
      <table className={styles.installmentTable}>
        <thead>
          <tr><th>งวด</th><th>ครบกำหนดเมื่อ</th><th>กำหนดชำระ</th><th className={styles.number}>%</th><th className={styles.number}>จำนวนเงิน</th></tr>
        </thead>
        <tbody>
          {model.installments.map((row, index) => (
            <tr key={`${row.label}-${index}`}>
              <td><strong>{index + 1}. {row.label}</strong>{row.note && <span>{row.note}</span>}</td>
              <td>{row.trigger}</td>
              <td>{row.dueRule}</td>
              <td className={styles.number}>{row.percent}%</td>
              <td className={styles.number}>{money(row.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Terms({ model }) {
  return (
    <section className={styles.termsGrid}>
      <div><h2>วิธีชำระเงิน <span>/ PAYMENT METHOD</span></h2><p>{model.paymentMethod}</p></div>
      <div><h2>เงื่อนไขการชำระเงิน <span>/ PAYMENT TERMS</span></h2><p>{model.paymentTerms}</p></div>
      <div className={styles.remarks}><h2>หมายเหตุ <span>/ REMARKS</span></h2><p>{model.remarks}</p></div>
    </section>
  );
}

function SectionLead({ kind, documentNumber }) {
  const isAcceptance = kind === 'acceptance';
  return (
    <div className={styles.sectionLead}>
      <div>
        <strong>{isAcceptance ? 'การยืนยันเอกสาร' : 'รายละเอียดการชำระเงิน'}</strong>
        <span>{isAcceptance ? '/ DOCUMENT ACCEPTANCE' : '/ PAYMENT DETAILS'}</span>
      </div>
      <small>{documentNumber}</small>
    </div>
  );
}

function Signatures({ model }) {
  return (
    <section className={styles.signatures} aria-label="ส่วนลงนาม">
      <div>
        <h2>ผู้เสนอราคา <span>พนักงานขาย</span></h2>
        <div className={styles.signatureSpace}>ลงชื่อ</div>
        <strong>({model.references.salesOwner})</strong>
        <p>วันที่ ______ / ______ / ______</p>
      </div>
      <div className={model.signature ? styles.signed : ''}>
        <h2>ผู้อนุมัติ <span>Authorized signature</span></h2>
        {model.signature ? (
          <>
            <div className={styles.signaturePreview} aria-label="ตำแหน่งภาพลายเซ็นอิเล็กทรอนิกส์">ลายเซ็นอิเล็กทรอนิกส์</div>
            <strong>{model.signature.signerName}</strong>
            <p>{model.signature.signerRole} · {model.signature.signedAt}</p>
            <small>Evidence {model.signature.evidenceId}</small>
          </>
        ) : (
          <>
            <div className={styles.signatureSpace}>ลงชื่อ</div>
            <strong>(____________________________)</strong>
            <p>วันที่ ______ / ______ / ______</p>
          </>
        )}
      </div>
      <div>
        <h2>ผู้ยืนยันคำสั่งซื้อ <span>ลูกค้า</span></h2>
        <div className={styles.signatureSpace}>ลงชื่อ</div>
        <strong>(____________________________)</strong>
        <p>วันที่ ______ / ______ / ______</p>
      </div>
    </section>
  );
}

function DocumentFooter({ model, pageNumber, pageCount }) {
  return (
    <footer className={styles.footer}>
      <span>{model.company.website}</span>
      <span>{model.formLine}</span>
      <span>หน้า {pageNumber} / {pageCount}</span>
    </footer>
  );
}

export default function QuotationMasterDocument({ model, grayscale = false }) {
  let lineOffset = 0;
  const templateVariant = model.templateVariant || 'v3';
  return (
    <div
      id="quotation-master-preview"
      className={`${styles.document} ${styles[templateVariant]}${grayscale ? ` ${styles.grayscale}` : ''}`}
      data-template-variant={templateVariant}
      data-template-version={model.templateVersion}
    >
      {model.pages.map((page, pageIndex) => {
        const startIndex = lineOffset;
        lineOffset += page.lines.length;
        return (
          <article
            className={styles.sheet}
            key={page.id}
            aria-label={`ตัวอย่างใบเสนอราคา หน้า ${pageIndex + 1}`}
            data-page-kind={page.kind}
          >
            {model.watermark && <div className={styles.watermark}>{model.watermark}</div>}
            <DocumentHeader model={model} />
            <div className={styles.sheetContent}>
              {page.showParty && <PartyGrid model={model} />}
              {page.kind === 'items' && pageIndex > 0 && (
                <div className={styles.continuation}>รายการสินค้าและบริการต่อ · {model.document.number}</div>
              )}
              {(page.kind === 'payment' || page.kind === 'acceptance') && (
                <SectionLead kind={page.kind} documentNumber={model.document.number} />
              )}
              {page.lines.length > 0 && <ItemTable lines={page.lines} startIndex={startIndex} />}
              {page.showTotals && <Totals model={model} />}
              {(page.showPayment || page.showSignatures) && (
                <div className={styles.paymentContent}>
                  {page.showPayment && (
                    <div className={styles.paymentDetails}>
                      <InstallmentTable model={model} />
                      <Terms model={model} />
                    </div>
                  )}
                  {page.showSignatures && <Signatures model={model} />}
                </div>
              )}
            </div>
            <DocumentFooter model={model} pageNumber={pageIndex + 1} pageCount={model.pages.length} />
          </article>
        );
      })}
    </div>
  );
}
