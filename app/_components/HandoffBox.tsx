"use client";
// 이관 메모(nice): "다음 담당자에게" 한 줄을 받아 메모를 만들고 복사한다. 앱은 저장하지 않는다. PRD 5절 nice 이관 메모
import { useRef, useState } from "react";
import { buildHandoff, MAX_HANDOFF_LENGTH, MAX_NOTE_LENGTH } from "@/lib/buildHandoff";
import type { CounselItem, Selection } from "@/lib/types";
import { checkText, INPUT_ERROR_MESSAGE } from "@/lib/validate";
import { useCopy } from "./useCopy";

type Props = {
  selection: Selection;
  results: CounselItem[];
};

export default function HandoffBox({ selection, results }: Props) {
  const [note, setNote] = useState("");
  const noteError = checkText(note, MAX_NOTE_LENGTH);
  const memo = buildHandoff(selection, results, noteError ? "" : note);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const { copy, statusFor } = useCopy();
  const copyStatus = statusFor(memo);

  async function copyMemo() {
    if (noteError) return;
    if (!(await copy(memo))) {
      boxRef.current?.focus();
      boxRef.current?.select();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-zinc-500">공식 상담 시스템에 붙여넣어 다음 담당자에게 넘기세요. 이 앱은 메모를 저장하지 않아요.</p>
      <div className="flex items-center gap-2">
        <label htmlFor="handoff-note" className="shrink-0 text-sm font-medium">
          다음 담당자에게
        </label>
        <input
          id="handoff-note"
          value={note}
          maxLength={MAX_NOTE_LENGTH}
          placeholder="예: 소득 증빙 서류 제출 여부 확인 필요"
          autoComplete="off"
          aria-invalid={noteError !== null}
          aria-describedby={noteError ? "handoff-note-error" : undefined}
          onChange={e => setNote(e.target.value)}
          className={
            "min-w-0 flex-1 rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 " +
            (noteError ? "border-red-500 focus:ring-red-300" : "border-zinc-300 focus:ring-blue-300 dark:border-zinc-700")
          }
        />
        <span className="w-12 shrink-0 text-right text-xs tabular-nums text-zinc-500">
          {note.length}/{MAX_NOTE_LENGTH}
        </span>
      </div>
      {noteError && (
        <p id="handoff-note-error" role="alert" className="text-sm font-medium text-red-600">
          ⚠ {INPUT_ERROR_MESSAGE[noteError]}
        </p>
      )}
      <label htmlFor="handoff-memo" className="sr-only">
        이관 메모
      </label>
      <textarea
        id="handoff-memo"
        ref={boxRef}
        readOnly
        value={memo}
        rows={5}
        onFocus={e => e.currentTarget.select()}
        className="w-full resize-y rounded-lg border border-zinc-300 bg-zinc-50 p-3 text-sm leading-relaxed dark:border-zinc-700 dark:bg-zinc-900"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={copyMemo}
            disabled={noteError !== null}
            className="rounded-lg border border-blue-600 px-4 py-2 font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-300 dark:hover:bg-blue-950"
          >
            이관 메모 복사
          </button>
          <p role="status" className="text-sm font-medium">
            {copyStatus === "copied" && <span className="text-green-700 dark:text-green-400">✓ 복사됨</span>}
            {copyStatus === "failed" && (
              <span className="text-red-600">⚠ 복사가 안 됐어요 — 글상자에서 직접 복사하세요</span>
            )}
          </p>
        </div>
        <p className="text-xs tabular-nums text-zinc-500">
          {memo.length}/{MAX_HANDOFF_LENGTH}자
        </p>
      </div>
    </div>
  );
}
