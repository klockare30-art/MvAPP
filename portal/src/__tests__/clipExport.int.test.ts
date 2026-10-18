/// <reference types="node" />
/**
 * Integration test against a real MP4 (skipped unless MATCH_FILE is set):
 *   MATCH_FILE=/path/match.mp4 CLIP_OUT=/tmp/out npx vitest run clipExport
 * Needs ffprobe on PATH to verify the written clip.
 */
import { execFileSync } from 'node:child_process';
import { openAsBlob } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

import { exportClip, inspectMatchFile } from '../clipExport';

const MATCH = process.env.MATCH_FILE;
const OUT = process.env.CLIP_OUT ?? '.';

function probe(path: string) {
  const json = execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path]).toString();
  return JSON.parse(json) as { format: { duration: string }; streams: { codec_type: string; codec_name: string }[] };
}

describe.skipIf(!MATCH)('clip export on a real file', () => {
  test('inspects the match without loading it', async () => {
    const info = await inspectMatchFile(await openAsBlob(MATCH!));
    console.log(info);
    expect(info.durationSec).toBeGreaterThan(0);
    expect(info.videoCodec).not.toBeNull();
  });

  test('copies a clip without re-encoding, starting at or before the requested start', { timeout: 120_000 }, async () => {
    const file = await openAsBlob(MATCH!);
    const { durationSec } = await inspectMatchFile(file);
    const from = Math.round(durationSec * 0.7) + 1.5;
    const to = from + 9.5;
    const t = performance.now();
    const clip = await exportClip(file, from, to);
    const ms = Math.round(performance.now() - t);
    const path = join(OUT, 'clip.mp4');
    await writeFile(path, new Uint8Array(await clip.blob.arrayBuffer()));
    const p = probe(path);
    console.log({ ms, startSec: clip.startSec, endSec: clip.endSec, bytes: clip.blob.size, duration: p.format.duration,
      streams: p.streams.map((s) => `${s.codec_type}:${s.codec_name}`) });
    expect(clip.startSec).toBeLessThanOrEqual(from);
    expect(clip.endSec).toBeGreaterThanOrEqual(to);
    expect(Number(p.format.duration)).toBeGreaterThanOrEqual(9.4);
    expect(p.streams.map((s) => s.codec_type).sort()).toEqual(['audio', 'video']);
    // Decodes cleanly end to end (no missing reference frames at the start).
    execFileSync('ffmpeg', ['-v', 'error', '-xerror', '-i', path, '-f', 'null', '-']);
  });

  test('rejects a start after the end of the match', async () => {
    const file = await openAsBlob(MATCH!);
    const { durationSec } = await inspectMatchFile(file);
    await expect(exportClip(file, durationSec + 5, durationSec + 10)).rejects.toThrow('efter videons slut');
  });
});
