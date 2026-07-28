// Универсальный 3D-слой энергомониторинга. Работает на ЛЮБЫХ объектах (цех/склад/коровник):
// каждая установка = блок в авто-сетке, высота + цвет по ВЫБРАННОЙ метрике (переключатель слоёв),
// клик → подсказка со всеми электрическими показателями, снизу — сводка дня.
// Данные (evData): 'E^sumP^sumQ^accidents^voltDrops^loss^tariff' + '~' + U^-записи установок:
//   U^name^shape^activeP(W)^reactiveQ(VAR)^cosPhi^voltage(V)^current(A)^overKw^acc(0/1)^drop(0/1)^accText
// потери на установку считаем тут: overKw × 24 × tariff (тариф — общий скаляр из заголовка).
function energy3d() {
    var tr = window.miteTr || String;

    // определения слоёв: value(u) → число для высоты/нормировки; color(v,max,u) → цвет
    function ramp(t) { // 0..1 → зелёный→жёлтый→красный
        t = Math.max(0, Math.min(1, t));
        var r = t < 0.5 ? Math.round(60 + t * 2 * 195) : 255;
        var g = t < 0.5 ? 190 : Math.round(190 - (t - 0.5) * 2 * 175);
        return (r << 16) | (g << 8) | 40;
    }
    var LAYERS = [
        { key: "power", label: "Активная P", unit: "кВт", val: function (u) { return u.p / 1000; }, color: function (u, mx) { return ramp(mx ? (u.p / 1000) / mx : 0); } },
        { key: "react", label: "Реактивная Q", unit: "квар", val: function (u) { return u.q / 1000; }, color: function (u, mx) { return ramp(mx ? (u.q / 1000) / mx : 0); } },
        { key: "volt", label: "Напряжение U", unit: "В", val: function (u) { return u.v; }, color: function (u) { var d = Math.abs(u.v - 230); return u.drop ? 0xb3261e : ramp(Math.min(1, d / 20)); } },
        { key: "cos", label: "cos φ", unit: "", val: function (u) { return u.cos; }, color: function (u) { return ramp(Math.min(1, Math.max(0, (0.95 - u.cos) / 0.25))); } },
        { key: "over", label: "Перерасход", unit: "кВт", val: function (u) { return u.over; }, color: function (u, mx) { return u.over > 0 ? ramp(0.4 + (mx ? 0.6 * u.over / mx : 0)) : 0x3a9e57; } },
        { key: "acc", label: "Аварии", unit: "", val: function (u) { return u.acc ? 1 : 0; }, color: function (u) { return u.acc ? 0xb3261e : (u.drop ? 0xd9a441 : 0x3a9e57); } }
    ];

    function mk(THREE, geo, color) { return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: new THREE.Color(color) })); }
    function label(THREE, text, color) {
        var c = document.createElement("canvas"); c.width = 256; c.height = 64; var x = c.getContext("2d");
        x.fillStyle = color || "#20303f"; x.font = "bold 28px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
        x.fillText((text || "").slice(0, 18), 128, 32);
        var t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter;
        var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true })); s.scale.set(30, 7.5, 1);
        return s;
    }

    function build(element) {
        var THREE = window.THREE;
        var st = { THREE: THREE, units: [], layer: 0, meshes: [], raycast: [] };
        element.__e3d = st;
        var scene = new THREE.Scene(); scene.background = new THREE.Color(0xeef2f7);
        var camera = new THREE.PerspectiveCamera(45, 1, 1, 12000);
        var renderer = new THREE.WebGLRenderer({ antialias: true }); st.renderer = renderer;
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        element.appendChild(renderer.domElement);
        renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        scene.add(new THREE.HemisphereLight(0xdfe8f2, 0x6b7480, 0.45));                 // мягкий фон — металл фигур читается объёмнее
        var dl = new THREE.DirectionalLight(0xffffff, 0.72); dl.position.set(0.6, 1, 0.4); scene.add(dl);
        var dl2 = new THREE.DirectionalLight(0xffffff, 0.28); dl2.position.set(-0.5, 0.55, -0.4); scene.add(dl2);
        var world = new THREE.Group(); scene.add(world); st.world = world;

        var orbit = { target: new THREE.Vector3(0, 8, 0), radius: 360, theta: -0.7, phi: 0.82 };
        st.applyCamera = function () {
            var r = orbit.radius, p = orbit.phi, t = orbit.theta;
            camera.position.set(orbit.target.x + r * Math.sin(p) * Math.sin(t), orbit.target.y + r * Math.cos(p), orbit.target.z + r * Math.sin(p) * Math.cos(t));
            camera.lookAt(orbit.target);
        };
        st.resize = function () { var w = element.clientWidth || 800, h = element.clientHeight || 520; if (h < 60) h = 520; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); st.applyCamera(); };
        if (window.ResizeObserver) { new ResizeObserver(st.resize).observe(element); }

        // ---- переключатель слоёв (метрик) ----
        var bar = document.createElement("div");
        bar.style.cssText = "position:absolute;left:50%;top:10px;transform:translateX(-50%);z-index:6;display:flex;gap:5px;flex-wrap:wrap;justify-content:center;max-width:96%;background:rgba(18,26,36,0.88);padding:6px 9px;border-radius:10px;font-family:'Segoe UI',sans-serif";
        st.tabs = [];
        LAYERS.forEach(function (lay, i) {
            var b = document.createElement("div");
            b.textContent = tr(lay.label);
            b.style.cssText = "cursor:pointer;color:#cfd8e3;font-size:12px;padding:5px 10px;border-radius:7px";
            b.onclick = function () { st.layer = i; st.applyLayer(); };
            bar.appendChild(b); st.tabs.push(b);
        });
        element.appendChild(bar);

        // ---- сводка дня (снизу) ----
        var foot = document.createElement("div");
        foot.style.cssText = "position:absolute;left:0;right:0;bottom:0;z-index:6;display:flex;gap:0;justify-content:center;flex-wrap:wrap;background:rgba(18,26,36,0.9);padding:8px 6px;font-family:'Segoe UI',sans-serif";
        element.appendChild(foot); st.foot = foot;

        // ---- легенда цвета ----
        var leg = document.createElement("div");
        leg.style.cssText = "position:absolute;right:10px;top:56px;z-index:6;font-size:11px;color:#5a6675;font-family:'Segoe UI',sans-serif;background:rgba(255,255,255,.75);padding:5px 8px;border-radius:8px";
        leg.innerHTML = '<div style="width:120px;height:9px;border-radius:5px;background:linear-gradient(90deg,#3cbe28,#ffbe28,#ff1e28)"></div><div style="display:flex;justify-content:space-between"><span>' + tr("норма") + '</span><span>' + tr("критично") + '</span></div>';
        element.appendChild(leg);

        // ---- подсказка (клик по установке) ----
        var tip = document.createElement("div");
        tip.style.cssText = "position:absolute;z-index:8;display:none;min-width:230px;background:rgba(15,23,34,0.96);color:#e6edf5;font-family:'Segoe UI',sans-serif;font-size:12px;padding:11px 13px;border-radius:11px;box-shadow:0 8px 26px rgba(0,0,0,.4);pointer-events:none";
        element.appendChild(tip); st.tip = tip;
        function fmt(v, d) { var n = +v; return isNaN(n) ? "0" : n.toFixed(d == null ? 0 : d); }
        st.showTip = function (u, sx, sy) {
            var rows;
            if (u.kind === "solar") rows = [[tr("Генерация сейчас"), fmt(u.gen, 0) + " " + tr("кВт")], [tr("Мощность станции"), fmt(u.cap, 0) + " " + tr("кВт")], [tr("Покрытие нагрузки"), fmt(Math.min(99, u.gen / 96 * 100), 0) + " %"]];
            else if (u.kind === "battery") rows = [[tr("Заряд"), fmt(u.soc, 0) + " %"], [tr("Поток"), (u.flow >= 0 ? "+" : "") + fmt(u.flow, 0) + " " + tr("кВт") + (u.flow >= 0 ? " " + tr("заряд") : " " + tr("разряд"))], [tr("Ёмкость"), fmt(u.cap, 0) + " " + tr("кВт·ч")]];
            else rows = [
                [tr("Активная P"), fmt(u.p / 1000, 1) + " " + tr("кВт")],
                [tr("Паспорт"), fmt(u.pass, 0) + " " + tr("кВт")],
                [tr("КПД"), fmt(u.eff, 0) + " %" + (u.eff < 78 ? " ⚠" : "")],
                [tr("cos φ"), fmt(u.cos, 2)],
                [tr("Вибрация"), fmt(u.vib, 1) + " " + tr("мм/с") + (u.vib > 4 ? " ⚠" : "")],
                [tr("К парку (др. цеха)"), (u.fleet >= 0 ? "+" : "") + fmt(u.fleet, 0) + " %"],
                [tr("Перерасход"), fmt(u.over, 1) + " " + tr("кВт")],
                [tr("Потери"), fmt(u.loss, 0) + " " + tr("₽/сут")]
            ];
            var col = u.kind === "solar" ? "#ffd54a" : u.kind === "battery" ? "#7fe0a0" : "#8fd0ff";
            var html = '<div style="font-weight:800;font-size:13px;margin-bottom:6px;color:' + col + '">' + (u.name || "?") + '</div>';
            rows.forEach(function (r) { html += '<div style="display:flex;justify-content:space-between;gap:14px;padding:1px 0"><span style="color:#93a1b3">' + r[0] + '</span><b>' + r[1] + '</b></div>'; });
            if (u.acc) html += '<div style="margin-top:6px;color:#ff8a80;font-weight:700">⚠ ' + tr("Авария") + (u.accText ? ": " + u.accText : "") + '</div>';
            else if (u.over > 0 && u.vib > 4) html += '<div style="margin-top:6px;color:#ff8a80;font-weight:700">⚠ ' + tr("Аномалия: вибрация + КПД↓ + выше парка → подшипник") + '</div>';
            else if (u.drop) html += '<div style="margin-top:6px;color:#ffcc66;font-weight:700">⚠ ' + tr("Провал напряжения") + '</div>';
            tip.innerHTML = html;
            tip.style.display = "block";
            var w = element.clientWidth || 800;
            tip.style.left = Math.min(sx + 14, w - 250) + "px"; tip.style.top = Math.max(56, sy - 20) + "px";
        };
        st.project = function (u) { var v = new THREE.Vector3(u.px || 0, 16, u.pz || 0); v.project(camera); var r = renderer.domElement.getBoundingClientRect(); return { x: (v.x * 0.5 + 0.5) * r.width, y: (-v.y * 0.5 + 0.5) * r.height }; };

        st.applyLayer = function () {
            var lay = LAYERS[st.layer];
            st.tabs.forEach(function (b, i) { b.style.background = i === st.layer ? "#1f6f8b" : "transparent"; b.style.color = i === st.layer ? "#fff" : "#cfd8e3"; });
            var mx = 0; st.units.forEach(function (u) { var v = lay.val(u); if (v > mx) mx = v; });
            st.meshes.forEach(function (p) {
                var col = new THREE.Color(lay.color(p.u, mx));   // цвет по метрике (высоту не морфим — фигуры)
                p.bodies.forEach(function (b) { b.userData.targetColor = col; });
            });
        };

        st.rebuild = function (data) {
            while (world.children.length) world.remove(world.children[0]);
            st.units = []; st.meshes = []; st.raycast = [];
            var recs = (data || "").split("~");
            var head = (recs[0] || "").split("^"); // E^P^Q^acc^drop^loss^tariff
            st.tariff = +head[6] || 0;
            // сводка дня
            var kpis = [
                [tr("Активная P"), (head[1] || "0") + " " + tr("кВт"), "#1f6f8b"],
                [tr("Реактивная Q"), (head[2] || "0") + " " + tr("квар"), "#7a5aa0"],
                [tr("Аварии"), (head[3] || "0"), (+head[3] > 0 ? "#b3261e" : "#3a9e57")],
                [tr("Провалы U"), (head[4] || "0"), (+head[4] > 0 ? "#b3261e" : "#3a9e57")],
                [tr("Потери"), (head[5] || "0") + " " + tr("₽/сут"), "#b3261e"]
            ];
            st.foot.innerHTML = kpis.map(function (k) {
                return '<div style="text-align:center;padding:0 16px;border-right:1px solid rgba(255,255,255,.12)"><div style="font-size:10px;color:#8a93a0">' + k[0] + '</div><div style="font-size:18px;font-weight:800;color:' + k[2] + '">' + k[1] + '</div></div>';
            }).join("");

            function h32(s) { var h = 2166136261; s = s || ""; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
            for (var i = 1; i < recs.length; i++) {
                var f = recs[i].split("^");
                if (f[0] !== "U") continue;
                var over = +f[8] || 0;
                var u = { name: f[1], shape: f[2], p: +f[3] || 0, q: +f[4] || 0, cos: +f[5] || 0, v: +f[6] || 0, i: +f[7] || 0, over: over, loss: over * 24 * st.tariff, acc: f[9] === "1", drop: f[10] === "1", accText: f[11] || "" };
                // синтетические сигналы: вибрация (мм/с) и отклонение от парка (такие же агрегаты в др. цехах)
                u.vib = Math.round((1.1 + h32(f[1] + "vb") * 1.6 + (over > 0 ? 2.6 : 0) + (u.acc ? 1.4 : 0)) * 10) / 10;
                u.fleet = Math.round((h32(f[1] + "fl") - 0.4) * 16 + (over > 0 ? 12 : 0));   // % к парку (др. цеха)
                u.eff = Math.round(87 + h32(f[1] + "ef") * 9 - (over > 0 ? 15 : 0) - (u.acc ? 8 : 0));   // КПД, %
                u.pass = Math.round(Math.max(1, u.p / 1000 - over));                          // паспорт, кВт
                st.units.push(u);
            }
            // солнечная станция + накопитель (синтез по солнечной кривой текущего часа) — как элементы генерации/накопления
            var hr = new Date().getHours();
            var solarGen = Math.round(Math.max(0, Math.sin((hr - 6) / 12 * Math.PI)) * 78);
            var solarU = { name: "Солнечная станция", kind: "solar", gen: solarGen, cap: 80 };
            var battU = { name: "Накопитель", kind: "battery", soc: 58, flow: solarGen > 34 ? 18 : -14, cap: 120 };
            st.extras = [solarU, battU];

            // расстановка как в реальном цеху: разные габариты (компрессор длинный, чиллер широкий, конвейеры узкие),
            // машины ПАРАЛЛЕЛЬНЫ, но ряды РАЗНОЙ длины (контур зала неровный). Упаковка по ширине.
            function footprint(name) {
                var k = (name || "").toLowerCase();
                if (/компрессор|compressor|насос|pump/.test(k)) return { w: 42, d: 20 };
                if (/чиллер|кондицион|холодильн|chiller|refriger|cooling/.test(k)) return { w: 34, d: 26 };
                if (/запайк|sealer|этикет|label/.test(k)) return { w: 40, d: 16 };
                if (/упаков|packer/.test(k)) return { w: 30, d: 20 };
                if (/дозатор|doser/.test(k)) return { w: 20, d: 20 };
                if (/солн|solar/.test(k)) return { w: 38, d: 30 };
                if (/накопит|battery|storage/.test(k)) return { w: 22, d: 20 };
                return { w: 27, d: 25 };
            }
            function fallbackFig(u) { var g = new THREE.Group(), b = mk(THREE, new THREE.BoxGeometry(20, 24, 20), 0x8b939d); b.position.y = 12; g.add(b); return { group: g, bodies: [b] }; }
            var placeList = st.units.concat(st.extras), gap = 15, ROWW = 250;
            var rowsArr = [[]], rw = 0;
            placeList.forEach(function (u) { var fw = footprint(u.name).w + gap; if (rw + fw > ROWW && rowsArr[rowsArr.length - 1].length) { rowsArr.push([]); rw = 0; } rowsArr[rowsArr.length - 1].push(u); rw += fw; });
            var GZ = 62, z0 = -(rowsArr.length - 1) / 2 * GZ, maxRowW = 1;
            rowsArr.forEach(function (row, ri) {
                var totalW = row.reduce(function (a, u) { return a + footprint(u.name).w + gap; }, 0) - gap; if (totalW > maxRowW) maxRowW = totalW;
                var rowOff = (h32("ro" + ri) - 0.5) * 46;                                  // сдвиг ряда → здоровая асимметрия
                var x = -totalW / 2 + rowOff, ang = (ri % 2) ? Math.PI : 0;
                var pz0 = z0 + ri * GZ + (h32("rz" + ri) - 0.5) * 14;                      // разный зазор между рядами
                row.forEach(function (u) {
                    var fp = footprint(u.name), px = x + fp.w / 2; x += fp.w + gap;
                    var pz = pz0 + (h32(u.name + "z") - 0.5) * 5;
                    u.px = px; u.pz = pz;   // сохранить позицию — для проекции на экран (клик/курсор/карточка)
                    var fig = (window.miteShapeLib || fallbackFig)(THREE, u.name, u.kind === "solar" ? 24 : 30);
                    var sy = 0.85 + Math.min(0.55, (fp.w * fp.d / 672 - 1) * 0.5);         // крупнее по площади — заметно больше/выше
                    fig.group.position.set(px, 0, pz); fig.group.rotation.y = ang;
                    fig.group.scale.set(fp.w / 28, u.kind ? 1 : sy, fp.d / 24);            // масштаб по «следу» → РАЗНАЯ площадь
                    world.add(fig.group);
                    fig.group.traverse(function (o) { if (o.isMesh) { o.userData.u = u; st.raycast.push(o); } });
                    st.meshes.push({ u: u, bodies: fig.bodies });   // у солнца/накопителя bodies пуст → не красятся по метрике
                    var pad = mk(THREE, new THREE.BoxGeometry(fp.w + 6, 2, fp.d + 6), 0xd7dee6); pad.position.set(px, -1, pz); pad.rotation.y = ang; world.add(pad);
                });
            });
            if (placeList.length) { orbit.target.set(0, 8, 0); orbit.radius = Math.max(maxRowW, rowsArr.length * GZ) * 0.95 + 130; } else { orbit.radius = 300; }
            st.applyLayer(); st.applyCamera(); st.resize();
        };

        // ---- управление камерой + клик ----
        var dr = null;
        st.auto = true; st.lastInter = 0; // мягкое авто-вращение «живого двойника», пауза после действий пользователя
        function nudge() { st.lastInter = (window.performance && performance.now) ? performance.now() : 0; }
        renderer.domElement.addEventListener("mousedown", function (e) { nudge(); dr = { x: e.clientX, y: e.clientY, t: orbit.theta, p: orbit.phi, moved: false }; });
        window.addEventListener("mousemove", function (e) {
            if (!dr) return; var dx = e.clientX - dr.x, dy = e.clientY - dr.y;
            if (Math.abs(dx) + Math.abs(dy) > 3) dr.moved = true;
            orbit.theta = dr.t - dx * 0.006; orbit.phi = Math.max(0.25, Math.min(1.45, dr.p - dy * 0.006)); st.applyCamera();
        });
        window.addEventListener("mouseup", function () { dr = null; });
        renderer.domElement.addEventListener("wheel", function (e) { e.preventDefault(); nudge(); orbit.radius = Math.max(80, Math.min(2600, orbit.radius * (e.deltaY > 0 ? 1.1 : 0.9))); st.applyCamera(); }, { passive: false });
        renderer.domElement.addEventListener("click", function (e) {
            if (dr && dr.moved) return;
            nudge();
            var rect = renderer.domElement.getBoundingClientRect();
            var mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
            var ray = new THREE.Raycaster(); ray.setFromCamera(mouse, camera);
            var hit = ray.intersectObjects(st.raycast, false)[0];
            if (hit && hit.object.userData.u) st.showTip(hit.object.userData.u, e.clientX - rect.left, e.clientY - rect.top);
            else st.tip.style.display = "none";
        });

        (function loop() {
            requestAnimationFrame(loop);
            // плавная перекраска фигур по выбранной метрике
            for (var i = 0; i < st.meshes.length; i++) {
                var bs = st.meshes[i].bodies;
                for (var j = 0; j < bs.length; j++) { if (bs[j].userData.targetColor) bs[j].material.color.lerp(bs[j].userData.targetColor, 0.14); }
            }
            renderer.render(scene, camera);
        })();
        st.resize();
    }

    return {
        render: function (element) {
            element.style.cssText = "position:relative;height:74vh;min-height:420px;overflow:hidden";
            if (window.THREE) build(element);
            else { var n = 0, t = setInterval(function () { if (window.THREE) { clearInterval(t); build(element); if (element.__pending) element.__e3d.rebuild(element.__pending); } else if (++n > 100) clearInterval(t); }, 50); }
        },
        update: function (element, controller, value) {
            var s = (typeof value === "string") ? value : ""; if (!s) return;
            var st = element.__e3d;
            if (st) { st.controller = controller; if (s === st.last) return; st.last = s; st.rebuild(s); } else element.__pending = s;
        }
    };
}
