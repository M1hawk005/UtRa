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
let hopToMarkerProgress = [];
let currentHopIndex = -1;
let committedHopIndex = -1;
let currentSelectedStarIndex = -1;
let flightTargetStar = null;
let flightTargetStarIndex = -1;
let interiorSky;
let overviewSky, overviewSkyMaterial;
let detailGroup = new THREE.Group();
let solMesh, starMesh, coronaMesh, instancedStarsMesh;
const _scratchLod = {};
const _scratchPhoto = {};
const maxInstancedStars = 64;
let dummyObj;
const closestStars = [];

const CANONICAL_FOCUS_DISTANCE = Math.hypot(0, -6.32, 18.97);

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
    if (!isSelectedAttr) {
        currentSelectedStarIndex = idx;
        return;
    }
    if (currentSelectedStarIndex >= 0) {
        isSelectedAttr.setX(currentSelectedStarIndex, 0.0);
    }
    currentSelectedStarIndex = idx;
    if (currentSelectedStarIndex >= 0) {
        isSelectedAttr.setX(currentSelectedStarIndex, 1.0);
    }
    isSelectedAttr.needsUpdate = true;
}

function acquireStarTarget(idxOrStar) {
    let star = null;
    let idx = -1;
    if (typeof idxOrStar === 'object' && idxOrStar !== null) {
        star = idxOrStar;
        if (!star.isSgrA) {
            idx = starData.indexOf(star);
        }
    } else {
        idx = idxOrStar;
        if (idx >= 0 && idx < starData.length) {
            star = starData[idx];
        }
    }
    if (!star) return;

    flightTargetStar = star;
    flightTargetStarIndex = idx;

    currentHopIndex = -1;
    committedHopIndex = -1;
    if (typeof pathNodes !== 'undefined' && pathNodes && pathNodes.geometry) {
        const hideAttr = pathNodes.geometry.getAttribute('hideMarker');
        if (hideAttr && typeof updateRouteMarkerVisibility === 'function' && updateRouteMarkerVisibility(hideAttr.array, -1)) {
            hideAttr.needsUpdate = true;
        }
    }
    if (typeof updateHopNavigation === 'function') updateHopNavigation();

    if (typeof flyToStar === 'function') {
        const opts = star.isSgrA ? { isSgrA: true } : {};
        flyToStar(star.x, star.y, star.z, opts);
    }
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

function calculateBlackHoleLod(distance, fovDegrees, viewportHeight, proxyRadius) {
    const safeDistance = Math.max(distance, proxyRadius + 0.001);
    const focalPixels = viewportHeight / (2 * Math.tan(fovDegrees * Math.PI / 360));
    const radiusPixels = proxyRadius * focalPixels / safeDistance;
    const t = Math.max(0, Math.min(1, (radiusPixels - 1.5) / (12.0 - 1.5)));
    return t * t * (3 - 2 * t);
}

let flightTransitionState = createTransition({ duration: 600, fadeFraction: 0.15 });

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
    if (!dummyObj) dummyObj = new THREE.Object3D();
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
    infoLine.innerHTML = `Interior sky: <a href="https://www.eso.org/public/images/eso0932a/" target="_blank" rel="noopener noreferrer" style="color:var(--neon-cyan)">ESO/S. Brunier</a> | <span id="star-attribution"></span>`;
    uiPanel.appendChild(infoLine);

    // Real-time Schwarzschild-inspired visual approximation, not full GR ray tracing.
    // The compact proxy and fixed loop ceiling bound fragment cost; its displayed
    // radius is deliberately illustrative because parsec scene units cannot resolve Sgr A*.
    const blackHoleSchwarzschildRadius = 28.0;
    const blackHoleProxyRadius = blackHoleSchwarzschildRadius * 8.5;
    const blackHoleGeometry = new THREE.SphereGeometry(
        blackHoleProxyRadius,
        isMobile ? 20 : 32,
        isMobile ? 12 : 20
    );
    const blackHoleWorldToLocal = new THREE.Matrix4();
    const blackHoleLocalToWorldDirection = new THREE.Matrix3();
    const blackHoleSkyWorldToLocal = new THREE.Matrix3();
    const blackHoleMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uWorldToLocal: { value: blackHoleWorldToLocal },
            uLocalToWorldDirection: { value: blackHoleLocalToWorldDirection },
            uSkyWorldToLocal: { value: blackHoleSkyWorldToLocal },
            uSkyTexture: { value: esoTexture },
            uSchwarzschildRadius: { value: blackHoleSchwarzschildRadius },
            uLodFactor: { value: 0.0 },
            uTransitionOpacity: { value: 1.0 }
        },
        vertexShader: `
            varying vec3 vLocalPosition;
            varying vec3 vWorldPosition;
            void main() {
                vLocalPosition = position;
                vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            #define MAX_LENS_STEPS 46
            uniform float uTime;
            uniform mat4 uWorldToLocal;
            uniform mat3 uLocalToWorldDirection;
            uniform mat3 uSkyWorldToLocal;
            uniform sampler2D uSkyTexture;
            uniform float uSchwarzschildRadius;
            uniform float uLodFactor;
            uniform float uTransitionOpacity;
            varying vec3 vLocalPosition;
            varying vec3 vWorldPosition;

            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
            }

            float noise(vec2 p) {
                vec2 cell = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), f.x),
                           mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0)), f.x), f.y);
            }

            float fbm(vec2 p) {
                float value = 0.0;
                value += 0.500 * noise(p); p = p * 2.03 + 7.1;
                value += 0.250 * noise(p); p = p * 2.01 + 3.7;
                value += 0.125 * noise(p);
                return value;
            }

            vec2 skyUv(vec3 worldDirection) {
                vec3 d = normalize(uSkyWorldToLocal * worldDirection);
                float longitude = atan(d.z, d.x);
                float latitude = acos(clamp(d.y, -1.0, 1.0));
                return vec2(fract(longitude / 6.28318530718), latitude / 3.14159265359);
            }

            vec3 diskTemperature(float radius, float doppler, float gravitationalRedshift) {
                float heat = pow(clamp((7.5 - radius) / 5.85, 0.0, 1.0), 0.58);
                vec3 outerColor = vec3(0.72, 0.075, 0.012);
                vec3 middleColor = vec3(1.0, 0.34, 0.045);
                vec3 innerColor = vec3(1.0, 0.91, 0.72);
                vec3 thermal = mix(outerColor, middleColor, smoothstep(0.0, 0.62, heat));
                thermal = mix(thermal, innerColor, smoothstep(0.58, 1.0, heat));
                thermal *= vec3(clamp(doppler, 0.75, 1.28), 1.0, clamp(1.0 / doppler, 0.72, 1.22));
                return thermal * gravitationalRedshift;
            }

            void main() {
                vec3 cameraLocal = (uWorldToLocal * vec4(cameraPosition, 1.0)).xyz / uSchwarzschildRadius;
                vec3 surfaceLocal = (uWorldToLocal * vec4(vWorldPosition, 1.0)).xyz / uSchwarzschildRadius;
                vec3 rayDirection = normalize(surfaceLocal - cameraLocal);

                float halfB = dot(cameraLocal, rayDirection);
                float c = dot(cameraLocal, cameraLocal) - 72.25;
                float root = sqrt(max(0.0, halfB * halfB - c));
                float nearDistance = max(0.0, -halfB - root);
                float farDistance = max(nearDistance, -halfB + root);
                vec3 position = cameraLocal + rayDirection * nearDistance;
                float travelled = nearDistance;
                float stepBudget = mix(24.0, float(MAX_LENS_STEPS), uLodFactor);
                float minimumRadius = length(position);
                vec3 accumulated = vec3(0.0);
                float opacity = 0.0;
                bool captured = false;
                bool escaped = false;

                for (int lensStep = 0; lensStep < MAX_LENS_STEPS; lensStep++) {
                    if (float(lensStep) >= stepBudget) break;
                    float r = length(position);
                    minimumRadius = min(minimumRadius, r);
                    if (r <= 1.0) {
                        captured = true;
                        break;
                    }
                    if (travelled >= farDistance || (r >= 8.5 && dot(position, rayDirection) > 0.0)) {
                        escaped = true;
                        break;
                    }

                    float stepLength = clamp(r * 0.16, 0.09, 0.80);
                    stepLength = min(stepLength, farDistance - travelled);
                    vec3 inward = -position / max(r, 0.001);
                    vec3 transverseGravity = inward - rayDirection * dot(inward, rayDirection);
                    float boundaryTaper = 1.0 - smoothstep(6.2, 8.45, r);
                    float deflection = boundaryTaper * stepLength * 0.72 / max(r * r, 0.16);
                    rayDirection = normalize(rayDirection + transverseGravity * deflection);
                    vec3 nextPosition = position + rayDirection * stepLength;

                    // Integrate a geometrically thin, finite atmosphere instead of a
                    // zero-thickness crossing.  In-plane rays therefore accumulate
                    // one finite optical path rather than hitting a surface each step.
                    vec3 segment = nextPosition - position;
                    vec3 diskSample = position + segment * 0.5;
                    float diskRadius = length(diskSample.xy);
                    const float diskHalfThickness = 0.18;
                    vec4 verticalCoordinates = (position.z + segment.z * vec4(0.125, 0.375, 0.625, 0.875))
                        / diskHalfThickness;
                    float verticalDensity = dot(
                        exp(-verticalCoordinates * verticalCoordinates), vec4(0.25)
                    );
                    if (diskRadius >= 1.65 && diskRadius <= 7.5 && verticalDensity > 0.001) {
                            float azimuth = atan(diskSample.y, diskSample.x);
                            vec2 turbulenceCoordinates = vec2(log(diskRadius) * 3.2,
                                azimuth * 0.72 - uTime * (0.22 + 0.28 / diskRadius));
                            float turbulence = 0.62 + 0.58 * fbm(turbulenceCoordinates);
                            float edgeFade = smoothstep(1.65, 1.95, diskRadius)
                                * (1.0 - smoothstep(6.3, 7.5, diskRadius));
                            float orbitalSpeed = clamp(0.78 / sqrt(max(diskRadius - 0.72, 0.35)), 0.08, 0.64);
                            vec3 velocity = normalize(vec3(-diskSample.y, diskSample.x, 0.0)) * orbitalSpeed;
                            vec3 directionToObserver = normalize(-rayDirection);
                            float gamma = inversesqrt(max(1.0 - orbitalSpeed * orbitalSpeed, 0.20));
                            float doppler = clamp(1.0 / (gamma * (1.0 - dot(velocity, directionToObserver))), 0.58, 1.72);
                            float gravitationalRedshift = sqrt(max(0.0, 1.0 - 1.0 / diskRadius));
                            float emissivity = edgeFade * turbulence * pow(doppler, 3.0)
                                * gravitationalRedshift * gravitationalRedshift;
                            float absorptionDensity = edgeFade * (0.72 + 0.28 * turbulence);
                            float opticalDepth = verticalDensity * absorptionDensity * stepLength * 0.12;
                            float layerOpacity = 1.0 - exp(-opticalDepth);
                            vec3 emission = diskTemperature(diskRadius, doppler, gravitationalRedshift)
                                * emissivity * 7.0;
                            accumulated += (1.0 - opacity) * emission * layerOpacity;
                            opacity += (1.0 - opacity) * layerOpacity;
                            if (opacity > 0.985) break;
                    }

                    position = nextPosition;
                    travelled += stepLength;
                }

                // Only replace framebuffer content where bending is visually material.
                // This reaches zero far inside the 8.5-rs proxy, so its silhouette
                // can never become a textured sphere-shaped patch.
                float lensInfluence = 1.0 - smoothstep(3.8, 5.8, minimumRadius);
                lensInfluence *= escaped ? 1.0 : 0.0;

                vec3 background = vec3(0.0);
                if (escaped && !captured && lensInfluence > 0.0) {
                    vec3 escapedWorldDirection = normalize(uLocalToWorldDirection * rayDirection);
                    background = texture2D(uSkyTexture, skyUv(escapedWorldDirection)).rgb
                        * lensInfluence;
                }

                float photonRing = exp(-pow((minimumRadius - 1.5) / 0.115, 2.0));
                photonRing *= escaped ? 1.0 : 0.35;
                vec3 ringColor = vec3(1.0, 0.78, 0.46) * photonRing * (0.7 + 0.8 * uLodFactor);
                vec3 finalColor = captured
                    ? vec3(0.0)
                    : background * (1.0 - opacity) + accumulated + ringColor;
                float rayOpacity = captured ? 1.0 : 1.0 - (1.0 - opacity)
                    * (1.0 - max(photonRing, lensInfluence));
                float finalOpacity = uTransitionOpacity * rayOpacity;
                if (finalOpacity < 0.003) discard;
                gl_FragColor = vec4(finalColor * uTransitionOpacity, finalOpacity);
                #include <tonemapping_fragment>
                #include <encodings_fragment>
            }
        `,
        transparent: true,
        premultipliedAlpha: true,
        depthTest: true,
        depthWrite: true,
        side: THREE.BackSide
    });

    const blackHole = new THREE.Mesh(blackHoleGeometry, blackHoleMaterial);
    blackHole.position.copy(galacticCenter);
    blackHole.lookAt(galacticCenter.clone().add(galacticNorth));
    blackHole.updateMatrixWorld(true);
    blackHoleWorldToLocal.copy(blackHole.matrixWorld).invert();
    blackHoleLocalToWorldDirection.setFromMatrix4(blackHole.matrixWorld);
    interiorSky.updateMatrixWorld(true);
    _scratchVecA.set(1, 0, 0).applyQuaternion(interiorSky.quaternion);
    _scratchVecB.set(0, 1, 0).applyQuaternion(interiorSky.quaternion);
    _scratchVecC.set(0, 0, 1).applyQuaternion(interiorSky.quaternion);
    blackHoleSkyWorldToLocal.set(
        _scratchVecA.x, _scratchVecA.y, _scratchVecA.z,
        _scratchVecB.x, _scratchVecB.y, _scratchVecB.z,
        _scratchVecC.x, _scratchVecC.y, _scratchVecC.z
    );
    // Transparent proxy integration is approximate: draw after the sky but before
    // particles, and write the proxy exit-surface depth. This deterministically
    // preserves foreground particles while suppressing unlensed background bleed.
    blackHole.renderOrder = -0.5;
    scene.add(blackHole);
    scene.userData.blackHole = blackHole;
    scene.userData.blackHoleProxyRadius = blackHoleProxyRadius;
    scene.userData.blackHoleMat = blackHoleMaterial;

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
            uGranulationScale: { value: 30.0 },
            uActivity: { value: 0.5 },
            uSeed: { value: 0.0 }
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
            uniform float uActivity; uniform float uSeed;
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

                float limb = pow(ndotv, mix(0.1, 1.2, uLimbDarkening));
                float t = uTime * 0.05;
                vec3 np = p * uGranulationScale;

                float n1 = 1.0 - abs(snoise(np + t));
                float n2 = 1.0 - abs(snoise(np * 2.0 - t * 0.5));
                float granules = n1 * 0.7 + n2 * 0.3;

                float faculae = snoise(p * 5.0 + t * 0.2) * 0.5 + 0.5;
                faculae = smoothstep(0.4, 0.8, faculae) * (1.0 - ndotv) * 0.15;

                float spotNoise = snoise(p * 3.0 + uSeed * 10.0 + t * 0.05);
                float spots = smoothstep(0.75 + uActivity * 0.1, 1.0, spotNoise);

                float brightness = 1.0 - uGranulationContrast * (1.0 - granules);
                brightness += faculae;
                brightness *= 1.0 - spots * 0.9;

                float edge = pow(1.0 - ndotv, 4.0) * 0.35;
                vec3 finalColor = uColor * limb * brightness + uColor * edge;
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

    const coronaGeo = new THREE.PlaneGeometry(3.0, 3.0);
    const coronaMat = new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(1, 1, 1) },
            uTime: { value: 0 },
            uTransitionOpacity: { value: 1.0 },
            uActivity: { value: 0.5 },
            uSeed: { value: 0.0 }
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vPosition;
            void main() {
                vUv = uv;
                vPosition = position;
                vec2 scale = vec2(
                    length(modelViewMatrix[0].xyz),
                    length(modelViewMatrix[1].xyz)
                );
                vec4 mvPosition = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
                mvPosition.xy += position.xy * scale;
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 uColor;
            uniform float uTime;
            uniform float uTransitionOpacity;
            uniform float uActivity;
            uniform float uSeed;
            varying vec2 vUv;
            varying vec3 vPosition;

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
                vec2 centerDist = vPosition.xy / 1.5;
                float r = length(centerDist);
                if (r > 1.0) discard;

                float radial = 1.0 - r;
                radial = pow(radial, 2.5);

                float mask = smoothstep(0.0, 0.7, r);
                radial *= mix(1.0, mask, 0.5);

                float angle = atan(centerDist.y, centerDist.x);
                float noise = snoise(vec3(cos(angle)*2.0, sin(angle)*2.0, uTime * 0.1 + uSeed * 10.0)) * 0.5 + 0.5;

                float coronaIntensity = radial * (0.3 + uActivity * 0.25) * (0.6 + noise * 0.4);

                gl_FragColor = vec4(uColor * coronaIntensity, coronaIntensity * uTransitionOpacity);
                #include <tonemapping_fragment>
                #include <encodings_fragment>
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    coronaMesh = new THREE.Mesh(coronaGeo, coronaMat);
    coronaMesh.visible = false;
    detailGroup.add(coronaMesh);
}

