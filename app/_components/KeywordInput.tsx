"use client";
// ③ 키워드 입력. 20자 제한과 숫자 6자리 이상 차단 경고를 입력하는 동안 바로 보여 준다. PRD 5절 must 1 규칙 4
import type { RefObject } from "react";
import { checkText, INPUT_ERROR_MESSAGE, MAX_KEYWORD_LENGTH } from "@/lib/validate";

type Props = {
  value: string;
  onChange: (keyword: string) => void;
  onSubmit: () => void;
  /** [처음부터] 뒤에 다시 이 칸으로 커서를 옮기기 위한 참조 */
  inputRef?: RefObject<HTMLInputElement | null>;
};

export default function KeywordInput({ value, onChange, onSubmit, inputRef }: Props) {
  const error = checkText(value, MAX_KEYWORD_LENGTH);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="keyword" className="sr-only">
          키워드
        </label>
        <div className="relative min-w-0 flex-1">
          <input
            id="keyword"
            ref={inputRef}
            value={value}
            maxLength={MAX_KEYWORD_LENGTH}
            placeholder="예: 신청 방법, 취소, 원금감면"
            autoComplete="off"
            aria-invalid={error !== null}
            aria-describedby={error ? "keyword-error" : "keyword-help"}
            onChange={e => onChange(e.target.value)}
            // 한글을 조합하는 중에 누른 Enter는 건너뛴다(두 번 실행되지 않게).
            onKeyDown={e => e.key === "Enter" && !e.nativeEvent.isComposing && onSubmit()}
            className={
              "min-h-12 w-full rounded-lg border bg-white py-2 pl-3 pr-14 text-lg outline-none focus:ring-2 dark:bg-zinc-950 " +
              (error ? "border-red-500 focus:ring-red-300" : "border-zinc-300 focus:ring-blue-300 dark:border-zinc-700")
            }
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm tabular-nums text-zinc-500">
            {value.length}/{MAX_KEYWORD_LENGTH}
          </span>
        </div>
        <button
          type="button"
          onClick={onSubmit}
          className="min-h-12 shrink-0 rounded-lg bg-blue-600 px-6 text-lg font-bold text-white shadow-sm hover:bg-blue-700"
        >
          추천 받기
        </button>
      </div>
      {error ? (
        <p id="keyword-error" role="alert" className="text-sm font-medium text-red-600">
          ⚠ {INPUT_ERROR_MESSAGE[error]}
        </p>
      ) : (
        <p id="keyword-help" className="text-sm text-zinc-500">
          비워 두면 고른 상황만으로 찾아요. 이름·전화번호는 넣지 마세요.
        </p>
      )}
    </div>
  );
}
