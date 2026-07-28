// Аналитический дашборд энергомониторинга (плитки, как у топ-решений: panpwr и т.п.).
// Идёт ПОД основной 3D-сценой. Питается тем же evData-снимком; суточные кривые/тепловую карту/
// сравнение синтезирует на клиенте из снимка + типовой суточный профиль завода (демо, эмуляция).
// Плитки: 1) суточная кривая мощности  2) тепловая карта установки×часы  3) сравнение сегодня/вчера
//         4) выводы (авто-инсайты).  evData: 'E^P^Q^acc^drop^loss^tariff' + '~' + U^-записи.
function energydash() {
    var tr = window.miteTr || String;
    // типовой суточный профиль промышленной нагрузки (0..23 ч), нормирован ~0..1, пик днём
    var SHAPE = [0.30, 0.28, 0.27, 0.27, 0.28, 0.33, 0.46, 0.63, 0.79, 0.89, 0.96, 1.00, 0.97, 0.99, 1.00, 0.95, 0.86, 0.74, 0.62, 0.52, 0.45, 0.40, 0.36, 0.32];
    var NS = "http://www.w3.org/2000/svg";
    function el(tag, attrs, txt) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (txt != null) e.textContent = txt; return e; }
    // детерминированный «шум» 0..1 по строке — чтобы кривые не были идентичны, но стабильны
    function rnd(s) { var x = 2166136261; for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = (x * 16777619) >>> 0; } return (x % 1000) / 1000; }
    function ramp(t) { t = Math.max(0, Math.min(1, t)); var r = t < 0.5 ? Math.round(60 + t * 2 * 195) : 255; var g = t < 0.5 ? 190 : Math.round(190 - (t - 0.5) * 2 * 175); return "rgb(" + r + "," + g + ",40)"; }
    function fmt(v, d) { var n = +v; return isNaN(n) ? "0" : n.toFixed(d == null ? 0 : d); }

    // построить суточные профили (кВт) для каждой установки + сегодня/вчера
    function profiles(units) {
        var nowH = new Date().getHours();
        units.forEach(function (u) {
            var scaleT = (u.p / 1000) / (SHAPE[nowH] || 1);           // так, чтобы в текущий час ≈ текущая P
            u.today = []; u.prev = [];
            var dayFactor = 0.88 + rnd(u.name) * 0.22;                 // вчера чуть иначе
            for (var h = 0; h < 24; h++) {
                var n1 = 0.94 + rnd(u.name + "|" + h) * 0.12;
                var n2 = 0.90 + rnd(u.name + "#" + h) * 0.16;
                u.today[h] = Math.max(0, scaleT * SHAPE[h] * n1);
                u.prev[h] = Math.max(0, scaleT * SHAPE[h] * dayFactor * n2);
            }
        });
    }

    function metrics(units) {
        // агрегаты по часам (сумма по установкам)
        var tot = [], prev = [];
        for (var h = 0; h < 24; h++) { var a = 0, b = 0; units.forEach(function (u) { a += u.today[h]; b += u.prev[h]; }); tot[h] = a; prev[h] = b; }
        return { tot: tot, prev: prev };
    }

    // ---------- ПЛИТКА 1: суточная кривая мощности ----------
    function tileCurve(box, units, agg) {
        box.innerHTML = "";
        var head = document.createElement("div"); head.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:4px";
        var ttl = document.createElement("div"); ttl.textContent = tr("Суточная кривая мощности"); ttl.style.cssText = "font-weight:700;font-size:13px;color:#20303f"; head.appendChild(ttl);
        var sub = document.createElement("div"); sub.style.cssText = "font-size:11px;color:#8a93a0"; head.appendChild(sub);
        box.appendChild(head);
        var W = box.clientWidth || 420, H = Math.max(140, (box.clientHeight || 200) - 34), PL = 38, PB = 18, PT = 8, PR = 8;
        var svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", height: H, preserveAspectRatio: "none" });
        var data = agg.tot, mx = Math.max.apply(null, data.concat([1]));
        var peakH = data.indexOf(mx), nowH = new Date().getHours();
        var solar = []; for (var sh = 0; sh < 24; sh++) solar[sh] = Math.max(0, Math.sin((sh - 6) / 12 * Math.PI)) * 78;
        sub.innerHTML = tr("пик") + " " + fmt(mx, 0) + " " + tr("кВт") + " · " + peakH + ":00 &nbsp;·&nbsp; <span style='color:#c8901a'>☀ " + tr("солнце") + " " + fmt(solar[nowH], 0) + " " + tr("кВт") + "</span>";
        function X(h) { return PL + h / 23 * (W - PL - PR); }
        function Y(v) { return PT + (1 - v / mx) * (H - PT - PB); }
        // сетка + ось Y
        [0, 0.5, 1].forEach(function (f) { var y = Y(mx * f); svg.appendChild(el("line", { x1: PL, y1: y, x2: W - PR, y2: y, stroke: "#e3e8ee", "stroke-width": 1 })); svg.appendChild(el("text", { x: 4, y: y + 3, fill: "#9aa4b1", "font-size": 9 }, fmt(mx * f, 0))); });
        // солнечная генерация — жёлтая зона под кривой (сколько покрывают панели)
        var sarea = "M" + X(0) + "," + Y(0); for (var s2 = 0; s2 < 24; s2++) sarea += " L" + X(s2) + "," + Y(Math.min(mx, solar[s2])); sarea += " L" + X(23) + "," + Y(0) + " Z";
        svg.appendChild(el("path", { d: sarea, fill: "rgba(255,193,40,0.30)" }));
        // area
        var dpath = "M" + X(0) + "," + Y(data[0]);
        for (var h = 1; h < 24; h++) dpath += " L" + X(h) + "," + Y(data[h]);
        var area = dpath + " L" + X(23) + "," + Y(0) + " L" + X(0) + "," + Y(0) + " Z";
        svg.appendChild(el("path", { d: area, fill: "rgba(31,111,139,0.14)" }));
        svg.appendChild(el("path", { d: dpath, fill: "none", stroke: "#1f6f8b", "stroke-width": 2 }));
        // пик + текущий час
        svg.appendChild(el("circle", { cx: X(peakH), cy: Y(mx), r: 3.5, fill: "#b3261e" }));
        svg.appendChild(el("line", { x1: X(nowH), y1: PT, x2: X(nowH), y2: H - PB, stroke: "#3a9e57", "stroke-width": 1, "stroke-dasharray": "3 3" }));
        // ось X (часы)
        [0, 6, 12, 18, 23].forEach(function (h) { svg.appendChild(el("text", { x: X(h) - 6, y: H - 5, fill: "#9aa4b1", "font-size": 9 }, h + "h")); });
        box.appendChild(svg);
    }

    // ---------- ПЛИТКА 2: тепловая карта установки × часы ----------
    function tileHeat(box, units) {
        box.innerHTML = "";
        var ttl = document.createElement("div"); ttl.textContent = tr("Тепловая карта нагрузки"); ttl.style.cssText = "font-weight:700;font-size:13px;color:#20303f;margin-bottom:4px"; box.appendChild(ttl);
        var W = box.clientWidth || 420, H = Math.max(120, (box.clientHeight || 200) - 26);
        var LB = 96, TOP = 12, BOT = 12, n = units.length;
        var svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", height: H, preserveAspectRatio: "none" });
        var gridW = W - LB - 6, cw = gridW / 24, ch = (H - TOP - BOT) / Math.max(1, n);
        // общий максимум по всем ячейкам — единая шкала цвета
        var mx = 1; units.forEach(function (u) { u.today.forEach(function (v) { if (v > mx) mx = v; }); });
        units.forEach(function (u, r) {
            var y = TOP + r * ch;
            svg.appendChild(el("text", { x: 2, y: y + ch / 2 + 3, fill: "#41505f", "font-size": 9 }, (u.name || "").slice(0, 16)));
            for (var h = 0; h < 24; h++) {
                var rect = el("rect", { x: LB + h * cw, y: y + 0.5, width: Math.max(1, cw - 0.5), height: Math.max(1, ch - 1), fill: ramp(u.today[h] / mx), rx: 1 });
                var t = el("title", {}, u.name + " · " + h + ":00 — " + fmt(u.today[h], 1) + " " + tr("кВт")); rect.appendChild(t);
                svg.appendChild(rect);
            }
        });
        [0, 6, 12, 18, 23].forEach(function (h) { svg.appendChild(el("text", { x: LB + h * cw, y: H - 2, fill: "#9aa4b1", "font-size": 8 }, h + "h")); });
        box.appendChild(svg);
    }

    // ---------- ПЛИТКА 3: сравнение сегодня/вчера ----------
    function tileCompare(box, agg) {
        box.innerHTML = "";
        var sumT = agg.tot.reduce(function (a, b) { return a + b; }, 0), sumP = agg.prev.reduce(function (a, b) { return a + b; }, 0);
        var d = sumP ? (sumT - sumP) / sumP * 100 : 0, up = d >= 0;
        var head = document.createElement("div"); head.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:4px";
        var ttl = document.createElement("div"); ttl.textContent = tr("Сравнение: сегодня / вчера"); ttl.style.cssText = "font-weight:700;font-size:13px;color:#20303f"; head.appendChild(ttl);
        var delta = document.createElement("div"); delta.textContent = (up ? "▲ +" : "▼ ") + fmt(d, 1) + "%"; delta.style.cssText = "font-size:12px;font-weight:800;color:" + (up ? "#b3261e" : "#3a9e57"); head.appendChild(delta);
        box.appendChild(head);
        var W = box.clientWidth || 420, H = Math.max(120, (box.clientHeight || 200) - 34), PL = 34, PB = 16, PT = 8, PR = 8;
        var svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", height: H, preserveAspectRatio: "none" });
        var mx = Math.max(Math.max.apply(null, agg.tot), Math.max.apply(null, agg.prev), 1);
        function X(h) { return PL + h / 23 * (W - PL - PR); }
        function Y(v) { return PT + (1 - v / mx) * (H - PT - PB); }
        [0, 1].forEach(function (f) { var y = Y(mx * f); svg.appendChild(el("line", { x1: PL, y1: y, x2: W - PR, y2: y, stroke: "#e3e8ee", "stroke-width": 1 })); svg.appendChild(el("text", { x: 3, y: y + 3, fill: "#9aa4b1", "font-size": 9 }, fmt(mx * f, 0))); });
        function line(arr, color, dash) { var dp = "M" + X(0) + "," + Y(arr[0]); for (var h = 1; h < 24; h++) dp += " L" + X(h) + "," + Y(arr[h]); svg.appendChild(el("path", { d: dp, fill: "none", stroke: color, "stroke-width": 2, "stroke-dasharray": dash || "" })); }
        line(agg.prev, "#b6c0cc", "4 3");
        line(agg.tot, "#1f6f8b");
        [0, 6, 12, 18, 23].forEach(function (h) { svg.appendChild(el("text", { x: X(h) - 6, y: H - 4, fill: "#9aa4b1", "font-size": 9 }, h + "h")); });
        box.appendChild(svg);
        var leg = document.createElement("div"); leg.style.cssText = "font-size:10px;color:#8a93a0;margin-top:2px";
        leg.innerHTML = '<span style="color:#1f6f8b">━ ' + tr("сегодня") + " " + fmt(sumT, 0) + '</span>&nbsp;&nbsp;<span style="color:#9aa6b3">╌ ' + tr("вчера") + " " + fmt(sumP, 0) + " " + tr("кВт·ч") + "</span>";
        box.appendChild(leg);
    }

    // ---------- ПЛИТКА 4: выводы (авто-инсайты) ----------
    function tileInsights(box, units, agg, head) {
        box.innerHTML = "";
        var ttl = document.createElement("div"); ttl.textContent = tr("Выводы"); ttl.style.cssText = "font-weight:700;font-size:13px;color:#20303f;margin-bottom:6px"; box.appendChild(ttl);
        var mx = Math.max.apply(null, agg.tot.concat([1])), peakH = agg.tot.indexOf(mx);
        var top = units.slice().sort(function (a, b) { return b.p - a.p; })[0] || { name: "—", p: 0 };
        var over = units.filter(function (u) { return u.over > 0; }).sort(function (a, b) { return b.over - a.over; });
        var lowCos = units.filter(function (u) { return u.cos && u.cos < 0.9; });
        var acc = units.filter(function (u) { return u.acc; }), drop = units.filter(function (u) { return u.drop; });
        var items = [], tariff = +head[6] || 6, worst = over[0];
        var penalty = Math.round(lowCos.reduce(function (a, u) { return a + (0.92 - Math.min(0.92, u.cos)); }, 0) * 1400) + lowCos.length * 60;
        var solarNow = Math.round(Math.max(0, Math.sin((new Date().getHours() - 6) / 12 * Math.PI)) * 78);
        var solarSave = Math.round(solarNow * tariff * 2.2), offShift = Math.round(tariff * 44);
        items.push(["📈", tr("Пик потребления") + ": <b>" + fmt(mx, 0) + " " + tr("кВт") + "</b> " + tr("около") + " " + peakH + ":00"]);
        if (worst) items.push(["⚡", "<span style='color:#b06a1e'><b>" + worst.name + "</b>: " + tr("вибрация") + " " + fmt(worst.vib, 1) + " " + tr("мм/с") + " · " + tr("КПД") + " " + worst.eff + "% · +" + worst.fleet + "% " + tr("к парку") + " · +" + fmt(worst.over, 1) + " " + tr("кВт") + " " + tr("к паспорту") + " → " + tr("подшипник") + "</span>"]);
        if (lowCos.length) items.push(["📉", tr("Низкий cos φ") + " (" + lowCos.length + "): " + tr("штраф от сети") + " ~<b>" + penalty + " ₽/" + tr("сут") + "</b>"]);
        items.push(["☀️", "<span style='color:#b06a1e'>" + tr("Солнце") + " " + solarNow + " " + tr("кВт") + ": " + tr("излишки — на доступные линии/заказы/смены по прогнозу") + " → <b>" + tr("до") + " " + solarSave + " ₽/" + tr("сут") + "</b></span>"]);
        if (worst) items.push(["🔧", tr("ТОиР") + " <b>" + worst.name + "</b> — " + tr("в окно наряда, без простоя смены")]);
        items.push(["🌙", tr("Отключение чиллеров/вентиляции вне смены") + " → <b>" + offShift + " ₽/" + tr("сут") + "</b>"]);
        if (acc.length) items.push(["🚨", "<span style='color:#b3261e'>" + tr("Авария") + ": <b>" + acc.map(function (u) { return u.name; }).join(", ") + "</b></span>"]);
        var ul = document.createElement("div");
        items.forEach(function (it) { var d = document.createElement("div"); d.style.cssText = "display:flex;gap:7px;align-items:flex-start;padding:3px 0;font-size:12px;color:#33404d;line-height:1.35"; d.innerHTML = '<span style="font-size:14px">' + it[0] + "</span><span>" + it[1] + "</span>"; ul.appendChild(d); });
        box.appendChild(ul);
    }

    function build(element) {
        var st = { units: [], head: [] };
        element.__edash = st;
        element.style.cssText = "position:relative;overflow:auto;padding:2px";
        var grid = document.createElement("div");
        grid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:10px;font-family:'Segoe UI',sans-serif";
        element.appendChild(grid);
        function tile() { var t = document.createElement("div"); t.style.cssText = "background:#fff;border:1px solid #e6ebf1;border-radius:12px;padding:9px 11px;min-height:190px;box-shadow:0 1px 4px rgba(20,30,45,.05)"; grid.appendChild(t); return t; }
        st.t1 = tile(); st.t2 = tile(); st.t3 = tile(); st.t4 = tile();
        st.redraw = function () {
            if (!st.units.length) { st.t1.innerHTML = st.t2.innerHTML = st.t3.innerHTML = st.t4.innerHTML = '<div style="color:#9aa4b1;font-size:12px;padding:20px;text-align:center">' + tr("нет данных") + "</div>"; return; }
            profiles(st.units); var agg = metrics(st.units);
            tileCurve(st.t1, st.units, agg);
            tileHeat(st.t2, st.units);
            tileCompare(st.t3, agg);
            tileInsights(st.t4, st.units, agg, st.head);
        };
        if (window.ResizeObserver) { var ro = new ResizeObserver(function () { if (st.units.length) st.redraw(); }); ro.observe(element); }
        st.parse = function (data) {
            var recs = (data || "").split("~"); st.head = (recs[0] || "").split("^");
            st.units = [];
            function h32(s) { var h = 2166136261; s = s || ""; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
            for (var i = 1; i < recs.length; i++) {
                var f = recs[i].split("^"); if (f[0] !== "U") continue; var over = +f[8] || 0;
                var u = { name: f[1], shape: f[2], p: +f[3] || 0, q: +f[4] || 0, cos: +f[5] || 0, v: +f[6] || 0, i: +f[7] || 0, over: over, acc: f[9] === "1", drop: f[10] === "1", accText: f[11] || "" };
                u.vib = Math.round((1.1 + h32(f[1] + "vb") * 1.6 + (over > 0 ? 2.6 : 0) + (u.acc ? 1.4 : 0)) * 10) / 10;   // вибрация мм/с
                u.fleet = Math.round((h32(f[1] + "fl") - 0.4) * 16 + (over > 0 ? 12 : 0));                                 // % к парку (др. цеха)
                u.eff = Math.round(87 + h32(f[1] + "ef") * 9 - (over > 0 ? 15 : 0) - (u.acc ? 8 : 0));                     // КПД, %
                st.units.push(u);
            }
            st.redraw();
        };
    }

    return {
        render: function (element) { build(element); },
        update: function (element, controller, value) {
            var s = (typeof value === "string") ? value : ""; if (!s) return;
            var st = element.__edash; if (!st) { build(element); st = element.__edash; }
            if (s === st.last) return; st.last = s; st.parse(s);
        }
    };
}
