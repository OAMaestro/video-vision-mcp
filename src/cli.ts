import { Command } from 'commander';
import { createSessionDir } from './lib/session-manager';
import { analyzeVideoTool } from './tools/analyze-video';
import { extractFramesTool } from './tools/extract-frames';
import { getVideoInfoTool } from './tools/get-video-info';
import { getTranscriptTool } from './tools/get-transcript';
import { transcribeAudioTool } from './tools/transcribe-audio';
import { cleanupTool } from './tools/cleanup';
import { MCPContent } from './types';

function printContent(result: MCPContent[]): void {
  for (const item of result) {
    if (item.type === 'text') {
      console.log(item.text);
    } else {
      console.log('[Image content — use MCP client to view]');
    }
  }
}

const program = new Command();
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
    const sessionDir = await createSessionDir();
    const result = await analyzeVideoTool(
      {
        source: opts.source,
        query: opts.query,
        mode: opts.mode,
        start_time: opts.startTime,
        end_time: opts.endTime,
        cookies: opts.cookies,
        max_frames: opts.maxFrames,
      },
      sessionDir
    );
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
    const sessionDir = await createSessionDir();
    const result = await extractFramesTool(
      {
        source: opts.source,
        mode: opts.mode,
        fps: opts.fps,
        scene_threshold: opts.sceneThreshold,
        max_frames: opts.maxFrames,
        output_dir: opts.outputDir,
        start_time: opts.startTime,
        end_time: opts.endTime,
        cookies: opts.cookies,
      },
      sessionDir
    );
    printContent(result);
    process.exit(0);
  });

program
  .command('info')
  .description('Get video metadata without downloading')
  .requiredOption('--source <source>', 'Local file path or URL')
  .option('--cookies <path>', 'Path to cookies.txt')
  .action(async (opts) => {
    const result = await getVideoInfoTool({ source: opts.source, cookies: opts.cookies });
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
    const sessionDir = await createSessionDir();
    const result = await getTranscriptTool(
      {
        source: opts.source,
        language: opts.language,
        format: opts.format as 'timestamped' | 'plain' | 'srt',
        cookies: opts.cookies,
      },
      sessionDir
    );
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
    const sessionDir = await createSessionDir();
    const result = await transcribeAudioTool(
      {
        source: opts.source,
        language: opts.language,
        format: opts.format as 'timestamped' | 'plain' | 'srt',
        start_time: opts.startTime,
        end_time: opts.endTime,
        cookies: opts.cookies,
      },
      sessionDir
    );
    printContent(result);
    process.exit(0);
  });

program
  .command('cleanup')
  .description('Delete temporary session files')
  .requiredOption('--scope <scope>', 'job|session|all')
  .option('--job-id <id>', 'Job ID (required for scope=job)')
  .action(async (opts) => {
    const sessionDir = await createSessionDir();
    const result = await cleanupTool(
      {
        scope: opts.scope as 'job' | 'session' | 'all',
        job_id: opts.jobId,
      },
      sessionDir
    );
    printContent(result);
    process.exit(0);
  });

program.parseAsync(process.argv);
