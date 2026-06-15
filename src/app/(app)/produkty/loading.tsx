/**
 * Loading skeleton dla /produkty.
 *
 * Next.js App Router automatycznie renderuje to jako Suspense boundary
 * podczas gdy server component `page.tsx` pobiera dane (queries Prisma +
 * compute ekonomiki dla 346 produktów). User widzi natychmiast szkielet
 * zamiast pustego ekranu — UX jakby tab przełączał się instant.
 *
 * Trzymaj layout prosty (tabela 10 wierszy × szare paski) — chodzi o
 * subliminalną informację „strona się ładuje", nie pixel-perfect kopię.
 */
export default function ProduktyLoading() {
  return (
    <div className="space-y-4 p-4 animate-pulse">
      {/* Nagłówek strony */}
      <div className="flex items-center justify-between gap-4">
        <div className="h-7 w-48 rounded bg-muted" />
        <div className="flex gap-2">
          <div className="h-9 w-32 rounded bg-muted" />
          <div className="h-9 w-28 rounded bg-muted" />
        </div>
      </div>

      {/* Filtry / search */}
      <div className="flex gap-2">
        <div className="h-9 flex-1 max-w-xs rounded bg-muted" />
        <div className="h-9 w-40 rounded bg-muted" />
        <div className="h-9 w-32 rounded bg-muted" />
      </div>

      {/* Tabela — 10 szkieletów wierszy */}
      <div className="rounded-lg ring-1 ring-border overflow-hidden">
        {/* Header */}
        <div className="h-10 bg-muted/60 flex items-center px-3 gap-3">
          <div className="h-3 w-40 rounded bg-muted" />
          <div className="ml-auto flex gap-2">
            <div className="h-3 w-16 rounded bg-muted" />
            <div className="h-3 w-16 rounded bg-muted" />
            <div className="h-3 w-16 rounded bg-muted" />
          </div>
        </div>
        {/* Rows */}
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="h-14 border-t border-border flex items-center px-3 gap-3"
          >
            <div className="size-9 rounded bg-muted shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-2/3 rounded bg-muted" />
              <div className="h-2 w-1/3 rounded bg-muted/60" />
            </div>
            <div className="flex gap-2">
              <div className="h-3 w-12 rounded bg-muted" />
              <div className="h-3 w-12 rounded bg-muted" />
              <div className="h-3 w-12 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>

      {/* Hint — ledwo widoczny komentarz że strona się ładuje */}
      <div className="text-center text-[11px] text-muted-foreground">
        Ładowanie listy produktów...
      </div>
    </div>
  );
}
