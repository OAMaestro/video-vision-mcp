export interface VideoInfo {
  title?: string;
  duration: string;           // "HH:MM:SS"
  duration_seconds: number;
  fps: number;
  resolution: string;         // "1920x1080"
  format: string;
  estimated_download_mb?: number;
  has_subtitles: boolean;
  subtitle_languages?: string[];
  uploader?: string;
  upload_date?: string;
}

export interface FrameInfo {
  path: string;
  timestamp: string;          // "HH:MM:SS"
  timestamp_seconds: number;
  frame_number: number;
}

export interface ExtractionOptions {
  mode: 'scene' | 'interval' | 'keyframe' | 'targeted' | 'overview';
  fps?: number;
  scene_threshold?: number;
  timestamps?: string[];
  max_frames?: number;
  start_time?: string;
  end_time?: string;
  max_width?: number;
  overlay_timestamp?: boolean;
  durationSeconds?: number;   // Required for overview mode to calculate interval
  gap_fill_interval?: number; // For scene mode: extract fill frames in any gap larger than this (seconds)
}

export interface GridResult {
  path: string;
  rows: number;
  columns: number;
  frame_count: number;
  time_start: string;
  time_end: string;
}

export interface SessionInfo {
  session_id: string;
  session_dir: string;
  started_at: string;
}

export interface JobInfo {
  job_id: string;
  job_dir: string;
  source: string;
  source_type: 'local' | 'remote';
  created_at: string;
  cached_video_path?: string;
}

export interface TranscriptChunk {
  timestamp: [number, number];  // [startSeconds, endSeconds]
  text: string;
}

export interface TranscriptResult {
  text: string;
  chunks: TranscriptChunk[];
}

export interface PreflightResult {
  ok: boolean;
  warning?: string;
  error?: string;
}

export type MCPTextContent = { type: 'text'; text: string };
export type MCPImageContent = { type: 'image'; data: string; mimeType: string };
export type MCPContent = MCPTextContent | MCPImageContent;
