// Кликабельная карта объекта для lsFusion (custom component).
// value — строка с разделителями: meta '~' elem '~' elem ...
//   meta = name^w^h
//   elem = n^t^g^l^c^ch   (t: building|floor|zone|conveyor|gate|sensor|marker)
//   g: "x,y" (точка) или "x1,y1 x2,y2 ..." (контур); ch=1 → кликабелен (провал внутрь)
function schemeMap() {
    var SVGNS = "http://www.w3.org/2000/svg";

    function mk(name, attrs) {
        var e = document.createElementNS(SVGNS, name);
        for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
        return e;
    }
    function pts(g) {
        return g.trim().split(/\s+/).map(function (p) {
            var xy = p.split(","); return { x: +xy[0], y: +xy[1] };
        });
    }
    function centroid(ps) {
        var sx = 0, sy = 0;
        ps.forEach(function (p) { sx += p.x; sy += p.y; });
        return { x: sx / ps.length, y: sy / ps.length };
    }

    return {
        render: function (element) {
            element.classList.add("scheme-map");
            element.svg = document.createElementNS(SVGNS, "svg");
            element.appendChild(element.svg);
        },
        update: function (element, controller, value) {
            var svg = element.svg;
            while (svg.firstChild) svg.removeChild(svg.firstChild);
            var s = (typeof value === "string") ? value : "";
            if (!s) return;

            var recs = s.split("~");
            var meta = recs[0].split("^");
            var w = +meta[1] || 900, h = +meta[2] || 500;
            svg.setAttribute("viewBox", "0 0 " + w + " " + h);
            svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

            // defs: штриховка стеллажей
            var defs = document.createElementNS(SVGNS, "defs");
            defs.innerHTML = '<pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
                + '<rect width="7" height="7" fill="#efe3cf"/><line x1="0" y1="0" x2="0" y2="7" stroke="#c8a878" stroke-width="3"/></pattern>';
            svg.appendChild(defs);

            svg.appendChild(mk("rect", { x: 0, y: 0, width: w, height: h, fill: "#f4f5f7", stroke: "#d9dce1" }));
            for (var gx = 40; gx < w; gx += 40) svg.appendChild(mk("line", { x1: gx, y1: 0, x2: gx, y2: h, stroke: "#eceef2" }));
            for (var gy = 40; gy < h; gy += 40) svg.appendChild(mk("line", { x1: 0, y1: gy, x2: w, y2: gy, stroke: "#eceef2" }));

            for (var i = 1; i < recs.length; i++) {
                var f = recs[i].split("^");
                var item = { n: +f[0], t: f[1], g: f[2], l: f[3], c: f[4], ch: +f[5] };
                var node, labelAt;

                if (item.t === "conveyor") {
                    svg.appendChild(mk("polyline", { points: item.g, fill: "none", stroke: item.c, "stroke-width": 8, "stroke-linecap": "round" }));
                    continue;
                }
                if (item.t === "wall") {
                    svg.appendChild(mk("polyline", { points: item.g, fill: "none", stroke: "#565b66", "stroke-width": 9, "stroke-linecap": "square", "stroke-linejoin": "miter" }));
                    continue;
                }
                if (item.t === "road") {
                    svg.appendChild(mk("polyline", { points: item.g, fill: "none", stroke: "#d7dbe0", "stroke-width": 26, "stroke-linecap": "round" }));
                    svg.appendChild(mk("polyline", { points: item.g, fill: "none", stroke: "#ffffff", "stroke-width": 2, "stroke-dasharray": "10 12" }));
                    continue;
                }
                if (item.t === "rack") {
                    svg.appendChild(mk("polygon", { points: item.g, fill: "url(#hatch)", stroke: "#9c7b4e", "stroke-width": 1.5 }));
                    continue;
                }
                if (item.t === "sensor" || item.t === "gate" || item.t === "marker") {
                    var p = pts(item.g)[0];
                    var r = item.t === "gate" ? 9 : 11;
                    node = (item.t === "gate")
                        ? mk("rect", { x: p.x - r, y: p.y - r, width: 2 * r, height: 2 * r, rx: 3, fill: item.c, stroke: "#222", "stroke-width": 1.5 })
                        : mk("circle", { cx: p.x, cy: p.y, r: r, fill: item.c, stroke: "#222", "stroke-width": 1.5 });
                    svg.appendChild(node);
                    labelAt = { x: p.x, y: p.y - r - 6 };
                } else {
                    var ps = pts(item.g);
                    node = mk("polygon", { points: item.g, fill: item.c, stroke: "#7d97d8", "stroke-width": 2 });
                    svg.appendChild(node);
                    labelAt = centroid(ps);
                }

                if (item.l) {
                    var t = mk("text", { x: labelAt.x, y: labelAt.y, "font-size": 13, fill: "#1a1a1a", "text-anchor": "middle", "font-family": "sans-serif", "pointer-events": "none" });
                    t.textContent = item.l;
                    svg.appendChild(t);
                }

                if (item.ch === 1) {
                    node.style.cursor = "pointer";
                    if (item.t === "building" || item.t === "floor") node.classList.add("scheme-clickable");
                    (function (n) {
                        node.addEventListener("click", function () { controller.change({ action: "open", n: n }); });
                    })(item.n);
                }
            }
        }
    };
}
