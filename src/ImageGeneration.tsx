import ReactDomServer from 'react-dom/server'
import html2canvas from 'html2canvas'
import './GeneratedImage.css'

import { Comment } from './ThreadData'

export async function generateImage(comment: Comment): Promise<string> {
    let element: JSX.Element

    if (comment.type == 'reply') {
        element = (
            <div id='imagediv'>
                <h3>{comment.body}</h3>
            </div>
        )
    } else if (comment.type == 'text') {
        element = (
            <div id='imagediv'>
                <h2>{comment.title}</h2>
                <h3>{comment.body}</h3>
            </div>
        )
    } else if (comment.type == 'image') {
        element = (
            <div id='imagediv'>
                <h3>{comment.title}</h3>
                <img src={comment.imgUrl} crossOrigin='anonymous' />
            </div>
        )
    } else {
        element = <p>error</p>
    }

    let str = ReactDomServer.renderToStaticMarkup(element)
    let div = document.createElement('div')
    div.innerHTML = str
    document.body.appendChild(div)
    const canvas = await html2canvas(div, {
        width: 500,
        height: 500,
        backgroundColor: null,
        windowWidth: 500,
        windowHeight: 500,
        useCORS: true,
        proxy: comment.imgUrl,
    })
    document.body.removeChild(div)
    return canvas.toDataURL('image/png', 1.0)
}
