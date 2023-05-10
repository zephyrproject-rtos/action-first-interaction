"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const plugin_retry_1 = require("@octokit/plugin-retry");
const plugin_throttling_1 = require("@octokit/plugin-throttling");
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const issueMessage = core.getInput('issue-message');
            const prOpenedMessage = core.getInput('pr-opened-message');
            const prMergedMessage = core.getInput('pr-merged-message');
            if (!issueMessage && !prOpenedMessage && !prMergedMessage) {
                throw new Error('Action must have at least one of issue-message or pr-message set');
            }
            // Get client and context
            const client = github.getOctokit(core.getInput('repo-token', { required: true }), {
                request: { retries: 5 },
                throttle: {
                    onSecondaryRateLimit: (retryAfter, options) => {
                        console.warn(`Secondary rate limit reached for request ${options.method} ${options.url}.`, `Will retry in ${retryAfter} seconds.`);
                        return true;
                    },
                    onRateLimit: (retryAfter, options, octokit, retryCount) => {
                        console.warn(`Rate limit reached for request ${options.method} ${options.url}.`, `Will retry in ${retryAfter} seconds.`);
                        if (retryCount < 3) {
                            return true;
                        }
                    }
                }
            }, plugin_retry_1.retry, plugin_throttling_1.throttling);
            const context = github.context;
            // Do nothing if its not a pr or issue
            const isIssue = !!context.payload.issue;
            const isPR = !!context.payload.pull_request;
            if (!isIssue && !isPR) {
                console.log('The event that triggered this action was not a pull request or issue, skipping.');
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
            const sender = context.payload.sender.login;
            const issue = context.issue;
            let firstContribution = false;
            if (isIssue) {
                firstContribution = yield isFirstIssue(client, sender, issue.number);
            }
            else {
                firstContribution = yield isFirstOpenedOrMergedPR(client, sender, issue.number, context.payload.action === 'closed');
            }
            if (!firstContribution) {
                console.log('Not the user\'s first contribution');
                return;
            }
            const issueType = isIssue ? 'issue' : 'pull request';
            // Add a comment to the appropriate place
            if (isIssue && issueMessage) {
                console.log(`Adding message: ${issueMessage} to ${issueType} ${issue.number}`);
                yield client.rest.issues.createComment(Object.assign(Object.assign({}, context.repo), { issue_number: issue.number, body: issueMessage }));
            }
            else {
                const message = (context.payload.action === 'closed') ? prMergedMessage : prOpenedMessage;
                console.log(`Adding message: ${message} to ${issueType} ${issue.number}`);
                yield client.rest.pulls.createReview(Object.assign(Object.assign({}, context.repo), { pull_number: issue.number, body: message, event: 'COMMENT' }));
            }
        }
        catch (error) {
            core.setFailed(error.message);
            return;
        }
    });
}
function isFirstIssue(client, sender, curIssueNumber) {
    return __awaiter(this, void 0, void 0, function* () {
        // get the issue details
        const { status: getIssueStatus, data: issue } = yield client.rest.issues.get(Object.assign(Object.assign({}, github.context.repo), { issue_number: curIssueNumber }));
        if (getIssueStatus !== 200) {
            throw new Error(`Received unexpected API status code ${getIssueStatus}`);
        }
        let query = `repo:${github.context.repo.owner}/${github.context.repo.repo} author:${sender} created:<=${issue.created_at} type:issue`;
        const { status: searchStatus, data: searchResults } = yield client.rest.search.issuesAndPullRequests({ q: query });
        if (searchStatus !== 200) {
            throw new Error(`Received unexpected API status code ${searchStatus}`);
        }
        // If current issue is the user's first, there should be exactly one result
        return searchResults.total_count === 1;
    });
}
function isFirstOpenedOrMergedPR(client, sender, curPullNumber, closed) {
    return __awaiter(this, void 0, void 0, function* () {
        // get the PR's details
        const { status: getPRStatus, data: pr } = yield client.rest.pulls.get(Object.assign(Object.assign({}, github.context.repo), { pull_number: curPullNumber }));
        if (getPRStatus !== 200) {
            throw new Error(`Received unexpected API status code ${status}`);
        }
        let query = `repo:${github.context.repo.owner}/${github.context.repo.repo} type:pr author:${sender}`;
        if (closed) {
            let query = `repo:${github.context.repo.owner}/${github.context.repo.repo} type:pr author:${sender}`;
            if (!pr.merged)
                return false;
            query += ` closed:<=${pr.closed_at} is:merged`;
        }
        else {
            query += ` created:<=${pr.created_at}`;
        }
        const { status: searchStatus, data: searchResults } = yield client.rest.search.issuesAndPullRequests({ q: query });
        if (searchStatus !== 200) {
            throw new Error(`Received unexpected API status code ${status}`);
        }
        // If current PR is the user's first to be created or merged, there should be exactly one result
        return searchResults.total_count === 1;
    });
}
run();
