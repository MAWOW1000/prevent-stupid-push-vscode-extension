// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs');
const execPromise = util.promisify(exec);

// Cache for frequently accessed values
let cachedWorkspaceFolder = null;
let cachedBranch = null;
let cachedBranchTimestamp = 0;
const BRANCH_CACHE_TTL = 2000; // 2 seconds
let gitAvailableCache = null;

/**
 * Check if Git is available (cached)
 * @returns {Promise<boolean>}
 */
async function isGitAvailable() {
	if (gitAvailableCache !== null) {
		return gitAvailableCache;
	}
	try {
		await execPromise('git --version', { windowsHide: true });
		gitAvailableCache = true;
		return true;
	} catch {
		gitAvailableCache = false;
		return false;
	}
}

/**
 * Get the current git branch for a workspace folder (cached)
 * @param {string} workspacePath 
 * @param {boolean} forceRefresh - Force cache refresh
 * @returns {Promise<string|null>}
 */
async function getCurrentBranch(workspacePath, forceRefresh = false) {
	if (!workspacePath) {
		return null;
	}

	// Return cached branch if still valid
	const now = Date.now();
	if (!forceRefresh && cachedBranch && (now - cachedBranchTimestamp) < BRANCH_CACHE_TTL) {
		return cachedBranch;
	}

	try {
		// Use git command directly, works on both Windows and Unix
		const { stdout } = await execPromise('git rev-parse --abbrev-ref HEAD', {
			cwd: workspacePath,
			windowsHide: true,
			timeout: 3000 // 3 second timeout
		});
		
		const branch = stdout.trim();
		// Update cache
		cachedBranch = branch;
		cachedBranchTimestamp = now;
		return branch;
	} catch {
		// Clear cache on error
		cachedBranch = null;
		cachedBranchTimestamp = 0;
		return null;
	}
}

/**
 * Get protected branches from settings (cached with config listener)
 * @returns {string[]}
 */
let cachedProtectedBranches = null;
function getProtectedBranches() {
	if (cachedProtectedBranches) {
		return cachedProtectedBranches;
	}
	const config = vscode.workspace.getConfiguration('preventStupidPush');
	cachedProtectedBranches = config.get('protectedBranches', ['main', 'master', 'develop', 'dev']);
	return cachedProtectedBranches;
}

/**
 * Clear protected branches cache
 */
function clearProtectedBranchesCache() {
	cachedProtectedBranches = null;
}

/**
 * Check if extension is enabled
 * @returns {boolean}
 */
function isExtensionEnabled() {
	const config = vscode.workspace.getConfiguration('preventStupidPush');
	return config.get('enabled', true);
}

/**
 * Get workspace folder with Git repository (cached)
 * @param {boolean} forceRefresh - Force cache refresh
 * @returns {vscode.WorkspaceFolder|null}
 */
function getWorkspaceFolder(forceRefresh = false) {
	// Return cached workspace folder if available
	if (!forceRefresh && cachedWorkspaceFolder) {
		return cachedWorkspaceFolder;
	}
	
	const folders = vscode.workspace.workspaceFolders;
	if (!folders || folders.length === 0) {
		cachedWorkspaceFolder = null;
		return null;
	}
	
	// Find first folder with .git directory
	for (const folder of folders) {
		const gitPath = path.join(folder.uri.fsPath, '.git');
		if (fs.existsSync(gitPath)) {
			cachedWorkspaceFolder = folder;
			return folder;
		}
	}
	
	// Return first folder if no .git found
	cachedWorkspaceFolder = folders[0];
	return folders[0];
}

/**
 * Clear workspace folder cache
 */
