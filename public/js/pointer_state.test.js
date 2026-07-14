const { describe, it } = require('node:test');
const assert = require('node:assert');
const PointerState = require('./pointer_state.js');

describe('PointerState', () => {
    it('a. normal single mouse tap is eligible', () => {
        const ps = new PointerState();
        let picked = false;
        ps.onPointerDown(1, 100, 100, 0);
        ps.onPointerUp(1, 101, 101, 100, 'mouse', () => { picked = true; });
        assert.ok(picked);
        assert.ok(!ps.hasActivePointers());
    });

    it('b. normal single touch tap is eligible', () => {
        const ps = new PointerState();
        let picked = false;
        ps.onPointerDown(1, 100, 100, 0);
        ps.onPointerUp(1, 110, 110, 100, 'touch', () => { picked = true; });
        assert.ok(picked);
        assert.ok(!ps.hasActivePointers());
    });

    it('c. two touch pointerdowns then either/both pointerups produce no pick', () => {
        const ps = new PointerState();
        let pickedCount = 0;
        ps.onPointerDown(1, 100, 100, 0);
        ps.onPointerDown(2, 200, 200, 10);

        ps.onPointerUp(1, 100, 100, 100, 'touch', () => { pickedCount++; });
        ps.onPointerUp(2, 200, 200, 110, 'touch', () => { pickedCount++; });

        assert.strictEqual(pickedCount, 0);
        assert.ok(!ps.hasActivePointers());
    });

    it('d. pointercancel produces no pick and resets safely', () => {
        const ps = new PointerState();
        let picked = false;
        ps.onPointerDown(1, 100, 100, 0);
        ps.onPointerCancel(1);
        ps.onPointerUp(1, 100, 100, 100, 'touch', () => { picked = true; });

        assert.ok(!picked);
        assert.ok(!ps.hasActivePointers());
    });

    it('e. lostpointercapture produces no pick and resets safely', () => {
        const ps = new PointerState();
        let picked = false;
        ps.onPointerDown(1, 100, 100, 0);
        ps.onPointerCancel(1); // treats lostpointercapture same as cancel
        ps.onPointerUp(1, 100, 100, 100, 'touch', () => { picked = true; });

        assert.ok(!picked);
        assert.ok(!ps.hasActivePointers());
    });

    it('f. unknown pointerup produces no pick', () => {
        const ps = new PointerState();
        let picked = false;
        ps.onPointerUp(99, 100, 100, 100, 'mouse', () => { picked = true; });
        assert.ok(!picked);
    });

    it('g. a fresh valid tap works after cancelled/multi-pointer gesture fully ends', () => {
        const ps = new PointerState();
        let picked = false;

        // Multi-touch cancel
        ps.onPointerDown(1, 100, 100, 0);
        ps.onPointerDown(2, 200, 200, 10);
        ps.onPointerUp(1, 100, 100, 100, 'touch', () => { picked = true; });
        ps.onPointerUp(2, 200, 200, 110, 'touch', () => { picked = true; });
        assert.ok(!picked);

        // Fresh valid tap
        ps.onPointerDown(3, 300, 300, 200);
        ps.onPointerUp(3, 300, 300, 300, 'touch', () => { picked = true; });
        assert.ok(picked);
    });

    it('h. drag/time thresholds remain unchanged', () => {
        const ps = new PointerState();
        let picked = false;

        // Drag too far for mouse
        ps.onPointerDown(1, 100, 100, 0);
        ps.onPointerUp(1, 108, 100, 100, 'mouse', () => { picked = true; });
        assert.ok(!picked);

        // Time too long
        ps.onPointerDown(2, 100, 100, 0);
        ps.onPointerUp(2, 100, 100, 500, 'mouse', () => { picked = true; });
        assert.ok(!picked);
    });

    it('i. mouse out-and-back drag produces no pick', () => {
        const ps = new PointerState();
        let picked = false;
        ps.onPointerDown(1, 100, 100, 0);
        ps.onPointerMove(1, 108, 100);
        ps.onPointerMove(1, 100, 100);
        ps.onPointerUp(1, 100, 100, 100, 'mouse', () => { picked = true; });
        assert.ok(!picked);
    });

    it('j. touch out-and-back drag produces no pick', () => {
        const ps = new PointerState();
        let picked = false;
        ps.onPointerDown(1, 100, 100, 0);
        ps.onPointerMove(1, 116, 100);
        ps.onPointerMove(1, 100, 100);
        ps.onPointerUp(1, 100, 100, 100, 'touch', () => { picked = true; });
        assert.ok(!picked);
    });
});
