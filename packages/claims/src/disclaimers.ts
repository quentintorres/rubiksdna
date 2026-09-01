/**
 * Versioned disclaimer text. Every issued report stores the version it was
 * rendered with, so a report can always be reproduced with the exact wording
 * that was shown at the time.
 *
 * Never edit a published version in place. Add a new one.
 */

export type DisclaimerVersion = "2026-01-v1";

export const CURRENT_DISCLAIMER_VERSION: DisclaimerVersion = "2026-01-v1";

export interface Disclaimer {
  version: DisclaimerVersion;
  /** Shown at the top of every report, above any number. */
  header: string;
  /** Shown in the report footer and on the PDF's every page. */
  footer: string;
  /** Shown wherever a clock value appears. */
  clockContext: string;
  /** Shown wherever a longitudinal delta appears. */
  deltaContext: string;
  /** Shown on axes that could not be computed from the supplied inputs. */
  notMeasured: string;
}

const DISCLAIMERS: Record<DisclaimerVersion, Disclaimer> = {
  "2026-01-v1": {
    version: "2026-01-v1",
    header:
      "Research and wellness interpretation of laboratory data supplied by the ordering organization. This report is not a diagnosis, does not identify or rule out any disease, and is not a substitute for clinical judgment.",
    footer:
      "RUBIKS DNA State Map. Interpretation only — no samples were collected or analyzed by RUBIKS DNA. Values derive entirely from files supplied by the ordering organization.",
    clockContext:
      "Epigenetic clock values are statistical estimates produced by published models. A clock estimate is an instrument reading, not a measurement of a person's age or health.",
    deltaContext:
      "Differences between timepoints are reported alongside the measurement noise of the assay. A difference smaller than the minimum detectable change cannot be distinguished from noise and is reported as such.",
    notMeasured:
      "Not measured. The inputs supplied for this sample do not support scoring this axis. No inference should be drawn from its absence.",
  },
};

export const getDisclaimer = (version: DisclaimerVersion = CURRENT_DISCLAIMER_VERSION): Disclaimer => {
  const found = DISCLAIMERS[version];
  if (!found) throw new Error(`Unknown disclaimer version: ${version}`);
  return found;
};

export const allDisclaimerVersions = (): DisclaimerVersion[] =>
  Object.keys(DISCLAIMERS) as DisclaimerVersion[];
