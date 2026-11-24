// Take website screenshots (or PDFs) with the Apify Actor polderbyte/website-screenshot-pdf
// and download the files.
//
// Usage:
//   export APIFY_TOKEN=...            (PowerShell: $env:APIFY_TOKEN = "...")
//   npm install
//   node take-screenshot.mjs                          # default: https://apify.com
//   node take-screenshot.mjs https://www.example.com https://en.wikipedia.org/wiki/Belgium
//
// Each argument is one URL. Edit `input` below for full-page captures, PDFs, mobile devices or dark mode.

import { mkdir, writeFile } from 'node:fs/promises';
import { ApifyClient } from 'apify-client';

const token = process.env.APIFY_TOKEN;
if (!token) {
    console.error('Set the APIFY_TOKEN environment variable (Apify Console > Settings > API & Integrations).');
    process.exit(1);
}

const urls = process.argv.slice(2);
const input = {
    urls: urls.length > 0 ? urls : ['https://apify.com'],
    format: 'png', // 'png', 'jpeg', 'webp' or 'pdf'
    device: 'desktop', // 'desktop', 'desktop-hd', 'laptop', 'ipad', 'iphone-15', 'pixel-8' or 'custom'
    fullPage: false, // true = whole page, lazy-loaded content included
    hideCookieBanners: true,
    maxItems: 10, // keeps the run small and cheap; raise it for real use
};

const client = new ApifyClient({ token });

// call() starts the run and waits for it to finish.
// maxTotalChargeUsd caps what this run can cost you.
const run = await client.actor('polderbyte/website-screenshot-pdf').call(input, {
    maxTotalChargeUsd: 0.1,
    log: null, // remove this line to stream the Actor's log to your terminal
});

if (run.status !== 'SUCCEEDED') {
    console.error(`Run ${run.id} ended with status ${run.status}.`);
    process.exit(1);
}

const { items } = await client.dataset(run.defaultDatasetId).listItems();
await mkdir('output', { recursive: true });

for (const row of items) {
    if (row.status !== 'ok') {
        console.log(`FAILED ${row.url}: ${row.error} (not charged)`);
        continue;
    }
    // fileUrl points to the run's key-value store. The token header also covers accounts
    // whose storage requires authentication.
    const response = await fetch(row.fileUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
        console.log(`Could not download ${row.fileUrl}: HTTP ${response.status}`);
        continue;
    }
    const path = `output/${row.key}`;
    await writeFile(path, Buffer.from(await response.arrayBuffer()));
    const size = row.pages ? `${row.pages} page(s)` : `${row.width}x${row.height}px`;
    console.log(`OK ${row.url} -> ${path} (${size}, ${row.bytes} bytes, title "${row.title}", cookie banner: ${row.cookieBanner ?? 'none'})`);
}

await writeFile('output/results.json', JSON.stringify(items, null, 2));
console.log(`\n${items.length} row(s) saved to output/results.json (run ${run.id}).`);
