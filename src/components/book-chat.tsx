"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Sparkles, Loader2 } from "lucide-react";

export type ChatMsg = { role: "user" | "assistant"; content: string };

export function BookChat({ bookId }: { bookId: string }): React.ReactElement {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scroller.current) {
      scroller.current.scrollTop = scroller.current.scrollHeight;
    }
  }, [messages, busy]);

  async function send(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    const next: ChatMsg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch(`/api/chat/${bookId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not reach the chat service.");
      } else {
        setMessages([
          ...next,
          { role: "assistant", content: data.reply ?? "" },
        ]);
      }
    } catch (err) {
      setError(`Network error: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[480px] flex-col rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b p-3 text-sm font-medium">
        <Sparkles className="h-4 w-4" />
        Ask about this book
        <span className="ml-auto text-xs text-muted-foreground">
          Scoped to this title only
        </span>
      </div>
      <div
        ref={scroller}
        className="flex-1 space-y-2 overflow-y-auto p-3"
      >
        {messages.length === 0 && !error && (
          <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            Try: <em>"Who wrote this?"</em>,{" "}
            <em>"What's the subject?"</em>, or{" "}
            <em>"What is this book about?"</em>.
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-auto max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                : "mr-auto max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm"
            }
          >
            {m.content}
          </div>
        ))}
        {busy && (
          <div className="mr-auto flex max-w-[85%] items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> thinking…
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
      </div>
      <form onSubmit={send} className="flex items-center gap-2 border-t p-3">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about this book…"
          disabled={busy}
        />
        <Button type="submit" size="icon" disabled={busy || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
