// Scene Setup
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100000); // Increased far plane to see galaxy
camera.position.set(-947, -6638, -2465); // Will be updated when stars load, but initial position near galaxy

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setClearColor(0x000000, 1);
document.getElementById('canvas-container').appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.rotateSpeed = 0.18;
controls.zoomSpeed = 1.15;
controls.panSpeed = 0.95;
controls.screenSpacePanning = true;
controls.maxDistance = Infinity;
controls.minDistance = calculateMinDistance(1.0, 0.55, camera.fov);

// Variables
let starsGeometry;
let starsPoints;
let pathLine;
let pathNodes; // HUD overlay for path nodes
let starData = [];
let galacticCenter = new THREE.Vector3();
let focusRing; // Tactical ring to highlight selected star
let galaxyFrameDistance = Infinity;
let currentRouteHops = [];
let resolvedRouteStars = [];
let hopToMarkerIndex = [];
let currentHopIndex = -1;
let currentSelectedStarIndex = -1;
let interiorSky;
let overviewSky, overviewSkyMaterial;
let detailGroup = new THREE.Group();
let solMesh, starMesh;

// Navigation flight variables
let flightSourceNode = new THREE.Vector3();
let flightSourceCam = new THREE.Vector3();
let flightSourceMapCam = new THREE.Vector3();
let flightSourceMapTarget = new THREE.Vector3();
let flightTargetMapCam = new THREE.Vector3();
let flightTargetMapTarget = new THREE.Vector3();

function highlightStar(idx) {
    if (!starsGeometry || currentSelectedStarIndex === idx) return;
    const isSelectedAttr = starsGeometry.getAttribute('isSelected');
    if (currentSelectedStarIndex >= 0) {
        isSelectedAttr.setX(currentSelectedStarIndex, 0.0);
    }
    currentSelectedStarIndex = idx;
    if (currentSelectedStarIndex >= 0) {
        isSelectedAttr.setX(currentSelectedStarIndex, 1.0);
    }
    isSelectedAttr.needsUpdate = true;
}


const _galaxyTarget = new THREE.Vector3();
const _galaxyWorldScale = new THREE.Vector3();
const _galaxyDiskX = new THREE.Vector3();
const _galaxyDiskY = new THREE.Vector3();
const _galaxyDiskNormal = new THREE.Vector3();
const _galaxyViewOut = new THREE.Vector3();
const _galaxyFrameOutput = { target: _galaxyTarget, diskY: _galaxyDiskY, viewOut: _galaxyViewOut, distance: 0 };

const _scratchVecA = new THREE.Vector3();
const _scratchVecB = new THREE.Vector3();
const _scratchVecC = new THREE.Vector3();
const _starBaseColor = new THREE.Color();
const _skyResOutput = { opacity: 0, lodBias: 0 };

let flightTransitionState = createTransition({ duration: 900, fadeFraction: 0.25 });

