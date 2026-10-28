// 추천 계산. 설계 근거: DESIGN.md §4.2 ②, PRD 5절 must 1 규칙 2·6·7
// 엑셀에 있는 줄을 고르고 줄 세우기만 한다. 새 문장을 만들지 않는다(규칙 1).
// 다른 lib 파일의 값을 불러오지 않는다(시나리오 검사 스크립트가 이 파일을 바로 불러 쓰기 때문).
import type { CounselItem, FilterKey, Selection } from "./types";

export const MAX_RESULTS = 3;

const FILTERS: FilterKey[] = ["연체", "채무", "단계", "구분", "주제"];

/** 띄어쓰기를 무시하고 비교하기 위해 공백을 지운다(규칙 7). */
function squash(text: string): string {
  return text.replace(/\s+/g, "");
}

/** 고른 버튼 값과 맞거나 "전체"인 줄만 통과시킨다. 고르지 않은 버튼은 따지지 않는다. */
function matchesButtons(item: CounselItem, selection: Selection): boolean {
  return FILTERS.every(key => {
    const chosen = selection.buttons[key];
    return !chosen || item.filters[key] === "전체" || item.filters[key] === chosen;
  });
}

/** 입력 키워드와 겹치는 엑셀 키워드 수. 한쪽이 다른 쪽을 품으면 겹친 것으로 본다. */
function keywordScore(item: CounselItem, keyword: string): number {
  return item.keywords.map(squash).filter(k => k.includes(keyword) || keyword.includes(k)).length;
}

/**
 * 추천 자료를 최대 3개 고른다.
 * - 키워드가 있으면: 겹치는 수가 많은 순, 같으면 번호 순. 하나도 안 겹치면 뺀다.
 * - 키워드가 없으면: 버튼 값만으로 번호 순(규칙 6).
 */
export function recommend(items: CounselItem[], selection: Selection): CounselItem[] {
  const keyword = squash(selection.keyword);
  const candidates = items.filter(item => matchesButtons(item, selection));
  if (!keyword) {
    return [...candidates].sort((a, b) => a.id.localeCompare(b.id)).slice(0, MAX_RESULTS);
  }
  return candidates
    .map(item => ({ item, score: keywordScore(item, keyword) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
    .slice(0, MAX_RESULTS)
    .map(({ item }) => item);
}
