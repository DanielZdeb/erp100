/* eslint-disable jsx-a11y/alt-text */
/**
 * PDF zamówienia PL — kolorowy, z listą pozycji + wizualizacją belek.
 *
 * Polskie znaki: Roboto rejestrowane raz na proces (pdf-font.ts).
 */

import {
  Document,
  type DocumentProps,
  Font,
  Image as PdfImage,
  Page,
  Path,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import React, { type ReactElement } from "react";

import {
  type BoltsAnalysis,
  type ColorBoltSummary,
  colorMeta,
  DEFAULT_BOLT_LENGTH_M,
  DEFAULT_MIN_BOLTS_PER_COLOR,
  parseMaterialSku,
} from "@/lib/material-bolts";
import { loadRobotoFontsAll } from "@/app/(app)/zamowienia/[id]/pdf-font";

// ─── Font registration ─────────────────────────────────────────────

let fontsRegistered = false;
function toDataUri(buf: ArrayBuffer): string {
  const b64 = Buffer.from(buf).toString("base64");
  return `data:font/ttf;base64,${b64}`;
}

export async function ensureFontsRegistered(): Promise<void> {
  if (fontsRegistered) return;
  const { regular, bold } = await loadRobotoFontsAll();
  Font.register({
    family: "Roboto",
    fonts: [
      { src: toDataUri(regular) },
      { src: toDataUri(bold), fontWeight: 700 },
    ],
  });
  fontsRegistered = true;
}

/** Wektorowa reprezentacja kodu kreskowego — listę path'ów sparsowanych
 *  z bwip-js toSVG. Pozwala na nieskończony zoom bez rasteryzacji. */
export type BarcodePath = {
  d: string;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
};
export type BarcodeVector = {
  viewBox: { x: number; y: number; width: number; height: number };
  paths: BarcodePath[];
};

type ItemForPdf = {
  sku: string;
  name: string;
  ean: string | null;
  quantity: number;
  unitPricePln: number;
  pricePerMeterPln: number | null;
  lengthM: number | null;
  imageFsPath: string | null;
  barcodeVector: BarcodeVector | null;
};

type BuyerInfo = {
  name: string;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  nip: string | null;
  krs: string | null;
  representativeName: string | null;
  /** Adres dostawy (magazyn/odbiór) — pokazywany w prawej kolumnie cover'a. */
  deliveryAddress: string | null;
};

/** Sekcja „Wytyczne i składanie zamówienia" — jedna strona PDF. */
export type PdfSectionForPdf = {
  title: string;
  content: string | null;
  /** Pre-loaded base64 data URIs (loadImage robi to w route handlerze). */
  images: Array<{ dataUri: string; alt: string | null }>;
};

/** Tryb generowania PDF:
 *  - `krajalnia`: pełne zamówienie z listą pozycji (SKU/ilości) i pełnym
 *    rozkładem cięcia per belka. Dla wewnętrznej krajalni + szwalni.
 *  - `fabryka`: bez listy pozycji, bez rozkładu cięcia — tylko zbiorcza
 *    ilość belek per kolor (fabryka produkuje belki w jednym kolorze,
 *    nie cięte; cięciem zajmuje się krajalnia).
 */
export type OrderPlPdfMode = "krajalnia" | "fabryka";

type OrderPlPdfProps = {
  orderNumber: string;
  orderName: string | null;
  createdAt: Date;
  companyName: string;
  /** Logo firmy (base64 data URI). Renderowane fixed w prawym górnym
   *  rogu każdej strony — branding na każdym dokumencie. */
  companyLogoDataUri: string | null;
  buyer: BuyerInfo;
  pdfDescription: string | null;
  /** Strony między okładką a listą pozycji. */
  sections: PdfSectionForPdf[];
  items: ItemForPdf[];
  bolts: BoltsAnalysis;
  /** Mapa color (SKU suffix, np. "BLACK") → kod fabryczny koloru z produktu
   *  (np. „RAL 6018"). Wykorzystywana w tabeli FactoryBoltsSummary. Brak wpisu
   *  = pusta komórka „—" w kolumnie. */
  colorCodes?: Record<string, string>;
  /** Default: krajalnia (zachowuje stare zachowanie). */
  mode?: OrderPlPdfMode;
};

const COLORS = {
  primary: "#4338ca",
  primaryLight: "#eef2ff",
  text: "#0f172a",
  muted: "#64748b",
  border: "#cbd5e1",
  borderLight: "#e2e8f0",
  bgLight: "#f8fafc",
};

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 9,
    color: COLORS.text,
    fontFamily: "Roboto",
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
    paddingBottom: 8,
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  h1: {
    fontSize: 18,
    fontWeight: 700,
    color: COLORS.primary,
  },
  sub: {
    fontSize: 9,
    color: COLORS.muted,
    marginTop: 2,
  },
  meta: {
    fontSize: 8,
    color: COLORS.muted,
    textAlign: "right",
  },
  metaBold: {
    fontSize: 10,
    fontWeight: 700,
    color: COLORS.text,
    textAlign: "right",
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
    padding: 6,
    marginTop: 10,
    marginBottom: 6,
  },
  thead: {
    flexDirection: "row",
    backgroundColor: COLORS.primary,
    color: "#fff",
    paddingHorizontal: 4,
    paddingVertical: 5,
    fontSize: 8,
    fontWeight: 700,
  },
  colorGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 4,
    marginTop: 4,
    borderLeftWidth: 4,
  },
  colorChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 9,
    fontWeight: 700,
    marginRight: 6,
  },
  colorGroupStats: {
    fontSize: 8,
    color: COLORS.muted,
    flexGrow: 1,
  },
  colorGroupBolts: {
    fontSize: 10,
    fontWeight: 700,
    color: "#fff",
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 6,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.borderLight,
  },
  itemRowAlt: {
    backgroundColor: COLORS.bgLight,
  },
  itemImg: {
    width: 24,
    height: 24,
    marginRight: 8,
    borderWidth: 0.5,
    borderColor: COLORS.border,
  },
  itemSku: {
    fontFamily: "Courier",
    fontSize: 9,
    fontWeight: 700,
    flexGrow: 1,
  },
  itemQty: {
    fontSize: 10,
    fontWeight: 700,
    width: 60,
    textAlign: "right",
  },
  itemPerPiece: {
    fontSize: 10,
    fontWeight: 700,
    width: 60,
    textAlign: "right",
    color: COLORS.muted,
  },
  itemMeters: {
    fontSize: 11,
    fontWeight: 700,
    width: 70,
    textAlign: "right",
    color: COLORS.primary,
  },
  itemBarcode: {
    width: 110,
    height: 28,
    marginLeft: 6,
  },
  // ─── Belki ───
  colorBoltSection: {
    marginTop: 8,
    borderLeftWidth: 4,
    borderLeftStyle: "solid",
    paddingLeft: 6,
    paddingTop: 4,
    paddingBottom: 6,
  },
  colorHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  colorStats: {
    fontSize: 8,
    color: COLORS.muted,
  },
  boltRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 1,
    paddingHorizontal: 2,
    marginBottom: 0,
    fontSize: 8,
  },
  boltStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  boltLabel: {
    width: 36,
    fontWeight: 700,
    color: COLORS.text,
    fontSize: 9,
    marginRight: 6,
  },
  boltBar: {
    flexDirection: "row",
    flexGrow: 1,
    height: 18,
    borderRadius: 3,
    overflow: "hidden",
  },
  boltSeg: {
    height: "100%",
    color: "#fff",
    fontSize: 7,
    fontWeight: 700,
    textAlign: "center",
    paddingTop: 5,
    borderRightWidth: 0.8,
    borderRightColor: "#ffffff",
  },
  boltWaste: {
    backgroundColor: COLORS.bgLight,
    fontSize: 7,
    color: COLORS.muted,
    textAlign: "center",
    paddingTop: 5,
  },
  boltUsage: {
    width: 48,
    textAlign: "right",
    fontSize: 9,
    fontWeight: 700,
    color: COLORS.muted,
    paddingLeft: 6,
  },
  boltUsageFull: {
    color: "#059669", // emerald-600
  },
  totalBox: {
    marginTop: 10,
    backgroundColor: COLORS.primary,
    color: "#fff",
    padding: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: 700,
  },
  totalValue: {
    fontSize: 12,
    fontWeight: 700,
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 30,
    right: 30,
    fontSize: 7,
    color: COLORS.muted,
    textAlign: "center",
  },
  // ─── Cover page (strona 1) ───
  coverPage: {
    padding: 40,
    fontSize: 10,
    color: COLORS.text,
    fontFamily: "Roboto",
  },
  coverTitle: {
    fontSize: 28,
    fontWeight: 700,
    color: COLORS.primary,
    marginBottom: 4,
  },
  coverSubtitle: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 24,
  },
  coverMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.borderLight,
    marginBottom: 4,
  },
  coverMetaLabel: {
    fontSize: 9,
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  coverMetaValue: {
    fontSize: 11,
    fontWeight: 700,
    color: COLORS.text,
  },
  coverSectionLabel: {
    fontSize: 9,
    color: "#fff",
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 18,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 2,
    fontWeight: 700,
  },
  buyerCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    padding: 14,
    backgroundColor: COLORS.bgLight,
  },
  buyerName: {
    fontSize: 14,
    fontWeight: 700,
    color: COLORS.text,
    marginBottom: 4,
  },
  buyerLine: {
    fontSize: 10,
    color: COLORS.text,
    marginBottom: 2,
  },
  buyerSmall: {
    fontSize: 9,
    color: COLORS.muted,
    marginTop: 6,
  },
  descBox: {
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 4,
    padding: 14,
    minHeight: 120,
    fontSize: 10,
    lineHeight: 1.5,
    color: COLORS.text,
  },
  descPlaceholder: {
    fontSize: 9,
    color: COLORS.muted,
  },
  // ─── Bolt readability (per-length counts) ───
  boltLengthsBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
    marginBottom: 6,
  },
  boltLengthChip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 0.8,
    borderColor: COLORS.border,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: "#fff",
    fontSize: 8,
  },
  boltLengthChipQty: {
    fontWeight: 700,
    color: COLORS.primary,
  },
  // ─── Logo firmy fixed w prawym górnym rogu każdej strony ───
  fixedLogo: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 80,
    height: 32,
    objectFit: "contain",
  },
  // ─── Sekcje (Wytyczne i składanie zamówienia) ───
  sectionPage: {
    padding: 40,
    fontSize: 11,
    color: COLORS.text,
    fontFamily: "Roboto",
  },
  sectionTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
    marginBottom: 14,
  },
  sectionPageOrder: {
    fontSize: 9,
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionPageTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: COLORS.primary,
    marginBottom: 14,
  },
  sectionPageParagraph: {
    fontSize: 11,
    color: COLORS.text,
    lineHeight: 1.55,
    marginBottom: 6,
  },
  // ~90% przestrzeni roboczej strony A4 (po odjęciu paddingów, nagłówka,
  // tytułu i krótkiej treści). 650pt zostawia minimum miejsca na header
  // strony i tytuł sekcji, a obraz wypełnia praktycznie całą resztę kartki.
  sectionPageImagesWrap: {
    marginTop: 12,
    height: 650,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignContent: "stretch",
  },
  sectionPageImage: {
    flexBasis: "48%",
    flexGrow: 1,
    minHeight: 220,
    borderWidth: 0.5,
    borderColor: COLORS.border,
    objectFit: "contain",
  },
  sectionPageSingleImage: {
    width: "100%",
    height: "100%",
    borderWidth: 0.5,
    borderColor: COLORS.border,
    objectFit: "contain",
  },
});

