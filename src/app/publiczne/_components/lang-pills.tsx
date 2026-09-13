import Link from "next/link";
import { Globe } from "lucide-react";

import type { Lang } from "@/lib/publiczne-content";

type Props = {
  langs: readonly Lang[];
  currentLang: Lang;
  labels: Record<Lang, string>;
  basePath: string;
};

/** Kompaktowy przełącznik języka — do zwykłych podstron (nie home). */
export function LangPills({ langs, currentLang, labels, basePath }: Props) {
  if (langs.length <= 1) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Globe className="size-4 text-slate-400" />
      <div className="flex items-center gap-1 flex-wrap">
        {langs.map((l) => {
          const isActive = l === currentLang;
          return (
            <Link
              key={l}
              href={`${basePath}?lang=${l}`}
              scroll={false}
              title={labels[l]}
              className={
                isActive
                  ? "px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-900 text-white cursor-default"
                  : "px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              }
            >
              {l}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
