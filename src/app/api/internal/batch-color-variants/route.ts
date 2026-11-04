// Jednorazowy batch endpoint do generowania wariantow kolorystycznych:
// bierze N zdjec ze zrodlowego produktu (po sortOrder) i dla kazdego produktu
// docelowego (o productCode zaczynajacym sie od prefixu) wywoluje AI copy —
// pierwszy ref = zrodlowe zdjecie (kompozycja), drugi ref = primary target
// (probka koloru materialu). Prompt opisuje zmiane kolor materialu.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { copyImagesFromProductAction } from "@/server/product-photos";

const BodySchema = z.object({
  sourceProductCode: z.string().min(1),
  sourceSortOrders: z.array(z.number().int().nonnegative()).min(1).max(20),
  targetCodePrefix: z.string().min(1),
  excludeTargetCodes: z.array(z.string()).optional().default([]),
  prompt: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Nieautoryzowany" }, { status: 401 });
  }
  const companyId = await getCurrentCompanyId();
  if (!companyId) {
    return NextResponse.json({ ok: false, error: "Brak companyId" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.message }, { status: 400 });
  }
  const body = parsed.data;

  const source = await db.product.findFirst({
    where: { companyId, productCode: body.sourceProductCode },
    select: { id: true },
  });
  if (!source) {
    return NextResponse.json({ ok: false, error: `Zrodlo nie istnieje: ${body.sourceProductCode}` }, { status: 404 });
  }

  const sourceImages = await db.productImage.findMany({
    where: {
      productId: source.id,
      archived: false,
      stage: null,
      status: "READY",
      sortOrder: { in: body.sourceSortOrders },
    },
    select: { id: true, sortOrder: true },
    orderBy: { sortOrder: "asc" },
  });
  if (sourceImages.length === 0) {
    return NextResponse.json({ ok: false, error: "Brak zrodlowych zdjec o podanych sortOrder" }, { status: 404 });
  }
  const sourceImageIds = sourceImages.map((i) => i.id);

  const targets = await db.product.findMany({
    where: {
      companyId,
      productCode: { startsWith: body.targetCodePrefix },
      NOT: {
        productCode: {
          in: [body.sourceProductCode, ...body.excludeTargetCodes],
        },
      },
    },
    select: { id: true, productCode: true },
    orderBy: { productCode: "asc" },
  });

  const results: Array<{ productCode: string; ok: boolean; createdCount?: number; error?: string }> = [];

  for (const target of targets) {
    const primary = await db.productImage.findFirst({
      where: {
        productId: target.id,
        archived: false,
        stage: null,
        status: "READY",
      },
      orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      select: { url: true },
    });
    if (!primary) {
      results.push({ productCode: target.productCode, ok: false, error: "brak primary referencji koloru" });
      continue;
    }
    const r = await copyImagesFromProductAction(
      target.id,
      sourceImageIds,
      "ai",
      { prompt: body.prompt, extraRefUrls: [primary.url] },
    );
    if (r.ok) {
      results.push({ productCode: target.productCode, ok: true, createdCount: r.createdCount });
    } else {
      results.push({ productCode: target.productCode, ok: false, error: r.error });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return NextResponse.json({
    ok: true,
    sourceProductCode: body.sourceProductCode,
    sourceImageCount: sourceImages.length,
    targetsCount: targets.length,
    successCount: okCount,
    results,
  });
}
