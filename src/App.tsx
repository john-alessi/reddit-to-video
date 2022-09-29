import { useEffect, useState } from 'react'
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg'

import { generateImage } from './ImageGeneration'
import { getThreadData } from './ThreadData'
import { MeSpeakNarrator, INarrator } from './Narration'

import './App.css'

const defaultUrl =
    'https://www.reddit.com/r/AskReddit/comments/xkrpev/comment/iphd4tt/?utm_source=share&utm_medium=web2x&context=3'

const ffmpeg = createFFmpeg({ log: true })
const narrator: INarrator = new MeSpeakNarrator()

export default function App(): JSX.Element {
    const [ready, setReady] = useState(false)
    const [video, setVideo] = useState<File | null>()
    const [outputVideo, setOutputVideo] = useState<string>()
    const [commentUrl, setCommentUrl] = useState(defaultUrl)

    const load = async () => {
        if (!ffmpeg.isLoaded()) {
            await ffmpeg.load()
        }
        setReady(true)
    }

    const generateVideo = async () => {
        var thread = await getThreadData(commentUrl)
        var timestamps: number[] = Array(thread.length + 1).fill(0)
        var command: string[] = ['-i', 'background_video.mp4']

        ffmpeg.FS(
            'writeFile',
            'background_video.mp4',
            await fetchFile(video as File),
        )

        for (let i = 0; i < thread.length; i++) {
            let imagePath = 'img_' + i + '.png'

            ffmpeg.FS(
                'writeFile',
                imagePath,
                await fetchFile(await generateImage(thread[i])),
            )

            command = command.concat('-i', imagePath)
        }

        for (let i = 0; i < thread.length; i++) {
            let audioPath = 'audio_' + i + '.wav'

            let audio = await narrator.narrate(thread[i])
            ffmpeg.FS('writeFile', audioPath, await fetchFile(audio.url))

            timestamps[i + 1] = timestamps[i] + audio.duration

            command = command.concat('-i', audioPath)
        }

        command = command.concat(
            '-filter_complex',
            getFilter(thread.length, timestamps),
            '-map',
            '[v' + thread.length + ']',
            '-map',
            '[concatAudio]',
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
    }

    useEffect(() => {
        load()
    }, [])

    return ready ? (
        <div className='App'>
            {video && (
                <video controls width='250' src={URL.createObjectURL(video)} />
            )}
            <input
                type='file'
                onChange={(e) => setVideo(e.target.files?.item(0))}
            />
            <input
                type='text'
                defaultValue={defaultUrl}
                onChange={(e) => setCommentUrl(e.target.value ?? '')}
            />
            <button onClick={generateVideo}>Generate Video</button>
            {outputVideo && <video controls width='250' src={outputVideo} />}
        </div>
    ) : (
        <p>loading...</p>
    )
}

function getFilter(numComments: number, timestamps: number[]): string {
    var filters: string[] = [
        "[0][1]overlay=x=50:y=50:enable='between(t," +
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
                "]overlay=x=50:y=50:enable='between(t," +
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
