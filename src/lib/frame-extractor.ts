import * as ffmpeg from './ffmpeg';
import * as gridComposer from './grid-composer';
import { join } from 'path';
import * as fs from 'fs/promises';
import { ExtractionOptions, FrameInfo, GridResult } from '../types';

const log = (msg: string) => process.stderr.write(`[OA Maestro] ${msg}\n`);

function tsOf(p: string): number {
  const f = (p.split(/[\\/]/).pop() ?? '');
  const m = f.match(/(\d{2})-(\d{2})-(\d{2})\.jpg$/);
  return m ? parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10) : Infinity;
}

export interface ExtractAndGridResult {
  grids: GridResult[];
  frames: FrameInfo[];
  adjustedThreshold?: number;
}

function parseTimestampFromFilename(filename: string): { timestamp: string; timestamp_seconds: number } {
  // Pattern: frame_NNNN_HH-MM-SS.jpg
  const match = filename.match(/frame_\d+_(\d{2})-(\d{2})-(\d{2})\.jpg$/);
  if (match) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const s = parseInt(match[3], 10);
    return {
      timestamp: `${match[1]}:${match[2]}:${match[3]}`,
      timestamp_seconds: h * 3600 + m * 60 + s,
    };
  }
  return { timestamp: '00:00:00', timestamp_seconds: 0 };
}

async function fillFrameGaps(
  input: string,
  framesDir: string,
  framePaths: string[],
  gapInterval: number,
  maxWidth: number
): Promise<string[]> {
  // Sort existing frames by timestamp
  const sorted = [...framePaths].sort((a, b) => tsOf(a) - tsOf(b));
  if (sorted.length < 2) return framePaths;

  // Find timestamps to fill
  const toFill: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = tsOf(sorted[i]);
    const end = tsOf(sorted[i + 1]);
    const gap = end - start;
    if (gap > gapInterval) {
      for (let t = start + gapInterval; t < end - gapInterval / 2; t += gapInterval) {
        const rounded = Math.round(t);
        // Skip if within 0.5s of any existing frame
        if (!sorted.some(p => Math.abs(tsOf(p) - rounded) < 0.5)) {
          toFill.push(rounded);
        }
      }
    }
  }

  if (toFill.length === 0) return framePaths;

  // Extract fill frames with gapfill_ prefix
  const fillPaths: string[] = [];
  for (const t of [...new Set(toFill)]) {
    const h = String(Math.floor(t / 3600)).padStart(2, '0');
    const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
    const s = String(t % 60).padStart(2, '0');
    const outPath = join(framesDir, `gapfill_${h}-${m}-${s}.jpg`);
    try {
      await ffmpeg.extractFrameAt(input, `${h}:${m}:${s}`, outPath, maxWidth);
      fillPaths.push(outPath);
    } catch { /* skip frames that fail */ }
  }

  if (fillPaths.length === 0) return framePaths;

  // Merge all frames and sort by timestamp
  const all = [...framePaths, ...fillPaths].sort((a, b) => tsOf(a) - tsOf(b));

  // Rename via temp names first to avoid conflicts during renumbering
  const tmpPaths: string[] = [];
  for (let i = 0; i < all.length; i++) {
    const tmp = join(framesDir, `tmp_renum_${String(i).padStart(5, '0')}.jpg`);
    await fs.rename(all[i], tmp);
    tmpPaths.push(tmp);
  }

  // Rename to final frame_NNNN_HH-MM-SS.jpg names (preserving original timestamps)
  const finalPaths: string[] = [];
  for (let i = 0; i < tmpPaths.length; i++) {
    const origTs = tsOf(all[i]);
    const h = String(Math.floor(origTs / 3600)).padStart(2, '0');
    const m = String(Math.floor((origTs % 3600) / 60)).padStart(2, '0');
    const s = String(origTs % 60).padStart(2, '0');
    const finalPath = join(framesDir, `frame_${String(i + 1).padStart(4, '0')}_${h}-${m}-${s}.jpg`);
    await fs.rename(tmpPaths[i], finalPath);
    finalPaths.push(finalPath);
  }

  return finalPaths;
}

