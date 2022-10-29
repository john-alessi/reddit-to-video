import { useEffect, useState } from 'react'
import { FfmpegHelper, SequentialImageOverlay } from './FfmpegHelper'

import { generateImage } from './ImageGeneration'
import { getThreadData } from './ThreadData'
import {
    Audio,
    INarrator,
    MeSpeakNarrator,
    UberduckNarrator,
} from './Narration'

import './App.css'

const defaultUrl =
    'https://www.reddit.com/r/interestingasfuck/comments/wiolan/comment/ijd09gb/?utm_source=share&utm_medium=web2x&context=3'

const ffmpeg = new FfmpegHelper()
const narrator = new MeSpeakNarrator()

const BG_VID_PATH = 'output.mp4'

export default function App(): JSX.Element {
    const [ready, setReady] = useState(false)
    const [video, setVideo] = useState<File | null>()
    const [outputVideo, setOutputVideo] = useState<string>()
    const [commentUrl, setCommentUrl] = useState(defaultUrl)
    const [voices, setVoices] = useState<string[]>([])
    const [currentVoice, setCurrentVoice] = useState(voices[0])
    const [statusMessage, setStatusMessage] = useState<string>()

    const load = async () => {
        await ffmpeg.init((description, progress) => {
            setStatusMessage(`${description} (${(progress * 100).toFixed(2)}%)`)
        })
        setVoices(await narrator.getVoices())
        setReady(true)
    }

    const generateVideo = async () => {
        setStatusMessage('downloading comment thread...')
        let thread = await getThreadData(commentUrl)
        let imageOverlays: SequentialImageOverlay[] = []
        let audioClips: Audio[] = []

        await ffmpeg.fetchAndWriteFile('background_video.mp4', video as File)

        for (let i = 0; i < thread.length; i++) {
            setStatusMessage(`generating audio ${i + 1}/${thread.length}`)
            let audio = await narrator.narrate(thread[i], currentVoice)
            audioClips = audioClips.concat(audio)
        }

        for (let i = 0; i < thread.length; i++) {
            setStatusMessage(`generating image ${i + 1}/${thread.length}`)
            imageOverlays = imageOverlays.concat({
                imageUrl: await generateImage(thread[i]),
                duration: audioClips[i].duration,
            })
        }

        await ffmpeg.concatAudioOverInput(
            audioClips,
            'background_video.mp4',
            BG_VID_PATH,
        )

        await ffmpeg.renderSequentialImageOverlay(
            BG_VID_PATH,
            'final_output.mp4',
            imageOverlays,
        )

        const data = ffmpeg.readFile('final_output.mp4')
        const url = URL.createObjectURL(
            new Blob([data.buffer], { type: 'video/mp4' }),
        )
        setOutputVideo(url)

        setStatusMessage('')
    }

    useEffect(() => {
        load()
    }, [])

    return (
        <div className='App'>
            <h1>reddit to tiktok converter</h1>
            <div>
                <label>tts voice </label>
                <input
                    list='voices'
                    spellCheck='false'
                    onChange={(e) => {
                        setCurrentVoice(e.target.value)
                    }}
                />
                <datalist id='voices'>
                    {voices.map((v) => (
                        <option value={v}>{v}</option>
                    ))}
                </datalist>
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
            <button onClick={generateVideo} disabled={!ready || !video}>
                Generate Video
            </button>
            <p>{statusMessage}</p>
            {outputVideo && <video controls width='250' src={outputVideo} />}
        </div>
    )
}
