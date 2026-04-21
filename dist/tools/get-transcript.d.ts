import { MCPContent } from '../types';
export declare function getTranscriptTool(args: {
    source: string;
    language?: string;
    format: 'timestamped' | 'plain' | 'srt';
    cookies?: string;
}, sessionDir: string): Promise<MCPContent[]>;
//# sourceMappingURL=get-transcript.d.ts.map