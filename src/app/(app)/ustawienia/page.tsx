import Link from "next/link";
import {
  Building2,
  ChevronRight,
  Container,
  Handshake,
  Scissors,
  ShoppingBag,
  ToggleRight,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import {
  getDefaultContainerType,
  getFulfillmentSettings,
  getSaleChannelDefaults,
} from "@/server/system-settings";
import { getBrokerTiers } from "@/server/broker-commission";
import { getCompanyFeatureFlags } from "@/server/company-settings";
import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { cn } from "@/lib/utils";
import { ContainerSettingsForm } from "./container-settings-form";
import { CompanyInfoForm } from "./company-info-form";
import { FulfillmentForm } from "./fulfillment-form";
import { SaleChannelDefaultsForm } from "./sale-channel-defaults-form";
import { BrokerCommissionForm } from "./broker-commission-form";
import { FeaturesForm } from "./features-form";

export const dynamic = "force-dynamic";

export default async function UstawieniaPage() {
  const companyId = await getCurrentCompanyId();
  const [
    defaultContainerType,
    fulfillment,
    saleDefaults,
    brokerTiers,
    featureFlags,
    companyInfo,
  ] = await Promise.all([
    getDefaultContainerType(),
    getFulfillmentSettings(),
    getSaleChannelDefaults(),
    getBrokerTiers("Fullbax"),
    getCompanyFeatureFlags(),
    db.company.findUnique({
      where: { id: companyId },
      select: {
        name: true,
        street: true,
        postalCode: true,
        city: true,
        nip: true,
        krs: true,
        representativeName: true,
        deliveryAddress: true,
        deliveryAddressFabryka: true,
        deliveryAddressSzwalnia: true,
      },
    }),
  ]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-heading font-bold tracking-tight">
          Ustawienia
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Konfiguracja systemowa firmy. Każda sekcja jest zapisywana niezależnie.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {companyInfo && (
          <SettingsSection
            accent="indigo"
            icon={Building2}
            title="Dane firmy"
            description="Nazwa, adres, NIP, KRS, reprezentant — pokazują się na PDF zamówień."
          >
            <CompanyInfoForm initial={companyInfo} />
          </SettingsSection>
        )}

        <SettingsSection
          accent="indigo"
          icon={Container}
          title="Kontener importowy"
          description="Domyślny rozmiar kontenera używany przy nowym zamówieniu i jako referencja dla produktów LUZEM."
        >
          <ContainerSettingsForm defaultType={defaultContainerType} />
        </SettingsSection>

        <SettingsSection
          accent="amber"
          icon={Warehouse}
          title="Fulfillment / magazyn"
          description="Stawki auto-kalkulacji kosztów wysyłki i magazynowania per sztuka."
        >
          <FulfillmentForm initial={fulfillment} />
        </SettingsSection>

        <SettingsSection
          accent="emerald"
          icon={ShoppingBag}
          title="Domyślne wartości kanałów sprzedaży"
          description="Wartości startowe Allegro / Sklep — uzupełniane przy dodawaniu produktu do zamówienia."
        >
          <SaleChannelDefaultsForm initial={saleDefaults} />
        </SettingsSection>

        <SettingsSection
          accent="violet"
          icon={Handshake}
          title="Prowizja Fullbax (umowa z pośrednikiem)"
          description="Widełki prowizji z umowy ramowej. Auto-doliczane do zamówienia wg wartości towaru w USD × kurs."
        >
          <BrokerCommissionForm brokerName="Fullbax" tiers={brokerTiers} />
        </SettingsSection>

        <SettingsSection
          accent="slate"
          icon={ToggleRight}
          title="Funkcje firmy"
          description="Włącz / wyłącz moduły aplikacji w zakresie tej firmy."
        >
          <FeaturesForm
            initialComponentsEnabled={featureFlags.componentsEnabled}
          />
        </SettingsSection>

        <SettingsSection
          accent="indigo"
          icon={Scissors}
          title="Szablony wytycznych — Materiał na szarfy"
          description="Domyślne sekcje PDF dla każdego nowego zamówienia z modułu Materiał na szarfy. Edytuj raz — kopiują się przy tworzeniu zamówienia."
        >
          <Link
            href="/ustawienia/szablony-zamowien"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:text-indigo-900 hover:underline"
          >
            Otwórz edytor szablonów
            <ChevronRight className="size-4" />
          </Link>
        </SettingsSection>
      </div>
    </div>
  );
}

type Accent = "indigo" | "amber" | "emerald" | "violet" | "slate";

const ACCENT_THEME: Record<
  Accent,
  {
    ring: string;
    bgHeader: string;
    iconBg: string;
    iconColor: string;
    titleColor: string;
    descColor: string;
  }
> = {
  indigo: {
    ring: "ring-indigo-200",
    bgHeader: "bg-gradient-to-r from-indigo-50 to-indigo-100/40",
    iconBg: "bg-indigo-500",
    iconColor: "text-white",
    titleColor: "text-indigo-900",
    descColor: "text-indigo-700/80",
  },
  amber: {
    ring: "ring-amber-200",
    bgHeader: "bg-gradient-to-r from-amber-50 to-amber-100/40",
    iconBg: "bg-amber-500",
    iconColor: "text-white",
    titleColor: "text-amber-900",
    descColor: "text-amber-700/80",
  },
  emerald: {
    ring: "ring-emerald-200",
    bgHeader: "bg-gradient-to-r from-emerald-50 to-emerald-100/40",
    iconBg: "bg-emerald-500",
    iconColor: "text-white",
    titleColor: "text-emerald-900",
    descColor: "text-emerald-700/80",
  },
  violet: {
    ring: "ring-violet-200",
    bgHeader: "bg-gradient-to-r from-violet-50 to-fuchsia-100/40",
    iconBg: "bg-violet-500",
    iconColor: "text-white",
    titleColor: "text-violet-900",
    descColor: "text-violet-700/80",
  },
  slate: {
    ring: "ring-slate-200",
    bgHeader: "bg-gradient-to-r from-slate-50 to-slate-100/40",
    iconBg: "bg-slate-500",
    iconColor: "text-white",
    titleColor: "text-slate-900",
    descColor: "text-slate-700/80",
  },
};

function SettingsSection({
  accent,
  icon: Icon,
  title,
  description,
  children,
}: {
  accent: Accent;
  icon: LucideIcon;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const theme = ACCENT_THEME[accent];
  return (
    <section
      className={cn(
        "rounded-xl bg-card ring-1 shadow-sm overflow-hidden flex flex-col",
        theme.ring,
      )}
    >
      <header
        className={cn(
          "px-4 py-3 border-b flex items-start gap-3",
          theme.bgHeader,
        )}
      >
        <div
          className={cn(
            "size-9 rounded-lg grid place-items-center shrink-0 shadow-sm",
            theme.iconBg,
          )}
        >
          <Icon className={cn("size-4", theme.iconColor)} />
        </div>
        <div className="min-w-0 flex-1">
          <h2
            className={cn(
              "text-sm font-heading font-semibold tracking-tight",
              theme.titleColor,
            )}
          >
            {title}
          </h2>
          {description && (
            <p className={cn("text-[11px] mt-0.5", theme.descColor)}>
              {description}
            </p>
          )}
        </div>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