// A repeatable, inexpensive random source keeps the galaxy stable between loads.
function galaxyRandom(seed = 0x6d696c6b) {
    return function() {
        seed |= 0;
        seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function gaussian(random) {
    return Math.sqrt(-2 * Math.log(Math.max(1e-7, random()))) * Math.cos(2 * Math.PI * random());
}

function getGalaxyFrame() {
    const galaxy = scene.userData.galaxyMesh;
    if (!galaxy) return null;

    galaxy.updateWorldMatrix(true, true);
    galaxy.geometry.computeBoundingSphere();

    // The generated disk is galaxy-local XY. Frame only that geometry, not the
    // separately rendered catalog/background stars or child-object bounds.
    galaxy.getWorldPosition(_galaxyTarget);
    galaxy.getWorldScale(_galaxyWorldScale);
    const radius = galaxy.geometry.boundingSphere.radius
        * Math.max(Math.abs(_galaxyWorldScale.x), Math.abs(_galaxyWorldScale.y), Math.abs(_galaxyWorldScale.z));

    _galaxyDiskX.set(1, 0, 0).transformDirection(galaxy.matrixWorld);
    _galaxyDiskY.set(0, 1, 0).transformDirection(galaxy.matrixWorld);
    _galaxyDiskNormal.set(0, 0, 1).transformDirection(galaxy.matrixWorld);

    // View along a vector that is inclined ~60 degrees from the normal
    // for an elliptical disk appearance with a diagonal/horizontal major axis.
    _galaxyViewOut.copy(_galaxyDiskNormal).multiplyScalar(0.45)
        .addScaledVector(_galaxyDiskY, -0.75)
        .addScaledVector(_galaxyDiskX, 0.45)
        .normalize();
    const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * camera.aspect);
    const limitingHalfFov = Math.min(verticalHalfFov, horizontalHalfFov);
    const distance = radius / Math.sin(limitingHalfFov) * 1.35; // increased margin

    _galaxyFrameOutput.distance = distance;
    return _galaxyFrameOutput;
}

function updateGalaxyZoomLimit() {
    const frame = getGalaxyFrame();
    if (!frame) return null;

    galaxyFrameDistance = frame.distance;
    if (!isFlying) controls.maxDistance = galaxyFrameDistance;
    return frame;
}

function frameGalaxy() {
    const frame = updateGalaxyZoomLimit();
    if (!frame) return;

    const { target, diskY, viewOut, distance } = frame;

    controls.target.copy(target);
    camera.position.copy(target).addScaledVector(viewOut, distance);
    const forward = target.clone().sub(camera.position).normalize();
    camera.up.copy(diskY).addScaledVector(forward, -diskY.dot(forward)).normalize();
    camera.lookAt(target);
    controls.update();
}

function createNebulae() {
    const random = galaxyRandom(0x6e656275);
    const numRegions = 12;
    const particlesPerRegion = 500;
    const totalParticles = numRegions * particlesPerRegion;

    const nPos = new Float32Array(totalParticles * 3);
    const nCol = new Float32Array(totalParticles * 3);
    const nSize = new Float32Array(totalParticles);
    const nAlpha = new Float32Array(totalParticles);

    const arms = 4;
    const pitchAngle = 12 * Math.PI / 180;
    const bConst = Math.tan(pitchAngle);
    const aConst = 1000;

    const colors = [
        new THREE.Color(0x772244), // H-alpha red (muted)
        new THREE.Color(0x663355), // H-alpha pink (muted)
        new THREE.Color(0x335577), // O-III cyan (muted)
        new THREE.Color(0x552233)  // S-II deep red (muted)
    ];

    let offset = 0;

    for (let r = 0; r < numRegions; r++) {
        let d = 3000 + random() * 8000;
        let thetaSpiral = Math.log(d / aConst) / bConst;
        let armIdx = r % arms;

        if (random() < 0.5) armIdx = random() < 0.5 ? 0 : 1; // concentrate slightly on primary arms
        let armOffset = armIdx * (Math.PI * 2 / arms);
        let finalAngle = thetaSpiral + armOffset - 0.08; // offset towards inner edge

        const cx = Math.cos(finalAngle) * d;
        const cy = Math.sin(finalAngle) * d;
        const regionColor = colors[Math.floor(random() * colors.length)];
        const extent = 200 + random() * 600;

        const f1 = random() * 3.0;
        const f2 = random() * 3.0;
        const phase1 = random() * Math.PI * 2;
        const phase2 = random() * Math.PI * 2;

        for (let i = 0; i < particlesPerRegion; i++) {
            let t = (i / particlesPerRegion) * Math.PI * 2;
            let dx = Math.sin(t * f1 + phase1) * extent * 0.5 + (random() - 0.5) * extent * 0.2;
            let dy = Math.cos(t * f2 + phase2) * extent * 0.5 + (random() - 0.5) * extent * 0.2;
            let dz = (random() - 0.5) * 60;

            nPos[(offset + i) * 3] = cx + dx;
            nPos[(offset + i) * 3 + 1] = cy + dy;
            nPos[(offset + i) * 3 + 2] = dz;

            let distToCenter = Math.sqrt(dx*dx + dy*dy + dz*dz) / (extent * 0.7);
            const edgeFactor = Math.min(1.0, distToCenter);
            const pColor = regionColor.clone().lerp(new THREE.Color(0x000000), random() * 0.1);

            nCol[(offset + i) * 3] = pColor.r;
            nCol[(offset + i) * 3 + 1] = pColor.g;
            nCol[(offset + i) * 3 + 2] = pColor.b;
            nSize[offset + i] = 60 + random() * 80;
            nAlpha[offset + i] = Math.max(0.05, 0.3 - edgeFactor * 0.3);
        }
        offset += particlesPerRegion;
    }

    const nGeo = new THREE.BufferGeometry();
    nGeo.setAttribute('position', new THREE.BufferAttribute(nPos, 3));
    nGeo.setAttribute('customColor', new THREE.BufferAttribute(nCol, 3));
    nGeo.setAttribute('size', new THREE.BufferAttribute(nSize, 1));
    nGeo.setAttribute('alphaMask', new THREE.BufferAttribute(nAlpha, 1));

    const nMat = new THREE.ShaderMaterial({
        uniforms: {
            uTransitionOpacity: { value: 1.0 }
        },
        vertexShader: `
            attribute float size;
            attribute vec3 customColor;
            attribute float alphaMask;
            varying vec3 vColor;
            varying float vAlpha;
            varying vec2 vUvOffset;
            varying float vCameraDist;
            varying float vGalacticDist;
            void main() {
                vColor = customColor;
                vAlpha = alphaMask;
                vUvOffset = position.xy * 0.05;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                float distance = -mvPosition.z;
                vCameraDist = length(mvPosition.xyz);
                vGalacticDist = length(cameraPosition - modelMatrix[3].xyz);
                gl_PointSize = clamp(size * (4600.0 / distance), 1.0, 30.0);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform float uTransitionOpacity;
            varying vec3 vColor;
            varying float vAlpha;
            varying vec2 vUvOffset;
            varying float vCameraDist;
            varying float vGalacticDist;

            float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
            float noise(vec2 p) {
                vec2 i = floor(p); vec2 f = fract(p);
                vec2 u = f * f * (3.0 - 2.0 * f);
                return mix(mix(hash(i), hash(i + vec2(1.0,0.0)), u.x),
                           mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
            }
            float fbm(vec2 p) {
                float f = 0.0;
                f += 0.5000 * noise(p); p = p * 2.02;
                f += 0.2500 * noise(p); p = p * 2.03;
                f += 0.1250 * noise(p); p = p * 2.01;
                f += 0.0625 * noise(p);
                return f;
            }

            void main() {
                vec2 uv = gl_PointCoord.xy - vec2(0.5);
                float dist = length(uv);
                if (dist > 0.5) discard;

                float glow = pow(1.0 - (dist * 2.0), 3.0);
                vec2 p = (gl_PointCoord.xy * 5.0) + vUvOffset;
                float n = fbm(p) * 0.3 + 0.7; // dampened noise, mostly smooth
                float finalAlpha = glow * n * vAlpha * 0.12;

                float fade = smoothstep(150.0, 500.0, vCameraDist);
                float macroFade = smoothstep(12000.0, 25000.0, vGalacticDist);
                finalAlpha *= fade * macroFade;
                if (finalAlpha < 0.005) discard;
                gl_FragColor = vec4(vColor * 0.75, finalAlpha * uTransitionOpacity);
                #include <tonemapping_fragment>
                #include <encodings_fragment>
            }
        `,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true
    });

    const nebulaMesh = new THREE.Points(nGeo, nMat);
    nebulaMesh.position.copy(galacticCenter);

    const ngpRA = 12.85 * 15 * (Math.PI / 180);
    const ngpDec = 27.13 * (Math.PI / 180);
    const galacticNorth = new THREE.Vector3(
        Math.cos(ngpDec) * Math.cos(ngpRA),
        Math.cos(ngpDec) * Math.sin(ngpRA),
        Math.sin(ngpDec)
    );
    nebulaMesh.lookAt(galacticCenter.clone().add(galacticNorth));

    scene.add(nebulaMesh);
    scene.userData.nebulaMesh = nebulaMesh;
}

function initGalaxy() {
    const random = galaxyRandom();
    const isMobile = window.matchMedia('(max-width: 600px)').matches;
    const dist = 8178; // Parsecs to Sagittarius A*
    const ra = 17.761 * 15 * (Math.PI / 180);
    const dec = -29.007 * (Math.PI / 180);

    galacticCenter.x = dist * Math.cos(dec) * Math.cos(ra);
    galacticCenter.y = dist * Math.cos(dec) * Math.sin(ra);
    galacticCenter.z = dist * Math.sin(dec);

    const ngpRA = 12.85 * 15 * (Math.PI / 180);
    const ngpDec = 27.13 * (Math.PI / 180);
    const galacticNorth = new THREE.Vector3(
        Math.cos(ngpDec) * Math.cos(ngpRA),
        Math.cos(ngpDec) * Math.sin(ngpRA),
        Math.sin(ngpDec)
    );

    const textureLoader = new THREE.TextureLoader();
    const esoTexture = textureLoader.load('assets/milky-way-eso.webp');
    esoTexture.encoding = THREE.sRGBEncoding;
    esoTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const skyGeo = new THREE.SphereGeometry(50000, 64, 32);
    skyGeo.scale(-1, 1, 1);
    const skyMat = new THREE.MeshBasicMaterial({
        map: esoTexture,
        depthWrite: false,
        depthTest: false,
        fog: false,
        transparent: true,
        opacity: 0.0
    });
function patchSkyShader(shader) {
    if (!shader.uniforms.uLodBias) {
        shader.uniforms.uLodBias = { value: 0.0 };
    }
    if (!shader.fragmentShader.includes('uniform float uLodBias;')) {
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_pars_fragment>',
            '#include <map_pars_fragment>\nuniform float uLodBias;'
        );
    }
    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        [
            '#ifdef USE_MAP',
            '\tvec4 texelColor = texture2D( map, vUv, uLodBias );',
            '\ttexelColor = mapTexelToLinear( texelColor );',
            '\tdiffuseColor *= texelColor;',
            '#endif'
        ].join('\n')
    );
}

    skyMat.onBeforeCompile = (shader) => {
        patchSkyShader(shader);
        skyMat.userData.shader = shader;
    };
    interiorSky = new THREE.Mesh(skyGeo, skyMat);
    interiorSky.renderOrder = -2;
    interiorSky.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), galacticNorth);
    scene.add(interiorSky);

    const uiPanel = document.getElementById('panel-content');
    const infoLine = document.createElement('div');
    infoLine.id = 'sky-attribution';
    infoLine.style.fontSize = '10px';
    infoLine.style.marginTop = '10px';
    infoLine.style.color = 'var(--text-dim)';
    infoLine.innerHTML = `Interior sky: <a href="https://www.eso.org/public/images/eso0932a/" target="_blank" rel="noopener noreferrer" style="color:var(--highlight)">ESO/S. Brunier</a> | <span id="star-attribution"></span>`;
    uiPanel.appendChild(infoLine);

    const bhGeometry = new THREE.PlaneGeometry(3500, 3500);
    const bhMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0.0 }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            varying vec2 vUv;
            void main() {
                vec2 uv = vUv - 0.5;
                float r = length(uv);
                if (r > 0.5) discard;

                float core = exp(-r * r * 18.0);
                float glow = exp(-r * r * 5.0);
                float intensity = core * 0.8 + glow * 0.4;

                if (intensity < 0.01) discard;
                vec3 finalColor = mix(vec3(1.0, 0.75, 0.45), vec3(1.0, 0.95, 0.85), core);
                gl_FragColor = vec4(finalColor, intensity * 0.8);
                #include <tonemapping_fragment>
                #include <encodings_fragment>
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
    });

    const blackHole = new THREE.Mesh(bhGeometry, bhMaterial);
    blackHole.position.copy(galacticCenter);
    blackHole.lookAt(galacticCenter.clone().add(galacticNorth));
    scene.add(blackHole);
    scene.userData.blackHoleMat = bhMaterial;

    const bulgeCount = isMobile ? 10000 : 18000;
    const diskCount = isMobile ? 95000 : 180000;
    const globularCount = 120 * 75;
    const totalGlowing = bulgeCount + diskCount + globularCount;

    const gPos = new Float32Array(totalGlowing * 3);
    const gCol = new Float32Array(totalGlowing * 3);
    const gSize = new Float32Array(totalGlowing);

    let pIdx = 0;
    function addGlowingParticle(x, y, z, r, g, b, size) {
        gPos[pIdx * 3] = x;
        gPos[pIdx * 3 + 1] = y;
        gPos[pIdx * 3 + 2] = z;
        gCol[pIdx * 3] = r;
        gCol[pIdx * 3 + 1] = g;
        gCol[pIdx * 3 + 2] = b;
        gSize[pIdx] = size;
        pIdx++;
    }

    // 2a. Central Bulge
    for (let i = 0; i < bulgeCount; i++) {
        // Boxy/peanut bulge plus a modest long bar: Milky Way structure, not an M31 sphere.
        const r = -620 * Math.log(Math.max(0.0001, 1 - random()));
        const theta = random() * Math.PI * 2;
        const phi = Math.acos(random() * 2 - 1);
        const barMix = random() < 0.34;
        let x = r * Math.sin(phi) * Math.cos(theta);
        let y = r * Math.sin(phi) * Math.sin(theta);
        let z = r * Math.cos(phi) * (0.34 + 0.15 * random());
        if (barMix) {
            x = gaussian(random) * 1450;
            y = gaussian(random) * 360;
            z = gaussian(random) * 260;
        }
        const edge = Math.min(1, r / 2600);
        const colR = 1.0;
        const colG = 0.72 + 0.18 * (1 - edge);
        const colB = 0.38 + 0.18 * (1 - edge);
        const size = (1.5 + random() * 3.0) * (1.0 + 0.7 * Math.exp(-r / 450));

        addGlowingParticle(x, y, z, colR, colG, colB, size);
    }

    // 2b. Spiral Arms (Thin & Thick Disk)
    const arms = 4;
    const pitchAngle = 12 * Math.PI / 180;
    const bConst = Math.tan(pitchAngle);
    const aConst = 1000;
    const maxR = 15000;

    for (let i = 0; i < diskCount; i++) {
        let isThin = random() < 0.65;
        // Exponential old disk extends beyond the bright arms and supplies the faint envelope.
        let r = isThin ? (1500 + Math.pow(random(), 0.75) * (maxR - 1500))
                       : Math.min(18000, -5000 * Math.log(Math.max(0.001, 1 - random())));

        let x, y, z;
        let rColor, gColor, bColor;
        let size = random() * 1.8 + 0.65;

        if (isThin) {
            let thetaSpiral = Math.log(r / aConst) / bConst;
            let armIdx = Math.floor(random() * arms);
            let armOffset = armIdx * (Math.PI * 2 / arms);

            const macroCell = Math.floor(r / 1500) + armIdx * 13;
            const macroNoise = Math.sin(macroCell * 73.11) * 43758.5453;
            const macroCluster = (macroNoise - Math.floor(macroNoise)) - 0.5;

            const cell = Math.floor(r / 450) + armIdx * 37;
            const cellNoise = Math.sin(cell * 91.733) * 43758.5453;
            const cluster = (cellNoise - Math.floor(cellNoise)) - 0.5;

            const broken = Math.sin(r * 0.002 + armIdx * 1.5) + Math.cos(r * 0.005);

            if (broken < -0.2 && random() < 0.85) {
                armOffset += (random() - 0.5) * 1.4;
            }
            if (random() < 0.35) {
                armOffset += (random() - 0.5) * (Math.PI * 2 / arms);
            }

            let armWidth = 0.08 + (r / maxR) * 0.35 + Math.abs(macroCluster) * 0.3;
            let scatter = gaussian(random) * armWidth + cluster * 0.2 + macroCluster * 0.45;
            let finalAngle = thetaSpiral + armOffset + scatter;

            x = r * Math.cos(finalAngle);
            y = r * Math.sin(finalAngle);
            z = gaussian(random) * (60 + 80 * r / maxR);

            let mixR = r / maxR;
            if (mixR < 0.2) {
                rColor = 1.0; gColor = 0.9; bColor = 0.6;
            } else if (mixR < 0.4) {
                rColor = 0.95; gColor = 0.85; bColor = 0.75;
            } else if (mixR < 0.6) {
                rColor = 0.8; gColor = 0.8; bColor = 0.95;
            } else if (mixR < 0.8) {
                rColor = 0.5; gColor = 0.6; bColor = 1.0;
            } else {
                rColor = 0.3; gColor = 0.4; bColor = 1.0;
            }

        } else {
            let angle = random() * Math.PI * 2;
            x = r * Math.cos(angle);
            y = r * Math.sin(angle);
            let scaleH = 280 + 340 * Math.min(1, r / maxR);
            z = gaussian(random) * scaleH;
            // Subtle lopsided old-star envelope without changing the barred-spiral silhouette.
            x += 260 * Math.exp(-r / 9000);
            rColor = 0.92; gColor = 0.62 + random()*0.12; bColor = 0.35 + random()*0.1;
        }

        addGlowingParticle(x, y, z, rColor, gColor, bColor, size);
    }

    // 2c. Globular Clusters
    for (let i = 0; i < 120; i++) {
        let cr = 2000 + random() * 10000;
        let cTheta = random() * Math.PI * 2;
        let cPhi = Math.acos((random() * 2) - 1);

        let cx = cr * Math.sin(cPhi) * Math.cos(cTheta);
        let cy = cr * Math.sin(cPhi) * Math.sin(cTheta);
        let cz = cr * Math.cos(cPhi);

        let clusterStars = 75;
        for(let j=0; j<clusterStars; j++) {
            let u1 = Math.max(0.0001, random()); let u2 = random();
            let z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
            let z1 = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);
            let z2 = Math.sqrt(-2.0 * Math.log(Math.max(0.0001, random()))) * Math.cos(2.0 * Math.PI * random());

            let spread = 5 + random() * 10;
            let sx = cx + z0 * spread;
            let sy = cy + z1 * spread;
            let sz = cz + z2 * spread;

            let rColor, gColor, bColor;
            if (random() < 0.05) {
                rColor = 0.5; gColor = 0.7; bColor = 1.0;
            } else {
                rColor = 1.0; gColor = 0.8; bColor = 0.4;
            }

            let size = 1.5 + random() * 2.0;
            addGlowingParticle(sx, sy, sz, rColor, gColor, bColor, size);
        }
    }

    const gGeo = new THREE.BufferGeometry();
    gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
    gGeo.setAttribute('customColor', new THREE.BufferAttribute(gCol, 3));
    gGeo.setAttribute('size', new THREE.BufferAttribute(gSize, 1));

    const gMat = new THREE.ShaderMaterial({
        vertexShader: `
            attribute float size;
            attribute vec3 customColor;
            varying vec3 vColor;
            varying float vRand;
            varying float vCameraDist;
            varying float vGalacticDist;
            void main() {
                vColor = customColor;
                vRand = fract(sin(dot(position.xyz, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                float distance = -mvPosition.z;
                vCameraDist = length(mvPosition.xyz);
                vGalacticDist = length(cameraPosition - modelMatrix[3].xyz);
                gl_PointSize = clamp(size * (8200.0 / distance), 0.65, 18.0);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            varying float vRand;
            varying float vCameraDist;
            varying float vGalacticDist;
            void main() {
                vec2 uv = gl_PointCoord.xy - vec2(0.5);
                float dist = length(uv);
                if (dist > 0.5) discard;
                float gauss = exp(-dist * dist * 26.0);
                float alpha = gauss * (0.45 + 0.32 * vRand);
                float fade = smoothstep(150.0, 500.0, vCameraDist);
                float macroFade = smoothstep(12000.0, 25000.0, vGalacticDist);
                alpha *= fade * macroFade;
                if (alpha < 0.01) discard;
                gl_FragColor = vec4(vColor * (0.85 + 0.65 * vRand), alpha);
                #include <tonemapping_fragment>
                #include <encodings_fragment>
            }
        `,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true
    });

    const galaxyMesh = new THREE.Points(gGeo, gMat);
    galaxyMesh.position.copy(galacticCenter);
    galaxyMesh.lookAt(galacticCenter.clone().add(galacticNorth));
    scene.add(galaxyMesh);
    scene.userData.galaxyMesh = galaxyMesh;

    // 3. Dust Extinction Layer
    const dustCount = isMobile ? 14000 : 28000;
    const dPos = new Float32Array(dustCount * 3);
    const dCol = new Float32Array(dustCount * 3);
    const dSize = new Float32Array(dustCount);

    for (let i = 0; i < dustCount; i++) {
        let r = 800 + Math.pow(random(), 0.7) * (maxR - 800);
        let thetaSpiral = Math.log(r / aConst) / bConst;
        let armIdx = Math.floor(random() * arms);
        let armOffset = armIdx * (Math.PI * 2 / arms);

        const cell = Math.floor(r / 350) + armIdx * 51;
        const cellNoise = Math.sin(cell * 43.13) * 43758.5453;
        const cluster = (cellNoise - Math.floor(cellNoise)) - 0.5;

        if (random() < 0.45) {
            armOffset += (random() - 0.5) * (Math.PI * 2 / arms);
        }

        let armWidth = 0.07 + (r / maxR) * 0.3;
        let scatter = gaussian(random) * armWidth + cluster * 0.35;
        let finalAngle = thetaSpiral + armOffset + scatter - 0.1;

        dPos[i * 3] = r * Math.cos(finalAngle);
        dPos[i * 3 + 1] = r * Math.sin(finalAngle);
        dPos[i * 3 + 2] = gaussian(random) * (15 + 12 * r / maxR);

        dCol[i * 3] = 0.0;
        dCol[i * 3 + 1] = 0.0;
        dCol[i * 3 + 2] = 0.0;

        dSize[i] = 40.0 + random() * 120.0;
    }

    const dGeo = new THREE.BufferGeometry();
    dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    dGeo.setAttribute('customColor', new THREE.BufferAttribute(dCol, 3));
    dGeo.setAttribute('size', new THREE.BufferAttribute(dSize, 1));

    const dMat = new THREE.ShaderMaterial({
        vertexShader: `
            attribute float size;
            attribute vec3 customColor;
            varying vec3 vColor;
            varying float vCameraDist;
            varying float vGalacticDist;
            void main() {
                vColor = customColor;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                float distance = -mvPosition.z;
                vCameraDist = length(mvPosition.xyz);
                vGalacticDist = length(cameraPosition - modelMatrix[3].xyz);
                gl_PointSize = clamp(size * (2000.0 / distance), 1.0, 45.0);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            varying float vCameraDist;
            varying float vGalacticDist;
            void main() {
                vec2 uv = gl_PointCoord.xy - vec2(0.5);
                float dist = length(uv);
                if (dist > 0.5) discard;

                float alpha = pow(1.0 - (dist * 2.0), 2.0) * 0.15;
                float fade = smoothstep(150.0, 500.0, vCameraDist);
                float macroFade = smoothstep(12000.0, 25000.0, vGalacticDist);
                alpha *= fade * macroFade;
                if (alpha < 0.002) discard;
                gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
                #include <tonemapping_fragment>
                #include <encodings_fragment>
            }
        `,
        blending: THREE.NormalBlending,
        depthWrite: false,
        transparent: true
    });

    const dustMesh = new THREE.Points(dGeo, dMat);
    dustMesh.renderOrder = 1; // render after galaxy particles to darken them
    galaxyMesh.add(dustMesh); // inherently rotates with the galaxy



    const ringGeo = new THREE.RingGeometry(1.5, 2.0, 32);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        depthTest: false
    });
    focusRing = new THREE.Mesh(ringGeo, ringMat);
    focusRing.visible = false;
    scene.add(focusRing);

    scene.add(detailGroup);

    const hmiTexture = textureLoader.load('assets/sol-sdo-hmi.webp');
    hmiTexture.encoding = THREE.sRGBEncoding;
    const solGeo = new THREE.PlaneGeometry(2, 2);
    const solMat = new THREE.ShaderMaterial({
        uniforms: { map: { value: hmiTexture }, uTransitionOpacity: { value: 1.0 } },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                vec3 v0 = modelMatrix[0].xyz;
                vec3 v1 = modelMatrix[1].xyz;
                vec3 v2 = modelMatrix[2].xyz;
                float scaleX = length(v0);
                float scaleY = length(v1);

                mat4 billboardMatrix = viewMatrix * modelMatrix;
                billboardMatrix[0][0] = scaleX; billboardMatrix[0][1] = 0.0; billboardMatrix[0][2] = 0.0;
                billboardMatrix[1][0] = 0.0; billboardMatrix[1][1] = scaleY; billboardMatrix[1][2] = 0.0;
                billboardMatrix[2][0] = 0.0; billboardMatrix[2][1] = 0.0; billboardMatrix[2][2] = 1.0;

                gl_Position = projectionMatrix * billboardMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D map;
            uniform float uTransitionOpacity;
            varying vec2 vUv;
            void main() {
                vec2 uv = vUv - 0.5;
                float dist = length(uv);
                if (dist > 0.49) discard;
                vec4 texColor = texture2D(map, vUv);
                float limb = 1.0 - pow(dist * 2.0, 4.0);
                texColor.rgb *= 0.5 + 0.5 * limb;
                gl_FragColor = vec4(texColor.rgb, uTransitionOpacity);
            }
        `,
        transparent: true, depthTest: true, depthWrite: true, polygonOffset: true, polygonOffsetFactor: -1, blending: THREE.NormalBlending
    });
    solMesh = new THREE.Mesh(solGeo, solMat);
    solMesh.visible = false;
    detailGroup.add(solMesh);

    const starDetailGeo = new THREE.SphereGeometry(1, 64, 64);
    const starDetailMat = new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(1, 1, 1) },
            uTime: { value: 0 },
            uTransitionOpacity: { value: 1.0 },
            uLimbDarkening: { value: 0.6 },
            uGranulationContrast: { value: 0.2 },
            uGranulationScale: { value: 30.0 }
        },
        vertexShader: `
            varying vec3 vNormal;
            varying vec3 vPosition;
            varying vec3 vViewPosition;
            void main() {
                vNormal = normalMatrix * normal;
                vPosition = position;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                vViewPosition = -mvPosition.xyz;
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 uColor; uniform float uTime; uniform float uTransitionOpacity;
            uniform float uLimbDarkening; uniform float uGranulationContrast; uniform float uGranulationScale;
            varying vec3 vNormal; varying vec3 vPosition; varying vec3 vViewPosition;
            vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
            vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
            float snoise(vec3 v) {
                const vec2  C = vec2(1.0/6.0, 1.0/3.0);
                const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
                vec3 i  = floor(v + dot(v, C.yyy));
                vec3 x0 = v - i + dot(i, C.xxx);
                vec3 g = step(x0.yzx, x0.xyz);
                vec3 l = 1.0 - g;
                vec3 i1 = min(g.xyz, l.zxy); vec3 i2 = max(g.xyz, l.zxy);
                vec3 x1 = x0 - i1 + C.xxx; vec3 x2 = x0 - i2 + C.yyy; vec3 x3 = x0 - D.yyy;
                i = mod289(i);
                vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
                float n_ = 0.142857142857; vec3 ns = n_ * D.wyz - D.xzx;
                vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
                vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_);
                vec4 x = x_ * ns.x + ns.yyyy; vec4 y = y_ * ns.x + ns.yyyy;
                vec4 h = 1.0 - abs(x) - abs(y);
                vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw);
                vec4 s0 = floor(b0) * 2.0 + 1.0; vec4 s1 = floor(b1) * 2.0 + 1.0;
                vec4 sh = -step(h, vec4(0.0));
                vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
                vec3 p0 = vec3(a0.xy, h.x); vec3 p1 = vec3(a0.zw, h.y); vec3 p2 = vec3(a1.xy, h.z); vec3 p3 = vec3(a1.zw, h.w);
                vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
                p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
                vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                m = m * m; return 105.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
            }
            void main() {
                vec3 p = normalize(vPosition);
                vec3 n = normalize(vNormal); vec3 v = normalize(vViewPosition);
                float ndotv = max(dot(n, v), 0.0);
                float limb = mix(1.0, ndotv, uLimbDarkening);
                float t = uTime * 0.05;
                vec3 np = p * uGranulationScale;
                float n1 = snoise(np + t); float n2 = snoise(np * 2.0 - t * 1.5); float n3 = snoise(np * 4.0 + t * 2.0);
                float fbm = n1 * 0.5 + n2 * 0.25 + n3 * 0.125;
                fbm = fbm * 0.5 + 0.5;
                float granules = smoothstep(0.3, 0.7, fbm);
                float faculae = snoise(p * 3.0 + t * 0.2) * 0.5 + 0.5;
                float brightness = 1.0 - uGranulationContrast * (1.0 - granules) + faculae * 0.05;
                vec3 finalColor = uColor * limb * brightness;
                gl_FragColor = vec4(finalColor, uTransitionOpacity);
                #include <tonemapping_fragment>
                #include <encodings_fragment>
            }
        `,
        transparent: true, depthTest: false
    });
    starMesh = new THREE.Mesh(starDetailGeo, starDetailMat);
    starMesh.visible = false;
    detailGroup.add(starMesh);
}

// GLSL Procedural Sun Shader replaces static canvas texture
const vertexShader = `
    uniform vec3 uGalacticCenter;
    attribute float size;
    attribute vec3 customColor;
    attribute float isProcedural;
    attribute float isSelected;
    varying vec3 vColor;
    varying float vIsProcedural;
    varying float vIsSelected;
    varying float vGalacticDist;

    void main() {
        vColor = customColor;
        vIsProcedural = isProcedural;
        vIsSelected = isSelected;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vGalacticDist = length(cameraPosition - uGalacticCenter);

        float pointSize = clamp(size, 1.0, 4.0);
        if (isSelected > 0.5) {
            pointSize = 16.0;
        }
        gl_PointSize = pointSize;
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const fragmentShader = `
    uniform vec3 color;
    uniform float uSelectedPointOpacity;
    uniform float uTransitionOpacity;
    varying vec3 vColor;
    varying float vIsProcedural;
    varying float vIsSelected;
    varying float vGalacticDist;

    void main() {
        vec2 uv = gl_PointCoord.xy - vec2(0.5);
        float dist = length(uv);
        if (dist > 0.5) discard;

        float alpha = 1.0;
        vec3 finalColor = color * vColor;

        if (vIsSelected > 0.5) {
            float core = pow(1.0 - (dist * 2.0), 4.0);
            float glow = pow(1.0 - (dist * 2.0), 1.5);
            alpha = (core * 0.8 + glow * 0.5) * uSelectedPointOpacity;
            finalColor *= 1.2;
        } else {
            float psf = pow(1.0 - (dist * 2.0), 2.5);
            alpha = psf;
        }

        if (vIsProcedural > 0.5) {
            float macroFade = smoothstep(12000.0, 25000.0, vGalacticDist);
            alpha *= macroFade;
        }

        alpha *= uTransitionOpacity;

        if (alpha < 0.01) discard;

        gl_FragColor = vec4(finalColor, alpha);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
    }
`;

// Map Spectral class to RGB Color
function getSpectralColor(spectrum) {
    if (!spectrum || spectrum.length === 0) return new THREE.Color(0xffffff);
    const cls = spectrum.charAt(0).toUpperCase();
    switch(cls) {
        case 'O': return new THREE.Color(0x9bb0ff); // Hot blue
        case 'B': return new THREE.Color(0xaabfff); // Blue white
        case 'A': return new THREE.Color(0xcad7ff); // White
        case 'F': return new THREE.Color(0xf8f7ff); // Yellow white
        case 'G': return new THREE.Color(0xfff4ea); // Yellow (Sun)
        case 'K': return new THREE.Color(0xffd2a1); // Orange
        case 'M': return new THREE.Color(0xffcc6f); // Red dwarf
        default: return new THREE.Color(0xffffff);
    }
}



function initOverviewSky() {
    let overviewMaxPointSize = 64.0;
    const gl = renderer.getContext();
    if (gl) {
        const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
        if (range && range.length === 2 && isFinite(range[1])) {
            overviewMaxPointSize = range[1];
        }
    }

    const { sources, smudges, companions } = generateOverviewDescriptors();
    const total = sources.length + smudges.length + companions.length;

    const pos = new Float32Array(total * 3);
    const col = new Float32Array(total * 3);
    const size = new Float32Array(total);
    const alpha = new Float32Array(total);
    const rot = new Float32Array(total);
    const aspect = new Float32Array(total);
    const classType = new Float32Array(total);

    let idx = 0;
    const addDesc = (d) => {
        pos[idx * 3] = d.x * 50000;
        pos[idx * 3 + 1] = d.y * 50000;
        pos[idx * 3 + 2] = d.z * 50000;
        col[idx * 3] = d.r;
        col[idx * 3 + 1] = d.g;
        col[idx * 3 + 2] = d.b;
        size[idx] = d.size;
        alpha[idx] = d.alpha;
        rot[idx] = d.rotation;
        aspect[idx] = d.aspect;
        classType[idx] = d.classType;
        idx++;
    };

    sources.forEach(addDesc);
    smudges.forEach(addDesc);
    companions.forEach(addDesc);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('customColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    geo.setAttribute('aRotation', new THREE.BufferAttribute(rot, 1));
    geo.setAttribute('aAspect', new THREE.BufferAttribute(aspect, 1));
    geo.setAttribute('aClassType', new THREE.BufferAttribute(classType, 1));

    overviewSkyMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uOpacity: { value: 0.0 },
            uDpr: { value: renderer.getPixelRatio() },
            uMaxPointSize: { value: overviewMaxPointSize }
        },
        vertexShader: `
            attribute float aSize;
            attribute vec3 customColor;
            attribute float aAlpha;
            attribute float aRotation;
            attribute float aAspect;
            attribute float aClassType;

            uniform float uOpacity;
            uniform float uDpr;
            uniform float uMaxPointSize;

            varying vec3 vColor;
            varying float vAlpha;
            varying float vRotation;
            varying float vAspect;
            varying float vClassType;
            varying float vClampRatio;

            void main() {
                vColor = customColor;
                vAlpha = aAlpha * uOpacity;
                vRotation = aRotation;
                vAspect = aAspect;
                vClassType = aClassType;

                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_Position = projectionMatrix * mvPosition;

                float reqSize = aSize * uDpr;
                float clampedSize = min(reqSize, uMaxPointSize);
                vClampRatio = clamp(clampedSize / max(reqSize, 0.0001), 0.0, 1.0);

                gl_PointSize = clampedSize;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            varying float vAlpha;
            varying float vRotation;
            varying float vAspect;
            varying float vClassType;
            varying float vClampRatio;

            void main() {
                if (vAlpha < 0.001) discard;

                vec2 uv = gl_PointCoord.xy - vec2(0.5);

                float c = cos(vRotation);
                float s = sin(vRotation);
                mat2 matR = mat2(c, -s, s, c);
                uv = matR * uv;

                uv.y /= vAspect;

                float dist = length(uv);
                if (dist > 0.5) discard;

                float intensity = 0.0;
                if (vClassType < 0.5) {
                    intensity = exp(-dist * dist * 12.0);
                } else if (vClassType < 1.5) {
                    intensity = exp(-dist * dist * 8.0);
                } else {
                    float r = dist;
                    float core = exp(-r * 25.0);
                    float disk = exp(-r * 8.0);
                    float halo = exp(-r * 3.0);
                    intensity = core * 0.35 + disk * 0.45 + halo * 0.2;
                    intensity *= 1.0 - smoothstep(0.2, 0.5, r);

                    if (vClampRatio < 1.0) {
                        float comp = clamp(1.0 / (vClampRatio * vClampRatio), 1.0, 10.0);
                        intensity *= comp;
                    }
                }

                float finalAlpha = intensity * vAlpha;
                if (finalAlpha < 0.001) discard;

                gl_FragColor = vec4(vColor, finalAlpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });

    overviewSky = new THREE.Points(geo, overviewSkyMaterial);
    overviewSky.renderOrder = -1;
    scene.add(overviewSky);
}

// Load Stars
async function loadStars() {
    try {
        initGalaxy(); // Spawn the Milky Way
        initOverviewSky(); // Spawn the procedural background
        createNebulae(); // Spawn nebula clouds
        frameGalaxy(); // Frame immediately; do not wait for the catalog request.

        const res = await fetch('/api/stars');
        starData = await res.json();

        // Prebuild index to prevent first-keystroke stutter
        if (typeof buildSearchIndex === 'function') {
            buildSearchIndex(starData);
        }

        // Bind only after the catalog exists. The getter keeps both controls on
        // the current catalog if a later load replaces the starData array.
        initAutocomplete(
            document.getElementById('start'),
            document.getElementById('start-listbox'),
            () => starData
        );
        initAutocomplete(
            document.getElementById('end'),
            document.getElementById('end-listbox'),
            () => starData
        );
        document.body.dataset.catalogReady = 'true';

        // Procedurally generate galaxy-wide stars using the same spiral arm distribution as initGalaxy
        const arms = 4;
        const armSpread = 0.6;
        const radius = 15000;
        const isMobile = window.matchMedia('(max-width: 600px)').matches;
        const fakeStarCount = isMobile ? 12000 : 30000;
        const spectralClasses = ['O', 'B', 'A', 'F', 'G', 'K', 'M'];
        const backgroundRandom = galaxyRandom(0x73746172);

        for (let i = 0; i < fakeStarCount; i++) {
            const d = 1300 + Math.pow(backgroundRandom(), 0.82) * (radius - 1300);
            const angle = Math.log(d / 1000) / Math.tan(12 * Math.PI / 180);
            const armIndex = Math.floor(backgroundRandom() * arms);
            const armOffset = armIndex * (Math.PI * 2 / arms);
            const cell = Math.floor(d / 600) + armIndex * 41;
            const gap = Math.sin(cell * 1.83 + armIndex);
            const scatter = gaussian(backgroundRandom) * (0.07 + 0.22 * d / radius)
                + (gap < -0.45 ? (backgroundRandom() - 0.5) * armSpread : 0);
            const finalAngle = angle + armOffset + scatter;
            const thickness = 70 + (d / radius) * 100;
            let z = gaussian(backgroundRandom) * thickness;
            // These procedural stars share the galaxy's local disk coordinates;
            // transform them exactly like the galaxy rather than leaving a second,
            // unrotated disk in world XY.
            const worldPosition = scene.userData.galaxyMesh.localToWorld(
                new THREE.Vector3(Math.cos(finalAngle) * d, Math.sin(finalAngle) * d, z)
            );

            starData.push({
                n: "GAL-" + String(i).padStart(5, '0'),
                x: worldPosition.x,
                y: worldPosition.y,
                z: worldPosition.z,
                s: spectralClasses[Math.floor(backgroundRandom() * spectralClasses.length)],
                m: backgroundRandom() * 10 + 5
            });
        }

        starsGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(starData.length * 3);
        const colors = new Float32Array(starData.length * 3);
        const sizes = new Float32Array(starData.length);
        const isProceduralArr = new Float32Array(starData.length);
        const isSelectedArr = new Float32Array(starData.length);

        for (let i = 0; i < starData.length; i++) {
            const s = starData[i];
            positions[i * 3] = s.x;
            positions[i * 3 + 1] = s.y;
            positions[i * 3 + 2] = s.z;

            let col = getSpectralColor(s.s);
            colors[i * 3] = col.r;
            colors[i * 3 + 1] = col.g;
            colors[i * 3 + 2] = col.b;

            // Absolute Magnitude mapping: Lower magnitude = brighter/larger
            // Typical ranges: -10 (super bright) to +20 (faint)
            let mag = s.m;
            if (mag === undefined || mag === 0) mag = 5.0;

            // Inverse mapping so smaller mag gives larger size
            let size = Math.max(1.0, 10.0 - mag);
            sizes[i] = size;
            isProceduralArr[i] = (s.n && s.n.startsWith("GAL-")) ? 1.0 : 0.0;
            isSelectedArr[i] = 0.0;
        }

        starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        starsGeometry.setAttribute('customColor', new THREE.BufferAttribute(colors, 3));
        starsGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        starsGeometry.setAttribute('isProcedural', new THREE.BufferAttribute(isProceduralArr, 1));
        starsGeometry.setAttribute('isSelected', new THREE.BufferAttribute(isSelectedArr, 1));

        const shaderMaterial = new THREE.ShaderMaterial({
            uniforms: {
                color: { value: new THREE.Color(0xffffff) },
                uSelectedPointOpacity: { value: 1.0 },
                uGalacticCenter: { value: galacticCenter },
                uTransitionOpacity: { value: 1.0 }
            },
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            blending: THREE.NormalBlending,
            depthTest: true,
            depthWrite: false,
            transparent: true
        });

        starsPoints = new THREE.Points(starsGeometry, shaderMaterial);
        scene.add(starsPoints);

        frameGalaxy();

        // Auto-select a valid star for routing — only real catalog stars within jump range
        const navRandom = galaxyRandom(0x4e4156);
        if (starData.length > 1) {
            let valid = false;
            for (let attempt = 0; attempt < 50 && !valid; attempt++) {
                let r = starData[Math.floor(navRandom() * starData.length)];
                if (r.n && !r.n.startsWith("GAL-") && r.n !== "Sol") {
                    document.getElementById('end').value = r.n;
                    valid = true;
                }
            }
            // Fallback: force a known real star
            if (!valid) {
                document.getElementById('end').value = "HIP 7721 (TYC 7003-1843-1)";
            }
        }
        document.getElementById('nav-form').dataset.starsLoaded = "true";

    } catch (e) {
        console.error("Failed to load stars:", e);
    }
}

function hopName(hop) {
    if (typeof hop === 'string') return hop.trim();
    if (!hop || typeof hop !== 'object') return '';
    const value = hop.name ?? hop.n ?? hop.star_name ?? hop.label;
    return typeof value === 'string' ? value.trim() : '';
}

function finiteCoordinate(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function resolveHopStar(hop) {
    if (!hop || (typeof hop !== 'object' && typeof hop !== 'string')) return null;

    const name = hopName(hop);
    if (name) {
        const exact = starData.find(star => typeof star.n === 'string' && star.n.toLocaleLowerCase() === name.toLocaleLowerCase());
        if (exact) return exact;
    }

    let hopX = null, hopY = null, hopZ = null;
    if (typeof hop === 'object') {
        hopX = finiteCoordinate(hop.x ?? hop.position?.[0]);
        hopY = finiteCoordinate(hop.y ?? hop.position?.[1]);
        hopZ = finiteCoordinate(hop.z ?? hop.position?.[2]);
    }

    if (hopX !== null && hopY !== null && hopZ !== null) {
        const toleranceSquared = 1e-8;
        const byPos = starData.find(star => {
            const starX = finiteCoordinate(star?.x);
            const starY = finiteCoordinate(star?.y);
            const starZ = finiteCoordinate(star?.z);
            if (starX === null || starY === null || starZ === null) return false;
            const dx = starX - hopX;
            const dy = starY - hopY;
            const dz = starZ - hopZ;
            return dx * dx + dy * dy + dz * dz <= toleranceSquared;
        });
        if (byPos) return byPos;
    }

    if (name) {
        const nameLower = name.toLocaleLowerCase();
        const compatible = starData.find(star => {
            if (typeof star.n !== 'string') return false;
            const starLower = star.n.toLocaleLowerCase();
            return starLower.startsWith(nameLower + ' ') || nameLower.startsWith(starLower + ' ');
        });
        if (compatible) return compatible;
    }

    return null;
}

function routeIndexForStar(star) {
    return resolvedRouteStars.findIndex(routeStar => routeStar === star || (
        routeStar && star && routeStar.n === star.n && routeStar.x === star.x && routeStar.y === star.y && routeStar.z === star.z
    ));
}

function updateHopNavigation() {
    const total = currentRouteHops.length;
    const validIndex = currentHopIndex >= 0 && currentHopIndex < total;
    document.getElementById('hop-progress').textContent = validIndex ? `HOP ${currentHopIndex + 1} / ${total}` : 'HOP 0 / 0';
    document.getElementById('hop-current').textContent = validIndex ? (hopName(currentRouteHops[currentHopIndex]) || 'UNRESOLVED WAYPOINT') : 'NO ROUTE LOCK';
    document.getElementById('btn-prev-hop').disabled = !validIndex || currentHopIndex === 0;
    document.getElementById('btn-next-hop').disabled = !validIndex || currentHopIndex === total - 1;

    document.querySelectorAll('.hop-button').forEach((button, index) => {
        if (index === currentHopIndex) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
    });

    const active = document.querySelector('.hop-button[aria-current="step"]');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
}

function focusHop(index) {
    if (!Number.isInteger(index) || index < 0 || index >= currentRouteHops.length) return;
    const star = resolvedRouteStars[index];
    if (!star) return; // Atomically fail if unresolved

    currentHopIndex = index;
    updateHopNavigation();

    if (pathNodes && pathNodes.geometry) {
        const hideAttr = pathNodes.geometry.getAttribute('hideMarker');
        const markerIndex = hopToMarkerIndex[index];
        if (hideAttr && markerIndex >= 0 && updateRouteMarkerVisibility(hideAttr.array, markerIndex)) {
            hideAttr.needsUpdate = true;
        }
    }

    const starIdx = starData.indexOf(star);
    if (starIdx >= 0) highlightStar(starIdx);
    flyToStar(star.x, star.y, star.z);
    showStarDetails(star, { routeIndex: index });
}

// Draw Path
function drawPath(hops) {
    if (pathLine) {
        scene.remove(pathLine);
        pathLine.geometry.dispose();
        pathLine.material.dispose();
        pathLine = null;
    }
    if (pathNodes) {
        scene.remove(pathNodes);
        pathNodes.geometry.dispose();
        pathNodes.material.dispose();
        pathNodes = null;
    }

    const points = [];
    hopToMarkerIndex = [];
    for (let i = 0; i < hops.length; i++) {
        const star = resolveHopStar(hops[i]);
        if (star) {
            hopToMarkerIndex[i] = points.length;
            points.push(new THREE.Vector3(star.x, star.y, star.z));
        } else {
            hopToMarkerIndex[i] = -1;
        }
    }

    if (points.length < 2) return;

    // A white dashed/dotted line fits the wireframe tactical aesthetic
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineDashedMaterial({
        color: 0xffffff,
        linewidth: 2,
        dashSize: 5,
        gapSize: 3,
        transparent: true,
        opacity: 0.8,
        depthTest: false
    });

    pathLine = new THREE.Line(geometry, material);
    pathLine.computeLineDistances(); // Required for dashed material
    scene.add(pathLine);

    // Add HUD nodes so the trajectory remains visible from galactic scale
    const nodesGeo = new THREE.BufferGeometry().setFromPoints(points);
    const hiddenMarkers = new Float32Array(points.length);
    const initialMarkerIndex = currentHopIndex >= 0 && currentHopIndex < hopToMarkerIndex.length ? hopToMarkerIndex[currentHopIndex] : -1;
    if (initialMarkerIndex >= 0) updateRouteMarkerVisibility(hiddenMarkers, initialMarkerIndex);
    nodesGeo.setAttribute('hideMarker', new THREE.BufferAttribute(hiddenMarkers, 1));
    const nodesMat = new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(0x00ffff) } },
        vertexShader: `
            attribute float hideMarker;
            varying float vHideMarker;
            void main() {
                vHideMarker = hideMarker;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                float distance = -mvPosition.z;
                // Clamping min size to 8.0px ensures the route is ALWAYS visible from the edge of the galaxy!
                gl_PointSize = clamp(2000.0 / distance, 8.0, 50.0);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 color;
            varying float vHideMarker;
            void main() {
                if (vHideMarker > 0.5) discard;
                vec2 uv = gl_PointCoord.xy - vec2(0.5);
                float dist = length(uv);
                if (dist > 0.5) discard;
                float glow = pow(1.0 - (dist * 2.0), 1.5);
                gl_FragColor = vec4(color * glow, glow);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: false // Render on top of everything
    });
    pathNodes = new THREE.Points(nodesGeo, nodesMat);
    scene.add(pathNodes);

}

function applyRouteResult(hops) {
    const list = document.getElementById('hop-list');
    list.replaceChildren();
    currentRouteHops = hops.slice();
    resolvedRouteStars = currentRouteHops.map(resolveHopStar);

    let firstResolved = -1;
    for (let i = 0; i < resolvedRouteStars.length; i++) {
        if (resolvedRouteStars[i]) {
            firstResolved = i;
            break;
        }
    }

    currentHopIndex = -1;
    drawPath(currentRouteHops);

    currentRouteHops.forEach((hop, i) => {
        const li = document.createElement('li');
        const button = document.createElement('button');
        const name = hopName(hop) || `WAYPOINT ${i + 1}`;
        const distance = typeof hop === 'object' && hop ? finiteCoordinate(hop.dist_pc) : null;
        const nameSpan = document.createElement('span');
        const distanceSpan = document.createElement('span');
        button.type = 'button';
        button.className = 'hop-button';
        button.setAttribute('aria-label', `Focus route hop ${i + 1}: ${name}`);
        nameSpan.className = 'hop-name';
        nameSpan.textContent = `[${String(i + 1).padStart(2, '0')}] ${name}`;
        distanceSpan.className = 'hop-distance';
        distanceSpan.textContent = distance !== null && distance > 0 ? `+${distance.toFixed(2)} PC` : 'ORIGIN';
        button.append(nameSpan, distanceSpan);
        button.addEventListener('click', () => focusHop(i));
        li.appendChild(button);
        list.appendChild(li);
    });

    const sucDiv = document.getElementById('success-message');
    sucDiv.classList.remove('hidden');

    if (firstResolved !== -1) {
        focusHop(firstResolved);
    } else {
        updateHopNavigation();
        const detailsCard = document.getElementById('star-details');
        if (detailsCard) {
            detailsCard.hidden = true;
            detailsCard.replaceChildren();
        }
        if (currentSelectedStarIndex >= 0) {
            const isSelectedAttr = starsGeometry.getAttribute('isSelected');
            if (isSelectedAttr) {
                isSelectedAttr.setX(currentSelectedStarIndex, 0.0);
                isSelectedAttr.needsUpdate = true;
            }
            currentSelectedStarIndex = -1;
        }
        if (focusRing) focusRing.visible = false;

        finishFlightTransition(false);
    }
}

// Form Handling
document.getElementById('nav-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (e.target.dataset.starsLoaded !== "true") return;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerText = "CALCULATING...";

    const start = document.getElementById('start').value;
    const end = document.getElementById('end').value;
    const dist = document.getElementById('dist').value;
    const speed = document.getElementById('speed').value;

    const resDiv = document.getElementById('results');
    const errDiv = document.getElementById('error-message');
    const sucDiv = document.getElementById('success-message');

    resDiv.classList.remove('hidden');
    errDiv.classList.add('hidden');
    sucDiv.classList.add('hidden');

    try {
        const res = await fetch(`/api/path?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&dist=${dist}&speed=${speed}`);
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(errText);
        }

        const data = await res.json();
        const hops = Array.isArray(data.hops) ? data.hops : [];

        document.getElementById('res-dist').innerText = data.total_dist_pc.toFixed(2);
        document.getElementById('res-obs').innerText = data.total_obs_time.toFixed(2);
        document.getElementById('res-ship').innerText = data.total_ship_time.toFixed(2);

        applyRouteResult(hops);
    } catch (e) {
        errDiv.innerText = "ERROR: " + (e.message || "ROUTE CALCULATION FAILED");
        errDiv.classList.remove('hidden');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "INITIATE_ROUTING";
    }
});

