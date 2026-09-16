"use client";
// ── ตารางสรุปผลประเมินของหัวหน้า TS (เฟส 3 · จอ 07) ─────────────────────
//
// ⭐ **ช่างส่งข้อเท็จจริงมาจากหน้างาน หัวหน้าตัดสินสองอย่าง**: จะติดตั้งจุดไหนบ้าง
//   และแต่ละพื้นที่ใช้กี่แพ็คเกจ (มติผู้ใช้ 2026-08-29)
//   ⇒ ตารางนี้มี **สองคอลัมน์ที่ต้องกรอก ไม่ใช่คอลัมน์เดียว** · ที่เหลืออ่านอย่างเดียว
//
// ⭐ **เคาะแล้วกดบันทึกเอง ไม่ใช่บันทึกทุกคลิก** (มติผู้ใช้ 2026-09-16 · PR5)
//   🐞 ของเดิมยิง `PUT` ทุกครั้งที่กด +/− หรือติ๊กจุด ⇒ หัวหน้าที่กำลังลองตัวเลขเขียน
//     ลงฐานไปแล้วสิบรอบ · ทุกรอบเป็นแถว audit จริง · และไม่มีจังหวะไหนเลยที่เขาพูดว่า
//     "เอาตามนี้" ⇒ ของที่กำลังคิดอยู่แยกไม่ออกจากของที่ตัดสินแล้ว
//   ⇒ ร่างอยู่บนจอ · แถบบนหัวการ์ดนับให้ว่าค้างกี่พื้นที่ · กดครั้งเดียวลงทั้งชุด
//   ⚠️ **กฎว่าอะไรคือ dirty และบันทึกได้หรือยัง อยู่ใน `surveyDecision.js` ไม่ได้อยู่ที่นี่**
//     — ด่านชุดเดียวกับ route `PUT` และการ์ดควบคุมอ่านตัวเดียวกัน
//
// ⚠️ **จำนวนจุด ≠ จำนวนแพ็คเกจ** — `service-field-operations` §2.4 บันทึกไว้แล้วว่า
//   "จำนวนเครื่องต่อแพ็คเกจแกว่ง" · หนึ่งแพ็คเกจกระจายหลายจุดได้ หลายแพ็คเกจลงจุดเดียวได้
//   ⇒ **ห้ามผูกสองเลขนี้เข้าหากันอัตโนมัติ และห้ามเตือนว่า "ไม่เท่ากัน"**
//
// ⭐ **คอลัมน์ที่ต้องตัดสินอยู่ถัดจากชื่อพื้นที่** — 🐞 เดิมแพ็คเกจกับจุดติดตั้งอยู่หลังสี่
//   คอลัมน์อ่านอย่างเดียว (ตาราง 960px) ⇒ มือถือเปิดมาเห็นแต่ของที่อ่าน ปุ่ม +/− หลุดจอ
//   แม้บนแท็บเล็ต · ลบ.ม. กับสูตรจึงยุบเป็นบรรทัดรองของเซลล์ที่มันอธิบาย
// ⭐ **ดูอย่างเดียว = ตัวหนังสือ ไม่ใช่ปุ่มจาง** — จุดที่เลือกคือผลที่ฝ่ายขายอ่าน ต้องชัดที่สุด
//   ในแถว และบอกด้วยไอคอน ไม่ใช่สีขอบอย่างเดียว (WCAG 1.4.1)
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ClipboardList, Minus, Pencil, Plus } from "lucide-react";
import Button from "@/components/ui/Button";
import { DetailCard } from "@/components/ui/DetailPage";
import Input from "@/components/ui/Input";
import StatusBadge from "@/components/ui/StatusBadge";
import { TableScroll } from "@/components/ui/Table";
import { surveyDocCounts, surveyResultMissing, surveyZoneSize } from "@/lib/service/survey";
import {
  surveyDecisionDraft, surveyDecisionDirty, surveyDecisionError, surveyDecisionPayload,
  surveyPendingDecisions, surveySuggestedFor,
} from "@/lib/service/surveyDecision";
import { fmtNumber, naText } from "@/lib/format";
import styles from "./SurveyResultTable.module.css";

