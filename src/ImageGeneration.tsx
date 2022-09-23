import ReactDomServer from 'react-dom/server'
import html2canvas from 'html2canvas'
import './GeneratedImage.css'

export async function generateImage(text: string): Promise<string> {
    let element: JSX.Element = (
        <div id='imagediv'>
            <h3>{text}</h3>
        </div>
    )
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
    })
    document.body.removeChild(div)
    return canvas.toDataURL('image/png', 1.0)
}
