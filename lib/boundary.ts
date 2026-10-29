// 경계 규칙 찾기: 지금 상황·키워드에 맞는 경계 규칙을 고른다(data/boundary-rules.json). 아무것도 저장하지 않는다.
// 다른 lib 파일의 값을 불러오지 않는다(시나리오 검사 스크립트가 이 파일을 바로 불러 쓰기 때문).
import type { BoundaryRule, Selection } from "./types";

/** 한 번에 띄우는 규칙 수 상한. 통화 중 노란 띠가 너무 많으면 읽지 못한다. */
export const MAX_BOUNDARY_ALERTS = 3;

/** 띄어쓰기를 무시하고 비교한다("자동 차" = "자동차"). */
function squash(text: string): string {
  return text.replace(/\s+/g, "");
}

/** 규칙 하나가 지금 선택에 맞는지. 적힌 버튼은 모두 맞아야 하고, 키워드 낱말은 하나만 들어 있으면 된다. */
function matches(rule: BoundaryRule, selection: Selection): boolean {
  const buttonsOk = Object.entries(rule.when.buttons).every(([key, values]) => {
    const chosen = selection.buttons[key as keyof Selection["buttons"]];
    return chosen !== undefined && (values ?? []).includes(chosen);
  });
  const keyword = squash(selection.keyword);
  const keywordOk = !rule.when.keywordAny.length || rule.when.keywordAny.some(word => keyword.includes(squash(word)));
  return buttonsOk && keywordOk;
}

/** 맞는 규칙을 파일 순서대로 최대 3개 돌려준다. */
export function matchBoundaryRules(rules: BoundaryRule[], selection: Selection): BoundaryRule[] {
  return rules.filter(rule => matches(rule, selection)).slice(0, MAX_BOUNDARY_ALERTS);
}
