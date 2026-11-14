"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative my-3 overflow-hidden rounded-xl border border-white/10 bg-[#020617]/90">
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-3 py-1.5">
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-slate-500">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              // clipboard unavailable
            }
          }}
          className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[0.62rem] text-slate-500 transition-colors hover:bg-white/5 hover:text-cyan-200"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[0.8rem] leading-relaxed">
        <code className="font-mono text-slate-200">{code}</code>
      </pre>
    </div>
  );
}

export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("doc-content", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: ({ className: codeClassName, children }) => {
            const text = String(children ?? "");
            const match = /language-([\w-]+)/.exec(codeClassName ?? "");
            const isBlock = Boolean(match) || text.includes("\n");
            if (!isBlock) {
              return (
                <code className="rounded bg-slate-800/70 px-1.5 py-0.5 font-mono text-[0.78em] text-cyan-200">
                  {children}
                </code>
              );
            }
            return <CodeBlock language={match?.[1] ?? ""} code={text.replace(/\n$/, "")} />;
          },
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
