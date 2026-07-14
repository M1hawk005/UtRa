const { describe, it } = require('node:test');
const assert = require('node:assert');
const { calculateZoom } = require('./wheel_zoom.js');

describe('calculateZoom', () => {
    it('returns null for zero delta', () => {
        const result = calculateZoom({
            cameraPos: [0, 0, 10],
            targetPos: [0, 0, 0],
            cursorRayDir: [0, 0, -1],
            deltaY: 0,
            zoomSpeed: 1,
            minDistance: 1,
            maxDistance: 100
        });
        assert.strictEqual(result, null);
    });

    it('factor direction: negative delta zooms in, positive zooms out', () => {
        const resultIn = calculateZoom({
            cameraPos: [0, 0, 10],
            targetPos: [0, 0, 0],
            cursorRayDir: [0, 0, -1],
            deltaY: -100,
            zoomSpeed: 1,
            minDistance: 1,
            maxDistance: 100
        });
        // Zooms in, distance decreases
        assert.ok(resultIn.newDistance < 10);

        const resultOut = calculateZoom({
            cameraPos: [0, 0, 10],
            targetPos: [0, 0, 0],
            cursorRayDir: [0, 0, -1],
            deltaY: 100,
            zoomSpeed: 1,
            minDistance: 1,
            maxDistance: 100
        });
        // Zooms out, distance increases
        assert.ok(resultOut.newDistance > 10);
    });

    it('clamps at min/max', () => {
        const resultIn = calculateZoom({
            cameraPos: [0, 0, 1.5],
            targetPos: [0, 0, 0],
            cursorRayDir: [0, 0, -1],
            deltaY: -1000,
            zoomSpeed: 10,
            minDistance: 1,
            maxDistance: 100
        });
        assert.strictEqual(resultIn.newDistance, 1);

        const resultOut = calculateZoom({
            cameraPos: [0, 0, 99],
            targetPos: [0, 0, 0],
            cursorRayDir: [0, 0, -1],
            deltaY: 1000,
            zoomSpeed: 10,
            minDistance: 1,
            maxDistance: 100
        });
        assert.strictEqual(resultOut.newDistance, 100);
    });

    it('center cursor ray preserves old target mathematically', () => {
        const result = calculateZoom({
            cameraPos: [0, 0, 10],
            targetPos: [0, 0, 0],
            cursorRayDir: [0, 0, -1],
            deltaY: -100,
            zoomSpeed: 1,
            minDistance: 1,
            maxDistance: 100
        });
        // target should remain exactly [0, 0, 0]
        assert.ok(Math.abs(result.newTarget[0] - 0) < 1e-6);
        assert.ok(Math.abs(result.newTarget[1] - 0) < 1e-6);
        assert.ok(Math.abs(result.newTarget[2] - 0) < 1e-6);
    });

    it('off-center ray shifts target consistently toward cursor', () => {
        // Looking down -Z, camera at 10, target at 0.
        // Cursor points slightly to the right (+X) and up (+Y)
        const dirX = 0.5;
        const dirY = 0.5;
        const dirZ = -Math.sqrt(1 - dirX*dirX - dirY*dirY); // normalized
        const resultIn = calculateZoom({
            cameraPos: [0, 0, 10],
            targetPos: [0, 0, 0],
            cursorRayDir: [dirX, dirY, dirZ],
            deltaY: -100,
            zoomSpeed: 1,
            minDistance: 1,
            maxDistance: 100
        });

        // When zooming in toward an off-center point, the new camera position moves along the ray.
        // The new target is placed newDistance away along the original forward vector.
        // Thus, the new target should shift toward +X and +Y relative to the old target.
        assert.ok(resultIn.newTarget[0] > 0);
        assert.ok(resultIn.newTarget[1] > 0);
    });

    it('wheel -100 gives one standard factor', () => {
        const result = calculateZoom({
            cameraPos: [0, 0, 10],
            targetPos: [0, 0, 0],
            cursorRayDir: [0, 0, -1],
            deltaY: -100,
            deltaMode: 0,
            zoomSpeed: 1,
            minDistance: 1,
            maxDistance: 100
        });
        // 0.95^1 = 0.95, distance is 10 * 0.95 = 9.5
        assert.ok(Math.abs(result.newDistance - 9.5) < 1e-6);
    });

    it('wheel -1 is near 1 and 100 sequential -1 factors approximately equal one -100 factor', () => {
        const singleResult = calculateZoom({
            cameraPos: [0, 0, 10],
            targetPos: [0, 0, 0],
            cursorRayDir: [0, 0, -1],
            deltaY: -100,
            deltaMode: 0,
            zoomSpeed: 1,
            minDistance: 1,
            maxDistance: 100
        });

        let currentCamPos = [0, 0, 10];
        let currentTargetPos = [0, 0, 0];
        let currentDist = 10;
        for (let i = 0; i < 100; i++) {
            const res = calculateZoom({
                cameraPos: currentCamPos,
                targetPos: currentTargetPos,
                cursorRayDir: [0, 0, -1],
                deltaY: -1,
                deltaMode: 0,
                zoomSpeed: 1,
                minDistance: 1,
                maxDistance: 100
            });
            currentCamPos = res.newCameraPos;
            currentTargetPos = res.newTarget;
            currentDist = res.newDistance;
        }

        assert.ok(Math.abs(currentDist - singleResult.newDistance) < 1e-4);
    });

    it('line/page delta modes normalize', () => {
        const resLine = calculateZoom({
            cameraPos: [0, 0, 10],
            targetPos: [0, 0, 0],
            cursorRayDir: [0, 0, -1],
            deltaY: -3,
            deltaMode: 1, // Line mode
            zoomSpeed: 1,
            minDistance: 1,
            maxDistance: 100
        });
        const resPixelLine = calculateZoom({
            cameraPos: [0, 0, 10],
            targetPos: [0, 0, 0],
            cursorRayDir: [0, 0, -1],
            deltaY: -3 * 16, // 16px per line
            deltaMode: 0,
            zoomSpeed: 1,
            minDistance: 1,
            maxDistance: 100
        });
        assert.ok(Math.abs(resLine.newDistance - resPixelLine.newDistance) < 1e-6);

        const resPage = calculateZoom({
            cameraPos: [0, 0, 10],
            targetPos: [0, 0, 0],
            cursorRayDir: [0, 0, -1],
            deltaY: -1,
            deltaMode: 2, // Page mode
            viewportHeight: 800,
            zoomSpeed: 1,
            minDistance: 1,
            maxDistance: 100
        });
        const resPixelPage = calculateZoom({
            cameraPos: [0, 0, 10],
            targetPos: [0, 0, 0],
            cursorRayDir: [0, 0, -1],
            deltaY: -800, // viewportHeight
            deltaMode: 0,
            zoomSpeed: 1,
            minDistance: 1,
            maxDistance: 100
        });
        assert.ok(Math.abs(resPage.newDistance - resPixelPage.newDistance) < 1e-6);
    });

    it('extreme one-event delta capped', () => {
        const resultExtreme = calculateZoom({
            cameraPos: [0, 0, 10],
            targetPos: [0, 0, 0],
            cursorRayDir: [0, 0, -1],
            deltaY: -10000,
            deltaMode: 0,
            zoomSpeed: 1,
            minDistance: 1,
            maxDistance: 100
        });
        const resultCap = calculateZoom({
            cameraPos: [0, 0, 10],
            targetPos: [0, 0, 0],
            cursorRayDir: [0, 0, -1],
            deltaY: -400, // Capped at 4 (if factor is deltaY/100, max exponent is 4)
            deltaMode: 0,
            zoomSpeed: 1,
            minDistance: 1,
            maxDistance: 100
        });
        assert.ok(Math.abs(resultExtreme.newDistance - resultCap.newDistance) < 1e-6);
    });
});

