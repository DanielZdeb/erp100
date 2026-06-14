"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { setDefaultContainerTypeAction } from "@/server/system-settings";
import {
  CONTAINER_LABEL,
  type ContainerTypeT,
} from "@/lib/container-types";

export function ContainerSettingsForm({
  defaultType,
}: {
  defaultType: ContainerTypeT;
}) {
  const [type, setType] = useState<ContainerTypeT>(defaultType);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      try {
        await setDefaultContainerTypeAction(type);
        toast.success("Zapisano");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się zapisać");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 max-w-sm">
        <Label>Typ kontenera</Label>
        <Select
          value={type}
          onValueChange={(v) => setType((v as ContainerTypeT) ?? "TWENTY_FT")}
        >
          <SelectTrigger>
            <SelectValue>
              {(v) => CONTAINER_LABEL[v as ContainerTypeT] ?? String(v ?? "")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TWENTY_FT">{CONTAINER_LABEL.TWENTY_FT}</SelectItem>
            <SelectItem value="FORTY_FT">{CONTAINER_LABEL.FORTY_FT}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button
        type="button"
        onClick={save}
        disabled={pending || type === defaultType}
      >
        {pending ? "Zapisuję…" : "Zapisz"}
      </Button>
    </div>
  );
}
