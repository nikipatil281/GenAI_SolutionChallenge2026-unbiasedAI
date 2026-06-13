import React, { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import axios from 'axios';
import { ArrowLeft, Upload, ShieldCheck, FileCode2, Database, Sparkles, Info, Trash2, Plus, AlertTriangle, Lock, CheckCircle2 } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { HoverCard, HoverCardContent, HoverCardTrigger } from './ui/hover-card';
import { apiUrl } from '../lib/api';
import { toast } from 'sonner';
import { LlmCompanion } from './ui/llm-companion';
import { ModelAuditSidebar } from './ModelAuditSidebar';
import { ModelAuditChat } from './model/ModelAuditChat';
import {
  ModelPastRunsWorkspace,
  ModelVersioningWorkspace,
} from './model/ModelAuditArchives';
import {
  MODEL_AUDIT_STAGES,
  type ColumnRole,
  type DataAccessMode,
  type ModelAuditRunEntry,
  type ModelAuditSnapshot,
  type ModelAuditStageId,
  type ModelDatasetSummary as DatasetSummary,
  type ModelExecutionResult as ExecutionResult,
  type ModelTrainingColumn as TrainingColumn,
  type ModelType,
  type ModelVersionEntry,
  readModelAuditRunEntries,
  readModelVersionEntries,
  writeModelAuditRunEntries,
  writeModelVersionEntries,
} from '../lib/modelAuditStorage';
interface ModelAuditPageProps {
  onBack: () => void;
  userEmail: string;
}

const MODEL_TYPE_OPTIONS: { value: ModelType; label: string; accept: string; note: string }[] = [
  {
    value: 'sklearn',
    label: 'Scikit-Learn (.pkl / .joblib)',
    accept: '.pkl,.joblib',
    note: 'Useful for classic tabular models, but the loading environment must match how the model was originally serialized.',
  },
  {
    value: 'onnx',
    label: 'ONNX (.onnx)',
    accept: '.onnx',
    note: 'Most portable option for blind model execution and schema inspection later.',
  },
  {
    value: 'keras',
    label: 'TensorFlow / Keras (.h5 / .keras)',
    accept: '.h5,.keras',
    note: 'Can work well, but custom layers or functions may require extra objects when loading.',
  },
  {
    value: 'pytorch',
    label: 'PyTorch (.pt / .pth)',
    accept: '.pt,.pth',
    note: 'Safest when the file is TorchScript. Raw weight files often need the original architecture code too.',
  },
  {
    value: 'gguf',
    label: 'GGUF / LLM (.gguf)',
    accept: '.gguf',
    note: 'This follows a prompt-based bias validation path rather than classic tabular fairness metrics.',
  },
  {
    value: 'unknown',
    label: 'Other / Not Sure',
    accept: '',
    note: 'BiasScope will capture the intake but cannot promise executable validation until the format is clarified.',
  },
];

const ROLE_OPTIONS: { value: ColumnRole; label: string }[] = [
  { value: 'independent', label: 'Independent' },
  { value: 'dependent', label: 'Dependent' },
];

const EMPTY_COLUMN_FORM = {
  name: '',
  description: '',
};

function inferModelType(fileName: string): ModelType {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.pkl') || lowerName.endsWith('.joblib')) return 'sklearn';
  if (lowerName.endsWith('.onnx')) return 'onnx';
  if (lowerName.endsWith('.h5') || lowerName.endsWith('.keras')) return 'keras';
  if (lowerName.endsWith('.pt') || lowerName.endsWith('.pth')) return 'pytorch';
  if (lowerName.endsWith('.gguf')) return 'gguf';
  return 'unknown';
}

function buildFormatWarnings(modelType: ModelType) {
  if (modelType === 'onnx') {
    return [
      'Best blind-loading path for later execution work because ONNX Runtime can open the model through an inference session.',
      'You still need the feature schema in the correct order and a clear target definition.',
    ];
  }
  if (modelType === 'pytorch') {
    return [
      'Raw .pt and .pth files may only contain weights. Later execution may require the original Python architecture or a TorchScript export.',
      'If the user can convert the model to ONNX or provide a TorchScript file, validation gets much safer.',
    ];
  }
  if (modelType === 'keras') {
    return [
      'Keras files loaded via `tf.keras.models.load_model()` can require custom objects when the model uses custom layers or functions.',
      'Keeping the exact feature names and output label definition is important before any fairness run.',
    ];
  }
  if (modelType === 'sklearn') {
    return [
      'Serialized sklearn artifacts can be environment-sensitive, so later execution should happen only in a trusted matching environment.',
      'This is still a strong fit for tabular fairness validation if the schema is well documented.',
    ];
  }
  if (modelType === 'gguf') {
    return [
      'GGUF models are not validated through standard tabular fairness metrics. They need prompt-based behavioral testing instead.',
      'If the user wants tabular bias checks, they should validate the training data or a predictive model instead of the GGUF file itself.',
    ];
  }
  return [
    'BiasScope can record the intake now, but executable validation later depends on clarifying the model format and runtime.',
  ];
}

function parseDatasetFile(file: File): Promise<DatasetSummary> {
  return new Promise((resolve, reject) => {
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.csv')) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = (results.data as any[]) || [];
          const columns = Object.keys(rows[0] || {});
          resolve({
            fileName: file.name,
            rowCount: rows.length,
            columnCount: columns.length,
            columns,
          });
        },
        error: (error) => reject(error),
      });
      return;
    }

    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const workbook = XLSX.read(event.target?.result, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null }) as any[];
          const columns = Object.keys(rows[0] || {});
          resolve({
            fileName: file.name,
            rowCount: rows.length,
            columnCount: columns.length,
            columns,
          });
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Could not read the dataset file.'));
      reader.readAsBinaryString(file);
      return;
    }

    reject(new Error('Unsupported dataset format. Please upload CSV or Excel.'));
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Could not encode the file for backend execution.'));
        return;
      }
      const [, base64 = ''] = result.split(',');
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Could not read the file for backend execution.'));
    reader.readAsDataURL(file);
  });
}

function formatMetric(value: number | undefined) {
  if (value === undefined || Number.isNaN(value)) {
    return 'N/A';
  }
  return value.toFixed(3);
}