// Sidebar Toggle Logic
const toggleBtn = document.getElementById('toggle-panel');
const panel = document.getElementById('ui-panel');
toggleBtn.addEventListener('click', () => {
    panel.classList.toggle('collapsed');
    toggleBtn.innerText = panel.classList.contains('collapsed') ? 'O' : '_';
    toggleBtn.setAttribute('aria-expanded', String(!panel.classList.contains('collapsed')));
    toggleBtn.setAttribute('aria-label', panel.classList.contains('collapsed') ? 'Expand navigation panel' : 'Collapse navigation panel');
});

// Drag Logic (desktop mouse + mobile touch)
const header = document.getElementById('panel-header');
let isDragging = false;
let dragPointerId = null;
let offsetX = 0;
let offsetY = 0;

function isMobile() {
    return window.innerWidth <= 600;
}

function onDragStart(e) {
    if (e.target === toggleBtn) return;
    if (isMobile()) return; // Don't drag on mobile — panel is bottom-fixed
    if (isDragging || (e.pointerType === 'mouse' && e.button !== 0)) return;
    isDragging = true;
    dragPointerId = e.pointerId;
    const rect = panel.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    try { header.setPointerCapture(e.pointerId); } catch (_) {}
}

function onDragMove(e) {
    if (!isDragging || e.pointerId !== dragPointerId) return;
    let x = e.clientX - offsetX;
    let y = e.clientY - offsetY;
    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
}

