// 3D-участок производства ВЛФ (демо под ТЗ Академфарм). Движок как в energy3d: блоки в авто-сетке,
// высота+цвет по выбранному слою (Статус/OEE/Температура/Обороты/Давление), клик → карточка оборудования,
// снизу сводка участка, сверху — текущая серия.
// Данные (vlfData): 'V^avgOEE^totalDown^avgDefect^run^idle^alarm^batch' + '~' + U^-записи:
//   U^name^status(1|2|3)^oee^temp^rpm^press^hum^down^defect^vendor(S|M|L)^alarm(0/1)^alarmText^params
function vlf3d() {
    var tr = window.miteTr || String;
    function ramp(t) { t = Math.max(0, Math.min(1, t)); var r = t < 0.5 ? Math.round(60 + t * 2 * 195) : 255; var g = t < 0.5 ? 190 : Math.round(190 - (t - 0.5) * 2 * 175); return (r << 16) | (g << 8) | 40; }
    var C_RUN = 0x3a9e57, C_IDLE = 0xd9a441, C_ALARM = 0xb3261e;
    function statusColor(s) { return s === 3 ? C_ALARM : s === 2 ? C_IDLE : C_RUN; }
    var SMAP = { run: 1, idle: 2, alarm: 3 };   // статус приходит строкой
    var LAYERS = [
        { label: "Статус", val: function (u) { return u.oee; }, color: function (u) { return statusColor(u.status); } },
        { label: "OEE", val: function (u) { return u.oee; }, color: function (u) { return ramp(Math.min(1, Math.max(0, (95 - u.oee) / 50))); } },
        { label: "Температура", val: function (u) { return u.temp; }, color: function (u, mx) { return ramp(mx ? u.temp / mx : 0); } },
        { label: "Обороты", val: function (u) { return u.rpm; }, color: function (u, mx) { return ramp(mx ? u.rpm / mx : 0); } },
        { label: "Давление", val: function (u) { return u.press; }, color: function (u, mx) { return ramp(mx ? u.press / mx : 0); } }
    ];

    function mk(THREE, geo, color) { return new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: new THREE.Color(color), specular: 0x33383e, shininess: 30 })); }
    // Фигуры аппаратов даёт ОБЩАЯ библиотека window.miteShapeLib (shapelib.js, детализированные схемы).
    // Локальный shapeLib — лишь аварийный fallback, если shapelib.js не загрузился: простой блок.
    function shapeLib(THREE, name, h) {
        if (window.miteShapeLib) return window.miteShapeLib(THREE, name, h);
        var g = new THREE.Group(), bodies = [];
        bodies.push(mk(THREE, new THREE.BoxGeometry(20, h * 0.8, 20), 0x8b939d));
        bodies[0].position.y = h * 0.4; g.add(bodies[0]);
        return { group: g, bodies: bodies };
    }
    function label(THREE, text, color) {
        var c = document.createElement("canvas"); c.width = 256; c.height = 64; var x = c.getContext("2d");
        x.fillStyle = color || "#20303f"; x.font = "bold 26px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
        x.fillText((text || "").slice(0, 22), 128, 32);
        var t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter;
        var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true })); s.scale.set(34, 8.5, 1);
        return s;
    }

    function build(element) {
        var THREE = window.THREE;
        var st = { THREE: THREE, units: [], layer: 0, meshes: [], raycast: [] };
        element.__v3d = st;
        var scene = new THREE.Scene(); scene.background = new THREE.Color(0xeef2f7);
        var camera = new THREE.PerspectiveCamera(45, 1, 1, 12000);
        var renderer = new THREE.WebGLRenderer({ antialias: true }); st.renderer = renderer;
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        element.appendChild(renderer.domElement);
        renderer.domElement.style.cssText = "display:block;width:100%;height:100%;cursor:pointer";
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        scene.add(new THREE.HemisphereLight(0xdfe8f2, 0x6b7480, 0.45));                 // мягкий небо/земля фон — металл читается объёмнее
        var dl = new THREE.DirectionalLight(0xffffff, 0.72); dl.position.set(0.6, 1, 0.4); scene.add(dl);
        var dl2 = new THREE.DirectionalLight(0xffffff, 0.28); dl2.position.set(-0.5, 0.55, -0.4); scene.add(dl2); // контровой подсвет
        var world = new THREE.Group(); scene.add(world); st.world = world;

        var orbit = { target: new THREE.Vector3(0, 8, 0), radius: 360, theta: -0.7, phi: 0.82 };
        st.applyCamera = function () { var r = orbit.radius, p = orbit.phi, t = orbit.theta; camera.position.set(orbit.target.x + r * Math.sin(p) * Math.sin(t), orbit.target.y + r * Math.cos(p), orbit.target.z + r * Math.sin(p) * Math.cos(t)); camera.lookAt(orbit.target); };
        st.resize = function () { var w = element.clientWidth || 800, h = element.clientHeight || 520; if (h < 60) h = 520; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); st.applyCamera(); };
        if (window.ResizeObserver) { new ResizeObserver(st.resize).observe(element); }


        // переключатель слоёв
        var bar = document.createElement("div");
        bar.style.cssText = "position:absolute;left:50%;top:10px;transform:translateX(-50%);z-index:6;display:flex;gap:5px;flex-wrap:wrap;justify-content:center;max-width:70%;background:rgba(18,26,36,0.88);padding:6px 9px;border-radius:10px;font-family:'Segoe UI',sans-serif";
        st.tabs = [];
        LAYERS.forEach(function (lay, i) { var b = document.createElement("div"); b.textContent = tr(lay.label); b.style.cssText = "cursor:pointer;color:#cfd8e3;font-size:12px;padding:5px 10px;border-radius:7px"; b.onclick = function () { st.layer = i; st.applyLayer(); }; bar.appendChild(b); st.tabs.push(b); });
        element.appendChild(bar);

        // легенда
        var leg = document.createElement("div");
        leg.style.cssText = "position:absolute;right:10px;top:56px;z-index:6;font-size:11px;color:#5a6675;font-family:'Segoe UI',sans-serif;background:rgba(255,255,255,.8);padding:6px 9px;border-radius:8px";
        element.appendChild(leg); st.leg = leg;

        // сводка снизу
        var foot = document.createElement("div");
        foot.style.cssText = "position:absolute;left:0;right:0;bottom:0;z-index:6;display:flex;flex-direction:column;align-items:center;background:rgba(18,26,36,0.9);padding:7px 6px;font-family:'Segoe UI',sans-serif";
        element.appendChild(foot); st.foot = foot;

        // карточка оборудования (клик)
        var tip = document.createElement("div");
        tip.style.cssText = "position:absolute;z-index:8;display:none;min-width:250px;max-width:330px;background:rgba(15,23,34,0.96);color:#e6edf5;font-family:'Segoe UI',sans-serif;font-size:12px;padding:12px 14px;border-radius:11px;box-shadow:0 8px 26px rgba(0,0,0,.45);pointer-events:none";
        element.appendChild(tip); st.tip = tip;
        function fmt(v, d) { var n = +v; return isNaN(n) ? "0" : n.toFixed(d == null ? 0 : d); }
        var STx = { 1: "Работа", 2: "Простой", 3: "Авария" };
        st.showTip = function (u, sx, sy) {
            var rows = [
                [tr("ПЛК"), u.vendor || "—"],
                [tr("Статус"), tr(STx[u.status] || "—")],
                ["OEE", fmt(u.oee, 1) + " %"],
                [tr("Температура"), fmt(u.temp, 1) + " °C"],
                [tr("Обороты"), fmt(u.rpm, 0) + " об/мин"],
                [tr("Давление"), fmt(u.press, 2) + " бар"],
                [tr("Влага"), fmt(u.hum, 1) + " %"],
                [tr("Простой"), fmt(u.down, 0) + " мин"],
                [tr("Брак"), fmt(u.defect, 2) + " %"]
            ];
            var html = '<div style="font-weight:800;font-size:13px;margin-bottom:7px;color:#8fd0ff">' + (u.name || "?") + '</div>';
            rows.forEach(function (r) { html += '<div style="display:flex;justify-content:space-between;gap:14px;padding:1px 0"><span style="color:#93a1b3">' + r[0] + '</span><b>' + r[1] + '</b></div>'; });
            if (u.params) html += '<div style="margin-top:7px;padding-top:6px;border-top:1px solid rgba(255,255,255,.12);color:#c3ccd8;font-size:11px;line-height:1.4">' + u.params + '</div>';
            if (u.alarm) html += '<div style="margin-top:6px;color:#ff8a80;font-weight:700">⚠ ' + (u.alarmText || tr("Авария")) + '</div>';
            tip.innerHTML = html; tip.style.display = "block";
            var w = element.clientWidth || 800; tip.style.left = Math.min(sx + 14, w - 270) + "px"; tip.style.top = Math.max(56, sy - 20) + "px";
        };

        // подмена схематичной фигуры на настоящую GLTF-модель (если есть web/models/<тип>.glb)
        st.applyModel = function (u, grp, modelScene) {
            var rm = []; grp.traverse(function (o) { if (o.isMesh) rm.push(o); });
            rm.forEach(function (o) { if (o.parent) o.parent.remove(o); });
            st.raycast = st.raycast.filter(function (o) { return rm.indexOf(o) < 0; });
            var box = new THREE.Box3().setFromObject(modelScene), size = new THREE.Vector3(); box.getSize(size);
            var sc = 30 / (Math.max(size.x, size.y, size.z) || 1); modelScene.scale.setScalar(sc);
            box.setFromObject(modelScene); var c = new THREE.Vector3(); box.getCenter(c);
            modelScene.position.set(-c.x, -box.min.y, -c.z); grp.add(modelScene);
            modelScene.traverse(function (o) { if (o.isMesh) { o.userData.u = u; st.raycast.push(o); } });
            var ring = mk(THREE, new THREE.CylinderGeometry(15, 15, 1.4, 30), 0x8b939d); ring.position.y = 0.7; grp.add(ring); // подиум-статус
            for (var i = 0; i < st.meshes.length; i++) if (st.meshes[i].u === u) { st.meshes[i].bodies = [ring]; break; }
            st.applyLayer();
        };

        st.applyLayer = function () {
            var lay = LAYERS[st.layer];
            st.tabs.forEach(function (b, i) { b.style.background = i === st.layer ? "#1f6f8b" : "transparent"; b.style.color = i === st.layer ? "#fff" : "#cfd8e3"; });
            st.leg.innerHTML = st.layer === 0
                ? '<div style="display:flex;gap:10px;align-items:center"><span style="color:#3a9e57">■</span>' + tr("Работа") + ' <span style="color:#d9a441">■</span>' + tr("Простой") + ' <span style="color:#b3261e">■</span>' + tr("Авария") + '</div>'
                : '<div style="width:120px;height:9px;border-radius:5px;background:linear-gradient(90deg,#3cbe28,#ffbe28,#ff1e28)"></div><div style="display:flex;justify-content:space-between"><span>' + (st.layer === 1 ? tr("низкий") : tr("норма")) + '</span><span>' + (st.layer === 1 ? tr("высокий") : tr("критично")) + '</span></div>';
            var mx = 0; st.units.forEach(function (u) { var v = lay.val(u); if (v > mx) mx = v; });
            st.meshes.forEach(function (p) { var col = new THREE.Color(lay.color(p.u, mx)); p.bodies.forEach(function (b) { b.userData.targetColor = col; }); });
        };

        st.rebuild = function (data) {
            while (world.children.length) world.remove(world.children[0]);
            st.units = []; st.meshes = []; st.raycast = [];
            var recs = (data || "").split("~");
            var head = (recs[0] || "").split("^"); // V^oee^down^defect^run^idle^alarm^batch
            var kpis = [
                ["OEE", fmt(head[1], 0) + " %", "#1f6f8b"],
                [tr("Простои"), (head[2] || "0") + " " + tr("мин"), "#7a5aa0"],
                [tr("Брак"), fmt(head[3], 2) + " %", "#b06a1e"],
                [tr("Работа"), (head[4] || "0"), "#3a9e57"],
                [tr("Простой"), (head[5] || "0"), (+head[5] > 0 ? "#d9a441" : "#3a9e57")],
                [tr("Авария"), (head[6] || "0"), (+head[6] > 0 ? "#b3261e" : "#3a9e57")]
            ];
            st.foot.innerHTML = '<div style="width:100%;text-align:center;font-size:11px;color:#9fb0c4;padding-bottom:5px">' + tr("Серия") + ': <b style="color:#cfe3f5">' + (head[7] || "—") + '</b></div>'
                + '<div style="display:flex;justify-content:center;flex-wrap:wrap">' + kpis.map(function (k) { return '<div style="text-align:center;padding:0 15px;border-right:1px solid rgba(255,255,255,.12)"><div style="font-size:10px;color:#8a93a0">' + k[0] + '</div><div style="font-size:18px;font-weight:800;color:' + k[2] + '">' + k[1] + '</div></div>'; }).join("") + '</div>';

            for (var i = 1; i < recs.length; i++) {
                var f = recs[i].split("^"); if (f[0] !== "U") continue;
                st.units.push({ name: f[1], status: SMAP[f[2]] || 1, oee: +f[3] || 0, temp: +f[4] || 0, rpm: +f[5] || 0, press: +f[6] || 0, hum: +f[7] || 0, down: +f[8] || 0, defect: +f[9] || 0, vendor: f[10] || "", alarm: f[11] === "1", alarmText: f[12] || "", params: f[13] || "", stage: f[14] || "", px: +f[15] || 0, pz: +f[16] || 0 });
            }
            // расстановка по координатам техпроцесса (ромб: смешивание → {сухая | влажная} → калибровка → опудривание)
            var n = st.units.length, byStage = {}, minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
            st.units.forEach(function (u) {
                // авто-фигура по названию аппарата (общая библиотека window.miteShapeLib) — узнаваемая схема
                var s = (window.miteShapeLib || shapeLib)(THREE, u.name + " " + (u.stage || ""), 28);
                s.group.position.set(u.px, 0, u.pz); world.add(s.group);
                s.group.traverse(function (o) { if (o.isMesh) { o.userData.u = u; st.raycast.push(o); } });
                st.meshes.push({ u: u, bodies: s.bodies });   // bodies перекрашиваются по метрике
                if (window.miteModels) { (function (uu, grp) { window.miteModels.load(THREE, uu.name + " " + (uu.stage || ""), function (ms) { if (ms && grp.parent) st.applyModel(uu, grp, ms); }); })(u, s.group); } // подставить .glb, если есть
                var stg = label(THREE, u.stage || "", "#1f6f8b"); stg.scale.set(30, 7.5, 1); stg.position.set(u.px, 5, u.pz + 30); world.add(stg);
                var pad = mk(THREE, new THREE.BoxGeometry(32, 2, 32), 0xd7dee6); pad.position.set(u.px, -1, u.pz); world.add(pad);
                byStage[u.stage] = u;
                if (u.px < minX) minX = u.px; if (u.px > maxX) maxX = u.px; if (u.pz < minZ) minZ = u.pz; if (u.pz > maxZ) maxZ = u.pz;
            });
            // маршрут: стрелки по топологии техпроцесса + анимированный поток
            var EDGES = [["Смешивание", "Компактирование"], ["Смешивание", "Грануляция"], ["Грануляция", "Сушка"], ["Компактирование", "Калибровка"], ["Сушка", "Калибровка"], ["Калибровка", "Опудривание"]];
            st.flows = [];
            EDGES.forEach(function (e) {
                var A = byStage[e[0]], B = byStage[e[1]]; if (!A || !B) return;
                // поток идёт ТОЛЬКО между работающими аппаратами; к остановленным (простой/авария) — серая стрелка без циркуляции
                var flowing = A.status === 1 && B.status === 1;
                var a = new THREE.Vector3(A.px, 5, A.pz), b = new THREE.Vector3(B.px, 5, B.pz);
                var dir = new THREE.Vector3().subVectors(b, a), len = dir.length(); dir.normalize();
                var a2 = a.clone().add(dir.clone().multiplyScalar(15)), b2 = b.clone().sub(dir.clone().multiplyScalar(15));
                var arr = new THREE.ArrowHelper(dir, a2, Math.max(1, b2.clone().sub(a2).length()), flowing ? 0x2b8cff : 0xb3bcc7, 9, 6); world.add(arr);
                if (flowing) { var sp = new THREE.Mesh(new THREE.SphereGeometry(3, 10, 10), new THREE.MeshBasicMaterial({ color: 0x8fd0ff })); world.add(sp); st.flows.push({ a: a2, b: b2, mesh: sp, t: 0 }); }
            });
            st.flows.forEach(function (fl, i) { fl.t = (i * 0.17) % 1; });
            if (n) { orbit.target.set((minX + maxX) / 2, 8, (minZ + maxZ) / 2); orbit.radius = Math.max(180, (maxX - minX)) * 1.15 + 150; } else { orbit.radius = 300; }
            st.applyLayer(); st.applyCamera(); st.resize();
        };

        var dr = null;
        renderer.domElement.addEventListener("mousedown", function (e) { dr = { x: e.clientX, y: e.clientY, t: orbit.theta, p: orbit.phi, moved: false }; });
        window.addEventListener("mousemove", function (e) { if (!dr) return; var dx = e.clientX - dr.x, dy = e.clientY - dr.y; if (Math.abs(dx) + Math.abs(dy) > 3) dr.moved = true; orbit.theta = dr.t - dx * 0.006; orbit.phi = Math.max(0.25, Math.min(1.45, dr.p - dy * 0.006)); st.applyCamera(); });
        window.addEventListener("mouseup", function () { dr = null; });
        renderer.domElement.addEventListener("wheel", function (e) { e.preventDefault(); orbit.radius = Math.max(80, Math.min(2600, orbit.radius * (e.deltaY > 0 ? 1.1 : 0.9))); st.applyCamera(); }, { passive: false });
        renderer.domElement.addEventListener("click", function (e) {
            if (dr && dr.moved) return;
            var rect = renderer.domElement.getBoundingClientRect();
            var mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
            var ray = new THREE.Raycaster(); ray.setFromCamera(mouse, camera);
            var hit = ray.intersectObjects(st.raycast, false)[0];
            if (hit && hit.object.userData.u) st.showTip(hit.object.userData.u, e.clientX - rect.left, e.clientY - rect.top); else st.tip.style.display = "none";
        });

        (function loop() {
            requestAnimationFrame(loop);
            for (var i = 0; i < st.meshes.length; i++) {
                var bs = st.meshes[i].bodies;
                for (var j = 0; j < bs.length; j++) { if (bs[j].userData.targetColor) bs[j].material.color.lerp(bs[j].userData.targetColor, 0.14); }
            }
            // поток по маршруту техпроцесса
            if (st.flows) for (var k = 0; k < st.flows.length; k++) { var fl = st.flows[k]; fl.t += 0.012; if (fl.t > 1) fl.t -= 1; fl.mesh.position.lerpVectors(fl.a, fl.b, fl.t); }
            renderer.render(scene, camera);
        })();
        st.resize();
    }

    return {
        render: function (element) {
            element.style.cssText = "position:relative;height:74vh;min-height:420px;overflow:hidden";
            if (window.THREE) build(element);
            else { var n = 0, t = setInterval(function () { if (window.THREE) { clearInterval(t); build(element); if (element.__pending) element.__v3d.rebuild(element.__pending); } else if (++n > 100) clearInterval(t); }, 50); }
        },
        update: function (element, controller, value) {
            var s = (typeof value === "string") ? value : ""; if (!s) return;
            var st = element.__v3d;
            if (st) { st.controller = controller; if (s === st.last) return; st.last = s; st.rebuild(s); } else element.__pending = s;
        }
    };
}
