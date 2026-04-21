"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const session_manager_1 = require("./lib/session-manager");
const analyze_video_1 = require("./tools/analyze-video");
const extract_frames_1 = require("./tools/extract-frames");
const get_video_info_1 = require("./tools/get-video-info");
const get_transcript_1 = require("./tools/get-transcript");
const transcribe_audio_1 = require("./tools/transcribe-audio");
const cleanup_1 = require("./tools/cleanup");
function printContent(result) {
    for (const item of result) {
        if (item.type === 'text') {
            console.log(item.text);
        }
        else {
            console.log('[Image content — use MCP client to view]');
        }
    }
}
const program = new commander_1.Command();
program
    .name('video-vision-mcp')
    .description('Video Vision MCP CLI')
    .version('0.1.0');
program
    .command('analyze')
    .description('Analyze a video end-to-end')
    .requiredOption('--source <source>', 'Local file path or URL')
    .requiredOption('--query <query>', 'What to analyze')
    .option('--mode <mode>', 'overview|detailed|full', 'overview')
    .option('--start-time <time>', 'Start time e.g. "00:02:30"')
    .option('--end-time <time>', 'End time e.g. "00:05:00"')
    .option('--cookies <path>', 'Path to cookies.txt')
    .option('--max-frames <n>', 'Max frames to extract', parseInt)
    .action(async (opts) => {
    const sessionDir = await (0, session_manager_1.createSessionDir)();
    const result = await (0, analyze_video_1.analyzeVideoTool)({
        source: opts.source,
        query: opts.query,
        mode: opts.mode,
        start_time: opts.startTime,
        end_time: opts.endTime,
        cookies: opts.cookies,
        max_frames: opts.maxFrames,
    }, sessionDir);
    printContent(result);
    process.exit(0);
});
program
    .command('extract')
    .description('Extract frames from a video')
    .requiredOption('--source <source>', 'Local file path or URL')
    .requiredOption('--mode <mode>', 'scene|interval|keyframe|targeted|overview')
    .option('--fps <fps>', 'Frames per second (interval mode)', parseFloat)
    .option('--scene-threshold <n>', 'Scene threshold 0.1-0.9', parseFloat)
    .option('--max-frames <n>', 'Max frames', parseInt)
    .option('--output-dir <dir>', 'Output directory')
    .option('--start-time <time>', 'Start time')
    .option('--end-time <time>', 'End time')
    .option('--cookies <path>', 'Path to cookies.txt')
    .action(async (opts) => {
    const sessionDir = await (0, session_manager_1.createSessionDir)();
    const result = await (0, extract_frames_1.extractFramesTool)({
        source: opts.source,
        mode: opts.mode,
        fps: opts.fps,
        scene_threshold: opts.sceneThreshold,
        max_frames: opts.maxFrames,
        output_dir: opts.outputDir,
        start_time: opts.startTime,
        end_time: opts.endTime,
        cookies: opts.cookies,
    }, sessionDir);
    printContent(result);
    process.exit(0);
});
program
    .command('info')
    .description('Get video metadata without downloading')
    .requiredOption('--source <source>', 'Local file path or URL')
    .option('--cookies <path>', 'Path to cookies.txt')
    .action(async (opts) => {
    const result = await (0, get_video_info_1.getVideoInfoTool)({ source: opts.source, cookies: opts.cookies });
    printContent(result);
    process.exit(0);
});
program
    .command('transcript')
    .description('Get existing captions/subtitles')
    .requiredOption('--source <source>', 'Local file path or URL')
    .option('--language <lang>', 'Language code e.g. "en"', 'en')
    .option('--format <format>', 'timestamped|plain|srt', 'timestamped')
    .option('--cookies <path>', 'Path to cookies.txt')
    .action(async (opts) => {
    const sessionDir = await (0, session_manager_1.createSessionDir)();
    const result = await (0, get_transcript_1.getTranscriptTool)({
        source: opts.source,
        language: opts.language,
        format: opts.format,
        cookies: opts.cookies,
    }, sessionDir);
    printContent(result);
    process.exit(0);
});
program
    .command('transcribe')
    .description('Transcribe audio using local Whisper')
    .requiredOption('--source <source>', 'Local file path or URL')
    .option('--language <lang>', 'Language code e.g. "en"')
    .option('--format <format>', 'timestamped|plain|srt', 'timestamped')
    .option('--start-time <time>', 'Start time')
    .option('--end-time <time>', 'End time')
    .option('--cookies <path>', 'Path to cookies.txt')
    .action(async (opts) => {
    const sessionDir = await (0, session_manager_1.createSessionDir)();
    const result = await (0, transcribe_audio_1.transcribeAudioTool)({
        source: opts.source,
        language: opts.language,
        format: opts.format,
        start_time: opts.startTime,
        end_time: opts.endTime,
        cookies: opts.cookies,
    }, sessionDir);
    printContent(result);
    process.exit(0);
});
program
    .command('cleanup')
    .description('Delete temporary session files')
    .requiredOption('--scope <scope>', 'job|session|all')
    .option('--job-id <id>', 'Job ID (required for scope=job)')
    .action(async (opts) => {
    const sessionDir = await (0, session_manager_1.createSessionDir)();
    const result = await (0, cleanup_1.cleanupTool)({
        scope: opts.scope,
        job_id: opts.jobId,
    }, sessionDir);
    printContent(result);
    process.exit(0);
});
program.parseAsync(process.argv);
//# sourceMappingURL=cli.js.map