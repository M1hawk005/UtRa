const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

function stripComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const rawAppJs = fs.readFileSync(__dirname + '/public/app.js', 'utf8');
const appJs = stripComments(rawAppJs);

// A. RED current production uses LineDashedMaterial/dashSize/gapSize/computeLineDistances. GREEN none remain.
assert.ok(!appJs.includes('LineDashedMaterial'), 'LineDashedMaterial must not be used for route');
assert.ok(!appJs.includes('computeLineDistances'), 'computeLineDistances must not be called');
assert.ok(!appJs.includes('dashSize'), 'dashSize must not be used');
assert.ok(!appJs.includes('gapSize'), 'gapSize must not be used');

// E. Allocation/static test: render loop mutates existing uniforms only.
const renderLoopMatch = appJs.match(/function\s+animate\s*\(\)[\s\S]*?renderer\.render/);
assert.ok(renderLoopMatch, 'animate loop should exist');
const renderLoop = renderLoopMatch[0];
assert.ok(!renderLoop.includes('new THREE.'), 'No new THREE allocations in render loop');

// B. Unit-test cumulative progress
assert.ok(appJs.includes('routeProgress'), 'Should set routeProgress attribute');

// VM Tests for C, D, F
const mockThree = {
    Scene: class { add(){} remove(){} userData={} },
    PerspectiveCamera: class { position = new mockThree.Vector3(); updateProjectionMatrix(){} aspect=1; fov=60; },
    WebGLRenderer: class { domElement = { addEventListener: () => {}, getBoundingClientRect: () => ({left:0, top:0, width:800, height:600}) }; setSize(){} setPixelRatio(){} render(){} setClearColor(){} },
    OrbitControls: class { target = new mockThree.Vector3(); update(){} enabled=true; },
    Vector3: class {
        constructor(x=0,y=0,z=0) { this.x=x; this.y=y; this.z=z; }
        distanceTo(other) { return Math.sqrt((this.x-other.x)**2 + (this.y-other.y)**2 + (this.z-other.z)**2); }
        clone() { return new mockThree.Vector3(this.x, this.y, this.z); }
        sub(other) { this.x-=other.x; this.y-=other.y; this.z-=other.z; return this; }
        normalize() { return this; }
        addScaledVector(v,s) { this.x+=v.x*s; this.y+=v.y*s; this.z+=v.z*s; return this; }
        set(x,y,z) { this.x=x; this.y=y; this.z=z; return this; }
        add(other) { this.x+=other.x; this.y+=other.y; this.z+=other.z; return this; }
        lerpVectors(a,b,t) { this.x=a.x+(b.x-a.x)*t; this.y=a.y+(b.y-a.y)*t; this.z=a.z+(b.z-a.z)*t; return this; }
        multiplyScalar(s) { this.x*=s; this.y*=s; this.z*=s; return this; }
        copy(o) { this.x=o.x; this.y=o.y; this.z=o.z; return this; }
    },
    Vector2: class { constructor(x=0,y=0){this.x=x;this.y=y;} set(x,y){this.x=x;this.y=y;} },
    Color: class { constructor(c) { this.c = c; } set(c){} copy(c){} },
    BufferAttribute: class { constructor(a, i) { this.array = a; this.itemSize = i; } },
    BufferGeometry: class {
        constructor() { this.attributes = {}; }
        setFromPoints(pts) { this.pts = pts; return this; }
        setAttribute(n, a) { this.attributes[n] = a; }
        dispose() { this.disposed = true; }
    },
    ShaderMaterial: class {
        constructor(params) { Object.assign(this, params); }
        dispose() { this.disposed = true; }
    },
    Line: class { constructor(g, m) { this.geometry = g; this.material = m; } },
    Points: class { constructor(g, m) { this.geometry = g; this.material = m; } },
    Group: class { add(){} },
    Mesh: class { constructor() { this.material={uniforms:{uColor:{value:new mockThree.Color()},uTime:{value:0}}}; } },
    Raycaster: class { setFromCamera(){} intersectObjects(){ return []; } },
    AdditiveBlending: 2,
};
mockThree.PerspectiveCamera.prototype.position = new mockThree.Vector3(0,0,10);

let reducedMotionMatch = false;

const context = {
    THREE: mockThree,
    window: {
        innerWidth: 800, innerHeight: 600,
        devicePixelRatio: 1,
        matchMedia: (q) => ({ matches: q.includes('reduce') ? reducedMotionMatch : false }),
        addEventListener: () => {},
    },
    document: {
        body: { appendChild: () => {}, classList: { add: () => {}, remove: () => {} } },
        getElementById: () => ({ textContent: '', replaceChildren: () => {}, appendChild: () => {}, setAttribute: () => {}, className: '', style: {}, addEventListener: () => {}, querySelector: () => null, remove: () => {} }),
        createElement: () => ({ appendChild: () => {}, setAttribute: () => {}, style: {}, classList: { add: () => {}, remove: () => {} }, addEventListener: () => {} }),
        addEventListener: () => {}
    },
    performance: { now: () => 1000 },
    requestAnimationFrame: () => {},
    Math: Math,
    console: console,
    Float32Array: Float32Array,
    Array: Array
};