export function ModelAuditPage({ onBack, userEmail }: ModelAuditPageProps) {
  const [activeStage, setActiveStage] = useState<ModelAuditStageId>('model-intake');
  const [activeModule, setActiveModule] = useState<string>('model-intake');
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [modelType, setModelType] = useState<ModelType>('unknown');
  const [modelPurpose, setModelPurpose] = useState('');
  const [trainingColumns, setTrainingColumns] = useState<TrainingColumn[]>([]);
  const [columnForm, setColumnForm] = useState(EMPTY_COLUMN_FORM);
  const [dataAccessMode, setDataAccessMode] = useState<DataAccessMode>('metadata-only');
  const [datasetFile, setDatasetFile] = useState<File | null>(null);
  const [datasetSummary, setDatasetSummary] = useState<DatasetSummary | null>(null);
  const [datasetUploadLoading, setDatasetUploadLoading] = useState(false);
  const [readinessMemo, setReadinessMemo] = useState<string>('');
  const [memoLoading, setMemoLoading] = useState(false);
  const [selectedGroundTruthColumn, setSelectedGroundTruthColumn] = useState('');
  const [selectedProtectedColumns, setSelectedProtectedColumns] = useState<string[]>([]);
  const [executionLoading, setExecutionLoading] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [auditRunEntries, setAuditRunEntries] = useState<ModelAuditRunEntry[]>([]);
  const [selectedAuditRunId, setSelectedAuditRunId] = useState('');
  const [versionEntries, setVersionEntries] = useState<ModelVersionEntry[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [currentAuditRunId, setCurrentAuditRunId] = useState('');
  const [activeArchiveStage, setActiveArchiveStage] = useState<ModelAuditStageId>('model-intake');

  const modelTypeInfo = MODEL_TYPE_OPTIONS.find((option) => option.value === modelType) || MODEL_TYPE_OPTIONS.at(-1)!;
  const dependentColumns = trainingColumns.filter((column) => column.role === 'dependent');
  const independentColumns = trainingColumns.filter((column) => column.role === 'independent');
  const hasDependentColumn = dependentColumns.length > 0;
  const datasetColumnOptions = datasetSummary?.columns || [];
  const dependentDatasetColumns = dependentColumns.filter((column) => datasetColumnOptions.includes(column.name));
  const executionModelSupported = modelType === 'sklearn';
  const duplicateNames = new Set(
    trainingColumns
      .map((column) => column.name.trim().toLowerCase())
      .filter((name, index, list) => name && list.indexOf(name) !== index)
  );

  const stageEnabled = {
    'model-intake': true,
    'training-schema': Boolean(modelFile),
    'data-access': Boolean(modelFile) && trainingColumns.length > 0 && hasDependentColumn && duplicateNames.size === 0,
    'readiness-review': Boolean(modelFile) && trainingColumns.length > 0 && hasDependentColumn && duplicateNames.size === 0,
    'execution': Boolean(modelFile) && trainingColumns.length > 0 && hasDependentColumn && duplicateNames.size === 0 && dataAccessMode === 'full-dataset' && Boolean(datasetFile),
  } as const;

  const readinessChecklist = useMemo(() => {
    const items = [
      {
        label: 'Model file uploaded',
        ready: Boolean(modelFile),
        detail: modelFile ? `${modelFile.name} (${(modelFile.size / (1024 * 1024)).toFixed(2)} MB)` : 'Upload a model artifact to begin.',
      },
      {
        label: 'Training schema documented',
        ready: trainingColumns.length > 0,
        detail: trainingColumns.length > 0 ? `${trainingColumns.length} columns listed.` : 'List the columns used during training.',
      },
      {
        label: 'Dependent output identified',
        ready: hasDependentColumn,
        detail: hasDependentColumn ? dependentColumns.map((column) => column.name).join(', ') : 'Mark at least one column as dependent before proceeding.',
      },
      {
        label: 'Duplicate column names resolved',
        ready: duplicateNames.size === 0,
        detail: duplicateNames.size === 0 ? 'No duplicate training columns detected.' : `Resolve duplicates: ${Array.from(duplicateNames).join(', ')}.`,
      },
      {
        label: 'Data access decision recorded',
        ready: true,
        detail: dataAccessMode === 'full-dataset'
          ? datasetSummary
            ? `Full dataset uploaded locally: ${datasetSummary.fileName} (${datasetSummary.rowCount} rows).`
            : 'Full dataset mode selected, but no dataset file has been uploaded yet.'
          : 'Metadata-only mode selected. No full dataset leaves the browser in this intake step.',
      },
    ];

    return items;
  }, [dataAccessMode, datasetSummary, duplicateNames.size, hasDependentColumn, modelFile, trainingColumns.length, dependentColumns]);

  const canGenerateMemo = readinessChecklist.every((item) => item.ready) && (dataAccessMode === 'metadata-only' || Boolean(datasetSummary));
  const executionBlockers = [
    !executionModelSupported ? 'Executable backend support is live only for Scikit-Learn .pkl and .joblib files in this release.' : null,
    dataAccessMode !== 'full-dataset' ? 'Switch to full-dataset mode to send the evaluation dataset to the backend.' : null,
    !datasetFile ? 'Upload the evaluation dataset file that should be run through the model.' : null,
    dependentDatasetColumns.length === 0 ? 'At least one dependent column must also be present in the uploaded dataset.' : null,
    !selectedGroundTruthColumn ? 'Choose the ground truth column that represents the real outcome.' : null,
    selectedProtectedColumns.length === 0 ? 'Choose at least one protected column for the fairness comparison.' : null,
  ].filter(Boolean) as string[];
  const canRunExecution = Boolean(modelFile) && Boolean(datasetFile) && executionBlockers.length === 0;
  const stageIds = useMemo(() => new Set(MODEL_AUDIT_STAGES.map((stage) => stage.id)), []);

  const documentLabel = modelFile?.name
    ? datasetFile?.name
      ? `${modelFile.name} · ${datasetFile.name}`
      : modelFile.name
    : 'Untitled Model Audit';

  const buildPersistedExecutionResult = (result: any): ExecutionResult | null => {
    if (!result) {
      return null;
    }
    const { auditData: _auditData, ...lightResult } = result;
    return lightResult as ExecutionResult;
  };

  const buildCurrentSnapshot = (overrides?: Partial<ModelAuditSnapshot>): ModelAuditSnapshot => ({
    documentLabel,
    createdAt: new Date().toISOString(),
    modelFileName: modelFile?.name || '',
    modelFileSizeMb: modelFile ? Number((modelFile.size / (1024 * 1024)).toFixed(2)) : null,
    modelType,
    modelPurpose,
    trainingColumns,
    dataAccessMode,
    datasetSummary,
    readinessMemo,
    readinessChecklist,
    selectedGroundTruthColumn,
    selectedProtectedColumns,
    executionResult,
    ...overrides,
  });

  const findVersionEntryByAuditRunId = (auditRunId: string) => {
    if (!auditRunId) {
      return null;
    }
    return versionEntries.find((entry) => entry.sourceAuditRunId === auditRunId) || null;
  };

  const saveSnapshotAsAuditRun = (snapshot: ModelAuditSnapshot, titleOverride?: string) => {
    const now = new Date();
    const nextRun: ModelAuditRunEntry = {
      id: `model-audit-run-${now.getTime()}`,
      title: titleOverride || `${snapshot.documentLabel} · ${now.toLocaleString()}`,
      documentLabel: snapshot.documentLabel,
      createdAt: now.toISOString(),
      snapshot,
    };
    const nextEntries = [nextRun, ...auditRunEntries];
    setAuditRunEntries(nextEntries);
    setCurrentAuditRunId(nextRun.id);
    setSelectedAuditRunId(nextRun.id);
    void writeModelAuditRunEntries(userEmail, nextEntries);
    return nextRun;
  };

  const saveSnapshotToVersioning = (snapshot: ModelAuditSnapshot, titleOverride?: string, sourceAuditRunId?: string | null) => {
    const now = new Date();
    const nextEntry: ModelVersionEntry = {
      id: `model-version-${now.getTime()}`,
      title: titleOverride || `${snapshot.documentLabel} · ${now.toLocaleString()}`,
      documentLabel: snapshot.documentLabel,
      createdAt: now.toISOString(),
      sourceAuditRunId: sourceAuditRunId || null,
      beforeSnapshot: snapshot,
      afterSnapshot: null,
    };
    const nextEntries = [nextEntry, ...versionEntries];
    setVersionEntries(nextEntries);
    setSelectedVersionId(nextEntry.id);
    setActiveArchiveStage('model-intake');
    void writeModelVersionEntries(userEmail, nextEntries);
    return nextEntry;
  };

  const renameAuditRunEntry = (id: string, nextTitle: string) => {
    const trimmedTitle = nextTitle.trim();
    if (!trimmedTitle) {
      return;
    }
    const nextEntries = auditRunEntries.map((entry) =>
      entry.id === id ? { ...entry, title: trimmedTitle } : entry
    );
    setAuditRunEntries(nextEntries);
    void writeModelAuditRunEntries(userEmail, nextEntries);
  };

  const deleteAuditRunEntry = (id: string) => {
    const nextEntries = auditRunEntries.filter((entry) => entry.id !== id);
    setAuditRunEntries(nextEntries);
    setSelectedAuditRunId((current) => (current !== id ? current : nextEntries[0]?.id || ''));
    void writeModelAuditRunEntries(userEmail, nextEntries);
  };

  const renameVersionEntry = (id: string, nextTitle: string) => {
    const trimmedTitle = nextTitle.trim();
    if (!trimmedTitle) {
      return;
    }
    const nextEntries = versionEntries.map((entry) =>
      entry.id === id ? { ...entry, title: trimmedTitle } : entry
    );
    setVersionEntries(nextEntries);
    void writeModelVersionEntries(userEmail, nextEntries);
  };

  const deleteVersionEntry = (id: string) => {
    const nextEntries = versionEntries.filter((entry) => entry.id !== id);
    setVersionEntries(nextEntries);
    setSelectedVersionId((current) => (current !== id ? current : nextEntries[0]?.id || ''));
    void writeModelVersionEntries(userEmail, nextEntries);
  };

  const liveSnapshotForView = useMemo(
    () =>
      buildCurrentSnapshot({
        createdAt: currentAuditRunId || `${documentLabel}::live`,
      }),
    [
      currentAuditRunId,
      documentLabel,
      modelFile,
      modelType,
      modelPurpose,
      trainingColumns,
      dataAccessMode,
      datasetSummary,
      readinessMemo,
      readinessChecklist,
      selectedGroundTruthColumn,
      selectedProtectedColumns,
      executionResult,
    ]
  );

  const currentSnapshotForChat = (() => {
    if (activeModule === 'model-past-audit-runs') {
      return auditRunEntries.find((entry) => entry.id === selectedAuditRunId)?.snapshot || null;
    }
    if (activeModule === 'model-versioning') {
      return versionEntries.find((entry) => entry.id === selectedVersionId)?.beforeSnapshot || null;
    }
    return liveSnapshotForView;
  })();

  const chatReady = Boolean(currentSnapshotForChat && (currentSnapshotForChat.readinessMemo || currentSnapshotForChat.executionResult));

  useEffect(() => {
    setSelectedGroundTruthColumn((current) => {
      if (current && dependentDatasetColumns.some((column) => column.name === current)) {
        return current;
      }
      return dependentDatasetColumns[0]?.name || '';
    });
  }, [dependentDatasetColumns]);

  useEffect(() => {
    setSelectedProtectedColumns((current) =>
      current.filter((column) => datasetColumnOptions.includes(column) && column !== selectedGroundTruthColumn)
    );
  }, [datasetColumnOptions, selectedGroundTruthColumn]);

  useEffect(() => {
    let cancelled = false;

    const loadStoredEntries = async () => {
      const [nextRuns, nextVersions] = await Promise.all([
        readModelAuditRunEntries(userEmail),
        readModelVersionEntries(userEmail),
      ]);

      if (cancelled) {
        return;
      }

      setAuditRunEntries(nextRuns);
      setSelectedAuditRunId((current) => {
        if (current && nextRuns.some((entry) => entry.id === current)) {
          return current;
        }
        return nextRuns[0]?.id || '';
      });

      setVersionEntries(nextVersions);
      setSelectedVersionId((current) => {
        if (current && nextVersions.some((entry) => entry.id === current)) {
          return current;
        }
        return nextVersions[0]?.id || '';
      });
      setCurrentAuditRunId('');
    };

    void loadStoredEntries();

    return () => {
      cancelled = true;
    };
  }, [userEmail]);

  useEffect(() => {
    setExecutionResult(null);
    setCurrentAuditRunId('');
  }, [modelFile, datasetFile, modelType, trainingColumns, selectedGroundTruthColumn, selectedProtectedColumns, dataAccessMode]);

  useEffect(() => {
    if (stageIds.has(activeModule as ModelAuditStageId) && activeModule !== activeStage) {
      setActiveStage(activeModule as ModelAuditStageId);
    }
  }, [activeModule, activeStage, stageIds]);

  const handleStageChange = (nextStage: string) => {
    if (!stageEnabled[nextStage as keyof typeof stageEnabled]) {
      return;
    }
    setActiveStage(nextStage as ModelAuditStageId);
    setActiveModule(nextStage);
  };

  const handleModelUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setModelFile(file);
    setModelType(inferModelType(file.name));
    toast.success('Model file attached for validation intake.');
  };

  const addTrainingColumn = () => {
    const name = columnForm.name.trim();
    if (!name) {
      toast.error('Column name is required.');
      return;
    }

    setTrainingColumns((current) => [
      ...current,
      {
        id: `column-${Date.now()}-${current.length}`,
        name,
        description: columnForm.description.trim(),
        role: 'independent',
      },
    ]);
    setColumnForm(EMPTY_COLUMN_FORM);
  };

  const mergeImportedColumns = (columns: string[]) => {
    setTrainingColumns((current) => {
      const existing = new Set(current.map((column) => column.name.trim().toLowerCase()));
      const additions = columns
        .filter((column) => !existing.has(column.trim().toLowerCase()))
        .map((column, index) => ({
          id: `imported-${Date.now()}-${index}`,
          name: column,
          description: '',
          role: 'independent' as ColumnRole,
        }));
      return [...current, ...additions];
    });
  };

  const handleDatasetUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setDatasetUploadLoading(true);
    try {
      const summary = await parseDatasetFile(file);
      setDatasetFile(file);
      setDatasetSummary(summary);
      mergeImportedColumns(summary.columns);
      toast.success(`Parsed ${summary.fileName} locally and imported ${summary.columnCount} column names.`);
    } catch (error: any) {
      toast.error('Could not parse dataset file.', { description: error.message });
    } finally {
      setDatasetUploadLoading(false);
    }
  };

  const updateColumn = (id: string, updates: Partial<TrainingColumn>) => {
    setTrainingColumns((current) =>
      current.map((column) => (column.id === id ? { ...column, ...updates } : column))
    );
  };

  const removeColumn = (id: string) => {
    setTrainingColumns((current) => current.filter((column) => column.id !== id));
  };

  const toggleProtectedColumn = (columnName: string) => {
    setSelectedProtectedColumns((current) =>
      current.includes(columnName)
        ? current.filter((column) => column !== columnName)
        : [...current, columnName]
    );
  };

  const generateReadinessMemo = async () => {
    setMemoLoading(true);
    try {
      const response = await axios.post(apiUrl('/api/llm/model-validation-intake'), {
        model: {
          fileName: modelFile?.name,
          fileSizeMb: modelFile ? Number((modelFile.size / (1024 * 1024)).toFixed(2)) : null,
          modelType,
          modelPurpose,
        },
        trainingColumns,
        dataAccessMode,
        datasetSummary,
        readinessChecklist,
      });
      setReadinessMemo(response.data.memo);
      toast.success('Model validation readiness memo generated.');
    } catch (error: any) {
      toast.error('Failed to generate validation memo.', { description: error.response?.data?.error || error.message });
    } finally {
      setMemoLoading(false);
    }
  };

  const runExecutableAudit = async () => {
    if (!modelFile || !datasetFile) {
      toast.error('Upload both the model file and the evaluation dataset first.');
      return;
    }

    if (!canRunExecution) {
      toast.error('Resolve the execution blockers before running the model audit.');
      return;
    }

    setExecutionLoading(true);
    try {
      const [modelContentBase64, datasetContentBase64] = await Promise.all([
        fileToBase64(modelFile),
        fileToBase64(datasetFile),
      ]);

      const response = await axios.post(apiUrl('/api/model-validation/execute'), {
        modelType,
        modelPurpose,
        trainingColumns,
        groundTruthColumn: selectedGroundTruthColumn,
        protectedColumns: selectedProtectedColumns,
        modelFile: {
          name: modelFile.name,
          contentBase64: modelContentBase64,
        },
        datasetFile: {
          name: datasetFile.name,
          contentBase64: datasetContentBase64,
        },
      });

      const lightResult = buildPersistedExecutionResult(response.data);
      setExecutionResult(lightResult);
      if (lightResult) {
        saveSnapshotAsAuditRun(
          buildCurrentSnapshot({
            executionResult: lightResult,
            createdAt: new Date().toISOString(),
          }),
          `${documentLabel} · executed`
        );
      }
      toast.success('Executable model audit completed.');
    } catch (error: any) {
      toast.error('Executable model audit failed.', { description: error.response?.data?.error || error.message });
    } finally {
      setExecutionLoading(false);
    }
  };

  const handleMoveCurrentToVersioning = () => {
    if (!executionResult) {
      toast.error('Run the executable model audit first.');
      return;
    }

    const snapshot = buildCurrentSnapshot();
    const existingVersion = findVersionEntryByAuditRunId(currentAuditRunId);
    if (existingVersion) {
      const shouldCreateAnother = window.confirm(
        'This model audit run already has an entry in Versioning. Do you want to create another versioning instance for the same document?'
      );
      if (!shouldCreateAnother) {
        setSelectedVersionId(existingVersion.id);
        setActiveModule('model-versioning');
        toast.message('Opened the existing versioning entry for this model audit.');
        return;
      }
    }

    saveSnapshotToVersioning(snapshot, `${snapshot.documentLabel} · versioned`, currentAuditRunId || null);
    setActiveModule('model-versioning');
  };

  const handleMoveSavedRunToVersioning = (entry: ModelAuditRunEntry) => {
    const existingVersion = findVersionEntryByAuditRunId(entry.id);
    if (existingVersion) {
      const shouldCreateAnother = window.confirm(
        'This model audit run already has an entry in Versioning. Do you want to create another versioning instance for the same document?'
      );
      if (!shouldCreateAnother) {
        setSelectedVersionId(existingVersion.id);
        setActiveModule('model-versioning');
        return;
      }
    }

    saveSnapshotToVersioning(entry.snapshot, `${entry.documentLabel} · versioned`, entry.id);
    setActiveModule('model-versioning');
  };

  const stageViewActive = stageIds.has(activeModule as ModelAuditStageId);

  return (
    <div className="flex h-screen bg-[#E4E3E0] text-[#141414]">
      <ModelAuditSidebar
        activeModule={activeModule}
        onBackToHome={onBack}
        onSelectModule={setActiveModule}
        stageEnabled={stageEnabled}
        executionReady={chatReady}
        auditRunEntries={auditRunEntries}
        selectedAuditRunId={selectedAuditRunId}
        setSelectedAuditRunId={setSelectedAuditRunId}
        versionEntries={versionEntries}
        selectedVersionId={selectedVersionId}
        setSelectedVersionId={setSelectedVersionId}
        renameVersionEntry={renameVersionEntry}
        deleteVersionEntry={deleteVersionEntry}
        renameAuditRunEntry={renameAuditRunEntry}
        deleteAuditRunEntry={deleteAuditRunEntry}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
      <header className="h-16 border-b border-[#141414] flex items-center justify-between px-6 bg-white/30 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-[#141414]/60 hover:text-[#141414]">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
          <div className="h-6 w-px bg-[#141414]/20"></div>
          <div>
            <span className="text-[10px] uppercase font-bold opacity-50 block">Audit Flow</span>
            <span className="font-bold text-lg leading-tight block">MODEL_VALIDATION</span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[10px] uppercase font-bold opacity-50 block">Status</span>
          <span className="f-mono font-bold text-[#F27D26]">{executionResult ? 'EXECUTED' : 'INTAKE + EXECUTION'}</span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-8 space-y-6">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tighter">Model Validation & Execution</h1>
            <p className="mt-2 max-w-4xl text-sm text-[#141414]/65">
              Capture the model artifact, document the training schema, and run a real backend fairness check for supported model formats.
              Full dataset upload is optional for intake, but executable auditing requires the user to explicitly provide the evaluation dataset.
            </p>
          </div>

          {stageViewActive && (
          <Tabs value={activeStage} onValueChange={handleStageChange} className="w-full">
            <TabsList className="w-full justify-start overflow-x-auto p-1">
              {MODEL_AUDIT_STAGES.map((stage) => (
                <TabsTrigger
                  key={stage.id}
                  value={stage.id}
                  disabled={!stageEnabled[stage.id]}
                  className="shrink-0"
                >
                  {stage.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          )}

          {activeModule === 'model-past-audit-runs' ? (
            <ModelPastRunsWorkspace
              auditRunEntries={auditRunEntries}
              selectedAuditRunId={selectedAuditRunId}
              activeStage={activeArchiveStage}
              setActiveStage={setActiveArchiveStage}
              onMoveToVersioning={handleMoveSavedRunToVersioning}
            />
          ) : activeModule === 'model-versioning' ? (
            <ModelVersioningWorkspace
              versionEntries={versionEntries}
              selectedVersionId={selectedVersionId}
              activeStage={activeArchiveStage}
              setActiveStage={setActiveArchiveStage}
            />
          ) : activeModule === 'model-ai-chat' ? (
            <ModelAuditChat snapshot={currentSnapshotForChat} />
          ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)] gap-8 items-start">
            <div className="space-y-6">
              {activeStage === 'model-intake' && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>Model File</CardTitle>
                      <CardDescription>
                        Upload the artifact you want BiasScope to validate. The file is held in the browser during this intake step.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <div className="flex flex-wrap items-center gap-4">
                        <Button className="relative cursor-pointer">
                          <Upload className="w-4 h-4 mr-2" />
                          Upload Model File
                          <input
                            type="file"
                            className="absolute inset-0 cursor-pointer opacity-0"
                            accept=".pkl,.joblib,.onnx,.h5,.keras,.pt,.pth,.gguf"
                            onChange={handleModelUpload}
                          />
                        </Button>
                        {modelFile && (
                          <Badge variant="secondary" className="px-3 py-1 text-sm">
                            <FileCode2 className="w-3 h-3 mr-1" />
                            {modelFile.name}
                          </Badge>
                        )}
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Model format</label>
                        <Select value={modelType} onValueChange={(value) => setModelType(value as ModelType)}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Choose a model format" />
                          </SelectTrigger>
                          <SelectContent>
                            {MODEL_TYPE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-sm text-[#141414]/60">{modelTypeInfo.note}</p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <label className="text-sm font-medium">Short model purpose</label>
                          <HoverCard>
                            <HoverCardTrigger><Info className="w-4 h-4 text-gray-500 hover:text-black cursor-help" /></HoverCardTrigger>
                            <HoverCardContent className="w-72">
                              <p className="font-bold mb-1">Why ask this?</p>
                              <p className="text-gray-600 text-sm">
                                This helps BiasScope explain later whether the dependent column and the uploaded dataset actually match the model's task.
                              </p>
                            </HoverCardContent>
                          </HoverCard>
                        </div>
                        <Textarea
                          value={modelPurpose}
                          onChange={(event) => setModelPurpose(event.target.value)}
                          placeholder="Example: Predict whether a loan application is approved using application features."
                          className="min-h-24"
                        />
                      </div>

                      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                        <p className="font-semibold">Format-specific cautions</p>
                        <div className="mt-2 space-y-2">
                          {buildFormatWarnings(modelType).map((warning, index) => (
                            <p key={index}>• {warning}</p>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex justify-end">
                    <Button onClick={() => handleStageChange('training-schema')} disabled={!stageEnabled['training-schema']}>
                      Continue to Training Schema
                    </Button>
                  </div>
                </>
              )}

              {activeStage === 'training-schema' && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>Training Schema Manifest</CardTitle>
                      <CardDescription>
                        List the columns used during model training. Every new column starts as independent by default. At least one column must be marked dependent before you can proceed.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-3">
                        <Input
                          value={columnForm.name}
                          onChange={(event) => setColumnForm((current) => ({ ...current, name: event.target.value }))}
                          placeholder="Column name"
                        />
                        <Input
                          value={columnForm.description}
                          onChange={(event) => setColumnForm((current) => ({ ...current, description: event.target.value }))}
                          placeholder="Short description (optional but helpful)"
                        />
                        <Button type="button" onClick={addTrainingColumn}>
                          <Plus className="w-4 h-4 mr-2" />
                          Add Column
                        </Button>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <Badge variant="outline">{trainingColumns.length} columns listed</Badge>
                        <Badge variant={hasDependentColumn ? 'secondary' : 'outline'}>
                          {dependentColumns.length} dependent
                        </Badge>
                        <Badge variant="outline">{independentColumns.length} independent</Badge>
                      </div>

                      <div className="space-y-3">
                        {trainingColumns.length === 0 && (
                          <div className="rounded-xl border border-dashed border-[#141414]/15 bg-white px-4 py-6 text-sm text-[#141414]/55">
                            Add columns manually now, or upload a full dataset in the next step and BiasScope will import the column names locally.
                          </div>
                        )}

                        {trainingColumns.map((column) => (
                          <div key={column.id} className="rounded-2xl border border-[#141414]/10 bg-white p-4 space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)_200px_auto] gap-3 items-start">
                              <Input
                                value={column.name}
                                onChange={(event) => updateColumn(column.id, { name: event.target.value })}
                                placeholder="Column name"
                              />
                              <Input
                                value={column.description}
                                onChange={(event) => updateColumn(column.id, { description: event.target.value })}
                                placeholder="What does this column mean?"
                              />
                              <Select
                                value={column.role}
                                onValueChange={(value) => updateColumn(column.id, { role: value as ColumnRole })}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {ROLE_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button type="button" variant="outline" onClick={() => removeColumn(column.id)}>
                                <Trash2 className="w-4 h-4 mr-2" />
                                Remove
                              </Button>
                            </div>
                            {duplicateNames.has(column.name.trim().toLowerCase()) && (
                              <p className="text-sm text-red-600">This column name is duplicated. Resolve duplicates before proceeding.</p>
                            )}
                          </div>
                        ))}
                      </div>

                      {!hasDependentColumn && (
                        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
                          <p className="font-semibold">Dependent column required</p>
                          <p className="mt-1">
                            BiasScope cannot continue until at least one training column is labeled dependent. This is the output the model was trained to predict.
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => handleStageChange('model-intake')}>Back</Button>
                    <Button onClick={() => handleStageChange('data-access')} disabled={!stageEnabled['data-access']}>
                      Continue to Data Access
                    </Button>
                  </div>
                </>
              )}

              {activeStage === 'data-access' && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>Data Access Strategy</CardTitle>
                      <CardDescription>
                        Users can stay in metadata-only mode for privacy, or upload the full dataset locally so BiasScope can capture the full training schema more accurately.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button
                          type="button"
                          onClick={() => setDataAccessMode('metadata-only')}
                          className={`rounded-2xl border p-4 text-left transition-all ${
                            dataAccessMode === 'metadata-only'
                              ? 'border-[#F27D26] bg-[#F27D26]/10 shadow-[3px_3px_0px_#141414]'
                              : 'border-[#141414]/15 bg-white hover:border-[#141414]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Lock className="w-4 h-4 text-[#F27D26]" />
                            <span className="font-semibold">Metadata only</span>
                          </div>
                          <p className="mt-2 text-sm text-[#141414]/70">
                            Keep the full dataset private. Only the model file metadata and the manually documented training columns are used in this intake.
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setDataAccessMode('full-dataset')}
                          className={`rounded-2xl border p-4 text-left transition-all ${
                            dataAccessMode === 'full-dataset'
                              ? 'border-[#F27D26] bg-[#F27D26]/10 shadow-[3px_3px_0px_#141414]'
                              : 'border-[#141414]/15 bg-white hover:border-[#141414]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Database className="w-4 h-4 text-[#F27D26]" />
                            <span className="font-semibold">Upload full dataset locally</span>
                          </div>
                          <p className="mt-2 text-sm text-[#141414]/70">
                            Parse the dataset in the browser, import its column names, and capture row and column counts for a stronger validation plan.
                          </p>
                        </button>
                      </div>

                      {dataAccessMode === 'full-dataset' && (
                        <div className="rounded-2xl border border-[#141414]/10 bg-white p-4 space-y-4">
                          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                            <p className="font-semibold">Privacy note</p>
                            <p className="mt-1">
                              During intake, the dataset file is parsed locally in the browser to extract column names and row counts. BiasScope does not send the full file to the backend just to generate the readiness memo. The file is only sent later if the user explicitly runs the executable audit.
                            </p>
                          </div>

                          <Button className="relative cursor-pointer" variant="outline">
                            <Upload className="w-4 h-4 mr-2" />
                            {datasetUploadLoading ? 'Parsing dataset...' : 'Upload CSV / Excel'}
                            <input
                              type="file"
                              accept=".csv,.xlsx,.xls"
                              className="absolute inset-0 cursor-pointer opacity-0"
                              onChange={handleDatasetUpload}
                              disabled={datasetUploadLoading}
                            />
                          </Button>

                          {datasetSummary && (
                            <div className="rounded-xl border border-[#141414]/10 bg-[#141414]/[0.03] p-4 text-sm">
                              <p className="font-semibold">{datasetSummary.fileName}</p>
                              <p className="mt-1 text-[#141414]/65">
                                {datasetSummary.rowCount} rows · {datasetSummary.columnCount} columns imported locally
                              </p>
                              <p className="mt-2 text-[#141414]/70">
                                Imported columns: {datasetSummary.columns.join(', ')}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => handleStageChange('training-schema')}>Back</Button>
                    <Button onClick={() => handleStageChange('readiness-review')}>
                      Continue to Readiness Review
                    </Button>
                  </div>
                </>
              )}

              {activeStage === 'readiness-review' && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>Readiness Review</CardTitle>
                      <CardDescription>
                        Validate whether BiasScope has enough trustworthy metadata to move from intake into later model-bias execution work.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {readinessChecklist.map((item) => (
                          <div
                            key={item.label}
                            className={`rounded-2xl border p-4 ${
                              item.ready ? 'border-green-200 bg-green-50/70' : 'border-amber-200 bg-amber-50/80'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {item.ready ? (
                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                              ) : (
                                <AlertTriangle className="w-4 h-4 text-amber-700" />
                              )}
                              <span className="font-semibold text-sm">{item.label}</span>
                            </div>
                            <p className="mt-2 text-sm text-[#141414]/70">{item.detail}</p>
                          </div>
                        ))}
                      </div>

                      <div className="rounded-2xl border border-[#141414]/10 bg-white p-4 space-y-3">
                        <p className="font-semibold">Model format guidance</p>
                        {buildFormatWarnings(modelType).map((warning, index) => (
                          <p key={index} className="text-sm text-[#141414]/70">• {warning}</p>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <Badge variant="outline">{dependentColumns.length} dependent</Badge>
                        <Badge variant="outline">{independentColumns.length} independent</Badge>
                        <Badge variant="outline">{dataAccessMode === 'full-dataset' ? 'Full dataset mode' : 'Metadata only mode'}</Badge>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => handleStageChange('data-access')}>Back</Button>
                    <div className="flex gap-3">
                      <Button onClick={generateReadinessMemo} disabled={!canGenerateMemo || memoLoading}>
                        <Sparkles className="w-4 h-4 mr-2" />
                        {memoLoading ? 'Generating memo...' : 'Generate Validation Memo'}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => handleStageChange('execution')}
                        disabled={!stageEnabled['execution']}
                      >
                        Continue to Execution
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {activeStage === 'execution' && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>Executable Audit Setup</CardTitle>
                      <CardDescription>
                        This step sends the uploaded model and evaluation dataset to the backend, generates real predictions, and then runs BiasScope's fairness metrics on those predictions.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      {!executionModelSupported && (
                        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                          <p className="font-semibold">Execution support is format-limited for now</p>
                          <p className="mt-1">
                            The backend execution path is currently live for Scikit-Learn `.pkl` and `.joblib` files. Other formats still stay in intake-and-readiness mode until their runtime loaders are added safely.
                          </p>
                        </div>
                      )}

                      <div className="rounded-2xl border border-[#141414]/10 bg-white p-4 space-y-4">
                        <div>
                          <p className="text-[10px] uppercase tracking-widest opacity-50">Files sent on execution</p>
                          <p className="mt-1 text-sm text-[#141414]/70">
                            Model: {modelFile?.name || 'No model uploaded'} · Dataset: {datasetFile?.name || 'No dataset uploaded'}
                          </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Ground truth column</label>
                            <Select value={selectedGroundTruthColumn} onValueChange={setSelectedGroundTruthColumn}>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Choose the real outcome column" />
                              </SelectTrigger>
                              <SelectContent>
                                {dependentDatasetColumns.map((column) => (
                                  <SelectItem key={column.id} value={column.name}>
                                    {column.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-[#141414]/60">
                              BiasScope compares the model's fresh predictions against this real outcome column when calculating accuracy-related fairness gaps.
                            </p>
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-medium">Protected columns</label>
                            <div className="flex flex-wrap gap-2">
                              {datasetColumnOptions.length === 0 ? (
                                <p className="text-sm text-[#141414]/55">Upload the full dataset first to choose protected columns.</p>
                              ) : (
                                datasetColumnOptions
                                  .filter((column) => column !== selectedGroundTruthColumn)
                                  .map((column) => {
                                    const selected = selectedProtectedColumns.includes(column);
                                    return (
                                      <button
                                        key={column}
                                        type="button"
                                        onClick={() => toggleProtectedColumn(column)}
                                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                                          selected
                                            ? 'border-[#F27D26] bg-[#F27D26]/10 text-[#141414]'
                                            : 'border-[#141414]/15 bg-white text-[#141414]/65 hover:border-[#141414]'
                                        }`}
                                      >
                                        {column}
                                      </button>
                                    );
                                  })
                              )}
                            </div>
                            <p className="text-xs text-[#141414]/60">
                              Choose the demographic columns you want the fairness comparison to use, such as `sex`, `race`, or `age_band`.
                            </p>
                          </div>
                        </div>
                      </div>

                      {executionBlockers.length > 0 && (
                        <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
                          <p className="font-semibold">Execution blockers</p>
                          <div className="mt-2 space-y-1">
                            {executionBlockers.map((blocker) => (
                              <p key={blocker}>• {blocker}</p>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="rounded-2xl border border-[#141414]/10 bg-white p-4 text-sm text-[#141414]/70">
                        <p className="font-semibold text-[#141414]">What happens when you click run</p>
                        <div className="mt-2 space-y-1">
                          <p>• The backend loads the model artifact in a Python execution environment.</p>
                          <p>• The uploaded evaluation dataset is passed through the model to generate fresh predictions.</p>
                          <p>• BiasScope computes fairness gaps across the protected columns you selected.</p>
                          <p>• Gemini then explains the findings in plain English.</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {executionResult && (
                    <>
                      <Card>
                        <CardHeader>
                          <CardTitle>Execution Outcome</CardTitle>
                          <CardDescription>
                            Real backend predictions have been generated and evaluated for fairness.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="rounded-2xl border border-[#141414]/10 bg-white p-4">
                              <p className="text-[10px] uppercase tracking-widest opacity-50">Rows Scored</p>
                              <p className="mt-2 text-2xl font-black">{executionResult.rowCount}</p>
                            </div>
                            <div className="rounded-2xl border border-[#141414]/10 bg-white p-4">
                              <p className="text-[10px] uppercase tracking-widest opacity-50">Prediction Column</p>
                              <p className="mt-2 font-semibold">{executionResult.predictionColumn}</p>
                            </div>
                            <div className="rounded-2xl border border-[#141414]/10 bg-white p-4">
                              <p className="text-[10px] uppercase tracking-widest opacity-50">Ground Truth Used</p>
                              <p className="mt-2 font-semibold">{executionResult.groundTruthSourceColumn || 'No ground truth provided'}</p>
                            </div>
                            <div className="rounded-2xl border border-[#141414]/10 bg-white p-4">
                              <p className="text-[10px] uppercase tracking-widest opacity-50">Positive Label</p>
                              <p className="mt-2 font-semibold">{String(executionResult.positiveLabelChosen ?? 'Unknown')}</p>
                            </div>
                          </div>

                          {executionResult.warnings && executionResult.warnings.length > 0 && (
                            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                              <p className="font-semibold">Runtime warnings</p>
                              <div className="mt-2 space-y-1">
                                {executionResult.warnings.map((warning) => (
                                  <p key={warning}>• {warning}</p>
                                ))}
                              </div>
                            </div>
                          )}

                          {executionResult.fairness && Object.entries(executionResult.fairness).map(([column, metrics]: [string, any]) => (
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
                                  {metrics.averageOddsDifference !== undefined && (
                                    <Badge variant="outline">Avg Odds {formatMetric(metrics.averageOddsDifference)}</Badge>
                                  )}
                                  {metrics.errorRateDifference !== undefined && (
                                    <Badge variant="outline">Err Diff {formatMetric(metrics.errorRateDifference)}</Badge>
                                  )}
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {Object.entries(metrics.groupMetrics || {}).map(([group, values]: [string, any]) => (
                                  <div key={group} className="rounded-xl border border-[#141414]/10 bg-[#141414]/[0.03] p-3 text-sm">
                                    <p className="font-semibold">{group}</p>
                                    <p className="mt-1 text-[#141414]/70">Rows: {values.count}</p>
                                    <p className="text-[#141414]/70">Positive rate: {formatMetric(values.positiveRate)}</p>
                                    {values.tpr !== undefined && <p className="text-[#141414]/70">TPR: {formatMetric(values.tpr)}</p>}
                                    {values.fpr !== undefined && <p className="text-[#141414]/70">FPR: {formatMetric(values.fpr)}</p>}
                                    {values.errorRate !== undefined && <p className="text-[#141414]/70">Error rate: {formatMetric(values.errorRate)}</p>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}

                          {executionResult.previewRows.length > 0 && (
                            <div className="rounded-2xl border border-[#141414]/10 bg-white p-4 space-y-3">
                              <p className="font-semibold">Prediction preview</p>
                              <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                  <thead>
                                    <tr className="border-b border-[#141414]/10">
                                      {Object.keys(executionResult.previewRows[0]).map((column) => (
                                        <th key={column} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{column}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {executionResult.previewRows.map((row, index) => (
                                      <tr key={index} className="border-b border-[#141414]/5">
                                        {Object.keys(executionResult.previewRows[0]).map((column) => (
                                          <td key={column} className="px-3 py-2 whitespace-nowrap text-[#141414]/75">
                                            {String(row[column] ?? '')}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </>
                  )}

                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => handleStageChange('readiness-review')}>Back</Button>
                    <div className="flex gap-3">
                    <Button onClick={runExecutableAudit} disabled={!canRunExecution || executionLoading}>
                      <ShieldCheck className="w-4 h-4 mr-2" />
                      {executionLoading ? 'Running executable audit...' : executionResult ? 'Run Audit Again' : 'Run Executable Audit'}
                    </Button>
                    <Button variant="secondary" onClick={handleMoveCurrentToVersioning} disabled={!executionResult}>
                      Move To Versioning
                    </Button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="sticky top-6 space-y-6">
              <Card className="border-[#141414] shadow-[4px_4px_0px_#141414]">
                <CardHeader>
                  <CardTitle>Validation Summary</CardTitle>
                  <CardDescription>Live intake and execution status for the current model-validation run.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest opacity-50">Model</p>
                    <p className="mt-1 font-semibold">{modelFile?.name || 'No model uploaded yet'}</p>
                    <p className="mt-1 text-[#141414]/60">{MODEL_TYPE_OPTIONS.find((option) => option.value === modelType)?.label}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest opacity-50">Schema</p>
                    <p className="mt-1 text-[#141414]/70">
                      {trainingColumns.length} columns documented · {dependentColumns.length} dependent
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest opacity-50">Data Access</p>
                    <p className="mt-1 text-[#141414]/70">
                      {dataAccessMode === 'metadata-only'
                        ? 'Metadata only'
                        : datasetSummary
                          ? `${datasetSummary.fileName} loaded locally`
                          : 'Waiting for full dataset upload'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest opacity-50">Execution</p>
                    <p className="mt-1 text-[#141414]/70">
                      {executionResult
                        ? `Completed on ${executionResult.rowCount} rows`
                        : canRunExecution
                          ? 'Ready to run'
                          : executionModelSupported
                            ? 'Waiting for execution inputs'
                            : 'Sklearn execution only for now'}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <LlmCompanion
                title={executionResult ? "Executable Audit Summary" : "Model Validation Memo"}
                description={executionResult ? "Gemini explanation of the backend model run" : "Gemini readiness analysis for the uploaded model intake"}
                message={
                  executionResult?.llmSummary
                    ? { title: 'Executable Model Audit Summary', content: executionResult.llmSummary }
                    : readinessMemo
                      ? { title: 'Model Validation Readiness Memo', content: readinessMemo }
                      : undefined
                }
                loading={activeStage === 'execution' ? executionLoading : memoLoading}
                action={{
                  label: executionResult ? 'Run Audit Again' : activeStage === 'execution' ? 'Run Executable Audit' : 'Generate Memo',
                  onClick: activeStage === 'execution' ? runExecutableAudit : generateReadinessMemo,
                  disabled: activeStage === 'execution' ? !canRunExecution : !canGenerateMemo,
                }}
              />
            </div>
          </div>
          )}
        </div>
      </main>
      </div>
    </div>
  );
}
