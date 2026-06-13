import { readJsonValue, writeJsonValue } from './persistence';

export type ModelType = 'sklearn' | 'onnx' | 'keras' | 'pytorch' | 'gguf' | 'unknown';
export type ColumnRole = 'independent' | 'dependent';
export type DataAccessMode = 'metadata-only' | 'full-dataset';

export type ModelTrainingColumn = {
  id: string;
  name: string;
  description: string;
  role: ColumnRole;
};

export type ModelDatasetSummary = {
  fileName: string;
  rowCount: number;
  columnCount: number;
  columns: string[];
};

export type ModelExecutionResult = {
  modelType: ModelType;
  predictionColumn: string;
  groundTruthColumn: string | null;
  groundTruthSourceColumn: string | null;
  scoreColumn: string | null;
  featureColumnsUsed: string[];
  manifestIndependentColumns?: string[];
  protectedColumns: string[];
  rowCount: number;
  missingValuesDetected: number;
  positiveLabelChosen: string | number | boolean | null;
  truthPositiveLabelChosen: string | number | boolean | null;
  warnings?: string[];
  previewRows: Record<string, any>[];
  datasetStats: any;
  associations: any[] | null;
  fairness: Record<string, any> | null;
  subgroups: Record<string, any> | null;
  llmSummary?: string;
};

export type ModelAuditStageId =
  | 'model-intake'
  | 'training-schema'
  | 'data-access'
  | 'readiness-review'
  | 'execution';

export const MODEL_AUDIT_STAGES: { id: ModelAuditStageId; label: string }[] = [
  { id: 'model-intake', label: '01 Model Intake' },
  { id: 'training-schema', label: '02 Training Schema' },
  { id: 'data-access', label: '03 Data Access' },
  { id: 'readiness-review', label: '04 Readiness Review' },
  { id: 'execution', label: '05 Execution' },
];

export type ModelAuditSnapshot = {
  documentLabel: string;
  createdAt: string;
  modelFileName: string;
  modelFileSizeMb: number | null;
  modelType: ModelType;
  modelPurpose: string;
  trainingColumns: ModelTrainingColumn[];
  dataAccessMode: DataAccessMode;
  datasetSummary: ModelDatasetSummary | null;
  readinessMemo: string;
  readinessChecklist: { label: string; ready: boolean; detail: string }[];
  selectedGroundTruthColumn: string;
  selectedProtectedColumns: string[];
  executionResult: ModelExecutionResult | null;
};

export type ModelVersionEntry = {
  id: string;
  title: string;
  documentLabel: string;
  createdAt: string;
  sourceAuditRunId?: string | null;
  beforeSnapshot: ModelAuditSnapshot;
  afterSnapshot: ModelAuditSnapshot | null;
};

export type ModelAuditRunEntry = {
  id: string;
  title: string;
  documentLabel: string;
  createdAt: string;
  snapshot: ModelAuditSnapshot;
};

function getModelVersionStorageKey(userEmail: string) {
  return `biasscope.modelVersioning.${userEmail.toLowerCase()}`;
}

function getModelAuditRunStorageKey(userEmail: string) {
  return `biasscope.modelAuditRuns.${userEmail.toLowerCase()}`;
}

export async function readModelVersionEntries(userEmail?: string | null): Promise<ModelVersionEntry[]> {
  if (!userEmail) {
    return [];
  }

  try {
    const parsed = await readJsonValue<unknown>(getModelVersionStorageKey(userEmail));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeModelVersionEntries(userEmail: string, entries: ModelVersionEntry[]) {
  await writeJsonValue(getModelVersionStorageKey(userEmail), entries);
}

export async function readModelAuditRunEntries(userEmail?: string | null): Promise<ModelAuditRunEntry[]> {
  if (!userEmail) {
    return [];
  }

  try {
    const parsed = await readJsonValue<unknown>(getModelAuditRunStorageKey(userEmail));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeModelAuditRunEntries(userEmail: string, entries: ModelAuditRunEntry[]) {
  await writeJsonValue(getModelAuditRunStorageKey(userEmail), entries);
}
