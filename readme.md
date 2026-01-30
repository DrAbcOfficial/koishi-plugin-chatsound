# koishi-plugin-chatsound

[![npm](https://img.shields.io/npm/v/koishi-plugin-chatsound)](https://www.npmjs.com/package/koishi-plugin-chatsound)
[![license](https://img.shields.io/npm/l/koishi-plugin-chatsound)](https://github.com/DrAbcOfficial/koishi-plugin-chatsound)

一个 Koishi 插件，用于发送预定的音频文件，支持音调调整。

## 功能特性

- 支持多种音频格式：MP3、WAV、OGG、FLAC、M4A、AAC
- 可调整音频音调（Pitch）
- 支持两种输出格式：MP3 和 SILK（适用于 QQ 和微信）
- 可选择是否保持音频播放时长

## 安装

在 Koishi 控制台中安装：

```
npm install koishi-plugin-chatsound
```

## 依赖

- **FFmpeg**及**FFprobe**：必须安装并配置到系统 PATH 中
```
ffmpeg -v
ffprobe -v
```
- **koishi-plugin-silk**（可选）：如需使用 SILK 格式输出

## 配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| soundPath | string[] | - | 用于搜索音频的绝对路径，支持 mp3/wav/ogg/flac/m4a/aac 格式 |
| defaultPitch | number | 100 | 默认的语音音调（百分比） |
| minPitch | number | 80 | 最小 Pitch，不小于 0 |
| maxPitch | number | 200 | 最大 Pitch |
| keepSoundLength | boolean | false | 保持音频播放长度，仅进行变调 |
| audioType | "mp3" \| "silk" | "mp3" | 最终发送的类型，QQ 及微信选择 SILK |

## 使用方法

### 命令

```
v <trigger:string> [pitch:number]
```

发送一个噪音文件。

- `trigger`：音频文件名（不含扩展名）
- `pitch`（可选）：音调调整百分比，默认使用配置中的 defaultPitch

### 示例

假设在配置的 soundPath 目录下有一个名为 `hello.mp3` 的文件：

```
v hello
```

发送 hello.mp3，使用默认音调。

```
v hello 150
```

发送 hello.mp3，音调调整为 150%。

## 音调调整说明

- **keepSoundLength = false**（默认）：通过改变采样率来调整音调，音频播放速度也会随之改变
- **keepSoundLength = true**：使用 rubberband 滤镜仅调整音调，保持音频播放时长不变（需要 FFmpeg 编译时启用 rubberband 支持）

## 注意事项

1. 确保 FFmpeg 已正确安装并可在命令行中使用
2. 音频文件名即为触发词，不包含扩展名
3. 使用 SILK 格式时需要安装 koishi-plugin-silk 插件

## 许可证

MIT

## 链接

- [GitHub](https://github.com/DrAbcOfficial/koishi-plugin-chatsound)
- [NPM](https://www.npmjs.com/package/koishi-plugin-chatsound)
