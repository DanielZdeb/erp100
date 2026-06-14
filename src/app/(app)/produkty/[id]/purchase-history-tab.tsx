import Link from "next/link";

import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  STATUS_LABEL,
  type OrderStatusT,
} from "@/lib/order-status";
import { STATUS_BADGE } from "@/lib/status-colors";

type Channel = {
  channel: string;
  salePricePln: number;
  commissionPct: number | null;
};

export type PurchaseHistoryRow = {
  itemId: string;
  orderId: string;
  orderNumber: string;
  orderStatus: OrderStatusT;
  orderCreatedAt: Date;
  quantity: number;
  unitPriceUsd: number | null;
  unitPriceCny: number | null;
  usdRate: number | null;
  cnyRate: number | null;
  channels: Channel[];
};

export function PurchaseHistoryTab({
  rows,
}: {
  rows: PurchaseHistoryRow[];
}) {
  if (rows.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground">
        Ten produkt nie pojawił się jeszcze w żadnym zamówieniu.
      </Card>
    );
  }

  const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
  const avgUsd = average(
    rows.filter((r) => r.unitPriceUsd && r.unitPriceUsd > 0).map((r) => r.unitPriceUsd!),
  );
  const avgCny = average(
    rows.filter((r) => r.unitPriceCny && r.unitPriceCny > 0).map((r) => r.unitPriceCny!),
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Stat label="Zamówień" value={String(rows.length)} />
        <Stat label="Sztuk razem" value={totalQty.toLocaleString("pl-PL")} />
        <Stat
          label="Średnia cena USD"
          value={avgUsd != null ? avgUsd.toFixed(2) + " $" : "—"}
        />
        <Stat
          label="Średnia cena CNY"
          value={avgCny != null ? avgCny.toFixed(2) + " ¥" : "—"}
        />
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Zamówienie</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ilość</TableHead>
              <TableHead className="text-right">Cena USD</TableHead>
              <TableHead className="text-right">Cena CNY</TableHead>
              <TableHead className="text-right">Kurs USD/CNY</TableHead>
              <TableHead className="text-right">Allegro</TableHead>
              <TableHead className="text-right">Sklep</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const allegro = r.channels.find((c) => c.channel === "Allegro");
              const sklep = r.channels.find((c) => c.channel === "Sklep");
              return (
                <TableRow key={r.itemId}>
                  <TableCell>
                    <Link
                      href={`/zamowienia/${r.orderId}`}
                      className="font-medium hover:underline"
                    >
                      {r.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {r.orderCreatedAt.toLocaleDateString("pl-PL")}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center rounded px-2 py-0.5 text-[10px] ring-1",
                        STATUS_BADGE[r.orderStatus],
                      )}
                    >
                      {STATUS_LABEL[r.orderStatus]}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.quantity.toLocaleString("pl-PL")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.unitPriceUsd != null
                      ? `${r.unitPriceUsd.toFixed(2)} $`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.unitPriceCny != null
                      ? `${r.unitPriceCny.toFixed(2)} ¥`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-[10px] text-muted-foreground">
                    {r.usdRate != null ? `$ ${r.usdRate.toFixed(4)}` : ""}
                    {r.cnyRate != null && r.usdRate != null && <br />}
                    {r.cnyRate != null ? `¥ ${r.cnyRate.toFixed(4)}` : ""}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {allegro
                      ? `${allegro.salePricePln.toFixed(2)} zł`
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {sklep
                      ? `${sklep.salePricePln.toFixed(2)} zł`
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-lg font-heading font-bold tabular-nums">{value}</div>
    </div>
  );
}

function average(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}
