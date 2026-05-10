import assert from 'node:assert/strict';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const ffmpeg = require('@ffmpeg-installer/ffmpeg');

test('overview extraction writes timestamped frames on macOS ffmpeg builds', async () => {
  const workDir = await mkdtemp(join(tmpdir(), 'video-vision-extract-'));
  const source = join(workDir, 'sample.mp4');
  const framesDir = join(workDir, 'frames');

  await execFileAsync(ffmpeg.path, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=duration=3:size=320x180:rate=10',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=1000:duration=3',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    source,
  ]);

  const { stdout } = await execFileAsync('node', [
    'dist/cli.js',
    'extract',
    '--source',
    source,
    '--mode',
    'overview',
    '--output-dir',
    framesDir,
  ]);

  const extracted = await readdir(framesDir);
  assert.match(stdout, /"timestamp": "00:00:00"/);
  assert.ok(
    extracted.some((name) => /^frame_\d{4}_\d{2}-\d{2}-\d{2}\.jpg$/.test(name)),
    `expected timestamped frame output, got: ${extracted.join(', ')}`
  );
});
