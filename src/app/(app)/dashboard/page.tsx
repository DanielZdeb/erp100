import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";

import { CompanyTasksKanban } from "./_components/company-tasks-kanban";
import type {
  CompanyTaskWithRelations,
  TaskUser,
} from "./_components/company-tasks-types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const companyId = await getCurrentCompanyId();
  const [companyTasks, members] = await Promise.all([
    db.companyTask.findMany({
      where: { companyId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        attachments: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            url: true,
            filename: true,
            contentType: true,
            sizeBytes: true,
            isImage: true,
            createdAt: true,
          },
        },
      },
    }),
    db.user.findMany({
      where: { companyId, active: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true },
    }),
  ]);

  const tasksForClient: CompanyTaskWithRelations[] = companyTasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    assignedToId: t.assignedToId,
    assignedTo: t.assignedTo,
    createdBy: t.createdBy,
    dueAt: t.dueAt,
    completedAt: t.completedAt,
    sortOrder: t.sortOrder,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    attachments: t.attachments,
  }));

  const membersForClient: TaskUser[] = members;

  return (
    <div className="p-6 space-y-6">
      {/* ── Tablica zadań zespołu ───────────────────────────────────
          Ciemny header + jasna sekcja kontentu — wizualnie odrebne od
          szarego menu po lewej. Calosc na ciemnym tle slate-900 z subtle
          gradientem; karty kolumn na bialo na tym tle. */}
      <section className="rounded-2xl overflow-hidden ring-1 ring-slate-900/10 shadow-lg">
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-white/10 grid place-items-center ring-1 ring-white/20">
              <span className="text-base">📋</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Tablica zadań zespołu
              </h2>
              <p className="text-[10px] text-slate-300 uppercase tracking-wider">
                drag&drop między kolumnami zmienia status
              </p>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-slate-50 to-white p-5">
          <CompanyTasksKanban
            tasks={tasksForClient}
            members={membersForClient}
          />
        </div>
      </section>

    </div>
  );
}
