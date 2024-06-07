const vscode = require('vscode');
const scssSyntax = require('postcss-scss');

const supportedLanguages = ['en', 'fr'];
const defaultLanguage = 'en';
const language = supportedLanguages.includes(vscode.env.language) ? vscode.env.language : defaultLanguage;
const i18n = require(`./i18n/${language}.json`);

class ScssSelectorsViewProvider {
    constructor(extensionUri) {
        this._extensionUri = extensionUri;
        this.selectorData = [];
		this.isSearching = false;
		this.currentSearchCancellationToken = { cancelled: false };
    }

	// WiP
	async analyzeScssSelectors() {
		const selectorLocations = new Map();
		const searchPattern = '**/*.scss';
		const searchOptions = '**/node_modules/**';
		const scssFiles = await vscode.workspace.findFiles(searchPattern, searchOptions);

		for (const file of scssFiles) {
			const document = await vscode.workspace.openTextDocument(file);
			const content = document.getText();
			const root = scssSyntax.parse(content);

			root.walkRules(rule => {
				const fullSelectors = assembleSelector(rule);

				fullSelectors.forEach(selector => {
					const location = `${file.fsPath}:${rule.source.start.line}`;

					if (!selectorLocations.has(selector)) {
						selectorLocations.set(selector, [location]);
					} else {
						selectorLocations.get(selector).push(location);
					}
				});
			});
		}

		// Identifies duplicate selectors
		const duplicates = Array.from(selectorLocations).filter(([_, locations]) => locations.length > 1);

		// Sends duplicate selectors to the webview
		this.webviewView.webview.postMessage({
			command: 'showDuplicates',
			duplicates: duplicates
		});
	}

	async handleSearch(searchText, isCaseSensitive, includeNodeModules) {
		if (this.isSearching) {
			this.currentSearchCancellationToken.cancelled = true;
			await new Promise(resolve => setTimeout(resolve, 100));
		}

		this.currentSearchCancellationToken = { cancelled: false };
		let cancellationToken = this.currentSearchCancellationToken;
		this.isSearching = true;

		// Init
		this.selectorData = new Map();
		let totalSelectorsCount = 0; // Total selectors found
		let totalFilesCount = 0;     // Total files found

		// Search parameters
		const searchPattern = '**/*.scss';
		const searchOptions = includeNodeModules ? undefined : '**/node_modules/**';
		const searchTextLower = isCaseSensitive ? searchText : searchText.toLowerCase();

		// Start search
		this.webviewView.webview.postMessage({ command: 'startSearch', i18n });

		const scssFiles = await vscode.workspace.findFiles(searchPattern, searchOptions);
		const fileReadPromises = scssFiles.map(file => vscode.workspace.openTextDocument(file).then(document => {
			if (cancellationToken.cancelled) return null;

			const content = document.getText();
			const root = scssSyntax.parse(content);

			const filePath = file.fsPath;
			const fileNameCustom = file.path.split('/').pop();
			const displayedPath = vscode.workspace.asRelativePath(file, true);

			let fileHasSelector = false;

			root.walkRules((rule) => {
				const fullSelectors = assembleSelector(rule);

				fullSelectors.forEach(selector => {
					const selectorToCheck = isCaseSensitive ? selector : selector.toLowerCase();

					if (selectorToCheck.includes(searchTextLower)) {
						if (!this.selectorData.has(filePath)) {
							this.selectorData.set(filePath, []);
							totalFilesCount++;
						}

						this.selectorData.get(filePath).push({
							selector: selector,
							file: filePath,
							fileNameCustom: fileNameCustom,
							line: rule.source.start.line,
							displayedPath
						});

						totalSelectorsCount++;
						fileHasSelector = true;
					}
				});
			});

			return fileHasSelector;
		}));

		// Waits until all file reads have been completed
		await Promise.allSettled(fileReadPromises);

		// Prepares data for display
		const preparedData = this.prepareResultsForDisplay(Array.from(this.selectorData.values()), searchText);

		if (!cancellationToken.cancelled) {
			this.webviewView.webview.postMessage({
				command: 'updateResults',
				results: preparedData,
				totalSelectorsCount,
				totalFilesCount
			});
		}

		if (totalSelectorsCount === 0) {
			this.webviewView.webview.postMessage({ command: 'searchNoResult' });
		}

		// End of search
		this.isSearching = false;
		if (!cancellationToken.cancelled) {
			this.webviewView.webview.postMessage({ command: 'searchComplete' });
		}
	}

