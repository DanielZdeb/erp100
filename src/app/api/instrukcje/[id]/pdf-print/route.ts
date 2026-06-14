/**
 * GET /api/instrukcje/[id]/pdf-print
 *
 * PDF instrukcji generowany przez **headless Chrome (Puppeteer)** — renderuje
 * tę samą stronę `/produkty/instrukcje/[id]/drukuj` co użyłby user przy
 * ręcznym Ctrl+P, ale automatycznie ustawia format papieru (A4/A5/A6), bez
 * marginesów, bez nagłówków/stopek przeglądarki.
 *
 * Wynik: **pixel-perfect vector PDF** w wybranym formacie, identyczny z tym
 * co widać w edytorze (bo używa tego samego silnika renderowania).
 *
 * Tradeoff vs react-pdf endpoint (`/api/instrukcje/[id]/pdf`):
 *  + identyczny layout z edytorem (Chrome rendering)
 *  + Pełne wsparcie italic + bold-italic dla wszystkich fontów
 *  + Brak własnego font-registration
 *  − Wolniejszy (~3-5s vs <1s)
 *  − Wymaga Chromium (już zainstalowane przez `puppeteer`)
 */
import { NextResponse } from "next/server";
import puppeteer from "puppeteer";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { headers } from "next/headers";

const PAGE_SIZE_MM: Record<string, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  A6: { w: 105, h: 148 },
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
  }

  const { id } = await params;
  const companyId = await getCurrentCompanyId();

  // Sprawdź własność + pobierz pageSize + name
  const manual = await db.productManual.findFirst({
    where: { id, companyId },
    select: { id: true, name: true, pageSize: true },
  });
  if (!manual) {
    return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
  }

  const dims = PAGE_SIZE_MM[manual.pageSize];

  // Construct print URL używając host z aktualnego requesta
  const hdrs = await headers();
  const host = hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const printUrl = `${proto}://${host}/produkty/instrukcje/${id}/drukuj`;

  // Przekaż auth cookie do headless browser żeby ta strona się otworzyła
  // bez redirectu do /login.
  const cookieHeader = req.headers.get("cookie") ?? "";

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
    const page = await browser.newPage();

    // Viewport ustawiony na rozmiar strony — bez tego default 800x600 może
    // ścinać layout (treść poza viewportem nie renderuje się w PDF).
    // Pikselowe wymiary przy 96 DPI: A4 = 794×1123, A5 = 559×794, A6 = 397×559.
    const mmToPx = (mm: number) => Math.round((mm / 25.4) * 96);
    await page.setViewport({
      width: mmToPx(dims.w),
      height: mmToPx(dims.h),
      deviceScaleFactor: 2,
    });

    // Console event — przekaż logi ze strony drukowania do konsoli serwera
    // (pomocne przy debugowaniu „dlaczego puste arkusze")
    page.on("console", (msg) => {
      console.log("[print-page]", msg.type(), msg.text());
    });
    page.on("pageerror", (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[print-page] pageerror:", msg);
    });

    // Set cookies — parse from header i wstaw do nowej strony.
    // WAŻNE: dla cookies typu `Secure` (production HTTPS) musimy ustawić
    // też secure=true i sameSite, inaczej Chrome je odrzuci i strona
    // zostanie zredirectowana do /login → puste arkusze w PDF.
    if (cookieHeader) {
      const hostname = host.split(":")[0];
      const isHttps = proto === "https";
      const cookies = cookieHeader
        .split(";")
        .map((c) => {
          const idx = c.indexOf("=");
          if (idx < 0) return null;
          const name = c.slice(0, idx).trim();
          const value = c.slice(idx + 1).trim();
          if (!name) return null;
          return {
            name,
            value,
            domain: hostname,
            path: "/",
            httpOnly: false,
            secure: isHttps,
            sameSite: "Lax" as const,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      if (cookies.length > 0) await page.setCookie(...cookies);
    }

    // Navigate — `load` zamiast networkidle0 (które może wisieć w nieskończoność
    // przy long-polling/HMR/autosave). Po load explicit czekamy na selektor +
    // fonty + obrazy w osobnych krokach, co daje przewidywalne zachowanie.
    await page.goto(printUrl, {
      waitUntil: "load",
      timeout: 30000,
    });

    // Puppeteer domyślnie emuluje `screen` — wymuszamy `print` żeby
    // @media print + .no-print zostały zastosowane przed page.pdf().
    await page.emulateMediaType("print");

    // Sprawdź czy nie ma redirectu na login (auth fail = blank pages w PDF)
    const finalUrl = page.url();
    if (finalUrl.includes("/login") || finalUrl.includes("/signin")) {
      console.error(
        "[pdf-print] Auth redirect — Puppeteer trafił na login zamiast print page. finalUrl:",
        finalUrl,
      );
      throw new Error("Brak autoryzacji w Puppeteer — sprawdź cookies.");
    }

    // Czekaj aż TipTap-rendered .print-page elementy się zhydratują
    // (React 19 hoistuje <style> children — bez tego pages renderują się
    // bez stylów = puste arkusze).
    await page.waitForSelector(".print-page", { timeout: 10000 });

    // Czekaj na fonty (Roboto/PlusJakartaSans z Google Fonts) — bez tego
    // tekst może się renderować po snapshocie PDF jako pusty.
    await page
      .evaluate(
        () =>
          (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts
            ?.ready ?? Promise.resolve(),
      )
      .catch(() => undefined);

    // Czekaj aż wszystkie <img> się załadują (logo na okładce, obrazki w treści).
    // Bez tego cover page = pusta (logo jeszcze nie pobrany w momencie page.pdf()).
    await page.evaluate(async () => {
      const imgs = Array.from(document.images);
      await Promise.all(
        imgs.map((img) =>
          img.complete && img.naturalHeight > 0
            ? Promise.resolve()
            : new Promise<void>((res) => {
                img.onload = () => res();
                img.onerror = () => res();
              }),
        ),
      );
    });

    // Diagnostyka: zlicz strony i sprawdź czy mają treść
    const diag = await page.evaluate(() => {
      const pages = Array.from(document.querySelectorAll(".print-page"));
      return {
        count: pages.length,
        sizes: pages.map((p) => {
          const r = (p as HTMLElement).getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) };
        }),
        bodyTextLength: document.body.innerText.length,
      };
    });
    console.log("[pdf-print] diag:", JSON.stringify(diag));

    if (diag.count === 0) {
      throw new Error(
        "Brak żadnej strony do wydrukowania — strona /drukuj nie wyrenderowała .print-page elementów",
      );
    }

    // Mały bufor na ostateczne dopasowanie layoutu po fontach/obrazach
    await new Promise((resolve) => setTimeout(resolve, 250));

    // Generuj PDF z wymuszonym formatem (dimensions w mm, marginesy 0).
    // Chrome respektuje te parametry zawsze — niezależnie od @page CSS rule.
    const pdfBuffer = await page.pdf({
      width: `${dims.w}mm`,
      height: `${dims.h}mm`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: false, // używamy explicit width/height
      displayHeaderFooter: false, // brak nagłówków/stopek Chrome
    });

    const safeName = manual.name.replace(/[^A-Za-z0-9_-]/g, "_") || "instrukcja";
    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${safeName}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("Puppeteer PDF error:", e);
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Błąd generowania PDF",
      },
      { status: 500 },
    );
  } finally {
    if (browser) await browser.close();
  }
}
