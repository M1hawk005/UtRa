const { describe, it } = require('node:test');
const assert = require('node:assert');
const { getSuggestions, buildSearchIndex } = require('./autocomplete.js');

describe('Autocomplete Matching Logic', () => {
    const mockStarData = [
        { n: 'Sol' },
        { n: 'Sirius' },
        { n: 'Proxima Centauri' },
        { n: 'Alpha Centauri A' },
        { n: 'Alpha Centauri B' },
        { n: 'GAL-00001' },
        { n: 'HIP 12345' },
        { n: 'Resol' } // Contains 'sol' as substring
    ];

    it('returns empty array when query is empty', () => {
        buildSearchIndex(mockStarData);
        const results = getSuggestions('', mockStarData);
        assert.deepStrictEqual(results, []);
    });

    it('ignores procedural stars starting with GAL-', () => {
        buildSearchIndex(mockStarData);
        const results = getSuggestions('gal', mockStarData);
        assert.deepStrictEqual(results, []);
    });

    it('returns exact prefix matches before substring matches', () => {
        buildSearchIndex(mockStarData);
        const results = getSuggestions('sol', mockStarData);
        // 'Sol' should be before 'Resol'
        assert.strictEqual(results[0].n, 'Sol');
        assert.strictEqual(results[1].n, 'Resol');
        assert.strictEqual(results.length, 2);
    });

    it('is case-insensitive', () => {
        buildSearchIndex(mockStarData);
        const results = getSuggestions('SIRIUS', mockStarData);
        assert.strictEqual(results[0].n, 'Sirius');
        assert.strictEqual(results.length, 1);
    });

    it('bounds the results to the specified limit', () => {
        const manyStars = [];
        for (let i = 0; i < 20; i++) {
            manyStars.push({ n: `TestStar ${i}` });
        }
        buildSearchIndex(manyStars);
        const results = getSuggestions('Test', manyStars, 5);
        assert.strictEqual(results.length, 5);
    });

    it('handles substrings correctly', () => {
        buildSearchIndex(mockStarData);
        const results = getSuggestions('centauri', mockStarData);
        const names = results.map(r => r.n);
        assert.ok(names.includes('Proxima Centauri'));
        assert.ok(names.includes('Alpha Centauri A'));
        assert.ok(names.includes('Alpha Centauri B'));
    });

    it('bounds internal state and work to small limits without sorting all matches', () => {
        // Create 500 matches in reverse alphabetical order
        // This forces worst-case insertion for a top-K bounded algorithm
        const massiveData = [];
        for (let i = 500; i > 0; i--) {
            massiveData.push({ n: `TestStar ${String(i).padStart(5, '0')}` });
        }

        buildSearchIndex(massiveData);

        // Find top 5 matches
        const limit = 5;
        const results = getSuggestions('Test', massiveData, limit);

        assert.strictEqual(results.length, limit);

        // Because of bounded insertion, we expect the lexicographically FIRST 5 results
        // TestStar 00001, TestStar 00002...
        assert.strictEqual(results[0].n, 'TestStar 00001');
        assert.strictEqual(results[4].n, 'TestStar 00005');
    });

    it('demonstrates deterministic bounded work for a large index (perf validity)', () => {
        // Build a mock dataset of 120,000 stars
        const largeData = [];
        for (let i = 0; i < 119000; i++) {
            largeData.push({ n: 'Star ' + i });
        }
        largeData.push({ n: 'Alpha Centauri A' });
        largeData.push({ n: 'Alpha Centauri B' });
        largeData.push({ n: 'Sirius' });
        largeData.push({ n: 'Proxima Centauri' });
        largeData.push({ n: 'Betelgeuse' });
        largeData.push({ n: 'Rigel' });

        const stats = {};
        buildSearchIndex(largeData);

        // Substring match
        const substringResults = getSuggestions('centauri', largeData, 10, stats);

        assert.ok(substringResults.length <= 10, 'Result count should be <= limit');
        assert.ok(stats.inspectedCandidateCount < 1000, `Expected bounded inspected candidates, got ${stats.inspectedCandidateCount}`);

        const names = substringResults.map(r => r.n);
        assert.ok(names.includes('Proxima Centauri'));
        assert.ok(names.includes('Alpha Centauri A'));
        assert.ok(names.includes('Alpha Centauri B'));

        // Prefix match
        const prefixResults = getSuggestions('alph', largeData, 10, stats);
        assert.ok(prefixResults.length <= 10, 'Result count should be <= limit');
        assert.ok(stats.inspectedCandidateCount < 1000, `Expected bounded inspected candidates, got ${stats.inspectedCandidateCount}`);

        const prefixNames = prefixResults.map(r => r.n);
        assert.ok(prefixNames.includes('Alpha Centauri A'));
        assert.ok(prefixNames.includes('Alpha Centauri B'));
    });
});

