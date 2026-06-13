import React, { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import axios from 'axios';
import { ShieldCheck, Sparkles, ArrowRightLeft, TriangleAlert, Download, Eye, Wand2 } from 'lucide-react';
import { useAudit } from '../../context/AuditContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { LlmCompanion } from '../ui/llm-companion';
import { apiUrl } from '../../lib/api';
import { toast } from 'sonner';

function formatPercent(value?: number) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'N/A';
  }
  return `${(value * 100).toFixed(1)}%`;
}

function metricDelta(before?: number, after?: number) {
  if (before === undefined || before === null || after === undefined || after === null) {
    return 'N/A';
  }
  const delta = after - before;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${(delta * 100).toFixed(1)} pts`;
}

export function SafeDataRemediation() {
  const {
    dataset,
    fairnessMetrics,
    targetColumn,
    groundTruthColumn,
    protectedColumns,
    systemDecision,
    remediationPlan,
    setRemediationPlan,
    remediationPreview,
    setRemediationPreview,
    remediationResult,
    setRemediationResult,
    addLlmMessage,
    llmMessages,
  } = useAudit();

  const [selectedTechniqueId, setSelectedTechniqueId] = useState('');
  const [selectedScope, setSelectedScope] = useState('');
  const [selectedNumericColumns, setSelectedNumericColumns] = useState<string[]>([]);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [previewConsent, setPreviewConsent] = useState({
    safeCopyOnly: false,
    understandSideEffects: false,
  });
  const [applyConsent, setApplyConsent] = useState({
    reviewedPreview: false,
    approveWorkingCopy: false,
  });

  const guideMessage = llmMessages.find((message) => message.type === 'remediation-plan');
  const previewMessage = llmMessages.find((message) => message.type === 'remediation-preview');
  const companionMessage = remediationPreview ? previewMessage || guideMessage : guideMessage;
  const techniques = remediationPlan?.recommendations || [];

  const selectedTechnique = useMemo(
    () => techniques.find((technique: any) => technique.id === selectedTechniqueId),
    [techniques, selectedTechniqueId]
  );

  useEffect(() => {
    if (!remediationPlan) {
      return;
    }

    if (!selectedScope && remediationPlan.scopeOptions?.length) {
      setSelectedScope(remediationPlan.groupSummary?.defaultScope || remediationPlan.scopeOptions[0].id);
    }

    if (!selectedTechniqueId) {
      const firstRecommended = techniques.find((technique: any) => technique.eligible && technique.recommended);
      const firstEligible = techniques.find((technique: any) => technique.eligible);
      const nextTechniqueId = firstRecommended?.id || firstEligible?.id || '';
      setSelectedTechniqueId(nextTechniqueId);
    }
  }, [remediationPlan, selectedScope, selectedTechniqueId, techniques]);

  useEffect(() => {
    if (selectedTechnique?.id === 'winsorize_numeric') {
      const nextColumns = selectedTechnique.suggestedColumns || [];
      setSelectedNumericColumns(nextColumns);
    } else {
      setSelectedNumericColumns([]);
    }
    setRemediationPreview(null);
    setRemediationResult(null);
    setApplyConsent({ reviewedPreview: false, approveWorkingCopy: false });
  }, [selectedTechnique?.id, setRemediationPreview, setRemediationResult]);

  useEffect(() => {
    setRemediationPreview(null);
    setRemediationResult(null);
    setApplyConsent({ reviewedPreview: false, approveWorkingCopy: false });
  }, [selectedScope, setRemediationPreview, setRemediationResult]);

  if (!dataset || !targetColumn || protectedColumns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-72 border-2 border-dashed border-[#141414]/20 rounded-lg text-[#141414]/50">
        <ShieldCheck className="w-12 h-12 mb-4 opacity-40" />
        <p>Load a dataset and run the bias audit first to unlock safe data remediation.</p>
      </div>
    );
  }

  if (!systemDecision) {
    return (
      <div className="flex flex-col items-center justify-center h-72 border-2 border-dashed border-[#141414]/20 rounded-lg text-[#141414]/50">
        <ArrowRightLeft className="w-12 h-12 mb-4 opacity-40" />
        <p>Complete the Decision Expert step first. This module only opens after the audit recommendation is ready.</p>
      </div>
    );
  }

  const loadPlan = async () => {
    setLoadingPlan(true);
    try {
      const response = await axios.post(apiUrl('/api/remediation/plan'), {
        data: dataset,
        targetColumn,
        groundTruthColumn,
        protectedColumns,
        fairnessMetrics,
      });
      setRemediationPlan(response.data);
      setRemediationPreview(null);
      setRemediationResult(null);
      addLlmMessage({
        type: 'remediation-plan',
        title: 'Safe Data Remediation Guide',
        content: response.data.llmExplanation,
      });
      toast.success('Safe transformation options are ready.');
    } catch (error: any) {
      toast.error('Failed to build a safe transformation plan.', { description: error.response?.data?.error || error.message });
    } finally {
      setLoadingPlan(false);
    }
  };

  const previewTechnique = async () => {
    if (!selectedTechniqueId) {
      toast.error('Choose a technique first.');
      return;
    }
    setPreviewLoading(true);
    try {
      const response = await axios.post(apiUrl('/api/remediation/preview'), {
        data: dataset,
        targetColumn,
        groundTruthColumn,
        protectedColumns,
        fairnessMetrics,
        techniqueId: selectedTechniqueId,
        scope: selectedScope || undefined,
        selectedColumns: selectedNumericColumns,
      });
      setRemediationPreview(response.data);
      addLlmMessage({
        type: 'remediation-preview',
        title: 'Transformation Preview Explanation',
        content: response.data.llmExplanation,
      });
      setApplyConsent({ reviewedPreview: false, approveWorkingCopy: false });
      toast.success('Preview generated. Review the changes before applying.');
    } catch (error: any) {
      toast.error('Failed to generate preview.', { description: error.response?.data?.error || error.message });
    } finally {
      setPreviewLoading(false);
    }
  };

  const applyTechnique = async () => {
    if (!selectedTechniqueId) {
      return;
    }
    setApplyLoading(true);
    try {
      const response = await axios.post(apiUrl('/api/remediation/apply'), {
        data: dataset,
        targetColumn,
        groundTruthColumn,
        protectedColumns,
        fairnessMetrics,
        techniqueId: selectedTechniqueId,
        scope: selectedScope || undefined,
        selectedColumns: selectedNumericColumns,
      });
      setRemediationResult(response.data);
      toast.success('Transformed working copy created. Your original upload is still untouched.');
    } catch (error: any) {
      toast.error('Failed to apply the transformation.', { description: error.response?.data?.error || error.message });
    } finally {
      setApplyLoading(false);
    }
  };

  const exportTransformedCsv = () => {
    if (!remediationResult?.transformedData) {
      return;
    }
    const csv = Papa.unparse(remediationResult.transformedData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `BiasScope_${selectedTechniqueId || 'safe_transform'}_working_copy.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportTransformationSummary = () => {
    if (!remediationResult) {
      return;
    }
    const blob = new Blob([JSON.stringify(remediationResult, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `BiasScope_${selectedTechniqueId || 'safe_transform'}_summary.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const canPreview =
    Boolean(remediationPlan) &&
    Boolean(selectedTechniqueId) &&
    !selectedTechnique?.informationalOnly &&
    previewConsent.safeCopyOnly &&
    previewConsent.understandSideEffects &&
    (selectedTechnique?.id !== 'winsorize_numeric' || selectedNumericColumns.length > 0);

  const canApply =
    Boolean(remediationPreview) &&
    applyConsent.reviewedPreview &&
    applyConsent.approveWorkingCopy;

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h2 className="text-2xl font-bold tracking-tight uppercase">Safe Data Remediation</h2>
        <p className="text-[10px] uppercase opacity-50 tracking-widest mt-1">Preview low-risk data transformations after the decision step. Nothing touches the original upload unless you explicitly apply a working copy.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
        <div className="space-y-6">
          <Card className="border-[#141414] shadow-[4px_4px_0px_#141414]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#F27D26]" />
                Step 1: Build A Safe Plan
              </CardTitle>
              <CardDescription>
                BiasScope researches your current audit results and surfaces only previewable, transparent transformations.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-[#141414]/15 bg-[#F27D26]/6 p-4 text-sm leading-relaxed text-[#141414]/75">
                <p className="font-semibold text-[#141414]">Important:</p>
                <p>There is no honest way to promise a fully “bias-free” dataset. This step only offers cautious techniques that can reduce some measurable imbalances while preserving an audit trail.</p>
              </div>
              <Button onClick={loadPlan} disabled={loadingPlan} className="shadow-[2px_2px_0px_#141414]">
                <Wand2 className="w-4 h-4 mr-2" />
                {loadingPlan ? 'Building plan...' : remediationPlan ? 'Refresh Safe Plan' : 'Generate Safe Plan'}
              </Button>
            </CardContent>
          </Card>

          {remediationPlan && (
            <>
              <Card className="border-[#141414]/15 bg-white">
                <CardHeader>
                  <CardTitle>How Labels Are Used</CardTitle>
                  <CardDescription>BiasScope now prefers ground truth for imbalance handling whenever it exists.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-[#141414]/75">
                  <p>{remediationPlan.targetHandling?.message}</p>
                  {remediationPlan.targetHandling?.balanceColumn && (
                    <div className="rounded-xl border border-[#141414]/10 bg-[#141414]/[0.03] p-4">
                      <p className="font-semibold text-[#141414]">Current balancing basis</p>
                      <p className="mt-1">
                        BiasScope is balancing with respect to <span className="font-semibold">{remediationPlan.targetHandling.balanceColumn}</span>.
                      </p>
                    </div>
                  )}
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
                    <p className="font-semibold">Prediction column warning</p>
                    <p className="mt-1">{remediationPlan.targetHandling?.predictionWarning}</p>
                  </div>
                </CardContent>
              </Card>

              {remediationPlan.collectMoreDataNotice?.required && (
                <Card className="border-red-300 bg-red-50/70">
                  <CardHeader>
                    <CardTitle>More Real Data Is Needed</CardTitle>
                    <CardDescription>BiasScope found gaps that preprocessing alone cannot honestly repair.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-red-900">
                    {remediationPlan.collectMoreDataNotice.reasons.map((reason: string, index: number) => (
                      <p key={index}>• {reason}</p>
                    ))}
                    <p className="pt-2 text-red-800/90">
                      You can still inspect partial mitigation ideas below, but BiasScope is explicitly warning that collecting more representative real data is required for a trustworthy fix.
                    </p>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Step 2: Choose A Technique</CardTitle>
                  <CardDescription>{remediationPlan.issueSummary?.headline}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 text-sm text-[#141414]/70">
                    {remediationPlan.issueSummary?.details?.map((detail: string, index: number) => (
                      <p key={index}>• {detail}</p>
                    ))}
                  </div>

                  {remediationPlan.scopeOptions?.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Fairness scope to focus on</label>
                      <Select value={selectedScope} onValueChange={setSelectedScope}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a protected-column scope" />
                        </SelectTrigger>
                        <SelectContent>
                          {remediationPlan.scopeOptions.map((option: any) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="grid gap-4">
                    {techniques.map((technique: any) => {
                      const isSelected = technique.id === selectedTechniqueId;
                      return (
                        <button
                          key={technique.id}
                          type="button"
                          disabled={!technique.eligible}
                          onClick={() => setSelectedTechniqueId(technique.id)}
                          className={`rounded-2xl border p-4 text-left transition-all ${
                            isSelected
                              ? 'border-[#F27D26] bg-[#F27D26]/10 shadow-[3px_3px_0px_#141414]'
                              : 'border-[#141414]/15 bg-white hover:border-[#141414]'
                          } ${!technique.eligible ? 'opacity-45 cursor-not-allowed' : ''}`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-[#141414]">{technique.title}</span>
                            {technique.recommended && <Badge className="bg-[#F27D26] text-[#141414] hover:bg-[#F27D26]">Recommended</Badge>}
                            <Badge variant="outline">{technique.family}</Badge>
                            {technique.informationalOnly && <Badge variant="outline">No Safe Auto-Fix</Badge>}
                          </div>
                          <p className="mt-2 text-sm text-[#141414]/75">{technique.summary}</p>
                          <p className="mt-3 text-sm text-[#141414]/65"><span className="font-semibold text-[#141414]">Plain English:</span> {technique.plainEnglish}</p>
                          <p className="mt-2 text-sm text-[#141414]/65"><span className="font-semibold text-[#141414]">Example:</span> {technique.example}</p>
                          <p className="mt-2 text-sm text-amber-700"><span className="font-semibold">Watch out:</span> {technique.caution}</p>
                        </button>
                      );
                    })}
                  </div>

                  {selectedTechnique?.id === 'winsorize_numeric' && (
                    <div className="rounded-xl border border-[#141414]/15 bg-[#141414]/[0.03] p-4">
                      <p className="text-sm font-semibold text-[#141414]">Choose numeric columns to dampen</p>
                      <p className="mt-1 text-sm text-[#141414]/65">These are the columns BiasScope flagged as skewed or dominated by outliers.</p>
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {(selectedTechnique.suggestedColumns || []).map((column: string) => {
                          const checked = selectedNumericColumns.includes(column);
                          return (
                            <label key={column} className="flex items-center gap-3 rounded-lg border border-[#141414]/10 bg-white px-3 py-2 text-sm">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setSelectedNumericColumns((current) =>
                                    checked ? current.filter((item) => item !== column) : [...current, column]
                                  );
                                }}
                              />
                              <span>{column}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Step 3: Permission To Preview</CardTitle>
                  <CardDescription>BiasScope asks for permission before even creating a preview.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
                    <p className="font-semibold">What happens at preview time?</p>
                    <p className="mt-1">BiasScope creates a temporary copy behind the scenes, compares before/after fairness numbers, checks whether other columns drift, and then shows you the results. The original file you uploaded is not changed.</p>
                  </div>

                  <label className="flex items-start gap-3 rounded-xl border border-[#141414]/10 bg-white p-4 text-sm">
                    <input
                      type="checkbox"
                      checked={previewConsent.safeCopyOnly}
                      onChange={(event) => setPreviewConsent((current) => ({ ...current, safeCopyOnly: event.target.checked }))}
                    />
                    <span>I understand that this step only makes a preview copy. Example: if rows are duplicated for a preview, my original spreadsheet still stays exactly the same.</span>
                  </label>

                  <label className="flex items-start gap-3 rounded-xl border border-[#141414]/10 bg-white p-4 text-sm">
                    <input
                      type="checkbox"
                      checked={previewConsent.understandSideEffects}
                      onChange={(event) => setPreviewConsent((current) => ({ ...current, understandSideEffects: event.target.checked }))}
                    />
                    <span>I understand that helping one fairness signal can still shift other columns. Example: duplicating under-represented rows may also change average income, age, or region mix.</span>
                  </label>

                  <Button onClick={previewTechnique} disabled={!canPreview || previewLoading} className="shadow-[2px_2px_0px_#141414]">
                    <Eye className="w-4 h-4 mr-2" />
                    {previewLoading ? 'Generating preview...' : selectedTechnique?.informationalOnly ? 'Preview Unavailable' : 'Preview Changes'}
                  </Button>
                  {selectedTechnique?.informationalOnly && (
                    <p className="text-sm text-[#141414]/65">
                      This item is informational only. BiasScope is telling you to collect more real data before relying on an automatic remediation step.
                    </p>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {remediationPreview && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Step 4: Review The Preview</CardTitle>
                  <CardDescription>BiasScope compares the current audit against the proposed working copy.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="rounded-xl border border-[#141414]/10 bg-white p-4">
                      <p className="text-[10px] uppercase tracking-widest opacity-50">Original Rows</p>
                      <p className="mt-2 text-2xl font-bold">{remediationPreview.summary.originalRows}</p>
                    </div>
                    <div className="rounded-xl border border-[#141414]/10 bg-white p-4">
                      <p className="text-[10px] uppercase tracking-widest opacity-50">Transformed Rows</p>
                      <p className="mt-2 text-2xl font-bold">{remediationPreview.summary.transformedRows}</p>
                    </div>
                    <div className="rounded-xl border border-[#141414]/10 bg-white p-4">
                      <p className="text-[10px] uppercase tracking-widest opacity-50">Rows Added</p>
                      <p className="mt-2 text-2xl font-bold">{remediationPreview.summary.rowsAdded}</p>
                    </div>
                    <div className="rounded-xl border border-[#141414]/10 bg-white p-4">
                      <p className="text-[10px] uppercase tracking-widest opacity-50">Rows Removed</p>
                      <p className="mt-2 text-2xl font-bold">{remediationPreview.summary.rowsRemoved}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-[#141414]">Fairness before vs preview</p>
                    {protectedColumns.map((column) => {
                      const before = fairnessMetrics?.[column];
                      const after = remediationPreview.fairnessMetrics?.[column];
                      return (
                        <div key={column} className="rounded-xl border border-[#141414]/10 bg-white p-4">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <p className="font-semibold">{column}</p>
                              <p className="text-sm text-[#141414]/60">Demographic parity difference should usually move downward; ratio often looks healthier when it moves upward.</p>
                            </div>
                            <Badge variant="outline">{column}</Badge>
                          </div>
                          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div className="rounded-lg bg-[#141414]/[0.03] p-3">
                              <p className="text-[10px] uppercase tracking-widest opacity-50">Parity Difference</p>
                              <p className="mt-1 font-semibold">{formatPercent(before?.demographicParityDifference)} → {formatPercent(after?.demographicParityDifference)}</p>
                              <p className="text-[#141414]/60">{metricDelta(before?.demographicParityDifference, after?.demographicParityDifference)}</p>
                            </div>
                            <div className="rounded-lg bg-[#141414]/[0.03] p-3">
                              <p className="text-[10px] uppercase tracking-widest opacity-50">Parity Ratio</p>
                              <p className="mt-1 font-semibold">{formatPercent(before?.demographicParityRatio)} → {formatPercent(after?.demographicParityRatio)}</p>
                              <p className="text-[#141414]/60">{metricDelta(before?.demographicParityRatio, after?.demographicParityRatio)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-[#141414]/10 bg-white p-4">
                      <p className="font-semibold text-[#141414]">Numeric column drift</p>
                      <div className="mt-3 space-y-2 text-sm text-[#141414]/70">
                        {(remediationPreview.driftSummary?.numeric || []).length === 0 && (
                          <p>No major numeric drift detected.</p>
                        )}
                        {(remediationPreview.driftSummary?.numeric || []).map((item: any) => (
                          <p key={item.column}>
                            <span className="font-semibold text-[#141414]">{item.column}</span>: mean {item.before} → {item.after}
                          </p>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#141414]/10 bg-white p-4">
                      <p className="font-semibold text-[#141414]">Category mix drift</p>
                      <div className="mt-3 space-y-2 text-sm text-[#141414]/70">
                        {(remediationPreview.driftSummary?.categorical || []).length === 0 && (
                          <p>No major category-mix drift detected.</p>
                        )}
                        {(remediationPreview.driftSummary?.categorical || []).map((item: any) => (
                          <p key={item.column}>
                            <span className="font-semibold text-[#141414]">{item.column}</span>: top value share {formatPercent(item.beforeTopShare)} → {formatPercent(item.afterTopShare)}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>

                  {remediationPreview.summary.warnings?.length > 0 && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                      <div className="flex items-center gap-2 font-semibold">
                        <TriangleAlert className="w-4 h-4" />
                        Warnings
                      </div>
                      <div className="mt-2 space-y-2">
                        {remediationPreview.summary.warnings.map((warning: string, index: number) => (
                          <p key={index}>• {warning}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Step 5: Permission To Apply</CardTitle>
                  <CardDescription>A second permission checkpoint is required before BiasScope creates a transformed working copy.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <label className="flex items-start gap-3 rounded-xl border border-[#141414]/10 bg-white p-4 text-sm">
                    <input
                      type="checkbox"
                      checked={applyConsent.reviewedPreview}
                      onChange={(event) => setApplyConsent((current) => ({ ...current, reviewedPreview: event.target.checked }))}
                    />
                    <span>I reviewed the preview. Example: I saw the before/after fairness numbers and the column-drift checks, and I am still comfortable creating a transformed working copy.</span>
                  </label>

                  <label className="flex items-start gap-3 rounded-xl border border-[#141414]/10 bg-white p-4 text-sm">
                    <input
                      type="checkbox"
                      checked={applyConsent.approveWorkingCopy}
                      onChange={(event) => setApplyConsent((current) => ({ ...current, approveWorkingCopy: event.target.checked }))}
                    />
                    <span>I approve BiasScope to generate a new working copy now. Example: this creates a second dataset for export and review, while my original upload still remains untouched in the audit record.</span>
                  </label>

                  <Button onClick={applyTechnique} disabled={!canApply || applyLoading} className="shadow-[2px_2px_0px_#141414]">
                    <ShieldCheck className="w-4 h-4 mr-2" />
                    {applyLoading ? 'Applying...' : 'Apply To New Working Copy'}
                  </Button>
                </CardContent>
              </Card>
            </>
          )}

          {remediationResult && (
            <Card className="border-green-500/40 bg-green-50/50">
              <CardHeader>
                <CardTitle>Working Copy Ready</CardTitle>
                <CardDescription>The transformed dataset has been created as a separate working copy for export and further review.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="rounded-lg bg-white p-4">
                    <p className="text-[10px] uppercase tracking-widest opacity-50">Technique</p>
                    <p className="mt-2 font-semibold">{selectedTechnique?.title || selectedTechniqueId}</p>
                  </div>
                  <div className="rounded-lg bg-white p-4">
                    <p className="text-[10px] uppercase tracking-widest opacity-50">Rows In Working Copy</p>
                    <p className="mt-2 font-semibold">{remediationResult.summary.transformedRows}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button onClick={exportTransformedCsv}>
                    <Download className="w-4 h-4 mr-2" />
                    Export Working Copy CSV
                  </Button>
                  <Button variant="outline" onClick={exportTransformationSummary}>
                    <Download className="w-4 h-4 mr-2" />
                    Export Transformation Summary
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="sticky top-6 h-[calc(100vh-8rem)]">
          <LlmCompanion
            title="Safe Transformation Guide"
            description="Gemini explanation of the recommended path"
            message={companionMessage}
            loading={loadingPlan || previewLoading}
            action={{
              label: remediationPlan ? 'Refresh Guidance' : 'Generate Guidance',
              onClick: loadPlan,
              disabled: loadingPlan,
            }}
          />
        </div>
      </div>
    </div>
  );
}
