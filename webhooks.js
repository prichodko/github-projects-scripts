require('dotenv').config()

const { Webhooks } = require('@octokit/webhooks')

const webhooks = new Webhooks({
  secret: process.env.GITHUB_WEBHOOKS_SECRET,
})

// all events, unnecessary are commented out
const ISSUES_EVENT_NAMES = [
  // "assigned",
  'closed',
  'deleted',
  // "demilestoned",
  // 'edited',
  // "labeled",
  // "locked",
  // "milestoned",
  'opened',
  // "pinned",
  'reopened',
  // "transferred",
  // "unassigned",
  // "unlabeled",
  // "unlocked",
  // "unpinned",
]

// const projectId = '<TODO>'
// const status = "<TODO>"
// const platform = "<TODO>"

// TODO: verify webhook signature
// https://github.com/octokit/webhooks.js/#webhooksverify

webhooks.on(ISSUES_EVENT_NAMES, async ({ id, name, payload }) => {
  switch (payload.action) {
    case 'opened': {
      // createProjectItem(projectId, payload.issue.node_id, status, platform)
      break
    }
    case 'reopened': {
      // updateProjectItem(projectId, payload.issue.node_id, status)
      break
    }
    case 'deleted': {
      // deleteProjectItem(projectId, payload.issue.node_id)
      break
    }
    case 'closed': {
      // change status to done
      // updateProjectItem(projectId, payload.issue.node_id, status)
      break
    }
  }
})