describe('Autocomplete DOM Logic (mocked)', () => {
    it('manages aria-activedescendant and aria-selected, and supports pointer interactions', () => {
        const inputEvents = {};
        const inputAttrs = {};

        let inputValue = 'sol';
        const mockInput = {
            addEventListener: (evt, cb) => inputEvents[evt] = cb,
            setAttribute: (attr, val) => inputAttrs[attr] = val,
            removeAttribute: (attr) => delete inputAttrs[attr],
            focus: () => {},
            trim: () => inputValue,
            contains: (el) => el === mockInput
        };

        Object.defineProperty(mockInput, 'value', {
            get: () => inputValue,
            set: (v) => inputValue = v
        });

        const listChildren = [];
        const listboxEvents = {};
        const mockListbox = {
            id: 'test-list',
            replaceChildren: () => { listChildren.length = 0; },
            appendChild: (child) => listChildren.push(child),
            addEventListener: (evt, cb) => listboxEvents[evt] = cb,
            contains: (el) => listChildren.includes(el) || el === mockListbox,
            get children() { return listChildren; },
            hidden: true
        };

        const documentEvents = {};
        global.document = {
            activeElement: mockInput,
            addEventListener: (evt, cb) => documentEvents[evt] = cb,
            removeEventListener: (evt, cb) => {
                if (documentEvents[evt] === cb) {
                    delete documentEvents[evt];
                }
            },
            createElement: (tag) => {
                const _classes = new Set();
                const el = {
                    classList: {
                        add: (c) => _classes.add(c),
                        remove: (c) => _classes.delete(c),
                        contains: (c) => _classes.has(c)
                    },
                    attributes: {},
                    setAttribute: (k,v) => el.attributes[k] = v,
                    addEventListener: () => {},
                    scrollIntoView: () => {},
                    closest: (sel) => {
                        if (sel === '[role="option"]' && (el.attributes['role'] === 'option' || el.role === 'option')) return el;
                        return null;
                    }
                };
                return el;
            }
        };

        const mockData = [{ n: 'Sol' }, { n: 'Resol' }];
        const getStarData = () => mockData;

        const { initAutocomplete, buildSearchIndex } = require('./autocomplete.js');
        buildSearchIndex(mockData);
        initAutocomplete(mockInput, mockListbox, getStarData);

        // Open list
        inputEvents['input']();
        assert.strictEqual(mockListbox.hidden, false);
        assert.strictEqual(inputAttrs['aria-activedescendant'], undefined);

        // Assert missing/stale index closes listbox and sets aria-expanded false
        buildSearchIndex([]); // Stale index
        inputEvents['input'](); // Re-trigger search
        assert.strictEqual(mockListbox.hidden, true);
        assert.strictEqual(inputAttrs['aria-expanded'], 'false');

        // Restore valid index
        buildSearchIndex(mockData);
        inputEvents['input']();
        assert.strictEqual(mockListbox.hidden, false);

        // Arrow down
        inputEvents['keydown']({ key: 'ArrowDown', preventDefault: () => {} });
        assert.strictEqual(inputAttrs['aria-activedescendant'], 'test-list-opt-0');
        assert.strictEqual(listChildren[0].attributes['aria-selected'], 'true');
        assert.strictEqual(listChildren[1].attributes['aria-selected'], 'false');

        // Blur event closes list
        inputEvents['blur']();
        assert.strictEqual(mockListbox.hidden, true);

        // Test pointer interaction: Tap to select
        inputValue = 'sol';
        inputEvents['input'](); // Re-open
        assert.strictEqual(mockListbox.hidden, false);

        listboxEvents['pointerdown']({ clientX: 10, clientY: 10, pointerId: 1, button: 0 });
        inputEvents['blur'](); // Focus lost during tap
        assert.strictEqual(mockListbox.hidden, false); // Stays open

        // Tap completes on first option
        // The event now happens on document
        documentEvents['pointerup']({ target: listChildren[0], pointerId: 1 });
        assert.strictEqual(inputValue, 'Sol');
        assert.strictEqual(mockListbox.hidden, true); // Closes after selection

        // Test pointer interaction: Scroll without selection
        inputValue = 'sol';
        inputEvents['input'](); // Re-open
        assert.strictEqual(mockListbox.hidden, false);

        listboxEvents['pointerdown']({ clientX: 10, clientY: 10, pointerId: 2, button: 0 });
        documentEvents['pointermove']({ clientX: 10, clientY: 30, pointerId: 2 }); // Moved > 5px

        // Blur happens as user interacts with scrollbar
        global.document.activeElement = global.document.body; // mock blur

        documentEvents['pointerup']({ target: listChildren[0], pointerId: 2 });
        // Since moved, it should not select
        assert.strictEqual(inputValue, 'sol'); // Did not change
        assert.strictEqual(mockListbox.hidden, true); // Closes because input blurred

        // Global click outside closes list
        inputEvents['input'](); // Re-open
        assert.strictEqual(mockListbox.hidden, false);
        documentEvents['pointerdown']({ target: global.document.body });
        assert.strictEqual(mockListbox.hidden, true);

        delete global.document;
    });
});
