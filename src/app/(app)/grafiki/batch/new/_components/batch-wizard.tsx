"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Icons from "lucide-react";
import {
  Camera,
  Check,
  CheckSquare,
  Copy,
  Image as ImageIcon,
  Plus,
  Rocket,
  Search,
  Trash2,
  Type,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  LibraryDrillPicker,
  type LibraryDrillItem,
} from "@/app/(app)/produkty/_components/library-drill-picker";
import type { CategoryTreeNode } from "@/app/(app)/produkty/category-tree-select";

import {
  createPhotoBatchAction,
  createPhotoShotAction,
  createShotsFromProductAction,
  deletePhotoShotAction,
  getProductImagesAction,
  startPhotoBatchAction,
  uploadPhotoReferenceAction,
} from "@/server/product-photos";
import { QUALITY_SPEC } from "@/lib/photo-shots-presets";

type Shot = {
  id: string;
  name: string;
  iconName: string | null;
  /** Reference image — gdy istnieje, header kolumny pokazuje miniaturkę
   *  zamiast ikony Lucide. AI bierze stąd perspektywę przy generowaniu. */
  referenceImageUrl?: string | null;
};

type ProductFromCatalog = {
  id: string;
  name: string;
  productCode: string;
  color: string | null;
  categoryId: string | null;
  primaryImageUrl: string | null;
  categoryName: string | null;
  /** Krótkie parametry z bazy (wymiary, waga) — pokażemy w wierszu matrycy. */
  paramsLine: string;
};

// Item dla LibraryDrillPicker — wymaga isComponent + opcjonalny imageUrl
type PickerItem = LibraryDrillItem;

type RowConfig = {
  productId: string;
  shotIds: Set<string>;
  customDescription: string;
  referenceImages: string[];
};

function LucideIcon({
  name,
  className,
}: {
  name: string | null;
  className?: string;
}) {
  if (!name) return <ImageIcon className={className} />;
  const Cmp = (Icons as unknown as Record<string, React.FC<{ className?: string }>>)[
    name
  ];
  if (!Cmp) return <ImageIcon className={className} />;
  return <Cmp className={className} />;
}

