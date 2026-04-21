import * as ytdlp from '../lib/ytdlp';
import * as ffmpeg from '../lib/ffmpeg';
import { MCPContent } from '../types';

export async function getVideoInfoTool(args: { source: string; cookies?: string }): Promise<MCPContent[]> {
  try {
    let info;
    if (args.source.startsWith('http://') || args.source.startsWith('https://')) {
      info = await ytdlp.getVideoInfo(args.source, args.cookies);
    } else {
      info = await ffmpeg.getLocalVideoInfo(args.source);
    }
    return [{ type: 'text', text: JSON.stringify(info, null, 2) }];
  } catch (err: any) {
    return [{ type: 'text', text: `Error getting video info: ${err.message}` }];
  }
}
