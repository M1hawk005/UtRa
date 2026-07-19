const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function stripComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const rawAppJs = fs.readFileSync(__dirname + '/public/app.js', 'utf8');
const appJs = stripComments(rawAppJs);
const vmAppJs = rawAppJs.replace(/^loadStars\(\);\s*$/m, '').replace(/^animate\(\);\s*$/m, '');

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
        this.hidden = false;
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

    setAttribute(k, v) { this.attributes[k] = String(v); }
    getAttribute(k) { return this.attributes[k] || null; }
    removeAttribute(k) { delete this.attributes[k]; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; }
    appendChild(child) { this.children.push(child); }
    append(...children) { this.children.push(...children); }
    replaceChildren() { this.children = []; }
    addEventListener(type, listener, options) {
        this._registeredListeners.push({ type, listener, options });
        super.addEventListener(type, listener, options);
    }
    hasPointerCapture() { return false; }
    releasePointerCapture() {}
    setPointerCapture() {}
}

const documentMock = {
    _elements: new Map(),
    body: new Element('body', 'body'),
    createElement(tag) { return new Element('', tag); },
    getElementById(id) {
        if (!this._elements.has(id)) {
            this._elements.set(id, new Element(id));
        }
        return this._elements.get(id);
    },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    addEventListener() {}
};

// Pre-populate specific elements
documentMock.getElementById('canvas-container');
documentMock.getElementById('ui-panel');
documentMock.getElementById('star-details');
documentMock.getElementById('hop-list');
documentMock.getElementById('results');

const windowMock = {
    innerWidth: 800,
    innerHeight: 600,
    devicePixelRatio: 1,
    addEventListener() {},
    dispatchEvent() {},
    matchMedia() { return { matches: false }; }
};

class Vector3 {
    constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
    set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
    clone(){return new Vector3(this.x,this.y,this.z);}
    copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}
    add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}
    addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;}
    sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}
    multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;}
    length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z);}
    normalize(){let l=this.length();if(l>0){this.x/=l;this.y/=l;this.z/=l;}return this;}
    lerpVectors(v1, v2, alpha){this.x=v1.x+(v2.x-v1.x)*alpha;this.y=v1.y+(v2.y-v1.y)*alpha;this.z=v1.z+(v2.z-v1.z)*alpha;return this;}
    dot(v){return this.x*v.x+this.y*v.y+this.z*v.z;}
    distanceTo(v){let dx=this.x-v.x,dy=this.y-v.y,dz=this.z-v.z;return Math.sqrt(dx*dx+dy*dy+dz*dz);}
    applyQuaternion(){return this;}
    transformDirection(){return this;}
}
class Matrix4 {
    constructor(){this.elements=new Array(16).fill(0);}
    multiplyMatrices(){return this;}
    invert(){return this;}
}
class Matrix3 {
    constructor(){this.elements=new Array(9).fill(0);}
    set(){return this;}
    setFromMatrix4(){return this;}
}

class Color {
    constructor(r=1,g=1,b=1){this.r=r;this.g=g;this.b=b;}
    clone(){return new Color(this.r,this.g,this.b);}
    lerp(){return this;}
}

class MathUtils {
    static degToRad(d){return d*Math.PI/180;}
}

const THREEMock = {
    Scene: class {},
    PerspectiveCamera: class {
        constructor(){this.position=new Vector3();this.up=new Vector3(0,1,0);this.matrixWorldInverse=new Matrix4();this.projectionMatrix=new Matrix4();this.aspect=800/600;this.fov=60;}
        lookAt(){}
        updateMatrixWorld(){}
    },
    WebGLRenderer: class {
        constructor(){this.domElement=new Element('canvas','canvas');this.capabilities={getMaxAnisotropy:()=>1};}
        setSize(){} setPixelRatio(){} setClearColor(){}
    },
    Vector3, Matrix4, Matrix3, Color, MathUtils,
    Vector2: class { constructor(x=0,y=0){this.x=x;this.y=y;} set(){} },
    OrbitControls: class {
        constructor(){this.target=new Vector3();}
        update(){}
    },
    Group: class { add(){} },
    Mesh: class { constructor(){this.position=new Vector3();this.scale=new Vector3();this.quaternion={setFromUnitVectors:()=>{}};this.material={opacity:1};} lookAt(){} updateMatrixWorld(){} },
    Points: class { constructor(){this.position=new Vector3();this.quaternion={};} lookAt(){} updateMatrixWorld(){} },
    BufferGeometry: class { constructor(){this.attributes={};} setAttribute(k,v){this.attributes[k]=v;} getAttribute(k){return this.attributes[k];} computeBoundingSphere(){this.boundingSphere={radius:100};} },
    SphereGeometry: class { scale(){} },
    RingGeometry: class {},
    BufferAttribute: class { constructor(a,s){this.array=a;this.itemSize=s;} setX(i,v){this.array[i*this.itemSize]=v;} },
    ShaderMaterial: class { constructor(){this.uniforms={};this.fragmentShader="";} },
    MeshBasicMaterial: class {},
    TextureLoader: class { load(){return {};} },
    Raycaster: class { constructor(){this.ray={};} },
    sRGBEncoding: 3001,
    ACESFilmicToneMapping: 4,
    AdditiveBlending: 2,
    BackSide: 1,
    EventDispatcher: class {}
};

