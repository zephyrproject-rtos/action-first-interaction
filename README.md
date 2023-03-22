# First Interaction

An action for filtering pull requests and issues from first-time contributors.

# Usage

See [action.yml](action.yml)

```yaml
steps:
- uses: actions/first-interaction@v1
  with:
    repo-token: ${{ secrets.GITHUB_TOKEN }}
    issue-message: '# Message with markdown.\nThis is the message that will be displayed on users' first issue.'
    pr-opened-message: 'Message that will be displayed on users' first PR. Look, a `code block` for markdown.'
    pr-merged-message: 'Message that will be displayed on users' first merged PR.'
```

# License

The scripts and documentation in this project are released under the [MIT License](LICENSE)
