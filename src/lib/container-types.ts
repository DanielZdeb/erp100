export const CONTAINER_TYPES = ["TWENTY_FT", "FORTY_FT", "CUSTOM"] as const;
export type ContainerTypeT = (typeof CONTAINER_TYPES)[number];

/** Standardowa pojemność użytkowa kontenera w m³. */
export const CONTAINER_M3: Record<ContainerTypeT, number | null> = {
  TWENTY_FT: 28,
  FORTY_FT: 68,
  CUSTOM: null,
};

export const CONTAINER_LABEL: Record<ContainerTypeT, string> = {
  TWENTY_FT: "20' (28 m³)",
  FORTY_FT: "40' (68 m³)",
  CUSTOM: "Niestandardowy",
};

export const CONTAINER_SHORT_LABEL: Record<ContainerTypeT, string> = {
  TWENTY_FT: "20'",
  FORTY_FT: "40'",
  CUSTOM: "własny",
};

export const IMPORT_MODES = ["KARTON", "LUZEM"] as const;
export type ImportModeT = (typeof IMPORT_MODES)[number];

export const IMPORT_MODE_LABEL: Record<ImportModeT, string> = {
  KARTON: "W kartonach",
  LUZEM: "Luzem",
};
