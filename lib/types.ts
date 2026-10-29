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
  /** 추천 문장: 상담 중 그대로 말할 30자 이내 문장들 */
  phrases: string[];
  /** 확인 질문 3개(엑셀 "확인 질문" 칸). 비어 있으면 주제별 기본 질문을 쓴다. */
  questions: CheckQuestion[];
  doNotSay: string;
  handOff: string;
  source: string;
};

/** 민원인에게 물어볼 확인 질문 하나와 답 선택지(2~3개) */
export type CheckQuestion = {
  question: string;
  options: string[];
};

/** 관리업무요강 조문 하나 (엑셀 "요강조문" 시트 한 줄) */
export type RuleArticle = {
  title: string;
  /** 조문 전문(원문 그대로) */
  text: string;
  source: string;
};

/** 변환된 데이터 파일(data/counsel-db.json) 전체 */
export type CounselData = {
  items: CounselItem[];
  buttons: ButtonOptions;
  /** 조문 번호("제19조", "제5조의2") → 조문 */
  articles: Record<string, RuleArticle>;
  /** 주제 → 기본 확인 질문 3개(data/default-questions.json). 확인 질문이 빈 자료에 대신 쓴다. */
  defaultQuestions: Record<string, CheckQuestion[]>;
};

/** 답변 길이: 빠른 답변 / 보통 답변 */
export type AnswerMode = "fast" | "normal";

/** 화면이 기억하는 현재 선택 */
export type Selection = {
  buttons: Partial<Record<ButtonKey, string>>;
  keyword: string;
  mode: AnswerMode;
};
