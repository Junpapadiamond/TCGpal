import { useLang } from "./i18n";

export type MarketMode = "single" | "cross";

export function MarketModeSwitch({ mode, onChange }: { mode: MarketMode; onChange: (mode: MarketMode) => void }) {
  const { lang } = useLang();
  const zh = lang === "zh";
  return <div className="mx-auto max-w-[860px] border-b border-[#d6ded5]">
    <div role="group" aria-label={zh ? "比价视图" : "Comparison view"} className="flex items-center gap-6">
      {(["single", "cross"] as const).map((value) => {
        const label = value === "single" ? zh ? "单一平台" : "Single Market" : zh ? "跨平台" : "Cross Market";
        return <button key={value} type="button" aria-label={label} aria-pressed={mode === value}
          onClick={() => onChange(value)}
          className={`-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-1 text-sm transition-colors focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6f73] ${mode === value ? "border-[#2f6f73] font-bold text-[#24585c]" : "border-transparent font-medium text-[#64736c] hover:border-[#b7c6bd] hover:text-[#24312f]"}`}>
          {label}
        </button>;
      })}
    </div>
  </div>;
}
