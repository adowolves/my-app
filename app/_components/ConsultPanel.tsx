"use client";
// 화면 전체의 상태(버튼 선택·키워드·추천 결과·답변 길이)를 들고 각 영역을 그린다. 설계 근거: DESIGN.md §3 화면 구성
// 추천 계산은 브라우저 안에서 바로 한다(서버로 보내지 않음). 설계 근거: DESIGN.md §4.2
// 넓은 화면에서는 왼쪽(①상황·②키워드)과 오른쪽(③추천·④질문문)을 나란히 두어, 통화 중 스크롤 없이 고르고 바로 결과를 본다.
import { useEffect, useEffectEvent, useRef, useState } from "react";
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
  const keywordRef = useRef<HTMLInputElement>(null);

  function chooseButton(key: ButtonKey, choice: string | undefined) {
    setButtons(prev => ({ ...prev, [key]: choice }));
  }

  /** [처음부터]: 버튼 선택·키워드·추천 결과를 한 번에 지운다. PRD 5절 must 1 규칙 8 */
  function resetAll() {
    setButtons({});
    setKeyword("");
    setOutcome({ kind: "idle" });
    setMode("fast");
    // 다음 전화를 바로 받을 수 있게 키워드 칸으로 돌아간다.
    keywordRef.current?.focus();
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

  // Esc 키로 [처음부터]. 통화가 끝나면 마우스 없이 바로 새로 시작한다.
  const onEscape = useEffectEvent(resetAll);
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !e.isComposing) onEscape();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // 화면을 열면 바로 키워드를 칠 수 있게 커서를 둔다(서버에서 그린 화면은 autoFocus가 적용되지 않음).
  useEffect(() => {
    keywordRef.current?.focus();
  }, []);

  // 추천을 받은 뒤 버튼이나 키워드를 바꾸면 결과가 지금 선택과 달라진다.
  // 옛 선택으로 만든 질문문·이관 메모가 복사되지 않게 숨기고 다시 추천 받으라고 안내한다.
  const stale =
    outcome.kind === "done" &&
    (outcome.selection.keyword !== keyword || BUTTON_KEYS.some(key => outcome.selection.buttons[key] !== buttons[key]));
  // 주제를 안 고르고 [추천 받기]를 누르면 주제 줄을 강조한다.
  const missingTopic = outcome.kind === "error" && outcome.error === "no-topic" && !buttons["주제"];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">새출발 상담카드</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            상황 고르기 → 키워드 → 추천 확인 → 질문문 복사
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="hidden text-xs text-zinc-500 sm:block">
            <Kbd>Enter</Kbd> 추천 받기 · <Kbd>Esc</Kbd> 처음부터
          </p>
          <button
            type="button"
            onClick={resetAll}
            className="min-h-11 shrink-0 rounded-lg border border-zinc-300 bg-white px-4 py-2 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            ↺ 처음부터
          </button>
        </div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* 왼쪽: 입력. 넓은 화면에서는 스크롤해도 따라온다. */}
        <div className="flex flex-col gap-5 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <Section step={1} title="상황 고르기" hint="주제만 꼭 고르세요">
            <ButtonGroups options={data.buttons} value={buttons} onChange={chooseButton} missingTopic={missingTopic} />
          </Section>

          <Section step={2} title="키워드">
            <KeywordInput inputRef={keywordRef} value={keyword} onChange={setKeyword} onSubmit={runRecommend} />
          </Section>
        </div>

        {/* 오른쪽: 결과 */}
        <div className="flex flex-col gap-5">
          <Section step={3} title="추천 자료" hint="맨 위 굵은 글부터 안내하세요">
            {stale && (
              <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                선택이 바뀌었어요 — [추천 받기]를 다시 눌러 주세요. 아래 자료는 바뀌기 전 선택의 결과예요.
              </p>
            )}
            <ResultCards outcome={outcome} />
          </Section>

          {/* 질문문은 추천 결과가 나온 뒤에만 보인다. 0건이어도 보여서 사내 LLM에 바로 물을 수 있다. */}
          {outcome.kind === "done" && !stale && (
            <Section step={4} title="사내 LLM 질문문" hint="더 자세한 검토가 필요할 때">
              <QuestionBox selection={outcome.selection} results={outcome.items} mode={mode} onModeChange={setMode} />
            </Section>
          )}

          {outcome.kind === "done" && !stale && (
            <Section title="이관 메모" hint="다른 직원에게 넘길 때">
              <HandoffBox selection={outcome.selection} results={outcome.items} />
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

/** 영역 카드. step 번호를 붙여 처음 쓰는 직원도 순서를 알 수 있게 한다. */
function Section({ step, title, hint, children }: { step?: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-lg font-semibold">
        {step !== undefined && (
          <span aria-hidden className="inline-flex size-7 items-center justify-center self-center rounded-full bg-blue-600 text-sm font-bold text-white">
            {step}
          </span>
        )}
        {title}
        {hint && <span className="text-sm font-normal text-zinc-500">{hint}</span>}
      </h2>
      {children}
    </section>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 font-mono text-[0.7rem] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
      {children}
    </kbd>
  );
}
