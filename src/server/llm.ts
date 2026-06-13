import { VertexAI } from '@google-cloud/vertexai';
import { formatKnowledgeGrounding, retrieveKnowledgeChunks } from './rag';

let generativeModel: any = null;

const TEXT_RESPONSE_FALLBACK = "LLM reasoning unavailable - GCP_PROJECT_ID required.";
const AUDIT_RESPONSE_STYLE = `IMPORTANT FORMATTING RULES:
Write your response in clear, concise, and user-friendly language. Avoid dense academic jargon. Use short paragraphs, bullet points, and bold text for readability.
Do not begin with filler such as "Of course", "Here is", "Certainly", or any similar meta-introduction. Start immediately with the substantive analysis.
Keep the response compact. Prefer no more than 3 short paragraphs or 4-6 bullets unless extra detail is genuinely necessary.`;

type PromptRunOptions = {
  knowledgeQuery?: string;
  responseShape?: 'text' | 'json';
  useKnowledgeBase?: boolean;
};

function getAI() {
  if (!generativeModel) {
    const project = process.env.GCP_PROJECT_ID;
    const location = process.env.GCP_LOCATION || 'us-central1';
    const client_email = process.env.GCP_CLIENT_EMAIL;
    const private_key = process.env.GCP_PRIVATE_KEY?.replace(/\\n/g, '\n');
    
    if (project && client_email && private_key) {
      try {
        const vertexAI = new VertexAI({ 
          project, 
          location,
          googleAuthOptions: {
            credentials: {
              client_email,
              private_key
            }
          }
        });
        generativeModel = vertexAI.getGenerativeModel({
          model: 'gemini-2.5-pro',
        });
      } catch (e) {
        console.error("Failed to initialize Vertex AI client:", e);
      }
    } else {
        console.warn("GCP_PROJECT_ID, GCP_CLIENT_EMAIL, or GCP_PRIVATE_KEY is missing. Vertex AI client cannot be initialized.");
    }
  }
  return generativeModel;
}

