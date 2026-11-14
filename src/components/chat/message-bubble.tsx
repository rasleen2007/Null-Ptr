"use client";

import { useState, useRef, useEffect } from "react";
import { Check, Copy, MessageSquare, Wrench, Volume2, VolumeX, X } from "lucide-react";
import type { StoredMessage } from "@/harness/types";
import { cn, formatTime } from "@/lib/utils";
import { Markdown } from "./markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSpeech, type SpeechController } from "@/lib/use-speech";
import { speechLangFor } from "@/lib/speech";

function MiniCore({ active = false }: { active?: boolean }) {
  return (
    <span
      className={cn(
        "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-300/25 bg-slate-950/70",
        active && "shadow-[0_0_20px_-4px_rgba(34,211,238,0.7)]",
      )}
    >
      <span className="h-3.5 w-3.5 rounded-full bg-[radial-gradient(circle_at_35%_30%,#e0fbff,#22d3ee_45%,#0369a1_90%)] shadow-[0_0_10px_2px_rgba(34,211,238,0.5)]" />
    </span>
  );
}

export function MessageBubble({
  message,
  streaming = false,
  showCursor = false,
  modelLabel,
}: {
  message: StoredMessage;
  streaming?: boolean;
  showCursor?: boolean;
  modelLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [speechState, setSpeechState] = useState<{ speaking: boolean; controller: SpeechController | null }>({
    speaking: false,
    controller: null,
  });

  const speech = useSpeech();
  const speechRef = useRef<SpeechController | null>(null);
  const activeSpeechRef = useRef<{ id: string; stop: () => void } | null>(null);

  useEffect(() => {
    speechRef.current = speech;
    setSpeechState({ speaking: false, controller: speech });
    return () => {
      speechRef.current?.stop();
    };
  }, [speech]);

  if (message.role === "tool" || message.role === "system") return null;

  const isUser = message.role === "user";
  const toolCalls = message.toolCalls ?? [];

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  const handleSpeak = () => {
    if (!speechRef.current?.supported) return;

    const cleanText = message.content.trim();
    if (!cleanText) return;

    if (activeSpeechRef.current && activeSpeechRef.current.id !== message.id) {
      activeSpeechRef.current.stop();
    }

    if (speechState.speaking && activeSpeechRef.current?.id === message.id) {
      speechRef.current?.stop();
      activeSpeechRef.current = null;
      setSpeechState({ ...speechState, speaking: false });
      return;
    }

    speechRef.current!.speak(cleanText);
    activeSpeechRef.current = {
      id: message.id,
      stop: () => speechRef.current?.stop(),
    };
    setSpeechState({ ...speechState, speaking: true });
  };

  const handleStop = (event: React.MouseEvent) => {
    event.stopPropagation();
    speechRef.current?.stop();
    activeSpeechRef.current = null;
    setSpeechState({ ...speechState, speaking: false });
  };

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="group max-w-[85%] sm:max-w-[75%]">
          <div className="relative overflow-hidden rounded-2xl rounded-tr-md border border-cyan-400/20 bg-gradient-to-br from-cyan-400/[0.12] to-blue-500/[0.06] px-4 py-3">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-cyan-50/95">{message.content}</p>
          </div>
          <div className="mt-1 flex items-center justify-end gap-2 pr-1">
            <span className="text-[0.58rem] text-slate-600">{formatTime(message.createdAt)}</span>
            <span className="inline-flex items-center gap-1 text-[0.58rem] uppercase tracking-[0.14em] text-slate-600">
              <MessageSquare className="h-2.5 w-2.5" /> You
            </span>
          </div>
        </div>
      </div>
    );
  }

  const lang = speechLangFor(message.content);

  return (
    <div className="group flex gap-3">
      <MiniCore active={streaming} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/90">Jarvis</span>
          {modelLabel ? (
            <Badge variant="secondary" className="px-2 py-0 text-[0.55rem]">
              {modelLabel}
            </Badge>
          ) : null}
          {toolCalls.length ? (
            <Badge variant="outline" className="gap-1 px-2 py-0 text-[0.55rem]">
              <Wrench className="h-2.5 w-2.5" /> {toolCalls.length} tool call{toolCalls.length === 1 ? "" : "s"}
            </Badge>
          ) : null}
          <span className="text-[0.58rem] text-slate-600">{formatTime(message.createdAt)}</span>
          {message.content ? (
            <div className="ml-auto flex items-center gap-1.5">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={handleSpeak}
                disabled={!speechState.controller?.supported}
                className={cn(
                  "h-8 w-8 rounded-lg transition-colors",
                  speechState.speaking && activeSpeechRef.current?.id === message.id
                    ? "bg-cyan-400/10 text-cyan-300"
                    : "text-slate-500 hover:text-cyan-300",
                )}
                title={speechState.speaking && activeSpeechRef.current?.id === message.id ? "Stop speech" : "Read aloud"}
                aria-label={speechState.speaking && activeSpeechRef.current?.id === message.id ? "Stop speech" : "Read aloud"}
              >
                {speechState.speaking && activeSpeechRef.current?.id === message.id ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>
              {speechState.speaking && activeSpeechRef.current?.id === message.id && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={handleStop}
                  className="h-8 w-8 rounded-lg text-amber-300 hover:text-amber-200"
                  title="Stop speech"
                  aria-label="Stop speech"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
              <button
                type="button"
                onClick={copy}
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.58rem] text-slate-600 opacity-0 transition-opacity hover:text-cyan-200 group-hover:opacity-100"
                aria-label="Copy message"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied" : ""}
              </button>
            </div>
          ) : null}
        </div>

        {message.content ? (
          <div className="mt-1.5">
            <Markdown content={message.content} />
            {showCursor ? <span className="ml-0.5 inline-block h-4 w-1.5 animate-blink bg-cyan-300 align-middle" /> : null}
            {!streaming && message.content && (
              <div className="mt-2 flex items-center gap-1.5 text-[0.55rem] text-slate-500">
                <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono">
                  {lang === "hi-IN" ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-orange-400" />
                      Hindi (hi-IN)
                    </>
                  ) : (
                    <>
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      English (en-IN)
                    </>
                  )}
                </span>
              </div>
            )}
          </div>
        ) : toolCalls.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {toolCalls.map((call) => (
              <span
                key={call.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/15 bg-amber-400/[0.04] px-2 py-1 font-mono text-[0.62rem] text-amber-200/80"
              >
                <Wrench className="h-2.5 w-2.5" /> {call.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs italic text-slate-600">No text response.</p>
        )}
      </div>
    </div>
  );
}
