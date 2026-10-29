// /api/answer 전용 답변 검사. Claude 답을 화면에 보내기 전에 서버 규칙만으로 두 가지를 본다(Claude를 다시 부르지 않음).
//  ① 하면 안 되는 말: 함께 보낸 자료의 "하면 안 되는 말" 문장이나 같은 뜻의 문장이 들어 있으면 차단
//  ② 근거 밖 숫자: 답에 나온 숫자(금액·일수·비율·조문 번호)가 함께 보낸 질문문(참고 자료 본문)에 없으면 차단
// 다른 파일의 값을 불러오지 않는다(시나리오 검사 스크립트가 이 파일을 바로 불러 쓰기 때문).

export type GuardCheck = "하면 안 되는 말" | "근거 밖 숫자";
export type GuardResult = { ok: true } | { ok: false; check: GuardCheck; found: string[] };

/** 부정 표현. "탕감받으세요"와 "탕감받는 것은 아닙니다"처럼 낱말이 같아도 뜻이 반대인 문장을 구분하는 데 쓴다. */
const NEGATION = /아니|아닙|아님|아닌|않|없|안\s?되|안\s?돼|안\s?됩|못\s|못하|불가|제외|어렵/;

/** 낱말 끝의 조사·어미. 떼고 남은 줄기로 비교한다("탕감받으세요" → "탕감받", "취약계층이면" → "취약계층"). */
const ENDINGS = [
  "으십니다", "으세요", "하세요", "합니다", "됩니다", "입니다", "이에요", "이면", "에서", "으로", "부터", "까지",
  "세요", "해요", "돼요", "어요", "아요", "에요", "예요", "니다", "면", "로", "은", "는", "이", "가", "을", "를",
  "에", "의", "도", "만", "요", "다",
].sort((a, b) => b.length - a.length);

/**
 * 같은 뜻으로 볼 문장의 기준: 하면 안 되는 말의 낱말 줄기 중 이 비율 이상이 한 문장에 있어야 한다.
 * (75%로 두면 "모든 금융기관 대출이 다 지원됩니다"가 정답 문장 "협약 금융기관 대출에 대해 지원"에도 걸려 80%로 둔다.)
 */
const MEANING_RATIO = 0.8;

/** 문장 끝 서술어(마지막 두 낱말)가 부정인지. 한국어는 끝 서술어가 뜻을 정한다("없어도 … 있습니다"는 긍정). */
function endsNegative(text: string): boolean {
  return NEGATION.test(text.trim().split(/\s+/).slice(-2).join(" "));
}

function squash(text: string): string {
  return text.replace(/[\s"'“”‘’.,!?~·…()]/g, "");
}

/** 끝의 조사·어미를 뗀다. 떼고 한 글자만 남으면("빚을" → "빚") 비교에 쓰지 않도록 한 글자로 돌려준다. */
function stem(word: string): string {
  for (const ending of ENDINGS) {
    if (word.endsWith(ending) && word.length > ending.length) return word.slice(0, -ending.length);
  }
  return word;
}

/** 문장의 낱말 줄기(두 글자 이상) */
function stems(text: string): string[] {
  const words = text.split(/[^가-힣A-Za-z0-9]+/).filter(Boolean);
  return [...new Set(words.map(stem).filter(w => w.length >= 2))];
}

/** 답을 문장으로 나눈다(마침표·물음표·느낌표·줄바꿈). */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。])\s+|\n+/)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * ① 하면 안 되는 말 찾기. 걸린 답 문장들을 돌려준다.
 * - 그 문장이 그대로(띄어쓰기·문장부호 무시) 들어 있거나
 * - 낱말 줄기 2개 이상·80% 이상이 한 문장에 있고, 끝 서술어 줄기도 있고, 끝 서술어의 부정 여부까지 같으면 같은 뜻으로 본다.
 */
export function findDoNotSay(answer: string, phrases: string[]): string[] {
  const hits = new Set<string>();
  for (const phrase of phrases.map(p => p.trim()).filter(Boolean)) {
    const whole = squash(phrase);
    const keys = stems(phrase);
    // 하면 안 되는 말의 끝 서술어 줄기(예: "끝납니다" → "끝납"). 뜻을 정하는 말이라 답 문장에도 있어야 같은 뜻으로 본다.
    const predicate = keys.at(-1) ?? "";
    for (const sentence of sentences(answer)) {
      const s = squash(sentence);
      if (whole && s.includes(whole)) {
        hits.add(sentence);
        continue;
      }
      if (keys.length < 2) continue;
      const matched = keys.filter(k => s.includes(k)).length;
      if (
        matched >= 2 &&
        matched / keys.length >= MEANING_RATIO &&
        s.includes(predicate) &&
        endsNegative(sentence) === endsNegative(phrase)
      ) {
        hits.add(sentence);
      }
    }
  }
  return [...hits];
}

/**
 * 검사할 숫자의 뒤에 붙는 단위(금액·일수·기간·횟수·비율·나이·조문). 이것이 붙은 숫자와 "제N조"의 N,
 * 그리고 단위가 없어도 네 자리 이상인 숫자(금액·전화번호 등)만 센다.
 * "3가지", "2단계"처럼 개수를 세는 말은 근거 숫자가 아니어서 세지 않는다.
 */
const UNIT = /^\s?(?:원|만|억|천|백|영업일|일|개월|달|년|주|시간|회차|회|번째|%|퍼센트|배|세|살|조|항|호)/;

/**
 * 글 속 숫자(금액·일수·비율·조문 번호)를 뽑는다. "1,000"은 1000, "015"는 15, "3.9"·"2026.6.29"는 그대로.
 * 답의 목록 번호(줄 맨 앞 "1." "2)")는 숫자로 세지 않는다.
 */
export function numbersIn(text: string): string[] {
  const body = text.replace(/^\s*\d+\s*[.)]\s/gm, "");
  const found: string[] = [];
  for (const m of body.matchAll(/\d+(?:[.,]\d+)*/g)) {
    const n = m[0];
    const before = body.slice(Math.max(0, m.index - 1), m.index);
    const after = body.slice(m.index + n.length, m.index + n.length + 4);
    if (UNIT.test(after) || before === "제" || n.replace(/\D/g, "").length >= 4 || n.includes(".")) found.push(n);
  }
  return [
    ...new Set(
      found.map(n => {
        if (/^\d{1,3}(,\d{3})+$/.test(n)) return n.replace(/,/g, "");
        return n
          .split(/[.,]/)
          .map(part => String(Number(part)))
          .join(".");
      }),
    ),
  ];
}

/** ② 근거 밖 숫자: 답에 나왔는데 참고 자료 본문에는 없는 숫자들 */
export function findOutsideNumbers(answer: string, reference: string): string[] {
  const allowed = new Set(numbersIn(reference));
  return numbersIn(answer).filter(n => !allowed.has(n));
}

/** 두 검사를 차례로 한다. 하나라도 걸리면 무엇에 걸렸는지 돌려준다. */
export function guardAnswer(answer: string, { reference, doNotSay }: { reference: string; doNotSay: string[] }): GuardResult {
  const said = findDoNotSay(answer, doNotSay);
  if (said.length) return { ok: false, check: "하면 안 되는 말", found: said };
  const outside = findOutsideNumbers(answer, reference);
  if (outside.length) return { ok: false, check: "근거 밖 숫자", found: outside };
  return { ok: true };
}
