// 엑셀 추천DB(data/counsel-db.xlsx)를 앱이 읽는 목록 파일(data/counsel-db.json)로 바꾼다.
// 설계 근거: DESIGN.md §4.1 준비 단계. `npm run data`와 `npm run build` 직전(prebuild)에 실행된다.
import ExcelJS from "exceljs";
import { readFileSync, writeFileSync } from "node:fs";

const SRC = new URL("../data/counsel-db.xlsx", import.meta.url);
const OUT = new URL("../data/counsel-db.json", import.meta.url);
const DEFAULT_QUESTIONS = new URL("../data/default-questions.json", import.meta.url);
const BUTTON_KEYS = ["주제", "연체", "채무", "단계", "구분", "온도"];
const FILTER_KEYS = ["연체", "채무", "단계", "구분", "주제"];
const ANY = "전체";

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(SRC);

// 시트를 머리글 이름으로 읽을 수 있는 줄 목록으로 바꾼다. 오류를 알릴 때 쓰도록 엑셀 줄 번호(__row)도 붙인다.
function readSheet(name, requiredColumns) {
  const ws = wb.getWorksheet(name);
  if (!ws) throw new Error(`엑셀에 "${name}" 시트가 없습니다.`);
  const head = [];
  ws.getRow(1).eachCell((cell, col) => (head[col] = cell.text.trim()));
  const missing = requiredColumns.filter(column => !head.includes(column));
  if (missing.length) throw new Error(`엑셀 "${name}" 시트 1행에 ${missing.map(c => `"${c}"`).join(", ")} 머리글이 없습니다.`);
  const rows = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const obj = { __row: n };
    head.forEach((h, col) => h && (obj[h] = row.getCell(col).text.trim()));
    rows.push(obj);
  });
  return rows;
}

// 비어 있으면 빈 카드가 나오는 칸. 하면 안 되는 말·넘길 곳은 카드에 늘 보여 주므로 꼭 채운다(2026-10-29). 관련 규정·추천 문장은 비워도 된다("-"도 빈칸).
const REQUIRED_CELLS = ["키워드", "추천 FAQ", "답변 요약", "FAQ 원문", "하면 안 되는 말", "넘길 곳", "출처"];
// 추천 문장: 칸 안에서 줄바꿈으로 나눈 문장. 통화 중 그대로 말할 수 있게 한 문장은 30자 이내로 쓴다.
const MAX_PHRASE_LENGTH = 30;

// 확인 질문: 칸 안에서 줄바꿈으로 나눈 3줄. 한 줄은 "질문 | 선택지 / 선택지 (/ 선택지)".
// 개인정보를 묻는 질문·선택지는 넣지 않는다(PRD 7절). 이런 낱말이 있으면 변환을 멈춘다.
const QUESTION_COUNT = 3;
const PERSONAL_WORDS = /이름|성함|전화|연락처|휴대폰|핸드폰|고객번호|주민|생년월일|계좌번호|주소/;

/** 질문 하나를 검사한다. 문제가 있으면 무엇이 틀렸는지 글로 돌려준다. */
function questionProblem({ question, options }) {
  if (!question) return "질문이 비어 있습니다";
  if (options.length < 2 || options.length > 3) return `"${question}" 선택지는 2~3개여야 합니다(지금 ${options.length}개)`;
  if (options.some(o => !o)) return `"${question}" 빈 선택지가 있습니다`;
  if ([question, ...options].some(t => PERSONAL_WORDS.test(t))) return `"${question}" 개인정보를 묻는 낱말이 있습니다`;
  return null;
}

