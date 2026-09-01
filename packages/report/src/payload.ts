import type { AxisScore } from "@rubiksdna/axes";
import type { DisclaimerVersion } from "@rubiksdna/claims";

/**
 * Everything a report renders, snapshotted. Reports are immutable: this
 * payload is stored on the report row, so later data edits can never change
 * what a customer was shown.
 */

export interface ReportClockRow {
  clockId: string;
  displayName: string;
  clockVersion: string;
  /** Null when the pipeline refused; refusedReason says why. */
  value: number | null;
  probesUsed: number;
  probesImputed: number;
  refusedReason: string | null;
  technicalSd: number;
}

export interface ReportDeltaRow {
  metricKey: string;
  displayName: string;
  preValue: number;
  postValue: number;
  preDate: string;
  postDate: string;
  delta: number;
  mdc: number;
  exceedsMdc: boolean;
  unit: string;
}

export interface ReportSubject {
  externalRef: string;
  chronologicalAge: number | null;
  sex: "female" | "male" | "unspecified";
}

export interface ReportSample {
  collectedAt: string;
  tissue: string;
  platform: string;
  sourceLab: string | null;
  qcStatus: "pending" | "passed" | "warned" | "failed";
  qcSummary: string[];
}

export interface ReportPayload {
  templateVersion: string;
  disclaimerVersion: DisclaimerVersion;
  pipelineVersion: string;
  generatedAt: string;
  organizationName: string;
  subject: ReportSubject;
  sample: ReportSample;
  clocks: ReportClockRow[];
  axes: AxisScore[];
  deltas: ReportDeltaRow[];
}

export const REPORT_TEMPLATE_VERSION = "1.0.0";