// GLSL Procedural Sun Shader replaces static canvas texture
const vertexShader = `
    uniform vec3 uGalacticCenter;
    uniform float uFov;
    uniform float uViewportHeight;
    attribute float size;
    attribute vec3 customColor;
    attribute float isProcedural;
    attribute float isSelected;
    attribute float radius;
    varying vec3 vColor;
    varying float vIsProcedural;
    varying float vIsSelected;
    varying float vGalacticDist;
    varying float vDist;

    void main() {
        vColor = customColor;
        vIsProcedural = isProcedural;
        vIsSelected = isSelected;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vGalacticDist = length(cameraPosition - uGalacticCenter);
        vDist = -mvPosition.z;

        float pointSize = clamp(size, 1.0, 4.0);
        if (radius > 0.0) {
            float fovRad = uFov * 3.14159265 / 180.0;
            float viewHeightAtDist = 2.0 * vDist * tan(fovRad / 2.0);
            float projPx = (radius * 2.0 / viewHeightAtDist) * uViewportHeight;
            pointSize = max(pointSize, projPx);
        }

        if (isSelected > 0.5) {
            pointSize = max(pointSize, 16.0);
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
    varying float vDist;

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

            // Soft LOD crossfade band, aligned with the instanced-sphere fade-in
            // (see calculateDetailLOD call for the nearby spheres). The point holds
            // full brightness out to the far edge, then dissolves as the resolved
            // sphere takes over, so the eye never sees a hard point->sphere pop.
            float t = (9.5 - vDist) / (9.5 - 3.0);
            t = clamp(t, 0.0, 1.0);
            float pt = clamp((t - 0.25) / 0.75, 0.0, 1.0);
            float pointOpacity = 1.0 - pt * pt * (3.0 - 2.0 * pt);
            alpha *= pointOpacity;
        }

        if (vIsProcedural > 0.5) {
            float macroFade = smoothstep(12000.0, 25000.0, vGalacticDist);
            alpha *= (1.0 - macroFade);
        }

        if (alpha < 0.01) discard;

        gl_FragColor = vec4(finalColor, alpha * uTransitionOpacity);
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
        initAutocomplete(
            document.getElementById('star-search'),
            document.getElementById('search-listbox'),
            () => starData,
            (selectedStar) => {
                if (selectedStar) {
                    acquireStarTarget(selectedStar);
                }
            }
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
        const radiiArr = new Float32Array(starData.length);

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
            let r = 1.0;
            const cls = (s.s && s.s.length > 0) ? s.s.charAt(0).toUpperCase() : 'G';
            let hash = Math.abs((s.x || 0) + (s.y || 0) + (s.z || 0));
            switch(cls) {
                case 'O': r = 6.0 + (hash % 9.0); break;
                case 'B': r = 3.0 + (hash % 3.0); break;
                case 'A': r = 1.5 + (hash % 1.5); break;
                case 'F': r = 1.0 + (hash % 0.5); break;
                case 'G': r = 0.8 + (hash % 0.2); break;
                case 'K': r = 0.6 + (hash % 0.2); break;
                case 'M': r = 0.1 + (hash % 0.5); break;
            }
            radiiArr[i] = r * 0.02325;
        }

        starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        starsGeometry.setAttribute('customColor', new THREE.BufferAttribute(colors, 3));
        starsGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        starsGeometry.setAttribute('isProcedural', new THREE.BufferAttribute(isProceduralArr, 1));
        starsGeometry.setAttribute('isSelected', new THREE.BufferAttribute(isSelectedArr, 1));
        starsGeometry.setAttribute('radius', new THREE.BufferAttribute(radiiArr, 1));

        const shaderMaterial = new THREE.ShaderMaterial({
            uniforms: {
                color: { value: new THREE.Color(0xffffff) },
                uSelectedPointOpacity: { value: 1.0 },
                uGalacticCenter: { value: galacticCenter },
                uTransitionOpacity: { value: 1.0 },
                uFov: { value: camera ? camera.fov : 60.0 },
                uViewportHeight: { value: window.innerHeight }
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

        const instancedGeo = new THREE.SphereGeometry(1, 16, 16);
        const instColor = new Float32Array(maxInstancedStars * 3);
        const instLimb = new Float32Array(maxInstancedStars);
        const instActivity = new Float32Array(maxInstancedStars);
        const instSeed = new Float32Array(maxInstancedStars);
        const instOpacity = new Float32Array(maxInstancedStars);
        
        instancedGeo.setAttribute('instColor', new THREE.InstancedBufferAttribute(instColor, 3));
        instancedGeo.setAttribute('instLimb', new THREE.InstancedBufferAttribute(instLimb, 1));
        instancedGeo.setAttribute('instActivity', new THREE.InstancedBufferAttribute(instActivity, 1));
        instancedGeo.setAttribute('instSeed', new THREE.InstancedBufferAttribute(instSeed, 1));
        instancedGeo.setAttribute('instOpacity', new THREE.InstancedBufferAttribute(instOpacity, 1));

        const instancedMat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uTransitionOpacity: { value: 1.0 }
            },
            vertexShader: `
                attribute vec3 instColor;
                attribute float instLimb;
                attribute float instActivity;
                attribute float instSeed;
                attribute float instOpacity;
                
                varying vec3 vColor;
                varying float vLimb;
                varying float vActivity;
                varying float vSeed;
                varying float vOpacity;
                varying vec3 vNormal;
                varying vec3 vViewPosition;
                
                void main() {
                    vColor = instColor;
                    vLimb = instLimb;
                    vActivity = instActivity;
                    vSeed = instSeed;
                    vOpacity = instOpacity;
                    vNormal = normalize(normalMatrix * normal);
                    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
                    vViewPosition = -mvPosition.xyz;
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform float uTime;
                uniform float uTransitionOpacity;
                
                varying vec3 vColor;
                varying float vLimb;
                varying float vActivity;
                varying float vSeed;
                varying float vOpacity;
                varying vec3 vNormal;
                varying vec3 vViewPosition;
                
                float hash(float n) { return fract(sin(n) * 1e4); }
                float noise(vec3 x) {
                    vec3 p = floor(x);
                    vec3 f = fract(x);
                    f = f*f*(3.0-2.0*f);
                    float n = p.x + p.y*57.0 + 113.0*p.z;
                    return mix(mix(mix( hash(n+  0.0), hash(n+  1.0),f.x),
                                   mix( hash(n+ 57.0), hash(n+ 58.0),f.x),f.y),
                               mix(mix( hash(n+113.0), hash(n+114.0),f.x),
                                   mix( hash(n+170.0), hash(n+171.0),f.x),f.y),f.z);
                }
                
                void main() {
                    if (vOpacity <= 0.0) discard;
                    
                    vec3 normal = normalize(vNormal);
                    vec3 viewDir = normalize(vViewPosition);
                    float ndotv = max(dot(normal, viewDir), 0.0);
                    
                    float limb = mix(1.0, ndotv, vLimb);
                    
                    float n = noise(normal * 20.0 + uTime * 0.5 + vSeed * 100.0);
                    float brightness = 1.0 - (n * 0.2 * vActivity);
                    
                    float edge = pow(1.0 - ndotv, 4.0) * 0.35;
                    vec3 finalColor = vColor * limb * brightness + vColor * edge;
                    
                    gl_FragColor = vec4(finalColor, vOpacity * uTransitionOpacity);
                    #include <tonemapping_fragment>
                    #include <encodings_fragment>
                }
            `,
            transparent: true, depthTest: true
        });

        instancedStarsMesh = new THREE.InstancedMesh(instancedGeo, instancedMat, maxInstancedStars);
        instancedStarsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(instancedStarsMesh);

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

function navigateAdjacentHop(direction) {
    let index = currentHopIndex + direction;
    while (index >= 0 && index < currentRouteHops.length) {
        if (resolvedRouteStars[index]) {
            focusHop(index);
            return;
        }
        index += direction;
    }
}

function hasAdjacentResolvedHop(startIndex, direction) {
    let index = startIndex + direction;
    while (index >= 0 && index < currentRouteHops.length) {
        if (resolvedRouteStars[index]) return true;
        index += direction;
    }
    return false;
}

function updateHopNavigation() {
    const total = currentRouteHops.length;
    const validIndex = committedHopIndex >= 0 && committedHopIndex < total;
    document.getElementById('hop-progress').textContent = validIndex ? `HOP ${committedHopIndex + 1} / ${total}` : 'HOP 0 / 0';
    document.getElementById('hop-current').textContent = validIndex ? (hopName(currentRouteHops[committedHopIndex]) || 'UNRESOLVED WAYPOINT') : 'NO ROUTE LOCK';

    const validCurrent = currentHopIndex >= 0 && currentHopIndex < total;
    const activeIndex = validCurrent ? currentHopIndex : committedHopIndex;
    const validActive = activeIndex >= 0 && activeIndex < total;

    const hasPrev = validActive && hasAdjacentResolvedHop(activeIndex, -1);
    const hasNext = validActive && hasAdjacentResolvedHop(activeIndex, 1);
    document.getElementById('btn-prev-hop').disabled = !hasPrev;
    document.getElementById('btn-next-hop').disabled = !hasNext;
    const mapPrevBtn = document.getElementById('map-btn-prev-hop');
    const mapNextBtn = document.getElementById('map-btn-next-hop');
    if (mapPrevBtn) mapPrevBtn.disabled = !hasPrev;
    if (mapNextBtn) mapNextBtn.disabled = !hasNext;

    document.querySelectorAll('.hop-button').forEach((button, index) => {
        if (index === committedHopIndex) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
    });

    const active = document.querySelector('.hop-button[aria-current="step"]');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
}

function focusHop(index) {
    if (!Number.isInteger(index) || index < 0 || index >= currentRouteHops.length) return;
    const star = resolvedRouteStars[index];
    if (!star) return; // Atomically fail if unresolved

    const isEstablishedRouteHop = committedHopIndex !== -1;

    currentHopIndex = index;
    updateHopNavigation();

    const opts = star.isSgrA ? { isRouteHop: isEstablishedRouteHop, isSgrA: true } : { isRouteHop: isEstablishedRouteHop };
    flyToStar(star.x, star.y, star.z, opts);
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

    let totalLength = 0;
    const distances = new Float32Array(points.length);
    distances[0] = 0;
    for (let i = 1; i < points.length; i++) {
        const d = points[i].distanceTo(points[i - 1]);
        totalLength += d;
        distances[i] = totalLength;
    }
    const progresses = new Float32Array(points.length);
    for (let i = 0; i < points.length; i++) {
        progresses[i] = totalLength > 0 ? distances[i] / totalLength : 0;
    }

    hopToMarkerProgress = new Float32Array(hops.length);
    for (let i = 0; i < hops.length; i++) {
        const idx = hopToMarkerIndex[i];
        if (idx >= 0) {
            hopToMarkerProgress[i] = progresses[idx];
        } else {
            hopToMarkerProgress[i] = -1;
        }
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    geometry.setAttribute('routeProgress', new THREE.BufferAttribute(progresses, 1));

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const commIdx = committedHopIndex;
    const currIdx = currentHopIndex >= 0 ? currentHopIndex : committedHopIndex;
    const commProg = commIdx >= 0 && commIdx < hopToMarkerProgress.length && hopToMarkerProgress[commIdx] >= 0 ? hopToMarkerProgress[commIdx] : 0.0;
    const currProg = currIdx >= 0 && currIdx < hopToMarkerProgress.length && hopToMarkerProgress[currIdx] >= 0 ? hopToMarkerProgress[currIdx] : 0.0;

    let actStartProg = commProg;
    let actEndProg = currProg;
    if (actStartProg > actEndProg) {
        const tmp = actStartProg;
        actStartProg = actEndProg;
        actEndProg = tmp;
    }

    const material = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uCommittedProgress: { value: commProg },
            uActiveStartProgress: { value: actStartProg },
            uActiveEndProgress: { value: actEndProg },
            uReducedMotion: { value: prefersReducedMotion ? 1.0 : 0.0 },
            uGlobalOpacity: { value: 0.8 },
            uColor: { value: new THREE.Color(0x2ac3de) },
            uPulseColor: { value: new THREE.Color(0x7dcfff) }
        },
        vertexShader: `
            attribute float routeProgress;
            varying float vProgress;
            void main() {
                vProgress = routeProgress;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform float uCommittedProgress;
            uniform float uActiveStartProgress;
            uniform float uActiveEndProgress;
            uniform float uReducedMotion;
            uniform float uGlobalOpacity;
            uniform vec3 uColor;
            uniform vec3 uPulseColor;
            varying float vProgress;

            void main() {
                float baseIntensity = 1.0;

                if (vProgress < uCommittedProgress) {
                    baseIntensity = 0.4;
                }

                if (vProgress >= uActiveStartProgress && vProgress <= uActiveEndProgress && uActiveStartProgress != uActiveEndProgress) {
                    baseIntensity = 1.6;
                }

                float pulse = 0.0;
                if (uReducedMotion < 0.5) {
                    pulse = pow(sin(vProgress * 40.0 - uTime * 3.0) * 0.5 + 0.5, 4.0);
                }

                vec3 finalColor = mix(uColor, uPulseColor, pulse * 0.6) * baseIntensity;
                gl_FragColor = vec4(finalColor, uGlobalOpacity);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: false
    });

    pathLine = new THREE.Line(geometry, material);
    scene.add(pathLine);

    // Add HUD nodes so the trajectory remains visible from galactic scale
    const nodesGeo = new THREE.BufferGeometry().setFromPoints(points);
    const hiddenMarkers = new Float32Array(points.length);
    const initialMarkerIndex = committedHopIndex >= 0 && committedHopIndex < hopToMarkerIndex.length ? hopToMarkerIndex[committedHopIndex] : -1;
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
    committedHopIndex = -1;
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
    const errDiv = document.getElementById('error-message');

    if (firstResolved !== -1) {
        if (sucDiv) sucDiv.classList.remove('hidden');
        if (errDiv) errDiv.classList.add('hidden');
    } else {
        if (sucDiv) sucDiv.classList.add('hidden');
        if (errDiv) {
            errDiv.classList.remove('hidden');
            errDiv.textContent = 'Route unavailable. No valid destinations found.';
        }
    }

    if (mapModeBtn) {
        if (firstResolved !== -1) {
            mapModeBtn.classList.remove('hidden');
            mapModeBtn.style.display = '';
        } else {
            mapModeBtn.classList.add('hidden');
            mapModeBtn.style.display = 'none';
        }
    }

    if (firstResolved !== -1) {
        focusHop(firstResolved);
    } else {
        updateHopNavigation();
        const detailsCard = document.getElementById('star-details');
        if (detailsCard && appMode !== 'SEARCH') {
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
        if (document.body.classList.contains('map-only-mode')) {
            exitMapMode(false);
        }
    }
}

// Form Handling
let appMode = 'SEARCH';
globalThis.appMode = appMode;

const appUiPanel = document.getElementById('ui-panel');
const routeModeBtn = document.getElementById('btn-route-mode');
const searchModeBtn = document.getElementById('btn-search-mode');
const floatingSearch = document.getElementById('floating-search');

if (routeModeBtn) {
    routeModeBtn.addEventListener('click', () => {
        if (appMode === 'ROUTE') return;
        appMode = 'ROUTE';
        globalThis.appMode = appMode;
        appUiPanel.classList.remove('hidden');
        appUiPanel.setAttribute('aria-hidden', 'false');
        appUiPanel.removeAttribute('inert');
        routeModeBtn.setAttribute('aria-expanded', 'true');

        floatingSearch.classList.add('hidden');
        floatingSearch.setAttribute('aria-hidden', 'true');
        floatingSearch.setAttribute('inert', 'true');

        const endInput = document.getElementById('end');
        if (flightTargetStar && !flightTargetStar.isSgrA) {
            endInput.value = flightTargetStar.n;
        }
        document.getElementById('start').focus();
    });
}

function resetToHome() {
    if (typeof clearRoute === 'function') clearRoute();
    
    const searchInput = document.getElementById('star-search');
    if (searchInput) {
        searchInput.value = '';
        if (typeof hideListbox === 'function') hideListbox(document.getElementById('search-listbox'));
    }
    
    const endInput = document.getElementById('end');
    if (endInput) endInput.value = '';
    const startInput = document.getElementById('start');
    if (startInput) startInput.value = 'Sol';

    if (currentSelectedStarIndex >= 0 && starsGeometry) {
        const isSelectedAttr = starsGeometry.getAttribute('isSelected');
        if (isSelectedAttr) {
            isSelectedAttr.setX(currentSelectedStarIndex, 0.0);
            isSelectedAttr.needsUpdate = true;
        }
    }
    
    flightTargetStar = null;
    flightTargetStarIndex = -1;
    currentSelectedStarIndex = -1;
    if (focusRing) focusRing.visible = false;
    
    const detailsCard = document.getElementById('details-card');
    if (detailsCard) {
        detailsCard.hidden = true;
        detailsCard.replaceChildren();
    }
    const starDetailsCard = document.getElementById('star-details');
    if (starDetailsCard) starDetailsCard.classList.add('hidden');

    if (document.body.classList.contains('map-only-mode') && typeof exitMapMode === 'function') {
        exitMapMode(false);
    }
    if (typeof finishFlightTransition === 'function') {
        finishFlightTransition(false);
    }

    if (appMode !== 'SEARCH' && searchModeBtn) {
        searchModeBtn.click();
    } else if (appMode === 'SEARCH') {
        const searchBox = document.getElementById('star-search');
        if (searchBox) searchBox.focus();
    }

    if (typeof zoomToOverviewPreserveDirection === 'function') zoomToOverviewPreserveDirection();
}

function zoomToOverviewPreserveDirection() {
    const OVERVIEW_DISTANCE = 50000;
    const target = new THREE.Vector3(0, 0, 0);
    const dir = camera.position.clone().sub(controls.target).normalize();
    if (dir.lengthSq() < 0.001) { dir.set(0, -1, 1).normalize(); }
    camera.position.copy(target).addScaledVector(dir, OVERVIEW_DISTANCE);
    camera.position.y = Math.sign(camera.position.y) * Math.max(Math.abs(camera.position.y), OVERVIEW_DISTANCE * 0.3);
    controls.target.copy(target);
    controls.update();
}

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

    clearRoute();
    resDiv.classList.remove('hidden');

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
    // Don't start a drag (which pointer-captures the header and steals the
    // subsequent click) when the press lands on any header control — e.g.
    // the back/search-mode button or the collapse toggle. Otherwise their
    // click events never fire.
    if (e.target.closest('button')) return;
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

        if (currentHopIndex !== -1 && currentRouteHops && currentRouteHops.length > 0) {
            committedHopIndex = currentHopIndex;

            if (pathNodes && pathNodes.geometry) {
                const hideAttr = pathNodes.geometry.getAttribute('hideMarker');
                const markerIndex = hopToMarkerIndex[committedHopIndex];
                if (hideAttr && markerIndex >= 0 && updateRouteMarkerVisibility(hideAttr.array, markerIndex)) {
                    hideAttr.needsUpdate = true;
                }
            }

            const star = resolvedRouteStars[committedHopIndex];
            if (star) {
                const starIdx = starData.indexOf(star);
                if (starIdx >= 0) highlightStar(starIdx);
                showStarDetails(star, { routeIndex: committedHopIndex });
            }
            updateHopNavigation();
        } else if (flightTargetStarIndex >= 0 || (flightTargetStar && flightTargetStar.isSgrA)) {
            if (flightTargetStarIndex >= 0) highlightStar(flightTargetStarIndex);
            showStarDetails(flightTargetStar);
        }
    } else {
        if (committedHopIndex === -1) {
            currentHopIndex = -1;
            updateHopNavigation();

            if (currentSelectedStarIndex >= 0) {
                const star = starData[currentSelectedStarIndex];
                if (star && typeof focusRing !== 'undefined' && focusRing) {
                    focusRing.position.set(star.x, star.y, star.z);
                    focusRing.visible = true;
                }
            } else {
                if (appMode !== 'SEARCH') {
                    const detailsCard = document.getElementById('star-details');
                    if (detailsCard) {
                        detailsCard.hidden = true;
                        detailsCard.replaceChildren();
                    }
                }
                if (typeof focusRing !== 'undefined' && focusRing) focusRing.visible = false;
            }

            flightTargetStarIndex = -1;
            flightTargetStar = null;
        } else {
            currentHopIndex = committedHopIndex;
            const star = resolvedRouteStars[committedHopIndex];
            if (star) {
                const starIdx = starData.indexOf(star);
                if (starIdx >= 0) highlightStar(starIdx);
                showStarDetails(star, { routeIndex: committedHopIndex });
                if (focusRing) {
                    focusRing.position.set(star.x, star.y, star.z);
                    focusRing.visible = true;
                }
            }
            updateHopNavigation();
        }
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

function flyToStar(x, y, z, options = {}) {
    flightMayCommitDestination = true;
    targetNode.set(x, y, z);

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const currentCam = camera.position.clone();
    const currentTarget = controls.target.clone();

    if (!options.isRouteHop) {
        options.isFocus = true;
    }

    const offset = currentCam.clone().sub(currentTarget);
    const sourceDist = offset.length();
    const inspectionDist = CANONICAL_FOCUS_DISTANCE;
    if (sourceDist > 1e-5 && Number.isFinite(sourceDist)) {
        camTargetNode.copy(targetNode).add(offset.normalize().multiplyScalar(inspectionDist));
    } else {
        camTargetNode.set(x, y - 6.32, z + 18.97);
    }

    flightSourceNode.copy(currentTarget);
    flightSourceCam.copy(currentCam);

    fadingMaterials = [];
    if (!options.isFocus) {
        if (starsGeometry && starsPoints && starsPoints.material) {
            fadingMaterials.push({ material: starsPoints.material, baseline: 1.0 });
        }
        if (scene.userData.nebulaMesh) {
            fadingMaterials.push({ material: scene.userData.nebulaMesh.material, baseline: 1.0 });
        }
    }

    flightTransitionState = startTransition(flightTransitionState, { reducedMotion: prefersReducedMotion, isRouteHop: options.isRouteHop, isFocus: options.isFocus });
    // Evaluate initial state at t=0 to align source points
    updateTransition(flightTransitionState, 0);

    if (flightTransitionState.phase === 'DEPARTURE') {
        const t = flightTransitionState.departureT;
        if (t > 0 && t < 1) {
            flightSourceCam.copy(currentCam).sub(_scratchVecA.copy(flightSourceMapCam).multiplyScalar(t)).multiplyScalar(1 / (1 - t));
            flightSourceNode.copy(currentTarget).sub(_scratchVecA.copy(flightSourceMapTarget).multiplyScalar(t)).multiplyScalar(1 / (1 - t));
        } else {
            flightSourceCam.copy(currentCam);
            flightSourceNode.copy(currentTarget);
        }
    } else if (flightTransitionState.phase === 'MAP_ARC') {
        flightSourceMapCam.copy(currentCam);
        flightSourceMapTarget.copy(currentTarget);
    } else if (flightTransitionState.phase === 'FOCUS') {
        const t = flightTransitionState.focusT;
        if (t > 0 && t < 1) {
            flightSourceCam.copy(currentCam).sub(_scratchVecA.copy(camTargetNode).multiplyScalar(t)).multiplyScalar(1 / (1 - t));
            flightSourceNode.copy(currentTarget).sub(_scratchVecA.copy(targetNode).multiplyScalar(t)).multiplyScalar(1 / (1 - t));
        } else {
            flightSourceCam.copy(currentCam);
            flightSourceNode.copy(currentTarget);
        }
    } else if (flightTransitionState.phase === 'SLIDE') {
        const t = flightTransitionState.slideT;
        if (t > 0 && t < 1) {
            flightSourceCam.copy(currentCam).sub(_scratchVecA.copy(camTargetNode).multiplyScalar(t)).multiplyScalar(1 / (1 - t));
            flightSourceNode.copy(currentTarget).sub(_scratchVecA.copy(targetNode).multiplyScalar(t)).multiplyScalar(1 / (1 - t));
        } else {
            flightSourceCam.copy(currentCam);
            flightSourceNode.copy(currentTarget);
        }
    }

    isFlying = true;
    controls.maxDistance = Infinity;
    controls.enabled = false;

    if (focusRing) {
        focusRing.position.set(x, y, z);
        focusRing.visible = true;
    }
}

// Persistent star details card (static HTML in index.html)
const detailsCard = document.getElementById('star-details');

// Wire collapse toggle once
(function initCardToggle() {
    const toggle = detailsCard.querySelector('.card-toggle');
    if (!toggle) return;
    toggle.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const collapsed = detailsCard.classList.toggle('card-collapsed');
        toggle.textContent = collapsed ? '+' : '−';
        toggle.title = collapsed ? 'Expand' : 'Collapse';
        toggle.setAttribute('aria-label', collapsed ? 'Expand card' : 'Collapse card');
    });
})();

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

    const name = displayValue(star.n);
    const title = detailsCard.querySelector('h2');
    const list = detailsCard.querySelector('dl');
    const wikiLink = detailsCard.querySelector('a');

    title.textContent = name;

    // Clear and repopulate dl
    while (list.firstChild) list.removeChild(list.firstChild);

    if (star.isSgrA) {
        appendDetail(list, 'TYPE', 'Supermassive black hole / Galactic Center');
    } else {
        appendDetail(list, 'SPECTRAL CLASS', displayValue(star.s));
        appendDetail(list, 'MAGNITUDE', displayValue(star.m));
    }
    appendDetail(list, 'COORDINATES', sx !== null && sy !== null && sz !== null
        ? `${sx.toFixed(2)}, ${sy.toFixed(2)}, ${sz.toFixed(2)} PC`
        : 'UNKNOWN');
    appendDetail(list, 'DISTANCE FROM SOL', distanceFromSol === null ? 'UNKNOWN' : `${distanceFromSol.toFixed(2)} PC`);
    appendDetail(list, 'ROUTE ROLE', routeIndex < 0 ? 'OFF ROUTE' : `${routeIndex === 0 ? 'ORIGIN' : routeIndex === currentRouteHops.length - 1 ? 'DESTINATION' : 'WAYPOINT'} · ${routeIndex + 1}/${currentRouteHops.length}`);
    if (!star.isSgrA) {
        const isSol = star.n === 'Sol';
        const isProcedural = !!(star.n && star.n.startsWith('GAL-'));
        const provenance = getProvenance(isSol, isProcedural);
        if (provenance) {
            appendDetail(list, 'PROVENANCE', provenance, true);
        }
    }
    wikiLink.href = `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(name)}`;

    // Reset collapse state
    const toggle = detailsCard.querySelector('.card-toggle');
    if (toggle) {
        toggle.textContent = '−';
        toggle.title = 'Collapse';
        toggle.setAttribute('aria-label', 'Collapse card');
    }
    detailsCard.classList.remove('hidden', 'card-collapsed');
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
        acquireStarTarget(bestIndex);
    }
}

