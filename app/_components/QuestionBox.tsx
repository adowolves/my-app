"use client";
// ⑤ 사내 LLM 질문문: 빠른/보통 선택, 글상자, 복사 버튼. PRD 5절 must 2 규칙 1~6
import { useRef, useState } from "react";
import { buildQuestion, MAX_QUESTION_LENGTH } from "@/lib/buildQuestion";
import type { AnswerMode, CounselItem, Selection } from "@/lib/types";

const MODES: { value: AnswerMode; label: string; hint: string }[] = [
  { value: "fast", label: "빠른 답변", hint: "1순위 자료 1개 · 3문장 이내" },
  { value: "normal", label: "보통 답변", hint: "자료 최대 3개 · 10문장 이내" },
];

type Props = {
  /** [추천 받기]를 누른 순간의 선택 (그 뒤에 버튼을 바꿔도 질문문은 그대로) */
  selection: Selection;
  results: CounselItem[];
  mode: AnswerMode;
  onModeChange: (mode: AnswerMode) => void;
};

export default function QuestionBox({ selection, results, mode, onModeChange }: Props) {
  const question = buildQuestion({ ...selection, mode }, results);
  const hint = MODES.find(m => m.value === mode)?.hint;
  const boxRef = useRef<HTMLTextAreaElement>(null);
  // 마지막으로 복사를 시도한 글과 결과. 질문문이 바뀌면 안내가 저절로 사라진다.
  const [copy, setCopy] = useState<{ text: string; ok: boolean } | null>(null);
  const copyStatus = copy?.text === question ? (copy.ok ? "copied" : "failed") : null;

  async function copyQuestion() {
    try {
      await navigator.clipboard.writeText(question);
      setCopy({ text: question, ok: true });
    } catch {
      // 사내 PC 보안 정책 등으로 막히면 글상자를 선택해 직접 복사하게 한다(규칙 6).
      setCopy({ text: question, ok: false });
      boxRef.current?.focus();
      boxRef.current?.select();
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="답변 길이" className="flex flex-wrap items-center gap-2">
        {MODES.map(m => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={mode === m.value}
            onClick={() => onModeChange(m.value)}
            className={
              "rounded-full border px-3 py-1.5 text-sm transition-colors " +
              (mode === m.value
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800")
            }
          >
            {m.label}
          </button>
        ))}
        <span className="text-sm text-zinc-500">{hint}</span>
      </div>
      <label htmlFor="question" className="sr-only">
        사내 LLM 질문문
      </label>
      <textarea
        id="question"
        ref={boxRef}
        readOnly
        value={question}
        rows={9}
        onFocus={e => e.currentTarget.select()}
        className="w-full resize-y rounded-lg border border-zinc-300 bg-zinc-50 p-3 text-sm leading-relaxed dark:border-zinc-700 dark:bg-zinc-900"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={copyQuestion}
            className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
          >
            사내 LLM 질문문 복사
          </button>
          <p role="status" className="text-sm font-medium">
            {copyStatus === "copied" && <span className="text-green-700 dark:text-green-400">✓ 복사됨</span>}
            {copyStatus === "failed" && (
              <span className="text-red-600">⚠ 복사가 안 됐어요 — 글상자에서 직접 복사하세요</span>
            )}
          </p>
        </div>
        <p className="text-xs tabular-nums text-zinc-500">
          {question.length}/{MAX_QUESTION_LENGTH}자
        </p>
      </div>
    </div>
  );
}
