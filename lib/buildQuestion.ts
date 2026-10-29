// 사내 LLM에 붙여넣을 질문문 만들기. 설계 근거: DESIGN.md §4.2 ③, PRD 5절 must 2 규칙 1~5
// 넣는 것은 버튼 값·키워드·엑셀 자료뿐이라 민원인 정보가 들어갈 자리가 없다(규칙 4).
// 다른 lib 파일의 값을 불러오지 않는다(시나리오 검사 스크립트가 이 파일을 바로 불러 쓰기 때문).
import type { AnswerMode, ButtonKey, CounselItem, Selection } from "./types";

export const MAX_QUESTION_LENGTH = 500;

const BUTTON_ORDER: ButtonKey[] = ["주제", "연체", "채무", "단계", "구분", "온도"];

/** 빠른 답변: 1순위 자료 1개·3문장 / 보통 답변: 최대 3개·10문장 (규칙 5) */
const MODE_RULE: Record<AnswerMode, { count: number; ask: string }> = {
  fast: { count: 1, ask: "3문장 이내로 답해 주세요." },
  normal: { count: 3, ask: "10문장 이내로, 근거와 민원인에게 확인할 질문을 포함해 답해 주세요." },
};

/** 글을 limit자까지 줄이고, 줄였으면 "…"을 붙인다. */
function cut(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function sourceLine(item: CounselItem, summaryLimit: number, titleLimit: number): string {
  const summary = summaryLimit <= 0 ? "" : ` — ${cut(item.summary, summaryLimit)}`;
  return `${cut(item.question, titleLimit)}${summary} (출처: 추천DB ${item.id}, 새출발기금 공식 FAQ)`;
}

/** 선택 6개를 모두 적는다. 고르지 않은 버튼은 "전체"로 적는다(규칙 2, must 1 규칙 5). */
function situationLine(selection: Selection): string {
  return BUTTON_ORDER.map(key => `${key} ${selection.buttons[key] || "전체"}`).join(" / ");
}

function compose(selection: Selection, items: CounselItem[], summaryLimit: number, titleLimit: number): string {
  const keyword = selection.keyword.trim();
  const references = items.length
    ? items.map((item, i) => `${i + 1}. ${sourceLine(item, summaryLimit, titleLimit)}`).join("\n")
    : "없음 (상담카드 자료에서 찾지 못함)";
  return [
    "[새출발기금 상담 질문]",
    `상황: ${situationLine(selection)}`,
    `키워드: ${keyword || "없음"}`,
    "참고 자료:",
    references,
    `요청: 위 참고 자료를 근거로 답해 주세요. 자료 밖의 내용은 '추측'이라고 표시하고, ${MODE_RULE[selection.mode].ask}`,
  ].join("\n");
}

/**
 * 질문문을 만든다(규칙 1). 500자를 넘으면 답변 요약부터 줄이고, 요약을 다 빼도 넘으면 FAQ 제목을 줄인다.
 * 맨 끝의 '추측' 표시·답변 길이 지시문과 출처 번호는 잘리지 않는다(규칙 2·3).
 * results는 recommend()가 돌려준 순서 그대로 넘긴다.
 */
export function buildQuestion(selection: Selection, results: CounselItem[]): string {
  const items = results.slice(0, MODE_RULE[selection.mode].count);
  for (let limit = 200; limit >= 0; limit -= 20) {
    const text = compose(selection, items, limit, Infinity);
    if (text.length <= MAX_QUESTION_LENGTH) return text;
  }
  // 버튼 값과 20자 키워드만 들어가므로 제목을 0자까지 줄이면 반드시 500자 안에 든다.
  for (let limit = 60; limit >= 0; limit -= 10) {
    const text = compose(selection, items, 0, limit);
    if (text.length <= MAX_QUESTION_LENGTH) return text;
  }
  return compose(selection, items, 0, 0);
}
