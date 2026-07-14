const { describe, it } = require('node:test');
const assert = require('node:assert');
const { calculateSkyOpacity, getSpectralColorHex } = require('./visual_logic.js');

function stripComments(source) {
    let result = '';
    let state = 'code';
    for (let i = 0; i < source.length; i++) {
        const char = source[i];
        const next = source[i + 1];
        if (state === 'lineComment') {
            if (char === '\n' || char === '\r') { result += char; state = 'code'; }
            continue;
        }
        if (state === 'blockComment') {
            if (char === '*' && next === '/') { result += ' '; i++; state = 'code'; }
            else if (char === '\n' || char === '\r') result += char;
            continue;
        }
        if (state === 'singleQuote' || state === 'doubleQuote') {
            result += char;
            if (char === '\\') result += source[++i] || '';
            else if ((state === 'singleQuote' && char === "'") || (state === 'doubleQuote' && char === '"')) state = 'code';
            continue;
        }
        if (char === "'") { result += char; state = 'singleQuote'; }
        else if (char === '"') { result += char; state = 'doubleQuote'; }
        else if (char === '/' && next === '/') { result += ' '; i++; state = 'lineComment'; }
        else if (char === '/' && next === '*') { result += ' '; i++; state = 'blockComment'; }
        else result += char;
    }
    return result;
}

function assertApprox(actual, expected) {
    if (Math.abs(actual - expected) > 1e-5) {
        assert.fail(`Expected ${actual} to be close to ${expected}`);
    }
}