function onDragEnd(e) {
    if (!isDragging || e.pointerId !== dragPointerId) return;
    isDragging = false;
    dragPointerId = null;
    if (header.hasPointerCapture(e.pointerId)) {
        try { header.releasePointerCapture(e.pointerId); } catch (_) {}
    }
}

header.addEventListener('pointerdown', onDragStart);
document.addEventListener('pointermove', onDragMove);
document.addEventListener('pointerup', onDragEnd);
document.addEventListener('pointercancel', onDragEnd);
header.addEventListener('lostpointercapture', (e) => {
    if (e.pointerId === dragPointerId) {
        isDragging = false;
        dragPointerId = null;
    }
});

// Reset inline drag styles on resize (prevents mobile layout breakage)
window.addEventListener('resize', () => {
    if (isMobile()) {
        panel.style.left = '';
        panel.style.top = '';
    }
});

// Star Interaction and Flight Logic
let targetNode = new THREE.Vector3(0, 0, 0);
let camTargetNode = new THREE.Vector3(0, 100, 300);
let isFlying = false;

function restoreGalaxyZoomLimit() {
    if (!Number.isFinite(galaxyFrameDistance)) updateGalaxyZoomLimit();
    controls.maxDistance = Number.isFinite(galaxyFrameDistance) ? galaxyFrameDistance : 28000;
}

