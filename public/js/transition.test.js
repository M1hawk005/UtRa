const { describe, it } = require('node:test');
const assert = require('node:assert');
const { createTransition, startTransition, updateTransition, interruptTransition, getMapPose, OPACITY_FLOOR } = require('./transition.js');

function assertApprox(actual, expected, msg) {
    if (Math.abs(actual - expected) > 1e-5) {
        assert.fail(`Expected ${actual} to be close to ${expected}${msg ? ': ' + msg : ''}`);
    }
}

describe('Transition State Machine (Navigation)', () => {
    it('builds a map pose from the galaxy frame', () => {
        const pose = getMapPose(10, 20, 30, {
            viewOut: { x: 0, y: -0.6, z: 0.8 },
            distance: 100,
        });
        assert.deepStrictEqual(pose.target, { x: 10, y: 20, z: 30 });
        assert.deepStrictEqual(pose.cam, { x: 10, y: -40, z: 110 });
    });

    it('initializes idle state', () => {
        const state = createTransition();
        assert.strictEqual(state.phase, 'IDLE');
        assertApprox(state.opacity, 1.0);
        assertApprox(state.mapArcT, 0.0);
        assertApprox(state.arrivalT, 0.0);
        assert.strictEqual(state.isFlying, false);
        assert.strictEqual(state.isActive, false);
    });

    it('ordered transition phases: departure -> mapArc -> arrival', () => {
        const state = createTransition({ duration: 1000, fadeFraction: 0.2 });
        startTransition(state);

        assert.strictEqual(state.phase, 'DEPARTURE');
        assert.strictEqual(state.isActive, true);

        // Mid-departure
        updateTransition(state, 100);
        assert.strictEqual(state.phase, 'DEPARTURE');
        assertApprox(state.opacity, 1.0 - (1.0 - OPACITY_FLOOR) * 0.5);
        assertApprox(state.mapArcT, 0.0, 'No camera movement during visible departure');
        assertApprox(state.arrivalT, 0.0);

        // End of departure
        updateTransition(state, 100);
        assert.strictEqual(state.phase, 'MAP_ARC');
        assertApprox(state.opacity, OPACITY_FLOOR, 'No black context');
        assertApprox(state.mapArcT, 0.0);
        assertApprox(state.arrivalT, 0.0);

        // Mid-mapArc
        updateTransition(state, 300);
        assert.strictEqual(state.phase, 'MAP_ARC');
        assertApprox(state.opacity, OPACITY_FLOOR);
        assertApprox(state.mapArcT, 0.5, 'Continuous bounded map arc');
        assertApprox(state.arrivalT, 0.0);

        // End of mapArc
        updateTransition(state, 300);
        assert.strictEqual(state.phase, 'ARRIVAL');
        assertApprox(state.opacity, OPACITY_FLOOR);
        assertApprox(state.mapArcT, 1.0);
        assertApprox(state.arrivalT, 0.0);

        // Mid-arrival
        updateTransition(state, 100);
        assert.strictEqual(state.phase, 'ARRIVAL');
        assertApprox(state.opacity, 1.0 - (1.0 - OPACITY_FLOOR) * 0.5);
        assertApprox(state.mapArcT, 1.0);
        assertApprox(state.arrivalT, 0.5, 'Short local arrival');

        // Terminal sample (exact completion)
        updateTransition(state, 100);
        assert.strictEqual(state.phase, 'ARRIVAL');
        assertApprox(state.opacity, 1.0);
        assertApprox(state.mapArcT, 1.0);
        assertApprox(state.arrivalT, 1.0);
        assert.strictEqual(state.isFlying, true);

        // Completion/cleanup
        updateTransition(state, 1);
        assert.strictEqual(state.phase, 'IDLE');
        assertApprox(state.opacity, 1.0);
        assertApprox(state.mapArcT, 1.0);
        assertApprox(state.arrivalT, 1.0);
        assert.strictEqual(state.isFlying, false);
    });

    it('exact-duration/final tick exposes a terminal arrival sample with arrivalT=1', () => {
        const state = createTransition({ duration: 1000, fadeFraction: 0.2 });
        startTransition(state);
        updateTransition(state, 1000);

        assert.strictEqual(state.phase, 'ARRIVAL', 'Should render exact arrival pose before going IDLE');
        assertApprox(state.arrivalT, 1.0);
        assert.strictEqual(state.isFlying, true, 'Should still be flying on the exact terminal tick');

        updateTransition(state, 1);
        assert.strictEqual(state.phase, 'IDLE');
        assert.strictEqual(state.isFlying, false);
        assert.strictEqual(state.isActive, false);
    });

    it('latest-request restart behavior', () => {
        const state = createTransition({ duration: 1000, fadeFraction: 0.2 });
        startTransition(state);
        updateTransition(state, 100); // mid departure
        assertApprox(state.opacity, 0.575);

        startTransition(state);
        assert.strictEqual(state.phase, 'DEPARTURE');
        assertApprox(state.opacity, 0.575, 'Opacity must not snap to 1.0');
        assertApprox(state.mapArcT, 0.0);

        // Assert restarted transition completes properly
        // Progress was reset to 0.0, so after 100ms it should be at progress 0.1 (mid departure).
        updateTransition(state, 100);
        assert.strictEqual(state.phase, 'DEPARTURE');
        assertApprox(state.opacity, 0.3625);
        assertApprox(state.mapArcT, 0.0);

        updateTransition(state, 100); // end of departure
        assert.strictEqual(state.phase, 'MAP_ARC');
        assertApprox(state.opacity, OPACITY_FLOOR);
        assertApprox(state.mapArcT, 0.0);

        updateTransition(state, 600); // end of new map arc
        assert.strictEqual(state.phase, 'ARRIVAL');
        assertApprox(state.opacity, OPACITY_FLOOR);
        assertApprox(state.mapArcT, 1.0);

        updateTransition(state, 100); // mid arrival
        assertApprox(state.opacity, 0.575);
        assertApprox(state.arrivalT, 0.5);

        updateTransition(state, 100); // Exact terminal step
        assert.strictEqual(state.phase, 'ARRIVAL');
        assertApprox(state.opacity, 1.0);
        assertApprox(state.arrivalT, 1.0);

        updateTransition(state, 1); // cleanup
        assert.strictEqual(state.phase, 'IDLE');
        assertApprox(state.opacity, 1.0);
        assertApprox(state.arrivalT, 1.0);
    });

    it('interruption', () => {
        const state = createTransition({ duration: 1000, fadeFraction: 0.2 });
        startTransition(state);
        updateTransition(state, 100);
        interruptTransition(state);

        assert.strictEqual(state.isFlying, false);
        assert.strictEqual(state.isActive, true);
        assert.strictEqual(state.phase, 'ARRIVAL');
        assertApprox(state.opacity, 0.575);

        updateTransition(state, 100);
        assertApprox(state.opacity, 1.0);
    });

    it('reduced motion', () => {
        const state = createTransition({ duration: 1000, fadeFraction: 0.2, reducedMotion: true });
        startTransition(state);
        assert.strictEqual(state.phase, 'DEPARTURE');

        updateTransition(state, 100); // Reduced motion has shorter fade
        assert.strictEqual(state.phase, 'MAP_ARC');
        assertApprox(state.opacity, OPACITY_FLOOR);
        assertApprox(state.mapArcT, 0.0); // Map arc progress

        updateTransition(state, 400); // Mid jump
        assertApprox(state.mapArcT, 1.0); // Jump is instantaneous or skipped, cameraT just flips

        updateTransition(state, 400); // End of jump, reach 0.9 progress (900/1000)
        assert.strictEqual(state.phase, 'ARRIVAL');
        assertApprox(state.opacity, OPACITY_FLOOR);
        assertApprox(state.mapArcT, 1.0);
        assertApprox(state.arrivalT, 0.0);

        updateTransition(state, 100); // exact terminal tick
        assert.strictEqual(state.phase, 'ARRIVAL');
        assertApprox(state.opacity, 1.0);
        assertApprox(state.mapArcT, 1.0);
        assertApprox(state.arrivalT, 1.0);
        assert.strictEqual(state.isFlying, true);

        updateTransition(state, 1); // cleanup
        assert.strictEqual(state.phase, 'IDLE');
        assertApprox(state.opacity, 1.0);
        assert.strictEqual(state.isActive, false);
        assert.strictEqual(state.isFlying, false);
        assertApprox(state.arrivalT, 1.0);
    });

    it('focus phase (isFocus) skips map arc and fade, using focusT', () => {
        const state = createTransition({ duration: 1000, isFocus: true });
        startTransition(state, { isFocus: true });

        assert.strictEqual(state.phase, 'FOCUS');
        assert.strictEqual(state.isActive, true);

        updateTransition(state, 500);
        assert.strictEqual(state.phase, 'FOCUS');
        assertApprox(state.opacity, 1.0);
        assertApprox(state.focusT, 0.5);

        updateTransition(state, 500); // Terminal sample
        assert.strictEqual(state.phase, 'FOCUS');
        assertApprox(state.opacity, 1.0);
        assertApprox(state.focusT, 1.0);
        assert.strictEqual(state.isFlying, true);

        updateTransition(state, 1);
        assert.strictEqual(state.phase, 'IDLE');
        assert.strictEqual(state.isFlying, false);
    });

    it('focus phase with reduced motion immediately completes to terminal geometry', () => {
        const state = createTransition({ duration: 1000, isFocus: true, reducedMotion: true });
        startTransition(state, { isFocus: true });

        updateTransition(state, 100);
        assert.strictEqual(state.phase, 'FOCUS');
        assertApprox(state.opacity, 1.0);
        assertApprox(state.focusT, 1.0);

        updateTransition(state, 1);
        assert.strictEqual(state.phase, 'IDLE');
    });

    it('interruption during focus phase halts without completing terminal', () => {
        const state = createTransition({ duration: 1000, isFocus: true });
        startTransition(state, { isFocus: true });
        updateTransition(state, 100);
        interruptTransition(state);

        assert.strictEqual(state.isFlying, false);
        assert.strictEqual(state.isActive, false);
        assert.notStrictEqual(state.focusT, 1.0);
    });
});
