// 설계 근거: DESIGN.md §4.3 데이터 모양

/** 상황 고르기 버튼 6개의 이름 (엑셀 "버튼선택지" 시트와 같음) */
export const BUTTON_KEYS = ["주제", "연체", "채무", "단계", "구분", "온도"] as const;
export type ButtonKey = (typeof BUTTON_KEYS)[number];

/** 추천 자료를 걸러낼 때 쓰는 버튼 5개 (온도는 거르지 않음) */
export const FILTER_KEYS = ["연체", "채무", "단계", "구분", "주제"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

/** 어떤 선택에도 맞는다는 뜻의 값 */
export const ANY = "전체";

/** 버튼마다 고를 수 있는 값 목록 */
export type ButtonOptions = Record<ButtonKey, string[]>;

/** 추천 자료 한 줄 (엑셀 "추천DB" 시트 한 줄) */
export type CounselItem = {
  id: string;
  keywords: string[];
  filters: Record<FilterKey, string>;
  question: string;
  summary: string;
  original: string;
  rule: string;
  words: string;
  doNotSay: string;
  handOff: string;
  source: string;
};

/** 변환된 데이터 파일(data/counsel-db.json) 전체 */
export type CounselData = {
  items: CounselItem[];
  buttons: ButtonOptions;
};

/** 답변 길이: 빠른 답변 / 보통 답변 */
export type AnswerMode = "fast" | "normal";

/** 화면이 기억하는 현재 선택 */
export type Selection = {
  buttons: Partial<Record<ButtonKey, string>>;
  keyword: string;
  mode: AnswerMode;
};
