import { MCPContent } from '../types';
export declare function analyzeVideoTool(args: {
    source: string;
    query: string;
    mode?: 'overview' | 'detailed' | 'full';
    start_time?: string;
    end_time?: string;
    scene_threshold?: number;
    max_frames?: number;
    cookies?: string;
}, sessionDir: string): Promise<MCPContent[]>;
//# sourceMappingURL=analyze-video.d.ts.map