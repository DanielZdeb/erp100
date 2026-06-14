import { redirect } from "next/navigation";
import {
  AtSign,
  Briefcase,
  Building2,
  CalendarClock,
  Hash,
  LogOut,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { signOutAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";

import { CompanyBranding } from "./_components/company-branding";

export const dynamic = "force-dynamic";

export default async function MojeKontoPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      createdAt: true,
      company: {
        select: {
          id: true,
          name: true,
          slug: true,
          nip: true,
          address: true,
          active: true,
          websiteUrl: true,
          logoColorUrl: true,
          logoBwOnBlackUrl: true,
          logoBwOnWhiteUrl: true,
        },
      },
    },
  });
  if (!user) redirect("/login");

  const roleLabel = user.role === "ADMIN" ? "Administrator" : "Pracownik";
  const initials = (user.name || user.email)
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const createdAtFmt = new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "long",
  }).format(new Date(user.createdAt));

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="size-16 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white grid place-items-center text-xl font-semibold shadow-sm shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-heading font-semibold tracking-tight truncate">
            {user.name ?? user.email}
          </h1>
          <p className="text-sm text-muted-foreground truncate">
            {user.email}
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold ring-1 bg-indigo-50 text-indigo-800 ring-indigo-200">
            <ShieldCheck className="size-3" />
            {roleLabel}
          </div>
        </div>
      </div>

      {/* Dane konta */}
      <section className="rounded-lg ring-1 ring-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 border-b bg-slate-50/80 text-[11px] uppercase tracking-wide font-semibold text-slate-600">
          Dane konta
        </div>
        <dl className="divide-y divide-slate-100">
          <InfoRow
            icon={<UserIcon className="size-4" />}
            label="Imię i nazwisko"
            value={user.name ?? "—"}
          />
          <InfoRow
            icon={<AtSign className="size-4" />}
            label="Email"
            value={user.email}
            mono
          />
          <InfoRow
            icon={<ShieldCheck className="size-4" />}
            label="Rola"
            value={roleLabel}
          />
          <InfoRow
            icon={<CalendarClock className="size-4" />}
            label="Konto utworzone"
            value={createdAtFmt}
          />
        </dl>
      </section>

      {/* Firma */}
      {user.company ? (
        <section className="rounded-lg ring-1 ring-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-slate-50/80 text-[11px] uppercase tracking-wide font-semibold text-slate-600 flex items-center gap-2">
            <Briefcase className="size-3.5" />
            Firma
          </div>
          <dl className="divide-y divide-slate-100">
            <InfoRow
              icon={<Building2 className="size-4" />}
              label="Nazwa"
              value={user.company.name}
            />
            <InfoRow
              icon={<Hash className="size-4" />}
              label="NIP"
              value={user.company.nip ?? "—"}
              mono
            />
            {user.company.address && (
              <InfoRow
                icon={<Building2 className="size-4" />}
                label="Adres / dane"
                value={user.company.address}
              />
            )}
          </dl>
          {/* Branding firmy — strona internetowa + logosy. Edytowalne. */}
          <CompanyBranding
            initialWebsite={user.company.websiteUrl}
            initialLogoColor={user.company.logoColorUrl}
            initialLogoBwOnBlack={user.company.logoBwOnBlackUrl}
            initialLogoBwOnWhite={user.company.logoBwOnWhiteUrl}
          />
        </section>
      ) : (
        <div className="rounded-lg ring-1 ring-amber-200 bg-amber-50/60 p-4 text-sm text-amber-900">
          Twoje konto nie jest przypisane do żadnej firmy.
        </div>
      )}

      {/* Wyloguj */}
      <section className="rounded-lg ring-1 ring-rose-200 bg-rose-50/40 p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-rose-900">Wyloguj się</div>
          <div className="text-xs text-rose-700">
            Zakończy bieżącą sesję i przeniesie do ekranu logowania.
          </div>
        </div>
        <form action={signOutAction}>
          <Button
            type="submit"
            variant="outline"
            className="border-rose-300 text-rose-700 hover:bg-rose-100 hover:text-rose-800 gap-2"
          >
            <LogOut className="size-4" />
            Wyloguj
          </Button>
        </form>
      </section>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="px-4 py-2.5 flex items-center gap-3">
      <div className="size-7 rounded grid place-items-center bg-slate-100 text-slate-500 shrink-0">
        {icon}
      </div>
      <dt className="text-xs text-slate-500 w-32 shrink-0 uppercase tracking-wide">
        {label}
      </dt>
      <dd
        className={
          mono ? "text-sm font-mono text-slate-800 truncate" : "text-sm text-slate-800 truncate"
        }
      >
        {value}
      </dd>
    </div>
  );
}
