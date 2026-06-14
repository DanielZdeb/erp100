"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";

export function CategoryFilter({
  categories,
  value,
}: {
  categories: { id: string; name: string }[];
  value: string;
}) {
  return (
    <>
      <input type="hidden" name="category" value={value === ALL ? "" : value} />
      <Select
        defaultValue={value || ALL}
        onValueChange={(raw) => {
          const v = String(raw ?? ALL);
          const input = document.querySelector<HTMLInputElement>(
            'input[name="category"]',
          );
          if (input) input.value = v === ALL ? "" : v;
        }}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Kategoria" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Wszystkie kategorie</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
