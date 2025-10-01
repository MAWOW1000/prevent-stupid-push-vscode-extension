# Prevent Stupid Push

A VS Code extension that prevents you from accidentally pushing to protected Git branches like `main`, `master`, `develop`, or `dev`.

## Features

- 🛡️ **Branch Protection**: Automatically prevents git push commands to protected branches
- 📊 **Status Bar Indicator**: Shows current branch and protection status in the status bar
- ⚙️ **Customizable**: Configure which branches are protected via VS Code settings
- 🪝 **Git Hooks**: Automatically installs pre-push hooks to block pushes at the Git level
- 🔔 **Notifications**: Get clear warning messages when attempting to push to protected branches

### How It Works

The extension provides multiple layers of protection:

1. **Git Pre-Push Hook**: Automatically installed when you open a workspace with a Git repository
2. **Terminal Interception**: Attempts to intercept push commands typed in VS Code terminal
3. **Visual Indicators**: Status bar shows when you're on a protected branch

### Protected Scenarios

- `git push` - Pushing current branch
- `git push origin main` - Explicitly pushing to protected branch
- `git push --force` or `git push -f` - Force pushing to protected branch
- `git push origin HEAD:main` - Pushing to protected branch with different syntax

## Requirements

- VS Code 1.104.0 or higher
- Git repository in your workspace

## Extension Settings

This extension contributes the following settings:

* `preventStupidPush.protectedBranches`: Array of branch names that are protected (default: `["main", "master", "develop", "dev"]`)
* `preventStupidPush.enabled`: Enable/disable the extension (default: `true`)
* `preventStupidPush.showWarningNotification`: Show warning notifications when attempting to push (default: `true`)

## Usage

### Installation & Setup

1. Install the extension
2. Open a workspace with a Git repository
3. The extension will automatically install Git hooks on activation
4. (Optional) Manually install hooks via Command Palette: `Prevent Stupid Push: Install Git Hooks`

### Check Current Branch Protection

- Click on the branch indicator in the status bar
- Or use Command Palette: `Prevent Stupid Push: Check Current Branch`

### Configure Protected Branches

1. Open VS Code Settings (Ctrl+, or Cmd+,)
2. Search for "Prevent Stupid Push"
3. Modify the `Protected Branches` array to add or remove branches

Example:
```json
{
  "preventStupidPush.protectedBranches": ["main", "master", "production", "staging"]
}
```

## Known Issues

- Terminal interception may not work in all terminal types or with certain terminal configurations
- Git hooks provide the most reliable protection layer

## Release Notes

### 0.0.1

Initial release:
- Branch protection via Git pre-push hooks
- Status bar indicator showing current branch protection status
- Configurable protected branches list
- Terminal command interception (experimental)
- Warning notifications on push attempts

---

## For Developers

### Testing the Extension

1. Press F5 to open a new Extension Development Host window
2. Open a folder with a Git repository
3. Try to push to a protected branch

### Building

```bash
npm install
npm run lint
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[Your License Here]

---

**Enjoy safe Git operations!** 🛡️

---

## Working with Markdown

You can author your README using Visual Studio Code.  Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux)
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux)
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
