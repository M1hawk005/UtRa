const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const { spawnSync } = require('child_process');

function stripComments(source) {
    let result = '';
    let state = 'code';

    for (let i = 0; i < source.length; i++) {
        const char = source[i];
        const next = source[i + 1];

        if (state === 'lineComment') {
            if (char === '\n' || char === '\r') {
                result += char;
                state = 'code';
            }
            continue;
        }

        if (state === 'blockComment') {
            if (char === '*' && next === '/') {
                result += ' ';
                i++;
                state = 'code';
            } else if (char === '\n' || char === '\r') {
                result += char;
            }
            continue;
        }

        if (state !== 'code') {
            result += char;
            if (char === '\\') {
                result += source[++i] || '';
            } else if ((state === 'singleQuote' && char === "'") ||
                       (state === 'doubleQuote' && char === '"') ||
                       (state === 'template' && char === '`')) {
                state = 'code';
            }
            continue;
        }

        if (char === "'") {
            result += char;
            state = 'singleQuote';
        } else if (char === '"') {
            result += char;
            state = 'doubleQuote';
        } else if (char === '`') {
            result += char;
            state = 'template';
        } else if (char === '/' && next === '/') {
            result += ' ';
            i++;
            state = 'lineComment';
        } else if (char === '/' && next === '*') {
            result += ' ';
            i++;
            state = 'blockComment';
        } else {
            result += char;
        }
    }

    return result;
}

// Replaced regex testing with executable spy inside VM tests.

class Element {
    constructor(id = '') {
        this.id = id;
        this.value = '';
        this.hidden = true;
        this.children = [];
        this.attributes = {};
        this.dataset = {};
        this.listeners = {};
        this.classList = { add() {}, remove() {} };
        this.style = {};
    }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    replaceChildren() { this.children = []; }
    appendChild(child) { this.children.push(child); }
    contains(child) { return child === this || this.children.includes(child); }
    focus() { document.activeElement = this; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; }
    getContext() { return { fillRect: ()=>{}, fillText: ()=>{}, measureText: ()=>({width:10}), strokeRect: ()=>{}, clearRect: ()=>{} }; }
}

const document = {
    activeElement: null,
    body: new Element('body'),
    listeners: {},
    addEventListener(type, listener) { this.listeners[type] = listener; },
    removeEventListener(type) { delete this.listeners[type]; },
    createElement() {
        const element = new Element();
        element.scrollIntoView = () => {};
        element.closest = () => element;
        return element;
    }
};
const context = { document, module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(__dirname + '/public/js/autocomplete.js', 'utf8'), context);
const autocomplete = context.module.exports;

let catalog = [];
let initAutocompleteCalls = [];
let productionIndexBuilds = 0;
const initAutocompleteSpy = (input, listbox, catalogFn) => {
    assert.strictEqual(productionIndexBuilds, 1, 'each real binding must run after exactly one explicit index build');
    initAutocompleteCalls.push({ input, listbox, catalogFn });
};

// Simulate execution of app.js logic to prove bindings run:
const rawAppJs = fs.readFileSync(__dirname + '/public/app.js', 'utf8');
let vmAppJs = rawAppJs.replace(/^loadStars\(\);\s*$/m, '');
if (process.env.AUTOCOMPLETE_NOOP_MUTANT === '1') {
    vmAppJs = vmAppJs.replaceAll('initAutocomplete(', 'void (');
}
vmAppJs = vmAppJs.replace(
    "document.body.dataset.catalogReady = 'true';",
    "document.body.dataset.catalogReady = 'true';\n        if (globalThis.__bindingIntegrationOnly) return;"
);