export function BatchWizard({
  templateId,
  defaultQuality,
  shots,
  products,
  categoryTree,
}: {
  templateId: string;
  defaultQuality: "STANDARD" | "HIGH" | "ULTRA";
  shots: Shot[];
  products: ProductFromCatalog[];
  categoryTree: CategoryTreeNode[];
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState(`Kampania ${today}`);
  const [quality, setQuality] = useState<"STANDARD" | "HIGH" | "ULTRA">(
    defaultQuality,
  );

  // Wiersze matrycy — produkty wybrane przez usera + per-produkt config.
  const [rows, setRows] = useState<RowConfig[]>([]);
  // Modal wyboru produktów (zwykły)
  const [pickerOpen, setPickerOpen] = useState(false);
  // Modal „Z istniejącego produktu" — pick source product to clone its photos
  // as the basis for generating variants in different colors.
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  // Lokalna lista rzutów — startowo z props, można dorzucać własne w trakcie.
  // Nowe rzuty są zapisywane do template'u (przez createPhotoShotAction)
  // i pojawiają się jako kolejna kolumna w matrycy.
  const [localShots, setLocalShots] = useState<Shot[]>(shots);
  const [shotDialogOpen, setShotDialogOpen] = useState(false);

  const [pending, startTransition] = useTransition();

  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  // Map produktów do formatu LibraryDrillPicker (z miniaturkami).
  const pickerItems: PickerItem[] = useMemo(
    () =>
      products.map((p) => ({
        id: p.id,
        name: p.name,
        productCode: p.productCode,
        code128: null,
        categoryId: p.categoryId,
        isComponent: false,
        imageUrl: p.primaryImageUrl,
      })),
    [products],
  );

  function addProducts(productIds: string[]) {
    const taken = new Set(rows.map((r) => r.productId));
    const toAdd = productIds.filter((id) => !taken.has(id));
    if (toAdd.length === 0) {
      toast.info("Wszystkie wybrane produkty już są w kampanii");
      return;
    }
    setRows((prev) => [
      ...prev,
      ...toAdd.map((productId) => ({
        productId,
        shotIds: new Set(localShots.map((s) => s.id)),
        customDescription: "",
        referenceImages: [] as string[],
      })),
    ]);
    toast.success(`Dodano ${toAdd.length} produkt(ów)`);
  }

  function removeRow(productId: string) {
    setRows((prev) => prev.filter((r) => r.productId !== productId));
  }

  function toggleShot(productId: string, shotId: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.productId !== productId) return r;
        const next = new Set(r.shotIds);
        if (next.has(shotId)) next.delete(shotId);
        else next.add(shotId);
        return { ...r, shotIds: next };
      }),
    );
  }

  function toggleColumn(shotId: string) {
    setRows((prev) => {
      const allHave = prev.every((r) => r.shotIds.has(shotId));
      return prev.map((r) => {
        const next = new Set(r.shotIds);
        if (allHave) next.delete(shotId);
        else next.add(shotId);
        return { ...r, shotIds: next };
      });
    });
  }

  function setRowDescription(productId: string, desc: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.productId === productId ? { ...r, customDescription: desc } : r,
      ),
    );
  }

  /** Toggle ALL shots dla WSZYSTKICH produktów. */
  function toggleAll() {
    setRows((prev) => {
      const total = prev.length * localShots.length;
      const current = prev.reduce((sum, r) => sum + r.shotIds.size, 0);
      const allChecked = current === total;
      const all = new Set(localShots.map((s) => s.id));
      return prev.map((r) => ({
        ...r,
        shotIds: allChecked ? new Set<string>() : new Set(all),
      }));
    });
  }

  /** Usuń rzut z template'u (DB) + z lokalnej listy + ze wszystkich wierszy. */
  async function removeShot(shotId: string, shotName: string) {
    if (
      !confirm(
        `Usunąć rzut „${shotName}"? Operacja kasuje go z template'u — nie można cofnąć.`,
      )
    ) {
      return;
    }
    try {
      await deletePhotoShotAction(shotId);
      setLocalShots((prev) => prev.filter((s) => s.id !== shotId));
      setRows((prev) =>
        prev.map((r) => {
          if (!r.shotIds.has(shotId)) return r;
          const next = new Set(r.shotIds);
          next.delete(shotId);
          return { ...r, shotIds: next };
        }),
      );
      toast.success("Rzut usunięty");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd usuwania");
    }
  }

  /** Toggle wszystkich shots dla 1 wiersza. */
  function toggleRow(productId: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.productId !== productId) return r;
        const allChecked = r.shotIds.size === localShots.length;
        return {
          ...r,
          shotIds: allChecked
            ? new Set<string>()
            : new Set(localShots.map((s) => s.id)),
        };
      }),
    );
  }

  async function uploadReference(productId: string, file: File) {
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await uploadPhotoReferenceAction(fd);
      setRows((prev) =>
        prev.map((r) =>
          r.productId === productId
            ? { ...r, referenceImages: [...r.referenceImages, res.url] }
            : r,
        ),
      );
      toast.success("Referencja dodana");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd uploadu");
    }
  }

  function removeReference(productId: string, url: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.productId === productId
          ? {
              ...r,
              referenceImages: r.referenceImages.filter((u) => u !== url),
            }
          : r,
      ),
    );
  }

  const totalImages = rows.reduce((sum, r) => sum + r.shotIds.size, 0);
  const costPerImg = QUALITY_SPEC[quality].costPerImage;
  const estimatedCost = totalImages * costPerImg;

  function submit(startNow: boolean) {
    if (!name.trim()) {
      toast.error("Podaj nazwę kampanii");
      return;
    }
    if (rows.length === 0) {
      toast.error("Dodaj przynajmniej 1 produkt");
      return;
    }
    const emptyRows = rows.filter((r) => r.shotIds.size === 0);
    if (emptyRows.length > 0) {
      toast.error(
        `${emptyRows.length} produktów nie ma wybranych rzutów — odznacz je lub wybierz rzuty`,
      );
      return;
    }
    startTransition(async () => {
      try {
        const res = await createPhotoBatchAction({
          templateId,
          name,
          products: rows.map((r) => ({
            productId: r.productId,
            shotIds: Array.from(r.shotIds),
            customDescription: r.customDescription || undefined,
            referenceImages: r.referenceImages,
          })),
          quality,
        });
        toast.success("Kampania utworzona");
        if (startNow) {
          toast.loading("Generuję obrazy…", { id: "gen" });
          const result = await startPhotoBatchAction(res.id);
          toast.success(
            `Wygenerowano ${result.okCount}, błędów ${result.failCount}`,
            { id: "gen" },
          );
        }
        router.push(`/grafiki/batch/${res.id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Błąd");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* USTAWIENIA KAMPANII — kompaktowa belka u góry */}
      <Card className="p-3">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-end">
          <div className="space-y-1">
            <Label htmlFor="b-name" className="text-[10px] uppercase tracking-wider">
              Nazwa kampanii
            </Label>
            <Input
              id="b-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider">
              Jakość
            </Label>
            <div className="flex gap-1">
              {(["STANDARD", "HIGH", "ULTRA"] as const).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuality(q)}
                  title={QUALITY_SPEC[q].description}
                  className={cn(
                    "px-2.5 py-1 rounded text-[10px] font-semibold ring-1 transition",
                    quality === q
                      ? "bg-violet-100 text-violet-800 ring-violet-300"
                      : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
                  )}
                >
                  {QUALITY_SPEC[q].label}
                </button>
              ))}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              Łącznie / koszt
            </div>
            <div className="text-sm font-bold tabular-nums text-violet-700">
              {totalImages} zdjęć · ${estimatedCost.toFixed(2)}
            </div>
          </div>
        </div>
      </Card>

      {/* Belka z przyciskiem dodawania + sticky podsumowanie po prawej */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={() => setPickerOpen(true)}
            className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
            size="sm"
          >
            <Plus className="size-4" />
            Dodaj produkty
          </Button>
          <Button
            onClick={() => setSourcePickerOpen(true)}
            variant="outline"
            size="sm"
            className="gap-2 border-violet-300 text-violet-700 hover:bg-violet-50"
            title="Stwórz nowe kolory na podstawie zdjęć innego produktu"
          >
            <Copy className="size-4" />
            Z istniejącego produktu
          </Button>
          {rows.length > 0 && (
            <Button
              onClick={toggleAll}
              variant="outline"
              size="sm"
              className="gap-1.5"
              title="Toggle wszystkich rzutów dla wszystkich produktów"
            >
              <CheckSquare className="size-3.5" />
              {rows.every((r) => r.shotIds.size === localShots.length)
                ? "Odznacz wszystko"
                : "Zaznacz wszystko"}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-muted-foreground">
            {rows.length} produkt(ów) · {totalImages} zdjęć
          </div>
          <Button
            onClick={() => submit(true)}
            disabled={pending || totalImages === 0}
            className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
            size="sm"
          >
            <Rocket className="size-4" />
            {pending ? "Pracuję…" : `Generuj (${totalImages})`}
          </Button>
          <Button
            onClick={() => submit(false)}
            disabled={pending || totalImages === 0}
            variant="outline"
            size="sm"
          >
            Bez generowania
          </Button>
        </div>
      </div>

      <div>
        {/* GŁÓWNA MATRYCA */}
        <div className="space-y-3">
          {rows.length === 0 ? (
            <Card className="p-12 text-center space-y-2">
              <Search className="size-12 text-slate-300 mx-auto" />
              <p className="text-sm text-muted-foreground">
                Nie wybrałeś jeszcze produktów. Kliknij „Dodaj produkty" wyżej.
              </p>
            </Card>
          ) : (
            <Card className="p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left px-3 py-2 sticky left-0 bg-slate-50 z-10 min-w-[220px] border-r font-semibold">
                        Produkt
                      </th>
                      <th className="text-left px-2 py-2 min-w-[140px] border-r font-semibold text-[10px] uppercase tracking-wider text-slate-600">
                        Parametry
                      </th>
                      <th className="text-left px-2 py-2 min-w-[150px] border-r font-semibold text-[10px] uppercase tracking-wider text-slate-600">
                        Zdjęcia realne (referencje)
                      </th>
                      <th className="text-left px-2 py-2 min-w-[200px] border-r font-semibold text-[10px] uppercase tracking-wider text-slate-600">
                        Opis (override)
                      </th>
                      {localShots.map((s) => {
                        const allChecked =
                          rows.length > 0 &&
                          rows.every((r) => r.shotIds.has(s.id));
                        return (
                          <th
                            key={s.id}
                            className="relative px-1 py-2 text-center min-w-[80px] border-r last:border-r-0 group/header"
                          >
                            {/* Przycisk usuwania — pojawia się na hover.
                                Trzymany absolutnie żeby nie zakłócać layoutu. */}
                            <button
                              type="button"
                              onClick={() => removeShot(s.id, s.name)}
                              className="absolute top-0.5 right-0.5 size-4 rounded grid place-items-center bg-white/90 ring-1 ring-rose-200 text-rose-600 hover:bg-rose-100 opacity-0 group-hover/header:opacity-100 transition z-10"
                              title="Usuń ten rzut z template'u"
                            >
                              <X className="size-2.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleColumn(s.id)}
                              className="w-full flex flex-col items-center gap-1 hover:bg-violet-50 rounded py-1 transition"
                              title={`Zaznacz/odznacz "${s.name}" dla wszystkich`}
                            >
                              {/* Miniaturka reference image (gdy istnieje) →
                                  zamiast generycznej ikony Lucide. Daje od razu
                                  wizualną informację jak wygląda perspektywa. */}
                              {s.referenceImageUrl ? (
                                <div
                                  className={cn(
                                    "size-10 rounded overflow-hidden ring-1 transition",
                                    allChecked
                                      ? "ring-violet-400 ring-2"
                                      : "ring-slate-200",
                                  )}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={s.referenceImageUrl}
                                    alt={s.name}
                                    className="w-full h-full object-cover bg-slate-100"
                                  />
                                </div>
                              ) : (
                                <LucideIcon
                                  name={s.iconName}
                                  className={cn(
                                    "size-3.5",
                                    allChecked
                                      ? "text-violet-700"
                                      : "text-slate-400",
                                  )}
                                />
                              )}
                              <span
                                className={cn(
                                  "text-[9px] uppercase tracking-wider font-semibold line-clamp-2 leading-tight",
                                  allChecked
                                    ? "text-violet-800"
                                    : "text-slate-600",
                                )}
                              >
                                {s.name}
                              </span>
                            </button>
                          </th>
                        );
                      })}
                      {/* Przycisk dodawania nowego rzutu w trakcie — np. „rzut
                          na podstawie zdjęcia" (perspektywa z reference). */}
                      <th className="px-1 py-2 text-center min-w-[58px] border-r border-violet-200 bg-violet-50/30">
                        <button
                          type="button"
                          onClick={() => setShotDialogOpen(true)}
                          className="w-full flex flex-col items-center gap-1 hover:bg-violet-100 rounded py-1 transition text-violet-700"
                          title="Dodaj własny rzut (np. z reference image)"
                        >
                          <Plus className="size-4" />
                          <span className="text-[9px] uppercase tracking-wider font-semibold">
                            Dodaj
                          </span>
                        </button>
                      </th>
                      <th className="px-2 py-2 sticky right-0 bg-slate-50 z-10 w-8 border-l"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const p = productById.get(row.productId);
                      if (!p) return null;
                      return (
                        <tr
                          key={row.productId}
                          className="border-b hover:bg-slate-50/30"
                        >
                          <td className="px-3 py-2 sticky left-0 bg-white z-10 border-r align-top">
                            <div className="flex items-start gap-2">
                              {/* Per-row toggle — zaznacz/odznacz wszystkie
                                  rzuty TEGO produktu naraz. */}
                              <button
                                type="button"
                                onClick={() => toggleRow(p.id)}
                                className={cn(
                                  "size-5 rounded grid place-items-center ring-1 mt-0.5 shrink-0 transition",
                                  row.shotIds.size === localShots.length
                                    ? "bg-violet-600 ring-violet-600 text-white hover:bg-violet-700"
                                    : row.shotIds.size === 0
                                      ? "bg-white ring-slate-300 hover:ring-violet-400 hover:bg-violet-50"
                                      : "bg-violet-100 ring-violet-400 text-violet-700 hover:bg-violet-200",
                                )}
                                title={
                                  row.shotIds.size === localShots.length
                                    ? "Odznacz wszystkie rzuty tego produktu"
                                    : "Zaznacz wszystkie rzuty tego produktu"
                                }
                              >
                                {row.shotIds.size === localShots.length ? (
                                  <Check className="size-3" />
                                ) : row.shotIds.size > 0 ? (
                                  <span className="text-[10px] font-bold">−</span>
                                ) : null}
                              </button>
                              {p.primaryImageUrl ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={p.primaryImageUrl}
                                  alt=""
                                  className="size-10 rounded object-cover bg-slate-100 shrink-0"
                                />
                              ) : (
                                <div className="size-10 rounded bg-slate-100 grid place-items-center text-slate-300 shrink-0">
                                  <ImageIcon className="size-4" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="font-medium text-xs truncate max-w-[180px]">
                                  {p.name}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {p.productCode}
                                  {p.color && ` · ${p.color}`}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="px-2 py-2 border-r align-top">
                            <div className="text-[10px] text-slate-600 whitespace-pre-line">
                              {p.paramsLine || (
                                <span className="italic text-slate-400">
                                  brak
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-2 py-2 border-r align-top">
                            <ReferencesCell
                              urls={row.referenceImages}
                              onAdd={(file) => uploadReference(p.id, file)}
                              onRemove={(url) => removeReference(p.id, url)}
                            />
                          </td>

                          <td className="px-2 py-2 border-r align-top">
                            <textarea
                              value={row.customDescription}
                              onChange={(e) =>
                                setRowDescription(p.id, e.target.value)
                              }
                              placeholder='np. „ciemniejszy odcień", „bez połysku"'
                              rows={2}
                              className="w-full text-[10px] rounded ring-1 ring-slate-200 px-1.5 py-1 resize-none focus:ring-violet-300 focus:outline-none"
                            />
                          </td>

                          {localShots.map((s) => {
                            const checked = row.shotIds.has(s.id);
                            return (
                              <td
                                key={s.id}
                                className="px-1 py-2 text-center border-r last:border-r-0 align-middle"
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleShot(p.id, s.id)}
                                  className={cn(
                                    "size-6 rounded mx-auto grid place-items-center ring-1 transition",
                                    checked
                                      ? "bg-violet-600 ring-violet-600 text-white hover:bg-violet-700"
                                      : "bg-white ring-slate-300 hover:ring-violet-400 hover:bg-violet-50",
                                  )}
                                >
                                  {checked && <Check className="size-3.5" />}
                                </button>
                              </td>
                            );
                          })}
                          {/* Pusta komórka pod „+ Dodaj rzut" w nagłówku */}
                          <td className="border-r bg-violet-50/10"></td>

                          <td className="px-2 py-2 sticky right-0 bg-white z-10 border-l align-top">
                            <button
                              type="button"
                              onClick={() => removeRow(p.id)}
                              className="size-6 rounded grid place-items-center hover:bg-rose-100 text-rose-600 transition"
                              title="Usuń produkt z kampanii"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

      </div>

      <LibraryDrillPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Dodaj produkty do kampanii"
        items={pickerItems}
        excludedIds={new Set(rows.map((r) => r.productId))}
        categoryTree={categoryTree}
        filterIsComponent={undefined}
        multiSelect
        onPickMultiple={(picked) => {
          addProducts(picked.map((p) => p.id));
          setPickerOpen(false);
        }}
      />

      <AddShotDialog
        open={shotDialogOpen}
        onOpenChange={setShotDialogOpen}
        templateId={templateId}
        nextSortOrder={localShots.length}
        onCreated={(shot) => {
          setLocalShots((prev) => [...prev, shot]);
          // Auto-zaznacz nowy rzut dla wszystkich produktów już w matrycy
          setRows((prev) =>
            prev.map((r) => ({
              ...r,
              shotIds: new Set([...r.shotIds, shot.id]),
            })),
          );
        }}
      />

      <SourceProductDialog
        open={sourcePickerOpen}
        onOpenChange={setSourcePickerOpen}
        templateId={templateId}
        products={products}
        nextSortOrder={localShots.length}
        onCreated={(shots) => {
          setLocalShots((prev) => [...prev, ...shots]);
          // Auto-zaznacz nowe rzuty dla wszystkich obecnych produktów
          setRows((prev) =>
            prev.map((r) => ({
              ...r,
              shotIds: new Set([...r.shotIds, ...shots.map((s) => s.id)]),
            })),
          );
        }}
      />
    </div>
  );
}

// ─── Dialog dodawania własnego rzutu — z opisu LUB z reference image ───
function AddShotDialog({
  open,
  onOpenChange,
  templateId,
  nextSortOrder,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string;
  nextSortOrder: number;
  onCreated: (shot: Shot) => void;
}) {
  const [mode, setMode] = useState<"prompt" | "image">("prompt");
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [iconName, setIconName] = useState("Image");
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(
    null,
  );
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function reset() {
    setMode("prompt");
    setName("");
    setPrompt("");
    setIconName("Image");
    setReferenceImageUrl(null);
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await uploadPhotoReferenceAction(fd);
      setReferenceImageUrl(res.url);
      // Auto-uzupełnij default name i prompt jeśli puste
      if (!name) setName("Z reference image");
      if (!prompt) {
        setPrompt(
          "Match the camera angle, perspective, framing and overall composition from the reference image. The product should be photographed from the same viewpoint and with the same lens characteristics.",
        );
      }
      setIconName("Camera");
      toast.success("Reference image dodane");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd uploadu");
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    if (!name.trim()) {
      toast.error("Podaj nazwę rzutu");
      return;
    }
    if (!prompt.trim()) {
      toast.error("Podaj opis (prompt) rzutu");
      return;
    }
    if (mode === "image" && !referenceImageUrl) {
      toast.error("Wgraj zdjęcie referencyjne");
      return;
    }
    startTransition(async () => {
      try {
        const res = await createPhotoShotAction({
          templateId,
          name,
          iconName,
          shotPrompt: prompt,
          referenceImageUrl: mode === "image" ? referenceImageUrl : null,
          sortOrder: nextSortOrder,
        });
        toast.success("Rzut dodany");
        onCreated({
          id: res.shot.id,
          name: res.shot.name,
          iconName: res.shot.iconName,
          referenceImageUrl: res.shot.referenceImageUrl,
        });
        reset();
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Błąd zapisu");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Dodaj własny rzut</DialogTitle>
        </DialogHeader>

        {/* Tabs trybu */}
        <div className="flex gap-1 ring-1 ring-slate-200 rounded-md p-0.5 bg-slate-50 w-fit">
          <button
            type="button"
            onClick={() => setMode("prompt")}
            className={cn(
              "px-3 py-1.5 rounded text-xs font-semibold inline-flex items-center gap-1.5 transition",
              mode === "prompt"
                ? "bg-white text-violet-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            <Type className="size-3.5" />
            Z opisu (prompt)
          </button>
          <button
            type="button"
            onClick={() => setMode("image")}
            className={cn(
              "px-3 py-1.5 rounded text-xs font-semibold inline-flex items-center gap-1.5 transition",
              mode === "image"
                ? "bg-white text-violet-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            <Camera className="size-3.5" />
            Z reference image
          </button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          {mode === "prompt"
            ? "Sam opiszesz kąt kamery, framing, pose. Imagen wygeneruje wg opisu."
            : "Wgrasz zdjęcie z pożądaną perspektywą — Imagen zamapuje na nasz produkt ten sam kąt kamery, framing i kompozycję."}
        </p>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="shot-name">Nazwa rzutu</Label>
            <Input
              id="shot-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                mode === "prompt"
                  ? "np. Z perspektywy lotniczej"
                  : "np. Rzut na podstawie zdjęcia"
              }
            />
          </div>

          {mode === "image" && (
            <div className="space-y-1.5">
              <Label>Zdjęcie referencyjne (perspektywa)</Label>
              {referenceImageUrl ? (
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={referenceImageUrl}
                    alt="Reference"
                    className="max-h-48 rounded ring-1 ring-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => setReferenceImageUrl(null)}
                    className="absolute top-1 right-1 size-5 rounded bg-rose-600/90 text-white grid place-items-center"
                    title="Usuń"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full h-32 rounded-md ring-1 ring-dashed ring-slate-300 hover:ring-violet-400 hover:bg-violet-50/30 grid place-items-center text-slate-500 hover:text-violet-700 transition gap-1.5"
                >
                  <Upload className="size-5" />
                  <span className="text-xs font-medium">
                    {uploading ? "Wgrywam…" : "Wgraj zdjęcie z pożądaną perspektywą"}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    JPG / PNG / WebP — max 10 MB
                  </span>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    handleUpload(f);
                    e.target.value = "";
                  }
                }}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="shot-prompt">
              Prompt rzutu
              {mode === "image" && (
                <span className="text-[10px] text-muted-foreground ml-1.5 normal-case font-normal italic">
                  (auto-uzupełniony — możesz edytować)
                </span>
              )}
            </Label>
            <Textarea
              id="shot-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="text-[11px] font-mono"
              placeholder={
                mode === "prompt"
                  ? "Describe the camera angle, framing, pose, perspective…"
                  : "Match the angle and composition from the reference image…"
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shot-icon">
              Ikona (nazwa z Lucide)
            </Label>
            <Input
              id="shot-icon"
              value={iconName}
              onChange={(e) => setIconName(e.target.value)}
              placeholder="np. Square, User, Camera, Box"
            />
            <p className="text-[10px] text-muted-foreground">
              Lista ikon:{" "}
              <a
                href="https://lucide.dev/icons"
                target="_blank"
                rel="noopener"
                className="underline"
              >
                lucide.dev/icons
              </a>
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Anuluj
          </Button>
          <Button
            onClick={submit}
            disabled={pending || uploading}
            className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5"
          >
            <Plus className="size-4" />
            {pending ? "Zapisuję…" : "Dodaj rzut"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function ReferencesCell({
  urls,
  onAdd,
  onRemove,
}: {
  urls: string[];
  onAdd: (file: File) => void;
  onRemove: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        {urls.map((url) => (
          <div
            key={url}
            className="relative size-10 rounded overflow-hidden ring-1 ring-slate-200 group"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => onRemove(url)}
              className="absolute top-0.5 right-0.5 size-4 rounded bg-rose-600/90 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition"
              title="Usuń"
            >
              <X className="size-2.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="size-10 rounded ring-1 ring-dashed ring-slate-300 hover:ring-violet-400 hover:bg-violet-50 grid place-items-center text-slate-400 hover:text-violet-600 transition"
          title="Dodaj zdjęcie referencyjne"
        >
          <Upload className="size-3.5" />
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onAdd(file);
            e.target.value = "";
          }
        }}
      />
    </div>
  );
}

// ─── Modal „Z istniejącego produktu" ──────────────────────────────────
// User wybiera produkt-źródło → ładujemy jego zdjęcia → user zaznacza które
// mają stać się rzutami (każde z referenceImageUrl = URL tego zdjęcia).
// Po zapisie rzuty trafiają do template'u, kolumny w matrycy się pojawiają,
// wszystkie produkty w kampanii dostają je auto-zaznaczone.
function SourceProductDialog({
  open,
  onOpenChange,
  templateId,
  products,
  nextSortOrder,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string;
  products: ProductFromCatalog[];
  nextSortOrder: number;
  onCreated: (shots: Shot[]) => void;
}) {
  const [step, setStep] = useState<"pick" | "select">("pick");
  const [search, setSearch] = useState("");
  const [sourceProduct, setSourceProduct] =
    useState<ProductFromCatalog | null>(null);
  const [sourceImages, setSourceImages] = useState<
    { id: string; url: string; alt: string | null }[]
  >([]);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(
    new Set(),
  );
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  function reset() {
    setStep("pick");
    setSearch("");
    setSourceProduct(null);
    setSourceImages([]);
    setSelectedImageIds(new Set());
  }

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.productCode.toLowerCase().includes(q) ||
        (p.color?.toLowerCase().includes(q) ?? false),
    );
  }, [products, search]);

  async function pickSource(p: ProductFromCatalog) {
    setLoading(true);
    try {
      const res = await getProductImagesAction(p.id);
      if (res.images.length === 0) {
        toast.error(`„${p.name}" nie ma jeszcze zdjęć`);
        return;
      }
      setSourceProduct(p);
      setSourceImages(res.images);
      setSelectedImageIds(new Set(res.images.map((img) => img.id)));
      setStep("select");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd pobierania");
    } finally {
      setLoading(false);
    }
  }

  function toggleImage(id: string) {
    setSelectedImageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    if (!sourceProduct) return;
    if (selectedImageIds.size === 0) {
      toast.error("Wybierz przynajmniej 1 zdjęcie");
      return;
    }
    startTransition(async () => {
      try {
        const urls = sourceImages
          .filter((img) => selectedImageIds.has(img.id))
          .map((img) => img.url);
        const res = await createShotsFromProductAction({
          templateId,
          sourceProductName: sourceProduct.name,
          imageUrls: urls,
          startSortOrder: nextSortOrder,
        });
        toast.success(`Utworzono ${res.shots.length} rzut(ów)`);
        onCreated(
          res.shots.map((s) => ({
            id: s.id,
            name: s.name,
            iconName: s.iconName,
            referenceImageUrl: s.referenceImageUrl,
          })),
        );
        reset();
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Błąd");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="!max-w-[min(96vw,720px)]">
        <DialogHeader>
          <DialogTitle>
            {step === "pick"
              ? "Wybierz produkt-źródło"
              : `Zdjęcia: ${sourceProduct?.name ?? ""}`}
          </DialogTitle>
        </DialogHeader>

        {step === "pick" ? (
          <>
            <p className="text-[11px] text-muted-foreground">
              Wybierz produkt który ma już zdjęcia produktowe. Każde z jego
              zdjęć stanie się rzutem-referencją — gdy potem dodasz inne kolory
              produktu, AI wygeneruje je z identyczną perspektywą i kompozycją.
            </p>
            <Input
              placeholder="Szukaj produktu…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <div className="max-h-[400px] overflow-y-auto ring-1 ring-slate-100 rounded p-1 space-y-0.5">
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickSource(p)}
                  disabled={loading}
                  className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded hover:bg-violet-50 transition group disabled:opacity-50"
                >
                  {p.primaryImageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={p.primaryImageUrl}
                      alt=""
                      className="size-8 rounded object-cover bg-slate-100 shrink-0 ring-1 ring-slate-200"
                    />
                  ) : (
                    <div className="size-8 rounded bg-slate-100 grid place-items-center text-slate-300 shrink-0">
                      <ImageIcon className="size-3.5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">
                      {p.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {p.productCode}
                      {p.color && ` · ${p.color}`}
                    </div>
                  </div>
                </button>
              ))}
              {filteredProducts.length === 0 && (
                <div className="text-[11px] italic text-muted-foreground text-center py-4">
                  Brak produktów
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-[11px] text-muted-foreground">
              Zaznacz które zdjęcia mają stać się rzutami. Każde wybrane zdjęcie
              = osobna kolumna w matrycy, z perspektywą tego zdjęcia jako
              referencją dla AI.
            </p>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500">
                Zaznaczonych:{" "}
                <strong className="text-violet-700 tabular-nums">
                  {selectedImageIds.size}
                </strong>{" "}
                / {sourceImages.length}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (selectedImageIds.size === sourceImages.length) {
                    setSelectedImageIds(new Set());
                  } else {
                    setSelectedImageIds(
                      new Set(sourceImages.map((img) => img.id)),
                    );
                  }
                }}
                className="text-violet-700 hover:underline"
              >
                {selectedImageIds.size === sourceImages.length
                  ? "Odznacz wszystkie"
                  : "Zaznacz wszystkie"}
              </button>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-4 gap-2 max-h-[400px] overflow-y-auto">
              {sourceImages.map((img) => {
                const checked = selectedImageIds.has(img.id);
                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => toggleImage(img.id)}
                    className={cn(
                      "relative rounded ring-2 overflow-hidden transition aspect-square",
                      checked
                        ? "ring-violet-500"
                        : "ring-transparent hover:ring-slate-300",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.alt ?? ""}
                      className="w-full h-full object-cover bg-slate-100"
                    />
                    <div
                      className={cn(
                        "absolute top-1 left-1 size-5 rounded-sm grid place-items-center transition",
                        checked
                          ? "bg-violet-600 text-white"
                          : "bg-white/80 ring-1 ring-slate-300",
                      )}
                    >
                      {checked && <Check className="size-3.5" />}
                    </div>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setStep("pick")}
              className="text-[11px] text-violet-700 hover:underline self-start"
            >
              ← Wybierz inny produkt
            </button>
          </>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Anuluj
          </Button>
          {step === "select" && (
            <Button
              onClick={submit}
              disabled={pending || selectedImageIds.size === 0}
              className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5"
            >
              <Plus className="size-4" />
              {pending
                ? "Tworzę…"
                : `Utwórz ${selectedImageIds.size} rzut(y)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
