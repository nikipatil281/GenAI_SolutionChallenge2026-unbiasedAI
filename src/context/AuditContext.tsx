import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  readAuditRunEntries,
  readVersionEntries,
  writeAuditRunEntries,
  writeVersionEntries,
  type AuditRunEntry,
  type AuditSnapshot,
  type VersionEntry
} from '../lib/versioning';
import { EMPTY_GOVERNANCE_ANSWERS } from '../lib/governanceOptions';

export type AuditChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type AuditContextType = {
  activeModule: string;
  setActiveModule: (id: string) => void;
  datasetLabel: string;
  setDatasetLabel: (label: string) => void;
  dataset: any[] | null;
  setDataset: (data: any[] | null) => void;
  datasetStats: any | null;
  setDatasetStats: (stats: any) => void;
  problemFraming: any;
  setProblemFraming: (data: any) => void;
  associations: any[] | null;
  setAssociations: (assoc: any[]) => void;
  fairnessMetrics: any | null;
  setFairnessMetrics: (metrics: any) => void;
  subgroups: any | null;
  setSubgroups: (groups: any) => void;
  governance: any;
  setGovernance: (data: any) => void;
  targetColumn: string;
  setTargetColumn: (col: string) => void;
  groundTruthColumn: string;
  setGroundTruthColumn: (col: string) => void;
  protectedColumns: string[];
  setProtectedColumns: (cols: string[]) => void;
  llmMessages: { type: string; title: string; content: string }[];
  addLlmMessage: (message: { type: string; title: string; content: string }) => void;
  clearLlmMessages: (type?: string) => void;
  systemDecision: any | null;
  setSystemDecision: (decision: any) => void;
  loadingModules: Record<string, boolean>;
  setLoadingModules: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  chatMessages: AuditChatMessage[];
  setChatMessages: React.Dispatch<React.SetStateAction<AuditChatMessage[]>>;
  addChatMessage: (message: AuditChatMessage) => void;
  clearChatMessages: () => void;
  remediationPlan: any | null;
  setRemediationPlan: (plan: any | null) => void;
  remediationPreview: any | null;
  setRemediationPreview: (preview: any | null) => void;
  remediationResult: any | null;
  setRemediationResult: (result: any | null) => void;
  versionEntries: VersionEntry[];
  selectedVersionId: string;
  setSelectedVersionId: (id: string) => void;
  currentAuditRunId: string;
  clearCurrentAuditRunLink: () => void;
  auditRunEntries: AuditRunEntry[];
  selectedAuditRunId: string;
  setSelectedAuditRunId: (id: string) => void;
  activeVersionStage: string;
  setActiveVersionStage: (stage: string) => void;
  buildCurrentSnapshot: (overrides?: Partial<AuditSnapshot>) => AuditSnapshot;
  findVersionEntryByAuditRunId: (auditRunId: string) => VersionEntry | null;
  saveCurrentVersion: () => VersionEntry | null;
  saveCurrentAuditRun: () => AuditRunEntry | null;
  saveSnapshotAsAuditRun: (snapshot: AuditSnapshot, titleOverride?: string) => AuditRunEntry | null;
  saveSnapshotToVersioning: (snapshot: AuditSnapshot, titleOverride?: string, sourceAuditRunId?: string | null) => VersionEntry | null;
  renameVersionEntry: (id: string, nextTitle: string) => void;
  deleteVersionEntry: (id: string) => void;
  renameAuditRunEntry: (id: string, nextTitle: string) => void;
  deleteAuditRunEntry: (id: string) => void;
};

const AuditContext = createContext<AuditContextType | undefined>(undefined);

