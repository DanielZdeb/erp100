// Współdzielone typy dla komponentów Kanbanu zadań firmy.
//
// CompanyTaskWithRelations odpowiada wynikowi findMany({ include: { assignedTo, attachments, createdBy } })
// — trzymane w jednym miejscu żeby UI komponenty się typowo synchronizowały.

export type CompanyTaskStatusT = "TODO" | "IN_PROGRESS" | "DONE";
export type CompanyTaskPriorityT = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export type TaskUser = {
  id: string;
  name: string | null;
  email: string;
};

export type TaskAttachment = {
  id: string;
  url: string;
  filename: string;
  contentType: string | null;
  sizeBytes: number | null;
  isImage: boolean;
  createdAt: Date;
};

export type CompanyTaskWithRelations = {
  id: string;
  title: string;
  description: string | null;
  status: CompanyTaskStatusT;
  priority: CompanyTaskPriorityT;
  assignedToId: string | null;
  assignedTo: TaskUser | null;
  createdBy: TaskUser | null;
  dueAt: Date | null;
  completedAt: Date | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  attachments: TaskAttachment[];
};

export const STATUS_LABELS: Record<CompanyTaskStatusT, string> = {
  TODO: "Do zrobienia",
  IN_PROGRESS: "Robię",
  DONE: "Zrobione",
};

export const STATUS_ORDER: CompanyTaskStatusT[] = [
  "TODO",
  "IN_PROGRESS",
  "DONE",
];

export const PRIORITY_LABELS: Record<CompanyTaskPriorityT, string> = {
  LOW: "Niski",
  NORMAL: "Zwykły",
  HIGH: "Wysoki",
  URGENT: "Pilne",
};
