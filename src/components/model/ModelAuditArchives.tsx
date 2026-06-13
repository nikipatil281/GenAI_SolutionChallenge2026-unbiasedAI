import React from 'react';
import Markdown from 'react-markdown';
import { Clock3, FileClock, FileStack, GitCompareArrows } from 'lucide-react';
import type {
  ModelAuditRunEntry,
  ModelAuditSnapshot,
  ModelAuditStageId,
  ModelVersionEntry,
} from '../../lib/modelAuditStorage';
import { MODEL_AUDIT_STAGES } from '../../lib/modelAuditStorage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

function formatMetric(value?: number) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'N/A';
  }
  return value.toFixed(3);
}

function SnapshotHeader({ title, label, createdAt }: { title: string; label: string; createdAt: string }) {
  return (
    <Card className="mb-6">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest opacity-50">{label}</p>
          <p className="mt-1 text-xl font-semibold">{title}</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-[#141414]/60">
          <Clock3 className="h-4 w-4" />
          <span>{new Date(createdAt).toLocaleString()}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function IntakeView({ snapshot }: { snapshot: ModelAuditSnapshot }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Model Intake</CardTitle>
          <CardDescription>The model file and purpose that were captured for this saved run.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-widest opacity-50">Model File</p>
            <p className="mt-1 font-semibold">{snapshot.modelFileName || 'Not saved'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest opacity-50">Model Type</p>
            <p className="mt-1 font-semibold">{snapshot.modelType}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest opacity-50">Approx Size</p>
            <p className="mt-1 font-semibold">
              {snapshot.modelFileSizeMb !== null ? `${snapshot.modelFileSizeMb.toFixed(2)} MB` : 'Unknown'}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest opacity-50">Document Label</p>
            <p className="mt-1 font-semibold">{snapshot.documentLabel}</p>
          </div>
          <div className="md:col-span-2">
            <p className="text-[10px] uppercase tracking-widest opacity-50">Purpose</p>
            <p className="mt-1 text-[#141414]/75">{snapshot.modelPurpose || 'No purpose note saved.'}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SchemaView({ snapshot }: { snapshot: ModelAuditSnapshot }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Training Schema</CardTitle>
          <CardDescription>Columns documented during the saved model-validation run.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {snapshot.trainingColumns.length === 0 ? (
            <p className="text-[#141414]/60">No training columns were saved.</p>
          ) : (
            snapshot.trainingColumns.map((column) => (
              <div key={column.id} className="rounded-xl border border-[#141414]/10 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold">{column.name}</p>
                  <Badge variant="outline">{column.role}</Badge>
                </div>
                <p className="mt-2 text-[#141414]/65">{column.description || 'No description saved.'}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DataAccessView({ snapshot }: { snapshot: ModelAuditSnapshot }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Data Access</CardTitle>
          <CardDescription>How the evaluation dataset was handled for this saved run.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-widest opacity-50">Mode</p>
            <p className="mt-1 font-semibold">{snapshot.dataAccessMode === 'full-dataset' ? 'Full dataset mode' : 'Metadata-only mode'}</p>
          </div>
          {snapshot.datasetSummary ? (
            <div className="rounded-xl border border-[#141414]/10 bg-white p-4">
              <p className="font-semibold">{snapshot.datasetSummary.fileName}</p>
              <p className="mt-1 text-[#141414]/65">
                {snapshot.datasetSummary.rowCount} rows · {snapshot.datasetSummary.columnCount} columns
              </p>
              <p className="mt-2 text-[#141414]/70">
                Columns: {snapshot.datasetSummary.columns.join(', ')}
              </p>
            </div>
          ) : (
            <p className="text-[#141414]/60">No full dataset summary was saved.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReadinessView({ snapshot }: { snapshot: ModelAuditSnapshot }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Readiness Checklist</CardTitle>
          <CardDescription>The intake checks that were recorded before execution.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2 text-sm">
          {snapshot.readinessChecklist.map((item) => (
            <div
              key={item.label}
              className={`rounded-2xl border p-4 ${
                item.ready ? 'border-green-200 bg-green-50/70' : 'border-amber-200 bg-amber-50/80'
              }`}
            >
              <p className="font-semibold">{item.label}</p>
              <p className="mt-2 text-[#141414]/70">{item.detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Readiness Memo</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none text-[#141414] prose-headings:uppercase prose-headings:text-sm prose-a:text-[#F27D26]">
          {snapshot.readinessMemo ? <Markdown>{snapshot.readinessMemo}</Markdown> : <p>No readiness memo was saved.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function ExecutionView({
  snapshot,
  moveAction,
}: {
  snapshot: ModelAuditSnapshot;
  moveAction?: {
    label: string;
    onClick: () => void;
  };
}) {
  const result = snapshot.executionResult;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Execution Results</CardTitle>
          <CardDescription>Saved backend prediction and fairness results for this model run.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 text-sm">
          {!result ? (
            <p className="text-[#141414]/60">No executable result was saved for this snapshot.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="rounded-2xl border border-[#141414]/10 bg-white p-4">
                  <p className="text-[10px] uppercase tracking-widest opacity-50">Rows Scored</p>
                  <p className="mt-2 text-2xl font-black">{result.rowCount}</p>
                </div>
                <div className="rounded-2xl border border-[#141414]/10 bg-white p-4">
                  <p className="text-[10px] uppercase tracking-widest opacity-50">Ground Truth</p>
                  <p className="mt-2 font-semibold">{result.groundTruthSourceColumn || 'Not provided'}</p>
                </div>
                <div className="rounded-2xl border border-[#141414]/10 bg-white p-4">
                  <p className="text-[10px] uppercase tracking-widest opacity-50">Protected Columns</p>
                  <p className="mt-2 font-semibold">{result.protectedColumns.join(', ') || 'None selected'}</p>
                </div>
                <div className="rounded-2xl border border-[#141414]/10 bg-white p-4">
                  <p className="text-[10px] uppercase tracking-widest opacity-50">Positive Label</p>
                  <p className="mt-2 font-semibold">{String(result.positiveLabelChosen ?? 'Unknown')}</p>
                </div>
              </div>

              {result.warnings && result.warnings.length > 0 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
                  <p className="font-semibold">Runtime warnings</p>
                  <div className="mt-2 space-y-1">
                    {result.warnings.map((warning) => (
                      <p key={warning}>• {warning}</p>
                    ))}
                  </div>
                </div>
              )}

              {result.fairness && Object.entries(result.fairness).map(([column, metrics]: [string, any]) => (
                <div key={column} className="rounded-2xl border border-[#141414]/10 bg-white p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest opacity-50">Protected Column</p>
                      <p className="mt-1 text-lg font-bold">{column}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">DP Diff {formatMetric(metrics.demographicParityDifference)}</Badge>
                      <Badge variant="outline">DP Ratio {formatMetric(metrics.demographicParityRatio)}</Badge>
                      {metrics.equalOpportunityDifference !== undefined && (
                        <Badge variant="outline">EO Diff {formatMetric(metrics.equalOpportunityDifference)}</Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {result.llmSummary && (
                <Card>
                  <CardHeader>
                    <CardTitle>Gemini Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="prose prose-sm max-w-none text-[#141414] prose-headings:uppercase prose-headings:text-sm prose-a:text-[#F27D26]">
                    <Markdown>{result.llmSummary}</Markdown>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {moveAction && result && (
            <div className="rounded-xl border border-[#141414]/15 bg-white p-4">
              <p className="font-semibold text-[#141414]">Next step</p>
              <p className="mt-1 text-[#141414]/70">Move this saved model audit into Versioning to keep a before/after comparison entry.</p>
              <Button variant="outline" className="mt-3" onClick={moveAction.onClick}>
                <FileStack className="mr-2 h-4 w-4" />
                {moveAction.label}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ModelSnapshotStageView({
  snapshot,
  stage,
  moveAction,
}: {
  snapshot: ModelAuditSnapshot;
  stage: ModelAuditStageId;
  moveAction?: {
    label: string;
    onClick: () => void;
  };
}) {
  if (stage === 'model-intake') return <IntakeView snapshot={snapshot} />;
  if (stage === 'training-schema') return <SchemaView snapshot={snapshot} />;
  if (stage === 'data-access') return <DataAccessView snapshot={snapshot} />;
  if (stage === 'readiness-review') return <ReadinessView snapshot={snapshot} />;
  return <ExecutionView snapshot={snapshot} moveAction={moveAction} />;
}

function EmptyAfterPane() {
  return (
    <Card className="h-full border-dashed">
      <CardContent className="flex h-full min-h-[540px] flex-col items-center justify-center text-center text-[#141414]/55">
        <GitCompareArrows className="mb-4 h-12 w-12 opacity-20" />
        <p className="font-semibold text-[#141414]/70">No after-version yet.</p>
        <p className="mt-2 max-w-sm text-sm">
          This side stays open for the next saved version of the same model audit so users can compare before and after.
        </p>
      </CardContent>
    </Card>
  );
}

export function ModelPastRunsWorkspace({
  auditRunEntries,
  selectedAuditRunId,
  activeStage,
  setActiveStage,
  onMoveToVersioning,
}: {
  auditRunEntries: ModelAuditRunEntry[];
  selectedAuditRunId: string;
  activeStage: ModelAuditStageId;
  setActiveStage: (stage: ModelAuditStageId) => void;
  onMoveToVersioning: (entry: ModelAuditRunEntry) => void;
}) {
  const selectedRun = auditRunEntries.find((entry) => entry.id === selectedAuditRunId);

  if (!selectedRun) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center">
        <Card className="max-w-xl">
          <CardContent className="py-12 text-center text-[#141414]/60">
            <FileClock className="mx-auto mb-4 h-12 w-12 opacity-20" />
            <p className="font-semibold text-[#141414]/70">No model audit runs yet.</p>
            <p className="mt-2 text-sm">Once a model execution finishes, BiasScope will save it here automatically.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <SnapshotHeader title={selectedRun.title} label="Past Model Audit Run" createdAt={selectedRun.createdAt} />

      <Tabs value={activeStage} onValueChange={(value) => setActiveStage(value as ModelAuditStageId)} className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto p-1">
          {MODEL_AUDIT_STAGES.map((stage) => (
            <TabsTrigger key={stage.id} value={stage.id} className="shrink-0">
              {stage.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <ModelSnapshotStageView
        snapshot={selectedRun.snapshot}
        stage={activeStage}
        moveAction={{
          label: 'Move To Versioning',
          onClick: () => onMoveToVersioning(selectedRun),
        }}
      />
    </div>
  );
}

export function ModelVersioningWorkspace({
  versionEntries,
  selectedVersionId,
  activeStage,
  setActiveStage,
}: {
  versionEntries: ModelVersionEntry[];
  selectedVersionId: string;
  activeStage: ModelAuditStageId;
  setActiveStage: (stage: ModelAuditStageId) => void;
}) {
  const selectedEntry = versionEntries.find((entry) => entry.id === selectedVersionId);

  if (!selectedEntry) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center">
        <Card className="max-w-xl">
          <CardContent className="py-12 text-center text-[#141414]/60">
            <FileStack className="mx-auto mb-4 h-12 w-12 opacity-20" />
            <p className="font-semibold text-[#141414]/70">No saved model versions yet.</p>
            <p className="mt-2 text-sm">Move a completed model audit run into Versioning to create the first comparison entry.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <SnapshotHeader title={selectedEntry.title} label="Saved Model Version" createdAt={selectedEntry.createdAt} />

      <Tabs value={activeStage} onValueChange={(value) => setActiveStage(value as ModelAuditStageId)} className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto p-1">
          {MODEL_AUDIT_STAGES.map((stage) => (
            <TabsTrigger key={stage.id} value={stage.id} className="shrink-0">
              {stage.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="space-y-3">
          <p className="text-[10px] uppercase tracking-widest opacity-50">Before</p>
          <ModelSnapshotStageView snapshot={selectedEntry.beforeSnapshot} stage={activeStage} />
        </div>
        <div className="space-y-3">
          <p className="text-[10px] uppercase tracking-widest opacity-50">After</p>
          {selectedEntry.afterSnapshot ? (
            <ModelSnapshotStageView snapshot={selectedEntry.afterSnapshot} stage={activeStage} />
          ) : (
            <EmptyAfterPane />
          )}
        </div>
      </div>
    </div>
  );
}
