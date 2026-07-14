const { describe, it } = require('node:test');
const assert = require('node:assert');
const { pickStarScreenSpace } = require('./star_picking.js');

describe('pickStarScreenSpace', () => {
    // Basic test setup
    const defaultBounds = { left: 0, top: 0, width: 800, height: 600 };
    // Identity view projection means clip space is world space
    // Let's create a matrix that maps x:[-1, 1] to screen x:[0, 800]
    // A point at (0, 0, 0) with clipW=1 goes to ndc(0, 0, 0) -> screen(400, 300)
    const viewProj = [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
    ];

    it('a. mouse hit at <=12 px and miss >12 px', () => {
        // Point exactly in the middle
        const positions = new Float32Array([0, 0, 0]);
        const starData = [{ n: 'Star 1' }];

        // 400, 300 is exact center.
        // Hit at 12px right
        assert.strictEqual(pickStarScreenSpace(positions, starData, viewProj, defaultBounds, 412, 300, 'mouse'), 0);

        // Miss at 13px right
        assert.strictEqual(pickStarScreenSpace(positions, starData, viewProj, defaultBounds, 413, 300, 'mouse'), -1);
    });

    it('b. pen 16 px and touch 24 px radius selection', () => {
        const positions = new Float32Array([0, 0, 0]);
        const starData = [{ n: 'Star 1' }];

        // Pen hit at 16px, miss at 17
        assert.strictEqual(pickStarScreenSpace(positions, starData, viewProj, defaultBounds, 416, 300, 'pen'), 0);
        assert.strictEqual(pickStarScreenSpace(positions, starData, viewProj, defaultBounds, 417, 300, 'pen'), -1);

        // Touch hit at 24px, miss at 25
        assert.strictEqual(pickStarScreenSpace(positions, starData, viewProj, defaultBounds, 424, 300, 'touch'), 0);
        assert.strictEqual(pickStarScreenSpace(positions, starData, viewProj, defaultBounds, 425, 300, 'touch'), -1);
    });

    it('c. CSS-pixel behavior independent of DPR (no DPR input)', () => {
        // Just verify there is no DPR parameter needed and relies solely on bounds and screen x/y
        const positions = new Float32Array([0, 0, 0]);
        const starData = [{ n: 'Star 1' }];
        assert.strictEqual(pickStarScreenSpace(positions, starData, viewProj, defaultBounds, 400, 300, 'mouse'), 0);
    });

    it('d. nearest screen-space candidate wins', () => {
        // Need to project to different distances in CSS pixels.
        // screen size 800x600. x=0 is center (400).
        // pt 0 is x=0 -> screenX=400
        // pt 1 is x=0.01 -> screenX = (0.01 + 1)/2 * 800 = 404
        // pt 2 is x=0.02 -> screenX = (0.02 + 1)/2 * 800 = 408
        const positions = new Float32Array([
            0, 0, 0,       // idx 0, screen 400,300
            0.01, 0, 0,    // idx 1, screen 404,300
            0.02, 0, 0     // idx 2, screen 408,300
        ]);
        const starData = [{ n: 'A' }, { n: 'B' }, { n: 'C' }];

        // Pointer at 403,300. Nearest is pt 1 (404) with dist 1. pt 0 is dist 3.
        assert.strictEqual(pickStarScreenSpace(positions, starData, viewProj, defaultBounds, 403, 300, 'mouse'), 1);

        // Pointer at 406,300. Nearest is pt 2 (408) dist 2. pt 1 is dist 2. Tie?
        // Wait, 406 to 404 is 2. 406 to 408 is 2. Let's make it unambiguous: 407
        assert.strictEqual(pickStarScreenSpace(positions, starData, viewProj, defaultBounds, 407, 300, 'mouse'), 2);
    });

    it('e. equal-distance front-most depth wins', () => {
        // Two stars mapping to exactly same screen coordinate (400,300), differing only in Z.
        // WebGL clipZ maps linearly with Z here. Z=-0.5 (closer) vs Z=0.5 (farther).
        const positions = new Float32Array([
            0, 0, 0.5,
            0, 0, -0.5
        ]);
        const starData = [{ n: 'Back' }, { n: 'Front' }];
        assert.strictEqual(pickStarScreenSpace(positions, starData, viewProj, defaultBounds, 400, 300, 'mouse'), 1); // Front wins
    });

    it('f. exact tie uses lower index deterministically', () => {
        const positions = new Float32Array([
            0, 0, 0,
            0, 0, 0
        ]);
        const starData = [{ n: 'A' }, { n: 'B' }];
        assert.strictEqual(pickStarScreenSpace(positions, starData, viewProj, defaultBounds, 400, 300, 'mouse'), 0);
    });

    it('g. behind-camera and near/far clipped candidates rejected', () => {
        const positions = new Float32Array([
            0, 0, -1.5, // clipZ = -1.5 < -1 (clipped by near in standard [-1, 1])
            0, 0, 1.5,  // clipZ = 1.5 > 1 (clipped by far)
            0, 0, 0     // good
        ]);
        // Also need to test clipW <= 0.
        // Let's make a custom viewProj that creates clipW <= 0 for negative Z
        const customProj = [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 1, // m11=1, so clipW = z
            0, 0, 0, 0
        ];
        // pt0: z=-1 -> clipW=-1 (behind cam)
        // pt1: z=0 -> clipW=0 (on plane)
        // pt2: z=1 -> clipW=1 (visible)
        const pos2 = new Float32Array([
            0, 0, -1,
            0, 0, 0,
            0, 0, 1
        ]);
        const starData = [{}, {}, {}];

        assert.strictEqual(pickStarScreenSpace(pos2, starData, customProj, defaultBounds, 400, 300, 'mouse'), 2);
    });

    it('h. offscreen candidates rejected', () => {
        // x = 2 -> ndcX = 2 -> screenX = (2+1)/2 * 800 = 1200
        const positions = new Float32Array([2, 0, 0]);
        const starData = [{ n: 'Far' }];
        // It's offscreen, pointer is at 400, 300, distance is 800 > 12
        assert.strictEqual(pickStarScreenSpace(positions, starData, viewProj, defaultBounds, 400, 300, 'mouse'), -1);
    });

    it('i. GAL-* candidate skipped even if closest', () => {
        const positions = new Float32Array([
            0, 0, 0,
            0.05, 0, 0
        ]);
        const starData = [{ n: 'GAL-123' }, { n: 'Normal Star' }];
        // GAL- is exactly at center, Normal Star is at screenX = (0.05+1)/2 * 800 = 420.
        // Pointer at 410. Radius 12.
        // Wait, distance from 410 to 420 is 10 (within 12).
        // distance from 410 to 400 is 10.
        // GAL-123 is 400, but skipped. Normal Star at 420 is picked!
        assert.strictEqual(pickStarScreenSpace(positions, starData, viewProj, defaultBounds, 410, 300, 'mouse'), 1);
    });

    it('j. non-finite coordinates skipped', () => {
        const positions = new Float32Array([
            NaN, 0, 0,
            0, 0, 0
        ]);
        const starData = [{}, {}];
        assert.strictEqual(pickStarScreenSpace(positions, starData, viewProj, defaultBounds, 400, 300, 'mouse'), 1);
    });

    it('k. canvas offset handled correctly', () => {
        const offsetBounds = { left: 100, top: 50, width: 800, height: 600 };
        const positions = new Float32Array([0, 0, 0]); // center of canvas -> 400, 300 relative to bounds
        const starData = [{}];
        // Pointer must be at 400+100=500, 300+50=350
        assert.strictEqual(pickStarScreenSpace(positions, starData, viewProj, offsetBounds, 500, 350, 'mouse'), 0);
        // Outside the canvas should return -1
        assert.strictEqual(pickStarScreenSpace(positions, starData, viewProj, offsetBounds, 50, 350, 'mouse'), -1);
    });

    it('l. reject stars outside clipX/clipY even if within pointer radius at edge', () => {
        const positions = new Float32Array([
            1.0125, 0, 0,    // 5px beyond right
            -1.0125, 0, 0,   // 5px beyond left
            0, 1.0166667, 0, // 5px beyond top (clipY > 1)
            0, -1.0166667, 0, // 5px beyond bottom
            1.0, 0, 0,       // exact right boundary
            -1.0, 0, 0,      // exact left boundary
            0, 1.0, 0,       // exact top boundary
            0, -1.0, 0       // exact bottom boundary
        ]);
        const starData = [
            {n: 'r_out'}, {n: 'l_out'}, {n: 't_out'}, {n: 'b_out'},
            {n: 'r_in'}, {n: 'l_in'}, {n: 't_in'}, {n: 'b_in'}
        ];

        const outPos = positions.slice(0, 12);
        const outData = starData.slice(0, 4);

        // these should all be rejected (-1)
        assert.strictEqual(pickStarScreenSpace(outPos, outData, viewProj, defaultBounds, 800, 300, 'mouse'), -1);
        assert.strictEqual(pickStarScreenSpace(outPos, outData, viewProj, defaultBounds, 0, 300, 'mouse'), -1);
        assert.strictEqual(pickStarScreenSpace(outPos, outData, viewProj, defaultBounds, 400, 0, 'mouse'), -1);
        assert.strictEqual(pickStarScreenSpace(outPos, outData, viewProj, defaultBounds, 400, 600, 'mouse'), -1);

        // exact boundaries should be eligible (index 4-7 in full array)
        assert.strictEqual(pickStarScreenSpace(positions, starData, viewProj, defaultBounds, 800, 300, 'mouse'), 4);
        assert.strictEqual(pickStarScreenSpace(positions, starData, viewProj, defaultBounds, 0, 300, 'mouse'), 5);
        assert.strictEqual(pickStarScreenSpace(positions, starData, viewProj, defaultBounds, 400, 0, 'mouse'), 6);
        assert.strictEqual(pickStarScreenSpace(positions, starData, viewProj, defaultBounds, 400, 600, 'mouse'), 7);
    });

    it('m. candidate exactly under pointer beats ~0.005px farther front-most candidate', () => {
        const positions = new Float32Array([
            0, 0, 0.5,        // idx 0, exactly at 400,300, farther back
            0.0000125, 0, -0.5 // idx 1, ~0.005 CSS px off center, front-most
        ]);
        // 0.0000125 * 400 = 0.005. So screenX is 400.005
        const starData = [{ n: 'Exact' }, { n: 'SlightlyOff' }];
        assert.strictEqual(pickStarScreenSpace(positions, starData, viewProj, defaultBounds, 400, 300, 'mouse'), 0);
    });
});
