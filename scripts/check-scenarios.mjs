// 화면 없이 계산 함수를 자동 채점한다. 실행: `npm run check`
// 설계 근거: DESIGN.md §9 검사 계획. 시나리오와 정답은 data/test-scenarios.md 표에서 읽는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { recommend, recommendWithScope, searchTerms } from "../lib/recommend.ts";
import { hasPersonalNumber, checkText, validateSelection } from "../lib/validate.ts";
import { buildQuestion, MAX_QUESTION_LENGTH } from "../lib/buildQuestion.ts";
import { buildHandoff, MAX_HANDOFF_LENGTH, MAX_NOTE_LENGTH } from "../lib/buildHandoff.ts";
import { articleText, ruleLabels, ruleRefs } from "../lib/ruleRefs.ts";
import { matchBoundaryRules, MAX_BOUNDARY_ALERTS } from "../lib/boundary.ts";

const { items, articles, buttons, defaultQuestions, boundaryRules } = JSON.parse(readFileSync(new URL("../data/counsel-db.json", import.meta.url), "utf8"));

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

test("확인 질문: 줄마다 3개(없으면 주제별 기본 3개), 선택지 2~3개, 개인정보를 묻지 않음", () => {
  const personal = /이름|성함|전화|연락처|휴대폰|핸드폰|고객번호|주민|생년월일|계좌번호|주소/;
  const check = (where, list) => {
    assert.equal(list.length, 3, `${where}: 질문 수`);
    for (const q of list) {
      assert.ok(q.question.trim(), `${where}: 빈 질문`);
      assert.ok(q.options.length >= 2 && q.options.length <= 3, `${where}: "${q.question}" 선택지 ${q.options.length}개`);
      assert.ok(![q.question, ...q.options.flatMap(o => [o.label, o.keyword])].some(t => personal.test(t)), `${where}: "${q.question}" 개인정보`);
    }
  };
  for (const topic of buttons["주제"]) check(`기본 질문 ${topic}`, defaultQuestions[topic]);
  for (const item of items) check(item.id, item.questions.length ? item.questions : defaultQuestions[item.filters["주제"]]);
});

test("확인 질문 답: 바꿀 값은 버튼선택지에 있는 값이고, 눌러서 다시 찾으면 0건이 아님", () => {
  const settable = ["주제", "연체", "채무", "단계", "구분"];
  const lists = [
    ...items.map(item => ({ where: item.id, base: { 주제: item.filters["주제"] }, keyword: item.keywords[0], list: item.questions })),
    ...buttons["주제"].map(topic => ({ where: `기본 ${topic}`, base: { 주제: topic }, keyword: "", list: defaultQuestions[topic] })),
  ];
  let clickable = 0;
  for (const { where, base, keyword, list } of lists) {
    for (const q of list) {
      for (const option of q.options) {
        for (const [key, value] of Object.entries(option.set)) {
          assert.ok(settable.includes(key) && buttons[key].includes(value), `${where}: "${option.label}" ${key}=${value}`);
        }
        if (!option.keyword && !Object.keys(option.set).length) continue;
        clickable++;
        assert.equal(checkText(option.keyword, 20), null, `${where}: "${option.label}" 키워드 검사`);
        const selection = { buttons: { ...base, ...option.set }, keyword: option.keyword || keyword, mode: "fast" };
        assert.ok(recommend(items, selection).length > 0, `${where}: "${q.question} → ${option.label}" 다시 찾으면 0건`);
      }
    }
  }
  assert.ok(clickable >= 100, `누를 수 있는 답 ${clickable}개`);
});

test("이관 메모: 확인한 내용 줄(질문 → 답)을 더하고, 길면 오래된 확인부터 줄여 300자를 지킴", () => {
  const picked = ["015", "016", "009"].map(id => items.find(item => item.id === id));
  const selection = { buttons: { 주제: "신청·서류" }, keyword: "취소", mode: "fast" };
  const plain = buildHandoff(selection, picked, "", []);
  assert.ok(!plain.includes("확인한 내용"), "확인이 없으면 줄을 넣지 않음");
  const one = buildHandoff(selection, picked, "", [], ["신청한 채무조정 방식은 무엇인가요? → 매입형"]);
  assert.match(one, /\n확인한 내용: 신청한 채무조정 방식은 무엇인가요\? → 매입형\n다음 담당자에게: 없음$/);
  const many = Array.from({ length: 12 }, (_, i) => `확인 질문 ${i + 1}번은 무엇인가요? → 예`);
  const memo = buildHandoff(selection, picked, "가".repeat(MAX_NOTE_LENGTH), [], many);
  assert.ok(memo.length <= MAX_HANDOFF_LENGTH, `${memo.length}자`);
  assert.ok(memo.includes("확인 질문 12번은 무엇인가요? → 예"), "가장 최근 확인은 남음");
  assert.match(memo, /\(앞 \d+건 생략\)/);
  assert.ok(memo.endsWith(`다음 담당자에게: ${"가".repeat(MAX_NOTE_LENGTH)}`));
});