const THREE = {
    Vector3: class {
        constructor(x=0,y=0,z=0) { this.x=x; this.y=y; this.z=z; }
        set(x,y,z) { this.x=x; this.y=y; this.z=z; return this; }
        copy(v) { this.x=v.x; this.y=v.y; this.z=v.z; return this; }
        clone() { return new THREE.Vector3(this.x, this.y, this.z); }
        sub(v) { this.x-=v.x; this.y-=v.y; this.z-=v.z; return this; }
        normalize() { return this; }
        addScaledVector(v, s) { this.x+=v.x*s; this.y+=v.y*s; this.z+=v.z*s; return this; }
        multiplyScalar(s) { this.x*=s; this.y*=s; this.z*=s; return this; }
        add(v) { this.x+=v.x; this.y+=v.y; this.z+=v.z; return this; }
        dot(v) { return this.x*v.x + this.y*v.y + this.z*v.z; }
        transformDirection() { return this; }
        lerpVectors(v1, v2, alpha) { this.x = v1.x + (v2.x-v1.x)*alpha; this.y = v1.y + (v2.y-v1.y)*alpha; this.z = v1.z + (v2.z-v1.z)*alpha; return this; }
        distanceTo(v) { return Math.hypot(this.x-v.x, this.y-v.y, this.z-v.z); }
    },
    Vector2: class { constructor(x=0,y=0) { this.x=x; this.y=y; } set(x,y) { this.x=x; this.y=y; return this; } },
    Raycaster: class { constructor() { this.ray = { direction: new THREE.Vector3(0,0,-1) }; } setFromCamera() {} },
    MathUtils: { degToRad: (d) => d * Math.PI / 180 },
    Scene: class { userData = {}; add() {} remove() {} },
    PerspectiveCamera: class { position = new THREE.Vector3(); up = new THREE.Vector3(); lookAt() {} fov = 45; aspect = 1; },
    WebGLRenderer: class { domElement = new Element(); setSize() {} setPixelRatio(value) { this.pixelRatio = value; } getPixelRatio() { return this.pixelRatio || 1; } render() {} setClearColor() {} capabilities = { getMaxAnisotropy: () => 16 }; getContext() { return { ALIASED_POINT_SIZE_RANGE: 0x846D, getExtension: ()=>{}, getParameter: ()=>[1, 64] }; } },
    Points: class { constructor(g,m) { this.geometry = g; this.material = m || { opacity: 1.0 }; this.position = new THREE.Vector3(); } lookAt() {} add() {} remove() {} },
    BufferGeometry: class { setAttribute(name, attr) { if(name==='hideMarker') this.marker = attr; } computeBoundingSphere() { this.boundingSphere = { radius: 100 }; } setFromPoints(pts) { this.pts=pts; return this; } getAttribute(name) { return name==='hideMarker'? this.marker : null; } dispose() {} },
    BufferAttribute: class { constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.needsUpdate = false; } },
    Float32BufferAttribute: class {},
    LineDashedMaterial: class { dispose() {} },
    ShaderMaterial: class { dispose() {} },
    Line: class { constructor(g,m){this.geometry=g; this.material=m;} computeLineDistances(){} },
    PointsMaterial: class {},
    TextureLoader: class { load() { return {}; } },
    Color: class { constructor(value) { this.value = value; this.r = this.g = this.b = 1; } setHex(value) { this.value = value; return this; } set(value) { this.value = value; return this; } copy(color) { this.value = color.value; this.r = color.r; this.g = color.g; this.b = color.b; return this; } clone() { return new THREE.Color(this.value); } lerp() { return this; } },
    Group: class { constructor() { this.position = new THREE.Vector3(); } add() {} },
    Mesh: class { constructor() { this.position = new THREE.Vector3(); this.quaternion = { setFromUnitVectors() {} }; } material = {}; geometry = new THREE.BufferGeometry(); updateWorldMatrix() {} getWorldPosition() {} getWorldScale(v) { v.set(1,1,1); return v; } matrixWorld = {}; lookAt() {} },
    MeshBasicMaterial: class {},
    SphereGeometry: class { scale() {} },
    RingGeometry: class {},
    PlaneGeometry: class {},
    sRGBEncoding: 1,
    ACESFilmicToneMapping: 1,
    AdditiveBlending: 1,
    NormalBlending: 1,
    DoubleSide: 1
};

context.window = {
    innerWidth: 800, innerHeight: 600, devicePixelRatio: 1,
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {}
};
context.THREE = THREE;
context.console = console;
context.fetch = () => Promise.resolve({ json: () => Promise.resolve([{ n: 'HIP 99999 (TYC 7375-123-1)' }, { n: 'GAL-TYC 7375' }]) });
context.requestAnimationFrame = () => {};
context.performance = { now: () => 0 };
context.__bindingIntegrationOnly = true;
context.document.getElementById = function(id) {
    if (!this.elements) this.elements = {};
    if (!this.elements[id]) {
        const el = new Element(id);
        el.closest = () => el;
        this.elements[id] = el;
    }
    return this.elements[id];
};
context.OrbitControls = class { constructor() { this.target = new THREE.Vector3(); } update() {} };
THREE.OrbitControls = context.OrbitControls;

const scripts = [
    'visual_logic.js',
    'overview_sky.js',
    'transition.js',
    'wheel_zoom.js',
    'star_picking.js',
    'pointer_state.js'
].map(f => fs.readFileSync(__dirname + '/public/js/' + f, 'utf8'));

scripts.forEach(src => vm.runInNewContext(src, context));

for (let key in context.module.exports) {
    context[key] = context.module.exports[key];
}
context.initAutocomplete = initAutocompleteSpy;
context.buildSearchIndex = (...args) => {
    productionIndexBuilds++;
    return autocomplete.buildSearchIndex(...args);
};

