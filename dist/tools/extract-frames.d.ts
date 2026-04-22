import { MCPContent } from '../types';
export declare function extractFramesTool(args: {
    source: string;
    mode: 'scene' | 'interval' | 'keyframe' | 'targeted' | 'overview';
    fps?: number;
    scene_threshold?: number;
    gap_fill_interval?: number;
    timestamps?: string[];
    max_frames?: number;
    output_dir?: string;
    start_time?: string;
    end_time?: string;
    cookies?: string;
}, sessionDir: string): Promise<MCPContent[]>;
//# sourceMappingURL=extract-frames.d.ts.map