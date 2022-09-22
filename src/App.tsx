import { useEffect, useState } from 'react'
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg'
import './App.css'

const ffmpeg = createFFmpeg({ log: true })

function App() {
    const [ready, setReady] = useState(false)
    const [video, setVideo] = useState<File | null>()
    const [gif, setGif] = useState<string>()

    const load = async () => {
        await ffmpeg.load()
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
            <h3>result</h3>
            <button onClick={convertToGif}>Convert</button>
            {gif && <img src={gif} width='250' />}
        </div>
    ) : (
        <p>loading...</p>
    )
}

export default App
