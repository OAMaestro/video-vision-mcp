import { TranscriptResult } from '../types';
export declare function isModelCached(): Promise<boolean>;
export declare function getTranscriber(): Promise<any>;
export declare function transcribeFile(audioPath: string, options: {
    language?: string;
    returnTimestamps?: boolean;
}): Promise<TranscriptResult>;
export declare function formatTranscript(result: TranscriptResult, format: 'plain' | 'timestamped' | 'srt'): string;
//# sourceMappingURL=transcriber.d.ts.map