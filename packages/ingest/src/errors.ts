/**
 * A parse problem tied to a location the uploader can actually find.
 * "Row 214, column GSM123: value 1.3 is outside [0,1]" is actionable;
 * "invalid file" is not.
 */
export interface RowError {
  row: number;
  column: string | null;
  code:
    | "missing_header"
    | "unknown_column"
    | "missing_value"
    | "non_numeric"
    | "out_of_range"
    | "duplicate_key"
    | "unknown_analyte"
    | "unit_mismatch"
    | "implausible_value"
    | "malformed_row";
  message: string;
}

export interface ParseOutcome<T> {
  ok: boolean;
  data: T | null;
  errors: RowError[];
  warnings: RowError[];
  /** Parse stops collecting after this many errors to bound response size. */
  truncatedErrors: boolean;
}

export const MAX_REPORTED_ERRORS = 200;
