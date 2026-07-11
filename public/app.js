// Scene Setup
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.00002); // Reduced fog density for galactic scales

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 50000); // Increased far plane to see galaxy
camera.position.set(-947, -6638, -2465); // Will be updated when stars load, but initial position near galaxy

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
// Important for additive blending glow
renderer.setClearColor(0x000000, 1);
document.getElementById('canvas-container').appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Variables
let starsGeometry;
let starsPoints;
let pathLine;
let pathNodes; // HUD overlay for path nodes
let starData = [];
let galacticCenter = new THREE.Vector3();
let focusRing; // Tactical ring to highlight selected star

function createNebulae() {
    const numRegions = 20;
    const particlesPerRegion = 800;
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
        new THREE.Color(0xff3366), // H-alpha red
        new THREE.Color(0xff4488), // H-alpha pink
        new THREE.Color(0x33ccff), // O-III cyan
        new THREE.Color(0xcc2266)  // S-II deep red
    ];

    let offset = 0;
    
    for (let r = 0; r < numRegions; r++) {
        let d = 3000 + Math.random() * 8000;
        let thetaSpiral = Math.log(d / aConst) / bConst;
        let armIdx = r % arms;
        
        if (Math.random() < 0.5) armIdx = Math.random() < 0.5 ? 0 : 1; // concentrate slightly on 0 and 1
        let armOffset = armIdx * (Math.PI * 2 / arms);
        let finalAngle = thetaSpiral + armOffset - 0.08; // offset towards inner edge
        
        const cx = Math.cos(finalAngle) * d;
        const cy = Math.sin(finalAngle) * d;
        const regionColor = colors[Math.floor(Math.random() * colors.length)];
        const extent = 200 + Math.random() * 600; 
        
        const f1 = Math.random() * 3.0;
        const f2 = Math.random() * 3.0;
        const phase1 = Math.random() * Math.PI * 2;
        const phase2 = Math.random() * Math.PI * 2;

        for (let i = 0; i < particlesPerRegion; i++) {
            let t = (i / particlesPerRegion) * Math.PI * 2;
            let dx = Math.sin(t * f1 + phase1) * extent * 0.5 + (Math.random() - 0.5) * extent * 0.2;
            let dy = Math.cos(t * f2 + phase2) * extent * 0.5 + (Math.random() - 0.5) * extent * 0.2;
            let dz = (Math.random() - 0.5) * 150; 
            
            nPos[(offset + i) * 3] = cx + dx;
            nPos[(offset + i) * 3 + 1] = cy + dy;
            nPos[(offset + i) * 3 + 2] = dz;
            
            let distToCenter = Math.sqrt(dx*dx + dy*dy + dz*dz) / (extent * 0.7);
            const edgeFactor = Math.min(1.0, distToCenter);
            const pColor = regionColor.clone().lerp(new THREE.Color(0xffffff), Math.random() * 0.2); 
            
            nCol[(offset + i) * 3] = pColor.r;
            nCol[(offset + i) * 3 + 1] = pColor.g;
            nCol[(offset + i) * 3 + 2] = pColor.b;
            nSize[offset + i] = 300 + Math.random() * 500;
            nAlpha[offset + i] = Math.max(0.1, 1.0 - edgeFactor);
        }
        offset += particlesPerRegion;
    }
    
    const nGeo = new THREE.BufferGeometry();
    nGeo.setAttribute('position', new THREE.BufferAttribute(nPos, 3));
    nGeo.setAttribute('customColor', new THREE.BufferAttribute(nCol, 3));
    nGeo.setAttribute('size', new THREE.BufferAttribute(nSize, 1));
    nGeo.setAttribute('alphaMask', new THREE.BufferAttribute(nAlpha, 1));
    
    const nMat = new THREE.ShaderMaterial({
        vertexShader: `
            attribute float size;
            attribute vec3 customColor;
            attribute float alphaMask;
            varying vec3 vColor;
            varying float vAlpha;
            varying vec2 vUvOffset;
            void main() {
                vColor = customColor;
                vAlpha = alphaMask;
                vUvOffset = position.xy * 0.05;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                float distance = -mvPosition.z;
                gl_PointSize = size * (3000.0 / distance);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            varying float vAlpha;
            varying vec2 vUvOffset;
            
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
                
                float glow = pow(1.0 - (dist * 2.0), 2.0);
                vec2 p = (gl_PointCoord.xy * 5.0) + vUvOffset;
                float n = fbm(p);
                float finalAlpha = glow * n * vAlpha * 2.5; 
                
                gl_FragColor = vec4(vColor * finalAlpha, finalAlpha);
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

    const bhGeometry = new THREE.PlaneGeometry(1500, 1500);
    const bhMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0.0 },
            color: { value: new THREE.Color(0xff8833) }
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
            uniform vec3 color;
            varying vec2 vUv;
            void main() {
                vec2 uv = vUv - 0.5;
                float r = length(uv);
                if (r > 0.5) discard;
                
                float angle = atan(uv.y, uv.x) + r * 30.0 - time * 5.0;
                float spiral = sin(angle * 12.0) * 0.5 + 0.5;
                
                if (r < 0.03) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                } else {
                    float intensity = pow(1.0 - (r * 2.0), 3.0) * spiral;
                    gl_FragColor = vec4(color * intensity * 2.5, intensity);
                }
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

    const bulgeCount = 15000;
    const diskCount = 150000;
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
        let r = -800 * Math.log(Math.max(0.0001, 1 - Math.random()));
        let theta = Math.random() * Math.PI * 2;
        let phi = Math.acos((Math.random() * 2) - 1);
        
        let x = r * Math.sin(phi) * Math.cos(theta);
        let y = r * Math.sin(phi) * Math.sin(theta);
        let z = r * Math.cos(phi) * 0.6; 
        
        let isNuclear = (Math.random() < 0.1 && r < 300);
        let colR = 1.0, colG = 0.8, colB = 0.4;
        let size = 1.5 + Math.random() * 2.5;
        
        if (isNuclear) {
            colR = 1.0; colG = 0.9; colB = 0.7;
            size = 3.0 + Math.random() * 2.0;
        } else {
            let edge = Math.min(1.0, r / 2000);
            colG = 0.8 - edge * 0.3;
            colB = 0.4 - edge * 0.3;
        }
        
        if (r < 400) size *= 1.5;

        addGlowingParticle(x, y, z, colR, colG, colB, size);
    }

    // 2b. Spiral Arms (Thin & Thick Disk)
    const arms = 4;
    const pitchAngle = 12 * Math.PI / 180;
    const bConst = Math.tan(pitchAngle);
    const aConst = 1000;
    const maxR = 15000;
    
    function noiseVal(ang, rad) {
        return Math.sin(ang * 10 + rad * 0.002) * Math.cos(ang * 5 - rad * 0.001);
    }

    for (let i = 0; i < diskCount; i++) {
        let isThin = Math.random() < 0.8;
        let r = Math.pow(Math.random(), 1.5) * maxR; 
        
        let x, y, z;
        let rColor, gColor, bColor;
        let size = Math.random() * 1.5 + 0.5;

        if (isThin) {
            let thetaSpiral = Math.log(r / aConst) / bConst;
            let armIdx = i % arms;
            let armOffset = armIdx * (Math.PI * 2 / arms);
            
            if (Math.random() < 0.05) {
                armOffset += Math.PI * 2 / (arms * 2); // bridge
            }
            
            let isSpur = Math.random() < 0.18;
            if (isSpur) {
                thetaSpiral += (Math.random() * 0.5 + 0.2); // branching spur
            }

            let armWidth = 0.1 + (r / maxR) * 0.4;
            let n = noiseVal(thetaSpiral, r);
            let scatter = (Math.random() - 0.5) * armWidth * (1 + n * 0.5);
            let finalAngle = thetaSpiral + armOffset + scatter;
            
            x = r * Math.cos(finalAngle);
            y = r * Math.sin(finalAngle);
            z = (Math.random() - 0.5) * 2 * (80 + Math.random() * 70); // 80-150pc
            
            let mixR = r / maxR;
            if (mixR < 0.3) {
                rColor = 1.0; gColor = 1.0 - mixR; bColor = 0.8 + mixR*0.2;
            } else if (mixR < 0.7) {
                rColor = 1.0 - (mixR-0.3); gColor = 1.0; bColor = 1.0;
            } else {
                rColor = 0.6; gColor = 0.8; bColor = 1.0;
            }
            
        } else {
            let angle = Math.random() * Math.PI * 2;
            x = r * Math.cos(angle);
            y = r * Math.sin(angle);
            let scaleH = 600 + Math.random() * 400; // 600-1000pc
            z = (Math.random() > 0.5 ? 1 : -1) * -scaleH * Math.log(Math.max(0.0001, 1 - Math.random()));
            
            rColor = 1.0; gColor = 0.6 + Math.random()*0.2; bColor = 0.2 + Math.random()*0.2;
        }

        addGlowingParticle(x, y, z, rColor, gColor, bColor, size);
    }

    // 2c. Globular Clusters
    for (let i = 0; i < 120; i++) {
        let cr = 2000 + Math.random() * 10000;
        let cTheta = Math.random() * Math.PI * 2;
        let cPhi = Math.acos((Math.random() * 2) - 1);
        
        let cx = cr * Math.sin(cPhi) * Math.cos(cTheta);
        let cy = cr * Math.sin(cPhi) * Math.sin(cTheta);
        let cz = cr * Math.cos(cPhi);
        
        let clusterStars = 50 + Math.floor(Math.random() * 50);
        for(let j=0; j<clusterStars; j++) {
            let u1 = Math.max(0.0001, Math.random()); let u2 = Math.random();
            let z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
            let z1 = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);
            let z2 = Math.sqrt(-2.0 * Math.log(Math.max(0.0001, Math.random()))) * Math.cos(2.0 * Math.PI * Math.random());
            
            let spread = 5 + Math.random() * 10;
            let sx = cx + z0 * spread;
            let sy = cy + z1 * spread;
            let sz = cz + z2 * spread;
            
            let rColor, gColor, bColor;
            if (Math.random() < 0.05) {
                rColor = 0.5; gColor = 0.7; bColor = 1.0; 
            } else {
                rColor = 1.0; gColor = 0.8; bColor = 0.4;
            }
            
            let size = 1.5 + Math.random() * 2.0;
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
            void main() {
                vColor = customColor;
                vRand = fract(sin(dot(position.xyz, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                float distance = -mvPosition.z;
                gl_PointSize = size * (3000.0 / distance); 
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            varying float vRand;
            void main() {
                vec2 uv = gl_PointCoord.xy - vec2(0.5);
                float dist = length(uv);
                if (dist > 0.5) discard;
                float glow = exp(-dist * dist * 15.0);
                float sparkle = 0.8 + 0.4 * vRand;
                float haze = pow(1.0 - (dist * 2.0), 3.0) * 0.15;
                float finalAlpha = glow * sparkle + haze;
                gl_FragColor = vec4(vColor * finalAlpha, finalAlpha);
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
    const dustCount = 30000;
    const dPos = new Float32Array(dustCount * 3);
    const dCol = new Float32Array(dustCount * 3);
    const dSize = new Float32Array(dustCount);

    for (let i = 0; i < dustCount; i++) {
        let r = Math.pow(Math.random(), 1.5) * maxR; 
        let thetaSpiral = Math.log(r / aConst) / bConst;
        let armIdx = i % arms;
        let armOffset = armIdx * (Math.PI * 2 / arms);
        
        let armWidth = 0.05 + (r / maxR) * 0.2;
        let scatter = (Math.random() - 0.5) * armWidth;
        let finalAngle = thetaSpiral + armOffset + scatter - 0.05; // along inner edges
        
        dPos[i * 3] = r * Math.cos(finalAngle);
        dPos[i * 3 + 1] = r * Math.sin(finalAngle);
        dPos[i * 3 + 2] = (Math.random() - 0.5) * 2 * 60; // very thin, ~50-100pc
        
        dCol[i * 3] = 0.1;
        dCol[i * 3 + 1] = 0.05;
        dCol[i * 3 + 2] = 0.02; // dark brown
        
        dSize[i] = 10.0 + Math.random() * 20.0;
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
            void main() {
                vColor = customColor;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                float distance = -mvPosition.z;
                gl_PointSize = size * (3000.0 / distance); 
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            void main() {
                vec2 uv = gl_PointCoord.xy - vec2(0.5);
                float dist = length(uv);
                if (dist > 0.5) discard;
                float alpha = pow(1.0 - (dist * 2.0), 1.5) * 0.85;
                gl_FragColor = vec4(vColor, alpha);
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
}

// GLSL Procedural Sun Shader replaces static canvas texture
const vertexShader = `
    attribute float size;
    attribute vec3 customColor;
    varying vec3 vColor;
    varying vec3 vPosition;
    void main() {
        vColor = customColor;
        vPosition = position;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        
        // Scale down size so stars don't look overly huge
        float distance = -mvPosition.z;
        float scaledSize = size * (200.0 / distance);
        gl_PointSize = clamp(scaledSize, 1.5, 120.0);
        
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const fragmentShader = `
    uniform vec3 color;
    varying vec3 vColor;
    varying vec3 vPosition;

    // Fast GLSL Pseudo-Random Noise
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
        
        float bodyRadius = 0.35;
        vec3 finalColor = vec3(0.0);
        float alpha = 1.0;

        if (dist < bodyRadius) {
            // Solar Granulation Surface
            // Use vPosition to offset noise so every star looks unique!
            vec2 p = (uv * 15.0) + vPosition.xy * 0.1; 
            float n = fbm(p);
            
            // Limb darkening
            float limb = 1.0 - (dist / bodyRadius);
            limb = pow(limb, 0.4); 
            
            finalColor = color * vColor * (0.5 + n * 0.8) * limb;
        } else {
            // Corona Glow
            float glow = 1.0 - ((dist - bodyRadius) / (0.5 - bodyRadius));
            glow = pow(glow, 2.5);
            finalColor = color * vColor * glow;
            alpha = glow;
            if (alpha < 0.02) discard;
        }
        
        gl_FragColor = vec4(finalColor, alpha);
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



// Load Stars
async function loadStars() {
    try {
        initGalaxy(); // Spawn the Milky Way
        createNebulae(); // Spawn nebula clouds
        
        const res = await fetch('/api/stars');
        starData = await res.json();

        // Procedurally generate galaxy-wide stars using the same spiral arm distribution as initGalaxy
        const arms = 4;
        const armSpread = 0.6;
        const radius = 15000;
        const fakeStarCount = 30000;
        const spectralClasses = ['O', 'B', 'A', 'F', 'G', 'K', 'M'];

        for (let i = 0; i < fakeStarCount; i++) {
            const d = Math.pow(Math.random(), 2.5) * radius;
            const angle = d * 0.0006;
            const armOffset = (i % arms) * (Math.PI * 2 / arms);
            const scatter = (Math.random() - 0.5) * (d * armSpread + 50);
            const finalAngle = angle + armOffset + scatter;
            const thickness = (1.0 - (d / radius)) * 600;
            let z = (Math.random() - 0.5) * thickness;
            const x = Math.cos(finalAngle) * d + galacticCenter.x;
            const y = Math.sin(finalAngle) * d + galacticCenter.y;
            z = z + galacticCenter.z;

            starData.push({
                n: "GAL-" + String(i).padStart(5, '0'),
                x: x,
                y: y,
                z: z,
                s: spectralClasses[Math.floor(Math.random() * spectralClasses.length)],
                m: Math.random() * 10 + 5
            });
        }

        starsGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(starData.length * 3);
        const colors = new Float32Array(starData.length * 3);
        const sizes = new Float32Array(starData.length);

        for (let i = 0; i < starData.length; i++) {
            const s = starData[i];
            positions[i * 3] = s.x;
            positions[i * 3 + 1] = s.y;
            positions[i * 3 + 2] = s.z;

            let col = getSpectralColor(s.s);
            if (s.n === "Sol") {
                col = new THREE.Color(0xffff00); // Highlight sol
            }

            colors[i * 3] = col.r;
            colors[i * 3 + 1] = col.g;
            colors[i * 3 + 2] = col.b;

            // Absolute Magnitude mapping: Lower magnitude = brighter/larger
            // Typical ranges: -10 (super bright) to +20 (faint)
            let mag = s.m;
            if (mag === undefined || mag === 0) mag = 5.0; 
            
            // Inverse mapping so smaller mag gives larger size
            let size = Math.max(1.0, 10.0 - mag);
            if (s.n === "Sol") size = 15.0; // Make Sol prominent
            sizes[i] = size;
        }

        starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        starsGeometry.setAttribute('customColor', new THREE.BufferAttribute(colors, 3));
        starsGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const shaderMaterial = new THREE.ShaderMaterial({
            uniforms: {
                color: { value: new THREE.Color(0xffffff) }
            },
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            blending: THREE.NormalBlending,
            depthTest: true,                
            depthWrite: true,
            transparent: true
        });

        starsPoints = new THREE.Points(starsGeometry, shaderMaterial);
        scene.add(starsPoints);

        controls.target.set(galacticCenter.x, galacticCenter.y, galacticCenter.z);
        camera.position.set(galacticCenter.x - 500, galacticCenter.y + 500, galacticCenter.z + 1500);

        // Auto-select a valid star for routing — only real catalog stars within jump range
        if (starData.length > 1) {
            let valid = false;
            for (let attempt = 0; attempt < 50 && !valid; attempt++) {
                let r = starData[Math.floor(Math.random() * starData.length)];
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

// Draw Path
function drawPath(hops) {
    if (pathLine) {
        scene.remove(pathLine);
        pathLine.geometry.dispose();
        pathLine.material.dispose();
    }
    if (pathNodes) {
        scene.remove(pathNodes);
        pathNodes.geometry.dispose();
        pathNodes.material.dispose();
    }

    const points = [];
    for (let hop of hops) {
        const star = starData.find(s => s.n === hop.name || s.n.startsWith(hop.name + " ") || hop.name.startsWith(s.n + " "));
        if (star) {
            points.push(new THREE.Vector3(star.x, star.y, star.z));
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
        opacity: 0.8
    });

    pathLine = new THREE.Line(geometry, material);
    pathLine.computeLineDistances(); // Required for dashed material
    scene.add(pathLine);

    // Add HUD nodes so the trajectory remains visible from galactic scale
    const nodesGeo = new THREE.BufferGeometry().setFromPoints(points);
    const nodesMat = new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(0x00ffff) } },
        vertexShader: `
            void main() {
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                float distance = -mvPosition.z;
                // Clamping min size to 8.0px ensures the route is ALWAYS visible from the edge of the galaxy!
                gl_PointSize = clamp(2000.0 / distance, 8.0, 50.0); 
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 color;
            void main() {
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

    if (points.length > 0) {
        const p = points[0];
        camera.position.set(p.x + 50, p.y + 50, p.z + 50);
        controls.target.copy(p);
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
        
        document.getElementById('res-dist').innerText = data.total_dist_pc.toFixed(2);
        document.getElementById('res-obs').innerText = data.total_obs_time.toFixed(2);
        document.getElementById('res-ship').innerText = data.total_ship_time.toFixed(2);

        const list = document.getElementById('hop-list');
        list.innerHTML = '';
        data.hops.forEach((hop, i) => {
            const li = document.createElement('li');
            li.style.cursor = 'pointer';
            li.title = "Click to Lock Camera";
            li.innerHTML = `<span>[${String(i+1).padStart(2, '0')}] ${hop.name.toUpperCase()}</span> <span>${hop.dist_pc > 0 ? '+' + hop.dist_pc.toFixed(2) + ' PC' : ''}</span>`;
            li.onclick = () => {
                const s = starData.find(x => x.n === hop.name || x.n.startsWith(hop.name) || hop.name.startsWith(x.n));
                if (s) flyToStar(s.x, s.y, s.z);
            };
            list.appendChild(li);
        });

        sucDiv.classList.remove('hidden');
        drawPath(data.hops);
        
        // Fly to start node
        if (data.hops.length > 0) {
            const s = starData.find(x => x.n === data.hops[0].name || x.n.startsWith(data.hops[0].name));
            if (s) flyToStar(s.x, s.y, s.z);
        }

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
});

// Drag Logic
const header = document.getElementById('panel-header');
let isDragging = false;
let offsetX = 0;
let offsetY = 0;

header.addEventListener('mousedown', (e) => {
    if(e.target === toggleBtn) return;
    isDragging = true;
    const rect = panel.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
});

document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    // Keep panel within screen bounds mostly
    let x = e.clientX - offsetX;
    let y = e.clientY - offsetY;
    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
});

document.addEventListener('mouseup', () => {
    isDragging = false;
});

// Star Interaction and Flight Logic
let targetNode = new THREE.Vector3(0, 0, 0);
let camTargetNode = new THREE.Vector3(0, 100, 300);
let isFlying = false;

function flyToStar(x, y, z) {
    targetNode.set(x, y, z);
    camTargetNode.set(x + 20, y + 20, z + 40);
    isFlying = true;
    
    if (focusRing) {
        focusRing.position.set(x, y, z);
        focusRing.visible = true;
    }
}

// Raycaster Tooltip
const raycaster = new THREE.Raycaster();
raycaster.params.Points.threshold = 1.5;

const tooltip = document.createElement('div');
tooltip.style.position = 'absolute';
tooltip.style.background = 'rgba(10, 10, 15, 0.9)';
tooltip.style.border = '1px solid var(--neon-cyan)';
tooltip.style.color = '#fff';
tooltip.style.padding = '10px';
tooltip.style.pointerEvents = 'none';
tooltip.style.display = 'none';
tooltip.style.fontFamily = 'var(--font-mono)';
tooltip.style.zIndex = '1000';
tooltip.style.textTransform = 'uppercase';
document.body.appendChild(tooltip);

window.addEventListener('click', (e) => {
    if (e.target.closest('#ui-panel')) return;
    
    const mouse = new THREE.Vector2();
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObject(starsPoints);
    if (intersects.length > 0) {
        const idx = intersects[0].index;
        const star = starData[idx];
        
        tooltip.style.display = 'block';
        tooltip.style.left = e.clientX + 15 + 'px';
        tooltip.style.top = e.clientY + 15 + 'px';
        tooltip.innerHTML = `<strong style="color:var(--neon-cyan)">${star.n || 'UNKNOWN'}</strong><br>Spec: ${star.s}<br>Mag: ${star.m}`;

        flyToStar(star.x, star.y, star.z);
    } else {
        tooltip.style.display = 'none';
    }
});

// Animation Loop
function animate() {
    requestAnimationFrame(animate);
    
    if (scene.userData.blackHoleMat) {
        scene.userData.blackHoleMat.uniforms.time.value += 0.01;
    }
    if (scene.userData.galaxyMesh) {
        scene.userData.galaxyMesh.rotation.z -= 0.0002;
    }
    if (scene.userData.nebulaMesh) {
        scene.userData.nebulaMesh.rotation.z -= 0.0002;
    }
    
    if (isFlying) {
        controls.target.lerp(targetNode, 0.05);
        camera.position.lerp(camTargetNode, 0.05);
        if (controls.target.distanceTo(targetNode) < 1.0) {
            isFlying = false;
        }
    }
    
    // Scale focus ring dynamically so it acts as a permanent HUD locator beacon when zoomed out
    if (focusRing && focusRing.visible) {
        focusRing.lookAt(camera.position);
        let dist = camera.position.distanceTo(focusRing.position);
        let scale = Math.max(1.0, dist / 80.0);
        focusRing.scale.set(scale, scale, scale);
    }
    
    controls.update();
    renderer.render(scene, camera);
}

// Handle Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Init
loadStars();
animate();