/** "질문 | 선택지 / 선택지" 줄들을 질문 목록으로 바꾼다. 칸이 비어 있으면 []. */
function parseQuestions(cell, where) {
  const lines = (cell ?? "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!lines.length) return [];
  if (lines.length !== QUESTION_COUNT) throw new Error(`${where}: 확인 질문은 ${QUESTION_COUNT}줄이어야 합니다(지금 ${lines.length}줄).`);
  return lines.map(line => {
    const [question, rest = ""] = line.split("|").map(s => s.trim());
    const q = { question, options: rest.split("/").map(s => s.trim()) };
    const problem = questionProblem(q);
    if (problem) throw new Error(`${where}: 확인 질문 ${problem}. "질문 | 선택지 / 선택지" 꼴로 적어 주세요.`);
    return q;
  });
}

const ITEM_COLUMNS = ["번호", "공개등급", ...FILTER_KEYS, ...REQUIRED_CELLS];

// 버튼선택지 시트: "주제 | 지원 자격 / 대상 채무 / …"
const buttons = {};
for (const row of readSheet("버튼선택지", ["버튼", "선택지"])) {
  if (BUTTON_KEYS.includes(row["버튼"])) buttons[row["버튼"]] = row["선택지"].split("/").map(s => s.trim()).filter(Boolean);
}
for (const key of BUTTON_KEYS) {
  if (!buttons[key]?.length) throw new Error(`버튼선택지 시트에 "${key}" 선택지가 없습니다.`);
}

const items = [];
const skipped = [];
const seenIds = new Map();
for (const row of readSheet("추천DB", ITEM_COLUMNS)) {
  if (!row["번호"]) continue;
  const where = `추천DB 시트 ${row.__row}행(번호 ${row["번호"]})`;
  // 번호는 "007"처럼 세 자리로 쓴다. 번호 순 정렬과 출처 표시가 이 형식을 전제로 한다.
  if (!/^\d{3}$/.test(row["번호"])) throw new Error(`${where}: 번호는 "007"처럼 숫자 세 자리로 적어 주세요.`);
  if (seenIds.has(row["번호"])) throw new Error(`${where}: 번호가 ${seenIds.get(row["번호"])}행과 겹칩니다.`);
  seenIds.set(row["번호"], row.__row);
  // 공개 자료만 넣는다 (PRD 7절)
  if (row["공개등급"] !== "공개") {
    skipped.push(row["번호"]);
    continue;
  }
  const empty = REQUIRED_CELLS.filter(column => !row[column] || row[column] === "-");
  if (empty.length) throw new Error(`${where}: ${empty.map(c => `"${c}"`).join(", ")} 칸이 비어 있습니다.`);
  const filters = {};
  for (const key of FILTER_KEYS) {
    const value = row[key] || ANY;
    if (value !== ANY && !buttons[key].includes(value)) {
      throw new Error(`${where}: "${key}" 값 "${value}"이(가) 버튼선택지에 없습니다.`);
    }
    filters[key] = value;
  }
  const dash = v => (v === "-" ? "" : v);
  const phrases = dash(row["추천 문장"] ?? "")
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
  const tooLong = phrases.filter(s => [...s].length > MAX_PHRASE_LENGTH);
  if (tooLong.length) {
    throw new Error(`${where}: 추천 문장은 한 줄에 ${MAX_PHRASE_LENGTH}자 이내로 써 주세요 → ${tooLong.map(s => `"${s}"(${[...s].length}자)`).join(", ")}`);
  }
  items.push({
    id: row["번호"],
    keywords: row["키워드"].split(",").map(s => s.trim()).filter(Boolean),
    filters,
    question: row["추천 FAQ"],
    summary: row["답변 요약"],
    original: row["FAQ 원문"],
    rule: dash(row["관련 규정"]),
    phrases,
    // 비어 있으면 [] — 화면이 주제별 기본 질문으로 대신 보여 준다.
    questions: parseQuestions(row["확인 질문"], where),
    doNotSay: row["하면 안 되는 말"],
    handOff: row["넘길 곳"],
    source: row["출처"],
  });
}

// 요강조문 시트: 관련 규정 칸의 조문 번호(예: "제19조")로 카드에 전문을 보여 주기 위해 넣는다. 공개 조문만 넣는다.
const articles = {};
for (const row of readSheet("요강조문", ["조문", "제목", "전문", "출처", "공개등급"])) {
  if (!row["조문"] || row["공개등급"] !== "공개") continue;
  const where = `요강조문 시트 ${row.__row}행(${row["조문"]})`;
  if (!/^제\d+조(의\d+)?$/.test(row["조문"])) throw new Error(`${where}: 조문은 "제19조", "제5조의2"처럼 적어 주세요.`);
  if (articles[row["조문"]]) throw new Error(`${where}: 같은 조문이 두 번 있습니다.`);
  const empty = ["제목", "전문", "출처"].filter(column => !row[column]);
  if (empty.length) throw new Error(`${where}: ${empty.map(c => `"${c}"`).join(", ")} 칸이 비어 있습니다.`);
  articles[row["조문"]] = { title: row["제목"], text: row["전문"], source: row["출처"] };
}

// 주제별 기본 질문(data/default-questions.json): 확인 질문이 빈 자료에 대신 보여 준다. 주제마다 3개.
const defaultQuestions = {};
const rawDefaults = JSON.parse(readFileSync(DEFAULT_QUESTIONS, "utf8"));
for (const topic of buttons["주제"]) {
  const list = rawDefaults[topic];
  const where = `default-questions.json "${topic}"`;
  if (!Array.isArray(list) || list.length !== QUESTION_COUNT) throw new Error(`${where}: 기본 질문이 ${QUESTION_COUNT}개 있어야 합니다.`);
  defaultQuestions[topic] = list.map(q => {
    const clean = { question: String(q.question ?? "").trim(), options: (q.options ?? []).map(o => String(o).trim()) };
    const problem = questionProblem(clean);
    if (problem) throw new Error(`${where}: ${problem}.`);
    return clean;
  });
}

writeFileSync(OUT, JSON.stringify({ items, buttons, articles, defaultQuestions }, null, 2) + "\n");
console.log(
  `counsel-db.json: ${items.length}줄, 요강 조문 ${Object.keys(articles).length}개 변환` +
    (skipped.length ? `, 비공개라 뺀 줄 ${skipped.join(", ")}` : ""),
);
