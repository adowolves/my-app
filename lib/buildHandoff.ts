// 이관 메모 만들기(nice). 다음 담당자가 공식 상담 시스템에 붙여넣어 상담을 이어받게 한다. PRD 5절 nice 이관 메모 규칙 1~4
// 앱은 메모를 저장하지 않는다. 다른 lib 파일의 값을 불러오지 않는다(시나리오 검사 스크립트가 바로 불러 쓰기 때문).
import type { ButtonKey, CounselItem, Selection } from "./types";

export const MAX_HANDOFF_LENGTH = 300;
export const MAX_NOTE_LENGTH = 50;

const BUTTON_ORDER: ButtonKey[] = ["주제", "연체", "채무", "단계", "구분", "온도"];

function compose(selection: Selection, items: CounselItem[], note: string, titleLimit: number): string {
  const situation = BUTTON_ORDER.filter(key => selection.buttons[key])
    .map(key => `${key} ${selection.buttons[key]}`)
    .join(" / ");
  const title = (q: string) => (titleLimit <= 0 ? "" : q.length > titleLimit ? ` ${q.slice(0, titleLimit)}…` : ` ${q}`);
  const guided = items.length
    ? items.map(item => `추천DB ${item.id}${title(item.question)}`).join(" / ") + " (출처: 새출발기금 공식 FAQ)"
    : "없음";
  return [
    "[새출발기금 상담 이관 메모]",
    `상황: ${situation || "고르지 않음"}`,
    `키워드: ${selection.keyword.trim() || "없음"}`,
    `안내한 자료: ${guided}`,
    `다음 담당자에게: ${note.trim() || "없음"}`,
  ].join("\n");
}

/** 300자를 넘으면 자료 제목부터 줄이고, 그래도 넘으면 번호만 남긴다(규칙 2). note는 50자 이내로 검사된 값을 넘긴다. */
export function buildHandoff(selection: Selection, items: CounselItem[], note: string): string {
  for (let limit = 60; limit >= 0; limit -= 10) {
    const text = compose(selection, items, note, limit);
    if (text.length <= MAX_HANDOFF_LENGTH) return text;
  }
  return compose(selection, items, note, 0).slice(0, MAX_HANDOFF_LENGTH);
}
