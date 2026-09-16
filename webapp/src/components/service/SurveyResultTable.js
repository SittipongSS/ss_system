"use client";
// ── ตารางสรุปผลประเมินของหัวหน้า TS (เฟส 3 · จอ 07) ─────────────────────
//
// ⭐ **ช่างส่งข้อเท็จจริงมาจากหน้างาน หัวหน้าตัดสินสองอย่าง**: จะติดตั้งจุดไหนบ้าง
//   และแต่ละพื้นที่ใช้กี่แพ็คเกจ (มติผู้ใช้ 2026-08-29)
//   ⇒ ตารางนี้มี **สองคอลัมน์ที่ต้องกรอก ไม่ใช่คอลัมน์เดียว** · ที่เหลืออ่านอย่างเดียว
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
import { Fragment, useState } from "react";
import { AlertTriangle, Check, ClipboardList, Minus, Plus } from "lucide-react";
import Button from "@/components/ui/Button";
import { DetailCard } from "@/components/ui/DetailPage";
import Input from "@/components/ui/Input";
import { TableScroll } from "@/components/ui/Table";
import {
  packageNeedsNote, surveyDocCounts, surveyResultMissing, surveyZoneSize, suggestedPackages,
} from "@/lib/service/survey";
import { fmtNumber, naText } from "@/lib/format";
import styles from "./SurveyResultTable.module.css";

/* วัดโหมดเคาะ (2026-09-15 · มีช่องเหตุผล + ปุ่มใช้สูตร + บรรทัดขาดอะไร): ดูอย่างเดียวรวม 573px
   แต่ตอนเคาะช่องเหตุผลกิน 160px · 🐞 640 เดิมคิดจากโหมดดูอย่างเดียว ⇒ แถวสูง 175px
   บรรทัด "ขาด…" ห่อ 6 บรรทัด · 680 ⇒ 138px และยังไม่เกินกรอบแท็บเล็ต (696px)
   มือถือเห็นปุ่ม −/+ ตั้งแต่จอแรกทั้ง 390 และ 320 */
const TABLE_MIN_WIDTH = 680;

/* ป้ายบอกว่าเคาะต่างจากสูตรแค่ไหน — **ไม่ใช่คำเตือน** สูตรเป็นข้อเสนอ ไม่ใช่คำสั่ง */
function deltaText(qty, suggested) {
  if (!suggested || !(qty > 0)) return null;
  if (qty === suggested) return { tone: "ok", text: "ตรงกับสูตร" };
  const diff = qty - suggested;
  return { tone: "warn", text: diff > 0 ? `สูงกว่าสูตร ${diff}` : `ต่ำกว่าสูตร ${-diff}` };
}

