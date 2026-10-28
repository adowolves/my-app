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

// 시트를 머리글 이름으로 읽을 수 있는 줄 목록으로 바꾼다.
function readSheet(name) {
  const ws = wb.getWorksheet(name);
  if (!ws) throw new Error(`엑셀에 "${name}" 시트가 없습니다.`);
  const head = [];
  ws.getRow(1).eachCell((cell, col) => (head[col] = cell.text.trim()));
  const rows = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const obj = {};
    head.forEach((h, col) => h && (obj[h] = row.getCell(col).text.trim()));
    rows.push(obj);
  });
  return rows;
}

// 버튼선택지 시트: "주제 | 지원 자격 / 대상 채무 / …"
const buttons = {};
for (const row of readSheet("버튼선택지")) {
  if (BUTTON_KEYS.includes(row["버튼"])) buttons[row["버튼"]] = row["선택지"].split("/").map(s => s.trim()).filter(Boolean);
}
for (const key of BUTTON_KEYS) {
  if (!buttons[key]?.length) throw new Error(`버튼선택지 시트에 "${key}" 선택지가 없습니다.`);
}

const items = [];
const skipped = [];
for (const row of readSheet("추천DB")) {
  if (!row["번호"]) continue;
  // 공개 자료만 넣는다 (PRD 7절)
  if (row["공개등급"] !== "공개") {
    skipped.push(row["번호"]);
    continue;
  }
  const filters = {};
  for (const key of FILTER_KEYS) {
    const value = row[key] || ANY;
    if (value !== ANY && !buttons[key].includes(value)) {
      throw new Error(`추천DB ${row["번호"]}번의 "${key}" 값 "${value}"이(가) 버튼선택지에 없습니다.`);
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

writeFileSync(OUT, JSON.stringify({ items, buttons }, null, 2) + "\n");
console.log(`counsel-db.json: ${items.length}줄 변환` + (skipped.length ? `, 비공개라 뺀 줄 ${skipped.join(", ")}` : ""));
