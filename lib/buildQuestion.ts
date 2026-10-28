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

function sourceLine(item: CounselItem, summaryLimit: number): string {
  const summary =
    summaryLimit <= 0 ? "" : item.summary.length > summaryLimit ? ` — ${item.summary.slice(0, summaryLimit)}…` : ` — ${item.summary}`;
  return `${item.question}${summary} (출처: 추천DB ${item.id}, 새출발기금 공식 FAQ)`;
}

function compose(selection: Selection, items: CounselItem[], summaryLimit: number): string {
  const situation = BUTTON_ORDER.filter(key => selection.buttons[key])
    .map(key => `${key} ${selection.buttons[key]}`)
    .join(" / ");
  const keyword = selection.keyword.trim();
  const references = items.length
    ? items.map((item, i) => `${i + 1}. ${sourceLine(item, summaryLimit)}`).join("\n")
    : "없음 (상담카드 자료에서 찾지 못함)";
  return [
    "[새출발기금 상담 질문]",
    `상황: ${situation || "고르지 않음"}`,
    `키워드: ${keyword || "없음"}`,
    "참고 자료:",
    references,
    `요청: 위 참고 자료를 근거로 답해 주세요. 자료 밖의 내용은 '추측'이라고 표시하고, ${MODE_RULE[selection.mode].ask}`,
  ].join("\n");
}

/**
 * 질문문을 만든다. 500자를 넘으면 답변 요약부터 줄이고, 그래도 넘으면 요약을 뺀다(규칙 1).
 * results는 recommend()가 돌려준 순서 그대로 넘긴다.
 */
export function buildQuestion(selection: Selection, results: CounselItem[]): string {
  const items = results.slice(0, MODE_RULE[selection.mode].count);
  for (let limit = 200; limit >= 0; limit -= 20) {
    const text = compose(selection, items, limit);
    if (text.length <= MAX_QUESTION_LENGTH) return text;
  }
  return compose(selection, items, 0).slice(0, MAX_QUESTION_LENGTH);
}
