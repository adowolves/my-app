// 엑셀 추천DB(data/counsel-db.xlsx)를 앱이 읽는 목록 파일(data/counsel-db.json)로 바꾼다.
// 설계 근거: DESIGN.md §4.1 준비 단계. `npm run data`와 `npm run build` 직전(prebuild)에 실행된다.
import ExcelJS from "exceljs";
import { writeFileSync } from "node:fs";

const SRC = new URL("../data/counsel-db.xlsx", import.meta.url);
const OUT = new URL("../data/counsel-db.json", import.meta.url);
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

// 비어 있으면 빈 카드가 나오는 칸. 관련 규정·추천 단어·하면 안 되는 말·넘길 곳은 비워도 된다("-"도 빈칸).
const REQUIRED_CELLS = ["키워드", "추천 FAQ", "답변 요약", "FAQ 원문", "출처"];
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
  items.push({
    id: row["번호"],
    keywords: row["키워드"].split(",").map(s => s.trim()).filter(Boolean),
    filters,
    question: row["추천 FAQ"],
    summary: row["답변 요약"],
    original: row["FAQ 원문"],
    rule: dash(row["관련 규정"]),
    words: dash(row["추천 단어"]),
    doNotSay: dash(row["하면 안 되는 말"]),
    handOff: dash(row["넘길 곳"]),
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

writeFileSync(OUT, JSON.stringify({ items, buttons, articles }, null, 2) + "\n");
console.log(
  `counsel-db.json: ${items.length}줄, 요강 조문 ${Object.keys(articles).length}개 변환` +
    (skipped.length ? `, 비공개라 뺀 줄 ${skipped.join(", ")}` : ""),
);
