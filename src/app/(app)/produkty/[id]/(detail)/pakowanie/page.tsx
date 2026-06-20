import { notFound } from "next/navigation";
import { Mail, Package, Ruler, Weight } from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { getProductFull } from "../../_lib/fetchers";
import { PreferredServicesPicker } from "../../_components/preferred-services-picker";
import { ExcludedServicesPicker } from "../../_components/excluded-services-picker";
import { EditPackagingButton } from "./_components/edit-packaging-dialog";
import { BundlePackagingPanel } from "./_components/bundle-packaging-panel";
import {
  computeBundleIndividualPackaging,
  type BundlePackagingBreakdown,
} from "@/lib/bundle-packaging";
import { priceAllServices } from "@/lib/courier-pricing";

export const dynamic = "force-dynamic";

export default async function PakowaniePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companyId = await getCurrentCompanyId();
  const [product, availableBoxes] = await Promise.all([
    getProductFull(id),
    // Biblioteka pudełek dla dialogu edycji — wszystkie nie-zbiorcze (BOX i POLY_BAG)
    db.shippingBox.findMany({
      where: { companyId, archived: false, isCollective: false },
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
      },
    }),
  ]);
  if (!product) notFound();

  const shippingPins = product.shippingBoxes.filter(
    (pb) => pb.purpose === "SHIPPING",
  );
  const hasShipping = shippingPins.length > 0;

  // Inferred shipping mode (analogicznie do wizard step 2):
  //   - FOLIOPAK  → SHIPPING pin packagingType=POLY_BAG
  //   - BOX       → SHIPPING pin packagingType=BOX
  //   - SAME_AS_IMPORT → brak SHIPPING + jest FACTORY (wysyłka w pudle z Chin)
  //   - null      → brak żadnego pudełka
  const factoryPins = product.shippingBoxes.filter(
    (pb) => pb.purpose === "FACTORY",
  );
  const inferredMode: "BOX" | "FOLIOPAK" | "SAME_AS_IMPORT" | null = hasShipping
    ? shippingPins.some((pb) => pb.box.packagingType === "POLY_BAG")
      ? "FOLIOPAK"
      : "BOX"
    : factoryPins.length > 0
      ? "SAME_AS_IMPORT"
      : null;

  const primarySh = pickPrimaryForCourier(product.shippingBoxes);
  const primaryBoxForPicker = primarySh
    ? {
        widthCm: primarySh.box.widthCm,
        heightCm: primarySh.box.heightCm,
        depthCm: primarySh.box.depthCm,
        weightKg: primarySh.box.weightKg,
      }
    : null;

  // Aktualnie przypisany SHIPPING box (jako primary jeśli istnieje)
  const currentShippingPin =
    shippingPins.find((p) => p.isPrimary) ?? shippingPins[0] ?? null;
  const currentShippingBoxId = currentShippingPin?.box.id ?? null;
  // Sztuk produktu w tym kartonie — fallback na legacy `product.unitsPerShippingBox`.
  const currentUnitsPerBox =
    currentShippingPin?.unitsPerBox ?? product.unitsPerShippingBox ?? null;
  // Aktualnie przypisany FACTORY box — używany przy preselect w trybie
  // SAME_AS_IMPORT.
  const currentFactoryBoxId = factoryPins[0]?.box.id ?? null;

  // Dla ZESTAW (produktu złożonego z komponentów) — inny UI: wybór trybu
  // SINGLE_CARTON vs INDIVIDUAL_PACKAGING + breakdown sumy paczek per komponent.
  if (product.compositionMode === "ZESTAW") {
    // Buduj input do helpera z componentów + ich primary SHIPPING box.
    // Fallback do FACTORY pinu — jeśli komponent przychodzi z Chin w swoim
    // pudle (FACTORY) i nie ma osobnego SHIPPING boxa, ten karton i tak jest
    // realny do wysyłki kurierem (produkt jest w nim). Bez tego fallbacka
    // komponenty typu „Nogi do stołu" które idą tylko w factory boxie
    // pokazywały „—" w kolumnach wysyłki, mimo że karton był ustawiony.
    const bundleInput = product.components.map((c) => {
      const pickPin = (purpose: "SHIPPING" | "FACTORY") =>
        c.component.shippingBoxes?.find(
          (b) => b.purpose === purpose && b.isPrimary,
        ) ??
        c.component.shippingBoxes?.find((b) => b.purpose === purpose) ??
        null;
      const shipPin = pickPin("SHIPPING") ?? pickPin("FACTORY") ?? null;
      return {
        componentId: c.component.id,
        componentName: c.component.name,
        componentCode: c.component.productCode,
        qtyPerSet: c.quantity,
        unitsPerBox:
          shipPin?.unitsPerBox ?? c.component.unitsPerShippingBox ?? null,
        primaryBox: shipPin?.box
          ? {
              id: shipPin.box.id,
              name: shipPin.box.name,
              widthCm: shipPin.box.widthCm,
              heightCm: shipPin.box.heightCm,
              depthCm: shipPin.box.depthCm,
              weightKg: shipPin.box.weightKg,
              purchasePricePln: shipPin.box.purchasePricePln,
            }
          : null,
      };
    });
    const breakdown = computeBundleIndividualPackaging(bundleInput);

    // Wzbogać każdy komponent breakdown o wycenę najtańszego kuriera.
    // Wyceniamy 1 paczkę (box.weightKg + component.weightKg). Mnożymy przez
    // packagesNeeded żeby uzyskać sumaryczny koszt wysyłki w zestawie.
    const componentsWithWeight = new Map(
      product.components.map((c) => [c.component.id, c.component.weightKg ?? 0]),
    );
    // Wykluczone usługi dla TEGO produktu (zestawu) — silnik nie powinien
    // ich brać pod uwagę przy wycenie żadnego z komponentów ani wielopaka.
    // Lista globalna na produkt; pojedyncze komponenty NIE mają osobnej
    // ekskluzji (decyzja sprzedażowa na poziomie zestawu).
    const excludedSet = new Set(product.excludedShippingServices);
    const excludedBrandSet = new Set(product.excludedShippingBrands);
    const isExcluded = (s: { serviceCode: string; brand: string }) =>
      excludedSet.has(s.serviceCode) || excludedBrandSet.has(s.brand);
    for (const cp of breakdown.components) {
      if (!cp.box) continue; // brak primary box → brak wyceny
      const componentWeight = componentsWithWeight.get(cp.componentId) ?? 0;
      // Waga paczki = box pusty + (waga komponentu × ile sztuk w pudle).
      // Np. 4 krzesła po 5 kg w pudle 0.5 kg → 4×5 + 0.5 = 20.5 kg/paczka.
      // Konserwatywnie: zakładamy że KAŻDA paczka jest pełna (unitsPerBox szt) —
      // dla ostatniej częściowej paczki to nadszacowanie, ale dla wyceny kuriera
      // typowy bracket wagowy się nie zmieni (a różnica jest minimalna).
      const pkgWeight =
        (cp.box.weightKg ?? 0) + componentWeight * cp.unitsPerBox;
      if (pkgWeight <= 0) continue;
      const services = priceAllServices(
        [
          {
            widthCm: cp.box.widthCm,
            heightCm: cp.box.heightCm,
            depthCm: cp.box.depthCm,
            weightKg: pkgWeight,
          },
        ],
        {},
      );
      const applicable = services
        .filter((s) => s.applicable)
        .filter((s) => !isExcluded(s));
      if (applicable.length === 0) continue;
      applicable.sort((a, b) => a.totalNetPln - b.totalNetPln);
      const cheapest = applicable[0];
      cp.shippingQuote = {
        cheapestServiceCode: cheapest.serviceCode,
        cheapestServiceLabel: cheapest.serviceLabel,
        cheapestBrand: cheapest.brand,
        perPackageNetto: cheapest.totalNetPln,
        perPackageBrutto: cheapest.totalGrossPln,
        reason: `Najtańsza z ${applicable.length} pasujących dla paczki ${cp.box.widthCm}×${cp.box.heightCm}×${cp.box.depthCm} cm · ${cp.unitsPerBox}× komponent (${componentWeight.toFixed(2)} kg) + pudło (${(cp.box.weightKg ?? 0).toFixed(2)} kg) = ${pkgWeight.toFixed(2)} kg`,
        packageDims: {
          w: cp.box.widthCm,
          h: cp.box.heightCm,
          d: cp.box.depthCm,
          weightKg: pkgWeight,
        },
      };
      cp.shippingCostTotal = cheapest.totalNetPln * cp.packagesNeeded;
    }

    // ── Wielopak — silnik widzi WSZYSTKIE paczki ze wszystkich komponentów
    // jako jedną przesyłkę. Bez umownej tabeli rabatów = matematycznie
    // równy sumie per-component (z dokładnością do round-off), ale przygotowuje
    // architekturę pod rabat skali. NST są wykluczone z wielopaka w realnych
    // umowach — gdy umowa dorobi się, robi się to w silniku per-serwis.
    const allPackages: {
      widthCm: number;
      heightCm: number;
      depthCm: number;
      weightKg: number;
    }[] = [];
    for (const cp of breakdown.components) {
      if (!cp.box) continue;
      const componentWeight = componentsWithWeight.get(cp.componentId) ?? 0;
      const pkgWeight =
        (cp.box.weightKg ?? 0) + componentWeight * cp.unitsPerBox;
      if (pkgWeight <= 0) continue;
      // Każdy komponent może wymagać >1 paczki (gdy qtyPerSet > unitsPerBox).
      for (let i = 0; i < cp.packagesNeeded; i++) {
        allPackages.push({
          widthCm: cp.box.widthCm,
          heightCm: cp.box.heightCm,
          depthCm: cp.box.depthCm,
          weightKg: pkgWeight,
        });
      }
    }
    let bundleShippingQuote: BundlePackagingBreakdown["bundleShippingQuote"] =
      null;
    if (allPackages.length > 0) {
      const bundleServices = priceAllServices(allPackages, {});
      const applicableBundle = bundleServices
        .filter((s) => s.applicable)
        .filter((s) => !isExcluded(s));
      if (applicableBundle.length > 0) {
        applicableBundle.sort((a, b) => a.totalNetPln - b.totalNetPln);
        const cheapestBundle = applicableBundle[0];
        bundleShippingQuote = {
          serviceCode: cheapestBundle.serviceCode,
          serviceLabel: cheapestBundle.serviceLabel,
          brand: cheapestBundle.brand,
          totalNetPln: cheapestBundle.totalNetPln,
          totalGrossPln: cheapestBundle.totalGrossPln,
          packageCount: allPackages.length,
          reason: `Wielopak ${allPackages.length} paczek wycenione w 1 wywołaniu silnika kuriera. Bez rabatu skali (umowa nie wgrana) — wynik = suma stawek per paczka.`,
        };
      }
    }
    breakdown.bundleShippingQuote = bundleShippingQuote;

    // ── Kalkulowana paczka dla zestawu — dla SINGLE_CARTON skladamy
    // 1 paczke (bundleShippingBox + suma wag komponentow × ich quantity).
    // Dla INDIVIDUAL_PACKAGING uzywamy NAJCIEZSZEJ paczki z breakdown
    // jako reprezentanta — bo picker pokazuje 1 wycene; cala kalkulacja
    // per-paczka jest juz w breakdown ponizej.
    const totalComponentWeight = product.components.reduce(
      (sum, c) => sum + (c.component.weightKg ?? 0) * c.quantity,
      0,
    );
    let bundlePrimaryBox: {
      widthCm: number;
      heightCm: number;
      depthCm: number;
      weightKg: number | null;
    } | null = null;
    let bundleProductWeight = 0;
    let bundlePackageLabel = "";
    if (
      product.bundleShippingMode === "SINGLE_CARTON" &&
      product.bundleShippingBox
    ) {
      bundlePrimaryBox = {
        widthCm: product.bundleShippingBox.widthCm,
        heightCm: product.bundleShippingBox.heightCm,
        depthCm: product.bundleShippingBox.depthCm,
        weightKg: product.bundleShippingBox.weightKg,
      };
      bundleProductWeight = totalComponentWeight;
      bundlePackageLabel = product.bundleShippingBox.name;
    } else if (product.bundleShippingMode === "INDIVIDUAL_PACKAGING") {
      // Najciezsza paczka z breakdown = reprezentant dla cenkowania.
      let heaviest: {
        widthCm: number;
        heightCm: number;
        depthCm: number;
        weightKg: number;
        boxWeightKg: number | null;
        boxName: string;
      } | null = null;
      const componentsWithWeight = new Map(
        product.components.map((c) => [
          c.component.id,
          c.component.weightKg ?? 0,
        ]),
      );
      for (const cp of breakdown.components) {
        if (!cp.box) continue;
        const cw = componentsWithWeight.get(cp.componentId) ?? 0;
        const pkgWeight = (cp.box.weightKg ?? 0) + cw * cp.unitsPerBox;
        if (!heaviest || pkgWeight > heaviest.weightKg) {
          heaviest = {
            widthCm: cp.box.widthCm,
            heightCm: cp.box.heightCm,
            depthCm: cp.box.depthCm,
            weightKg: pkgWeight,
            boxWeightKg: cp.box.weightKg,
            boxName: cp.box.name,
          };
        }
      }
      if (heaviest) {
        bundlePrimaryBox = {
          widthCm: heaviest.widthCm,
          heightCm: heaviest.heightCm,
          depthCm: heaviest.depthCm,
          weightKg: heaviest.boxWeightKg,
        };
        bundleProductWeight = heaviest.weightKg - (heaviest.boxWeightKg ?? 0);
        bundlePackageLabel = `${heaviest.boxName} (najcięższa z ${breakdown.totalPackagesPerSet})`;
      }
    }

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-heading font-semibold">
            Pakowanie zestawu
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Zestaw składa się z komponentów które już masz w magazynie. Wybierz
            tryb wysyłki: w 1 wspólnym kartonie lub każdy składnik w swoim
            pudełku.
          </p>
        </div>
        <BundlePackagingPanel
          product={{
            id: product.id,
            name: product.name,
            bundleShippingMode: product.bundleShippingMode ?? null,
            bundleShippingBoxId: product.bundleShippingBoxId ?? null,
            bundleShippingBox: product.bundleShippingBox
              ? {
                  id: product.bundleShippingBox.id,
                  name: product.bundleShippingBox.name,
                  internalCode: product.bundleShippingBox.internalCode,
                  widthCm: product.bundleShippingBox.widthCm,
                  heightCm: product.bundleShippingBox.heightCm,
                  depthCm: product.bundleShippingBox.depthCm,
                  weightKg: product.bundleShippingBox.weightKg,
                  purchasePricePln:
                    product.bundleShippingBox.purchasePricePln,
                }
              : null,
          }}
          breakdown={breakdown}
          availableBoxes={availableBoxes}
        />

        {/* Kalkulacja kuriera dla zestawu — analogicznie do widoku produktu */}
        <section className="space-y-3">
          <h3 className="text-sm font-heading font-semibold">
            Preferowane usługi kurierskie
          </h3>
          {bundlePrimaryBox ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg bg-gradient-to-r from-indigo-50 to-blue-50 ring-1 ring-indigo-200 p-3 space-y-2 h-fit">
                <div className="text-[10px] uppercase tracking-wide font-bold text-indigo-700">
                  Kalkulowana paczka
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-indigo-600 font-semibold">
                      <Ruler className="size-3" /> Wymiary pudełka
                    </div>
                    <div className="font-mono text-lg font-bold text-indigo-900 tabular-nums">
                      {bundlePrimaryBox.widthCm}×{bundlePrimaryBox.heightCm}×
                      {bundlePrimaryBox.depthCm}
                      <span className="text-xs font-normal text-indigo-700 ml-0.5">
                        cm
                      </span>
                    </div>
                    <div className="text-[10px] text-indigo-700/80 truncate">
                      {bundlePackageLabel}
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-indigo-600 font-semibold">
                      <Weight className="size-3" /> Waga paczki
                    </div>
                    <div className="font-mono text-lg font-bold text-indigo-900 tabular-nums">
                      {((bundlePrimaryBox.weightKg ?? 0) + bundleProductWeight).toFixed(2)}
                      <span className="text-xs font-normal text-indigo-700 ml-0.5">
                        kg
                      </span>
                    </div>
                    <div className="text-[10px] text-indigo-700/80">
                      pudełko {bundlePrimaryBox.weightKg ?? "?"} kg +{" "}
                      {product.bundleShippingMode === "SINGLE_CARTON"
                        ? "komponenty"
                        : "produkt"}{" "}
                      {bundleProductWeight.toFixed(2)} kg
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <PreferredServicesPicker
                  productId={product.id}
                  initialCodes={product.preferredShippingServices}
                  productWeightKg={bundleProductWeight}
                  primaryBox={bundlePrimaryBox}
                />
                <ExcludedServicesPicker
                  productId={product.id}
                  initialCodes={product.excludedShippingServices}
                  initialBrands={product.excludedShippingBrands}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-xs text-rose-800">
              ⚠ Brak kartonu / komponentów z pudełkami — kalkulacja kurierów
              niemożliwa. Wybierz karton w „Edytuj pakowanie zestawu" albo
              przypnij primary SHIPPING box do każdego komponentu.
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-heading font-semibold">
          Pakowanie wysyłkowe
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Krok 2 z wizarda produktu — wybierz w czym produkt jest wysyłany
          do klienta. Wybrany tryb wpływa na cenę kuriera i wagę paczki.
        </p>
      </div>

      {!inferredMode && (
        <div className="rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-xs px-3 py-2">
          ⚠ Nie wybrano trybu wysyłki — przypnij pudełko wysyłkowe (PL) albo
          karton z Chin (jako wysyłkowe).
        </div>
      )}

      {/* 2 kolumny: lewa = wybór trybu, prawa = pudełka + kurierzy */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LEWA: Tryb pakowania (3 karty stacked) */}
        <section className="space-y-3">
          <h3 className="text-sm font-heading font-semibold">
            Pakowanie wysyłkowe
          </h3>
          <div className="space-y-2.5">
            <ShippingModeCard
              active={inferredMode === "BOX"}
              icon={Package}
              title="Pudełko (PL)"
              description="Karton produkowany w Polsce — produkt jest przepakowywany przed wysyłką."
              theme="indigo"
              assigned={
                shippingPins.find((pb) => pb.box.packagingType === "BOX")
                  ?.box ?? null
              }
            />
            <ShippingModeCard
              active={inferredMode === "FOLIOPAK"}
              icon={Mail}
              title="Foliopak (PL)"
              description="Woreczek pocztowy produkowany w PL — produkt przyjeżdża z Chin osobno i jest przepakowywany."
              theme="rose"
              assigned={
                shippingPins.find((pb) => pb.box.packagingType === "POLY_BAG")
                  ?.box ?? null
              }
            />
            <ShippingModeCard
              active={inferredMode === "SAME_AS_IMPORT"}
              icon={Package}
              title="Ten sam co importowy"
              description="Wysyłka w tym samym kartonie który przyszedł z Chin — bez przepakowywania."
              theme="amber"
              assigned={factoryPins[0]?.box ?? null}
            />
          </div>
          {/* Przycisk edycji pakowania — bezpośrednio pod kafelkami trybów,
              żeby user widział od razu możliwość zmiany po obejrzeniu opcji. */}
          <div className="flex justify-center pt-2">
            <EditPackagingButton
              productId={product.id}
              productName={product.name}
              initialMode={inferredMode}
              initialShippingBoxId={currentShippingBoxId}
              initialFactoryBoxId={currentFactoryBoxId}
              initialUnitsPerBox={currentUnitsPerBox}
              availableBoxes={availableBoxes}
            />
          </div>
        </section>

        {/* PRAWA: Preferowane usługi kurierskie — z wyraźnym banner-em
            pokazującym wymiary i wagę paczki, która jest kalkulowana. */}
        <section className="space-y-3">
          <h3 className="text-sm font-heading font-semibold">
            Preferowane usługi kurierskie
          </h3>

          {/* Banner: rozmiar paczki + waga totalna (box + produkt) */}
          {primarySh ? (
            <div className="rounded-lg bg-gradient-to-r from-indigo-50 to-blue-50 ring-1 ring-indigo-200 p-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wide font-bold text-indigo-700">
                Kalkulowana paczka
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-indigo-600 font-semibold">
                    <Ruler className="size-3" /> Wymiary pudełka
                  </div>
                  <div className="font-mono text-lg font-bold text-indigo-900 tabular-nums">
                    {primarySh.box.widthCm}×{primarySh.box.heightCm}×
                    {primarySh.box.depthCm}
                    <span className="text-xs font-normal text-indigo-700 ml-0.5">
                      cm
                    </span>
                  </div>
                  <div className="text-[10px] text-indigo-700/80 truncate">
                    {primarySh.box.name}
                    {primarySh.purpose === "FACTORY" && (
                      <span className="ml-1 px-1 py-px rounded bg-amber-100 text-amber-800 ring-1 ring-amber-300 text-[9px] font-semibold">
                        z Chin
                      </span>
                    )}
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-indigo-600 font-semibold">
                    <Weight className="size-3" /> Waga paczki
                  </div>
                  <div className="font-mono text-lg font-bold text-indigo-900 tabular-nums">
                    {((primarySh.box.weightKg ?? 0) + (product.weightKg ?? 0)).toFixed(2)}
                    <span className="text-xs font-normal text-indigo-700 ml-0.5">
                      kg
                    </span>
                  </div>
                  <div className="text-[10px] text-indigo-700/80">
                    pudełko {primarySh.box.weightKg ?? "?"} kg + produkt{" "}
                    {product.weightKg ?? 0} kg
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-xs text-rose-800">
              ⚠ Brak pinniętego pudełka — kalkulacja kurierów niemożliwa.
            </div>
          )}

          <PreferredServicesPicker
            productId={product.id}
            initialCodes={product.preferredShippingServices}
            productWeightKg={product.weightKg}
            primaryBox={primaryBoxForPicker}
          />

          <ExcludedServicesPicker
            productId={product.id}
            initialCodes={product.excludedShippingServices}
            initialBrands={product.excludedShippingBrands}
          />
        </section>
      </div>
    </div>
  );
}

