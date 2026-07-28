// Аналитический дашборд участка ВЛФ (демо, ТЗ Академфарм). 6 плиток: OEE, статус, производительность,
// узкое место + предиктивное ТОиР, тренды, выводы+рекомендации. Всё считается на клиенте из снимка vlfData.
function vlfdash() {
    var tr = window.miteTr || String, NS = "http://www.w3.org/2000/svg";
    function el(t, a, x) { var e = document.createElementNS(NS, t); for (var k in a) e.setAttribute(k, a[k]); if (x != null) e.textContent = x; return e; }
    function fmt(v, d) { var n = +v; return isNaN(n) ? "0" : n.toFixed(d == null ? 0 : d); }
    function oeeColor(o) { return o >= 85 ? "#3a9e57" : o >= 70 ? "#d9a441" : "#b3261e"; }
    function rnd(s) { var x = 2166136261; for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = (x * 16777619) >>> 0; } return (x % 1000) / 1000; }
    var STc = { 1: "#3a9e57", 2: "#d9a441", 3: "#b3261e" }, SMAP = { run: 1, idle: 2, alarm: 3 };

    // синтетические производные (демо): номинальный темп, факт. выпуск, ресурс до ТО
    function derive(u) {
        u.rate = Math.round(600 + rnd(u.name) * 900);            // номинал шт/час
        u.out = Math.round(u.rate * u.oee / 100);                // факт шт/час
        u.yield = Math.max(0, 100 - u.defect);
        u.cycle = u.out ? (3600 / u.out) : 0;                    // сек/шт
        u.maintH = u.alarm ? 0 : Math.round(8 + rnd(u.name + "m") * 260); // ч до ТО
    }

    // ПЛИТКА 1: OEE по аппаратам
    function tileOEE(box, us) {
        box.innerHTML = ""; var h = document.createElement("div"); h.textContent = tr("OEE по аппаратам"); h.style.cssText = "font-weight:700;font-size:13px;color:#20303f;margin-bottom:6px"; box.appendChild(h);
        var W = box.clientWidth || 420, rh = 25, H = us.length * rh + 6, LB = 168, bw = W - LB - 52;
        var svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", height: H });
        us.forEach(function (u, i) { var y = i * rh + 4; svg.appendChild(el("text", { x: 0, y: y + 14, fill: "#41505f", "font-size": 11 }, (i + 1) + ". " + (u.name || "").slice(0, 22))); svg.appendChild(el("rect", { x: LB, y: y + 3, width: bw, height: 13, rx: 4, fill: "#e7ecf2" })); svg.appendChild(el("rect", { x: LB, y: y + 3, width: Math.max(2, bw * Math.min(1, u.oee / 100)), height: 13, rx: 4, fill: oeeColor(u.oee) })); svg.appendChild(el("text", { x: W - 2, y: y + 14, fill: "#33404d", "font-size": 11, "text-anchor": "end", "font-weight": 700 }, fmt(u.oee, 0) + "%")); });
        box.appendChild(svg);
    }

    // ПЛИТКА 2: статус (донат)
    function tileStatus(box, us, head) {
        box.innerHTML = ""; var h = document.createElement("div"); h.textContent = tr("Статус участка"); h.style.cssText = "font-weight:700;font-size:13px;color:#20303f;margin-bottom:4px"; box.appendChild(h);
        var run = +head[4] || 0, idle = +head[5] || 0, al = +head[6] || 0, tot = run + idle + al || 1;
        var W = box.clientWidth || 300, H = Math.max(150, (box.clientHeight || 200) - 40), cx = 92, cy = H / 2, R = Math.min(cy - 8, 60), r0 = R - 20;
        var svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", height: H }), a0 = -Math.PI / 2;
        [[run, STc[1]], [idle, STc[2]], [al, STc[3]]].forEach(function (s) { if (!s[0]) return; var a1 = a0 + s[0] / tot * 6.2832; var big = (a1 - a0) > Math.PI ? 1 : 0; svg.appendChild(el("path", { d: "M" + (cx + R * Math.cos(a0)) + "," + (cy + R * Math.sin(a0)) + " A" + R + "," + R + " 0 " + big + " 1 " + (cx + R * Math.cos(a1)) + "," + (cy + R * Math.sin(a1)) + " L" + (cx + r0 * Math.cos(a1)) + "," + (cy + r0 * Math.sin(a1)) + " A" + r0 + "," + r0 + " 0 " + big + " 0 " + (cx + r0 * Math.cos(a0)) + "," + (cy + r0 * Math.sin(a0)) + " Z", fill: s[1] })); a0 = a1; });
        svg.appendChild(el("text", { x: cx, y: cy - 2, fill: "#20303f", "font-size": 19, "font-weight": 800, "text-anchor": "middle" }, "" + tot));
        svg.appendChild(el("text", { x: cx, y: cy + 14, fill: "#8a93a0", "font-size": 10, "text-anchor": "middle" }, tr("аппаратов")));
        [[tr("Работа"), run, STc[1]], [tr("Простой"), idle, STc[2]], [tr("Авария"), al, STc[3]]].forEach(function (l, i) { var y = cy - 24 + i * 22; svg.appendChild(el("rect", { x: cx + 76, y: y, width: 11, height: 11, rx: 2, fill: l[2] })); svg.appendChild(el("text", { x: cx + 93, y: y + 10, fill: "#41505f", "font-size": 12 }, l[0] + ": " + l[1])); });
        box.appendChild(svg);
    }

    // ПЛИТКА 3: производительность / выход
    function tilePerf(box, us, head) {
        box.innerHTML = ""; var h = document.createElement("div"); h.textContent = tr("Производительность и выход"); h.style.cssText = "font-weight:700;font-size:13px;color:#20303f;margin-bottom:8px"; box.appendChild(h);
        var run = us.filter(function (u) { return u.status === 1; });
        var lineOut = run.length ? Math.min.apply(null, run.map(function (u) { return u.out; })) : 0; // выпуск ограничен узким местом
        var avgYield = us.length ? us.reduce(function (a, u) { return a + u.yield; }, 0) / us.length : 0;
        var cycle = lineOut ? 3600 / lineOut : 0;
        var kpis = [[tr("Выпуск линии"), fmt(lineOut, 0) + " шт/ч", "#1f6f8b"], [tr("Выход годного"), fmt(avgYield, 1) + " %", "#3a9e57"], [tr("Время цикла"), fmt(cycle, 1) + " с", "#7a5aa0"], [tr("Простои"), (head[2] || "0") + " " + tr("мин"), "#b06a1e"]];
        var g = document.createElement("div"); g.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:10px";
        kpis.forEach(function (k) { var d = document.createElement("div"); d.style.cssText = "background:#f4f7fa;border-radius:9px;padding:9px 11px"; d.innerHTML = '<div style="font-size:10px;color:#8a93a0">' + k[0] + '</div><div style="font-size:19px;font-weight:800;color:' + k[2] + '">' + k[1] + '</div>'; g.appendChild(d); });
        box.appendChild(g);
        var note = document.createElement("div"); note.style.cssText = "font-size:11px;color:#8a93a0;margin-top:8px"; note.textContent = tr("Выпуск линии ограничен самым медленным аппаратом (узкое место)."); box.appendChild(note);
    }

    // ПЛИТКА 4: узкое место + предиктивное ТОиР
    function tileBottleneck(box, us) {
        box.innerHTML = ""; var h = document.createElement("div"); h.textContent = tr("Узкое место · предиктивное ТОиР"); h.style.cssText = "font-weight:700;font-size:13px;color:#20303f;margin-bottom:8px"; box.appendChild(h);
        var run = us.filter(function (u) { return u.status === 1; });
        var bn = run.slice().sort(function (a, b) { return a.out - b.out; })[0];
        if (bn) { var d = document.createElement("div"); d.style.cssText = "background:#fdeee9;border:1px solid #f3c9b8;border-radius:9px;padding:9px 11px;margin-bottom:9px"; d.innerHTML = '<div style="font-size:10px;color:#b06a1e;font-weight:700">🔻 ' + tr("УЗКОЕ МЕСТО") + '</div><div style="font-size:13px;color:#33404d;margin-top:2px"><b>' + bn.name + '</b> — ' + fmt(bn.out, 0) + ' ' + tr("шт/ч") + ', OEE ' + fmt(bn.oee, 0) + '%. ' + tr("Ограничивает выпуск линии.") + '</div>'; box.appendChild(d); }
        // предиктивное ТОиР — ближайшие
        var maint = us.slice().sort(function (a, b) { return a.maintH - b.maintH; }).slice(0, 3);
        var ul = document.createElement("div");
        maint.forEach(function (u) { var soon = u.maintH === 0, near = u.maintH > 0 && u.maintH <= 24; var col = soon ? "#b3261e" : near ? "#d9821f" : "#3a9e57"; var txt = soon ? tr("очистка фильтра требуется сейчас") : (tr("плановое ТО через") + " ~" + u.maintH + " " + tr("ч")); var r = document.createElement("div"); r.style.cssText = "display:flex;justify-content:space-between;gap:10px;padding:3px 0;font-size:12px;color:#33404d;border-top:1px solid #eef1f5"; r.innerHTML = '<span>' + (soon ? "🛠 " : "🕒 ") + u.name + '</span><span style="color:' + col + ';font-weight:700;text-align:right">' + txt + '</span>'; ul.appendChild(r); });
        box.appendChild(ul);
    }

    // ПЛИТКА 5: тренды параметров (спарклайны, синтез демо)
    function tileTrends(box, us) {
        box.innerHTML = ""; var h = document.createElement("div"); h.textContent = tr("Тренды OEE (за смену)"); h.style.cssText = "font-weight:700;font-size:13px;color:#20303f;margin-bottom:6px"; box.appendChild(h);
        var W = box.clientWidth || 420, rh = 26, H = us.length * rh + 6, LB = 168, sw = W - LB - 46, N = 14;
        var svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", height: H });
        us.forEach(function (u, i) {
            var y = i * rh + 4, ser = [];
            for (var t = 0; t < N; t++) { var base = u.oee, v = Math.max(0, Math.min(100, base + (rnd(u.name + "t" + t) - 0.5) * 18 - (N - 1 - t) * 0.4)); ser.push(v); }
            ser[N - 1] = u.oee;
            svg.appendChild(el("text", { x: 0, y: y + 15, fill: "#41505f", "font-size": 11 }, (i + 1) + ". " + (u.name || "").slice(0, 20)));
            var dp = "", mx = 100; ser.forEach(function (v, t) { var X = LB + t / (N - 1) * sw, Y = y + 3 + (1 - v / mx) * (rh - 8); dp += (t ? " L" : "M") + X.toFixed(1) + "," + Y.toFixed(1); });
            svg.appendChild(el("path", { d: dp, fill: "none", stroke: oeeColor(u.oee), "stroke-width": 1.6 }));
            svg.appendChild(el("circle", { cx: LB + sw, cy: y + 3 + (1 - u.oee / 100) * (rh - 8), r: 2.6, fill: oeeColor(u.oee) }));
            svg.appendChild(el("text", { x: W - 2, y: y + 15, fill: "#33404d", "font-size": 10, "text-anchor": "end" }, fmt(u.oee, 0) + "%"));
        });
        box.appendChild(svg);
    }

    // ПЛИТКА 1С:ERP (во всю ширину) — задание/рецептура из 1С + влияние поставщика сырья
    function tile1C(box, head) {
        box.innerHTML = "";
        var h = document.createElement("div"); h.textContent = tr("Связь с 1С:ERP"); h.style.cssText = "font-weight:700;font-size:13px;color:#20303f;margin-bottom:9px"; box.appendChild(h);
        var g = document.createElement("div"); g.style.cssText = "display:grid;grid-template-columns:1.15fr 1fr;gap:14px";
        var left = document.createElement("div"); left.style.cssText = "background:#eef3fb;border:1px solid #d7e2f2;border-radius:10px;padding:11px 13px";
        left.innerHTML = '<div style="font-size:11px;color:#3a6ea5;font-weight:700">📥 ' + tr("Задание и рецептура из 1С") + '</div>'
            + '<div style="font-size:13px;color:#33404d;margin-top:5px;line-height:1.55"><b>' + (head[7] || "—") + '</b><br>'
            + tr("План") + ': <b>250 000</b> ' + tr("табл.") + ' · ' + tr("рецептура") + ' <b>6</b> ' + tr("компонентов") + ' · ' + tr("норма загрузки из 1С") + '</div>';
        var right = document.createElement("div"); right.style.cssText = "background:#eafaf0;border:1px solid #bfe7cd;border-radius:10px;padding:11px 13px";
        right.innerHTML = '<div style="font-size:11px;color:#2e8b57;font-weight:700">🏭 ' + tr("Смена поставщика сырья") + '</div>'
            + '<div style="font-size:13px;color:#33404d;margin-top:5px;line-height:1.55"><b>' + tr("АФС «Фарма-Синтез» (новый)") + '</b><br>'
            + '<span style="color:#3a9e57;font-weight:700">▲ ' + tr("выход годного") + ' +2.3%</span> · <span style="color:#3a9e57;font-weight:700">OEE +1.8%</span> · ' + tr("брак") + ' <span style="color:#3a9e57">−0.4%</span> ' + tr("к прошлой серии") + '</div>';
        g.appendChild(left); g.appendChild(right); box.appendChild(g);
    }

    // ПЛИТКА 6: выводы и рекомендации
    function tileReco(box, us, head) {
        box.innerHTML = ""; var h = document.createElement("div"); h.textContent = tr("Выводы и рекомендации"); h.style.cssText = "font-weight:700;font-size:13px;color:#20303f;margin-bottom:6px"; box.appendChild(h);
        var items = [];
        items.push(["🏭", tr("Серия") + ": <b>" + (head[7] || "—") + "</b> · " + tr("средний OEE") + " <b>" + fmt(head[1], 0) + "%</b>"]);
        us.forEach(function (u) {
            if (u.alarm) items.push(["🚨", "<span style='color:#b3261e'><b>" + u.name + "</b>: " + (u.alarmText || tr("авария")) + " → <b>" + tr("очистить фильтр, проверить хладагент") + "</b></span>"]);
            else if (u.status === 2) items.push(["⏸️", "<span style='color:#b06a1e'><b>" + u.name + "</b>: " + tr("простой (переналадка) → завершить и вернуть в работу") + "</span>"]);
            else if (u.defect > 1.2) items.push(["⚠️", "<b>" + u.name + "</b>: " + tr("повышенный брак") + " " + fmt(u.defect, 1) + "% → " + tr("проверить параметры режима")]);
        });
        if (items.length === 1) items.push(["✅", "<span style='color:#3a9e57'>" + tr("Отклонений нет, режим в норме") + "</span>"]);
        var ul = document.createElement("div");
        items.slice(0, 6).forEach(function (it) { var d = document.createElement("div"); d.style.cssText = "display:flex;gap:7px;align-items:flex-start;padding:3px 0;font-size:12px;color:#33404d;line-height:1.35"; d.innerHTML = '<span style="font-size:14px">' + it[0] + "</span><span>" + it[1] + "</span>"; ul.appendChild(d); });
        box.appendChild(ul);
    }

    function build(element) {
        var st = { units: [], head: [] }; element.__vdash = st;
        element.style.cssText = "position:relative;overflow:auto;padding:2px";
        var grid = document.createElement("div"); grid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:10px;font-family:'Segoe UI',sans-serif"; element.appendChild(grid);
        function tile(wide) { var t = document.createElement("div"); t.style.cssText = "background:#fff;border:1px solid #e6ebf1;border-radius:12px;padding:9px 11px;min-height:" + (wide ? "70px" : "180px") + ";box-shadow:0 1px 4px rgba(20,30,45,.05)" + (wide ? ";grid-column:1/-1" : ""); grid.appendChild(t); return t; }
        st.erp = tile(true);           // 1С:ERP — во всю ширину сверху
        st.t = [tile(), tile(), tile(), tile(), tile(), tile()];
        st.redraw = function () {
            if (!st.units.length) { st.t.forEach(function (t) { t.innerHTML = '<div style="color:#9aa4b1;font-size:12px;padding:20px;text-align:center">' + tr("нет данных") + "</div>"; }); return; }
            st.units.forEach(derive);
            tile1C(st.erp, st.head);
            tileOEE(st.t[0], st.units); tileStatus(st.t[1], st.units, st.head); tilePerf(st.t[2], st.units, st.head);
            tileBottleneck(st.t[3], st.units); tileTrends(st.t[4], st.units); tileReco(st.t[5], st.units, st.head);
        };
        if (window.ResizeObserver) { new ResizeObserver(function () { if (st.units.length) st.redraw(); }).observe(element); }
        st.parse = function (data) {
            var recs = (data || "").split("~"); st.head = (recs[0] || "").split("^"); st.units = [];
            for (var i = 1; i < recs.length; i++) { var f = recs[i].split("^"); if (f[0] !== "U") continue; st.units.push({ name: f[1], status: SMAP[f[2]] || 1, oee: +f[3] || 0, temp: +f[4] || 0, rpm: +f[5] || 0, press: +f[6] || 0, hum: +f[7] || 0, down: +f[8] || 0, defect: +f[9] || 0, vendor: f[10] || "", alarm: f[11] === "1", alarmText: f[12] || "", params: f[13] || "", stage: f[14] || "" }); }
            st.redraw();
        };
    }
    return {
        render: function (element) { build(element); },
        update: function (element, controller, value) { var s = (typeof value === "string") ? value : ""; if (!s) return; var st = element.__vdash; if (!st) { build(element); st = element.__vdash; } if (s === st.last) return; st.last = s; st.parse(s); }
    };
}
