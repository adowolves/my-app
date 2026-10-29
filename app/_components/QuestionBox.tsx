"use client";
// ⑤ 사내 LLM 질문문: 빠른/보통 선택, 글상자, 복사 버튼. PRD 5절 must 2 규칙 1~6
import { useRef } from "react";
import { buildQuestion, MAX_QUESTION_LENGTH } from "@/lib/buildQuestion";
import { ruleLabels } from "@/lib/ruleRefs";
import type { AnswerMode, CounselItem, RuleArticle, Selection } from "@/lib/types";
import ClaudeAnswer from "./ClaudeAnswer";
import { useCopy } from "./useCopy";

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
  /** 출처에 관련 요강 조문 번호·제목을 적기 위한 요강조문 */
  articles: Record<string, RuleArticle>;
};

export default function QuestionBox({ selection, results, mode, onModeChange, articles }: Props) {
  // 자료마다 관련 요강 조문(번호·제목)을 출처에 적는다. /api/answer도 같은 방식으로 질문문을 만든다.
  const question = buildQuestion({ ...selection, mode }, results, results.map(item => ruleLabels(item.rule, articles)));
  const hint = MODES.find(m => m.value === mode)?.hint;
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const { copy, statusFor } = useCopy();
  const copyStatus = statusFor(question);

  async function copyQuestion() {
    if (!(await copy(question))) {
      // 복사가 막히면 글상자를 선택해 직접 복사하게 한다(규칙 6).
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
              "min-h-10 rounded-full border px-4 py-1.5 text-sm transition-colors " +
              (mode === m.value
                ? "border-blue-600 bg-blue-600 font-semibold text-white"
                : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800")
            }
          >
            {mode === m.value && <span aria-hidden>✓ </span>}
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
            className="min-h-12 rounded-lg bg-blue-600 px-5 text-lg font-bold text-white shadow-sm hover:bg-blue-700"
          >
            📋 사내 LLM 질문문 복사
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
      {/* 답변 받을 LLM 선택(nice): 사내 LLM은 위 복사로, Claude는 아래 버튼으로. 질문문이 바뀌면 답도 처음 상태로 돌린다.
          추천 자료가 0건이면 근거 없는 답이 나오므로 Claude 버튼을 보이지 않는다(서버도 같은 이유로 거절). */}
      {results.length > 0 ? (
        <ClaudeAnswer key={question} selection={{ ...selection, mode }} />
      ) : (
        <p className="text-sm text-zinc-500">추천 자료가 없어 Claude 답변은 쓸 수 없어요. 위 질문문을 사내 LLM에 붙여넣어 쓰세요.</p>
      )}
    </div>
  );
}
