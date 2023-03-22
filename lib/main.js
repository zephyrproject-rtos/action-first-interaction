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
            const client = github.getOctokit(core.getInput('repo-token', { required: true }));
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
                firstContribution = yield isFirstPull(client, sender, issue.number, context.payload.action === 'closed');
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
                // Get the pull request details
                const { data: pr } = yield client.rest.pulls.get(Object.assign(Object.assign({}, context.repo), { pull_number: issue.number }));
                if (context.payload.action === 'closed' && !pr.merged) {
                    console.log('PR was closed without merging, skipping');
                    return;
                }
                const message = pr.merged ? prMergedMessage : prOpenedMessage;
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
        const { status, data: issues } = yield client.rest.issues.listForRepo(Object.assign(Object.assign({}, github.context.repo), { creator: sender, state: 'all' }));
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
    });
}
// It's someone's "first" PR if it's the first PR they've opened, 
// or if it's their first closed PR that's been merged.
function isFirstPull(client, sender, curPullNumber, closed, page = 1) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        // Provide console output if we loop for a while.
        console.log('Checking...');
        const { status, data: pulls } = yield client.rest.pulls.list(Object.assign(Object.assign({}, github.context.repo), { per_page: 100, page: page, state: 'all' }));
        if (status !== 200) {
            throw new Error(`Received unexpected API status code ${status}`);
        }
        if (pulls.length === 0) {
            return true;
        }
        for (const pull of pulls) {
            const login = (_a = pull.user) === null || _a === void 0 ? void 0 : _a.login;
            if (!closed) {
                // If the PR is open, we only care if it's the first PR they've opened.
                if (login === sender && pull.number < curPullNumber) {
                    return false;
                }
            }
            else {
                // If the PR is closed, we need to check if it's the first PR of theirs that's been merged.
                // In other words, are there PRs from them other than "currPullNumber" that are merged.
                if (login === sender && pull.merged_at !== null && pull.number != curPullNumber) {
                    return false;
                }
            }
        }
        return yield isFirstPull(client, sender, curPullNumber, closed, page + 1);
    });
}
run();