let fadingMaterials = null;
let flightMayCommitDestination = false;
function finishFlightTransition(commitDestination) {
    if (commitDestination) {
        controls.target.copy(targetNode);
        camera.position.copy(camTargetNode);
    }
    flightTransitionState.progress = 1.0;
    flightTransitionState.phase = 'IDLE';
    flightTransitionState.opacity = 1.0;
    flightTransitionState.mapArcT = 1.0;
    flightTransitionState.arrivalT = 1.0;
    flightTransitionState.isActive = false;
    flightTransitionState.isFlying = false;
    isFlying = false;
    controls.enabled = true;
    restoreGalaxyZoomLimit();
    if (fadingMaterials) {
        for (let i = 0; i < fadingMaterials.length; i++) {
            const item = fadingMaterials[i];
            applyMaterialOpacity(item.material, item.baseline);
        }
        fadingMaterials = null;
    }
    flightMayCommitDestination = false;
}

function flyToStar(x, y, z) {
    flightMayCommitDestination = true;
    targetNode.set(x, y, z);
    camTargetNode.set(x, y - 6.32, z + 18.97); // Nice local approach pose

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    flightSourceNode.copy(controls.target);
    flightSourceCam.copy(camera.position);

    const frame = getGalaxyFrame();
    const sourceMap = getMapPose(flightSourceNode.x, flightSourceNode.y, flightSourceNode.z, frame);
    flightSourceMapTarget.copy(sourceMap.target);
    flightSourceMapCam.copy(sourceMap.cam);

    const destMap = getMapPose(targetNode.x, targetNode.y, targetNode.z, frame);
    flightTargetMapTarget.copy(destMap.target);
    flightTargetMapCam.copy(destMap.cam);

    fadingMaterials = [];
    if (starsGeometry && starsPoints && starsPoints.material) {
        fadingMaterials.push({ material: starsPoints.material, baseline: 1.0 });
    }
    if (scene.userData.nebulaMesh) fadingMaterials.push({ material: scene.userData.nebulaMesh.material, baseline: 1.0 });

    flightTransitionState = startTransition(flightTransitionState, { reducedMotion: prefersReducedMotion });

    isFlying = true;
    controls.maxDistance = Infinity;
    controls.enabled = false;

    if (focusRing) {
        focusRing.position.set(x, y, z);
        focusRing.visible = true;
    }
}

