// 화면 없이 계산 함수를 자동 채점한다. 실행: `npm run check`
// 설계 근거: DESIGN.md §9 검사 계획. 시나리오와 정답은 data/test-scenarios.md 표에서 읽는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { recommend } from "../lib/recommend.ts";
import { hasPersonalNumber, checkText, validateSelection } from "../lib/validate.ts";
import { buildQuestion, MAX_QUESTION_LENGTH } from "../lib/buildQuestion.ts";

const { items } = JSON.parse(readFileSync(new URL("../data/counsel-db.json", import.meta.url), "utf8"));

// 시나리오 표 한 줄: | 번호 | 연체 | 채무 | 단계 | 구분 | 주제 | 키워드 | 정답 | 확인하는 것 |
const COLUMNS = ["id", "연체", "채무", "단계", "구분", "주제", "keyword", "answer"];
const scenarios = readFileSync(new URL("../data/test-scenarios.md", import.meta.url), "utf8")
  .split(/\r?\n/)
  .filter(line => /^\|\s*S\d+/.test(line))
  .map(line => {
    const cells = line.split("|").slice(1, -1).map(c => c.trim());
    const row = Object.fromEntries(COLUMNS.map((name, i) => [name, cells[i]]));
    const buttons = Object.fromEntries(["연체", "채무", "단계", "구분", "주제"].filter(k => row[k]).map(k => [k, row[k]]));
    return { id: row.id, selection: { buttons, keyword: row.keyword, mode: "fast" }, answer: row.answer.split(" ")[0] };
  });

test("시나리오 표에서 10개를 읽음", () => {
  assert.equal(scenarios.length, 10);
});

for (const s of scenarios) {
  test(`${s.id} 추천: 정답 ${s.answer}`, () => {
    const ids = recommend(items, s.selection).map(item => item.id);
    if (s.answer === "없음") assert.deepEqual(ids, [], "0건이어야 함");
    else assert.ok(ids.includes(s.answer), `상위 3개 ${ids.join(",") || "(0건)"}에 정답 없음`);
    assert.ok(ids.length <= 3);
  });
}

test("키워드 없이 누르면 버튼 값만으로 번호 순 최대 3개", () => {
  const ids = recommend(items, { buttons: { 주제: "신청·서류" }, keyword: "", mode: "fast" }).map(i => i.id);
  assert.equal(ids.length, 3);
  assert.deepEqual(ids, [...ids].sort());
});

test("추천 결과는 모두 엑셀에 있는 줄 그대로 (지어내기 0건)", () => {
  for (const s of scenarios) {
    for (const item of recommend(items, s.selection)) assert.ok(items.includes(item));
  }
});

test("개인정보 숫자 차단", () => {
  assert.equal(hasPersonalNumber("010-1234-5678"), true);
  assert.equal(hasPersonalNumber("1.500.000"), true);
  assert.equal(hasPersonalNumber("900101 1234567"), true);
  assert.equal(hasPersonalNumber("150만원"), false);
  assert.equal(hasPersonalNumber("2주"), false);
});

test("키워드 20자 제한과 주제 필수", () => {
  assert.equal(checkText("가".repeat(20), 20), null);
  assert.equal(checkText("가".repeat(21), 20), "too-long");
  assert.equal(validateSelection({ buttons: {}, keyword: "취소", mode: "fast" }), "no-topic");
  assert.equal(validateSelection({ buttons: { 주제: "기타" }, keyword: "010-1234-5678", mode: "fast" }), "personal-number");
});

test("질문문: 빠른 답변은 1순위 1개, 보통 답변은 최대 3개, 모두 500자 이내", () => {
  for (const s of scenarios) {
    const results = recommend(items, s.selection);
    for (const mode of ["fast", "normal"]) {
      const text = buildQuestion({ ...s.selection, mode }, results);
      const refs = text.split("\n").filter(line => /^\d+\. /.test(line));
      assert.ok(text.length <= MAX_QUESTION_LENGTH, `${s.id} ${mode}: ${text.length}자`);
      assert.equal(refs.length, Math.min(results.length, mode === "fast" ? 1 : 3), `${s.id} ${mode}`);
      if (results.length) assert.ok(refs[0].includes(`추천DB ${results[0].id}`), "1순위 자료와 출처가 들어가야 함");
      assert.ok(text.includes("'추측'"), "자료 밖 내용은 추측 표시 지시가 들어가야 함");
      assert.ok(text.includes(mode === "fast" ? "3문장 이내" : "10문장 이내"));
    }
  }
});

test("질문문: 자료가 0건이어도 만들어지고, 없다고 적힘", () => {
  const text = buildQuestion({ buttons: { 주제: "상환유예" }, keyword: "상환유예", mode: "fast" }, []);
  assert.ok(text.includes("참고 자료:\n없음"));
});
