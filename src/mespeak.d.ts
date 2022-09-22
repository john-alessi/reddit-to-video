declare module 'mespeak' {
    export interface MespeakVoice {
        voice_id: string
        dict_id: string
        dict: string
        voice: string
    }

    export interface MespeakConfig {
        config: string
        phontab: string
        phonindex: string
        phondata: string
        intonations: string
    }

    export function loadConfig(config: MespeakConfig): void

    // export function loadConfig(
    //     url: string,
    //     callback?: (success: boolean, id: string) => void,
    // ): void
    export function loadVoice(voice: MespeakVoice): void
    export function speak(input: string): void
}
