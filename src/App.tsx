import { useEffect, useState } from 'react'
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg'

import { generateImage } from './ImageGeneration'
import { getThreadData } from './ThreadData'
import { INarrator, MeSpeakNarrator, UberduckNarrator } from './Narration'

import './App.css'

const defaultUrl =
    'https://www.reddit.com/r/interestingasfuck/comments/wiolan/comment/ijd09gb/?utm_source=share&utm_medium=web2x&context=3'

const ffmpeg = createFFmpeg({ log: true })
const narrator = new MeSpeakNarrator()
const voices = await narrator.getVoices()

export default function App(): JSX.Element {
    const [ready, setReady] = useState(false)
    const [video, setVideo] = useState<File | null>()
    const [outputVideo, setOutputVideo] = useState<string>()
    const [commentUrl, setCommentUrl] = useState(defaultUrl)
    const [currentVoice, setCurrentVoice] = useState(voices[0])
    const [statusMessage, setStatusMessage] = useState<string>()

    const load = async () => {
        if (!ffmpeg.isLoaded()) {
            await ffmpeg.load()
        }
        setReady(true)
    }

    const generateVideo = async () => {
        setStatusMessage('downloading comment thread...')
        var thread = await getThreadData(commentUrl)
        var timestamps: number[] = Array(thread.length + 1).fill(0)
        var command: string[] = [
            '-stream_loop',
            '-1',
            '-i',
            'background_video.mp4',
        ]

        ffmpeg.FS(
            'writeFile',
            'background_video.mp4',
            await fetchFile(video as File),
        )

        for (let i = 0; i < thread.length; i++) {
            setStatusMessage(`generating image ${i + 1}/${thread.length}`)
            let imagePath = 'img_' + i + '.png'

            ffmpeg.FS(
                'writeFile',
                imagePath,
                await fetchFile(await generateImage(thread[i])),
            )

            command = command.concat('-i', imagePath)
        }

        for (let i = 0; i < thread.length; i++) {
            setStatusMessage(`generating audio ${i + 1}/${thread.length}`)
            let audioPath = 'audio_' + i + '.wav'

            let audio = await narrator.narrate(thread[i], currentVoice)
            ffmpeg.FS('writeFile', audioPath, await fetchFile(audio.url))

            timestamps[i + 1] = timestamps[i] + audio.duration

            command = command.concat('-i', audioPath)
        }

        ffmpeg.setLogger((logParams: { type: string; message: string }) => {
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
                    setStatusMessage(
                        `encoding video (${(
                            (seconds / timestamps[thread.length]) *
                            100
                        ).toFixed(2)}%)`,
                    )
                }
            }
        })

        command = command.concat(
            '-filter_complex',
            getFilter(thread.length, timestamps),
            '-map',
            '[v' + thread.length + ']',
            '-map',
            '[concatAudio]',
            '-preset',
            'ultrafast',
            '-t',
            Math.ceil(timestamps[thread.length]).toString(),
            'output.mp4',
        )

        await ffmpeg.run.apply(ffmpeg, command)

        const data = ffmpeg.FS('readFile', 'output.mp4')
        const url = URL.createObjectURL(
            new Blob([data.buffer], { type: 'video/mp4' }),
        )
        setOutputVideo(url)

        setStatusMessage('')
    }

    useEffect(() => {
        load()
    }, [])

    return ready ? (
        <div className='App'>
            <h1>reddit to tiktok converter</h1>
            <div>
                <label>tts voice </label>
                <select
                    onChange={(e) => {
                        setCurrentVoice(e.target.value)
                    }}>
                    {voices.map((v) => (
                        <option value={v}>{v}</option>
                    ))}
                </select>
            </div>
            <div>
                <input
                    type='file'
                    onChange={(e) => setVideo(e.target.files?.item(0))}
                />
            </div>
            <div>
                <label>comment url </label>
                <input
                    type='text'
                    defaultValue={defaultUrl}
                    onChange={(e) => setCommentUrl(e.target.value ?? '')}
                />
            </div>
            <button onClick={generateVideo}>Generate Video</button>
            <p>{statusMessage}</p>
            {outputVideo && <video controls width='250' src={outputVideo} />}
        </div>
    ) : (
        <p>loading...</p>
    )
}

function getFilter(numComments: number, timestamps: number[]): string {
    var filters: string[] = [
        '[0:v]crop=in_h*9/16:in_h[cropped]',
        '[cropped]scale=720:1280[resized]',
        "[resized][1]overlay=x=(main_w-overlay_w)/2:y=(main_h-overlay_h)/2:enable='between(t," +
            timestamps[0] +
            ',' +
            timestamps[1] +
            ")'[v1]",
    ]

    for (let i = 1; i < numComments; i++) {
        filters = filters.concat(
            '[v' +
                i +
                ']' +
                '[' +
                (i + 1) +
                "]overlay=x=(main_w-overlay_w)/2:y=(main_h-overlay_h)/2:enable='between(t," +
                timestamps[i] +
                ',' +
                timestamps[i + 1] +
                ")'[v" +
                (i + 1) +
                ']',
        )
    }

    var audioFilter: string = ''
    for (let i = 0; i < numComments; i++) {
        audioFilter = audioFilter.concat('[' + (i + numComments + 1) + ':a]')
    }
    audioFilter = audioFilter.concat(
        'concat=n=' + numComments + ':a=1:v=0[concatAudio]',
    )
    filters = filters.concat(audioFilter)

    return filters.join(';')
}
