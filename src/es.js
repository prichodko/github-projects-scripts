import { Client } from '@elastic/elasticsearch'

export default class ESExport {
  constructor(node) {
    this.client = new Client({ node })
  }

  async init() {
    const { body: exists } = await this.client.indices.exists({
      index: 'issues'
    })
    if (!exists) {
      await this.client.indices.create({
        index: 'issues',
        body: {
          mappings: {
            properties: {
              number:    { type: 'integer' },
              repo:      { type: 'keyword' },
              title:     { type: 'text'    },
              closed:    { type: 'boolean' },
              assignees: { type: 'integer' },
              createdAt: { type: 'date'    },
              closedAt:  { type: 'date'    },
            }
          }
        }
      })
    }
    return this
  }

  async importRepo(repo) {
    if (repo.issues.length == 0) {
      return
    }
    const body = repo.issues.flatMap(
      issue => [
        { index: {
          _index: 'issues',
          _id: issue.id,
        }},
        {
          repo:      repo.name,
          number:    issue.number,
          title:     issue.title,
          closed:    issue.closed,
          assignees: issue.assignees.nodes.length,
          createdAt: new Date(issue.createdAt).toISOString(),
          closedAt:  new Date(issue.closedAt).toISOString(),
        },
      ]
    )
    const { body: bulkResponse } = await this.client.bulk({ refresh: true, body })
  
    /* Retry creation on failed documents */
    if (bulkResponse.errors) {
      const erroredDocuments = []
      // The items array has the same order of the dataset we just indexed.
      // The presence of the `error` key indicates that the operation
      // that we did for the document has failed.
      bulkResponse.items.forEach((action, i) => {
        const operation = Object.keys(action)[0]
        if (action[operation].error) {
          erroredDocuments.push({
            // If the status is 429 it means that you can retry the document,
            // otherwise it's very likely a mapping error, and you should
            // fix the document before to try it again.
            status: action[operation].status,
            error: action[operation].error,
            operation: body[i * 2],
            document: body[i * 2 + 1]
          })
        }
      })
      console.log(erroredDocuments)
    }
  }
}
