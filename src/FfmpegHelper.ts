import { createFFmpeg, fetchFile, FFmpeg } from '@ffmpeg/ffmpeg'

export interface SequentialImageOverlay {
    imageUrl: string
    duration: number
}

export class FfmpegHelper {
    public instance: FFmpeg
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

    async renderSequentialImageOverlay(
        inputVideo: string,
        outputVideo: string,
        images: SequentialImageOverlay[],
    ): Promise<void> {
        var timestamps: number[] = Array(images.length + 1).fill(0)
        for (let i = 0; i < images.length; i++) {
            timestamps[i + 1] = timestamps[i] + images[i].duration
            let imagePath = 'img_' + i + '.png'

            this.instance.FS(
                'writeFile',
                imagePath,
                await fetchFile(images[i].imageUrl),
            )
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
                `overlaying batch ${batch + 1}/${Math.ceil(
                    images.length / 10,
                )}`,
                timestamps[start + numComments] - timestamps[start],
            )
            await this.instance.run.apply(this.instance, command)
            batch++
        }

        let concatInputs: string[] = []
        for (let i = 0; i < batch; i++) {
            concatInputs = concatInputs.concat('file out_' + i + '.mp4')
        }
        this.instance.FS('writeFile', 'concatList.txt', concatInputs.join('\n'))
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
