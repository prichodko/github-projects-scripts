import { DataTypes, Model } from 'sequelize'

export default class SQLExport {
  constructor(db) {
    this.db = db
    this.Issue = this.db.define('Issue', {
      id:        { type: DataTypes.STRING,  allowNull: false, primaryKey: true },
      number:    { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
      repo:      { type: DataTypes.STRING,  allowNull: false },
      title:     { type: DataTypes.STRING,  allowNull: false },
      closed:    { type: DataTypes.BOOLEAN, allowNull: false },
      assignees: { type: DataTypes.INTEGER, allowNull: false },
      createdAt: { type: DataTypes.DATE,    allowNull: false },
      closedAt:  { type: DataTypes.DATE,    allowNull: true  },
    }, {})
  }

  async init() {
    /* Create the table. */
    await this.Issue.sync(/* TODO remove */{force: true})
    return this
  }

  importRepo(repo) {
    repo.issues.forEach(issue => this.importIssue(repo.name, issue))
    this.db.sync()
  }

  importIssue(repo, issue) {
    this.Issue.create({
      id:        issue.id,
      number:    issue.number,
      repo:      repo,
      title:     issue.title,
      closed:    issue.closed,
      assignees: issue.assignees.nodes.length,
      createdAt: issue.createdAt,
      closedAt:  issue.closedAt,
    });
  }
}
