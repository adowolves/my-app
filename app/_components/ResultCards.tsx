"use client";
// ④ 추천 자료: 카드 최대 3장, 0건 안내, 입력 오류 안내. PRD 5절 must 1 규칙 1·3·5
import { CARE_MESSAGES, HARD_TEMPERATURES } from "@/lib/careMessages";
import type { SearchScope } from "@/lib/recommend";
import { articleText, ruleRefs } from "@/lib/ruleRefs";
import type { CounselItem, RuleArticle, Selection } from "@/lib/types";
import { INPUT_ERROR_MESSAGE, type InputError } from "@/lib/validate";
import { useCopy } from "./useCopy";

export type Outcome =
  | { kind: "idle" }
  | { kind: "error"; error: InputError }
  /** careIndex: 강성·악성일 때 보여 줄 마음지킴 문구 번호(추천 받을 때 하나 고름) */
  /** scope: 고른 조건 그대로 찾았는지, 조건을 넓혀 찾았는지 */
  | { kind: "done"; items: CounselItem[]; scope: SearchScope; selection: Selection; careIndex: number };

/** 조건을 넓혀 찾았을 때 결과 위에 보여 줄 안내 */
const SCOPE_NOTICE: Record<Exclude<SearchScope, "exact">, string> = {
  topic: "고른 조건에 딱 맞는 자료가 없어, 주제만 맞춰 찾은 결과예요. 연체·채무·단계·구분은 다를 수 있어요.",
  all: "고른 주제에 맞는 자료가 없어, 전체 자료에서 키워드로만 찾은 결과예요. 다른 주제의 자료일 수 있어요.",
};

export default function ResultCards({ outcome, articles }: { outcome: Outcome; articles: Record<string, RuleArticle> }) {
  if (outcome.kind === "idle") {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 p-5 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
        <p className="font-medium">왼쪽에서 ① 주제를 고르고 ② 키워드를 넣은 뒤 [추천 받기]를 누르세요.</p>
        <p className="mt-1 text-sm">공개 FAQ와 업무요강에서 최대 3개를 찾아, 바로 말할 내용을 맨 위에 보여 드려요.</p>
      </div>
    );
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
  // 마음지킴은 압박감이 없게 차분한 색으로 결과 아래에 둔다.
  const care = hard && (
    <aside className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-200">
      <span className="font-semibold">🌿 통화 후 마음지킴</span> {CARE_MESSAGES[outcome.careIndex % CARE_MESSAGES.length]}
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
      {outcome.scope !== "exact" && (
        <p role="status" className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-200">
          {SCOPE_NOTICE[outcome.scope]}
        </p>
      )}
      <ol className="flex flex-col gap-3" aria-label="추천 자료">
        {outcome.items.map((item, i) => (
          <li key={item.id}>
            <ResultCard item={item} rank={i + 1} showDoNotSay={hard} articles={articles} />
          </li>
        ))}
      </ol>
      {care}
    </div>
  );
}

/**
 * 카드 한 장. 글은 모두 엑셀에서 온 그대로 보여 준다(지어내기 0건). PRD 5절 must 1 규칙 1·2
 * 신입도 맨 위 두세 줄만 읽고 1차 안내를 할 수 있게, 중요한 순서(하면 안 되는 말 → 바로 말할 내용 → 추천 단어 → 넘길 곳 → 규정 → 원문)로 놓는다.
 */
function ResultCard({
  item,
  rank,
  showDoNotSay,
  articles,
}: {
  item: CounselItem;
  rank: number;
  showDoNotSay: boolean;
  articles: Record<string, RuleArticle>;
}) {
  const { label, url } = splitSource(item.source);
  const first = rank === 1;
  return (
    <article
      className={
        "flex flex-col gap-3 rounded-xl border p-4 " +
        (first ? "border-blue-300 bg-blue-50/40 shadow-sm dark:border-blue-800 dark:bg-blue-950/30" : "border-zinc-200 dark:border-zinc-800")
      }
    >
      {showDoNotSay && item.doNotSay && (
        <p role="note" className="rounded-lg border-2 border-red-400 bg-red-50 px-3 py-2 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
          <span className="font-bold">⚠ 하면 안 되는 말</span> &quot;{item.doNotSay}&quot;
        </p>
      )}
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
          {first ? "1순위 추천" : `${rank}순위`}
        </p>
        <h3 className="font-semibold text-zinc-700 dark:text-zinc-300">{item.question}</h3>
      </div>
      <div className="rounded-lg bg-white p-3 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
        <p className="mb-1 text-xs font-semibold text-zinc-500">바로 말할 내용</p>
        <p className={"leading-relaxed text-zinc-900 dark:text-zinc-100 " + (first ? "text-lg font-semibold" : "font-medium")}>
          {item.summary}
        </p>
      </div>
      <RuleBox rule={item.rule} articles={articles} />
      {item.words && <WordChips words={item.words} />}
      {item.handOff && (
        <p className="text-sm">
          <span className="font-semibold text-emerald-700 dark:text-emerald-300">➜ 넘길 곳</span> {item.handOff}
        </p>
      )}
      <details className="text-sm text-zinc-600 dark:text-zinc-400">
        <summary className="cursor-pointer select-none font-medium">FAQ 원문 보기</summary>
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

/**
 * 관련 규정: 요지와 함께, 가리키는 관리업무요강 조문의 전문과 출처를 보여 준다.
 * 관련 규정은 근거 확인에 중요하므로 늘 보여 주고, 해당 조항이 없으면 없다고 밝힌다(지어내지 않음).
 */
function RuleBox({ rule, articles }: { rule: string; articles: Record<string, RuleArticle> }) {
  const refs = ruleRefs(rule).filter(ref => articles[ref.no]);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm dark:border-indigo-900 dark:bg-indigo-950">
      <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">§ 관련 규정</p>
      {rule ? (
        <ul className="flex flex-col gap-1 text-indigo-950 dark:text-indigo-100">
          {rule.split(" / ").map(part => (
            <li key={part}>{part}</li>
          ))}
        </ul>
      ) : (
        <p className="text-zinc-500">관리업무요강에 직접 해당하는 조항이 없어요. FAQ 원문을 근거로 안내하세요.</p>
      )}
      {refs.map(ref => {
        const article = articles[ref.no];
        const { label, url } = splitSource(article.source);
        return (
          <section key={ref.no} className="rounded-md border border-indigo-200 bg-white dark:border-indigo-900 dark:bg-zinc-950">
            <h4 className="border-b border-indigo-100 px-3 py-1.5 text-xs font-semibold text-indigo-800 dark:border-indigo-900 dark:text-indigo-200">
              조문 전문 · {ref.no}({article.title})
              {ref.items.length > 0 && ` 제${ref.items.join("·")}호`}
            </h4>
            <p className="max-h-56 overflow-y-auto whitespace-pre-line px-3 py-2 leading-relaxed text-zinc-800 dark:text-zinc-200">
              {articleText(article, ref.items)}
            </p>
            <p className="border-t border-indigo-100 px-3 py-1.5 text-xs text-zinc-500 dark:border-indigo-900">
              출처: {ref.no}({article.title}) ·{" "}
              {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
                  {label}
                </a>
              ) : (
                label
              )}
            </p>
          </section>
        );
      })}
    </div>
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
      <span className="font-semibold text-blue-700 dark:text-blue-300">추천 단어</span>
      <span className="text-xs text-zinc-500">(누르면 복사)</span>
      {list.map(word => (
        <button
          key={word}
          type="button"
          title="누르면 복사"
          onClick={() => copy(word)}
          className="min-h-8 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-900 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100 dark:hover:bg-blue-900"
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
