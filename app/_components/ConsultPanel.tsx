"use client";
// 화면 전체의 상태(버튼 선택·키워드·추천 결과·답변 길이)를 들고 각 영역을 그린다. 설계 근거: DESIGN.md §3 화면 구성
// 추천 계산은 브라우저 안에서 바로 한다(서버로 보내지 않음). 설계 근거: DESIGN.md §4.2
import { useState } from "react";
import { recommendWithScope } from "@/lib/recommend";
import { BUTTON_KEYS, type AnswerMode, type ButtonKey, type CounselData, type Selection } from "@/lib/types";
import { validateSelection } from "@/lib/validate";
import ButtonGroups from "./ButtonGroups";
import HandoffBox from "./HandoffBox";
import KeywordInput from "./KeywordInput";
import QuestionBox from "./QuestionBox";
import ResultCards, { type Outcome } from "./ResultCards";

export default function ConsultPanel({ data }: { data: CounselData }) {
  const [buttons, setButtons] = useState<Selection["buttons"]>({});
  const [keyword, setKeyword] = useState("");
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [mode, setMode] = useState<AnswerMode>("fast");

  function chooseButton(key: ButtonKey, choice: string | undefined) {
    setButtons(prev => ({ ...prev, [key]: choice }));
  }

  /** [처음부터]: 버튼 선택·키워드·추천 결과를 한 번에 지운다. PRD 5절 must 1 규칙 8 */
  function resetAll() {
    setButtons({});
    setKeyword("");
    setOutcome({ kind: "idle" });
    setMode("fast");
  }

  function runRecommend() {
    const selection: Selection = { buttons, keyword, mode };
    const error = validateSelection(selection);
    setOutcome(
      error
        ? { kind: "error", error }
        : { kind: "done", ...recommendWithScope(data.items, selection), selection, careIndex: Math.floor(Math.random() * 3) },
    );
  }

  // 추천을 받은 뒤 버튼이나 키워드를 바꾸면 결과가 지금 선택과 달라진다.
  // 옛 선택으로 만든 질문문·이관 메모가 복사되지 않게 숨기고 다시 추천 받으라고 안내한다.
  const stale =
    outcome.kind === "done" &&
    (outcome.selection.keyword !== keyword || BUTTON_KEYS.some(key => outcome.selection.buttons[key] !== buttons[key]));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">새출발 상담카드</h1>
        <button
          type="button"
          onClick={resetAll}
          className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          처음부터
        </button>
      </header>

      <Section title="상황 고르기">
        <ButtonGroups options={data.buttons} value={buttons} onChange={chooseButton} />
      </Section>

      <Section title="키워드">
        <KeywordInput value={keyword} onChange={setKeyword} onSubmit={runRecommend} />
      </Section>

      <Section title="추천 자료">
        {stale && (
          <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            선택이 바뀌었어요 — [추천 받기]를 다시 눌러 주세요. 아래 자료는 바뀌기 전 선택의 결과예요.
          </p>
        )}
        <ResultCards outcome={outcome} />
      </Section>

      {/* 질문문은 추천 결과가 나온 뒤에만 보인다. 0건이어도 보여서 사내 LLM에 바로 물을 수 있다. */}
      {outcome.kind === "done" && !stale && (
        <Section title="사내 LLM 질문문">
          <QuestionBox selection={outcome.selection} results={outcome.items} mode={mode} onModeChange={setMode} />
        </Section>
      )}

      {outcome.kind === "done" && !stale && (
        <Section title="이관 메모">
          <HandoffBox selection={outcome.selection} results={outcome.items} />
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
