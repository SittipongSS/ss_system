"use client";
import { ChevronRight, CircleCheck } from "lucide-react";

// Horizontal pipeline rail for one track. Shows every stage with its live
// count, the forward arrows between them, and highlights the stage(s) the
// current department OWNS (acts on) so a user instantly sees "my lane".
//
// Props:
//   track   — TRACK1 / TRACK2 from lib/tax/status.js ({ label, stages[] })
//   counts  — { [stageKey]: number }
//   dept    — current user's department code ("SA" | "LG" | "AD" | null)
//   onStage — optional (stageKey) => void; makes a stage clickable (filter)
//
// Card-first: on narrow screens the stages wrap and the arrows hide (CSS).
export default function TaxStageRail({ track, counts = {}, dept, onStage }) {
  return (
    <div>
      <div className="text-[13px] font-semibold text-[var(--text)] mb-2">{track.label}</div>
      <div className="flex items-stretch gap-1.5 flex-wrap">
        {track.stages.map((stage, i) => {
          const count = counts[stage.key] ?? 0;
          const mine = dept && stage.owner === dept;
          const isDone = stage.done;
          const clickable = !!onStage;
          const Tag = clickable ? "button" : "div";
          return (
            <div key={stage.key} className="flex items-stretch gap-1.5 flex-1 min-w-[140px]">
              <Tag
                onClick={clickable ? () => onStage(stage.key) : undefined}
                className={[
                  "flex-1 text-left rounded-[var(--radius)] px-3 py-2.5 border transition-colors",
                  clickable ? "cursor-pointer hover:border-[var(--accent)]" : "",
                  mine
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : isDone
                      ? "border-[var(--border)] bg-[var(--green-soft)]"
                      : "border-[var(--border)] bg-[var(--panel)]",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={[
                      "text-[12px] inline-flex items-center gap-1.5",
                      mine ? "text-[var(--accent)] font-semibold" : isDone ? "text-[var(--green)]" : "text-[var(--text-3)]",
                    ].join(" ")}
                  >
                    {isDone && <CircleCheck size={14} />}
                    {stage.label}
                  </span>
                  <span className={`text-[13px] font-bold font-mono ${mine ? "text-[var(--accent)]" : isDone ? "text-[var(--green)]" : "text-[var(--text)]"}`}>
                    {count}
                  </span>
                </div>
                {mine && <div className="text-[10px] text-[var(--accent)] mt-0.5 font-medium">งานของฝ่ายคุณ</div>}
              </Tag>
              {i < track.stages.length - 1 && (
                <div className="hidden md:flex items-center text-[var(--text-3)] shrink-0">
                  <ChevronRight size={16} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
