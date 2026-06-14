"use client";

/**
 * Edycja brandingu firmy — strona internetowa + 3 logosy (kolor + 2 BW).
 * Logosy są zapisywane jako pliki w `/uploads/companies/{id}/`.
 *
 * Auto-fill loga kolorowego w nowych instrukcjach — gdy user tu ustawi
 * logo w kolorze, `createProductManualAction` użyje go jako `logoImageUrl`.
 */

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ImagePlus, Pencil, X, Check } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  removeCompanyLogoAction,
  updateCompanyWebsiteAction,
  uploadCompanyLogoAction,
} from "@/server/company-settings";

type LogoKind = "color" | "bw-black" | "bw-white";

function readFileAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function CompanyBranding({
  initialWebsite,
  initialLogoColor,
  initialLogoBwOnBlack,
  initialLogoBwOnWhite,
}: {
  initialWebsite: string | null;
  initialLogoColor: string | null;
  initialLogoBwOnBlack: string | null;
  initialLogoBwOnWhite: string | null;
}) {
  const [website, setWebsite] = useState(initialWebsite ?? "");
  const [editingWebsite, setEditingWebsite] = useState(false);
  const [savingWebsite, startWebsite] = useTransition();
  const [logoColor, setLogoColor] = useState(initialLogoColor);
  const [logoBwBlack, setLogoBwBlack] = useState(initialLogoBwOnBlack);
  const [logoBwWhite, setLogoBwWhite] = useState(initialLogoBwOnWhite);
  const [uploadingKind, setUploadingKind] = useState<LogoKind | null>(null);

  async function handleLogoUpload(kind: LogoKind, file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Plik musi być obrazem (PNG/JPG/WEBP/SVG)");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error(
        `Max 2MB — twój plik: ${(file.size / 1024 / 1024).toFixed(2)}MB`,
      );
      return;
    }
    try {
      setUploadingKind(kind);
      const dataUri = await readFileAsDataUri(file);
      const result = await uploadCompanyLogoAction({ kind, dataUri });
      if (kind === "color") setLogoColor(result.url);
      if (kind === "bw-black") setLogoBwBlack(result.url);
      if (kind === "bw-white") setLogoBwWhite(result.url);
      toast.success("Logo zaktualizowane");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd uploadu");
    } finally {
      setUploadingKind(null);
    }
  }

  async function handleLogoRemove(kind: LogoKind) {
    if (!confirm("Usunąć logo?")) return;
    try {
      await removeCompanyLogoAction({ kind });
      if (kind === "color") setLogoColor(null);
      if (kind === "bw-black") setLogoBwBlack(null);
      if (kind === "bw-white") setLogoBwWhite(null);
      toast.success("Logo usunięte");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd");
    }
  }

  function saveWebsite() {
    startWebsite(async () => {
      try {
        await updateCompanyWebsiteAction({ websiteUrl: website });
        setEditingWebsite(false);
        toast.success("Zapisano");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Błąd");
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* Strona internetowa */}
      <div className="px-4 py-3 flex items-center gap-3 border-b">
        <div className="size-7 rounded grid place-items-center bg-slate-100 text-slate-500 shrink-0">
          🌐
        </div>
        <div className="text-xs text-slate-500 w-32 shrink-0 uppercase tracking-wide">
          Strona www
        </div>
        {editingWebsite ? (
          <div className="flex-1 flex items-center gap-1.5">
            <Input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="np. acro4f.com"
              className="h-7 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") saveWebsite();
                if (e.key === "Escape") {
                  setWebsite(initialWebsite ?? "");
                  setEditingWebsite(false);
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              onClick={saveWebsite}
              disabled={savingWebsite}
              className="h-7 px-2"
            >
              <Check className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setWebsite(initialWebsite ?? "");
                setEditingWebsite(false);
              }}
              disabled={savingWebsite}
              className="h-7 px-2"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex-1 flex items-center gap-2">
            <span className="text-sm text-slate-800 truncate">
              {website || (
                <span className="italic text-slate-400">(brak)</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setEditingWebsite(true)}
              className="text-[11px] text-indigo-700 hover:underline inline-flex items-center gap-0.5"
            >
              <Pencil className="size-3" /> Edytuj
            </button>
          </div>
        )}
      </div>

      {/* Logosy — 3 kafelki */}
      <div className="px-4 py-3">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
          Logosy firmy (każde max 2MB)
        </div>
        <div className="grid grid-cols-3 gap-3">
          <LogoTile
            kind="color"
            label="W kolorze"
            hint="główne, kolorowe · auto w instrukcjach"
            bgClass="bg-white"
            currentUrl={logoColor}
            uploading={uploadingKind === "color"}
            onUpload={(f) => handleLogoUpload("color", f)}
            onRemove={() => handleLogoRemove("color")}
          />
          <LogoTile
            kind="bw-black"
            label="BW na ciemne"
            hint="białe na czarnym"
            bgClass="bg-slate-900"
            currentUrl={logoBwBlack}
            uploading={uploadingKind === "bw-black"}
            onUpload={(f) => handleLogoUpload("bw-black", f)}
            onRemove={() => handleLogoRemove("bw-black")}
          />
          <LogoTile
            kind="bw-white"
            label="BW na jasne"
            hint="czarne na białym"
            bgClass="bg-white"
            currentUrl={logoBwWhite}
            uploading={uploadingKind === "bw-white"}
            onUpload={(f) => handleLogoUpload("bw-white", f)}
            onRemove={() => handleLogoRemove("bw-white")}
          />
        </div>
      </div>
    </div>
  );
}

