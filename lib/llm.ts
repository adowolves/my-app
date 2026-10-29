// Claude 호출은 이 파일 한 곳에서만 한다. 서버 쪽 코드에서만 불러 쓰고, API 키는 브라우저로 보내지 않는다.
// 주소·모델·키는 모두 환경변수로 받는다(코드에 적지 않음):
//   ANTHROPIC_API_KEY — API 키
//   ANTHROPIC_BASE_URL — API 주소(비워 두면 Anthropic 기본 주소. SDK가 직접 읽는다)
//   CLAUDE_MODEL_FAST / CLAUDE_MODEL_NORMAL — 빠른 답변 / 보통 답변 모델 이름
import Anthropic from "@anthropic-ai/sdk";
import type { AnswerMode } from "./types";

/** 20초가 지나면 실패로 보고 사내 LLM 복사로 안내한다. 재시도하지 않는다. */
const TIMEOUT_MS = 20_000;

/** 짧은 상담 답변이라 빠른 답변은 낮게, 보통 답변은 중간으로 생각 깊이를 둔다. */
const EFFORT: Record<AnswerMode, "low" | "medium"> = { fast: "low", normal: "medium" };

export type ClaudeRequest = {
  mode: AnswerMode;
  system: string;
  user: string;
  maxTokens: number;
  /** 주면 이 JSON 형식으로만 답하게 한다(구조화된 출력). */
  schema?: Record<string, unknown>;
};

export type ClaudeResult = { ok: true; text: string } | { ok: false; error: string; status: number };

const fail = (error: string, status: number): ClaudeResult => ({ ok: false, error, status });

/** 환경변수에 모델과 키가 있는지. 없으면 화면에서 Claude 기능을 쓰지 못한다고 안내한다. */
export function claudeReady(mode: AnswerMode): boolean {
  return Boolean(modelFor(mode) && process.env.ANTHROPIC_API_KEY);
}

function modelFor(mode: AnswerMode): string | undefined {
  return mode === "fast" ? process.env.CLAUDE_MODEL_FAST : process.env.CLAUDE_MODEL_NORMAL;
}

/** Claude에게 한 번 묻고 글을 돌려준다. 실패하면 이유와 HTTP 상태를 돌려준다(키·질문 내용은 기록하지 않음). */
export async function askClaude({ mode, system, user, maxTokens, schema }: ClaudeRequest): Promise<ClaudeResult> {
  const model = modelFor(mode);
  if (!model || !process.env.ANTHROPIC_API_KEY) return fail("Claude 설정이 없어요.", 500);

  const client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 0 });
  try {
    const response = await client.beta.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      output_config: { effort: EFFORT[mode], ...(schema ? { format: { type: "json_schema" as const, schema } } : {}) },
      messages: [{ role: "user", content: user }],
      // 보통 답변 모델이 안전 분류기로 거절하면 Anthropic이 권장하는 모델로 서버에서 다시 시도한다.
      ...(mode === "normal" ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    if (response.stop_reason === "refusal") return fail("Claude가 이 질문에 답하지 않았어요.", 502);
    if (response.stop_reason === "max_tokens") return fail("Claude 답변이 너무 길어 끊겼어요.", 502);
    const text = response.content
      .flatMap(block => (block.type === "text" ? [block.text] : []))
      .join("\n")
      .trim();
    if (!text) return fail("Claude 답변이 비어 있어요.", 502);
    return { ok: true, text };
  } catch (error) {
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
