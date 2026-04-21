import { join } from 'path';
import { homedir } from 'os';
import * as fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

export const OAMAESTRO_DIR = join(homedir(), '.oamaestro');
export const SESSIONS_DIR = join(OAMAESTRO_DIR, 'sessions');
export const BIN_DIR = join(OAMAESTRO_DIR, 'bin');
export const MODELS_DIR = join(OAMAESTRO_DIR, 'models');
// Video cache lives outside sessions so it survives the 4-hour session cleanup
export const VIDEO_CACHE_DIR = join(OAMAESTRO_DIR, 'video-cache');

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function createSessionDir(): Promise<string> {
  await ensureDir(SESSIONS_DIR);
  const sessionId = uuidv4();
  const sessionDir = join(SESSIONS_DIR, sessionId);
  await ensureDir(sessionDir);
  const now = new Date().toISOString();
  await fs.writeFile(
    join(sessionDir, 'session.json'),
    JSON.stringify({ started_at: now, last_active_at: now }, null, 2)
  );
  return sessionDir;
}

export async function createJobDir(sessionDir: string): Promise<string> {
  const jobId = uuidv4();
  const jobDir = join(sessionDir, 'jobs', jobId);
  await ensureDir(jobDir);
  await ensureDir(join(jobDir, 'frames'));
  await fs.writeFile(
    join(jobDir, 'manifest.json'),
    JSON.stringify({
      source: '',
      source_type: 'local',
      created_at: new Date().toISOString(),
    }, null, 2)
  );
  return jobDir;
}

export async function updateJobManifest(jobDir: string, data: Record<string, unknown>): Promise<void> {
  const manifestPath = join(jobDir, 'manifest.json');
  let existing: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(manifestPath, 'utf-8');
    existing = JSON.parse(raw);
  } catch {
    // ignore — will create fresh
  }
  await fs.writeFile(manifestPath, JSON.stringify({ ...existing, ...data }, null, 2));
}

export async function cleanupSession(sessionDir: string): Promise<void> {
  try {
    const sizeBefore = await getSessionSize(sessionDir);
    await fs.rm(sessionDir, { recursive: true, force: true });
    const mb = (sizeBefore / 1024 / 1024).toFixed(1);
    process.stderr.write(`[session-manager] Cleaned session ${sessionDir} — freed ~${mb}MB\n`);
  } catch (err) {
    process.stderr.write(`[session-manager] Failed to clean session: ${err}\n`);
  }
}

export async function cleanupOldSessions(maxAgeMs = 4 * 60 * 60 * 1000): Promise<void> {
  try {
    await ensureDir(SESSIONS_DIR);
    const entries = await fs.readdir(SESSIONS_DIR, { withFileTypes: true });
    const now = Date.now();
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const sessionDir = join(SESSIONS_DIR, entry.name);
      const sessionJsonPath = join(sessionDir, 'session.json');
      try {
        const raw = await fs.readFile(sessionJsonPath, 'utf-8');
        const parsed = JSON.parse(raw) as { started_at: string };
        const age = now - new Date(parsed.started_at).getTime();
        if (age > maxAgeMs) {
          await fs.rm(sessionDir, { recursive: true, force: true });
          process.stderr.write(`[session-manager] Removed old session ${entry.name} (age: ${Math.round(age / 3600000)}h)\n`);
        }
      } catch {
        // Can't read manifest — skip
      }
    }
  } catch {
    // Sessions dir doesn't exist yet — fine
  }
}

export async function getSessionSize(sessionDir: string): Promise<number> {
  let total = 0;
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        try {
          const stat = await fs.stat(full);
          total += stat.size;
        } catch {
          // ignore
        }
      }
    }
  }
  await walk(sessionDir);
  return total;
}
