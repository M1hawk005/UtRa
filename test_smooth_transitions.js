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
        this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
        this._registeredListeners = [];
    }
    addEventListener(type, handler, options = false) {
        this._registeredListeners.push({ type, handler, options });
        super.addEventListener(type, handler, options);
    }
    get listeners() {
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
    setPointerCapture() {}
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
    querySelector() { return null; },
    activeElement: null
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
        length() { return Math.sqrt(this.x*this.x + this.y*this.y + this.z*this.z); }
    },
    Vector2: class { constructor(x=0,y=0) { this.x=x; this.y=y; } set(x,y) { this.x=x; this.y=y; return this; } },
    Raycaster: class { constructor() { this.ray = { direction: new THREE.Vector3(0,0,-1) }; } setFromCamera() {} },
    MathUtils: { degToRad: (d) => d * Math.PI / 180 },
    Scene: class { userData = {}; add() {} remove() {} },
    PerspectiveCamera: class { position = new THREE.Vector3(); up = new THREE.Vector3(); lookAt() {} updateProjectionMatrix() {} fov = 45; aspect = 1; updateMatrixWorld() {} matrixWorldInverse = { elements: new Array(16).fill(0) }; projectionMatrix = { elements: new Array(16).fill(0) }; },
    WebGLRenderer: class { domElement = new Element(); setSize() {} setPixelRatio() {} render() {} setClearColor() {} capabilities = { getMaxAnisotropy: () => 16 } },
    Points: class { constructor(g,m) { this.geometry = g; this.material = m || { opacity: 1.0, uniforms: {} }; } },
    BufferGeometry: class { setAttribute(name, attr) { if(name==='hideMarker') this.marker = attr; } computeBoundingSphere() { this.boundingSphere = { radius: 100 }; } setFromPoints(pts) { this.pts=pts; return this; } getAttribute(name) { return name==='hideMarker'? this.marker : null; } dispose() {} },
    BufferAttribute: class { constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.needsUpdate = false; } },
    Float32BufferAttribute: class {},
    LineDashedMaterial: class { dispose() {} },
    ShaderMaterial: class { dispose() {} },
    Line: class { constructor(g,m){this.geometry=g; this.material=m;} computeLineDistances(){} },
    PointsMaterial: class {},
    TextureLoader: class { load() { return {}; } },
    Color: class { setHex() {} set() {} copy() {} lerp() { return this; } },
    Group: class { add() {} position = new THREE.Vector3(); scale = new THREE.Vector3(); },
    Mesh: class { material = { uniforms: {} }; geometry = new THREE.BufferGeometry(); updateWorldMatrix() {} getWorldPosition(v) { v.set(0,0,0); return v; } getWorldScale(v) { v.set(1,1,1); return v; } matrixWorld = { invert() { return this; } }; position = new THREE.Vector3(); quaternion = { setFromUnitVectors() {} }; lookAt() {} },
    Matrix4: class { multiplyMatrices() { return this; } elements = new Array(16).fill(0); },
    OrbitControls: class {
        constructor(c, d) { this.object = c; this.domElement = d; this.target = new THREE.Vector3(); }
        update() {}
    },
    sRGBEncoding: 3001,
    ACESFilmicToneMapping: 4,
    AdditiveBlending: 2,
    BackSide: 1,
};

const context = {
    console,
    Math,
    Number,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    performance: { now: () => 0 },
    window,
    document,
    EventTarget,
    Event: class { constructor(type) { this.type = type; } preventDefault() {} stopImmediatePropagation() {} },
    THREE,
    encodeURIComponent,
    String,
    Array,
    Object,
    Map,
    Set,
    requestAnimationFrame: (cb) => { context._raf = cb; },
    getProvenance: () => 'Test',
    applyMaterialOpacity: () => {},
    calculateSkyOpacity: () => ({ opacity: 1, lodBias: 0 }),
    calculateOverviewOpacity: () => 1,
    calculateDetailLOD: () => ({ visible: true, detailScale: 1, detailOpacity: 1, pointOpacity: 1 }),
    getPhotosphereParams: () => ({ baseColor: 0xffffff, limbDarkening: 0, granulationContrast: 0, granulationScale: 1 }),
    calculateReticleScale: () => 1,
    calculateReticleOpacity: () => 1,
    calculateRouteOpacity: () => 1,
    calculateMinDistance: () => 1,
};

vm.createContext(context);
scripts.forEach(s => vm.runInContext(s, context));

vm.runInContext(vmAppJs, context);

vm.runInContext(`
    // Provide a galaxy mesh
    scene.userData.galaxyMesh = new THREE.Mesh();
    scene.userData.galaxyMesh.geometry.computeBoundingSphere();
`, context);

