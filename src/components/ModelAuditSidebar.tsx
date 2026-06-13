import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ChevronDown,
  Cloud,
  FileCode2,
  FileStack,
  History,
  Loader2,
  Lock,
  MessageSquareMore,
  MoreVertical,
  ShieldCheck,
  Sparkles,
  Database,
} from 'lucide-react';
import { apiUrl } from '../lib/api';
import { cn } from '../lib/utils';
import { HoverCard, HoverCardContent, HoverCardTrigger } from './ui/hover-card';
import type { ModelAuditRunEntry, ModelAuditStageId, ModelVersionEntry } from '../lib/modelAuditStorage';
import { MODEL_AUDIT_STAGES } from '../lib/modelAuditStorage';

interface ModelAuditSidebarProps {
  activeModule: string;
  onBackToHome: () => void;
  onSelectModule: (module: string) => void;
  stageEnabled: Record<ModelAuditStageId, boolean>;
  executionReady: boolean;
  auditRunEntries: ModelAuditRunEntry[];
  selectedAuditRunId: string;
  setSelectedAuditRunId: (id: string) => void;
  versionEntries: ModelVersionEntry[];
  selectedVersionId: string;
  setSelectedVersionId: (id: string) => void;
  renameVersionEntry: (id: string, nextTitle: string) => void;
  deleteVersionEntry: (id: string) => void;
  renameAuditRunEntry: (id: string, nextTitle: string) => void;
  deleteAuditRunEntry: (id: string) => void;
}

