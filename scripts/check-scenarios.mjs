// 화면 없이 계산 함수를 자동 채점한다. 실행: `npm run check`
// 설계 근거: DESIGN.md §9 검사 계획. 시나리오와 정답은 data/test-scenarios.md 표에서 읽는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { recommend } from "../lib/recommend.ts";
import { hasPersonalNumber, checkText, validateSelection } from "../lib/validate.ts";
import { buildQuestion, MAX_QUESTION_LENGTH } from "../lib/buildQuestion.ts";
import { buildHandoff, MAX_HANDOFF_LENGTH, MAX_NOTE_LENGTH } from "../lib/buildHandoff.ts";

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

// 빠른 답변 질문문에는 1순위 자료 1개만 들어가므로, 정답이 1순위여야 사내 LLM에 정답 자료가 넘어간다.
test("빠른 답변: 시나리오 정답이 1순위라 질문문에 정답 자료가 들어감", () => {
  for (const s of scenarios.filter(s => s.answer !== "없음")) {
    const results = recommend(items, s.selection);
    assert.equal(results[0]?.id, s.answer, `${s.id}: 1순위 ${results[0]?.id ?? "(없음)"}`);
    assert.ok(buildQuestion(s.selection, results).includes(`추천DB ${s.answer}`), `${s.id}: 질문문에 정답 없음`);
  }
});

test("번호 순 정렬은 숫자 크기 기준 (\"7\"이 \"010\"보다 앞)", () => {
  const base = items[0];
  const odd = [{ ...base, id: "010" }, { ...base, id: "7" }];
  const ids = recommend(odd, { buttons: {}, keyword: "", mode: "fast" }).map(i => i.id);
  assert.deepEqual(ids, ["7", "010"]);
});

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
  // 하이픈·공백·점 말고 다른 기호로 끊어 쓴 번호도 막는다
  assert.equal(hasPersonalNumber("010/1234/5678"), true);
  assert.equal(hasPersonalNumber("010–1234–5678"), true);
  assert.equal(hasPersonalNumber("(02)123-4567"), true);
  assert.equal(hasPersonalNumber("０１０１２３４５６７８"), true);
  assert.equal(hasPersonalNumber("1~2주 3개월"), false);
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

test("질문문: 선택 6개를 모두 적고, 고르지 않은 버튼은 '전체'로 적음", () => {
  const text = buildQuestion({ buttons: { 주제: "기타", 단계: "상환 중" }, keyword: "", mode: "fast" }, []);
  assert.ok(text.includes("상황: 주제 기타 / 연체 전체 / 채무 전체 / 단계 상환 중 / 구분 전체 / 온도 전체"), text);
});

test("질문문: 아주 긴 자료여도 500자 안에서 지시문·출처 번호가 잘리지 않음", () => {
  const long = items.slice(0, 3).map(item => ({ ...item, question: "가".repeat(300), summary: "나".repeat(300) }));
  const selection = { buttons: { 주제: "기타", 연체: "10~89일", 채무: "둘 다", 단계: "채무조정안 제시", 구분: "법인 소상공인", 온도: "악성" }, keyword: "가".repeat(20) };
  for (const mode of ["fast", "normal"]) {
    const text = buildQuestion({ ...selection, mode }, long);
    assert.ok(text.length <= MAX_QUESTION_LENGTH, `${mode}: ${text.length}자`);
    assert.ok(text.includes("'추측'") && text.includes(mode === "fast" ? "3문장 이내" : "10문장 이내"), `${mode}: 지시문 잘림`);
    for (const item of long.slice(0, mode === "fast" ? 1 : 3)) assert.ok(text.includes(`추천DB ${item.id}`), `${mode}: ${item.id} 출처 잘림`);
  }
});

test("이관 메모: 모든 시나리오에서 300자 이내, 안내한 자료 번호와 다음 담당자 메모가 들어감", () => {
  const note = "가".repeat(MAX_NOTE_LENGTH);
  for (const s of scenarios) {
    const results = recommend(items, { ...s.selection, buttons: { ...s.selection.buttons, 온도: "악성" } });
    const memo = buildHandoff(s.selection, results, note);
    assert.ok(memo.length <= MAX_HANDOFF_LENGTH, `${s.id}: ${memo.length}자`);
    for (const item of results) assert.ok(memo.includes(`추천DB ${item.id}`), `${s.id}: ${item.id} 빠짐`);
    assert.ok(memo.includes(`다음 담당자에게: ${note}`));
  }
});

test("이관 메모: 다음 담당자 칸도 숫자 6자리 이상을 막는 같은 검사를 씀", () => {
  assert.equal(checkText("소득 증빙 확인 필요", MAX_NOTE_LENGTH), null);
  assert.equal(checkText("010 1234 5678로 회신", MAX_NOTE_LENGTH), "personal-number");
  assert.equal(checkText("가".repeat(MAX_NOTE_LENGTH + 1), MAX_NOTE_LENGTH), "too-long");
});