export const AuditProvider = ({ children, userEmail }: { children: ReactNode; userEmail?: string | null }) => {
  const [activeModule, setActiveModule] = useState('project-setup');
  const [datasetLabel, setDatasetLabel] = useState('Untitled Dataset');
  const [dataset, setDataset] = useState<any[] | null>(null);
  const [datasetStats, setDatasetStats] = useState<any | null>(null);
  const [associations, setAssociations] = useState<any[] | null>(null);
  const [fairnessMetrics, setFairnessMetrics] = useState<any | null>(null);
  const [subgroups, setSubgroups] = useState<any | null>(null);
  const [targetColumn, setTargetColumn] = useState('');
  const [groundTruthColumn, setGroundTruthColumn] = useState('');
  const [protectedColumns, setProtectedColumns] = useState<string[]>([]);
  const [systemDecision, setSystemDecision] = useState<any | null>(null);
  
  const [problemFraming, setProblemFraming] = useState({
    taskDescription: '',
    domain: '',
    stakeholders: '',
    humanBaseline: '',
    benefit: ''
  });

  const [governance, setGovernance] = useState(EMPTY_GOVERNANCE_ANSWERS);

  const [llmMessages, setLlmMessages] = useState<{ type: string; title: string; content: string }[]>([]);
  const [loadingModules, setLoadingModules] = useState<Record<string, boolean>>({});
  const [chatMessages, setChatMessages] = useState<AuditChatMessage[]>([]);
  const [remediationPlan, setRemediationPlan] = useState<any | null>(null);
  const [remediationPreview, setRemediationPreview] = useState<any | null>(null);
  const [remediationResult, setRemediationResult] = useState<any | null>(null);
  const [versionEntries, setVersionEntries] = useState<VersionEntry[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [currentAuditRunId, setCurrentAuditRunId] = useState('');
  const [auditRunEntries, setAuditRunEntries] = useState<AuditRunEntry[]>([]);
  const [selectedAuditRunId, setSelectedAuditRunId] = useState('');
  const [activeVersionStage, setActiveVersionStage] = useState('project-setup');

  const addLlmMessage = (msg: { type: string; title: string; content: string }) => {
    setLlmMessages(prev => {
      const idx = prev.findIndex(m => m.type === msg.type);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = msg;
        return next;
      }
      return [msg, ...prev];
    });
  };

  const clearLlmMessages = (type?: string) => {
    if (type) {
      setLlmMessages(prev => prev.filter(m => m.type !== type));
    } else {
      setLlmMessages([]);
    }
  };

  const addChatMessage = (message: AuditChatMessage) => {
    setChatMessages(prev => [...prev, message]);
  };

  const clearChatMessages = () => {
    setChatMessages([]);
  };

  useEffect(() => {
    let cancelled = false;

    const loadStoredEntries = async () => {
      const [nextEntries, nextRuns] = await Promise.all([
        readVersionEntries(userEmail),
        readAuditRunEntries(userEmail),
      ]);

      if (cancelled) {
        return;
      }

      setVersionEntries(nextEntries);
      setSelectedVersionId((current) => {
        if (current && nextEntries.some((entry) => entry.id === current)) {
          return current;
        }
        return nextEntries[0]?.id || '';
      });

      setAuditRunEntries(nextRuns);
      setSelectedAuditRunId((current) => {
        if (current && nextRuns.some((entry) => entry.id === current)) {
          return current;
        }
        return nextRuns[0]?.id || '';
      });
      setCurrentAuditRunId('');
    };

    void loadStoredEntries();

    return () => {
      cancelled = true;
    };
  }, [userEmail]);

  const buildCurrentSnapshot = (overrides?: Partial<AuditSnapshot>): AuditSnapshot => ({
    datasetLabel,
    createdAt: new Date().toISOString(),
    problemFraming,
    datasetStats,
    associations,
    fairnessMetrics,
    subgroups,
    governance,
    targetColumn,
    groundTruthColumn,
    protectedColumns,
    llmMessages,
    systemDecision,
    remediationPlan,
    remediationPreview,
    remediationResult,
    ...overrides,
  });

  const findVersionEntryByAuditRunId = (auditRunId: string) => {
    if (!auditRunId) {
      return null;
    }
    return versionEntries.find((entry) => entry.sourceAuditRunId === auditRunId) || null;
  };

  const saveSnapshotToVersioning = (snapshot: AuditSnapshot, titleOverride?: string, sourceAuditRunId?: string | null) => {
    if (!userEmail || !snapshot.systemDecision) {
      return null;
    }

    const now = new Date();
    const nextEntry: VersionEntry = {
      id: `version-${now.getTime()}`,
      title: titleOverride || `${snapshot.datasetLabel || 'Dataset'} · ${now.toLocaleString()}`,
      datasetLabel: snapshot.datasetLabel || 'Untitled Dataset',
      createdAt: now.toISOString(),
      sourceAuditRunId: sourceAuditRunId || null,
      beforeSnapshot: snapshot,
      afterSnapshot: null,
    };

    const nextEntries = [nextEntry, ...versionEntries];
    setVersionEntries(nextEntries);
    setSelectedVersionId(nextEntry.id);
    setActiveVersionStage('project-setup');
    void writeVersionEntries(userEmail, nextEntries);
    return nextEntry;
  };

  const saveCurrentVersion = () => {
    if (!systemDecision) {
      return null;
    }
    return saveSnapshotToVersioning(buildCurrentSnapshot(), undefined, currentAuditRunId || null);
  };

  const saveSnapshotAsAuditRun = (snapshot: AuditSnapshot, titleOverride?: string) => {
    if (!userEmail || !snapshot.systemDecision) {
      return null;
    }

    const now = new Date();
    const nextRun: AuditRunEntry = {
      id: `audit-run-${now.getTime()}`,
      title: titleOverride || `${snapshot.datasetLabel || 'Dataset'} · ${now.toLocaleString()}`,
      datasetLabel: snapshot.datasetLabel || 'Untitled Dataset',
      createdAt: now.toISOString(),
      snapshot,
    };

    const nextEntries = [nextRun, ...auditRunEntries];
    setAuditRunEntries(nextEntries);
    setCurrentAuditRunId(nextRun.id);
    setSelectedAuditRunId(nextRun.id);
    void writeAuditRunEntries(userEmail, nextEntries);
    return nextRun;
  };

  const saveCurrentAuditRun = () => {
    if (!systemDecision) {
      return null;
    }
    return saveSnapshotAsAuditRun(buildCurrentSnapshot());
  };

  const clearCurrentAuditRunLink = () => {
    setCurrentAuditRunId('');
  };

  const renameVersionEntry = (id: string, nextTitle: string) => {
    if (!userEmail) {
      return;
    }
    const trimmedTitle = nextTitle.trim();
    if (!trimmedTitle) {
      return;
    }
    const nextEntries = versionEntries.map((entry) =>
      entry.id === id ? { ...entry, title: trimmedTitle } : entry
    );
    setVersionEntries(nextEntries);
    void writeVersionEntries(userEmail, nextEntries);
  };

  const deleteVersionEntry = (id: string) => {
    if (!userEmail) {
      return;
    }
    const nextEntries = versionEntries.filter((entry) => entry.id !== id);
    setVersionEntries(nextEntries);
    setSelectedVersionId((current) => {
      if (current !== id) {
        return current;
      }
      return nextEntries[0]?.id || '';
    });
    void writeVersionEntries(userEmail, nextEntries);
  };

  const renameAuditRunEntry = (id: string, nextTitle: string) => {
    if (!userEmail) {
      return;
    }
    const trimmedTitle = nextTitle.trim();
    if (!trimmedTitle) {
      return;
    }
    const nextEntries = auditRunEntries.map((entry) =>
      entry.id === id ? { ...entry, title: trimmedTitle } : entry
    );
    setAuditRunEntries(nextEntries);
    void writeAuditRunEntries(userEmail, nextEntries);
  };

  const deleteAuditRunEntry = (id: string) => {
    if (!userEmail) {
      return;
    }
    const nextEntries = auditRunEntries.filter((entry) => entry.id !== id);
    setAuditRunEntries(nextEntries);
    setSelectedAuditRunId((current) => {
      if (current !== id) {
        return current;
      }
      return nextEntries[0]?.id || '';
    });
    void writeAuditRunEntries(userEmail, nextEntries);
  };

  return (
    <AuditContext.Provider value={{
      activeModule, setActiveModule,
      datasetLabel, setDatasetLabel,
      dataset, setDataset,
      datasetStats, setDatasetStats,
      problemFraming, setProblemFraming,
      associations, setAssociations,
      fairnessMetrics, setFairnessMetrics,
      subgroups, setSubgroups,
      governance, setGovernance,
      targetColumn, setTargetColumn,
      groundTruthColumn, setGroundTruthColumn,
      protectedColumns, setProtectedColumns,
      llmMessages, addLlmMessage, clearLlmMessages,
      systemDecision, setSystemDecision,
      loadingModules, setLoadingModules,
      chatMessages, setChatMessages, addChatMessage, clearChatMessages,
      remediationPlan, setRemediationPlan,
      remediationPreview, setRemediationPreview,
      remediationResult, setRemediationResult,
      versionEntries,
      selectedVersionId, setSelectedVersionId,
      currentAuditRunId,
      clearCurrentAuditRunLink,
      auditRunEntries,
      selectedAuditRunId, setSelectedAuditRunId,
      activeVersionStage, setActiveVersionStage,
      buildCurrentSnapshot,
      findVersionEntryByAuditRunId,
      saveCurrentVersion,
      saveCurrentAuditRun,
      saveSnapshotAsAuditRun,
      saveSnapshotToVersioning,
      renameVersionEntry,
      deleteVersionEntry,
      renameAuditRunEntry,
      deleteAuditRunEntry
    }}>
      {children}
    </AuditContext.Provider>
  );
};

export const useAudit = () => {
  const ctx = useContext(AuditContext);
  if (!ctx) throw new Error("useAudit must be used within AuditProvider");
  return ctx;
};
