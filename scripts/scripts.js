const vscode = acquireVsCodeApi();

// Elements
const elements = {
    form: document.getElementById('search-form'),
    resultsContainer: document.getElementById('selectors-list'),
    closeBtn: document.getElementById('close-button'),
    flexContainer: document.getElementById('result-container'),
    loader: document.getElementById('loader'),
    caseSensitiveIcon: document.getElementById('case-sensitive-icon'),
    nodeModulesIcon: document.querySelector('.node-modules'),
    inputSearch: document.getElementById('input-search')
};

// State
let state = {
    isCaseSensitive: false,
    hasNoResult: true,
    includeNodeModules: false
};

let trad = {};

// Event Listeners
elements.caseSensitiveIcon.addEventListener('click', toggleCaseSensitive);
elements.closeBtn.addEventListener('click', toggleAllDetails);
elements.nodeModulesIcon.addEventListener('click', toggleNodeModules);
elements.form.addEventListener('submit', handleFormSubmit);
window.addEventListener('message', handleMessage);
elements.resultsContainer.addEventListener('click', handleResultClick);

// Functions
function toggleCaseSensitive() {
    state.isCaseSensitive = !state.isCaseSensitive;
    elements.caseSensitiveIcon.classList.toggle('active');
}

function toggleAllDetails() {
    const detailsElements = document.querySelectorAll('details');
    const allCollapsed = Array.from(detailsElements).every(details => !details.hasAttribute('open'));

    if (allCollapsed) {
        detailsElements.forEach(details => details.setAttribute('open', 'open'));
        elements.closeBtn.textContent = trad.collapseAll;
    } else {
        detailsElements.forEach(details => details.removeAttribute('open'));
        elements.closeBtn.textContent = trad.expandAll;
    }
}

function toggleNodeModules() {
    state.includeNodeModules = !state.includeNodeModules;
    elements.nodeModulesIcon.classList.toggle('active', state.includeNodeModules);
}

function handleFormSubmit(event) {
    event.preventDefault();
    const searchText = elements.inputSearch.value;
    vscode.postMessage({ command: 'search', text: searchText, ...state });
}

function handleMessage(event) {
    const { command, results, totalSelectorsCount, totalFilesCount, duplicates, i18n } = event.data;

    switch (command) {
        case 'startSearch':
            elements.loader.style.display = 'inline';
            trad = i18n;
            break;
        case 'updateResults':
            updateResults(results, totalSelectorsCount, totalFilesCount);
            break;
        case 'searchComplete':
            elements.loader.style.display = 'none';
            break;
        case 'searchNoResult':
            displayNoResults();
            break;
        case 'showDuplicates':
            displayDuplicates(duplicates);
            break;
    }
}

function updateResults(results, totalSelectorsCount, totalFilesCount) {
    state.hasNoResult = results.length === 0;
    elements.resultsContainer.innerHTML = results.map(createFileDetailsHTML).join('');
    elements.closeBtn.style.display = state.hasNoResult ? 'none' : 'block';
    elements.closeBtn.textContent = trad.collapseAll;

    const selectorSuffix = totalSelectorsCount > 1 ? 's' : '';
    const fileSuffix = totalFilesCount > 1 ? 's' : '';
    const resultText = `${totalSelectorsCount} ${trad.result}${selectorSuffix} ${trad.in} ${totalFilesCount} ${trad.file}${fileSuffix}`;

    elements.flexContainer.innerHTML = `<div>${resultText}</div>`;
}

function displayNoResults() {
    elements.closeBtn.style.display = 'none';
    elements.flexContainer.innerHTML = `<p>${trad.noResult}</p>`;
    elements.loader.style.display = 'inline';
}

function displayDuplicates(duplicates) {
    elements.flexContainer.innerHTML = '';

    if (duplicates.length === 0) {
        elements.flexContainer.innerHTML = `<p>${trad.empty}</p>`;
    } else {
        const list = document.createElement('ul');

        duplicates.forEach(([selector, locations]) => {
            const item = document.createElement('li');
            item.innerHTML = `<strong>${selector}</strong> trouvé dans : <br> ${locations.join('<br>')}`;
            list.appendChild(item);
        });

        elements.flexContainer.appendChild(list);
    }
}

function createFileDetailsHTML(fileGroup) {
    return `
    <details open>
        ${fileGroup.summary}
        <div class="detail-container">
            ${fileGroup.selectors.map(createSelectorLinkHTML).join('')}
        </div>
    </details>`;
}

function createSelectorLinkHTML(selectorInfo) {
    return `
    <a href="javascript:void(0);" class="link" data-file="${selectorInfo.file}" data-line="${selectorInfo.line}">
        ${selectorInfo.selector}
    </a>`;
}

function handleResultClick(event) {
    if (event.target && event.target.classList.contains('link')) {
        event.preventDefault();
        const file = event.target.dataset.file;
        const line = event.target.dataset.line;
        vscode.postMessage({ command: 'open', text: JSON.stringify([file, parseInt(line), 0]) });
    }
}
