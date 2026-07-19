const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');

const { calculateInspectionScale, getPhotosphereParams, getSpectralColorHex } = require('./public/js/visual_logic.js');

// 1. Perspective Sizing Helper Tests
assert.strictEqual(typeof calculateInspectionScale, 'function', 'Helper must exist');

// 1280x720, target 34%. shortDim = 720. Target px = 720 * 0.34 = 244.8 px.
let scale1 = calculateInspectionScale(100, 60, 1280, 720, 0.34);
assert(Math.abs(scale1 - 19.63) < 0.1, `Expected ~19.63, got ${scale1}`);

let scale2 = calculateInspectionScale(100, 60, 390, 844, 0.34);
assert(Math.abs(scale2 - 9.07) < 0.1, `Expected ~9.07, got ${scale2}`);

// Malformed inputs
assert.strictEqual(calculateInspectionScale(-10, 60, 1280, 720, 0.34), 1.0, 'Fallback for negative dist');
assert.strictEqual(calculateInspectionScale(100, -60, 1280, 720, 0.34), 1.0, 'Fallback for negative fov');
assert.strictEqual(calculateInspectionScale(100, 60, 0, 720, 0.34), 1.0, 'Fallback for zero width');
assert.strictEqual(calculateInspectionScale(NaN, 60, 1280, 720, 0.34), 1.0, 'Fallback for NaN');

// Monotonic distance behavior
let scaleNear = calculateInspectionScale(50, 60, 1280, 720, 0.34);
assert(scaleNear < scale1, 'Scale should be smaller when closer to maintain constant CSS size');

// 2. Identity-aware seed tests
let params1 = getPhotosphereParams('M', 'StarA|10|20|30');
let params2 = getPhotosphereParams('M', 'StarA|10|20|30');
assert.strictEqual(params1.seed, params2.seed, 'Same star identity must yield same seed');

let params3 = getPhotosphereParams('M', 'StarB|-10|0|5');
assert.notStrictEqual(params1.seed, params3.seed, 'Different star identity must yield different seed');

assert.strictEqual(params1.limbDarkening, 0.8);
assert.strictEqual(params3.limbDarkening, 0.8);

// Pure Parameter Tests
let mHex = getSpectralColorHex('M');
let mColor = {r: ((mHex>>16)&255)/255, g: ((mHex>>8)&255)/255, b: (mHex&255)/255};
assert.ok(mColor.r > mColor.g && mColor.g > mColor.b, "M palette must be red/orange dominant (R>G>B)");
assert.ok((mColor.r - mColor.g) > 0.15 && (mColor.g - mColor.b) > 0.1, "M palette R>G>B by meaningful margins");

let kHex = getSpectralColorHex('K');
let kColor = {r: ((kHex>>16)&255)/255, g: ((kHex>>8)&255)/255, b: (kHex&255)/255};
let gHex = getSpectralColorHex('G');
let gColor = {r: ((gHex>>16)&255)/255, g: ((gHex>>8)&255)/255, b: (gHex&255)/255};
assert.ok(kColor.r/kColor.b > gColor.r/gColor.b, "K must be warmer than G");

let oHex = getSpectralColorHex('O');
let bHex = getSpectralColorHex('B');
let oColor = {r: ((oHex>>16)&255)/255, g: ((oHex>>8)&255)/255, b: (oHex&255)/255};
let bColor = {r: ((bHex>>16)&255)/255, g: ((bHex>>8)&255)/255, b: (bHex&255)/255};
assert.ok(oColor.b > oColor.r && oColor.b > oColor.g, "O must be blue");
assert.ok(bColor.b > bColor.r && bColor.b > bColor.g, "B must be blue");

['O','B','A','F','G','K','M'].forEach(cls => {
    let hex = getSpectralColorHex(cls); let c = {r: ((hex>>16)&255)/255, g: ((hex>>8)&255)/255, b: (hex&255)/255};
    assert.ok(isFinite(c.r) && isFinite(c.g) && isFinite(c.b));
    assert.ok(c.r >= 0 && c.r <= 1 && c.g >= 0 && c.g <= 1 && c.b >= 0 && c.b <= 1);
});

