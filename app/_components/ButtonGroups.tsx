"use client";
// ② 상황 고르기: 버튼 6줄. 줄마다 하나만 고르고, 다시 누르면 해제한다. PRD 5절 must 1 규칙 5
// 통화 중 잘못 누르지 않게 버튼을 크게 두고, 고른 버튼은 색과 ✓로 확실히 구분한다.
import { BUTTON_KEYS, type ButtonKey, type ButtonOptions, type Selection } from "@/lib/types";

type Props = {
  options: ButtonOptions;
  value: Selection["buttons"];
  onChange: (key: ButtonKey, choice: string | undefined) => void;
  /** 주제를 안 고르고 [추천 받기]를 눌렀을 때 주제 줄을 강조한다. */
  missingTopic?: boolean;
};

export default function ButtonGroups({ options, value, onChange, missingTopic = false }: Props) {
  return (
    <div className="flex flex-col gap-3">
      {BUTTON_KEYS.map(key => {
        const highlight = key === "주제" && missingTopic;
        return (
          <div
            key={key}
            role="group"
            aria-label={key}
            className={
              "flex flex-col gap-1.5 rounded-lg sm:flex-row sm:items-start sm:gap-3 " +
              (highlight ? "bg-red-50 p-2 ring-2 ring-red-500 dark:bg-red-950" : "")
            }
          >
            <span className="w-12 shrink-0 pt-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              {key}
              {key === "주제" && <span className="text-red-600" aria-label="필수"> *</span>}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {options[key].map(choice => {
                const selected = value[key] === choice;
                return (
                  <button
                    key={choice}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onChange(key, selected ? undefined : choice)}
                    className={
                      "min-h-10 rounded-full border px-3.5 py-1.5 text-sm transition-colors " +
                      (selected
                        ? "border-blue-600 bg-blue-600 font-semibold text-white shadow-sm"
                        : "border-zinc-300 bg-white hover:border-blue-400 hover:bg-blue-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800")
                    }
                  >
                    {selected && <span aria-hidden>✓ </span>}
                    {choice}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