vm.runInContext(`
    starData = [
        { n: 'Sol', x: 0, y: 0, z: 0 },
        { n: 'Test1', x: 100, y: 0, z: 0 },
        { n: 'Test2', x: 200, y: 0, z: 0 }
    ];
    starsGeometry = new THREE.BufferGeometry();
    starsGeometry.setAttribute('isSelected', new THREE.BufferAttribute(new Float32Array(3), 1));
    starsPoints = new THREE.Points(starsGeometry);

    // Expose local scope to context object
    this.camera = camera;
    this.controls = controls;
    this.flightTransitionState = flightTransitionState;
`, context);

function tick(deltaMs) {
    context.performance.now = () => context._now + deltaMs;
    context._now += deltaMs;
    if (context._raf) {
        const cb = context._raf;
        context._raf = null;
        cb();
    }
}
context._now = 0;
tick(0);

console.log("Running Smooth Transition Verification Test");

// Test: Continuous transition from flyToStar without teleport
vm.runInContext(`
    camera.position.set(-1000, -1000, -1000);
    controls.target.set(0, 0, 0);
    flyToStar(100, 0, 0);
`, context);

let prevCam = new THREE.Vector3(context.camera.position.x, context.camera.position.y, context.camera.position.z);
let prevTarget = new THREE.Vector3(context.controls.target.x, context.controls.target.y, context.controls.target.z);

let didTeleportCam = false;
let didTeleportTarget = false;

// Step through transition and test continuity
let phaseTeleport = false;
let movedEarly = false;
let maxJumpCam = 0;
let maxJumpTarget = 0;
let initialTargetJump = -1;

for (let i = 0; i < 80; i++) {
    tick(50); // advance 50ms (total duration is 1000ms)

    let cam = new THREE.Vector3(context.camera.position.x, context.camera.position.y, context.camera.position.z);
    let target = new THREE.Vector3(context.controls.target.x, context.controls.target.y, context.controls.target.z);

    const camJump = cam.distanceTo(prevCam);
    const targetJump = target.distanceTo(prevTarget);

    maxJumpCam = Math.max(maxJumpCam, camJump);
    maxJumpTarget = Math.max(maxJumpTarget, targetJump);

    // In an interpolation we should be moving continuously.
    // The total distance across MAP_ARC is ~49,000 units, over ~600ms (12 ticks).
    // A jump > 10000 between 50ms ticks indicates a discontinuity (teleport).
    if (camJump > 10000) {
        didTeleportCam = true;
        console.log(`Camera teleported! ${camJump.toFixed(2)} units`);
    }
    if (targetJump > 10000) {
        didTeleportTarget = true;
        console.log(`Target teleported! ${targetJump.toFixed(2)} units`);
    }

    // Check early movement
    if (i < 3 && (camJump > 0.01 || targetJump > 0.01)) {
        movedEarly = true;
    }

    prevCam.copy(cam);
    prevTarget.copy(target);
}

assert.ok(movedEarly, "visible movement begins on early departure ticks");
assert.ok(!didTeleportCam, "Camera should not teleport directly during transition");
assert.ok(!didTeleportTarget, "Target should not teleport directly during transition");
assert.strictEqual(context.flightTransitionState.phase, 'IDLE', "terminal destination is exact, IDLE");
assert.strictEqual(context.flightTransitionState.opacity, 1.0, "opacity restored");
assert.strictEqual(context.controls.enabled, true, "controls enabled");

let finalCam = new THREE.Vector3(context.camera.position.x, context.camera.position.y, context.camera.position.z);
let expectedOffset = new THREE.Vector3(-1000, -1000, -1000).normalize().multiplyScalar(Math.hypot(0, -6.32, 18.97));
let expectedFinalCam = new THREE.Vector3(100, 0, 0).add(expectedOffset);
assert.ok(finalCam.distanceTo(expectedFinalCam) < 0.1, "FOCUS must preserve source relative orientation, not old canonical angle");

// Test rapid retarget/interruption starts from the current rendered pose
vm.runInContext(`
    camera.position.set(-1000, -1000, -1000);
    controls.target.set(0, 0, 0);
    flyToStar(100, 0, 0); // start new flight
`, context);
tick(50); // Move a bit
let camBeforeInterrupt = new THREE.Vector3(context.camera.position.x, context.camera.position.y, context.camera.position.z);
let targetBeforeInterrupt = new THREE.Vector3(context.controls.target.x, context.controls.target.y, context.controls.target.z);

vm.runInContext(`
    flyToStar(200, 0, 0); // interrupt with new destination
`, context);
tick(0); // update flight state with new target but start from current without advancing time
let camAfterInterrupt = new THREE.Vector3(context.camera.position.x, context.camera.position.y, context.camera.position.z);
let targetAfterInterrupt = new THREE.Vector3(context.controls.target.x, context.controls.target.y, context.controls.target.z);

console.log("camBeforeInterrupt:", camBeforeInterrupt);
console.log("camAfterInterrupt:", camAfterInterrupt);
console.log("distance:", camAfterInterrupt.distanceTo(camBeforeInterrupt));
assert.ok(camAfterInterrupt.distanceTo(camBeforeInterrupt) < 1.0, "rapid retarget/interruption starts from the current rendered pose, not an old source or final destination");

console.log("Test finished.");
