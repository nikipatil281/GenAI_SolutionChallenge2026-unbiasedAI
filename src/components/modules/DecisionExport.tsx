import React, { useState } from 'react';
import { useAudit } from '../../context/AuditContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { BrainCircuit, AlertOctagon, CheckCircle2, AlertTriangle, FileJson, Info, Wand2, FileStack } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../ui/hover-card';
import { apiUrl } from '../../lib/api';

export function DecisionExport() {
  const { problemFraming, datasetStats, fairnessMetrics, subgroups, governance, systemDecision, setSystemDecision, llmMessages, setActiveModule, remediationResult, saveCurrentVersion, buildCurrentSnapshot, saveSnapshotAsAuditRun, currentAuditRunId, findVersionEntryByAuditRunId, setSelectedVersionId } = useAudit();
  const [loading, setLoading] = useState(false);
  const completedMemoTypes = new Set(llmMessages.map((message) => message.type));
  const decisionReadiness = [
    { label: 'deterministic scan', ready: Boolean(datasetStats) },
    { label: 'project setup review', ready: completedMemoTypes.has('project-setup') },
    { label: 'proxy review', ready: completedMemoTypes.has('proxy') },
    { label: 'fairness and subgroup review', ready: completedMemoTypes.has('subgroup') },
    { label: 'governance review', ready: completedMemoTypes.has('governance') },
  ];
  const missingDecisionSteps = decisionReadiness.filter((step) => !step.ready);
  const readyForDecision = missingDecisionSteps.length === 0;

  const handleGenerateDecision = async () => {
    setLoading(true);
    try {
      const context = {
        problemFraming,
        datasetStatsSummary: datasetStats ? "Dataset loaded" : "No data",
        fairnessMetricsSummary: fairnessMetrics,
        subgroupRisks: subgroups ? Object.keys(subgroups).length + " subgroups analyzed" : "None",
        governance,
        llmFindings: llmMessages.map(m => m.title)
      };

      const res = await axios.post(apiUrl('/api/llm/decision'), { context });
      setSystemDecision(res.data);
      saveSnapshotAsAuditRun(buildCurrentSnapshot({ systemDecision: res.data }));
      toast.success('Final decision recommendation generated.');
    } catch (e: any) {
      toast.error('Failed to generate decision.', { description: e.message });
    }
    setLoading(false);
  };

  const handleExport = () => {
    const exportData = {
      problemFraming,
      fairnessMetrics,
      governance,
      llmMessages,
      systemDecision,
      remediationResult
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'BiasScope_Audit_Report.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleMoveToVersioning = () => {
    const existingVersion = currentAuditRunId ? findVersionEntryByAuditRunId(currentAuditRunId) : null;
    if (existingVersion) {
      const shouldCreateAnother = window.confirm(
        'This audit run already has an entry in Versioning. Do you want to create another versioning instance for the same document?'
      );
      if (!shouldCreateAnother) {
        setSelectedVersionId(existingVersion.id);
        setActiveModule('versioning');
        toast.message('Opened the existing versioning entry for this audit run.');
        return;
      }
    }

    const created = saveCurrentVersion();
    if (!created) {
      toast.error('Create the final decision first so BiasScope can save a versioned snapshot.');
      return;
    }
    setActiveModule('versioning');
    toast.success('Version snapshot saved.', { description: 'The whole audit run is now stored in Versioning for before/after comparison.' });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold tracking-tight uppercase">Final Decision & Export</h2>
          <p className="text-[10px] uppercase opacity-50 tracking-widest mt-1">Aggregate findings into a firm deployment recommendation.</p>
        </div>
        <div className="flex gap-3">
          <HoverCard>
            <HoverCardTrigger>
              <div className="inline-block">
                <Button onClick={handleGenerateDecision} disabled={loading} variant="default">
                   <BrainCircuit className="w-4 h-4 mr-2" />
                   {loading ? 'Synthesizing...' : 'Synthesize Decision'}
                </Button>
              </div>
            </HoverCardTrigger>
            <HoverCardContent align="end" className="w-72">
              <p className="font-bold mb-1">What this does:</p>
              <p className="text-gray-600">Takes all your data, metrics, and LLM memos from the previous steps and makes a final, aggregated GO/NO-GO recommendation for deploying this AI system.</p>
            </HoverCardContent>
          </HoverCard>

          <HoverCard>
            <HoverCardTrigger>
              <div className="inline-block">
                <Button onClick={handleExport} variant="outline" disabled={!systemDecision}>
                   <FileJson className="w-4 h-4 mr-2" />
                   Export JSON
                </Button>
              </div>
            </HoverCardTrigger>
            <HoverCardContent align="end" className="w-64">
              <p className="font-bold mb-1">What this does:</p>
              <p className="text-gray-600">Downloads a complete, machine-readable audit trail of everything you found. Perfect for compliance teams or legal review.</p>
            </HoverCardContent>
          </HoverCard>
        </div>
      </div>

      {systemDecision ? (
        <Card className={`border-l-8 ${
          systemDecision.status === 'Red' ? 'border-l-red-500 bg-red-50/30' :
          systemDecision.status === 'Amber' ? 'border-l-amber-500 bg-amber-50/30' :
          'border-l-green-500 bg-green-50/30'
        }`}>
          <CardHeader>
            <div className="flex items-center gap-3">
              {systemDecision.status === 'Red' && <AlertOctagon className="w-8 h-8 text-red-500" />}
              {systemDecision.status === 'Amber' && <AlertTriangle className="w-8 h-8 text-amber-500" />}
              {systemDecision.status === 'Green' && <CheckCircle2 className="w-8 h-8 text-green-500" />}
              <div>
                <CardTitle className="text-2xl">
                  {systemDecision.status === 'Red' ? 'DO NOT DEPLOY' :
                   systemDecision.status === 'Amber' ? 'LIMITED PILOT / REDESIGN' :
                   'DEPLOY WITH SAFEGUARDS'}
                </CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h4 className="font-semibold text-gray-900 mb-1">Rationale</h4>
              <p className="text-gray-700">{systemDecision.rationale}</p>
            </div>
            
            <div className="grid grid-cols-2 gap-6">
               <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Recommended Actions</h4>
                  <ul className="list-disc pl-5 text-gray-700 space-y-1 text-sm">
                    {systemDecision.recommendedActions?.map((act: string, i: number) => <li key={i}>{act}</li>)}
                  </ul>
               </div>
               <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Unresolved Questions</h4>
                  <ul className="list-disc pl-5 text-gray-700 space-y-1 text-sm">
                    {systemDecision.unresolvedQuestions?.map((act: string, i: number) => <li key={i}>{act}</li>)}
                  </ul>
               </div>
            </div>

            <div className="rounded-xl border border-[#F27D26]/20 bg-[#F27D26]/5 p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-semibold text-gray-900">Next step: Safe Data Actions</h4>
                <p className="text-sm text-gray-700">Open the new post-decision module to preview low-risk dataset transformations with explicit consent gates.</p>
              </div>
              <Button variant="outline" onClick={() => setActiveModule('safe-remediation')}>
                <Wand2 className="w-4 h-4 mr-2" />
                Open Safe Data Actions
              </Button>
            </div>

            <div className="rounded-xl border border-[#141414]/15 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-semibold text-gray-900">Move This Run To Versioning</h4>
                <p className="text-sm text-gray-700">Save the full audit pipeline state so you can compare this original run against future versions.</p>
              </div>
              <Button variant="outline" onClick={handleMoveToVersioning}>
                <FileStack className="w-4 h-4 mr-2" />
                Move To Versioning
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
           <CardContent className="flex flex-col items-center justify-center h-64 text-gray-400">
             <AlertOctagon className="w-12 h-12 mb-4 opacity-20" />
             {readyForDecision ? (
               <>
                 <p className="font-medium text-[#141414]/70">All audit reviews are complete.</p>
                 <p className="mt-2 max-w-md text-center text-sm text-[#141414]/55">
                   Click <span className="font-semibold">Synthesize Decision</span> to generate the final deployment recommendation.
                 </p>
               </>
             ) : (
               <>
                 <p className="font-medium text-[#141414]/70">Decision synthesis is waiting on a few audit steps.</p>
                 <p className="mt-2 max-w-lg text-center text-sm text-[#141414]/55">
                   Complete the following first: {missingDecisionSteps.map((step) => step.label).join(', ')}.
                 </p>
               </>
             )}
           </CardContent>
        </Card>
      )}

    </div>
  );
}