function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString("pl-PL");
}


/** Wyciąga kolor (z SKU) dla pozycji — używamy do grupowania w tabeli. */
function colorFromItem(it: ItemForPdf): string {
  const parsed = parseMaterialSku(it.sku);
  return parsed?.color ?? "ZZZ";
}

export function OrderPlPdf(
  props: OrderPlPdfProps,
): ReactElement<DocumentProps> {
  // Grupuj pozycje po kolorze (alfabetycznie), w grupie po długości rosnąco.
  const grouped = new Map<string, ItemForPdf[]>();
  for (const it of props.items) {
    const color = colorFromItem(it);
    const arr = grouped.get(color) ?? [];
    arr.push(it);
    grouped.set(color, arr);
  }
  const colorGroups = Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([color, items]) => ({
      color,
      items: items.sort(
        (a, b) => (a.lengthM ?? 0) - (b.lengthM ?? 0),
      ),
    }));

  const totalQty = props.items.reduce((s, it) => s + it.quantity, 0);
  const totalMeters = props.items.reduce(
    (s, it) => s + it.quantity * (it.lengthM ?? 0),
    0,
  );
  // Mapa color → ilość użytych belek (z analizy belek).
  const boltsByColor = new Map(
    props.bolts.byColor.map((c) => [c.color, c.boltsUsed]),
  );

  const buyer = props.buyer;
  const buyerAddress1 = buyer.street ?? "";
  const buyerAddress2 = [buyer.postalCode, buyer.city]
    .filter(Boolean)
    .join(" ");

  return (
    <Document>
      {/* ───────── Strona 1 — okładka: zamawiający + opis zamówienia ───────── */}
      <Page size="A4" style={styles.coverPage}>
        {props.companyLogoDataUri && (
          <PdfImage
            src={props.companyLogoDataUri}
            style={styles.fixedLogo}
            fixed
          />
        )}
        <Text style={styles.coverTitle}>Zamówienie {props.orderNumber}</Text>
        <Text style={styles.coverSubtitle}>
          {props.orderName ?? "Produkcja z Polski"}
        </Text>

        <View style={styles.coverMetaRow}>
          <Text style={styles.coverMetaLabel}>Numer zamówienia</Text>
          <Text style={styles.coverMetaValue}>{props.orderNumber}</Text>
        </View>
        <View style={styles.coverMetaRow}>
          <Text style={styles.coverMetaLabel}>Data wystawienia</Text>
          <Text style={styles.coverMetaValue}>
            {fmtDate(props.createdAt)}
          </Text>
        </View>
        <View style={styles.coverMetaRow}>
          <Text style={styles.coverMetaLabel}>Liczba pozycji</Text>
          <Text style={styles.coverMetaValue}>{props.items.length}</Text>
        </View>
        <View style={styles.coverMetaRow}>
          <Text style={styles.coverMetaLabel}>Łącznie materiału</Text>
          <Text style={styles.coverMetaValue}>
            {totalMeters.toFixed(0)} m · {totalQty} szt
          </Text>
        </View>

        <View
          style={{
            flexDirection: "row",
            gap: 14,
            marginBottom: 8,
          }}
        >
          {/* LEWA KOLUMNA — Zamawiający */}
          <View style={{ flex: 1 }}>
            <Text style={styles.coverSectionLabel}>Zamawiający</Text>
            <View style={styles.buyerCard}>
              <Text style={styles.buyerName}>{buyer.name}</Text>
              {buyerAddress1 ? (
                <Text style={styles.buyerLine}>{buyerAddress1}</Text>
              ) : null}
              {buyerAddress2 ? (
                <Text style={styles.buyerLine}>{buyerAddress2}</Text>
              ) : null}
              {(buyer.nip || buyer.krs) && (
                <Text style={styles.buyerSmall}>
                  {buyer.nip ? `NIP: ${buyer.nip}` : ""}
                  {buyer.nip && buyer.krs ? "   ·   " : ""}
                  {buyer.krs ? `KRS: ${buyer.krs}` : ""}
                </Text>
              )}
              {buyer.representativeName ? (
                <Text style={styles.buyerSmall}>
                  Reprezentant: {buyer.representativeName}
                </Text>
              ) : null}
            </View>
          </View>

          {/* PRAWA KOLUMNA — Adres dostawy */}
          <View style={{ flex: 1 }}>
            <Text style={styles.coverSectionLabel}>Adres dostawy</Text>
            <View style={styles.buyerCard}>
              {buyer.deliveryAddress ? (
                buyer.deliveryAddress.split(/\r?\n/).map((line, i) => (
                  <Text
                    key={i}
                    style={i === 0 ? styles.buyerName : styles.buyerLine}
                  >
                    {line}
                  </Text>
                ))
              ) : (
                <Text style={styles.descPlaceholder}>
                  Brak adresu dostawy — uzupełnij w Ustawienia → Dane firmy.
                </Text>
              )}
            </View>
          </View>
        </View>

        <Text style={styles.coverSectionLabel}>Opis zamówienia</Text>
        <View style={styles.descBox}>
          {props.pdfDescription ? (
            <Text>{props.pdfDescription}</Text>
          ) : (
            <Text style={styles.descPlaceholder}>
              Brak opisu — można uzupełnić w zakładce zamówienia w polu
              „Opis zamówienia (strona 1 PDF)".
            </Text>
          )}
        </View>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `${props.companyName} · Zamówienie ${props.orderNumber} · Strona ${pageNumber} z ${totalPages}`
          }
          fixed
        />
      </Page>

      {/* ───────── Strony „Wytyczne i składanie zamówienia" ─────────
          Każda sekcja = osobna strona PDF. Pojawiają się między
          okładką a listą pozycji. */}
      {props.sections.map((section, idx) => (
        <SectionPage
          key={idx}
          index={idx}
          total={props.sections.length}
          section={section}
          orderNumber={props.orderNumber}
          companyName={props.companyName}
          companyLogoDataUri={props.companyLogoDataUri}
        />
      ))}

      {/* ───────── Strona pozycje + belki (po sekcjach) ───────── */}
      <Page size="A4" style={styles.page}>
        {props.companyLogoDataUri && (
          <PdfImage
            src={props.companyLogoDataUri}
            style={styles.fixedLogo}
            fixed
          />
        )}
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.h1}>Zamówienie {props.orderNumber}</Text>
            <Text style={styles.sub}>
              {props.orderName ?? "Produkcja z Polski"}
            </Text>
          </View>
          <View>
            <Text style={styles.metaBold}>{props.companyName}</Text>
            <Text style={styles.meta}>
              Data: {fmtDate(props.createdAt)}
            </Text>
          </View>
        </View>

        {/* Tryb FABRYKA pomija listę pozycji — fabryka produkuje belki w
            jednym kolorze, nie cięte. Sekcja FactoryBoltsSummary renderuje
            tylko zbiorczą ilość belek per kolor (BEZ ROZKŁADU CIĘCIA). */}
        {props.mode === "fabryka" && (
          <FactoryBoltsSummary bolts={props.bolts} colorCodes={props.colorCodes ?? {}} />
        )}

        {props.mode !== "fabryka" && (
          <>
        {/* Pozycje zamówienia — pogrupowane po kolorze */}
        <Text style={styles.sectionTitle}>POZYCJE ZAMÓWIENIA</Text>
        <View style={styles.thead}>
          <Text style={{ width: 32 }}></Text>
          <Text style={{ flexGrow: 1 }}>SKU</Text>
          <Text style={{ width: 60, textAlign: "right" }}>m/szt</Text>
          <Text style={{ width: 60, textAlign: "right" }}>Ilość</Text>
          <Text style={{ width: 70, textAlign: "right" }}>Razem (m)</Text>
          <Text style={{ width: 110, textAlign: "center", marginLeft: 6 }}>
            EAN
          </Text>
        </View>

        {colorGroups.map((group) => {
          const meta = colorMeta(group.color);
          const groupMeters = group.items.reduce(
            (s, it) => s + it.quantity * (it.lengthM ?? 0),
            0,
          );
          const groupQty = group.items.reduce((s, it) => s + it.quantity, 0);
          const boltsCount = boltsByColor.get(group.color) ?? 0;
          return (
            <View key={group.color} wrap={false}>
              <View
                style={[
                  styles.colorGroupHeader,
                  {
                    borderLeftColor: meta.hex,
                    backgroundColor: meta.hex + "15",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.colorChip,
                    {
                      backgroundColor: meta.hex,
                      color:
                        meta.textOnBg === "light" ? "#fff" : "#0f172a",
                    },
                  ]}
                >
                  {meta.label.toUpperCase()} ({group.color})
                </Text>
                <Text style={styles.colorGroupStats}>
                  {group.items.length} pozycji · {groupQty} szt ·{" "}
                  {groupMeters.toFixed(0)} m
                </Text>
                {boltsCount > 0 && (
                  <Text style={styles.colorGroupBolts}>
                    {boltsCount} {boltsCount === 1 ? "belka" : "belek"}
                  </Text>
                )}
              </View>
              {group.items.map((it, idx) => {
                const meters = it.quantity * (it.lengthM ?? 0);
                return (
                  <View
                    key={it.sku + idx}
                    style={[
                      styles.itemRow,
                      ...(idx % 2 === 1 ? [styles.itemRowAlt] : []),
                    ]}
                  >
                    {it.imageFsPath ? (
                      <PdfImage style={styles.itemImg} src={it.imageFsPath} />
                    ) : (
                      <View style={styles.itemImg} />
                    )}
                    <Text style={styles.itemSku}>{it.sku}</Text>
                    <Text style={styles.itemPerPiece}>
                      {it.lengthM != null ? `${it.lengthM} m` : "—"}
                    </Text>
                    <Text style={styles.itemQty}>{it.quantity} szt</Text>
                    <Text style={styles.itemMeters}>
                      {meters.toFixed(0)} m
                    </Text>
                    {it.barcodeVector ? (
                      <BarcodeSvg
                        vector={it.barcodeVector}
                        style={styles.itemBarcode}
                      />
                    ) : (
                      <View style={styles.itemBarcode} />
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}

        {/* Suma */}
        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>
            Razem: {totalQty} szt z {props.items.length} pozycji
          </Text>
          <Text style={styles.totalValue}>
            {totalMeters.toFixed(0)} m materiału
          </Text>
        </View>

        {/* Belki per kolor — tylko w trybie krajalnia (pełny rozkład cięcia) */}
        {props.bolts.byColor.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>
              ROZKŁAD CIĘCIA — BELKI (po {DEFAULT_BOLT_LENGTH_M} m, min{" "}
              {DEFAULT_MIN_BOLTS_PER_COLOR}/kolor)
            </Text>
            {props.bolts.byColor.map((c) => (
              <BoltColorSection key={c.color} summary={c} />
            ))}
          </>
        )}
          </>
        )}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `${props.companyName} · Zamówienie ${props.orderNumber} · Strona ${pageNumber} z ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}

/**
 * Sekcja FABRYKA — zbiorcze podsumowanie belek per kolor. Bez rozkładu
 * cięcia (paska z segmentami) — fabryka produkuje belki w jednym kolorze,
 * długość pełna 98 m, bez cięć. Cięciem zajmuje się krajalnia.
 */
function FactoryBoltsSummary({
  bolts,
  colorCodes,
}: {
  bolts: BoltsAnalysis;
  colorCodes: Record<string, string>;
}) {
  const totalBolts = bolts.byColor.reduce((s, c) => s + c.boltsUsed, 0);
  const totalMeters = totalBolts * DEFAULT_BOLT_LENGTH_M;
  return (
    <View>
      <Text style={styles.sectionTitle}>BELKI DO WYTWORZENIA</Text>
      <Text style={{ fontSize: 10, color: COLORS.muted, marginBottom: 12 }}>
        Materiał o szerokości 150 cm, długość belki: {DEFAULT_BOLT_LENGTH_M} m.
        Każda belka jednolitego koloru, bez cięcia (cięciem zajmuje się
        krajalnia).
      </Text>

      {/* Tabela: KOLOR | LICZBA BELEK | ŁĄCZNIE METRÓW */}
      <View
        style={{
          flexDirection: "row",
          backgroundColor: COLORS.primary,
          paddingHorizontal: 6,
          paddingVertical: 6,
          fontSize: 9,
          fontWeight: 700,
          color: "#fff",
        }}
      >
        <Text style={{ flexGrow: 1 }}>KOLOR</Text>
        <Text style={{ width: 110 }}>KOD KOLORU</Text>
        <Text style={{ width: 80, textAlign: "right" }}>LICZBA BELEK</Text>
        <Text style={{ width: 90, textAlign: "right" }}>ŁĄCZNIE (m)</Text>
      </View>

      {bolts.byColor.map((c, idx) => {
        const meta = colorMeta(c.color);
        const meters = c.boltsUsed * DEFAULT_BOLT_LENGTH_M;
        return (
          <View
            key={c.color}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 6,
              paddingVertical: 8,
              borderBottomWidth: 0.5,
              borderBottomColor: COLORS.borderLight,
              backgroundColor: idx % 2 === 1 ? COLORS.bgLight : "transparent",
            }}
          >
            <Text
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                marginRight: 8,
                fontSize: 11,
                fontWeight: 700,
                backgroundColor: meta.hex,
                color: meta.textOnBg === "light" ? "#fff" : "#0f172a",
              }}
            >
              {meta.label.toUpperCase()}
            </Text>
            <Text style={{ fontSize: 10, color: COLORS.muted, flexGrow: 1 }}>
              ({c.color})
            </Text>
            <Text
              style={{
                width: 110,
                fontSize: 10,
                fontFamily: "Courier",
                fontWeight: 700,
                color: COLORS.text,
              }}
            >
              {colorCodes[c.color] ?? "—"}
            </Text>
            <Text
              style={{
                width: 80,
                textAlign: "right",
                fontSize: 14,
                fontWeight: 700,
                color: COLORS.primary,
              }}
            >
              {c.boltsUsed}
            </Text>
            <Text
              style={{
                width: 90,
                textAlign: "right",
                fontSize: 12,
                fontWeight: 700,
                color: COLORS.text,
              }}
            >
              {meters.toFixed(0)} m
            </Text>
          </View>
        );
      })}

      {/* Suma */}
      <View
        style={{
          ...styles.totalBox,
          marginTop: 16,
        }}
      >
        <Text style={styles.totalLabel}>
          Razem: {totalBolts} {totalBolts === 1 ? "belka" : "belek"} ·{" "}
          {bolts.byColor.length}{" "}
          {bolts.byColor.length === 1 ? "kolor" : "kolory"}
        </Text>
        <Text style={styles.totalValue}>
          {totalMeters.toFixed(0)} m materiału
        </Text>
      </View>
    </View>
  );
}

function BoltColorSection({ summary }: { summary: ColorBoltSummary }) {
  const meta = colorMeta(summary.color);
  const minBolts = Math.max(DEFAULT_MIN_BOLTS_PER_COLOR, summary.boltsUsed);
  const displayed = summary.bolts.slice(0, minBolts);

  // Zsumuj wszystkie cięcia per długość w tym kolorze — pokaż jako chipy
  // (np. "4m × 8", "6m × 3", "7m × 2") nad rozkładem belek. Łatwiej
  // zinwentaryzować materiał bez liczenia segmentów wzrokowo.
  const cutsByLength = new Map<number, number>();
  for (const bolt of summary.bolts) {
    for (const cut of bolt.cuts) {
      cutsByLength.set(
        cut.lengthM,
        (cutsByLength.get(cut.lengthM) ?? 0) + 1,
      );
    }
  }
  const lengthChips = Array.from(cutsByLength.entries()).sort(
    ([a], [b]) => a - b,
  );

  return (
    <View
      // `wrap={false}` — nie dzieli sekcji koloru między strony.
      // Jeśli nie mieści się w pozostałym miejscu, przeniesie się w całości
      // na nową stronę.
      wrap={false}
      style={[
        styles.colorBoltSection,
        { borderLeftColor: meta.hex },
      ]}
    >
      <View style={styles.colorHeader}>
        <Text
          style={[
            styles.colorChip,
            {
              backgroundColor: meta.hex,
              color: meta.textOnBg === "light" ? "#fff" : "#0f172a",
            },
          ]}
        >
          {meta.label.toUpperCase()} ({summary.color})
        </Text>
        <Text style={styles.colorStats}>
          {summary.boltsUsed}/{DEFAULT_MIN_BOLTS_PER_COLOR} belek ·{" "}
          {summary.totalRequestedM.toFixed(1)} m · wykorz.{" "}
          {summary.utilizationPct.toFixed(0)}%
        </Text>
      </View>
      {lengthChips.length > 0 && (
        <View style={styles.boltLengthsBar}>
          {lengthChips.map(([len, qty]) => (
            <Text
              key={len}
              style={[
                styles.boltLengthChip,
                { borderColor: meta.hex },
              ]}
            >
              <Text style={styles.boltLengthChipQty}>{qty}×</Text>
              {" "}
              <Text>{len} m</Text>
            </Text>
          ))}
        </View>
      )}
      {displayed.map((b, idx) => {
        const isFull = b.remainingM <= 0.1 && b.usedM > 0;
        const isEmpty = b.usedM <= 0.01;
        const statusColor = isEmpty
          ? "#e11d48" // rose-600
          : isFull
            ? "#10b981" // emerald-500
            : "#f59e0b"; // amber-500
        // Skrócony opis cięć na tej belce — np. „2×4m + 1×6m" — pisany
        // przed paskiem (lewa strona wiersza). Ilość sztuk granatowa
        // i pogrubiona, długość zwykła. Cały opis w 1 linii.
        const cutsByLen = new Map<number, number>();
        for (const c of b.cuts) {
          cutsByLen.set(c.lengthM, (cutsByLen.get(c.lengthM) ?? 0) + 1);
        }
        const cutEntries = Array.from(cutsByLen.entries()).sort(
          ([a], [b2]) => a - b2,
        );
        return (
          <View key={idx} style={{ marginBottom: 2 }}>
            <View style={styles.boltRow}>
              <View
                style={[
                  styles.boltStatusDot,
                  { backgroundColor: statusColor },
                ]}
              />
              <Text style={styles.boltLabel}>B{idx + 1}</Text>
              <Text
                style={{
                  width: 130,
                  fontSize: 7,
                  color: COLORS.text,
                  paddingRight: 6,
                }}
              >
                {cutEntries.map(([len, qty], i) => (
                  <Text key={len}>
                    {i > 0 ? " + " : ""}
                    <Text
                      style={{ color: "#1e3a8a", fontWeight: 700 }}
                    >
                      {qty}×
                    </Text>
                    {len}m
                  </Text>
                ))}
              </Text>
              <View style={styles.boltBar}>
                {b.cuts.map((cut, i) => {
                  const pct = (cut.lengthM / b.capacityM) * 100;
                  return (
                    <Text
                      key={i}
                      style={[
                        styles.boltSeg,
                        {
                          width: `${pct}%`,
                          backgroundColor: meta.hex,
                          color:
                            meta.textOnBg === "light" ? "#fff" : "#0f172a",
                        },
                      ]}
                    >
                      {cut.lengthM}m
                    </Text>
                  );
                })}
                {b.remainingM > 0.1 && (
                  <Text
                    style={[
                      styles.boltWaste,
                      {
                        width: `${(b.remainingM / b.capacityM) * 100}%`,
                      },
                    ]}
                  >
                    {Math.round(b.remainingM)}m
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.boltUsage,
                  ...(isFull ? [styles.boltUsageFull] : []),
                ]}
              >
                {Math.round(b.usedM)}/{b.capacityM}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Strona „Wytyczne i składanie zamówienia". Renderuje tytuł, treść tekstową
 * (split per newline → osobne akapity) i grafiki. Dla 1 grafiki — pełna
 * szerokość, dla 2+ — siatka 2 kolumny.
 */
function SectionPage({
  index,
  total,
  section,
  orderNumber,
  companyName,
  companyLogoDataUri,
}: {
  index: number;
  total: number;
  section: PdfSectionForPdf;
  orderNumber: string;
  companyName: string;
  companyLogoDataUri: string | null;
}) {
  const richNodes = parseRichTextHtmlToPdfNodes(section.content ?? "");
  const images = section.images;

  return (
    <Page size="A4" style={styles.sectionPage}>
      {companyLogoDataUri && (
        <PdfImage
          src={companyLogoDataUri}
          style={styles.fixedLogo}
          fixed
        />
      )}
      <View style={styles.sectionTopBar}>
        <Text style={styles.sectionPageOrder}>
          Wytyczne i składanie zamówienia ({index + 1}/{total})
        </Text>
        <Text style={styles.sectionPageOrder}>
          Zamówienie {orderNumber}
        </Text>
      </View>
      <Text style={styles.sectionPageTitle}>{section.title}</Text>
      <RenderRichNodes nodes={richNodes} />

      {images.length > 0 && (
        <View style={styles.sectionPageImagesWrap}>
          {images.length === 1 ? (
            <PdfImage
              src={images[0].dataUri}
              style={styles.sectionPageSingleImage}
            />
          ) : (
            images.map((img, i) => (
              <PdfImage
                key={i}
                src={img.dataUri}
                style={styles.sectionPageImage}
              />
            ))
          )}
        </View>
      )}
      <Text
        style={styles.footer}
        render={({ pageNumber, totalPages }) =>
          `${companyName} · Zamówienie ${orderNumber} · Strona ${pageNumber} z ${totalPages}`
        }
        fixed
      />
    </Page>
  );
}

/**
 * Renderuje kod kreskowy jako WEKTOR (Svg + Path) z bwip-js. Wektor pozwala
 * na nieskończony zoom bez utraty jakości — w przeciwieństwie do rasteru
 * PNG, który pikselizuje się przy powiększeniu.
 */
function BarcodeSvg({
  vector,
  style,
}: {
  vector: BarcodeVector;
  style: React.ComponentProps<typeof View>["style"];
}) {
  const { viewBox, paths } = vector;
  return (
    <Svg
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      style={style}
    >
      {paths.map((p, i) => (
        <Path
          key={i}
          d={p.d}
          fill={p.fill}
          stroke={p.stroke}
          strokeWidth={p.strokeWidth}
        />
      ))}
    </Svg>
  );
}

// ─── Rich text parser (HTML → react-pdf nodes) ─────────────────────────
// Bardzo lekki parser HTML produkowanego przez TipTap StarterKit. Obsługuje:
//   <h1>/<h2>/<h3>, <p>, <ul>/<ol>/<li>, <strong>/<b>, <em>/<i>, <s>.
// Bez tabel, linków, obrazków (te mamy osobno). Stripuje pozostałe tagi.
//
// Wynik to płaska lista „blok-elementów" — paragraph/heading/list — gdzie
// każdy zawiera „inline elementy" (text z ewentualnym pogrubieniem/kursywą).

type RichInline = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
};
type RichBlock =
  | { kind: "p"; children: RichInline[] }
  | { kind: "h1" | "h2" | "h3"; children: RichInline[] }
  | { kind: "ul" | "ol"; items: RichInline[][] };

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Parsuje inline'owe znaczniki w HTML stringu — zwraca listę RichInline. */
function parseInline(html: string): RichInline[] {
  const out: RichInline[] = [];
  const stack: { tag: string }[] = [];
  let buf = "";
  let i = 0;
  function flush() {
    if (!buf) return;
    out.push({
      text: decodeEntities(buf),
      bold: stack.some((s) => s.tag === "strong" || s.tag === "b"),
      italic: stack.some((s) => s.tag === "em" || s.tag === "i"),
      strike: stack.some((s) => s.tag === "s" || s.tag === "del"),
    });
    buf = "";
  }
  while (i < html.length) {
    if (html[i] === "<") {
      const end = html.indexOf(">", i);
      if (end < 0) break;
      const tagRaw = html.slice(i + 1, end);
      const isClose = tagRaw.startsWith("/");
      const tagName = (isClose ? tagRaw.slice(1) : tagRaw)
        .trim()
        .split(/\s+/)[0]
        .toLowerCase();
      flush();
      if (tagName === "br") {
        out.push({ text: "\n" });
      } else if (isClose) {
        // pop ostatni odpowiadający
        const idx = [...stack].reverse().findIndex((s) => s.tag === tagName);
        if (idx >= 0) stack.splice(stack.length - 1 - idx, 1);
      } else {
        stack.push({ tag: tagName });
      }
      i = end + 1;
    } else {
      buf += html[i++];
    }
  }
  flush();
  return out;
}

/** Główny parser: dzieli HTML na bloki (h1/h2/h3/p/ul/ol). */
export function parseRichTextHtmlToPdfNodes(html: string): RichBlock[] {
  if (!html.trim()) return [];
  // Backward compat: gdy treść była zwykłym tekstem (legacy bez HTML), traktuj
  // każdą linijkę jako osobny akapit.
  if (!/<\w+/.test(html)) {
    return html
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0)
      .map((l) => ({ kind: "p" as const, children: [{ text: l }] }));
  }

  const blocks: RichBlock[] = [];
  // Wyciągnij top-level bloki przez regex (bez zagnieżdżania bloków w blokach).
  const blockRe =
    /<(h1|h2|h3|p|ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html))) {
    const tag = m[1].toLowerCase() as "h1" | "h2" | "h3" | "p" | "ul" | "ol";
    const inner = m[2];
    if (tag === "ul" || tag === "ol") {
      const items: RichInline[][] = [];
      const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
      let li: RegExpExecArray | null;
      while ((li = liRe.exec(inner))) {
        items.push(parseInline(li[1]));
      }
      if (items.length > 0) blocks.push({ kind: tag, items });
    } else {
      const children = parseInline(inner);
      if (children.length > 0) blocks.push({ kind: tag, children });
    }
  }
  return blocks;
}

/** Render RichBlock[] w react-pdf — Text/View z odpowiednimi stylami. */
function RenderRichNodes({ nodes }: { nodes: RichBlock[] }) {
  return (
    <View>
      {nodes.map((node, i) => {
        if (node.kind === "ul" || node.kind === "ol") {
          const listKind = node.kind;
          return (
            <View key={i} style={{ marginTop: 4, marginBottom: 6 }}>
              {node.items.map((item, j) => (
                <View
                  key={j}
                  style={{ flexDirection: "row", marginBottom: 2 }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      marginRight: 6,
                      color: COLORS.text,
                    }}
                  >
                    {listKind === "ul" ? "•" : `${j + 1}.`}
                  </Text>
                  <Text style={{ flex: 1, fontSize: 11, lineHeight: 1.5 }}>
                    {item.map((inl, k) => (
                      <Text key={k} style={inlineStyleSpread(inl)}>
                        {inl.text}
                      </Text>
                    ))}
                  </Text>
                </View>
              ))}
            </View>
          );
        }
        // Po wcześniejszym `if` (ul/ol → return), zostają tylko warianty
        // z `children` (h1/h2/h3/p). Cast bo TS narrowing nie ogarnia
        // tego po return inside map.
        const block = node as Extract<RichBlock, { children: RichInline[] }>;
        const headingStyle =
          block.kind === "h1"
            ? { fontSize: 20, fontWeight: 700 as const, marginTop: 8, marginBottom: 4 }
            : block.kind === "h2"
              ? { fontSize: 16, fontWeight: 700 as const, marginTop: 6, marginBottom: 3 }
              : block.kind === "h3"
                ? { fontSize: 13, fontWeight: 700 as const, marginTop: 5, marginBottom: 2 }
                : { fontSize: 11, lineHeight: 1.55, marginBottom: 6 };
        return (
          <Text key={i} style={headingStyle}>
            {block.children.map((inl, k) => (
              <Text key={k} style={inlineStyleSpread(inl)}>
                {inl.text}
              </Text>
            ))}
          </Text>
        );
      })}
    </View>
  );
}

function inlineStyleSpread(inl: RichInline) {
  return {
    ...(inl.bold ? { fontWeight: 700 as const } : {}),
    ...(inl.strike ? { textDecoration: "line-through" as const } : {}),
  };
}
