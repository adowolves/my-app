"use client";
// 화면 전체의 상태(버튼 선택·키워드·추천 결과)를 들고 각 영역을 그린다. 설계 근거: DESIGN.md §3 화면 구성
// 추천 계산은 브라우저 안에서 바로 한다(서버로 보내지 않음). 설계 근거: DESIGN.md §4.2
import { useState } from "react";
import { recommend } from "@/lib/recommend";
import type { ButtonKey, CounselData, Selection } from "@/lib/types";
import { validateSelection } from "@/lib/validate";
import ButtonGroups from "./ButtonGroups";
import KeywordInput from "./KeywordInput";
import ResultCards, { type Outcome } from "./ResultCards";

export default function ConsultPanel({ data }: { data: CounselData }) {
  const [buttons, setButtons] = useState<Selection["buttons"]>({});
  const [keyword, setKeyword] = useState("");
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });

  function chooseButton(key: ButtonKey, choice: string | undefined) {
    setButtons(prev => ({ ...prev, [key]: choice }));
  }

  function runRecommend() {
    const selection: Selection = { buttons, keyword, mode: "fast" };
    const error = validateSelection(selection);
    setOutcome(error ? { kind: "error", error } : { kind: "done", items: recommend(data.items, selection) });
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">새출발 상담카드</h1>
      </header>

      <Section title="상황 고르기">
        <ButtonGroups options={data.buttons} value={buttons} onChange={chooseButton} />
      </Section>

      <Section title="키워드">
        <KeywordInput value={keyword} onChange={setKeyword} onSubmit={runRecommend} />
      </Section>

      <Section title="추천 자료">
        <ResultCards outcome={outcome} />
      </Section>
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
