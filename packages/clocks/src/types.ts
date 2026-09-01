export type Platform =
  | "methylation_450k"
  | "methylation_epic"
  | "methylation_epic_v2";

export type OrgType = "research" | "clinic";

export type LicenseStatus =
  /** Coefficients published in a journal supplement with no known use restriction. */
  | "open_published"
  /** Terms unresolved. The clock exists in the registry but never resolves. */
  | "under_review"
  /** Counsel confirmed a restriction. Never resolves for the restricted use. */
  | "restricted";

export interface ClockLicense {
  status: LicenseStatus;
  /** Organization types this clock may be computed for. */
  allowedOrgTypes: OrgType[];
  /** Where the coefficients were published. */
  source: string;
  notes: string;
}

export interface ClockDefinition {
  id: string;
  version: string;
  displayName: string;
  yearPublished: number;
  tissue: string;
  /** Platforms whose manifests contain enough of this clock's probes. */
  supportedPlatforms: Platform[];
  /** CpG probe id -> published coefficient. */
  coefficients: ReadonlyMap<string, number>;
  intercept: number;
  /** Applied to (intercept + dot product). Identity for most clocks. */
  transform: (linearCombination: number) => number;
  /**
   * Fraction of probes that may be imputed before the pipeline refuses to
   * emit a value. Deliberately conservative.
   */
  maxImputedFraction: number;
  /**
   * Technical (test-retest) standard deviation in output units, drawn from
   * published reliability work. Drives the MDC noise gate.
   */
  technicalSd: number;
  /** Citation for the technicalSd figure. */
  technicalSdSource: string;
  license: ClockLicense;
  /** Written statement of preprocessing assumptions — a registration requirement. */
  preprocessingAssumptions: string;
}

export interface ClockComputation {
  clockId: string;
  clockVersion: string;
  /** Null when the computation was refused. */
  value: number | null;
  probesUsed: number;
  probesImputed: number;
  refusedReason: string | null;
}
