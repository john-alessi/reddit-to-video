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

function getAudioDuration(audioUrl: string): Promise<number> {
    return new Promise<number>((resolve) => {
        let audioElement = new Audio()
        audioElement.addEventListener('loadedmetadata', (e) => {
            resolve((e.target as HTMLAudioElement).duration)
        })
        audioElement.src = audioUrl
    })
}