// Persistent star details and intentional canvas picking
const detailsCard = document.createElement('aside');
detailsCard.id = 'star-details';
detailsCard.hidden = true;
detailsCard.setAttribute('aria-label', 'Focused star details');
document.body.appendChild(detailsCard);

function appendDetail(list, label, value, isHTML = false) {
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = label;
    if (isHTML) {
        detail.innerHTML = value;
    } else {
        detail.textContent = value;
    }
    list.append(term, detail);
}

function displayValue(value, fallback = 'UNKNOWN') {
    return value === null || value === undefined || value === '' ? fallback : String(value);
}

function showStarDetails(star, options = {}) {
    if (!star) return;
    const routeIndex = Number.isInteger(options.routeIndex) ? options.routeIndex : routeIndexForStar(star);
    const sol = starData.find(candidate => candidate && candidate.n === 'Sol');
    const sx = finiteCoordinate(star.x);
    const sy = finiteCoordinate(star.y);
    const sz = finiteCoordinate(star.z);
    let distanceFromSol = null;
    if (sol && sx !== null && sy !== null && sz !== null) {
        const solX = finiteCoordinate(sol.x);
        const solY = finiteCoordinate(sol.y);
        const solZ = finiteCoordinate(sol.z);
        if (solX !== null && solY !== null && solZ !== null) {
            distanceFromSol = Math.hypot(sx - solX, sy - solY, sz - solZ);
        }
    }

    const title = document.createElement('h2');
    const list = document.createElement('dl');
    const wikiLink = document.createElement('a');
    const name = displayValue(star.n);
    title.textContent = name;
    appendDetail(list, 'SPECTRAL CLASS', displayValue(star.s));
    appendDetail(list, 'MAGNITUDE', displayValue(star.m));
    appendDetail(list, 'COORDINATES', sx !== null && sy !== null && sz !== null
        ? `${sx.toFixed(2)}, ${sy.toFixed(2)}, ${sz.toFixed(2)} PC`
        : 'UNKNOWN');
    appendDetail(list, 'DISTANCE FROM SOL', distanceFromSol === null ? 'UNKNOWN' : `${distanceFromSol.toFixed(2)} PC`);
    appendDetail(list, 'ROUTE ROLE', routeIndex < 0 ? 'OFF ROUTE' : `${routeIndex === 0 ? 'ORIGIN' : routeIndex === currentRouteHops.length - 1 ? 'DESTINATION' : 'WAYPOINT'} · ${routeIndex + 1}/${currentRouteHops.length}`);
    const isSol = star.n === 'Sol';
    const isProcedural = !!(star.n && star.n.startsWith('GAL-'));
    const provenance = getProvenance(isSol, isProcedural);
    if (provenance) {
        appendDetail(list, 'PROVENANCE', provenance, true);
    }
    wikiLink.textContent = 'SEARCH WIKIPEDIA ↗';
    wikiLink.href = `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(name)}`;
    wikiLink.target = '_blank';
    wikiLink.rel = 'noopener noreferrer';
    detailsCard.replaceChildren(title, list, wikiLink);
    detailsCard.hidden = false;
}

