import { createFFmpeg, fetchFile, FFmpeg } from '@ffmpeg/ffmpeg'
import { Audio } from './Narration'

export interface SequentialImageOverlay {
    imageUrl: string
    duration: number
}

export class FfmpegHelper {
    private instance: FFmpeg
    private logProgress = (description: string, progress: number) => {}

    constructor() {
        this.instance = createFFmpeg({ log: true })
    }

    async init(logProgress?: (description: string, progress: number) => void) {
        if (!this.instance.isLoaded()) {
            await this.instance.load()
        }
        if (logProgress) {
            this.logProgress = logProgress
        }
    }

    readFile(path: string): Uint8Array {
        return this.instance.FS('readFile', path)
    }

    writeFile(path: string, data: string | Uint8Array): void {
        return this.instance.FS('writeFile', path, data)
    }

    async fetchAndWriteFile(path: string, data: File): Promise<void> {
        return this.writeFile(path, await fetchFile(data))
    }

    async concatAudioOverInput(
        audioClips: Audio[],
        inputVideo: string,
        outputVideo: string,
    ) {
        let audioCommand: string[] = ['-stream_loop', '-1', '-i', inputVideo]
        let totalDuration = audioClips
            .map((a) => a.duration)
            .reduce((a, b) => a + b)
        for (let i = 0; i < audioClips.length; i++) {
            let audioPath = 'audio_' + i + '.wav'
            audioCommand = audioCommand.concat('-i', audioPath)
            this.writeFile(audioPath, await fetchFile(audioClips[i].url))
        }
        audioCommand = audioCommand.concat(
            '-filter_complex',
            getAudiofilter(audioClips.length),
            '-map',
            '[resized]',
            '-map',
            '[concatAudio]',
            '-preset',
            'ultrafast',
            '-t',
            Math.ceil(totalDuration).toString(),
            outputVideo,
        )
        this.setLogger('adding audio', totalDuration)
        await this.instance.run.apply(this.instance, audioCommand)
    }

    async renderSequentialImageOverlay(
        inputVideo: string,
        outputVideo: string,
        images: SequentialImageOverlay[],
    ): Promise<void> {
        var timestamps: number[] = Array(images.length + 1).fill(0)
        for (let i = 0; i < images.length; i++) {
            timestamps[i + 1] = timestamps[i] + images[i].duration
            let imagePath = 'img_' + i + '.png'

            this.writeFile(imagePath, await fetchFile(images[i].imageUrl))
        }

        let batch = 0
        while (batch * 10 < images.length) {
            let start = batch * 10
            let numComments = Math.min(10, images.length - start)
            let command = getOverlayCommand(
                start,
                numComments,
                timestamps,
                inputVideo,
                'out_' + batch + '.mp4',
            )
            this.setLogger(
                `overlaying clip ${batch + 1}/${Math.ceil(images.length / 10)}`,
                timestamps[start + numComments] - timestamps[start],
            )
            await this.instance.run.apply(this.instance, command)
            batch++
        }

        this.setLogger('stitching clips', timestamps[timestamps.length - 1])

        let concatInputs: string[] = []
        for (let i = 0; i < batch; i++) {
            concatInputs = concatInputs.concat('file out_' + i + '.mp4')
        }
        this.writeFile('concatList.txt', concatInputs.join('\n'))
        await this.instance.run(
            '-f',
            'concat',
            '-safe',
            '0',
            '-i',
            'concatList.txt',
            '-c',
            'copy',
            outputVideo,
        )
    }

    setLogger(description: string, totalDuration: number) {
        this.instance.setLogger(
            (logParams: { type: string; message: string }) => {
                if (
                    logParams.type == 'fferr' &&
                    /time=(\d\d:\d\d:\d\d\.\d\d)/.test(logParams.message)
                ) {
                    let match = logParams.message.match(
                        /time=(\d\d:\d\d:\d\d\.\d\d)/,
                    )
                    if (match != null && match[1] != null) {
                        let hms = match[1].split(':')
                        let seconds =
                            60 * 60 * parseInt(hms[0], 10) +
                            60 * parseInt(hms[1], 10) +
                            parseFloat(hms[2])
                        this.logProgress(description, seconds / totalDuration)
                    }
                }
            },
        )
    }
}

function getAudiofilter(numComments: number): string {
    var filters: string[] = [
        '[0:v]crop=in_h*9/16:in_h[cropped]',
        '[cropped]scale=720:1280[resized]',
    ]

    var audioFilter: string = ''
    for (let i = 0; i < numComments; i++) {
        audioFilter = audioFilter.concat('[' + (i + 1) + ':a]')
    }
    audioFilter = audioFilter.concat(
        'concat=n=' + numComments + ':a=1:v=0[concatAudio]',
    )
    filters = filters.concat(audioFilter)

    return filters.join(';')
}

function getOverlayCommand(
    start: number,
    numComments: number,
    timestamps: number[],
    inputVideo: string,
    outputName: string,
): string[] {
    let command: string[] = [
        '-ss',
        timestamps[start].toString(),
        '-to',
        timestamps[start + numComments].toString(),
        '-i',
        inputVideo,
    ]
    let filters: string[] = []
    for (let i = 0; i < numComments; i++) {
        command = command.concat('-i', 'img_' + (start + i) + '.png')
        filters = filters.concat(
            '[' +
                (i == 0 ? '' : 'v') +
                i +
                ']' +
                '[' +
                (i + 1) +
                "]overlay=x=(main_w-overlay_w)/2:y=(main_h-overlay_h)/2:enable='between(t," +
                (timestamps[start + i] - timestamps[start]) +
                ',' +
                (timestamps[start + i + 1] - timestamps[start]) +
                ")'[v" +
                (i + 1) +
                ']',
        )
    }
    command = command.concat(
        '-filter_complex',
        filters.join(';'),
        '-map',
        '[v' + numComments + ']',
        '-map',
        '0:a',
        '-preset',
        'ultrafast',
        outputName,
    )
    return command
}
