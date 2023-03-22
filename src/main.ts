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
      firstContribution = await isFirstPull(
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
      // Get the pull request details
      const { data: pr } = await client.rest.pulls.get({
        ...context.repo,
        pull_number: issue.number
      });

      if(context.payload.action === 'closed' && !pr.merged) {
        console.log('PR was closed without merging, skipping');
        return;
      }

      const message = pr.merged ? prMergedMessage : prOpenedMessage;

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
  const {status, data: issues} = await client.rest.issues.listForRepo({
    ...github.context.repo,
    creator: sender,
    state: 'all'
  });

  if (status !== 200) {
    throw new Error(`Received unexpected API status code ${status}`);
  }

  if (issues.length === 0) {
    return true;
  }

  for (const issue of issues) {
    if (issue.number < curIssueNumber && !issue.pull_request) {
      return false;
    }
  }

  return true;
}

// It's someone's "first" PR if it's the first PR they've opened, 
// or if it's their first closed PR that's been merged.
async function isFirstPull(
  client: ReturnType<typeof github.getOctokit>,
  sender: string,
  curPullNumber: number,
  closed: boolean,
  page: number = 1
): Promise<boolean> {
  // Provide console output if we loop for a while.
  console.log('Checking...');
  const {status, data: pulls} = await client.rest.pulls.list({
    ...github.context.repo,
    per_page: 100,
    page: page,
    state: 'all'
  });

  if (status !== 200) {
    throw new Error(`Received unexpected API status code ${status}`);
  }

  if (pulls.length === 0) {
    return true;
  }

  for (const pull of pulls) {
    const login = pull.user?.login;

    if(!closed) {
      // If the PR is open, we only care if it's the first PR they've opened.
      if (login === sender && pull.number < curPullNumber) {
        return false;
      }
    } else {
      // If the PR is closed, we need to check if it's the first PR of theirs that's been merged.
      // In other words, are there PRs from them other than "currPullNumber" that are merged.
      if (login === sender && pull.merged_at!==null && pull.number != curPullNumber) {
        return false;
      }
    }
  }

  return await isFirstPull(
    client,
    sender,
    curPullNumber,
    closed,
    page + 1
  );
}

run();
