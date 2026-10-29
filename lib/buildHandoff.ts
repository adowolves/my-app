// 이관 메모 만들기(nice). 다음 담당자가 공식 상담 시스템에 붙여넣어 상담을 이어받게 한다. PRD 5절 nice 이관 메모 규칙 1~4
// 앱은 메모를 저장하지 않는다. 다른 lib 파일의 값을 불러오지 않는다(시나리오 검사 스크립트가 바로 불러 쓰기 때문).
import type { ButtonKey, CounselItem, Selection } from "./types";

export const MAX_HANDOFF_LENGTH = 300;
export const MAX_NOTE_LENGTH = 50;

/** 자료마다 붙일 요강 조문. 예: { no: "제16조", title: "채무조정 신청의 취소" } */
export type HandoffRule = { no: string; title: string };

const BUTTON_ORDER: ButtonKey[] = ["주제", "연체", "채무", "단계", "구분", "온도"];
const FAQ_SOURCE = "새출발기금 공식 FAQ";
const RULE_SOURCE = "관리업무요강(2026.6.29. 시행본)";

/** 자료 출처를 FAQ·요강 중 실제로 쓴 것만 적는다. */
function sourceOf(items: CounselItem[], rules: HandoffRule[][]): string {
  const names: string[] = [];
  if (items.some(item => !item.question.startsWith("[규정]"))) names.push(FAQ_SOURCE);
  if (rules.some(list => list.length) || items.some(item => item.question.startsWith("[규정]"))) names.push(RULE_SOURCE);
  return names.join("·");
}

type Shrink = { titleLimit: number; ruleTitles: boolean; keptChecks: number };

function compose(selection: Selection, items: CounselItem[], rules: HandoffRule[][], note: string, checks: string[], shrink: Shrink): string {
  // 선택 6개를 모두 적는다. 고르지 않은 버튼은 "전체"로 적는다(규칙 1).
  const situation = BUTTON_ORDER.map(key => `${key} ${selection.buttons[key] || "전체"}`).join(" / ");
  const { titleLimit, ruleTitles, keptChecks } = shrink;
  const title = (q: string) => (titleLimit <= 0 ? "" : q.length > titleLimit ? ` ${q.slice(0, titleLimit)}…` : ` ${q}`);
  // 자료마다 관련 요강 조문 번호와 제목을 붙인다. 조문이 없으면 붙이지 않는다.
  const rule = (list: HandoffRule[] = []) =>
    list.length ? ` [요강 ${list.map(r => (ruleTitles && r.title ? `${r.no}(${r.title})` : r.no)).join("·")}]` : "";
  const guided = items.length
    ? items.map((item, i) => `추천DB ${item.id}${title(item.question)}${rule(rules[i])}`).join(" / ") +
      ` (출처: ${sourceOf(items, rules)})`
    : "없음";
  // 확인 질문에서 고른 답("질문 → 답"). 길면 오래된 것부터 줄이고 몇 건 줄였는지 적는다.
  const kept = checks.slice(checks.length - keptChecks);
  const dropped = checks.length - kept.length;
  const checked = checks.length ? [`확인한 내용: ${dropped ? `(앞 ${dropped}건 생략) ` : ""}${kept.join(" / ")}`] : [];
  return [
    "[새출발기금 상담 이관 메모]",
    `상황: ${situation}`,
    `키워드: ${selection.keyword.trim() || "없음"}`,
    `안내한 자료: ${guided}`,
    ...checked,
    `다음 담당자에게: ${note.trim() || "없음"}`,
  ].join("\n");
}

/**
 * 300자를 넘으면 자료 제목부터 줄이고, 그래도 넘으면 조문 제목을 빼고 번호만 남기고,
 * 그래도 넘으면 확인한 내용을 오래된 것부터 줄인다(규칙 2).
 * note는 50자 이내로 검사된 값을 넘긴다. rules[i]는 items[i]의 관련 요강 조문이다.
 * checks는 확인 질문에서 고른 "질문 → 답" 목록(앞이 먼저 고른 것). 비어 있으면 그 줄을 넣지 않는다.
 */
export function buildHandoff(
  selection: Selection,
  items: CounselItem[],
  note: string,
  rules: HandoffRule[][] = [],
  checks: string[] = [],
): string {
  const tries: Shrink[] = [];
  for (const ruleTitles of [true, false]) {
    for (let titleLimit = 60; titleLimit >= 0; titleLimit -= 10) tries.push({ titleLimit, ruleTitles, keptChecks: checks.length });
  }
  for (let keptChecks = checks.length - 1; keptChecks >= 0; keptChecks--) tries.push({ titleLimit: 0, ruleTitles: false, keptChecks });
  for (const shrink of tries) {
    const text = compose(selection, items, rules, note, checks, shrink);
    if (text.length <= MAX_HANDOFF_LENGTH) return text;
  }
  return compose(selection, items, rules, note, checks, { titleLimit: 0, ruleTitles: false, keptChecks: 0 }).slice(0, MAX_HANDOFF_LENGTH);
}
