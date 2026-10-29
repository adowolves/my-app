// 추천 계산. 설계 근거: DESIGN.md §4.2 ②, PRD 5절 must 1 규칙 2·3·6·7
// 엑셀에 있는 줄을 고르고 줄 세우기만 한다. 새 문장을 만들지 않는다(규칙 1).
// 다른 lib 파일의 값을 불러오지 않는다(시나리오 검사 스크립트가 이 파일을 바로 불러 쓰기 때문).
import type { CounselItem, FilterKey, Selection } from "./types";

export const MAX_RESULTS = 3;

const FILTERS: FilterKey[] = ["연체", "채무", "단계", "구분", "주제"];

/**
 * 어떤 조건으로 찾았는지.
 * - exact: 고른 버튼을 모두 지킨 결과
 * - topic: 버튼을 모두 지키면 0건이라 주제만 남기고 찾은 결과
 * - all: 주제로도 0건이라 43건 전체에서 키워드로만 찾은 결과(키워드를 넣었을 때만)
 */
export type SearchScope = "exact" | "topic" | "all";

/** 어디에서 겹치면 몇 점인지. 엑셀 "키워드" 칸이 가장 중요하고, FAQ 제목, 답변 요약 순이다. */
const WEIGHT = { keyword: 3, title: 2, summary: 1 };

/** 번호 순 비교. "7"과 "010"처럼 자릿수가 달라도 숫자 크기대로 줄 세운다. */
function byId(a: CounselItem, b: CounselItem): number {
  return a.id.localeCompare(b.id, undefined, { numeric: true });
}

/** 띄어쓰기를 무시하고 비교하기 위해 공백을 지운다(규칙 7). */
function squash(text: string): string {
  return text.replace(/\s+/g, "");
}

/** 입력 키워드를 낱말로 나눈다. 띄어 쓴 낱말 하나하나와, 공백을 지운 전체를 함께 쓴다("상환 유예" → 상환, 유예, 상환유예). */
function searchTerms(keyword: string): string[] {
  const words = keyword.split(/\s+/).map(squash).filter(Boolean);
  return [...new Set([squash(keyword), ...words].filter(Boolean))];
}

/** 버튼 조건 통과 여부. keys에 든 버튼만 따지고, "전체"인 줄은 어떤 선택에도 맞는다. */
function matchesButtons(item: CounselItem, selection: Selection, keys: FilterKey[]): boolean {
  return keys.every(key => {
    const chosen = selection.buttons[key];
    return !chosen || item.filters[key] === "전체" || item.filters[key] === chosen;
  });
}

/**
 * 키워드 점수. 엑셀 키워드 칸은 한쪽이 다른 쪽을 품으면 겹친 것으로 보고(예: "신청취소" ↔ "취소"),
 * FAQ 제목·답변 요약은 두 글자 이상 낱말이 그 안에 들어 있으면 겹친 것으로 본다.
 */
function keywordScore(item: CounselItem, terms: string[]): number {
  const keywords = item.keywords.map(squash);
  const title = squash(item.question);
  const summary = squash(item.summary);
  let score = 0;
  for (const k of keywords) if (terms.some(t => k.includes(t) || t.includes(k))) score += WEIGHT.keyword;
  for (const t of terms.filter(t => t.length >= 2)) {
    if (title.includes(t)) score += WEIGHT.title;
    if (summary.includes(t)) score += WEIGHT.summary;
  }
  return score;
}

function pick(items: CounselItem[], selection: Selection, keys: FilterKey[]): CounselItem[] {
  const candidates = items.filter(item => matchesButtons(item, selection, keys));
  const terms = searchTerms(selection.keyword);
  if (!terms.length) return [...candidates].sort(byId).slice(0, MAX_RESULTS);
  return candidates
    .map(item => ({ item, score: keywordScore(item, terms) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || byId(a.item, b.item))
    .slice(0, MAX_RESULTS)
    .map(({ item }) => item);
}

/**
 * 추천 자료를 최대 3개 고르고, 어떤 조건으로 찾았는지 함께 돌려준다.
 * - 키워드가 있으면: 겹침 점수가 높은 순, 같으면 번호 순. 하나도 안 겹치면 뺀다.
 * - 키워드가 없으면: 버튼 값만으로 번호 순(규칙 6).
 * - 0건이면 조건을 넓혀 다시 찾는다: 주제만 남기고 → (키워드가 있으면) 전체에서. 그래도 0건이면 0건(규칙 3).
 */
export function recommendWithScope(items: CounselItem[], selection: Selection): { items: CounselItem[]; scope: SearchScope } {
  const exact = pick(items, selection, FILTERS);
  if (exact.length) return { items: exact, scope: "exact" };
  const topic = pick(items, selection, ["주제"]);
  if (topic.length) return { items: topic, scope: "topic" };
  if (!squash(selection.keyword)) return { items: [], scope: "exact" };
  const all = pick(items, selection, []);
  return all.length ? { items: all, scope: "all" } : { items: [], scope: "exact" };
}

/** 추천 자료만 필요할 때(질문문·Claude 답변·시나리오 검사). */
export function recommend(items: CounselItem[], selection: Selection): CounselItem[] {
  return recommendWithScope(items, selection).items;
}
