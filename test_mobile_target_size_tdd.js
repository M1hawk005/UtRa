const fs = require('fs');
const assert = require('assert');

const css = fs.readFileSync(__dirname + '/public/style.css', 'utf8');

function extractMediaQueries(cssStr) {
    const queries = [];
    let idx = 0;
    while ((idx = cssStr.indexOf('@media', idx)) !== -1) {
        const startBrace = cssStr.indexOf('{', idx);
        if (startBrace === -1) break;
        const condition = cssStr.substring(idx + 6, startBrace).trim();
        let depth = 0;
        let endBrace = -1;
        for (let i = startBrace; i < cssStr.length; i++) {
            if (cssStr[i] === '{') depth++;
            if (cssStr[i] === '}') depth--;
            if (depth === 0) {
                endBrace = i;
                break;
            }
        }
        if (endBrace !== -1) {
            queries.push({
                condition,
                body: cssStr.substring(startBrace + 1, endBrace)
            });
        }
        idx = endBrace + 1; // Move index past the media query
    }
    return queries;
}

const queries = extractMediaQueries(css);
let foundRule = false;

for (const q of queries) {
    if (q.condition.includes('max-width: 600px') || q.condition.includes('pointer: coarse')) {
        // Find .autocomplete-option in body
        let searchIdx = 0;
        while ((searchIdx = q.body.indexOf('.autocomplete-option', searchIdx)) !== -1) {
            const startBrace = q.body.indexOf('{', searchIdx);
            const endBrace = q.body.indexOf('}', searchIdx);
            if (startBrace !== -1 && endBrace !== -1 && startBrace < endBrace) {
                // Ensure there is no other closing brace before the start brace
                const blockContent = q.body.substring(startBrace + 1, endBrace);
                const hasMinHeight = /min-height\s*:\s*44px/.test(blockContent);
                const hasBoxSizing = /box-sizing\s*:\s*border-box/.test(blockContent);

                if (hasMinHeight && hasBoxSizing) {
                    foundRule = true;
                }
            }
            searchIdx += 20;
        }
    }
}

assert.ok(foundRule, "Expected .autocomplete-option to have min-height: 44px and box-sizing: border-box inside a mobile or coarse pointer media query");
console.log("Mobile autocomplete target size test passed.");
