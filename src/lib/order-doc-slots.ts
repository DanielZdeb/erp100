import {
  Anchor,
  ClipboardCheck,
  FileBadge,
  FilePlus,
  FileSignature,
  FileSpreadsheet,
  FileText,
  Landmark,
  PackageOpen,
  Receipt,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export type DocSlot = {
  id: string;
  label: string;
  icon: LucideIcon;
  custom?: boolean;
};

export type DocCategory = {
  id: string;
  label: string;
  slots: DocSlot[];
};

export const DOC_CATEGORIES: DocCategory[] = [
  {
    id: "ORDER",
    label: "Dokumenty zamówienia",
    slots: [
      { id: "ORDER_DOCS", label: "Dokumenty zamówień / wycen", icon: FileText },
      { id: "PROFORMA", label: "Proforma ostateczna", icon: FileSignature },
      { id: "QC_REPORT", label: "Raport QC", icon: ClipboardCheck },
      { id: "CUSTOM_ORDER", label: "Dokument własny", icon: FilePlus, custom: true },
    ],
  },
  {
    id: "CUSTOMS",
    label: "Dokumenty odprawa",
    slots: [
      { id: "BOL", label: "Bill of Lading", icon: Anchor },
      { id: "PACKING_LIST", label: "Packing List", icon: PackageOpen },
      { id: "SAD", label: "SAD", icon: FileBadge },
      { id: "CUSTOM_CUSTOMS", label: "Dokument własny", icon: FilePlus, custom: true },
    ],
  },
  {
    id: "ACCOUNTING",
    label: "Dokumenty księgowe",
    slots: [
      { id: "COMMERCIAL_INVOICE", label: "Commercial invoice (faktura za towar)", icon: FileSpreadsheet },
      { id: "SHIPPING_INVOICE", label: "Shipping invoice (fracht)", icon: Receipt },
      { id: "CUSTOMS_FEE", label: "Cło", icon: Landmark },
      { id: "TERMINAL_COSTS", label: "Koszty terminalowe", icon: Warehouse },
      { id: "CUSTOM_ACCOUNTING", label: "Dokument własny", icon: FilePlus, custom: true },
    ],
  },
];

const SLOT_INDEX = new Map<string, DocSlot>();
for (const cat of DOC_CATEGORIES) {
  for (const s of cat.slots) SLOT_INDEX.set(s.id, s);
}

export function getDocSlot(id: string | null | undefined): DocSlot | undefined {
  if (!id) return undefined;
  return SLOT_INDEX.get(id);
}
