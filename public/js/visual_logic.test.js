const { describe, it } = require('node:test');
const assert = require('node:assert');
const { calculateReticleScale, calculateReticleOpacity, calculateRouteOpacity, applyMaterialOpacity } = require('./visual_logic.js');

function assertApprox(actual, expected) {
    if (Math.abs(actual - expected) > 1e-5) {
        assert.fail(`Expected ${actual} to be close to ${expected}`);
    }
}

describe('Visual Logic Phase 2', () => {

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
