"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, Bot, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { QualityReportPayload, ChatMessage } from "../types";

interface QualityChatBoxProps {
    payload: QualityReportPayload;
}

const renderFormattedText = (rawText: string) => {
    const lines = rawText.split("\n");
    return lines.map((line, lineIdx) => {
        const trimmed = line.trim();
        if (!trimmed) {
            return <div key={`empty-${lineIdx}`} className="h-2" />;
        }

        const isBullet =
            trimmed.startsWith("• ") || trimmed.startsWith("- ") || trimmed.startsWith("* ");
        const cleanLine = isBullet ? trimmed.replace(/^[•\-\*]\s*/, "") : line;

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
                <div key={`bullet-${lineIdx}`} className="flex items-start gap-2 my-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                    <span className="leading-relaxed">{formattedLine}</span>
                </div>
            );
        }

        return (
            <p key={`p-${lineIdx}`} className="leading-relaxed my-1">
                {formattedLine}
            </p>
        );
    });
};

const QUICK_PROMPTS = [
    "What is our primary defect driver?",
    "Which shift has the highest failure rate?",
    "Are any raw material lots correlated with defects?",
    "Which job orders are currently on QA hold?",
    "What containment actions should we take immediately?"
];

export const QualityChatBox: React.FC<QualityChatBoxProps> = ({ payload }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: "welcome",
            role: "assistant",
            content:
                "Hello, I am your **Quality Intelligence AI Copilot**. Ask me anything about your Job Order defect Pareto, First Pass Yield (FPY), scrap causes, or lot genealogy traces.",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        }
    ]);
    const [inputValue, setInputValue] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isSending]);

    const handleSendMessage = async (textToSend?: string) => {
        const text = textToSend || inputValue.trim();
        if (!text || isSending) return;

        const userMsg: ChatMessage = {
            id: `user-${Date.now()}`,
            role: "user",
            content: text,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        };

        const updatedMessages = [...messages, userMsg];
        setMessages(updatedMessages);
        setInputValue("");
        setIsSending(true);
        setError(null);

        try {
            const res = await fetch(
                "/api/manufacturing/reports/quality-intelligence-report/ai-analysis/chat",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        messages: updatedMessages.map((m) => ({
                            role: m.role,
                            content: m.content
                        })),
                        reportPayload: payload
                    })
                }
            );

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP ${res.status}`);
            }

            const data = await res.json();
            const botMsg: ChatMessage = {
                id: `bot-${Date.now()}`,
                role: "assistant",
                content: data.reply || "No response received.",
                timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                modelUsed: data.modelUsed
            };

            setMessages((prev) => [...prev, botMsg]);
        } catch (err: unknown) {
            const msg = (err as Error)?.message || "Failed to get AI response.";
            setError(msg);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="flex flex-col flex-1 h-full min-h-0 rounded-2xl border border-border/70 bg-card overflow-hidden shadow-xs">
            {/* Messages Stream Area */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3.5 text-xs">
                {messages.map((m) => (
                    <div
                        key={m.id}
                        className={`flex flex-col ${
                            m.role === "user" ? "items-end" : "items-start"
                        }`}
                    >
                        <div
                            className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-sm leading-relaxed ${
                                m.role === "user"
                                    ? "bg-primary text-primary-foreground rounded-br-none"
                                    : "bg-muted/60 text-foreground border border-border/60 rounded-bl-none"
                            }`}
                        >
                            {m.role === "assistant" && (
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 mb-1">
                                    <Bot className="h-3 w-3" />
                                    AI Insight
                                </div>
                            )}
                            <div>{renderFormattedText(m.content)}</div>
                            <div
                                className={`text-[9px] mt-1 text-right ${
                                    m.role === "user"
                                        ? "text-primary-foreground/70"
                                        : "text-muted-foreground"
                                }`}
                            >
                                {m.timestamp}
                            </div>
                        </div>
                    </div>
                ))}

                {isSending && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground p-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                        <span>Analyzing Job Order telemetry...</span>
                    </div>
                )}

                {error && (
                    <div className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 p-2 bg-rose-500/10 rounded-lg">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Quick Prompts */}
            <div className="px-3 py-2 border-t border-border/40 bg-muted/20 flex flex-wrap gap-1.5 shrink-0">
                {QUICK_PROMPTS.map((prompt, idx) => (
                    <button
                        key={idx}
                        type="button"
                        onClick={() => handleSendMessage(prompt)}
                        disabled={isSending}
                        className="text-[10px] font-medium px-2.5 py-1 rounded-full border border-border/70 bg-background hover:bg-accent hover:text-accent-foreground transition-colors truncate max-w-[240px] cursor-pointer"
                    >
                        {prompt}
                    </button>
                ))}
            </div>

            {/* Input Bar */}
            <div className="p-3 border-t border-border/60 bg-background flex items-center gap-2 shrink-0">
                <Input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                        }
                    }}
                    placeholder="Ask about defect trends, FPY, lots, QA hold..."
                    disabled={isSending}
                    className="h-9 text-xs flex-1 rounded-xl"
                />
                <Button
                    type="button"
                    size="sm"
                    onClick={() => handleSendMessage()}
                    disabled={!inputValue.trim() || isSending}
                    className="h-9 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                >
                    <Send className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    );
};
