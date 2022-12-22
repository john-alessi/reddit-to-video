import { createFFmpeg, fetchFile, FFmpeg } from '@ffmpeg/ffmpeg'

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
        this.instance.FS('writeFile', path, data)
    }

    async fetchAndWriteFile(path: string, data: string | File): Promise<void> {
        this.writeFile(path, await fetchFile(data))
    }

    async concatAudioOverInput(
        audioClips: string[],
        inputVideo: string,
        outputVideo: string,
    ): Promise<number[]> {
        let audioDurations: number[] = []
        let totalDuration = 0
        let loggedBgVideoDuration = false
        let audioCommand: string[] = ['-stream_loop', '-1', '-i', inputVideo]

        for (let i = 0; i < audioClips.length; i++) {
            let audioPath = 'audio_' + i + '.wav'
            await this.fetchAndWriteFile(audioPath, audioClips[i])
            audioCommand = audioCommand.concat('-i', audioPath)
        }

        var videoResizeFilter = [
            '[0:v]crop=in_h*9/16:in_h[cropped]',
            '[cropped]scale=720:1280[resized]',
        ].join(';')

        audioCommand = audioCommand.concat(
            '-filter_complex',
            videoResizeFilter,
            '-filter_complex',
            getAudiofilter(audioClips.length),
            '-map',
            '[resized]',
            '-map',
            '[concatAudio]',
            '-preset',
            'ultrafast',
            '-shortest',
            outputVideo,
        )

        this.setLogger(
            (progress: number) =>
                this.logProgress('stitching audio', progress / totalDuration),
            (duration: number) => {
                if (loggedBgVideoDuration) {
                    audioDurations = audioDurations.concat(duration)
                    totalDuration += duration
                } else {
                    loggedBgVideoDuration = true
                }
            },
        )

        await this.instance.run.apply(this.instance, audioCommand)
        return audioDurations
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
            this.setLogger((progress: number) =>
                this.logProgress(
                    `overlaying clip ${batch + 1}/${Math.ceil(
                        images.length / 10,
                    )}`,
                    progress /
                        (timestamps[start + numComments] - timestamps[start]),
                ),
            )
            await this.instance.run.apply(this.instance, command)
            batch++
        }

        this.setLogger((progress: number) =>
            this.logProgress(
                'stitching clips',
                progress / timestamps[timestamps.length - 1],
            ),
        )

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

    setLogger(
        progressCallback?: (timestamp: number) => void,
        durationCallback?: (duration: number) => void,
    ) {
        let durationRgx = /Duration: (\d\d:\d\d:\d\d\.\d\d)/
        let progressRgx = /time=(\d\d:\d\d:\d\d\.\d\d)/
        this.instance.setLogger(
            (logParams: { type: string; message: string }) => {
                if (
                    progressCallback &&
                    logParams.type == 'fferr' &&
                    progressRgx.test(logParams.message)
                ) {
                    let match = logParams.message.match(progressRgx)
                    if (match != null && match[1] != null) {
                        let hms = match[1].split(':')
                        let seconds =
                            60 * 60 * parseInt(hms[0], 10) +
                            60 * parseInt(hms[1], 10) +
                            parseFloat(hms[2])
                        progressCallback(seconds)
                    }
                }

                if (
                    durationCallback &&
                    logParams.type == 'fferr' &&
                    durationRgx.test(logParams.message)
                ) {
                    let match = logParams.message.match(durationRgx)
                    if (match != null && match[1] != null) {
                        let hms = match[1].split(':')
                        let seconds =
                            60 * 60 * parseInt(hms[0], 10) +
                            60 * parseInt(hms[1], 10) +
                            parseFloat(hms[2])
                        durationCallback(seconds)
                    }
                }
            },
        )
    }
}

function getAudiofilter(numComments: number): string {
    var audioFilter: string = ''

    for (let i = 0; i < numComments; i++) {
        audioFilter = audioFilter.concat('[' + (i + 1) + ':a]')
    }

    audioFilter = audioFilter.concat(
        'concat=n=' + numComments + ':a=1:v=0[concatAudio]',
    )

    return audioFilter
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
