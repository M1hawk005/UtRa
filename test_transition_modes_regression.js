const test = require('node:test');
const assert = require('node:assert');
const transitionApi = require('./public/js/transition.js');
const { createTransition, startTransition, updateTransition, interruptTransition } = transitionApi;

test('route hop -> complete -> ordinary focus', (t) => {
    let state = createTransition({ duration: 1000 });

    // 1. route hop
    startTransition(state, { isRouteHop: true });
    assert.strictEqual(state.isRouteHop, true);
    assert.strictEqual(state.isFocus, false);

    updateTransition(state, 500);
    assert.strictEqual(state.phase, 'SLIDE');

    // complete
    updateTransition(state, 500);
    updateTransition(state, 1);
    assert.strictEqual(state.isActive, false);

    // 2. ordinary focus
    startTransition(state, { isFocus: true });

    // Checking EXACTLY
    assert.strictEqual(state.isFocus, true);
    assert.strictEqual(state.isRouteHop, false);
    assert.strictEqual(state.phase, 'FOCUS');

    updateTransition(state, 500);
    assert.ok(state.focusT > 0);
    assert.strictEqual(state.slideT, 0); // slideT stays reset

    // interruption halts at rendered pose
    interruptTransition(state);
    assert.strictEqual(state.isActive, false); // focus interruption halts completely
});

test('focus -> complete -> route hop', (t) => {
    let state = createTransition({ duration: 1000 });

    // focus
    startTransition(state, { isFocus: true });
    updateTransition(state, 1000); // complete

    // route hop
    startTransition(state, { isRouteHop: true });
    assert.strictEqual(state.isRouteHop, true);
    assert.strictEqual(state.isFocus, false);

    updateTransition(state, 10);
    assert.strictEqual(state.phase, 'SLIDE');
});

test('specialized mode -> generic map relocation with flags omitted', (t) => {
    let state = createTransition({ duration: 1000 });

    startTransition(state, { isFocus: true });
    updateTransition(state, 1000);

    // generic map relocation (flags omitted)
    startTransition(state, {});
    assert.strictEqual(state.isRouteHop, false);
    assert.strictEqual(state.isFocus, false);

    updateTransition(state, 10);
    assert.strictEqual(state.phase, 'DEPARTURE');

    updateTransition(state, 500);
    assert.strictEqual(state.phase, 'MAP_ARC');
});

test('reject or deterministically resolve an invalid request that explicitly sets both true', (t) => {
    let state = createTransition({ duration: 1000 });

    // Can either throw or resolve to false. Let's assume we throw an error.
    assert.throws(() => {
        startTransition(state, { isRouteHop: true, isFocus: true });
    }, /mutually exclusive/i);
});

test('app sequence: established route hop -> off-route acquireStarTarget uses FOCUS, not SLIDE', (t) => {
    let state = createTransition({ duration: 1000 });

    startTransition(state, { isRouteHop: true });
    updateTransition(state, 500); // in progress

    // off-route acquireStarTarget/search starts FOCUS
    startTransition(state, { isFocus: true });
    assert.strictEqual(state.isFocus, true);
    assert.strictEqual(state.isRouteHop, false);
    assert.strictEqual(state.phase, 'FOCUS');

    updateTransition(state, 100);
    assert.strictEqual(state.phase, 'FOCUS');
});
