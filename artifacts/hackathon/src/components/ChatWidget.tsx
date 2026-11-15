import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Loader2, MessageCircle, Send, X } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string; error?: boolean };

const MAX_MESSAGE_CHARS = 500; // matches the server's limit
const MAX_HISTORY = 10; // matches the server's limit

const GREETING: Message = {
  role: "assistant",
  content:
    "Hi! Ask me about BuilderWars: the schedule, rules, prizes, parking, or how to submit. I answer from the official participant guide.",
};

// What the server accepts: the last few real messages, starting with a user
// message. The greeting and error notices are never sent.
function toHistory(messages: Message[]) {
  const history = messages
    .filter((m) => m !== GREETING && !m.error)
    .slice(-MAX_HISTORY)
    .map(({ role, content }) => ({ role, content }));
  while (history.length && history[0].role !== "user") history.shift();
  return history;
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages, loading, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);

    let answer: Message;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: toHistory(next) }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        reply?: string;
        error?: string;
      };
      answer =
        response.ok && data.reply
          ? { role: "assistant", content: data.reply }
          : {
              role: "assistant",
              error: true,
              content:
                data.error ??
                "Something went wrong. Please email awssbg@wayne.edu.",
            };
    } catch {
      answer = {
        role: "assistant",
        error: true,
        content: "Couldn't reach the server. Please email awssbg@wayne.edu.",
      };
    }
    setMessages([...next, answer]);
    setLoading(false);
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      {open && (
        <div
          role="dialog"
          aria-label="BuilderWars help chat"
          className="panel flex h-[min(480px,calc(100vh-120px))] w-[min(360px,calc(100vw-40px))] flex-col overflow-hidden shadow-2xl"
          data-testid="chat-panel"
        >
          <div className="flex items-center justify-between border-b border-[#2a3039] px-4 py-3">
            <span className="text-sm font-semibold text-[#f7f4ed]">
              BuilderWars help
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="text-[#7d848e] hover:text-[#f7f4ed]"
              data-testid="button-chat-close"
            >
              <X size={18} />
            </button>
          </div>

          <div
            className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
            aria-live="polite"
          >
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm leading-6 ${
                  m.role === "user"
                    ? "self-end bg-[#7c3aed] text-white"
                    : m.error
                      ? "self-start border border-[#7d3b2c] bg-[#111418] text-[#ff9f85]"
                      : "self-start border border-[#2a3039] bg-[#111418] text-[#e7e5df]"
                }`}
                data-testid={`chat-message-${i}`}
              >
                {m.content}
              </div>
            ))}
            {loading && (
              <div className="self-start text-[#a78bfa]" role="status">
                <Loader2 size={16} className="animate-spin" />
                <span className="sr-only">Thinking</span>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={send}
            className="flex gap-2 border-t border-[#2a3039] p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={MAX_MESSAGE_CHARS}
              placeholder="Ask a question"
              aria-label="Your question"
              className="field !mt-0 min-w-0 flex-1"
              data-testid="input-chat"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send question"
              className="btn btn-primary !min-h-[44px] !px-3 disabled:opacity-50"
              data-testid="button-chat-send"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close help chat" : "Open help chat"}
        aria-expanded={open}
        className="btn btn-primary !min-h-[52px] !rounded-full shadow-lg"
        data-testid="button-chat-toggle"
      >
        {open ? <X size={20} /> : <MessageCircle size={20} />}
        {!open && <span>Help</span>}
      </button>
    </div>
  );
}

export default ChatWidget;