	prepareResultsForDisplay(selectorData, searchText) {
		return Object.entries(selectorData).map(([_, selectors]) => {
			const fileNameCustom = selectors[0].fileNameCustom;
			const selectorsCount = selectors.length;
			const fileName = selectors[0].displayedPath;

			return {
				summary: `<summary title="${fileName}">${fileNameCustom} (${selectorsCount} ${i18n.selector}${selectorsCount > 1 ? 's' : ''})</summary>`,
				selectors: selectors.map(selector => ({
					...selector,
					selector: this.highlightMatch(selector.selector, searchText)
				}))
			};
		});
	}

	highlightMatch(selector, searchText) {
		const regex = new RegExp(`(${searchText})`, 'gi');
		return selector.replace(regex, '<span class="highlight">$1</span>');
	}

	resolveWebviewView(webviewView, context) {
		this.webviewView = webviewView;

		webviewView.webview.options = {
			enableScripts: true
		};

		webviewView.webview.onDidReceiveMessage(async message => {
			if (message.command === 'search') {
				this.handleSearch(message.text, message.isCaseSensitive, message.includeNodeModules);
			} else if (message.command === 'open') {
				const [path, line] = JSON.parse(message.text);
				const uri = vscode.Uri.file(path);

				try {
					const document = await vscode.workspace.openTextDocument(uri);
					const lineLength = document.lineAt(line - 1).text.length;
					const range = new vscode.Range(line - 1, lineLength, line - 1, lineLength);

					await vscode.window.showTextDocument(document, { selection: range });
				} catch (error) {
					console.error("Could not open the document: ", error);
				}
			} else if (message.command === 'analyze') {
				this.analyzeScssSelectors();
			}
		}, undefined, context.subscriptions);

		webviewView.webview.html = this.getHtmlForWebview(webviewView);
	}

