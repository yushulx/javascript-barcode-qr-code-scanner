var overlay = null;
var context = null;

function initOverlay(ol) {
    overlay = ol;
    context = overlay.getContext('2d');
}

function updateOverlay(width, height) {
    if (overlay) {
        overlay.width = width;
        overlay.height = height;
        clearOverlay();
    }
}

function clearOverlay() {
    if (context) {
        context.clearRect(0, 0, overlay.width, overlay.height);
        context.strokeStyle = '#ff0000';
        context.lineWidth = 5;
    }
}

function drawOverlay(points, text) {
    if (!context) return;
    if (!points || points.length < 4) return;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; ++i) {
        context.lineTo(points[i].x, points[i].y);
    }
    context.closePath();
    context.stroke();

    context.font = '18px Verdana';
    context.fillStyle = '#ff0000';
    let x = points.map(p => p.x);
    let y = points.map(p => p.y);
    x.sort(function (a, b) {
        return a - b;
    });
    y.sort(function (a, b) {
        return b - a;
    });
    let left = x[0];
    let top = y[0];

    context.fillText(text, left, top + 50);
}

function drawQuad(points) {
    if (!context || !points) return;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    context.lineTo(points[1].x, points[1].y);
    context.lineTo(points[2].x, points[2].y);
    context.lineTo(points[3].x, points[3].y);
    context.lineTo(points[0].x, points[0].y);
    context.stroke();
}