function pickStar(clientX, clientY, pointerType) {
    if (!starsPoints || !starData) return;
    const bounds = renderer.domElement.getBoundingClientRect();

    camera.updateMatrixWorld();
    const viewProj = new THREE.Matrix4();
    viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

    const positions = starsPoints.geometry.attributes.position.array;
    const bestIndex = StarPicking.pickStarScreenSpace(
        positions, starData, viewProj.elements, bounds, clientX, clientY, pointerType
    );

    if (bestIndex >= 0) {
        const star = starData[bestIndex];
        highlightStar(bestIndex);
        showStarDetails(star);
        flyToStar(star.x, star.y, star.z);
    }
}

const canvasPointerState = new PointerState();

renderer.domElement.addEventListener('pointerdown', (event) => {
    if (flightTransitionState.isActive) {
        flightMayCommitDestination = false;
        interruptTransition(flightTransitionState);
    }
    canvasPointerState.onPointerDown(event.pointerId, event.clientX, event.clientY, event.timeStamp);
    try { renderer.domElement.setPointerCapture(event.pointerId); } catch (_) { /* Capture is best-effort. */ }
});

renderer.domElement.addEventListener('pointermove', (event) => {
    canvasPointerState.onPointerMove(event.pointerId, event.clientX, event.clientY);
});

renderer.domElement.addEventListener('pointerup', (event) => {
    canvasPointerState.onPointerUp(event.pointerId, event.clientX, event.clientY, event.timeStamp, event.pointerType, pickStar);
});

renderer.domElement.addEventListener('pointercancel', (event) => {
    canvasPointerState.onPointerCancel(event.pointerId);
});

renderer.domElement.addEventListener('lostpointercapture', (event) => {
    canvasPointerState.onPointerCancel(event.pointerId);
});

let _canvasBoundsCache = { left: 0, top: 0, width: 800, height: 600 };
function updateCanvasBoundsCache() {
    if (renderer && renderer.domElement) {
        const rect = renderer.domElement.getBoundingClientRect();
        _canvasBoundsCache.left = rect.left;
        _canvasBoundsCache.top = rect.top;
        _canvasBoundsCache.width = rect.width;
        _canvasBoundsCache.height = rect.height;
    }
}
// Init cache immediately once DOM is ready (or here is fine since canvas is appended at the top)
updateCanvasBoundsCache();

const _wheelRaycaster = new THREE.Raycaster();
const _wheelPointer = new THREE.Vector2();
const _wheelCursorRayDir = [0, 0, 0];
const _wheelCameraPos = [0, 0, 0];
const _wheelTargetPos = [0, 0, 0];
const _wheelOutput = { newCameraPos: [0, 0, 0], newTarget: [0, 0, 0] };
const _wheelZoomConfig = {
    cameraPos: _wheelCameraPos,
    targetPos: _wheelTargetPos,
    cursorRayDir: _wheelCursorRayDir,
    deltaY: 0,
    deltaMode: 0,
    viewportHeight: 0,
    zoomSpeed: 0,
    minDistance: 0,
    maxDistance: 0,
    out: _wheelOutput
};

