"use client";

import { AlertCircle, LoaderCircle, Send, Sparkles } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { BottomSheet } from "@/components/common/BottomSheet";

interface AssistantSheetProps {
  open: boolean;
  onClose: () => void;
  context?: "restaurant" | "dish";
}

interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
}

const quickQuestions = ["How spicy is this?", "Compare these dishes", "Best order for 2", "Ask about peanuts"];

function mockAnswer(question: string): string {
  const normalized = question.toLowerCase();
  if (normalized.includes("peanut")) return "I have a peanut allergy. Could you confirm whether this dish contains peanuts or may have cross-contact with peanuts?";
  if (normalized.includes("spicy") || normalized.includes("spice")) return "Khao Soi is usually mildly to moderately spicy, but exact heat varies. The demo evidence suggests mild heat here; ask staff if you need it less spicy.";
  if (normalized.includes("compare")) return "Khao Soi is richer, noodle-based, and mildly spicy. Green Curry is more herbal, often hotter, and works well with rice. Choose Khao Soi for the signature experience or Green Curry for a herbal profile.";
  if (normalized.includes("2") || normalized.includes("two") || normalized.includes("order")) return "For two, try Khao Soi, Sai Ua to share, and Mango Sticky Rice. This demo order covers creamy, grilled, savory, and sweet flavors.";
  return "I can compare dishes, explain spice and textures, build an order, or draft a question for staff using the demo data shown in Foodseyo.";
}

export function AssistantSheet({ open, onClose, context = "restaurant" }: AssistantSheetProps) {
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, role: "assistant", text: context === "dish" ? "Ask a follow-up about this dish. I’ll use the information already shown." : "Ask a focused question about this restaurant or your order." },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageId = useRef(2);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, sending]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const sendQuestion = (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || sending) return;
    setError(null);
    setMessages((current) => [...current, { id: messageId.current++, role: "user", text: trimmed }]);
    setInput("");
    setSending(true);
    timerRef.current = setTimeout(() => {
      if (trimmed.toLowerCase().includes("demo error")) {
        setError("The demo assistant couldn’t send that message. Please try a quick question.");
        setSending(false);
        return;
      }
      setMessages((current) => [...current, { id: messageId.current++, role: "assistant", text: mockAnswer(trimmed) }]);
      setSending(false);
    }, 650);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    sendQuestion(input);
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="AI Assistant"
      description="Support for focused questions the structured screens don’t cover."
      panelClassName="h-[88dvh]"
      contentClassName="flex flex-col overflow-hidden"
    >
      <div className="scrollbar-none -mx-1 flex shrink-0 gap-2 overflow-x-auto px-1 pb-4 pt-4">
        {quickQuestions.map((question) => (
          <button key={question} type="button" onClick={() => sendQuestion(question)} disabled={sending} className="min-h-11 shrink-0 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-xs font-semibold disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)]">{question}</button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-2" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[88%] rounded-[18px] px-4 py-3 text-sm leading-5 ${message.role === "user" ? "rounded-br-md bg-[var(--primary)] text-white" : "rounded-bl-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"}`}>
              {message.role === "assistant" ? <Sparkles aria-hidden="true" className="mb-2 text-[var(--accent)]" size={16} /> : null}
              {message.text}
            </div>
          </div>
        ))}
        {sending ? <div className="flex justify-start"><div className="flex items-center gap-2 rounded-[18px] rounded-bl-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-secondary)]"><LoaderCircle aria-hidden="true" className="soft-spin" size={16} />Drafting a demo response…</div></div> : null}
        {error ? <div role="alert" className="flex items-start gap-2 rounded-2xl bg-[var(--soft-orange)] p-3 text-sm text-[#8c4323]"><AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={17} />{error}</div> : null}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="safe-bottom -mx-5 mt-3 shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-5 pt-3">
        <label htmlFor="assistant-input" className="sr-only">Ask anything about this restaurant</label>
        <div className="flex items-end gap-2 rounded-[20px] border border-[var(--border-strong)] bg-[var(--surface)] p-2">
          <textarea
            ref={inputRef}
            id="assistant-input"
            rows={1}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onFocus={() => window.setTimeout(() => inputRef.current?.scrollIntoView({ block: "nearest" }), 150)}
            placeholder="Ask anything about this restaurant"
            className="max-h-24 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-3 outline-none"
          />
          <button type="submit" disabled={!input.trim() || sending} aria-label="Send question" className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--primary)] text-white disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)]"><Send aria-hidden="true" size={18} /></button>
        </div>
      </form>
    </BottomSheet>
  );
}
