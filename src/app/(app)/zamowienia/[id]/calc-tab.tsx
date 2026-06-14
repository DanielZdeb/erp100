"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { ContainerResult } from "@/lib/kalkulacje";

type Order = {
  cnyToPlnRate: number | null;
  usdToPlnRate: number | null;
  vatRate: number | null;
  containerSizeM3: number | null;
  items: Array<{
    product: { name: string; productCode: string; unitsPerBox: number | null };
  }>;
};

export function CalcTab({
  order,
  calc,
}: {
  order: Order;
  calc: ContainerResult;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Założenia</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Cell label="Kurs juana → PLN" value={order.cnyToPlnRate?.toString() ?? "—"} />
            <Cell label="Kurs dolara → PLN" value={order.usdToPlnRate?.toString() ?? "—"} />
            <Cell label="VAT" value={`${((order.vatRate ?? 0) * 100).toFixed(0)}%`} />
            <Cell label="Pojemność kontenera" value={`${order.containerSizeM3 ?? 28} m³`} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kontener</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Cell label="Suma kosztów" value={fmtPln(calc.totalCostsPln)} />
            <Cell label="Koszt 1 m³" value={fmtPln(calc.costPerM3)} />
            <Cell label="Wykorzystane CBM" value={`${calc.usedCbm.toFixed(2)} m³`} />
            <Cell label="Wypełnienie" value={`${(calc.fillRate * 100).toFixed(0)}%`} />
            <Cell label="Wartość towarów" value={fmtPln(calc.totalGoodsValuePln)} />
            <Cell label="Razem z logistyką (landed)" value={fmtPln(calc.totalLandedPln)} />
            <Cell label="Przychód (założony)" value={fmtPln(calc.totalRevenuePln)} />
            <Cell label="Zysk" value={fmtPln(calc.totalProfitPln)} />
            <Cell
              label="Marża"
              value={
                calc.totalRevenuePln > 0
                  ? `${calc.marginPct.toFixed(1)}%`
                  : "—"
              }
            />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pozycje — szczegółowo</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {calc.items.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center">
              Dodaj pozycje na zakładce Pozycje.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produkt</TableHead>
                  <TableHead className="text-right">Kartonów</TableHead>
                  <TableHead className="text-right">Sztuk</TableHead>
                  <TableHead className="text-right">CBM</TableHead>
                  <TableHead className="text-right">Cena netto/szt</TableHead>
                  <TableHead className="text-right">Logistyka /szt</TableHead>
                  <TableHead className="text-right">Landed /szt</TableHead>
                  <TableHead className="text-right">Przychód</TableHead>
                  <TableHead className="text-right">Zysk</TableHead>
                  <TableHead className="text-right">Mies. sprzedaż</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calc.items.map((it, idx) => {
                  const product = order.items[idx]?.product;
                  const upb = product?.unitsPerBox;
                  return (
                    <TableRow key={idx}>
                      <TableCell>
                        <div className="font-medium text-sm">
                          {product?.name ?? "?"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <code>{product?.productCode}</code>
                          {upb && <span> · {upb} szt/krt</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {upb ? (it.quantity / upb).toFixed(0) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {it.quantity}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {it.totalCbm.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {it.unitPriceNettoPln.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {(it.allocatedLogisticsPln / Math.max(1, it.quantity)).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {it.landedCostPerUnitPln.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtPln(it.itemTotalRevenue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtPln(it.itemTotalProfit)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {it.estimatedSalesMonths != null ? (
                          `${it.estimatedSalesMonths.toFixed(1)} mc`
                        ) : (
                          <Badge variant="secondary">brak prognozy</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function fmtPln(n: number): string {
  return `${n.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} zł`;
}
