import * as gridComposer from '../lib/grid-composer';
import { createJobDir } from '../lib/session-manager';
import { join } from 'path';
import * as fs from 'fs/promises';
import { MCPContent } from '../types';

export async function createFrameGridTool(
  args: {
    frame_paths: string[];
    columns?: number;
    cell_width?: number;
    include_frame_labels?: boolean;
  },
  sessionDir: string
): Promise<MCPContent[]> {
  try {
    // Validate all paths exist
    for (const p of args.frame_paths) {
      try {
        await fs.access(p);
      } catch {
        return [{ type: 'text', text: `Error: Frame path does not exist: ${p}` }];
      }
    }

    const jobDir = await createJobDir(sessionDir);
    const outputPath = join(jobDir, 'custom_grid.jpg');

    const grid = await gridComposer.composeGrid(args.frame_paths, outputPath, {
      includeLabels: args.include_frame_labels ?? true,
      columns: args.columns,
      cellWidth: args.cell_width,
    });

    const buf = await fs.readFile(outputPath);
    const base64 = buf.toString('base64');

    return [
      { type: 'image', data: base64, mimeType: 'image/jpeg' },
      { type: 'text', text: `Grid: ${grid.frame_count} frames, ${grid.columns}×${grid.rows}` },
    ];
  } catch (err: any) {
    return [{ type: 'text', text: `Error creating frame grid: ${err.message}` }];
  }
}
