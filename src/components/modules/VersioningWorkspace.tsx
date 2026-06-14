import React from 'react';
import Markdown from 'react-markdown';
import { Clock3, GitCompareArrows, FileStack, AlertTriangle, Upload } from 'lucide-react';
import { useAudit } from '../../context/AuditContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import type { AuditSnapshot, VersionEntry } from '../../lib/versioning';
import { Button } from '../ui/button';
import Papa from 'papaparse';
import axios from 'axios';
import { apiUrl } from '../../lib/api';
import { toast } from 'sonner';

export const VERSION_STAGES = [
  { id: 'project-setup', label: '01 Project Setup' },
  { id: 'proxy-screening', label: '02 Proxy Screening' },
  { id: 'fairness-metrics', label: '03 Fairness Engine' },
  { id: 'subgroup-audit', label: '04 Intersectional' },
  { id: 'governance', label: '05 Governance Hub' },
  { id: 'decision', label: '06 Decision Expert' },
];

function StageMemo({ snapshot, type, title }: { snapshot: AuditSnapshot; type: string; title: string }) {
  const message = snapshot.llmMessages.find((entry) => entry.type === type);

  if (!message) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-[#141414]/60">No memo was saved for this stage.</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{message.title}</CardTitle>
      </CardHeader>
      <CardContent className="prose prose-sm max-w-none text-[#141414] prose-headings:uppercase prose-headings:text-sm prose-a:text-[#F27D26]">
        <Markdown>{message.content}</Markdown>
      </CardContent>
    </Card>
  );
}

function formatPercent(value?: number) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'N/A';
  }
  return `${(value * 100).toFixed(1)}%`;
}