renderer.domElement.addEventListener('wheel', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    if (flightTransitionState && flightTransitionState.isActive) {
        flightMayCommitDestination = false;
        interruptTransition(flightTransitionState);
    }

    const applyDelta = accumulateWheelDelta(event.deltaY, event.deltaMode, renderer.domElement.clientHeight);
    if (applyDelta === 0) return;

    _wheelPointer.x = ((event.clientX - _canvasBoundsCache.left) / _canvasBoundsCache.width) * 2 - 1;
    _wheelPointer.y = -((event.clientY - _canvasBoundsCache.top) / _canvasBoundsCache.height) * 2 + 1;

    _wheelRaycaster.setFromCamera(_wheelPointer, camera);
    _wheelCursorRayDir[0] = _wheelRaycaster.ray.direction.x;
    _wheelCursorRayDir[1] = _wheelRaycaster.ray.direction.y;
    _wheelCursorRayDir[2] = _wheelRaycaster.ray.direction.z;

    _wheelCameraPos[0] = camera.position.x;
    _wheelCameraPos[1] = camera.position.y;
    _wheelCameraPos[2] = camera.position.z;

    _wheelTargetPos[0] = controls.target.x;
    _wheelTargetPos[1] = controls.target.y;
    _wheelTargetPos[2] = controls.target.z;

    _wheelZoomConfig.deltaY = applyDelta;
    _wheelZoomConfig.viewportHeight = renderer.domElement.clientHeight;
    _wheelZoomConfig.zoomSpeed = controls.zoomSpeed;
    _wheelZoomConfig.minDistance = controls.minDistance;
    _wheelZoomConfig.maxDistance = controls.maxDistance;

    const result = calculateZoom(_wheelZoomConfig);

    if (result) {
        camera.position.set(result.newCameraPos[0], result.newCameraPos[1], result.newCameraPos[2]);
        controls.target.set(result.newTarget[0], result.newTarget[1], result.newTarget[2]);
        controls.update();
    }
}, { passive: false, capture: true });

document.getElementById('btn-prev-hop').addEventListener('click', () => focusHop(currentHopIndex - 1));
document.getElementById('btn-next-hop').addEventListener('click', () => focusHop(currentHopIndex + 1));

window.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const target = event.target;
    if (target instanceof Element && target !== renderer.domElement && target.closest(
        'input, select, textarea, button, a, [contenteditable="true"], #ui-panel, #star-details'
    )) return;
    if (currentHopIndex < 0) return;
    const nextIndex = currentHopIndex + (event.key === 'ArrowLeft' ? -1 : 1);
    if (nextIndex < 0 || nextIndex >= currentRouteHops.length) return;
    event.preventDefault();
    focusHop(nextIndex);
});

// Animation Loop
let previousFrameTime = performance.now();

function updateFlight(deltaMs) {
    if (!flightTransitionState.isActive) return;

    updateTransition(flightTransitionState, deltaMs);

    if (fadingMaterials) {
        for (let i = 0; i < fadingMaterials.length; i++) {
            const item = fadingMaterials[i];
            applyMaterialOpacity(item.material, item.baseline * flightTransitionState.opacity);
        }
    }

    if (flightTransitionState.isFlying) {
        if (flightTransitionState.phase === 'DEPARTURE') {
            controls.target.copy(flightSourceNode);
            camera.position.copy(flightSourceCam);
        } else if (flightTransitionState.phase === 'MAP_ARC') {
            controls.target.lerpVectors(flightSourceMapTarget, flightTargetMapTarget, flightTransitionState.mapArcT);
            _scratchVecA.lerpVectors(flightSourceMapCam, flightTargetMapCam, flightTransitionState.mapArcT);
            const arcHeight = flightSourceMapTarget.distanceTo(flightTargetMapTarget) * 0.3;
            const frame = getGalaxyFrame();
            _scratchVecB.copy(frame.viewOut).multiplyScalar(arcHeight * Math.sin(flightTransitionState.mapArcT * Math.PI));
            camera.position.copy(_scratchVecA).add(_scratchVecB);
        } else if (flightTransitionState.phase === 'ARRIVAL') {
            _scratchVecA.copy(camTargetNode).sub(targetNode).normalize();
            _scratchVecB.copy(camTargetNode).addScaledVector(_scratchVecA, 200);
            camera.position.lerpVectors(_scratchVecB, camTargetNode, flightTransitionState.arrivalT);
            controls.target.copy(targetNode);
        }
    }

    if (!flightTransitionState.isActive) {
        // updateTransition marks the terminal sample inactive before the phase
        // interpolation above runs, so commit and clean up the exact pose here.
        const commitDestination = flightMayCommitDestination;
        finishFlightTransition(commitDestination);
        flightMayCommitDestination = false;
    }
}

function animate() {
    const now = performance.now();
    const deltaMs = Math.min(100, Math.max(0, now - previousFrameTime));
    previousFrameTime = now;
    requestAnimationFrame(animate);

    if (scene.userData.blackHoleMat) {
        scene.userData.blackHoleMat.uniforms.time.value += 0.01;
    }


    updateFlight(deltaMs);

    if (interiorSky) {
        interiorSky.position.copy(camera.position);
        const galDist = camera.position.distanceTo(galacticCenter);
        const skyRes = calculateSkyOpacity(galDist, flightTransitionState.opacity, flightTransitionState.isActive, OPACITY_FLOOR, _skyResOutput);
        interiorSky.material.opacity = skyRes.opacity;
        if (interiorSky.material.userData.shader) {
            interiorSky.material.userData.shader.uniforms.uLodBias.value = skyRes.lodBias;
        }
    }

    if (overviewSky) {
        overviewSky.position.copy(camera.position);
        const galDist = camera.position.distanceTo(galacticCenter);
        overviewSkyMaterial.uniforms.uOpacity.value = calculateOverviewOpacity(galDist, flightTransitionState.opacity, flightTransitionState.isActive, OPACITY_FLOOR);
    }

    if (currentSelectedStarIndex >= 0) {
        const star = starData[currentSelectedStarIndex];
        const dist = camera.position.distanceTo(targetNode);
        const lod = calculateDetailLOD(dist, camera.fov, window.innerHeight);
        if (starsPoints) {
            starsPoints.material.uniforms.uSelectedPointOpacity.value = lod.pointOpacity;
        }

        if (lod.visible) {
            detailGroup.visible = true;
            detailGroup.position.copy(targetNode);
            detailGroup.scale.set(lod.detailScale, lod.detailScale, lod.detailScale);

            if (star.n === 'Sol') {
                solMesh.visible = true;
                starMesh.visible = false;
                solMesh.material.uniforms.uTransitionOpacity.value = lod.detailOpacity * flightTransitionState.opacity;
            } else {
                solMesh.visible = false;
                starMesh.visible = true;
                const params = getPhotosphereParams(star.s);
                _starBaseColor.set(params.baseColor);
                starMesh.material.uniforms.uColor.value.copy(_starBaseColor);
                starMesh.material.uniforms.uLimbDarkening.value = params.limbDarkening;
                starMesh.material.uniforms.uGranulationContrast.value = params.granulationContrast;
                starMesh.material.uniforms.uGranulationScale.value = params.granulationScale;
                starMesh.material.uniforms.uTime.value = now * 0.001;
                starMesh.material.uniforms.uTransitionOpacity.value = lod.detailOpacity * flightTransitionState.opacity;
            }
        } else {
            detailGroup.visible = false;
        }
    } else {
        detailGroup.visible = false;
    }

    // Scale focus ring dynamically so it acts as a permanent HUD locator beacon when zoomed out
    if (focusRing && focusRing.visible) {
        focusRing.lookAt(camera.position);
        let dist = camera.position.distanceTo(focusRing.position);
        let scale = calculateReticleScale(dist, camera.fov, window.innerHeight, 36, 4.0);
        focusRing.scale.set(scale, scale, scale);

        let op = calculateReticleOpacity(dist);
        applyMaterialOpacity(focusRing.material, 0.38 * flightTransitionState.opacity * op);
    }

    if (pathLine) {
        let pathDist = camera.position.distanceTo(controls.target);
        let pathOp = calculateRouteOpacity(pathDist);
        applyMaterialOpacity(pathLine.material, 0.8 * flightTransitionState.opacity * pathOp);
    }

    controls.update();
    renderer.render(scene, camera);
}

// Handle Resize
window.addEventListener('resize', () => {
    const distanceBeforeResize = camera.position.distanceTo(controls.target);
    const wasAtZoomLimit = Number.isFinite(galaxyFrameDistance)
        && Math.abs(distanceBeforeResize - galaxyFrameDistance) <= galaxyFrameDistance * 0.005;

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    updateGalaxyZoomLimit();

    // Keep the composed full-galaxy view pinned to the boundary across aspect
    // changes, without pulling an intentionally zoomed-in user back outward.
    if (wasAtZoomLimit && !isFlying) {
        const fromTarget = camera.position.clone().sub(controls.target).normalize();
        camera.position.copy(controls.target).addScaledVector(fromTarget, galaxyFrameDistance);
    }
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    updateCanvasBoundsCache();
    if (overviewSkyMaterial) {
        overviewSkyMaterial.uniforms.uDpr.value = Math.min(window.devicePixelRatio, 2);
    }
});

// Init
loadStars();
animate();
