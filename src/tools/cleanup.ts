import * as sessionManager from '../lib/session-manager';
import { join } from 'path';
import * as fs from 'fs/promises';
import { MCPContent } from '../types';

export async function cleanupTool(
  args: {
    scope: 'job' | 'session' | 'all';
    job_id?: string;
  },
  sessionDir: string
): Promise<MCPContent[]> {
  try {
    if (args.scope === 'job') {
      if (!args.job_id) {
        return [{ type: 'text', text: 'Error: job_id is required when scope is "job".' }];
      }
      const jobDir = join(sessionDir, 'jobs', args.job_id);
      const size = await sessionManager.getSessionSize(jobDir);
      await fs.rm(jobDir, { recursive: true, force: true });
      return [{ type: 'text', text: `Deleted job ${args.job_id}. Freed ~${(size / 1024 / 1024).toFixed(1)}MB` }];
    }

    if (args.scope === 'session') {
      const jobsDir = join(sessionDir, 'jobs');
      let totalSize = 0;
      let jobCount = 0;
      try {
        const entries = await fs.readdir(jobsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const jobDir = join(jobsDir, entry.name);
          totalSize += await sessionManager.getSessionSize(jobDir);
          await fs.rm(jobDir, { recursive: true, force: true });
          jobCount++;
        }
      } catch {
        // no jobs dir — nothing to delete
      }
      return [{ type: 'text', text: `Deleted ${jobCount} job(s) from current session. Freed ~${(totalSize / 1024 / 1024).toFixed(1)}MB` }];
    }

    if (args.scope === 'all') {
      await sessionManager.cleanupOldSessions(0);
      return [{ type: 'text', text: 'All sessions have been deleted.' }];
    }

    return [{ type: 'text', text: `Unknown scope: ${args.scope}` }];
  } catch (err: any) {
    return [{ type: 'text', text: `Error during cleanup: ${err.message}` }];
  }
}
