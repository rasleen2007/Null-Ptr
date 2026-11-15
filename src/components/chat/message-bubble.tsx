"use client";

import { useState, useRef, useEffect } from "react";
import { Check, Copy, MessageSquare, Wrench, Volume2, VolumeX, X } from "lucide-react";
import type { StoredMessage } from "@/harness/types";
import { cn, formatTime } from "@/lib/utils";
import { Markdown } from "./markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSpeech } from "@/lib/use-speech";
import { speechLangFor } from "@/lib/speech";

function MiniCore({ active = false }: { active?: boolean }) {
  return (
    <span
      className={cn(
        "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-indigo-200 bg-indigo-50",
        active && "shadow-[0_0_20px_-4px_rgba(79,70,229,0.5)]",
      )}
    >
      <span className="h-3.5 w-3.5 rounded-full bg-[radial-gradient(circle_at_35%_30%,#eef2ff,#6366f1_45%,#3730a3_90%)] shadow-[0_0_10px_2px_rgba(79,70,229,0.35)]" />
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

  const speech = useSpeech();
  const activeSpeechRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      speech.stop();
    };
  }, [speech.stop]);

  if (message.role === "tool" || message.role === "system") return null;

  const isUser = message.role === "user";
  const toolCalls = message.toolCalls ?? [];
  const isSpeaking = speech.speaking && activeSpeechRef.current === message.id;

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
    if (!speech.supported) return;

    const cleanText = message.content.trim();
    if (!cleanText) return;

    if (activeSpeechRef.current && activeSpeechRef.current !== message.id) {
      speech.stop();
    }

    if (isSpeaking) {
      speech.stop();
      activeSpeechRef.current = null;
      return;
    }

    activeSpeechRef.current = message.id;
    speech.speak(cleanText);
  };

  const handleStop = (event: React.MouseEvent) => {
    event.stopPropagation();
    speech.stop();
    activeSpeechRef.current = null;
  };

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="group max-w-[85%] sm:max-w-[75%]">
          <div className="relative overflow-hidden rounded-2xl rounded-tr-md border border-indigo-200 bg-indigo-50 px-4 py-3">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{message.content}</p>
          </div>
          <div className="mt-1 flex items-center justify-end gap-2 pr-1">
            <span className="text-[0.58rem] text-slate-400">{formatTime(message.createdAt)}</span>
            <span className="inline-flex items-center gap-1 text-[0.58rem] uppercase tracking-[0.14em] text-slate-400">
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
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600/90">Sarkari</span>
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
          <span className="text-[0.58rem] text-slate-400">{formatTime(message.createdAt)}</span>
          {message.content ? (
            <div className="ml-auto flex items-center gap-1.5">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={handleSpeak}
                disabled={!speech.supported}
                className={cn(
                  "h-8 w-8 rounded-lg transition-colors",
                  isSpeaking
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-500 hover:text-indigo-700",
                )}
                title={isSpeaking ? "Stop speech" : "Read aloud"}
                aria-label={isSpeaking ? "Stop speech" : "Read aloud"}
              >
                {isSpeaking ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>
              {isSpeaking && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={handleStop}
                  className="h-8 w-8 rounded-lg text-amber-600 hover:text-amber-700"
                  title="Stop speech"
                  aria-label="Stop speech"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
              <button
                type="button"
                onClick={copy}
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.58rem] text-slate-400 opacity-0 transition-opacity hover:text-indigo-600 group-hover:opacity-100"
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
            {showCursor ? <span className="ml-0.5 inline-block h-4 w-1.5 animate-blink bg-indigo-500 align-middle" /> : null}
            {!streaming && message.content && (
              <div className="mt-2 flex items-center gap-1.5 text-[0.55rem] text-slate-500">
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono">
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
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 font-mono text-[0.62rem] text-amber-800"
              >
                <Wrench className="h-2.5 w-2.5" /> {call.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs italic text-slate-400">No text response.</p>
        )}
      </div>
    </div>
  );
}