describe('accumulateWheelDelta', () => {
    const { accumulateWheelDelta, resetWheelAccumulator } = require('./wheel_zoom.js');

    it('nine -0.1px events produce 0, tenth crosses threshold and yields approximately -1px once', () => {
        resetWheelAccumulator();
        for (let i = 0; i < 9; i++) {
            assert.strictEqual(accumulateWheelDelta(-0.1, 0, 800), 0);
        }
        const finalDelta = accumulateWheelDelta(-0.1, 0, 800);
        assert.ok(Math.abs(finalDelta - -1.0) < 1e-6);
        assert.strictEqual(accumulateWheelDelta(-0.1, 0, 800), 0); // accumulator was reset
    });

    it('opposite signs below threshold cancel', () => {
        resetWheelAccumulator();
        assert.strictEqual(accumulateWheelDelta(0.5, 0, 800), 0);
        assert.strictEqual(accumulateWheelDelta(-0.5, 0, 800), 0);
        assert.strictEqual(accumulateWheelDelta(0.5, 0, 800), 0); // would be 1.0 if not cancelled, but it is 0.5 now
        assert.strictEqual(accumulateWheelDelta(0.5, 0, 800), 1.0); // 0.5 + 0.5 = 1.0
    });

    it('-100px processes immediately', () => {
        resetWheelAccumulator();
        assert.strictEqual(accumulateWheelDelta(-100, 0, 800), -100);
        assert.strictEqual(accumulateWheelDelta(50, 0, 800), 50);
    });

    it('line/page modes normalize correctly', () => {
        resetWheelAccumulator();
        assert.strictEqual(accumulateWheelDelta(-1, 1, 800), -16);
        assert.strictEqual(accumulateWheelDelta(2, 2, 800), 1600);
    });
});
