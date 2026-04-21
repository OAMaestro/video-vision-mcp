import YTDlpWrap from 'yt-dlp-wrap';
import { VideoInfo } from '../types';
export declare function getClient(): YTDlpWrap;
export declare function getVideoInfo(url: string, cookies?: string): Promise<VideoInfo>;
export declare function downloadVideo(url: string, outputPath: string, options: {
    cookies?: string;
}): Promise<void>;
export declare function downloadSubtitles(url: string, outputDir: string, language: string, cookies?: string): Promise<string | null>;
//# sourceMappingURL=ytdlp.d.ts.map