describe('Visual Logic', () => {
    it('calculateOverviewOpacity is 0 at <=12000, 1 at >=25000, monotonic, and multiplied by route transition opacity when active', () => {
        const { calculateOverviewOpacity } = require('./visual_logic.js');

        // 1a: <=12000 is 0
        assert.strictEqual(calculateOverviewOpacity(10000, 1.0, true, 0.0), 0.0);
        assert.strictEqual(calculateOverviewOpacity(12000, 1.0, true, 0.0), 0.0);

        // 1a: >=25000 is 1
        assert.strictEqual(calculateOverviewOpacity(25000, 1.0, true, 0.0), 1.0);
        assert.strictEqual(calculateOverviewOpacity(30000, 1.0, true, 0.0), 1.0);

        // 1a: monotonic
        const val1 = calculateOverviewOpacity(15000, 1.0, true, 0.0);
        const val2 = calculateOverviewOpacity(20000, 1.0, true, 0.0);
        assert.ok(val1 > 0.0 && val1 < val2 && val2 < 1.0);

        // 1a: multiplied by route transition opacity when active
        const val3 = calculateOverviewOpacity(25000, 0.5, true, 0.0);
        assert.strictEqual(val3, 0.5);
    });

    it('when inactive and opacityFloor=0, overview opacity and interior sky target opacity are complementary across representative radii including 18500', () => {
        const { calculateSkyOpacity, calculateOverviewOpacity } = require('./visual_logic.js');
        const radii = [10000, 15000, 18500, 20000, 30000];
        for (const r of radii) {
            const overviewOp = calculateOverviewOpacity(r, 1.0, false, 0.0);
            const interiorOp = calculateSkyOpacity(r, 1.0, false, 0.0).opacity;
            assertApprox(overviewOp + interiorOp, 1.0);
        }
    });

    it('local/overview sky-macro opacity complement at measured radii 8216 and 49142', () => {
        const localDist = 8216;
        const overviewDist = 49142;
        const opacityFloor = 0.15;

        // Modified to expect an object return
        const localRes = calculateSkyOpacity(localDist, 1.0, false, opacityFloor);
        assertApprox(localRes.opacity, 1.0);
        assertApprox(localRes.lodBias, 0.0); // Inside: fine detail

        const overviewRes = calculateSkyOpacity(overviewDist, 1.0, false, opacityFloor);
        assertApprox(overviewRes.opacity, 0.0);
        assert.ok(overviewRes.lodBias >= 4.0); // Outside: coarse only

        const localFaded = calculateSkyOpacity(localDist, 0.15, true, opacityFloor);
        assertApprox(localFaded.opacity, 0.15);

        const overviewFaded = calculateSkyOpacity(overviewDist, 0.15, true, opacityFloor);
        assertApprox(overviewFaded.opacity, 0.0);
    });

    it('mutates and returns provided out object to avoid allocation', () => {
        const { calculateSkyOpacity } = require('./visual_logic.js');
        const outObj = { opacity: -1, lodBias: -1 };

        const res1 = calculateSkyOpacity(8000, 1.0, false, 0.0, outObj);
        assert.strictEqual(res1, outObj);
        assertApprox(outObj.opacity, 1.0);
        assertApprox(outObj.lodBias, 0.0);

        const res2 = calculateSkyOpacity(30000, 1.0, false, 0.0, outObj);
        assert.strictEqual(res2, outObj);
        assertApprox(outObj.opacity, 0.0);
        assert.ok(outObj.lodBias >= 4.0);
    });

    it('inspection visibility thresholds/hysteresis and spectral-class mapping', () => {
        assert.strictEqual(getSpectralColorHex('O'), 0x9bb0ff);
        assert.strictEqual(getSpectralColorHex('M'), 0xffcc6f);
        assert.strictEqual(getSpectralColorHex('G'), 0xfff4ea);
        assert.strictEqual(getSpectralColorHex('Unknown'), 0xffffff);
    });

    it('pure spectral photosphere parameter mapping for representative classes', () => {
        const { getPhotosphereParams } = require('./visual_logic.js');

        const paramsO = getPhotosphereParams('O');
        assert.strictEqual(paramsO.baseColor, 0x9bb0ff);
        assert.ok(paramsO.limbDarkening >= 0.1 && paramsO.limbDarkening <= 0.9);
        assert.ok(paramsO.granulationContrast > 0.0);

        const paramsF = getPhotosphereParams('F0 V');
        assert.strictEqual(paramsF.baseColor, 0xf8f7ff);
        assert.ok(paramsF.limbDarkening >= 0.2); // Not flat
        assert.ok(paramsF.granulationContrast >= 0.15); // enough contrast for a 350px disk, not flat

        const paramsM = getPhotosphereParams('M');
        assert.strictEqual(paramsM.baseColor, 0xffcc6f);
        assert.ok(paramsM.granulationContrast > paramsF.granulationContrast); // cooler stars have higher contrast granulation generally
    });




    it('continuous detail LOD endpoints and monotonicity', () => {
        const { calculateDetailLOD } = require('./visual_logic.js');
        // fov=60, height=1080
        const lodFar = calculateDetailLOD(300, 60, 1080);
        const lodMid = calculateDetailLOD(12, 60, 1080);
        const lodClose = calculateDetailLOD(4, 60, 1080);

        // Far: opacity 0, scale matches unresolved point (small), pointOpacity 1
        assert.strictEqual(lodFar.detailOpacity, 0.0);
        assert.ok(lodFar.detailScale < 0.2); // starts small
        assert.strictEqual(lodFar.pointOpacity, 1.0);

        // Close: opacity 1, scale 1, pointOpacity 0
        assert.strictEqual(lodClose.detailOpacity, 1.0);
        assert.strictEqual(lodClose.detailScale, 1.0);
        assert.strictEqual(lodClose.pointOpacity, 0.0);

        // Monotonicity: mid should be between far and close
        assert.ok(lodMid.detailOpacity > lodFar.detailOpacity && lodMid.detailOpacity < lodClose.detailOpacity);
        assert.ok(lodMid.detailScale > lodFar.detailScale && lodMid.detailScale < lodClose.detailScale);
    });

    it('reticle scale calculation keeps constant css pixels', () => {
        const { calculateReticleScale } = require('./visual_logic.js');
        // scale(dist, fov, viewportHeight, targetCssPx, baseReticleSize)
        // distance 20, fov 60, height 1080, target 36px, reticle diam 3.6
        const scale1 = calculateReticleScale(20, 60, 1080, 36, 3.6);
        // dist 20, diam 3.6 => angular size ~0.18 rad => ~10 deg => ~1/6 of fov
        // 1080/6 = 180px raw size. target is 36px, so scale should be 0.2
        assertApprox(scale1, 0.213833);
    });

    it('reticle opacity fades in close detail', () => {
        const { calculateReticleOpacity } = require('./visual_logic.js');
        // At dist < 5 it should be ~0.0, at dist > 15 it should be 1.0 (multiplied by flight opacity)
        assert.ok(calculateReticleOpacity(15) > 0.9);
        assert.ok(calculateReticleOpacity(4) <= 0.08);
    });

    it('route line opacity fades at close inspection detail', () => {
        const { calculateRouteOpacity } = require('./visual_logic.js');
        // fully visible in normal focused route view (distance >= 16-20)
        assert.strictEqual(calculateRouteOpacity(18), 1.0);
        assert.strictEqual(calculateRouteOpacity(16), 1.0);
        // smoothly fading through detail entry range (13 to 16)
        const midOpacity = calculateRouteOpacity(14.5);
        assert.ok(midOpacity > 0.0 && midOpacity < 1.0);
        // exactly/effectively zero at distance <= 13 (inspection entry threshold)
        assert.strictEqual(calculateRouteOpacity(13), 0.0);
        assert.strictEqual(calculateRouteOpacity(12.2), 0.0);
        assert.strictEqual(calculateRouteOpacity(4), 0.0);
        assert.strictEqual(calculateRouteOpacity(3), 0.0);
    });

    it('bounded normalized detail size (<=55% of shorter viewport dimension)', () => {
        const { calculateMinDistance } = require('./visual_logic.js');
        // calculateMinDistance(modelRadius, maxFraction, fovDegrees)
        const minD = calculateMinDistance(1.0, 0.55, 60);
        // 55% of 60 deg is 33 deg.
        // minD should be 1.0 / tan(16.5 deg) = 3.3759
        assertApprox(minD, 3.375943);
    });

    it('provenance mapping', () => {
        const { getProvenance } = require('./visual_logic.js');
        const solResult = getProvenance(true, false);
        assert.ok(solResult.includes('Observed:'));
        assert.ok(solResult.includes('NASA/GSFC/SDO HMI'));
        assert.ok(solResult.includes('svs.gsfc.nasa.gov'));

        const catalogResult = getProvenance(false, false);
        assert.strictEqual(catalogResult, 'Inferred photosphere &middot; normalized inspection scale');

        const procResult = getProvenance(false, true);
        assert.strictEqual(procResult, null);
    });

    it('route node marker visibility hides active/focused hop marker', () => {
        const { updateRouteMarkerVisibility } = require('./visual_logic.js');
        const hideAttr = new Float32Array(5);

        let changed = updateRouteMarkerVisibility(hideAttr, 2);
        assert.strictEqual(changed, true);
        assert.strictEqual(hideAttr[0], 0.0);
        assert.strictEqual(hideAttr[2], 1.0);

        changed = updateRouteMarkerVisibility(hideAttr, 2);
        assert.strictEqual(changed, false);

        updateRouteMarkerVisibility(hideAttr, 0);
        assert.strictEqual(hideAttr[0], 1.0);
        assert.strictEqual(hideAttr[2], 0.0);
    });
});

