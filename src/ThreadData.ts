export async function getThreadData(url: string): Promise<Comment[]> {
    var commentResponse = await fetch(url.split('?')[0] + '.json')
    var commentJson = await commentResponse.json()
    var commentId: string = commentJson[1].data.children[0].data.id
    var permalink: string = commentJson[0].data.children[0].data.permalink
    var threadResponse = await fetch(
        'https://www.reddit.com/' + permalink + '.json',
    )
    var threadJson = await threadResponse.json()
    var topLevelComments = threadJson[1].data.children
    var thread: Comment[] = [
        {
            type: 'text',
            title: threadJson[0].data.children[0].data.title,
            body: threadJson[0].data.children[0].data.selftext,
            user: threadJson[0].data.children[0].data.author,
        },
    ]
    return thread.concat(getSingleCommentThread(topLevelComments, commentId))
}

interface ThreadNode {
    commentData: Comment[]
    comment: any
}

function getSingleCommentThread(
    topLevelComments: any[],
    childCommentId: string,
): Comment[] {
    var queue: ThreadNode[] = []
    topLevelComments.forEach((comment) => {
        if (comment.kind == 't1') {
            queue.push({
                comment: comment,
                commentData: [
                    {
                        body: comment.data.body,
                        user: 'someUser',
                        type: 'reply',
                    },
                ],
            })
        }
    })
    while (queue.length != 0) {
        var currentNode = queue.shift()
        if (currentNode?.comment?.data?.id == childCommentId) {
            return currentNode.commentData
        }
        getReplies(currentNode?.comment).forEach((comment) => {
            if (comment.kind == 't1') {
                queue.push({
                    comment: comment,
                    commentData: (currentNode?.commentData ?? []).concat([
                        {
                            body: comment.data.body,
                            user: 'someUser',
                            type: 'reply',
                        },
                    ]),
                })
            }
        })
    }

    return [{ user: 'failed', type: 'reply' }]
}

function getReplies(comment: any): any[] {
    let children = comment?.data?.replies?.data?.children
    return children ?? []
}

export interface Comment {
    user: string
    body?: string
    title?: string
    imgUrl?: string
    type: 'text' | 'image' | 'reply'
}
