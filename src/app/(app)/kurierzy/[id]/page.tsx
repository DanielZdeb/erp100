import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { tryGetCurrentCompanyId } from "@/lib/tenant";
import { CourierHeaderEdit } from "./header-edit";
import { RatesTab } from "./rates-tab";
import { ContractsTab } from "./contracts-tab";
import { RecommendedProductsTab } from "./recommended-tab";

export const dynamic = "force-dynamic";

export default async function KurierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companyId = await tryGetCurrentCompanyId();
  const courier = await db.courier.findFirst({
    where: { id, companyId },
    include: {
      rates: { orderBy: [{ isPaczkomat: "desc" }, { serviceType: "asc" }] },
      contracts: { orderBy: { startsAt: "desc" } },
      recommendations: {
        include: {
          product: {
            select: { id: true, name: true, productCode: true },
          },
        },
      },
    },
  });

  if (!courier) notFound();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/kurierzy"
            className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
          >
            <ArrowLeft className="size-3" />
            Kurierzy
          </Link>
          <div className="flex items-center gap-3 mt-1">
            <h1 className="text-3xl font-heading font-bold tracking-tight">
              {courier.name}
            </h1>
            <Badge variant="secondary">
              {courier.active ? "aktywny" : "nieaktywny"}
            </Badge>
          </div>
        </div>
        <CourierHeaderEdit courier={courier} />
      </div>

      <Tabs defaultValue="rates">
        <TabsList>
          <TabsTrigger value="rates">Stawki ({courier.rates.length})</TabsTrigger>
          <TabsTrigger value="contracts">
            Umowy ({courier.contracts.length})
          </TabsTrigger>
          <TabsTrigger value="products">
            Produkty ({courier.recommendations.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rates" className="pt-4">
          <RatesTab courierId={courier.id} rates={courier.rates} />
        </TabsContent>
        <TabsContent value="contracts" className="pt-4">
          <ContractsTab courierId={courier.id} contracts={courier.contracts} />
        </TabsContent>
        <TabsContent value="products" className="pt-4">
          <RecommendedProductsTab
            recommendations={courier.recommendations}
          />
        </TabsContent>
      </Tabs>

      {courier.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notatki</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">
            {courier.notes}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