function sanitizeTextResponse(text: string) {
  let cleaned = text
    .replace(/^```(?:markdown)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  const leadingMetaPatterns = [
    /^(?:of course|sure|certainly|absolutely)[^.!?\n]*[.!?]\s*/i,
    /^(?:here(?:'|’)?s|here is|below is)\b[^.!?\n]*[.!?]\s*/i,
  ];

  let previous = '';
  while (cleaned && cleaned !== previous) {
    previous = cleaned;
    leadingMetaPatterns.forEach((pattern) => {
      cleaned = cleaned.replace(pattern, '').trimStart();
    });
  }

  return cleaned;
}

async function runTextPrompt(prompt: string) {
  const model = getAI();
  if (!model) return TEXT_RESPONSE_FALLBACK;

  const request = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
  const result = await model.generateContent(request);
  const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return sanitizeTextResponse(text);
}

async function buildGroundedPrompt(prompt: string, options: PromptRunOptions = {}) {
  if (options.useKnowledgeBase === false) {
    return prompt;
  }

  const knowledgeChunks = await retrieveKnowledgeChunks(options.knowledgeQuery || prompt);
  if (knowledgeChunks.length === 0) {
    return prompt;
  }

  const groundingInstructions = options.responseShape === 'json'
    ? `Optional knowledge grounding:
Use the retrieved paper excerpts below as supporting evidence when they are relevant.
Keep the answer primarily responsive to the user-provided audit context.
If you rely on a retrieved excerpt in a rationale string, cite it inline as (Paper Title, p. X).
Never cite file names. Use only the paper titles and page numbers shown below.
Do not invent citations and do not cite pages that are not shown below.`
    : `Optional knowledge grounding:
Use the retrieved paper excerpts below as supporting evidence when they are relevant.
Keep your current response quality and do not turn this into a document-only bot.
Whenever you directly quote or paraphrase a retrieved excerpt, cite it inline as (Paper Title, p. X).
Never cite file names. Use only the paper titles and page numbers shown below.
Do not invent citations and do not cite pages that are not shown below.
If a statement comes only from the audit context and not from the papers, do not force a citation.`;

  return `${groundingInstructions}

Retrieved paper excerpts:
${formatKnowledgeGrounding(knowledgeChunks)}

${prompt}`;
}

async function runPrompt(prompt: string, options: PromptRunOptions = {}) {
  const groundedPrompt = await buildGroundedPrompt(prompt, options);
  return runTextPrompt(groundedPrompt);
}

export async function evaluateProxies(associations: any) {
  const prompt = `Review these feature associations with the target variable:
${JSON.stringify(associations, null, 2)}

We calculated a Mutual Information (MI) / Uncertainty Coefficient score for each feature against the model's prediction. A higher score (closer to 1.0) means the feature is highly predictive of the outcome and could be acting as a proxy for protected attributes.

Provide a "proxy legitimacy review" explaining why top associated features may be legitimate business drivers vs illegitimate proxies (e.g. 'zip_code').

${AUDIT_RESPONSE_STYLE}
Explain the issues simply and directly.`;

  return runPrompt(prompt, { useKnowledgeBase: true });
}

export async function generateFairnessSummary(fairnessMetrics: any, subgroups: any) {
  const prompt = `Review these fairness metrics and subgroup statistics:
Fairness Metrics: ${JSON.stringify(fairnessMetrics, null, 2)}
Subgroups: ${JSON.stringify(subgroups, null, 2)}

Summarize subgroup harms in plain language. Prioritize which subgroup harms deserve escalation.

CRITICAL INSTRUCTIONS:
1. Explain the "Demographic Parity" (Disparate Impact) numbers simply. Who is favored? Who is penalized?
2. If the data includes "equalOpportunityDifference", "averageOddsDifference", or "errorRateDifference", you MUST explain these! 
   - Equal Opportunity Diff means the difference in True Positive Rates (e.g., "Out of the people who actually deserved the job, Black women were 20% less likely to get it than White men").
   - Error Rate Diff means the model is generally more inaccurate for certain groups.
3. Highlight the worst intersectional harms (e.g., "Black Women" experiencing compounded disadvantage).
4. Conclude with concrete operational recommendations.

${AUDIT_RESPONSE_STYLE}
Explain the issues simply and directly.`;

  return runPrompt(prompt, { useKnowledgeBase: true });
}

export async function summarizeGovernance(questionnaire: any) {
  const prompt = `Review this governance questionnaire:
${JSON.stringify(questionnaire, null, 2)}

Generate a "human oversight failure analysis". Identify whether oversight is meaningful or symbolic.

${AUDIT_RESPONSE_STYLE}
Explain the issues simply and directly.`;

  return runPrompt(prompt, { useKnowledgeBase: true });
}

export async function generateDeploymentDecision(context: any) {
  const model = getAI();
  if (!model) return {
    status: "Unknown",
    rationale: "LLM reasoning unavailable - GCP_PROJECT_ID required.",
    recommendedActions: [],
    unresolvedQuestions: []
  };
  
  const prompt = `You are a sociotechnical bias auditor making a final deployment decision based on the following context:
${JSON.stringify(context, null, 2)}

Output JSON ONLY with the following structure:
{
  "status": "Green" | "Amber" | "Red",
  "rationale": "Clear rationale for the decision based on subgroup harms, governance readiness, etc.",
  "recommendedActions": ["action 1", "action 2"],
  "unresolvedQuestions": ["question 1", "question 2"]
}
DO NOT wrap in \`\`\`json. Return raw JSON.`;

  const groundedPrompt = await buildGroundedPrompt(prompt, {
    responseShape: 'json',
    useKnowledgeBase: true,
  });
  const request = { contents: [{ role: 'user', parts: [{ text: groundedPrompt }] }] };
  const result = await model.generateContent(request);
  const text = result.response.candidates[0].content.parts[0].text;
  
  try {
    const cleanedText = text.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    return JSON.parse(cleanedText || '{}');
  } catch (e) {
    return {
      status: "Error",
      rationale: "Failed to parse LLM response: " + text,
      recommendedActions: [],
      unresolvedQuestions: []
    };
  }
}

export async function evaluateProjectSetup(questionnaire: any, stats: any) {
  const prompt = `You are a sociotechnical bias auditor evaluating a proposed AI system and its initial dataset.
Task: Write a comprehensive Project Setup Analysis.

Problem Framing Questionnaire Answers:
${JSON.stringify(questionnaire, null, 2)}

Dataset Statistics:
${JSON.stringify(stats, null, 2)}

Please evaluate the following:
1. Legitimacy: Is the target variable morally defensible given the domain? Could this decision be too socially contested to automate responsibly?
2. Data Risks: What do these dataset statistics mean socially? What hidden concerns like selective visibility, historical exclusion, or institutional over-surveillance might be present in this data schema?
3. Synthesis: How does the proposed framing interact with the reality of the dataset?

${AUDIT_RESPONSE_STYLE}
The user reading this might not be an AI ethics expert, so explain the risks simply, directly, and without overwhelming them with text. DO NOT include formal memo headers like "MEMORANDUM", "TO:", "FROM:", "DATE:", or "SUBJECT:". Start immediately with the analysis.`;

  return runPrompt(prompt, { useKnowledgeBase: true });
}

export async function detectProtectedAttributes(columns: string[], sampleData: any[]) {
  const model = getAI();
  if (!model) return [];
  
  const prompt = `You are a data schema analyzer.
I am providing you with a list of column names and a few sample rows from a dataset.
Your task is to identify which column (if any) represents a "Protected Attribute" or demographic characteristic (e.g., race, gender, sex, age, ethnicity, religion, disability, marital status).

Columns: ${JSON.stringify(columns)}
Sample Data: ${JSON.stringify(sampleData, null, 2)}

Return ONLY a JSON array containing the exact string name(s) of the column(s) that are likely protected attributes. 
If none are found, return an empty array [].
DO NOT wrap in \`\`\`json or add any other text. Output raw JSON only.`;

  try {
    const request = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
    const result = await model.generateContent(request);
    const text = result.response.candidates[0].content.parts[0].text.trim();
    const cleanText = text.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("Failed to detect protected attributes", e);
    return [];
  }
}

function truncateText(value: string, maxChars = 1800) {
  if (!value) return value;
  return value.length > maxChars ? `${value.slice(0, maxChars)}...` : value;
}

function buildDatasetPreview(dataset: any[]) {
  if (!Array.isArray(dataset) || dataset.length === 0) {
    return { totalRows: 0, sampleRows: [] };
  }

  const columns = Object.keys(dataset[0] || {});
  const includeFullDataset = dataset.length <= 20 && columns.length <= 12;

  return {
    totalRows: dataset.length,
    columns,
    mode: includeFullDataset ? 'full-dataset' : 'sampled-preview',
    sampleRows: includeFullDataset ? dataset : dataset.slice(0, 15),
    tailRows: includeFullDataset ? [] : dataset.slice(-5),
  };
}

function buildStatsPreview(datasetStats: any) {
  if (!datasetStats?.stats) return datasetStats;

  const columns = datasetStats.columns || Object.keys(datasetStats.stats);
  const limitedColumns = columns.slice(0, 30);
  const stats: any = {};

  limitedColumns.forEach((column: string) => {
    stats[column] = datasetStats.stats[column];
  });

  return {
    totalRows: datasetStats.totalRows,
    columns: limitedColumns,
    stats,
    omittedColumnCount: Math.max(0, columns.length - limitedColumns.length),
  };
}

function buildAssociationPreview(associations: any[]) {
  if (!Array.isArray(associations)) return [];
  return associations.slice(0, 12);
}

function buildFairnessPreview(fairnessMetrics: any) {
  if (!fairnessMetrics || typeof fairnessMetrics !== 'object') return fairnessMetrics;

  const summary: any = {};

  Object.entries(fairnessMetrics).forEach(([column, metrics]: [string, any]) => {
    const groupMetrics = metrics?.groupMetrics || {};
    const sortedGroups = Object.entries(groupMetrics)
      .sort((a: any, b: any) => (a[1]?.positiveRate ?? 0) - (b[1]?.positiveRate ?? 0));

    summary[column] = {
      demographicParityDifference: metrics.demographicParityDifference,
      demographicParityRatio: metrics.demographicParityRatio,
      equalOpportunityDifference: metrics.equalOpportunityDifference,
      averageOddsDifference: metrics.averageOddsDifference,
      errorRateDifference: metrics.errorRateDifference,
      worstGroups: sortedGroups.slice(0, 5).map(([group, values]: [string, any]) => ({ group, ...values })),
      bestGroups: sortedGroups.slice(-3).reverse().map(([group, values]: [string, any]) => ({ group, ...values })),
    };
  });

  return summary;
}

function buildSubgroupPreview(subgroups: any) {
  if (!subgroups || typeof subgroups !== 'object') return subgroups;

  return Object.entries(subgroups)
    .map(([group, values]: [string, any]) => ({ group, ...values }))
    .sort((a: any, b: any) => (a.positiveRate ?? 0) - (b.positiveRate ?? 0))
    .slice(0, 12);
}

function buildMemoPreview(llmMessages: any[]) {
  if (!Array.isArray(llmMessages)) return [];
  return llmMessages.map((message) => ({
    type: message.type,
    title: message.title,
    content: truncateText(message.content, 2200),
  }));
}

function buildAuditChatContext(context: any) {
  return {
    problemFraming: context.problemFraming,
    targetColumn: context.targetColumn,
    groundTruthColumn: context.groundTruthColumn,
    protectedColumns: context.protectedColumns,
    datasetPreview: buildDatasetPreview(context.dataset),
    datasetStats: buildStatsPreview(context.datasetStats),
    topAssociations: buildAssociationPreview(context.associations),
    fairnessMetrics: buildFairnessPreview(context.fairnessMetrics),
    worstSubgroups: buildSubgroupPreview(context.subgroups),
    governance: context.governance,
    previousMemos: buildMemoPreview(context.llmMessages),
    finalDecision: context.systemDecision,
  };
}

export async function answerAuditQuestion(message: string, context: any, history: any[] = []) {
  const prompt = `You are BiasScope's AI audit copilot.
You answer questions about the user's uploaded dataset and the audit results that BiasScope already computed.

Rules:
1. Use only the provided audit context. Do not invent columns, groups, metrics, or findings.
2. If the answer depends on information that is not present, say that clearly.
3. Ground your answer in concrete fields, subgroup names, or metrics whenever possible.
4. The dataset may be represented as a preview if it is too large to include in full. If that limits certainty, say so.
5. Keep the tone practical, direct, and easy to understand.

Audit context:
${JSON.stringify(buildAuditChatContext(context), null, 2)}

Recent conversation:
${JSON.stringify(history.slice(-8), null, 2)}

User question:
${message}

Answer in markdown. Prefer short paragraphs and bullets when they improve clarity. Start directly with the answer and keep it compact. Do not use filler such as "Of course" or "Here is".`;

  return runPrompt(prompt, {
    useKnowledgeBase: true,
    knowledgeQuery: `${message}\n${JSON.stringify({
      targetColumn: context?.targetColumn,
      groundTruthColumn: context?.groundTruthColumn,
      protectedColumns: context?.protectedColumns,
      decisionStatus: context?.systemDecision?.status,
    }, null, 2)}`,
  });
}

function buildModelAuditChatContext(context: any) {
  const executionResult = context?.executionResult || null;
  return {
    documentLabel: context?.documentLabel,
    modelFileName: context?.modelFileName,
    modelType: context?.modelType,
    modelPurpose: context?.modelPurpose,
    dataAccessMode: context?.dataAccessMode,
    datasetSummary: context?.datasetSummary,
    readinessChecklist: context?.readinessChecklist,
    readinessMemo: truncateText(context?.readinessMemo || '', 2200),
    trainingColumns: Array.isArray(context?.trainingColumns)
      ? context.trainingColumns.map((column: any) => ({
          name: column.name,
          role: column.role,
          description: column.description,
        }))
      : [],
    selectedGroundTruthColumn: context?.selectedGroundTruthColumn,
    selectedProtectedColumns: context?.selectedProtectedColumns,
    executionResult: executionResult
      ? {
          predictionColumn: executionResult.predictionColumn,
          groundTruthColumn: executionResult.groundTruthColumn,
          groundTruthSourceColumn: executionResult.groundTruthSourceColumn,
          scoreColumn: executionResult.scoreColumn,
          featureColumnsUsed: executionResult.featureColumnsUsed,
          protectedColumns: executionResult.protectedColumns,
          rowCount: executionResult.rowCount,
          positiveLabelChosen: executionResult.positiveLabelChosen,
          truthPositiveLabelChosen: executionResult.truthPositiveLabelChosen,
          warnings: executionResult.warnings,
          previewRows: executionResult.previewRows,
          fairness: buildFairnessPreview(executionResult.fairness),
          worstSubgroups: buildSubgroupPreview(executionResult.subgroups),
          topAssociations: buildAssociationPreview(executionResult.associations),
          llmSummary: truncateText(executionResult.llmSummary || '', 2200),
        }
      : null,
  };
}

export async function answerModelAuditQuestion(message: string, context: any, history: any[] = []) {
  const prompt = `You are BiasScope's AI copilot for model-validation runs.
You answer questions about a saved or current model-bias audit.

Rules:
1. Use only the provided model-audit context. Do not invent findings or metrics.
2. If a result was not actually executed, say that clearly.
3. Explain fairness gaps, model-format limitations, and ground-truth issues in plain English.
4. If the answer depends on missing information, say what is missing.
5. Keep the answer compact and practical.

Model-audit context:
${JSON.stringify(buildModelAuditChatContext(context), null, 2)}

Recent conversation:
${JSON.stringify(history.slice(-8), null, 2)}

User question:
${message}

Answer in markdown. Prefer short paragraphs and bullets when helpful. Start directly with the answer and avoid filler.`;

  return runPrompt(prompt, {
    useKnowledgeBase: true,
    knowledgeQuery: `${message}\n${JSON.stringify({
      modelType: context?.modelType,
      modelPurpose: context?.modelPurpose,
      selectedGroundTruthColumn: context?.selectedGroundTruthColumn,
      selectedProtectedColumns: context?.selectedProtectedColumns,
    }, null, 2)}`,
  });
}

export async function generateRemediationGuide(context: any) {
  const prompt = `You are BiasScope's safe data remediation guide.
You are helping a non-technical user decide whether to preview fairness-oriented dataset transformations after an audit.

Deterministic plan:
${JSON.stringify(context, null, 2)}

Write a concise guide with these goals:
1. Explain that no method can guarantee a "bias-free" dataset.
2. Tell the user which technique is the safest first step and why.
3. Explain that the chosen target column is used only as a reference signal during remediation and should not automatically become the retraining label if it is just an older model prediction.
4. Explain the difference between reweighting, duplicate oversampling, SMOTE-style synthesis, winsorizing outliers, and undersampling in plain English.
5. Warn clearly when some protected-group/target combinations are totally missing and cannot be safely invented from zero real examples.
6. Explain that BiasScope will only create a preview first and the original uploaded data remains unchanged unless the user explicitly applies a working copy.

${AUDIT_RESPONSE_STYLE}
Use short bullets where helpful and keep the tone practical, calm, and easy to understand.`;

  return runPrompt(prompt, { useKnowledgeBase: true });
}

export async function explainRemediationPreview(context: any) {
  const prompt = `You are BiasScope's safe data remediation explainer.
You are summarizing what changed in a preview of a dataset transformation.

Preview context:
${JSON.stringify(context, null, 2)}

Write a compact explanation for a non-technical user:
1. What the selected technique did in simple language.
2. What improved or worsened in the before/after fairness numbers.
3. What side effects to watch in other columns.
4. Whether this looks like a cautious next step, a risky step, or a step to avoid.
5. Remind the user that the preview is not yet applied to the original dataset.

${AUDIT_RESPONSE_STYLE}
Use direct language and concrete examples if they fit the numbers.`;

  return runPrompt(prompt, { useKnowledgeBase: true });
}

export async function generateModelValidationIntakeMemo(context: any) {
  const prompt = `You are BiasScope's model validation planner.
You are reviewing a model-validation intake for a non-technical user before the real execution stage begins.

Intake context:
${JSON.stringify(context, null, 2)}

Write a concise readiness memo with these goals:
1. Say whether the intake is ready for a later validation run, partially ready, or still blocked.
2. Explain the biggest model-format risk in plain English.
3. Explain whether the column manifest is trustworthy enough, especially whether the dependent output is clearly identified.
4. Explain the privacy tradeoff between metadata-only mode and full-dataset mode.
5. If the model type changes the whole validation method, like GGUF versus tabular prediction models, say that directly.
6. End with the next two or three concrete actions the user should take.

${AUDIT_RESPONSE_STYLE}
Keep the tone practical, careful, and easy to understand.`;

  return runPrompt(prompt, { useKnowledgeBase: true });
}

export async function generateModelExecutionSummary(context: any) {
  const prompt = `You are BiasScope's executable model-audit explainer.
You are summarizing the results of a real backend model run for a non-technical user.

Execution context:
${JSON.stringify(context, null, 2)}

Write a concise summary with these goals:
1. State whether the executable audit completed successfully.
2. Explain what the backend actually did in plain English, including that it generated predictions from the uploaded model and compared them across protected groups.
3. Explain the biggest fairness concern in the numbers, especially any group with much lower positive rates or error-rate gaps.
4. If ground truth was available, mention whether the model seems less accurate for certain groups.
5. End with two or three practical next steps.

${AUDIT_RESPONSE_STYLE}
Keep the tone careful, direct, and easy to understand.`;

  return runPrompt(prompt, { useKnowledgeBase: true });
}