const canvasPointerState = new PointerState();

renderer.domElement.addEventListener('pointerdown', (event) => {
    if (flightTransitionState && flightTransitionState.isActive) {
        flightMayCommitDestination = false;
        interruptTransition(flightTransitionState);
        if (!flightTransitionState.isActive) {
            finishFlightTransition(false);
        }
        isFlying = false;
        controls.enabled = true;
    }
    canvasPointerState.onPointerDown(event.pointerId, event.clientX, event.clientY, event.timeStamp);
    try { renderer.domElement.setPointerCapture(event.pointerId); } catch (_) { /* Capture is best-effort. */ }
}, { capture: true });

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
        if (!flightTransitionState.isActive) {
            finishFlightTransition(false);
        }
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

document.getElementById('btn-prev-hop').addEventListener('click', () => navigateAdjacentHop(-1));
document.getElementById('btn-next-hop').addEventListener('click', () => navigateAdjacentHop(1));

const mapModeBtn = document.getElementById('btn-map-mode');
const mapControlsContainer = document.getElementById('map-mode-controls');
const mapPrevBtn = document.getElementById('map-btn-prev-hop');
const mapNextBtn = document.getElementById('map-btn-next-hop');
const mapRestoreBtn = document.getElementById('map-btn-restore');

function exitMapMode(userTriggered = false) {
    let focusWasInMapControls = false;
    if (mapControlsContainer && document.activeElement && mapControlsContainer.contains(document.activeElement)) {
        focusWasInMapControls = true;
    }

    document.body.classList.remove('map-only-mode');
    if (mapControlsContainer) {
        mapControlsContainer.classList.add('hidden');
        mapControlsContainer.setAttribute('aria-hidden', 'true');
    }

    if (userTriggered && mapModeBtn) {
        mapModeBtn.focus();
    } else if (!userTriggered && focusWasInMapControls) {
        const fallback = document.querySelector('button[type="submit"]') || document.getElementById('nav-submit') || document.body;
        if (fallback) fallback.focus();
    }
    window.dispatchEvent(new Event('resize'));
}

