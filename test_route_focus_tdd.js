const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function stripComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const rawAppJs = fs.readFileSync(__dirname + '/public/app.js', 'utf8');
const appJs = stripComments(rawAppJs);
const vmAppJs = rawAppJs.replace(/^loadStars\(\);\s*$/m, '');

const scripts = [
    'autocomplete.js',
    'visual_logic.js',
    'overview_sky.js',
    'transition.js',
    'wheel_zoom.js',
    'star_picking.js',
    'pointer_state.js'
].map(f => fs.readFileSync(__dirname + '/public/js/' + f, 'utf8'));

class Element extends EventTarget {
    constructor(id = '', tagName = '') {
        super();
        this.id = id;
        this.tagName = tagName.toUpperCase();
        this.style = {};
        this.dataset = {};
        this.children = [];
        this.disabled = false;
        this.attributes = {};
        this._classes = new Set();
        this._className = '';
        this._registeredListeners = [];
    }

    get className() { return this._className; }
    set className(v) { this._className = v; this._classes = new Set(v.split(/\s+/)); }

    get classList() {
        const self = this;
        return {
            add(c) { self._classes.add(c); self._className = Array.from(self._classes).join(' '); },
            remove(c) { self._classes.delete(c); self._className = Array.from(self._classes).join(' '); },
            toggle(c) { if (self._classes.has(c)) self._classes.delete(c); else self._classes.add(c); self._className = Array.from(self._classes).join(' '); },
            contains(c) { return self._classes.has(c); }
        };
    }

