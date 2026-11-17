"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, Bot, User, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AIExecutiveReportPayload, ChatMessage } from "../types";

interface Props {
    reportPayload: AIExecutiveReportPayload;
}

const renderFormattedText = (rawText: string) => {
    const lines = rawText.split("\n");
    return lines.map((line, lineIdx) => {
        const trimmed = line.trim();
        if (!trimmed) {
            return <div key={`empty-${lineIdx}`} className="h-2" />;
        }

        // Bullet point detection
        const isBullet = trimmed.startsWith("• ") || trimmed.startsWith("- ") || trimmed.startsWith("* ");
        const cleanLine = isBullet ? trimmed.replace(/^[•\-\*]\s*/, "") : line;

        // Process bold syntax (**text**)
        const parts = cleanLine.split(/(\*\*[^*]+\*\*)/g);
        const formattedLine = parts.map((part, partIdx) => {
            if (part.startsWith("**") && part.endsWith("**")) {
                return (
                    <strong key={`part-${partIdx}`} className="font-bold text-foreground">
                        {part.slice(2, -2)}
                    </strong>
                );
            }
            return part;
        });

        if (isBullet) {
            return (
                <div key={`bullet-${lineIdx}`} className="flex items-start gap-2 my-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-500 mt-1.5 shrink-0" />
                    <span className="leading-relaxed">{formattedLine}</span>
                </div>
            );
        }

        return (
            <p key={`p-${lineIdx}`} className="leading-relaxed my-0.5">
                {formattedLine}
            </p>
        );
    });
};

const QUICK_PROMPTS = [
    "Summarize executive performance",
    "Why is Plant OEE below target?",
    "Review scrap & quality issues",
    "Unplanned equipment downtime review",
    "Material consumption variance"
];

export const ExecutiveChatBox: React.FC<Props> = ({ reportPayload }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: "initial-greeting",
            role: "assistant",
            content: `Good day. I am your Executive AI Copilot grounded in the operational records for **${reportPayload.meta.plantName}** (${reportPayload.meta.reportingPeriod}).\n\nWhat strategic operational or financial query would you like to explore?`,
            timestamp: new Date().toISOString()
        }
    ]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    const handleSend = async (questionText?: string) => {
        const textToSend = questionText || input.trim();
        if (!textToSend || isLoading) return;

        const userMsg: ChatMessage = {
            id: `usr-${Date.now()}`,
            role: "user",
            content: textToSend,
            timestamp: new Date().toISOString()
        };

        const updatedHistory = [...messages, userMsg];
        setMessages(updatedHistory);
        setInput("");
        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch("/api/manufacturing/reports/ai-executive-summary-report/copilot/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: updatedHistory.map((m) => ({ role: m.role, content: m.content })),
                    reportPayload
                })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Failed to receive response from Copilot.");
            }

            if (data.message) {
                setMessages((prev) => [...prev, data.message]);
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Error communicating with AI Copilot.";
            setError(msg);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col flex-1 h-full min-h-0 bg-background overflow-hidden">
            {/* Quick Prompt Chips */}
            <div className="px-4 py-2.5 border-b bg-muted/20 flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0">
                <span className="text-[10px] uppercase font-bold text-muted-foreground whitespace-nowrap">Suggestions:</span>
                {QUICK_PROMPTS.map((prompt, idx) => (
                    <button
                        key={idx}
                        onClick={() => handleSend(prompt)}
                        disabled={isLoading}
                        className="text-[11px] px-2.5 py-1 rounded-full bg-background border border-border/70 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/20 text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
                    >
                        {prompt}
                    </button>
                ))}
            </div>

            {/* Message Stream */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {messages.map((m) => {
                    const isAssistant = m.role === "assistant";
                    return (
                        <div
                            key={m.id}
                            className={`flex gap-2.5 ${isAssistant ? "justify-start" : "justify-end"}`}
                        >
                            {isAssistant && (
                                <div className="h-7 w-7 rounded-xl bg-purple-600/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/20 flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                                    <Bot className="h-4 w-4" />
                                </div>
                            )}

                            <div
                                className={`rounded-2xl px-4 py-3 max-w-[85%] text-xs leading-relaxed shadow-xs ${
                                    isAssistant
                                        ? "bg-card text-foreground border border-border/70"
                                        : "bg-purple-600 text-white"
                                }`}
                            >
                                <div className="space-y-0.5">{renderFormattedText(m.content)}</div>
                                <div
                                    className={`text-[9px] mt-1.5 text-right ${
                                        isAssistant ? "text-muted-foreground" : "text-purple-200"
                                    }`}
                                >
                                    {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </div>
                            </div>

                            {!isAssistant && (
                                <div className="h-7 w-7 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                                    <User className="h-4 w-4" />
                                </div>
                            )}
                        </div>
                    );
                })}

                {isLoading && (
                    <div className="flex gap-2.5 items-center text-xs text-muted-foreground">
                        <div className="h-7 w-7 rounded-full bg-purple-600/20 text-purple-600 flex items-center justify-center shrink-0">
                            <Bot className="h-4 w-4 animate-spin" />
                        </div>
                        <div className="bg-muted/50 border rounded-lg px-3 py-2 italic text-muted-foreground">
                            Synthesizing grounded response...
                        </div>
                    </div>
                )}

                {error && (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-xs">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="p-3 bg-background border-t shrink-0">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleSend();
                    }}
                    className="flex items-center gap-2"
                >
                    <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask a question about this period's plant performance..."
                        disabled={isLoading}
                        className="text-xs h-9 bg-muted/40 focus-visible:ring-purple-500 rounded-lg"
                    />
                    <Button
                        type="submit"
                        size="sm"
                        disabled={!input.trim() || isLoading}
                        className="h-9 px-3.5 bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-1.5 shrink-0 rounded-lg"
                    >
                        <Send className="h-3.5 w-3.5" />
                        <span>Send</span>
                    </Button>
                </form>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1.5 px-0.5">
                    <span>Press Enter to send</span>
                    <span>Powered by Gemini AI Operations Intelligence</span>
                </div>
            </div>
        </div>
    );
};
