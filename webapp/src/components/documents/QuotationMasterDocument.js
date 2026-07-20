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
          <div><dt>สาขา</dt><dd>{model.customer.branch}</dd></div>
          <div><dt>ผู้ติดต่อ</dt><dd>{model.customer.contactName} · {model.customer.contactPhone}</dd></div>
        </dl>
      </div>
      <div>
        <h2>ข้อมูลอ้างอิง <span>/ REFERENCE</span></h2>
        <dl>
          <div><dt>ดีล</dt><dd>{model.references.deal}</dd></div>
          <div><dt>โครงการ</dt><dd>{model.references.project}</dd></div>
          <div><dt>ผู้เสนอราคา</dt><dd>{model.references.salesOwner}</dd></div>
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
      <span>{model.company.website} · เอกสารควบคุม</span>
      <span>{model.formLine}</span>
      <span>หน้า {pageNumber} / {pageCount}</span>
    </footer>
  );
}

export default function QuotationMasterDocument({ model, grayscale = false }) {
  let lineOffset = 0;
  return (
    <div
      id="quotation-master-preview"
      className={`${styles.document}${grayscale ? ` ${styles.grayscale}` : ''}`}
      data-template-version={model.templateVersion}
    >
      {model.pages.map((pageLines, pageIndex) => {
        const startIndex = lineOffset;
        lineOffset += pageLines.length;
        const isLast = pageIndex === model.pages.length - 1;
        return (
          <article className={styles.sheet} key={`page-${pageIndex + 1}`} aria-label={`ตัวอย่างใบเสนอราคา หน้า ${pageIndex + 1}`}>
            {model.watermark && <div className={styles.watermark}>{model.watermark}</div>}
            <DocumentHeader model={model} />
            {pageIndex === 0 && <PartyGrid model={model} />}
            {pageIndex > 0 && <div className={styles.continuation}>รายการต่อ · {model.document.number}</div>}
            <ItemTable lines={pageLines} startIndex={startIndex} />
            {isLast && (
              <div className={styles.finalContent}>
                <Totals model={model} />
                <InstallmentTable model={model} />
                <Terms model={model} />
                <Signatures model={model} />
              </div>
            )}
            <DocumentFooter model={model} pageNumber={pageIndex + 1} pageCount={model.pages.length} />
          </article>
        );
      })}
    </div>
  );
}