export async function extractAndGrid(
  input: string,
  jobDir: string,
  opts: ExtractionOptions
): Promise<ExtractAndGridResult> {
  // 1. framesDir
  const framesDir = join(jobDir, 'frames');

  // 2. Extract frames
  log(`Pulling frames (mode: ${opts.mode})...`);
  let framePaths = await ffmpeg.extractFrames(input, framesDir, opts);
  log(`Got ${framePaths.length} frames.`);

  // Gap-fill: for scene mode, ensure no gap larger than gap_fill_interval goes uncovered
  if (opts.mode === 'scene' && opts.gap_fill_interval && opts.gap_fill_interval > 0) {
    log(`Filling coverage gaps > ${opts.gap_fill_interval}s...`);
    framePaths = await fillFrameGaps(input, framesDir, framePaths, opts.gap_fill_interval, opts.max_width ?? 768);
    log(`After gap-fill: ${framePaths.length} frames.`);
  }

  // Guarantee a frame near the video start in scene mode (runs even when scene detection found nothing)
  if (opts.mode === 'scene') {
    const sorted = [...framePaths].sort((a, b) => tsOf(a) - tsOf(b));
    if (sorted.length === 0 || tsOf(sorted[0]) > 3) {
      const startTs = opts.start_time ?? '00:00:00';
      // Normalise to HH-MM-SS for the filename
      const [hh, mm, ss] = startTs.includes(':')
        ? startTs.split(':').map(s => s.padStart(2, '0'))
        : [
            String(Math.floor(Number(startTs) / 3600)).padStart(2, '0'),
            String(Math.floor((Number(startTs) % 3600) / 60)).padStart(2, '0'),
            String(Math.floor(Number(startTs) % 60)).padStart(2, '0'),
          ];
      const outPath = join(framesDir, `gapfill_${hh}-${mm}-${ss}.jpg`);
      try {
        await ffmpeg.extractFrameAt(input, startTs, outPath, opts.max_width ?? 768);
        framePaths = [outPath, ...framePaths];
        log(`Prepended start frame at ${startTs}.`);
      } catch { /* skip if start frame extraction fails */ }
    }
  }

  const maxFrames = opts.max_frames ?? 80;
  let adjustedThreshold: number | undefined;

  // 3. If too many frames in scene mode, nudge threshold up and retry (up to 3x)
  if (framePaths.length > maxFrames && opts.mode === 'scene') {
    let currentThreshold = opts.scene_threshold ?? 0.3;

    for (let attempt = 0; attempt < 3 && framePaths.length > maxFrames; attempt++) {
      currentThreshold = Math.min(currentThreshold + 0.1, 0.95);
      adjustedThreshold = currentThreshold;

      const newOpts: ExtractionOptions = { ...opts, scene_threshold: currentThreshold };
      try {
        const files = await fs.readdir(framesDir);
        await Promise.all(files.map(f => fs.unlink(join(framesDir, f))));
      } catch { /* ignore */ }

      framePaths = await ffmpeg.extractFrames(input, framesDir, newOpts);
      log(`Threshold ${currentThreshold.toFixed(2)} → ${framePaths.length} frames.`);
    }

    // Still over 150 — evenly sample across the whole video rather than cutting the tail
    if (framePaths.length > 150) {
      log(`Still over 150 frames — sampling evenly so we don't miss the end.`);
      const step = framePaths.length / 150;
      framePaths = Array.from({ length: 150 }, (_, i) => framePaths[Math.floor(i * step)]);
    }
  }

  // Hard cap at 150 frames for all modes — safety net
  if (framePaths.length > 150) {
    log(`Frame count (${framePaths.length}) exceeds hard cap — sampling evenly to 150.`);
    const step = framePaths.length / 150;
    framePaths = Array.from({ length: 150 }, (_, i) => framePaths[Math.floor(i * step)]);
  }

  // 4. Build FrameInfo array
  const frames: FrameInfo[] = framePaths.map((p, i) => {
    const filename = p.split(/[\\/]/).pop() ?? '';
    const { timestamp, timestamp_seconds } = parseTimestampFromFilename(filename);

    // Parse frame number from filename
    const numMatch = filename.match(/frame_(\d+)/);
    const frame_number = numMatch ? parseInt(numMatch[1], 10) : i + 1;

    return {
      path: p,
      timestamp,
      timestamp_seconds,
      frame_number,
    };
  });

  // 5. If fewer than 5 frames, return without grids
  if (frames.length < 5) {
    return { grids: [], frames, adjustedThreshold };
  }

  // 6. Group frames into chunks of 6 (works well for both 2-col and 3-col layouts)
  const CHUNK_SIZE = 6;
  const grids: GridResult[] = [];
  const totalGrids = Math.ceil(framePaths.length / CHUNK_SIZE);
  log(`Composing ${totalGrids} frame grid${totalGrids !== 1 ? 's' : ''}...`);

  for (let i = 0; i < framePaths.length; i += CHUNK_SIZE) {
    const chunk = framePaths.slice(i, i + CHUNK_SIZE);
    const gridPath = join(jobDir, `grid_${String(Math.floor(i / CHUNK_SIZE) + 1).padStart(2, '0')}.jpg`);
    const grid = await gridComposer.composeGrid(chunk, gridPath);
    grids.push(grid);
  }
  log('Grids ready. Handing everything to your AI.');

  return { grids, frames, adjustedThreshold };
}
