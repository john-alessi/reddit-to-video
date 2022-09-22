import { useEffect, useState } from 'react'
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg'
import { loadConfig, loadVoice, speak } from 'mespeak'
import './App.css'
import voice from 'mespeak/voices/en/en-us.json'
import config from 'mespeak/src/mespeak_config.json'

const ffmpeg = createFFmpeg({ log: true })

export default function App(): JSX.Element {
    const [ready, setReady] = useState(false)
    const [video, setVideo] = useState<File | null>()
    const [gif, setGif] = useState<string>()
    const [commentUrl, setCommentUrl] = useState('')
    const [threadText, setThreadText] = useState('')

    const load = async () => {
        await ffmpeg.load()
        loadConfig(config)
        loadVoice(voice)
        setReady(true)
    }

    const convertToGif = async () => {
        ffmpeg.FS('writeFile', 'test.mp4', await fetchFile(video as File))
        await ffmpeg.run(
            '-i',
            'test.mp4',
            '-t',
            '2.5',
            '-ss',
            '20',
            '-f',
            'gif',
            'out.gif',
        )
        const data = ffmpeg.FS('readFile', 'out.gif')
        const url = URL.createObjectURL(
            new Blob([data.buffer], { type: 'image/gif' }),
        )
        setGif(url)
    }

    const generateVideo = async () => {
        var thread = await getThreadData(commentUrl)
        setThreadText(thread.toString())
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
                onChange={(e) => setCommentUrl(e.target.value ?? '')}
            />
            <button onClick={generateVideo}>get comment thread</button>
            <button onClick={convertToGif}>Convert</button>
            {gif && <img src={gif} width='250' />}
            <button onClick={(e) => speak(threadText)}>Speak</button>
            <p>{threadText}</p>
        </div>
    ) : (
        <p>loading...</p>
    )
}

async function getThreadData(url: string): Promise<string[]> {
    var commentResponse = await fetch(url.split('?')[0] + '.json')
    var commentJson = await commentResponse.json()
    var commentId: string = commentJson[1].data.children[0].data.id
    var permalink: string = commentJson[0].data.children[0].data.permalink
    var threadResponse = await fetch(
        'https://www.reddit.com/' + permalink + '.json',
    )
    var threadJson = await threadResponse.json()
    var topLevelComments = threadJson[1].data.children
    return getSingleCommentThread(topLevelComments, commentId)
}

interface ThreadNode {
    text: string[]
    comment: any
}

function getSingleCommentThread(
    topLevelComments: any[],
    childCommentId: string,
): string[] {
    var queue: ThreadNode[] = []
    topLevelComments.forEach((comment) => {
        if (comment.kind == 't1') {
            queue.push({ comment: comment, text: [comment.data.body] })
        }
    })
    while (queue.length != 0) {
        var currentNode = queue.shift()
        if (currentNode?.comment?.data?.id == childCommentId) {
            return currentNode.text
        }
        getReplies(currentNode?.comment).forEach((comment) => {
            if (comment.kind == 't1') {
                queue.push({
                    comment: comment,
                    text: (currentNode?.text ?? []).concat([
                        comment.data.body as string,
                    ]),
                })
            }
        })
    }

    return ['Failed']
}

function getReplies(comment: any): any[] {
    let children = comment?.data?.replies?.data?.children
    return children ?? []
}
