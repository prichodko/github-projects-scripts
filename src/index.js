import 'dotenv/config'
import { writeFileSync } from 'fs'
import { Command, Option } from 'commander'
import { Octokit } from '@octokit/core'
import { Sequelize } from 'sequelize'
import GitHubQuery from './query.js'
import GitHubProject from './project.js'
import SQLExport from './sql.js'
import ESExport from './es.js'

const exportToJSON = async (repos, path=null) => {
  const json = JSON.stringify(repos, null, 2)
  if (path) {
    writeFileSync(path)
  } else {
    console.log(json)
  }
}

const parseOpts = () => {
  const program = new Command()

  program
    .requiredOption('-T, --github-token <token>', 'API token for GitHub.', process.env.GITHUB_AUTH_TOKEN)
    .requiredOption('-O, --github-org <name>', 'Name of GitHub Organization.', 'status-im')
    .addOption(new Option('-o, --output <type>', 'Type of output to generate.').choices(['json', 'project', 'sql', 'elastic']).default('json'))
    .option('-p, --output-project-number <number>', 'Number of GitHub Project from URL.')
    .option('-J, --output-json-file <file>', 'Path for JSON file to create.')
    .option('-S, --output-sql-url <url>', 'SQL database URL.', 'sqlite::/tmp/issues.db')
    .option('-E, --output-elastic-url <url>', 'ES clsuter node URL.', 'http://localhost:9200/')
    .option('-r, --repos-regex <regex>', 'Regex to match repos.', '^status-(react|desktop|web)$')
    .option('-d, --debug', 'Show debug messages', false)
    .parse()

  return program.opts()
}

const main = async () => {
  const opts = parseOpts()

  const octokit = new Octokit({auth: opts.githubToken})
  const gh = new GitHubQuery(octokit, opts.githubOrg)
  const repos = await gh.getAllReposAndIssues(opts.reposRegex)

  switch(opts.output) {
    case 'json':
      await exportToJSON(repos, opts.outputJsonFile)
      break
    case 'project': 
      const project = new GitHubProject(octokit, opts.githubOrg, opts.outputProjectNumber)
      repos.forEach(repo => project.importRepo(repo))
      break
    case 'sql':
      const db = new Sequelize(opts.outputSqlUrl, {logging: opts.debug})
      const sql = await new SQLExport(db).init()
      repos.forEach(repo => sql.importRepo(repo))
      sql.createViews()
      break
    case 'elastic':
      const es = await new ESExport(opts.outputElasticUrl).init()
      repos.forEach(async repo => await es.importRepo(repo))
      break
  }
}

main()
