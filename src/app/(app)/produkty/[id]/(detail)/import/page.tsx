import { notFound } from "next/navigation";
import { ArrowLeft, Boxes, Layers, Package, Ship } from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  cbmFromBox,
  cbmFromMasterBox,
  cbmFromBulk,
} from "@/lib/kalkulacje";

import { getProductFull } from "../../_lib/fetchers";
import { EditImportButton } from "./_components/edit-import-dialog";

export const dynamic = "force-dynamic";

export default async function ImportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companyId = await getCurrentCompanyId();
  const [product, availableBoxes] = await Promise.all([
    getProductFull(id),
    // Karton zbiorczy z Chin do pickera w edit dialogu (master karton).
    // Tylko CN collective BOX-y żeby user widział relevantne opcje.
    db.shippingBox.findMany({
      where: {
        companyId,
        archived: false,
        packagingType: "BOX",
        origin: "CHINA_STANDARD",
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        internalCode: true,
        packagingType: true,
        widthCm: true,
        heightCm: true,
        depthCm: true,
        cardboardLayers: true,
        origin: true,
        isCollective: true,
        purchasePricePln: true,
        purposeText: true,
        innerBoxesPerMaster: true,
      },
    }),
  ]);
  if (!product) notFound();

  const factoryPin =
    product.shippingBoxes.find((b) => b.purpose === "FACTORY" && b.isPrimary) ??
    product.shippingBoxes.find((b) => b.purpose === "FACTORY") ??
    null;

  // Wymiary efektywne kartonu importowego (denormalizowane na produkcie + fallback do pinned box)
  const effBoxW = product.boxWidthCm ?? factoryPin?.box.widthCm ?? null;
  const effBoxH = product.boxHeightCm ?? factoryPin?.box.heightCm ?? null;
  const effBoxD = product.boxDepthCm ?? factoryPin?.box.depthCm ?? null;
  const effBoxWeight =
    product.boxWeightKg ?? factoryPin?.box.weightKg ?? null;
  const effUnitsPerBox =
    product.unitsPerBox ?? factoryPin?.unitsPerBox ?? null;

  const isKarton = product.importMode === "KARTON";
  const hasMaster =
    isKarton &&
    product.masterBoxWidthCm != null &&
    product.masterBoxHeightCm != null &&
    product.masterBoxDepthCm != null &&
    product.innerBoxesPerMaster != null &&
    product.innerBoxesPerMaster > 0;

  // CBM/szt — master ma priorytet, potem karton, potem LUZEM
  const cbmFromMaster = hasMaster
    ? cbmFromMasterBox(
        product.masterBoxWidthCm,
        product.masterBoxHeightCm,
        product.masterBoxDepthCm,
        product.innerBoxesPerMaster,
        effUnitsPerBox,
      )
    : null;
  const cbmFromKarton = isKarton
    ? cbmFromBox(effBoxW, effBoxH, effBoxD, effUnitsPerBox)
    : null;
  const cbmBulk = !isKarton
    ? cbmFromBulk(product.referenceContainerM3, product.unitsPerContainer)
    : null;
  const cbmFinal =
    product.cbmPerUnit ??
    cbmFromMaster ??
    cbmFromKarton ??
    cbmBulk;
  // Skąd wzięty CBM?
  const cbmSource: string =
    product.cbmPerUnit != null
      ? "override z produktu"
      : cbmFromMaster != null
        ? "z hierarchii kartonu zbiorczego"
        : cbmFromKarton != null
          ? "z kartonu importowego"
          : cbmBulk != null
            ? "z trybu LUZEM (kontener)"
            : "brak danych";

  return (
    <div className="space-y-6">
      {/* Header — przycisk edycji przeniesiony na dół strony (niebieski) */}
      <div>
        <h2 className="text-lg font-heading font-semibold flex items-center gap-2">
          <Ship className="size-4 text-amber-600" />
          Import z Chin
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Krok 3 z wizarda produktu — w czym produkt przyjeżdża z Chin, w jakiej
          ilości w kartonie/masterze, ile sztuk na kontener. Z tego liczy się CBM
          per sztukę i koszty importu.
        </p>
      </div>

      {/* 2 kolumny: lewa = expanded ImportModeCards (active zawiera wszystkie
          szczegóły + przycisk edycji), prawa = CBM/sztuka */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LEWA: Tryb importu — aktywna karta rozszerzona */}
        <div className="space-y-2">
          <ImportModeCard
            active={isKarton}
            icon={Package}
            title="W kartonie z Chin"
            description={
              <>
                Produkt przyjeżdża w <strong>gotowych kartonach</strong> z
                fabryki. Podajesz wymiary kartonu + ile sztuk się w nim
                mieści.
              </>
            }
            theme="emerald"
          >
            {isKarton && (
              <div className="space-y-3 pt-1">
                {factoryPin && (
                  <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-emerald-100 ring-1 ring-emerald-400 text-emerald-900 text-xs font-medium">
                    <ArrowLeft className="size-3.5 shrink-0" />
                    <Package className="size-3.5 shrink-0 text-emerald-700" />
                    <span>
                      Wybrany karton:{" "}
                      <strong className="font-bold">
                        {factoryPin.box.name}
                      </strong>
                    </span>
                  </div>
                )}
                {effBoxW != null && effBoxH != null && effBoxD != null ? (
                  <div className="grid grid-cols-2 gap-3 items-end">
                    <KV
                      label="Wymiary"
                      value={
                        <span className="font-mono">
                          {effBoxW}×{effBoxH}×{effBoxD}
                          <span className="text-[10px] text-slate-500 ml-0.5">
                            cm
                          </span>
                        </span>
                      }
                    />
                    <KV
                      label="Waga produktu i kartonu"
                      value={
                        effBoxWeight != null ? `${effBoxWeight} kg` : "—"
                      }
                    />
                    <KV
                      label="Sztuk / karton"
                      value={effUnitsPerBox ?? "—"}
                    />
                    <div className="flex items-end justify-between gap-2">
                      <KV
                        label="CBM kartonu"
                        value={
                          <span className="font-mono">
                            {(
                              (effBoxW * effBoxH * effBoxD) /
                              1_000_000
                            ).toFixed(4)}{" "}
                            m³
                          </span>
                        }
                      />
                      <EditImportButton
                        productId={product.id}
                        initial={{
                          weightKg: product.weightKg,
                          customsDutyPct: product.customsDutyPct,
                          importMode: product.importMode as "KARTON" | "LUZEM",
                          boxWidthCm: product.boxWidthCm,
                          boxHeightCm: product.boxHeightCm,
                          boxDepthCm: product.boxDepthCm,
                          boxWeightKg: product.boxWeightKg,
                          unitsPerBox: product.unitsPerBox,
                          masterBoxWidthCm: product.masterBoxWidthCm,
                          masterBoxHeightCm: product.masterBoxHeightCm,
                          masterBoxDepthCm: product.masterBoxDepthCm,
                          masterBoxWeightKg: product.masterBoxWeightKg,
                          innerBoxesPerMaster: product.innerBoxesPerMaster,
                          unitsPerContainer: product.unitsPerContainer,
                          referenceContainerM3: product.referenceContainerM3,
                        }}
                        availableBoxes={availableBoxes.map((b) => ({
                          id: b.id,
                          name: b.name,
                          internalCode: b.internalCode,
                          packagingType: b.packagingType as "BOX" | "POLY_BAG",
                          widthCm: b.widthCm,
                          heightCm: b.heightCm,
                          depthCm: b.depthCm,
                          cardboardLayers: b.cardboardLayers,
                          origin: b.origin as "POLAND" | "CHINA_STANDARD",
                          isCollective: b.isCollective,
                          purchasePricePln: b.purchasePricePln,
                          purposeText: b.purposeText,
                          innerBoxesPerMaster: b.innerBoxesPerMaster,
                        }))}
                        label="Zmień import"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground italic">
                      {'Brak wymiarów kartonu — uzupełnij przez „Zmień import".'}
                    </p>
                    <EditImportButton
                      productId={product.id}
                      initial={{
                        weightKg: product.weightKg,
                        customsDutyPct: product.customsDutyPct,
                        importMode: product.importMode as "KARTON" | "LUZEM",
                        boxWidthCm: product.boxWidthCm,
                        boxHeightCm: product.boxHeightCm,
                        boxDepthCm: product.boxDepthCm,
                        boxWeightKg: product.boxWeightKg,
                        unitsPerBox: product.unitsPerBox,
                        masterBoxWidthCm: product.masterBoxWidthCm,
                        masterBoxHeightCm: product.masterBoxHeightCm,
                        masterBoxDepthCm: product.masterBoxDepthCm,
                        masterBoxWeightKg: product.masterBoxWeightKg,
                        innerBoxesPerMaster: product.innerBoxesPerMaster,
                        unitsPerContainer: product.unitsPerContainer,
                        referenceContainerM3: product.referenceContainerM3,
                      }}
                      availableBoxes={availableBoxes.map((b) => ({
                        id: b.id,
                        name: b.name,
                        internalCode: b.internalCode,
                        packagingType: b.packagingType as "BOX" | "POLY_BAG",
                        widthCm: b.widthCm,
                        heightCm: b.heightCm,
                        depthCm: b.depthCm,
                        cardboardLayers: b.cardboardLayers,
                        origin: b.origin as "POLAND" | "CHINA_STANDARD",
                        isCollective: b.isCollective,
                        purchasePricePln: b.purchasePricePln,
                        purposeText: b.purposeText,
                        innerBoxesPerMaster: b.innerBoxesPerMaster,
                      }))}
                      label="Zmień import"
                    />
                  </div>
                )}

                {/* Master karton — wewnątrz aktywnej karty (gdy ustawione) */}
                {hasMaster && (
                  <div className="mt-3 p-3 rounded-md bg-orange-50/70 ring-1 ring-orange-200">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="size-6 rounded bg-orange-100 text-orange-700 grid place-items-center">
                        <Boxes className="size-3" />
                      </div>
                      <span className="text-xs font-semibold text-orange-900">
                        Karton zbiorczy
                      </span>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-orange-100 text-orange-800 ring-1 ring-orange-200">
                        prod. ×{product.innerBoxesPerMaster}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <KV
                        label="Wymiary zbiorczego"
                        value={
                          <span className="font-mono">
                            {product.masterBoxWidthCm}×
                            {product.masterBoxHeightCm}×
                            {product.masterBoxDepthCm}
                            <span className="text-[10px] text-slate-500 ml-0.5">
                              cm
                            </span>
                          </span>
                        }
                      />
                      <KV
                        label="Waga zbiorczego"
                        value={
                          product.masterBoxWeightKg != null
                            ? `${product.masterBoxWeightKg} kg`
                            : "—"
                        }
                      />
                      <KV
                        label="Prod. / zbiorczy"
                        value={product.innerBoxesPerMaster}
                      />
                      <KV
                        label="Sztuk / zbiorczy"
                        value={
                          product.innerBoxesPerMaster && effUnitsPerBox
                            ? `${product.innerBoxesPerMaster * effUnitsPerBox} szt`
                            : "—"
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </ImportModeCard>

          <ImportModeCard
            active={!isKarton}
            icon={Layers}
            title="Luzem w kontenerze"
            description={
              <>
                <strong>Bez kartonu</strong> — produkt układany luzem w
                kontenerze. Podajesz ile sztuk mieści się w m³ kontenera.
              </>
            }
            theme="violet"
          >
            {!isKarton && (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-3 items-end">
                  <KV
                    label="CBM referencyjny"
                    value={
                      product.referenceContainerM3 != null
                        ? `${product.referenceContainerM3} m³`
                        : "—"
                    }
                  />
                  <KV
                    label="Sztuk / kontener"
                    value={product.unitsPerContainer ?? "—"}
                  />
                  <KV
                    label="CBM / szt (auto)"
                    value={
                      cbmBulk != null ? (
                        <span className="font-mono">
                          {cbmBulk.toFixed(4)} m³
                        </span>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <div className="flex justify-end">
                    <EditImportButton
                      productId={product.id}
                      initial={{
                        weightKg: product.weightKg,
                        customsDutyPct: product.customsDutyPct,
                        importMode: product.importMode as "KARTON" | "LUZEM",
                        boxWidthCm: product.boxWidthCm,
                        boxHeightCm: product.boxHeightCm,
                        boxDepthCm: product.boxDepthCm,
                        boxWeightKg: product.boxWeightKg,
                        unitsPerBox: product.unitsPerBox,
                        masterBoxWidthCm: product.masterBoxWidthCm,
                        masterBoxHeightCm: product.masterBoxHeightCm,
                        masterBoxDepthCm: product.masterBoxDepthCm,
                        masterBoxWeightKg: product.masterBoxWeightKg,
                        innerBoxesPerMaster: product.innerBoxesPerMaster,
                        unitsPerContainer: product.unitsPerContainer,
                        referenceContainerM3: product.referenceContainerM3,
                      }}
                      availableBoxes={availableBoxes.map((b) => ({
                        id: b.id,
                        name: b.name,
                        internalCode: b.internalCode,
                        packagingType: b.packagingType as "BOX" | "POLY_BAG",
                        widthCm: b.widthCm,
                        heightCm: b.heightCm,
                        depthCm: b.depthCm,
                        cardboardLayers: b.cardboardLayers,
                        origin: b.origin as "POLAND" | "CHINA_STANDARD",
                        isCollective: b.isCollective,
                        purchasePricePln: b.purchasePricePln,
                        purposeText: b.purposeText,
                        innerBoxesPerMaster: b.innerBoxesPerMaster,
                      }))}
                      label="Zmień import"
                    />
                  </div>
                </div>
                <div className="text-[10px] text-violet-700/80 italic">
                  40&apos; kontener = 68 m³ · 20&apos; = 28 m³
                </div>
              </div>
            )}
          </ImportModeCard>
        </div>

        {/* PRAWA: CBM/sztuka */}
        <div className="space-y-4">
          <Card className="overflow-hidden border-l-4 border-l-amber-400 bg-amber-50/30">
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <div className="size-7 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Ship className="size-3.5" />
                </div>
                CBM / sztuka
                <span className="ml-2 text-[10px] text-muted-foreground font-normal italic">
                  ({cbmSource})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="font-mono text-2xl font-bold text-amber-900 tabular-nums">
                {cbmFinal != null ? cbmFinal.toFixed(4) : "—"}
                <span className="text-sm font-normal text-amber-700 ml-1">
                  m³
                </span>
              </div>
              {cbmFinal != null && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Używany w kalkulacjach kontenera i kosztu importu na liście
                  zamówień.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ImportModeCard({
  active,
  icon: Icon,
  title,
  description,
  theme,
  children,
}: {
  active: boolean;
  icon: typeof Package;
  title: string;
  description: React.ReactNode;
  theme: "emerald" | "violet";
  /** Rozszerzona zawartość renderowana TYLKO gdy karta jest aktywna —
   *  zawiera banner wybranego kartonu, KV grid wymiarów i przycisk edycji. */
  children?: React.ReactNode;
}) {
  const themeClasses = {
    emerald: {
      ringActive: "ring-2 ring-emerald-400 bg-emerald-50/70",
      iconBg: "bg-emerald-100 text-emerald-600",
      titleActive: "text-emerald-900",
      underline: "decoration-emerald-500",
      chipBg: "bg-emerald-100 text-emerald-700 ring-emerald-300",
    },
    violet: {
      ringActive: "ring-2 ring-violet-400 bg-violet-50/70",
      iconBg: "bg-violet-100 text-violet-600",
      titleActive: "text-violet-900",
      underline: "decoration-violet-500",
      chipBg: "bg-violet-100 text-violet-700 ring-violet-300",
    },
  }[theme];

  return (
    <Card
      className={cn(
        "transition-all overflow-hidden",
        // Aktywne: mocniejszy ring (3px) + colored bg + cień. Nieaktywne:
        // mocno wyszarzone (opacity-50 + grayscale) — wyraźnie sygnalizuje
        // że ten tryb nie jest używany.
        active
          ? cn(themeClasses.ringActive, "shadow-md ring-[3px]")
          : "ring-1 ring-slate-200 bg-slate-50/40 opacity-50 grayscale-[0.6]",
      )}
    >
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <div
            className={cn(
              "size-7 rounded-md grid place-items-center shrink-0",
              active ? themeClasses.iconBg : "bg-slate-200 text-slate-500",
            )}
          >
            <Icon className="size-3.5" />
          </div>
          <span
            className={cn(
              active
                ? cn(
                    themeClasses.titleActive,
                    "font-bold underline decoration-2 underline-offset-4",
                    themeClasses.underline,
                  )
                : "text-slate-500",
            )}
          >
            {title}
          </span>
          {active && (
            <span
              className={cn(
                "ml-auto inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded ring-1",
                themeClasses.chipBg,
              )}
            >
              ✓ wybrany
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        <p
          className={cn(
            "text-[11px] leading-snug",
            active ? "text-slate-700" : "text-muted-foreground",
          )}
        >
          {description}
        </p>
        {active && children}
      </CardContent>
    </Card>
  );
}

function KV({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}
