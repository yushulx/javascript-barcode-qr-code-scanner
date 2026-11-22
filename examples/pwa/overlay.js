// OverlayRenderer draws barcode bounding boxes and labels onto a <canvas>.
// It keeps the canvas aligned with the underlying video/image regardless of
// how the media is scaled (object-fit: contain), so overlays stay accurate
// on both desktop and mobile layouts.
class OverlayRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
    }

    // contentW/H: intrinsic size of the video or image (natural pixels)
    // containerW/H: displayed pixel size of the wrapper element
    setContentSize(contentW, contentH, containerW, containerH) {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.round(containerW * dpr);
        this.canvas.height = Math.round(containerH * dpr);
        this.canvas.style.width = containerW + 'px';
        this.canvas.style.height = containerH + 'px';
        // Draw in CSS pixels for crispness on high-DPI screens.
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);

        const scale = Math.min(containerW / contentW, containerH / contentH);
        this.scale = scale;
        this.offsetX = (containerW - contentW * scale) / 2;
        this.offsetY = (containerH - contentH * scale) / 2;
        this.clear();
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    mapPoint(p) {
        return { x: p.x * this.scale + this.offsetX, y: p.y * this.scale + this.offsetY };
    }

    drawBarcode(points, label) {
        if (!points || points.length < 4) return;
        const ctx = this.ctx;
        const mapped = points.map(p => this.mapPoint(p));

        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(mapped[0].x, mapped[0].y);
        for (let i = 1; i < mapped.length; i++) {
            ctx.lineTo(mapped[i].x, mapped[i].y);
        }
        ctx.closePath();
        ctx.stroke();

        // Draw a small filled label with the decoded text.
        if (label) {
            const anchor = mapped[0];
            ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            const w = ctx.measureText(label).width + 10;
            let y = anchor.y - 8 < 14 ? anchor.y + 16 : anchor.y - 8;
            ctx.fillStyle = 'rgba(17, 24, 39, 0.85)';
            ctx.fillRect(anchor.x, y, w, 18);
            ctx.fillStyle = '#22c55e';
            ctx.fillText(label, anchor.x + 5, y + 13);
        }
    }
}