globalThis.clearRoute = function() {
    currentHopIndex = -1;
    committedHopIndex = -1;
    if (typeof finishFlightTransition !== 'undefined') {
        finishFlightTransition(false);
    }
    currentRouteHops = [];
    resolvedRouteStars = [];
    drawPath([]);
    updateHopNavigation();

    const list = document.getElementById('hop-list');
    if (list) list.replaceChildren();

    const detailsCard = document.getElementById('star-details');
    if (detailsCard) {
        detailsCard.hidden = true;
        detailsCard.replaceChildren();
    }
    if (typeof currentSelectedStarIndex !== 'undefined' && currentSelectedStarIndex >= 0) {
        if (typeof starsGeometry !== 'undefined') {
            const isSelectedAttr = starsGeometry.getAttribute('isSelected');
            if (isSelectedAttr) {
                isSelectedAttr.setX(currentSelectedStarIndex, 0.0);
                isSelectedAttr.needsUpdate = true;
            }
        }
        currentSelectedStarIndex = -1;
    }
    if (typeof focusRing !== 'undefined' && focusRing) focusRing.visible = false;

    document.getElementById('results').classList.add('hidden');
    if (typeof mapModeBtn !== 'undefined' && mapModeBtn) {
        mapModeBtn.classList.add('hidden');
        mapModeBtn.style.display = 'none';
    }
    exitMapMode();
};

