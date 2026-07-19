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
        this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
        this._registeredListeners = [];
    }
    addEventListener(type, handler, options = false) {
        this._registeredListeners.push({ type, handler, options });
        super.addEventListener(type, handler, options);
    }
    dispatchEvent(event) {
        let immediateStopped = false;
        const origStopImmediate = event.stopImmediatePropagation;
        event.stopImmediatePropagation = () => {
            immediateStopped = true;
            if (origStopImmediate) origStopImmediate.call(event);
        };
        for (const l of this._registeredListeners) {
            if (immediateStopped) break;
            const capture = typeof l.options === 'object' ? !!l.options.capture : !!l.options;
            if (l.type === event.type && capture) {
                l.handler(event);
            }
        }
        for (const l of this._registeredListeners) {
            if (immediateStopped) break;
            const capture = typeof l.options === 'object' ? !!l.options.capture : !!l.options;
            if (l.type === event.type && !capture) {
                l.handler(event);
            }
        }
        return !event.defaultPrevented;
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
    setAttribute() {}
    removeAttribute() {}
    appendChild(child) { this.children.push(child); return child; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    querySelector(selector) { return this.children.find(child => child.tagName === selector.toUpperCase()) || null; }
    scrollIntoView() {}
    _rect = { left: 0, top: 0, width: 800, height: 600 };
    getBoundingClientRect() { return this._rect; }
    get clientHeight() { return this._rect.height; }
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
    Event
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

assert.strictEqual(typeof vm.runInNewContext('flyToStar', context), 'function', 'App must expose its live flyToStar call path');
vm.runInNewContext(`
    getGalaxyFrame = () => ({
        viewOut: new THREE.Vector3(0, 0, 1),
        distance: 100,
    });
    flyToStar(10, 20, 30);
`, context);
assert.strictEqual(vm.runInNewContext('flightTransitionState.isActive', context), true);
assert.strictEqual(vm.runInNewContext('targetNode.x', context), 10);
assert.strictEqual(vm.runInNewContext('targetNode.y', context), 20);
assert.strictEqual(vm.runInNewContext('targetNode.z', context), 30);

// Route rendering must not move the user's pose before focusHop captures it.
vm.runInNewContext(`
    starData = [
        { n: 'Route A', x: 10, y: 20, z: 30, s: 'G', m: 1 },
        { n: 'Route B', x: 40, y: 50, z: 60, s: 'K', m: 2 }
    ];
    camera.position.set(-2991.2533, -48294.5088, 22766.6346);
    controls.target.set(7011, -4123, 91);
    globalThis.preRouteCamera = [camera.position.x, camera.position.y, camera.position.z];
    globalThis.preRouteTarget = [controls.target.x, controls.target.y, controls.target.z];
    applyRouteResult(starData);
`, context);
assert.deepStrictEqual(Array.from(vm.runInNewContext('[flightSourceCam.x, flightSourceCam.y, flightSourceCam.z]', context)), Array.from(context.preRouteCamera), 'route focus must capture the pre-route camera pose');
assert.deepStrictEqual(Array.from(vm.runInNewContext('[flightSourceNode.x, flightSourceNode.y, flightSourceNode.z]', context)), Array.from(context.preRouteTarget), 'route focus must capture the pre-route target pose');
assert.deepStrictEqual(Array.from(vm.runInNewContext('[camera.position.x, camera.position.y, camera.position.z]', context)), Array.from(context.preRouteCamera), 'drawPath/applyRouteResult must not teleport camera on the first transition sample');
assert.deepStrictEqual(Array.from(vm.runInNewContext('[controls.target.x, controls.target.y, controls.target.z]', context)), Array.from(context.preRouteTarget), 'drawPath/applyRouteResult must not teleport target on the first transition sample');
vm.runInNewContext('updateFlight(0)', context);
assert.deepStrictEqual(Array.from(vm.runInNewContext('[camera.position.x, camera.position.y, camera.position.z]', context)), Array.from(context.preRouteCamera), 'first DEPARTURE sample must retain pre-route camera');
assert.deepStrictEqual(Array.from(vm.runInNewContext('[controls.target.x, controls.target.y, controls.target.z]', context)), Array.from(context.preRouteTarget), 'first DEPARTURE sample must retain pre-route target');
vm.runInNewContext('for (let i = 0; i < 80; i++) updateFlight(50)', context);
assert.deepStrictEqual(Array.from(vm.runInNewContext('[controls.target.x, controls.target.y, controls.target.z]', context)), [10, 20, 30], 'normal route completion must reach first resolved destination');

vm.runInNewContext(`
    starData = [
        { n: 'Sol', x: 0, y: 0, z: 0, s: 'G2V', m: 4.8 },
        { n: 'MID', x: 10, y: 20, z: 30, s: 'K', m: 5 },
        { n: 'TYC 7375-208-1', x: 40, y: 50, z: 60, s: 'M', m: 6 },
        { n: 'HIP 7721', x: 40, y: 50, z: 60, s: 'A', m: 3 },
        { n: 'ReducedMotionDest', x: 50, y: 60, z: 70, s: 'F', m: 4 },
    ];
    currentRouteHops = starData.slice();
    resolvedRouteStars = starData.slice();
    pathNodes = {
        geometry: {
            marker: { array: new Float32Array(3), needsUpdate: false },
            getAttribute(name) { return name === 'hideMarker' ? this.marker : null; },
            dispose() {}
        },
        material: { dispose() {} }
    };
    hopToMarkerIndex = [0, 1, 2];
    focusHop(0);
`, context);

assert.strictEqual(vm.runInNewContext('flightTransitionState.isActive', context), true);
assert.strictEqual(vm.runInNewContext('isFlying', context), true);
assert.strictEqual(vm.runInNewContext('controls.enabled', context), false);
assert.strictEqual(vm.runInNewContext('pathNodes.geometry.marker.array[0]', context), 0);

vm.runInNewContext('for (let i = 0; i < 80; i++) updateFlight(33.3)', context);
assert.strictEqual(vm.runInNewContext('pathNodes.geometry.marker.array[0]', context), 1);
assert.strictEqual(vm.runInNewContext('pathNodes.geometry.marker.needsUpdate', context), true);

// Test second hop is SLIDE
elements.get('btn-next-hop').listeners.click();
assert.strictEqual(vm.runInNewContext('currentHopIndex', context), 1);
assert.strictEqual(vm.runInNewContext('controls.enabled', context), false);

vm.runInNewContext('for (let i = 0; i < 14; i++) updateFlight(33.3)', context);
assert.strictEqual(vm.runInNewContext('flightTransitionState.phase', context), 'SLIDE');
assert.strictEqual(vm.runInNewContext('flightTransitionState.opacity', context), 1.0);
assert.ok(vm.runInNewContext('flightTransitionState.slideT', context) > 0);

elements.get('btn-prev-hop').listeners.click();
assert.strictEqual(vm.runInNewContext('currentHopIndex', context), 0);

vm.runInNewContext(`
    for(let i=0; i<14; i++) updateFlight(33.3);
    globalThis.interruptionCameraBefore = [camera.position.x, camera.position.y, camera.position.z];
    globalThis.interruptionTargetBefore = [controls.target.x, controls.target.y, controls.target.z];

    globalThis.captureObserverState = null;
    renderer.domElement.addEventListener('pointerdown', () => {
        globalThis.captureObserverState = {
            controlsEnabled: controls.enabled,
            isActive: flightTransitionState.isActive,
            isFlying: isFlying,
            flightMayCommitDestination: flightMayCommitDestination
        };
    }, { capture: true });

    const interruptPointer = new Event('pointerdown', { cancelable: true });
    Object.defineProperties(interruptPointer, {
        pointerId: { value: 77 }, clientX: { value: 321 }, clientY: { value: 222 }, timeStamp: { value: 1234 }
    });
    renderer.domElement.dispatchEvent(interruptPointer);
    for(let i=0; i<120; i++) updateFlight(33.3);
    updateFlight(1);
`, context);
assert.strictEqual(vm.runInNewContext('flightTransitionState.isActive', context), false);
assert.strictEqual(vm.runInNewContext('controls.enabled', context), true);
assert.strictEqual(vm.runInNewContext('fadingMaterials', context), null);
assert.strictEqual(vm.runInNewContext('flightTransitionState.phase', context), 'IDLE');
assert.strictEqual(vm.runInNewContext('flightTransitionState.opacity', context), 1.0);
assert.strictEqual(vm.runInNewContext('flightTransitionState.isFlying', context), false);
assert.strictEqual(vm.runInNewContext('isFlying', context), false);
assert.strictEqual(vm.runInNewContext('flightMayCommitDestination', context), false);

const observerState = vm.runInNewContext('captureObserverState', context);
assert.strictEqual(observerState.controlsEnabled, true, 'capture observer must see controlsEnabled true');
assert.strictEqual(observerState.isActive, true, 'capture observer must see isActive true');
assert.strictEqual(observerState.isFlying, false, 'capture observer must see isFlying false');
assert.strictEqual(observerState.flightMayCommitDestination, false, 'capture observer must see flightMayCommitDestination false');

assert.deepStrictEqual(Array.from(vm.runInNewContext('[camera.position.x, camera.position.y, camera.position.z]', context)), Array.from(context.interruptionCameraBefore), 'pointer-interrupted cleanup must preserve the exact interruption camera pose');
assert.deepStrictEqual(Array.from(vm.runInNewContext('[controls.target.x, controls.target.y, controls.target.z]', context)), Array.from(context.interruptionTargetBefore), 'pointer-interrupted cleanup must preserve the exact interruption target pose');
console.log('Interruption pose camera before/after:', JSON.stringify(context.interruptionCameraBefore), JSON.stringify(Array.from(vm.runInNewContext('[camera.position.x, camera.position.y, camera.position.z]', context))));
console.log('Interruption pose target before/after:', JSON.stringify(context.interruptionTargetBefore), JSON.stringify(Array.from(vm.runInNewContext('[controls.target.x, controls.target.y, controls.target.z]', context))));

// Wheel interruption regression test
vm.runInNewContext(`
    // 1. Start a real flight through applyRouteResult/focusHop/flyToStar using the actual loaded app handler and a resolved multi-hop route.
    applyRouteResult([{n:'MID', x:10, y:20, z:30}, {n:'TYC 7375-208-1', x:40, y:50, z:60}]);
    focusHop(1);

    // 2. Advance updateFlight to a nontrivial mid-flight pose and assert active departure/map transition.
    for(let i=0; i<14; i++) updateFlight(33.3);
    globalThis.wheelInterruptionPhaseBefore = flightTransitionState.phase;
    globalThis.wheelInterruptionIsActiveBefore = flightTransitionState.isActive;

    // 3. Dispatch a qualifying native EventTarget wheel Event through renderer.domElement using the already-established real wheel harness
    const interruptWheel = new Event('wheel', { cancelable: true });
    Object.defineProperties(interruptWheel, {
        deltaY: { value: -3 },
        deltaMode: { value: 1 }, // Line mode
        clientX: { value: 400 },
        clientY: { value: 300 }
    });

    globalThis.wheelPrevented = !renderer.domElement.dispatchEvent(interruptWheel);
    globalThis.wheelInterruptionFlightMayCommitAfterEvent = flightMayCommitDestination;

    // 5. Snapshot camera.position and controls.target AFTER the wheel handler (the wheel itself intentionally changes them).
    globalThis.wheelInterruptionCameraAfterEvent = [camera.position.x, camera.position.y, camera.position.z];
    globalThis.wheelInterruptionTargetAfterEvent = [controls.target.x, controls.target.y, controls.target.z];

    // 6. Advance updateFlight through terminal interruption cleanup.
    for(let i=0; i<120; i++) updateFlight(33.3);
    updateFlight(1);
`, context);

assert.ok(['DEPARTURE', 'MAP_ARC', 'SLIDE', 'FOCUS'].includes(vm.runInNewContext('wheelInterruptionPhaseBefore', context)), 'wheel interruption test must start from active departure/map/slide/focus transition');
assert.strictEqual(vm.runInNewContext('wheelInterruptionIsActiveBefore', context), true, 'wheel interruption test must start actively flying');

// 4. Assert event defaultPrevented and OrbitControls suppression as appropriate; assert flightMayCommitDestination === false immediately after handler.
assert.strictEqual(vm.runInNewContext('wheelPrevented', context), true, 'wheel interruption event must preventDefault');
assert.strictEqual(vm.runInNewContext('wheelInterruptionFlightMayCommitAfterEvent', context), false, 'wheel interruption must set flightMayCommitDestination to false');

// 7. Assert exact post-wheel camera and target snapshots remain unchanged (no canceled destination snap), phase IDLE, inactive/isFlying false, opacity 1, controls enabled, fadingMaterials null, latch remains/reset false, material baseline restored.
assert.deepStrictEqual(Array.from(vm.runInNewContext('[camera.position.x, camera.position.y, camera.position.z]', context)), Array.from(context.wheelInterruptionCameraAfterEvent), 'wheel-interrupted cleanup must preserve the exact post-wheel camera pose');
assert.deepStrictEqual(Array.from(vm.runInNewContext('[controls.target.x, controls.target.y, controls.target.z]', context)), Array.from(context.wheelInterruptionTargetAfterEvent), 'wheel-interrupted cleanup must preserve the exact post-wheel target pose');

assert.strictEqual(vm.runInNewContext('flightTransitionState.phase', context), 'IDLE');
assert.strictEqual(vm.runInNewContext('flightTransitionState.isActive', context), false);
assert.strictEqual(vm.runInNewContext('isFlying', context), false);
assert.strictEqual(vm.runInNewContext('flightTransitionState.opacity', context), 1.0);
assert.strictEqual(vm.runInNewContext('controls.enabled', context), true);
assert.strictEqual(vm.runInNewContext('fadingMaterials', context), null);
assert.strictEqual(vm.runInNewContext('flightMayCommitDestination', context), false);

console.log('Wheel Interruption pose camera after-wheel/final:', JSON.stringify(context.wheelInterruptionCameraAfterEvent), JSON.stringify(Array.from(vm.runInNewContext('[camera.position.x, camera.position.y, camera.position.z]', context))));
console.log('Wheel Interruption pose target after-wheel/final:', JSON.stringify(context.wheelInterruptionTargetAfterEvent), JSON.stringify(Array.from(vm.runInNewContext('[controls.target.x, controls.target.y, controls.target.z]', context))));

// Rapid requests integration test
vm.runInNewContext(`
    // Trigger multiple requests overlapping
    applyRouteResult([{n:'MID', x:10, y:20, z:30}, {n:'TYC 7375-208-1', x:40, y:50, z:60}]);
    for(let i=0; i<8; i++) updateFlight(33.3);
    applyRouteResult([{n:'Sol', x:0, y:0, z:0}, {n:'Unknown1'}, {n:'MID', x:10, y:20, z:30}]);
    updateFlight(50);
    applyRouteResult([{n:'HIP 7721', x:40, y:50, z:60}]); // Rapid final request, 1 hop resolved

    // Simulate flight completion for the last request
    for (let i = 0; i < 80; i++) updateFlight(50);
`, context);

assert.strictEqual(vm.runInNewContext('currentHopIndex', context), 0);
assert.strictEqual(vm.runInNewContext('flightTransitionState.phase', context), 'IDLE');
assert.strictEqual(vm.runInNewContext('flightTransitionState.opacity', context), 1.0);
assert.strictEqual(vm.runInNewContext('controls.enabled', context), true);
assert.strictEqual(vm.runInNewContext('controls.target.x', context), 40);
assert.strictEqual(vm.runInNewContext('controls.target.y', context), 50);
assert.strictEqual(vm.runInNewContext('controls.target.z', context), 60);
assert.strictEqual(vm.runInNewContext('isFlying', context), false);
assert.strictEqual(vm.runInNewContext('fadingMaterials', context), null, 'rapid latest-request must null fadingMaterials on end');
assert.strictEqual(vm.runInNewContext('detailsCard.querySelector("h2")?.textContent', context), 'HIP 7721', 'latest request details card identity');
assert.strictEqual(vm.runInNewContext('pathNodes', context), null, 'single-hop latest route must not retain stale markers');
assert.deepStrictEqual(Array.from(vm.runInNewContext('hopToMarkerIndex', context)), [0], 'latest marker mapping must belong only to latest route');
// Camera offset is now preserved dynamically, so we don't assert a hardcoded final camera position here. Our dedicated regression test covers it.

// Unresolved Hop Regression Test
vm.runInNewContext(`
    interruptTransition(flightTransitionState); for(let i=0; i<120; i++) updateFlight(33.3); updateFlight(1);

    // Setup first-hop-unresolved followed by resolved regression
    applyRouteResult([{n:'Unknown1'}, {n:'MID', x:10, y:20, z:30}]);
`, context);

assert.strictEqual(vm.runInNewContext('currentHopIndex', context), 1);
assert.strictEqual(vm.runInNewContext('flightTransitionState.phase', context), 'FOCUS', 'Initial route focus must use FOCUS flight, not SLIDE');
assert.strictEqual(vm.runInNewContext('pathNodes', context), null, 'one resolved hop must have no drawable marker object');
assert.deepStrictEqual(Array.from(vm.runInNewContext('hopToMarkerIndex', context)), [-1, 0], 'unresolved/resolved marker mapping must be exact');
assert.strictEqual(vm.runInNewContext('targetNode.x', context), 10);
assert.strictEqual(vm.runInNewContext('controls.target.x', context), 40, 'departure must retain the exact prior camera target until transition advances');

vm.runInNewContext(`
    for(let i=0; i<80; i++) updateFlight(33.3);
`, context);

assert.strictEqual(vm.runInNewContext('document.getElementById("hop-current").textContent', context), 'MID');
assert.strictEqual(vm.runInNewContext('detailsCard.querySelector("h2")?.textContent', context), 'MID');

vm.runInNewContext(`
    // Focus the unresolved first hop
    focusHop(0);
`, context);

// Focus should do nothing: marker shouldn't be hidden, details untouched, index shouldn't change
assert.strictEqual(vm.runInNewContext('currentHopIndex', context), 1, 'Mutation of current index for unresolved hop must fail');
assert.strictEqual(vm.runInNewContext('detailsCard.querySelector("h2")?.textContent', context), 'MID', 'Mutation of details card for unresolved hop must fail');

// All-unresolved regression
vm.runInNewContext(`
    // Put into an active flight state first
    focusHop(1);
    updateFlight(10);
    focusRing = { visible: true, position: new THREE.Vector3() };
    globalThis.clearedSelectionAttr = { value: 1, needsUpdate: false, setX(index, value) { this.value = value; } };
    starsGeometry = { getAttribute(name) { return name === 'isSelected' ? clearedSelectionAttr : null; } };
    currentSelectedStarIndex = 2;
    globalThis.unresolvedCameraBefore = [camera.position.x, camera.position.y, camera.position.z];
    globalThis.unresolvedTargetBefore = [controls.target.x, controls.target.y, controls.target.z];
    // Controls are disabled during flight
`, context);
assert.strictEqual(vm.runInNewContext('controls.enabled', context), false);

vm.runInNewContext(`
    // Apply route with no resolved hops
    applyRouteResult([{n:'Unknown1'}, {n:'Unknown2'}]);
`, context);

assert.strictEqual(vm.runInNewContext('currentHopIndex', context), -1);
assert.strictEqual(vm.runInNewContext('flightTransitionState.phase', context), 'IDLE');
assert.strictEqual(vm.runInNewContext('flightTransitionState.isActive', context), false);
assert.strictEqual(vm.runInNewContext('isFlying', context), false);
assert.strictEqual(vm.runInNewContext('flightTransitionState.opacity', context), 1.0);
assert.strictEqual(vm.runInNewContext('controls.enabled', context), true);
assert.strictEqual(vm.runInNewContext('fadingMaterials', context), null);
assert.strictEqual(vm.runInNewContext('pathLine', context), null);
assert.strictEqual(vm.runInNewContext('pathNodes', context), null);
assert.deepStrictEqual(Array.from(vm.runInNewContext('hopToMarkerIndex', context)), [-1, -1]);
assert.strictEqual(vm.runInNewContext('document.getElementById("hop-current").textContent', context), 'NO ROUTE LOCK');
vm.runInNewContext('appMode = "ROUTE"', context);
vm.runInNewContext('clearRoute()', context); // Re-run to process appMode change for test check
assert.strictEqual(vm.runInNewContext('detailsCard.hidden', context), true);
assert.strictEqual(vm.runInNewContext('detailsCard.children.length', context), 0);
assert.strictEqual(vm.runInNewContext('currentSelectedStarIndex', context), -1);
assert.strictEqual(vm.runInNewContext('focusRing.visible', context), false);
assert.strictEqual(context.clearedSelectionAttr.value, 0);
assert.strictEqual(context.clearedSelectionAttr.needsUpdate, true);
assert.deepStrictEqual(Array.from(vm.runInNewContext('[camera.position.x, camera.position.y, camera.position.z]', context)),
    Array.from(context.unresolvedCameraBefore), 'all-unresolved cleanup must not mutate camera position');
assert.deepStrictEqual(Array.from(vm.runInNewContext('[controls.target.x, controls.target.y, controls.target.z]', context)),
    Array.from(context.unresolvedTargetBefore), 'all-unresolved cleanup must not mutate camera target');

// Reduced-motion integration
vm.runInNewContext(`
    const origMatchMedia = window.matchMedia;
    window.matchMedia = (query) => ({ matches: query === '(prefers-reduced-motion: reduce)' });

    applyRouteResult([{n:'ReducedMotionDest', x: 50, y: 60, z: 70}]);

    // Animate terminal cleanup
    for (let i = 0; i < 80; i++) updateFlight(50);

    window.matchMedia = origMatchMedia;
`, context);

assert.strictEqual(vm.runInNewContext('controls.enabled', context), true);
assert.strictEqual(vm.runInNewContext('flightTransitionState.phase', context), 'IDLE');
assert.strictEqual(vm.runInNewContext('flightTransitionState.isActive', context), false);
assert.strictEqual(vm.runInNewContext('isFlying', context), false);
assert.strictEqual(vm.runInNewContext('flightTransitionState.opacity', context), 1.0);
assert.strictEqual(vm.runInNewContext('fadingMaterials', context), null);
assert.strictEqual(vm.runInNewContext('targetNode.x', context), 50);
assert.strictEqual(vm.runInNewContext('detailsCard.querySelector("h2")?.textContent', context), 'ReducedMotionDest');

// Wheel Double Normalization and Dispatch Regression Test
vm.runInNewContext(`
    interruptTransition(flightTransitionState);
    camera.position.set(0, 0, 100);
    controls.target.set(0, 0, 0);
    controls.minDistance = 1;
    controls.maxDistance = 1000;
    controls.zoomSpeed = 1.15;

    let orbitControlsWheelCalled = false;
    renderer.domElement.addEventListener('wheel', () => { orbitControlsWheelCalled = true; }); // Mock OrbitControls listener

    // Node.js has no native WheelEvent, so we create a standard Event and define the
    // read-only properties needed by the wheel handler. Do not claim native WheelEvent.
    const wheelEvent = new Event('wheel', { cancelable: true });
    Object.defineProperties(wheelEvent, {
        deltaY: { value: -3 },
        deltaMode: { value: 1 }, // Line mode
        clientX: { value: 400 },
        clientY: { value: 300 }
    });

    const preventDefaultObserved = !renderer.domElement.dispatchEvent(wheelEvent);
`, context);

// Test 2: Instrument addEventListener registration
assert.strictEqual(vm.runInNewContext('renderer.domElement._registeredListeners.filter(l => l.type === "wheel").length', context), 2, 'Exactly one app capture listener and one mocked OrbitControls bubble listener');
assert.strictEqual(vm.runInNewContext('renderer.domElement._registeredListeners.filter(l => l.type === "wheel")[0].options.capture', context), true, 'App listener must use capture');
assert.strictEqual(vm.runInNewContext('renderer.domElement._registeredListeners.filter(l => l.type === "wheel")[0].options.passive', context), false, 'App listener must not be passive');
assert.strictEqual(vm.runInNewContext('renderer.domElement._registeredListeners.filter(l => l.type === "wheel")[1].options', context), false, 'Mocked listener must be bubble');

assert.strictEqual(vm.runInNewContext('preventDefaultObserved', context), true, 'wheel event must preventDefault');
assert.strictEqual(vm.runInNewContext('orbitControlsWheelCalled', context), false, 'OrbitControls wheel listener must NOT run');

// -3 lines * 16 = -48px.
// calculateZoom handles: factor = Math.pow(0.95, 1.15 * (48/100)) = Math.pow(0.95, 0.552) ~ 0.972
// wait, -48px delta. factor = Math.pow(0.95, 1.15 * 0.48) = 0.972. Wait, since deltaY < 0, factor is used as is.
// So newDistance = 100 * 0.97208 = 97.208
// If it was double normalized, it would receive -48px but with deltaMode=1, which would multiply by 16 AGAIN -> -768px!
// With -768px, exponent is capped at 4. factor = Math.pow(0.95, 1.15 * 4) = Math.pow(0.95, 4.6) ~ 0.789
// So newDistance would be 78.9 if double normalized.
const postWheelDistance = vm.runInNewContext('camera.position.distanceTo(controls.target)', context);
assert.ok(postWheelDistance > 90, 'Wheel zoom should not double normalize (should be ~97, not 78)');
assert.ok(postWheelDistance < 99, 'Wheel zoom should apply some zoom in');

vm.runInNewContext(`
    // Detail Opacity Composition Test setup mocks
    solMesh = { material: { uniforms: { uTransitionOpacity: { value: 1.0 } } }, visible: false };
    starMesh = { material: { uniforms: { uTransitionOpacity: { value: 1.0 }, uColor: { value: { copy: ()=>{} } }, uLimbDarkening: { value: 0 }, uGranulationContrast: { value: 0 }, uGranulationScale: { value: 0 }, uActivity: { value: 0 }, uSeed: { value: 0 }, uTime: { value: 0 } } }, visible: false };
    coronaMesh = { material: { uniforms: { uTransitionOpacity: { value: 1.0 }, uColor: { value: { copy: ()=>{} } }, uActivity: { value: 0 }, uSeed: { value: 0 }, uTime: { value: 0 } } }, visible: false };
    starsPoints = { material: { uniforms: { uSelectedPointOpacity: { value: 1.0 }, uTransitionOpacity: { value: 1.0 } } } };
    starsGeometry = new THREE.BufferGeometry();
    scene.userData.nebulaMesh = { material: { uniforms: { uTransitionOpacity: { value: 1.0 } } } };
    detailGroup = { visible: false, position: new THREE.Vector3(), scale: new THREE.Vector3() };
    focusRing = null;

    // Test Sol Mesh composition
    currentSelectedStarIndex = 0;
    targetNode.set(0,0,0);
    camera.position.set(0,0,10);

    const origLOD = calculateDetailLOD;
    calculateDetailLOD = () => ({
        visible: true,
        detailScale: 1,
        detailOpacity: 0.4,
        pointOpacity: 0.1
    });

    // Use the real flight setup/update path to reach transition opacity 0.25,
    // then animate to exercise the real detail composition.
    flyToStar(0, 0, 0);
    for(let i=0; i<12; i++) updateFlight(176.47058823529412/6);
    animate();
`, context);

let solOpacity = vm.runInNewContext('solMesh.material.uniforms.uTransitionOpacity.value', context);
const composedTransitionOpacity = vm.runInNewContext('flightTransitionState.opacity', context);
assert.strictEqual(solOpacity, 0.4 * composedTransitionOpacity, 'solMesh uTransitionOpacity should compose lod.detailOpacity and live transition opacity');

vm.runInNewContext(`
    // Test other star mesh composition
    currentSelectedStarIndex = 1;
    starMesh.material.uniforms.uTransitionOpacity.value = 1.0;
    animate();
`, context);

let starOpacity = vm.runInNewContext('starMesh.material.uniforms.uTransitionOpacity.value', context);
assert.strictEqual(starOpacity, 0.4 * composedTransitionOpacity, 'starMesh uTransitionOpacity should compose lod.detailOpacity and live transition opacity');

vm.runInNewContext(`
    // Test points/nebula fallback
    calculateDetailLOD = origLOD;
`, context);

// Test nebula/points
let starsOpacity = vm.runInNewContext('starsPoints.material.uniforms.uTransitionOpacity.value', context);
assert.strictEqual(starsOpacity, composedTransitionOpacity, 'starsPoints uTransitionOpacity should match live transition opacity');
let nebulaOpacity = vm.runInNewContext('scene.userData.nebulaMesh.material.uniforms.uTransitionOpacity.value', context);
assert.strictEqual(nebulaOpacity, composedTransitionOpacity, 'nebula material uTransitionOpacity should independently match live transition opacity');

// Test 4: Dispatch a wheel Event on a separate unrelated real EventTarget
vm.runInNewContext(`
    const unrelatedTarget = new EventTarget();
    const unrelatedEvent = new Event('wheel', { cancelable: true });
    Object.defineProperties(unrelatedEvent, {
        deltaY: { value: -3 },
        deltaMode: { value: 1 },
        clientX: { value: 400 },
        clientY: { value: 300 }
    });
    const unrelatedPrevented = !unrelatedTarget.dispatchEvent(unrelatedEvent);
`, context);
assert.strictEqual(vm.runInNewContext('unrelatedPrevented', context), false, 'Unrelated target must not be prevented');

// Test 5: Behaviorally test cached bounds refresh
vm.runInNewContext(`
    // Change rect dimensions/offset and dispatch resize
    renderer.domElement._rect = { left: 100, top: 100, width: 400, height: 300 };
    window.dispatchEvent(new Event('resize'));

    // Dispatch off-center wheel: center of new rect is (300, 250)
    const wheelEvent2 = new Event('wheel', { cancelable: true });
    Object.defineProperties(wheelEvent2, {
        deltaY: { value: -3 },
        deltaMode: { value: 1 },
        clientX: { value: 300 },
        clientY: { value: 250 }
    });

    let capturedPointerX = null, capturedPointerY = null;
    const origSetFromCamera = _wheelRaycaster.setFromCamera;
    _wheelRaycaster.setFromCamera = function(pointer, cam) {
        capturedPointerX = pointer.x;
        capturedPointerY = pointer.y;
        origSetFromCamera.call(this, pointer, cam);
    };

    renderer.domElement.dispatchEvent(wheelEvent2);
    _wheelRaycaster.setFromCamera = origSetFromCamera;
`, context);
assert.strictEqual(vm.runInNewContext('capturedPointerX', context), 0, 'Must use refreshed numeric bounds (X)');
assert.strictEqual(vm.runInNewContext('capturedPointerY', context), 0, 'Must use refreshed numeric bounds (Y)');

// Test 6: Verify identity reuse and application helper contracts
vm.runInNewContext(`
    let firstConfigObj = null;
    let firstResultObj = null;

    const origCalcZoom = calculateZoom;
    calculateZoom = function(config) {
        if (!firstConfigObj) firstConfigObj = config;
        else if (firstConfigObj !== config) throw new Error("Config object not reused");

        const res = origCalcZoom(config);

        if (!firstResultObj) firstResultObj = res;
        else if (firstResultObj !== res) throw new Error("Result object not reused");

        return res;
    };

    const wheelEvent3 = new Event('wheel', { cancelable: true });
    Object.defineProperties(wheelEvent3, {
        deltaY: { value: -3 },
        deltaMode: { value: 1 },
        clientX: { value: 300 },
        clientY: { value: 250 }
    });

    // Dispatch two events
    renderer.domElement.dispatchEvent(wheelEvent3);
    renderer.domElement.dispatchEvent(wheelEvent3);

    calculateZoom = origCalcZoom;
`, context);

// accumulateWheelDelta returns primitive
assert.strictEqual(typeof vm.runInNewContext('accumulateWheelDelta(-3, 1, 600)', context), 'number');

// calculateZoom returns the caller-provided result object
const zoomMatch = vm.runInNewContext('calculateZoom(_wheelZoomConfig) === _wheelZoomConfig.out', context);
assert.strictEqual(zoomMatch, true, 'calculateZoom must return the caller-provided result object');

// interruptTransition mutates provided state without returning/creating application result state
const retInt = vm.runInNewContext('interruptTransition(flightTransitionState)', context);
assert.strictEqual(retInt, undefined, 'interruptTransition must return undefined (no fresh object)');

// Third-party Three.js/OrbitControls internals are outside our static allocation proof.
// We must call update() here synchronously so that subsequent reads of camera matrices
// or raycasting in the same frame use the zoomed state, and to update internal spherical coords.
// This justifies the controls.update() call inside the handler.

// Test 7: Frame Drop Continuity
vm.runInNewContext(`
    // reset flight state
    camera.position.set(0, 0, 0);
    controls.target.set(0, 0, -100);

    // start a new flight
    flyToStar(10000, 20000, 30000);

    let prevCamPos = camera.position.clone();

    // Simulate a large frame drop
    updateFlight(250);

    let currentCamPos = camera.position.clone();
    globalThis.distanceMoved = prevCamPos.distanceTo(currentCamPos);
`, context);

const distanceMoved = vm.runInNewContext('globalThis.distanceMoved', context);
assert.ok(distanceMoved < 10000, 'Frame drop must not cause a large discontinuity jump. Distance moved: ' + distanceMoved);

// Test 8: Rapid Retarget Continuity
vm.runInNewContext(`
    // Let's get into a state where we are flying and opacity is reduced.
    camera.position.set(-1877.66, -30666.82, 19715.24);
    controls.target.set(4.925, -209.478, -71.584);
    flyToStar(10000, 20000, 30000);
    updateFlight(100); // Progress ~0.1, mid departure, opacity drops
    let poseBeforeRetargetCam = camera.position.clone();
    let poseBeforeRetargetTarget = controls.target.clone();

    // Now rapid retarget!
    flyToStar(50000, -20000, 10000);
    let poseImmediatelyAfterRetargetCam = camera.position.clone();
    let poseImmediatelyAfterRetargetTarget = controls.target.clone();

    globalThis.poseUnchangedOnRetargetCam = poseBeforeRetargetCam.distanceTo(poseImmediatelyAfterRetargetCam) < 1e-5;
    globalThis.poseUnchangedOnRetargetTarget = poseBeforeRetargetTarget.distanceTo(poseImmediatelyAfterRetargetTarget) < 1e-5;

    // First frame after retarget
    updateFlight(33.3);
    let poseAfterFirstFrameCam = camera.position.clone();
    globalThis.firstFrameDistance = poseImmediatelyAfterRetargetCam.distanceTo(poseAfterFirstFrameCam);
    globalThis.phaseAfterFirstFrame = flightTransitionState.phase;

    // Run to completion
    for (let i = 0; i < 80; i++) updateFlight(33.3);
    globalThis.terminalPhase = flightTransitionState.phase;
    globalThis.terminalControlsEnabled = controls.enabled;
    globalThis.terminalOpacity = flightTransitionState.opacity;
    globalThis.terminalIsActive = flightTransitionState.isActive;
    globalThis.terminalTarget = controls.target.clone();
`, context);

assert.strictEqual(vm.runInNewContext('globalThis.poseUnchangedOnRetargetCam', context), true, 'pose camera exactly unchanged immediately when retarget requested');
assert.strictEqual(vm.runInNewContext('globalThis.poseUnchangedOnRetargetTarget', context), true, 'pose target exactly unchanged immediately when retarget requested');

const firstFrameDistance = vm.runInNewContext('globalThis.firstFrameDistance', context);
assert.ok(firstFrameDistance < 4362, 'first 33.3ms rendered update has a scale-aware bounded delta (distance: ' + firstFrameDistance + ')');

assert.strictEqual(vm.runInNewContext('globalThis.phaseAfterFirstFrame', context), 'FOCUS', 'no phase boundary jump, should stay in FOCUS');

assert.strictEqual(vm.runInNewContext('globalThis.terminalPhase', context), 'IDLE', 'latest destination wins and terminal state exact/IDLE');
assert.strictEqual(vm.runInNewContext('globalThis.terminalIsActive', context), false, 'terminal state inactive');
assert.strictEqual(vm.runInNewContext('globalThis.terminalControlsEnabled', context), true, 'controls enabled');
assert.strictEqual(vm.runInNewContext('globalThis.terminalOpacity', context), 1.0, 'opacity restored');

const terminalTarget = vm.runInNewContext('globalThis.terminalTarget', context);
assert.strictEqual(terminalTarget.x, 50000, 'terminal target x exactly reached');
assert.strictEqual(terminalTarget.y, -20000, 'terminal target y exactly reached');
assert.strictEqual(terminalTarget.z, 10000, 'terminal target z exactly reached');

// Test 9: Route Hop Lateral Slide Regression
vm.runInNewContext(`
    // Set up initial camera offset and state
    camera.position.set(100, 200, 300);
    controls.target.set(0, 0, 0);
    starsGeometry = { getAttribute: () => ({ setX: ()=>{} }) };

    // Simulate a route result
    starData = [{n:'A', x: 0, y: 0, z: 0}, {n:'B', x: 1000, y: 500, z: -200}];
    applyRouteResult(starData);

    // Fast forward flight for initial hop to establish committed route hop
    while (flightTransitionState.isActive) {
        updateFlight(16.6);
    }

    // Hop to the second star
    let initialOffset = camera.position.clone().sub(controls.target);
    focusHop(1); // Triggers flyToStar through route navigation path

    globalThis.isHopFlight = flightTransitionState.isRouteHop === true; // Should be true, though we haven't implemented it yet. Actually we can just check the behavior.
    globalThis.maxOffsetDiff = 0;
    globalThis.minOpacity = 1;
    globalThis.sawDeparturePhase = false;
    globalThis.sawMapArcPhase = false;

    // Simulate frames
    for (let i = 0; i < 60; i++) {
        updateFlight(16.6); // 1 frame
        if (flightTransitionState.phase === 'DEPARTURE') globalThis.sawDeparturePhase = true;
        if (flightTransitionState.phase === 'MAP_ARC') globalThis.sawMapArcPhase = true;

        let currentOffset = camera.position.clone().sub(controls.target);
        let diff = currentOffset.distanceTo(initialOffset);
        if (diff > globalThis.maxOffsetDiff) globalThis.maxOffsetDiff = diff;

        if (flightTransitionState.opacity < globalThis.minOpacity) {
            globalThis.minOpacity = flightTransitionState.opacity;
        }
    }

    // Ensure flight is done
    while (flightTransitionState.isActive) {
        updateFlight(16.6);
    }

    globalThis.finalTarget = controls.target.clone();
    globalThis.finalCam = camera.position.clone();
    globalThis.finalOffsetDiff = globalThis.finalCam.clone().sub(globalThis.finalTarget).distanceTo(initialOffset);
`, context);

assert.strictEqual(vm.runInNewContext('globalThis.maxOffsetDiff', context) < 0.01, true, 'Route hop must preserve exact camera-target offset throughout flight');
assert.strictEqual(vm.runInNewContext('globalThis.minOpacity', context), 1, 'Route hop must not fade opacity');
// The prompt says "No MAP_ARC detour and no transition opacity fade". So MAP_ARC phase shouldn't be observed or if it is, it shouldn't detour. Let's just assert on no MAP_ARC detour by offset check.
assert.strictEqual(vm.runInNewContext('globalThis.finalTarget.x', context), 1000, 'Terminal target x must be requested star');
assert.strictEqual(vm.runInNewContext('globalThis.finalTarget.y', context), 500, 'Terminal target y must be requested star');
assert.strictEqual(vm.runInNewContext('globalThis.finalTarget.z', context), -200, 'Terminal target z must be requested star');
assert.strictEqual(vm.runInNewContext('globalThis.finalOffsetDiff', context) < 0.01, true, 'Terminal camera must have exact source camera-target offset');

// Test 10: Initial Route Focus vs Lateral Slide
vm.runInNewContext(`
    // 1. Unfocused overview
    clearRoute();
    camera.position.set(-2544, -41156, 26732);
    controls.target.set(0, 0, 0);

    // 2. Establish route. applyRouteResult will implicitly call focusHop(0).
    starData = [{n:'A', x: 10, y: 20, z: 30}, {n:'B', x: 40, y: 50, z: 60}];
    applyRouteResult(starData);

    // Initial hop must NOT be a route hop slide (preserves overview offset)
    globalThis.initialHopIsRouteHop = flightTransitionState.isRouteHop;

    // Fast forward flight
    while (flightTransitionState.isActive) {
        updateFlight(16.6);
    }
    globalThis.initialHopTarget = controls.target.clone();
    globalThis.initialHopCam = camera.position.clone();

    // 3. Navigate next hop
    focusHop(1);
    globalThis.secondHopIsRouteHop = flightTransitionState.isRouteHop;

    // Fast forward flight
    while (flightTransitionState.isActive) {
        updateFlight(16.6);
    }
    globalThis.secondHopTarget = controls.target.clone();
    globalThis.secondHopCam = camera.position.clone();
`, context);

assert.strictEqual(vm.runInNewContext('globalThis.initialHopIsRouteHop', context), false, 'Initial route focus must use normal flight, not SLIDE');
assert.strictEqual(vm.runInNewContext('globalThis.secondHopIsRouteHop', context), true, 'Established route hop must use SLIDE');

const initialOffsetLen = vm.runInNewContext('globalThis.initialHopCam.distanceTo(globalThis.initialHopTarget)', context);
assert.ok(initialOffsetLen < 200, 'Initial route focus must zoom in to inspection distance, not preserve overview distance');

const secondOffsetLen = vm.runInNewContext('globalThis.secondHopCam.distanceTo(globalThis.secondHopTarget)', context);
assert.ok(Math.abs(secondOffsetLen - initialOffsetLen) < 0.01, 'Second route hop must preserve focused inspection distance');

console.log('Integration regression passed');
