"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { Globe, Loader2 } from "lucide-react";

type Props = {
  manualId: string;
  available: string[];
  current: string;
  labels: Record<string, string>;
};

export function LangSwitcher({ available, current, labels }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  if (available.length <= 1) return null;

  function switchTo(lang: string) {
    const sp = new URLSearchParams(params?.toString() ?? "");
    sp.set("lang", lang);
    startTransition(() => {
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      {pending ? (
        <Loader2 className="size-4 text-slate-400 animate-spin" />
      ) : (
        <Globe className="size-4 text-slate-500" />
      )}
      <div className="flex items-center gap-1">
        {available.map((lang) => {
          const isActive = lang === current;
          return (
            <button
              key={lang}
              type="button"
              onClick={() => !isActive && switchTo(lang)}
              disabled={isActive || pending}
              className={
                isActive
                  ? "px-2 py-1 rounded text-[11px] font-bold bg-slate-900 text-white cursor-default"
                  : "px-2 py-1 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              }
              title={labels[lang] ?? lang}
            >
              {lang}
            </button>
          );
        })}
      </div>
    </div>
  );
}
