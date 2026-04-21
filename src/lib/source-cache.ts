import { join } from 'path';
import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import { VIDEO_CACHE_DIR } from './session-manager';

// Videos cache for 7 days — independent of session cleanup (sessions die in 4h, cache lives on)
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CacheEntry {
  url: string;
  path: string;
  cached_at: number;
}

function urlToKey(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 24);
}

function metaPath(key: string): string {
  return join(VIDEO_CACHE_DIR, `${key}.json`);
}

function videoPath(key: string): string {
  return join(VIDEO_CACHE_DIR, `${key}.mp4`);
}

export async function findCachedVideo(url: string): Promise<string | null> {
  try {
    const key = urlToKey(url);
    const meta = JSON.parse(await fs.readFile(metaPath(key), 'utf-8')) as CacheEntry;

    // Stale?
    if (Date.now() - meta.cached_at > CACHE_TTL_MS) {
      await evict(key);
      return null;
    }

    // File still there?
    await fs.access(meta.path);
    return meta.path;
  } catch {
    return null;
  }
}

export async function cacheVideo(url: string, sourcePath: string): Promise<string> {
  await fs.mkdir(VIDEO_CACHE_DIR, { recursive: true });
  const key = urlToKey(url);
  const dest = videoPath(key);

  await fs.copyFile(sourcePath, dest);

  const entry: CacheEntry = { url, path: dest, cached_at: Date.now() };
  await fs.writeFile(metaPath(key), JSON.stringify(entry, null, 2));

  return dest;
}

async function evict(key: string): Promise<void> {
  await Promise.allSettled([
    fs.unlink(videoPath(key)),
    fs.unlink(metaPath(key)),
  ]);
}

export async function cleanupStaleCache(): Promise<void> {
  try {
    const files = await fs.readdir(VIDEO_CACHE_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    for (const f of jsonFiles) {
      try {
        const meta = JSON.parse(await fs.readFile(join(VIDEO_CACHE_DIR, f), 'utf-8')) as CacheEntry;
        if (Date.now() - meta.cached_at > CACHE_TTL_MS) {
          const key = f.replace('.json', '');
          await evict(key);
        }
      } catch { /* skip unreadable entries */ }
    }
  } catch { /* cache dir doesn't exist yet — fine */ }
}
