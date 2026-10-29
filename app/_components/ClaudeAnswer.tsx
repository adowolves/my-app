"use client";
// nice 22번: [Claude로 바로 답변]. 서버(/api/answer)에 버튼 선택·키워드·답변 길이만 보내고 답을 보여 준다. PRD 5절 nice 규칙 4
import { useState } from "react";
import type { AnswerResponse } from "@/app/api/answer/route";
import type { Selection } from "@/lib/types";

/** 서버는 20초에서 끊는다. 화면은 네트워크 여유를 조금 더 두고 기다린다. */
const CLIENT_TIMEOUT_MS = 25_000;

/** 답을 글자 그대로 보여 주므로, 혹시 섞여 온 굵게(**)·제목(#) 기호는 지운다. */
function plainText(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#{1,6}\s+/gm, "");
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; answer: string; seconds: number }
  | { kind: "failed"; reason: string };

export default function ClaudeAnswer({ selection }: { selection: Selection }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function ask() {
    setState({ kind: "loading" });
    const started = performance.now();
    // AbortSignal.timeout이 없는 오래된 사내 브라우저에서도 동작하게 직접 타이머로 끊는다.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
    try {
      const res = await fetch("/api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selection),
        signal: controller.signal,
      });
      const data = (await res.json()) as AnswerResponse;
      if ("answer" in data) {
        setState({ kind: "done", answer: plainText(data.answer), seconds: (performance.now() - started) / 1000 });
      } else {
        setState({ kind: "failed", reason: data.error });
      }
    } catch {
      setState({ kind: "failed", reason: "응답이 없거나 연결이 끊겼어요." });
    } finally {
      clearTimeout(timer);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <button
          type="button"
          onClick={ask}
          disabled={state.kind === "loading"}
          className="rounded-lg border border-violet-600 px-4 py-2 font-semibold text-violet-700 hover:bg-violet-50 disabled:cursor-wait disabled:opacity-60 dark:text-violet-300 dark:hover:bg-violet-950"
        >
          {state.kind === "loading" ? "Claude가 답하는 중…" : "Claude로 바로 답변"}
        </button>
      </div>
      {state.kind === "failed" && (
        <p role="alert" className="text-sm font-medium text-red-600">
          ⚠ AI 답변 실패 — 사내 LLM 질문문을 복사해 쓰세요. ({state.reason})
        </p>
      )}
      {state.kind === "done" && (
        <div className="flex flex-col gap-1 rounded-lg border border-violet-200 bg-violet-50 p-3 dark:border-violet-900 dark:bg-violet-950">
          <p className="text-xs font-medium text-violet-700 dark:text-violet-300">
            Claude 답변 (참고용 — 안내 전에 근거를 확인하세요)
          </p>
          <p className="whitespace-pre-line text-sm leading-relaxed">{state.answer}</p>
          <p className="text-right text-xs tabular-nums text-zinc-500">
            {selection.mode === "fast" ? "빠른 답변" : "보통 답변"} · {state.seconds.toFixed(1)}초
          </p>
        </div>
      )}
    </div>
  );
}
