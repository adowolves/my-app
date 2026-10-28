"use client";
// ② 상황 고르기: 버튼 6줄. 줄마다 하나만 고르고, 다시 누르면 해제한다. PRD 5절 must 1 규칙 5
import { BUTTON_KEYS, type ButtonKey, type ButtonOptions, type Selection } from "@/lib/types";

type Props = {
  options: ButtonOptions;
  value: Selection["buttons"];
  onChange: (key: ButtonKey, choice: string | undefined) => void;
};

export default function ButtonGroups({ options, value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-3">
      {BUTTON_KEYS.map(key => (
        <div key={key} role="group" aria-label={key} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
          <span className="w-12 shrink-0 pt-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-400">
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
                    "rounded-full border px-3 py-1.5 text-sm transition-colors " +
                    (selected
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800")
                  }
                >
                  {choice}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
