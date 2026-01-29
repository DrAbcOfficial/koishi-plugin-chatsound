import { Context, Schema, h } from 'koishi'
import { readdir } from 'fs/promises'
import { extname, join } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import SilkService from 'koishi-plugin-silk'

declare module 'koishi' {
  interface Context {
    silk: SilkService
  }
}

const execAsync = promisify(exec)

export const name = 'chatsound'
export const inject = {
  required: ['silk']
}

export interface Config {
  soundPath: string[],
  defaultPitch: number,
  minPitch: number,
  maxPitch: number,
  audioType: "mp3" | "silk"
}

export const Config: Schema<Config> = Schema.object({
  soundPath: Schema.array(Schema.string()).description("用于搜索的音频路径"),
  defaultPitch: Schema.number().default(100).description("默认的语音音调（百分比）"),
  minPitch: Schema.number().default(80).min(0).description("最小Pitch，不小于0"),
  maxPitch: Schema.number().default(200).description("最大Pitch"),
  audioType: Schema.union(["mp3", "silk"]).default("mp3").description("最终发送的类型，QQ及微信选择SILK")
});

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac']

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

async function applyPitch(inputPath: string, pitch: number, audioType: "mp3" | "silk"): Promise<{ data: Buffer, mimeType: string }> {
  const pitchFactor = pitch / 100
  
  if (audioType === "mp3") {
    const command = `ffmpeg -i "${inputPath}" -filter:a "asetrate=44100*${pitchFactor},aresample=44100" -f mp3 -`
    const { stdout } = await execAsync(command)
    return { data: Buffer.from(stdout), mimeType: 'audio/mp3' }
  } else {
    // For silk, we need to generate PCM first
    const command = `ffmpeg -i "${inputPath}" -filter:a "asetrate=44100*${pitchFactor},aresample=24000" -f s16le -ac 1 -ar 24000 -`
    const { stdout } = await execAsync(command)
    return { data: Buffer.from(stdout), mimeType: 'audio/pcm' }
  }
}

export function apply(ctx: Context, config: Config) {
  ctx.command('v <trigger:string> [pitch:number]')
  .action(async ({ session }, trigger, pitch) => {
    if (!trigger) {
      return '至少给个名字吧大王'
    }

    const actualPitch =  Math.min(Math.max(pitch ?? config.defaultPitch, config.minPitch), config.maxPitch);
    const audioPath = await findAudioFile(trigger, config.soundPath)
    if (!audioPath) {
      return `没有这种音频`
    }

    try {
      const { data, mimeType } = await applyPitch(audioPath, actualPitch, config.audioType)
      if (config.audioType === 'silk') {
        // Encode PCM to silk using the silk service
        const silkResult = await ctx.silk.encode(data, 24000)
        await session.send(h.audio(silkResult.data, 'audio/silk'))
      } else {
        await session.send(h.audio(data, mimeType))
      }
    } catch (error) {
      ctx.logger.error('发送音频失败:', error)
      return '发送音频失败'
    }
  })
}
