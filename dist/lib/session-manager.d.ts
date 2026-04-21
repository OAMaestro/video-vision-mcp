export declare const OAMAESTRO_DIR: string;
export declare const SESSIONS_DIR: string;
export declare const BIN_DIR: string;
export declare const MODELS_DIR: string;
export declare const VIDEO_CACHE_DIR: string;
export declare function createSessionDir(): Promise<string>;
export declare function createJobDir(sessionDir: string): Promise<string>;
export declare function updateJobManifest(jobDir: string, data: Record<string, unknown>): Promise<void>;
export declare function cleanupSession(sessionDir: string): Promise<void>;
export declare function cleanupOldSessions(maxAgeMs?: number): Promise<void>;
export declare function getSessionSize(sessionDir: string): Promise<number>;
//# sourceMappingURL=session-manager.d.ts.map