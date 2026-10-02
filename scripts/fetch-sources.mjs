#!/usr/bin/env node
/**
 * Fetches the public-domain primary sources into research/sources/.
 *
 * CLAUDE.md § Research makes this the first task in a fresh clone. The fetched
 * text is also committed, so citations in research/lore-bible.md are verifiable
 * without a network round trip; this script exists to reproduce or re-verify it.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

const SOURCES = [
  {
    // Franchezzo, A Wanderer in the Spirit Lands (1896). Published 1896, public domain.
    name: 'franchezzo-wanderer-in-the-spirit-lands-1896.txt',
    url: 'https://ia600504.us.archive.org/8/items/wandererinspirit1896fran/wandererinspirit1896fran_djvu.txt',
    // Fallback if the item moves servers; archive.org's /download/ redirector.
    fallbackUrl: 'https://archive.org/download/wandererinspirit1896fran/wandererinspirit1896fran_djvu.txt',
    expectedBytes: 668517,
  },
];

const OUT_DIR = 'research/sources';

async function fetchText(source) {
  for (const url of [source.url, source.fallbackUrl].filter(Boolean)) {
    try {
      const response = await fetch(url, { redirect: 'follow' });
      if (!response.ok) {
        console.warn(`  ${String(response.status)} from ${url}`);
        continue;
      }
      return await response.text();
    } catch (error) {
      console.warn(`  failed ${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return undefined;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  let failures = 0;

  for (const source of SOURCES) {
    const target = `${OUT_DIR}/${source.name}`;
    console.log(`\n${source.name}`);

    const text = await fetchText(source);
    if (text === undefined) {
      console.error('  could not fetch from any URL');
      failures += 1;
      continue;
    }

    const bytes = Buffer.byteLength(text);
    const digest = createHash('sha256').update(text).digest('hex').slice(0, 16);

    let existing;
    try {
      existing = await readFile(target, 'utf8');
    } catch {
      existing = undefined;
    }

    if (existing === text) {
      console.log(`  unchanged (${String(bytes)} bytes, sha256:${digest})`);
      continue;
    }

    await writeFile(target, text, 'utf8');
    console.log(
      `  ${existing === undefined ? 'written' : 'updated'} (${String(bytes)} bytes, sha256:${digest})`,
    );
    if (source.expectedBytes !== undefined && bytes !== source.expectedBytes) {
      // Not fatal: archive.org re-OCRs items. But a changed size can move the
      // page numbers that research/lore-bible.md cites, so it must be noticed.
      console.warn(
        `  NOTE: expected ${String(source.expectedBytes)} bytes. The text changed upstream —` +
          ' re-check the chapter and page citations in research/lore-bible.md.',
      );
    }
  }

  if (failures > 0) {
    console.error(`\n${String(failures)} source(s) could not be fetched.\n`);
    process.exit(1);
  }
  console.log('\nsources ready.\n');
}

await main();
