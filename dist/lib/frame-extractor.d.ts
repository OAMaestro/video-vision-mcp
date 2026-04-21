import { ExtractionOptions, FrameInfo, GridResult } from '../types';
export interface ExtractAndGridResult {
    grids: GridResult[];
    frames: FrameInfo[];
    adjustedThreshold?: number;
}
export declare function extractAndGrid(input: string, jobDir: string, opts: ExtractionOptions): Promise<ExtractAndGridResult>;
//# sourceMappingURL=frame-extractor.d.ts.map