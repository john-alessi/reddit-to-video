import { useEffect, useState } from 'react'
import { FfmpegHelper, SequentialImageOverlay } from './FfmpegHelper'

import { generateImage } from './ImageGeneration'
import { getThreadData } from './ThreadData'
import { INarrator, MeSpeakNarrator, UberduckNarrator } from './Narration'

import './App.css'
import { AuthProvider, TAuthConfig } from 'react-oauth2-code-pkce'

const defaultUrl =
    'https://www.reddit.com/r/interestingasfuck/comments/wiolan/comment/ijd09gb/?utm_source=share&utm_medium=web2x&context=3'

const uberduckOidConfigUrl =
    'https://corsproxy.azure-api.net/openid-configuration'

const uberduckClientId = 'CLIENT_ID'

const ffmpeg = new FfmpegHelper()
const meSpeakNarrator = new MeSpeakNarrator()
const uberduckNarrator = new UberduckNarrator()

const BG_VID_PATH = 'output.mp4'

export default function App(): JSX.Element {
    const [ready, setReady] = useState(false)
    const [video, setVideo] = useState<File | null>()
    const [outputVideo, setOutputVideo] = useState<string>()
    const [outputVideoFile, setOutputVideoFile] = useState<File | null>()
    const [commentUrl, setCommentUrl] = useState(defaultUrl)
    const [voices, setVoices] = useState<string[]>([])
    const [currentVoice, setCurrentVoice] = useState(voices[0])
    const [statusMessage, setStatusMessage] = useState<string>()
    const [narrator, setNarrator] = useState<INarrator>(meSpeakNarrator)
    const [uberduckAuthConfig, setUberduckAuthConfig] = useState<TAuthConfig>()

    const load = async () => {
        await ffmpeg.init((description, progress) => {
            setStatusMessage(`${description} (${(progress * 100).toFixed(2)}%)`)
        })
        setVoices(await narrator.getVoices())
        setUberduckAuthConfig(
            await getAuthConfig(uberduckClientId, uberduckOidConfigUrl),
        )
        setReady(true)
    }

    const generateVideo = async () => {
        setStatusMessage('downloading comment thread...')
        let thread = await getThreadData(commentUrl)
        let imageOverlays: SequentialImageOverlay[] = []
        let audioClips: string[] = []

        await ffmpeg.fetchAndWriteFile('background_video.mp4', video as File)

        for (let i = 0; i < thread.length; i++) {
            setStatusMessage(`generating audio ${i + 1}/${thread.length}`)
            let audioUrl = await narrator.narrate(thread[i], currentVoice)
            audioClips = audioClips.concat(audioUrl)
        }

        let audioDurations = await ffmpeg.concatAudioOverInput(
            audioClips,
            'background_video.mp4',
            BG_VID_PATH,
        )

        for (let i = 0; i < thread.length; i++) {
            setStatusMessage(`generating image ${i + 1}/${thread.length}`)
            imageOverlays = imageOverlays.concat({
                imageUrl: await generateImage(thread[i]),
                duration: audioDurations[i],
            })
        }

        await ffmpeg.renderSequentialImageOverlay(
            BG_VID_PATH,
            'final_output.mp4',
            imageOverlays,
        )

        const data = ffmpeg.readFile('final_output.mp4')
        const blob = new Blob([data.buffer], { type: 'video/mp4' })
        const url = URL.createObjectURL(blob)
        setOutputVideo(url)
        setOutputVideoFile(new File([blob], 'output.mp4', { type: blob.type }))

        setStatusMessage('')
    }

    useEffect(() => {
        load()
    }, [])

    return (
        <div className='App'>
            <h1>reddit to tiktok converter</h1>
            <label>
                <input
                    type={'radio'}
                    name={'tts'}
                    value={'mespeak'}
                    onChange={async () => {
                        setNarrator(meSpeakNarrator)
                        setVoices(await meSpeakNarrator.getVoices())
                    }}
                    checked={narrator === meSpeakNarrator}
                />
                MeSpeak
            </label>
            <label>
                <input
                    type={'radio'}
                    name={'tts'}
                    value={'uberduck'}
                    disabled={false}
                    onChange={async () => {
                        setNarrator(uberduckNarrator)
                        setVoices(await uberduckNarrator.getVoices())
                    }}
                    checked={narrator === uberduckNarrator}
                />
                UberDuck (work in progress)
            </label>
            <div hidden={narrator !== uberduckNarrator}>
                {uberduckAuthConfig && (
                    <AuthProvider authConfig={uberduckAuthConfig}>
                        login?
                    </AuthProvider>
                )}
                <div>
                    <label>api key </label>
                    <input
                        type='password'
                        onChange={(e) =>
                            uberduckNarrator.setApiKey(e.target.value)
                        }></input>
                </div>
                <div>
                    <label>api secret </label>
                    <input
                        type='password'
                        onChange={(e) =>
                            uberduckNarrator.setApiSecret(e.target.value)
                        }></input>
                </div>
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
            </div>
            <div>
                <label>background video </label>
                <input
                    type='file'
                    accept='video/*'
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
            <button
                type='button'
                onClick={generateVideo}
                disabled={!ready || !video}>
                Generate Video
            </button>
            <p>{statusMessage}</p>
            {outputVideo && (
                <div>
                    {navigator['canShare'] && navigator.canShare() ? (
                        <a href={outputVideo} download={true}>
                            <button type='button'>Save</button>
                        </a>
                    ) : (
                        <button
                            type='button'
                            onClick={() =>
                                navigator.share({
                                    files: [outputVideoFile as File],
                                })
                            }>
                            Share
                        </button>
                    )}

                    <br />
                    <video
                        id='outputVideo'
                        controls
                        width='250'
                        src={outputVideo}
                    />
                </div>
            )}
        </div>
    )
}

async function getAuthConfig(
    clientId: string,
    configUrl: string,
): Promise<TAuthConfig> {
    let response = await window.fetch(configUrl)
    let json = await response.json()
    let config: TAuthConfig = {
        clientId: clientId,
        authorizationEndpoint: json.authorization_endpoint,
        tokenEndpoint: json.token_endpoint,
        redirectUri: document.URL,
        scope: 'openid',
    }
    return config
}
