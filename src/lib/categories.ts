export const CATEGORY_LEVELS = [1, 2, 3] as const;
export type CategoryLevel = (typeof CATEGORY_LEVELS)[number];

export const LEVEL_LABEL: Record<CategoryLevel, string> = {
  1: "Kategoria główna",
  2: "Podkategoria",
  3: "Typ produktu",
};

export const LEVEL_LABEL_SHORT: Record<CategoryLevel, string> = {
  1: "Główna",
  2: "Podkategoria",
  3: "Typ",
};

export const LEVEL_BADGE: Record<CategoryLevel, string> = {
  1: "bg-violet-100 text-violet-800 ring-violet-200",
  2: "bg-blue-100 text-blue-800 ring-blue-200",
  3: "bg-emerald-100 text-emerald-800 ring-emerald-200",
};

export const LEVEL_NEXT: Record<CategoryLevel, string> = {
  1: "podkategorię",
  2: "typ produktu",
  3: "—", // typ produktu nie może mieć dzieci
};

export function canBeParentOf(parentLevel: CategoryLevel, childLevel: CategoryLevel): boolean {
  return childLevel === parentLevel + 1;
}

export function expectedParentLevel(childLevel: CategoryLevel): CategoryLevel | null {
  if (childLevel === 1) return null;
  return (childLevel - 1) as CategoryLevel;
}