function ShippingModeCard({
  active,
  icon: Icon,
  title,
  description,
  theme,
  assigned,
}: {
  active: boolean;
  icon: typeof Package;
  title: string;
  description: string;
  theme: "indigo" | "rose" | "amber";
  assigned: {
    name: string;
    widthCm: number;
    heightCm: number;
    depthCm: number;
  } | null;
}) {
  const themeClasses = {
    indigo: {
      ringActive: "ring-2 ring-indigo-400 bg-indigo-50/70",
      iconBg: "bg-indigo-100 text-indigo-600",
      titleActive: "text-indigo-900",
    },
    rose: {
      ringActive: "ring-2 ring-rose-400 bg-rose-50/70",
      iconBg: "bg-rose-100 text-rose-600",
      titleActive: "text-rose-900",
    },
    amber: {
      ringActive: "ring-2 ring-amber-400 bg-amber-50/70",
      iconBg: "bg-amber-100 text-amber-600",
      titleActive: "text-amber-900",
    },
  }[theme];

  return (
    <Card
      className={cn(
        "transition-all overflow-hidden",
        // Aktywny: mocniejszy ring (3px) + cień. Nieaktywny: wyszarzony
        // (opacity-50 + grayscale-60) — sygnał że ten tryb nie jest używany.
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
                    "font-bold underline decoration-2 decoration-emerald-500 underline-offset-4",
                  )
                : "text-slate-500",
            )}
          >
            {title}
          </span>
          {active && (
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded ring-1 ring-emerald-300">
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
        {assigned && (
          <div className="rounded-md bg-white/60 ring-1 ring-slate-200 px-2.5 py-1.5">
            <div className="text-sm font-semibold text-slate-800 tabular-nums">
              {assigned.widthCm}×{assigned.heightCm}×{assigned.depthCm}
              <span className="text-[10px] text-slate-500 font-normal ml-0.5">
                cm
              </span>
            </div>
            <div className="text-[10px] text-slate-500 truncate">
              {assigned.name}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Wybiera primary box do kalkulacji kurierskiej.
 * Preferowane: SHIPPING isPrimary → SHIPPING any → FACTORY isPrimary → FACTORY.
 * FACTORY też się liczy bo gdy produkt nie ma osobnego pudła wysyłkowego,
 * jest wysyłany w pudle fabrycznym (Chinach).
 */
function pickPrimaryForCourier<
  T extends { purpose: string; isPrimary: boolean },
>(boxes: T[]): T | null {
  return (
    boxes.find((b) => b.purpose === "SHIPPING" && b.isPrimary) ??
    boxes.find((b) => b.purpose === "SHIPPING") ??
    boxes.find((b) => b.purpose === "FACTORY" && b.isPrimary) ??
    boxes.find((b) => b.purpose === "FACTORY") ??
    null
  );
}
