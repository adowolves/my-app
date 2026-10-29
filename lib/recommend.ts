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

/**
 * 어디에서 겹치면 몇 점인지. 엑셀 "키워드" 칸이 가장 중요하고, FAQ 제목·관련 규정 요지, 답변 요약·FAQ 원문 순이다.
 * 네 글자 붙임말을 반으로 나눈 낱말("재산가액" → 재산, 가액)은 덜 정확하므로 절반만 준다.
 */
const WEIGHT = { keyword: 3, title: 2, rule: 2, summary: 1, original: 1 };
const WEAK = 0.5;

/** 뜻 없이 붙는 말. "산정방식" → "산정"처럼 떼어 내고, 이 말만으로는 찾지 않는다. */
const GENERIC = ["방식", "방법", "기준", "절차", "여부", "관련", "문의", "질문", "안내", "어떻게", "언제", "얼마", "하나요", "되나요", "가능"];

/** 번호 순 비교. "7"과 "010"처럼 자릿수가 달라도 숫자 크기대로 줄 세운다. */
function byId(a: CounselItem, b: CounselItem): number {
  return a.id.localeCompare(b.id, undefined, { numeric: true });
}

/** 띄어쓰기를 무시하고 비교하기 위해 공백을 지운다(규칙 7). */
function squash(text: string): string {
  return text.replace(/\s+/g, "");
}

/** 낱말 끝에 붙은 뜻 없는 말을 뗀다("산정방식" → "산정", "신청가능여부" → "신청"). 떼고 남는 게 한 글자면 그대로 둔다. */
function stripGeneric(word: string): string {
  let core = word;
  for (let changed = true; changed; ) {
    changed = false;
    for (const g of GENERIC) {
      if (core.endsWith(g) && core.length - g.length >= 2) {
        core = core.slice(0, -g.length);
        changed = true;
      }
    }
  }
  return core;
}

/**
 * 입력 키워드를 찾을 낱말로 나눈다.
 * - strong: 공백을 지운 전체, 띄어 쓴 낱말, 뜻 없는 말을 뗀 낱말("재산가액 산정방식" → 재산가액산정방식, 재산가액, 산정방식, 산정)
 * - weak: 네 글자 한글 낱말을 두 글자씩 나눈 것("재산가액" → 재산, 가액). 붙여 쓴 말이 자료에 띄어 쓰여 있거나 한쪽만 있을 때 찾으려고 쓴다.
 * - full: 입력 전체(공백 지움)와 뜻 없는 말을 뗀 전체. 두 글자 이상일 때만.
 * "방식"처럼 뜻 없는 말 하나만 남으면 그 낱말로는 찾지 않는다.
 */
export type SearchTerms = { strong: string[]; weak: string[]; full: string[] };

export function searchTerms(keyword: string): SearchTerms {
  const words = keyword.split(/\s+/).map(squash).filter(Boolean);
  const strong = [...new Set([squash(keyword), ...words, ...words.map(stripGeneric)])].filter(t => t && !GENERIC.includes(t));
  const weak = [
    ...new Set(strong.filter(t => /^[가-힣]{4}$/.test(t)).flatMap(t => [t.slice(0, 2), t.slice(2)])),
  ].filter(t => !strong.includes(t) && !GENERIC.includes(t));
  const whole = squash(keyword);
  const full = [...new Set([whole, stripGeneric(whole)])].filter(t => t.length >= 2 && !GENERIC.includes(t));
  return { strong, weak, full };
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
 * FAQ 제목·관련 규정 요지·답변 요약·FAQ 원문은 두 글자 이상 낱말이 그 안에 들어 있으면 겹친 것으로 본다.
 * 원문은 길어서 지나가는 말에도 걸리므로, 원문 일치와 반쪽 낱말 일치는 순서를 정하는 보조 점수로만 쓴다.
 * 키워드·제목·규정 요지·요약 중 하나라도 겹쳐야(main > 0) 추천에 넣는다.
 */
function keywordScore(item: CounselItem, terms: SearchTerms): { main: number; extra: number } {
  const keywords = item.keywords.map(squash);
  const fields = {
    title: squash(item.question),
    rule: squash(item.rule),
    summary: squash(item.summary),
  };
  const original = squash(item.original);
  const fieldScore = (t: string) =>
    (Object.keys(fields) as (keyof typeof fields)[]).reduce((sum, key) => sum + (fields[key].includes(t) ? WEIGHT[key] : 0), 0);
  let main = 0;
  let extra = 0;
  // 키워드 칸은 찾는 낱말마다 한 번만 센다("신청"이 든 키워드가 많은 줄이 덮어쓰지 않게).
  // 입력 전체("신청방법")와 맞는 키워드가 있으면 한 번 더 쳐 준다.
  const inKeywords = (t: string) => keywords.some(k => k.includes(t) || t.includes(k));
  for (const t of terms.strong) if (inKeywords(t)) main += WEIGHT.keyword;
  if (terms.full.some(f => keywords.some(k => k.includes(f)))) main += WEIGHT.keyword;
  for (const t of terms.weak) if (keywords.some(k => k.includes(t))) extra += WEIGHT.keyword * WEAK;
  for (const t of terms.strong.filter(t => t.length >= 2)) {
    main += fieldScore(t);
    if (original.includes(t)) extra += WEIGHT.original;
  }
  for (const t of terms.weak) extra += (fieldScore(t) + (original.includes(t) ? WEIGHT.original : 0)) * WEAK;
  return { main, extra };
}

function pick(items: CounselItem[], selection: Selection, keys: FilterKey[]): CounselItem[] {
  const candidates = items.filter(item => matchesButtons(item, selection, keys));
  const terms = searchTerms(selection.keyword);
  if (!terms.strong.length) return [...candidates].sort(byId).slice(0, MAX_RESULTS);
  return candidates
    .map(item => ({ item, ...keywordScore(item, terms) }))
    .filter(({ main }) => main > 0)
    .map(({ item, main, extra }) => ({ item, score: main + extra }))
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
