export default class GitHubProject {
  constructor(octokit, org, number) {
    this.octokit = octokit
    this.org = org
    this.number = number
  }

  repoPlatformName(repo) {
    const repoToPlatform = {
      'status-react': 'Mobile',
      'status-desktop': 'Desktop',
      'status-web': 'Web',
    }
    return repoToPlatform[repo.name]
  }

  issueStatusName(issue) {
    if (issue.closed) { return 'Done' }
    else if (issue.assignees.nodes.length > 0) { return 'In Progress' }
    else { return 'Todo' }
  }

  async importRepo(repo) {
    const projectId = await this.getProjectId(this.number)
    const fields = await this.getProjectFields(projectId)
    // Get field ID and value of Status and Platform
    const status = await this.getFieldOptions(fields, 'Status')
    const platform = await this.getFieldOptions(fields, 'Platform')

    for (const issue of repo.issues) {
      console.debug(` > ${repo.owner.login}/${repo.name}#${issue.number} - ${issue.title}`)
      let fields = []
      if (status) {
        fields.push({
          id: status.id,
          value: status.options[this.issueStatusName(issue)]
        })
      }
      if (platform) {
        fields.push({
          id: platform.id,
          value: platform.options[this.repoPlatformName(repo)]
        })
      }
      await this.createProjectItem(projectId, issue.id, fields)
    }
  }

  // https://docs.github.com/en/issues/trying-out-the-new-projects-experience/using-the-api-to-manage-projects#finding-the-node-id-of-an-organization-project
  // To find the project number, look at the project URL
  async getProjectId(number) {
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
        org: this.org,
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
}
