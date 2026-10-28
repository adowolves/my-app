// nice 22번: Claude로 바로 답변. 서버 쪽 코드에서만 Claude를 부르고, API 키는 브라우저로 보내지 않는다. PRD 5절 nice 규칙 1~4
// 자유 글을 받지 않는다. 버튼 선택·키워드·답변 길이만 받아 다시 검사하고, 질문문은 서버가 엑셀 데이터로 다시 만든다
// (배포 주소가 공개돼도 이 경로로 엉뚱한 질문을 보낼 수 없게 하기 위해).
import Anthropic from "@anthropic-ai/sdk";
import { buildQuestion } from "@/lib/buildQuestion";
import { getCounselData } from "@/lib/data";
import { recommend } from "@/lib/recommend";
import { BUTTON_KEYS, type AnswerMode, type Selection } from "@/lib/types";
import { MAX_KEYWORD_LENGTH, validateSelection } from "@/lib/validate";

/** 20초가 지나면 실패로 보고 사내 LLM 복사로 안내한다(규칙 4). 재시도하지 않는다. */
const TIMEOUT_MS = 20_000;

const SYSTEM_PROMPT =
  "당신은 새출발기금 상담 직원을 돕는 도우미입니다. 질문문에 있는 참고 자료(새출발기금 공식 FAQ)를 근거로 한국어로 답하세요. " +
  "자료 밖의 내용은 '추측'이라고 표시하고, 민원인의 개인정보는 묻거나 지어내지 마세요. " +
  "화면에 글자 그대로 보여 주므로 **, # 같은 마크다운 기호 없이 일반 문장으로 쓰세요.";

/** 짧은 상담 답변이라 빠른 답변은 낮게, 보통 답변은 중간으로 생각 깊이를 둔다. */
const EFFORT: Record<AnswerMode, "low" | "medium"> = { fast: "low", normal: "medium" };

export type AnswerResponse = { answer: string; model: string } | { error: string };

function fail(error: string, status: number) {
  return Response.json({ error } satisfies AnswerResponse, { status });
}

/** 요청 본문을 Selection으로 바꾼다. 버튼 값은 엑셀 버튼선택지에 있는 값만 받는다. */
function parseSelection(body: unknown): Selection | null {
  if (typeof body !== "object" || body === null) return null;
  const { buttons, keyword, mode } = body as Record<string, unknown>;
  if (typeof keyword !== "string" || keyword.length > MAX_KEYWORD_LENGTH) return null;
  if (mode !== "fast" && mode !== "normal") return null;
  if (typeof buttons !== "object" || buttons === null) return null;
  const options = getCounselData().buttons;
  const clean: Selection["buttons"] = {};
  for (const [key, value] of Object.entries(buttons)) {
    const buttonKey = BUTTON_KEYS.find(k => k === key);
    if (!buttonKey || typeof value !== "string" || !options[buttonKey].includes(value)) return null;
    clean[buttonKey] = value;
  }
  return { buttons: clean, keyword, mode };
}

export async function POST(request: Request) {
  const selection = parseSelection(await request.json().catch(() => null));
  if (!selection || validateSelection(selection)) return fail("입력이 올바르지 않아요.", 400);

  // 모델 이름은 코드에 적지 않고 환경변수로 정한다(규칙 2).
  const model = selection.mode === "fast" ? process.env.CLAUDE_MODEL_FAST : process.env.CLAUDE_MODEL_NORMAL;
  if (!model || !process.env.ANTHROPIC_API_KEY) return fail("Claude 설정이 없어요.", 500);

  // Claude에 보내는 질문문은 사내 LLM 질문문과 같다(규칙 1).
  const { items } = getCounselData();
  const question = buildQuestion(selection, recommend(items, selection));

  const client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 0 });
  try {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      output_config: { effort: EFFORT[selection.mode] },
      messages: [{ role: "user", content: question }],
      // 보통 답변 모델이 안전 분류기로 거절하면 Anthropic이 권장하는 모델로 서버에서 다시 시도한다.
      ...(selection.mode === "normal" ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    if (response.stop_reason === "refusal") return fail("Claude가 이 질문에 답하지 않았어요.", 502);
    const answer = response.content
      .flatMap(block => (block.type === "text" ? [block.text] : []))
      .join("\n")
      .trim();
    if (!answer) return fail("Claude 답변이 비어 있어요.", 502);
    return Response.json({ answer, model: response.model } satisfies AnswerResponse);
  } catch (error) {
    // 키나 질문 내용은 기록하지 않고, 어떤 종류의 실패인지만 남긴다.
    if (error instanceof Anthropic.APIConnectionTimeoutError) return fail("20초 안에 답이 오지 않았어요.", 504);
    if (error instanceof Anthropic.RateLimitError) return fail("요청이 많아 잠시 뒤에 다시 시도해야 해요.", 429);
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("Claude 인증 실패: ANTHROPIC_API_KEY를 확인하세요.");
      return fail("Claude 설정이 올바르지 않아요.", 500);
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`Claude API 오류 ${error.status}`);
      return fail("Claude 호출에 실패했어요.", 502);
    }
    console.error("Claude 연결 실패");
    return fail("Claude 호출에 실패했어요.", 502);
  }
}
