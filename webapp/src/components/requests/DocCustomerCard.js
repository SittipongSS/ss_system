"use client";
// ── ข้อมูลลูกค้าสำหรับ IFRA / MSDS (ม-167 · มติเจ้าของ 25/11/2026) ────────────────────────────────────
//
// ⭐ ก้อนเดียวสองที่: ฟอร์มเปิด/แก้คำร้อง (มีช่องเลือกที่อยู่) · หน้าคำร้อง (อ่านอย่างเดียว ให้ RD ก๊อปไปพิมพ์เอกสาร)
//    — กติกา "สร้าง = แก้" ของรีโป + จอกับใบพูดข้อมูลชุดเดียวกัน
// ⭐ ชื่อ · ที่อยู่ · เบอร์ **ไทยคู่อังกฤษ** — อังกฤษ + เบอร์ขาด = ส่งคำร้องไม่ได้ (มติ "บังคับก่อนส่ง") ⇒ ช่องที่ขาดขึ้นสีแดงพร้อมทางไปกรอก
//    · ไทยขาดไม่บังคับ (ลูกค้าต่างชาติ) — ขึ้นขีดตามกติกาค่าว่างทั้งระบบ
// ⚠️ ข้อมูลอ่านสดจากทะเบียนลูกค้า — ใบเก็บแค่ id ของที่อยู่ ⇒ กรอกทะเบียนแล้วกลับมาที่ใบเห็นทันที
import { useEffect, useState } from "react";
import Link from "next/link";
import OptionTiles from "@/components/ui/OptionTiles";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { ADDRESS_USE_LABELS } from "@/lib/master/addresses";
import { docCustomerGaps, docCustomerPickAddress } from "@/lib/requests/docCustomer";
import { fmtPhone, NA } from "@/lib/format";
import { apiJson } from "@/lib/apiFetch";
import styles from "./docCustomer.module.css";

const TILE_MAX = 6;   // ชุดเลือก ≤ 6 = กางเป็นแผ่น (กติกาคอนโทรล v2) · เกินนั้นเป็นช่องค้นหา

function Value({ text, required = false }) {
  if (text) return <span className={styles.value}>{text}</span>;
  return required
    ? <span className={styles.missing}>ยังไม่มี — ต้องกรอกก่อนส่ง</span>
    : <span className={styles.empty}>{NA}</span>;
}

/**
 * @param view `docCustomerView` (จาก GET ใบ หรือ `/api/sa/requests/doc-customer`) · null = ยังไม่รู้ลูกค้า
 * @param onAddressChange มี = โหมดฟอร์ม (กางช่องเลือกที่อยู่) · ไม่มี = อ่านอย่างเดียว
 */
