let searchIndex = null;
let searchStarData = null;

function buildSearchIndex(starData, stats = null) {
    searchStarData = starData;
    searchIndex = new Map();
    let count = 0;

    for (let i = 0; i < starData.length; i++) {
        const star = starData[i];
        if (!star || !star.n || star.n.startsWith('GAL-')) continue;

        const norm = normalizeSearchText(star.n);
        star._normName = norm;
        count++;

        const len = norm.length;
        const uniqueGrams = new Set();

        for (let j = 0; j < len; j++) {
            uniqueGrams.add(norm[j]);
            if (j + 1 < len) uniqueGrams.add(norm.substring(j, j + 2));
            if (j + 2 < len) uniqueGrams.add(norm.substring(j, j + 3));
        }

        for (const gram of uniqueGrams) {
            let list = searchIndex.get(gram);
            if (!list) {
                list = [];
                searchIndex.set(gram, list);
            }
            list.push(i);
        }
    }
    if (stats) {
        stats.indexBuildCount = count;
    }
}

function getSuggestions(query, starData, limit = 10, stats = null) {
    if (stats) {
        stats.inspectedCandidateCount = 0;
        stats.truncated = false;
    }

    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery || !Array.isArray(starData)) return [];

    if (searchStarData !== starData || !searchIndex) {
        return [];
    }

    const queryLen = normalizedQuery.length;
    let initialCandidates = [];
    const maxCandidates = 512;

    if (queryLen <= 3) {
        initialCandidates = searchIndex.get(normalizedQuery) || [];
    } else {
        let bestGram = '';
        let minCount = Infinity;

        for (let i = 0; i <= queryLen - 3; i++) {
            const gram = normalizedQuery.substring(i, i + 3);
            const list = searchIndex.get(gram);
            if (!list) {
                minCount = 0;
                break;
            }
            if (list.length < minCount) {
                minCount = list.length;
                bestGram = gram;
            }
        }

        if (minCount === 0) return [];
        initialCandidates = searchIndex.get(bestGram) || [];
    }

    let inspectable = initialCandidates;
    let isTruncated = false;
    if (inspectable.length > maxCandidates) {
        isTruncated = true;
        inspectable = inspectable.slice(0, maxCandidates);
    }

    if (stats) {
        stats.inspectedCandidateCount = inspectable.length;
        stats.truncated = isTruncated;
    }

    let candidates = inspectable;
    if (queryLen > 3) {
        candidates = inspectable.filter(idx => searchStarData[idx]._normName.includes(normalizedQuery));
    }

    const matches = [];
    for (const idx of candidates) {
        const star = searchStarData[idx];
        const isPrefix = star._normName.startsWith(normalizedQuery);

        let pos = matches.length;
        for (let i = 0; i < matches.length; i++) {
            const b = matches[i];
            if (isPrefix && !b.isPrefix) {
                pos = i;
                break;
            }
            if (!isPrefix && b.isPrefix) {
                continue;
            }
            if (star.n.localeCompare(b.star.n) < 0) {
                pos = i;
                break;
            }
        }

        if (pos < limit) {
            matches.splice(pos, 0, { star, isPrefix });
            if (matches.length > limit) {
                matches.pop();
            }
        }
    }

    return matches.map(m => m.star);
}

function normalizeSearchText(value) {
    return typeof value === 'string'
        ? value.normalize('NFKD').toLocaleLowerCase().trim().replace(/\s+/g, ' ')
        : '';
}

