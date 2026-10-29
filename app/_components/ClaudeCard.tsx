"use client";
// Claude 상담카드: [추천 받기]를 누르면 추천 카드와 함께 서버(/api/card)에 버튼 선택·키워드만 보내고,
// 즉답(감정→사실→절차→대안)을 받아 보여 준다(확인 질문은 아래 추천 카드가 맡음). 실패해도 아래 추천 카드로 상담을 이어 간다.
// 바뀐 추천마다 새로 만들도록 부모가 key를 바꿔 다시 그린다.
import { useEffect, useState } from "react";
import type { CardResponse, ClaudeCard as Card } from "@/app/api/card/route";
import type { Selection } from "@/lib/types";
import { useCopy } from "./useCopy";

/** 서버는 20초에서 끊는다. 화면은 네트워크 여유를 조금 더 두고 기다린다. */
const CLIENT_TIMEOUT_MS = 25_000;

type State = { kind: "loading" } | { kind: "done"; card: Card; seconds: number } | { kind: "failed"; reason: string };

const STEPS: { key: keyof Pick<Card, "empathy" | "fact" | "procedure" | "alternative">; label: string }[] = [
  { key: "empathy", label: "감정" },
  { key: "fact", label: "사실" },
  { key: "procedure", label: "절차" },
  { key: "alternative", label: "대안" },
];

export default function ClaudeCard({ selection }: { selection: Selection }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const { copy, statusFor } = useCopy();

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
    const started = performance.now();
    fetch("/api/card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(selection),
      signal: controller.signal,
    })
      .then(res => res.json() as Promise<CardResponse>)
      .then(data =>
        setState(
          "card" in data
            ? { kind: "done", card: data.card, seconds: (performance.now() - started) / 1000 }
            : { kind: "failed", reason: data.error },
        ),
      )
      .catch(() => {
        // 화면을 떠나거나 다시 추천 받아 취소된 요청은 알리지 않는다.
        if (!controller.signal.aborted || performance.now() - started >= CLIENT_TIMEOUT_MS) {
          setState({ kind: "failed", reason: "응답이 없거나 연결이 끊겼어요." });
        }
      })
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [selection]);

  if (state.kind === "loading") {
    return (
      <div role="status" className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 text-sm text-violet-800 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200">
        <span className="animate-pulse">🤖 Claude가 즉답(감정→사실→절차→대안)을 만드는 중… 아래 추천 자료로 먼저 안내하세요.</span>
      </div>
    );
  }
  if (state.kind === "failed") {
    return (
      <p role="status" className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        🤖 Claude 상담카드를 만들지 못했어요 — 아래 &quot;바로 말할 내용&quot;으로 안내하세요. ({state.reason})
      </p>
    );
  }

  const { card } = state;
  const answer = STEPS.map(step => card[step.key]).join(" ");
  return (
    <section aria-label="Claude 상담카드" className="flex flex-col gap-3 rounded-xl border-2 border-violet-300 bg-violet-50/50 p-4 dark:border-violet-800 dark:bg-violet-950/30">
      <p className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold text-violet-800 dark:text-violet-200">🤖 Claude 상담카드</span>
        <span className="text-xs text-zinc-500">초안 — 아래 근거와 대조 후 안내 · {state.seconds.toFixed(1)}초</span>
      </p>

      <div className="flex flex-col gap-2 rounded-lg bg-white p-3 ring-1 ring-violet-200 dark:bg-zinc-950 dark:ring-violet-900">
        <p className="flex items-center justify-between gap-2 text-xs font-semibold text-violet-700 dark:text-violet-300">
          즉답 (감정 → 사실 → 절차 → 대안)
          <button
            type="button"
            onClick={() => copy(answer)}
            className="rounded border border-violet-300 px-2 py-0.5 font-medium hover:bg-violet-100 dark:border-violet-800 dark:hover:bg-violet-900"
          >
            {statusFor(answer) === "copied" ? "✓ 복사됨" : "즉답 복사"}
          </button>
        </p>
        <ol className="flex flex-col gap-1.5">
          {STEPS.map(step => (
            <li key={step.key} className="grid grid-cols-[3rem_1fr] gap-2 leading-relaxed">
              <span className="pt-0.5 text-xs font-semibold text-violet-600 dark:text-violet-300">{step.label}</span>
              <span className="text-zinc-900 dark:text-zinc-100">{card[step.key]}</span>
            </li>
          ))}
        </ol>
      </div>

      <p className="text-xs text-zinc-500">
        근거: {card.basis.map(id => `추천DB ${id}`).join(" · ")} — 아래 카드의 FAQ 답변·관련 규정에서 확인하세요.
        {statusFor(answer) === "failed" && <span className="text-red-600"> ⚠ 복사가 안 됐어요 — 글을 직접 선택해 복사하세요</span>}
      </p>
    </section>
  );
}