// Polyfills
const setupCode = `
    globalThis.THREE = THREE;
    globalThis.OrbitControls = THREE.OrbitControls;
    class PointerState { constructor() {} attach() {} detach() {} reset() {} }
    globalThis.PointerState = PointerState;
    function calculateRouteOpacity() { return 1.0; }
    function resolveHopStar(n) { return globalThis.starData.find(s => s.n === n); }
    function hopName(h) { return h; }
    function updateRouteMarkerVisibility() {}
    function getMapPose() { return { target: new THREE.Vector3(), cam: new THREE.Vector3() }; }
    function getGalaxyFrame() { return { viewOut: new THREE.Vector3(0,0,1) }; }
    function showStarDetails() {}
    function hasAdjacentResolvedHop() { return true; }
    function calculateSkyOpacity() { return { opacity: 1, lodBias: 0 }; }
    function calculateOverviewOpacity() { return 1; }
    function updateGalaxyZoomLimit() {}
    function updateCanvasBoundsCache() {}
    function calculateReticleScale() { return 1; }
    function calculateReticleOpacity() { return 1; }
    function calculateDetailLOD() { return { visible: false }; }
    function getPhotosphereParams() { return { baseColor: 0xffffff, limbDarkening: 0.5, granulationContrast: 0, granulationScale: 0 }; }
    function calculateBlackHoleLod() { return 0; }
    function applyMaterialOpacity(m, o) { if(m) m.opacity = o; }
    function calculateMinDistance() { return 1; }
    function createTransition() { return { opacity: 1.0, isActive: false }; }
    globalThis.starData = [
        { x: 0, y: 0, z: 0, n: 'A' },
        { x: 10, y: 0, z: 0, n: 'B' },
        { x: 10, y: 10, z: 0, n: 'C' }
    ];
`;

vm.createContext(context);
try {
    vm.runInContext(setupCode, context);
    const vmAppJs = rawAppJs.replace(/^loadStars\(\);\s*$/m, '').replace(/^animate\(\);\s*$/m, '');
    vm.runInContext('const OrbitControls = THREE.OrbitControls;\n' + vmAppJs, context);
} catch (e) {
    console.error('VM Compilation Error:', e);
    process.exit(1);
}

// B. Unit-test cumulative progress calculation directly via drawPath
vm.runInContext('starData = [{ n: "A", x: 0, y: 0, z: 0 }, { n: "B", x: 10, y: 0, z: 0 }, { n: "C", x: 10, y: 10, z: 0 }];', context);
context.routeResult = { hops: ['A', 'B', 'C'] };
context.currentRouteHops = context.routeResult.hops;
context.resolvedRouteStars = [context.resolveHopStar('A'), context.resolveHopStar('B'), context.resolveHopStar('C')];
vm.runInContext('drawPath(["A", "B", "C"]);', context);
const routeProgressAttr = vm.runInContext('pathLine.geometry.attributes.routeProgress', context);
assert.ok(routeProgressAttr, 'routeProgress attribute should exist');
const progresses = routeProgressAttr.array;
assert.strictEqual(progresses[0], 0, 'Start progress is 0');
assert.strictEqual(progresses[2], 1, 'End progress is 1');
assert.strictEqual(progresses[1], 0.5, 'Middle progress is 0.5');

// F. Disposal test
const oldGeo = vm.runInContext('pathLine.geometry', context);
const oldMat = vm.runInContext('pathLine.material', context);
vm.runInContext('drawPath(["A", "C"]);', context);
assert.strictEqual(oldGeo.disposed, true, 'Old geometry should be disposed');
assert.strictEqual(oldMat.disposed, true, 'Old material should be disposed');

// C, D. Transactional Uniform Updates
vm.runInContext('drawPath(["A", "B", "C"]);', context);
let uniforms = vm.runInContext('pathLine.material.uniforms', context);
assert.strictEqual(uniforms.uCommittedProgress.value, 0, 'No committed hop means commProg=0 initially');

// Commit hop 0
vm.runInContext('committedHopIndex = 0; currentHopIndex = -1; animate();', context);
assert.strictEqual(uniforms.uCommittedProgress.value, 0, 'Commit hop 0');
assert.strictEqual(uniforms.uActiveStartProgress.value, 0);

// Pending Next (hop 1)
vm.runInContext('currentHopIndex = 1; animate();', context);
assert.strictEqual(uniforms.uCommittedProgress.value, 0, 'Committed remains 0');
assert.strictEqual(uniforms.uActiveStartProgress.value, 0, 'Active start');
assert.strictEqual(uniforms.uActiveEndProgress.value, 0.5, 'Active end');

// Commit Next (hop 1)
vm.runInContext('committedHopIndex = 1; currentHopIndex = -1; animate();', context);
assert.strictEqual(uniforms.uCommittedProgress.value, 0.5, 'Committed updates to 0.5');

// Opposite retarget (hop 0)
vm.runInContext('currentHopIndex = 0; animate();', context);
assert.strictEqual(uniforms.uCommittedProgress.value, 0.5);
assert.strictEqual(uniforms.uActiveStartProgress.value, 0);
assert.strictEqual(uniforms.uActiveEndProgress.value, 0.5, 'Active end always >= start');

// F. Reduced motion
vm.runInContext('animate();', context);
assert.strictEqual(uniforms.uReducedMotion.value, 0);

reducedMotionMatch = true;
vm.runInContext('drawPath(["A", "B", "C"]); animate();', context);
assert.strictEqual(vm.runInContext('pathLine.material.uniforms.uReducedMotion.value', context), 1, 'Reduced motion reflects true');

console.log('Visual upgrade TDD tests passed!');