// 3. Production Wiring Test
const rawAppJs = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const vmAppJs = rawAppJs.replace(/^loadStars\(\);\s*$/m, '');

const scripts = [
    'autocomplete.js',
    'visual_logic.js',
    'overview_sky.js',
    'transition.js',
    'wheel_zoom.js',
    'star_picking.js',
    'pointer_state.js'
].map(f => fs.readFileSync(path.join(__dirname, 'public/js', f), 'utf8'));

class Element extends EventTarget {
    constructor(id = '', tagName = '') { super(); this.id = id; this.tagName = tagName.toUpperCase(); this.style = {}; this.dataset = {}; this.children = []; this.disabled = false; this.attributes = {}; this._classes = new Set(); this._className = ''; this._registeredListeners = []; }
    get className() { return this._className; }
    set className(v) { this._className = v; this._classes = new Set(v.split(/\s+/)); }
    get classList() { const self = this; return { add(c) { self._classes.add(c); self._className = Array.from(self._classes).join(' '); }, remove(c) { self._classes.delete(c); self._className = Array.from(self._classes).join(' '); }, toggle(c) { if (self._classes.has(c)) self._classes.delete(c); else self._classes.add(c); self._className = Array.from(self._classes).join(' '); }, contains(c) { return self._classes.has(c); } }; }
    addEventListener(type, handler, options = false) { this._registeredListeners.push({ type, handler, options }); super.addEventListener(type, handler, options); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    removeAttribute(name) { delete this.attributes[name]; }
    getAttribute(name) { return this.attributes.hasOwnProperty(name) ? this.attributes[name] : null; }
    appendChild(child) { this.children.push(child); return child; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    querySelector(selector) { let all = this.querySelectorAll('*'); if (selector === '.hop-button[aria-current="step"]') { return all.find(c => c.classList.contains('hop-button') && c.getAttribute('aria-current') === 'step') || null; } if (selector.startsWith('.')) { const cls = selector.substring(1); return all.find(c => c.classList.contains(cls)) || null; } return all.find(c => c.tagName === selector.toUpperCase()) || null; }
    querySelectorAll(selector) { let res = []; for (let c of this.children) { res.push(c); res.push(...c.querySelectorAll('*')); } if (selector === '*') return res; if (selector === '.hop-button') return res.filter(c => c.classList.contains('hop-button')); return res; }
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
    getElementById(id) { if (!elements.has(id)) elements.set(id, new Element(id)); return elements.get(id); },
    querySelectorAll(selector) { if (selector === '.hop-button') { return document.getElementById('hop-list').querySelectorAll(selector); } return []; },
    querySelector(selector) { if (selector === '.hop-button[aria-current="step"]') { return document.getElementById('hop-list').querySelector(selector); } return null; }
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
        normalize() { let length = Math.hypot(this.x, this.y, this.z); if (length === 0) return this; this.x /= length; this.y /= length; this.z /= length; return this; }
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
    PerspectiveCamera: class { position = new THREE.Vector3(); up = new THREE.Vector3(); lookAt() {} updateProjectionMatrix() {} updateMatrixWorld() {} projectionMatrix = { elements: [] }; matrixWorldInverse = { elements: [] }; fov = 60; aspect = 1; },
    WebGLRenderer: class { domElement = new Element(); setSize() {} setPixelRatio() {} render() {} setClearColor() {} capabilities = { getMaxAnisotropy: () => 16 } },
    Points: class { constructor(g,m) { this.geometry = g; this.material = m || { opacity: 1.0 }; } position = new THREE.Vector3(); lookAt() {} },
    BufferGeometry: class { setAttribute(name, attr) { if(name==='hideMarker') this.marker = attr; } computeBoundingSphere() { this.boundingSphere = { radius: 100 }; } setFromPoints(pts) { this.pts=pts; return this; } getAttribute(name) { return name==='hideMarker'? this.marker : null; } dispose() {} scale() {} },
    BufferAttribute: class { constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; this.needsUpdate = false; } },
    Float32BufferAttribute: class {},
    LineDashedMaterial: class { dispose() {} },
    ShaderMaterial: class { dispose() {} uniforms = { uTransitionOpacity: { value: 1.0 }, uSelectedPointOpacity: { value: 1.0 }, uColor: { value: {} }, uLimbDarkening: { value: 0 }, uGranulationContrast: { value: 0 }, uGranulationScale: { value: 0 }, uActivity: { value: 0 }, uSeed: { value: 0 }, uTime: { value: 0 } }; },
    Line: class { constructor(g,m){this.geometry=g; this.material=m;} computeLineDistances(){} },
    PointsMaterial: class { uniforms = { uSelectedPointOpacity: { value: 1.0 } } },
    TextureLoader: class { load() { return {}; } },
    Color: class { setHex() {} set() {} copy() {} },
    Group: class { position = new THREE.Vector3(); scale = new THREE.Vector3(); add() {} },
    Mesh: class { material = { uniforms: { uTransitionOpacity: { value: 1.0 } }, opacity: 1.0 }; geometry = new THREE.BufferGeometry(); updateWorldMatrix() {} getWorldPosition() {} getWorldScale(v) { v.set(1,1,1); return v; } matrixWorld = {}; position = new THREE.Vector3(); lookAt() {} scale = new THREE.Vector3(); },
    MeshBasicMaterial: class { },
    SphereGeometry: class { constructor() {} scale() {} },
    RingGeometry: class { constructor() {} scale() {} },
    Matrix4: class { elements = []; multiplyMatrices() {} invert() {} copy() { return this; } },
    Matrix3: class { setFromMatrix4() {} set() {} },
    AdditiveBlending: 2,
    sRGBEncoding: 3001,
    ACESFilmicToneMapping: 4,
    BackSide: 1,
    FrontSide: 0,
    DoubleSide: 2
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

// Intercept getPhotosphereParams to prevent errors and verify identity logic
vm.runInNewContext(`
    // Verify pure functions exist
    const origGetPhotosphereParams = getPhotosphereParams;
    let interceptCalled = false;
    getPhotosphereParams = (s, identity) => {
        interceptCalled = true;
        if (!identity) throw new Error("getPhotosphereParams missing identity");
        return origGetPhotosphereParams(s, identity);
    };
`, context);

vm.runInNewContext('const OrbitControls = THREE.OrbitControls;\n' + vmAppJs, context);
elements.set('star-details', vm.runInNewContext('detailsCard', context));

vm.runInNewContext(`
    getGalaxyFrame = () => ({
        viewOut: new THREE.Vector3(0, 0, 1),
        distance: 100,
    });
`, context);

console.log("Running Wiring Test");
vm.runInNewContext(`
    starData = [
        { n: "Hop0", x: 0, y: 0, z: 0, s: "G", m: 1 },
        { n: "Hop1", x: 10, y: 0, z: 0, s: "G", m: 1 },
        { n: "TargetStar", x: 100, y: 100, z: 100, s: "M", m: 2 }
    ];

    const pos = new Float32Array([0,0,0, 10,0,0, 100,100,100]);
    starsPoints = {
        material: { uniforms: { uSelectedPointOpacity: { value: 1.0 } } },
        geometry: {
            attributes: { position: { array: pos } },
            getAttribute(n) { if (n==="isSelected") return { setX(){}, needsUpdate: false }; return null; }
        }
    };

    // Set initial camera pose to canonical terminal pose
    controls.target.set(100, 100, 100);
    camera.position.set(100, 100 - 6.32, 100 + 18.97); // Canonical terminal distance ~19.995

    focusRing = new THREE.Mesh();
    focusRing.material = { uniforms: { uTransitionOpacity: { value: 1.0 } }, opacity: 1.0 };
    detailGroup = new THREE.Group();
    solMesh = new THREE.Mesh();
    solMesh.material = { uniforms: { uTransitionOpacity: { value: 1.0 } } };
    starMesh = new THREE.Mesh();
    starMesh.material = { uniforms: { uColor: { value: new THREE.Color() }, uLimbDarkening: { value: 0 }, uGranulationContrast: { value: 0 }, uGranulationScale: { value: 0 }, uActivity: { value: 0 }, uSeed: { value: 0 }, uTime: { value: 0 }, uTransitionOpacity: { value: 1.0 } } };
    coronaMesh = new THREE.Mesh();
    coronaMesh.material = { uniforms: { uColor: { value: new THREE.Color() }, uActivity: { value: 0 }, uSeed: { value: 0 }, uTime: { value: 0 }, uTransitionOpacity: { value: 1.0 } } };

    flightTargetStarIndex = -1; // Route committed case
    flightTargetStar = null;
    currentSelectedStarIndex = 2; // Crucial for animate() to process detailGroup
    targetNode.set(100, 100, 100);
    focusRing.position.set(100, 100, 100);
    focusRing.visible = true;

    // force detail logic to run
    let err = null;
    try {
        animate(100);
    } catch(e) {
        err = e.stack || e.toString();
    }

    globalThis.test_result = {
        detailScale: detailGroup.scale.x,
        focusRingOpacity: (focusRing.material.uniforms && focusRing.material.uniforms.uTransitionOpacity) ? focusRing.material.uniforms.uTransitionOpacity.value : focusRing.material.opacity,
        focusRingVisible: focusRing.visible,
        interceptCalled: interceptCalled,
        detailVisible: detailGroup.visible,
        pointOpacity: starsPoints.material.uniforms.uSelectedPointOpacity.value,
        error: err
    };
`, context);

const res = context.test_result;
if (res.error) console.error("Animate Error: ", res.error);

// Source checks for shader contracts
const appJsSrc = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');

// Match starMesh and coronaMesh setup
const starMeshMatch = appJsSrc.match(/const starDetailMat = new THREE\.ShaderMaterial\(\{[\s\S]+?starMesh = new THREE\.Mesh/);
const coronaMeshMatch = appJsSrc.match(/const coronaMat = new THREE\.ShaderMaterial\(\{[\s\S]+?coronaMesh = new THREE\.Mesh/);

assert.ok(starMeshMatch, "Could not find starMesh shader material");
assert.ok(coronaMeshMatch, "Could not find coronaMesh shader material");

const starShaderSrc = starMeshMatch[0];
const coronaShaderSrc = coronaMeshMatch[0];

// Angular breakup in corona
assert.ok(coronaShaderSrc.includes('atan') || coronaShaderSrc.includes('angle') || coronaShaderSrc.includes('snoise') || coronaShaderSrc.includes('vUv'), "Corona must have angular/procedural breakup");

// No hard outer ring path in corona
if (coronaShaderSrc.includes('step(1.0') || coronaShaderSrc.includes('step(0.99')) {
    assert.fail("Corona shader must not have a hard concentric boundary");
}

// Transparent/depthWrite/additive
assert.ok(coronaShaderSrc.includes('blending: THREE.AdditiveBlending'), "Corona must be additive");
assert.ok(coronaShaderSrc.includes('transparent: true'), "Corona must be transparent");
assert.ok(coronaShaderSrc.includes('depthWrite: false'), "Corona must not write depth");

// Bounded layer count in shaders (<= 5 octaves)
const numSnoise = (starShaderSrc.match(/snoise/g) || []).length;
assert.ok(numSnoise <= 5, "Shader procedural work must be bounded (<=5 octaves/layers)");

// No focused point cloud for corona (must use Plane/Sprite)
const coronaGeoMatch = appJsSrc.match(/const coronaGeo = new THREE\.(.+?Geometry)\(/);
assert.ok(coronaGeoMatch, "Could not find corona geometry");
const geoType = coronaGeoMatch[1];
if (geoType === 'SphereGeometry' || geoType === 'PointsGeometry') {
    assert.fail("Corona/chromosphere must not be a thick shell or point cloud. Use Plane/Sprite/Buffer geometry.");
}

assert.ok(res.detailVisible, "detailGroup must be fully visible at canonical terminal distance ~19.995");
assert.ok(res.pointOpacity < 0.05, "selected catalog point opacity must be approx 0 at canonical distance");
assert.ok(res.focusRingOpacity < 0.05, "reticle must fade to approx 0 when detail is active");

console.log("Detail Scale: ", res.detailScale);
assert.ok(res.detailScale > 0.5, "Production wiring must set detailGroup.scale using calculateInspectionScale (should be ~0.98 or larger depending on window size)");

assert.strictEqual(res.interceptCalled, true, "Production wiring must use identity in getPhotosphereParams");

console.log("All TDD tests passed!");
