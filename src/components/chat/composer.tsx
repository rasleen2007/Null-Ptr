"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUp, Settings2, Square, Wrench, Mic, MicOff, X, Loader2 } from "lucide-react";
import type { ModelInfo, ProviderStatus } from "@/harness/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ModelPicker } from "./model-picker";
import { useVoice, type VoiceController } from "@/lib/use-voice";
import { formatVoiceDuration } from "@/lib/speech";

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
  const voiceRef = useRef<VoiceController | null>(null);

  const voice = useVoice({
    onTranscript: (text) => {
      onChange(value + (value ? " " : "") + text);
    },
    maxSeconds: 120,
  });

  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(node.scrollHeight, 200)}px`;
  }, [value]);

  const noModels = models.length === 0;
  const isRecording = voice.status === "recording";
  const isTranscribing = voice.status === "transcribing";

  return (
    <div className="space-y-2">
      <div className="glass-strong relative rounded-2xl p-2 transition-colors focus-within:border-indigo-300">
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
              : placeholder ?? "Message Sarkari Saathi… (Enter to send, Shift+Enter for newline)"
          }
          className="max-h-[200px] min-h-[44px] w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:outline-none"
          disabled={disabled || noModels || isRecording || isTranscribing}
        />

        {(isRecording || isTranscribing) && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none rounded-2xl bg-white/70">
            <div className="flex flex-col items-center gap-2 text-slate-900">
              <span className="text-sm font-mono text-indigo-700">
                {isRecording ? formatVoiceDuration(voice.seconds) : voice.detail ?? "Transcribing…"}
              </span>
              {isTranscribing && voice.model && (
                <span className="text-[0.6rem] text-slate-500">{voice.model}</span>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5 px-1 pb-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onUseToolsChange(!useTools)}
            className={cn(
              "h-8 w-8 rounded-lg",
              useTools && toolsSupported
                ? "bg-indigo-50 text-indigo-700"
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
            className={cn("h-8 w-8 rounded-lg", systemPromptActive ? "bg-violet-50 text-violet-700" : "text-slate-500")}
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
              disabled={streaming || isRecording || isTranscribing}
            />

            {voice.supported && !streaming && !isRecording && !isTranscribing ? (
              <Button
                type="button"
                size="icon"
                variant={voice.error ? "destructive" : "ghost"}
                onClick={voice.start}
                disabled={disabled || noModels}
                title="Voice input"
                aria-label="Start voice recording"
              >
                <Mic className="h-4 w-4" />
              </Button>
            ) : null}

            {isRecording ? (
              <Button
                type="button"
                size="icon"
                variant="secondary"
                onClick={voice.stop}
                title="Stop recording"
                aria-label="Stop recording"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </Button>
            ) : null}

            {isTranscribing ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={voice.cancel}
                title="Cancel transcription"
                aria-label="Cancel transcription"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            ) : null}

            {streaming ? (
              <Button type="button" size="icon" variant="secondary" onClick={onStop} title="Stop generation">
                <Square className="h-3.5 w-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                onClick={onSend}
                disabled={!value.trim() || disabled || noModels || isRecording || isTranscribing}
                title="Send"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}

            {voice.error && (
              <div className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[0.6rem] text-rose-700">
                <span>{voice.error}</span>
                <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={voice.clearError} title="Dismiss">
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {noModels ? (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-[0.68rem] text-amber-800">No provider is configured yet.</p>
          <Link href="/settings" className="text-[0.68rem] font-medium text-amber-800 underline-offset-4 hover:underline">
            Configure models →
          </Link>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[0.58rem] text-slate-500">
          <span>
            {useTools && toolsSupported ? "Tools armed — sensitive calls require approval." : "Tools disabled for this message."}
          </span>
          {footer}
        </div>
      )}
    </div>
  );
}
