// ОБЩАЯ БИБЛИОТЕКА АВТО-ФИГУР. По ключевому слову в названии собирает узнаваемую СХЕМУ
// оборудования из примитивов — «дожато под реальный вид»: рама/опоры, привод-мотор, бункеры,
// патрубки, HMI-панель, сигнальная колонна. Материалы Phong (стальной блеск). Возвращает
// { group, bodies, matched }: bodies = корпус(а), их перекрашивают по метрике (статус/OEE/…);
// детали (сталь/тёмные) фиксированы. matched=false → тип не распознан (generic-блок).
// «Настоящие GLTF-модели потом» — их подставим сюда же по тому же ключу.

// GLTFLoader грузится как ОБЫЧНЫЙ ресурс приложения (onWebClientInit('GLTFLoader.js') в Scheme.lsf),
// а не подтягивается с внешнего CDN: закрытый контур и строгий CSP такой запрос просто не пропустят,
// плюс сторонний скрипт в сессии авторизованного пользователя — лишний supply-chain риск.
// Реестр моделей window.miteModels определяем ЗДЕСЬ же (shapelib.js зарегистрирован и отдаётся).
// Модели (.glb) тоже должны стать ресурсами приложения, а не грузиться по абсолютным URL со стороны.
(function () {
    if (window.__miteGltfBoot) return; window.__miteGltfBoot = true;
    // Реестр моделей оборудования. file = абсолютный URL .glb (CDN/GitHub-raw) ЛИБО пусто (→ схема).
    // Заполни URL-ами реальных моделей — и они появятся вместо схематичных фигур.
    if (!window.miteModels) window.miteModels = {
        loader: null, cache: {},
        map: [
            { re: /смеситель|опудрив|смешив|блендер|mixer/, url: "" },
            { re: /компактор|компактир|валк|roller/, url: "" },
            { re: /экструдер|гранул|extrud/, url: "" },
            { re: /сушилк|сушк|псевдоожиж|dryer|fbe/, url: "" },
            { re: /калибр|конич|мельниц|размол|comil/, url: "" },
            { re: /датчик|sensor/, url: "" },
            { re: /контроллер|plc|шкаф|siemens|сименс|mitsubishi|мицубиси/, url: "" }
        ],
        urlFor: function (name) { var k = (name || "").toLowerCase(); for (var i = 0; i < this.map.length; i++) if (this.map[i].re.test(k) && this.map[i].url) return this.map[i].url; return null; },
        load: function (THREE, name, cb) {
            var u = this.urlFor(name);
            if (!u || !THREE.GLTFLoader) { cb(null); return; }
            if (this.cache[u] === "none") { cb(null); return; }
            if (this.cache[u]) { cb(this.cache[u].clone(true)); return; }
            if (!this.loader) this.loader = new THREE.GLTFLoader();
            var self = this;
            try { this.loader.load(u, function (g) { var sc = g && g.scene; if (sc) { self.cache[u] = sc; cb(sc.clone(true)); } else { self.cache[u] = "none"; cb(null); } }, undefined, function () { self.cache[u] = "none"; cb(null); }); }
            catch (er) { self.cache[u] = "none"; cb(null); }
        }
    };
})();

