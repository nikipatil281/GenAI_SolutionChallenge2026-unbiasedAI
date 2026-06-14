import type { GovernanceAnswers } from './governanceOptions';

const SAMPLES_BASE_URL = 'https://firebasestorage.googleapis.com/v0/b/genai-solution-challenge.firebasestorage.app/o/samples%2F';

export interface SampleDatasetDefinition {
  id: string;
  name: string;
  description: string;
  csvUrl: string;
  targetColumn: string;
  groundTruthColumn: string;
  protectedColumns: string[];
  governance?: GovernanceAnswers;
  problemFraming: {
    taskDescription: string;
    domain: string;
    stakeholders: string;
    humanBaseline: string;
    benefit: string;
  };
}

export const SAMPLE_DATASETS: SampleDatasetDefinition[] = [
  {
    id: 'hiring_current_drift_sample',
    name: 'Hiring Current Drift Sample',
    description: 'Resume screening decisions with race and gender signals for a quick hiring-bias walkthrough.',
    csvUrl: `${SAMPLES_BASE_URL}hiring_current_drift_sample.csv?alt=media`,
    targetColumn: 'model_decision',
    groundTruthColumn: 'hired_label',
    protectedColumns: ['gender', 'race'],
    problemFraming: {
      taskDescription: 'Automatically screening job applicants for advancement to the next hiring stage.',
      domain: 'Hiring',
      stakeholders: 'Women applicants, Black applicants, Latinx applicants, and candidates from nontraditional education backgrounds.',
      humanBaseline: 'Recruiters review incoming applications manually, compare interview signals with resume history, and decide who proceeds to hiring manager review.',
      benefit: 'Reduce recruiter screening time, standardize triage across large applicant pools, and surface drift in hiring outcomes earlier.',
    },
  },
  {
    id: 'loan_denial_fairness_sample',
    name: 'Loan Denial Fairness Sample',
    description: 'A compact lending dataset for testing denial patterns across gender and income context.',
    csvUrl: `${SAMPLES_BASE_URL}loan_denial_fairness_sample.csv?alt=media`,
    targetColumn: 'loan_denied',
    groundTruthColumn: 'none',
    protectedColumns: ['gender'],
    problemFraming: {
      taskDescription: 'Automatically deciding whether to deny a consumer loan application.',
      domain: 'Financial Lending',
      stakeholders: 'Applicants with lower incomes, women applicants, and residents whose zip codes may correlate with protected traits.',
      humanBaseline: 'Loan officers manually review income, credit, employment history, and supporting documents before making a denial decision.',
      benefit: 'Speed up application review, reduce manual workload, and identify denial disparities before deployment decisions are finalized.',
    },
  },
];

export function getSampleDatasetById(id: string) {
  return SAMPLE_DATASETS.find((dataset) => dataset.id === id);
}

export interface SampleModelDefinition {
  id: string;
  name: string;
  description: string;
  modelUrl: string;
  datasetUrl: string;
  modelFileName: string;
  datasetFileName: string;
  modelType: string;
  modelPurpose: string;
  trainingColumns: { name: string; role: 'independent' | 'dependent'; description?: string }[];
  groundTruthColumn: string;
  protectedColumns: string[];
}

export const SAMPLE_MODELS: SampleModelDefinition[] = [
  {
    id: 'adult_income_mlp_audit',
    name: 'Adult Income MLP Bias Audit',
    description: 'A pre-trained neural network classifying income >50K with the US Census demographic dataset.',
    modelUrl: `${SAMPLES_BASE_URL}adult_income_mlp.joblib?alt=media`,
    datasetUrl: `${SAMPLES_BASE_URL}adult_income_bias_audit_sample.csv?alt=media`,
    modelFileName: 'adult_income_mlp.joblib',
    datasetFileName: 'adult_income_bias_audit_sample.csv',
    modelType: 'sklearn',
    modelPurpose: 'Predict whether an individual earns more than $50,000 per year based on census data.',
    trainingColumns: [
      { name: 'age', role: 'independent' },
      { name: 'workclass', role: 'independent' },
      { name: 'education', role: 'independent' },
      { name: 'education-num', role: 'independent' },
      { name: 'marital-status', role: 'independent' },
      { name: 'occupation', role: 'independent' },
      { name: 'relationship', role: 'independent' },
      { name: 'race', role: 'independent' },
      { name: 'sex', role: 'independent' },
      { name: 'capital-gain', role: 'independent' },
      { name: 'capital-loss', role: 'independent' },
      { name: 'hours-per-week', role: 'independent' },
      { name: 'native-country', role: 'independent' },
      { name: 'ground_truth_label', role: 'dependent', description: 'Target: >50K or <=50K' }
    ],
    groundTruthColumn: 'ground_truth_label',
    protectedColumns: ['race', 'sex']
  }
];

export function getSampleModelById(id: string) {
  return SAMPLE_MODELS.find((model) => model.id === id);
}
