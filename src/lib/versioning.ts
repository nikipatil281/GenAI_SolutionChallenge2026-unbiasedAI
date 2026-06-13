import { readJsonValue, writeJsonValue } from './persistence';

export type AuditSnapshot = {
  datasetLabel: string;
  createdAt: string;
  problemFraming: any;
  datasetStats: any | null;
  associations: any[] | null;
  fairnessMetrics: any | null;
  subgroups: any | null;
  governance: any;
  targetColumn: string;
  groundTruthColumn: string;
  protectedColumns: string[];
  llmMessages: { type: string; title: string; content: string }[];
  systemDecision: any | null;
  remediationPlan: any | null;
  remediationPreview: any | null;
  remediationResult: any | null;
};

export type VersionEntry = {
  id: string;
  title: string;
  datasetLabel: string;
  createdAt: string;
  sourceAuditRunId?: string | null;
  beforeSnapshot: AuditSnapshot;
  afterSnapshot: AuditSnapshot | null;
};

export type AuditRunEntry = {
  id: string;
  title: string;
  datasetLabel: string;
  createdAt: string;
  snapshot: AuditSnapshot;
};

function getVersionStorageKey(userEmail: string) {
  return `biasscope.versioning.${userEmail.toLowerCase()}`;
}

function getAuditRunStorageKey(userEmail: string) {
  return `biasscope.auditRuns.${userEmail.toLowerCase()}`;
}

export async function readVersionEntries(userEmail?: string | null): Promise<VersionEntry[]> {
  if (!userEmail) {
    return [];
  }

  const parsed = await readJsonValue<unknown>(getVersionStorageKey(userEmail));
  return Array.isArray(parsed) ? (parsed as VersionEntry[]) : [];
}

export async function writeVersionEntries(userEmail: string, entries: VersionEntry[]) {
  await writeJsonValue(getVersionStorageKey(userEmail), entries);
}

export async function readAuditRunEntries(userEmail?: string | null): Promise<AuditRunEntry[]> {
  if (!userEmail) {
    return [];
  }

  const parsed = await readJsonValue<unknown>(getAuditRunStorageKey(userEmail));
  return Array.isArray(parsed) ? (parsed as AuditRunEntry[]) : [];
}

export async function writeAuditRunEntries(userEmail: string, entries: AuditRunEntry[]) {
  await writeJsonValue(getAuditRunStorageKey(userEmail), entries);
}