    getHtmlForWebview(webviewView) {
		const scriptUri = webviewView.webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'scripts', 'scripts.js')
		);
		const stylestUri = webviewView.webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'styles', 'styles.css')
		);

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>SCSS Selectors Finder</title>
				<link rel="stylesheet" href="${stylestUri}">
            </head>
            <body>
                <h1>${i18n.title}</h1>
                <form id="search-form">
					<div class="input-container">
						<input type="text" id="input-search" placeholder="${i18n.searchPlaceholder}">
						<div class="input-controls">
							<div title="${i18n.caseSensitive}" id="case-sensitive-icon">
								Aa
							</div>
							<div title="${i18n.includeNodeModules}" class="node-modules">
								<svg width="13" height="16" version="1.1" viewBox="0 0 340 319" xmlns="http://www.w3.org/2000/svg">
									<path d="m49.25 282.89-5.25-4.5656v-27.21c0-19.83-0.32547-27.535-1.2-28.41-0.83434-0.83434-6.1251-1.2-17.363-1.2h-16.163l-9.2737-9.9143v-201.66l10.077-9.9248h98.423l3.9956 2.606c2.7236 1.7764 5.592 5.2782 9.0104 11l5.0148 8.394 128.4 1 10.075 9.9248v27.088c0 19.735 0.32573 27.413 1.2 28.288 0.83434 0.83434 6.1252 1.2 17.363 1.2h16.163l9.2737 9.9143v178.66l-9.5687 9.4248-244.93-0.0488zm240.25-71.886v-56h-128.78l-4.6096 8.1868c-7.3166 12.995-4.5467 12.313-50.061 12.313-24.406 0-38.877 0.37346-40.114 1.0352-1.8671 0.99925-1.9343 2.5545-1.9343 44.8 0 32.793 0.30192 44.067 1.2043 44.969 0.92774 0.92775 26.82 1.1459 112.75 0.95l111.55-0.2543zm-247.18-10.75c1.5677-1.1502 1.6828-4.803 1.4411-45.75l-0.26259-44.5h-23l-0.26259 44.5c-0.24162 40.947-0.12656 44.6 1.4411 45.75 1.0515 0.7715 5.0026 1.25 10.321 1.25s9.2699-0.4785 10.321-1.25zm98.665-52.226c3.0224-5.258 5.9356-8.9099 8.5491-10.717l3.9644-2.7409 67.128-0.0332c56.163-0.0278 67.317-0.26101 68.285-1.4277 0.76194-0.91808 1.06-5.1032 0.87244-12.25l-0.2849-10.856-62.5-0.5c-73.514-0.58811-67.826 0.34076-74.398-12.151-6.3401-12.052-1.1803-10.849-46.557-10.849-29.502 0-39.952 0.30702-40.845 1.2-0.88504 0.88504-1.2 9.8963-1.2 34.333 0 18.223 0.3056 33.439 0.6791 33.812s16.664 0.56101 36.201 0.41667l35.522-0.26244zm-98.921-59.559c1.4884-0.79658 1.9378-2.122 1.9496-5.75 0.01723-5.304 0.01227-5.2947 5.5869-10.5l4.0536-3.7849 50.673 0.05133c58.48 0.05924 55.637-0.35994 60.867 8.975 1.7082 3.0489 4.1859 7.0059 5.5061 8.7934l2.4004 3.25h34.749c25.694 0 35.062-0.31271 35.949-1.2 1.6988-1.6988 1.6988-42.901 0-44.6-0.90705-0.90704-16.06-1.2-62.07-1.2h-60.87l-4.331-2.9798c-3.0078-2.0694-5.7216-5.3907-8.8826-10.871-3.0292-5.2517-5.3201-8.097-6.8492-8.5065-4.0731-1.091-76.767-0.72926-78.863 0.39246-1.8522 0.99127-1.9343 2.4315-1.9343 33.95 0 30.293 0.13942 32.996 1.75 33.934 2.2986 1.3388 17.834 1.3731 20.316 0.0449z"/>
								</svg>
							</div>
						</div>
						<div id="loader" style="display: none;">
							<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="20px" height="20px" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid">
								<circle cx="50" cy="50" fill="none" stroke="#00bcd4" stroke-width="10" r="35" stroke-dasharray="164.93361431346415 56.97787143782138">
									<animateTransform attributeName="transform" type="rotate" repeatCount="indefinite" dur="1s" values="0 50 50;360 50 50" keyTimes="0;1"></animateTransform>
								</circle>
							</svg>
						</div>
					</div>
					<!-- <button type="submit">${i18n.search}</button> -->
					<!-- <label>
						<input type="checkbox" id="case-sensitive-toggle">${i18n.caseSensitive}
					</label>
					<label>
						<input type="checkbox" id="include-node-modules">${i18n.includeNodeModules}
					</label> -->
				</form>

				<div class="flex-container">
					<div id="result-container"></div>
					<button class="flex-item" id="close-button" style="display: none;"></button>
				</div>

				<div id="selectors-list"></div>

				<!--<details class="toto">
					<summary>Analyse</summary>
					<button id="analyze-selectors">Analyser les sélecteurs SCSS</button>
					<div id="result-container"></div>
				</details>-->

				<script src="${scriptUri}"></details>
            </body>
            </html>`;
    }
}

function assembleSelector(rule) {
	// Returns the current selector if the parent does not exist or if it is the root.
    if (!rule.parent || rule.parent.type === 'root') {
        return rule.selector ? rule.selector.split(',') : [];
    }

	// To obtain all the parent selectors
    let parentSelectors = assembleSelector(rule.parent);

	// Simply returns the parent selectors if there are no selectors in the current rule
    if (!rule.selector) {
        return parentSelectors;
    }

	// Adds the current selector with all its parents
    return parentSelectors.map(parentSelector =>
        rule.selector.split(',').map(selectorPart =>
            selectorPart.includes('&') ? selectorPart.replace(/&/g, parentSelector) : `${parentSelector} ${selectorPart}`
        )
    ).flat();
}

function activate(context) {
	const provider = new ScssSelectorsViewProvider(context.extensionUri);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider("scssselectorsfinder", provider)
	);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};