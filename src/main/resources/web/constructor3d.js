// Лёгкий 3D-редактор «Конструктор объектов»: чистая площадка + палитра типов + размещение кликом +
// привязка к датчику. ОТДЕЛЬНЫЙ канал данных (editorData), не трогает тяжёлый wh3dData склада.
// Данные: 'C^constructor~' + T^-записи типов (name^shape^L^W^H^color) + '~~' + O^-записи объектов
//         (index^name^shape^posX^posZ^deviceId^liveValue).
function constructor3d() {
    var M2U = 9; // 1 м ≈ 9 ед.
    function mk(THREE, geo, color, opts) { return new THREE.Mesh(geo, new THREE.MeshLambertMaterial(Object.assign({ color: new THREE.Color(color) }, opts || {}))); }
    function label(THREE, text, color) {
        var c = document.createElement("canvas"); c.width = 256; c.height = 64; var x = c.getContext("2d");
        x.fillStyle = color || "#1f6f8b"; x.font = "bold 30px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
        x.fillText(text || "", 128, 32);
        var t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter;
        var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true })); s.scale.set(34, 8.5, 1);
        return s;
    }

    function build(element) {
        var THREE = window.THREE;
        var st = { THREE: THREE, types: {}, typeList: [], units: {}, placeMode: null, bindIx: null };
        element.__c3d = st;
        var scene = new THREE.Scene(); scene.background = new THREE.Color(0xdbe2ea); scene.fog = new THREE.Fog(0xdbe2ea, 620, 1150);
        var camera = new THREE.PerspectiveCamera(45, 1, 1, 9000);
        var renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); st.renderer = renderer;
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        element.appendChild(renderer.domElement);
        renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
        scene.add(new THREE.AmbientLight(0xffffff, 0.72));
        var dl = new THREE.DirectionalLight(0xffffff, 0.9); dl.position.set(0.45, 1, 0.35); scene.add(dl);
        var dl2 = new THREE.DirectionalLight(0xbcd0e6, 0.35); dl2.position.set(-0.5, 0.6, -0.4); scene.add(dl2);
        var world = new THREE.Group(); scene.add(world); st.world = world;

        // площадка
        var FW = 360, FD = 240;
        var floor = mk(THREE, new THREE.BoxGeometry(FW, 4, FD), 0xb7bdc6); floor.position.set(0, -2, 0); world.add(floor);
        world.add(new THREE.GridHelper(Math.max(FW, FD), Math.round(Math.max(FW, FD) / 18), 0x8f98a4, 0xa6aeb9));
        st.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

        var orbit = { target: new THREE.Vector3(0, 10, 0), radius: 360, theta: -0.7, phi: 0.78 };
        st.applyCamera = function () {
            var r = orbit.radius, p = orbit.phi, t = orbit.theta;
            camera.position.set(orbit.target.x + r * Math.sin(p) * Math.sin(t), orbit.target.y + r * Math.cos(p), orbit.target.z + r * Math.sin(p) * Math.cos(t));
            camera.lookAt(orbit.target);
        };
        st.resize = function () { var w = element.clientWidth || 800, h = element.clientHeight || 520; if (h < 60) h = 520; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); st.applyCamera(); };
        if (window.ResizeObserver) { new ResizeObserver(st.resize).observe(element); }

        // ---- панель настройки ----
        var bar = document.createElement("div");
        bar.style.cssText = "position:absolute;left:12px;top:56px;z-index:6;display:flex;flex-direction:column;gap:7px;align-items:stretch;width:242px;max-height:80%;overflow-y:auto;background:rgba(14,20,28,0.92);padding:9px 10px;border-radius:10px;font-family:'Segoe UI',sans-serif;box-shadow:0 6px 22px rgba(0,0,0,.4)";
        // строка 1: типы
        var row1 = document.createElement("div"); row1.style.cssText = "display:flex;flex-direction:column;align-items:stretch;gap:6px";
        var ttl = document.createElement("span"); ttl.textContent = (window.miteTr || String)("Тип:"); ttl.style.cssText = "color:#9fb0c4;font-size:11px"; row1.appendChild(ttl);
        var wrap = document.createElement("span"); wrap.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;justify-content:center"; row1.appendChild(wrap); st.wrap = wrap;
        var stop = document.createElement("div"); stop.textContent = (window.miteTr || String)("✕ отмена"); stop.title = (window.miteTr || String)("выйти из режима размещения (вернуть обычный курсор)"); stop.style.cssText = "cursor:pointer;color:#cfd8e3;font-size:12px;padding:5px 9px;border-radius:7px;border-left:1px solid rgba(255,255,255,.15)"; stop.onclick = function () { setMode(null); }; row1.appendChild(stop);
        bar.appendChild(row1);
        // строка 2: параметры
        var row2 = document.createElement("div"); row2.style.cssText = "display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-start;border-top:1px solid rgba(255,255,255,.1);padding-top:6px";
        function num(lbl, val, w) {
            var box = document.createElement("span"); box.style.cssText = "display:flex;align-items:center;gap:3px";
            var l = document.createElement("span"); l.textContent = (window.miteTr || String)(lbl); l.style.cssText = "color:#9fb0c4;font-size:11px"; box.appendChild(l);
            var i = document.createElement("input"); i.type = "number"; i.value = val; i.style.cssText = "width:" + (w || 44) + "px;font-size:11px;padding:3px 5px;border-radius:6px;border:1px solid #3a4656;background:#0f1722;color:#dfe6ee"; box.appendChild(i);
            row2.appendChild(box); return i;
        }
        st.cntInp = num("Количество", 1, 46); st.colsInp = num("в ряд", 1, 40); st.gapInp = num("шаг, м", 2.5, 46);
        st.lInp = num("Д", 2); st.wInp = num("Ш", 1); st.hInp = num("В", 2);
        bar.appendChild(row2);
        element.appendChild(bar);
        var hint = document.createElement("div"); hint.style.cssText = "position:absolute;left:50%;top:84px;transform:translateX(-50%);z-index:6;color:#ffd479;font-size:11px;background:rgba(18,26,36,0.85);padding:3px 9px;border-radius:7px;display:none;font-family:sans-serif"; element.appendChild(hint); st.hint = hint;

        function setMode(name) {
            st.placeMode = name || null;
            Object.keys(st.btns || {}).forEach(function (k) { st.btns[k].style.background = (k === name) ? "#3a7bd5" : "transparent"; st.btns[k].style.color = (k === name) ? "#fff" : "#cfd8e3"; });
            if (name) { // подставить размеры выбранного типа
                var t = st.typeList.filter(function (x) { return x.name === name; })[0];
                if (t) { st.lInp.value = t.lenM; st.wInp.value = t.widM; st.hInp.value = t.heM; }
            }
            hint.style.display = name ? "block" : "none";
            hint.textContent = (window.miteTr || String)("кликни по площадке — поставится: ") + (name || "") + " ×" + (st.cntInp.value || 1);
            renderer.domElement.style.cursor = name ? "crosshair" : "";
        }
        st.nameInp = { value: "" };
        var DOMAIN_ORDER = ["Производство", "Склад", "Агро", "Остальное"];
        var DOMAIN_LABELS = { "Производство": "🏭 Производство", "Склад": "📦 Склад", "Агро": "🌾 Агро", "Остальное": "⚙ Остальное" };
        var TYPE_DOMAIN = {
            "Станок (агрегат линии)": "Производство",
            "Конвейер (лента)": "Производство",
            "Кондиционер / чиллер цеха": "Производство",
            "Компрессор": "Производство",
            "Калибратор конический Loedige": "Производство",
            "Роликовый компактор LGS 150H": "Производство",
            "Смеситель Loedige HSMG 150": "Производство",
            "Смеситель-опудриватель бинов": "Производство",
            "Сушилка Loedige FBE 180": "Производство",
            "Экструдер-гранулятор": "Производство",
            "Пресс гидравлический": "Производство",
            "Насосная станция": "Производство",
            "Дробилка": "Производство",
            "Печь / термокамера": "Производство",
            "Фасовочный автомат": "Производство",
            "Дозатор": "Производство",
            "Бункер-накопитель": "Производство",
            "Резервуар / танк": "Производство",
            "Котёл": "Производство",
            "Вытяжная вентиляция": "Производство",
            "Шнековый транспортёр": "Производство",
            "Стеллаж": "Склад",
            "Площадка": "Склад",
            "Стеллаж паллетный": "Склад",
            "Стеллаж полочный": "Склад",
            "Стеллаж консольный": "Склад",
            "Стеллаж набивной": "Склад",
            "Мезонин": "Склад",
            "Поддон / паллета": "Склад",
            "Штабель паллет": "Склад",
            "Погрузчик вилочный": "Склад",
            "Рохля (рокла)": "Склад",
            "Ворота дока": "Склад",
            "Конвейер сортировки": "Склад",
            "Зона приёмки / отгрузки": "Склад",
            "Грядка": "Агро",
            "Курятник": "Агро",
            "Дерево (сад)": "Агро",
            "Поле": "Агро",
            "Теплица": "Агро",
            "Коровник": "Агро",
            "Свинарник": "Агро",
            "Птичник": "Агро",
            "Силосная башня": "Агро",
            "Зернохранилище": "Агро",
            "Ангар / навес": "Агро",
            "Поилка-кормушка": "Агро",
            "Загон": "Агро",
            "Датчик-узел (t°/влажность)": "Остальное",
            "Ворота": "Остальное",
            "Забор": "Остальное",
            "ТестТип": "Остальное",
            "Камера видеонаблюдения": "Остальное",
            "Освещение": "Остальное",
            "Электрощит": "Остальное",
            "Бытовка": "Остальное",
        };
        function mkChip(t) {
            var b = document.createElement("div"); b.style.cssText = "cursor:pointer;color:#cfd8e3;font-size:11px;padding:3px 7px;border-radius:6px;display:flex;align-items:center;gap:4px;background:rgba(255,255,255,.03)";
            var sw = document.createElement("span"); sw.style.cssText = "width:9px;height:9px;border-radius:2px;background:" + (t.color || "#6b7280");
            var tx = document.createElement("span"); tx.textContent = (window.miteTr || String)(t.name);
            b.appendChild(sw); b.appendChild(tx); b.onclick = (function (nm) { return function () { setMode(nm); }; })(t.name);
            st.btns[t.name] = b; return b;
        }
        st.refreshPalette = function () {
            wrap.innerHTML = ""; st.btns = {};
            wrap.style.cssText = "display:flex;flex-direction:column;gap:7px;align-items:stretch";
            var byDom = {}; DOMAIN_ORDER.forEach(function (d) { byDom[d] = []; });
            st.typeList.forEach(function (t) {
                var d = TYPE_DOMAIN[t.name] || "Остальное"; if (!byDom[d]) byDom[d] = []; byDom[d].push(t);
            });
            DOMAIN_ORDER.forEach(function (dom) {
                var list = byDom[dom]; if (!list || !list.length) return;
                var sec = document.createElement("div"); sec.style.cssText = "display:flex;flex-direction:column;gap:4px;padding:3px 2px 3px 7px;border-left:2px solid rgba(120,160,220,.55)";
                var lbl = document.createElement("div"); lbl.textContent = (window.miteTr || String)(DOMAIN_LABELS[dom] || dom);
                lbl.style.cssText = "font-size:10px;font-weight:700;letter-spacing:.3px;color:#8fb3e0;text-transform:none";
                sec.appendChild(lbl);
                var cw = document.createElement("div"); cw.style.cssText = "display:flex;flex-wrap:wrap;gap:3px";
                list.forEach(function (t) { cw.appendChild(mkChip(t)); });
                sec.appendChild(cw); wrap.appendChild(sec);
            });
            if (st.placeMode && st.btns[st.placeMode]) setMode(st.placeMode);
        };

                // ---- панель привязки ----
        var bp = document.createElement("div"); bp.style.cssText = "position:absolute;right:12px;top:60px;width:226px;z-index:7;background:rgba(18,26,36,0.95);border:1px solid #2f3b4a;border-radius:10px;padding:11px 12px;font-family:'Segoe UI',sans-serif;color:#dfe6ee;display:none"; element.appendChild(bp); st.bp = bp;
        function ev(a, extra) { if (st.controller) st.controller.change(Object.assign({ action: a, ix: st.bindIx }, extra || {})); }
        st.showDetail = function (u) {
            st.bindIx = u.index; bp.innerHTML = ""; bp.style.display = "block";
            var bound = u.dev && u.dev !== "";
            var t = document.createElement("div"); t.style.cssText = "font-size:13px;font-weight:700;margin-bottom:4px"; t.textContent = (window.miteTr || String)("Объект"); bp.appendChild(t);
            var ni = document.createElement("input"); ni.value = u.name || ""; ni.style.cssText = "width:100%;font-size:12px;padding:5px 7px;margin:4px 0;border-radius:6px;border:1px solid #3a4656;background:#0f1722;color:#dfe6ee;box-sizing:border-box"; bp.appendChild(ni);
            var m = document.createElement("div"); m.style.cssText = "font-size:11px;color:#9fb0c4;margin-bottom:6px"; m.innerHTML = (window.miteTr || String)("тип") + ": " + (window.miteTr || String)(u.shape) + "<br>" + (bound ? '<span style="color:#1f9d6b">🔗 ' + (window.miteTr || String)("датчик") + ' #' + u.dev + (u.value !== "" ? " · " + u.value + "°C" : "") + "</span>" : '<span style="color:#9fb0c4">' + (window.miteTr || String)("не привязан") + "</span>"); bp.appendChild(m);
            // правка размера
            var tp = st.types[u.shape] || {};
            var szRow = document.createElement("div"); szRow.style.cssText = "display:flex;gap:4px;align-items:center;margin-bottom:4px";
            var szL = document.createElement("span"); szL.textContent = (window.miteTr || String)("Размер Д×Ш×В:"); szL.style.cssText = "font-size:11px;color:#9fb0c4;white-space:nowrap"; szRow.appendChild(szL);
            function sin(v) { var i = document.createElement("input"); i.type = "number"; i.value = v; i.style.cssText = "width:38px;font-size:11px;padding:3px;border-radius:5px;border:1px solid #3a4656;background:#0f1722;color:#dfe6ee"; szRow.appendChild(i); return i; }
            var iL = sin(u.lenM > 0 ? u.lenM : (tp.lenM || 1.6)), iW = sin(u.widM > 0 ? u.widM : (tp.widM || 1.4)), iH = sin(u.heM > 0 ? u.heM : (tp.heM || 1.6));
            bp.appendChild(szRow);
            function btn(txt, col, fn) { var b = document.createElement("div"); b.textContent = (window.miteTr || String)(txt); b.style.cssText = "cursor:pointer;text-align:center;font-size:12px;padding:7px;margin-top:6px;border-radius:7px;background:" + col + ";color:#fff"; b.onclick = fn; bp.appendChild(b); }
            btn("Применить размер", "#3a4656", function () { ev("resize", { pl: +iL.value || 1.6, pw: +iW.value || 1.4, ph: +iH.value || 1.6 }); bp.style.display = "none"; });
            btn("🔗 Привязать датчик", "#2563a8", function () { ev("bindask"); bp.style.display = "none"; });
            if (bound) btn("Отвязать", "#5a6470", function () { ev("unbind"); bp.style.display = "none"; });
            btn("Переименовать", "#3a4656", function () { if (ni.value && ni.value !== u.name) ev("rename", { object: ni.value }); bp.style.display = "none"; });
            btn("🗑 Удалить", "#a8352f", function () { ev("delunit"); bp.style.display = "none"; });
            btn("Закрыть", "#26303c", function () { bp.style.display = "none"; });
        };

        // ---- объект по форме ----
        function addUnit(u) {
            var t = st.types[u.shape] || {}, sh = u.shape || "box";
            var lm = u.lenM > 0 ? u.lenM : (t.lenM || 1.6), wm = u.widM > 0 ? u.widM : (t.widM || 1.4), hm = u.heM > 0 ? u.heM : (t.heM || 1.6);
            var L = Math.max(3, lm * M2U), W = Math.max(3, wm * M2U), H = Math.max(2, hm * M2U), col = t.color || "#6b7280";
            var g = new THREE.Group(); g.position.set(u.posX, 0, u.posZ); world.add(g); var pick;
            // АВТО-ФИГУРА по НАЗВАНИЮ (общая библиотека): распознан тип → рисуем узнаваемую схему; иначе — по форме (ниже)
            var auto = window.miteShapeLib && window.miteShapeLib(THREE, u.name, Math.max(H, 22));
            if (auto && auto.matched) { g.add(auto.group); pick = auto.bodies[0]; }
            else if (sh === "gate") {
                var jw = Math.max(2.4, W * 0.4);
                [-L / 2 + 1.5, L / 2 - 1.5].forEach(function (dx) { var p = mk(THREE, new THREE.BoxGeometry(3, H, jw), col); p.position.set(dx, H / 2, 0); g.add(p); });
                var tp = mk(THREE, new THREE.BoxGeometry(L, 3, jw), col); tp.position.set(0, H, 0); g.add(tp);
                pick = mk(THREE, new THREE.BoxGeometry(L, H, jw + 3), col, { transparent: true, opacity: 0.001 }); pick.position.set(0, H / 2, 0); g.add(pick);
            } else if (sh === "tree") {
                var tr = mk(THREE, new THREE.CylinderGeometry(1.6, 2.2, H * 0.5, 8), 0x6b4f2a); tr.position.set(0, H * 0.25, 0); g.add(tr);
                var cr = mk(THREE, new THREE.SphereGeometry(Math.max(L, W) / 2, 12, 10), col); cr.position.set(0, H * 0.72, 0); g.add(cr); pick = cr;
            } else if (sh === "fence") {
                var rl = mk(THREE, new THREE.BoxGeometry(L, Math.max(2, H * 0.2), Math.max(1.6, W)), col); rl.position.set(0, H * 0.78, 0); g.add(rl);
                var np = Math.max(2, Math.round(L / 12)); for (var i = 0; i <= np; i++) { var po = mk(THREE, new THREE.BoxGeometry(2, H, Math.max(1.6, W)), col); po.position.set(-L / 2 + i * (L / np), H / 2, 0); g.add(po); }
                pick = mk(THREE, new THREE.BoxGeometry(L, H, Math.max(3, W)), col, { transparent: true, opacity: 0.001 }); pick.position.set(0, H / 2, 0); g.add(pick);
            } else if (sh === "plot" || sh === "pad") {
                var hh = Math.max(1.2, H); var sl = mk(THREE, new THREE.BoxGeometry(L, hh, W), col); sl.position.set(0, hh / 2, 0); g.add(sl); pick = sl;
            } else if (sh === "sensor") {
                var sb = mk(THREE, new THREE.BoxGeometry(Math.max(5, L), Math.max(5, W), Math.max(5, W)), col); sb.position.set(0, H - 3, 0); g.add(sb);
                var sm = mk(THREE, new THREE.BoxGeometry(2, H, 2), 0x6b7686); sm.position.set(0, H / 2, 0); g.add(sm); pick = sb;
            } else if (sh === "tank" || sh === "silo" || sh === "reactor") {
                var r = Math.max(2.4, Math.min(L, W) / 2);
                var bh = H * (sh === "silo" ? 0.9 : 0.78);
                var body = mk(THREE, new THREE.CylinderGeometry(r, r, bh, 28), col); body.position.set(0, bh / 2 + H * 0.06, 0); g.add(body);
                var dome = mk(THREE, new THREE.SphereGeometry(r, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), col); dome.position.set(0, bh + H * 0.06, 0); g.add(dome);
                var skirt = mk(THREE, new THREE.CylinderGeometry(r * 1.05, r * 1.15, H * 0.06, 28), 0x6b7686); skirt.position.set(0, H * 0.03, 0); g.add(skirt);
                var band = mk(THREE, new THREE.TorusGeometry(r * 1.01, 0.5, 8, 28), 0x9aa5b1); band.rotation.x = Math.PI / 2; band.position.set(0, bh * 0.6, 0); g.add(band);
                pick = body;
            } else if (sh === "pump" || sh === "compressor" || sh === "hvac") {
                var base = mk(THREE, new THREE.BoxGeometry(L, H * 0.35, W), col); base.position.set(0, H * 0.175, 0); g.add(base);
                var mr = Math.max(2, Math.min(L, W) * 0.32);
                var mot = mk(THREE, new THREE.CylinderGeometry(mr, mr, L * 0.7, 20), 0x8f98a4); mot.rotation.z = Math.PI / 2; mot.position.set(0, H * 0.55, 0); g.add(mot);
                pick = base;
            } else if (sh === "oven") {
                // печь / сушильная камера: изолированный корпус + дверь с ручкой + дымоход + пульт
                var obody = mk(THREE, new THREE.BoxGeometry(L, H, W), col); obody.position.set(0, H / 2, 0); g.add(obody);
                var oed = new THREE.LineSegments(new THREE.EdgesGeometry(obody.geometry), new THREE.LineBasicMaterial({ color: 0x2b3440, transparent: true, opacity: 0.35 })); oed.position.copy(obody.position); g.add(oed);
                var oframe = mk(THREE, new THREE.BoxGeometry(L * 0.66, H * 0.72, 1), 0x8a7a5a); oframe.position.set(-L * 0.06, H * 0.42, W / 2 + 0.1); g.add(oframe);
                var odoor = mk(THREE, new THREE.BoxGeometry(L * 0.6, H * 0.66, 1.6), 0x3a2f28); odoor.position.set(-L * 0.06, H * 0.42, W / 2 + 0.5); g.add(odoor);
                var ohandle = mk(THREE, new THREE.CylinderGeometry(1, 1, H * 0.3, 8), 0xcbb58a); ohandle.position.set(L * 0.2, H * 0.42, W / 2 + 1.4); g.add(ohandle);
                var oflue = mk(THREE, new THREE.CylinderGeometry(Math.min(L, W) * 0.13, Math.min(L, W) * 0.13, H * 0.5, 14), 0x6b7078); oflue.position.set(L * 0.28, H + H * 0.2, -W * 0.22); g.add(oflue);
                var opanel = mk(THREE, new THREE.BoxGeometry(L * 0.16, H * 0.24, 1.6), 0x223047); opanel.position.set(L * 0.3, H * 0.62, W / 2 + 0.5); g.add(opanel);
                pick = obody;
            } else if (sh === "boiler") {
                // котёл: вертикальный сосуд с куполом и патрубком
                var rb = Math.max(2.4, Math.min(L, W) / 2), bbh = H * 0.8;
                var bcyl = mk(THREE, new THREE.CylinderGeometry(rb, rb, bbh, 24), col); bcyl.position.set(0, bbh / 2, 0); g.add(bcyl);
                var bdome = mk(THREE, new THREE.SphereGeometry(rb, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), col); bdome.position.set(0, bbh, 0); g.add(bdome);
                var bpipe = mk(THREE, new THREE.CylinderGeometry(rb * 0.16, rb * 0.16, H * 0.35, 10), 0x6b7078); bpipe.position.set(rb * 0.6, bbh + H * 0.1, 0); g.add(bpipe);
                pick = bcyl;
            } else if (sh === "hopper") {
                // бункер: короб-накопитель + воронка снизу
                var rH = Math.max(2.4, Math.min(L, W) / 2), funH = H * 0.5, topH = H * 0.4;
                var htop = mk(THREE, new THREE.BoxGeometry(L, topH, W), col); htop.position.set(0, funH + topH / 2, 0); g.add(htop);
                var fun = mk(THREE, new THREE.CylinderGeometry(rH, rH * 0.2, funH, 12), col); fun.position.set(0, funH / 2, 0); g.add(fun);
                pick = htop;
            } else if (sh === "press") {
                // пресс: основание + 2 стойки + верхняя балка + ползун
                var pbase = mk(THREE, new THREE.BoxGeometry(L, H * 0.18, W), 0x51606e); pbase.position.set(0, H * 0.09, 0); g.add(pbase);
                [-1, 1].forEach(function (s) { var pc = mk(THREE, new THREE.BoxGeometry(L * 0.16, H * 0.78, W * 0.7), col); pc.position.set(s * L * 0.35, H * 0.5, 0); g.add(pc); });
                var pbeam = mk(THREE, new THREE.BoxGeometry(L, H * 0.2, W * 0.8), col); pbeam.position.set(0, H * 0.9, 0); g.add(pbeam);
                var pram = mk(THREE, new THREE.BoxGeometry(L * 0.42, H * 0.28, W * 0.5), 0x8f98a4); pram.position.set(0, H * 0.56, 0); g.add(pram);
                pick = pbeam;
            } else if (sh === "crusher") {
                // дробилка: корпус + приёмная воронка сверху + боковой мотор
                var cbody = mk(THREE, new THREE.BoxGeometry(L, H * 0.6, W), col); cbody.position.set(0, H * 0.3, 0); g.add(cbody);
                var chop = mk(THREE, new THREE.CylinderGeometry(Math.min(L, W) * 0.48, Math.min(L, W) * 0.2, H * 0.4, 12), col); chop.position.set(0, H * 0.8, 0); g.add(chop);
                var cmot = mk(THREE, new THREE.CylinderGeometry(H * 0.16, H * 0.16, W * 0.45, 12), 0x8f98a4); cmot.rotation.x = Math.PI / 2; cmot.position.set(L * 0.42, H * 0.3, 0); g.add(cmot);
                pick = cbody;
            } else if (sh === "fan") {
                // вентилятор: круглый кожух + ступица + лопасти + опора
                var rF = Math.max(2.4, Math.min(L, W) / 2);
                var fhous = mk(THREE, new THREE.CylinderGeometry(rF, rF, Math.max(4, W * 0.5), 20), col); fhous.rotation.x = Math.PI / 2; fhous.position.set(0, H * 0.6, 0); g.add(fhous);
                var fhub = mk(THREE, new THREE.CylinderGeometry(rF * 0.22, rF * 0.22, W * 0.55, 12), 0x333a44); fhub.rotation.x = Math.PI / 2; fhub.position.set(0, H * 0.6, 0); g.add(fhub);
                [0, Math.PI / 2].forEach(function (a) { var fbl = mk(THREE, new THREE.BoxGeometry(rF * 1.5, 1.5, 3), 0x9aa3ad); fbl.position.set(0, H * 0.6, W * 0.28); fbl.rotation.z = a; g.add(fbl); });
                var fstand = mk(THREE, new THREE.BoxGeometry(L * 0.3, H * 0.32, W * 0.3), 0x51606e); fstand.position.set(0, H * 0.16, 0); g.add(fstand);
                pick = fhous;
            } else {
                var bd = mk(THREE, new THREE.BoxGeometry(L, H, W), col); bd.position.set(0, H / 2, 0); g.add(bd);
                g.add(new THREE.LineSegments(new THREE.EdgesGeometry(bd.geometry), new THREE.LineBasicMaterial({ color: 0x2b3440, transparent: true, opacity: 0.35 }))); pick = bd;
            }
            if (pick) { pick.userData.ix = u.index; st.raycast.push(pick); }
            if (!window.__noLabels || u.dev) {
                var ltxt, lcol;
                if (window.__noLabels && u.dev) { ltxt = "🔗 " + ((u.value !== "" && u.value != null) ? (Math.round(u.value * 10) / 10) + "°" : "датчик"); lcol = "#1f9d6b"; }
                else { ltxt = (u.name || "объект") + (u.dev ? " 🔗" : ""); lcol = u.dev ? "#1f9d6b" : "#1f6f8b"; }
                var lab = label(THREE, ltxt, lcol); lab.position.set(u.posX, H + 10, u.posZ); world.add(lab);
            }
        }

        // ---- pick / orbit ----
        var ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), drag = null;
        renderer.domElement.addEventListener("mousedown", function (e) { drag = { x: e.clientX, y: e.clientY, t: orbit.theta, p: orbit.phi, moved: false }; });
        window.addEventListener("mousemove", function (e) { if (!drag) return; var dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; orbit.theta = drag.t - dx * 0.006; orbit.phi = Math.max(0.2, Math.min(1.45, drag.p - dy * 0.006)); st.applyCamera(); });
        window.addEventListener("mouseup", function (e) { if (drag && !drag.moved) pick(e); drag = null; });
        renderer.domElement.addEventListener("wheel", function (e) { e.preventDefault(); orbit.radius = Math.max(80, Math.min(1400, orbit.radius * (1 + (e.deltaY > 0 ? 0.1 : -0.1)))); st.applyCamera(); }, { passive: false });
        function pick(e) {
            var rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1; mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            ray.setFromCamera(mouse, camera);
            if (st.placeMode) {
                var pt = new THREE.Vector3();
                if (ray.ray.intersectPlane(st.floorPlane, pt) && st.controller) {
                    var cnt = Math.max(1, Math.min(200, +st.cntInp.value || 1));
                    var cols = Math.max(1, Math.min(50, +st.colsInp.value || 1));
                    var rows = Math.ceil(cnt / cols);
                    var gap = Math.max(0.2, +st.gapInp.value || 2.5) * M2U;
                    st.controller.change({
                        action: "placebatch", etype: st.placeMode,
                        rows: rows, cols: cols, gap: Math.round(gap),
                        px: Math.round(pt.x), pz: Math.round(pt.z),
                        pl: +st.lInp.value || 1.6, pw: +st.wInp.value || 1.4, ph: +st.hInp.value || 1.6
                    });
                }
                return;
            }
            var hit = ray.intersectObjects(st.raycast, false)[0];
            if (hit && hit.object.userData.ix != null) { var u = st.unitByIx[hit.object.userData.ix]; if (u) st.showDetail(u); }
        }

        st.rebuild = function (data) {
            while (world.children.length) world.remove(world.children[0]);
            world.add(floor); world.add(new THREE.GridHelper(Math.max(FW, FD), Math.round(Math.max(FW, FD) / 18), 0x8f98a4, 0xa6aeb9));
            st.types = {}; st.typeList = []; st.units = {}; st.unitByIx = {}; st.raycast = [];
            var recs = (data || "").split("~");
            for (var i = 1; i < recs.length; i++) {
                var f = recs[i].split("^");
                if (f[0] === "T") { var t = { name: f[1], shape: f[2], lenM: +f[3] || 1.6, widM: +f[4] || 1.4, heM: +f[5] || 1.6, color: f[6] || "#6b7280" }; st.types[f[2]] = t; st.typeList.push(t); }
                else if (f[0] === "O") { var u = { index: +f[1] || 0, name: f[2], shape: f[3], posX: +f[4] || 0, posZ: +f[5] || 0, dev: f[6] || "", value: f[7] || "", lenM: +f[8] || 0, widM: +f[9] || 0, heM: +f[10] || 0 }; st.units[f[1]] = u; st.unitByIx[u.index] = u; }
            }
            Object.keys(st.units).forEach(function (k) { addUnit(st.units[k]); });
            st.refreshPalette();
            // авто-вписать все объекты в экран (по умолчанию всё влезает; зум/вращение остаются)
            var ks = Object.keys(st.units);
            if (ks.length) {
                var minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
                ks.forEach(function (k) { var u = st.units[k]; if (u.posX < minX) minX = u.posX; if (u.posX > maxX) maxX = u.posX; if (u.posZ < minZ) minZ = u.posZ; if (u.posZ > maxZ) maxZ = u.posZ; });
                orbit.target.set((minX + maxX) / 2, 8, (minZ + maxZ) / 2);
                var span = Math.max(60, (maxX - minX), (maxZ - minZ));
                orbit.radius = span * 1.5 + 80;
            } else { orbit.target.set(0, 8, 0); orbit.radius = 300; }
            st.applyCamera(); st.resize();
        };

        (function loop() { requestAnimationFrame(loop); renderer.render(scene, camera); })();
        st.resize();
    }

    return {
        render: function (element) {
            element.style.cssText = "position:relative;height:74vh;min-height:420px;overflow:hidden";
            if (window.THREE) build(element);
            else { var n = 0, t = setInterval(function () { if (window.THREE) { clearInterval(t); build(element); if (element.__pending) element.__c3d.rebuild(element.__pending); } else if (++n > 100) clearInterval(t); }, 50); }
        },
        update: function (element, controller, value) {
            var s = (typeof value === "string") ? value : ""; if (!s) return;
            var st = element.__c3d;
            if (st) { st.controller = controller; if (s === st.last) return; st.last = s; st.rebuild(s); } else element.__pending = s;
        }
    };
}
