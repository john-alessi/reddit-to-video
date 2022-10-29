import html2canvas from 'html2canvas'
import './GeneratedImage.css'

import { Comment } from './ThreadData'

export async function generateImage(comment: Comment): Promise<string> {
    return new Promise<string>((resolve) => {
        let div = document.createElement('div')
        div.id = 'imagediv'

        let img = document.createElement('img')
        img.src = comment.imgUrl ?? ''
        img.hidden = !comment.imgUrl
        img.crossOrigin = 'anonymous'
        img.width = 380
        img.alt = 'alt'

        const renderToImg = async () => {
            const canvas = await html2canvas(div, {
                width: 400,
                height: 600,
                backgroundColor: null,
                windowWidth: 400,
                windowHeight: 600,
                useCORS: false,
                proxy: comment.imgUrl,
            })
            document.body.removeChild(div)
            resolve(canvas.toDataURL('image/png', 1.0))
        }

        img.onload = renderToImg
        img.onerror = renderToImg

        if (comment.subreddit) {
            let subreddit = document.createElement('p')
            let subredditText = document.createTextNode(comment.subreddit)
            subreddit.appendChild(subredditText)
            div.appendChild(subreddit)
        }

        if (comment.user) {
            let user = document.createElement('p')
            let userText = document.createTextNode(comment.user)
            user.appendChild(userText)
            div.appendChild(user)
        }

        if (comment.title) {
            let title = document.createElement('h2')
            let titleText = document.createTextNode(comment.title)
            title.appendChild(titleText)
            div.appendChild(title)
        }

        if (comment.body) {
            let body = document.createElement('p')
            let bodyText = document.createTextNode(comment.body)
            body.appendChild(bodyText)
            div.appendChild(body)
        }

        div.appendChild(img)
        document.body.appendChild(div)
    })
}
