import hiringCurrentDriftSampleCsv from '../../samples/hiring_current_drift_sample.csv?raw';
import loanDenialFairnessSampleCsv from '../../samples/loan_denial_fairness_sample.csv?raw';
import type { GovernanceAnswers } from './governanceOptions';

export interface SampleDatasetDefinition {
  id: string;
  name: string;
  description: string;
  csvText: string;
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
    csvText: hiringCurrentDriftSampleCsv,
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
    csvText: loanDenialFairnessSampleCsv,
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