test("경계 규칙: 조건에 맞는 규칙만 파일 순서대로 최대 3개, 비공개 근거·내용 없음", () => {
  const ids = buttonsSel => matchBoundaryRules(boundaryRules, { buttons: buttonsSel, keyword: "", mode: "fast" }).map(r => r.id);
  assert.deepEqual(ids({ 주제: "신청·서류", 연체: "10~89일" }), ["B01"]);
  assert.deepEqual(ids({ 주제: "감면·상환 조건", 채무: "둘 다" }), ["B03"]);
  assert.deepEqual(ids({ 주제: "지원 자격", 단계: "신청 전" }), ["B04"]);
  assert.deepEqual(ids({ 주제: "기타", 연체: "10~89일", 채무: "담보", 단계: "신청 전" }), ["B01", "B03", "B04"]);
  assert.deepEqual(ids({ 주제: "기타", 연체: "90일 이상", 채무: "무담보" }), []);
  // 키워드 조건(키워드에): 띄어쓰기를 무시하고 낱말 하나만 들어 있으면 맞음. 4개가 맞아도 3개까지만.
  const extra = [
    ...boundaryRules,
    { id: "B99", when: { buttons: {}, keywordAny: ["예금"] }, alert: "x", question: boundaryRules[0].question, basis: "x" },
  ];
  const both = matchBoundaryRules(extra, { buttons: { 연체: "10~89일", 채무: "담보", 단계: "신청 전" }, keyword: "예 금 상계", mode: "fast" });
  assert.equal(both.length, MAX_BOUNDARY_ALERTS);
  assert.ok(matchBoundaryRules(extra, { buttons: {}, keyword: "예 금", mode: "fast" }).some(r => r.id === "B99"));
  // 비공개(제11조②·별표 1~4·11·순자산 기준 등)는 알림·질문·근거 어디에도 없음
  const nonPublic = /별표\s*(?:[1-4]|11)(?!\d)|제11조\s*(?:②|제2항)|제53조의[23]|순자산|6\.5억/;
  for (const rule of boundaryRules) {
    assert.ok(!nonPublic.test(JSON.stringify(rule)), `${rule.id}: 비공개 내용`);
    for (const option of rule.question.options) {
      if (!option.keyword && !Object.keys(option.set).length) continue;
      const base = Object.fromEntries(Object.entries(rule.when.buttons).map(([k, v]) => [k, v[0]]));
      const selection = { buttons: { 주제: "기타", ...base, ...option.set }, keyword: option.keyword, mode: "fast" };
      assert.ok(recommend(items, selection).length > 0, `${rule.id}: "${option.label}" 다시 찾으면 0건`);
    }
  }
});

test("모든 줄에 하면 안 되는 말·넘길 곳이 있어 카드에 늘 보임", () => {
  for (const item of items) {
    assert.ok(item.doNotSay.trim(), `${item.id}: 하면 안 되는 말 빈칸`);
    assert.ok(item.handOff.trim(), `${item.id}: 넘길 곳 빈칸`);
  }
});

test("붙여 쓴 말: 뜻 없는 말(방식·방법 등)을 떼고, 네 글자 말은 반씩도 약하게 찾음", () => {
  const terms = searchTerms("재산가액 산정방식");
  assert.ok(terms.strong.includes("산정") && terms.strong.includes("재산가액"));
  assert.ok(!terms.strong.includes("방식"));
  assert.deepEqual(terms.weak.sort(), ["가액", "재산"]);
  // 산정 방식을 물으면 산정 관련 요강 자료가 1순위, 순부채(부채-재산가액) FAQ도 함께 나옴
  const ids = recommend(items, { buttons: {}, keyword: "재산가액 산정방식", mode: "fast" }).map(i => i.id);
  assert.equal(ids[0], "052");
  assert.ok(ids.includes("025"), ids.join());
  // 입력 전체와 맞는 키워드가 있는 줄이, 낱말 하나만 맞는 키워드가 많은 줄보다 앞
  assert.equal(recommend(items, { buttons: { 주제: "신청·서류" }, keyword: "신청 방법", mode: "fast" })[0]?.id, "007");
});

