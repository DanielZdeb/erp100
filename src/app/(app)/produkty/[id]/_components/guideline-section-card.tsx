"use client";

import { useState } from "react";
import Image from "next/image";
import {
  BookOpen,
  Component,
  ImageIcon,
  Package,
  PackageOpen,
  Pencil,
  Puzzle,
  ScrollText,
  Shield,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { EditableTextarea } from "./editable-textarea";
import {
  GuidelinePoints,
  type GuidelineKindT,
  type GuidelinePoint,
  type GuidelineImage,
} from "./guideline-section";

type IntroField = "productionGuidelines" | "importGuidelines" | "userManual";

type Color = "amber" | "blue" | "emerald" | "violet" | "sky" | "rose";

const COLOR_CLASSES: Record<
  Color,
  { border: string; badgeBg: string; badgeText: string }
> = {
  amber: {
    border: "border-l-amber-400",
    badgeBg: "bg-amber-100",
    badgeText: "text-amber-700",
  },
  blue: {
    border: "border-l-blue-400",
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-700",
  },
  emerald: {
    border: "border-l-emerald-400",
    badgeBg: "bg-emerald-100",
    badgeText: "text-emerald-700",
  },
  violet: {
    border: "border-l-violet-400",
    badgeBg: "bg-violet-100",
    badgeText: "text-violet-700",
  },
  sky: {
    border: "border-l-sky-400",
    badgeBg: "bg-sky-100",
    badgeText: "text-sky-700",
  },
  rose: {
    border: "border-l-rose-400",
    badgeBg: "bg-rose-100",
    badgeText: "text-rose-700",
  },
};

const DEFAULT_ICONS: Record<GuidelineKindT, LucideIcon> = {
  PRODUCTION: ScrollText,
  IMPORT: PackageOpen,
  USER_MANUAL: BookOpen,
};

/** Named icons — przekazywane stringiem z Server Component (klasy/funkcje
 *  nie mogą przekraczać RSC boundary). Dodawaj tutaj kolejne według potrzeb. */
export type GuidelineIconName =
  | "ScrollText"
  | "Component"
  | "ShieldCheck"
  | "Shield"
  | "BookOpen"
  | "Package"
  | "PackageOpen"
  | "Puzzle";

const NAMED_ICONS: Record<GuidelineIconName, LucideIcon> = {
  ScrollText,
  Component,
  ShieldCheck,
  Shield,
  BookOpen,
  Package,
  PackageOpen,
  Puzzle,
};

export function GuidelineSectionCard({
  productId,
  kind,
  title,
  description,
  color,
  introField,
  introValue,
  points,
  sectionImages,
  icon,
}: {
  productId: string;
  kind: GuidelineKindT;
  title: string;
  description: string;
  color: Color;
  introField: IntroField;
  introValue: string | null;
  points: GuidelinePoint[];
  sectionImages: GuidelineImage[];
  /** Override ikony — string-key z mapy `NAMED_ICONS` (RSC-safe).
   *  Domyślnie kind-mapowana (ScrollText/PackageOpen/BookOpen). */
  icon?: GuidelineIconName;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const Icon = icon ? NAMED_ICONS[icon] : DEFAULT_ICONS[kind];
  const cls = COLOR_CLASSES[color];

  const hasContent =
    !!introValue?.trim() || points.length > 0 || sectionImages.length > 0;

  return (
    <Card className={`overflow-hidden border-l-4 ${cls.border}`}>
      <CardHeader className="py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-sm flex items-center gap-2">
              <div
                className={`size-7 rounded-md ${cls.badgeBg} ${cls.badgeText} flex items-center justify-center`}
              >
                <Icon className="size-3.5" />
              </div>
              {title}
              {points.length > 0 && (
                <span className="text-[10px] tabular-nums text-muted-foreground font-normal">
                  ({points.length} pkt)
                </span>
              )}
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1">
              {description}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditOpen(true)}
            className="shrink-0 gap-1.5"
          >
            <Pencil className="size-3.5" />
            Edytuj
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {hasContent ? (
          <SectionDisplay
            intro={introValue}
            points={points}
            sectionImages={sectionImages}
          />
        ) : (
          <p className="text-xs text-muted-foreground italic py-2">
            Brak treści. Kliknij „Edytuj" aby dodać wytyczne, punkty i grafiki.
          </p>
        )}
      </CardContent>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div
                className={`size-7 rounded-md ${cls.badgeBg} ${cls.badgeText} flex items-center justify-center`}
              >
                <Icon className="size-3.5" />
              </div>
              Edycja: {title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 overflow-y-auto pr-2 -mr-2">
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase text-muted-foreground tracking-wide">
                Intro / opis ogólny
              </div>
              <EditableTextarea
                productId={productId}
                field={introField}
                initialValue={introValue}
                placeholder={`Wpisz ogólny opis dla "${title.toLowerCase()}"…`}
                rows={4}
              />
            </div>

            <div className="space-y-2 pt-2 border-t">
              <div className="text-[10px] uppercase text-muted-foreground tracking-wide">
                Punkty (kolejność edytowalna drag&drop)
              </div>
              <GuidelinePoints
                productId={productId}
                kind={kind}
                initialPoints={points}
                sectionImages={sectionImages}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Read-only display ──────────────────────────────────────────────

function SectionDisplay({
  intro,
  points,
  sectionImages,
}: {
  intro: string | null;
  points: GuidelinePoint[];
  sectionImages: GuidelineImage[];
}) {
  return (
    <div className="space-y-4">
      {intro?.trim() && (
        <div className="text-sm whitespace-pre-wrap leading-relaxed">
          {intro}
        </div>
      )}

      {points.length > 0 && (
        <ol className="space-y-3">
          {points.map((p, i) => (
            <li key={p.id} className="flex gap-3">
              <span className="shrink-0 size-6 rounded-full bg-muted ring-1 ring-border flex items-center justify-center text-[11px] font-semibold tabular-nums text-foreground">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {p.text}
                </p>
                {p.images.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {p.images.map((img) => (
                      <a
                        key={img.id}
                        href={img.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative block size-20 rounded ring-1 ring-border overflow-hidden bg-muted hover:ring-primary/40 transition-all"
                        title={img.alt ?? ""}
                      >
                        <Image
                          src={img.url}
                          alt={img.alt ?? ""}
                          fill
                          sizes="80px"
                          className="object-cover"
                          unoptimized
                        />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {sectionImages.length > 0 && (
        <div className="space-y-2 pt-3 border-t">
          <div className="text-[10px] uppercase text-muted-foreground tracking-wide flex items-center gap-1.5">
            <ImageIcon className="size-3" />
            Grafiki ogólne ({sectionImages.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {sectionImages.map((img) => (
              <a
                key={img.id}
                href={img.url}
                target="_blank"
                rel="noopener noreferrer"
                className="relative block size-24 rounded ring-1 ring-border overflow-hidden bg-muted hover:ring-primary/40 transition-all"
                title={img.alt ?? ""}
              >
                <Image
                  src={img.url}
                  alt={img.alt ?? ""}
                  fill
                  sizes="96px"
                  className="object-cover"
                  unoptimized
                />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
