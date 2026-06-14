import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import Markdown from 'react-markdown';
import { MessageSquareMore, Send, Sparkles, Loader2, User, Bot } from 'lucide-react';
import { toast } from 'sonner';
import { apiUrl } from '../../lib/api';
import { cn } from '../../lib/utils';
import type { ModelAuditSnapshot } from '../../lib/modelAuditStorage';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';

type ModelChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

interface ModelAuditChatProps {
  snapshot: ModelAuditSnapshot | null;
}

export function ModelAuditChat({ snapshot }: ModelAuditChatProps) {
  const [messages, setMessages] = useState<ModelChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessages([]);
    setDraft('');
  }, [snapshot?.createdAt, snapshot?.documentLabel]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const chatReady = Boolean(snapshot && (snapshot.readinessMemo || snapshot.executionResult));

  const handleSend = async () => {
    if (!draft.trim() || !snapshot || !chatReady || sending) {
      return;
    }

    const nextUserMessage: ModelChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: draft.trim(),
    };

    setMessages((current) => [...current, nextUserMessage]);
    setDraft('');
    setSending(true);

    try {
      const response = await axios.post(apiUrl('/api/agent/model-chat'), {
        message: nextUserMessage.content,
        context: snapshot,
        history: messages,
      });

      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: response.data.response,
        },
      ]);
    } catch (error: any) {
      toast.error('Model audit chat failed.', { description: error.response?.data?.error || error.message });
    } finally {
      setSending(false);
    }
  };

  if (!snapshot) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center">
        <Card className="max-w-xl">
          <CardContent className="py-12 text-center text-[#141414]/60">
            <MessageSquareMore className="mx-auto mb-4 h-12 w-12 opacity-20" />
            <p className="font-semibold text-[#141414]/70">No model audit context open.</p>
            <p className="mt-2 text-sm">Open the current run, a past run, or a versioned snapshot to chat about it.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="pb-20">
      <div className="flex flex-col overflow-hidden rounded-[28px] border border-[#141414] bg-white shadow-[8px_8px_0px_#141414] min-h-[600px]">
        <div className="border-b border-[#141414] px-6 py-5 bg-[#FCFBF9]">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-[#F27D26]/30 bg-[#F27D26]/10 p-3 text-[#F27D26]">
              <MessageSquareMore className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold uppercase tracking-tight">AI Audit Copilot</h2>
              <p className="text-[10px] uppercase tracking-[0.28em] text-[#141414]/50">
                Ask about fairness gaps, predictions, or context
              </p>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-[#141414]/10 bg-white p-4">
            <p className="text-[10px] uppercase tracking-widest opacity-50">Current context</p>
            <p className="mt-1 font-semibold text-sm">{snapshot.documentLabel}</p>
            <p className="mt-1 text-sm text-[#141414]/65">
              {snapshot.executionResult
                ? `Executable audit available for ${snapshot.executionResult.rowCount} scored rows.`
                : 'Readiness memo available, but no executable audit has been saved for this snapshot yet.'}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 bg-white min-h-[300px]">
          {!chatReady ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Bot className="mb-4 h-14 w-14 text-[#141414]/15" />
              <h3 className="text-lg font-bold uppercase tracking-tight">Chat Unlocks After Execution</h3>
              <p className="mt-3 max-w-md text-sm leading-6 text-[#141414]/55">
                Complete the readiness memo or model execution first.
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center py-12">
              <div className="rounded-full border border-[#F27D26]/20 bg-[#F27D26]/10 p-5 text-[#F27D26]">
                <Sparkles className="h-10 w-10" />
              </div>
              <h3 className="mt-6 text-2xl font-bold uppercase tracking-tight">Ask Anything About This Model Audit</h3>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#141414]/60">
                Try asking: “Which protected group looks most disadvantaged?” or “What does the error-rate gap mean here?”
              </p>
            </div>
          ) : (
            <div className="mx-auto flex max-w-4xl flex-col gap-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex",
                    message.role === 'user' ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-3xl border px-5 py-4 shadow-sm",
                      message.role === 'user'
                        ? "border-[#141414] bg-[#141414] text-[#E4E3E0]"
                        : "border-[#141414]/15 bg-[#FCFBF9] text-[#141414]"
                    )}
                  >
                    <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] opacity-60">
                      {message.role === 'user' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                      <span>{message.role === 'user' ? 'You' : 'BiasScope AI'}</span>
                    </div>
                    {message.role === 'assistant' ? (
                      <div className="prose prose-sm max-w-none text-[#141414] prose-headings:uppercase prose-headings:tracking-wider prose-a:text-[#F27D26]">
                        <Markdown>{message.content}</Markdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                    )}
                  </div>
                </div>
              ))}

              {sending && (
                <div className="flex justify-start">
                  <div className="rounded-3xl border border-[#141414]/15 bg-[#FCFBF9] px-5 py-4 text-[#141414] shadow-sm">
                    <div className="flex items-center gap-3 text-sm text-[#141414]/60">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analyzing model execution...
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="border-t border-[#141414]/10 bg-[#FCFBF9] px-6 py-5">
          <div className="mx-auto max-w-4xl">
            <div className="rounded-[24px] border border-[#141414] bg-white p-3 shadow-[4px_4px_0px_#141414]">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder="Ask about fairness gaps, model predictions, or what the saved audit means..."
                className="min-h-[88px] resize-none border-0 px-2 py-2 shadow-none focus-visible:ring-0"
                disabled={!chatReady || sending}
              />
              <div className="mt-3 flex items-center justify-between gap-3 px-2 pb-1">
                <p className="text-xs text-[#141414]/45">
                  Press Enter to send, Shift+Enter for a new line.
                </p>
                <Button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={!draft.trim() || sending || !chatReady}
                  className="min-w-[132px]"
                >
                  {sending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Thinking...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Send
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
