import * as ffmpeg from './ffmpeg';
import * as gridComposer from './grid-composer';
import { join } from 'path';
import * as fs from 'fs/promises';
import { ExtractionOptions, FrameInfo, GridResult } from '../types';

const log = (msg: string) => process.stderr.write(`[OA Maestro] ${msg}\n`);

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
