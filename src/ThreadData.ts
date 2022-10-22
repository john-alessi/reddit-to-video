type PostType = 'image' | 'text' | 'reply'

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
    var op = threadJson[0].data.children[0].data

    var type: PostType
    var imgUrl: string | undefined = undefined
    if (op.post_hint == 'image') {
        type = 'image'
        imgUrl = op.url
    } else if ('gallery_data' in op) {
        type = 'image'
        imgUrl =
            'https://i.redd.it/' + op.gallery_data.items[0].media_id + '.jpg'
    } else {
        type = 'text'
    }

    var firstComment = {
        type: type,
        title: op.title,
        body: op.selftext,
        user: op.author,
        imgUrl: imgUrl,
        subreddit: op.subreddit,
    }

    var thread: Comment[] = splitComment(firstComment)
    var replies: Comment[] = getSingleCommentThread(topLevelComments, commentId)
        .map((c) => splitComment(c))
        .flat()
    return thread.concat(replies)
}

function splitComment(comment: Comment): Comment[] {
    if (comment.body == undefined || comment.body.length == 0) {
        return [comment]
    }

    var results: Comment[] = []
    var remainder: Comment = comment
    if (comment.type != 'reply') {
        results = results.concat({
            type: comment.type,
            title: comment.title,
            user: comment.user,
            imgUrl: comment.imgUrl,
        })
        remainder = { user: comment.user, body: comment.body, type: 'reply' }
    }

    var sentences: Comment[] =
        remainder.body
            ?.split(/[\.\?!](?:.(?![\.\?!]))\s*/s)
            .map((s) => ({ type: 'reply', body: s })) ?? []

    sentences[0].user = comment.user

    return results.concat(sentences)
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
                        user: comment.data.author,
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
                            user: comment.data.author,
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
    user?: string
    body?: string
    title?: string
    imgUrl?: string
    type: PostType
    subreddit?: string
}