const sandbox = {
    window: windowMock,
    document: documentMock,
    THREE: THREEMock,
    console: console,
    Math: Math,
    Date: Date,
    performance: { now: () => Date.now() },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    fetch: () => Promise.resolve({ json: () => Promise.resolve([]) }),
    requestAnimationFrame: (cb) => { /* mock */ },
    Event: Event
};

vm.createContext(sandbox);

scripts.forEach(script => vm.runInContext(script, sandbox));
vm.runInContext(vmAppJs, sandbox);

vm.runInContext(`
    // Override rendering logic which fails in headless
    globalThis.render = function() {};
    globalThis.updateGalaxyZoomLimit = function() { return { distance: 28000, viewOut: new THREE.Vector3(0,1,0), diskY: new THREE.Vector3(0,0,1), target: new THREE.Vector3() }; };

    // Set up star data
    starData = [
        { n: "StarA", x: 10, y: 0, z: 0, s: "G", m: 1 },
        { n: "StarB", x: 20, y: 10, z: 5, s: "M", m: 2 }
    ];

    const pos = new Float32Array([10,0,0, 20,10,5]);
    const sel = new Float32Array([0, 0]);
    starsGeometry = new THREE.BufferGeometry();
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starsGeometry.setAttribute('isSelected', new THREE.BufferAttribute(sel, 1));
    starsPoints = { geometry: starsGeometry };

    // Focus Ring mock
    focusRing = new THREE.Mesh();
    focusRing.visible = false;

    document.getElementById('star-details').hidden = true;

    // Initialize Selection
    currentSelectedStarIndex = -1;
    flightTargetStarIndex = -1;

    // TEST 1: Ordinary Free-Roam Focus Interruption

    // Select Star A
    acquireStarTarget(0); // target Star A
    finishFlightTransition(true); // Commit Star A

    globalThis.test_A_result = {
        selected: currentSelectedStarIndex,
        detailsHidden: detailsCard.hidden,
        focusRingVisible: focusRing.visible,
        focusRingPos: focusRing.position.clone()
    };

    // Now click Star B
    acquireStarTarget(1);

    // Simulate some frames
    updateFlight(100);

    // Interrupt flight!
    finishFlightTransition(false); // Wheel/pointer cancellation

    globalThis.test_B_result = {
        selected: currentSelectedStarIndex,
        target: flightTargetStarIndex,
        detailsHidden: detailsCard.hidden,
        focusRingVisible: focusRing.visible,
        focusRingPos: focusRing.position.clone()
    };
`, sandbox);

const resA = sandbox.test_A_result;
assert.strictEqual(resA.selected, 0, "Star A should be selected initially");
assert.strictEqual(resA.detailsHidden, false, "Details should be visible for Star A");

const resB = sandbox.test_B_result;
console.log("TEST RESULT:", resB);

assert.strictEqual(resB.selected, 0, "Star A must remain selected after interrupted flight to Star B");
assert.strictEqual(resB.target, -1, "Pending target B must be discarded");
assert.strictEqual(resB.detailsHidden, false, "Details for Star A must remain visible");
assert.strictEqual(resB.focusRingVisible, true, "Focus ring must remain visible");
assert.strictEqual(resB.focusRingPos.x, 10, "Focus ring must snap back to Star A (x=10)");

console.log("GREEN! Interrupted Focus Tests Passed.");