/* วัดโหมดเคาะ (2026-09-15 · มีช่องเหตุผล + ปุ่มใช้สูตร + บรรทัดขาดอะไร): ดูอย่างเดียวรวม 573px
   แต่ตอนเคาะช่องเหตุผลกิน 160px · 🐞 640 เดิมคิดจากโหมดดูอย่างเดียว ⇒ แถวสูง 175px
   บรรทัด "ขาด…" ห่อ 6 บรรทัด · 680 ⇒ 138px และยังไม่เกินกรอบแท็บเล็ต (696px)
   ⚠️ ที่ ≤680px ตารางเลิกเป็นตาราง (แถวเรียงเป็นป้าย/ค่า) ⇒ ตัวเลขนี้ใช้กับ 681px ขึ้นไป */
const TABLE_MIN_WIDTH = 680;

/* ป้ายบอกว่าเคาะต่างจากสูตรแค่ไหน — **ไม่ใช่คำเตือน** สูตรเป็นข้อเสนอ ไม่ใช่คำสั่ง */
function deltaText(qty, suggested) {
  if (!suggested || !(qty > 0)) return null;
  if (qty === suggested) return { tone: "ok", text: "ตรงกับสูตร" };
  const diff = qty - suggested;
  return { tone: "warn", text: diff > 0 ? `สูงกว่าสูตร ${diff}` : `ต่ำกว่าสูตร ${-diff}` };
}

/* ⭐ `caption` — บรรทัด "ขอไป N พื้นที่ · …" ที่เดิมเป็น <p> ลอยอยู่ *ข้าง* การ์ด
   (เขียนไว้ก่อนตารางย้ายเข้าการ์ดเมื่อ 2026-09-15) ⇒ คำบรรยายแยกจากตารางที่มันอธิบาย
   ⚠️ ข้อความมาจาก `surveyChangeText` ตัวเดิม ตารางไม่ได้นับเอง — จอ TS · จอ SA ·
   กระดิ่ง ต้องเล่าตัวเลขชุดเดียวกัน */
