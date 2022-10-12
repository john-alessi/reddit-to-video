import {
    loadConfig,
    loadVoice,
    speak,
    isVoiceLoaded,
    isConfigLoaded,
} from 'mespeak'
import voice from 'mespeak/voices/en/en-us.json'
import config from 'mespeak/src/mespeak_config.json'

import { Comment } from './ThreadData'

export interface INarrator {
    narrate: (comment: Comment) => Promise<Audio>
}

export interface Audio {
    url: string
    duration: number
}

export class MeSpeakNarrator implements INarrator {
    constructor() {
        if (!isConfigLoaded()) {
            loadConfig(config)
        }

        if (!isVoiceLoaded()) {
            loadVoice(voice)
        }
    }

    async narrate(comment: Comment): Promise<Audio> {
        let url = speak((comment.title ?? '') + '  ' + (comment.body ?? ''), {
            rawdata: 'mime',
        })
        let duration = await getAudioDuration(url)
        return { url: url, duration: duration }
    }
}

interface UberduckJobStatus {
    started_at: string | null
    failed_at: string | null
    finished_at: string | null
    path: string | null
}

export class UberduckNarrator implements INarrator {
    private apiKey: string
    private apiSecret: string
    private voice: string
    constructor(apiKey: string, apiSecret: string, voice: string) {
        this.voice = voice
        this.apiKey = apiKey
        this.apiSecret = apiSecret
    }

    async narrate(comment: Comment): Promise<Audio> {
        let text = (comment.title ?? '') + '  ' + (comment.body ?? '')
        let response = await window.fetch('https://api.uberduck.ai/speak', {
            method: 'POST',
            body: `{"speech": "${text}","voice": "${this.voice}"}`,
            headers: {
                'Authorization': `Basic ${window.btoa(`${this.apiKey}:${this.apiSecret}`)}`
            },
        })
        let audioId = (await response.json()).uuid
        let audioUrl = await this.getAudioUrl(audioId)
        let duration = await getAudioDuration(audioUrl)
        return {url: audioUrl, duration: duration}
    }

    getAudioUrl(audioId: string): Promise<string> {
        return new Promise<string>((resolve) => {

            const tryGetStatus = async () => {
                let jobStatusResponse = await window.fetch(`https://api.uberduck.ai/speak-status?uuid=${audioId}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Basic ${window.btoa(`${this.apiKey}:${this.apiSecret}`)}`
                    },
                })

                let jobStatus = (await jobStatusResponse.json()) as UberduckJobStatus

                if (jobStatus.finished_at != null && jobStatus.path != null) {
                    resolve(jobStatus.path)
                }
                else {
                    setTimeout(tryGetStatus, 5000)
                }
            }

            tryGetStatus()
        })
    }
}

function getAudioDuration(audioUrl: string): Promise<number> {
    return new Promise<number>((resolve) => {
        let audioElement = new Audio()
        audioElement.addEventListener('loadedmetadata', (e) => {
            resolve((e.target as HTMLAudioElement).duration)
        })
        audioElement.crossOrigin = 'anonymous'
        audioElement.src = audioUrl
    })
}