function ProjectSetupView({ snapshot }: { snapshot: AuditSnapshot }) {
  const stats = snapshot.datasetStats;
  const columns = stats?.columns || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Dataset Overview</CardTitle>
          <CardDescription>Saved when this audit run was moved into versioning.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest opacity-50">Dataset</p>
            <p className="mt-1 font-semibold truncate" title={snapshot.datasetLabel}>{snapshot.datasetLabel}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest opacity-50">Rows</p>
            <p className="mt-1 font-semibold">{stats?.totalRows ?? 'N/A'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest opacity-50">Target</p>
            <p className="mt-1 font-semibold">{snapshot.targetColumn || 'Not set'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest opacity-50">Ground Truth</p>
            <p className="mt-1 font-semibold">{snapshot.groundTruthColumn || 'Not provided'}</p>
          </div>
          <div className="col-span-2">
            <p className="text-[10px] uppercase tracking-widest opacity-50">Protected Columns</p>
            <p className="mt-1 font-semibold">{snapshot.protectedColumns.length > 0 ? snapshot.protectedColumns.join(', ') : 'Not set'}</p>
          </div>
          <div className="col-span-2">
            <p className="text-[10px] uppercase tracking-widest opacity-50">Columns Captured</p>
            <p className="mt-1 text-[#141414]/70">{columns.join(', ') || 'No column metadata saved.'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Problem Framing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p><span className="font-semibold">Task:</span> {snapshot.problemFraming?.taskDescription || 'Not provided'}</p>
          <p><span className="font-semibold">Domain:</span> {snapshot.problemFraming?.domain || 'Not provided'}</p>
          <p><span className="font-semibold">Stakeholders:</span> {snapshot.problemFraming?.stakeholders || 'Not provided'}</p>
          <p><span className="font-semibold">Human Baseline:</span> {snapshot.problemFraming?.humanBaseline || 'Not provided'}</p>
          <p><span className="font-semibold">Benefit:</span> {snapshot.problemFraming?.benefit || 'Not provided'}</p>
        </CardContent>
      </Card>

      <StageMemo snapshot={snapshot} type="project-setup" title="Project Setup Review" />
    </div>
  );
}

function ProxyView({ snapshot }: { snapshot: AuditSnapshot }) {
  const associations = snapshot.associations || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Top Associated Features</CardTitle>
          <CardDescription>Features with the strongest association to the saved target column.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {associations.slice(0, 10).map((association: any) => (
            <div key={association.feature} className="flex items-center justify-between rounded-lg border border-[#141414]/10 bg-white px-3 py-2">
              <span className="font-medium">{association.feature}</span>
              <span>{association.score?.toFixed?.(3) ?? association.score}</span>
            </div>
          ))}
          {associations.length === 0 && <p className="text-[#141414]/60">No association data saved.</p>}
        </CardContent>
      </Card>

      <StageMemo snapshot={snapshot} type="proxy" title="Proxy Legitimacy Review" />
    </div>
  );
}

function FairnessView({ snapshot }: { snapshot: AuditSnapshot }) {
  const fairnessMetrics = snapshot.fairnessMetrics || {};
  const protectedColumns = Object.keys(fairnessMetrics);

  return (
    <div className="space-y-4">
      {protectedColumns.map((column) => {
        const metrics = fairnessMetrics[column];
        return (
          <Card key={column}>
            <CardHeader>
              <CardTitle>{column}</CardTitle>
              <CardDescription>Saved fairness metrics for this protected attribute.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-[10px] uppercase tracking-widest opacity-50">Parity Difference</p>
                <p className="mt-1 font-semibold">{formatPercent(metrics.demographicParityDifference)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest opacity-50">Parity Ratio</p>
                <p className="mt-1 font-semibold">{formatPercent(metrics.demographicParityRatio)}</p>
              </div>
              {metrics.equalOpportunityDifference !== undefined && (
                <>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest opacity-50">Equal Opportunity Diff</p>
                    <p className="mt-1 font-semibold">{formatPercent(metrics.equalOpportunityDifference)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest opacity-50">Error Rate Diff</p>
                    <p className="mt-1 font-semibold">{formatPercent(metrics.errorRateDifference)}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}

      {protectedColumns.length === 0 && (
        <Card>
          <CardContent className="py-8 text-sm text-[#141414]/60">No fairness metrics were saved for this run.</CardContent>
        </Card>
      )}

      <StageMemo snapshot={snapshot} type="subgroup" title="Fairness Interpretation" />
    </div>
  );
}

function SubgroupView({ snapshot }: { snapshot: AuditSnapshot }) {
  const subgroupEntries = Object.entries(snapshot.subgroups || {})
    .map(([group, values]: [string, any]) => ({ group, ...values }))
    .sort((a: any, b: any) => (a.positiveRate ?? 0) - (b.positiveRate ?? 0));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Subgroup Slices</CardTitle>
          <CardDescription>Intersectional slices captured during the saved run.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {subgroupEntries.slice(0, 12).map((entry: any) => (
            <div key={entry.group} className="rounded-lg border border-[#141414]/10 bg-white px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{entry.group}</span>
                <span>{formatPercent(entry.positiveRate)}</span>
              </div>
              <p className="mt-1 text-xs text-[#141414]/60">Count: {entry.count}</p>
            </div>
          ))}
          {subgroupEntries.length === 0 && <p className="text-[#141414]/60">No subgroup slices were saved.</p>}
        </CardContent>
      </Card>

      <StageMemo snapshot={snapshot} type="subgroup" title="Subgroup Harm Review" />
    </div>
  );
}

function GovernanceView({ snapshot }: { snapshot: AuditSnapshot }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Governance Answers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p><span className="font-semibold">Reviewer:</span> {snapshot.governance?.reviewerId || 'Not provided'}</p>
          <p><span className="font-semibold">Override Policy:</span> {snapshot.governance?.canOverride || 'Not provided'}</p>
          <p><span className="font-semibold">Evidence Shown:</span> {snapshot.governance?.evidenceShown || 'Not provided'}</p>
          <p><span className="font-semibold">Decision Speed:</span> {snapshot.governance?.speedOfDecision || 'Not provided'}</p>
        </CardContent>
      </Card>

      <StageMemo snapshot={snapshot} type="governance" title="Governance Review" />
    </div>
  );
}

function DecisionView({
  snapshot,
  decisionAction,
}: {
  snapshot: AuditSnapshot;
  decisionAction?: {
    label: string;
    onClick: () => void;
  };
}) {
  const decision = snapshot.systemDecision;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Decision Snapshot</CardTitle>
          <CardDescription>The final recommendation saved from the original audit run.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-widest opacity-50">Status</p>
            <p className="mt-1 text-lg font-semibold">{decision?.status || 'Not available'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest opacity-50">Rationale</p>
            <p className="mt-1 text-[#141414]/75">{decision?.rationale || 'No rationale saved.'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest opacity-50">Recommended Actions</p>
            <div className="mt-2 space-y-1 text-[#141414]/75">
              {(decision?.recommendedActions || []).map((item: string, index: number) => (
                <p key={index}>• {item}</p>
              ))}
              {(!decision?.recommendedActions || decision.recommendedActions.length === 0) && <p>No actions saved.</p>}
            </div>
          </div>
          {decisionAction && (
            <div className="rounded-xl border border-[#141414]/15 bg-white p-4">
              <p className="font-semibold text-[#141414]">Next step</p>
              <p className="mt-1 text-[#141414]/70">You can move this saved audit run into Versioning to start before/after comparisons.</p>
              <Button variant="outline" className="mt-3" onClick={decisionAction.onClick}>
                <FileStack className="w-4 h-4 mr-2" />
                {decisionAction.label}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function SnapshotStageView({
  snapshot,
  stage,
  decisionAction,
}: {
  snapshot: AuditSnapshot;
  stage: string;
  decisionAction?: {
    label: string;
    onClick: () => void;
  };
}) {
  if (stage === 'project-setup') return <ProjectSetupView snapshot={snapshot} />;
  if (stage === 'proxy-screening') return <ProxyView snapshot={snapshot} />;
  if (stage === 'fairness-metrics') return <FairnessView snapshot={snapshot} />;
  if (stage === 'subgroup-audit') return <SubgroupView snapshot={snapshot} />;
  if (stage === 'governance') return <GovernanceView snapshot={snapshot} />;
  return <DecisionView snapshot={snapshot} decisionAction={decisionAction} />;
}

function EmptyAfterPane({ entry }: { entry: VersionEntry }) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { updateVersionEntry } = useAudit();
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const data = results.data;
        if (data.length === 0) {
          toast.error('The uploaded CSV is empty.');
          setIsAnalyzing(false);
          return;
        }

        const originalColumns = entry.beforeSnapshot.datasetStats?.columns || [];
        const newColumns = Object.keys(data[0] as any);

        const matchedColumns = newColumns.filter(col => originalColumns.includes(col));
        const matchRatio = matchedColumns.length / Math.max(originalColumns.length, newColumns.length || 1);

        if (originalColumns.length > 0 && matchRatio < 0.5) {
          toast.error('The uploaded CSV seems entirely different from the original dataset. Please upload a related dataset.');
          setIsAnalyzing(false);
          return;
        }

        try {
          const response = await axios.post(apiUrl('/api/audit/analyze'), {
            data,
            targetColumn: entry.beforeSnapshot.targetColumn,
            protectedColumns: entry.beforeSnapshot.protectedColumns,
            groundTruthColumn: entry.beforeSnapshot.groundTruthColumn === 'none' ? undefined : entry.beforeSnapshot.groundTruthColumn
          });

          const { datasetStats, associations, fairness, subgroups } = response.data;

          const decisionContext = {
            problemFraming: entry.beforeSnapshot.problemFraming,
            datasetStatsSummary: datasetStats ? "Dataset loaded" : "No data",
            fairnessMetricsSummary: fairness,
            subgroupRisks: subgroups ? Object.keys(subgroups).length + " subgroups analyzed" : "None",
            governance: entry.beforeSnapshot.governance,
            llmFindings: entry.beforeSnapshot.llmMessages.map(m => m.title)
          };

          const [projectSetupRes, proxyRes, fairnessRes, decisionRes] = await Promise.all([
            axios.post(apiUrl('/api/llm/project-setup'), {
              questionnaire: {
                problemFraming: entry.beforeSnapshot.problemFraming,
                targetColumn: entry.beforeSnapshot.targetColumn,
                protectedColumns: entry.beforeSnapshot.protectedColumns
              },
              datasetStats
            }),
            associations ? axios.post(apiUrl('/api/llm/proxy'), { associations: associations.slice(0, 10) }) : Promise.resolve(null),
            fairness ? axios.post(apiUrl('/api/llm/fairness'), { fairnessMetrics: fairness, subgroups }) : Promise.resolve(null),
            axios.post(apiUrl('/api/llm/decision'), { context: decisionContext })
          ]);

          const newLlmMessages = entry.beforeSnapshot.llmMessages.map(msg => {
            if (msg.type === 'project-setup' && projectSetupRes) {
              return { ...msg, content: projectSetupRes.data.memo };
            }
            if (msg.type === 'proxy' && proxyRes) {
              return { ...msg, content: proxyRes.data.evaluation };
            }
            if (msg.type === 'subgroup' && fairnessRes) {
              return { ...msg, content: fairnessRes.data.summary };
            }
            return msg;
          });

          const afterSnapshot: AuditSnapshot = {
            ...entry.beforeSnapshot,
            datasetLabel: file.name,
            datasetStats: {
              ...datasetStats,
              totalRows: data.length,
            },
            associations,
            fairnessMetrics: fairness,
            subgroups,
            llmMessages: newLlmMessages,
            systemDecision: decisionRes.data,
          };

          updateVersionEntry(entry.id, { afterSnapshot });
          toast.success('After CSV uploaded and analyzed successfully. You can now compare the versions.');
        } catch (error: any) {
          toast.error('Failed to analyze the new dataset.', { description: error.response?.data?.error || error.message });
        } finally {
          setIsAnalyzing(false);
        }
      },
      error: (error: any) => {
        toast.error('Failed to parse CSV.', { description: error.message });
        setIsAnalyzing(false);
      }
    });
  };

  return (
    <Card className="h-full border-dashed">
      <CardContent className="flex h-full min-h-[540px] flex-col items-center justify-center text-center text-[#141414]/55">
        <GitCompareArrows className="w-12 h-12 opacity-20 mb-4" />
        <p className="font-semibold text-[#141414]/70">No after-version yet.</p>
        <p className="mt-2 max-w-sm text-sm">
          This side is reserved for the next saved version so users can compare the original audit run against a later, improved one.
        </p>
        <div className="mt-6">
          <input
            type="file"
            accept=".csv"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isAnalyzing}>
            <Upload className="w-4 h-4 mr-2" />
            {isAnalyzing ? 'Analyzing...' : 'Upload After CSV'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function VersionHeader({ entry }: { entry: VersionEntry }) {
  return (
    <Card className="mb-6">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest opacity-50">Saved Version</p>
          <p className="mt-1 text-xl font-semibold">{entry.title}</p>
          <p className="mt-1 text-sm text-[#141414]/60">{entry.datasetLabel}</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-[#141414]/60">
          <Clock3 className="w-4 h-4" />
          <span>{new Date(entry.createdAt).toLocaleString()}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function VersioningWorkspace() {
  const { versionEntries, selectedVersionId, activeVersionStage, setActiveVersionStage } = useAudit();
  const selectedEntry = versionEntries.find((entry) => entry.id === selectedVersionId);

  if (!selectedEntry) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center">
        <Card className="max-w-xl">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center text-[#141414]/60">
            <FileStack className="w-12 h-12 mb-4 opacity-20" />
            <p className="font-semibold text-[#141414]/70">No saved versions yet.</p>
            <p className="mt-2 text-sm">
              Finish an audit through Decision Expert, then move it into Versioning to create the first saved comparison entry.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <VersionHeader entry={selectedEntry} />

      <Tabs value={activeVersionStage} onValueChange={setActiveVersionStage} className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto p-1">
          {VERSION_STAGES.map((stage) => (
            <TabsTrigger key={stage.id} value={stage.id} className="shrink-0">
              {stage.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#F27D26]" />
            <span className="text-sm font-semibold uppercase tracking-widest text-[#141414]/70">Before</span>
          </div>
          <SnapshotStageView snapshot={selectedEntry.beforeSnapshot} stage={activeVersionStage} />
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2">
            <GitCompareArrows className="w-4 h-4 text-[#141414]/60" />
            <span className="text-sm font-semibold uppercase tracking-widest text-[#141414]/70">After</span>
          </div>
          {selectedEntry.afterSnapshot ? (
            <SnapshotStageView snapshot={selectedEntry.afterSnapshot} stage={activeVersionStage} />
          ) : (
            <EmptyAfterPane entry={selectedEntry} />
          )}
        </div>
      </div>
    </div>
  );
}