function LogoTile({
  kind,
  label,
  hint,
  bgClass,
  currentUrl,
  uploading,
  onUpload,
  onRemove,
}: {
  kind: LogoKind;
  label: string;
  hint: string;
  bgClass: string;
  currentUrl: string | null;
  uploading: boolean;
  onUpload: (file: File | null) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-1">
      <div
        className={`relative rounded-md ring-1 ring-slate-300 ${bgClass} aspect-square flex items-center justify-center overflow-hidden`}
      >
        {currentUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentUrl}
              alt={label}
              className="max-w-[85%] max-h-[85%] object-contain"
            />
            <div className="absolute top-1 right-1 flex gap-1">
              <label
                className="size-6 rounded-full bg-white/90 grid place-items-center cursor-pointer hover:bg-white text-slate-700"
                title="Zmień logo"
              >
                <Pencil className="size-3" />
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => onUpload(e.target.files?.[0] ?? null)}
                  disabled={uploading}
                  data-kind={kind}
                />
              </label>
              <button
                type="button"
                onClick={onRemove}
                disabled={uploading}
                className="size-6 rounded-full bg-rose-600 text-white grid place-items-center hover:bg-rose-700"
                title="Usuń logo"
              >
                <X className="size-3" />
              </button>
            </div>
            {uploading && (
              <div className="absolute inset-0 bg-black/40 grid place-items-center text-white text-[10px]">
                Wgrywam…
              </div>
            )}
          </>
        ) : (
          <label
            className={`w-full h-full flex flex-col items-center justify-center gap-1 cursor-pointer text-[10px] ${
              bgClass === "bg-slate-900" ? "text-slate-300" : "text-slate-500"
            } hover:opacity-80 transition-opacity`}
          >
            {uploading ? (
              <span>Wgrywam…</span>
            ) : (
              <>
                <ImagePlus className="size-5" />
                <span>Wybierz plik</span>
              </>
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => onUpload(e.target.files?.[0] ?? null)}
              disabled={uploading}
              data-kind={kind}
            />
          </label>
        )}
      </div>
      <div className="text-center">
        <div className="text-[11px] font-semibold text-slate-700">{label}</div>
        <div className="text-[9px] text-slate-400">{hint}</div>
      </div>
    </div>
  );
}
