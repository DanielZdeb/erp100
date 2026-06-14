import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Recommendation = {
  id: string;
  priority: number;
  notes: string | null;
  product: { id: string; name: string; productCode: string };
};

export function RecommendedProductsTab({
  recommendations,
}: {
  recommendations: Recommendation[];
}) {
  if (recommendations.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground">
        Żaden produkt nie ma jeszcze tego kuriera w rekomendacjach. Rekomendacje
        dodajesz w widoku produktu.
      </Card>
    );
  }

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Produkt</TableHead>
            <TableHead>Priorytet</TableHead>
            <TableHead>Notatki</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {recommendations.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <Link
                  href={`/produkty/${r.product.id}`}
                  className="font-medium hover:underline"
                >
                  {r.product.name}
                </Link>
                <div className="text-xs text-muted-foreground">
                  <code>{r.product.productCode}</code>
                </div>
              </TableCell>
              <TableCell>
                {r.priority === 0 ? (
                  <Badge>preferowany</Badge>
                ) : (
                  <span className="text-sm">#{r.priority + 1}</span>
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {r.notes ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