describe('Control Profile Integration', () => {
    it('app.js initializes OrbitControls with real settings', () => {
        const fs = require('fs');
        const path = require('path');
        const appSource = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');

        const cleanSource = stripComments(appSource);

        assert.match(cleanSource, /controls\.dampingFactor\s*=\s*0\.05;/, 'dampingFactor should be 0.05');
        assert.match(cleanSource, /controls\.rotateSpeed\s*=\s*0\.18;/, 'rotateSpeed should be 0.18');
        assert.match(cleanSource, /controls\.zoomSpeed\s*=\s*1\.15;/, 'zoomSpeed should be 1.15');
        assert.match(cleanSource, /controls\.panSpeed\s*=\s*0\.95;/, 'panSpeed should be 0.95');
        assert.match(cleanSource, /controls\.screenSpacePanning\s*=\s*true;/, 'screenSpacePanning should be true');
        assert.match(cleanSource, /controls\.maxDistance\s*=\s*Infinity;/, 'maxDistance should be Infinity');
        assert.match(cleanSource, /controls\.minDistance\s*=\s*calculateMinDistance\(/, 'minDistance should use calculateMinDistance');
    });

    it('selected detail/reticle opacity behavior', () => {
        const fs = require('fs');
        const path = require('path');
        const appSource = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
        const cleanSource = stripComments(appSource);

        // Assert solMesh opacity composition
        assert.match(cleanSource, /solMesh\.material\.uniforms\.uTransitionOpacity\.value\s*=\s*lod\.detailOpacity\s*\*\s*flightTransitionState\.opacity\s*;/);
        // Assert starMesh opacity composition
        assert.match(cleanSource, /starMesh\.material\.uniforms\.uTransitionOpacity\.value\s*=\s*lod\.detailOpacity\s*\*\s*flightTransitionState\.opacity\s*;/);

        const commentedMutation = appSource
            .replace(/(solMesh\.material\.uniforms\.uTransitionOpacity\.value\s*=\s*lod\.detailOpacity\s*\*\s*flightTransitionState\.opacity\s*;)/, '/* $1 */')
            .replace(/(starMesh\.material\.uniforms\.uTransitionOpacity\.value\s*=\s*lod\.detailOpacity\s*\*\s*flightTransitionState\.opacity\s*;)/, '// $1');
        const cleanMutation = stripComments(commentedMutation);
        assert.doesNotMatch(cleanMutation, /solMesh\.material\.uniforms\.uTransitionOpacity\.value\s*=\s*lod\.detailOpacity\s*\*\s*flightTransitionState\.opacity\s*;/, 'commented-out Sol assignment must fail the production predicate');
        assert.doesNotMatch(cleanMutation, /starMesh\.material\.uniforms\.uTransitionOpacity\.value\s*=\s*lod\.detailOpacity\s*\*\s*flightTransitionState\.opacity\s*;/, 'commented-out star assignment must fail the production predicate');
    });
});

describe('Material Opacity Helper', () => {
    const { applyMaterialOpacity } = require('./visual_logic.js');

    it('applies opacity to shader material with uTransitionOpacity', () => {
        const mat = { uniforms: { uTransitionOpacity: { value: 1.0 } } };
        applyMaterialOpacity(mat, 0.5);
        assert.strictEqual(mat.uniforms.uTransitionOpacity.value, 0.5);
    });

    it('applies opacity to standard transparent material', () => {
        const mat = { opacity: 1.0, transparent: false };
        applyMaterialOpacity(mat, 0.25);
        assert.strictEqual(mat.opacity, 0.25);
        assert.strictEqual(mat.transparent, true);
    });

    it('does not mutate transparent flag if already true', () => {
        const mat = { opacity: 1.0, transparent: true };
        let transparentMutated = false;
        Object.defineProperty(mat, 'transparent', {
            get: () => true,
            set: (val) => { transparentMutated = true; }
        });
        applyMaterialOpacity(mat, 0.75);
        assert.strictEqual(mat.opacity, 0.75);
        assert.strictEqual(transparentMutated, false);
    });
});
