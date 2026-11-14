"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUp, Settings2, Square, Wrench } from "lucide-react";
import type { ModelInfo, ProviderStatus } from "@/harness/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ModelPicker } from "./model-picker";

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  disabled,
  models,
  providers,
  selectedModel,
  onModelChange,
  useTools,
  onUseToolsChange,
  toolsSupported,
  onOpenSystemPrompt,
  systemPromptActive,
  placeholder,
  footer,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
  models: ModelInfo[];
  providers: ProviderStatus[];
  selectedModel: string;
  onModelChange: (value: string) => void;
  useTools: boolean;
  onUseToolsChange: (value: boolean) => void;
  toolsSupported: boolean;
  onOpenSystemPrompt: () => void;
  systemPromptActive: boolean;
  placeholder?: string;
  footer?: ReactNode;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(node.scrollHeight, 200)}px`;
  }, [value]);

  const noModels = models.length === 0;

  return (
    <div className="space-y-2">
      <div className="glass-strong relative rounded-2xl p-2 transition-colors focus-within:border-cyan-400/25">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (!streaming && !disabled) onSend();
            }
          }}
          rows={1}
          placeholder={
            noModels
              ? "Add a provider key or start Ollama to begin…"
              : placeholder ?? "Message Jarvis… (Enter to send, Shift+Enter for newline)"
          }
          className="max-h-[200px] min-h-[44px] w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-sm leading-relaxed text-slate-100 placeholder:text-slate-600 focus:outline-none"
          disabled={disabled || noModels}
        />

        <div className="flex items-center gap-1.5 px-1 pb-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onUseToolsChange(!useTools)}
            className={cn(
              "h-8 w-8 rounded-lg",
              useTools && toolsSupported
                ? "bg-cyan-400/10 text-cyan-300"
                : "text-slate-500",
            )}
            title={toolsSupported ? "Toggle tool use" : "This model does not support tools"}
            disabled={!toolsSupported}
          >
            <Wrench className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onOpenSystemPrompt}
            className={cn("h-8 w-8 rounded-lg", systemPromptActive ? "bg-violet-400/10 text-violet-300" : "text-slate-500")}
            title="System instruction"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>

          <div className="ml-auto flex items-center gap-1.5">
            <ModelPicker
              models={models}
              providers={providers}
              value={selectedModel}
              onChange={onModelChange}
              disabled={streaming}
            />
            {streaming ? (
              <Button type="button" size="icon" variant="secondary" onClick={onStop} title="Stop generation">
                <Square className="h-3.5 w-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                onClick={onSend}
                disabled={!value.trim() || disabled || noModels}
                title="Send"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {noModels ? (
        <div className="flex items-center justify-between rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2">
          <p className="text-[0.68rem] text-amber-200/80">No provider is configured yet.</p>
          <Link href="/models" className="text-[0.68rem] font-medium text-amber-200 underline-offset-4 hover:underline">
            Configure models →
          </Link>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[0.58rem] text-slate-600">
          <span>
            {useTools && toolsSupported ? "Tools armed — sensitive calls require approval." : "Tools disabled for this message."}
          </span>
          {footer}
        </div>
      )}
    </div>
  );
}
