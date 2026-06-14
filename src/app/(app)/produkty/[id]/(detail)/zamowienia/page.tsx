import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import type { OrderStatusT } from "@/lib/order-status";

import { getProductHeader } from "../../_lib/fetchers";
import {
  PurchaseHistoryTab,
  type PurchaseHistoryRow,
} from "../../purchase-history-tab";

export const dynamic = "force-dynamic";

export default async function ZamowieniaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companyId = await getCurrentCompanyId();
  const [product, orderItems] = await Promise.all([
    getProductHeader(id),
    db.importOrderItem.findMany({
      where: { productId: id, order: { companyId } },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            createdAt: true,
            cnyToPlnRate: true,
            usdToPlnRate: true,
          },
        },
        saleChannels: {
          select: {
            channel: true,
            salePricePln: true,
            commissionPct: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!product) notFound();

  const rows: PurchaseHistoryRow[] = orderItems.map((it) => ({
    itemId: it.id,
    orderId: it.order.id,
    orderNumber: it.order.orderNumber,
    orderStatus: it.order.status as OrderStatusT,
    orderCreatedAt: it.order.createdAt,
    quantity: it.quantity,
    unitPriceUsd: it.unitPriceUsd,
    unitPriceCny: it.unitPriceCny,
    usdRate: it.usdToPlnRate ?? it.order.usdToPlnRate,
    cnyRate: it.cnyToPlnRate ?? it.order.cnyToPlnRate,
    channels: it.saleChannels.map((ch) => ({
      channel: ch.channel,
      salePricePln: ch.salePricePln,
      commissionPct: ch.commissionPct,
    })),
  }));

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-heading font-semibold">
        Historia zamówień importowych
      </h2>
      <PurchaseHistoryTab rows={rows} />
    </div>
  );
}
