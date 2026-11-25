/**
 * Safe Website Scraper for University & Course Pages
 *
 * Fetches public university/course web pages with SSRF protection,
 * extracts readable headings, paragraphs, list items, and fee/eligibility
 * highlights while keeping response sizes bounded.
 */

export interface WebsiteScrapeResult {
  url: string;
  ok: boolean;
  title?: string;
  description?: string;
  extractedText: string;
  highlightsFound: string[];
  error?: string;
}

const MAX_HTML_BYTES = 450_000;
const MAX_TEXT_CHARS = 7_500;
const FETCH_TIMEOUT_MS = 10_000;

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /^0\.0\.0\.0$/,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^\[?::1\]?$/,
  /^\[?fe80:/i,
  /^\[?fc00:/i,
  /^\[?fd00:/i,
];

/**
 * Validates and normalizes an external HTTP/HTTPS URL, rejecting private/loopback targets.
 */
export function normalizePublicWebsiteUrl(rawUrl: string): {
  valid: boolean;
  url?: string;
  error?: string;
} {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: false, error: 'Website URL is empty' };
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return { valid: false, error: 'Invalid website URL format' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only http and https URLs are supported' };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname || !hostname.includes('.')) {
    return { valid: false, error: 'Website domain must be a valid public host' };
  }

  if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) {
    return { valid: false, error: 'Private or internal network URLs are not permitted' };
  }

  return { valid: true, url: parsed.toString() };
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&rsquo;|&lsquo;/gi, "'")
    .replace(/&rdquo;|&ldquo;/gi, '"')
    .replace(/&ndash;|&mdash;/gi, '-')
    .replace(/&bull;/gi, '•')
    .replace(/&#(\d+);/g, (_, num) => {
      const code = Number(num);
      return Number.isFinite(code) && code > 31 && code < 65535
        ? String.fromCharCode(code)
        : ' ';
    });
}

/**
 * Extracts readable title, meta description, structured text, and admission/fee highlights from HTML.
 */
export function extractReadableContentFromHtml(html: string): {
  title?: string;
  description?: string;
  extractedText: string;
  highlightsFound: string[];
} {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1]).replace(/\s+/g, ' ').trim() : undefined;

  const descMatch =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i) ||
    html.match(/<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']description["'][^>]*>/i) ||
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i);
  const description = descMatch ? decodeHtmlEntities(descMatch[1]).replace(/\s+/g, ' ').trim() : undefined;

  // Strip non-content elements
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  // Preserve natural line boundaries on block elements
  cleaned = cleaned.replace(
    /<\/?(h[1-6]|p|li|tr|div|section|article|br|dd|dt|th|td)[^>]*>/gi,
    '\n'
  );

  // Strip remaining tags
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');
  cleaned = decodeHtmlEntities(cleaned);

  const lines = cleaned
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 4);

  // Deduplicate adjacent or repeated boilerplate lines
  const seen = new Set<string>();
  const uniqueLines: string[] = [];
  for (const line of lines) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueLines.push(line);
  }

  const keywordRegex =
    /(fee|tuition|scholarship|eligib|duration|semester|year|intake|placement|package|accredit|naac|ugc|aicte|nirf|approval|hostel|campus|admission|curriculum|syllabus|degree|b\.sc|mba|b\.tech|bba|mca|nursing|mbbs)/i;

  const highlightsFound = uniqueLines
    .filter((line) => line.length >= 18 && line.length <= 320 && keywordRegex.test(line))
    .slice(0, 20);

  const combined = uniqueLines.join('\n').slice(0, MAX_TEXT_CHARS);

  return {
    title: title || undefined,
    description: description || undefined,
    extractedText: combined,
    highlightsFound,
  };
}

/**
 * Fetches and extracts readable information from a public university or course website.
 * Never throws; returns structured result with `ok: false` on network/timeout errors.
 */
export async function scrapeUniversityWebsite(rawUrl: string): Promise<WebsiteScrapeResult> {
  const normalized = normalizePublicWebsiteUrl(rawUrl);
  if (!normalized.valid || !normalized.url) {
    return {
      url: rawUrl,
      ok: false,
      extractedText: '',
      highlightsFound: [],
      error: normalized.error || 'Invalid URL',
    };
  }

  try {
    const res = await fetch(normalized.url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; GemsAdmissionsCRM/1.0; +https://whatsapp-crm-beta-seven.vercel.app)',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      return {
        url: normalized.url,
        ok: false,
        extractedText: '',
        highlightsFound: [],
        error: `Website returned HTTP ${res.status} (${res.statusText || 'Error'})`,
      };
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.includes('text/') && !contentType.includes('html') && !contentType.includes('xml')) {
      return {
        url: normalized.url,
        ok: false,
        extractedText: '',
        highlightsFound: [],
        error: `Unsupported content type: ${contentType}`,
      };
    }

    const rawText = await res.text();
    const boundedHtml = rawText.slice(0, MAX_HTML_BYTES);
    const extracted = extractReadableContentFromHtml(boundedHtml);

    return {
      url: res.url || normalized.url,
      ok: extracted.extractedText.length > 0 || Boolean(extracted.title || extracted.description),
      title: extracted.title,
      description: extracted.description,
      extractedText: extracted.extractedText,
      highlightsFound: extracted.highlightsFound,
      error:
        extracted.extractedText.length === 0
          ? 'Website loaded but rendered minimal static text (SPA/JS-heavy site)'
          : undefined,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      url: normalized.url,
      ok: false,
      extractedText: '',
      highlightsFound: [],
      error: `Could not reach website: ${message}`,
    };
  }
}
