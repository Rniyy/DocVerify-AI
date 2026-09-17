import { ComparisonReport } from "./comparison";

export interface ComparisonHistoryItem {
  id: number;
  createdAt: string;
  documentNames: string[];
  documentsReviewed: number;
  fieldsChecked: number;
  matches: number;
  warnings: number;
  errors: number;
}

export interface ComparisonDetail {
  id: number;
  createdAt: string;
  documentNames: string[];
  report: ComparisonReport;
}
