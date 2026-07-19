const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const htmlContent = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const cssContent = fs.readFileSync(path.join(__dirname, 'public/style.css'), 'utf8');

test('Map interface layout - Search mode desktop', () => {
    // Should have placeholder 'Search stars or Sagittarius A*'
    assert.match(htmlContent, /placeholder="Search stars or Sagittarius A\*"|placeholder='Search stars or Sagittarius A\*'/);

    // Should have an integrated directions button with SVG and accessible name
    assert.match(htmlContent, /<svg[^>]*>[\s\S]*?<\/svg>/);
    assert.match(htmlContent, /aria-label="Directions"|aria-label="Route"/);
});

test('Map interface layout - Route mode strings', () => {
    // Should have human readable labels
    assert.doesNotMatch(htmlContent, /UTRA_NAV_SYS_V1/i);
    assert.doesNotMatch(htmlContent, /RETURN_TO_SEARCH/i);
    assert.doesNotMatch(htmlContent, /SOURCE_NODE/i);
    assert.doesNotMatch(htmlContent, /TARGET_NODE/i);
    assert.doesNotMatch(htmlContent, /INITIATE_ROUTING/i);

    // Should have Start, Destination, Max jump (pc), Speed (c), Find route
    assert.match(htmlContent, /Start/);
    assert.match(htmlContent, /Destination/);
    assert.match(htmlContent, /Max jump \(pc\)/);
    assert.match(htmlContent, /Speed \(c\)/);
    assert.match(htmlContent, /Find route/);
});

test('Map interface layout - Mobile constraints and 44px targets', () => {
    // 44px minimum target sizes - specifically checking mobile search/route controls
    assert.match(cssContent, /min-height:\s*44px/);

    // Widths should fit 320/375 => use <=calc(100vw - safe margins)
    assert.match(cssContent, /width:\s*min\(.*calc\(100vw/);
});

test('Map interface layout - Selected place card independence', () => {
    // Mobile <=768px: bounded bottom sheet with safe-area padding, canvas visible
    assert.match(cssContent, /@media\s*\(\s*max-width:\s*(600px|768px)\s*\)[\s\S]*?#star-details\s*{[^}]*bottom:\s*max\([^)]*env\(safe-area-inset-bottom\)[^)]*\)[^}]*}/);
});