vm.runInNewContext(vmAppJs, context);
// The binding integration deliberately bypasses WebGL scene construction while
// retaining the real fetch, explicit index build, and post-fetch binding path.
context.initGalaxy = () => {};
context.initOverviewSky = () => {};
context.createNebulae = () => {};
context.frameGalaxy = () => {};
vm.runInNewContext(`
    globalThis.bindingLoadPromise = loadStars();
`, context);

// Wait for loadStars promise
setTimeout(() => {
    assert.strictEqual(initAutocompleteCalls.length, 2, 'must bind exactly start and end autocomplete once each');
    assert.strictEqual(productionIndexBuilds, 1, 'production load path must explicitly build the index exactly once');
    assert.strictEqual(initAutocompleteCalls[0].input.id, 'start', 'first bind must be start input');
    assert.strictEqual(initAutocompleteCalls[0].listbox.id, 'start-listbox', 'first bind must be start listbox');
    assert.strictEqual(initAutocompleteCalls[1].input.id, 'end', 'second bind must be end input');
    assert.strictEqual(initAutocompleteCalls[1].listbox.id, 'end-listbox', 'second bind must be end listbox');
    assert.strictEqual(typeof initAutocompleteCalls[0].catalogFn, 'function', 'must provide live getter');
    assert.strictEqual(initAutocompleteCalls[0].catalogFn().length, 2, 'getter must return loaded catalog');

    if (process.env.AUTOCOMPLETE_NOOP_MUTANT !== '1') {
        const mutant = spawnSync(process.execPath, [__filename], {
            cwd: __dirname,
            env: { ...process.env, AUTOCOMPLETE_NOOP_MUTANT: '1' },
            encoding: 'utf8'
        });
        assert.notStrictEqual(mutant.status, 0, 'valid no-op mutation of both real callees must be rejected');
        assert.match(mutant.stderr, /must bind exactly start and end autocomplete once each/,
            'no-op mutation must fail specifically because neither binding spy ran');
    }

    // Simulate app.js explicit index build:
    catalog = initAutocompleteCalls[0].catalogFn();
    autocomplete.buildSearchIndex(catalog);

    // Run the rest of the test suite inside the timeout...
    const input = context.document.getElementById('end');
    const listbox = context.document.getElementById('end-listbox');
    autocomplete.initAutocomplete(input, listbox, () => catalog);

    input.value = '  TYC   7375 ';
    input.listeners.input();
    assert.strictEqual(listbox.children.length, 1, 'loaded catalog must be queried and procedural stars excluded');
    assert.strictEqual(listbox.hidden, false);
    assert.strictEqual(input.attributes['aria-expanded'], 'true');
    input.listeners.keydown({ key: 'ArrowDown', preventDefault() {} });
    assert.strictEqual(input.attributes['aria-activedescendant'], 'end-listbox-opt-0');
    input.listeners.keydown({ key: 'Enter', preventDefault() {} });
    assert.strictEqual(input.value, 'HIP 99999 (TYC 7375-123-1)');
    assert.strictEqual(listbox.hidden, true);
    assert.strictEqual(input.attributes['aria-expanded'], 'false');
    assert.strictEqual(input.attributes['aria-activedescendant'], undefined);

    // Deterministic 120k test with adversarial common names
    let adversarialCatalog = [];
    for (let i = 0; i < 120000; i++) {
        adversarialCatalog.push({ n: 'STAR ' + i });
    }
    // Add some specific ones to test prefix/substring ranking
    adversarialCatalog[0] = { n: 'Star' };
    adversarialCatalog[1] = { n: 'My Star' };

    // Explicit build
    const buildStats = {};
    autocomplete.buildSearchIndex(adversarialCatalog, buildStats);
    assert.ok(buildStats.indexBuildCount === 120000, 'must truthfully separate indexBuildCount');

    const stats = {};
    let results = autocomplete.getSuggestions('star', adversarialCatalog, 10, stats);

    assert.strictEqual(stats.truncated, true, 'must truncate candidates exceeding budget');
    assert.ok(stats.inspectedCandidateCount <= 1000, 'inspectedCandidateCount must be <= budget');
    assert.ok(stats.inspectedCandidateCount >= 512, 'inspectedCandidateCount must be around budget');
    assert.strictEqual(results.length, 10, 'must bound results to limit');
    assert.strictEqual(results[0].n, 'Star', 'must preserve exact-prefix-before-substring ranking');

    // Test fresh/missing/stale index returns no results and inspected=0 rather than building
    const staleCatalog = [{ n: 'Sun' }];
    const staleStats = {};
    results = autocomplete.getSuggestions('Sun', staleCatalog, 10, staleStats);
    assert.strictEqual(results.length, 0, 'stale index must return no results');
    assert.strictEqual(staleStats.inspectedCandidateCount, 0, 'stale index must not inspect anything');
    assert.ok(!staleStats.indexBuildCount, 'stale index must not build anything during query');

    console.log('Autocomplete integration regression passed');
}, 50);
