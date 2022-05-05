import 'dotenv/config'
import { Command } from 'commander'
import { Octokit } from '@octokit/core'

class ProjectImporter {
  constructor(githubToken) {
    this.githubToken = githubToken
    this.octokit = new Octokit({auth: this.githubToken})
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

  // https://docs.github.com/en/issues/trying-out-the-new-projects-experience/using-the-api-to-manage-projects#finding-the-node-id-of-an-organization-project
  // To find the project number, look at the project URL
  async getProjectId(org, number) {
    const result = await this.octokit.graphql(
      `
      query ($org: String!, $number: Int!) {
        organization(login: $org) {
          projectNext(number: $number) {
            id
          }
        }
      }
    `,
      {
        org,
        number: parseInt(number),
      }
    )
    return result.organization.projectNext.id
  }

  // https://docs.github.com/en/issues/trying-out-the-new-projects-experience/using-the-api-to-manage-projects#finding-the-node-id-of-a-field
  async getProjectFields(projectId) {
    const result = await this.octokit.graphql(
      `
      query ($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectNext {
            fields(first: 20) {
              nodes {
                id
                name
                settings
              }
            }
          }
        }
      }
    `,
      {
        projectId,
      }
    )

    return result.node.fields.nodes
  }

  async getFieldOptions(fields, fieldName) {
    const field = fields.find((item) => item.name === fieldName)
    if (field === undefined) { return null }
    const { id, settings } = field
    const data = JSON.parse(settings)
    /* map names to objects for easier access */
    const options = Object.assign({}, ...data.options.map(s => ({[s.name]: s.id})))
    return { id, options }
  }

  // https://docs.github.com/en/issues/trying-out-the-new-projects-experience/using-the-api-to-manage-projects#adding-an-item-to-a-project
  async addProjectItem(projectId, nodeId) {
    const result = await this.octokit.graphql(
      `
      mutation ($projectId: ID!, $nodeId: ID!) {
        addProjectNextItem(
          input: { projectId: $projectId, contentId: $nodeId }
        ) {
          projectNextItem {
            id
          }
        }
      }
    `,
      {
        projectId,
        nodeId,
      }
    )

    return {
      itemId: result.addProjectNextItem.projectNextItem.id,
    }
  }

  // https://docs.github.com/en/issues/trying-out-the-new-projects-experience/using-the-api-to-manage-projects#updating-a-single-select-field
  async updateProjectItem(projectId, itemId, field) {
    await this.octokit.graphql(
      `
      mutation ($projectId: ID!, $itemId: ID!, $fieldId: ID!, $fieldValue: String!) {
        updateProjectNextItemField(
          input: {projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: $fieldValue}
        ) {
          projectNextItem {
            id
          }
        }
      }
    `,
      {
        projectId,
        itemId,
        fieldId: field.id,
        fieldValue: field.value,
      }
    )
  }

  async createProjectItem(projectId, nodeId, fields) {
    const { itemId } = await this.addProjectItem(projectId, nodeId)
    for (const field of fields) {
      await this.updateProjectItem(projectId, itemId, field)
    }
  }

  issueStatusName(issue) {
    if (issue.closed) { return 'Done' }
    else if (issue.assignees.nodes.length > 0) { return 'In Progress' }
    else { return 'Todo' }
  }

  repoPlatformName(repo) {
    const repoToPlatform = {
      'status-react': 'Mobile',
      'status-desktop': 'Desktop',
      'status-web': 'Web',
    }
    return repoToPlatform[repo.name]
  }

  async importRepository(projectId, repo, fields, dryRun) {
    // Get field ID and value of Status and Platform
    const status = await this.getFieldOptions(fields, 'Status')
    const platform = await this.getFieldOptions(fields, 'Platform')

    const issues = await this.getRepoIssues(repo.owner.login, repo.name)

    for (const issue of issues) {
      console.log(` > ${repo.owner.login}/${repo.name}#${issue.number} - ${issue.title}`)
      if (dryRun) { continue }
      let fields = []
      if (status) {
        fields.push({ id: status.id, value: status.options[this.issueStatusName(issue)] })
      }
      if (platform) {
        fields.push({ id: platform.id, value: platform.options[this.repoPlatformName(repo)] })
      }
      await this.createProjectItem(projectId, issue.id, fields)
    }
  }
}

const parseOpts = () => {
  const program = new Command()

  program
    .requiredOption('-t, --github-token <token>', 'API token for GitHub', process.env.GITHUB_AUTH_TOKEN)
    .requiredOption('-o, --github-org <name>', 'Name of GitHub Organization', 'status-im')
    .requiredOption('-p, --project-number <number>', 'Number of GitHub Project from URL')
    .option('-r, --repos-regex <regex>', 'Regex to match repos', '^status-(react|desktop|web)$')
    .option('-d, --dry-run', 'Only list issues, do not import', false)
    .parse()

  return program.opts()
}

const main = async () => {
  const opts = parseOpts()

  const pi = new ProjectImporter(opts.githubToken)
  const projectId = await pi.getProjectId(opts.githubOrg, opts.projectNumber)
  const fields = await pi.getProjectFields(projectId)

  let repos = await pi.getAllRepos(opts.githubOrg)
  if (opts.reposRegex) {
    repos = repos.filter(repo => repo.name.match(opts.reposRegex))
  }

  for (const repo of repos) {
    //console.log(` * ${repo.owner.login}/${repo.name}`)
    await pi.importRepository(projectId, repo, fields, opts.dryRun)
  }
}

main()
