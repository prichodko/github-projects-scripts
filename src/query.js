export default class GitHubQuery {
  constructor(octokit, org) {
    this.octokit = octokit
    this.org = org
  }

  async getAllReposAndIssues(regex=null) {
    let repos = await this.getAllRepos(this.org)
    if (regex) {
      repos = repos.filter(repo => repo.name.match(regex))
    }

    for (const repo of repos) {
      repo.issues = await this.getRepoIssues(repo.owner.login, repo.name)
    }
    return repos
  }

  async getAllRepos(owner) {
    let repos = [], cursor = null, data = null
    do {
      let result = await this.getAllReposPage(owner, cursor)
      data = result.repositoryOwner.repositories
      cursor = data.pageInfo.endCursor
      repos.push(...data.nodes)
    } while (data.pageInfo.hasNextPage)
    return repos
  }

  async getAllReposPage(owner, cursor = null) {
    const result = await this.octokit.graphql(
      `
      query($owner: String!, $cursor: String) {
        repositoryOwner(login: $owner) {
          repositories(first: 100, after: $cursor) {
            pageInfo {
              endCursor
              hasNextPage
            }
            nodes {
              name
              owner { login }
            }
          }
        }
      }
    `,
      {
        owner,
        cursor
      }
    )
    return result
  }

  async getRepoIssuesPage(owner, name, cursor = null) {
    const result = await this.octokit.graphql(
      `
      query($owner: String!, $name: String!, $cursor: String) {
        repository(owner: $owner, name: $name) {
          issues(first: 100, after: $cursor) {
            pageInfo {
              endCursor
              hasNextPage
            }
            nodes {
              id
              number
              title
              createdAt
              closedAt
              closed
              assignees(first: 1) {
                nodes { login }
              }
            }
          }
        }
      }
    `,
      {
        owner,
        name,
        cursor
      }
    )
    return result
  }

  async getRepoIssues(owner, name) {
    let issues = [], cursor = null, data = null
    do {
      let result = await this.getRepoIssuesPage(owner, name, cursor)
      data = result.repository.issues
      cursor = data.pageInfo.endCursor
      issues.push(...data.nodes)
    } while (data.pageInfo.hasNextPage)
    return issues
  }
}