export function ModelAuditSidebar({
  activeModule,
  onBackToHome,
  onSelectModule,
  stageEnabled,
  executionReady,
  auditRunEntries,
  selectedAuditRunId,
  setSelectedAuditRunId,
  versionEntries,
  selectedVersionId,
  setSelectedVersionId,
  renameVersionEntry,
  deleteVersionEntry,
  renameAuditRunEntry,
  deleteAuditRunEntry,
}: ModelAuditSidebarProps) {
  const [cloudStatus, setCloudStatus] = useState<'checking' | 'ready' | 'waking'>('checking');
  const [pipelineOpen, setPipelineOpen] = useState(true);
  const [pastRunsOpen, setPastRunsOpen] = useState(true);
  const [versioningOpen, setVersioningOpen] = useState(true);
  const [openMenuKey, setOpenMenuKey] = useState('');
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  const chatActive = activeModule === 'model-ai-chat';

  const handleRename = (kind: 'audit' | 'version', entry: ModelAuditRunEntry | ModelVersionEntry) => {
    const nextTitle = window.prompt('Rename this entry', entry.title);
    if (!nextTitle || nextTitle.trim() === entry.title) {
      setOpenMenuKey('');
      return;
    }
    if (kind === 'audit') {
      renameAuditRunEntry(entry.id, nextTitle);
    } else {
      renameVersionEntry(entry.id, nextTitle);
    }
    setOpenMenuKey('');
  };

  const handleDelete = (kind: 'audit' | 'version', entry: ModelAuditRunEntry | ModelVersionEntry) => {
    const confirmed = window.confirm(`Delete "${entry.title}"?`);
    if (!confirmed) {
      setOpenMenuKey('');
      return;
    }
    if (kind === 'audit') {
      deleteAuditRunEntry(entry.id);
    } else {
      deleteVersionEntry(entry.id);
    }
    setOpenMenuKey('');
  };

  const renderArchiveEntry = ({
    kind,
    entry,
    isSelected,
    onOpen,
    icon,
  }: {
    kind: 'audit' | 'version';
    entry: ModelAuditRunEntry | ModelVersionEntry;
    isSelected: boolean;
    onOpen: () => void;
    icon?: React.ReactNode;
  }) => {
    const menuKey = `${kind}::${entry.id}`;

    return (
      <div key={entry.id} className="relative group/item">
        <button
          onClick={onOpen}
          className={cn(
            "w-full rounded-xl px-3 py-2.5 pr-10 text-left transition-all",
            isSelected ? "bg-white/6 text-[#F27D26]" : "text-white/78 hover:bg-white/[0.05] hover:text-white"
          )}
        >
          <div className="flex items-center gap-2">
            {icon}
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em]">{entry.title}</p>
          </div>
          <p className="mt-1 text-[9px] normal-case tracking-normal text-white/50">{new Date(entry.createdAt).toLocaleString()}</p>
        </button>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            const triggerRect = event.currentTarget.getBoundingClientRect();
            const estimatedMenuWidth = 132;
            const estimatedMenuHeight = 86;
            const nextLeft = Math.min(
              Math.max(8, triggerRect.right - estimatedMenuWidth),
              window.innerWidth - estimatedMenuWidth - 8
            );
            const preferBelow = triggerRect.bottom + estimatedMenuHeight + 8 <= window.innerHeight;
            const nextTop = preferBelow
              ? triggerRect.bottom + 6
              : Math.max(8, triggerRect.top - estimatedMenuHeight - 6);

            setOpenMenuKey((current) => {
              if (current === menuKey) {
                setMenuPosition(null);
                return '';
              }
              setMenuPosition({ top: nextTop, left: nextLeft });
              return menuKey;
            });
          }}
          className={cn(
            "absolute right-2 top-2 rounded-md p-1 text-white/35 transition-all hover:bg-white/10 hover:text-white",
            "opacity-0 group-hover/item:opacity-100 focus:opacity-100",
            openMenuKey === menuKey && "opacity-100 bg-white/10 text-white"
          )}
          aria-label="Entry actions"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  };

  useEffect(() => {
    if (!openMenuKey) {
      return;
    }

    const handleWindowChange = () => {
      setOpenMenuKey('');
      setMenuPosition(null);
    };

    const handleDocumentClick = () => {
      setOpenMenuKey('');
      setMenuPosition(null);
    };

    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);
    document.addEventListener('click', handleDocumentClick);

    return () => {
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
      document.removeEventListener('click', handleDocumentClick);
    };
  }, [openMenuKey]);

  useEffect(() => {
    let cancelled = false;

    const checkCloudHealth = async () => {
      const controller = new AbortController();
      const abortTimer = window.setTimeout(() => controller.abort(), 8000);

      try {
        const response = await fetch(apiUrl('/api/health'), {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!cancelled) {
          setCloudStatus(response.ok ? 'ready' : 'waking');
        }
      } catch {
        if (!cancelled) {
          setCloudStatus('waking');
        }
      } finally {
        window.clearTimeout(abortTimer);
      }
    };

    void checkCloudHealth();
    const intervalId = window.setInterval(() => {
      void checkCloudHealth();
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <>
      <aside className="flex w-56 flex-col bg-[#141414] text-[#E4E3E0]">
        <div className="relative border-b border-white/10 p-6">
          <button
            onClick={onBackToHome}
            className="absolute right-6 top-6 text-white/30 transition-colors hover:text-white"
            title="Back to Home"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-xl font-bold leading-none tracking-tighter uppercase">BiasScope</h1>
          <p className="mt-1 text-[10px] uppercase tracking-widest opacity-50">Model Bias Auditor</p>
        </div>

        <nav className="flex min-h-0 flex-grow flex-col text-[11px] font-semibold uppercase tracking-wider">
          <button
            type="button"
            onClick={() => setPipelineOpen((current) => !current)}
            className="flex items-center justify-between px-4 py-3 text-[9px] uppercase tracking-[0.18em] opacity-30 transition-opacity hover:opacity-80"
          >
            <span>Audit Pipeline</span>
            <ChevronDown className={cn("h-3 w-3 transition-transform", !pipelineOpen && "-rotate-90")} />
          </button>
          {pipelineOpen && (
            <div className="space-y-1 px-2 pb-3">
              {MODEL_AUDIT_STAGES.map((stage) => {
                const isActive = activeModule === stage.id;
                const isLocked = !stageEnabled[stage.id];
                const stageIcon = stage.id === 'model-intake'
                  ? FileCode2
                  : stage.id === 'training-schema'
                    ? Database
                    : stage.id === 'data-access'
                      ? Lock
                      : stage.id === 'readiness-review'
                        ? Sparkles
                        : ShieldCheck;
                const Icon = stageIcon;

                return (
                  <button
                    key={stage.id}
                    onClick={() => {
                      if (!isLocked) {
                        onSelectModule(stage.id);
                      }
                    }}
                    disabled={isLocked}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-all duration-100 ease-in",
                      isActive ? "bg-white/6 text-[#F27D26]" : "text-white/78 hover:bg-white/[0.05] hover:text-white",
                      isLocked && "cursor-not-allowed opacity-30 hover:bg-transparent hover:text-white/78"
                    )}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">{stage.label}</span>
                    {isLocked ? (
                      <div className="flex h-3 w-3 items-center justify-center rounded-full border-2 border-current text-[6px] opacity-50">!</div>
                    ) : (
                      <Icon className="h-3 w-3" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="border-t border-white/10">
            <button
              type="button"
              onClick={() => setPastRunsOpen((current) => !current)}
              className="flex w-full items-center justify-between px-4 pb-2 pt-4 text-[9px] uppercase tracking-[0.18em] opacity-30 transition-opacity hover:opacity-100"
            >
              <span>Past Audit Runs</span>
              <ChevronDown className={cn("h-3 w-3 transition-transform", !pastRunsOpen && "-rotate-90")} />
            </button>
            {pastRunsOpen && (
              <div className="max-h-44 space-y-2 overflow-y-auto px-2 pb-3">
                {auditRunEntries.length === 0 ? (
                  <div className="mx-2 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-3 text-[9px] normal-case tracking-normal text-white/35">
                    Completed executable model audits will be archived here automatically.
                  </div>
                ) : (
                  auditRunEntries.map((entry) =>
                    renderArchiveEntry({
                      kind: 'audit',
                      entry,
                      isSelected: activeModule === 'model-past-audit-runs' && selectedAuditRunId === entry.id,
                      icon: <History className="h-3 w-3 shrink-0" />,
                      onOpen: () => {
                        setSelectedAuditRunId(entry.id);
                        onSelectModule('model-past-audit-runs');
                      },
                    })
                  )
                )}
              </div>
            )}
          </div>

          <div className="border-t border-white/10">
            <button
              type="button"
              onClick={() => setVersioningOpen((current) => !current)}
              className="flex w-full items-center justify-between px-4 pb-2 pt-4 text-[9px] uppercase tracking-[0.18em] opacity-30 transition-opacity hover:opacity-100"
            >
              <span>Versioning</span>
              <ChevronDown className={cn("h-3 w-3 transition-transform", !versioningOpen && "-rotate-90")} />
            </button>
            {versioningOpen && (
              <div className="max-h-44 space-y-2 overflow-y-auto px-2 pb-3">
                {versionEntries.length === 0 ? (
                  <div className="mx-2 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-3 text-[9px] normal-case tracking-normal text-white/35">
                    Saved model versions will appear here after you move a completed model audit into Versioning.
                  </div>
                ) : (
                  versionEntries.map((entry) =>
                    renderArchiveEntry({
                      kind: 'version',
                      entry,
                      isSelected: activeModule === 'model-versioning' && selectedVersionId === entry.id,
                      icon: <FileStack className="h-3 w-3 shrink-0" />,
                      onOpen: () => {
                        setSelectedVersionId(entry.id);
                        onSelectModule('model-versioning');
                      },
                    })
                  )
                )}
              </div>
            )}
          </div>

          <div className="mt-auto border-t border-white/10 p-4">
            <div
              className={cn(
                "google-rotating-border rounded-xl",
                !executionReady && "google-rotating-border--muted",
                chatActive && "google-rotating-border--active"
              )}
            >
              <div className="google-rotating-border__inner rounded-[11px]">
                <button
                  onClick={() => {
                    if (executionReady) {
                      onSelectModule('model-ai-chat');
                    }
                  }}
                  disabled={!executionReady}
                  className={cn(
                    "w-full rounded-[11px] border border-transparent px-3 py-2.5 text-left transition-all duration-200",
                    executionReady
                      ? "bg-[#F27D26]/12 text-white shadow-[0_0_28px_rgba(242,125,38,0.18)] hover:bg-[#F27D26] hover:text-[#141414]"
                      : "cursor-not-allowed bg-white/[0.03] text-white/35",
                    chatActive && "bg-[#F27D26] text-[#141414] shadow-[0_0_34px_rgba(242,125,38,0.3)]"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={cn("rounded-lg border p-1.5 shrink-0", executionReady ? "border-current/40 bg-black/10" : "border-white/10")}>
                      <MessageSquareMore className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-bold uppercase tracking-[0.18em] leading-tight">AI Bot</span>
                        {executionReady && <Sparkles className="h-3 w-3 shrink-0" />}
                      </div>
                      <p className={cn("mt-0.5 text-[9px] normal-case leading-snug", executionReady ? "text-current/75" : "text-white/30")}>
                        Ask about your model audit.
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </nav>

        <div className="bg-white/5 p-4 text-[10px]">
          <HoverCard>
            <HoverCardTrigger>
              <button className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-left transition-colors hover:border-white/20 hover:bg-white/[0.05]">
                <div className="flex items-center gap-2">
                  {cloudStatus === 'checking' ? (
                    <Loader2 className="h-3 w-3 animate-spin text-[#F27D26]" />
                  ) : (
                    <Cloud className={cn("h-3 w-3", cloudStatus === 'ready' ? "text-green-400" : "text-amber-400")} />
                  )}
                  <span className="text-[9px] font-bold uppercase tracking-[0.18em]">Backend Status</span>
                </div>
              </button>
            </HoverCardTrigger>
            <HoverCardContent side="top" align="start" className="w-64 border-[#141414] text-[#141414]">
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#141414]">
                    {cloudStatus === 'ready' ? 'Cloud Ready' : cloudStatus === 'checking' ? 'Checking Cloud' : 'Cloud Waking'}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[#141414]/70">
                    {cloudStatus === 'ready'
                      ? 'Backend connected and ready for model-audit requests.'
                      : 'The hosted backend may still be starting up. Render cold starts can take a little while.'}
                  </p>
                </div>
                <div className="space-y-2 text-xs text-[#141414]/75">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <span>Execution Engine Active</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-blue-500" />
                    <span>LLM Linked</span>
                  </div>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
        </div>
      </aside>

      {openMenuKey && menuPosition && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-[9999] min-w-[132px] rounded-lg border border-white/10 bg-[#1A1A1A] p-1 shadow-2xl"
          style={{ top: menuPosition.top, left: menuPosition.left }}
          onClick={(event) => event.stopPropagation()}
        >
          {(() => {
            const [kind, entryId] = openMenuKey.split('::');
            const entry = kind === 'audit'
              ? auditRunEntries.find((item) => item.id === entryId)
              : versionEntries.find((item) => item.id === entryId);

            if (!entry) {
              return null;
            }

            return (
              <>
                <button
                  type="button"
                  onClick={() => handleRename(kind as 'audit' | 'version', entry)}
                  className="w-full rounded-md px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(kind as 'audit' | 'version', entry)}
                  className="w-full rounded-md px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-red-300 transition-colors hover:bg-red-500/10 hover:text-red-200"
                >
                  Delete
                </button>
              </>
            );
          })()}
        </div>,
        document.body
      )}
    </>
  );
}
