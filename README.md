# BiasScope (unbiasedAI)

BiasScope is a sociotechnical AI auditing web app for tabular datasets and ML models. It combines deterministic fairness calculations with LLM-generated audit memos so teams can move from raw columns and outcome disparities to a structured deployment recommendation.

The current prototype is strongest for pre-deployment audits of datasets and executable models. Users can upload a dataset or model, define the decision context, run the sociotechnical waterfall, inspect proxy and fairness risks, review governance readiness, chat with an audit copilot, and export a machine-readable audit trail.

## What The App Does

- Uploads and parses `CSV`, `XLSX`, and `XLS` files in the browser
- Collects decision-framing context through a structured questionnaire
- Auto-detects likely protected attributes from dataset columns and sample rows
- Runs a deterministic schema and fairness scan on the uploaded dataset/model
- Generates LLM memos for project setup, proxy legitimacy, fairness harms, governance, and final deployment decision
- Supports a grounded audit copilot chat once the core sociotechnical waterfall is complete
- Exports the audit record as JSON
- **New**: Saves audit archives and chat histories securely using Firebase Firestore.
- **New**: Supports Demographic Parity (DP) and Equal Opportunity (EO) fairness metrics.

## Current Product Scope

### Implemented

- Tabular dataset audit flow
- Deterministic data profiling
- Proxy screening with association scoring
- Group fairness metrics (Demographic Parity, Equal Opportunity, etc.)
- Intersectional subgroup analysis
- Governance questionnaire and memo
- Final decision synthesis
- Dataset-aware audit chat backed by Google ADK Agentic AI integration
- Model-audit intake flow for `PKL`, `JOBLIB`, `PT`, `ONNX`, `H5`, and `GGUF`
- Executable backend model auditing for scikit-learn `PKL` and `JOBLIB` files
- Firebase Authentication and Firestore persistence for audit histories

### In Development

- Executable model support for `PT`, `ONNX`, `H5`, and `GGUF`
- Direct cloud model auditing
- Richer export formats beyond JSON

## Audit Workflow

1. Start in the landing page and choose `Audit Tabular Dataset` or `Model Audit`.
2. Fill in the `Decision Questionnaire`.
3. Upload a dataset/model and configure:
   - prediction/target column
   - optional ground-truth column
   - one or more protected attributes
4. Run the deterministic scan and sociotechnical waterfall.
5. Review the generated modules:
   - `Project Setup`
   - `Proxy Screening`
   - `Fairness Engine`
   - `Intersectional`
6. Open `Talk To An AI Bot` after the sociotechnical waterfall is complete.
7. Complete `Governance Hub` if you want governance-specific reasoning added to the context.
8. Use `Decision Expert` to synthesize the final deployment recommendation.
9. Save to archives or export the audit as JSON.

## Fairness And Analysis Features

### Deterministic Analysis

- Column type inference
- Missing-value counts and percentages
- Unique-value summaries
- Numeric summaries for quantitative fields

### Proxy Screening

- Mutual Information / Uncertainty Coefficient style association scoring between features and the target
- Human review controls for accepting, contesting, or flagging high-risk features

### Fairness Metrics

- **Demographic Parity Difference** (DP)
- **Demographic Parity Ratio**
- **Equal Opportunity Difference** (EO) when ground truth is available
- Average Odds Difference when ground truth is available
- Error Rate Difference when ground truth is available

### Intersectional Analysis

- Subgroup slicing across multiple protected attributes
- Positive-rate comparisons across combined groups
- LLM summary of the most exposed subgroups

## Architecture

BiasScope runs as a single TypeScript app with both frontend and backend code in the same repository.

- `React 19` renders the UI
- `Vite` provides the frontend build tooling
- `Express` serves API routes and the production build
- `TypeScript` is used across client and server
- `Tailwind CSS`, `shadcn/ui`, and `Base UI` power the interface
- `Vertex AI` powers the LLM reasoning layer
- `Firebase` (Auth, Firestore, Hosting) is used for database persistence and deployment

At runtime, the flow is:

1. The frontend collects problem framing and dataset inputs.
2. The Express backend runs deterministic analysis in `src/server/stats.ts`.
3. The backend sends structured context to the LLM layer in `src/server/llm.ts`.
4. The frontend renders both numeric outputs and plain-language memos.
5. Audit runs are synced to Firebase Firestore for persistence.

## API Routes

- `GET /api/health` - Health check
- `POST /api/audit/analyze` - Runs deterministic dataset analysis
- `POST /api/llm/detect-protected` - Infer likely protected attributes
- `POST /api/llm/project-setup` - Generates the project setup memo
- `POST /api/llm/proxy` - Generates the proxy legitimacy review
- `POST /api/llm/fairness` - Generates the fairness and subgroup interpretation
- `POST /api/llm/governance` - Generates the governance memo
- `POST /api/llm/decision` - Synthesizes the final decision
- `POST /api/agent/chat` - Answers user questions against the current audit context

## Local Setup

### Prerequisites

- Node.js `22.x` recommended
- npm
- Python `3.11+` recommended for the remediation and executable model-audit helpers
- Firebase CLI (`npm install -g firebase-tools`)

### Environment Variables

Create a `.env` file in the repository root.

```env
GCP_PROJECT_ID=your-gcp-project-id
GCP_LOCATION=us-central1
GCP_CLIENT_EMAIL=your-service-account-email
GCP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
APP_URL=http://localhost:3000
VITE_FIREBASE_API_KEY=your-firebase-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

### Install And Run

```bash
npm install
pip install -r requirements.txt
npm run dev
```

The app runs on: `http://localhost:3000`

## Production Build

```bash
npm run build
npm run start
```

## Deploying To Firebase

BiasScope uses Firebase for hosting the frontend and managing the backend via Cloud Functions or an integrated Node.js Express environment. 

1. Ensure you have the Firebase CLI installed: `npm install -g firebase-tools`
2. Login to Firebase: `firebase login`
3. Initialize or link your Firebase project: `firebase use --add`
4. Deploy the application:
   ```bash
   npm run build
   firebase deploy
   ```

Make sure that your Firebase project has Firestore, Authentication, and Hosting enabled, and the necessary environment variables are set in the Google Cloud Secret Manager or Firebase functions config if deploying the backend as a cloud function.

## Important Product Behavior

- The `Decision Questionnaire` locks once the sociotechnical analysis has been initiated.
- `Data Upload & Configuration` also locks once analysis begins, preserving audit consistency.
- The audit chat unlocks after the sociotechnical waterfall is complete.
- Governance is not required to start chatting, but it enriches the available context.
- The final decision card becomes available after governance and is explicitly synthesized by the user.

## Known Limitations

- The proxy-screening logic is lightweight and intended for prototype use rather than regulatory-grade certification.

## Suggested Demo Path

If you want a quick walkthrough:

1. Start the app locally.
2. Choose `Audit Tabular Dataset`.
3. Upload your own CSV or Excel dataset.
4. Select a target column and one or more protected attributes.
5. Run the sociotechnical waterfall.
6. Open the chat copilot.
7. Complete governance.
8. Generate the final decision, save it to your archives, and export the JSON report.
