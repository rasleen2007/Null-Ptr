"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Brain,
  FileSearch,
  FileText,
  HelpCircle,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type ServiceColor = "indigo" | "saffron" | "emerald" | "violet";

const SERVICES: Array<{
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: ServiceColor;
  badge: string;
  prompts: string[];
}> = [
  {
    id: "schemes",
    title: "Scheme Eligibility",
    description: "Find central and state schemes you qualify for based on your profile, location, and category.",
    icon: Sparkles,
    color: "indigo",
    badge: "AI Powered",
    prompts: [
      "Mere liye suitable central government schemes batao",
      "What Maharashtra state schemes apply to a farmer in Pune?",
      "List scholarships for OBC students in engineering",
    ],
  },
  {
    id: "rti",
    title: "RTI Drafting",
    description: "Generate properly formatted RTI applications with correct addressing, fees, and statutory language.",
    icon: FileText,
    color: "saffron",
    badge: "Template Ready",
    prompts: [
      "Draft an RTI for pending passport application status",
      "RTI application for road construction funds in my ward",
      "File RTI about school mid-day meal quality",
    ],
  },
  {
    id: "forms",
    title: "Form Filling Assistance",
    description: "Get step-by-step guidance for common government forms — PAN, Aadhaar updates, voter ID, and more.",
    icon: FileSearch,
    color: "emerald",
    badge: "Guided",
    prompts: [
      "Help me fill Form 49A for new PAN card",
      "Aadhaar address update documents checklist",
      "Voter ID correction form guidance",
    ],
  },
  {
    id: "info",
    title: "Official Information Lookup",
    description: "Search verified .gov.in sources for circulars, notifications, acts, rules, and scheme guidelines.",
    icon: HelpCircle,
    color: "violet",
    badge: "Verified Sources",
    prompts: [
      "Latest MNREGA wage rates for Rajasthan",
      "PM-KISAN eligibility criteria 2024",
      "Income tax slab rates for FY 2024-25",
    ],
  },
];

