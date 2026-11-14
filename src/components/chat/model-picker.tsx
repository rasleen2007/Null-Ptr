"use client";

import type { ModelInfo, ProviderStatus } from "@/harness/types";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function ModelPicker({
  models,
  providers,
  value,
  onChange,
  disabled,
  className,
}: {
  models: ModelInfo[];
  providers: ProviderStatus[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const providerNames = new Map(providers.map((provider) => [provider.id, provider.label]));
  const grouped = new Map<string, ModelInfo[]>();
  for (const model of models) {
    const list = grouped.get(model.provider) ?? [];
    list.push(model);
    grouped.set(model.provider, list);
  }

  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled || !models.length}>
      <SelectTrigger
        className={cn(
          "h-8 w-auto min-w-[150px] max-w-[230px] gap-2 rounded-lg border-white/[0.08] bg-white/[0.03] px-2.5 text-[0.68rem] text-slate-300",
          className,
        )}
        aria-label="Select model"
      >
        <SelectValue placeholder={models.length ? "Select model" : "No models ready"} />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {[...grouped.entries()].map(([providerId, providerModels]) => (
          <SelectGroup key={providerId}>
            <SelectLabel>{providerNames.get(providerId as ProviderStatus["id"]) ?? providerId}</SelectLabel>
            {providerModels.map((model) => (
              <SelectItem key={model.id} value={model.id} className="text-xs">
                <span className="flex items-center gap-2">
                  <span>{model.label}</span>
                  {model.free ? <span className="text-[0.55rem] text-emerald-400/80">free</span> : null}
                  {!model.supportsTools ? <span className="text-[0.55rem] text-slate-500">no tools</span> : null}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
