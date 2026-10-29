"use client";
// ④ 추천 자료: 카드 최대 3장, 0건 안내, 입력 오류 안내. PRD 5절 must 1 규칙 1·3·5
import { CARE_MESSAGES, HARD_TEMPERATURES } from "@/lib/careMessages";
import type { CounselItem, Selection } from "@/lib/types";
import { INPUT_ERROR_MESSAGE, type InputError } from "@/lib/validate";
import { useCopy } from "./useCopy";

export type Outcome =
  | { kind: "idle" }
  | { kind: "error"; error: InputError }
  /** careIndex: 강성·악성일 때 보여 줄 마음지킴 문구 번호(추천 받을 때 하나 고름) */
  | { kind: "done"; items: CounselItem[]; selection: Selection; careIndex: number };

export default function ResultCards({ outcome }: { outcome: Outcome }) {
  if (outcome.kind === "idle") {
    return <p className="text-sm text-zinc-500">주제를 고르고 [추천 받기]를 누르면 공개 FAQ에서 최대 3개를 찾아 드려요.</p>;
  }
  if (outcome.kind === "error") {
    // 키워드 경고는 ③ 입력창 아래에 이미 보이므로 여기서는 되풀이하지 않는다. 설계 근거: DESIGN.md §4.2 ①
    if (outcome.error !== "no-topic") {
      return <p className="text-sm text-zinc-500">키워드를 고친 뒤 [추천 받기]를 다시 눌러 주세요.</p>;
    }
    return (
      <p role="alert" className="font-medium text-red-600">
        ⚠ {INPUT_ERROR_MESSAGE[outcome.error]}
      </p>
    );
  }
  // 온도가 강성·악성이면 "하면 안 되는 말"과 마음지킴 안내를 함께 보여 준다. PRD 5절 nice
  const hard = HARD_TEMPERATURES.includes(outcome.selection.buttons["온도"] ?? "");
  const care = hard && (
    <aside className="rounded-lg bg-violet-50 p-3 text-sm text-violet-900 dark:bg-violet-950 dark:text-violet-200">
      <span className="font-semibold">통화 후 마음지킴</span> {CARE_MESSAGES[outcome.careIndex % CARE_MESSAGES.length]}
    </aside>
  );
  if (outcome.items.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p role="status" className="rounded-lg bg-amber-50 p-3 font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          해당 자료 없음 — 사내 LLM 검토 필요
        </p>
        {care}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3" aria-label="추천 자료">
        {outcome.items.map((item, i) => (
          <li key={item.id}>
            <ResultCard item={item} rank={i + 1} showDoNotSay={hard} />
          </li>
        ))}
      </ol>
      {care}
    </div>
  );
}

/** 카드 한 장. 글은 모두 엑셀에서 온 그대로 보여 준다(지어내기 0건). PRD 5절 must 1 규칙 1·2 */
function ResultCard({ item, rank, showDoNotSay }: { item: CounselItem; rank: number; showDoNotSay: boolean }) {
  const { label, url } = splitSource(item.source);
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <h3 className="font-semibold">
        {rank}. {item.question}
      </h3>
      <p className="leading-relaxed">{item.summary}</p>
      {showDoNotSay && item.doNotSay && (
        <p className="rounded-md bg-red-50 px-2 py-1 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          <span className="font-semibold">하면 안 되는 말</span> &quot;{item.doNotSay}&quot;
        </p>
      )}
      {item.words && <WordChips words={item.words} />}
      {item.handOff && (
        <p className="text-sm">
          <span className="font-medium text-emerald-700 dark:text-emerald-300">넘길 곳</span> {item.handOff}
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

/** 추천 단어: 누르면 그 단어를 바로 복사한다. PRD 5절 nice */
function WordChips({ words }: { words: string }) {
  const { copy, statusFor } = useCopy();
  const list = words.split(",").map(w => w.trim()).filter(Boolean);
  const copied = list.find(w => statusFor(w) === "copied");
  const failed = list.find(w => statusFor(w) === "failed");
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <span className="font-medium text-blue-700 dark:text-blue-300">추천 단어</span>
      {list.map(word => (
        <button
          key={word}
          type="button"
          title="누르면 복사"
          onClick={() => copy(word)}
          className="rounded-md bg-blue-50 px-2 py-0.5 text-blue-900 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-100 dark:hover:bg-blue-900"
        >
          {word}
        </button>
      ))}
      <span role="status" className="text-xs">
        {copied && <span className="text-green-700 dark:text-green-400">✓ &quot;{copied}&quot; 복사됨</span>}
        {failed && <span className="text-red-600">⚠ 복사가 안 됐어요 — 단어를 직접 선택해 복사하세요</span>}
      </span>
    </div>
  );
}

/** "새출발기금 홈페이지 자주하는 질문 > 신청/취소 (https://…)"를 이름과 주소로 나눈다. */
function splitSource(source: string): { label: string; url?: string } {
  const match = source.match(/^(.*)\s\((https?:\/\/[^)]+)\)$/);
  return match ? { label: match[1], url: match[2] } : { label: source };
}