function ServiceCard({ service }: { service: typeof SERVICES[0] }) {
  const Icon = service.icon;
  const colorClasses = {
    indigo: "bg-indigo-50 border-indigo-200 text-indigo-700",
    saffron: "bg-amber-50 border-amber-200 text-amber-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    violet: "bg-violet-50 border-violet-200 text-violet-700",
  };
  return (
    <Card className="h-full flex flex-col transition-all hover:shadow-lg hover:-translate-y-1">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className={cn("rounded-xl p-3", colorClasses[service.color])}>
            <Icon className="h-6 w-6" />
          </div>
          <Badge variant="secondary" className={cn("text-[0.55rem]", colorClasses[service.color].replace("bg-", "bg-").replace("text-", "text-"))}>
            {service.badge}
          </Badge>
        </div>
        <CardTitle className="text-lg">{service.title}</CardTitle>
        <CardDescription className="text-sm">{service.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <div className="space-y-2 mb-4">
          {service.prompts.map((prompt, i) => (
            <button
              key={i}
              type="button"
              className={cn(
                "flex items-center gap-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-600 transition-all hover:border-indigo-300 hover:bg-indigo-50"
              )}
            >
              <Search className="h-3.5 w-3.5 text-slate-400" />
              <span className="truncate">{prompt}</span>
            </button>
          ))}
        </div>
      </CardContent>
      <CardFooter className="pt-0">
        <Button
          className="w-full"
          onClick={() => {
            const router = window.location.href.includes("/services") ? null : null;
          }}
        >
          Open in AI Assistant <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function ServicesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleServiceClick = (serviceId: string, prompt: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("prompt", prompt);
    router.push(`/chat?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-indigo-50 via-white to-saffron-50 py-16 sm:py-24 lg:py-32">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-5" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center max-w-3xl mx-auto">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 mb-6">
              <Sparkles className="h-3 w-3" /> Government Services Hub
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-slate-900">
              Your Gateway to <span className="text-indigo-600">Government Services</span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
              Discover schemes you&apos;re eligible for, draft RTI applications, get help filling forms,
              and search official government information — all powered by sovereign AI that keeps your data private.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" className="gap-2" onClick={() => router.push("/chat?prompt=Mere+liye+suitable+government+schemes+batao")}>
                <Sparkles className="h-4 w-4" /> Find My Schemes
              </Button>
              <Button size="lg" variant="outline" className="gap-2" onClick={() => router.push("/chat?prompt=Draft+an+RTI+application")}>
                <FileText className="h-4 w-4" /> Draft an RTI
              </Button>
            </div>
          </div>

          {/* Trust indicators */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div className="p-4">
              <div className="text-3xl font-bold text-indigo-600">.gov.in</div>
              <div className="text-sm text-slate-500 mt-1">Verified Sources Only</div>
            </div>
            <div className="p-4">
              <div className="text-3xl font-bold text-emerald-600">100%</div>
              <div className="text-sm text-slate-500 mt-1">Local Processing</div>
            </div>
            <div className="p-4">
              <div className="text-3xl font-bold text-amber-600">Zero</div>
              <div className="text-sm text-slate-500 mt-1">PII Leakage</div>
            </div>
            <div className="p-4">
              <div className="text-3xl font-bold text-violet-600">Hindi</div>
              <div className="text-sm text-slate-500 mt-1">/ Hinglish Support</div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Grid */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">How Can I Help You Today?</h2>
            <p className="mt-4 text-lg text-slate-600">Choose a service or describe your need in your own words</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {SERVICES.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>

          {/* Quick Search */}
          <div className="mt-16">
            <Card className="border-indigo-200 bg-indigo-50">
              <CardContent className="pt-6">
                <div className="text-center mb-6">
                  <Brain className="h-10 w-10 mx-auto text-indigo-600 mb-3" />
                  <h3 className="text-xl font-semibold text-slate-900">Ask Sarkari Saathi Anything</h3>
                  <p className="mt-2 text-slate-600">Type your question in Hindi, Hinglish, or English</p>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const prompt = formData.get("prompt") as string;
                    if (prompt?.trim()) {
                      router.push(`/chat?prompt=${encodeURIComponent(prompt.trim())}`);
                    }
                  }}
                  className="max-w-xl mx-auto"
                >
                  <div className="flex gap-2">
                    <Input
                      name="prompt"
                      placeholder="e.g., Mujhe PM-KISAN ke baare mein jankari chahiye"
                      className="flex-1"
                      autoFocus
                    />
                    <Button type="submit" className="whitespace-nowrap">
                      <ArrowRight className="h-4 w-4 mr-1" /> Ask
                    </Button>
                  </div>
                  <p className="mt-3 text-center text-sm text-slate-500">
                    Press <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[0.65rem] font-mono">Enter</kbd> to send
                  </p>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 sm:py-24 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">How It Works</h2>
            <p className="mt-4 text-lg text-slate-600">Three simple steps to get your government work done</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center p-6">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center mb-4">
                <span className="text-3xl font-bold text-indigo-600">1</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Describe Your Need</h3>
              <p className="mt-2 text-slate-600">Type or speak in Hindi, Hinglish, or English. No formal language needed.</p>
            </div>
            <div className="text-center p-6">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-saffron-100 flex items-center justify-center mb-4">
                <span className="text-3xl font-bold text-amber-600">2</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Get Tailored Help</h3>
              <p className="mt-2 text-slate-600">Receive scheme matches, drafted applications, form guidance, or official info.</p>
            </div>
            <div className="text-center p-6">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mb-4">
                <span className="text-3xl font-bold text-emerald-600">3</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Take Action</h3>
              <p className="mt-2 text-slate-600">Download documents, copy RTI drafts, or follow step-by-step form instructions.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-24 bg-slate-900">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <ShieldCheck className="h-10 w-10 mx-auto text-emerald-400 mb-4" />
          <h2 className="text-3xl sm:text-4xl font-bold text-white">Privacy-First by Design</h2>
          <p className="mt-4 text-lg text-slate-300">
            Your personal data never leaves your device unprotected. Aadhaar, PAN, phone numbers, and other
            identifiers are automatically redacted before any cloud processing. Local models handle sensitive turns entirely on-device.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" onClick={() => router.push("/privacy")} variant="secondary" className="border-slate-700 hover:border-emerald-400 hover:text-emerald-400">
              Learn About Privacy
            </Button>
            <Button size="lg" onClick={() => router.push("/chat")}>
              Start Now
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}