export default function SurveyResultTable({
  zones = [], filesByZone = {}, canDecide = false, busyZone, onSaveDecisions,
  onPendingChange, caption = null,
}) {
  /* ร่างของหัวหน้า — key = id ของพื้นที่ · ค่าที่ไม่มีในนี้แปลว่า "ยังไม่ถูกแตะ"
     ⚠️ ห้ามเติมค่าตั้งต้นลงไปตอนเปิดจอ — ของที่เติมไว้ล่วงหน้าแยกไม่ออกจากของที่คนพิมพ์
        แล้ว "ยังไม่บันทึก" จะขึ้นทั้งใบตั้งแต่ยังไม่มีใครแตะอะไร */
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const patchDraft = useCallback((id, patch) => {
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] || {}), ...patch } }));
  }, []);

  const pending = useMemo(() => surveyPendingDecisions(zones, drafts), [zones, drafts]);

  /* 🔑 **ปุ่มส่งผลต้องรู้ว่ามีการเคาะค้างอยู่** — ตัวตัดสินของการ์ดควบคุมรับ
     `pendingDecisionZoneIds` มาตั้งแต่ PR2 แต่ยังไม่มีใครยิงธงให้ · ที่นี่คือคนยิง
     ⚠️ ส่งเป็นสตริงที่ join แล้วใน deps — อาร์เรย์ใหม่ทุกเรนเดอร์ทำให้ effect วนไม่จบ */
  const pendingKey = pending.ids.join("|");
  useEffect(() => {
    onPendingChange?.(pendingKey ? pendingKey.split("|") : []);
  }, [pendingKey, onPendingChange]);

  const saveAll = async () => {
    setSaveError("");
    const items = pending.rows
      .map((zone) => ({ zoneId: String(zone.id), payload: surveyDecisionPayload(zone, drafts[zone.id]) }))
      .filter((it) => it.payload);
    if (!items.length) return;
    setSaving(true);
    try {
      /* ⚠️ ล้างร่าง **เฉพาะพื้นที่ที่ลงจริง** — ล้างทั้งก้อนแล้วรอบที่ล้มเหลวจะกลืน
         ของที่หัวหน้าพิมพ์ไว้หายไปพร้อมกัน (กติกา "กดส่งซ้ำต้องไม่ทำของหาย") */
      const result = await onSaveDecisions?.(items);
      const savedIds = result?.savedIds || [];
      if (savedIds.length) {
        setDrafts((d) => {
          const next = { ...d };
          for (const id of savedIds) delete next[id];
          return next;
        });
      }
      if (result?.failure) setSaveError(result.failure.message || "บันทึกการเคาะไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  /* "ยกเลิก" = คืนร่างทั้งใบเป็นค่าที่อยู่ในฐาน — ไม่ยิงอะไรทั้งนั้น */
  const discardAll = () => { setDrafts({}); setSaveError(""); };

  /* แถบบนหัวการ์ด — ขึ้นเมื่อมีของค้างเท่านั้น (ปุ่มที่กดแล้วไม่เกิดอะไรคือปุ่มที่ไม่ควรมี)
     ⚠️ อยู่ใน `actions` ของ DetailCard ⇒ อยู่บรรทัดเดียวกับชื่อการ์ดบนจอกว้าง
        และตกลงมาเป็นแถวของตัวเองบนจอแคบ ตามกฎของเปลือกการ์ด */
  const bar = canDecide && pending.count ? (
    <div className={styles.saveBar}>
      <StatusBadge tone="info" icon={Pencil}>
        ยังไม่บันทึก {fmtNumber(pending.count)} พื้นที่
      </StatusBadge>
      <Button size="sm" variant="quiet" onClick={discardAll} disabled={saving}>ยกเลิก</Button>
      {/* 🔑 **ปุ่มกดไม่ได้ต้องโชว์เสมอ แล้วบอกเหตุตอนกด** (กติกาของโปรเจกต์) ⇒ ปุ่มอยู่
          ตลอด ส่วนเหตุที่กดไม่ได้เป็นตัวหนังสือใต้แถบ ไม่ใช่ปุ่มที่หายไปเงียบ ๆ */}
      <Button size="sm" onClick={saveAll} disabled={saving || !pending.canSave}>
        {saving ? "กำลังบันทึก..." : "บันทึกการเคาะ"}
      </Button>
    </div>
  ) : null;

  return (
    /* ⭐ ตารางในหน้ารายละเอียด = DetailCard + TableScroll (มติผู้ใช้ 2026-09-15 · ทรงเดียวกับ service/sites/[id])
       ⚠️ minWidth = ผลรวมความกว้างจริงของห้าคอลัมน์ที่วัดบนจอ 1440 · cells="stacked" เพราะ
       ทุกเซลล์ซ้อนสองบรรทัด (กฎ 5) · `styles.shell` อยู่ที่กล่องเลื่อนเอง (container ของ `.rowMiss`)
       🐞 **ต้องส่ง `surface="embedded"`** — ค่าตั้งต้นคือพื้นผิวของตารางที่ยืนเดี่ยวบนหน้าเปล่า
       (ขอบ + มุมมน + พื้น --panel + เงา) ⇒ อยู่ในการ์ดแล้วกลายเป็นพื้นการ์ดซ้อนพื้นการ์ด */
    <DetailCard
      icon={ClipboardList}
      title="สรุปผลประเมินรายพื้นที่"
      meta={caption || `${fmtNumber(zones.length)} พื้นที่`}
      actions={bar}
    >
      {/* เหตุที่ยังกดบันทึกไม่ได้ · และ error จากรอบที่เพิ่งล้ม — ตัวหนังสือใต้แถบ
          ⚠️ อยู่ในเนื้อการ์ด ไม่ใช่ในแถบ เพราะข้อความยาวกว่าที่แถวปุ่มรับไหว */}
      {canDecide && pending.blocked.length ? (
        <p className={styles.saveBlocked}>
          <AlertTriangle size={13} aria-hidden="true" />
          ยังบันทึกไม่ได้ — {pending.blocked.map((b) => `${b.zoneName || "พื้นที่ไม่มีชื่อ"}: ${b.error}`).join(" · ")}
        </p>
      ) : null}
      {saveError ? <p className={styles.saveBlocked}><AlertTriangle size={13} aria-hidden="true" />{saveError}</p> : null}

      <TableScroll surface="embedded" minWidth={TABLE_MIN_WIDTH} cells="stacked" className={styles.shell}>
        <table>
          <thead>
            <tr>
              <th>พื้นที่</th>
              <th>แพ็คเกจ/เดือน</th>
              <th>จุดติดตั้ง</th>
              <th>ขนาด (ม.)</th>
              <th>รูป</th>
            </tr>
          </thead>
          <tbody className={styles.body}>
            {zones.map((zone) => {
              const cut = zone.status === "cut";
              const size = surveyZoneSize(zone.parts);
              const suggested = surveySuggestedFor(zone);
              const files = filesByZone[zone.id] || [];
              const docs = surveyDocCounts(files);
              const miss = surveyResultMissing(zone, files);
              const missText = cut ? "" : [...miss.field, ...miss.result].join(" · ");
              const spots = Array.isArray(zone.spots) ? zone.spots : [];
              const busy = busyZone === zone.id || saving;

              /* 🔑 **ทุกค่าที่วาดมาจากร่าง ไม่ใช่จากแถว** — ไม่งั้นกดเพิ่มแล้วตัวเลขไม่ขยับ
                 จนกว่าจะบันทึก ซึ่งคือจอที่ดูเหมือนปุ่มเสีย */
              const draft = surveyDecisionDraft(zone, drafts[zone.id]);
              const dirty = surveyDecisionDirty(zone, drafts[zone.id]);
              const rowError = dirty ? surveyDecisionError(zone, drafts[zone.id]) : null;
              const picked = draft.spotIds.length;
              const delta = deltaText(draft.packageQty, suggested);
              /* ต้องบอกเหตุผลไหม — อ่านจาก **ร่าง** เพื่อให้ช่องเหตุผลโผล่ทันทีที่กดจนต่างจากสูตร
                 ไม่ใช่หลังบันทึกแล้วถึงรู้ว่าต้องกรอก */
              const needNote = draft.packageQty !== null && !!suggested && draft.packageQty !== suggested;

              const bump = (by) => {
                const base = draft.packageQty || suggested || 1;
                patchDraft(zone.id, { packageQty: Math.min(99, Math.max(1, base + by)) });
              };
              const toggleSpot = (spotId) => {
                const id = String(spotId);
                const next = draft.spotIds.includes(id)
                  ? draft.spotIds.filter((x) => x !== id)
                  : [...draft.spotIds, id];
                patchDraft(zone.id, { spotIds: next });
              };

              return (
                <Fragment key={zone.id}>
                <tr className={cut ? styles.cut : undefined} data-miss={missText ? "1" : undefined}
                  data-dirty={dirty ? "1" : undefined}>
                  <td data-label="พื้นที่">
                    <b>{zone.zoneName}</b>
                    <span className={styles.sub}>
                      {/* ⚠️ "เพิ่มหน้างาน" ต้องอ่านออกจาก `status` ไม่ใช่จาก `!zoneId` — พื้นที่ที่
                          ช่างเพิ่มได้รหัส ZN ทันที ส่วนพื้นที่ใหม่ของ SA รอถึงตอนกดส่งใบ */}
                      {[zone.floor ? `ชั้น ${zone.floor}` : null,
                        zone.status === "added" ? "ช่างเพิ่มหน้างาน" : null,
                        zone.zoneId ? null : "พื้นที่ใหม่"]
                        .filter(Boolean).join(" · ") || naText(null)}
                    </span>
                    {dirty ? <span className={styles.rowDirty}><Pencil size={11} aria-hidden="true" />ยังไม่บันทึก</span> : null}
                  </td>

                  {cut ? (
                    /* ⚠️ พื้นที่ที่ตัดออกยังต้องอยู่ในตาราง — SA ต้องเห็นว่าอะไรหายไปและเพราะอะไร
                       (ของที่หายจากสิ่งที่เขาจะเสนอราคา คือของที่ลูกค้าจะถาม) */
                    <td colSpan={4} className={styles.cutCell} data-label="สถานะ">
                      <span>ตัดออกหน้างาน — {naText(zone.cutReason)}</span>
                      <span className={styles.sub}>ไม่นับรวมในผลที่ส่งให้ฝ่ายขาย · พื้นที่ยังอยู่ในทะเบียน ประเมินใหม่ได้</span>
                    </td>
                  ) : (
                    <>
                      {/* ── แพ็คเกจ — สูตรเสนอ หัวหน้าเคาะ ─────────────────── */}
                      <td data-label="แพ็คเกจ/เดือน">
                        {canDecide ? (
                          <div className={styles.stepper}>
                            <button type="button" aria-label="ลดแพ็คเกจ" disabled={busy} onClick={() => bump(-1)}>
                              <Minus size={13} aria-hidden="true" />
                            </button>
                            <b>{naText(draft.packageQty)}</b>
                            <button type="button" aria-label="เพิ่มแพ็คเกจ" disabled={busy} onClick={() => bump(1)}>
                              <Plus size={13} aria-hidden="true" />
                            </button>
                          </div>
                        ) : (
                          <b className={styles.qty}>{naText(draft.packageQty)}</b>
                        )}
                        <span className={styles.sub}>
                          สูตร {suggested ?? naText(null)}
                          {delta ? <> · <span className={styles.delta} data-tone={delta.tone}>{delta.text}</span></> : null}
                        </span>
                        {draft.packageQty === null && suggested && canDecide ? (
                          <Button size="sm" variant="quiet" disabled={busy}
                            onClick={() => patchDraft(zone.id, { packageQty: suggested })}>
                            ใช้ {suggested} ที่สูตรบอก
                          </Button>
                        ) : null}
                        {/* 🔴 ทับสูตรแล้วต้องบอกเหตุผล — ของที่ต่างจากที่ SA จะเสนอราคา
                            คือของที่ลูกค้าจะถาม และ SA ไม่ได้ไปหน้างาน
                            🐞 **ช่องต้องอยู่ต่อตราบใดที่ยังมีข้อความอยู่ในนั้น** แม้จะกดกลับมา
                              ตรงกับสูตรแล้ว — ของเดิมผูกช่องไว้กับ `needNote` อย่างเดียว ⇒ พิมพ์
                              เหตุผล แล้วกดลดกลับเป็นเลขเดิม: ช่องหายไปพร้อมข้อความที่ยังค้างอยู่
                              ในร่าง ⇒ แถบยังขึ้น "ยังไม่บันทึก 1 พื้นที่" โดยที่ **ไม่มีอะไรบนจอ
                              ให้แก้หรือให้ลบเลย** (วัดจริงทั้ง 1440/1024/390) */}
                        {canDecide && (needNote || draft.packageNote) ? (
                          <div className={styles.noteBox}>
                            {needNote
                              ? <span className={styles.req}>ต้องบอกเหตุผล</span>
                              : <span className={styles.sub}>เหตุผลที่ต่างจากสูตร (ตอนนี้ตรงกับสูตรแล้ว — ลบทิ้งได้)</span>}
                            <Input
                              value={draft.packageNote} disabled={busy} maxLength={500} autoComplete="off"
                              placeholder="ทำไมถึงต่างจากสูตร"
                              onChange={(e) => patchDraft(zone.id, { packageNote: e.target.value })}
                            />
                          </div>
                        ) : null}
                        {!canDecide && zone.packageNote ? (
                          <span className={styles.note}>เหตุผลที่ต่างจากสูตร: {naText(zone.packageNote)}</span>
                        ) : null}
                      </td>

                      {/* ── จุดติดตั้ง — ติ๊กจากที่ช่างแจ้งมา ────────────────── */}
                      <td data-label="จุดติดตั้ง">
                        {spots.length === 0 ? (
                          <span className={styles.warnText}>ช่างยังไม่แจ้งจุดสักจุด</span>
                        ) : (
                          <>
                            {/* ชุดตัวเลือกเล็กตายตัวต้องกางให้เห็น ไม่ใช่ดรอปดาวน์ (กติกาคอนโทรล)
                                ไม่มีสิทธิ์เคาะ = ไม่โชว์ปุ่ม ⇒ ชิปเป็นตัวหนังสือ */}
                            <div className={styles.spots}>
                              {spots.map((s) => {
                                const on = draft.spotIds.includes(String(s.id));
                                return canDecide ? (
                                  <button
                                    key={s.id} type="button" className={styles.spotChip}
                                    data-on={on ? "1" : undefined}
                                    disabled={busy}
                                    aria-pressed={on ? "true" : "false"}
                                    onClick={() => toggleSpot(s.id)}
                                  >
                                    {on && <Check size={12} aria-hidden="true" />}
                                    {s.label}
                                  </button>
                                ) : (
                                  <span key={s.id} className={styles.spotChip} data-on={on ? "1" : undefined}>
                                    {on && <Check size={12} role="img" aria-label="เลือกติดตั้ง" />}
                                    {s.label}
                                  </span>
                                );
                              })}
                            </div>
                            <span className={styles.sub}>เลือก {picked} / {spots.length}</span>
                          </>
                        )}
                      </td>

                      <td className={styles.dims} data-label="ขนาด (ม.)">
                        {(zone.parts || []).map((p, i) => (
                          <span key={p.id || i}>
                            {fmtNumber(p.widthM)} × {fmtNumber(p.lengthM)} × {fmtNumber(p.heightM)}
                          </span>
                        ))}
                        <span className={styles.sub}>
                          {fmtNumber(size.volumeCbm)} ลบ.ม.{size.parts > 1 ? ` · ${size.parts} ส่วน` : ""}
                        </span>
                      </td>

                      {/* ⚠️ ตัวเลขสามตัวกับขีดคั่นต้องอยู่ใน **element เดียว** — ที่ ≤680px เซลล์เป็น
                          กริดป้าย/ค่า ซึ่งจับ *ลูกทุกตัว* เป็นช่องของกริด ⇒ ขีด "/" ที่เป็น
                          text node ลอย ๆ กลายเป็นช่องของตัวเอง แล้ว "1 / 1 / 0" แตกเป็นสี่บรรทัด */}
                      <td className={styles.docs} data-label="รูป">
                        <span className={styles.docsVal}>
                          <span>{docs.wide}</span> / <span data-low={docs.plan === 0 ? "1" : undefined}>{docs.plan}</span> / <span>{docs.spot}</span>
                        </span>
                        <span className={styles.sub}>กว้าง / ผัง / จุด</span>
                      </td>
                    </>
                  )}
                </tr>
                {/* เหตุผลที่ยังส่งไม่ได้ต้องเป็นตัวหนังสือบนแถวที่ติด ไม่ใช่กองรวมข้างล่าง
                    ⭐ **แถวย่อยเต็มกว้างใต้แถวของมัน ไม่ใช่ท้ายคอลัมน์ "รูป"** — 🐞 เดิมอยู่ในคอลัมน์
                    ที่แคบที่สุด (~113px ที่ 768) ⇒ ข้อความยาวที่สุดของแถวห่อ 5–6 บรรทัด แถวสูง ~150px
                    และบนมือถืออยู่ขอบขวาสุดของตารางที่ต้องปัดข้างถึงจะเห็น */}
                {/* ⚠️ แยกแถวแล้ว screen reader ไล่ทีละแถวจะได้ยินคำเตือนโดยไม่รู้ว่าของพื้นที่ไหน
                    (WCAG 1.3.1) ⇒ เติมชื่อพื้นที่แบบซ่อนจากตา · ไม่ใช้ `headers` ชี้ไป td
                    เพราะสเปกให้ชี้ได้แค่ th และ screen reader หลายตัวไม่อ่าน */}
                {(missText || rowError) && (
                  <tr data-miss-row="1">
                    <td colSpan={5}>
                      {rowError ? (
                        <span className={styles.rowMiss} data-block="1">
                          <span className={styles.srOnly}>
                            {`${String(zone.zoneName || "").trim() || "พื้นที่ไม่มีชื่อ"} บันทึกไม่ได้: `}
                          </span>
                          <AlertTriangle size={12} aria-hidden="true" />
                          {rowError}
                        </span>
                      ) : null}
                      {missText ? (
                        <span className={styles.rowMiss}>
                          <span className={styles.srOnly}>
                            {`${String(zone.zoneName || "").trim() || "พื้นที่ไม่มีชื่อ"} ยังไม่ผ่าน: `}
                          </span>
                          <AlertTriangle size={12} aria-hidden="true" />
                          {missText}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
    </DetailCard>
  );
}
