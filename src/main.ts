import * as core from '@actions/core';
import * as github from '@actions/github';

async function run() {
  try {
    const issueMessage: string = core.getInput('issue-message');
    const prOpenedMessage: string = core.getInput('pr-opened-message');
    const prMergedMessage: string = core.getInput('pr-merged-message');
    if (!issueMessage && !prOpenedMessage && !prMergedMessage) {
      throw new Error(
        'Action must have at least one of issue-message or pr-message set'
      );
    }
    // Get client and context
    const client = github.getOctokit(
      core.getInput('repo-token', {required: true})
    );
    const context = github.context;

    // Do nothing if its not a pr or issue
    const isIssue: boolean = !!context.payload.issue;
    const isPR: boolean = !!context.payload.pull_request;
    if (!isIssue && !isPR) {
      console.log(
        'The event that triggered this action was not a pull request or issue, skipping.'
      );
      return;
    }

    if (isIssue && context.payload.action !== 'opened') {
      console.log('No issue was opened, skipping');
      return;
    }
    if (isPR && (context.payload.action !== 'opened' && context.payload.action !== 'closed')) {
      console.log('No PR was opened or closed, skipping');
      return;
    }
    
    // Do nothing if its not their first contribution
    console.log('Checking if its the user\'s first contribution');
    if (!context.payload.sender) {
      throw new Error('Internal error, no sender provided by GitHub');
    }
    const sender: string = context.payload.sender!.login;
    const issue: {owner: string; repo: string; number: number} = context.issue;

    let firstContribution: boolean = false;
    if (isIssue) {
      firstContribution = await isFirstIssue(
        client,
        sender,
        issue.number
      );
    } else {
      firstContribution = await isFirstOpenedOrMergedPR(
        client,
        sender,
        issue.number,
        context.payload.action === 'closed'
      );
    }

    if (!firstContribution) {
      console.log('Not the user\'s first contribution');
      return;
    }

    const issueType: string = isIssue ? 'issue' : 'pull request';
    // Add a comment to the appropriate place
    if (isIssue && issueMessage) {
      console.log(`Adding message: ${issueMessage} to ${issueType} ${issue.number}`);
      await client.rest.issues.createComment({
        ...context.repo,
        issue_number: issue.number,
        body: issueMessage
      });
    } else {
      const message = (context.payload.action === 'closed') ? prMergedMessage : prOpenedMessage;

      console.log(`Adding message: ${message} to ${issueType} ${issue.number}`);
      await client.rest.pulls.createReview({
        ...context.repo,
        pull_number: issue.number,
        body: message,
        event: 'COMMENT'
      });
    }
  } catch (error) {
    core.setFailed((error as any).message);
    return;
  }
}

async function isFirstIssue(
  client: ReturnType<typeof github.getOctokit>,
  sender: string,
  curIssueNumber: number
): Promise<boolean> {
  // get the issue details
  const {status: getIssueStatus, data: issue} = await client.rest.issues.get({
    ...github.context.repo,
    issue_number: curIssueNumber
  });

  if (getIssueStatus !== 200) {
    throw new Error(`Received unexpected API status code ${getIssueStatus}`);
  }

  let query = `repo:${github.context.repo.owner}/${github.context.repo.repo} author:${sender} created:<=${issue.created_at} type:issue`;

  const {status: searchStatus, data: searchResults} = await client.rest.search.issuesAndPullRequests({ q: query });
   
  if (searchStatus !== 200) {
    throw new Error(`Received unexpected API status code ${searchStatus}`);
  }

  // If current issue is the user's first, there should be exactly one result
  return searchResults.total_count === 1;
}

async function isFirstOpenedOrMergedPR(
  client: ReturnType<typeof github.getOctokit>,
  sender: string,
  curPullNumber: number,
  closed: boolean
): Promise<boolean> {
  // get the PR's details
  const {status: getPRStatus, data: pr} = await client.rest.pulls.get({
    ...github.context.repo,
    pull_number: curPullNumber
  });

  if (getPRStatus !== 200) {
    throw new Error(`Received unexpected API status code ${status}`);
  }

  let query = `repo:${github.context.repo.owner}/${github.context.repo.repo} type:pr author:${sender}`;
  if (closed) {
  let query = `repo:${github.context.repo.owner}/${github.context.repo.repo} type:pr author:${sender}`;
    if(!pr.merged) return false;
    query += ` closed:<=${pr.closed_at} is:merged`;
  } else {
    query += ` created:<=${pr.created_at}`;
  }
  const {status: searchStatus, data: searchResults} = await client.rest.search.issuesAndPullRequests({ q: query });
   
  if (searchStatus !== 200) {
    throw new Error(`Received unexpected API status code ${status}`);
  }

  // If current PR is the user's first to be created or merged, there should be exactly one result
  return searchResults.total_count === 1;
}

run();