if (mapModeBtn) {
    mapModeBtn.addEventListener('click', () => {
        document.body.classList.add('map-only-mode');
        if (mapControlsContainer) {
            mapControlsContainer.classList.remove('hidden');
            mapControlsContainer.removeAttribute('aria-hidden');
        }
        if (mapNextBtn && !mapNextBtn.disabled) {
            mapNextBtn.focus();
        } else if (mapPrevBtn && !mapPrevBtn.disabled) {
            mapPrevBtn.focus();
        } else if (mapRestoreBtn) {
            mapRestoreBtn.focus();
        }
        window.dispatchEvent(new Event('resize'));
    });
}
if (mapRestoreBtn) mapRestoreBtn.addEventListener('click', () => exitMapMode(true));
if (mapPrevBtn) mapPrevBtn.addEventListener('click', () => navigateAdjacentHop(-1));
if (mapNextBtn) mapNextBtn.addEventListener('click', () => navigateAdjacentHop(1));

window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.classList.contains('map-only-mode')) {
        exitMapMode(true);
        event.preventDefault();
        return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const target = event.target;
    if (target instanceof Element && target !== renderer.domElement && target.closest(
        'input, select, textarea, button, a, [contenteditable="true"], #ui-panel, #star-details'
    )) return;
    if (currentHopIndex < 0) return;
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    if (!hasAdjacentResolvedHop(currentHopIndex, direction)) return;
    event.preventDefault();
    navigateAdjacentHop(direction);
});