export default function DocCustomerCard({
  view = null, loading = false, unknown = false,
  addressValue = "", onAddressChange = null, disabled = false,
}) {
  if (loading) return <p className={styles.note}>กำลังโหลดข้อมูลลูกค้า…</p>;
  if (unknown) return <p className={styles.note}>อ่านข้อมูลลูกค้าจากทะเบียนไม่ได้ — ลองโหลดหน้าใหม่</p>;
  if (!view) return <p className={styles.note}>เลือกดีลก่อน — ข้อมูลลูกค้ามาจากลูกค้าของดีล</p>;

  const gaps = docCustomerGaps(view);
  const choices = view.choices || [];
  const phone = view.phone ? fmtPhone(view.phone) : "";
  const pickedId = addressValue || view.addressId || "";
  const options = choices.map((c) => ({
    value: c.id,
    label: c.label,
    description: [ADDRESS_USE_LABELS[c.useFor], c.en ? null : "ยังไม่มีภาษาอังกฤษ"].filter(Boolean).join(" · "),
  }));
  const customerHref = view.customerId ? `/database/customers/${encodeURIComponent(view.customerId)}` : null;

  return (
    <div className={styles.wrap}>
      {onAddressChange && (
        <div className="form-group">
          <span className="form-field-label">ที่อยู่ที่จะใช้บนเอกสาร</span>
          {choices.length === 0 ? (
            <p className={styles.missing}>ลูกค้ารายนี้ยังไม่มีที่อยู่ในทะเบียน</p>
          ) : choices.length <= TILE_MAX ? (
            <OptionTiles
              value={pickedId}
              onChange={(v) => onAddressChange(v || "")}
              disabled={disabled}
              ariaLabel="ที่อยู่ที่จะใช้บนเอกสาร"
              options={options}
            />
          ) : (
            <SearchableSelect
              value={pickedId}
              onChange={(v) => onAddressChange(v || "")}
              disabled={disabled}
              options={options.map((o) => ({ ...o, search: `${o.label} ${o.description}` }))}
              placeholder="— เลือกที่อยู่ —"
            />
          )}
        </div>
      )}
      {view.addressStale && (
        <p className={styles.missing}>ที่อยู่ที่ใบเลือกไว้ถูกลบจากทะเบียนแล้ว — ใช้ที่อยู่ออกเอกสารหลักแทน</p>
      )}

      <dl className={styles.grid}>
        <div className={styles.head} aria-hidden="true">
          <span />
          <span>ภาษาไทย</span>
          <span>English</span>
        </div>
        <div className={styles.row}>
          <dt>ชื่อ</dt>
          <dd><span className={styles.lang}>ไทย</span><Value text={view.nameTh} /></dd>
          <dd><span className={styles.lang}>English</span><Value text={view.nameEn} required /></dd>
        </div>
        <div className={styles.row}>
          <dt>ที่อยู่</dt>
          <dd><span className={styles.lang}>ไทย</span><Value text={view.address?.th} required={!view.address} /></dd>
          <dd><span className={styles.lang}>English</span><Value text={view.address?.en} required /></dd>
        </div>
        <div className={styles.row}>
          <dt>เบอร์โทร</dt>
          <dd className={styles.span2}>
            <Value text={phone} required />
            {view.phoneFrom === "address" && <span className={styles.note}> (เบอร์ผู้ติดต่อของที่อยู่นี้ — ทะเบียนไม่มีเบอร์บริษัท)</span>}
          </dd>
        </div>
      </dl>

      {gaps.length > 0 && (
        <p className={styles.gaps} role="status">
          ยังขาด {gaps.map((g) => g.label).join(" · ")} — ส่งคำร้องไม่ได้จนกว่าจะกรอกที่ทะเบียนลูกค้า
          {customerHref && <> · <Link href={customerHref} className="linklike" target="_blank">เปิดทะเบียนลูกค้า</Link></>}
        </p>
      )}
    </div>
  );
}

/**
 * ฟอร์มเปิด/แก้คำร้อง: โหลดข้อมูลลูกค้าของดีลที่เลือก แล้ววาดการ์ดพร้อมช่องเลือกที่อยู่
 * ⚠️ ยังไม่รู้ลูกค้า = ไม่ยิง · ลูกค้าเปลี่ยน (เปลี่ยนดีล) = ล้างที่อยู่ที่เลือกไว้ของรายเดิม (ผู้เรียกถือค่า)
 */
export function DocCustomerField({ customerId = null, value = "", onChange, disabled = false }) {
  const [state, setState] = useState({ key: null, view: null, unknown: false });
  useEffect(() => {
    if (!customerId) return undefined;
    let alive = true;
    apiJson(`/api/sa/requests/doc-customer?customerId=${encodeURIComponent(customerId)}`, {
      cache: "no-store", fallbackError: "โหลดข้อมูลลูกค้าไม่สำเร็จ",
    })
      .then((view) => { if (alive) setState({ key: customerId, view, unknown: false }); })
      .catch(() => { if (alive) setState({ key: customerId, view: null, unknown: true }); });
    return () => { alive = false; };
  }, [customerId]);

  if (!customerId) return <DocCustomerCard view={null} />;
  const ready = state.key === customerId;
  // ที่อยู่ที่เลือกไว้ไม่ใช่ของลูกค้ารายนี้ (เพิ่งเปลี่ยนดีล) = ถือว่ายังไม่เลือก — ตั้งต้นเป็นที่อยู่หลัก
  const choices = state.view?.choices || [];
  const picked = value && choices.some((c) => c.id === value) ? value : "";
  const view = ready && state.view ? docCustomerPickAddress(state.view, picked) : null;
  return (
    <DocCustomerCard
      view={view}
      loading={!ready}
      unknown={ready && state.unknown}
      addressValue={picked || view?.addressId || ""}
      onAddressChange={onChange}
      disabled={disabled}
    />
  );
}
