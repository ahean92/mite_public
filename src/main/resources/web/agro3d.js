// 3D-«ферма» (агро-кейс). Движок как energy3d/vlf3d: объекты в сетке, цвет по выбранному слою,
// клик → карточка (датчики воздух/почва/лист + погода + рекомендация + действия), болезни — авто-бейджи,
// небо реагирует на прогноз. Данные (agroData):
//   'A^objs^area^water^disease^atRisk^saved' + '~' +
//   U^name^type^crop^site^airT^airH^soilM^soilT^leafW^leafQ^disease^nowT^minT^precip^wind^reco^status^px^pz
//   status: ok|water|disease|frost|rain ; type: field|greenhouse|beds|orchard
function agro3d() {
    var tr = window.miteTr || String;
    function synthDisease(crop, leafW, airH) {
        if (leafW < 45) return ""; var c = (crop || "").toLowerCase(), wet = leafW >= 60, hot = airH >= 85;
        if (/пшениц|ячмен|рож|ов[её]с|злак/.test(c)) return wet ? "Септориоз" : "Бурая ржавчина";
        if (/кукуруз/.test(c)) return wet ? "Гельминтоспориоз" : "Пузырчатая головня";
        if (/подсолнеч/.test(c)) return wet ? "Ложная мучнистая роса" : "Фомоз";
        if (/соя/.test(c)) return wet ? "Пероноспороз" : "Церкоспороз";
        if (/рапс/.test(c)) return wet ? "Склеротиниоз" : "Альтернариоз";
        if (/гречих/.test(c)) return "Пероноспороз";
        if (/виноград/.test(c)) return wet ? "Милдью" : "Оидиум";
        if (/ябло|черешн|вишн|груш|сад/.test(c)) return wet ? "Парша" : (hot ? "Мучнистая роса" : "Монилиоз");
        if (/огур/.test(c)) return wet ? "Пероноспороз (ложная мучн.)" : "Мучнистая роса огурца";
        if (/томат|перец|баклаж/.test(c)) return wet ? "Фитофтороз" : (hot ? "Мучнистая роса" : "Кладоспориоз");
        if (/клубник|землян/.test(c)) return wet ? "Серая гниль" : "Бурая пятнистость земляники";
        if (/картоф|овощ|морков|капуст|грядк|тепли|зелен/.test(c)) return wet ? "Фитофтороз" : (hot ? "Мучнистая роса" : "Альтернариоз");
        return wet && hot ? "Мучнистая роса" : (wet ? "Фитофтороз" : "Бурая пятнистость");
    }
    function mk(THREE, geo, color, opts) { return new THREE.Mesh(geo, new THREE.MeshLambertMaterial(Object.assign({ color: new THREE.Color(color) }, opts || {}))); }
    var _shTex = null;
    function shadowTex(THREE) { if (_shTex) return _shTex; var c = document.createElement("canvas"); c.width = c.height = 128; var x = c.getContext("2d"); var g = x.createRadialGradient(64, 64, 6, 64, 64, 62); g.addColorStop(0, "rgba(20,26,18,0.42)"); g.addColorStop(0.65, "rgba(20,26,18,0.18)"); g.addColorStop(1, "rgba(20,26,18,0)"); x.fillStyle = g; x.fillRect(0, 0, 128, 128); _shTex = new THREE.CanvasTexture(c); return _shTex; }
    // мягкая агрономическая шкала: сочная зелень → тёплая охра → терракота (без «неона»)
    var RAMP = [[0x5f, 0x9c, 0x48], [0x9b, 0xb2, 0x4a], [0xdc, 0xb4, 0x4c], [0xcb, 0x80, 0x3e], [0xb6, 0x4f, 0x35]];
    function ramp(t) {
        t = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
        var i = Math.min(RAMP.length - 2, Math.floor(t)), k = t - i, a = RAMP[i], b = RAMP[i + 1];
        return (Math.round(a[0] + (b[0] - a[0]) * k) << 16) | (Math.round(a[1] + (b[1] - a[1]) * k) << 8) | Math.round(a[2] + (b[2] - a[2]) * k);
    }
    var C = { ok: 0x5f7f4a, water: 0xb9883c, disease: 0xb0563c, frost: 0x6f86b8, rain: 0x4e93a4 };
    function statusColor(s) { return C[s] != null ? C[s] : C.ok; }
    function lerpHex(a, b, k) { var r = (a >> 16) & 255, g = (a >> 8) & 255, l = a & 255; return (Math.round(r + (((b >> 16) & 255) - r) * k) << 16) | (Math.round(g + (((b >> 8) & 255) - g) * k) << 8) | Math.round(l + ((b & 255) - l) * k); }
    // цвет по КУЛЬТУРЕ → ферма читается как лоскутное одеяло; созревающие поля золотятся
    function cropColor(crop, gcode, type) {
        var c = (crop || "").toLowerCase(), base;
        if (/пшениц|ячмен|рож|ов[её]с|злак/.test(c)) base = 0xc0a64e;
        else if (/кукуруз/.test(c)) base = 0x5d9440;
        else if (/подсолнеч/.test(c)) base = 0xb5a441;
        else if (/рапс/.test(c)) base = 0xd2be49;
        else if (/гречих/.test(c)) base = 0x8fa055;
        else if (/соя/.test(c)) base = 0x74a04e;
        else if (/св[её]кл/.test(c)) base = 0x4f8a3e;
        else if (/люцерн|клевер/.test(c)) base = 0x79ad55;
        else if (/виноград/.test(c)) base = 0x5b7a48;
        else if (/ябло|черешн|вишн|груш|сад/.test(c)) base = 0x4d7a3f;
        else if (/томат|перец|огур|зелен|тепли/.test(c)) base = 0x69a552;
        else if (/капуст|морков|клубник|земл|овощ|грядк/.test(c)) base = 0x7aa85f;
        else base = 0x6f9a4e;
        // золотится только пашня (сады/теплицы остаются зелёными — кроны не желтеют)
        if (gcode >= 2 && type !== "orchard" && type !== "greenhouse") base = lerpHex(base, 0xd0a63c, gcode >= 3 ? 0.78 : 0.45);
        return base;
    }
    function h32name(s) { s = "" + s; var x = 2166136261; for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = (x * 16777619) >>> 0; } return (x % 100000) / 100000; }
    // гладкий 2D value-noise (пятна по полю), детерминированно по seed — чтобы карта слоя была неоднородной
    function cell2d(seed, gx, gy) {
        function h(a, b) { var n = Math.sin(a * 12.9898 + b * 78.233 + seed * 0.137) * 43758.5453; return n - Math.floor(n); }
        function vn(f) {
            var x = gx * f, y = gy * f, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
            var a = h(x0, y0), b = h(x0 + 1, y0), c = h(x0, y0 + 1), d = h(x0 + 1, y0 + 1);
            var sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
            return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
        }
        return (vn(1.0) * 0.62 + vn(2.4) * 0.38) * 2 - 1;
    }
    // слои: kind 'heat' → тепловая карта по поверхности (ramp по t + пятна); 'status' → цвет статуса с лёгкой вариацией
    var LAYERS = [
        { label: "Состояние", kind: "status", spread: 0.16,
          color: function (u) { var base = cropColor(u.crop, u.gcode, u.type); return (u.status === "ok" || u.status === "rain") ? base : lerpHex(base, statusColor(u.status), 0.68); },
          t: function (u) { return (u.status === "ok" || u.status === "rain") ? 0.25 : 0.75; } },
        { label: "Влажность почвы", kind: "heat", spread: 0.30, t: function (u) { return 1 - Math.min(1, (u.soilM || 0) / 60); } },
        { label: "Качество листа", kind: "heat", spread: 0.26, t: function (u) { return 1 - Math.min(1, (u.leafQ || 100) / 100); } },
        { label: "Прогноз осадков", kind: "heat", spread: 0.24, t: function (u) { return Math.min(1, (u.precip || 0) / 100); } },
        { label: "Температура", kind: "heat", spread: 0.22, t: function (u, mx) { return mx ? (u.airT || 0) / mx : 0; } }
    ];

    // Агрономичные фигуры: у КАЖДОЙ делянки своя вспаханная почва + бортик-межа + мягкая контактная тень
    // (объект «стоит на земле», а не висит). Культуры — рядами с высотой. bodies перекрашиваются по слою.
    function shapeLib(THREE, type, name) {
        var g = new THREE.Group(), bodies = [], seed = h32name(name) * 1000;
        function add(m, x, y, z) { m.position.set(x || 0, y || 0, z || 0); g.add(m); return m; }
        function body(m) { bodies.push(m); return m; }
        function pad(w, d, soil) {                                                              // грунт делянки
            var csh = new THREE.Mesh(new THREE.PlaneGeometry(w + 26, d + 26), new THREE.MeshBasicMaterial({ map: shadowTex(THREE), transparent: true, depthWrite: false })); csh.rotation.x = -Math.PI / 2; csh.renderOrder = 0; add(csh, -5, 0.47, 6);  // мягкая контактная тень (сдвиг под солнце)
            add(mk(THREE, new THREE.BoxGeometry(w + 9, 0.7, d + 9), 0x463a2c), 0, 0.35, 0);     // бортик-межа (тёмная земля)
            add(mk(THREE, new THREE.BoxGeometry(w + 5, 0.55, d + 5), 0x6a5334), 0, 0.62, 0);    // грунтовая обочина по контуру
            var sm = mk(THREE, new THREE.BoxGeometry(w, 1.1, d), soil || 0x6b5a44); sm.receiveShadow = true; add(sm, 0, 0.9, 0);  // вспаханная почва
            // тепло-карта поверхности: PlaneGeometry с пер-вершинными цветами → пятна по полю (не один цвет)
            var SEG = 12, hg = new THREE.PlaneGeometry(w, d, SEG, SEG), cnt = hg.attributes.position.count;
            var cols = new Float32Array(cnt * 3), hn = new Float32Array(cnt);
            for (var i = 0; i < cnt; i++) { hn[i] = cell2d(seed, hg.attributes.position.getX(i) * 0.06, hg.attributes.position.getY(i) * 0.06); cols[i * 3] = 0.42; cols[i * 3 + 1] = 0.55; cols[i * 3 + 2] = 0.28; }
            hg.setAttribute("color", new THREE.BufferAttribute(cols, 3));
            var hm = new THREE.Mesh(hg, new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
            hm.rotation.x = -Math.PI / 2; hm.position.set(0, 1.5, 0); hm.userData.hn = hn; hm.renderOrder = 1; hm.receiveShadow = true;
            add(hm); g.__heat = hm;
        }
        var k = (type || "") + " " + (name || "").toLowerCase();
        if (/greenhouse|теплиц/.test(k)) {                 // теплица: цоколь + ряды растений + двускатная стеклянная крыша
            pad(34, 22, 0x5d5040);
            add(mk(THREE, new THREE.BoxGeometry(30, 2, 18), 0x9aa4ac), 0, 1.4, 0);                        // цоколь-каркас
            for (var gz = -1; gz <= 1; gz++) { var gr = mk(THREE, new THREE.BoxGeometry(26, 2.6, 2.4), 0x77955c); gr.castShadow = true; body(add(gr, 0, 3.4, gz * 5)); }
            var glass = { transparent: true, opacity: 0.3, side: THREE.DoubleSide };
            var rL = mk(THREE, new THREE.PlaneGeometry(30, 12), 0xc4d6dc, glass); rL.rotation.x = -Math.PI / 5; add(rL, 0, 8, -4.6);
            var rR = mk(THREE, new THREE.PlaneGeometry(30, 12), 0xc4d6dc, glass); rR.rotation.x = Math.PI / 5; add(rR, 0, 8, 4.6);
            add(mk(THREE, new THREE.BoxGeometry(0.5, 9, 18), 0x9aa4ac), 15, 5.5, 0); add(mk(THREE, new THREE.BoxGeometry(0.5, 9, 18), 0x9aa4ac), -15, 5.5, 0);  // торцы
            for (var rib = -12; rib <= 12; rib += 6) add(mk(THREE, new THREE.BoxGeometry(0.35, 0.35, 20), 0x8a949e), rib, 11.6, 0);  // конёк-рёбра
        } else if (/beds|грядк/.test(k)) {                 // грядки: приподнятые гряды с рядами кустиков
            pad(40, 32, 0x6b5a44);
            [-12, -4, 4, 12].forEach(function (z) {
                add(mk(THREE, new THREE.BoxGeometry(34, 1.8, 4.6), 0x6f573b), 0, 1.9, z);                 // насыпная гряда
                var sw = mk(THREE, new THREE.BoxGeometry(32, 1.0, 3.4), 0x6f8f52); sw.castShadow = true; body(add(sw, 0, 2.9, z));  // засев (перекраш.)
                for (var bx = -14; bx <= 14; bx += 4) { var kb = mk(THREE, new THREE.ConeGeometry(1.05, 2.4, 6), 0x5f7f45); kb.castShadow = true; add(kb, bx, 4.3, z); }  // кустики рядами
            });
        } else if (/orchard|сад|дерев|яблон/.test(k)) {    // сад: сетка деревьев на травяной делянке
            pad(40, 30, 0x5f6a44);
            for (var ox = -13; ox <= 13; ox += 13) for (var oz = -8; oz <= 8; oz += 16) {
                var tk2 = mk(THREE, new THREE.CylinderGeometry(0.9, 1.6, 7.5, 9), 0x6b4a2c); tk2.castShadow = true; add(tk2, ox, 4, oz);
                // пышная крона: несколько блобов со смещением — читается как дерево, а не шар на палке
                [[0, 10.2, 0, 4.3], [-2.5, 8.9, 1.5, 3.1], [2.4, 9.2, -1.4, 3.3], [0.6, 12.4, 0.5, 2.7], [-1.2, 11.4, -2.1, 2.5]].forEach(function (p) {
                    var cr = mk(THREE, new THREE.SphereGeometry(p[3], 10, 9), 0x5f7f4a); cr.castShadow = true; body(add(cr, ox + p[0], p[1], oz + p[2]));
                });
            }
        } else {                                            // поле: делянка с частыми рядами культуры (высота + борозды между)
            pad(40, 30, 0x6b5a44);
            for (var fz = -13.8; fz <= 13.81; fz += 1.55) {
                var hh2 = 2.15 + (Math.abs(cell2d(seed + 3, fz * 0.6, 0)) * 0.5);           // лёгкая неровность высоты рядов
                var rm = mk(THREE, new THREE.BoxGeometry(36, hh2, 0.92), 0x74965a); rm.castShadow = true; body(add(rm, 0, 1.45 + hh2 / 2, fz));
            }
        }
        var bodyNoise = bodies.map(function (m, bi) { return cell2d(seed + 11, bi * 1.7, (bi % 4) * 2.1); });
        return { group: g, bodies: bodies, heat: g.__heat, bodyNoise: bodyNoise };
    }
    function label(THREE, text, color) {
        var c = document.createElement("canvas"); c.width = 256; c.height = 64; var x = c.getContext("2d");
        x.fillStyle = color || "#20303f"; x.font = "bold 26px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText((text || "").slice(0, 22), 128, 32);
        var t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter;
        var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true })); s.scale.set(34, 8.5, 1); return s;
    }
    function badge(THREE, emoji) {
        var c = document.createElement("canvas"); c.width = 64; c.height = 64; var x = c.getContext("2d");
        x.font = "48px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(emoji, 32, 34);
        var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false })); s.scale.set(9, 9, 1); s.renderOrder = 20; return s;
    }

    function build(element) {
        var THREE = window.THREE;
        var st = { THREE: THREE, units: [], layer: 0, meshes: [], raycast: [], badges: [], machines: [], drones: [], mraycast: [], draycast: [] };
        // комбайн (стилизованный): шасси, корпус, бункер с зерном, кабина со стеклом/зеркалами/выхлопом,
        // выгрузной шнек, жатка с мотовилом на планках и делителями, большие ведущие колёса спереди, маячок
        function combine(col) {
            var g = new THREE.Group(), C1 = col || 0xd9a32b, C2 = 0x2f353b, C3 = 0x99a0a7;
            function px(geo, c, x, y, z, o) { var m = mk(THREE, geo, c, o); m.position.set(x, y, z); g.add(m); return m; }
            px(new THREE.BoxGeometry(11.8, 2.0, 5.4), C2, 0, 3.2, 0);                                   // шасси
            var hull = px(new THREE.BoxGeometry(10.6, 3.6, 6.2), C1, -0.2, 6.0, 0); hull.castShadow = true;
            px(new THREE.BoxGeometry(2.4, 2.4, 6.0), C1, -5.9, 5.2, 0);                                 // нос к жатке
            px(new THREE.BoxGeometry(6.0, 0.5, 6.4), C2, -1.4, 7.9, 0);                                 // рама бункера
            px(new THREE.BoxGeometry(5.6, 2.6, 5.9), 0x6f5230, -1.4, 9.2, 0);                           // бункер
            var fill = px(new THREE.BoxGeometry(5.1, 2.3, 5.4), 0xe6c368, -1.4, 8.4, 0); fill.scale.y = 0.05;   // зерно
            px(new THREE.BoxGeometry(3.6, 3.2, 5.0), 0xcfe6f5, 2.9, 8.0, 0, { transparent: true, opacity: 0.6 });  // кабина
            px(new THREE.BoxGeometry(3.9, 0.45, 5.3), C2, 2.9, 9.8, 0);                                 // крыша
            px(new THREE.BoxGeometry(0.22, 1.1, 0.22), C2, 1.3, 10.4, 2.3); px(new THREE.BoxGeometry(0.22, 1.1, 0.22), C2, 1.3, 10.4, -2.3);  // зеркала
            px(new THREE.CylinderGeometry(0.3, 0.3, 2.2, 8), C2, 0.7, 9.0, 2.5);                        // выхлоп
            var aug = px(new THREE.CylinderGeometry(0.6, 0.6, 9.0, 10), C3, -1.6, 9.3, 4.6); aug.rotation.x = Math.PI / 2; aug.rotation.z = 0.30;  // шнек
            px(new THREE.CylinderGeometry(0.78, 0.78, 1.1, 10), C3, -1.6, 9.6, 8.6);
            var hd = px(new THREE.BoxGeometry(1.7, 1.5, 10.0), C3, -7.4, 2.7, 0); hd.castShadow = true;  // жатка
            px(new THREE.BoxGeometry(2.4, 0.45, 10.2), C3, -6.9, 1.95, 0);                              // нож
            var reel = new THREE.Group(); reel.position.set(-7.6, 4.5, 0); g.add(reel);                 // мотовило на планках
            var axis = mk(THREE, new THREE.CylinderGeometry(0.32, 0.32, 9.6, 8), C2); axis.rotation.x = Math.PI / 2; reel.add(axis);
            for (var bi = 0; bi < 6; bi++) { var a = bi / 6 * Math.PI * 2, bar = mk(THREE, new THREE.BoxGeometry(0.34, 0.34, 9.2), 0xe0b447); bar.position.set(Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0); reel.add(bar); }
            [5.2, -5.2].forEach(function (z) { var dv = px(new THREE.ConeGeometry(0.65, 2.4, 8), C3, -8.4, 3.2, z); dv.rotation.z = -Math.PI / 2; });  // делители
            [[-3.2, 3.0], [4.6, 1.9]].forEach(function (w) { [-3.1, 3.1].forEach(function (z) {
                var t = mk(THREE, new THREE.CylinderGeometry(w[1], w[1], 1.6, 16), 0x1b1e21); t.rotation.x = Math.PI / 2; t.position.set(w[0], w[1], z); g.add(t);
                var h = mk(THREE, new THREE.CylinderGeometry(w[1] * 0.45, w[1] * 0.45, 1.75, 10), C3); h.rotation.x = Math.PI / 2; h.position.set(w[0], w[1], z); g.add(h);
            }); });
            var beacon = px(new THREE.SphereGeometry(0.55, 8, 8), 0xffb300, 2.9, 10.35, 0, { transparent: true, opacity: 0.9 });
            g.__body = hull; g.__fill = fill; g.__reel = reel; g.__beacon = beacon;
            return g;
        }
        function truckMesh() {
            var g = new THREE.Group();
            var bed = mk(THREE, new THREE.BoxGeometry(7, 3, 4.2), 0x8a5a32); bed.castShadow = true; g.add(bed).position.set(-1.4, 3.2, 0);
            var cab = mk(THREE, new THREE.BoxGeometry(3, 3.4, 3.8), 0x2f6fb0); cab.castShadow = true; g.add(cab).position.set(3.4, 3.4, 0);
            [-2.2, 0.4, 3.2].forEach(function (x) { [-2, 2].forEach(function (z) { var w = mk(THREE, new THREE.CylinderGeometry(1.3, 1.3, 1.0, 12), 0x111); w.rotation.x = Math.PI / 2; g.add(w).position.set(x, 1.3, z); }); });
            g.visible = false; return g;
        }
        // агродрон: корпус + камера-подвес + 4 ротора + конус опрыскивания + вспышка «фото» + частицы распыла
        function droneMesh() {
            var g = new THREE.Group();
            g.add(mk(THREE, new THREE.BoxGeometry(3, 0.9, 3), 0x2b3138)).position.y = 0;
            g.add(mk(THREE, new THREE.BoxGeometry(0.6, 0.6, 0.6), 0x1a1f24)).position.set(0, -0.7, 0);
            g.add(mk(THREE, new THREE.SphereGeometry(0.5, 10, 8), 0x0a0a0a)).position.set(0, -1.1, 0.15);
            var rotors = [];
            [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]].forEach(function (p) {
                g.add(mk(THREE, new THREE.BoxGeometry(0.3, 0.22, 0.3), 0x3a4149)).position.set(p[0] * 0.6, 0.15, p[1] * 0.6);
                var r = mk(THREE, new THREE.CylinderGeometry(1.5, 1.5, 0.08, 14), 0x9ad4ff, { transparent: true, opacity: 0.42 });
                r.position.set(p[0], 0.45, p[1]); g.add(r); rotors.push(r);
            });
            var cone = mk(THREE, new THREE.ConeGeometry(2.6, 12, 14, 1, true), 0x8fd0ff, { transparent: true, opacity: 0.0, side: THREE.DoubleSide });
            cone.position.y = -6.5; cone.rotation.x = Math.PI; g.add(cone);
            var flash = mk(THREE, new THREE.PlaneGeometry(9, 9), 0xffffff, { transparent: true, opacity: 0.0 });
            flash.rotation.x = -Math.PI / 2; flash.position.y = -1.2; g.add(flash);
            var parts = [];
            for (var i = 0; i < 16; i++) { var pt = mk(THREE, new THREE.SphereGeometry(0.24, 6, 5), 0xbfe6ff, { transparent: true, opacity: 0.0 }); g.add(pt); parts.push(pt); }
            var beacon = mk(THREE, new THREE.SphereGeometry(0.5, 8, 8), 0xff3b30); beacon.position.set(0, 1.0, 0); g.add(beacon);
            g.__rotors = rotors; g.__cone = cone; g.__flash = flash; g.__parts = parts; g.__beacon = beacon;
            return g;
        }
        element.__a3d = st;
        var scene = new THREE.Scene(); st.scene = scene;
        // небо-градиент (мягкий), меняется по погоде в rebuild
        st.skyTex = function (a, b) { var c = document.createElement("canvas"); c.width = 8; c.height = 256; var x = c.getContext("2d"); var gr = x.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, a); gr.addColorStop(1, b); x.fillStyle = gr; x.fillRect(0, 0, 8, 256); return new THREE.CanvasTexture(c); };
        scene.background = st.skyTex("#cfe2f2", "#f3efe6");
        scene.fog = new THREE.Fog(0xe7ede9, 620, 1900);   // лёгкая воздушная перспектива
        var camera = new THREE.PerspectiveCamera(45, 1, 1, 12000);
        var renderer = new THREE.WebGLRenderer({ antialias: true }); st.renderer = renderer;
        renderer.setPixelRatio(window.devicePixelRatio || 1); element.appendChild(renderer.domElement);
        renderer.domElement.style.cssText = "display:block;width:100%;height:100%;cursor:pointer";
        renderer.shadowMap.enabled = false;   // тени — мягкие контактные (надёжно на любой GPU), не shadow-map
        st.amb = new THREE.AmbientLight(0xffffff, 0.42); scene.add(st.amb);
        st.sun = new THREE.DirectionalLight(0xfff0d8, 1.05); st.sun.position.set(150, 240, 90); st.sun.castShadow = true;
        st.sun.shadow.mapSize.width = 2048; st.sun.shadow.mapSize.height = 2048; st.sun.shadow.bias = -0.0006;
        st.sun.shadow.camera.near = 20; st.sun.shadow.camera.far = 900; scene.add(st.sun); scene.add(st.sun.target);
        st.hemi = new THREE.HemisphereLight(0xdfeaf2, 0x6f6a52, 0.34); scene.add(st.hemi);
        var world = new THREE.Group(); scene.add(world); st.world = world;
        // земля (муть) + техническая сетка-съёмка — держим первыми ДВУМЯ детьми (rebuild их не сносит)
        var ground = mk(THREE, new THREE.BoxGeometry(3000, 1, 3000), 0xa9bd8a); ground.position.y = -1; ground.receiveShadow = true; world.add(ground);
        var grid = new THREE.GridHelper(3000, 60, 0x9fb283, 0xa9bd8a); grid.position.y = 0.03; if (grid.material) grid.material.opacity = 0.12, grid.material.transparent = true; world.add(grid);

        var orbit = { target: new THREE.Vector3(0, 6, 0), radius: 340, theta: -0.7, phi: 0.82 };
        st.applyCamera = function () { var r = orbit.radius, p = orbit.phi, t = orbit.theta; camera.position.set(orbit.target.x + r * Math.sin(p) * Math.sin(t), orbit.target.y + r * Math.cos(p), orbit.target.z + r * Math.sin(p) * Math.cos(t)); camera.lookAt(orbit.target); };
        st.resize = function () { var w = element.clientWidth || 800, h = element.clientHeight || 520; if (h < 60) h = 520; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); st.applyCamera(); };
        if (window.ResizeObserver) new ResizeObserver(st.resize).observe(element);

        // слои
        var bar = document.createElement("div");
        bar.style.cssText = "position:absolute;left:50%;top:6px;transform:translateX(-50%);z-index:6;display:flex;gap:2px;flex-wrap:nowrap;justify-content:center;max-width:96%;background:rgba(18,26,36,0.72);padding:2px 4px;border-radius:8px;font-family:'Segoe UI',sans-serif";
        st.tabs = []; LAYERS.forEach(function (lay, i) { var b = document.createElement("div"); b.textContent = tr(lay.label); b.style.cssText = "cursor:pointer;white-space:nowrap;color:#cfd8e3;font-size:10px;padding:3px 7px;border-radius:6px"; b.onclick = function () { st.layer = i; st.applyLayer(); }; bar.appendChild(b); st.tabs.push(b); });
        element.appendChild(bar);
        // панель управления дронами (внизу слева)
        st.droneMode = "auto"; st.dronePaused = false;
        var dbar = document.createElement("div");
        dbar.style.cssText = "position:absolute;left:10px;bottom:58px;z-index:6;display:flex;gap:5px;flex-wrap:wrap;align-items:center;background:rgba(18,26,36,0.86);padding:6px 9px;border-radius:9px;font-family:'Segoe UI',sans-serif";
        dbar.innerHTML = '<span style="color:#9ad4ff;font-size:11px;font-weight:700;margin-right:2px">🚁 ' + tr("Дроны — всем") + '</span>';
        st.dbtns = [];
        [["auto", "Авто"], ["spray", "💧 Опрыск."], ["photo", "📷 Фото крон"], ["pause", "⏸ Пауза"]].forEach(function (b) {
            var el = document.createElement("div"); el.textContent = b[1]; el.style.cssText = "cursor:pointer;color:#cfd8e3;font-size:11px;padding:4px 8px;border-radius:6px";
            el.onclick = function () {
                if (b[0] === "pause") { st.dronePaused = !st.dronePaused; } else { st.droneMode = b[0]; st.dronePaused = false; }
                st.drones.forEach(function (d) { d.mode = null; d.paused = null; d.target = null; });   // команда ВСЕМ — снимает личные задания
                st.updDbtns();
            };
            dbar.appendChild(el); st.dbtns.push({ el: el, key: b[0] });
        });
        st.updDbtns = function () { st.dbtns.forEach(function (x) { var on = (x.key === "pause") ? st.dronePaused : (!st.dronePaused && st.droneMode === x.key); x.el.style.background = on ? "#1f6f8b" : "transparent"; x.el.style.color = on ? "#fff" : "#cfd8e3"; }); };
        element.appendChild(dbar); st.updDbtns();
        // панель уборки (сверху слева): список комбайнов, прогресс, топливо/бункер, пауза/скорость
        st.harvPaused = false; st.harvSpeed = 1;
        var hbar = document.createElement("div"); hbar.style.cssText = "position:absolute;left:10px;top:40px;z-index:6;min-width:214px;max-width:270px;background:rgba(18,26,36,0.86);padding:7px 9px;border-radius:9px;font-family:'Segoe UI',sans-serif;color:#cfd8e3"; element.appendChild(hbar); st.hbar = hbar;
        st.updHarvest = function () {
            if (!st.machines || !st.machines.length) { hbar.style.display = "none"; return; } hbar.style.display = "block";
            var S = { work: ["#3a9e57", "убирает"], unload: ["#3a7bd5", "выгрузка"], idle: ["#e0533a", "простой"], done: ["#7bd88f", "готово"] };
            var rows = st.machines.map(function (mc) {
                var s = S[mc.status] || S.work, pct = Math.round(mc.progress * 100), nm = mc.u.name.length > 17 ? mc.u.name.slice(0, 16) + "…" : mc.u.name;
                var beh = mc.behind >= 8 ? ' <span style="color:#ffb060">⚠−' + Math.round(mc.behind) + '%</span>' : '';
                return '<div style="margin:5px 0"><div style="display:flex;justify-content:space-between;font-size:10px"><span>' + nm + '</span><span style="color:' + s[0] + '">' + tr(s[1]) + beh + '</span></div>'
                    + '<div style="height:6px;background:#26313d;border-radius:4px;overflow:hidden;margin-top:2px"><div style="height:100%;width:' + pct + '%;background:' + s[0] + '"></div></div>'
                    + '<div style="font-size:9px;color:#8a93a0;display:flex;justify-content:space-between"><span style="color:' + (mc.fuel < 0.2 ? "#ff9a90" : "#8a93a0") + '">⛽' + Math.round(mc.fuel * 100) + '%</span><span>🌾' + Math.round(mc.tank * 100) + '%</span><span>' + pct + '%</span></div></div>';
            }).join("");
            var idle = st.machines.filter(function (m) { return m.status === "idle"; }).length;
            hbar.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px"><span style="color:#e7c463;font-weight:800;font-size:11px">🚜 ' + tr("Уборка") + '</span>'
                + '<span><span id="__hp" style="cursor:pointer;padding:2px 6px;border-radius:5px;background:' + (st.harvPaused ? "#1f6f8b" : "transparent") + '">⏸</span> <span id="__hs" style="cursor:pointer;padding:2px 6px;border-radius:5px;background:' + (st.harvSpeed > 1 ? "#1f6f8b" : "transparent") + '">⏩</span></span></div>'
                + rows
                + (idle ? '<div style="font-size:9px;color:#ffb060;margin-top:3px;border-top:1px solid rgba(255,255,255,.12);padding-top:3px">⛔ ' + tr("простой") + ' ' + idle + ' → ' + (st.machines.some(function (m) { return m.status === "idle" && m.idleMin > 30; }) ? tr("нарушение зафиксировано") : tr("остановка в норме")) + '</div>' : '');
            var pb = hbar.querySelector("#__hp"); if (pb) pb.onclick = function () { st.harvPaused = !st.harvPaused; st.updHarvest(); };
            var sb = hbar.querySelector("#__hs"); if (sb) sb.onclick = function () { st.harvSpeed = st.harvSpeed > 1 ? 1 : 2.4; st.updHarvest(); };
        };
        // погода (справа сверху)
        var wx = document.createElement("div"); wx.style.cssText = "position:absolute;right:8px;bottom:58px;z-index:6;font-family:'Segoe UI',sans-serif;font-size:10px;line-height:1.25;color:#22303f;background:rgba(255,255,255,.82);padding:4px 7px;border-radius:7px;min-width:96px;box-shadow:0 1px 4px rgba(0,0,0,.12)"; element.appendChild(wx); st.wx = wx;
        // видимые кнопки зума — приблизить / отдалить / вписать всё (и колесо мыши тоже работает)
        var zoomc = document.createElement("div"); zoomc.style.cssText = "position:absolute;left:8px;bottom:58px;z-index:7;display:flex;flex-direction:column;gap:4px";
        [["+", "приблизить", function () { orbit.radius = Math.max(90, orbit.radius * 0.82); st.applyCamera(); }],
         ["−", "отдалить", function () { orbit.radius = Math.min(2600, orbit.radius * 1.22); st.applyCamera(); }],
         ["⤢", "вписать всё", function () { orbit.radius = st.fitRadius || orbit.radius; orbit.theta = -0.7; orbit.phi = 0.82; st.applyCamera(); }]].forEach(function (z) {
            var b = document.createElement("div"); b.textContent = z[0]; b.title = z[1];
            b.style.cssText = "width:30px;height:30px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:rgba(18,26,36,0.82);color:#fff;font-size:17px;font-weight:700;border-radius:7px;user-select:none;box-shadow:0 1px 4px rgba(0,0,0,.2)";
            b.onclick = z[2]; zoomc.appendChild(b);
        });
        element.appendChild(zoomc);
        // сводка снизу
        var foot = document.createElement("div"); foot.style.cssText = "position:absolute;left:0;right:0;bottom:0;z-index:6;display:flex;justify-content:center;flex-wrap:wrap;background:rgba(18,26,36,0.9);padding:8px 6px;font-family:'Segoe UI',sans-serif"; element.appendChild(foot); st.foot = foot;
        // карточка объекта (клик) — с действиями
        var tip = document.createElement("div"); tip.style.cssText = "position:absolute;z-index:8;display:none;min-width:250px;max-width:320px;background:rgba(15,23,34,0.97);color:#e6edf5;font-family:'Segoe UI',sans-serif;font-size:12px;padding:12px 14px;border-radius:11px;box-shadow:0 8px 26px rgba(0,0,0,.45)"; element.appendChild(tip); st.tip = tip;
        // подпись при НАВЕДЕНИИ (постоянных подписей нет)
        var hov = document.createElement("div"); hov.style.cssText = "position:absolute;z-index:9;display:none;pointer-events:none;background:rgba(15,23,34,0.92);color:#fff;font:600 12px 'Segoe UI',sans-serif;padding:3px 8px;border-radius:6px;white-space:nowrap"; element.appendChild(hov); st.hov = hov;
        function fmt(v, d) { var n = +v; return isNaN(n) ? "—" : n.toFixed(d == null ? 0 : d); }
        // мини-лист «по фото»: цвет по качеству, пятна по болезни
        function leafSVG(u) {
            var q = +u.leafQ || 90, base = q >= 80 ? "#3fae3a" : q >= 60 ? "#8bbe2e" : q >= 45 ? "#c9b53a" : "#b98a2e";
            var spots = u.disease ? '<circle cx="70" cy="55" r="7" fill="#6b4a1e" opacity=".7"/><circle cx="45" cy="75" r="5" fill="#7a3b1e" opacity=".7"/><circle cx="85" cy="90" r="6" fill="#6b4a1e" opacity=".6"/>' : '';
            return '<svg width="118" height="86" viewBox="0 0 130 120" style="display:block;margin:2px auto 0"><path d="M65 8 C30 30 22 78 65 116 C108 78 100 30 65 8 Z" fill="' + base + '"/><path d="M65 10 L65 112" stroke="#2c5a22" stroke-width="2.5"/><path d="M65 40 L40 30 M65 60 L36 55 M65 80 L42 82 M65 40 L90 30 M65 60 L94 55 M65 80 L88 82" stroke="#2c5a22" stroke-width="1.5" fill="none"/>' + spots + '</svg>';
        }
        st.showTip = function (u, sx, sy) {
            var rows = [
                [tr("Культура"), u.crop || "—"], [tr("Фаза"), (u.stage || "—") + " · " + tr("покров") + " " + fmt(u.cover, 0) + "%"],
                [tr("Воздух t°/влажн."), fmt(u.airT, 1) + "° / " + fmt(u.airH, 0) + "%"],
                [tr("Почва влажн./t°"), fmt(u.soilM, 0) + "% / " + fmt(u.soilT, 1) + "°"],
                [tr("Прогноз t°/осадки"), (u.nowT === "" ? "—" : fmt(u.nowT, 0) + "° / " + fmt(u.precip, 0) + "%")]
            ];
            var html = '<div style="font-weight:800;font-size:13px;margin-bottom:5px;color:#8fd0ff">' + (u.name || "?") + '</div>';
            // «увеличенный лист по фото» + качество/покров
            html += '<div style="display:flex;gap:10px;align-items:center;margin-bottom:6px"><div style="background:#0c141d;border-radius:8px;padding:2px 4px">' + leafSVG(u) + '</div>'
                + '<div style="font-size:11px;line-height:1.5"><div style="color:#93a1b3">' + tr("Качество листа") + '</div><div style="font-size:20px;font-weight:800;color:' + (u.leafQ >= 70 ? "#7bd88f" : u.leafQ >= 45 ? "#e0c24a" : "#ff9a90") + '">' + fmt(u.leafQ, 0) + '%</div>'
                + (u.disease ? '<div style="color:#ff9a90;font-weight:700;margin-top:2px">🦠 ' + u.disease + '</div>' : '<div style="color:#7bd88f;margin-top:2px">' + tr("здоров") + '</div>') + '</div></div>';
            rows.forEach(function (r) { html += '<div style="display:flex;justify-content:space-between;gap:14px;padding:1px 0"><span style="color:#93a1b3">' + r[0] + '</span><b>' + r[1] + '</b></div>'; });
            html += '<div style="margin-top:7px;padding-top:6px;border-top:1px solid rgba(255,255,255,.12);color:#cfe3c8;font-weight:600">' + (u.reco || "") + '</div>';
            // действия по типу объекта
            var acts = [["water", tr("Полить"), "#2b6cb0"]];
            if (u.type === "greenhouse") { acts.push(["vent", tr("Проветрить"), "#3a7bd5"], ["light", tr("Свет"), "#b07400"]); }
            else { acts.push(["treat", tr("Обработать"), "#1f9d6b"]); if (u.gcode >= 3) acts.push(["harvest", tr("Убрать"), "#8a5a00"]); }
            acts.push(["fertilize", tr("Удобрить"), "#7a5aa0"]);
            html += '<div style="margin-top:9px;display:flex;gap:6px;flex-wrap:wrap">' + acts.map(function (a) { return '<button data-act="' + a[0] + '" style="flex:1 1 44%;cursor:pointer;border:0;border-radius:7px;padding:6px;font-weight:700;color:#fff;background:' + a[2] + '">' + a[1] + '</button>'; }).join("") + '</div>';
            // адресное задание конкретной машине на ЭТУ делянку
            html += '<div style="margin-top:6px"><button data-send="drone" style="width:100%;cursor:pointer;border:0;border-radius:7px;padding:6px;font-weight:700;color:#0f1722;background:#8fd0ff">🚁 ' + tr("Отправить дрона сюда") + '</button></div>';
            tip.innerHTML = html; tip.style.display = "block";
            var w = element.clientWidth || 800; tip.style.left = Math.min(sx + 14, w - 270) + "px"; tip.style.top = Math.max(56, sy - 20) + "px";
            tip.querySelectorAll("button").forEach(function (b) {
                b.onclick = function () {
                    if (b.getAttribute("data-send") === "drone") { st.assignDrone(u); tip.style.display = "none"; return; }
                    if (st.controller) st.controller.change({ action: b.getAttribute("data-act"), objName: u.name });
                    tip.style.display = "none";
                };
            });
        };
        // назначить свободного дрона на конкретную делянку (личное задание)
        st.assignDrone = function (u) {
            var idx = st.units.indexOf(u); if (idx < 0 || !st.drones.length) return;
            var d = st.drones.filter(function (x) { return x.target == null; })[0] || st.drones[0];
            d.target = idx; d.paused = false; d.hov = 0;
            d.mode = (u.type === "orchard") ? "photo" : "spray";       // саду — фото крон, полю — опрыскивание
            st.updDbtns();
        };
        // карточка ДРОНА (клик): личный режим/цель/заряд + кнопки задания именно ему
        st.showDrone = function (d, sx, sy) {
            var dmode = d.mode || st.droneMode, dpaused = (d.paused != null) ? d.paused : st.dronePaused;
            var du = (d.target != null) ? st.units[d.target] : st.units[d.wp % st.units.length];
            var M = { auto: ["#7bd88f", "Авто-облёт"], spray: ["#8fd0ff", "Опрыскивание"], photo: ["#e7c463", "Фотосъёмка крон"] };
            var m = M[dmode] || M.auto, own = (d.mode || d.target != null);
            var rows = [
                [tr("Режим"), '<b style="color:' + m[0] + '">' + tr(dpaused ? "Пауза" : m[1]) + '</b>'],
                [tr("Задание"), own ? '<b style="color:#8fd0ff">' + tr("личное") + '</b>' : tr("от панели (всем)")],
                [tr("Цель"), du ? du.name : "—"],
                [tr("Заряд"), '<b style="color:' + (d.batt < 0.25 ? "#ff9a90" : "#7bd88f") + '">' + Math.round(d.batt * 100) + '%</b>']
            ];
            var html = '<div style="font-weight:800;font-size:13px;margin-bottom:7px;color:#9ad4ff">🚁 ' + tr("Дрон") + ' ' + d.no + '</div>';
            rows.forEach(function (r) { html += '<div style="display:flex;justify-content:space-between;gap:14px;padding:1px 0"><span style="color:#93a1b3">' + r[0] + '</span><span>' + r[1] + '</span></div>'; });
            html += '<div style="margin-top:8px;color:#93a1b3;font-size:11px">' + tr("Задать задачу этому дрону:") + '</div>';
            var db = [["spray", "💧 " + tr("Опрыскивать"), "#2b6cb0"], ["photo", "📷 " + tr("Фото крон"), "#8a5a00"], ["auto", "🔄 " + tr("Авто"), "#1f9d6b"], ["pause", dpaused ? "▶ " + tr("Продолжить") : "⏸ " + tr("Пауза"), "#7a5aa0"]];
            html += '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">' + db.map(function (a) { return '<button data-dr="' + a[0] + '" style="flex:1 1 44%;cursor:pointer;border:0;border-radius:7px;padding:6px;font-weight:700;color:#fff;background:' + a[2] + '">' + a[1] + '</button>'; }).join("") + '</div>';
            tip.innerHTML = html; tip.style.display = "block";
            var w = element.clientWidth || 800; tip.style.left = Math.min(sx + 14, w - 270) + "px"; tip.style.top = Math.max(56, sy - 20) + "px";
            tip.querySelectorAll("button").forEach(function (b) {
                b.onclick = function () {
                    var a = b.getAttribute("data-dr");
                    if (a === "pause") d.paused = !dpaused; else { d.mode = a; d.paused = false; if (a === "auto") { d.mode = null; d.target = null; } }
                    st.showDrone(d, sx, sy);
                };
            });
        };
        // карточка КОМБАЙНА (клик): поле, % убрано, бункер, топливо, темп, ETA, простой/отставание, наряд ERP
        st.showCombine = function (mc, sx, sy) {
            var u = mc.u, pct = Math.round(mc.progress * 100), fuel = Math.round(mc.fuel * 100), tank = Math.round(mc.tank * 100);
            var S = { work: ["#7bd88f", "Убирает"], unload: ["#8fd0ff", "Выгрузка в грузовик"], idle: ["#ff9a90", "Простой — двигатель работает, движения нет"], done: ["#7bd88f", "Уборка завершена"] }, s = S[mc.status] || S.work;
            var lostT = mc.tph * (mc.idleMin / 60), lostRub = Math.round(lostT * 11500), viol = mc.idleMin > 30;
            var harvT = mc.tTotal * mc.progress, eta = mc.tph > 0 ? (mc.tTotal - harvT) / mc.tph : 0;
            var rows = [
                [tr("Культура"), u.crop || "—"],
                [tr("Статус"), '<b style="color:' + s[0] + '">' + tr(s[1]) + '</b>'],
                [tr("Убрано"), pct + '% · ' + harvT.toFixed(0) + ' / ' + mc.tTotal.toFixed(0) + ' ' + tr("т")],
                [tr("Бункер зерна"), tank + '%'],
                [tr("Топливо"), '<b style="color:' + (fuel < 20 ? "#ff9a90" : fuel < 40 ? "#e0c24a" : "#7bd88f") + '">' + fuel + '%</b>'],
                [tr("Темп"), mc.tph + ' ' + tr("т/ч")],
                [tr("До конца"), mc.status === "done" ? "—" : ('~' + eta.toFixed(1) + ' ' + tr("ч"))]
            ];
            if (mc.idleMin > 0.5) rows.push([tr("Простой сейчас"), '<b style="color:' + (viol ? "#ff9a90" : "#e0c24a") + '">' + mc.idleMin.toFixed(0) + ' ' + tr("мин") + '</b>']);
            if (mc.idleCount) rows.push([tr("Простоев за смену"), '<b>' + mc.idleCount + '</b>' + (mc.idleTotal > 1 ? ' · ' + Math.round(mc.idleTotal) + ' ' + tr("мин") : '')]);
            if (lostRub > 0) rows.push([tr("Недобор урожая"), '<b style="color:#ffb060">−' + lostRub.toLocaleString("ru-RU") + ' ₽</b> · ' + lostT.toFixed(1) + ' ' + tr("т")]);
            if (mc.behind >= 5) rows.push([tr("Отставание от плана"), '<b style="color:#ffb060">−' + Math.round(mc.behind) + '%</b>']);
            var html = '<div style="font-weight:800;font-size:13px;margin-bottom:6px;color:#e7c463">🚜 ' + tr("Комбайн") + ' · ' + (u.name || "?") + '</div>';
            html += '<div style="height:9px;background:#26313d;border-radius:5px;overflow:hidden;margin-bottom:8px"><div style="height:100%;width:' + pct + '%;background:' + s[0] + '"></div></div>';
            rows.forEach(function (r) { html += '<div style="display:flex;justify-content:space-between;gap:14px;padding:1px 0"><span style="color:#93a1b3">' + r[0] + '</span><span>' + r[1] + '</span></div>'; });
            if (mc.status === "idle") html += viol
                ? '<div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,.12);color:#ff9a90;font-weight:600">⛔ ' + tr("Простой больше 30 минут — нарушение зафиксировано, агроном уведомлён") + '</div>'
                : '<div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,.12);color:#e0c24a;font-weight:600">⏸ ' + tr("Короткая остановка — норма (до 30 минут)") + '</div>';
            html += '<div style="margin-top:8px;color:#93a1b3;font-size:11px">' + tr("Задать задачу этому комбайну:") + '</div>';
            var cb = [["resume", "▶ " + tr("Возобновить работу"), "#1f9d6b"], ["pause", mc.paused ? "▶ " + tr("Продолжить") : "⏸ " + tr("Пауза"), "#7a5aa0"], ["unload", "🚚 " + tr("Вызвать грузовик"), "#2b6cb0"]];
            html += '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">' + cb.map(function (a) { return '<button data-cm="' + a[0] + '" style="flex:1 1 44%;cursor:pointer;border:0;border-radius:7px;padding:6px;font-weight:700;color:#fff;background:' + a[2] + '">' + a[1] + '</button>'; }).join("") + '</div>';
            tip.innerHTML = html; tip.style.display = "block";
            var w = element.clientWidth || 800; tip.style.left = Math.min(sx + 14, w - 270) + "px"; tip.style.top = Math.max(56, sy - 20) + "px";
            tip.querySelectorAll("button").forEach(function (b) {
                b.onclick = function () {
                    var a = b.getAttribute("data-cm");
                    if (a === "resume") { mc.hold = false; if (mc.status === "idle") { mc.idleTotal += mc.idleMin; mc.idleMin = 0; mc.status = "work"; } }
                    else if (a === "pause") { mc.paused = !mc.paused; }
                    else if (a === "unload" && mc.status === "work") { mc.tank = 0.999; }
                    st.showCombine(mc, sx, sy); if (st.updHarvest) st.updHarvest();
                };
            });
        };

        st.applyLayer = function () {
            var lay = LAYERS[st.layer], sc = new THREE.Color(), spr = lay.spread || 0.22;
            st.tabs.forEach(function (b, i) { b.style.background = i === st.layer ? "#1f6f8b" : "transparent"; b.style.color = i === st.layer ? "#fff" : "#cfd8e3"; });
            var mx = 0; st.units.forEach(function (u) { if ((u.airT || 0) > mx) mx = u.airT || 0; });
            st.meshes.forEach(function (p) {
                var u = p.u, base = lay.t ? lay.t(u, mx) : 0;
                // тепловая карта поверхности делянки: пер-вершинный цвет = ramp(base + пятно) → неоднородная карта
                if (p.heat && p.heat.geometry && p.heat.geometry.attributes.color) {
                    var col = p.heat.geometry.attributes.color, hn = p.heat.userData.hn;
                    for (var i = 0; i < col.count; i++) {
                        if (lay.kind === "status") { sc.setHex(lay.color(u)).multiplyScalar(1 + hn[i] * 0.42); }
                        else { sc.setHex(ramp(Math.max(0, Math.min(1, base + hn[i] * spr)))); }
                        col.setXYZ(i, sc.r, sc.g, sc.b);
                    }
                    col.needsUpdate = true; p.heat.visible = true;
                }
                // «тела» культуры (ряды/кусты/кроны) — тоже с лёгкой вариацией по ячейке, плавный переход
                p.bodies.forEach(function (b, bi) {
                    var nz = p.bodyNoise ? p.bodyNoise[bi] : 0;
                    var col2 = lay.kind === "status" ? new THREE.Color(lay.color(u)).multiplyScalar(1 + nz * 0.22) : new THREE.Color(ramp(Math.max(0, Math.min(1, base + nz * spr))));
                    b.userData.targetColor = col2;
                });
            });
        };

        st.rebuild = function (data) {
            while (world.children.length > 2) world.remove(world.children[world.children.length - 1]);
            st.units = []; st.meshes = []; st.raycast = []; st.badges = []; st.machines = []; st.drones = []; st.mraycast = []; st.draycast = [];
            var recs = (data || "").split("~");
            var h = (recs[0] || "").split("^");   // A^objs^area^gNowT^gMinT^gPrecip
            var gNowT = (h[3] !== "" && h[3] != null) ? +h[3] : null, gMinT = (h[4] !== "" && h[4] != null) ? +h[4] : null, gPrecip = (h[5] !== "" && h[5] != null) ? +h[5] : null, gRain = gPrecip != null && gPrecip >= 60, hasFc = gNowT != null;

            for (var i = 1; i < recs.length; i++) {
                var f = recs[i].split("^"); if (f[0] !== "U") continue;
                // запись: U^name^type^crop^site^airT^airH^soilM^soilT^leafW^soilMin^frostThr^px^pz (прогноз — глобальный из шапки)
                var airT = +f[5], airH = +f[6], soilM = +f[7], soilT = +f[8], leafW = +f[9], soilMin = +f[10], frostThr = +f[11];
                // СИНТЕЗ на клиенте: ИИ по фото / статус / рекомендация
                var disease = synthDisease(f[3], leafW, airH);
                var leafQ = disease ? (leafW >= 60 ? 55 : 70) : 92;
                var frost = hasFc && gMinT != null && gMinT <= frostThr, dry = soilM < soilMin, water = dry && !gRain && !frost;
                var status = frost ? "frost" : (disease ? "disease" : (water ? "water" : (gRain ? "rain" : "ok")));
                var reco = !hasFc ? tr("Обновите погоду") : frost ? tr("Заморозок — укрыть / обогрев") : disease ? ("ИИ: " + disease + " — " + tr("обработка фунгицидом")) : (gRain && dry) ? tr("Ожидается дождь — полив отложить") : water ? tr("Сухо — полить") : gRain ? tr("Ожидается дождь") : tr("В норме");
                var gcode = +f[14] || 0, stage = ["Всходы", "Вегетация", "Созревание", "Уборка"][gcode] || "Всходы";
                st.units.push({ name: f[1], type: f[2], crop: f[3], site: f[4], airT: airT, airH: airH, soilM: soilM, soilT: soilT, leafW: leafW, leafQ: leafQ, disease: disease, nowT: hasFc ? gNowT : "", precip: hasFc ? gPrecip : 0, status: status, reco: reco, px: +f[12] || 0, pz: +f[13] || 0, gcode: gcode, stage: stage, cover: +f[15] || 0, area: +f[16] || 1 });
            }
            // РАСКЛАДКА: одно хозяйство из делянок РАЗНОГО размера (по площади, га), ПОЛОЧНАЯ упаковка —
            // ряды набиваются делянками слева-направо до целевой ширины, перенос; тайлит разные размеры ПЛОТНО (без дыр).
            var N = st.units.length, GAP = 8;
            st.units.forEach(function (u) { var a = Math.max(0.5, +u.area || 1); u.sc = 0.72 + 1.5 * Math.sqrt(Math.min(a, 140) / 140); u.fw = (u.type === "greenhouse" ? 41 : 47) * u.sc; u.fd = (u.type === "greenhouse" ? 29 : (u.type === "beds" ? 39 : 37)) * u.sc; });
            var sumW = 0; st.units.forEach(function (u) { sumW += u.fw + GAP; });
            var rowsWanted = Math.max(1, Math.round(Math.sqrt(N * 0.72))), targetW = sumW / rowsWanted;
            var rows = [], cur = { items: [], w: 0, h: 0 };
            st.units.forEach(function (u) {
                if (cur.items.length && cur.w + u.fw > targetW) { rows.push(cur); cur = { items: [], w: 0, h: 0 }; }
                cur.items.push(u); cur.w += u.fw + GAP; if (u.fd > cur.h) cur.h = u.fd;
            });
            if (cur.items.length) rows.push(cur);
            var totalD = -GAP; rows.forEach(function (r) { totalD += r.h + GAP; });
            var totalW = 0; rows.forEach(function (r) { if (r.w - GAP > totalW) totalW = r.w - GAP; });
            var waterN = 0, diseaseN = 0, zc = -totalD / 2;
            rows.forEach(function (r) {
                var gz = zc + r.h / 2, xc = -(r.w - GAP) / 2;
                r.items.forEach(function (u) {
                    var gx = xc + u.fw / 2; xc += u.fw + GAP;
                    u.px = gx; u.pz = gz;
                    var s = shapeLib(THREE, u.type, u.name);
                    s.group.scale.setScalar(u.sc); s.group.position.set(gx, 0, gz); world.add(s.group);
                    s.group.traverse(function (o) { if (o.isMesh && o !== s.heat) { o.userData.u = u; st.raycast.push(o); } });
                    st.meshes.push({ u: u, bodies: s.bodies, heat: s.heat, bodyNoise: s.bodyNoise });
                    if (u.disease) { var bd = badge(THREE, "🦠"); bd.position.set(gx + 12 * u.sc, 18 + 9 * u.sc, gz - 12 * u.sc); world.add(bd); st.badges.push(bd); diseaseN++; }
                    if (u.status === "water") { var wd = badge(THREE, "💧"); wd.position.set(gx - 12 * u.sc, 18 + 9 * u.sc, gz - 12 * u.sc); world.add(wd); waterN++; }
                    if (u.gcode >= 2 && u.type !== "greenhouse" && u.type !== "orchard") { st.machines.push(mkCombine(u, gx, gz)); }
                });
                zc += r.h + GAP;
            });
            // единый контур земли усадьбы (одно хозяйство)
            if (N) {
                world.add(mk(THREE, new THREE.BoxGeometry(totalW + 30, 0.4, totalD + 30), 0x5d6e42)).position.set(0, 0.08, 0);   // тёмная травяная кромка
                var pad0 = mk(THREE, new THREE.BoxGeometry(totalW + 18, 0.5, totalD + 18), 0x778b52); pad0.position.set(0, 0.16, 0); pad0.receiveShadow = true; world.add(pad0);  // трава-межа между делянками
            }
            st.span = Math.max(totalW, totalD * 1.3);
            // агродроны: 1–2 шт облетают делянки, опрыскивают поля/грядки/теплицы, фотографируют кроны садов
            if (st.units.length) {
                var nDr = st.units.length > 8 ? 2 : 1;
                for (var di = 0; di < nDr; di++) {
                    var dm = droneMesh(); dm.scale.setScalar(2.6); dm.position.set(0, 22 + di * 5, 0); world.add(dm);
                    var dl = label(THREE, "🚁 Дрон " + (di + 1), "#c0392b"); dl.position.set(0, 6, 0); dl.scale.set(20, 5, 1); dm.add(dl);
                    var dst = { grp: dm, wp: di * 3, phase: "fly", hov: 0, t: 0, no: di + 1, mode: null, paused: null, target: null, batt: 0.62 + h32name("drone" + di) * 0.35 };
                    st.drones.push(dst);
                    dm.traverse(function (o) { if (o.isMesh) { o.userData.d = dst; st.draycast.push(o); } });
                }
            }
            var kpis = [[tr("Объектов"), h[1] || "0", "#8fd0ff"], [tr("Площадь"), (h[2] || "0") + " " + tr("га"), "#cfe3f5"], [tr("Нужен полив"), "" + waterN, (waterN > 0 ? "#d9a441" : "#3a9e57")], [tr("Болезни"), "" + diseaseN, (diseaseN > 0 ? "#ff8a80" : "#3a9e57")], [tr("В уборке"), '<span id="__fh">' + st.machines.length + '</span>', "#e7c463"], [tr("Прогноз"), (hasFc ? gNowT + "°C" : "—"), "#7bd88f"]];
            st.foot.innerHTML = kpis.map(function (k) { return '<div style="text-align:center;padding:0 15px;border-right:1px solid rgba(255,255,255,.12)"><div style="font-size:10px;color:#8a93a0">' + k[0] + '</div><div style="font-size:18px;font-weight:800;color:' + k[2] + '">' + k[1] + '</div></div>'; }).join("");
            // небо/солнце по глобальному прогнозу
            var frosty = gMinT != null && gMinT <= 0;
            scene.background = st.skyTex(frosty ? "#ccd6de" : gRain ? "#b6bfc4" : "#cfe2f2", frosty ? "#eaeef0" : gRain ? "#d8dbd8" : "#f3efe6");
            if (scene.fog) scene.fog.color.setHex(frosty ? 0xe6eaec : gRain ? 0xdcdfdc : 0xe7ede9);
            st.sun.intensity = gRain ? 0.62 : 1.05; st.amb.intensity = gRain ? 0.7 : 0.42;
            st.sun.target.position.set(0, 0, 0);
            var ext = Math.max(120, (st.span || 240) * 0.7); st.sun.shadow.camera.left = -ext; st.sun.shadow.camera.right = ext; st.sun.shadow.camera.top = ext; st.sun.shadow.camera.bottom = -ext; st.sun.shadow.camera.updateProjectionMatrix();
            st.wx.innerHTML = '<div style="font-weight:800;margin-bottom:3px">' + (!hasFc ? "❔ " + tr("нет прогноза") : gRain ? "🌧 " + tr("дождливо") : frosty ? "❄ " + tr("похолодание") : "☀ " + tr("ясно")) + '</div>' + (hasFc ? '<div style="color:#5a6675">' + tr("Прогноз") + ': ' + gNowT + '°C, ' + tr("осадки") + ' ' + (gPrecip || 0) + '%</div>' : '<div style="color:#5a6675;font-size:11px">' + tr("нажмите «Обновить погоду»") + '</div>');
            if (st.units.length) { orbit.target.set(0, 3, 0); st.fitRadius = Math.max(200, (st.span || 240) * 1.18 + 40); orbit.radius = st.fitRadius; }
            st.applyLayer(); st.applyCamera(); st.resize(); if (st.updHarvest) st.updHarvest();
        };

        var dr = null;
        renderer.domElement.addEventListener("mousedown", function (e) { dr = { x: e.clientX, y: e.clientY, t: orbit.theta, p: orbit.phi, moved: false }; });
        window.addEventListener("mousemove", function (e) { if (!dr) return; var dx = e.clientX - dr.x, dy = e.clientY - dr.y; if (Math.abs(dx) + Math.abs(dy) > 3) dr.moved = true; orbit.theta = dr.t - dx * 0.006; orbit.phi = Math.max(0.25, Math.min(1.45, dr.p - dy * 0.006)); st.applyCamera(); });
        window.addEventListener("mouseup", function () { dr = null; });
        renderer.domElement.addEventListener("wheel", function (e) { e.preventDefault(); orbit.radius = Math.max(90, Math.min(2600, orbit.radius * (e.deltaY > 0 ? 1.1 : 0.9))); st.applyCamera(); }, { passive: false });
        renderer.domElement.addEventListener("click", function (e) {
            if (dr && dr.moved) return;
            var rect = renderer.domElement.getBoundingClientRect();
            var mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
            var ray = new THREE.Raycaster(); ray.setFromCamera(mouse, camera);
            var hd = ray.intersectObjects(st.draycast, false)[0], hm = ray.intersectObjects(st.mraycast, false)[0], hu = ray.intersectObjects(st.raycast, false)[0];
            var best = [hd, hm, hu].filter(Boolean).sort(function (a, b) { return a.distance - b.distance; })[0];
            if (!best) { st.tip.style.display = "none"; return; }
            var X = e.clientX - rect.left, Y = e.clientY - rect.top;
            if (best.object.userData.d) st.showDrone(best.object.userData.d, X, Y);
            else if (best.object.userData.mc) st.showCombine(best.object.userData.mc, X, Y);
            else if (best.object.userData.u) st.showTip(best.object.userData.u, X, Y);
        });
        renderer.domElement.addEventListener("mousemove", function (e) {
            if (dr) { st.hov.style.display = "none"; return; }
            var rect = renderer.domElement.getBoundingClientRect();
            var mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
            var ray = new THREE.Raycaster(); ray.setFromCamera(mouse, camera);
            var hd = ray.intersectObjects(st.draycast, false)[0], hm = ray.intersectObjects(st.mraycast, false)[0], hu = ray.intersectObjects(st.raycast, false)[0];
            var bb = [hd, hm, hu].filter(Boolean).sort(function (a, b) { return a.distance - b.distance; })[0];
            var lbl = !bb ? null : bb.object.userData.d ? ("🚁 " + tr("Дрон") + " " + bb.object.userData.d.no) : bb.object.userData.mc ? ("🚜 " + bb.object.userData.mc.u.name) : bb.object.userData.u ? bb.object.userData.u.name : null;
            if (lbl) { st.hov.textContent = lbl; st.hov.style.display = "block"; st.hov.style.left = (e.clientX - rect.left + 12) + "px"; st.hov.style.top = (e.clientY - rect.top - 8) + "px"; renderer.domElement.style.cursor = "pointer"; }
            else { st.hov.style.display = "none"; renderer.domElement.style.cursor = "default"; }
        });

        var tk = 0, lastT = (window.performance && performance.now) ? performance.now() : 0;
        // ——— комбайны: полосовая уборка со стернёй-следом; топливо → простой → отставание от плана; бункер → выгрузка в грузовик; пыль ———
        function mkCombine(u, gx, gz) {
            var hh = h32name(u.name + "cmb");
            var cb = combine(u.gcode >= 3 ? 0xd98a2b : 0xcdbb2f); cb.scale.multiplyScalar(u.sc); world.add(cb);
            var tr2 = truckMesh(); tr2.scale.multiplyScalar(u.sc); world.add(tr2);
            var stub = new THREE.Group(); world.add(stub);
            var trouble = hh > 0.66;
            var mc = { grp: cb, truck: tr2, stub: stub, cx: gx, cz: gz, sc: u.sc, u: u, W: 34 * u.sc, D: 22 * u.sc, ROWS: 7,
                lane: 0, laneFrac: 0, progress: (u.gcode >= 3 ? 0.10 : 0.02) + hh * 0.12,
                tank: hh * 0.3, tph: 20 + Math.round(hh * 22),
                fuel: 0.55 + hh * 0.4, tTotal: Math.max(8, (u.area || 5) * 5.2), status: "work",
                idleMin: 0, idleTotal: 0, idleCount: (h32name(u.name + "ic") > 0.55 ? 1 : 0), workT: 0, didIdle: false,
                behind: 0, trouble: trouble, dust: [], badge: null, badgeGlyph: "", laid: {} };
            for (var pd = 0; pd < 8; pd++) { var pt = mk(THREE, new THREE.SphereGeometry(0.5, 5, 4), 0xbfae86, { transparent: true, opacity: 0 }); world.add(pt); mc.dust.push(pt); }
            cb.traverse(function (o) { if (o.isMesh) { o.userData.mc = mc; st.mraycast.push(o); } });
            return mc;
        }
        function laneGeom(mc) { var half = mc.ROWS - 1, row = mc.lane, dir = (row % 2 === 0) ? 1 : -1; return { x: dir * (mc.laneFrac - 0.5) * mc.W, z: (-0.5 + row / half) * mc.D, dir: dir }; }
        function layStubble(mc, row) { if (mc.laid[row]) return; mc.laid[row] = 1; var half = mc.ROWS - 1, z = (-0.5 + row / half) * mc.D; var s = mk(THREE, new THREE.BoxGeometry(mc.W + 2, 0.3, mc.D / mc.ROWS * 0.92), mc.u.gcode >= 3 ? 0xbfa869 : 0xa8a15a); s.position.set(mc.cx, 1.72, mc.cz + z); mc.stub.add(s); }
        function updMachineBadge(mc) {
            var need = (mc.status === "idle") ? "⛔" : (mc.behind >= 8 ? "⚠" : "");
            if (need !== mc.badgeGlyph) { if (mc.badge) { world.remove(mc.badge); mc.badge = null; } if (need) { mc.badge = badge(THREE, need); world.add(mc.badge); } mc.badgeGlyph = need; }
            if (mc.badge) { mc.badge.position.set(mc.grp.position.x, 22 + 9 * mc.sc, mc.grp.position.z); var s = 8 + Math.sin(tk * 2) * 1.3; mc.badge.scale.set(s, s, 1); }
        }
        function stepMachine(mc, dt) {
            var moving = false, spd = (st.harvSpeed || 1) * ((st.harvPaused || mc.paused) ? 0 : 1), s = dt * spd;
            // ПРОСТОЙ = человеческий фактор: двигатель работает, движения нет (не топливо)
            if (mc.trouble && !mc.didIdle && mc.workT > 8 && mc.status === "work" && mc.progress < 0.98) { mc.status = "idle"; mc.didIdle = true; mc.idleCount++; }
            if (mc.status === "idle") { if (!mc.hold) { mc.idleMin += 1.2 * dt; mc.behind = Math.min(70, mc.behind + 2 * dt); if (mc.idleMin > 48) { mc.idleTotal += mc.idleMin; mc.idleMin = 0; mc.status = "work"; } } }
            else if (mc.status === "unload") { var t = mc.truck; t.visible = true; t.rotation.y = Math.PI; var ux = mc.cx + mc.W * 0.5 + 9 * mc.sc; t.position.x += (ux - t.position.x) * 0.06; t.position.z += (mc.cz - t.position.z) * 0.06; if (Math.abs(t.position.x - ux) < 2.2) { mc.tank = Math.max(0, mc.tank - 0.6 * dt * (spd || 1)); if (mc.tank <= 0.02) { mc.fuel = Math.min(1, mc.fuel + 0.5); mc.status = "work"; } } }
            else if (mc.status === "work") {
                moving = spd > 0; if (mc.grp.__reel) mc.grp.__reel.rotation.z += 6 * s;
                mc.workT += s;
                mc.laneFrac += 0.5 * s; mc.fuel = Math.max(0, mc.fuel - 0.007 * s);
                if (mc.laneFrac >= 1) { layStubble(mc, mc.lane); mc.laneFrac = 0; mc.lane = (mc.lane + 1) % mc.ROWS; if (mc.lane === 0) { mc.laid = {}; while (mc.stub.children.length) mc.stub.remove(mc.stub.children[0]); } }
                mc.progress = Math.min(1, mc.progress + 0.010 * s); mc.tank = Math.min(1, mc.tank + 0.028 * s);
                if (mc.tank >= 0.999) mc.status = "unload"; if (mc.progress >= 0.999) mc.status = "done";
            }
            if (mc.status !== "unload" && mc.truck.visible) { var ax = mc.cx + mc.W + 44 * mc.sc; mc.truck.position.x += (ax - mc.truck.position.x) * 0.05; if (mc.truck.position.x > mc.cx + mc.W + 32 * mc.sc) mc.truck.visible = false; }
            var g = laneGeom(mc); mc.grp.position.set(mc.cx + g.x, 0, mc.cz + g.z); mc.grp.rotation.y = g.dir > 0 ? 0 : Math.PI;
            if (mc.grp.__fill) { mc.grp.__fill.scale.y = Math.max(0.05, mc.tank); mc.grp.__fill.position.y = 8.4 - (1 - mc.tank) * 1.15; }
            if (mc.grp.__beacon) { var al = mc.status === "idle"; mc.grp.__beacon.material.color.setHex(al ? 0xff3b30 : 0xffb300); mc.grp.__beacon.material.opacity = al ? (0.35 + 0.5 * Math.abs(Math.sin(tk * 3))) : 0.85; }
            var decay = Math.pow(moving ? 0.95 : 0.88, dt * 60);
            for (var di = 0; di < mc.dust.length; di++) { var p = mc.dust[di]; if (moving && p.material.opacity < 0.06) { p.position.set(mc.grp.position.x - g.dir * 7 * mc.sc, 1.6, mc.grp.position.z + (di - 4) * 0.7); p.material.opacity = 0.45; } p.position.y += 3 * dt; p.material.opacity *= decay; }
            updMachineBadge(mc);
        }
        (function loop() {
            requestAnimationFrame(loop); tk += 0.05;
            var now = (window.performance && performance.now) ? performance.now() : lastT + 16, dt = Math.min(0.1, Math.max(0.001, (now - lastT) / 1000)); lastT = now;
            for (var i = 0; i < st.meshes.length; i++) { var bs = st.meshes[i].bodies; for (var j = 0; j < bs.length; j++) { if (bs[j].userData.targetColor) bs[j].material.color.lerp(bs[j].userData.targetColor, 0.12); } }
            for (var b = 0; b < st.badges.length; b++) { var s = 8 + Math.sin(tk + b) * 1.4; st.badges[b].scale.set(s, s, 1); }
            for (var m = 0; m < st.machines.length; m++) stepMachine(st.machines[m], dt);
            st._hc = (st._hc || 0) + 1; if (st._hc % 20 === 0 && st.updHarvest) st.updHarvest();
            for (var di = 0; di < st.drones.length; di++) {
                var d = st.drones[di]; d.t += 0.016;
                var ro = d.grp.__rotors; for (var ri = 0; ri < ro.length; ri++) ro[ri].rotation.y += 0.9;
                // ЛИЧНОЕ задание дрона: свой режим/пауза/цель; иначе — общий режим панели
                var dmode = d.mode || st.droneMode, dpaused = (d.paused != null) ? d.paused : st.dronePaused;
                var du = (d.target != null) ? st.units[d.target] : st.units[d.wp % st.units.length]; if (!du) continue;
                if (d.grp.__beacon) d.grp.__beacon.visible = (Math.floor(d.t * 5) % 2 === 0);
                if (dpaused) continue;
                var doPhoto = dmode === "photo" || (dmode !== "spray" && du.type === "orchard");
                var tx = du.px, tz = du.pz, ty = 15 + di * 4 + Math.sin(d.t * 2) * 0.6, po = d.grp.position;
                po.x += (tx - po.x) * 0.02; po.z += (tz - po.z) * 0.02; po.y += (ty - po.y) * 0.05;
                var dist = Math.hypot(tx - po.x, tz - po.z), cone = d.grp.__cone, flash = d.grp.__flash, parts = d.grp.__parts;
                if (dist < 5) {
                    d.hov += 1;
                    if (d.hov === 60 && st.controller && doPhoto) st.controller.change({ action: "scan", objName: du.name });   // фото → запись в журнал облётов
                    if (doPhoto) {
                        cone.material.opacity *= 0.85;
                        flash.material.opacity = (d.hov % 45 < 4) ? 0.5 : flash.material.opacity * 0.8;
                        for (var pi = 0; pi < parts.length; pi++) parts[pi].material.opacity *= 0.8;
                    } else {
                        cone.material.opacity = Math.min(0.22, cone.material.opacity + 0.03); flash.material.opacity *= 0.8;
                        for (var pj = 0; pj < parts.length; pj++) { var pt = parts[pj];
                            if (pt.material.opacity < 0.05) { pt.position.set(Math.sin(d.t * 7 + pj) * 2.4, -1, Math.cos(d.t * 5 + pj) * 2.4); pt.material.opacity = 0.7; }
                            pt.position.y -= 0.5; pt.material.opacity -= 0.03;
                        }
                    }
                    if (d.hov > 130) { if (d.target != null) d.target = null; else d.wp += Math.max(1, st.drones.length); d.hov = 0; }   // задание выполнено → назад в облёт
                } else {
                    cone.material.opacity *= 0.85; flash.material.opacity *= 0.85;
                    for (var pk = 0; pk < parts.length; pk++) parts[pk].material.opacity *= 0.85;
                    d.grp.rotation.y = Math.atan2(tx - po.x, tz - po.z);
                }
            }
            renderer.render(scene, camera);
        })();
        st.resize();
    }

    return {
        render: function (element) {
            element.style.cssText = "position:relative;height:66vh;min-height:420px;overflow:hidden";
            if (window.THREE) build(element);
            else { var n = 0, t = setInterval(function () { if (window.THREE) { clearInterval(t); build(element); if (element.__pending) element.__a3d.rebuild(element.__pending); } else if (++n > 100) clearInterval(t); }, 50); }
        },
        update: function (element, controller, value) {
            var s = (typeof value === "string") ? value : ""; if (!s) return;
            var st = element.__a3d;
            if (st) { st.controller = controller; if (s === st.last) return; st.last = s; st.rebuild(s); } else element.__pending = s;
        }
    };
}