window.miteShapeLib = function (THREE, name, h) {
    var k = (name || "").toLowerCase();
    h = h || 26;
    var g = new THREE.Group(), bodies = [];

    // палитра фармы: нержавейка + тёмные приводы/шкафы + акценты
    var STEEL = 0xc4ccd4, STEEL2 = 0x9198a1, DARK = 0x394049, RUBBER = 0x23272d,
        SCREEN = 0x27a6c6, BRASS = 0xc7a24a, BODY = 0x8b939d;

    function mat(c, steel) { return new THREE.MeshPhongMaterial({ color: new THREE.Color(c), specular: steel ? 0x70767e : 0x2a2e33, shininess: steel ? 72 : 26 }); }
    function M(geo, c, steel) { return new THREE.Mesh(geo, mat(c, steel)); }
    function add(m, x, y, z, rx, rz) { m.position.set(x || 0, y || 0, z || 0); if (rx) m.rotation.x = rx; if (rz) m.rotation.z = rz; g.add(m); return m; }
    function body(m) { bodies.push(m); return m; }            // корпус — красится по метрике
    function CYL(rt, rb, hh, s) { return new THREE.CylinderGeometry(rt, rb, hh, s || 20); }
    function BOX(w, hh, d) { return new THREE.BoxGeometry(w, hh, d); }
    function CONE(r, hh, s) { return new THREE.ConeGeometry(r, hh, s || 22); }
    function TOR(r, t) { return new THREE.TorusGeometry(r, t, 8, 24); }
    function SPH(r) { return new THREE.SphereGeometry(r, 12, 12); }

    // ── общие «узлы оборудования» ──────────────────────────────────────────────
    function feet(spread) {                                    // 4 трубчатые опоры + скид-основание + ножки
        var top = Math.max(3, h * 0.12);
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (p) {
            add(M(CYL(1.1, 1.1, top, 10), STEEL2, true), p[0] * spread, top / 2, p[1] * spread);
            add(M(CYL(1.9, 2.3, 1.4, 12), RUBBER), p[0] * spread, 0.7, p[1] * spread);
        });
        add(M(BOX(spread * 2 + 5, 1.6, spread * 2 + 5), DARK), 0, top, 0);
    }
    function hmi(x, z) {                                        // пульт HMI на стойке (лицо к +z)
        add(M(CYL(0.9, 0.9, h * 0.32, 8), STEEL2, true), x, h * 0.16, z);
        add(M(BOX(7.5, 5.4, 1.5), DARK), x, h * 0.35, z + 0.9);
        add(M(BOX(5.6, 3.6, 0.5), SCREEN), x, h * 0.36, z + 1.75);
    }
    function beacon(x, z) {                                     // сигнальная колонна (андон): верхняя лампа = статус
        add(M(CYL(0.7, 0.7, h * 0.2, 8), DARK), x, h * 0.1, z);
        add(M(CYL(2.1, 2.1, 1.4, 12), 0xb63a2e), x, h * 0.2 + 0.9, z);
        add(M(CYL(2.1, 2.1, 1.4, 12), 0xd9a441), x, h * 0.2 + 2.4, z);
        body(add(M(CYL(2.1, 2.1, 1.6, 12), BODY), x, h * 0.2 + 4.0, z));
    }
    function rig(spread) { feet(spread); hmi(spread + 3, spread - 1); beacon(-spread + 1, -spread - 1); }

    var matched = true;

    if (/смеситель|опудрив|mixer|блендер|смешив|mixing|blender|lubricat/.test(k)) {                 // высокоскоростной смеситель / опудриватель
        var m0 = h * 0.14;
        body(add(M(CYL(10, 10, h * 0.46, 24), BODY), 0, m0 + h * 0.33, 0));            // чаша (корпус)
        add(M(CONE(10, h * 0.2, 24), STEEL, true), 0, m0 + h * 0.05, 0, Math.PI);       // конус-разгрузка
        add(M(CYL(3.2, 4.6, h * 0.12, 16), STEEL2, true), 0, m0 - h * 0.02, 0);         // патрубок выгрузки
        add(M(CYL(2.4, 2.4, 3, 12), BRASS, true), 0, m0 - h * 0.08, 0);                 // клапан
        add(M(TOR(10.2, 0.9), STEEL2, true), 0, m0 + h * 0.56, 0, Math.PI / 2);          // хомут крышки
        add(M(CYL(10.4, 10.4, 1.6, 24), STEEL, true), 0, m0 + h * 0.58, 0);              // крышка
        add(M(CYL(3, 3, 5, 14), STEEL, true), 4, m0 + h * 0.63, 0);                      // загрузочный порт
        add(M(CYL(4.5, 4.5, 4, 16), STEEL2, true), 0, m0 + h * 0.63, 0);                 // редуктор
        add(M(BOX(8, 9, 8), DARK), 0, m0 + h * 0.74, 0);                                 // мотор
        add(M(CYL(3, 3, 3, 12), DARK), 0, m0 + h * 0.82, 0);                             // кожух вентилятора
        rig(11);
    } else if (/компактор|компактир|roller|валк|compact/.test(k)) {                 // роликовый компактор
        var c0 = h * 0.14;
        body(add(M(BOX(24, h * 0.5, 16), BODY), 0, c0 + h * 0.28, 0));                  // корпус
        add(M(CYL(4.4, 4.4, 17, 20), RUBBER), 0, c0 + h * 0.3, 6, Math.PI / 2);          // валок передний
        add(M(CYL(4.4, 4.4, 17, 20), RUBBER), 0, c0 + h * 0.3, -6, Math.PI / 2);         // валок задний
        add(M(TOR(4.6, 0.6), STEEL, true), 0, c0 + h * 0.3, 8.7);                        // фланец валка
        add(M(CYL(0, 7, h * 0.24, 4), STEEL, true), 0, c0 + h * 0.62, 0);                // бункер (пирамида)
        add(M(CYL(3, 3, h * 0.16, 12), STEEL2, true), 0, c0 + h * 0.5, 0);               // шнек-питатель
        add(M(BOX(6, h * 0.4, 12), DARK), -13, c0 + h * 0.28, 0);                        // привод сбоку
        add(M(BOX(9, h * 0.42, 6), STEEL2, true), 11, c0 + h * 0.26, 0);                 // боковая панель
        rig(12);
    } else if (/экструдер|гранул|extrud|granulat/.test(k)) {                         // двухшнековый экструдер-гранулятор
        var e0 = h * 0.16, cy = e0 + h * 0.28;
        body(add(M(CYL(4.4, 4.4, 26, 20), BODY), 3, cy, 0, 0, Math.PI / 2));            // ствол-бочка (корпус)
        for (var zc = -9; zc <= 9; zc += 4.5) { var col = add(M(CYL(5.2, 5.2, 2.2, 20), (Math.abs(zc) % 9 < 0.1 ? DARK : STEEL2), true), 0, cy, 0, 0, Math.PI / 2); col.position.x = zc + 3; } // зоны нагрева
        add(M(CYL(0, 6.5, h * 0.24, 4), STEEL, true), -6, cy + h * 0.2, 0);             // бункер загрузки
        add(M(CYL(3, 3, h * 0.14, 12), STEEL2, true), -6, cy + h * 0.08, 0);            // горловина
        add(M(BOX(9, h * 0.44, 11), DARK), -15, cy - h * 0.02, 0);                       // привод + редуктор
        add(M(CYL(4.6, 3, 5, 18), STEEL, true), 17, cy, 0, 0, Math.PI / 2);             // фильерная головка
        add(M(CONE(3.4, 5, 18), STEEL2, true), 20.5, cy, 0, 0, -Math.PI / 2);           // конус выхода
        add(M(BOX(6, h * 0.5, 7), DARK), 17, e0 + h * 0.25, 9);                          // шкаф управления
        feet(11); hmi(14, 10); beacon(-14, -9);
    } else if (/сушилк|сушк|dryer|drying|fbe|псевдоожиж/.test(k)) {                // сушилка псевдоожиженного слоя
        var d0 = h * 0.16;
        body(add(M(CYL(9, 9, h * 0.5, 24), BODY), 0, d0 + h * 0.36, 0));               // колонна (корпус)
        add(M(CONE(9, h * 0.24, 24), STEEL, true), 0, d0 + h * 0.05, 0, Math.PI);        // конус ёмкости
        add(M(CYL(11, 9, h * 0.18, 24), STEEL2, true), 0, d0 + h * 0.66, 0);            // расширит. камера
        add(M(CYL(11, 11, 2, 24), STEEL, true), 0, d0 + h * 0.75, 0);                    // фланец
        add(M(CONE(11, h * 0.16, 24), STEEL, true), 0, d0 + h * 0.83, 0);                // купол фильтров
        add(M(CYL(2, 2, 5, 12), STEEL2, true), 0, d0 + h * 0.92, 0);                     // штуцер выхлопа
        add(M(CYL(4.5, 4.5, h * 0.42, 16), STEEL2, true), 13, d0 + h * 0.4, 0, 0, 0.45); // воздуховод
        add(M(TOR(9.2, 0.8), STEEL2, true), 0, d0 + h * 0.11, 0, Math.PI / 2);            // хомут ёмкости
        add(M(BOX(3, h * 0.7, 1.4), DARK), -9.6, d0 + h * 0.42, 0);                      // стойка-лестница
        rig(10);
    } else if (/калибр|конич|мельниц|размол|comil|calibrat|conical/.test(k)) {               // конический калибратор (cone mill)
        var k0 = h * 0.16;
        add(M(CYL(0, 8, h * 0.2, 4), STEEL, true), 0, k0 + h * 0.72, 0);                // приёмный бункер
        add(M(CYL(3.4, 3.4, h * 0.1, 14), STEEL2, true), 0, k0 + h * 0.6, 0);           // горловина
        body(add(M(CONE(12, h * 0.44, 24), BODY), 0, k0 + h * 0.36, 0));                // коническая мельница (корпус)
        add(M(TOR(11.5, 0.9), STEEL2, true), 0, k0 + h * 0.16, 0, Math.PI / 2);           // хомут
        add(M(CYL(9, 12, h * 0.14, 20), STEEL2, true), 0, k0 + h * 0.08, 0);            // разгрузочная камера
        add(M(CYL(6, 6, h * 0.22, 18), DARK), 0, k0 - h * 0.02, 0);                     // мотор-база
        add(M(CYL(3, 4, h * 0.1, 14), STEEL, true), 9, k0 + h * 0.04, 0, 0, 0.7);       // разгрузочный лоток
        rig(11);
    } else if (/чиллер|кондицион|холодильн|chiller|fridge|refriger|cooling|мороз/.test(k)) { // чиллер / кондиционер / холодильный агрегат
        var z0 = h * 0.14;
        body(add(M(BOX(24, h * 0.56, 18), BODY), 0, z0 + h * 0.28, 0));                 // шкаф-корпус
        for (var fi = -4; fi <= 4; fi++) add(M(BOX(0.7, h * 0.44, 18), STEEL2, true), 12.4, z0 + h * 0.28, fi * 2.1); // рёбра-радиатор
        add(M(BOX(24, 2, 18), STEEL, true), 0, z0 + h * 0.56 + 1, 0);                   // крышка
        add(M(CYL(6.4, 6.4, 2.4, 20), DARK), -5, z0 + h * 0.56 + 3, 0);                 // обод вентилятора
        add(M(CYL(1.6, 1.6, 3, 10), STEEL2, true), -5, z0 + h * 0.56 + 4, 0);
        add(M(CYL(6.4, 6.4, 2.4, 20), DARK), 5, z0 + h * 0.56 + 3, 0);
        add(M(CYL(1.6, 1.6, 3, 10), STEEL2, true), 5, z0 + h * 0.56 + 4, 0);
        rig(12);
    } else if (/датчик|sensor|термо|влажн/.test(k)) {                       // датчик: корпус + антенна + LED
        body(add(M(BOX(9, 12, 9), BODY), 0, 7, 0));
        add(M(BOX(9.4, 3, 9.4), DARK), 0, 12.6, 0);
        add(M(CYL(0.7, 0.7, 11, 8), STEEL2, true), 3.2, 18, 0);
        add(M(SPH(1.7), 0x37d67a), 3.2, 24, 0);
        add(M(BOX(6, 3, 0.5), SCREEN), 0, 8, 4.6);
    } else if (/контроллер|controller|plc|siemens|сименс|mitsubishi|мицубиси|шкаф|panel/.test(k)) { // шкаф ПЛК
        body(add(M(BOX(20, h * 0.82, 11), BODY), 0, h * 0.41, 0));
        add(M(BOX(15, h * 0.5, 0.6), 0x2a2f36), 0, h * 0.5, 5.7);                        // монтажная панель
        [0x37d67a, 0xd9a441, 0xb3261e].forEach(function (c, i) { add(M(SPH(1.2), c), -6 + i * 4, h * 0.74, 5.9); });
        for (var r2 = 0; r2 < 3; r2++) add(M(BOX(15, 2, 0.8), STEEL2, true), 0, h * 0.36 - r2 * 5, 5.9);
        add(M(BOX(7, 4, 0.5), SCREEN), 5, h * 0.62, 5.9);
        add(M(BOX(22, 2, 13), DARK), 0, 1, 0);
    } else if (/солн|solar|фотоэлек|pv|гелио|панел/.test(k)) {              // солнечная станция: массив наклонных панелей
        add(M(BOX(34, 1.6, 26), DARK), 0, 1, 0);                                        // основание
        for (var sr = -1; sr <= 1; sr++) {
            var pan = add(new THREE.Mesh(new THREE.BoxGeometry(32, 0.8, 8), new THREE.MeshPhongMaterial({ color: new THREE.Color(0x1b3a6b), specular: 0x88aaff, shininess: 90 })), 0, 5.5 + Math.abs(sr) * 0, sr * 8.5, -0.5);
            for (var sc2 = -3; sc2 <= 3; sc2++) add(M(BOX(0.4, 0.9, 8), 0x33507e), sc2 * 4.4, 5.5, sr * 8.5, -0.5); // разбивка ячеек
            add(M(BOX(1.4, 6, 1.4), STEEL2, true), 0, 3, sr * 8.5);                     // стойка ряда
        }
    } else if (/накопит|батаре|battery|storage|аккум|bess|ess/.test(k)) {   // накопитель энергии: шкаф-контейнер + индикатор заряда
        var bt = h * 0.14;
        add(M(BOX(24, h * 0.56, 15), 0x2f3742), 0, bt + h * 0.28, 0);                   // корпус-контейнер
        for (var bm = 0; bm < 4; bm++) add(M(BOX(20, h * 0.1, 0.6), 0x475062), 0, bt + h * 0.14 + bm * h * 0.12, 7.6); // модули-полки
        add(M(BOX(4, h * 0.4, 0.5), 0x37d67a), -8, bt + h * 0.3, 7.7);                  // индикатор заряда (зелёный)
        add(M(BOX(7, 4, 0.5), SCREEN), 6, bt + h * 0.42, 7.7);                          // дисплей BMS
        add(M(BOX(26, 2, 17), DARK), 0, 1, 0);
        rig(12);
    } else if (/дозатор|доза|doser|dosing/.test(k)) {                       // дозатор: бункер-воронка + дозирующий цилиндр + сопло
        var q0 = h * 0.14;
        add(M(CONE(9, h * 0.26, 16), STEEL, true), 0, q0 + h * 0.62, 0);
        add(M(CYL(9, 6, 3, 16), STEEL2, true), 0, q0 + h * 0.47, 0);
        body(add(M(CYL(6, 6, h * 0.4, 18), BODY), 0, q0 + h * 0.28, 0));
        add(M(CYL(2.2, 2.8, h * 0.12, 12), STEEL2, true), 0, q0 + h * 0.06, 0);
        rig(9);
    } else if (/запайк|запаечн|sealer|sealing/.test(k)) {                   // запайщик: транспортёр + стойки + прижимная планка
        var w0 = h * 0.14;
        body(add(M(BOX(26, h * 0.18, 15), BODY), 0, w0 + h * 0.09, 0));
        add(M(BOX(3, h * 0.5, 3), STEEL2, true), -9, w0 + h * 0.38, 0);
        add(M(BOX(3, h * 0.5, 3), STEEL2, true), 9, w0 + h * 0.38, 0);
        add(M(BOX(22, h * 0.12, 6), DARK), 0, w0 + h * 0.56, 0);
        add(M(CYL(2, 2, 17, 12), STEEL, true), -13, w0 + h * 0.09, 0, Math.PI / 2);
        rig(12);
    } else if (/упаковщик|упаковк|packer|packag|wrap/.test(k)) {            // упаковщик: корпус + рулон плёнки + лоток
        var u0 = h * 0.14;
        body(add(M(BOX(24, h * 0.5, 16), BODY), 0, u0 + h * 0.28, 0));
        add(M(CYL(6, 6, 20, 16), STEEL2, true), 0, u0 + h * 0.62, -3, 0, Math.PI / 2);
        add(M(CYL(6.4, 6.4, 2, 16), DARK), 10.5, u0 + h * 0.62, -3, 0, Math.PI / 2);
        add(M(BOX(12, 3, 8), DARK), 15, u0 + h * 0.14, 0);
        rig(12);
    } else if (/фасовк|фасов|portion|filler/.test(k)) {                    // фасовщик-карусель: бункер + диск с соплами
        var v0 = h * 0.14;
        add(M(CONE(8, h * 0.22, 16), STEEL, true), 0, v0 + h * 0.66, 0);
        body(add(M(CYL(11, 11, h * 0.34, 20), BODY), 0, v0 + h * 0.3, 0));
        add(M(CYL(12, 12, 2, 20), STEEL2, true), 0, v0 + h * 0.46, 0);
        for (var ni = 0; ni < 6; ni++) { var an = ni * Math.PI / 3; add(M(CYL(1.2, 1.5, 4, 8), STEEL2, true), Math.cos(an) * 8, v0 + h * 0.12, Math.sin(an) * 8); }
        rig(11);
    } else if (/этикет|labeler|label/.test(k)) {                           // этикетировщик: транспортёр + большой рулон этикеток
        var e1 = h * 0.14;
        body(add(M(BOX(26, h * 0.18, 14), BODY), 0, e1 + h * 0.09, 0));
        add(M(CYL(11, 11, 1.6, 24), STEEL, true), -4, e1 + h * 0.44, 6, Math.PI / 2);
        add(M(CYL(2, 2, 5, 12), DARK), -4, e1 + h * 0.44, 3.5, Math.PI / 2);
        add(M(CYL(4.5, 4.5, 1.4, 20), STEEL2, true), 8, e1 + h * 0.4, 6, Math.PI / 2);
        add(M(CYL(2, 2, 17, 12), STEEL, true), 13, e1 + h * 0.09, 0, Math.PI / 2);
        rig(12);
    } else if (/грядк|огород|клумб/.test(k)) {
        body(add(M(BOX(30, 4, 20), 0x5a7d3a), 0, 2, 0));
        for (var r = -1; r <= 1; r++) add(M(BOX(30, 2.5, 3), 0x486a2e), 0, 4.5, r * 6);
    } else if (/дерев|сад|яблон/.test(k)) {
        add(M(CYL(2, 2.5, h * 0.5, 10), 0x7a5230), 0, h * 0.25, 0);
        body(add(M(SPH(9), 0x4a9e3a), 0, h * 0.5 + 6, 0));
    } else if (/ворот|gate|шлагбаум/.test(k)) {
        add(M(BOX(3, h, 3), DARK), -11, h * 0.5, 0);
        add(M(BOX(3, h, 3), DARK), 11, h * 0.5, 0);
        body(add(M(BOX(22, h * 0.55, 2.5), BODY), 0, h * 0.42, 0));
    } else if (/компрессор|насос|pump|compressor/.test(k)) {                          // насос / компрессор
        body(add(M(CYL(9, 9, h * 0.5, 20), BODY), 0, h * 0.3, 0, 0, Math.PI / 2));
        add(M(CYL(9.3, 9.3, 2, 20), STEEL, true), -h * 0.24, h * 0.3, 0, 0, Math.PI / 2);
        add(M(BOX(9, h * 0.34, 8), DARK), h * 0.17, h * 0.28, 0);
        add(M(CYL(2, 2, 12, 12), STEEL2, true), 0, h * 0.55, 5, Math.PI / 2);
        add(M(SPH(2.2), BRASS, true), 0, h * 0.55, 10);
        feet(9);
    } else if (/курятник|птичник|сарай|коровник|ферм|склад|цех|здани|дом/.test(k)) {
        body(add(M(BOX(26, h * 0.6, 20), 0xcdb291), 0, h * 0.3, 0));
        add(M(CYL(0.1, 16, h * 0.35, 4), 0x9c5b3b), 0, h * 0.6 + h * 0.175, 0, 0, Math.PI / 4);
    } else if (/теплиц|парник|оранжере/.test(k)) {
        body(add(new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 26, 16, 1, false, 0, Math.PI), mat(0x9fd6e6, false)), 0, 0, 0, Math.PI / 2, 0));
        add(M(BOX(26, 1, 22), 0x8a7a5a), 0, 0.5, 0);
    } else {
        matched = false;
        body(add(M(BOX(20, h * 0.7, 20), BODY), 0, h * 0.35 + 1.6, 0));
        add(M(BOX(22, 2, 22), DARK), 0, 1, 0);
        feet(9);
    }
    return { group: g, bodies: bodies, matched: matched };
};
