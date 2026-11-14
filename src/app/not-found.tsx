import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
        <FileQuestion className="h-8 w-8" />
      </div>
      <h1 className="mt-6 text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">
        Page Not Found
      </h1>
      <p className="mt-2 max-w-md text-sm text-slate-400">
        The government service, conversation, or setting you are looking for does not exist or has been moved.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Button asChild variant="secondary" className="gap-2">
          <Link href="/chat">
            <ArrowLeft className="h-4 w-4" /> Return to Chat
          </Link>
        </Button>
      </div>
    </div>
  );
}
