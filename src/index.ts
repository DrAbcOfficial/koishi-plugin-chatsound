import { Context, Schema, h } from 'koishi'
import { readdir } from 'fs/promises'
import { extname, join } from 'path'
import { spawn } from 'child_process'
import SilkService from 'koishi-plugin-silk'

declare module 'koishi' {
  interface Context {
    silk: SilkService
  }
}

export const name = 'chatsound'
export const inject = {
  optional: ['silk']
}

export interface Config {
  soundPath: string[],
  defaultPitch: number,
  minPitch: number,
  maxPitch: number,
  keepSoundLength: boolean,
  audioType: "mp3" | "silk"
}

export const Config: Schema<Config> = Schema.object({
  soundPath: Schema.array(Schema.string()).description("用于搜索音频的*绝对*路径，支持搜索mp3 wav ogg flac m4a aac格式"),
  defaultPitch: Schema.number().default(100).description("默认的语音音调（百分比）"),
  minPitch: Schema.number().default(80).min(0).description("最小Pitch，不小于0"),
  maxPitch: Schema.number().default(200).description("最大Pitch"),
  keepSoundLength: Schema.boolean().default(false).description("保持音频播放长度，仅进行  变调"),
  audioType: Schema.union(["mp3", "silk"]).default("mp3").description("最终发送的类型，QQ及微信选择SILK")
});

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac'];

let ffmpegAvailable: boolean | null = null;
let ffmpegCheckPromise: Promise<boolean> | null = null;
async function checkFFmpeg(): Promise<boolean> {
  if (ffmpegAvailable !== null)
    return ffmpegAvailable;
  if (ffmpegCheckPromise)
    return ffmpegCheckPromise;

  ffmpegCheckPromise = new Promise((resolve) => {
    const { spawn } = require('child_process');
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    }, 3000);

    try {
      const ffmpeg = spawn('ffmpeg', ['-version']);
      ffmpeg.on('error', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(false);
        }
      });
      ffmpeg.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(code === 0);
        }
      });
    }
    catch {
      clearTimeout(timeout);
      resolve(false);
    }
  }).then(result => {
    ffmpegAvailable = result as boolean;
    return result;
  }) as Promise<boolean>;

  return ffmpegCheckPromise;
}

async function findAudioFile(trigger: string, soundPaths: string[]): Promise<string | null> {
  for (const basePath of soundPaths) {
    try {
      const files = await readdir(basePath)
      for (const file of files) {
        const ext = extname(file).toLowerCase()
        if (AUDIO_EXTENSIONS.includes(ext)) {
          const nameWithoutExt = file.slice(0, -ext.length)
          if (nameWithoutExt === trigger) {
            return join(basePath, file)
          }
        }
      }
    } catch (error) {
      continue
    }
  }
  return null
}


async function getSampleRate(audioPath: string): Promise<number> {
  const { spawn } = require('child_process');
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=sample_rate',
      '-of', 'default=nw=1:nk=1',
      audioPath
    ]);
    let output = '';
    const stderrChunks: Buffer[] = [];
    ffprobe.stdout.on('data', (data) => output += data.toString());
    ffprobe.stderr.on('data', (data) => {
      stderrChunks.push(data);
    });
    ffprobe.on('close', (code) => {
      if (code === 0) {
        const rate = parseInt(output.trim(), 10);
        if (isNaN(rate)) {
          reject(new Error('Failed to parse sample rate'));
        } else {
          resolve(rate);
        }
      } else {
        const stderrOutput = Buffer.concat(stderrChunks).toString('utf8').trim();
        reject(new Error(`ffprobe error: ${stderrOutput}, code ${code}`));
      }
    });
    ffprobe.on('error', reject);
  });
}

async function runFFmpeg(commandArgs: string[], ctx:Context): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', commandArgs);
    const chunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    ffmpeg.stdout.on('data', (chunk) => chunks.push(chunk));
    ffmpeg.stderr.on('data', (chunk) => stderrChunks.push(chunk));
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        const stderrOutput = Buffer.concat(stderrChunks).toString('utf8').trim();
        ctx.logger.error('FFmpeg stderr output:', stderrOutput);
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
    ffmpeg.on('error', reject);
  });
}

async function applyPitch(ctx: Context, inputPath: string, pitch: number, audioType: "mp3" | "silk", keepSoundLength: boolean): Promise<{ data: Buffer, mimeType: string }> {
  const pitchFactor = pitch / 100;

  let args = [
    '-i', inputPath,
    '-vn', '-sn', '-dn',
    '-y'
  ];

  if (keepSoundLength) {
    args.push('-af', `rubberband=pitch=${pitchFactor}`);
  } else {
    const originalRate = await getSampleRate(inputPath);
    const targetRate = Math.round(originalRate * pitchFactor);
    args.push('-af', `asetrate=${targetRate}`);
  }

  if (audioType === "mp3") {
    args.push('-f', 'mp3', 'pipe:1');
    const data = await runFFmpeg(args, ctx);
    return { data, mimeType: 'audio/mp3' };
  } else {
    args.push();
    args.push('-ar', '24000', '-ac', '1', 
              '-f', 's16le', 'pipe:1');
    const data = await runFFmpeg(args, ctx);
    return { data, mimeType: 'audio/pcm' };
  }
}

export function apply(ctx: Context, config: Config) {
  checkFFmpeg().then(available => {
    if (!available) {
      ctx.logger.warn('FFmpeg not found! Audio processing will fail.');
    } else {
      ctx.logger.debug('FFmpeg is available.');
    }
  });

  ctx.command('v <trigger:string> [pitch:number] 发送一个噪音')
    .action(async ({ session }, trigger, pitch) => {
      if (!trigger) {
        return '至少给个名字吧大王'
      }
      const actualPitch = Math.min(Math.max(pitch ?? config.defaultPitch, config.minPitch), config.maxPitch);
      const audioPath = await findAudioFile(trigger, config.soundPath)
      if (!audioPath) {
        return `没有这种音频`
      }
      try {
        const { data, mimeType } = await applyPitch(ctx,audioPath, actualPitch, config.audioType, config.keepSoundLength)
        if (config.audioType === 'silk') {
          if (ctx.silk) {
            // Encode PCM to silk using the silk service
            const silkResult = await ctx.silk.encode(data, 24000)
            await session.send(h.audio(silkResult.data, 'audio/silk'))
          }
          else {
            return '没有安装必要的SILK插件'
          }
        }
        else {
          await session.send(h.audio(data, mimeType))
        }
      }
      catch (error) {
        ctx.logger.error('发送音频失败:', error)
        return '发送音频失败'
      }
    })
}
