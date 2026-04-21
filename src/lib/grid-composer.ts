import sharp from 'sharp';
import { join } from 'path';
import * as fs from 'fs/promises';
import { GridResult, FrameInfo } from '../types';

function parseTimestampFromFilename(filename: string): string {
  // Pattern: frame_NNNN_HH-MM-SS.jpg
  const match = filename.match(/frame_\d+_(\d{2})-(\d{2})-(\d{2})\.jpg$/);
  if (match) {
    return `${match[1]}:${match[2]}:${match[3]}`;
  }
  return '00:00:00';
}

export async function composeGrid(
  framePaths: string[],
  outputPath: string,
  options: { includeLabels?: boolean; columns?: number; cellWidth?: number } = {}
): Promise<GridResult> {
  // 0. Validate input
  if (framePaths.length === 0) {
    throw new Error('composeGrid requires at least one frame path');
  }

  // 1. Load first frame metadata
  const meta = await sharp(framePaths[0]).metadata();

  // 2. Determine orientation-aware defaults
  const isPortrait = (meta.height ?? 0) > (meta.width ?? 0);
  const derivedColumns = isPortrait ? 2 : 3;
  const COLUMNS = options.columns ?? derivedColumns;
  const CELL_WIDTH = options.cellWidth ?? 768;

  // 3. cellHeight
  if (!meta.width || !meta.height) {
    throw new Error(`Cannot read dimensions from frame: ${framePaths[0]}`);
  }
  const cellHeight = Math.round(CELL_WIDTH / (meta.width / meta.height));

  // 4. rows
  const rows = Math.ceil(framePaths.length / COLUMNS);

  // 5. gridWidth
  const gridWidth = COLUMNS * CELL_WIDTH;

  // 6. Composite frames
  const composites = await Promise.all(
    framePaths.map(async (p, i) => {
      const buf = await sharp(p)
        .resize(CELL_WIDTH, cellHeight, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0 },
        })
        .toBuffer();
      const col = i % COLUMNS;
      const row = Math.floor(i / COLUMNS);
      return { input: buf, left: col * CELL_WIDTH, top: row * cellHeight };
    })
  );

  // 7. Create blank canvas and composite
  await sharp({
    create: {
      width: gridWidth,
      height: rows * cellHeight,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 85 })
    .toFile(outputPath);

  // 8. Determine time_start / time_end from filenames
  const firstFilename = framePaths[0].split(/[\\/]/).pop() ?? '';
  const lastFilename = framePaths[framePaths.length - 1].split(/[\\/]/).pop() ?? '';

  const time_start = parseTimestampFromFilename(firstFilename);
  const time_end = parseTimestampFromFilename(lastFilename);

  return {
    path: outputPath,
    rows,
    columns: COLUMNS,
    frame_count: framePaths.length,
    time_start,
    time_end,
  };
}
