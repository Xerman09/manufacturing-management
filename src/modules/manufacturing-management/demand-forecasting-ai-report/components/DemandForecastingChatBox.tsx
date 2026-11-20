"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, Bot, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DemandForecastReportPayload, ChatMessage, ScenarioAssumptions } from "../types";

interface Props {
    payload: DemandForecastReportPayload;
    assumptions: ScenarioAssumptions;
}

const renderFormattedText = (rawText: string) => {
    const lines = rawText.split("\n");
    return lines.map((line, lineIdx) => {
        const trimmed = line.trim();
        if (!trimmed) {
            return <div key={`empty-${lineIdx}`} className="h-2" />;
        }

        // Bullet point detection
        const isBullet =
            trimmed.startsWith("• ") || trimmed.startsWith("- ") || trimmed.startsWith("* ");
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
                <div key={`bullet-${lineIdx}`} className="flex items-start gap-2 my-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-violet-500 mt-1.5 shrink-0" />
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
    "Which SKU has highest stockout risk?",
    "Explain the WAPE and forecast bias",
    "What are the top demand regions?",
    "What production runs are needed?",
    "How many labor hours are required?"
];

export const DemandForecastingChatBox: React.FC<Props> = ({ payload, assumptions }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: "initial-greeting",
            role: "assistant",
            content: `Good day. I am your Executive AI Copilot grounded in the demand forecast, accuracy backtest, and inventory planning data for **${payload.meta.branchLabel}** (${payload.meta.forecastHorizonLabel} outlook).\n\nWhat strategic demand or production planning question would you like to explore?`,
            timestamp: new Date().toISOString(),
            modelUsed: payload.meta.aiTier?.tierName ? `${payload.meta.aiTier.tierName} Copilot` : "Executive Copilot"
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

        console.log("[DemandForecast AI Copilot] Client Query:", {
            question: textToSend,
            assumptions,
            branch: payload.meta.branchLabel,
            horizon: payload.meta.forecastHorizonLabel,
            expectedDemand: payload.kpis.forecastUnits
        });

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
            const res = await fetch(
                "/api/manufacturing/reports/demand-forecasting-ai-report/copilot/chat",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        messages: updatedHistory.map((m) => ({ role: m.role, content: m.content })),
                        reportPayload: payload,
                        assumptions
                    })
                }
            );

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Failed to receive response from AI Copilot.");
            }

            console.log("[DemandForecast AI Copilot] Server Response:", {
                modelUsed: data.modelUsed,
                message: data.message?.content
            });

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

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleSend();
        }
    };

    return (
        <div className="flex flex-col flex-1 h-full min-h-0 bg-background overflow-hidden">
            {/* Quick Prompt Chips */}
            <div className="px-4 py-2.5 border-b border-border/80 bg-muted/20 flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0">
                <span className="text-[10px] uppercase font-bold text-muted-foreground whitespace-nowrap">
                    Suggestions:
                </span>
                {QUICK_PROMPTS.map((prompt, idx) => (
                    <button
                        key={idx}
                        type="button"
                        onClick={() => handleSend(prompt)}
                        disabled={isLoading}
                        className="text-[11px] px-2.5 py-1 rounded-full bg-background border border-border/70 hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/20 text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap cursor-pointer"
                    >
                        {prompt}
                    </button>
                ))}
            </div>

            {/* Error Banner */}
            {error && (
                <div className="mx-4 mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

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
                                <div className="h-7 w-7 rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/20 flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                                    <Bot className="h-4 w-4" />
                                </div>
                            )}

                            <div
                                className={`rounded-2xl px-4 py-3 max-w-[85%] text-xs leading-relaxed shadow-xs ${
                                    isAssistant
                                        ? "bg-card text-foreground border border-border/70"
                                        : "bg-violet-600 text-white"
                                }`}
                            >
                                {isAssistant && (
                                    <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-border/40">
                                        <span className="text-[10px] font-bold text-foreground flex items-center gap-1.5">
                                            Executive Copilot
                                        </span>
                                        <span
                                            className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${
                                                m.modelUsed?.toLowerCase().includes("gemini")
                                                    ? "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/25"
                                                    : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25"
                                            }`}
                                        >
                                            {m.modelUsed?.toLowerCase().includes("gemini")
                                                ? `✨ ${m.modelUsed}`
                                                : "⚙️ Offline Rule Engine"}
                                        </span>
                                    </div>
                                )}
                                <div className="space-y-0.5">{renderFormattedText(m.content)}</div>
                                <div
                                    className={`text-[9px] mt-1.5 text-right ${
                                        isAssistant ? "text-muted-foreground" : "text-violet-200"
                                    }`}
                                >
                                    {new Date(m.timestamp).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit"
                                    })}
                                </div>
                            </div>
                        </div>
                    );
                })}

                {isLoading && (
                    <div className="flex gap-2.5 justify-start">
                        <div className="h-7 w-7 rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/20 flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                            <Bot className="h-4 w-4" />
                        </div>
                        <div className="rounded-2xl px-4 py-3 bg-card text-foreground border border-border/70 text-xs flex items-center gap-2 shadow-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-600 dark:text-violet-400" />
                            <span>Thinking and consulting report context...</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="p-3 border-t border-border/80 bg-background flex items-center gap-2 shrink-0">
                <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isLoading}
                    placeholder="Ask about demand trends, stockout risks, WAPE accuracy, labor..."
                    className="text-xs h-9 rounded-xl flex-1 bg-muted/30 focus-visible:ring-violet-500"
                />
                <Button
                    type="button"
                    onClick={() => handleSend()}
                    disabled={!input.trim() || isLoading}
                    size="sm"
                    className="h-9 px-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white gap-1.5 text-xs shrink-0"
                >
                    <Send className="h-3.5 w-3.5" />
                    <span>Send</span>
                </Button>
            </div>
        </div>
    );
};
