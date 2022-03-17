const { Octokit } = require('@octokit/rest')

const octokit = new Octokit({
  auth: `<AUTH_TOKEN>`,
})

// https://docs.github.com/en/issues/trying-out-the-new-projects-experience/using-the-api-to-manage-projects#finding-the-node-id-of-an-organization-project
// To find the project number, look at the project URL
const getProjectId = async (number) => {
  const result = await octokit.graphql(
    `
    query ($number: Int!) {
      organization(login: "status-im") {
        projectNext(number: $number) {
          id
        }
      }
    }
  `,
    {
      number,
    }
  )

  return result.organization.projectNext.id
}

// https://docs.github.com/en/issues/trying-out-the-new-projects-experience/using-the-api-to-manage-projects#finding-the-node-id-of-a-field
const getProjectFields = async (projectId) => {
  const result = await octokit.graphql(
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

const getStatusField = (fields) => {
  const { id, settings } = fields.find((item) => item.name === 'Status')

  const value = JSON.parse(settings).options.find(
    (option) => option.name === 'Todo'
  ).id

  return {
    id,
    value,
  }
}

const getPlatformField = (fields, platform) => {
  const { id, settings } = fields.find((item) => item.name === 'Platform')

  const value = JSON.parse(settings).options.find(
    (option) => option.name === platform
  ).id

  return {
    id,
    value,
  }
}

// https://docs.github.com/en/issues/trying-out-the-new-projects-experience/using-the-api-to-manage-projects#adding-an-item-to-a-project
const addProjectItem = async (projectId, nodeId) => {
  const result = await octokit.graphql(
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
const updateProjectItem = async (projectId, itemId, field) => {
  await octokit.graphql(
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

const createProjectItem = async (projectId, nodeId, status, platform) => {
  const { itemId } = await addProjectItem(projectId, nodeId)
  await Promise.all([
    await updateProjectItem(projectId, itemId, status),
    await updateProjectItem(projectId, itemId, platform),
  ])
}

const importRepository = async (projectId, repo, fields) => {
  // Get field ID and value of Status and Platform
  const status = getStatusField(fields)
  const platform = getPlatformField(fields, repo.platform) // "Mobile", "Desktop", "Web"

  // Get all issues, starting from the oldest
  const result = await octokit.paginate('GET /repos/{owner}/{repo}/issues', {
    owner: repo.owner,
    repo: repo.name,
    state: 'open',
    filter: 'created',
    direction: 'asc',
  })

  for (const item of result) {
    console.log(`Importing: ${item.id}`)

    await createProjectItem(projectId, item.node_id, status, platform)

    console.log(`Done: ${item.id}`)
    console.log('--------')
  }

  // await Promise.all(
  //   result.map(async (item) => {
  //     console.log(`Importing issue: ${item.id}`)
  //     await createProjectItem(projectId, item.node_id, status, platform)
  //     console.log(`Issue imported: ${item.id}`)
  //   })
  // )
}

// To find the project number, look at the project URL
const PROJECT_NUMBER = '<PROJECT_NUMBER_FROM_URL>'

const repos = [
  { owner: 'status-im', name: 'status-react', platform: 'Mobile' },
  { owner: 'status-im', name: 'status-desktop', platform: 'Desktop' },
  { owner: 'status-im', name: 'status-web', platform: 'Web' },
]

const main = async () => {
  // Retrieve GitHub Project ID
  const projectId = await getProjectId(PROJECT_NUMBER)

  // Retrieve GitHub Project fields
  const fields = await getProjectFields(projectId)

  for (const repo of repos) {
    console.log(`Importing ${repo.name}`)
    await importRepository(projectId, repo, fields)
    console.log(`Done ${repo.name}`)
    console.log('--------')
  }
}

main()
