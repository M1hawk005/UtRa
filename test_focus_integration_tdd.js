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

console.log("Running TDD Test E: FOCUS orientation preserving, distances, never MAP_ARC");
vm.runInNewContext(`
    starData = [
        { n: "Hop0", x: 0, y: 0, z: 0, s: "G", m: 1 },
        { n: "Hop1", x: 10, y: 0, z: 0, s: "G", m: 1 },
        { n: "TargetStar", x: 100, y: 100, z: 100, s: "M", m: 2 }
    ];

    const pos = new Float32Array([0,0,0, 10,0,0, 100,100,100]);
    starsPoints = {
        geometry: {
            attributes: { position: { array: pos } },
            getAttribute(n) { if (n==="isSelected") return { setX(){}, needsUpdate: false }; return null; }
        }
    };

    // Set initial camera pose
    controls.target.set(0, 0, 0);
    camera.position.set(0, 100, 0); // View direction is (0, 1, 0) relative to target

    // Pick TargetStar
    StarPicking.pickStarScreenSpace = () => 2;
    pickStar(0, 0, "mouse");

    let isFocusSet = flightTransitionState.phase === 'FOCUS';

    let frames = [];
    for(let i=0; i<60; i++) {
        updateFlight(16);
        let currentDir = camera.position.clone().sub(controls.target).normalize();
        let currentDist = camera.position.distanceTo(controls.target);
        frames.push({
            dirX: currentDir.x, dirY: currentDir.y, dirZ: currentDir.z,
            dist: currentDist
        });
    }

    globalThis.testE_result = {
        isFocusSet,
        frames,
        terminalCam: camera.position.clone(),
        terminalTarget: controls.target.clone()
    };
`, context);

const resE = context.testE_result;
assert.strictEqual(resE.isFocusSet, true, "FOCUS phase should be set instead of MAP_ARC");
const expectedDist = Math.hypot(0, -6.32, 18.97);

resE.frames.forEach((f, idx) => {
    assert.ok(Math.abs(f.dirX - 0) < 1e-4, "Dir X must remain 0");
    assert.ok(Math.abs(f.dirY - 1) < 1e-4, "Dir Y must remain 1");
    assert.ok(Math.abs(f.dirZ - 0) < 1e-4, "Dir Z must remain 0");
    if(idx === 59) { // terminal frame
        assert.ok(Math.abs(f.dist - expectedDist) < 1e-4, "Terminal distance must be inspection dist: " + expectedDist + " got " + f.dist);
    }
});

console.log("Running TDD Test F: Timing of 600ms focus with 10fps, 20fps, 60fps and multi-second suspension");

vm.runInNewContext(`
    function runSimulation(fps, durationMs, suspensionStart, suspensionDuration, interruptAt, reducedMotion, routeBehavior) {
        flightTransitionState = createTransition({ duration: durationMs, fadeFraction: 0.2, reducedMotion: !!reducedMotion, isRouteHop: !!routeBehavior, isFocus: !routeBehavior });
        startTransition(flightTransitionState, { reducedMotion: !!reducedMotion, isRouteHop: !!routeBehavior, isFocus: !routeBehavior });

        let elapsedWallTime = 0;
        const deltaMs = 1000 / fps;
        let reachedTerminal = false;
        let flightTime = 0;

        for (let t = 0; t < 10000; t += deltaMs) {
            let currentDelta = deltaMs;

            if (suspensionStart && elapsedWallTime >= suspensionStart && elapsedWallTime < suspensionStart + suspensionDuration) {
                currentDelta += suspensionDuration;
                t += suspensionDuration;
                suspensionStart = 0;
            }

            if (interruptAt && elapsedWallTime >= interruptAt) {
                interruptTransition(flightTransitionState);
                interruptAt = 0;
            }

            updateFlight(currentDelta);
            elapsedWallTime += currentDelta;
            flightTime += currentDelta;

            if (!flightTransitionState.isActive) {
                reachedTerminal = true;
                break;
            }
        }

        return { reachedTerminal, elapsedWallTime, flightTime };
    }

    globalThis.testF_result_10fps = runSimulation(10, 600);
    globalThis.testF_result_20fps = runSimulation(20, 600);
    globalThis.testF_result_60fps = runSimulation(60, 600);
    globalThis.testF_result_suspend = runSimulation(60, 600, 200, 5000);
    globalThis.testF_result_interrupt = runSimulation(60, 600, null, null, 100);
    globalThis.testF_result_reduced = runSimulation(60, 600, null, null, null, true);
    globalThis.testF_result_route = runSimulation(60, 600, null, null, null, false, true);

`, context);

assert.ok(context.testF_result_10fps.elapsedWallTime <= 900, "10fps should complete within 900ms");
assert.ok(context.testF_result_20fps.elapsedWallTime <= 900, "20fps should complete within 900ms");
assert.ok(context.testF_result_60fps.elapsedWallTime <= 900, "60fps should complete within 900ms");
assert.ok(context.testF_result_suspend.elapsedWallTime > 5000, "Suspension should track properly");
assert.ok(context.testF_result_interrupt.elapsedWallTime < 600, "Interrupt should end early");

console.log("Running TDD Test G: Sgr A* details semantics and catalog nonregression");

vm.runInNewContext(`
    let catalogStar = { n: "Test Catalog Star", s: "G2V", m: 4.5, x: 1, y: 1, z: 1 };
    let sgrAStar = { n: "Sagittarius A*", isSgrA: true, x: 2, y: 2, z: 2 };

    showStarDetails(catalogStar);
    globalThis.testG_catalogHtml = detailsCard.children.map(c => {
        if (c.tagName === 'DL') return c.children.map(cc => cc.outerHTML || cc.textContent).join('');
        return c.outerHTML || c.textContent;
    }).join('');

    showStarDetails(sgrAStar);
    globalThis.testG_sgrAHtml = detailsCard.children.map(c => {
        if (c.tagName === 'DL') return c.children.map(cc => cc.outerHTML || cc.textContent).join('');
        return c.outerHTML || c.textContent;
    }).join('');
`, context);

assert.ok(context.testG_catalogHtml.includes("SPECTRAL CLASS"), "Catalog star must have SPECTRAL CLASS");
assert.ok(!context.testG_sgrAHtml.includes("SPECTRAL CLASS"), "Sgr A* must not have SPECTRAL CLASS");
assert.ok(!context.testG_sgrAHtml.includes("MAGNITUDE"), "Sgr A* must not have MAGNITUDE");
assert.ok(!context.testG_sgrAHtml.includes("PROVENANCE") && !context.testG_sgrAHtml.includes("Inferred"), "Sgr A* must not have PROVENANCE/Inferred");
assert.ok(context.testG_sgrAHtml.includes("Supermassive black hole"), "Sgr A* must identify as Supermassive black hole");
assert.ok(context.testG_sgrAHtml.includes("ROUTE ROLE"), "Sgr A* must have ROUTE ROLE");
assert.ok(context.testG_sgrAHtml.includes("SEARCH WIKIPEDIA"), "Sgr A* must have Wiki link");

console.log("GREEN! Focus Integration Tests Passed.");
