import React from 'react';
import { FileClock, Clock3 } from 'lucide-react';
import { useAudit } from '../../context/AuditContext';
import { Card, CardContent } from '../ui/card';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { SnapshotStageView, VERSION_STAGES } from './VersioningWorkspace';

export function PastAuditRunsWorkspace() {
  const {
    auditRunEntries,
    selectedAuditRunId,
    activeVersionStage,
    setActiveVersionStage,
    saveSnapshotToVersioning,
    findVersionEntryByAuditRunId,
    setSelectedVersionId,
    setActiveModule,
  } = useAudit();

  const selectedRun = auditRunEntries.find((entry) => entry.id === selectedAuditRunId);

  if (!selectedRun) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center">
        <Card className="max-w-xl">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center text-[#141414]/60">
            <FileClock className="w-12 h-12 mb-4 opacity-20" />
            <p className="font-semibold text-[#141414]/70">No past audit runs yet.</p>
            <p className="mt-2 text-sm">
              Once a run reaches Decision Expert, BiasScope will save it here so users can reopen the full audit later.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleMoveToVersioning = () => {
    const existingVersion = findVersionEntryByAuditRunId(selectedRun.id);
    if (existingVersion) {
      const shouldCreateAnother = window.confirm(
        'This audit run already has an entry in Versioning. Do you want to create another versioning instance for the same document?'
      );
      if (!shouldCreateAnother) {
        setSelectedVersionId(existingVersion.id);
        setActiveModule('versioning');
        return;
      }
    }

    const created = saveSnapshotToVersioning(selectedRun.snapshot, `${selectedRun.datasetLabel} · versioned`, selectedRun.id);
    if (!created) {
      return;
    }
    setActiveModule('versioning');
  };

  return (
    <div className="space-y-6 pb-20">
      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest opacity-50">Past Audit Run</p>
            <p className="mt-1 text-xl font-semibold">{selectedRun.title}</p>
            <p className="mt-1 text-sm text-[#141414]/60">{selectedRun.datasetLabel}</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-[#141414]/60">
            <Clock3 className="w-4 h-4" />
            <span>{new Date(selectedRun.createdAt).toLocaleString()}</span>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeVersionStage} onValueChange={setActiveVersionStage} className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto p-1">
          {VERSION_STAGES.map((stage) => (
            <TabsTrigger key={stage.id} value={stage.id} className="shrink-0">
              {stage.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <SnapshotStageView
        snapshot={selectedRun.snapshot}
        stage={activeVersionStage}
        decisionAction={{
          label: 'Move To Versioning',
          onClick: handleMoveToVersioning,
        }}
      />
    </div>
  );
}
