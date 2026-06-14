import React, { useState } from 'react';
import { useAudit } from '../../context/AuditContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/card';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';
import { BrainCircuit, Upload, Database, Sparkles, Info } from 'lucide-react';
import { Badge } from '../ui/badge';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import axios from 'axios';
import { toast } from 'sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { ScrollArea } from '../ui/scroll-area';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../ui/hover-card';
import { LlmCompanion } from '../ui/llm-companion';
import { apiUrl } from '../../lib/api';
import { getSampleDatasetById, SAMPLE_DATASETS, type SampleDatasetDefinition } from '../../lib/sampleDatasets';
import { EMPTY_GOVERNANCE_ANSWERS, getRandomGovernanceAnswers } from '../../lib/governanceOptions';

const DEFAULT_PROBLEM_FRAMING = {
  taskDescription: '',
  domain: '',
  stakeholders: '',
  humanBaseline: '',
  benefit: ''
};

type DataSourceMode = 'upload' | 'sample' | null;

export function ProjectSetup() {
  // Context state
  const { 
    problemFraming, setProblemFraming, addLlmMessage, clearLlmMessages,
    dataset, setDataset, datasetStats, setDatasetStats, setAssociations, setFairnessMetrics, setSubgroups, 
    setGovernance,
    targetColumn, setTargetColumn, groundTruthColumn, setGroundTruthColumn, 
    protectedColumns, setProtectedColumns, llmMessages, loadingModules, setLoadingModules,
    clearChatMessages, setSystemDecision, setRemediationPlan, setRemediationPreview, setRemediationResult,
    clearCurrentAuditRunLink,
    datasetLabel, setDatasetLabel
  } = useAudit();
  
  // Local loading states
  const [dataSourceMode, setDataSourceMode] = useState<DataSourceMode>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [selectedSampleId, setSelectedSampleId] = useState('');
  const [auditLoading, setAuditLoading] = useState(false);
  const currentSample = selectedSampleId ? getSampleDatasetById(selectedSampleId) : undefined;
  const showSampleSelector = dataSourceMode === 'sample';
  const projectSetupLocked = auditLoading || Boolean(loadingModules['project-setup']) || llmMessages.some((message) => message.type === 'project-setup');

  const resetAuditState = () => {
    setDatasetStats(null);
    setAssociations(null);
    setFairnessMetrics(null);
    setSubgroups(null);
    setSystemDecision(null);
    setRemediationPlan(null);
    setRemediationPreview(null);
    setRemediationResult(null);
    clearCurrentAuditRunLink();
    clearLlmMessages();
    clearChatMessages();
    setLoadingModules({});
  };

  const clearDatasetSelection = () => {
    setDataset(null);
    setDatasetLabel('Untitled Dataset');
    setDatasetStats(null);
    setAssociations(null);
    setFairnessMetrics(null);
    setSubgroups(null);
    setTargetColumn('');
    setGroundTruthColumn('');
    setProtectedColumns([]);
    setGovernance(EMPTY_GOVERNANCE_ANSWERS);
    setSystemDecision(null);
    setRemediationPlan(null);
    setRemediationPreview(null);
    setRemediationResult(null);
    clearCurrentAuditRunLink();
    setProblemFraming(DEFAULT_PROBLEM_FRAMING);
    clearLlmMessages();
    clearChatMessages();
    setLoadingModules({});
  };

  const activateDataSourceMode = (mode: Exclude<DataSourceMode, null>) => {
    if (projectSetupLocked) {
      return;
    }

    const switchingModes = dataSourceMode !== mode;
    setDataSourceMode(mode);

    if (mode === 'upload') {
      setSelectedSampleId('');
    }

    if (switchingModes) {
      clearDatasetSelection();
    }
  };

  const applySamplePreset = (sampleDefinition: SampleDatasetDefinition) => {
    setProblemFraming(sampleDefinition.problemFraming);
    setTargetColumn(sampleDefinition.targetColumn);
    setGroundTruthColumn(sampleDefinition.groundTruthColumn);
    setProtectedColumns(sampleDefinition.protectedColumns);
    setGovernance(getRandomGovernanceAnswers());
  };

  const applyDataset = async (
    data: any[],
    options: {
      sourceLabel: string;
      sampleDefinition?: SampleDatasetDefinition;
    }
  ) => {
    if (!data.length) {
      throw new Error('No rows were found in the selected dataset.');
    }

    setDataset(data);
    setDatasetLabel(options.sourceLabel || datasetLabel || 'Untitled Dataset');
    resetAuditState();

    if (options.sampleDefinition) {
      applySamplePreset(options.sampleDefinition);
      toast.success(`${options.sourceLabel} loaded. Questionnaire, key columns, and oversight answers were auto-filled.`);
    } else {
      setProblemFraming(DEFAULT_PROBLEM_FRAMING);
      setTargetColumn('');
      setGroundTruthColumn('');
      setProtectedColumns([]);
      setGovernance(EMPTY_GOVERNANCE_ANSWERS);
      toast.success(`Successfully parsed ${data.length} rows. Analyzing schema...`);
    }

    try {
      const columns = Object.keys(data[0] || {});
      const sampleData = data.slice(0, 3);
      const res = await axios.post(apiUrl('/api/llm/detect-protected'), { columns, sampleData });

      if (!options.sampleDefinition) {
        if (res.data.protectedCols && res.data.protectedCols.length > 0) {
          setProtectedColumns(res.data.protectedCols);
          toast.success(`Auto-detected protected attribute: ${res.data.protectedCols[0]}`);
        } else {
          toast.info('Could not auto-detect protected attribute. Please select manually.');
        }
      } else if (res.data.protectedCols && res.data.protectedCols.length > 0) {
        toast.message(`Suggested protected attributes detected: ${res.data.protectedCols.join(', ')}`);
      }
    } catch (err) {
      console.error("Auto-detect failed", err);
    }
  };
  
  // Dataset Handlers
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    activateDataSourceMode('upload');
    setUploadLoading(true);
    setSelectedSampleId('');

    const processData = async (data: any[]) => {
      try {
        await applyDataset(data, { sourceLabel: file.name });
      } finally {
        setUploadLoading(false);
      }
    };

    if (file.name.endsWith('.csv')) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        complete: (results) => processData(results.data),
        error: (err) => {
          toast.error('Failed to parse CSV.', { description: err.message });
          setUploadLoading(false);
        }
      });
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const data = XLSX.utils.sheet_to_json(ws, { defval: null });
          processData(data);
        } catch (err: any) {
          toast.error('Failed to parse Excel file.', { description: err.message });
          setUploadLoading(false);
        }
      };
      reader.onerror = () => {
         toast.error('Error reading file.');
         setUploadLoading(false);
      };
      reader.readAsBinaryString(file);
    } else {
      toast.error('Unsupported file type. Please upload CSV or Excel.');
      setUploadLoading(false);
    }
  };

  const handleSampleSelection = async (sampleId: string) => {
    activateDataSourceMode('sample');
    setSelectedSampleId(sampleId);
    const sampleDefinition = getSampleDatasetById(sampleId);
    if (!sampleDefinition) {
      toast.error('Could not find that sample dataset.');
      return;
    }

    setSampleLoading(true);

    try {
      setSampleLoading(true);
      const response = await fetch(sampleDefinition.csvUrl);
      const csvText = await response.text();

      const parsed = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
      });

      if (parsed.errors.length > 0) {
        throw new Error(parsed.errors[0].message);
      }

      await applyDataset(parsed.data as any[], { sourceLabel: sampleDefinition.name, sampleDefinition });
    } catch (err: any) {
      toast.error('Failed to load sample dataset.', { description: err.message });
    } finally {
      setSampleLoading(false);
    }
  };

  const runUnifiedAudit = async () => {
    if (!dataset) {
      toast.error('Please upload a dataset first.');
      return;
    }
    
    setAuditLoading(true);
    
    try {
      // 1. Run Deterministic Scan
      const scanRes = await axios.post(apiUrl('/api/audit/analyze'), {
        data: dataset,
        targetColumn,
        groundTruthColumn,
        protectedColumns
      });
      
      setDatasetStats(scanRes.data.datasetStats);
      if (scanRes.data.associations) setAssociations(scanRes.data.associations);
      if (scanRes.data.fairness) setFairnessMetrics(scanRes.data.fairness);
      if (scanRes.data.subgroups) setSubgroups(scanRes.data.subgroups);
      
      toast.success('Deterministic analysis complete. Initiating Sociotechnical Waterfall...');
      setAuditLoading(false); // Turn off main button loading, as we shift to modules

      // Clear previous memos
      clearLlmMessages();
      clearChatMessages();
      setSystemDecision(null);

      // ==========================================
      // WATERFALL LLM PIPELINE
      // ==========================================

      // STEP 1: Project Setup Memo
      setLoadingModules(prev => ({ ...prev, 'project-setup': true }));
      const llmRes1 = await axios.post(apiUrl('/api/llm/project-setup'), { 
        questionnaire: problemFraming,
        stats: scanRes.data.datasetStats
      });
      addLlmMessage({
        type: 'project-setup',
        title: 'Project Setup Review',
        content: llmRes1.data.memo
      });
      setLoadingModules(prev => ({ ...prev, 'project-setup': false }));

      // STEP 2: Proxy Legitimacy Review
      setLoadingModules(prev => ({ ...prev, 'proxy-screening': true }));
      const llmRes2 = await axios.post(apiUrl('/api/llm/proxy'), { associations: scanRes.data.associations.slice(0, 10) });
      addLlmMessage({
        type: 'proxy',
        title: 'Proxy Legitimacy Review',
        content: llmRes2.data.evaluation
      });
      setLoadingModules(prev => ({ ...prev, 'proxy-screening': false }));

      // STEP 3 & 4: Subgroup & Fairness Interpretation
      setLoadingModules(prev => ({ ...prev, 'fairness-metrics': true, 'subgroup-audit': true }));
      const llmRes3 = await axios.post(apiUrl('/api/llm/fairness'), { 
        fairnessMetrics: scanRes.data.fairness, 
        subgroups: scanRes.data.subgroups 
      });
      addLlmMessage({
        type: 'subgroup',
        title: 'Subgroup & Fairness Interpretation',
        content: llmRes3.data.summary
      });
      setLoadingModules(prev => ({ ...prev, 'fairness-metrics': false, 'subgroup-audit': false }));

      toast.success('Sociotechnical analysis complete. Awaiting Governance review.');

    } catch (e: any) {
      toast.error('Audit failed.', { description: e.response?.data?.error || e.message });
      setAuditLoading(false);
      setLoadingModules({});
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h2 className="text-2xl font-bold tracking-tight uppercase">Project Setup</h2>
        <p className="text-[10px] uppercase opacity-50 tracking-widest mt-1">Define the problem framing and upload your dataset to begin the audit.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
        <div className="space-y-6">

      {/* SECTION 1: DATASET UPLOAD */}
      <Card>
        <CardHeader>
          <CardTitle>Data Upload & Configuration</CardTitle>
          <CardDescription>
            {projectSetupLocked
              ? 'Upload a CSV file or load a sample dataset, then specify key columns. This section locks once analysis starts.'
              : 'Upload a CSV file or try a sample dataset, then specify key columns.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            <Button
              variant={dataSourceMode === 'upload' ? 'default' : 'outline'}
              className="relative cursor-pointer"
              onClick={() => activateDataSourceMode('upload')}
              disabled={uploadLoading || sampleLoading || projectSetupLocked}
            >
               <Upload className="w-4 h-4 mr-2" />
               {uploadLoading ? 'Uploading...' : 'Upload CSV / Excel'}
               <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" disabled={uploadLoading || sampleLoading || projectSetupLocked} />
            </Button>
            <Button
              variant={dataSourceMode === 'sample' ? 'default' : 'secondary'}
              type="button"
              onClick={() => activateDataSourceMode('sample')}
              disabled={uploadLoading || sampleLoading || projectSetupLocked}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {sampleLoading ? 'Loading Sample...' : 'Try Sample Data'}
            </Button>
            {dataset && (
              <Badge variant="secondary" className="px-3 py-1 text-sm font-medium">
                <Database className="w-3 h-3 mr-1" />
                {dataset.length} rows loaded
              </Badge>
            )}
            {currentSample && (
              <Badge variant="outline" className="px-3 py-1 text-sm font-medium">
                <Sparkles className="w-3 h-3 mr-1" />
                {currentSample.name}
              </Badge>
            )}
          </div>

          {showSampleSelector && (
            <div className="space-y-2">
              <Label>Sample Dataset</Label>
              <Select value={selectedSampleId} onValueChange={handleSampleSelection} disabled={sampleLoading || projectSetupLocked}>
                <SelectTrigger className="w-full" disabled={sampleLoading || projectSetupLocked}>
                  <SelectValue placeholder="Choose a sample dataset to auto-fill the audit setup" />
                </SelectTrigger>
                <SelectContent>
                  {SAMPLE_DATASETS.map((sample) => (
                    <SelectItem key={sample.id} value={sample.id}>
                      {sample.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {currentSample && (
                <p className="text-xs text-[#141414]/60">{currentSample.description}</p>
              )}
            </div>
          )}

          {dataset && dataset.length > 0 && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-[#F27D26]">Model Prediction (Target)</label>
                    <HoverCard>
                      <HoverCardTrigger><Info className="w-4 h-4 text-gray-500 hover:text-black cursor-help" /></HoverCardTrigger>
                      <HoverCardContent>
                        <p className="font-bold mb-1">What this means:</p>
                        <p className="text-gray-600">The specific column containing the AI's predicted outcome or score.</p>
                        <p className="font-bold mt-2 mb-1">Example:</p>
                        <p className="text-gray-600">"Model_Decision" or "Risk Score" (1-100).</p>
                      </HoverCardContent>
                    </HoverCard>
                  </div>
                  <Select value={targetColumn} onValueChange={setTargetColumn} disabled={projectSetupLocked}>
                    <SelectTrigger className="w-full" disabled={projectSetupLocked}><SelectValue placeholder="Select prediction column" /></SelectTrigger>
                    <SelectContent>
                      {Object.keys(dataset[0]).map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-purple-600">Ground Truth Label (Optional)</label>
                    <HoverCard>
                      <HoverCardTrigger><Info className="w-4 h-4 text-gray-500 hover:text-black cursor-help" /></HoverCardTrigger>
                      <HoverCardContent>
                        <p className="font-bold mb-1">Why provide this?</p>
                        <p className="text-gray-600">If you have the actual, real-world outcomes, select it here. This unlocks advanced AIF360 Classification Metrics like True Positive Rate and Equal Opportunity.</p>
                      </HoverCardContent>
                    </HoverCard>
                  </div>
                  <Select value={groundTruthColumn} onValueChange={setGroundTruthColumn} disabled={projectSetupLocked}>
                    <SelectTrigger className="w-full" disabled={projectSetupLocked}><SelectValue placeholder="Select ground truth column" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- None --</SelectItem>
                      {Object.keys(dataset[0]).map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium">Primary Protected Attribute</label>
                    <HoverCard>
                      <HoverCardTrigger><Info className="w-4 h-4 text-gray-500 hover:text-black cursor-help" /></HoverCardTrigger>
                      <HoverCardContent>
                        <p className="font-bold mb-1">What this means:</p>
                        <p className="text-gray-600">The demographic columns used to test if the model is biased against a certain group. You can select multiple!</p>
                        <p className="font-bold mt-2 mb-1">Example:</p>
                        <p className="text-gray-600">Race, Gender, Age, or Zip Code.</p>
                      </HoverCardContent>
                    </HoverCard>
                  </div>
                  {protectedColumns.length > 0 && (
                    <span className="text-[10px] text-green-600 font-bold flex items-center bg-green-100 px-2 py-0.5 rounded-full">
                      <Sparkles className="w-3 h-3 mr-1" /> {currentSample ? 'Preset' : 'Auto-detected'}
                    </span>
                  )}
                </div>
                <div className="border rounded-md h-32 overflow-y-auto p-2 space-y-1 bg-white">
                  {Object.keys(dataset[0]).map(k => (
                    <label key={k} className={`flex items-center gap-2 text-sm p-1 rounded ${projectSetupLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-gray-50'}`}>
                      <input 
                        type="checkbox" 
                        className="rounded border-gray-300"
                        checked={protectedColumns.includes(k)}
                        disabled={projectSetupLocked}
                        onChange={() => {
                          if (protectedColumns.includes(k)) {
                            setProtectedColumns(protectedColumns.filter(c => c !== k));
                          } else {
                            setProtectedColumns([...protectedColumns, k]);
                          }
                        }}
                      />
                      {k}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SECTION 2: PROBLEM FRAMING */}
      <Card>
        <CardHeader>
          <CardTitle>Decision Questionnaire</CardTitle>
          <CardDescription>
            {projectSetupLocked
              ? 'Describe the system\'s intended function and impact. This section locks once analysis starts.'
              : 'Describe the system\'s intended function and impact.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 bg-[#E4E3E0] m-4 border border-[#141414] shadow-inner p-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="task">What decision is being automated?</Label>
              <HoverCard>
                <HoverCardTrigger><Info className="w-4 h-4 text-gray-500 hover:text-black cursor-help" /></HoverCardTrigger>
                <HoverCardContent>
                  <p className="font-bold mb-1">What this means:</p>
                  <p className="text-gray-600">The specific yes/no or classification choice the AI will make.</p>
                  <p className="font-bold mt-2 mb-1">Example:</p>
                  <p className="text-gray-600">"Automatically rejecting resumes without human review" or "Flagging a transaction as fraudulent."</p>
                </HoverCardContent>
              </HoverCard>
            </div>
            <Input id="task" value={problemFraming.taskDescription} onChange={(e) => setProblemFraming({...problemFraming, taskDescription: e.target.value})} placeholder="e.g. Rejecting loan applications automatically" disabled={projectSetupLocked} />
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="domain">Domain</Label>
              <HoverCard>
                <HoverCardTrigger><Info className="w-4 h-4 text-gray-500 hover:text-black cursor-help" /></HoverCardTrigger>
                <HoverCardContent>
                  <p className="font-bold mb-1">What this means:</p>
                  <p className="text-gray-600">The industry or context where the AI is operating. Some domains have strict legal regulations.</p>
                  <p className="font-bold mt-2 mb-1">Example:</p>
                  <p className="text-gray-600">Healthcare, Criminal Justice, Financial Lending, Hiring.</p>
                </HoverCardContent>
              </HoverCard>
            </div>
            <Input id="domain" value={problemFraming.domain} onChange={(e) => setProblemFraming({...problemFraming, domain: e.target.value})} placeholder="e.g. Healthcare, Lending, Hiring" disabled={projectSetupLocked} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="harm">Who may be harmed?</Label>
              <HoverCard>
                <HoverCardTrigger><Info className="w-4 h-4 text-gray-500 hover:text-black cursor-help" /></HoverCardTrigger>
                <HoverCardContent>
                  <p className="font-bold mb-1">What this means:</p>
                  <p className="text-gray-600">The specific groups of people who might suffer if the AI makes a mistake.</p>
                  <p className="font-bold mt-2 mb-1">Example:</p>
                  <p className="text-gray-600">"Low-income loan applicants" or "Patients with rare diseases."</p>
                </HoverCardContent>
              </HoverCard>
            </div>
            <Input id="harm" value={problemFraming.stakeholders} onChange={(e) => setProblemFraming({...problemFraming, stakeholders: e.target.value})} placeholder="e.g. Low-income applicants" disabled={projectSetupLocked} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="baseline">What is the baseline human process?</Label>
              <HoverCard>
                <HoverCardTrigger><Info className="w-4 h-4 text-gray-500 hover:text-black cursor-help" /></HoverCardTrigger>
                <HoverCardContent>
                  <p className="font-bold mb-1">What this means:</p>
                  <p className="text-gray-600">How is this decision made *today* without AI? We need to know what we are replacing.</p>
                  <p className="font-bold mt-2 mb-1">Example:</p>
                  <p className="text-gray-600">"Three loan officers manually review files taking 45 mins each."</p>
                </HoverCardContent>
              </HoverCard>
            </div>
            <Textarea id="baseline" value={problemFraming.humanBaseline} onChange={(e) => setProblemFraming({...problemFraming, humanBaseline: e.target.value})} placeholder="e.g. Loan officers manually review applications taking 30 minutes each" disabled={projectSetupLocked} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="benefit">What is the intended benefit of automation?</Label>
              <HoverCard>
                <HoverCardTrigger><Info className="w-4 h-4 text-gray-500 hover:text-black cursor-help" /></HoverCardTrigger>
                <HoverCardContent>
                  <p className="font-bold mb-1">What this means:</p>
                  <p className="text-gray-600">Why are you building this? What metric are you trying to improve?</p>
                  <p className="font-bold mt-2 mb-1">Example:</p>
                  <p className="text-gray-600">"To reduce review time by 80% so humans only review edge cases."</p>
                </HoverCardContent>
              </HoverCard>
            </div>
            <Textarea id="benefit" value={problemFraming.benefit} onChange={(e) => setProblemFraming({...problemFraming, benefit: e.target.value})} placeholder="e.g. Reduce review time entirely for 80% of applications" disabled={projectSetupLocked} />
          </div>
        </CardContent>
      </Card>

      {/* SECTION 3: SCAN RESULTS */}
      {datasetStats && (
        <Card>
          <CardHeader>
            <CardTitle>Deterministic Scan Results</CardTitle>
            <CardDescription>Basic statistical summaries and data schema</CardDescription>
          </CardHeader>
          <CardContent>
             <ScrollArea className="h-80 w-full rounded-md border">
               <Table>
                 <TableHeader>
                   <TableRow>
                     <TableHead>
                       <div className="flex items-center gap-1">
                         Column
                         <HoverCard>
                           <HoverCardTrigger><Info className="w-3.5 h-3.5 text-gray-400 hover:text-black cursor-help" /></HoverCardTrigger>
                           <HoverCardContent>
                             <p className="font-bold mb-1">What this means:</p>
                             <p className="text-gray-600">The exact name of the column found in your CSV file.</p>
                           </HoverCardContent>
                         </HoverCard>
                       </div>
                     </TableHead>
                     <TableHead>
                       <div className="flex items-center gap-1">
                         Type
                         <HoverCard>
                           <HoverCardTrigger><Info className="w-3.5 h-3.5 text-gray-400 hover:text-black cursor-help" /></HoverCardTrigger>
                           <HoverCardContent>
                             <p className="font-bold mb-1">What this means:</p>
                             <p className="text-gray-600">Whether the data is text (string) or numbers. The engine infers this automatically.</p>
                           </HoverCardContent>
                         </HoverCard>
                       </div>
                     </TableHead>
                     <TableHead>
                       <div className="flex items-center gap-1">
                         Missing
                         <HoverCard>
                           <HoverCardTrigger><Info className="w-3.5 h-3.5 text-gray-400 hover:text-black cursor-help" /></HoverCardTrigger>
                           <HoverCardContent>
                             <p className="font-bold mb-1">What this means:</p>
                             <p className="text-gray-600">How many rows have blank or missing values for this column. High missingness can ruin fairness metrics.</p>
                           </HoverCardContent>
                         </HoverCard>
                       </div>
                     </TableHead>
                     <TableHead>
                       <div className="flex items-center gap-1">
                         Unique Vals
                         <HoverCard>
                           <HoverCardTrigger><Info className="w-3.5 h-3.5 text-gray-400 hover:text-black cursor-help" /></HoverCardTrigger>
                           <HoverCardContent>
                             <p className="font-bold mb-1">What this means:</p>
                             <p className="text-gray-600">How many distinct values exist in this column. (e.g., a "Gender" column might have 3 unique values).</p>
                           </HoverCardContent>
                         </HoverCard>
                       </div>
                     </TableHead>
                     <TableHead>
                       <div className="flex items-center gap-1">
                         Summary
                         <HoverCard>
                           <HoverCardTrigger><Info className="w-3.5 h-3.5 text-gray-400 hover:text-black cursor-help" /></HoverCardTrigger>
                           <HoverCardContent>
                             <p className="font-bold mb-1">What this means:</p>
                             <p className="text-gray-600">A quick snapshot of the data: Min/Max for numbers, or a list of options for text categories.</p>
                           </HoverCardContent>
                         </HoverCard>
                       </div>
                     </TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                    {datasetStats.columns.map((col: string) => {
                      const stat = datasetStats.stats[col];
                      return (
                        <TableRow key={col}>
                          <TableCell className="font-medium whitespace-nowrap">{col}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{stat.inferredType}</Badge>
                          </TableCell>
                          <TableCell>
                            {stat.missing} 
                            {stat.missingPercentage > 0 && <span className="text-red-500 text-xs ml-1">({stat.missingPercentage.toFixed(1)}%)</span>}
                          </TableCell>
                          <TableCell>{stat.uniqueCount}</TableCell>
                          <TableCell className="text-xs text-gray-500">
                             {stat.inferredType === 'number' && stat.mean !== undefined && (
                               <span>Mean: {stat.mean.toFixed(2)} | Min: {stat.min} | Max: {stat.max}</span>
                             )}
                             {stat.inferredType === 'string' && stat.uniqueCount < 5 && stat.uniqueValues && (
                               <span>Vals: {stat.uniqueValues.join(', ')}</span>
                             )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                 </TableBody>
               </Table>
             </ScrollArea>
          </CardContent>
        </Card>
      )}
      </div>

      <div className="sticky top-6 h-[calc(100vh-8rem)]">
        <LlmCompanion 
          title="Sociotechnical Setup Review"
          description="LLM Evaluation of Problem Framing & Data"
          message={useAudit().llmMessages.find(m => m.type === 'project-setup')}
          loading={loadingModules['project-setup']}
        />
      </div>
    </div>

      {/* UNIFIED SUBMIT ACTION */}
      <div className="fixed bottom-0 left-56 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-[#141414] flex justify-end z-10">
        <div className="relative group">
          <Button size="lg" className="w-full sm:w-auto" onClick={runUnifiedAudit} disabled={!dataset || !targetColumn || protectedColumns.length === 0 || auditLoading}>
            <BrainCircuit className="w-5 h-5 mr-2" />
            {auditLoading ? 'Running Comprehensive Audit...' : 'Run Unified Data Audit'}
          </Button>
          {(!dataset || !targetColumn || protectedColumns.length === 0) && (
            <div className="absolute -top-12 right-0 hidden group-hover:block z-50">
              <div className="w-64 p-3 bg-red-100 border border-red-500 rounded text-xs text-red-900 shadow-lg">
                <strong>Cannot Run Audit Yet:</strong>
                <ul className="list-disc pl-4 mt-1">
                  {!dataset && <li>Please upload a dataset.</li>}
                  {dataset && !targetColumn && <li>Please select a Target Variable.</li>}
                  {dataset && protectedColumns.length === 0 && <li>Please select a Protected Attribute.</li>}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
