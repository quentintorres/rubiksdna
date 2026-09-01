import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * PDF rendering: headless Chromium prints the token-protected print route,
 * which server-renders the exact same <Report> component the app shows.
 * Web and PDF cannot drift because they are one component.
 *
 * Runs wherever the Inngest worker runs (a container with Chromium, not an
 * edge function). CHROMIUM_EXECUTABLE points at the browser binary and
 * APP_URL at the deployed app.
 */

const secret = () => {
  const value = process.env.WORKER_SHARED_SECRET;
  if (!value) throw new Error("WORKER_SHARED_SECRET required for print tokens");
  return value;
};

/** Short-lived HMAC token authorizing one report's print view. */
export function printToken(reportId: string, expiresAtMs = Date.now() + 10 * 60_000): string {
  const mac = createHmac("sha256", secret())
    .update(`${reportId}.${expiresAtMs}`)
    .digest("hex");
  return `${expiresAtMs}.${mac}`;
}

export function verifyPrintToken(reportId: string, token: string): boolean {
  const [expiresRaw, mac] = token.split(".");
  if (!expiresRaw || !mac) return false;
  const expiresAtMs = Number(expiresRaw);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) return false;
  const expected = createHmac("sha256", secret())
    .update(`${reportId}.${expiresAtMs}`)
    .digest("hex");
  const a = Buffer.from(mac, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function renderReportPdf(reportId: string): Promise<Buffer> {
  const { chromium } = await import("playwright-core");
  const appUrl = process.env.APP_URL ?? "http://localhost:3100";
  const url = `${appUrl}/print/report/${reportId}?token=${printToken(reportId)}`;

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    const response = await page.goto(url, { waitUntil: "networkidle" });
    if (!response || !response.ok()) {
      throw new Error(`print route returned ${response?.status() ?? "no response"}`);
    }
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
