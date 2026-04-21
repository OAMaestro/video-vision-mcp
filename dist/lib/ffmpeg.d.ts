import { ExtractionOptions, VideoInfo } from '../types';
export declare function getFFmpegPath(): string;
export declare function getFFprobePath(): string;
export declare function spawnProcess(bin: string, args: string[]): Promise<{
    stdout: string;
    stderr: string;
}>;
export declare function getLocalVideoInfo(filePath: string): Promise<VideoInfo>;
export declare function extractFrames(input: string, outputDir: string, opts: ExtractionOptions): Promise<string[]>;
export declare function extractFrameAt(input: string, timestamp: string, outputPath: string, maxWidth?: number): Promise<void>;
export declare function extractAudio(input: string, outputPath: string): Promise<void>;
export declare function extractEmbeddedSubtitles(input: string, outputPath: string): Promise<boolean>;
//# sourceMappingURL=ffmpeg.d.ts.map