export default function SurveyResultTable({ zones = [], filesByZone = {}, canDecide = false, busyZone, onDecide }) {
  const [drafts, setDrafts] = useState({});
  const draftOf = (zone) => drafts[zone.id] ?? { packageNote: zone.packageNote || "" };
  const setDraft = (id, patch) => setDrafts((d) => ({ ...d, [id]: { ...(d[id] || {}), ...patch } }));

  return (
    /* ⭐ ตารางในหน้ารายละเอียด = DetailCard + TableScroll (มติผู้ใช้ 2026-09-15 · ทรงเดียวกับ service/sites/[id])
       🔄 เดิม TableShell เปล่า ไม่มีหัว — ตารางลอยไม่มีชื่อ ไม่รู้ว่ามีกี่พื้นที่จนกว่าจะนับเอง
       ⚠️ minWidth = ผลรวมความกว้างจริงของห้าคอลัมน์ที่วัดบนจอ 1440 · cells="stacked" เพราะ
       ทุกเซลล์ซ้อนสองบรรทัด (กฎ 5) · `styles.shell` อยู่ที่กล่องเลื่อนเอง (container ของ `.rowMiss`)
       🐞 **ต้องส่ง `surface="embedded"`** — ค่าตั้งต้นคือ `auto` = พื้นผิวของตารางที่ยืนเดี่ยว
       บนหน้าเปล่า: ขอบ + มุมมน + **พื้น --panel + เงา --shadow-sm** · อยู่ในการ์ดแล้วสองพจน์
       หลังคือพื้นการ์ดซ้อนพื้นการ์ดกับเงาข้างใน ส่วน `embedded` คือรูปที่ระบบตั้งใจให้ตาราง
       ในการ์ดเป็น (48 จุด — เหตุผลอยู่ที่กฎ surface ใน Table.module.css)
       ⚠️ **ที่เปลี่ยนจริงคือพื้นกับเงา ไม่ใช่ขนาดกล่อง** (วัดเทียบภาพก่อน/หลัง 2026-09-16):
       ระยะ 16px จากขอบการ์ดมาจาก `.cardBody` (padding --panel-inset) และกฎ `.cardBody
       [data-surface="embedded"]` ล้างมาร์จินของ embedded ทิ้ง ⇒ auto กับ embedded กินกล่อง
       เท่ากันเป๊ะ และ **เส้นขอบ 1px ยังอยู่ทั้งสองแบบ** · อยากให้ตารางชิดขอบการ์ดแบบในม็อก
       ต้องไปทำที่ primitive (พื้นผิวที่ไม่มีขอบ + มาร์จินติดลบเท่า --panel-inset) ไม่ใช่ prop นี้
       ⚠️ บนจอ ≤680 กฎ `.shell` ข้างล่างถอดขอบ/เงา/มุมทิ้งอยู่แล้วทั้ง auto และ embedded
       ⇒ ที่แคบสุดต่างกันแค่พื้น --panel ที่หายไป */
    <DetailCard icon={ClipboardList} title="สรุปผลประเมินรายพื้นที่" meta={`${fmtNumber(zones.length)} พื้นที่`}>
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
              const suggested = suggestedPackages(size.volumeCbm);
              const files = filesByZone[zone.id] || [];
              const docs = surveyDocCounts(files);
              const miss = surveyResultMissing(zone, files);
              const missText = cut ? "" : [...miss.field, ...miss.result].join(" · ");
              const spots = Array.isArray(zone.spots) ? zone.spots : [];
              const picked = spots.filter((s) => s?.selected === true).length;
              const delta = deltaText(Number(zone.packageQty), suggested);
              const needNote = packageNeedsNote(zone);
              const draft = draftOf(zone);
              const busy = busyZone === zone.id;

              const bump = (by) => {
                const next = Math.max(1, (Number(zone.packageQty) || suggested || 1) + by);
                onDecide(zone.id, { packageQty: next, packageNote: draft.packageNote || zone.packageNote || undefined });
              };

              return (
                <Fragment key={zone.id}>
                <tr className={cut ? styles.cut : undefined} data-miss={missText ? "1" : undefined}>
                  <td>
                    <b>{zone.zoneName}</b>
                    <span className={styles.sub}>
                      {/* ⚠️ "เพิ่มหน้างาน" ต้องอ่านออกจาก `status` ไม่ใช่จาก `!zoneId` — พื้นที่ที่
                          ช่างเพิ่มได้รหัส ZN ทันที ส่วนพื้นที่ใหม่ของ SA รอถึงตอนกดส่งใบ */}
                      {[zone.floor ? `ชั้น ${zone.floor}` : null,
                        zone.status === "added" ? "ช่างเพิ่มหน้างาน" : null,
                        zone.zoneId ? null : "พื้นที่ใหม่"]
                        .filter(Boolean).join(" · ") || naText(null)}
                    </span>
                  </td>

                  {cut ? (
                    /* ⚠️ พื้นที่ที่ตัดออกยังต้องอยู่ในตาราง — SA ต้องเห็นว่าอะไรหายไปและเพราะอะไร
                       (ของที่หายจากสิ่งที่เขาจะเสนอราคา คือของที่ลูกค้าจะถาม) */
                    <td colSpan={4} className={styles.cutCell}>
                      ตัดออกหน้างาน — {naText(zone.cutReason)}
                      <span className={styles.sub}>ไม่นับรวมในผลที่ส่งให้ฝ่ายขาย · พื้นที่ยังอยู่ในทะเบียน ประเมินใหม่ได้</span>
                    </td>
                  ) : (
                    <>
                      {/* ── แพ็คเกจ — สูตรเสนอ หัวหน้าเคาะ ─────────────────── */}
                      <td>
                        {canDecide ? (
                          <div className={styles.stepper}>
                            <button type="button" aria-label="ลดแพ็คเกจ" disabled={busy} onClick={() => bump(-1)}>
                              <Minus size={13} aria-hidden="true" />
                            </button>
                            <b>{naText(zone.packageQty)}</b>
                            <button type="button" aria-label="เพิ่มแพ็คเกจ" disabled={busy} onClick={() => bump(1)}>
                              <Plus size={13} aria-hidden="true" />
                            </button>
                          </div>
                        ) : (
                          <b className={styles.qty}>{naText(zone.packageQty)}</b>
                        )}
                        <span className={styles.sub}>
                          สูตร {suggested ?? naText(null)}
                          {delta ? <> · <span className={styles.delta} data-tone={delta.tone}>{delta.text}</span></> : null}
                        </span>
                        {!zone.packageQty && suggested && canDecide ? (
                          <Button size="sm" variant="quiet" disabled={busy}
                            onClick={() => onDecide(zone.id, { packageQty: suggested })}>
                            ใช้ {suggested} ที่สูตรบอก
                          </Button>
                        ) : null}
                        {/* 🔴 ทับสูตรแล้วต้องบอกเหตุผล — ของที่ต่างจากที่ SA จะเสนอราคา
                            คือของที่ลูกค้าจะถาม และ SA ไม่ได้ไปหน้างาน */}
                        {needNote && (canDecide ? (
                          <div className={styles.noteBox}>
                            <span className={styles.req}>ต้องบอกเหตุผล</span>
                            <Input
                              value={draft.packageNote} disabled={busy} maxLength={500} autoComplete="off"
                              placeholder="ทำไมถึงต่างจากสูตร"
                              onChange={(e) => setDraft(zone.id, { packageNote: e.target.value })}
                              onBlur={() => {
                                const next = (draft.packageNote || "").trim();
                                if (next && next !== (zone.packageNote || "")) onDecide(zone.id, { packageNote: next });
                              }}
                            />
                          </div>
                        ) : (
                          <span className={styles.note}>เหตุผลที่ต่างจากสูตร: {naText(zone.packageNote)}</span>
                        ))}
                      </td>

                      {/* ── จุดติดตั้ง — ติ๊กจากที่ช่างแจ้งมา ────────────────── */}
                      <td>
                        {spots.length === 0 ? (
                          <span className={styles.warnText}>ช่างยังไม่แจ้งจุดสักจุด</span>
                        ) : (
                          <>
                            {/* ชุดตัวเลือกเล็กตายตัวต้องกางให้เห็น ไม่ใช่ดรอปดาวน์ (กติกาคอนโทรล)
                                ไม่มีสิทธิ์เคาะ = ไม่โชว์ปุ่ม ⇒ ชิปเป็นตัวหนังสือ */}
                            <div className={styles.spots}>
                              {spots.map((s) => (canDecide ? (
                                <button
                                  key={s.id} type="button" className={styles.spotChip}
                                  data-on={s.selected ? "1" : undefined}
                                  disabled={busy}
                                  aria-pressed={s.selected ? "true" : "false"}
                                  onClick={() => onDecide(zone.id, {
                                    selectedSpotIds: spots
                                      .filter((x) => (x.id === s.id ? !x.selected : x.selected))
                                      .map((x) => x.id),
                                  })}
                                >
                                  {s.selected && <Check size={12} aria-hidden="true" />}
                                  {s.label}
                                </button>
                              ) : (
                                <span key={s.id} className={styles.spotChip} data-on={s.selected ? "1" : undefined}>
                                  {s.selected && <Check size={12} role="img" aria-label="เลือกติดตั้ง" />}
                                  {s.label}
                                </span>
                              )))}
                            </div>
                            <span className={styles.sub}>เลือก {picked} / {spots.length}</span>
                          </>
                        )}
                      </td>

                      <td className={styles.dims}>
                        {(zone.parts || []).map((p, i) => (
                          <span key={p.id || i}>
                            {fmtNumber(p.widthM)} × {fmtNumber(p.lengthM)} × {fmtNumber(p.heightM)}
                          </span>
                        ))}
                        <span className={styles.sub}>
                          {fmtNumber(size.volumeCbm)} ลบ.ม.{size.parts > 1 ? ` · ${size.parts} ส่วน` : ""}
                        </span>
                      </td>

                      <td className={styles.docs}>
                        <span>{docs.wide}</span> / <span data-low={docs.plan === 0 ? "1" : undefined}>{docs.plan}</span> / <span>{docs.spot}</span>
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
                {missText && (
                  <tr data-miss-row="1">
                    <td colSpan={5}>
                      <span className={styles.rowMiss}>
                        <span className={styles.srOnly}>
                          {`${String(zone.zoneName || "").trim() || "พื้นที่ไม่มีชื่อ"} ยังไม่ผ่าน: `}
                        </span>
                        <AlertTriangle size={12} aria-hidden="true" />
                        {missText}
                      </span>
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