    addEventListener(type, handler, options = false) {
        this._registeredListeners.push({ type, handler, options });
        super.addEventListener(type, handler, options);
    }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    removeAttribute(name) { delete this.attributes[name]; }
    getAttribute(name) { return this.attributes.hasOwnProperty(name) ? this.attributes[name] : null; }
    appendChild(child) { this.children.push(child); return child; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    querySelector(selector) {
        let all = this.querySelectorAll('*');
        if (selector === '.hop-button[aria-current="step"]') {
            return all.find(c => c.classList.contains('hop-button') && c.getAttribute('aria-current') === 'step') || null;
        }
        if (selector.startsWith('.')) {
            const cls = selector.substring(1);
            return all.find(c => c.classList.contains(cls)) || null;
        }
        return all.find(c => c.tagName === selector.toUpperCase()) || null;
    }
    querySelectorAll(selector) {
        let res = [];
        for (let c of this.children) {
            res.push(c);
            res.push(...c.querySelectorAll('*'));
        }
        if (selector === '*') return res;
        if (selector === '.hop-button') return res.filter(c => c.classList.contains('hop-button'));
        return res;
    }
    scrollIntoView() {}
    _rect = { left: 0, top: 0, width: 800, height: 600 };
    getBoundingClientRect() { return this._rect; }
    get clientHeight() { return this._rect.height; }
    get textContent() { return this._textContent !== undefined ? this._textContent : (this.attributes['aria-label'] || this.id || this.tagName); }
    set textContent(v) { this._textContent = v; }
}

const elements = new Map();
const document = {
    body: new Element('body'),
    addEventListener() {},
    createElement(tagName) { return new Element('', tagName); },
    getElementById(id) {
        if (!elements.has(id)) elements.set(id, new Element(id));
        return elements.get(id);
    },
    querySelectorAll(selector) {
        if (selector === '.hop-button') {
            return document.getElementById('hop-list').querySelectorAll(selector);
        }
        return [];
    },
    querySelector(selector) {
        if (selector === '.hop-button[aria-current="step"]') {
            return document.getElementById('hop-list').querySelector(selector);
        }
        return null;
    }
};


const window = new EventTarget();
window.matchMedia = () => ({ matches: false });
window.innerWidth = 800;
window.innerHeight = 600;
window.devicePixelRatio = 1;

const THREE = {
    Vector3: class {
        constructor(x=0,y=0,z=0) { this.x=x; this.y=y; this.z=z; }
        set(x,y,z) { this.x=x; this.y=y; this.z=z; return this; }
        copy(v) { this.x=v.x; this.y=v.y; this.z=v.z; return this; }
        clone() { return new THREE.Vector3(this.x, this.y, this.z); }
        sub(v) { this.x-=v.x; this.y-=v.y; this.z-=v.z; return this; }
        normalize() {
            let length = Math.hypot(this.x, this.y, this.z);
            if (length === 0) return this;
            this.x /= length; this.y /= length; this.z /= length;
            return this;
        }
        length() { return Math.hypot(this.x, this.y, this.z); }
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
    PerspectiveCamera: class { position = new THREE.Vector3(); up = new THREE.Vector3(); lookAt() {} updateProjectionMatrix() {} updateMatrixWorld() {} projectionMatrix = { elements: [] }; matrixWorldInverse = { elements: [] }; fov = 45; aspect = 1; },
    WebGLRenderer: class { domElement = new Element(); setSize() {} setPixelRatio() {} render() {} setClearColor() {} capabilities = { getMaxAnisotropy: () => 16 } },
    Points: class { constructor(g,m) { this.geometry = g; this.material = m || { opacity: 1.0 }; } },
    BufferGeometry: class { setAttribute(name, attr) { if(name==='hideMarker') this.marker = attr; } computeBoundingSphere() { this.boundingSphere = { radius: 100 }; } setFromPoints(pts) { this.pts=pts; return this; } getAttribute(name) { return name==='hideMarker'? this.marker : null; } dispose() {} },
    BufferAttribute: class { constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.needsUpdate = false; } },
    Float32BufferAttribute: class {},
    LineDashedMaterial: class { dispose() {} },
    ShaderMaterial: class { dispose() {} },
    Line: class { constructor(g,m){this.geometry=g; this.material=m;} computeLineDistances(){} },
    PointsMaterial: class {},
    TextureLoader: class { load() { return {}; } },
    Color: class { setHex() {} set() {} copy() {} },
    Group: class { add() {} },
    Mesh: class { material = {}; geometry = new THREE.BufferGeometry(); updateWorldMatrix() {} getWorldPosition() {} getWorldScale(v) { v.set(1,1,1); return v; } matrixWorld = {}; },
    Matrix4: class { elements = []; multiplyMatrices() {} }
};

const context = {
    document,
    window,
    THREE,
    console,
    module: { exports: {} },
    fetch: () => Promise.resolve({ json: () => Promise.resolve([]) }),
    requestAnimationFrame: () => {},
    setTimeout: () => {},
    performance: { now: () => 0 },
    EventTarget,
    Event
};

context.OrbitControls = class {
    constructor() { this.target = new THREE.Vector3(); this.maxDistance = 1000; this.enabled = true; }
    update() {}
    addEventListener() {}
};
THREE.OrbitControls = context.OrbitControls;

scripts.forEach(src => vm.runInNewContext(src, context));
for (let key in context.module.exports) {
    context[key] = context.module.exports[key];
}

vm.runInNewContext('const OrbitControls = THREE.OrbitControls;\n' + vmAppJs, context);
elements.set('star-details', vm.runInNewContext('detailsCard', context));

vm.runInNewContext(`
    getGalaxyFrame = () => ({
        viewOut: new THREE.Vector3(0, 0, 1),
        distance: 100,
    });
`, context);

// TDD Tests

console.log("Running TDD Test A: Direct canvas selection resets route committed truth.");
vm.runInNewContext(`
    starData = [
        { n: "Hop0", x: 0, y: 0, z: 0, s: "G", m: 1 },
        { n: "Hop1", x: 10, y: 0, z: 0, s: "G", m: 1 },
        { n: "OffRoute", x: 100, y: 100, z: 100, s: "M", m: 2 }
    ];

    // Set up points buffer
    const pos = new Float32Array([0,0,0, 10,0,0, 100,100,100]);
    starsPoints = {
        geometry: {
            attributes: { position: { array: pos } },
            getAttribute(n) { if (n==="isSelected") return { setX(){}, needsUpdate: false }; return null; }
        }
    };

    applyRouteResult(starData.slice(0, 2));
    finishFlightTransition(true); // Commit Hop0

    // Ensure initial committed state is correct
    let ariaCurrentStepPre = document.querySelector('.hop-button[aria-current="step"]')?.textContent || null;
    let hideMarkerPre = pathNodes.geometry.getAttribute("hideMarker").array[0];

    // Now trigger a direct canvas selection on OffRoute (index 2)
    // We override StarPicking.pickStarScreenSpace to just return 2
    StarPicking.pickStarScreenSpace = () => 2;

    pickStar(0, 0, "mouse");

    let ariaCurrentStepPost = document.querySelector('.hop-button[aria-current="step"]');

    globalThis.testA_result = {
        committedHopIndex,
        currentHopIndex,
        ariaCurrentStepPre,
        hideMarkerPre,
        ariaCurrentStepPost: ariaCurrentStepPost ? true : false,
        btnPrevDisabled: document.getElementById("btn-prev-hop").disabled,
        btnNextDisabled: document.getElementById("btn-next-hop").disabled,
        hopCurrentText: document.getElementById("hop-current").textContent,
        hideMarkerPost0: pathNodes.geometry.getAttribute("hideMarker").array[0],
        hideMarkerPost1: pathNodes.geometry.getAttribute("hideMarker").array[1],
        isFlyingPhase: flightTransitionState.phase
    };
`, context);

const resA = context.testA_result;
assert.strictEqual(resA.committedHopIndex, -1, "GREEN both indices -1");
assert.strictEqual(resA.currentHopIndex, -1, "GREEN both indices -1");
assert.strictEqual(resA.ariaCurrentStepPost, false, "no route aria-current");
assert.strictEqual(resA.hopCurrentText, "NO ROUTE LOCK", "route progress no lock");
assert.strictEqual(resA.btnPrevDisabled, true, "nav disabled");
assert.strictEqual(resA.btnNextDisabled, true, "nav disabled");
assert.strictEqual(resA.hideMarkerPost0, 0, "all route markers unhidden");
assert.strictEqual(resA.hideMarkerPost1, 0, "all route markers unhidden");
assert.notStrictEqual(resA.isFlyingPhase, "SLIDE", "next route focus is not SLIDE");


console.log("Running TDD Test B: clearRoute during active transition");
vm.runInNewContext(`
    applyRouteResult(starData.slice(0, 2));
    finishFlightTransition(true); // Commit Hop0

    // Start transition to Hop1
    focusHop(1);

    var originalShowStarDetailsB = typeof showStarDetails !== "undefined" ? showStarDetails : null;
    var showStarDetailsRestored = [];
    globalThis.showStarDetails = (star, opts) => {
        showStarDetailsRestored.push(star);
        if (originalShowStarDetailsB) originalShowStarDetailsB(star, opts);
    };

    // Call clearRoute during active transition
    clearRoute();

    globalThis.showStarDetails = originalShowStarDetailsB;

    globalThis.testB_result = {
        showStarDetailsRestored,
        committedHopIndex,
        currentHopIndex,
        currentRouteHopsLen: currentRouteHops.length,
        resolvedRouteStarsLen: resolvedRouteStars.length,
        pathLine,
        pathNodes,
        hopListChildren: document.getElementById("hop-list").children.length,
        detailsHidden: document.getElementById("star-details").hidden,
        selectedStarIndex: currentSelectedStarIndex,
        btnPrevDisabled: document.getElementById("btn-prev-hop").disabled,
        btnNextDisabled: document.getElementById("btn-next-hop").disabled
    };
`, context);

const resB = context.testB_result;
assert.strictEqual(resB.showStarDetailsRestored.length, 0, "GREEN showStarDetails not called with restored star");
assert.strictEqual(resB.committedHopIndex, -1, "GREEN both indices -1");
assert.strictEqual(resB.currentHopIndex, -1, "GREEN both indices -1");
assert.strictEqual(resB.currentRouteHopsLen, 0, "route arrays cleared");
assert.strictEqual(resB.resolvedRouteStarsLen, 0, "route arrays cleared");
assert.strictEqual(resB.pathLine, null, "path geometry cleared");
assert.strictEqual(resB.pathNodes, null, "path geometry cleared");
assert.strictEqual(resB.hopListChildren, 0, "list cleared");
assert.strictEqual(resB.detailsHidden, true, "details cleared");
assert.strictEqual(resB.selectedStarIndex, -1, "selection cleared");
assert.strictEqual(resB.btnPrevDisabled, true, "buttons disabled");
assert.strictEqual(resB.btnNextDisabled, true, "buttons disabled");



console.log("Running TDD Test C: Assert aria-current strictly reflects committed during transitions");
vm.runInNewContext(`
    applyRouteResult(starData.slice(0, 2));
    finishFlightTransition(true); // Commit 0

    let ariaCurrentCommit0 = document.querySelector('.hop-button[aria-current="step"]')?.textContent || null;

    focusHop(1); // Pending 1
    let ariaCurrentPending1 = document.querySelector('.hop-button[aria-current="step"]')?.textContent || null;

    finishFlightTransition(true); // Commit 1
    let ariaCurrentCommit1 = document.querySelector('.hop-button[aria-current="step"]')?.textContent || null;

    focusHop(0); // Pending 0
    interruptTransition(flightTransitionState);
    finishFlightTransition(false); // Interrupted
    let ariaCurrentInterrupt = document.querySelector('.hop-button[aria-current="step"]')?.textContent || null;

    clearRoute();
    let ariaCurrentClear = document.querySelector('.hop-button[aria-current="step"]');

    globalThis.testC_result = {
        ariaCurrentCommit0,
        ariaCurrentPending1,
        ariaCurrentCommit1,
        ariaCurrentInterrupt,
        ariaCurrentClear: ariaCurrentClear ? true : false
    };
`, context);

const resC = context.testC_result;
assert.strictEqual(resC.ariaCurrentCommit0, "Focus route hop 1: Hop0", "Commit 0 has aria-current Hop0");
assert.strictEqual(resC.ariaCurrentPending1, "Focus route hop 1: Hop0", "Pending 1 retains aria-current Hop0");
assert.strictEqual(resC.ariaCurrentCommit1, "Focus route hop 2: Hop1", "Commit 1 has aria-current Hop1");
assert.strictEqual(resC.ariaCurrentInterrupt, "Focus route hop 2: Hop1", "Interruption retains aria-current Hop1");
assert.strictEqual(resC.ariaCurrentClear, false, "clearRoute removes aria-current");

console.log("Running TDD Test D: clearRoute never exposes/restores the old committed identity during cleanup");
vm.runInNewContext(`
    applyRouteResult(starData.slice(0, 2));
    finishFlightTransition(true); // Commit 0

    // Start transition to Hop1
    focusHop(1);

    let originalShowStarDetails = typeof showStarDetails !== "undefined" ? showStarDetails : null;
    let showStarDetailsCalls = [];
    globalThis.showStarDetails = (star, opts) => {
        showStarDetailsCalls.push({ star, opts });
        if (originalShowStarDetails) originalShowStarDetails(star, opts);
    };

    let originalHighlightStar = typeof highlightStar !== "undefined" ? highlightStar : null;
    let highlightStarCalls = [];
    globalThis.highlightStar = (idx) => {
        highlightStarCalls.push(idx);
        if (originalHighlightStar) originalHighlightStar(idx);
    };

    let originalUpdateHopNavigation = typeof updateHopNavigation !== "undefined" ? updateHopNavigation : null;
    let updateHopNavigationCalls = [];
    globalThis.updateHopNavigation = () => {
        updateHopNavigationCalls.push({ committed: committedHopIndex, current: currentHopIndex });
        if (originalUpdateHopNavigation) originalUpdateHopNavigation();
    };

    clearRoute();

    globalThis.testD_result = {
        showStarDetailsCalls,
        highlightStarCalls,
        updateHopNavigationCalls
    };

    globalThis.showStarDetails = originalShowStarDetails;
    globalThis.highlightStar = originalHighlightStar;
    globalThis.updateHopNavigation = originalUpdateHopNavigation;
`, context);

const resD = context.testD_result;
assert.strictEqual(resD.showStarDetailsCalls.length, 0, "GREEN clearRoute should not restore details for old committed hop");
assert.strictEqual(resD.highlightStarCalls.length, 0, "GREEN clearRoute should not highlight old committed hop");
for (let call of resD.updateHopNavigationCalls) {
    assert.strictEqual(call.committed, -1, "GREEN no updateHopNavigation with stale committedHopIndex");
}

console.log("GREEN! All TDD tests passed.");