test("키워드는 낱말로 나눠 찾고, FAQ 제목에 든 말도 찾음", () => {
  // "서류 재제출" → "서류" 낱말로 키워드 칸(036)을 찾음
  assert.ok(recommend(items, { buttons: { 주제: "신청·서류" }, keyword: "서류 재제출", mode: "fast" }).some(i => i.id === "036"));
  // "외국인 신청" → 키워드 칸 "외국인"(035)이 1순위
  assert.equal(recommend(items, { buttons: { 주제: "지원 자격" }, keyword: "외국인 신청", mode: "fast" })[0]?.id, "035");
  // 키워드 칸에 없는 "현금서비스도" 같은 말도 키워드 칸 "현금서비스"를 품어 찾음
  assert.equal(recommend(items, { buttons: { 주제: "대상 채무" }, keyword: "현금서비스도", mode: "fast" })[0]?.id, "041");
});

test("버튼을 모두 지키면 0건일 때: 주제만 남기고 → 전체 순으로 넓혀 찾고, 어떻게 찾았는지 알려 줌", () => {
  const exact = recommendWithScope(items, { buttons: { 주제: "신청·서류" }, keyword: "취소", mode: "fast" });
  assert.equal(exact.scope, "exact");
  const topic = recommendWithScope(items, { buttons: { 주제: "신청·서류", 단계: "채무조정안 제시" }, keyword: "위임장", mode: "fast" });
  assert.equal(topic.scope, "topic");
  assert.ok(topic.items.every(i => i.filters["주제"] === "신청·서류" || i.filters["주제"] === "전체"));
  const all = recommendWithScope(items, { buttons: { 주제: "감면·상환 조건" }, keyword: "카드론", mode: "fast" });
  assert.equal(all.scope, "all");
  assert.equal(all.items[0]?.id, "041");
  // 키워드 없이는 전체로 넓히지 않음(아무 자료나 나오지 않게)
  assert.deepEqual(recommendWithScope(items, { buttons: { 주제: "없는 주제" }, keyword: "", mode: "fast" }).items, []);
});

test("어디에도 없는 키워드는 넓혀 찾아도 0건 (해당 자료 없음 안내, 규칙 3)", () => {
  for (const keyword of ["해외송금", "비트코인"]) {
    assert.deepEqual(recommend(items, { buttons: { 주제: "기타" }, keyword, mode: "fast" }), [], keyword);
  }
});

test("요강 기반 자료([규정] 044~)는 FAQ 원문 칸에 조문이 그대로 있고 출처가 요강", () => {
  const rules = items.filter(i => i.question.startsWith("[규정]"));
  assert.ok(rules.length >= 8);
  for (const item of rules) {
    assert.match(item.original, /^제\d+조/, `${item.id}: 조문으로 시작해야 함`);
    assert.ok(item.source.includes("위탁채권 관리업무요강"), `${item.id}: 출처`);
  }
});

test("요강은 2026.6.29. 시행 공개본이고, 비공개 부분은 '(비공개)' 표시만 있음", () => {
  for (const [no, article] of Object.entries(articles)) assert.ok(article.source.includes("2026.6.29. 시행본"), `${no}: 출처 시행본`);
  for (const item of items.filter(i => i.question.startsWith("[규정]"))) assert.ok(item.source.includes("2026.6.29. 시행본"), `${item.id}: 출처 시행본`);
  // 공개본에서 가려진 곳: 제11조②, 제50조⑤ 제4~7호, 제53조②, 제53조의2·3
  assert.ok(articles["제11조"].text.includes("② (비공개)"));
  assert.ok(articles["제53조"].text.includes("② (비공개)"));
  for (const n of [4, 5, 6, 7]) assert.ok(articles["제50조"].text.includes(`${n}. (비공개)`));
  assert.equal(articles["제53조의2"].text, "(비공개)");
  assert.equal(articles["제53조의3"].text, "(비공개)");
  // 예전 3.25본에 있던 제11조②(순자산 기준) 내용이 어디에도 남지 않음
  const all = JSON.stringify({ items, articles });
  assert.ok(!/6\.5억|순자산/.test(all), "비공개가 된 제11조② 내용이 남아 있음");
});

