"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Rocket } from "lucide-react";

import { Button } from "@/components/ui/button";

export function NewBatchButton({
  templates,
}: {
  templates: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Jeśli tylko 1 template — przeskocz wybór i od razu otwórz wizard
  if (templates.length === 1) {
    return (
      <Button
        size="sm"
        className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
        onClick={() =>
          router.push(`/grafiki/batch/new?template=${templates[0].id}`)
        }
      >
        <Rocket className="size-4" />
        Nowa kampania
      </Button>
    );
  }

  return (
    <div className="relative">
      <Button
        size="sm"
        className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
        onClick={() => setOpen((v) => !v)}
      >
        <Rocket className="size-4" />
        Nowa kampania
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white ring-1 ring-slate-200 rounded-md shadow-lg z-10 min-w-[240px] py-1">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 px-3 py-1.5">
            Wybierz template
          </div>
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setOpen(false);
                router.push(`/grafiki/batch/new?template=${t.id}`);
              }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-violet-50 hover:text-violet-700"
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
