"use client";
// ④ 추천 자료: 카드 최대 3장, 0건 안내, 입력 오류 안내. PRD 5절 must 1 규칙 1·3·5
import type { CounselItem } from "@/lib/types";
import { INPUT_ERROR_MESSAGE, type InputError } from "@/lib/validate";

export type Outcome =
  | { kind: "idle" }
  | { kind: "error"; error: InputError }
  | { kind: "done"; items: CounselItem[] };

export default function ResultCards({ outcome }: { outcome: Outcome }) {
  if (outcome.kind === "idle") {
    return <p className="text-sm text-zinc-500">주제를 고르고 [추천 받기]를 누르면 공개 FAQ에서 최대 3개를 찾아 드려요.</p>;
  }
  if (outcome.kind === "error") {
    return (
      <p role="alert" className="font-medium text-red-600">
        ⚠ {INPUT_ERROR_MESSAGE[outcome.error]}
      </p>
    );
  }
  if (outcome.items.length === 0) {
    return (
      <p role="status" className="rounded-lg bg-amber-50 p-3 font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        해당 자료 없음 — 사내 LLM 검토 필요
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-3" aria-label="추천 자료">
      {outcome.items.map((item, i) => (
        <li key={item.id} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <p className="font-semibold">
            {i + 1}. {item.question}
          </p>
        </li>
      ))}
    </ol>
  );
}
