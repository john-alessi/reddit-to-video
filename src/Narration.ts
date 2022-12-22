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
    narrate: (comment: Comment, voice: string) => Promise<string>
    getVoices: () => Promise<string[]>
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

    async getVoices() {
        return ['en-us']
    }

    async narrate(comment: Comment, voice: string): Promise<string> {
        let url = speak((comment.title ?? '') + '  ' + (comment.body ?? ''), {
            rawdata: 'mime',
        })
        return url
    }
}

interface UberduckJobStatus {
    started_at: string | null
    failed_at: string | null
    finished_at: string | null
    path: string | null
}

export class UberduckNarrator implements INarrator {
    private apiKey: string = ''
    private apiSecret: string = ''

    setApiKey(apiKey: string) {
        this.apiKey = apiKey
    }

    setApiSecret(apiSecret: string) {
        this.apiSecret = apiSecret
    }

    async getVoices() {
        let response = await window.fetch(
            `https://corsproxy.azure-api.net/voices`,
            {
                method: 'GET',
                headers: {
                    Authorization: `Basic ${window.btoa(
                        `${this.apiKey}:${this.apiSecret}`,
                    )}`,
                },
            },
        )
        let json = await response.json()
        return json.map((v: any) => v.name)
    }

    async narrate(comment: Comment, voice: string): Promise<string> {
        let text = (comment.title ?? '') + '  ' + (comment.body ?? '')
        let audioId = await this.getAudioId(text, voice)
        let audioUrl = await this.getAudioUrl(audioId)
        return audioUrl
    }

    getAudioId(text: string, voice: string): Promise<string> {
        let formattedText = text
            .replaceAll('"', "'")
            .replaceAll('&gt;', '')
            .replaceAll('\n', ' ')

        return new Promise<string>((resolve, reject) => {
            const tryGetId = async (timeout: number) => {
                let response = await window.fetch(
                    'https://corsproxy.azure-api.net/speak',
                    {
                        method: 'POST',
                        body: `{"speech": "${formattedText}","voice": "${voice}"}`,
                        headers: {
                            Authorization: `Basic ${window.btoa(
                                `${this.apiKey}:${this.apiSecret}`,
                            )}`,
                        },
                    },
                )

                if (response.status == 200) {
                    resolve((await response.json()).uuid)
                } else if (response.status == 400) {
                    setTimeout(tryGetId, timeout, timeout * 2)
                } else {
                    reject(response.statusText)
                }
            }

            tryGetId(1000)
        })
    }

    getAudioUrl(audioId: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const tryGetStatus = async () => {
                let jobStatusResponse = await window.fetch(
                    `https://api.uberduck.ai/speak-status?uuid=${audioId}`,
                    {
                        method: 'GET',
                        headers: {
                            Authorization: `Basic ${window.btoa(
                                `${this.apiKey}:${this.apiSecret}`,
                            )}`,
                        },
                    },
                )

                let jobStatus =
                    (await jobStatusResponse.json()) as UberduckJobStatus

                if (jobStatus.finished_at != null && jobStatus.path != null) {
                    resolve(jobStatus.path)
                } else {
                    setTimeout(tryGetStatus, 1000)
                }
            }

            tryGetStatus()
        })
    }
}
