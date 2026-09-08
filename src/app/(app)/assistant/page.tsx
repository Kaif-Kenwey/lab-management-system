"use client";

import { useEffect, useRef, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { BadgeInfo, Lock, Send, Sparkles, TriangleAlert } from "lucide-react";
import { apiFetch, apiJson } from "@/lib/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";

type Me = { session: { userId: string; role: string; name: string }; permissions: string[] };
type Source = { title?: string; label?: string; href: string };
type AssistantResponse = { answer: string; sources?: Source[]; disclaimer?: string };

type Message =
  | { role: "user"; text: string }
  | { role: "assistant"; answer: string; sources: Source[]; disclaimer: string };

const SUGGESTIONS = [
  "Which equipment has the highest downtime?",
  "Which items should we reorder?",
  "Summarize unresolved incidents",
  "Which labs are underutilized?",
  "Generate a monthly operations summary",
];

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 py-2" role="status" aria-label="Assistant is typing">
      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60" />
    </div>
  );
}

function AssistantInner() {
  const me = useQuery<Me>({ queryKey: ["me"], queryFn: () => apiFetch<Me>("/api/auth/me") });
  const allowed = (me.data?.permissions ?? []).includes("assistant.use");

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  if (me.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="AI Assistant" description="Ask questions about your labs, powered by live data." />
        <Card>
          <CardContent className="space-y-3 p-6">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="space-y-6">
        <PageHeader title="AI Assistant" description="Ask questions about your labs, powered by live data." />
        <EmptyState
          icon={Lock}
          title="Assistant access restricted"
          description="The AI assistant is available to staff roles. Ask an administrator if you need access."
        />
      </div>
    );
  }

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || pending) return;
    setError(null);
    setInput("");
    setMessages((m) => [...m, { role: "user", text: trimmed }]);
    setPending(true);
    try {
      const res = await apiJson<AssistantResponse>("/api/assistant", "POST", { question: trimmed });
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          answer: res.answer ?? "No answer was returned.",
          sources: res.sources ?? [],
          disclaimer: res.disclaimer ?? "AI-generated insight",
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The assistant could not answer right now.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Assistant"
        description="Ask questions about your labs, powered by live organizational data."
        actions={
          <Badge
            variant="outline"
            className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 whitespace-nowrap"
          >
            <BadgeInfo className="h-3.5 w-3.5" aria-hidden="true" />
            AI-generated insight — verify against live data
          </Badge>
        }
      />

      <Card className="flex h-[calc(100vh-16rem)] min-h-96 flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            Lab operations copilot
          </CardTitle>
          <CardDescription>
            Answers are grounded in your organization&apos;s data — reservations, stock, incidents, maintenance and more.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4 pt-0">
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-lg border bg-muted/30 p-3">
            {messages.length === 0 && !pending ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <p className="text-sm text-muted-foreground">Start with one of these questions:</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => ask(s)}
                      className="rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
                      {m.text}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex justify-start">
                    <div className="max-w-[90%] space-y-2 rounded-2xl rounded-bl-sm border bg-background px-3.5 py-2.5">
                      <p className="whitespace-pre-wrap text-sm">{m.answer}</p>
                      {m.sources.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 border-t pt-2">
                          {m.sources.map((s, idx) => (
                            <a
                              key={`${s.href}-${idx}`}
                              href={s.href}
                              className="rounded-full border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                              {s.title ?? s.label ?? s.href}
                            </a>
                          ))}
                        </div>
                      ) : null}
                      <p className="text-[11px] text-muted-foreground">{m.disclaimer}</p>
                    </div>
                  </div>
                )
              )
            )}
            {pending ? (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm border bg-background px-3.5">
                  <TypingDots />
                </div>
              </div>
            ) : null}
          </div>

          {error ? (
            <Alert variant="destructive">
              <TriangleAlert className="h-4 w-4" aria-hidden="true" />
              <AlertDescription className="flex items-center justify-between gap-2">
                <span>{error}</span>
                <button type="button" onClick={() => setError(null)} className="text-xs font-medium underline">
                  Dismiss
                </button>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.slice(0, 3).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={pending}
                  onClick={() => ask(s)}
                  className="rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask(input);
                  }
                }}
                rows={2}
                placeholder="Ask about downtime, stock, incidents, utilization..."
                aria-label="Ask the assistant a question"
                className="min-h-0 flex-1 resize-none"
              />
              <Button onClick={() => ask(input)} disabled={pending || !input.trim()} aria-label="Send question">
                {pending ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
                ) : (
                  <Send className="h-4 w-4" aria-hidden="true" />
                )}
                Send
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AssistantPage() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <AssistantInner />
    </QueryClientProvider>
  );
}
