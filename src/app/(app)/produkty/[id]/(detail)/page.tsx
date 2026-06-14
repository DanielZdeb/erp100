import { redirect } from "next/navigation";

export default async function ProductDetailIndex({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/produkty/${id}/podstawowe`);
}
