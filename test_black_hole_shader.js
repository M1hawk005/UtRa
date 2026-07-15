const fs = require('fs');
const assert = require('assert');

function stripComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const source = stripComments(fs.readFileSync(__dirname + '/public/app.js', 'utf8'));
const start = source.indexOf('const blackHoleGeometry');
const end = source.indexOf('scene.userData.blackHoleMat = blackHoleMaterial;', start);
assert.ok(start >= 0 && end > start, 'black-hole renderer should have an isolated production block');
const block = source.slice(start, end);
const vertexShader = block.match(/vertexShader\s*:\s*`([\s\S]*?)`\s*,\s*fragmentShader/);
const fragmentShader = block.match(/fragmentShader\s*:\s*`([\s\S]*?)`\s*,\s*transparent/);
assert.ok(vertexShader && fragmentShader, 'black-hole vertex and fragment stages must remain inspectable');
const vertexSource = vertexShader[1];
const fragmentSource = fragmentShader[1];

assert.match(block, /new THREE\.SphereGeometry\s*\(/, 'black hole must use a bounded volume proxy');
assert.doesNotMatch(block, /PlaneGeometry|SpriteMaterial|PointsMaterial/, 'black hole must not regress to a plane or giant sprite');
assert.match(block, /side\s*:\s*THREE\.BackSide/, 'proxy exit surface must remain camera-inside safe');
assert.match(block, /depthWrite\s*:\s*true/, 'opaque lensed proxy must establish stable depth and avoid self-overdraw artifacts');
assert.match(block, /premultipliedAlpha\s*:\s*true/, 'accumulated disk radiance must use premultiplied-alpha blending');

for (const uniform of ['uTime', 'uWorldToLocal', 'uLocalToWorldDirection', 'uSkyWorldToLocal', 'uSkyTexture', 'uSchwarzschildRadius', 'uLodFactor', 'uTransitionOpacity']) {
    assert.match(block, new RegExp(`\\b${uniform}\\b`), `black-hole block must wire ${uniform}`);
}
assert.match(vertexSource, /\bmodelMatrix\b/, 'modelMatrix may be used in the vertex stage');
assert.doesNotMatch(fragmentSource, /\bmodelMatrix\b/, 'fragment stage must not reference unavailable modelMatrix');
assert.match(fragmentSource, /uLocalToWorldDirection\s*\*\s*rayDirection/, 'escaped local rays must use the explicit local-to-world direction uniform');
assert.match(block, /cameraLocal\s*=\s*\(\s*uWorldToLocal\s*\*\s*vec4\s*\(\s*cameraPosition/, 'camera origin must be reconstructed in black-hole local coordinates');
assert.match(block, /vWorldPosition|vLocalPosition/, 'proxy shader must reconstruct a per-fragment camera ray');

const stepDefine = block.match(/#define\s+MAX_LENS_STEPS\s+(\d+)/);
const loop = block.match(/for\s*\(\s*int\s+\w+\s*=\s*0\s*;\s*\w+\s*<\s*(?:MAX_LENS_STEPS|(\d+))/);
assert.ok(loop, 'lensing shader must have a statically bounded integration loop');
const stepCount = Number(loop[1] || (stepDefine && stepDefine[1]));
assert.ok(stepCount >= 40 && stepCount <= 50, 'lensing integration must stay within the 40-50 step budget');
assert.match(block, /break\s*;/, 'integration must early-exit');
assert.match(block, /r\s*<=\s*1\.0|r\s*<\s*1\.0/, 'rays crossing the event horizon must terminate');
assert.match(block, /escaped[\s\S]*(?:break|texture2D)/, 'escaped rays must take a bounded background path');
assert.doesNotMatch(fragmentSource, /previousZ\s*\*\s*nextPosition\.z\s*<=\s*0\.0/, 'exact in-plane rays must not repeatedly trigger a zero-thickness surface crossing');
assert.match(fragmentSource, /diskHalfThickness\s*=\s*[\d.]+/, 'disk integration must define a finite thin vertical scale');
assert.match(fragmentSource, /verticalDensity\s*=[^;]*exp\s*\(/, 'disk integration must use a bounded vertical density profile');
assert.match(fragmentSource, /opticalDepth\s*=\s*[^;]*verticalDensity[^;]*stepLength/, 'disk opacity must scale with density and traversed step length');
assert.match(fragmentSource, /layerOpacity\s*=\s*1\.0\s*-\s*exp\s*\(\s*-opticalDepth\s*\)/, 'per-step absorption must use bounded Beer-Lambert optical depth');
assert.match(block, /1\.5/, 'photon-ring response must be concentrated near the critical orbit');

assert.match(block, /gamma[\s\S]*dot\s*\([\s\S]*directionToObserver[\s\S]*pow\s*\(\s*doppler\s*,\s*3\.0\s*\)/, 'disk brightness must include view-dependent relativistic beaming');
assert.match(block, /gravitationalRedshift/, 'inner disk must include gravitational-redshift attenuation');
assert.match(block, /fbm\s*\(/, 'disk emissivity must include bounded turbulence');
assert.doesNotMatch(block, /sin\s*\(\s*(?:angle|azimuth)\s*\*/, 'disk texture must not construct radial angle spokes');
assert.match(block, /texture2D\s*\(\s*uSkyTexture/, 'escaped bent rays must sample the available sky texture');
assert.match(fragmentSource, /(?:minimumRadius|totalDeflection)[\s\S]*lensInfluence\s*=/, 'lens influence must derive from ray impact or accumulated deflection');
const influenceFade = fragmentSource.match(/lensInfluence\s*=\s*1\.0\s*-\s*smoothstep\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*minimumRadius\s*\)/);
assert.ok(influenceFade, 'lens influence must use a smooth minimum-radius fade');
assert.ok(Number(influenceFade[1]) < Number(influenceFade[2]), 'lens influence fade must have a nonzero smooth interval');
assert.ok(Number(influenceFade[2]) < 8.0, 'lens influence must reach zero well before the 8.5-radius proxy boundary');
assert.match(fragmentSource, /background\s*=\s*texture2D\s*\([\s\S]*?\)\.rgb\s*\*\s*lensInfluence/, 'sampled sky radiance must be weighted by lens influence');
assert.match(fragmentSource, /rayOpacity\s*=\s*captured\s*\?\s*1\.0\s*:\s*1\.0\s*-\s*\(\s*1\.0\s*-\s*opacity\s*\)\s*\*\s*\(\s*1\.0\s*-\s*max\s*\(\s*photonRing\s*,\s*lensInfluence\s*\)\s*\)/, 'disk and lens/ring coverage must use an energy-conserving overlay while captured rays stay opaque');
assert.doesNotMatch(fragmentSource, /rayOpacity\s*=\s*captured\s*\?\s*1\.0\s*:\s*smoothstep\s*\(\s*0\.0\s*,\s*0\.18\s*,\s*uLodFactor\s*\)/, 'unaffected escaped rays must not receive full-proxy LOD alpha');
assert.match(fragmentSource, /if\s*\(\s*finalOpacity\s*<\s*0\.003\s*\)\s*discard/, 'zero-influence escaped rays must discard instead of writing the proxy shell');
assert.match(fragmentSource, /finalOpacity\s*=\s*uTransitionOpacity\s*\*\s*rayOpacity/, 'all retained rays must preserve transition opacity');
assert.match(fragmentSource, /background\s*\*\s*\(\s*1\.0\s*-\s*opacity\s*\)\s*\+\s*accumulated/, 'escaped sky and emissive disk arcs must remain composited');
assert.match(fragmentSource, /gl_FragColor\s*=\s*vec4\s*\(\s*finalColor\s*\*\s*uTransitionOpacity\s*,\s*finalOpacity\s*\)/, 'premultiplied RGB and alpha must share transition opacity');

assert.match(block, /renderOrder\s*=\s*-?\d+(?:\.\d+)?/, 'black-hole proxy must have deterministic transparent-object ordering');

const animateStart = source.indexOf('function animate()');
const animateEnd = source.indexOf('// Handle Resize', animateStart);
const animateBlock = source.slice(animateStart, animateEnd);
assert.match(animateBlock, /calculateBlackHoleLod\s*\(/, 'animation must update apparent-size LOD');
assert.match(animateBlock, /uLodFactor\.value\s*=[^;]*smooth|uLodFactor\.value\s*=[^;]*blackHoleLod/, 'LOD must flow continuously to the shader');
assert.match(animateBlock, /uTransitionOpacity\.value\s*=[^;]*flightTransitionState\.opacity/, 'black-hole LOD must compose with existing transition opacity');
assert.match(animateBlock, /uLocalToWorldDirection\.value\.setFromMatrix4\s*\(\s*scene\.userData\.blackHole\.matrixWorld\s*\)/, 'local-to-world direction uniform must update from matrixWorld without allocation');

console.log('GREEN: bounded Sagittarius A* lensing shader source tests passed.');
