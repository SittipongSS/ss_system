"use client";

import { CircleDollarSign } from "lucide-react";
import ReadableText from "@/components/ui/ReadableText";
import {
  isEmptyPaymentValue,
  matchesPaymentPreset,
  paymentPresetToFormValue,
} from "@/lib/commercialPresets";
import CommercialPresetPicker from "./CommercialPresetPicker";
import styles from "./QuotationPaymentTerms.module.css";

export default function QuotationPaymentTerms({
  value,
  onChange,
  disabled = false,
}) {
  const payment = {
    type: value?.type === "installment" ? "installment" : "full",
    paymentMethod: value?.paymentMethod || "",
    paymentTerms: value?.paymentTerms || "",
    installments: Array.isArray(value?.installments) ? value.installments : [],
    presetVersionId: value?.presetVersionId || null,
  };

  const update = (patch) => {
    if (!disabled) onChange?.({ ...payment, ...patch });
  };

  const applyPreset = (option) => {
    const next = paymentPresetToFormValue(option);
    if (!next) {
      update({ presetVersionId: null });
      return;
    }
    update({ ...next, presetVersionId: option.versionId });
  };

  return (
    <>
      <div className={styles.paymentHeading}>
        <div className={styles.paymentTitle}>
          <CircleDollarSign size={17} aria-hidden="true" />
          <h2>เงื่อนไขการชำระ</h2>
        </div>
        <div className="spacer" />
        <CommercialPresetPicker
          kind="payment"
          selectedVersionId={payment.presetVersionId}
          disabled={disabled}
          hasContent={!isEmptyPaymentValue(payment)}
          matchesCurrent={(option) => matchesPaymentPreset(payment, option)}
          onApply={applyPreset}
        />
      </div>

      <div className={styles.paymentTermsGrid}>
        {disabled ? (
          <div className={styles.paymentField}>
            <span className={styles.paymentFieldLabel}>วิธีการชำระ</span>
            <div className="readable-field">
              <ReadableText text={payment.paymentMethod} lines={3} empty={<span className="readable-field-empty">ไม่ได้ระบุ</span>} />
            </div>
          </div>
        ) : (
          <label>วิธีการชำระ
            <input
              className="premium-input"
              value={payment.paymentMethod}
              placeholder="เช่น โอนเงินเข้าบัญชีธนาคาร / เช็ค / เงินสด"
              onChange={(event) => update({ paymentMethod: event.target.value })}
            />
          </label>
        )}
        {disabled ? (
          <div className={styles.paymentField}>
            <span className={styles.paymentFieldLabel}>ข้อความเงื่อนไขการชำระ</span>
            <div className="readable-field">
              <ReadableText text={payment.paymentTerms} lines={5} empty={<span className="readable-field-empty">ไม่ได้ระบุ</span>} />
            </div>
          </div>
        ) : (
          <label>ข้อความเงื่อนไขการชำระ
            <textarea
              className="textarea-premium"
              rows={3}
              value={payment.paymentTerms}
              placeholder="เช่น เครดิต 30 วันนับจากวันส่งมอบ"
              onChange={(event) => update({ paymentTerms: event.target.value })}
            />
          </label>
        )}
      </div>
    </>
  );
}
