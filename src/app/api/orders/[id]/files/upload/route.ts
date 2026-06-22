import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { uploadFile } from "@/lib/storage";

const statusEnum = z.enum([
  "PLANOWANE",
  "DOGADYWANE",
  "PRODUKOWANE",
  "WYPRODUKOWANE",
  "WYSLANE",
  "ODEBRANE",
  "W_MAGAZYNIE",
]);

/**
 * POST /api/orders/[id]/files/upload
 * multipart/form-data: file, slot?, status?, label?, notes?
 *
 * Identyczna logika jak uploadOrderFileAction (server-costs.ts) — ale jako
 * endpoint HTTP, zeby klient mogl uzyc XMLHttpRequest z upload.onprogress
 * (server actions w Next.js nie wspieraja progress callbacks).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await params;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = session.user as { id: string };

  const order = await db.importOrder.findUnique({
    where: { id: orderId },
    select: { id: true },
  });
  if (!order) {
    return NextResponse.json(
      { error: "Zamówienie nie istnieje." },
      { status: 404 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? `Bład parsowania formularza: ${e.message}`
            : "Bład parsowania formularza",
      },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Brak pliku." }, { status: 400 });
  }

  const statusRaw = formData.get("status");
  const status =
    statusRaw && typeof statusRaw === "string" && statusRaw !== ""
      ? statusEnum.parse(statusRaw)
      : null;
  const slotRaw = formData.get("slot");
  const slot =
    typeof slotRaw === "string" && slotRaw.trim() !== ""
      ? slotRaw.trim()
      : null;
  const labelRaw = formData.get("label");
  const label =
    typeof labelRaw === "string" && labelRaw.trim() !== ""
      ? labelRaw.trim()
      : null;
  const notes = formData.get("notes");

  try {
    const uploaded = await uploadFile(file, {
      folder: `orders/${orderId}`,
    });

    const created = await db.orderFile.create({
      data: {
        orderId,
        url: uploaded.url,
        filename: uploaded.filename,
        contentType: uploaded.contentType,
        sizeBytes: uploaded.sizeBytes,
        status,
        slot,
        label,
        uploadedById: user.id,
        notes: typeof notes === "string" ? notes.trim() || null : null,
      },
      select: { id: true },
    });

    revalidatePath(`/zamowienia/${orderId}`);
    return NextResponse.json({ ok: true, fileId: created.id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Bład uploadu" },
      { status: 500 },
    );
  }
}
