"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Building2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateCompanyInfoAction } from "@/server/company-settings";

export type CompanyInfoInitial = {
  name: string;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  nip: string | null;
  krs: string | null;
  representativeName: string | null;
  deliveryAddress: string | null;
  deliveryAddressFabryka: string | null;
  deliveryAddressSzwalnia: string | null;
};

export function CompanyInfoForm({
  initial,
}: {
  initial: CompanyInfoInitial;
}) {
  const [name, setName] = useState(initial.name);
  const [street, setStreet] = useState(initial.street ?? "");
  const [postalCode, setPostalCode] = useState(initial.postalCode ?? "");
  const [city, setCity] = useState(initial.city ?? "");
  const [nip, setNip] = useState(initial.nip ?? "");
  const [krs, setKrs] = useState(initial.krs ?? "");
  const [representativeName, setRepresentativeName] = useState(
    initial.representativeName ?? "",
  );
  const [deliveryAddress, setDeliveryAddress] = useState(
    initial.deliveryAddress ?? "",
  );
  const [deliveryAddressFabryka, setDeliveryAddressFabryka] = useState(
    initial.deliveryAddressFabryka ?? "",
  );
  const [deliveryAddressSzwalnia, setDeliveryAddressSzwalnia] = useState(
    initial.deliveryAddressSzwalnia ?? "",
  );
  const [pending, startTransition] = useTransition();

  const dirty =
    name !== initial.name ||
    street !== (initial.street ?? "") ||
    postalCode !== (initial.postalCode ?? "") ||
    city !== (initial.city ?? "") ||
    nip !== (initial.nip ?? "") ||
    krs !== (initial.krs ?? "") ||
    representativeName !== (initial.representativeName ?? "") ||
    deliveryAddress !== (initial.deliveryAddress ?? "") ||
    deliveryAddressFabryka !== (initial.deliveryAddressFabryka ?? "") ||
    deliveryAddressSzwalnia !== (initial.deliveryAddressSzwalnia ?? "");

  function save() {
    startTransition(async () => {
      try {
        await updateCompanyInfoAction({
          name,
          street,
          postalCode,
          city,
          nip,
          krs,
          representativeName,
          deliveryAddress,
          deliveryAddressFabryka,
          deliveryAddressSzwalnia,
        });
        toast.success("Zapisano dane firmy");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <section className="space-y-4">
      <header className="flex items-center gap-2">
        <Building2 className="size-4 text-indigo-600" />
        <h3 className="text-sm font-semibold">Dane firmy</h3>
      </header>
      <p className="text-xs text-muted-foreground">
        Te dane pojawią się na PDF zamówień, fakturach i innych dokumentach
        wewnętrznych firmy.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field
          id="name"
          label="Nazwa firmy"
          value={name}
          onChange={setName}
          placeholder="np. ACRO4F SP. Z O.O."
          required
        />
        <Field
          id="representativeName"
          label="Reprezentant"
          value={representativeName}
          onChange={setRepresentativeName}
          placeholder="Imię i nazwisko osoby reprezentującej"
        />
        <Field
          id="street"
          label="Ulica i nr"
          value={street}
          onChange={setStreet}
          placeholder="np. Stefana Batorego 18/108"
        />
        <div className="grid grid-cols-[100px_1fr] gap-3">
          <Field
            id="postalCode"
            label="Kod pocztowy"
            value={postalCode}
            onChange={setPostalCode}
            placeholder="00-000"
          />
          <Field
            id="city"
            label="Miasto"
            value={city}
            onChange={setCity}
            placeholder="np. Warszawa"
          />
        </div>
        <Field
          id="nip"
          label="NIP"
          value={nip}
          onChange={setNip}
          placeholder="np. 7011175385"
        />
        <Field
          id="krs"
          label="KRS"
          value={krs}
          onChange={setKrs}
          placeholder="np. 0001069642"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="deliveryAddressFabryka" className="text-xs font-medium">
            Adres dostawy — FABRYKA (Chiny → PL)
          </Label>
          <p className="text-[10px] text-muted-foreground -mt-1">
            Dokąd fabryka ma wysłać materiały / produkty. Pojawi się na PDF
            zamówień typu fabryka.
          </p>
          <textarea
            id="deliveryAddressFabryka"
            value={deliveryAddressFabryka}
            onChange={(e) => setDeliveryAddressFabryka(e.target.value)}
            placeholder={"np. ACRO4F sp. z o.o.\nMagazyn — ul. Towarowa 5\n02-100 Warszawa"}
            rows={4}
            className="w-full text-sm rounded-md ring-1 ring-slate-300 px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none resize-y"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="deliveryAddressSzwalnia" className="text-xs font-medium">
            Adres dostawy — SZWALNIA / KRAJALNIA
          </Label>
          <p className="text-[10px] text-muted-foreground -mt-1">
            Dokąd szwalnia ma wysłać gotowe produkty. Pojawi się na PDF
            zamówień typu szwalnia.
          </p>
          <textarea
            id="deliveryAddressSzwalnia"
            value={deliveryAddressSzwalnia}
            onChange={(e) => setDeliveryAddressSzwalnia(e.target.value)}
            placeholder={"np. ACRO4F sp. z o.o.\nStefana Batorego 18/108\n02-591 Warszawa"}
            rows={4}
            className="w-full text-sm rounded-md ring-1 ring-slate-300 px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none resize-y"
          />
        </div>
      </div>

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer hover:text-slate-700">
          Legacy: adres dostawy (fallback gdy specyficzne puste)
        </summary>
        <div className="space-y-1.5 mt-2">
          <p className="text-[10px] -mt-1">
            Używany na starych PDF-ach. Nowe pola powyżej go nadpisują dla danego
            typu zamówienia. Możesz zostawić puste jeśli wypełniłeś oba powyższe.
          </p>
          <textarea
            id="deliveryAddress"
            value={deliveryAddress}
            onChange={(e) => setDeliveryAddress(e.target.value)}
            placeholder={"Legacy adres (fallback)"}
            rows={3}
            className="w-full text-sm rounded-md ring-1 ring-slate-300 px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none resize-y"
          />
        </div>
      </details>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          onClick={save}
          disabled={!dirty || pending || !name.trim()}
          className="gap-2"
        >
          {pending ? "Zapisuję…" : "Zapisz dane firmy"}
        </Button>
      </div>
    </section>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 text-sm"
      />
    </div>
  );
}
