// ============================================================
//  gates3d — «Умные ворота» 3D, ПРИВЯЗАНО К РЕАЛЬНЫМ ДАННЫМ GateControl.
//  Сервер шлёт состояние строкой:  <gate|gate|...> ~ <journal|journal|...>
//  gate = name^pos^auto^simPlate^lastPlate^lastDec^lastDir   (pos: closed/opening/opened/closing)
//  Кнопки пульта → controller.change({action,gate,plate}) → onGatesEvent (настоящие команды).
//  JS периодически пингует refresh, чтобы подтягивать изменения от планового контроллера.
// ============================================================
function gates3d() {
    var TR = function (s) { return (window.miteTr ? window.miteTr(s) : s); };
    function mk(THREE, geo, color, opts) { return new THREE.Mesh(geo, new THREE.MeshLambertMaterial(Object.assign({ color: new THREE.Color(color) }, opts || {}))); }
    function makeSprite(THREE, w, h) {
        var cv = document.createElement("canvas"); cv.width = w || 256; cv.height = h || 128;
        var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false }));
        sp.renderOrder = 20; return { sprite: sp, cv: cv, ctx: cv.getContext("2d") };
    }
    function drawTag(o, lines, bg) {
        var c = o.ctx, W = o.cv.width, H = o.cv.height; c.clearRect(0, 0, W, H);
        var r = 16; c.fillStyle = bg; c.beginPath();
        c.moveTo(r, 2); c.arcTo(W - 2, 2, W - 2, H - 2, r); c.arcTo(W - 2, H - 2, 2, H - 2, r);
        c.arcTo(2, H - 2, 2, 2, r); c.arcTo(2, 2, W - 2, 2, r); c.closePath(); c.fill();
        c.textAlign = "center"; c.textBaseline = "middle";
        for (var i = 0; i < lines.length; i++) { var ln = lines[i]; c.fillStyle = ln.c || "#fff"; c.font = (ln.b ? "700 " : "400 ") + (ln.s || 30) + "px 'Segoe UI',Arial"; c.fillText(TR(ln.t), W / 2, H / (lines.length + 1) * (i + 1)); }
        o.sprite.material.map.needsUpdate = true;
    }
    function perf() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

    var SP = 70, GW = 44, GH = 42, WALLH = 64, STOP_Z = 58, DRIVE = 34;

    function build(element, st) {
        var THREE = window.THREE;
        var renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.setClearColor(0x223047, 1);
        renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
        element.appendChild(renderer.domElement);
        var scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x223047, 620, 1300);
        var world = new THREE.Group(); scene.add(world);
        var camera = new THREE.PerspectiveCamera(48, 1.6, 1, 4000);
        scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x3a4350, 1.25));
        var sun = new THREE.DirectionalLight(0xfff4e2, 1.15); sun.position.set(150, 240, 130); scene.add(sun);
        var fill = new THREE.DirectionalLight(0x9fc0ff, 0.45); fill.position.set(-120, 130, 200); scene.add(fill);

        Object.assign(st, { THREE: THREE, renderer: renderer, scene: scene, camera: camera, world: world,
            gates: {}, order: [], built: false, ground: null, wall: null,
            orbit: { target: new THREE.Vector3(70, 15, 30), radius: 250, theta: Math.PI / 2 - 0.32, phi: 0.93 } });

        st.applyCam = function () { var o = st.orbit, s = Math.sin(o.phi), cp = Math.cos(o.phi);
            camera.position.set(o.target.x + o.radius * s * Math.cos(o.theta), o.target.y + o.radius * cp, o.target.z + o.radius * s * Math.sin(o.theta)); camera.lookAt(o.target); };
        st.resize = function () { var w = element.clientWidth || 900, h = element.clientHeight || 560; if (h < 80 || h > 1600) h = 560; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
        if (window.ResizeObserver) { st.ro = new ResizeObserver(st.resize); st.ro.observe(element); }
        var drag = null;
        renderer.domElement.addEventListener("mousedown", function (e) { drag = { x: e.clientX, y: e.clientY, t: st.orbit.theta, p: st.orbit.phi }; });
        window.addEventListener("mousemove", function (e) { if (!drag) return; st.orbit.theta = drag.t - (e.clientX - drag.x) * 0.006; st.orbit.phi = Math.max(0.25, Math.min(1.4, drag.p - (e.clientY - drag.y) * 0.006)); });
        window.addEventListener("mouseup", function () { drag = null; });
        renderer.domElement.addEventListener("wheel", function (e) { e.preventDefault(); st.orbit.radius = Math.max(110, Math.min(620, st.orbit.radius * (1 + (e.deltaY > 0 ? 0.1 : -0.1)))); }, { passive: false });
        ["mousedown", "click", "dblclick", "contextmenu"].forEach(function (ev) { element.addEventListener(ev, function (e) { e.stopPropagation(); }); });

        buildPult(element, st);
        var last = perf();
        (function loop() { st.raf = requestAnimationFrame(loop);
            var now = perf(), dt = Math.min(0.05, (now - last) / 1000); last = now; var t = now / 1000;
            st.order.forEach(function (nm) { stepGate(st, st.gates[nm], dt, t); });
            st.applyCam(); renderer.render(scene, camera);
        })();
        st.resize();
        // обновления приходят реактивно: каждый клик пульта = controller.change → onGatesEvent → форма отдаёт свежий gatesData()
        st.built = true;
    }

    function buildBackdrop(st) {
        var THREE = st.THREE, n = st.order.length, CX = (n - 1) * SP / 2;
        st.orbit.target.x = CX;
        if (st.ground) st.world.remove(st.ground); st.ground = mk(THREE, new THREE.BoxGeometry(Math.max(620, n * SP + 200), 2, 460), 0x46505e); st.ground.position.set(CX, -1, 70); st.world.add(st.ground);
        if (st.grid) st.world.remove(st.grid); st.grid = new THREE.GridHelper(Math.max(620, n * SP + 200), 44, 0x5f6c7e, 0x3c4654); st.grid.position.set(CX, 0.1, 70); st.world.add(st.grid);
        if (st.wall) st.world.remove(st.wall); st.wall = mk(THREE, new THREE.BoxGeometry(n * SP + 36, WALLH, 8), 0x6b7686); st.wall.position.set(CX, WALLH / 2, -4); st.world.add(st.wall);
        if (st.roof) st.world.remove(st.roof); st.roof = mk(THREE, new THREE.BoxGeometry(n * SP + 60, 4, 70), 0x515c6b); st.roof.position.set(CX, WALLH, -34); st.world.add(st.roof);
    }

    function ensureGate(st, name, idx) {
        if (st.gates[name]) return st.gates[name];
        var THREE = st.THREE, x = idx * SP;
        var grp = new THREE.Group(); grp.position.set(x, 0, 0); st.world.add(grp);
        [-GW / 2, GW / 2].forEach(function (dx) { var p = mk(THREE, new THREE.BoxGeometry(5, GH + 6, 9), 0x6a7686); p.position.set(dx, (GH + 6) / 2, 1); grp.add(p); });
        var lintel = mk(THREE, new THREE.BoxGeometry(GW + 8, 7, 10), 0x33b079, { emissive: new THREE.Color(0x0c4a2e) }); lintel.position.set(0, GH + 4, 1); grp.add(lintel);
        grp.add((function () { var h = mk(THREE, new THREE.BoxGeometry(GW - 2, GH, 1), 0x161d27); h.position.set(0, GH / 2, -2.5); return h; })());
        var door = new THREE.Group(); door.position.set(0, GH, 2.2); grp.add(door);
        for (var s = 0; s < 6; s++) { var pan = mk(THREE, new THREE.BoxGeometry(GW - 4, GH / 6 - 1.2, 3), s % 2 ? 0xccd4dd : 0xbcc5cf); pan.position.set(0, -(s + 0.5) * (GH / 6), 0); door.add(pan); }
        var pad = mk(THREE, new THREE.BoxGeometry(GW + 6, 0.6, 46), 0x2b3550, { transparent: true, opacity: 0.5 }); pad.position.set(0, 0.4, STOP_Z + 4); grp.add(pad);
        var cam = new THREE.Group(); cam.position.set(0, GH + 12, 9); grp.add(cam);
        cam.add(mk(THREE, new THREE.BoxGeometry(11, 7, 7), 0x222a33));
        var lens = mk(THREE, new THREE.CylinderGeometry(2.4, 3, 4, 16), 0x1b6fb0); lens.rotation.x = Math.PI / 2; lens.position.set(0, 0, 5); cam.add(lens);
        var tag = makeSprite(THREE, 320, 150); tag.sprite.scale.set(46, 21, 1); tag.sprite.position.set(x, GH + 30, 10); st.world.add(tag.sprite);
        var nm = makeSprite(THREE, 256, 64); nm.sprite.scale.set(30, 7.5, 1); nm.sprite.position.set(x, GH + 12, -3);
        drawTag(nm, [{ t: name.toUpperCase(), b: true, s: 32, c: "#dfe8f2" }], "rgba(0,0,0,0)"); st.world.add(nm.sprite);
        var g = { name: name, idx: idx, x: x, grp: grp, door: door, pad: pad, lens: lens, tag: tag,
            openF: 0, pos: "closed", auto: true, simPlate: "", lastPlate: "", lastDec: "", lastDir: "", recKey: "", sensorOn: false, truck: null };
        st.gates[name] = g; return g;
    }

    function addTruck(st, g) {
        var THREE = st.THREE, grp = new THREE.Group(); var col = [0x3f7fd6, 0xcf5050, 0xe0a32a, 0x4aa06a][g.idx % 4];
        var cargo = mk(THREE, new THREE.BoxGeometry(26, 20, 30), 0xe6eaef); cargo.position.set(0, 16, -2); grp.add(cargo);
        var cab = mk(THREE, new THREE.BoxGeometry(24, 15, 14), col); cab.position.set(0, 13, 18); grp.add(cab);
        grp.add((function () { var w = mk(THREE, new THREE.BoxGeometry(20, 7, 1), 0x9fd0e6); w.position.set(0, 16, 25); return w; })());
        [-11, 11].forEach(function (dx) { [6, -8, 20].forEach(function (dz) { var w = mk(THREE, new THREE.CylinderGeometry(4, 4, 3, 14), 0x1b1f25); w.rotation.z = Math.PI / 2; w.position.set(dx, 4, dz); grp.add(w); }); });
        var pl = makeSprite(THREE, 256, 80); pl.sprite.scale.set(20, 6.3, 1); pl.sprite.position.set(0, 24, 12); grp.add(pl.sprite);
        drawTag(pl, [{ t: g.lastPlate || g.simPlate || "—", b: true, s: 38, c: "#15202c" }], "#f4d23a");
        grp.position.set(g.x, 0, 150); st.world.add(grp);
        return { grp: grp, z: 150, phase: "approach", waitT: 0 };
    }

    function stepGate(st, g, dt, t) {
        if (!g) return;
        var open = (g.pos === "opened" || g.pos === "opening");
        g.openF += ((open ? 1 : 0) - g.openF) * Math.min(1, dt * 6);
        g.door.scale.y = Math.max(0.02, 1 - g.openF);
        g.sensorOn = !!g.truck && g.truck.phase !== "enter";
        g.pad.material.color.setHex(g.sensorOn ? 0xffc234 : 0x2b3550);
        g.pad.material.opacity = g.sensorOn ? (0.45 + 0.25 * Math.sin(t * 7)) : 0.5;
        var scanning = g.sensorOn && !open && g.lastDec !== "deny";
        g.lens.material.color.setHex(scanning ? (Math.sin(t * 18) > 0 ? 0x49d0ff : 0x10465f) : 0x1b6fb0);
        // табло камеры по реальному распознаванию/положению
        if (open) setTag(g, [{ t: "ОТКРЫТО", b: true, s: 30, c: "#7bf0a3" }], "rgba(10,30,18,0.9)");
        else if (g.lastDir === "in" && g.lastDec === "deny") setTag(g, [{ t: "✗ " + g.lastPlate, b: true, s: 28, c: "#ff9a9a" }, { t: "отказ", s: 20, c: "#ffc9c9" }], "rgba(36,12,12,0.9)");
        else if (g.sensorOn) setTag(g, [{ t: "СКАНИРОВАНИЕ…", b: true, s: 26, c: "#7fe0ff" }], "rgba(12,20,28,0.9)");
        else setTag(g, [{ t: "ЗАКРЫТО", b: true, s: 30, c: "#aeb8c4" }], "rgba(0,0,0,0)");

        var tr = g.truck; if (!tr) return;
        if (tr.phase === "approach") { tr.z -= DRIVE * dt; if (tr.z <= STOP_Z) { tr.z = STOP_Z; tr.phase = (g.lastDec === "deny") ? "wait" : "hold"; } }
        else if (tr.phase === "hold") { if (g.openF > 0.8) tr.phase = "enter"; }
        else if (tr.phase === "enter") { tr.z -= DRIVE * dt; if (tr.z < -34) { st.world.remove(tr.grp); g.truck = null; } }
        else if (tr.phase === "wait") { tr.waitT += dt; if (tr.waitT > 2.4) tr.phase = "leave"; }
        else if (tr.phase === "leave") { tr.z += DRIVE * 0.8 * dt; if (tr.z > 160) { st.world.remove(tr.grp); g.truck = null; } }
        if (tr) tr.grp.position.z = tr.z;
    }
    function setTag(g, lines, bg) { if (g._tagKey === JSON.stringify(lines)) return; g._tagKey = JSON.stringify(lines); drawTag(g.tag, lines, bg); }

    // ---------- разбор данных от сервера ----------
    function applyData(st, str) {
        if (!st.built) { st.pending = str; return; }
        var parts = String(str).split("~");
        var gates = (parts[0] || "").split("|").filter(function (s) { return s.length; });
        var journal = (parts[1] || "").split("|").filter(function (s) { return s.length; });
        var names = [];
        gates.forEach(function (rec, i) {
            var f = rec.split("^"); var name = f[0]; if (!name) return; names.push(name);
            var fresh = !st.gates[name];
            var g = ensureGate(st, name, i);
            g.pos = f[1] || "closed"; g.auto = f[2] === "1"; g.simPlate = f[3] || "";
            var lastPlate = f[4] || "", lastDec = f[5] || "", lastDir = f[6] || "";
            var key = lastPlate + "|" + lastDec + "|" + lastDir;
            if (!fresh && key !== g.recKey && lastDir === "in" && lastPlate) {
                // новое распознавание на въезд → подаём грузовик
                if (g.truck) st.world.remove(g.truck.grp);
                g.lastPlate = lastPlate; g.lastDec = lastDec; g.lastDir = lastDir;
                g.truck = addTruck(st, g);
            }
            g.lastPlate = lastPlate; g.lastDec = lastDec; g.lastDir = lastDir; g.recKey = key;
        });
        if (names.length !== st.order.length || names.some(function (n, i) { return n !== st.order[i]; })) {
            st.order = names; buildBackdrop(st); rebuildCards(st);
        }
        renderCards(st); renderJournal(st, journal);
    }

    // ================= 3D-ПУЛЬТ =================
    function buildPult(element, st) {
        var wrap = document.createElement("div"); wrap.id = "gates-pult";
        wrap.style.cssText = "position:absolute;top:12px;right:12px;width:300px;max-height:calc(100% - 24px);overflow:auto;font-family:'Segoe UI',Arial;z-index:5;background:rgba(14,20,28,0.92);border:1px solid #2a3441;border-radius:14px;padding:12px 12px 8px;box-shadow:0 10px 34px rgba(0,0,0,.45)";
        wrap.innerHTML = '<div style="font-size:14px;font-weight:800;color:#eaf2fb;margin-bottom:2px">' + TR("ПУЛЬТ ОПЕРАТОРА") + '</div><div style="font-size:11px;color:#7e8a98;margin-bottom:10px">' + TR("Умные ворота склада") + '</div>';
        element.appendChild(wrap); st.pultWrap = wrap; st.cardsBox = document.createElement("div"); wrap.appendChild(st.cardsBox);
        var jh = document.createElement("div"); jh.style.cssText = "font-size:11px;font-weight:700;color:#9fb0c2;margin:6px 2px 4px"; jh.textContent = TR("ЖУРНАЛ СОБЫТИЙ"); wrap.appendChild(jh);
        st.journalEl = document.createElement("div"); st.journalEl.style.cssText = "font-size:11px;line-height:1.5;color:#c7d2de;max-height:150px;overflow:auto"; wrap.appendChild(st.journalEl);
        st.cards = {};
    }
    function rebuildCards(st) {
        if (!st.cardsBox) return; st.cardsBox.innerHTML = ""; st.cards = {};
        st.order.forEach(function (nm) { st.cardsBox.appendChild(buildCard(st, nm)); });
    }
    function send(st, action, name, plate) { try { if (st.controller && st.controller.change) st.controller.change({ action: action, gate: name, plate: plate || "" }); } catch (e) { } }
    function buildCard(st, name) {
        var card = document.createElement("div"); card.style.cssText = "background:#161f29;border:1px solid #28333f;border-radius:10px;padding:8px 9px;margin-bottom:8px";
        var top = document.createElement("div"); top.style.cssText = "display:flex;align-items:center;gap:7px;margin-bottom:6px";
        var led = document.createElement("span"); led.style.cssText = "width:11px;height:11px;border-radius:50%;flex:none;box-shadow:0 0 7px";
        var nm = document.createElement("div"); nm.style.cssText = "font-size:13px;font-weight:700;color:#e8eef5;flex:1"; nm.textContent = TR(name);
        var stt = document.createElement("div"); stt.style.cssText = "font-size:11px;font-weight:700"; top.appendChild(led); top.appendChild(nm); top.appendChild(stt); card.appendChild(top);
        var info = document.createElement("div"); info.style.cssText = "font-size:11px;color:#9fb0c2;margin-bottom:6px;min-height:15px"; card.appendChild(info);
        var inp = document.createElement("input"); inp.style.cssText = "width:100%;box-sizing:border-box;font-size:11px;padding:4px 6px;margin-bottom:5px;border-radius:6px;border:1px solid #2c3a48;background:#0e1620;color:#dfe8f2"; inp.placeholder = TR("номер машины"); card.appendChild(inp);
        var row1 = document.createElement("div"); row1.style.cssText = "display:flex;gap:5px;margin-bottom:5px";
        var row2 = document.createElement("div"); row2.style.cssText = "display:flex;gap:5px";
        function btn(label, bg, fn) { var b = document.createElement("button"); b.textContent = TR(label); b.style.cssText = "flex:1;font-size:11px;font-weight:700;color:#fff;background:" + bg + ";border:0;border-radius:7px;padding:6px 0;cursor:pointer"; b.onclick = fn; return b; }
        row1.appendChild(btn("Приезд", "#2b6fb0", function () { send(st, "arrive", name, inp.value || st.cards[name].g.simPlate); }));
        row1.appendChild(btn("Проехал", "#5a6573", function () { send(st, "pass", name); }));
        row2.appendChild(btn("Открыть", "#1f9d6b", function () { send(st, "open", name); }));
        row2.appendChild(btn("Закрыть", "#b3402e", function () { send(st, "close", name); }));
        row2.appendChild(btn("Авто", "#7a5cc0", function () { send(st, "auto", name); }));
        card.appendChild(row1); card.appendChild(row2);
        st.cards[name] = { led: led, stt: stt, info: info, inp: inp, g: null };
        return card;
    }
    function renderCards(st) {
        st.order.forEach(function (nm) {
            var c = st.cards[nm], g = st.gates[nm]; if (!c || !g) return; c.g = g;
            var open = g.openF > 0.5; var moving = g.pos === "opening" || g.pos === "closing";
            var col = !g.auto ? "#49b0ff" : (open ? "#2ee08a" : "#ff7a6b");
            c.led.style.background = col; c.led.style.color = col;
            var label = g.pos === "opening" ? TR("открываются") : g.pos === "closing" ? TR("закрываются") : open ? TR("ОТКРЫТО") : TR("ЗАКРЫТО");
            c.stt.textContent = (g.auto ? "🅰 " : "✋ ") + label; c.stt.style.color = col;
            var rec = g.lastPlate ? ((g.lastDec === "allow" ? "✓ " : g.lastDec === "deny" ? "✗ " : "") + g.lastPlate + (g.lastDir === "out" ? " ⮕" : "")) : TR("нет распознаваний");
            c.info.textContent = TR(rec);
            if (document.activeElement !== c.inp && !c.inp.value && g.simPlate) c.inp.value = TR(g.simPlate);
        });
    }
    function renderJournal(st, lines) {
        if (!st.journalEl) return;
        st.journalEl.innerHTML = lines.slice(0, 16).map(function (txt) { var col = /✓|открыт|авто-открыт/i.test(txt) ? "#9fe6b8" : /✗|отказ/i.test(txt) ? "#ff9a9a" : "#c7d2de"; return '<div style="margin-bottom:2px;color:' + col + '">' + TR(txt) + '</div>'; }).join("");
    }

    return {
        render: function (element) {
            element.style.cssText = "position:relative;height:78vh;min-height:460px;min-width:0;overflow:hidden";
            var st = element.__g = {};
            if (window.THREE) build(element, st);
            else { var n = 0, t = setInterval(function () { if (window.THREE) { clearInterval(t); build(element, st); if (st.pending) applyData(st, st.pending); } else if (++n > 120) clearInterval(t); }, 50); }
        },
        update: function (element, controller, value) {
            var st = element.__g; if (!st) return; st.controller = controller;
            if (typeof value === "string" && value && value !== st.lastData) { st.lastData = value; applyData(st, value); }
        }
    };
}