test("관련 규정에서 요강 조문 번호를 읽음 (요지 속 조문은 세지 않음)", () => {
  assert.deepEqual(ruleRefs("관리업무요강 제2조 제6·7호: 부실차주는 …"), [{ no: "제2조", items: [6, 7] }]);
  assert.deepEqual(ruleRefs("관리업무요강 제23조, 제25조, 제30조"), [
    { no: "제23조", items: [] },
    { no: "제25조", items: [] },
    { no: "제30조", items: [] },
  ]);
  assert.deepEqual(ruleRefs("새출발기금 지원 협약 / 관리업무요강 제27조의2: 제22조에 따라 …"), [{ no: "제27조의2", items: [] }]);
  assert.deepEqual(ruleRefs("새출발기금 지원 협약"), []);
});

test("관련 규정이 가리키는 요강 조문은 모두 요강조문 시트에 있고, 호를 가리키면 그 호만 보여 줌", () => {
  for (const item of items) {
    for (const ref of ruleRefs(item.rule)) {
      assert.ok(articles[ref.no], `${item.id}: ${ref.no} 조문이 요강조문 시트에 없음`);
      for (const n of ref.items) assert.ok(articleText(articles[ref.no], [n]).includes(`\n${n}. `), `${item.id}: ${ref.no} 제${n}호 없음`);
    }
  }
  const def = articleText(articles["제2조"], [26]);
  assert.equal(def.split("\n").length, 2);
  assert.ok(def.includes("“대상채권”"));
});

test("추천 문장은 줄마다 1~3개, 한 문장 30자 이내", () => {
  for (const item of items) {
    assert.ok(item.phrases.length >= 1 && item.phrases.length <= 3, `${item.id}: ${item.phrases.length}개`);
    for (const p of item.phrases) assert.ok([...p].length <= 30, `${item.id}: "${p}" ${[...p].length}자`);
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
  // 숫자 사이에 한글 자모·영문자를 끼워 넣어도 막는다
  assert.equal(hasPersonalNumber("010ㅡ1234ㅡ5678"), true);
  assert.equal(hasPersonalNumber("010o1234o5678"), true);
  assert.equal(hasPersonalNumber("2026년 10월"), false);
  // 숫자 사이에 한글 한 글자를 끼우거나 한자 숫자로 써도 막는다. 단위가 붙은 말은 통과한다
  assert.equal(hasPersonalNumber("010가1234가5678"), true);
  assert.equal(hasPersonalNumber("010공1234공5678"), true);
  assert.equal(hasPersonalNumber("2026년10월"), false);
  assert.equal(hasPersonalNumber("〇一〇一二三四五六七八"), true);
  assert.equal(hasPersonalNumber("150만원"), false);
  assert.equal(hasPersonalNumber("2주3일"), false);
  assert.equal(hasPersonalNumber("1년2개월 3주"), false);
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
    const memo = buildHandoff(s.selection, results, note, results.map(item => ruleLabels(item.rule, articles)));
    assert.ok(memo.length <= MAX_HANDOFF_LENGTH, `${s.id}: ${memo.length}자`);
    for (const item of results) {
      assert.ok(memo.includes(`추천DB ${item.id}`), `${s.id}: ${item.id} 빠짐`);
      for (const ref of ruleRefs(item.rule)) assert.ok(memo.includes(ref.no), `${s.id}: ${item.id}의 ${ref.no} 빠짐`);
    }
    assert.ok(memo.includes(`다음 담당자에게: ${note}`));
  }
});

test("이관 메모: 자료마다 요강 조문 번호·제목을 붙이고, 출처에 FAQ와 요강을 나눠 적음", () => {
  const picked = ["039", "025", "047"].map(id => items.find(item => item.id === id));
  const selection = { buttons: { 주제: "이의신청·정보변경" }, keyword: "재산가 산정" };
  const memo = buildHandoff(selection, picked, "", picked.map(item => ruleLabels(item.rule, articles)));
  assert.ok(memo.length <= MAX_HANDOFF_LENGTH, `${memo.length}자`);
  assert.match(memo, /추천DB 039 .*\[요강 제59조\(보전조치의 취하\)\]/);
  assert.match(memo, /추천DB 047 .*\[요강 제35조\(채무조정의 재약정\)\]/);
  assert.ok(memo.includes("새출발기금 공식 FAQ·관리업무요강"), "출처에 요강 빠짐");
});

test("이관 메모: 다음 담당자 칸도 숫자 6자리 이상을 막는 같은 검사를 씀", () => {
  assert.equal(checkText("소득 증빙 확인 필요", MAX_NOTE_LENGTH), null);
  assert.equal(checkText("010 1234 5678로 회신", MAX_NOTE_LENGTH), "personal-number");
  assert.equal(checkText("가".repeat(MAX_NOTE_LENGTH + 1), MAX_NOTE_LENGTH), "too-long");
});
