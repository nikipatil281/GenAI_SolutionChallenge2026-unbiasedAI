import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { MessageSquareMore, Send, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { apiUrl } from '../../lib/api';
import type { ModelAuditSnapshot } from '../../lib/modelAuditStorage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
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

  useEffect(() => {
    setMessages([]);
    setDraft('');
  }, [snapshot?.createdAt, snapshot?.documentLabel]);

  const chatReady = Boolean(snapshot && (snapshot.readinessMemo || snapshot.executionResult));

  const handleSend = async () => {
    if (!draft.trim() || !snapshot || !chatReady) {
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
    <div className="space-y-6 pb-20">
      <Card>
        <CardHeader>
          <CardTitle>AI Audit Copilot</CardTitle>
          <CardDescription>
            Ask questions about this model-validation run, its fairness gaps, or what the execution results mean.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="rounded-xl border border-[#141414]/10 bg-white p-4">
            <p className="text-[10px] uppercase tracking-widest opacity-50">Current context</p>
            <p className="mt-1 font-semibold">{snapshot.documentLabel}</p>
            <p className="mt-1 text-[#141414]/65">
              {snapshot.executionResult
                ? `Executable audit available for ${snapshot.executionResult.rowCount} scored rows.`
                : 'Readiness memo available, but no executable audit has been saved for this snapshot yet.'}
            </p>
          </div>

          {!chatReady && (
            <div className="rounded-xl border border-dashed border-[#141414]/15 bg-white px-4 py-6 text-[#141414]/60">
              This AI chat unlocks once the run has at least a readiness memo or an executable audit result.
            </div>
          )}

          {messages.length === 0 && chatReady && (
            <div className="rounded-xl border border-[#141414]/10 bg-[#141414]/[0.03] px-4 py-4 text-[#141414]/65">
              Try asking: “Which protected group looks most disadvantaged?” or “What does the error-rate gap mean here?”
            </div>
          )}

          <div className="space-y-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`rounded-2xl border px-4 py-3 ${
                  message.role === 'assistant'
                    ? 'border-[#141414]/10 bg-white'
                    : 'border-[#F27D26]/30 bg-[#F27D26]/10'
                }`}
              >
                <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] opacity-60">
                  {message.role === 'assistant' ? (
                    <>
                      <Sparkles className="h-3 w-3" />
                      BiasScope AI
                    </>
                  ) : (
                    'You'
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm text-[#141414]/80">{message.content}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-[#141414]/10 bg-white p-4">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask about fairness gaps, model predictions, or what the saved audit means."
              className="min-h-28"
              disabled={!chatReady || sending}
            />
            <div className="mt-3 flex justify-end">
              <Button onClick={handleSend} disabled={!draft.trim() || !chatReady || sending}>
                <Send className="mr-2 h-4 w-4" />
                {sending ? 'Thinking...' : 'Send'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
