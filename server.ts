import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { spawn } from "node:child_process";

import { analyzeDataset, analyzeAssociations, calculateFairnessMetrics, createSubgroupSlices } from "./src/server/stats.ts";
import { warmKnowledgeBase } from "./src/server/rag.ts";
import { 
  evaluateProxies, 
  generateFairnessSummary,
  summarizeGovernance,
  generateDeploymentDecision,
  evaluateProjectSetup,
  detectProtectedAttributes,
  answerAuditQuestion,
  answerModelAuditQuestion,
  generateRemediationGuide,
  explainRemediationPreview,
  generateModelExecutionSummary,
  generateModelValidationIntakeMemo
} from "./src/server/llm.ts";

function runRemediationEngine(action: "plan" | "preview" | "apply", payload: any) {
  return new Promise<any>((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), "python", "remediation_engine.py");
    const child = spawn("python3", [scriptPath, action], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Remediation engine exited with code ${code}.`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error: any) {
        reject(new Error(`Failed to parse remediation engine output. ${error.message}`));
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

function runModelAuditEngine(payload: any) {
  return new Promise<any>((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), "python", "model_audit_engine.py");
    const child = spawn("python3", [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Model audit engine exited with code ${code}.`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error: any) {
        reject(new Error(`Failed to parse model audit engine output. ${error.message}`));
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

function buildFairnessBundle(data: any[], targetColumn?: string, protectedColumns?: string[], groundTruthColumn?: string) {
  if (!targetColumn || !protectedColumns || protectedColumns.length === 0) {
    return { fairness: null, subgroups: null };
  }

  const fairness: any = {};
  protectedColumns.forEach((column) => {
    fairness[column] = calculateFairnessMetrics(
      data,
      targetColumn,
      column,
      groundTruthColumn === "none" ? undefined : groundTruthColumn
    );
  });

  const subgroups = createSubgroupSlices(
    data,
    protectedColumns,
    targetColumn,
    groundTruthColumn === "none" ? undefined : groundTruthColumn
  );

  return { fairness, subgroups };
}

function getAllowedOrigins() {
  const originSources = [
    process.env.APP_URL,
    process.env.CORS_ORIGIN,
  ].filter(Boolean) as string[];

  return originSources
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProduction = process.env.NODE_ENV === "production";
  const allowedOrigins = getAllowedOrigins();

  warmKnowledgeBase().catch((error) => {
    console.warn("[RAG] Knowledge base warm-up failed:", error);
  });

  app.use((req, res, next) => {
    const requestOrigin = req.headers.origin;

    if (allowedOrigins.length === 0) {
      res.setHeader("Access-Control-Allow-Origin", "*");
    } else if (requestOrigin && allowedOrigins.includes(requestOrigin.replace(/\/+$/, ""))) {
      res.setHeader("Access-Control-Allow-Origin", requestOrigin);
      res.setHeader("Vary", "Origin");
    }

    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }

    next();
  });

  app.use(express.json({ limit: "50mb" }));

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/audit/analyze", async (req, res) => {
    try {
      const { data, targetColumn, protectedColumns, groundTruthColumn } = req.body;
      
      const datasetStats = analyzeDataset(data);
      const associations = targetColumn ? analyzeAssociations(data, targetColumn) : null;
      let fairness: any = null;
      let subgroups = null;

      if (targetColumn && protectedColumns && protectedColumns.length > 0) {
        // Evaluate fairness metrics for each protected column
        fairness = {};
        protectedColumns.forEach((col: string) => {
          fairness[col] = calculateFairnessMetrics(data, targetColumn, col, groundTruthColumn === 'none' ? undefined : groundTruthColumn);
        });
        subgroups = createSubgroupSlices(data, protectedColumns, targetColumn, groundTruthColumn === 'none' ? undefined : groundTruthColumn);
      }

      res.json({ datasetStats, associations, fairness, subgroups });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/llm/project-setup", async (req, res) => {
    try {
      const { questionnaire, stats } = req.body;
      const memo = await evaluateProjectSetup(questionnaire, stats);
      res.json({ memo });
    } catch (e: any) { res.status(500).json({error: e.message}); }
  });

  app.post("/api/llm/detect-protected", async (req, res) => {
    try {
      const { columns, sampleData } = req.body;
      const protectedCols = await detectProtectedAttributes(columns, sampleData);
      res.json({ protectedCols });
    } catch (e: any) { res.status(500).json({error: e.message}); }
  });

  app.post("/api/llm/proxy", async (req, res) => {
    try {
      const { associations } = req.body;
      const evaluation = await evaluateProxies(associations);
      res.json({ evaluation });
    } catch (e: any) { res.status(500).json({error: e.message}); }
  });

  app.post("/api/llm/fairness", async (req, res) => {
    try {
      const { fairnessMetrics, subgroups } = req.body;
      const summary = await generateFairnessSummary(fairnessMetrics, subgroups);
      res.json({ summary });
    } catch (e: any) { res.status(500).json({error: e.message}); }
  });

  app.post("/api/llm/governance", async (req, res) => {
    try {
      const { questionnaire } = req.body;
      const summary = await summarizeGovernance(questionnaire);
      res.json({ summary });
    } catch (e: any) { res.status(500).json({error: e.message}); }
  });

  app.post("/api/llm/decision", async (req, res) => {
    try {
      const { context } = req.body;
      const decision = await generateDeploymentDecision(context);
      res.json(decision);
    } catch (e: any) { res.status(500).json({error: e.message}); }
  });

  app.post("/api/llm/model-validation-intake", async (req, res) => {
    try {
      const memo = await generateModelValidationIntakeMemo(req.body);
      res.json({ memo });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/model-validation/execute", async (req, res) => {
    try {
      const engineResult = await runModelAuditEngine(req.body);
      const auditData = engineResult.auditData || [];
      const predictionColumn = engineResult.predictionColumn;
      const groundTruthColumn = engineResult.groundTruthColumn;
      const protectedColumns = engineResult.protectedColumns || [];

      const datasetStats = analyzeDataset(auditData);
      const associations = predictionColumn ? analyzeAssociations(auditData, predictionColumn) : null;
      const { fairness, subgroups } = buildFairnessBundle(
        auditData,
        predictionColumn,
        protectedColumns,
        groundTruthColumn
      );

      const llmSummary = await generateModelExecutionSummary({
        executionSummary: {
          supported: engineResult.supported,
          modelType: engineResult.modelType,
          rowCount: engineResult.rowCount,
          featureColumnsUsed: engineResult.featureColumnsUsed,
          protectedColumns,
          predictionColumn,
          groundTruthColumn,
          groundTruthSourceColumn: engineResult.groundTruthSourceColumn,
          scoreColumn: engineResult.scoreColumn,
          positiveLabelChosen: engineResult.positiveLabelChosen,
          truthPositiveLabelChosen: engineResult.truthPositiveLabelChosen,
        },
        fairnessMetrics: fairness,
        subgroups,
        predictionAssociations: associations?.slice(0, 10) || [],
      });

      res.json({
        ...engineResult,
        datasetStats,
        associations,
        fairness,
        subgroups,
        llmSummary,
      });
    } catch (e: any) {
      console.error("[Model Validation Execute Error]", e);
      res.status(500).json({ error: e.message });
    }
  });

  // Agentic AI Route
  app.post("/api/agent/chat", async (req, res) => {
    try {
      const { message, context, history } = req.body;
      const response = await answerAuditQuestion(message, context, history);
      res.json({ response });
    } catch (e: any) {
      console.error("[Agent Error]", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/agent/model-chat", async (req, res) => {
    try {
      const { message, context, history } = req.body;
      const response = await answerModelAuditQuestion(message, context, history);
      res.json({ response });
    } catch (e: any) {
      console.error("[Model Agent Error]", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/remediation/plan", async (req, res) => {
    try {
      const plan = await runRemediationEngine("plan", req.body);
      const llmExplanation = await generateRemediationGuide({
        issueSummary: plan.issueSummary,
        targetHandling: plan.targetHandling,
        collectMoreDataNotice: plan.collectMoreDataNotice,
        recommendations: plan.recommendations,
        numericIssues: plan.numericIssues,
        groupSummary: plan.groupSummary,
        currentFairnessMetrics: req.body.fairnessMetrics,
      });
      res.json({ ...plan, llmExplanation });
    } catch (e: any) {
      console.error("[Remediation Plan Error]", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/remediation/preview", async (req, res) => {
    try {
      const result = await runRemediationEngine("preview", req.body);
      const transformedData = result.transformedData || [];
      const transformedStats = analyzeDataset(transformedData);
      const { fairness, subgroups } = buildFairnessBundle(
        transformedData,
        req.body.targetColumn,
        req.body.protectedColumns,
        req.body.groundTruthColumn
      );
      const llmExplanation = await explainRemediationPreview({
        techniqueId: req.body.techniqueId,
        scope: req.body.scope,
        summary: result.summary,
        driftSummary: result.driftSummary,
        originalFairnessMetrics: req.body.fairnessMetrics,
        previewFairnessMetrics: fairness,
      });

      res.json({
        summary: result.summary,
        driftSummary: result.driftSummary,
        transformedStats,
        fairnessMetrics: fairness,
        subgroups,
        llmExplanation,
      });
    } catch (e: any) {
      console.error("[Remediation Preview Error]", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/remediation/apply", async (req, res) => {
    try {
      const result = await runRemediationEngine("apply", req.body);
      const transformedData = result.transformedData || [];
      const transformedStats = analyzeDataset(transformedData);
      const { fairness, subgroups } = buildFairnessBundle(
        transformedData,
        req.body.targetColumn,
        req.body.protectedColumns,
        req.body.groundTruthColumn
      );

      res.json({
        transformedData,
        summary: result.summary,
        driftSummary: result.driftSummary,
        transformedStats,
        fairnessMetrics: fairness,
        subgroups,
      });
    } catch (e: any) {
      console.error("[Remediation Apply Error]", e);
      res.status(500).json({ error: e.message });
    }
  });


  // Vite middleware for development
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In Express v4, we can use app.get('*', ...)
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