function initAutocomplete(input, listbox, getStarData) {
    let activeIndex = -1;
    let currentSuggestions = [];

    // Pointer interaction state
    let isPointerInteracting = false;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let pointerMoved = false;
    let activePointerId = null;

    function closeList() {
        listbox.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        activeIndex = -1;
        input.removeAttribute('aria-activedescendant');
        listbox.replaceChildren();
        currentSuggestions = [];
    }

    function updateActiveOption() {
        if (activeIndex === -1) {
            input.removeAttribute('aria-activedescendant');
        }

        const options = listbox.children;
        for (let i = 0; i < options.length; i++) {
            const li = options[i];
            if (i === activeIndex) {
                li.classList.add('active');
                li.setAttribute('aria-selected', 'true');
                input.setAttribute('aria-activedescendant', li.id);
                li.scrollIntoView({ block: 'nearest' });
            } else {
                li.classList.remove('active');
                li.setAttribute('aria-selected', 'false');
            }
        }
    }

    function renderList() {
        listbox.replaceChildren();
        if (currentSuggestions.length === 0) {
            closeList();
            return;
        }

        currentSuggestions.forEach((star, index) => {
            const li = document.createElement('li');
            li.role = 'option';
            li.id = `${listbox.id}-opt-${index}`;
            li.className = 'autocomplete-option';
            li.textContent = star.n;
            listbox.appendChild(li);
        });

        updateActiveOption();
        listbox.hidden = false;
        input.setAttribute('aria-expanded', 'true');
    }

    input.addEventListener('input', () => {
        const query = input.value.trim();
        if (!query) {
            closeList();
            return;
        }
        currentSuggestions = getSuggestions(query, getStarData(), 10);
        activeIndex = -1;
        renderList();
    });

    input.addEventListener('keydown', (e) => {
        if (listbox.hidden) {
            // Re-open on arrow down if there's text
            if (e.key === 'ArrowDown' && input.value.trim()) {
                currentSuggestions = getSuggestions(input.value.trim(), getStarData(), 10);
                if (currentSuggestions.length > 0) {
                    activeIndex = 0;
                    renderList();
                    e.preventDefault();
                }
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = (activeIndex + 1) % currentSuggestions.length;
            updateActiveOption();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = activeIndex - 1;
            if (activeIndex < 0) activeIndex = currentSuggestions.length - 1;
            updateActiveOption();
        } else if (e.key === 'Enter') {
            if (activeIndex >= 0 && activeIndex < currentSuggestions.length) {
                e.preventDefault();
                input.value = currentSuggestions[activeIndex].n;
                closeList();
            }
        } else if (e.key === 'Escape') {
            closeList();
        }
    });

    // Pointer events on listbox
    function handlePointerMove(e) {
        if (e.pointerId !== activePointerId) return;
        if (Math.abs(e.clientX - pointerStartX) > 5 || Math.abs(e.clientY - pointerStartY) > 5) {
            pointerMoved = true;
        }
    }

    function cleanupPointer() {
        isPointerInteracting = false;
        activePointerId = null;
        document.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerup', handlePointerUp);
        document.removeEventListener('pointercancel', handlePointerCancel);
    }

    function handlePointerUp(e) {
        if (e.pointerId !== activePointerId) return;

        const wasMoved = pointerMoved;
        cleanupPointer();

        if (!wasMoved) {
            const li = e.target.closest ? e.target.closest('[role="option"]') : null;
            if (li && listbox.contains(li)) {
                const index = parseInt(li.id.split('-opt-')[1], 10);
                if (!isNaN(index) && currentSuggestions[index]) {
                    input.value = currentSuggestions[index].n;
                    closeList();
                    input.focus();
                }
            }
        } else if (document.activeElement !== input) {
            // If the user scrolled and input is blurred, close the list
            closeList();
        }
    }

    function handlePointerCancel(e) {
        if (e.pointerId !== activePointerId) return;
        cleanupPointer();
        if (document.activeElement !== input) {
            closeList();
        }
    }

    listbox.addEventListener('pointerdown', (e) => {
        isPointerInteracting = true;
        activePointerId = e.pointerId;
        pointerStartX = e.clientX;
        pointerStartY = e.clientY;
        pointerMoved = false;

        document.addEventListener('pointermove', handlePointerMove);
        document.addEventListener('pointerup', handlePointerUp);
        document.addEventListener('pointercancel', handlePointerCancel);
    });

    // Blur handling
    input.addEventListener('blur', () => {
        if (!isPointerInteracting) {
            closeList();
        }
    });

    // Global interaction handling to close if clicked outside
    document.addEventListener('pointerdown', (e) => {
        if (listbox.hidden) return;
        if (!input.contains(e.target) && !listbox.contains(e.target)) {
            closeList();
        }
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getSuggestions, initAutocomplete, normalizeSearchText, buildSearchIndex };
}
