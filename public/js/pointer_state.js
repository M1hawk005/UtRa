(function (root, factory) {
    if (typeof exports === 'object' && typeof module === 'object') {
        module.exports = factory();
    } else {
        root.PointerState = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    return class PointerState {
        constructor() {
            this.activePointers = new Map();
            this.gestureCancelled = false;
        }

        onPointerDown(id, x, y, time) {
            this.activePointers.set(id, { startX: x, startY: y, downTime: time, maxDistSq: 0 });
            if (this.activePointers.size > 1) {
                this.gestureCancelled = true;
            }
        }

        onPointerMove(id, x, y) {
            const pData = this.activePointers.get(id);
            if (pData) {
                const dx = x - pData.startX;
                const dy = y - pData.startY;
                const distSq = dx * dx + dy * dy;
                if (distSq > pData.maxDistSq) {
                    pData.maxDistSq = distSq;
                }
            }
        }

        onPointerUp(id, x, y, time, pointerType, pickCallback) {
            const pData = this.activePointers.get(id);
            this.activePointers.delete(id);

            const wasCancelled = this.gestureCancelled;
            if (this.activePointers.size === 0) {
                this.gestureCancelled = false;
            }

            if (!pData || wasCancelled) {
                return false;
            }

            const dx = x - pData.startX;
            const dy = y - pData.startY;
            const distSq = dx * dx + dy * dy;
            if (distSq > pData.maxDistSq) {
                pData.maxDistSq = distSq;
            }

            const maxDist = Math.sqrt(pData.maxDistSq);

            if (pointerType !== 'touch' && maxDist < 7 && time - pData.downTime < 400) {
                pickCallback(x, y, pointerType);
                return true;
            } else if (pointerType === 'touch' && maxDist < 15 && time - pData.downTime < 400) {
                pickCallback(x, y, pointerType);
                return true;
            }
            return false;
        }

        onPointerCancel(id) {
            this.activePointers.delete(id);
            this.gestureCancelled = true;
            if (this.activePointers.size === 0) {
                this.gestureCancelled = false;
            }
        }

        hasActivePointers() {
            return this.activePointers.size > 0;
        }
    };
});
