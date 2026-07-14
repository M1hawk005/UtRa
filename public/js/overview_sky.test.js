const { describe, it } = require('node:test');
const assert = require('node:assert');
const { generateOverviewDescriptors } = require('./overview_sky.js');

describe('Overview Sky Generation', () => {
    it('deterministic generation: same seed produces exactly identical descriptors', () => {
        const result1 = generateOverviewDescriptors(12345);
        const result2 = generateOverviewDescriptors(12345);
        assert.deepStrictEqual(result1, result2);
    });

    it('deterministic generation: different seed produces different descriptors', () => {
        const result1 = generateOverviewDescriptors(12345);
        const result2 = generateOverviewDescriptors(54321);
        assert.notDeepStrictEqual(result1, result2);
    });

    it('generated descriptor counts/types and bounds are exact and finite', () => {
        const { sources, smudges, companions } = generateOverviewDescriptors(999);

        assert.strictEqual(sources.length, 2500);
        assert.strictEqual(smudges.length, 300);
        assert.strictEqual(companions.length, 3);

        // Check properties are finite
        for (const item of [...sources, ...smudges, ...companions]) {
            assert.ok(Number.isFinite(item.x));
            assert.ok(Number.isFinite(item.y));
            assert.ok(Number.isFinite(item.z));
            assert.ok(Number.isFinite(item.size));
            assert.ok(Number.isFinite(item.alpha));
            assert.ok(Number.isFinite(item.r));
            assert.ok(Number.isFinite(item.g));
            assert.ok(Number.isFinite(item.b));
            assert.ok(Number.isFinite(item.rotation));
            assert.ok(Number.isFinite(item.aspect));
            assert.ok(Number.isFinite(item.classType));
        }
    });
});
