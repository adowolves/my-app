// 입력 검사. 설계 근거: DESIGN.md §4.2 ①, PRD 5절 must 1 규칙 4·5
// 다른 lib 파일의 값을 불러오지 않는다(시나리오 검사 스크립트가 이 파일을 바로 불러 쓰기 때문).
import type { Selection } from "./types";

export const MAX_KEYWORD_LENGTH = 20;

export type InputError = "too-long" | "personal-number" | "no-topic";

export const INPUT_ERROR_MESSAGE: Record<InputError, string> = {
  "too-long": `키워드는 ${MAX_KEYWORD_LENGTH}자까지 입력할 수 있어요.`,
  "personal-number": "개인정보는 입력하지 마세요. 금액은 \"150만원\"처럼 단위로 써 주세요.",
  "no-topic": "주제를 골라 주세요.",
};

/** 한자 숫자(〇一二…)를 아라비아 숫자로 바꾼다. */
const HANJA_DIGITS: Record<string, string> = { 〇: "0", 零: "0", 一: "1", 二: "2", 三: "3", 四: "4", 五: "5", 六: "6", 七: "7", 八: "8", 九: "9" };

/** 숫자 뒤에 붙는 단위 글자. 숫자 사이에 있어도 구분 기호로 보지 않는다(날짜·기간·금액). */
const UNIT_CHARS = "년월일주시분초원만억천백개회차세살번";

/**
 * 숫자와 완성된 한글 글자(가~힣)만 남기고 나머지를 지운 뒤 숫자가 6자리 이상 이어지면 개인정보로 본다.
 * PRD의 하이픈·공백·점에 더해 "/", 긴 대시(–), 괄호, 전각 숫자(０１０), 한자 숫자(〇一〇), 그리고 하이픈 대신 끼운
 * 한글 자모("ㅡ")·영문자("010o1234")·한글 한 글자("010가1234")도 같은 방식으로 막는다.
 * "150만원", "2주 3일"처럼 숫자 뒤에 단위를 붙인 말은 통과한다(한글이 두 글자 이상이거나 뒤에 숫자가 없으면 이어 보지 않음).
 */
export function hasPersonalNumber(text: string): boolean {
  const kept = text
    .normalize("NFKC")
    .replace(/[〇零一二三四五六七八九]/gu, ch => HANJA_DIGITS[ch])
    .replace(/[^\p{Nd}가-힣]/gu, "")
    // 숫자 사이에 낀 한글 한 글자는 구분 기호로 보고 지운다. 단, "2026년10월"처럼 단위 글자는 남긴다.
    .replace(/(?<=\p{Nd})[가-힣](?=\p{Nd})/gu, ch => (UNIT_CHARS.includes(ch) ? ch : ""));
  return /\p{Nd}{6,}/u.test(kept);
}

/** 키워드 한 칸만 검사한다. 이관 메모의 "다음 담당자에게" 칸에도 같은 규칙을 쓴다. */
export function checkText(text: string, maxLength: number): InputError | null {
  if (text.length > maxLength) return "too-long";
  if (hasPersonalNumber(text)) return "personal-number";
  return null;
}

/** [추천 받기]를 누를 때 전체 입력을 검사한다. 문제가 없으면 null. */
export function validateSelection(selection: Selection): InputError | null {
  const keywordError = checkText(selection.keyword, MAX_KEYWORD_LENGTH);
  if (keywordError) return keywordError;
  if (!selection.buttons["주제"]) return "no-topic";
  return null;
}
