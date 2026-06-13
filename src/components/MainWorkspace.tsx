import React from 'react';
import { useAudit } from '../context/AuditContext';
import { ProjectSetup } from './modules/ProjectSetup';
import { ProxyScreening } from './modules/ProxyScreening';
import { FairnessMetrics } from './modules/FairnessMetrics';
import { SubgroupAudit } from './modules/SubgroupAudit';
import { Governance } from './modules/Governance';
import { DecisionExport } from './modules/DecisionExport';
import { DataChat } from './modules/DataChat';
import { SafeDataRemediation } from './modules/SafeDataRemediation';
import { VersioningWorkspace } from './modules/VersioningWorkspace';
import { PastAuditRunsWorkspace } from './modules/PastAuditRunsWorkspace';
import { cn } from '../lib/utils';

export function MainWorkspace({ className }: { className?: string }) {
  const { activeModule, selectedVersionId, versionEntries, selectedAuditRunId, auditRunEntries } = useAudit();
  const isChatView = activeModule === 'ai-chat';
  const selectedVersion = versionEntries.find((entry) => entry.id === selectedVersionId);
  const selectedAuditRun = auditRunEntries.find((entry) => entry.id === selectedAuditRunId);
  const activeProjectLabel = activeModule === 'versioning'
    ? selectedVersion?.datasetLabel || 'VERSIONING_WORKSPACE'
    : activeModule === 'past-audit-runs'
      ? selectedAuditRun?.datasetLabel || 'AUDIT_RUN_ARCHIVE'
    : 'BIASSCOPE_AUDIT_ACTIVE';
  
  return (
    <main className={cn("flex-grow flex flex-col overflow-hidden bg-[#E4E3E0]", className)}>
      <header className="h-16 border-b border-[#141414] flex items-center justify-between px-6 bg-white/30 backdrop-blur-sm shrink-0">
        <div>
          <span className="text-[10px] uppercase font-bold opacity-50 block">Active Project</span>
          <span className="font-bold text-lg leading-tight block">{activeProjectLabel}</span>
        </div>
        <div className="flex items-center gap-4">
           <div className="text-right">
             <span className="text-[10px] uppercase font-bold opacity-50 block">System Mode</span>
             <span className="f-mono font-bold text-[#F27D26]">
              {activeModule === 'versioning'
                ? 'VERSION COMPARISON'
                : activeModule === 'past-audit-runs'
                  ? 'AUDIT RUN ARCHIVE'
                  : 'DETERMINISTIC + LLM'}
             </span>
           </div>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className={cn(isChatView ? "h-full" : "p-8")}>
          {activeModule === 'project-setup' && <ProjectSetup />}
          {activeModule === 'proxy-screening' && <ProxyScreening />}
          {activeModule === 'fairness-metrics' && <FairnessMetrics />}
          {activeModule === 'subgroup-audit' && <SubgroupAudit />}
          {activeModule === 'governance' && <Governance />}
          {activeModule === 'decision' && <DecisionExport />}
          {activeModule === 'safe-remediation' && <SafeDataRemediation />}
          {activeModule === 'versioning' && <VersioningWorkspace />}
          {activeModule === 'past-audit-runs' && <PastAuditRunsWorkspace />}
          {activeModule === 'ai-chat' && <DataChat />}
        </div>
      </div>
    </main>
  );
}
