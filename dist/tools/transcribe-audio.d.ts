import { MCPContent } from '../types';
export declare function transcribeAudioTool(args: {
    source: string;
    language?: string;
    format?: 'timestamped' | 'plain' | 'srt';
    start_time?: string;
    end_time?: string;
    cookies?: string;
}, sessionDir: string): Promise<MCPContent[]>;
//# sourceMappingURL=transcribe-audio.d.ts.map