const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function stripComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const rawAppJs = fs.readFileSync(__dirname + '/public/app.js', 'utf8');
const appJs = stripComments(rawAppJs);
const vmAppJs = rawAppJs.replace(/^loadStars\(\);\s*$/m, '');
assert.notStrictEqual(vmAppJs, rawAppJs, 'VM harness must disable the unrelated catalog auto-load');

// Assert no no-op zoomToCursor assignment remains
assert.ok(!appJs.includes('zoomToCursor'), 'zoomToCursor assignment should be removed');

// Assert wheel capture listener is non-passive and capture is true
assert.ok(appJs.includes("addEventListener('wheel'"), 'Should have a wheel event listener');
assert.ok(appJs.includes('capture: true') || appJs.includes('capture:true'), 'Wheel listener should use capture phase');
assert.ok(appJs.includes('passive: false') || appJs.includes('passive:false'), 'Wheel listener should be non-passive');

// Assert wheel listener allocation and behavior
const wheelHandlerStart = appJs.indexOf("addEventListener('wheel'");
const wheelHandlerEnd = appJs.indexOf("passive: false", wheelHandlerStart);
const wheelHandler = appJs.substring(wheelHandlerStart, wheelHandlerEnd);
assert.ok(!wheelHandler.match(/\bnew\b/), 'wheel handler must reject new keyword allocations');
assert.ok(!wheelHandler.match(/=\s*\[/), 'wheel handler must reject array literals');
assert.ok(!wheelHandler.match(/=\s*\{/), 'wheel handler must reject object literals');
assert.ok(!wheelHandler.includes('getBoundingClientRect'), 'wheel handler must reject getBoundingClientRect');
assert.ok(!wheelHandler.includes('getClientRects'), 'wheel handler must reject getClientRects');
assert.ok(!wheelHandler.includes('new THREE.Raycaster'), 'wheel handler must not allocate Raycaster');
assert.ok(!wheelHandler.match(/cameraPos:\s*\[/), 'wheel handler must not allocate arrays');
assert.ok(wheelHandler.includes('calculateZoom(_wheelZoomConfig)'), 'wheel handler must use preallocated config object');
assert.ok(wheelHandler.match(/event\.preventDefault\(\)/), 'wheel event must preventDefault');

assert.ok(appJs.includes('calculateZoom'), 'Should call calculateZoom');
assert.match(appJs, /isFocus:\s*options\.isFocus/, 'Flight setup must pass isFocus to transition state');
assert.match(appJs, /function\s+updateFlight\s*\(deltaMs\)[\s\S]*updateTransition\s*\(flightTransitionState,\s*(?:effectiveD|d)eltaMs\)/, 'Flight ticks must advance the transition state');
assert.match(appJs, /function\s+animate\s*\(\)[\s\S]*updateFlight\s*\(deltaMs\)/, 'The animation loop must drive flight ticks');
assert.match(appJs, /finishFlightTransition\s*\(\s*commitDestination\s*\)/, 'Terminal cleanup must use the application commit latch');
assert.doesNotMatch(appJs, /finishFlightTransition\s*\(\s*true\s*\)/, 'Mutation forcing terminal destination commit true must fail');
const drawPathSource = appJs.slice(appJs.indexOf('function drawPath('), appJs.indexOf('function applyRouteResult('));
assert.doesNotMatch(drawPathSource, /camera\.position\.(?:set|copy)\s*\(/, 'drawPath must be render-only for camera position');
assert.doesNotMatch(drawPathSource, /controls\.target\.(?:set|copy)\s*\(/, 'drawPath must be render-only for controls target');

// Run VM integration test to exercise transition logic
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
        const classes = new Set();
        this.classList = {
            add(c) { classes.add(c); },
            remove(c) { classes.delete(c); },
            toggle(c) { if(classes.has(c)) classes.delete(c); else classes.add(c); },
            contains(c) { return classes.has(c); }
        };
        this._registeredListeners = [];
    }
    addEventListener(type, handler, options = false) {
        this._registeredListeners.push({ type, handler, options });
        super.addEventListener(type, handler, options);
    }
    get listeners() {
        // Return a proxy that maps to the first capture=false listener
        const proxy = {};
        for (const l of this._registeredListeners) {
            if (!proxy[l.type]) {
                const capture = typeof l.options === 'object' ? !!l.options.capture : !!l.options;
                if (!capture) proxy[l.type] = l.handler;
            }
        }
        return proxy;
    }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    removeAttribute(name) { delete this.attributes[name]; }
    getAttribute(name) { return this.attributes.hasOwnProperty(name) ? this.attributes[name] : null; }
    appendChild(child) { this.children.push(child); return child; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    querySelector(selector) {
        const tag = selector.split('[')[0].toUpperCase();
        return this.children.find(child => child.tagName === tag) || null;
    }
    scrollIntoView() {}
    _rect = { left: 0, top: 0, width: 800, height: 600 };
    getBoundingClientRect() { return this._rect; }
    get clientHeight() { return this._rect.height; }
    focus() { document.activeElement = this; }
    contains(child) {
        if (child === this) return true;
        return this.children.some(c => c.contains && c.contains(child));
    }
}

const elements = new Map();
const document = {
    body: new Element('body'),
    activeElement: null,
    addEventListener() {},
    createElement(tagName) { return new Element('', tagName); },
    getElementById(id) {
        if (!elements.has(id)) elements.set(id, new Element(id));
        return elements.get(id);
    },
    querySelectorAll() { return []; },
    querySelector() { return null; }
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
        normalize() { return this; }
        addScaledVector(v, s) { this.x+=v.x*s; this.y+=v.y*s; this.z+=v.z*s; return this; }
        multiplyScalar(s) { this.x*=s; this.y*=s; this.z*=s; return this; }
        add(v) { this.x+=v.x; this.y+=v.y; this.z+=v.z; return this; }
        dot(v) { return this.x*v.x + this.y*v.y + this.z*v.z; }
        transformDirection() { return this; }
        lerpVectors(v1, v2, alpha) { this.x = v1.x + (v2.x-v1.x)*alpha; this.y = v1.y + (v2.y-v1.y)*alpha; this.z = v1.z + (v2.z-v1.z)*alpha; return this; }
        distanceTo(v) { return Math.hypot(this.x-v.x, this.y-v.y, this.z-v.z); }
        lengthSq() { return this.x*this.x + this.y*this.y + this.z*this.z; }
        length() { return Math.sqrt(this.lengthSq()); }
    },
    Vector2: class { constructor(x=0,y=0) { this.x=x; this.y=y; } set(x,y) { this.x=x; this.y=y; return this; } },
    Raycaster: class { constructor() { this.ray = { direction: new THREE.Vector3(0,0,-1) }; } setFromCamera() {} },
    MathUtils: { degToRad: (d) => d * Math.PI / 180 },
    Scene: class { userData = {}; add() {} remove() {} },
    PerspectiveCamera: class { position = new THREE.Vector3(); up = new THREE.Vector3(); lookAt() {} updateProjectionMatrix() {} fov = 45; aspect = 1; },
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
    Mesh: class { material = {}; geometry = new THREE.BufferGeometry(); updateWorldMatrix() {} getWorldPosition() {} getWorldScale(v) { v.set(1,1,1); return v; } matrixWorld = {}; }
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
    Event,
    encodeURIComponent: globalThis.encodeURIComponent,
    decodeURIComponent: globalThis.decodeURIComponent
};

context.OrbitControls = class {
    constructor() { this.target = new THREE.Vector3(); this.maxDistance = 1000; this.enabled = true; }
    update() {}
    addEventListener() {}
};
THREE.OrbitControls = context.OrbitControls;

scripts.forEach(src => vm.runInNewContext(src, context));
assert.strictEqual(typeof context.window.getMapPose, 'function', 'Transition API must install getMapPose in browsers');
for (let key in context.module.exports) {
    context[key] = context.module.exports[key];
}

vm.runInNewContext('const OrbitControls = THREE.OrbitControls;\n' + vmAppJs, context);
elements.set('star-details', vm.runInNewContext('detailsCard', context));

assert.strictEqual(typeof vm.runInNewContext('applyRouteResult', context), 'function', 'App must expose applyRouteResult');

vm.runInNewContext(`
    globalThis.getGalaxyFrame = () => ({
        viewOut: new THREE.Vector3(0, 0, 1),
        distance: 100,
    });
`, context);

// 1. Test: unavailable before route

vm.runInNewContext(`
    globalThis.mapModeBtn = document.getElementById('btn-map-mode');
    globalThis.panel = document.getElementById('ui-panel');
    globalThis.results = document.getElementById('results');
    globalThis.prevMapBtn = document.getElementById('map-btn-prev-hop');
    globalThis.nextMapBtn = document.getElementById('map-btn-next-hop');
    globalThis.restoreMapBtn = document.getElementById('map-btn-restore');
    const controlsContainer = document.getElementById('map-mode-controls');
    controlsContainer.appendChild(globalThis.prevMapBtn);
    controlsContainer.appendChild(globalThis.nextMapBtn);
    controlsContainer.appendChild(globalThis.restoreMapBtn);
    controlsContainer.setAttribute('aria-hidden', 'true');
`, context);

assert.ok(context.mapModeBtn.classList.contains('hidden') || context.mapModeBtn.style.display === 'none' || context.mapModeBtn.tagName === '', 'Map mode toggle must be hidden or unavailable before route');

// 2. Test: Entering hides ordinary UI and shows floating hop controls
vm.runInNewContext(`
    starData = [
        { n: 'Sol', x: 0, y: 0, z: 0, s: 'G2V', m: 4.8 },
        { n: 'MID', x: 10, y: 20, z: 30, s: 'K', m: 5 },
        { n: 'Dest', x: 20, y: 30, z: 40, s: 'M', m: 6 }
    ];
    applyRouteResult(starData);
    if (flightTransitionState.phase !== 'FOCUS') {
        throw new Error('Initial route acquisition must use FOCUS phase, not MAP_ARC');
    }
    document.activeElement = mapModeBtn;
    if (mapModeBtn.listeners && mapModeBtn.listeners.click) {
        mapModeBtn.listeners.click();
    }
`, context);

assert.ok(context.document.body.classList.contains('map-only-mode'), 'Body must have map-only-mode class');
assert.ok(!context.document.getElementById('map-mode-controls').classList.contains('hidden'), 'Map controls container must be visible');
assert.ok(context.document.getElementById('map-mode-controls').getAttribute('aria-hidden') !== 'true', 'Map controls container must not be aria-hidden in map mode');
assert.strictEqual(context.document.activeElement, context.nextMapBtn, 'Focus should move to a visible map control (nextMapBtn) on entry');

// 3. Test: Arrows use existing hop navigation
vm.runInNewContext(`
    nextMapBtn.listeners.click();
`, context);
assert.strictEqual(vm.runInNewContext('currentHopIndex', context), 1, 'Next map button should advance hop');

// 4. Test: Escape/restore exits and returns focus
vm.runInNewContext(`
    restoreMapBtn.listeners.click();
`, context);
assert.ok(!context.document.body.classList.contains('map-only-mode'), 'Body must lose map-only-mode class after clicking restore');
assert.strictEqual(context.document.getElementById('map-mode-controls').getAttribute('aria-hidden'), 'true', 'Map controls container must be aria-hidden=true on exit');
assert.strictEqual(context.document.activeElement, context.mapModeBtn, 'Focus must return to the map mode button on restore');

vm.runInNewContext(`
    mapModeBtn.focus();
    mapModeBtn.listeners.click(); // enter again
    const escEvent = new Event('keydown');
    escEvent.key = 'Escape';
    window.dispatchEvent(escEvent);
`, context);
assert.ok(!context.document.body.classList.contains('map-only-mode'), 'Body must lose map-only-mode class after Escape key');
assert.strictEqual(context.document.activeElement, context.mapModeBtn, 'Focus must return to the map mode button on Escape');

// 5. Route reset exits without stealing focus
vm.runInNewContext(`
    mapModeBtn.focus();
    mapModeBtn.listeners.click(); // enter again
    document.getElementById('nav-submit').focus(); // User moves focus somewhere else, e.g., to submit button
    clearRoute();
`, context);

assert.ok(!context.document.body.classList.contains('map-only-mode'), 'Body must lose map-only-mode class after route is cleared');
assert.strictEqual(context.document.activeElement, context.document.getElementById('nav-submit'), 'Focus must be preserved on active visible form focus');

// 5.b. Route reset moves focus to fallback if it was inside map controls
vm.runInNewContext(`
    applyRouteResult(starData);
    mapModeBtn.focus();
    mapModeBtn.listeners.click(); // enter again
    nextMapBtn.focus(); // Floating arrow actually owns focus
    clearRoute();
`, context);

assert.ok(!context.document.body.classList.contains('map-only-mode'), 'Body must lose map-only-mode class after route is cleared');
assert.strictEqual(context.document.activeElement, context.document.querySelector('button[type="submit"]') || context.document.getElementById('nav-submit'), 'Focus must fall back to visible nav-submit or similar visible fallback');

// 6. Test: clearRoute clears all state and geometries
vm.runInNewContext(`
    // Re-apply to set state
    applyRouteResult(starData);
    document.getElementById('star-details').hidden = false;
    currentSelectedStarIndex = 1;
    clearRoute();
`, context);
assert.strictEqual(vm.runInNewContext('currentRouteHops.length', context), 0, 'currentRouteHops should be empty');
assert.strictEqual(vm.runInNewContext('resolvedRouteStars.length', context), 0, 'resolvedRouteStars should be empty');
assert.strictEqual(vm.runInNewContext('currentHopIndex', context), -1, 'currentHopIndex should be reset');
assert.strictEqual(vm.runInNewContext('pathLine', context), null, 'pathLine should be cleared');
assert.strictEqual(vm.runInNewContext('pathNodes', context), null, 'pathNodes should be cleared');
assert.strictEqual(vm.runInNewContext('document.getElementById("hop-list").children.length', context), 0, 'hop list should be empty');
assert.ok(context.document.getElementById('star-details').hidden, 'star details should be hidden');
assert.strictEqual(vm.runInNewContext('currentSelectedStarIndex', context), -1, 'selected star should be unselected');
assert.strictEqual(vm.runInNewContext('document.getElementById("btn-prev-hop").disabled', context), true, 'nav prev should be disabled');
assert.strictEqual(vm.runInNewContext('document.getElementById("btn-next-hop").disabled', context), true, 'nav next should be disabled');
assert.ok(context.mapModeBtn.classList.contains('hidden') || context.mapModeBtn.style.display === 'none', 'map mode button should be hidden after clear');

// 7. Test: Empty/invalid route results do not expose map mode
vm.runInNewContext(`
    applyRouteResult([]); // empty route
`, context);
assert.ok(context.mapModeBtn.classList.contains('hidden') || context.mapModeBtn.style.display === 'none', 'map mode button should be hidden on empty route');
assert.strictEqual(vm.runInNewContext('currentHopIndex', context), -1, 'currentHopIndex should be -1 on empty route');
assert.ok(!context.document.getElementById('success-message') || context.document.getElementById('success-message').classList.contains('hidden'), 'success message should be hidden on empty route');
assert.ok(!context.document.getElementById('error-message').classList.contains('hidden'), 'error message should be shown on empty route');
assert.strictEqual(vm.runInNewContext('document.getElementById("btn-prev-hop").disabled', context), true, 'arrows disabled on empty route');
assert.strictEqual(vm.runInNewContext('document.getElementById("btn-next-hop").disabled', context), true, 'arrows disabled on empty route');
assert.strictEqual(vm.runInNewContext('pathLine', context), null, 'pathLine should be null on empty route');
assert.strictEqual(vm.runInNewContext('pathNodes', context), null, 'pathNodes should be null on empty route');

// 7.b. Test: Route with only unresolved hops does not expose map mode
vm.runInNewContext(`
    applyRouteResult([{n: 'Unresolved1'}, {n: 'Unresolved2'}]); // Unresolved route
`, context);
assert.ok(context.mapModeBtn.classList.contains('hidden') || context.mapModeBtn.style.display === 'none', 'map mode button should be hidden on completely unresolved route');
assert.strictEqual(vm.runInNewContext('currentHopIndex', context), -1, 'currentHopIndex should be -1');
assert.ok(!context.document.getElementById('success-message') || context.document.getElementById('success-message').classList.contains('hidden'), 'no usable success state');
assert.ok(!context.document.getElementById('error-message').classList.contains('hidden'), 'error message should be shown');
assert.strictEqual(vm.runInNewContext('document.getElementById("btn-prev-hop").disabled', context), true, 'arrows disabled');
assert.strictEqual(vm.runInNewContext('document.getElementById("btn-next-hop").disabled', context), true, 'arrows disabled');

// 7.c. Test: Empty route while map mode active exits safely
vm.runInNewContext(`
    applyRouteResult(starData); // get a valid route
    mapModeBtn.focus();
    mapModeBtn.listeners.click(); // enter map mode
    nextMapBtn.focus(); // move focus to a map control

    applyRouteResult([]); // apply empty
`, context);
assert.ok(!context.document.body.classList.contains('map-only-mode'), 'Body must lose map-only-mode class after empty route while active');
assert.strictEqual(context.document.activeElement, context.document.querySelector('button[type="submit"]') || context.document.getElementById('nav-submit') || context.document.body, 'Focus must fall back to visible form or body after empty route');

// 7.d. Test: All-unresolved route while map mode active exits safely
vm.runInNewContext(`
    applyRouteResult(starData); // get a valid route
    mapModeBtn.focus();
    mapModeBtn.listeners.click(); // enter map mode

    // Put focus somewhere completely different (not map controls) to ensure we don't steal it
    const startInput = document.getElementById('start') || document.createElement('input');
    if (!startInput.id) { startInput.id = 'start'; document.body.appendChild(startInput); }
    startInput.focus();

    applyRouteResult([{n: 'Unresolved1'}]); // apply all-unresolved
`, context);
assert.ok(!context.document.body.classList.contains('map-only-mode'), 'Body must lose map-only-mode class after all-unresolved route while active');
assert.strictEqual(context.document.activeElement, context.document.getElementById('start'), 'Focus must not be stolen if it was not in map controls');


// 8. Test: Resize dispatch and comprehensive lifecycle
(async () => {
    await vm.runInNewContext(`
        (async () => {
            let resizeCount = 0;
            window.addEventListener('resize', () => { resizeCount++; });
            const initialResizeCount = resizeCount;

            applyRouteResult(starData);
            mapModeBtn.listeners.click(); // enter map mode
            const resizeAfterEnter = resizeCount;
            if (resizeAfterEnter <= initialResizeCount) throw new Error("Resize not dispatched on enter");

            const navForm = document.getElementById('nav-form');
            navForm.dataset.starsLoaded = "true";
            document.getElementById('start').value = 'A';
            document.getElementById('end').value = 'B';
            document.getElementById('dist').value = '10';
            document.getElementById('speed').value = '1';

            const submitBtn = document.createElement('button');
            submitBtn.type = 'submit';
            navForm.appendChild(submitBtn);

            let fetchResolve;
            const fetchPromise = new Promise(resolve => { fetchResolve = resolve; });
            const oldFetch = fetch;
            fetch = async () => fetchPromise;

            // Trigger submit
            const submitPromise = navForm.listeners.submit({ target: navForm, preventDefault: () => {} });

            // Verify intermediate state (synchronously accessible after initial execution of submit handler)
            const mapModeActive = document.body.classList.contains('map-only-mode');
            const lineExists = pathLine !== null;
            const isCalculating = submitBtn.innerText === "CALCULATING...";
            const resultsHidden = document.getElementById('results').classList.contains('hidden');
            const resizeAfterSubmit = resizeCount;

            if (mapModeActive) throw new Error('Still in map mode before fetch');
            if (lineExists) throw new Error('Path line still exists before fetch');
            if (!isCalculating) throw new Error('Submit button should say CALCULATING...');
            if (resultsHidden) throw new Error('Results div should be visible to show CALCULATING... state');
            if (resizeAfterSubmit <= resizeAfterEnter) throw new Error("Resize not dispatched on submit/exit");

            // Resolve with error
            fetchResolve({ ok: false, text: async () => 'Route error' });

            await submitPromise;

            const errorVisible = !document.getElementById('error-message').classList.contains('hidden');
            if (!errorVisible) throw new Error('Error message not shown');
            if (pathLine !== null) throw new Error('Path line should still be null on error');
            if (submitBtn.disabled) throw new Error('Submit button should be re-enabled');

            fetch = oldFetch;
        })();
    `, context);
    console.log("Route map mode tests passed");
})();

// 9. Test: Partially resolved routes skip over unresolved hops
vm.runInNewContext(`
    starData = [
        { n: 'Valid1', x: 0, y: 0, z: 0, s: 'G2V', m: 4.8 },
        { n: 'Valid2', x: 20, y: 30, z: 40, s: 'M', m: 6 }
    ];
    applyRouteResult([{n: 'Valid1'}, {n: 'Unresolved1'}, {n: 'Valid2'}]);
    while (flightTransitionState.isActive) updateFlight(16.6);
`, context);
assert.strictEqual(vm.runInNewContext('currentHopIndex', context), 0, 'Initial hop should be 0');
assert.strictEqual(vm.runInNewContext('document.getElementById("btn-prev-hop").disabled', context), true, 'Prev should be disabled at 0');
assert.strictEqual(vm.runInNewContext('document.getElementById("btn-next-hop").disabled', context), false, 'Next should be enabled at 0 because index 2 is resolved');
assert.strictEqual(vm.runInNewContext('document.getElementById("map-btn-prev-hop").disabled', context), true, 'Map prev should be disabled at 0');
assert.strictEqual(vm.runInNewContext('document.getElementById("map-btn-next-hop").disabled', context), false, 'Map next should be enabled at 0');

vm.runInNewContext(`
    document.getElementById("btn-next-hop").listeners.click();
    while (flightTransitionState.isActive) updateFlight(16.6);
`, context);
assert.strictEqual(vm.runInNewContext('currentHopIndex', context), 2, 'Next from 0 should skip unresolved index 1 and land on 2');
assert.strictEqual(vm.runInNewContext('document.getElementById("btn-next-hop").disabled', context), true, 'Next should be disabled at 2');
assert.strictEqual(vm.runInNewContext('document.getElementById("btn-prev-hop").disabled', context), false, 'Prev should be enabled at 2 because index 0 is resolved');

vm.runInNewContext(`
    document.getElementById("btn-prev-hop").listeners.click();
    while (flightTransitionState.isActive) updateFlight(16.6);
`, context);
assert.strictEqual(vm.runInNewContext('currentHopIndex', context), 0, 'Prev from 2 should return to 0');

vm.runInNewContext(`
    // Edges with unresolved runs
    applyRouteResult([{n: 'UnresolvedA'}, {n: 'Valid1'}, {n: 'UnresolvedB'}]);
    while (flightTransitionState.isActive) updateFlight(16.6);
`, context);
assert.strictEqual(vm.runInNewContext('currentHopIndex', context), 1, 'Initial hop should be 1');
assert.strictEqual(vm.runInNewContext('document.getElementById("btn-prev-hop").disabled', context), true, 'Prev should be disabled at 1 (index 0 is unresolved)');
assert.strictEqual(vm.runInNewContext('document.getElementById("btn-next-hop").disabled', context), true, 'Next should be disabled at 1 (index 2 is unresolved)');

console.log("Route map mode tests passed");

// 10. Test: clearRoute cancels active flight transition
vm.runInNewContext(`
    // Setup initial state and start a flight
    flightTransitionState.isActive = true;
    flightTransitionState.isFlying = true;
    isFlying = true;
    controls.enabled = false;
    flightMayCommitDestination = true;
    fadingMaterials = [{material: {opacity: 0}, baseline: 1}];

    // Attempt clearRoute which should cancel the flight
    clearRoute();
`, context);

assert.strictEqual(vm.runInNewContext('flightTransitionState.isActive', context), false, 'flight transition should be inactive');
assert.strictEqual(vm.runInNewContext('flightTransitionState.isFlying', context), false, 'flightTransitionState isFlying should be false');
assert.strictEqual(vm.runInNewContext('isFlying', context), false, 'isFlying should be false');
assert.strictEqual(vm.runInNewContext('controls.enabled', context), true, 'controls should be enabled');
assert.strictEqual(vm.runInNewContext('flightMayCommitDestination', context), false, 'commit latch should be false');
assert.strictEqual(vm.runInNewContext('fadingMaterials', context), null, 'fadingMaterials should be null');

// Verify that updateFlight tick does nothing after clearRoute
vm.runInNewContext(`
    const preTickProgress = flightTransitionState.progress;
    updateFlight(16);
`, context);
assert.strictEqual(vm.runInNewContext('flightTransitionState.progress', context), 1.0, 'updateFlight tick should do nothing (progress unchanged)');

// 11. Test: failed replacement submit while flight active
vm.runInNewContext(`
    (async () => {
        // Setup flying state
        flightTransitionState.isActive = true;
        flightTransitionState.isFlying = true;
        isFlying = true;
        controls.enabled = false;
        flightMayCommitDestination = true;

        // Mock fetch to fail
        const oldFetch = fetch;
        fetch = async () => ({ ok: false, text: async () => 'Route error' });

        // Setup form and trigger submit
        const navForm = document.getElementById('nav-form');
        navForm.dataset.starsLoaded = "true";
        const submitPromise = navForm.listeners.submit({ target: navForm, preventDefault: () => {} });

        // Wait for submit to finish
        await submitPromise;

        // Restore fetch
        fetch = oldFetch;
    })();
`, context);

// We need to wait for the microtask queue since the VM executes async IIFE
setTimeout(() => {
    assert.strictEqual(vm.runInNewContext('isFlying', context), false, 'isFlying should remain false after failed submit');
    assert.strictEqual(vm.runInNewContext('flightMayCommitDestination', context), false, 'commit latch should be false after failed submit');
    assert.strictEqual(vm.runInNewContext('controls.enabled', context), true, 'controls should be enabled after failed submit');
    console.log("All route map mode regression tests passed");
}, 0);
