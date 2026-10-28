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
        <li key={item.id}>
          <ResultCard item={item} rank={i + 1} />
        </li>
      ))}
    </ol>
  );
}

/** 카드 한 장. 글은 모두 엑셀에서 온 그대로 보여 준다(지어내기 0건). PRD 5절 must 1 규칙 1·2 */
function ResultCard({ item, rank }: { item: CounselItem; rank: number }) {
  const { label, url } = splitSource(item.source);
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <h3 className="font-semibold">
        {rank}. {item.question}
      </h3>
      <p className="leading-relaxed">{item.summary}</p>
      {item.words && (
        <p className="text-sm">
          <span className="font-medium text-blue-700 dark:text-blue-300">추천 단어</span> {item.words}
        </p>
      )}
      {item.rule && (
        <p className="text-sm">
          <span className="font-medium text-zinc-600 dark:text-zinc-400">관련 규정</span> {item.rule}
        </p>
      )}
      <details className="text-sm text-zinc-600 dark:text-zinc-400">
        <summary className="cursor-pointer select-none">FAQ 원문 보기</summary>
        <p className="mt-2 whitespace-pre-line">{item.original}</p>
      </details>
      <p className="text-xs text-zinc-500">
        출처: 추천DB {item.id} ·{" "}
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
            {label}
          </a>
        ) : (
          label
        )}
      </p>
    </article>
  );
}

/** "새출발기금 홈페이지 자주하는 질문 > 신청/취소 (https://…)"를 이름과 주소로 나눈다. */
function splitSource(source: string): { label: string; url?: string } {
  const match = source.match(/^(.*)\s\((https?:\/\/[^)]+)\)$/);
  return match ? { label: match[1], url: match[2] } : { label: source };
}
