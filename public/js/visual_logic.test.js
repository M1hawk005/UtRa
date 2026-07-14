const { describe, it } = require('node:test');
const assert = require('node:assert');
const { calculateSkyOpacity, getSpectralColorHex, getPhotosphereParams, calculateDetailLOD, calculateReticleScale, calculateReticleOpacity, calculateRouteOpacity, getProvenance, applyMaterialOpacity } = require('./visual_logic.js');

function assertApprox(actual, expected) {
    if (Math.abs(actual - expected) > 1e-5) {
        assert.fail(`Expected ${actual} to be close to ${expected}`);
    }
}

describe('Visual Logic', () => {

    it('local sky-macro opacity fade at measured radii 8216 and 49142', () => {
        const localDist = 8216;
        const edgeDist = 49142;

        // Modified to expect an object return
        const localRes = calculateSkyOpacity(localDist);
        assertApprox(localRes.opacity, 1.0);
        assertApprox(localRes.lodBias, 0.0); // Inside: fine detail

        const edgeRes = calculateSkyOpacity(edgeDist);
        assertApprox(edgeRes.opacity, 0.0);
        assert.ok(edgeRes.lodBias >= 4.0); // Outside: coarse only
    });

    it('mutates and returns provided out object to avoid allocation', () => {
        const outObj = { opacity: -1, lodBias: -1 };

        const res1 = calculateSkyOpacity(8000, outObj);
        assert.strictEqual(res1, outObj);
        assertApprox(outObj.opacity, 1.0);
        assertApprox(outObj.lodBias, 0.0);

        const res2 = calculateSkyOpacity(30000, outObj);
        assert.strictEqual(res2, outObj);
        assertApprox(outObj.opacity, 0.0);
        assert.ok(outObj.lodBias >= 4.0);
    });

    it('spectral-class mapping', () => {
        assert.strictEqual(getSpectralColorHex('O'), 0x9bb0ff);
        assert.strictEqual(getSpectralColorHex('M'), 0xffcc6f);
        assert.strictEqual(getSpectralColorHex('G'), 0xfff4ea);
        assert.strictEqual(getSpectralColorHex('Unknown'), 0xffffff);
    });

    it('pure spectral photosphere parameter mapping for representative classes', () => {
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
        // scale(dist, fov, viewportHeight, targetCssPx, baseReticleSize)
        // distance 20, fov 60, height 1080, target 36px, reticle diam 4.0
        const scale1 = calculateReticleScale(20, 60, 1080, 36, 4.0);
        // dist 20, diam 4.0 => angular size ~0.2 rad => ~11.45 deg => ~11.45/60 of fov
        // 1080 * 11.45 / 60 = 206px raw size. target is 36px, so scale should be ~ 0.19245
        assertApprox(scale1, 0.19244976);
    });

    it('reticle opacity fades in close detail', () => {
        // At dist < 5 it should be ~0.0, at dist > 15 it should be 1.0 (multiplied by flight opacity)
        assert.ok(calculateReticleOpacity(15) > 0.9);
        assert.ok(calculateReticleOpacity(4) <= 0.08);
    });

    it('route line opacity fades at close inspection detail', () => {
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

        it('provenance mapping', () => {
        const solResult = getProvenance(true, false);
        assert.ok(solResult.includes('Observed:'));
        assert.ok(solResult.includes('NASA/GSFC/SDO HMI'));
        assert.ok(solResult.includes('svs.gsfc.nasa.gov'));

        const catalogResult = getProvenance(false, false);
        assert.strictEqual(catalogResult, 'Inferred photosphere &middot; normalized inspection scale');

        const procResult = getProvenance(false, true);
        assert.strictEqual(procResult, null);
    });


});

describe('Material Opacity Helper', () => {
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
