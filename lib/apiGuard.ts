// Claude를 부르는 서버 API(/api/answer, /api/card)가 함께 쓰는 요청 검사와 횟수 제한.
// 자유 글을 받지 않는다. 버튼 선택·키워드·답변 길이만 받아 다시 검사한다
// (배포 주소가 공개돼도 이 경로로 엉뚱한 질문을 보낼 수 없게 하기 위해).
import { getCounselData } from "./data";
import { BUTTON_KEYS, type Selection } from "./types";
import { MAX_KEYWORD_LENGTH, validateSelection } from "./validate";

/**
 * 요청 횟수 제한: 같은 접속 주소에서 1분에 20번, 서버 전체로 1분에 100번까지.
 * [추천 받기]마다 Claude 상담카드를 한 번 만들므로 직원 한 명이 넉넉히 쓰되, 배포 주소가 알려져도 API 사용료가 크게 나가지 않게 막는다.
 * 서버 메모리에만 세므로 서버가 여러 대로 늘면 대마다 따로 센다. (확실한 상한은 Anthropic 콘솔의 월 사용 한도로 건다.)
 */
const RATE_LIMIT = 20;
const GLOBAL_RATE_LIMIT = 100;
const RATE_WINDOW_MS = 60_000;
/** 기록해 두는 접속 주소 수 상한. 넘으면 새 주소는 받지 않는다(기록이 끝없이 커지지 않게). */
const MAX_TRACKED_CLIENTS = 5_000;
const recentRequests = new Map<string, number[]>();
let globalRequests: number[] = [];
let lastCleanup = 0;

/** IPv6 주소의 앞 4묶음(/64). "2001:db8::1"처럼 줄여 쓴 "::"를 8묶음으로 펼친 뒤 자른다. */
function ipv6Prefix64(ip: string): string {
  const [head, tail] = ip.toLowerCase().split("%")[0].split("::");
  const left = head ? head.split(":") : [];
  const right = tail === undefined ? [] : tail ? tail.split(":") : [];
  const groups = tail === undefined ? left : [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return groups.slice(0, 4).map(group => group.replace(/^0+(?=.)/, "")).join(":");
}

/**
 * 횟수를 셀 접속 주소. Vercel이 직접 넣어 주는 x-real-ip를 먼저 쓴다.
 * IPv6는 한 사람이 주소를 아주 많이 바꿔 쓸 수 있어 앞 4묶음(/64)으로 묶어 센다.
 */
function clientKey(request: Request): string {
  const ip = (request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "").trim();
  if (!ip) return "unknown";
  return ip.includes(":") ? ipv6Prefix64(ip) : ip;
}

/** 접속 주소별 제한(1분 20번). 엉터리 요청도 세어 한 곳에서 마구 보내는 것을 막는다. */
export function isClientLimited(request: Request): boolean {
  const now = Date.now();
  // 오래된 기록 정리는 1분에 한 번만 한다(요청마다 전체를 훑지 않게).
  if (now - lastCleanup >= RATE_WINDOW_MS) {
    for (const [key, times] of recentRequests) if (now - times[times.length - 1] >= RATE_WINDOW_MS) recentRequests.delete(key);
    lastCleanup = now;
  }
  const key = clientKey(request);
  const recent = (recentRequests.get(key) ?? []).filter(time => now - time < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) return true;
  if (!recentRequests.has(key) && recentRequests.size >= MAX_TRACKED_CLIENTS) return true;
  recent.push(now);
  recentRequests.set(key, recent);
  return false;
}

/**
 * 서버 전체 제한(1분 100번). 입력 검사를 통과해 실제로 Claude를 부를 요청만 센다.
 * (엉터리 요청으로 칸을 채워 다른 직원의 답변을 막지 못하게)
 */
export function isGlobalLimited(): boolean {
  const now = Date.now();
  globalRequests = globalRequests.filter(time => now - time < RATE_WINDOW_MS);
  if (globalRequests.length >= GLOBAL_RATE_LIMIT) return true;
  globalRequests.push(now);
  return false;
}

/** 키워드에 줄바꿈·제어문자가 있으면 질문문 형식을 꾸며 지시를 끼워 넣을 수 있으므로 거부한다(화면 입력창은 한 줄이라 정상 사용엔 없음). */
function hasControlChars(text: string): boolean {
  return /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(text);
}

/** 다른 사이트의 화면에서 이 API를 부르지 못하게, 보낸 곳(Origin)이 이 앱 주소와 같은지 본다. */
export function isOtherSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

/** 요청 본문을 Selection으로 바꾼다. 버튼 값은 엑셀 버튼선택지에 있는 값만 받고, 화면과 같은 입력 검사를 다시 한다. */
export function parseSelection(body: unknown): Selection | null {
  if (typeof body !== "object" || body === null) return null;
  const { buttons, keyword, mode } = body as Record<string, unknown>;
  if (typeof keyword !== "string" || keyword.length > MAX_KEYWORD_LENGTH || hasControlChars(keyword)) return null;
  if (mode !== "fast" && mode !== "normal") return null;
  if (typeof buttons !== "object" || buttons === null) return null;
  const options = getCounselData().buttons;
  const clean: Selection["buttons"] = {};
  for (const [key, value] of Object.entries(buttons)) {
    const buttonKey = BUTTON_KEYS.find(k => k === key);
    if (!buttonKey || typeof value !== "string" || !options[buttonKey].includes(value)) return null;
    clean[buttonKey] = value;
  }
  const selection: Selection = { buttons: clean, keyword, mode };
  return validateSelection(selection) ? null : selection;
}
