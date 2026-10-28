"use client";
// ③ 키워드 입력. 20자 제한과 숫자 6자리 이상 차단 경고를 입력하는 동안 바로 보여 준다. PRD 5절 must 1 규칙 4
import { checkText, INPUT_ERROR_MESSAGE, MAX_KEYWORD_LENGTH } from "@/lib/validate";

type Props = {
  value: string;
  onChange: (keyword: string) => void;
  onSubmit: () => void;
};

export default function KeywordInput({ value, onChange, onSubmit }: Props) {
  const error = checkText(value, MAX_KEYWORD_LENGTH);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <label htmlFor="keyword" className="sr-only">
          키워드
        </label>
        <input
          id="keyword"
          value={value}
          maxLength={MAX_KEYWORD_LENGTH}
          placeholder="예: 신청 방법, 취소, 원금감면"
          autoComplete="off"
          aria-invalid={error !== null}
          aria-describedby={error ? "keyword-error" : undefined}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => e.key === "Enter" && onSubmit()}
          className={
            "min-w-0 flex-1 rounded-lg border bg-transparent px-3 py-2 text-base outline-none focus:ring-2 " +
            (error ? "border-red-500 focus:ring-red-300" : "border-zinc-300 focus:ring-blue-300 dark:border-zinc-700")
          }
        />
        <span className="w-12 shrink-0 text-right text-sm tabular-nums text-zinc-500">
          {value.length}/{MAX_KEYWORD_LENGTH}
        </span>
        <button
          type="button"
          onClick={onSubmit}
          className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
        >
          추천 받기
        </button>
      </div>
      {error && (
        <p id="keyword-error" role="alert" className="text-sm font-medium text-red-600">
          ⚠ {INPUT_ERROR_MESSAGE[error]}
        </p>
      )}
    </div>
  );
}
