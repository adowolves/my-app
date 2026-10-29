// "관련 규정" 칸에서 관리업무요강 조문 번호를 찾아, 카드에 조문 전문을 보여 줄 수 있게 한다.
// 다른 lib 파일의 값을 불러오지 않는다(시나리오 검사 스크립트가 이 파일을 바로 불러 쓰기 때문).
import type { RuleArticle } from "./types";

export type RuleRef = {
  /** 조문 번호. 예: "제19조", "제5조의2" */
  no: string;
  /** 특정 호만 가리키면 그 번호들(예: 제2조 제6·7호 → [6, 7]). 비어 있으면 조문 전체 */
  items: number[];
};

const LAW_NAME = "관리업무요강";

/**
 * 관련 규정 글에서 요강 조문을 찾는다.
 * "관리업무요강 제2조 제6·7호: …" / "관리업무요강 제23조, 제25조, 제30조" 꼴을 읽고, 요지(":" 뒤)에 나온 조문은 세지 않는다.
 * 같은 조문이 여러 번 나오면 하나로 합친다(한 번이라도 조문 전체를 가리키면 전체).
 */
export function ruleRefs(rule: string): RuleRef[] {
  const found = new Map<string, Set<number> | "all">();
  for (const part of rule.split(" / ")) {
    if (!part.includes(LAW_NAME)) continue;
    const head = part.split(":")[0];
    for (const m of head.matchAll(/제(\d+)조(의\d+)?(?:\s*제([\d·]+)호)?/g)) {
      const no = `제${m[1]}조${m[2] ?? ""}`;
      const before = found.get(no);
      if (!m[3]) {
        found.set(no, "all");
      } else if (before !== "all") {
        const items = before ?? new Set<number>();
        for (const n of m[3].split("·")) items.add(Number(n));
        found.set(no, items);
      }
    }
  }
  return [...found].map(([no, items]) => ({ no, items: items === "all" ? [] : [...items].sort((a, b) => a - b) }));
}

/** 조문 전문. 특정 호만 가리키면 첫 문단(머리말)과 그 호만 남긴다. */
export function articleText(article: RuleArticle, items: number[]): string {
  if (!items.length) return article.text;
  const lines = article.text.split("\n");
  return [lines[0], ...lines.slice(1).filter(line => items.some(n => line.startsWith(`${n}. `)))].join("\n");
}
