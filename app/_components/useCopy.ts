"use client";
// 클립보드 복사와 결과 기억. 질문문·추천 단어·이관 메모 복사가 같이 쓴다. PRD 5절 must 2 규칙 6
import { useState } from "react";

export type CopyStatus = "copied" | "failed" | null;

export function useCopy() {
  // 마지막으로 복사를 시도한 글과 결과. 다른 글을 보고 있으면 안내가 저절로 사라진다.
  const [last, setLast] = useState<{ text: string; ok: boolean } | null>(null);

  async function copy(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      setLast({ text, ok: true });
      return true;
    } catch {
      // 사내 PC 보안 정책 등으로 막힐 수 있다. 부르는 쪽에서 직접 복사를 안내한다.
      setLast({ text, ok: false });
      return false;
    }
  }

  function statusFor(text: string): CopyStatus {
    if (last?.text !== text) return null;
    return last.ok ? "copied" : "failed";
  }

  return { copy, statusFor };
}