// Animation Loop
let previousFrameTime = performance.now();

function updateFlight(deltaMs) {
    if (!flightTransitionState.isActive) return;

    const MAX_ACTIVE_DELTA_MS = 100;
    const effectiveDeltaMs = flightTransitionState.reducedMotion ? deltaMs : Math.min(deltaMs, MAX_ACTIVE_DELTA_MS);
    updateTransition(flightTransitionState, effectiveDeltaMs);

    if (fadingMaterials) {
        for (let i = 0; i < fadingMaterials.length; i++) {
            const item = fadingMaterials[i];
            applyMaterialOpacity(item.material, item.baseline * flightTransitionState.opacity);
        }
    }

    if (flightTransitionState.isFlying) {
        if (flightTransitionState.phase === 'DEPARTURE') {
            controls.target.lerpVectors(flightSourceNode, flightSourceMapTarget, flightTransitionState.departureT);
            camera.position.lerpVectors(flightSourceCam, flightSourceMapCam, flightTransitionState.departureT);
        } else if (flightTransitionState.phase === 'MAP_ARC') {
            controls.target.lerpVectors(flightSourceMapTarget, flightTargetMapTarget, flightTransitionState.mapArcT);
            _scratchVecA.lerpVectors(flightSourceMapCam, flightTargetMapCam, flightTransitionState.mapArcT);
            const arcHeight = flightSourceMapTarget.distanceTo(flightTargetMapTarget) * 0.3;
            const frame = getGalaxyFrame();
            _scratchVecB.copy(frame.viewOut).multiplyScalar(arcHeight * Math.sin(flightTransitionState.mapArcT * Math.PI));
            camera.position.copy(_scratchVecA).add(_scratchVecB);
        } else if (flightTransitionState.phase === 'ARRIVAL') {
            camera.position.lerpVectors(flightTargetMapCam, camTargetNode, flightTransitionState.arrivalT);
            controls.target.lerpVectors(flightTargetMapTarget, targetNode, flightTransitionState.arrivalT);
        } else if (flightTransitionState.phase === 'FOCUS') {
            camera.position.lerpVectors(flightSourceCam, camTargetNode, flightTransitionState.focusT);
            controls.target.lerpVectors(flightSourceNode, targetNode, flightTransitionState.focusT);
        } else if (flightTransitionState.phase === 'SLIDE') {
            camera.position.lerpVectors(flightSourceCam, camTargetNode, flightTransitionState.slideT);
            controls.target.lerpVectors(flightSourceNode, targetNode, flightTransitionState.slideT);
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

    if (scene.userData.blackHoleMat && scene.userData.blackHole) {
        const blackHoleMaterial = scene.userData.blackHoleMat;
        scene.userData.blackHole.updateMatrixWorld();
        blackHoleMaterial.uniforms.uWorldToLocal.value.copy(scene.userData.blackHole.matrixWorld).invert();
        blackHoleMaterial.uniforms.uLocalToWorldDirection.value.setFromMatrix4(scene.userData.blackHole.matrixWorld);
        const blackHoleDistance = camera.position.distanceTo(galacticCenter);
        const blackHoleLod = calculateBlackHoleLod(
            blackHoleDistance,
            camera.fov,
            window.innerHeight,
            scene.userData.blackHoleProxyRadius
        );
        blackHoleMaterial.uniforms.uTime.value = now * 0.001;
        blackHoleMaterial.uniforms.uLodFactor.value = blackHoleLod;
        blackHoleMaterial.uniforms.uTransitionOpacity.value = blackHoleLod * flightTransitionState.opacity;
        scene.userData.blackHole.visible = blackHoleLod > 0.001;
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
        const lod = calculateDetailLOD(dist, camera.fov, window.innerHeight, 32.0, 21.0, _scratchLod);
        if (starsPoints) {
            starsPoints.material.uniforms.uSelectedPointOpacity.value = lod.pointOpacity;
        }

        if (lod.visible) {
            detailGroup.visible = true;
            detailGroup.position.copy(targetNode);
            const isMobile = window.matchMedia('(max-width: 600px)').matches;
            const targetFraction = isMobile ? 0.34 : 0.34;
            const scale = calculateInspectionScale(dist, camera.fov, window.innerWidth, window.innerHeight, targetFraction);
            detailGroup.scale.set(scale, scale, scale);

            if (star.n === 'Sol') {
                solMesh.visible = true;
                starMesh.visible = false;
                coronaMesh.visible = false;
                solMesh.material.uniforms.uTransitionOpacity.value = lod.detailOpacity * flightTransitionState.opacity;
            } else {
                solMesh.visible = false;
                starMesh.visible = true;
                coronaMesh.visible = true;
                const identityStr = star.n + '|' + (star.x||0).toFixed(4) + '|' + (star.y||0).toFixed(4) + '|' + (star.z||0).toFixed(4);
                const params = getPhotosphereParams(star.s, identityStr, _scratchPhoto);
                const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                const effectiveTime = calculateReducedMotionTime(now * 0.001, reducedMotion);
                _starBaseColor.set(params.baseColor);

                starMesh.material.uniforms.uColor.value.copy(_starBaseColor);
                starMesh.material.uniforms.uLimbDarkening.value = params.limbDarkening;
                starMesh.material.uniforms.uGranulationContrast.value = params.granulationContrast;
                starMesh.material.uniforms.uGranulationScale.value = params.granulationScale;
                starMesh.material.uniforms.uActivity.value = params.activity;
                starMesh.material.uniforms.uSeed.value = params.seed;
                starMesh.material.uniforms.uTime.value = effectiveTime;
                starMesh.material.uniforms.uTransitionOpacity.value = lod.detailOpacity * flightTransitionState.opacity;

                coronaMesh.material.uniforms.uColor.value.copy(_starBaseColor);
                coronaMesh.material.uniforms.uActivity.value = params.activity;
                coronaMesh.material.uniforms.uSeed.value = params.seed;
                coronaMesh.material.uniforms.uTime.value = effectiveTime;
                coronaMesh.material.uniforms.uTransitionOpacity.value = lod.detailOpacity * flightTransitionState.opacity;
            }
        } else {
            detailGroup.visible = false;
        }
    } else {
        detailGroup.visible = false;
    }

    // Scale focus ring dynamically so it acts as a permanent HUD locator beacon when zoomed out
    if (focusRing && focusRing.visible) {
        let isDetailActive = false;
        if (currentSelectedStarIndex >= 0 && detailGroup.visible) {
            let distToTarget = camera.position.distanceTo(focusRing.position);
            let lod = calculateDetailLOD(distToTarget, camera.fov, window.innerHeight);
            if (lod.visible && lod.detailOpacity > 0.01) {
                isDetailActive = true;
            }
        }

        focusRing.lookAt(camera.position);
        let dist = camera.position.distanceTo(focusRing.position);
        let scale = calculateReticleScale(dist, camera.fov, window.innerHeight, 36, 4.0);
        focusRing.scale.set(scale, scale, scale);

        let op = calculateReticleOpacity(dist);
        if (isDetailActive) {
            op = 0.0;
        }
        applyMaterialOpacity(focusRing.material, 0.38 * flightTransitionState.opacity * op);
    }

    if (pathLine) {
        let pathDist = camera.position.distanceTo(controls.target);
        let pathOp = calculateRouteOpacity(pathDist);
        pathLine.material.uniforms.uGlobalOpacity.value = 0.8 * flightTransitionState.opacity * pathOp;
        pathLine.material.uniforms.uTime.value = now * 0.001;

        const commIdx = committedHopIndex;
        const currIdx = currentHopIndex >= 0 ? currentHopIndex : committedHopIndex;
        const commProg = commIdx >= 0 && commIdx < hopToMarkerProgress.length && hopToMarkerProgress[commIdx] >= 0 ? hopToMarkerProgress[commIdx] : 0.0;
        const currProg = currIdx >= 0 && currIdx < hopToMarkerProgress.length && hopToMarkerProgress[currIdx] >= 0 ? hopToMarkerProgress[currIdx] : 0.0;

        let actStartProg = commProg;
        let actEndProg = currProg;
        if (actStartProg > actEndProg) {
            const tmp = actStartProg;
            actStartProg = actEndProg;
            actEndProg = tmp;
        }

        pathLine.material.uniforms.uCommittedProgress.value = commProg;
        pathLine.material.uniforms.uActiveStartProgress.value = actStartProg;
        pathLine.material.uniforms.uActiveEndProgress.value = actEndProg;
    }

    controls.update();

    if (starsPoints && starsPoints.material && starsPoints.material.uniforms.uFov) {
        starsPoints.material.uniforms.uFov.value = camera.fov;
        starsPoints.material.uniforms.uViewportHeight.value = window.innerHeight;
    }

    if (instancedStarsMesh && starData && starData.length > 0) {
        
        if (closestStars.length === 0) {
            for (let k = 0; k < 500; k++) closestStars.push({ i: 0, distSq: 0, s: null });
        }
        let closestCount = 0;
        const cx = camera.position.x;
        const cy = camera.position.y;
        const cz = camera.position.z;
        const radiiArr = starsGeometry.attributes.radius.array;

        for (let i = 0; i < starData.length; i++) {
            const s = starData[i];
            if (!s.n || s.n === "Sol" || s.n.startsWith("GAL-")) continue;
            const dx = s.x - cx;
            const dy = s.y - cy;
            const dz = s.z - cz;
            const distSq = dx*dx + dy*dy + dz*dz;
            if (distSq < 100.0 && closestCount < 500) { // 10pc radius
                const item = closestStars[closestCount++];
                item.i = i;
                item.distSq = distSq;
                item.s = s;
            }
        }
        // Selection sort for top 64
        const count = Math.min(closestCount, maxInstancedStars);
        for (let k = 0; k < count; k++) {
            let minIdx = k;
            for (let m = k + 1; m < closestCount; m++) {
                if (closestStars[m].distSq < closestStars[minIdx].distSq) {
                    minIdx = m;
                }
            }
            if (minIdx !== k) {
                const tmpI = closestStars[k].i;
                const tmpD = closestStars[k].distSq;
                const tmpS = closestStars[k].s;
                closestStars[k].i = closestStars[minIdx].i;
                closestStars[k].distSq = closestStars[minIdx].distSq;
                closestStars[k].s = closestStars[minIdx].s;
                closestStars[minIdx].i = tmpI;
                closestStars[minIdx].distSq = tmpD;
                closestStars[minIdx].s = tmpS;
            }
        }
        instancedStarsMesh.count = count;

        const instColor = instancedStarsMesh.geometry.attributes.instColor;
        const instLimb = instancedStarsMesh.geometry.attributes.instLimb;
        const instActivity = instancedStarsMesh.geometry.attributes.instActivity;
        const instSeed = instancedStarsMesh.geometry.attributes.instSeed;
        const instOpacity = instancedStarsMesh.geometry.attributes.instOpacity;

        const time = performance.now() * 0.001;
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const effectiveTime = calculateReducedMotionTime(time, reducedMotion);
        instancedStarsMesh.material.uniforms.uTime.value = effectiveTime;

        let selectedNodePos = null;
        if (currentSelectedStarIndex >= 0 && detailGroup.visible) {
            selectedNodePos = targetNode;
        }

        for (let j = 0; j < count; j++) {
            const item = closestStars[j];
            const s = item.s;
            const dist = Math.sqrt(item.distSq);
            
            // Skip rendering instanced sphere if it is the currently selected detail star
            let isSelectedDetailed = false;
            if (selectedNodePos) {
                const sdistSq = (s.x - selectedNodePos.x)**2 + (s.y - selectedNodePos.y)**2 + (s.z - selectedNodePos.z)**2;
                if (sdistSq < 0.0001) isSelectedDetailed = true;
            }

            // Crossfade band ends at 9.5pc, comfortably inside the 10pc working-set
            // radius above, so a sphere is already fully faded out (opacity 0) by the
            // time it enters or leaves the set — no hard pop at the set boundary.
            const lod = calculateDetailLOD(dist, camera.fov, window.innerHeight, 9.5, 3.0, _scratchLod);

            // Drive size by detailScale (a pixel-aware scale that resolves the sphere
            // in at a stable projected size and grows it gently to full radius) rather
            // than opacity, so spheres ease in cinematically instead of inflating from
            // zero. Opacity below carries the actual crossfade against the points.
            const r = radiiArr[item.i] * lod.detailScale;
            dummyObj.position.set(s.x, s.y, s.z);
            dummyObj.scale.set(r, r, r);
            dummyObj.updateMatrix();
            instancedStarsMesh.setMatrixAt(j, dummyObj.matrix);
            const params = getPhotosphereParams(s.s, s.x + s.y + s.z, _scratchPhoto);

             _starBaseColor.set(params.baseColor);
            instColor.setXYZ(j, _starBaseColor.r, _starBaseColor.g, _starBaseColor.b);
            instLimb.setX(j, params.limbDarkening);
            instActivity.setX(j, params.activity);
            instSeed.setX(j, params.seed);
            
            let finalOpacity = lod.detailOpacity * flightTransitionState.opacity;
            if (isSelectedDetailed) finalOpacity = 0.0;
            instOpacity.setX(j, finalOpacity);
        }

        if (count > 0) {
            instancedStarsMesh.instanceMatrix.needsUpdate = true;
            instColor.needsUpdate = true;
            instLimb.needsUpdate = true;
            instActivity.needsUpdate = true;
            instSeed.needsUpdate = true;
            instOpacity.needsUpdate = true;
        }
    }

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

// Home button (floating search): reset to overview search mode.
function handleHomeSearchClick() {
    appMode = 'SEARCH';
    globalThis.appMode = 'SEARCH';
    const sd = document.getElementById('star-details');
    if (sd) sd.classList.add('hidden');
    document.getElementById('ui-panel').classList.add('hidden');
    document.getElementById('floating-search').classList.remove('hidden');
    if (typeof finishFlightTransition === 'function') finishFlightTransition(false);
    if (typeof exitMapMode === 'function') exitMapMode(false);
    if (typeof zoomToOverviewPreserveDirection === 'function') zoomToOverviewPreserveDirection();
    document.getElementById('star-search').focus();
}

// Back button (directions panel): return to search mode from the route panel.
function handleSearchModeClick() {
    appMode = 'SEARCH';
    globalThis.appMode = 'SEARCH';
    const sd = document.getElementById('star-details');
    if (sd) sd.classList.add('hidden');
    const uiPanel = document.getElementById('ui-panel');
    uiPanel.classList.add('hidden');
    uiPanel.setAttribute('aria-hidden', 'true');
    uiPanel.setAttribute('inert', 'true');
    const floatingSearch = document.getElementById('floating-search');
    floatingSearch.classList.remove('hidden');
    floatingSearch.removeAttribute('aria-hidden');
    floatingSearch.removeAttribute('inert');
    if (typeof finishFlightTransition === 'function') finishFlightTransition(false);
    if (typeof exitMapMode === 'function') exitMapMode(false);
    document.getElementById('star-search').focus();
}

document.addEventListener('DOMContentLoaded', () => {
    const homeSearchBtn = document.getElementById('btn-home-search');
    if (homeSearchBtn) homeSearchBtn.addEventListener('click', handleHomeSearchClick);
    const searchModeBtn = document.getElementById('btn-search-mode');
    if (searchModeBtn) searchModeBtn.addEventListener('click', handleSearchModeClick);
});

// Init
loadStars();
animate();
