import { Type } from "@mariozechner/pi-ai";
import { load } from "cheerio";

export function createAnalyzeHackerNewsTool() {
  return {
    name: "analyzeHackerNews",
    label: "Analyze Hacker News Top30",
    description: "Fetch top 30 Hacker News items, download each linked page, parse <title> and meta description with cheerio, count pages whose title/description contain AI, LLM or Agent (case-insensitive), return count and list of HN titles.",
    parameters: Type.Object({}, { additionalProperties: false }),
    execute: async (_toolCallId, _params) => {
      try {
        const topResp = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
        if (!topResp.ok) throw new Error('Failed to fetch topstories');
        const ids = await topResp.json();
        const top30 = Array.isArray(ids) ? ids.slice(0, 30) : [];

        // Fetch item details concurrently
        const itemPromises = top30.map(id => fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then(r => r.json()).catch(() => null));
        const items = await Promise.all(itemPromises);

        // For each item that has a url, fetch the page HTML concurrently and parse
        const fetchPagePromises = items.map(async (item) => {
          if (!item || !item.url) return { item, pageTitle: null, metaDesc: null };
          try {
            const resp = await fetch(item.url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; analyzeHackerNews/1.0)' }, redirect: 'follow' });
            if (!resp.ok) return { item, pageTitle: null, metaDesc: null };
            const html = await resp.text();
            const $ = load(html);
            const pageTitle = ($('title').first().text() || '').trim();
            const metaDesc = (
              $('meta[name="description"]').attr('content') ||
              $('meta[property="og:description"]').attr('content') ||
              $('meta[name="og:description"]').attr('content') ||
              ''
            ).trim();
            return { item, pageTitle, metaDesc };
          } catch (e) {
            return { item, pageTitle: null, metaDesc: null };
          }
        });

        const pages = await Promise.all(fetchPagePromises);

        // Check keywords in pageTitle or metaDesc
        const keywords = [ /\bAI\b/i, /\bLLM\b/i, /\bAgent\b/i ];
        const matchedTitles = [];

        for (const p of pages) {
          const { item, pageTitle, metaDesc } = p;
          if (!item) continue;
          const matched = keywords.some(k => (pageTitle && k.test(pageTitle)) || (metaDesc && k.test(metaDesc)));
          if (matched) {
            // Use the Hacker News item's title as the canonical title to return
            matchedTitles.push(item.title || '(no title)');
          }
        }

        // Return only the count and titles. Absolutely no HTML.
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ count: matchedTitles.length, titles: matchedTitles }, null, 2)
            }
          ],
          details: { ok: true }
        };
      } catch (err) {
        return {
          content: [ { type: 'text', text: JSON.stringify({ count: 0, titles: [] }) } ],
          details: { ok: false, error: String(err) }
        };
      }
    }
  };
}