function clearWorkspaceCache() {
	cachedWorkspaceFolder = null;
	cachedBranch = null;
	cachedBranchTimestamp = 0;
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	// Install git hooks on activation (only if workspace exists)
	if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
		// Delay hook installation slightly to let workspace fully load
		setTimeout(() => installGitHooks(), 500);
	}

	// Note: Terminal interception via sendText override doesn't work reliably
	// The git hook is the primary protection mechanism

	// Register command to check current branch
	const checkBranchCommand = vscode.commands.registerCommand('prevent-stupid-push.checkBranch', async function () {
		try {
			const workspaceFolder = getWorkspaceFolder();
			if (!workspaceFolder) {
				const action = await vscode.window.showErrorMessage(
					'No workspace folder found. Please open a folder with a Git repository.',
					'Open Folder'
				);
				if (action === 'Open Folder') {
					vscode.commands.executeCommand('vscode.openFolder');
				}
				return;
			}

			const currentBranch = await getCurrentBranch(workspaceFolder.uri.fsPath, true);
			
			if (currentBranch) {
				const protectedBranches = getProtectedBranches();
				const isProtected = protectedBranches.includes(currentBranch);
				
				if (isProtected) {
					await vscode.window.showWarningMessage(
						`⚠️ You are on protected branch: "${currentBranch}". Pushing is disabled!`
					);
				} else {
					await vscode.window.showInformationMessage(
						`✅ Current branch: "${currentBranch}" (not protected)`
					);
				}
			} else {
				const action = await vscode.window.showErrorMessage(
					'Could not determine current branch. Make sure you are in a Git repository.',
					'Open Folder'
				);
				if (action === 'Open Folder') {
					vscode.commands.executeCommand('vscode.openFolder');
				}
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Error checking branch: ${error.message}`);
		}
	});

	// Register command to install git hooks
	const installHooksCommand = vscode.commands.registerCommand('prevent-stupid-push.installHooks', async function () {
		await installGitHooks(true);
	});

	// Add status bar item to show current branch protection status
	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusBarItem.command = 'prevent-stupid-push.checkBranch';
	context.subscriptions.push(statusBarItem);

	// Debounced status bar update
	let statusBarUpdateTimeout = null;
	async function updateStatusBar(immediate = false) {
		if (!immediate && statusBarUpdateTimeout) {
			return; // Already scheduled
		}
		
		if (!immediate) {
			// Debounce updates
			if (statusBarUpdateTimeout) {
				clearTimeout(statusBarUpdateTimeout);
			}
			statusBarUpdateTimeout = setTimeout(() => {
				statusBarUpdateTimeout = null;
				updateStatusBar(true);
			}, 300);
			return;
		}

		try {
			const workspaceFolder = getWorkspaceFolder();
			if (!workspaceFolder || !isExtensionEnabled()) {
				statusBarItem.hide();
				return;
			}

			// Check if Git is available
			const gitAvailable = await isGitAvailable();
			if (!gitAvailable) {
				statusBarItem.hide();
				return;
			}

			const currentBranch = await getCurrentBranch(workspaceFolder.uri.fsPath);
			if (currentBranch) {
				const protectedBranches = getProtectedBranches();
				const isProtected = protectedBranches.includes(currentBranch);
				
				if (isProtected) {
					statusBarItem.text = `$(shield) ${currentBranch} (Protected)`;
					statusBarItem.tooltip = 'This is a protected branch. Push is disabled.';
					statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
				} else {
					statusBarItem.text = `$(git-branch) ${currentBranch}`;
					statusBarItem.tooltip = 'Current branch (not protected)';
					statusBarItem.backgroundColor = undefined;
				}
				statusBarItem.show();
			} else {
				statusBarItem.hide();
			}
		} catch {
			// Silently fail and hide status bar on error
			statusBarItem.hide();
		}
	}

	// Update status bar on events with debouncing
	setTimeout(() => updateStatusBar(true), 500); // Initial update
	const statusInterval = setInterval(() => updateStatusBar(true), 15000); // Update every 15 seconds
	context.subscriptions.push({ dispose: () => {
		clearInterval(statusInterval);
		if (statusBarUpdateTimeout) {
			clearTimeout(statusBarUpdateTimeout);
		}
	}});
	
	vscode.window.onDidChangeActiveTextEditor(() => updateStatusBar());
	vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('preventStupidPush')) {
			clearProtectedBranchesCache();
			updateStatusBar(true); // Immediate update on config change
		}
	});
	
	// Update when workspace folders change
	vscode.workspace.onDidChangeWorkspaceFolders(() => {
		clearWorkspaceCache();
		updateStatusBar(true);
	});

	context.subscriptions.push(checkBranchCommand, installHooksCommand);
}

/**
 * Install Git pre-push hook
 * @param {boolean} showNotification - Whether to show notification messages
 */
async function installGitHooks(showNotification = false) {
	const workspaceFolder = getWorkspaceFolder();
	if (!workspaceFolder) {
		if (showNotification) {
			const action = await vscode.window.showWarningMessage(
				'No workspace folder found. Please open a folder with a Git repository.',
				'Open Folder'
			);
			if (action === 'Open Folder') {
				vscode.commands.executeCommand('vscode.openFolder');
			}
		}
		return;
	}
	
	const gitHooksPath = path.join(workspaceFolder.uri.fsPath, '.git', 'hooks');
	const prePushHookPath = path.join(gitHooksPath, 'pre-push');

	try {
		// Check if .git directory exists
		if (!fs.existsSync(path.join(workspaceFolder.uri.fsPath, '.git'))) {
			if (showNotification) {
				vscode.window.showWarningMessage('No git repository found in workspace');
			}
			return;
		}

		// Create hooks directory if it doesn't exist
		if (!fs.existsSync(gitHooksPath)) {
			fs.mkdirSync(gitHooksPath, { recursive: true });
		}

		const protectedBranches = getProtectedBranches();
		const branchesJson = JSON.stringify(protectedBranches);

		// Create pre-push hook script
		const hookScript = `#!/bin/sh
# Prevent Stupid Push - VS Code Extension
# This hook prevents pushing to protected branches

# Get the current branch
current_branch=$(git symbolic-ref HEAD | sed -e 's,.*/\\(.*\\),\\1,')

# Protected branches
protected_branches='${branchesJson}'

# Check if current branch is protected
echo "$protected_branches" | grep -q "\\"$current_branch\\""
if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "🛑 PUSH BLOCKED!"
    echo "=========================================="
    echo "You are trying to push to protected branch: $current_branch"
    echo "Protected branches: ${protectedBranches.join(', ')}"
    echo ""
    echo "If you need to update this branch, please:"
    echo "  1. Create a feature branch"
    echo "  2. Make your changes there"
    echo "  3. Create a pull request"
    echo ""
    echo "To disable this check, modify settings in VS Code:"
    echo "  Prevent Stupid Push > Protected Branches"
    echo "=========================================="
    exit 1
fi

exit 0
`;

		fs.writeFileSync(prePushHookPath, hookScript, { mode: 0o755 });
		
		if (showNotification) {
			vscode.window.showInformationMessage('✅ Git pre-push hook installed successfully!');
		}
	} catch (error) {
		if (showNotification) {
			vscode.window.showErrorMessage(`Failed to install git hook: ${error.message}`);
		}
	}
}

// This method is called when your extension is deactivated
function deactivate() {
	// Clear all caches
	cachedWorkspaceFolder = null;
	cachedBranch = null;
	cachedBranchTimestamp = 0;
	cachedProtectedBranches = null;
	gitAvailableCache = null;
}

module.exports = {
	activate,
	deactivate
}
