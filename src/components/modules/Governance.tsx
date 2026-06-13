import React, { useState } from 'react';
import { useAudit } from '../../context/AuditContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';
import { BrainCircuit, Info } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../ui/hover-card';
import { LlmCompanion } from '../ui/llm-companion';
import { apiUrl } from '../../lib/api';
import {
  EVIDENCE_OPTIONS,
  OVERRIDE_OPTIONS,
  REVIEWER_OPTIONS,
  SPEED_OPTIONS,
} from '../../lib/governanceOptions';

export function Governance() {
  const { governance, setGovernance, addLlmMessage, llmMessages } = useAudit();
  const [loading, setLoading] = useState(false);
  const governanceLocked = loading || llmMessages.some((message) => message.type === 'governance');

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await axios.post(apiUrl('/api/llm/governance'), { questionnaire: governance });
      addLlmMessage({
        type: 'governance',
        title: 'Governance & Human Oversight Risk',
        content: res.data.summary
      });
      toast.success('Governance review generated.');
    } catch (e: any) {
      toast.error('Failed to generate governance review.', { description: e.response?.data?.error || e.message });
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight uppercase">Governance & Oversight</h2>
        <p className="text-[10px] uppercase opacity-50 tracking-widest mt-1">Challenge the naive assumption that humans fix bias.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
        <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Human Oversight Preparedness</CardTitle>
          <CardDescription>
            {governanceLocked
              ? 'Detail the mechanisms for contesting and overriding automated decisions. This section locks once analysis starts.'
              : 'Detail the mechanisms for contesting and overriding automated decisions.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Who reviews model outputs?</Label>
              <HoverCard>
                <HoverCardTrigger><Info className="w-4 h-4 text-gray-500 hover:text-black cursor-help" /></HoverCardTrigger>
                <HoverCardContent>
                  <p className="font-bold mb-1">What this means:</p>
                  <p className="text-gray-600">The person responsible for catching AI mistakes. "Automation Bias" means humans tend to blindly trust machines.</p>
                  <p className="font-bold mt-2 mb-1">Why it matters:</p>
                  <p className="text-gray-600">A frontline worker under pressure will just click "Agree". An expert has the authority to disagree.</p>
                </HoverCardContent>
              </HoverCard>
            </div>
            <Select onValueChange={(v) => setGovernance({...governance, reviewerId: v})} value={governance.reviewerId} disabled={governanceLocked}>
              <SelectTrigger className="w-full" disabled={governanceLocked}><SelectValue placeholder="Select reviewer" /></SelectTrigger>
              <SelectContent>
                 {REVIEWER_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                 ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Can human reviewers override the system?</Label>
              <HoverCard>
                <HoverCardTrigger><Info className="w-4 h-4 text-gray-500 hover:text-black cursor-help" /></HoverCardTrigger>
                <HoverCardContent>
                  <p className="font-bold mb-1">What this means:</p>
                  <p className="text-gray-600">How much friction is there for a human to say "The AI is wrong"?</p>
                  <p className="font-bold mt-2 mb-1">Why it matters:</p>
                  <p className="text-gray-600">If overriding the AI requires filling out a 3-page form, reviewers will just agree with the AI to save time.</p>
                </HoverCardContent>
              </HoverCard>
            </div>
            <Select onValueChange={(v) => setGovernance({...governance, canOverride: v})} value={governance.canOverride} disabled={governanceLocked}>
              <SelectTrigger className="w-full" disabled={governanceLocked}><SelectValue placeholder="Select override policy" /></SelectTrigger>
              <SelectContent>
                 {OVERRIDE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                 ))}
              </SelectContent>
            </Select>
          </div>

           <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>What evidence is shown to the reviewer?</Label>
              <HoverCard>
                <HoverCardTrigger><Info className="w-4 h-4 text-gray-500 hover:text-black cursor-help" /></HoverCardTrigger>
                <HoverCardContent>
                  <p className="font-bold mb-1">What this means:</p>
                  <p className="text-gray-600">Does the human see the full context, or just the AI's final answer?</p>
                  <p className="font-bold mt-2 mb-1">Why it matters:</p>
                  <p className="text-gray-600">You cannot meaningfully oversee a decision if you don't know *why* the AI made it.</p>
                </HoverCardContent>
              </HoverCard>
            </div>
            <Select onValueChange={(v) => setGovernance({...governance, evidenceShown: v})} value={governance.evidenceShown} disabled={governanceLocked}>
              <SelectTrigger className="w-full" disabled={governanceLocked}><SelectValue placeholder="Select evidence level" /></SelectTrigger>
              <SelectContent>
                 {EVIDENCE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                 ))}
              </SelectContent>
            </Select>
          </div>

           <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Expected speed of decision per case</Label>
              <HoverCard>
                <HoverCardTrigger><Info className="w-4 h-4 text-gray-500 hover:text-black cursor-help" /></HoverCardTrigger>
                <HoverCardContent>
                  <p className="font-bold mb-1">What this means:</p>
                  <p className="text-gray-600">How much time does the human have to review each AI output?</p>
                  <p className="font-bold mt-2 mb-1">Why it matters:</p>
                  <p className="text-gray-600">If a human is expected to review one case every 5 seconds, it is "fake oversight". They are just a rubber stamp.</p>
                </HoverCardContent>
              </HoverCard>
            </div>
            <Select onValueChange={(v) => setGovernance({...governance, speedOfDecision: v})} value={governance.speedOfDecision} disabled={governanceLocked}>
              <SelectTrigger className="w-full" disabled={governanceLocked}><SelectValue placeholder="Select speed" /></SelectTrigger>
              <SelectContent>
                 {SPEED_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                 ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
        </div>

        <div className="sticky top-6 h-[calc(100vh-8rem)]">
          <LlmCompanion 
            title="Governance & Human Oversight Risk"
            description="LLM Evaluation of Automation Bias"
            message={useAudit().llmMessages.find(m => m.type === 'governance')}
            loading={loading}
            action={{
              label: "Generate Oversight Failure Memo",
              onClick: handleSubmit,
              disabled: !governance.reviewerId || !governance.canOverride || !governance.evidenceShown || !governance.speedOfDecision
            }}
          />
        </div>
      </div>
    </div>
  );
}
