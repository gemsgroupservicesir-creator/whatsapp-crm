import { describe, it, expect } from 'vitest';
import {
  normalizePublicWebsiteUrl,
  extractReadableContentFromHtml,
} from './scraper';

describe('University website scraper', () => {
  it('normalizes valid public domains and preserves https URLs', () => {
    expect(normalizePublicWebsiteUrl('gems.edu.in')).toEqual({
      valid: true,
      url: 'https://gems.edu.in/',
    });
    expect(normalizePublicWebsiteUrl('https://nit.edu/programs/ai-ml')).toEqual({
      valid: true,
      url: 'https://nit.edu/programs/ai-ml',
    });
  });

  it('rejects private/loopback hosts and non-http protocols (SSRF guard)', () => {
    expect(normalizePublicWebsiteUrl('http://localhost:3000').valid).toBe(false);
    expect(normalizePublicWebsiteUrl('http://127.0.0.1/admin').valid).toBe(false);
    expect(normalizePublicWebsiteUrl('http://169.254.169.254/latest/meta-data').valid).toBe(false);
    expect(normalizePublicWebsiteUrl('http://192.168.1.10').valid).toBe(false);
    expect(normalizePublicWebsiteUrl('http://10.0.0.5').valid).toBe(false);
    expect(normalizePublicWebsiteUrl('file:///etc/passwd').valid).toBe(false);
    expect(normalizePublicWebsiteUrl('').valid).toBe(false);
  });

  it('extracts title, meta description, readable text, and fee/eligibility highlights from HTML', () => {
    const html = `
      <!doctype html>
      <html>
        <head>
          <title>GEMS B-School &amp; Nursing</title>
          <meta name="description" content="AICTE &amp; INC approved degree programs in Bangalore." />
          <style>.nav { color: red; }</style>
        </head>
        <body>
          <script>console.log("ignore script text");</script>
          <h1>B.Sc Nursing 4-Year Honors</h1>
          <p>Eligibility: Minimum 50% aggregate in PCB in 10+2 examination.</p>
          <ul>
            <li>Merit scholarships up to 40% tuition waiver for high scorers.</li>
            <li>100% hospital clinical rotation &amp; placement assistance.</li>
          </ul>
        </body>
      </html>
    `;

    const res = extractReadableContentFromHtml(html);
    expect(res.title).toBe('GEMS B-School & Nursing');
    expect(res.description).toBe('AICTE & INC approved degree programs in Bangalore.');
    expect(res.extractedText).toContain('B.Sc Nursing 4-Year Honors');
    expect(res.extractedText).not.toContain('ignore script text');
    expect(res.highlightsFound.some((h) => h.includes('Eligibility'))).toBe(true);
    expect(res.highlightsFound.some((h) => h.includes('scholarships'))).toBe(true);
  });
});
