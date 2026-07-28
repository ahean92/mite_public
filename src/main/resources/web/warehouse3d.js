// 3D-склад WMS для lsFusion (custom component, Three.js) — живой смарт-мониторинг.
// ЭТАП A: комплекс датчиков (t°/влажность/этилен) с нормой ПОД ТИП ПРОДУКТА по зонам-камерам.
// Датчик ловит выход за норму (отказ холода / рост этилена) → система создаёт
// спасательное задание → погрузчик вывозит товар ДО порчи. Герой-метрика: «предотвращено
// потерь ₽» и контраст «без мониторинга потеряли бы ₽». Переключатель слоёв сверху.
// value: W^name^floorW^floorD^forkCount ~ R^idx^posX^posZ^cols^levels^orient^name
//        ~ G^num^x^z^name ~ C^rackIdx^col^level^color^num^occ^alarm^fork^daysLeft^alabel^atype^sku^store^value
function warehouse3d() {
    var CW = 18, CH = 20, CD = 24;
    var FORK_COLORS = [0xf2c200, 0x27b083, 0x3a7bd5];
    var CUSTOMERS = ["Гиппо", "Соседи", "Евроопт", "Магнит", "Перекрёсток", "Пятёрочка", "ВкусВилл", "Лента", "Дикси", "Корона"];
    function bizReason(zone) { return zone.equipFault ? "сбой холодильного оборудования" : zone.cause === "eth" ? "ускоренное дозревание (этилен)" : zone.cause === "hum" ? "нарушение влажности" : "температура выше нормы"; }
    // библиотека сценариев инцидентов: причина + корневая причина + что сделано + предотвращённый риск + материалы
    var SCEN = {
        cold: [
            { cause: "Засор фильтров холодильника", root: "загрязнились фильтры конденсатора, упал теплосъём", repair: "замена фильтров, чистка конденсатора", risk: "перегрев и поломка мотора — 75%", mat: ["фильтры", 2] },
            { cause: "Утечка хладагента", root: "микротечь в контуре, давление упало", repair: "устранена течь, дозаправка R404", risk: "полный отказ компрессора — 60%", mat: ["хладагент R404", 1] },
            { cause: "Обледенение испарителя", root: "забит дренаж, наморозило испаритель", repair: "разморозка и прочистка дренажа", risk: "блокировка воздуха, рост t° — 50%", mat: [] },
            { cause: "Просадка напряжения", root: "скачок в сети, сработала защита компрессора", repair: "перезапуск, проверка автоматики", risk: "выход из строя пускателя — 40%", mat: ["пусковое реле", 1] },
            { cause: "Дверь камеры приоткрыта", root: "не сработал доводчик двери", repair: "регулировка доводчика, инструктаж смены", risk: "наплыв тепла и порча — высокий", mat: [] },
            { cause: "Дрейф датчика температуры", root: "показания датчика ушли — нужна поверка", repair: "поверка и замена датчика", risk: "ложные/пропущенные тревоги", mat: ["датчик MITE", 1] }
        ],
        eth: [
            { cause: "Этилен от соседней партии", root: "зелёные бананы ускорили дозревание соседних фруктов", repair: "партии разнесены, усилена вентиляция", risk: "ускоренная порча партии — высокий", mat: [] },
            { cause: "Перезревание партии", root: "партия дозрела быстрее плана, рост этилена", repair: "переприоритизация на скорую отгрузку", risk: "потеря товарного вида", mat: [] }
        ],
        hum: [
            { cause: "Конденсат, рост влажности", root: "перепад температур дал конденсат", repair: "осушение, настройка вентиляции", risk: "плесень и потеря качества", mat: [] },
            { cause: "Протечка в зоне", root: "локальная протечка подняла влажность", repair: "устранена протечка, просушка", risk: "намокание упаковки", mat: [] }
        ]
    };
    function scKind(zone) { return (zone.equipFault || zone.cause === "temp") ? "cold" : zone.cause === "eth" ? "eth" : zone.cause === "hum" ? "hum" : "cold"; }
    function pickScenario(st, kind) { var sv = st.serverScen && st.serverScen[kind]; var pool = (sv && sv.length) ? sv : (SCEN[kind] || SCEN.cold); return pool[(st.critId * 3 + Math.floor(Math.random() * pool.length)) % pool.length]; }

    // ----- темы зон (стеллаж = холодильная камера со своим климатом) -----
    function zoneTheme(rackIdx) {
        if (rackIdx === 2) return { key: 'fruit', name: 'Фрукты/овощи', set: 5, tMax: 8, hum: 90, eth: true };
        if (rackIdx >= 3) return { key: 'frozen', name: 'Заморозка', set: -18, tMax: -15, hum: 70, eth: false };
        return { key: 'chill', name: 'Охлаждёнка', set: 2, tMax: 4, hum: 85, eth: false };
    }
    function fmt(n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
    function t1(n) { return (Math.round(n * 10) / 10).toFixed(1); }
    // 1 сим-секунда ≈ 5 «складских» минут — чтобы длительности читались реалистично (техник ~2 ч и т.п.)
    var TSCALE = 5;
    function dur(sec) { var m = Math.max(1, Math.round(sec * TSCALE)); if (m < 60) return m + " мин"; var h = Math.floor(m / 60), mm = m % 60; return h + " ч" + (mm ? " " + mm + " мин" : ""); }
    // прогноз остаточного ресурса (RUL) холодильного агрегата по тренду вибрации, в часах
    function rulHoursWh(eq) {
        if (!eq || eq.alarm || eq.tech) return 0;
        var vmax = eq.vibMax || 7, rate = 0.9, sec;
        if (eq.degrading) sec = Math.max(0, (vmax - eq.vib) / rate);
        else sec = Math.max(0, eq.degradeT || 0) + (vmax - 1.2) / rate;
        return sec * TSCALE / 60;
    }
    function rulText(h) { return h <= 0 ? "сервис" : h < 1 ? "<1 ч" : h < 48 ? Math.round(h) + " ч" : Math.round(h / 24) + " сут"; }
    function rulColor(h, busy) { return busy ? "#ff8f8f" : h < 2 ? "#ff8f8f" : h < 6 ? "#ffd24d" : "#7af0a3"; }
    // ERP: наряд ТОиР на сервер (документ + списание ЗИП + заявка)
    function sendWorkOrder(st, o) { try { if (st.controller && st.controller.change) st.controller.change({ action: "workorder", object: o.object || "", cause: o.cause || "", act: o.act || "", risk: o.risk || "", spare: o.spare || "", qty: o.qty || 0, saved: Math.round(o.saved || 0) }); } catch (e) { } }

    function mk(THREE, geo, color, opts) { return new THREE.Mesh(geo, new THREE.MeshLambertMaterial(Object.assign({ color: new THREE.Color(color) }, opts || {}))); }
    function makeLabel(THREE, w, h) {
        var cv = document.createElement("canvas"); cv.width = w || 256; cv.height = h || 64;
        var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false }));
        sp.renderOrder = 10;
        return { sprite: sp, cv: cv, ctx: cv.getContext("2d") };
    }
    function drawTag(L, text, color, bg) {
        var c = L.ctx, w = L.cv.width, h = L.cv.height;
        c.clearRect(0, 0, w, h);
        c.fillStyle = bg || "rgba(255,255,255,0.92)"; c.strokeStyle = color || "#b3261e"; c.lineWidth = 5;
        var r = 12; c.beginPath();
        c.moveTo(r, 2); c.arcTo(w - 2, 2, w - 2, h - 2, r); c.arcTo(w - 2, h - 2, 2, h - 2, r); c.arcTo(2, h - 2, 2, 2, r); c.arcTo(2, 2, w - 2, 2, r); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = color || "#b3261e"; c.font = "bold 30px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
        c.fillText((window.miteTr?window.miteTr(text):text), w / 2, h / 2);
        L.sprite.material.map.needsUpdate = true;
    }
    function rackLabel(THREE, text) {
        var L = makeLabel(THREE, 256, 128), c = L.ctx;
        c.clearRect(0, 0, 256, 128);
        c.fillStyle = "#2c343f"; c.font = "600 74px 'Segoe UI',Arial,sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
        c.fillText((window.miteTr?window.miteTr(text):text), 128, 68);
        L.sprite.material.map.needsUpdate = true; L.sprite.scale.set(17, 8.5, 1); return L.sprite;
    }
    function dist2(ax, az, bx, bz) { var dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }

    // ---------- HUD ----------
    function buildHud(element, st) {
        // навигация: Склад › Зал › Комната
        var nav = document.createElement("div");
        nav.style.cssText = "position:absolute;left:50%;top:8px;transform:translateX(-50%);z-index:7;display:flex;gap:5px;align-items:center;background:rgba(18,26,36,0.88);padding:5px 11px;border-radius:9px;font-family:'Segoe UI',sans-serif;font-size:12px;color:#cfd8e3;pointer-events:auto;white-space:nowrap";
        element.appendChild(nav); st.nav = nav;

        // верхняя панель: слои + звук
        var bar = document.createElement("div");
        bar.style.cssText = "position:absolute;left:50%;top:46px;transform:translateX(-50%);z-index:6;display:flex;gap:6px;background:rgba(18,26,36,0.82);padding:6px 8px;border-radius:10px;font-family:'Segoe UI',sans-serif";
        var layers = [["temp", "Температура"], ["hum", "Влажность"], ["eth", "Этилен"], ["exp", "Срок годности"], ["equip", "Оборудование"]];
        st.layerBtns = {};
        layers.forEach(function (l) {
            var b = document.createElement("div");
            b.textContent = (window.miteTr||String)(l[1]);
            b.style.cssText = "cursor:pointer;color:#cfd8e3;font-size:12px;padding:5px 11px;border-radius:7px;user-select:none";
            b.onclick = function () { st.setLayer(l[0]); };
            bar.appendChild(b); st.layerBtns[l[0]] = b;
        });
        var snd = document.createElement("div");
        snd.style.cssText = "cursor:pointer;color:#cfd8e3;font-size:12px;padding:5px 11px;border-radius:7px;user-select:none;border-left:1px solid rgba(255,255,255,.15);margin-left:2px";
        snd.textContent = (window.miteTr||String)("🔊 Звук: выкл");
        snd.onclick = function () { toggleSound(st, snd); };
        bar.appendChild(snd);
        element.appendChild(bar);

        // ===== КОНСТРУКТОР: палитра типов из библиотеки (размести / назови) =====
        var pal = document.createElement("div");
        pal.style.cssText = "position:absolute;left:50%;top:84px;transform:translateX(-50%);z-index:6;display:flex;align-items:center;gap:5px;background:rgba(18,26,36,0.82);padding:5px 8px;border-radius:10px;font-family:'Segoe UI',sans-serif;max-width:94%;max-height:46%;overflow-y:auto;flex-wrap:wrap;justify-content:center";
        var palTitle = document.createElement("span");
        palTitle.textContent = (window.miteTr||String)("Конструктор:");
        palTitle.style.cssText = "color:#9fb0c4;font-size:11px;margin-right:2px";
        pal.appendChild(palTitle);
        var nameInp = document.createElement("input");
        nameInp.placeholder = (window.miteTr||String)("имя (необяз.)");
        nameInp.style.cssText = "width:110px;font-size:11px;padding:4px 6px;border-radius:6px;border:1px solid #3a4656;background:#0f1722;color:#dfe6ee";
        pal.appendChild(nameInp); st.placeNameInp = nameInp;
        var typesWrap = document.createElement("span");
        typesWrap.style.cssText = "display:flex;align-items:center;gap:4px;flex-wrap:wrap;justify-content:center";
        pal.appendChild(typesWrap); st.typesWrap = typesWrap; st.placeBtns = {};
        var palStop = document.createElement("div");
        palStop.textContent = (window.miteTr||String)("✋ стоп");
        palStop.style.cssText = "cursor:pointer;color:#cfd8e3;font-size:12px;padding:5px 10px;border-radius:7px;user-select:none;border-left:1px solid rgba(255,255,255,.15);margin-left:2px";
        palStop.onclick = function () { setPlaceMode(st, null); };
        pal.appendChild(palStop);
        var palHint = document.createElement("div");
        palHint.style.cssText = "position:absolute;left:50%;top:124px;transform:translateX(-50%);z-index:6;color:#ffd479;font-size:11px;font-family:'Segoe UI',sans-serif;background:rgba(18,26,36,0.82);padding:3px 9px;border-radius:7px;display:none";
        st.placeHint = palHint;
        element.appendChild(pal); element.appendChild(palHint);

        // палитра строится из библиотеки типов (st.equipList) — любой добавленный тип
        function refreshPalette(st) {
            if (!st.typesWrap) return;
            st.typesWrap.innerHTML = ""; st.placeBtns = {};
            st.typesWrap.style.flexWrap = "wrap";
            var order = (typeof DOMAIN_ORDER !== "undefined") ? DOMAIN_ORDER : ["Остальное"];
            var byDom = {}; order.forEach(function (d) { byDom[d] = []; });
            (st.equipList || []).forEach(function (t) {
                var d = (typeof TYPE_DOMAIN !== "undefined" && TYPE_DOMAIN[t.name]) || "Остальное";
                if (!byDom[d]) byDom[d] = [];
                byDom[d].push(t);
            });
            order.forEach(function (dom) {
                var list = byDom[dom]; if (!list || !list.length) return;
                var sec = document.createElement("div");
                sec.style.cssText = "display:flex;align-items:center;gap:4px;flex-wrap:wrap;padding:1px 5px;border-left:2px solid rgba(120,160,220,.45);margin:1px 2px";
                var lbl = document.createElement("span");
                lbl.textContent = (window.miteTr || String)((typeof DOMAIN_LABELS !== "undefined" && DOMAIN_LABELS[dom]) || dom);
                lbl.style.cssText = "font-size:10px;font-weight:700;letter-spacing:.3px;color:#8fb3e0;margin-right:2px;white-space:nowrap";
                sec.appendChild(lbl);
                list.forEach(function (t) {
                    var b = document.createElement("div");
                    b.title = (t.lenM ? (t.lenM + "×" + t.widM + "×" + t.heM + " м") : "");
                    b.style.cssText = "cursor:pointer;color:#cfd8e3;font-size:12px;padding:4px 8px;border-radius:7px;user-select:none;display:flex;align-items:center;gap:5px";
                    var sw = document.createElement("span");
                    sw.style.cssText = "width:9px;height:9px;border-radius:2px;background:" + (t.color || "#6b7280");
                    var tx = document.createElement("span"); tx.textContent = (window.miteTr || String)(t.name);
                    b.appendChild(sw); b.appendChild(tx);
                    b.onclick = function () { setPlaceMode(st, t.name); };
                    sec.appendChild(b); st.placeBtns[t.name] = b;
                });
                st.typesWrap.appendChild(sec);
            });
            if (st.placeMode && st.placeBtns[st.placeMode]) setPlaceMode(st, st.placeMode);
        }
                st.refreshPalette = refreshPalette;

        // переключение режима размещения (по ИМЕНИ типа)
        function setPlaceMode(st, typeName) {
            st.placeMode = typeName || null;
            Object.keys(st.placeBtns).forEach(function (k) {
                st.placeBtns[k].style.background = (k === typeName) ? "#3a7bd5" : "transparent";
                st.placeBtns[k].style.color = (k === typeName) ? "#fff" : "#cfd8e3";
            });
            if (st.placeHint) {
                st.placeHint.style.display = typeName ? "block" : "none";
                st.placeHint.textContent = (window.miteTr||String)("кликни по полу склада, чтобы разместить: ") + (typeName || "");
            }
            if (st.renderer) st.renderer.domElement.style.cursor = typeName ? "crosshair" : "";
        }
        st.setPlaceMode = setPlaceMode;

        // ===== КОНСТРУКТОР: панель привязки размещённого объекта (клик по элементу) =====
        var bp = document.createElement("div");
        bp.style.cssText = "position:absolute;right:14px;top:96px;width:240px;z-index:7;background:rgba(18,26,36,0.94);border:1px solid #2f3b4a;border-radius:10px;padding:12px 13px;font-family:'Segoe UI',sans-serif;color:#dfe6ee;display:none";
        element.appendChild(bp); st.bindPanel = bp;
        function ev(a, extra) { if (st.controller) st.controller.change(Object.assign({ action: a, ix: st.bindIx }, extra || {})); }
        st.showPlacedDetail = function (st, ix) {
            var u = st.unitByIndex[ix]; if (!u) return; st.bindIx = ix;
            var bound = u.dev && u.dev !== "";
            var status = bound
                ? '<span style="color:#1f9d6b">🔗 ' + (window.miteTr || String)("датчик") + ' #' + u.dev + (u.value !== "" ? ' · ' + u.value + '°C' : '') + '</span>'
                : '<span style="color:#9fb0c4">' + (window.miteTr || String)("не привязан (симуляция)") + '</span>';
            bp.innerHTML = ""; bp.style.display = "block";
            var ttl = document.createElement("div"); ttl.style.cssText = "font-size:13px;font-weight:700;margin-bottom:2px"; ttl.textContent = (window.miteTr || String)("Объект");
            var nin = document.createElement("input"); nin.value = u.name || ""; nin.style.cssText = "width:100%;font-size:12px;padding:5px 7px;margin:6px 0;border-radius:6px;border:1px solid #3a4656;background:#0f1722;color:#dfe6ee;box-sizing:border-box";
            var meta = document.createElement("div"); meta.style.cssText = "font-size:11px;color:#9fb0c4;margin-bottom:8px"; meta.innerHTML = (window.miteTr || String)("тип") + ": " + (window.miteTr || String)(u.typeName || u.shape || "—") + "<br>" + status;
            function btn(txt, col, fn) { var b = document.createElement("div"); b.textContent = (window.miteTr || String)(txt); b.style.cssText = "cursor:pointer;text-align:center;font-size:12px;padding:7px;margin-top:6px;border-radius:7px;background:" + col + ";color:#fff;user-select:none"; b.onclick = fn; return b; }
            bp.appendChild(ttl); bp.appendChild(nin); bp.appendChild(meta);
            bp.appendChild(btn("🔗 Привязать датчик", "#2563a8", function () { ev("bindask"); bp.style.display = "none"; }));
            if (bound) bp.appendChild(btn("Отвязать", "#5a6470", function () { ev("unbind"); bp.style.display = "none"; }));
            bp.appendChild(btn("Переименовать", "#3a4656", function () { if (nin.value && nin.value !== u.name) ev("rename", { object: nin.value }); bp.style.display = "none"; }));
            bp.appendChild(btn("🗑 Удалить", "#a8352f", function () { ev("delunit"); bp.style.display = "none"; }));
            bp.appendChild(btn("Закрыть", "#26303c", function () { bp.style.display = "none"; }));
        };

        // левая сводка
        var hud = document.createElement("div");
        hud.style.cssText = "position:absolute;left:14px;top:12px;width:316px;font-family:'Segoe UI',sans-serif;pointer-events:none;z-index:5";
        function cell(l, id, col) { return '<div><div style="font-size:10px;letter-spacing:.4px;text-transform:uppercase;opacity:.62">' + l + '</div><div id="' + id + '" style="font-size:21px;font-weight:800;color:' + col + '">0</div></div>'; }
        hud.innerHTML =
            (window.miteTr||String)('<div style="background:rgba(18,26,36,0.86);color:#fff;border-radius:12px;padding:13px 15px;box-shadow:0 8px 26px rgba(0,0,0,.3)">'
            + '<div id="h-benefit-box" style="cursor:pointer;pointer-events:auto">'
            + '<div style="font-size:11px;font-weight:700;letter-spacing:.4px;color:#7af0a3"><span style="font-size:13px">🛡</span> ДАТЧИКИ ПРЕДОТВРАТИЛИ ПОТЕРЬ <span style="opacity:.6;font-weight:400">— клик</span></div>'
            + '<div id="h-prevent" style="font-size:29px;font-weight:800;color:#7af0a3;line-height:1.1;margin:2px 0">0 ₽</div>'
            + '<div style="font-size:11px;opacity:.72">без мониторинга потеряли бы <span id="h-would" style="color:#ff9b9b;font-weight:700">0 ₽</span> · ≈ месяц <b id="h-month" style="color:#9be7b4">0 ₽</b></div>'
            + '</div>'
            + '<div id="h-eqinv" style="font-size:10px;opacity:.6;margin-top:5px"></div>'
            + '<div id="h-risks" style="margin-top:8px;font-size:11px;padding:6px 8px;background:rgba(255,210,77,0.08);border:1px solid rgba(255,210,77,0.3);border-radius:7px"></div>'
            + '<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.12)"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.4px;opacity:.72;color:#ffd24d;margin-bottom:4px">📉 С датчиками / без · потери</div><div id="h-cf"></div></div>'
            + '<div style="display:flex;gap:15px;margin-top:10px">'
            + cell("Инцидентов", "h-inc", "#ffd24d") + cell("Спасено", "h-saved", "#5fe08a") + cell("В утиль", "h-scrap", "#ff8f8f")
            + '</div>'
            + '<div style="margin-top:11px">'
            + '<div style="display:flex;justify-content:space-between;font-size:11px"><span style="opacity:.8">Выполнено заданий</span><span id="h-pct" style="font-weight:700;color:#7af0a3">0%</span></div>'
            + '<div style="height:9px;background:rgba(255,255,255,.16);border-radius:5px;margin-top:4px;overflow:hidden"><div id="h-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#27b083,#7af0a3);transition:width .25s"></div></div>'
            + '<div style="font-size:10px;opacity:.55;margin-top:6px">Задания (клик — подробнее):</div>'
            + '<div id="h-tasks" style="margin-top:3px;font-size:11px;opacity:.9;min-height:28px;pointer-events:auto"></div>'
            + '</div>'
            + '<div id="h-erp" style="margin-top:9px;padding-top:9px;border-top:1px solid rgba(255,255,255,.12);font-size:11px;display:flex;gap:6px;align-items:center;flex-wrap:wrap"></div>'
            + '</div>');
        element.appendChild(hud);
        var q = function (id) { return hud.querySelector("#" + id); };
        st.hud = { prevent: q("h-prevent"), would: q("h-would"), month: q("h-month"), payback: q("h-payback"), eqinv: q("h-eqinv"), risks: q("h-risks"), cf: q("h-cf"), inc: q("h-inc"), saved: q("h-saved"), scrap: q("h-scrap"), pct: q("h-pct"), bar: q("h-bar"), tasks: q("h-tasks"), erp: q("h-erp") };
        if (st.hud.risks) { st.hud.risks.style.pointerEvents = "auto"; st.hud.risks.style.cursor = "pointer"; st.hud.risks.addEventListener("mouseenter", function () { st.risksHover = true; }); st.hud.risks.addEventListener("mouseleave", function () { st.risksHover = false; }); st.hud.risks.addEventListener("click", function (e) { var el = e.target.closest && e.target.closest("[data-rzone]"); if (!el) return; var zi = +el.getAttribute("data-rzone"); var z = st.zones.filter(function (x) { return x.rackIndex === zi; })[0]; if (z) { enterRoom(st, z); showZoneForecast(st, z); } }); }
        var bbox = q("h-benefit-box"); if (bbox) bbox.onclick = function () { showWhBenefitDetail(st); };
        st.hud.tasks.addEventListener("mouseenter", function () { st.taskHover = true; });
        st.hud.tasks.addEventListener("mouseleave", function () { st.taskHover = false; });

        // журнал событий (кликабельный)
        var jr = document.createElement("div");
        jr.style.cssText = "position:absolute;left:14px;bottom:14px;width:344px;font-family:'Segoe UI',sans-serif;z-index:6;pointer-events:auto";
        jr.innerHTML = (window.miteTr||String)('<div style="font-size:11px;font-weight:700;letter-spacing:.4px;color:#cfd8e3;margin-bottom:5px;text-shadow:0 1px 3px #000">ЖУРНАЛ СОБЫТИЙ <span style="opacity:.6;font-weight:400">— клик, чтобы провалиться</span></div><div id="jr-list"></div>');
        element.appendChild(jr);
        st.journal = jr.querySelector("#jr-list");
        jr.addEventListener("mouseenter", function () { st.journalHover = true; });
        jr.addEventListener("mouseleave", function () { st.journalHover = false; renderJournal(st); });

        // легенда активного слоя (под верхней панелью)
        var lg = document.createElement("div");
        lg.style.cssText = "position:absolute;left:50%;top:84px;transform:translateX(-50%);z-index:5;display:flex;gap:11px;background:rgba(18,26,36,0.7);padding:4px 11px;border-radius:8px;font-family:'Segoe UI',sans-serif;font-size:11px;color:#dfe6ee";
        element.appendChild(lg); st.legend = lg;

        // панель критических событий дня (справа сверху)
        var cp = document.createElement("div");
        cp.style.cssText = "position:absolute;right:14px;top:12px;width:332px;font-family:'Segoe UI',sans-serif;z-index:6;pointer-events:auto";
        cp.innerHTML = (window.miteTr||String)('<div style="background:rgba(38,16,16,0.9);color:#fff;border-radius:12px;padding:12px 14px;box-shadow:0 8px 26px rgba(0,0,0,.3)">'
            + '<div style="font-size:11px;font-weight:700;letter-spacing:.4px;color:#ff9b9b">🚨 КРИТИЧЕСКИЕ СОБЫТИЯ ДНЯ <span style="opacity:.6;font-weight:400">— клик</span></div>'
            + '<div id="cp-sum" style="font-size:11px;opacity:.82;margin:5px 0 8px;line-height:1.5"></div>'
            + '<div id="cp-list" style="font-size:12px;line-height:1.45"></div>'
            + '</div>');
        element.appendChild(cp);
        st.crit = { sum: cp.querySelector("#cp-sum"), list: cp.querySelector("#cp-list") };
        cp.addEventListener("mouseenter", function () { st.critHover = true; });
        cp.addEventListener("mouseleave", function () { st.critHover = false; renderCritical(st); });

        // лента дня — тонкая полоса, прилипшая к низу ОКНА (position:fixed) — не обрезается высокой сценой
        var tl = document.createElement("div");
        tl.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:12px;width:min(520px,48%);z-index:60;pointer-events:auto;font-family:'Segoe UI',sans-serif";
        tl.innerHTML = (window.miteTr||String)('<div style="background:rgba(18,26,36,0.92);border-radius:10px;padding:7px 12px;box-shadow:0 6px 20px rgba(0,0,0,.45)">'
            + '<div style="display:flex;justify-content:space-between;font-size:10px;color:#cfd8e3;margin-bottom:5px"><span>ЛЕНТА ДНЯ <span style="opacity:.6">— метки инцидентов, клик</span></span><span id="tl-clock" style="opacity:.85">08:00</span></div>'
            + '<div id="tl-track" style="position:relative;height:14px;background:rgba(255,255,255,.08);border-radius:5px"></div></div>');
        element.appendChild(tl);
        st.tl = { track: tl.querySelector("#tl-track"), clock: tl.querySelector("#tl-clock") };
        tl.addEventListener("mouseenter", function () { st.tlHover = true; });
        tl.addEventListener("mouseleave", function () { st.tlHover = false; renderTimeline(st); });

        // оверлей подробностей
        var ov = document.createElement("div");
        ov.style.cssText = "position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(8,12,18,0.55);z-index:20;pointer-events:auto";
        ov.innerHTML = (window.miteTr||String)('<div id="ov-card" style="max-width:490px;background:#ffffff;color:#2a3543;border-radius:18px;padding:24px 26px;box-shadow:0 18px 60px rgba(0,0,0,.35);font-family:\'Segoe UI\',Arial,sans-serif"></div>');
        ov.onclick = function (e) { if (e.target === ov) ov.style.display = "none"; };
        element.appendChild(ov);
        st.overlay = ov; st.overlayCard = ov.querySelector("#ov-card");

        // обзор складов сети (плитки залов с KPI)
        var ovw = document.createElement("div");
        ovw.style.cssText = "position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(8,12,18,0.6);z-index:21;pointer-events:auto";
        ovw.innerHTML = (window.miteTr||String)('<div id="ovw-card" style="max-width:780px;background:#141c26;color:#fff;border-radius:16px;padding:22px 24px;box-shadow:0 12px 40px rgba(0,0,0,.5);font-family:\'Segoe UI\',sans-serif"></div>');
        ovw.onclick = function (e) { if (e.target === ovw) ovw.style.display = "none"; };
        element.appendChild(ovw);
        st.over = ovw; st.overCard = ovw.querySelector("#ovw-card");
    }
    function showOverview(st) {
        if (!st.over) return;
        var tiles = (st.halls || []).map(function (h) {
            var col = h.expired > 0 ? "#ff7a7a" : h.tasks > 0 ? "#e0a800" : "#7af0a3", cur = h.idx === st.curHall;
            return '<div data-gohall="' + h.idx + '" style="cursor:pointer;flex:1;min-width:215px;background:#1b2531;border:' + (cur ? "2px solid #3a7bd5" : "1px solid " + (h.expired > 0 ? "rgba(255,122,122,.5)" : "rgba(255,255,255,.1)")) + ';border-radius:12px;padding:15px 16px">'
                + '<div style="display:flex;justify-content:space-between;align-items:center"><div style="font-size:17px;font-weight:700">' + h.name + (cur ? ' <span style="font-size:11px;opacity:.7">· сейчас</span>' : '') + '</div><span style="width:11px;height:11px;border-radius:50%;background:' + col + '"></span></div>'
                + '<div style="margin-top:10px;font-size:13px;line-height:1.75;opacity:.92">'
                + '<div>Заданий на вывоз: <b style="color:#ffd24d">' + h.tasks + '</b></div>'
                + '<div>Просрочено: <b style="color:' + (h.expired ? "#ff8f8f" : "#cfd8e3") + '">' + h.expired + '</b></div>'
                + '<div>Под угрозой: <b>' + fmt(h.risk) + ' ₽</b></div>'
                + '<div>Свободно ячеек: <b>' + h.free + '</b></div></div>'
                + '<div style="margin-top:12px;text-align:right;font-size:13px;color:#7fb1ff">' + (cur ? 'Вы здесь' : 'Открыть зал →') + '</div></div>';
        }).join("");
        st.overCard.innerHTML = (window.miteTr||String)('<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><div style="font-size:18px;font-weight:700">🏢 Обзор складов сети</div><span id="ovw-close" style="cursor:pointer;font-size:13px;background:#2a3543;padding:7px 16px;border-radius:8px">Закрыть</span></div>'
            + '<div style="display:flex;gap:12px;flex-wrap:wrap">' + tiles + '</div>');
        st.over.style.display = "flex";
        var cl = st.overCard.querySelector("#ovw-close"); if (cl) cl.onclick = function () { st.over.style.display = "none"; };
        Array.prototype.forEach.call(st.overCard.querySelectorAll("[data-gohall]"), function (el) { el.onclick = function () { var n = +el.getAttribute("data-gohall"); st.over.style.display = "none"; if (n !== st.curHall && st.controller) st.controller.change({ action: "hall", n: n }); }; });
    }
    function renderHud(st) {
        var s = st.stats, sh = st.shown, h = st.hud; if (!h) return;
        ["prevent", "would", "saved", "scrap", "inc"].forEach(function (k) { sh[k] += (s[k] - sh[k]) * 0.16; });
        h.prevent.textContent = (window.miteTr||String)(fmt(sh.prevent) + " ₽"); h.would.textContent = (window.miteTr||String)(fmt(sh.would) + " ₽");
        if (h.month) h.month.textContent = (window.miteTr||String)(fmt(Math.round(sh.prevent) * 22) + " ₽");
        if (h.risks && st.zones && st.zones.length && !st.risksHover) { var rk = st.zones.map(function (z) { return { z: z, rh: rulHoursWh(z.equip) }; }).sort(function (a, b) { return a.rh - b.rh; }).slice(0, 3); h.risks.innerHTML = (window.miteTr||String)('<div style="font-size:10px;letter-spacing:.4px;text-transform:uppercase;color:#ffd24d;margin-bottom:4px;font-weight:700">🔮 Прогноз · топ-риски (RUL) <span style="opacity:.6;font-weight:400">— клик</span></div>' + rk.map(function (r) { var busy = r.z.equip && (r.z.equip.alarm || r.z.equip.tech); return '<div data-rzone="' + r.z.rackIndex + '" style="cursor:pointer;display:flex;justify-content:space-between;line-height:1.6"><span style="opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px">' + r.z.name + '</span><b style="color:' + rulColor(r.rh, busy) + '">' + (busy ? "сервис" : "~" + rulText(r.rh)) + '</b></div>'; }).join("")); }
        if (h.cf && st.cf) { var cwh = st.cf.woHist, csh = st.cf.withHist; var woN = cwh.length ? cwh[cwh.length - 1] : 0, wiN = csh.length ? csh[csh.length - 1] : 0, cgap = woN - wiN; var cmx = Math.max(woN, 1), cn = cwh.length, CW = 290, CH = 38; var cpts = function (arr) { if (arr.length < 2) return ""; return arr.map(function (v, ii) { return (ii * (CW / (cn - 1))).toFixed(1) + "," + (CH - Math.min(1, v / cmx) * (CH - 4)).toFixed(1); }).join(" "); }; h.cf.innerHTML = (window.miteTr||String)('<svg width="' + CW + '" height="' + CH + '" style="display:block;background:rgba(255,255,255,.05);border-radius:5px"><polyline points="' + cpts(cwh) + '" fill="none" stroke="#ff7a7a" stroke-width="2"/><polyline points="' + cpts(csh) + '" fill="none" stroke="#7af0a3" stroke-width="2"/></svg><div style="font-size:11px;margin-top:5px;color:#ff9b9b">● без датчиков: <b>' + fmt(woN) + ' ₽</b></div><div style="font-size:11px;color:#7af0a3">● с датчиками (факт): <b>' + fmt(wiN) + ' ₽</b></div><div style="font-size:12px;font-weight:700;color:#7af0a3;margin-top:2px">эффект системы: ' + fmt(cgap) + ' ₽</div>'); }
        if (h.eqinv && !h.eqinv._set) { var z0 = st.zones && st.zones[0], et = z0 && z0.equip; if (et) { var src = (et.unit && et.unit.source === "live") ? " · 🟢 датчик " + (et.unit.dev || "") : ""; h.eqinv.innerHTML = (window.miteTr||String)("❄ " + st.zones.length + " холод. агрегата · «" + et.typeName + "» · норма вибр ≤ " + et.vibMax + " · ЗИП " + et.spare + " (из справочника)" + src); h.eqinv._set = true; } }
        h.saved.textContent = (window.miteTr||String)(fmt(sh.saved)); h.scrap.textContent = (window.miteTr||String)(fmt(sh.scrap)); h.inc.textContent = (window.miteTr||String)(fmt(sh.inc));
        var done = s.saved + s.scrap, total = done + s.active, pct = total > 0 ? Math.round(done * 100 / total) : 100;
        h.pct.textContent = (window.miteTr||String)(pct + "% (" + done + "/" + total + ")"); h.bar.style.width = pct + "%";
        if (h.tasks && !st.taskHover) {
            var act = st.taskPool.filter(function (t) { return !t.done; }).slice(0, 3);
            st.shownTasks = act;
            var rdone = st.recentDone.filter(function (d) { return (st.simTime - d.t) < 2.6; }).slice(0, 3);
            var html = act.map(function (t, i) {
                var ic = t.restock ? "📦" : t.incident ? "⚠" : "🛒", c = t.restock ? "#9be7b4" : t.incident ? "#ff8f8f" : "#bcd6ff";
                var txt = t.restock ? "разгрузка → стеллаж" : "R" + (t.orderNum || "?") + " «" + (t.customer || "") + "» · " + (t.sku || "товар");
                return '<div data-ti="' + i + '" style="cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:' + c + '">' + ic + " " + txt + "</div>";
            }).join("");
            html += rdone.map(function (d) { return '<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:' + (d.bad ? "#ff8f8f" : "#7af0a3") + ';text-decoration:line-through;opacity:.72">✓ ' + d.title + '</div>'; }).join("");
            h.tasks.innerHTML = (window.miteTr||String)(html || '<span style="opacity:.5">нет активных заданий — всё выполнено</span>');
            Array.prototype.forEach.call(h.tasks.querySelectorAll("[data-ti]"), function (el) { el.onclick = function () { showTaskDetail(st, st.shownTasks[+el.getAttribute("data-ti")]); }; });
        }
        if (h.erp) {
            var e = st.erp;
            function stg(l, n, c) { return '<span style="opacity:.75">' + l + ' <b style="color:' + (c || "#fff") + '">' + n + '</b></span>'; }
            var arr = '<span style="opacity:.35">›</span>';
            h.erp.innerHTML = (window.miteTr||String)(stg("Приход", e.inbound) + arr + stg("Разгрузка", e.unloaded) + arr + stg("Заявки", e.orders, "#ffd24d") + arr + stg("Подгрузка", e.dispatched, "#7af0a3") + '<span style="opacity:.5;margin-left:2px">· ♻<b style="color:#9bd1ff"> ' + st.routeRecalcs + '</b></span>');
        }
    }
    // событие в журнал: feed(st, title, color, detail, key) — одинаковые по key склеиваются (×N)
    function feed(st, title, color, detail, key) {
        var q = st.eventQueue, last = q[q.length - 1];
        if (key && last && last.key === key) { last.n = (last.n || 1) + 1; last.title = title; if (detail) last.detail = detail; return; }
        q.push({ title: title, detail: detail || title, color: color || "#9fb4c8", key: key || ("k" + (++st.evId)), n: 1 });
        if (q.length > 30) q.shift();
    }
    // спокойная подача: один пункт примерно раз в 1.1 с — успеть прочитать/кликнуть
    function drainEvents(st, dt) {
        st.feedDrain += dt;
        if (st.feedDrain >= 1.1 && st.eventQueue.length) {
            st.feedDrain = 0;
            var e = st.eventQueue.shift(); e.id = ++st.evId;
            st.events.unshift(e); if (st.events.length > 40) st.events.pop();
            renderJournal(st);
        }
    }
    function updateLegend(st) {
        if (!st.legend) return;
        var sets = {
            temp: [["#3a7bd5", "холод ок"], ["#2f9e6e", "норма"], ["#e0a800", "близко"], ["#d23b3b", "нарушение"]],
            hum: [["#2f8fd0", "норма"], ["#e0a800", "отклонение"], ["#d23b3b", "сильное"]],
            eth: [["#2f9e6e", "низкий"], ["#e0a800", "растёт"], ["#d23b3b", "высокий"], ["#9aa3ad", "нет датчика"]],
            exp: [["#2f9e6e", "свежее"], ["#e0a800", "≤3 дн"], ["#d23b3b", "просрочено"]],
            equip: [["#2f9e6e", "ок"], ["#e0a800", "износ"], ["#d23b3b", "аларм"]]
        };
        var arr = sets[st.layer] || sets.temp;
        st.legend.innerHTML = (window.miteTr||String)(arr.map(function (a) { return '<span style="display:inline-flex;align-items:center;gap:4px"><span style="width:11px;height:11px;border-radius:3px;background:' + a[0] + '"></span>' + a[1] + '</span>'; }).join(""));
    }
    function renderNav(st) {
        if (!st.nav) return;
        var h = '<span data-overview="1" style="cursor:pointer;opacity:.9;padding:3px 8px;border-radius:6px;background:rgba(255,255,255,.06)">🏢 Склад · обзор</span><span style="opacity:.35">›</span>';
        (st.halls || []).forEach(function (hl) {
            var act = hl.idx === st.curHall;
            h += '<span data-hall="' + hl.idx + '" style="cursor:pointer;padding:3px 9px;border-radius:6px;background:' + (act ? "#3a7bd5" : "rgba(255,255,255,.05)") + ';color:' + (act ? "#fff" : "#cfd8e3") + '">' + hl.name + '</span>';
        });
        if (st.zones && st.zones.length) {
            h += '<span style="opacity:.35">›</span>';
            if (st.room) {
                h += '<span style="padding:3px 9px;border-radius:6px;background:#27b083;color:#fff">Комната ' + (st.room.rk ? st.room.rk.name : "") + " · " + st.room.theme.name + '</span>';
                h += '<span data-back="1" style="cursor:pointer;margin-left:8px;padding:5px 14px;border-radius:7px;background:#3a7bd5;color:#fff;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.3)">← Выйти из комнаты</span>';
            } else {
                h += '<span style="opacity:.55">комнаты:</span>';
                st.zones.forEach(function (z) { h += '<span data-room="' + z.rackIndex + '" style="cursor:pointer;padding:3px 9px;border-radius:6px;background:rgba(255,255,255,.06)">' + (z.rk ? z.rk.name : z.rackIndex) + '</span>'; });
            }
        }
        st.nav.innerHTML = (window.miteTr||String)(h);
        Array.prototype.forEach.call(st.nav.querySelectorAll("[data-hall]"), function (el) { el.onclick = function () { var n = +el.getAttribute("data-hall"); if (n !== st.curHall && st.controller) st.controller.change({ action: "hall", n: n }); }; });
        Array.prototype.forEach.call(st.nav.querySelectorAll("[data-room]"), function (el) { el.onclick = function () { var z = st.zones.filter(function (q) { return q.rackIndex === +el.getAttribute("data-room"); })[0]; if (z) enterRoom(st, z); }; });
        var bk = st.nav.querySelector("[data-back]"); if (bk) bk.onclick = function () { exitRoom(st); };
        var ovb = st.nav.querySelector("[data-overview]"); if (ovb) ovb.onclick = function () { showOverview(st); };
    }
    function setRoomFocus(st, zone) {
        st.cells.forEach(function (c) {
            var inR = !zone || c.zone === zone, op = inR ? 1 : 0.1;
            if (c.load) { c.load.material.transparent = !inR; c.load.material.opacity = op; }
            if (c.pal) { c.pal.material.transparent = !inR; c.pal.material.opacity = op; }
            if (c.edge) c.edge.visible = inR;
            if (c.cone) c.cone.visible = inR;
        });
        st.zones.forEach(function (z) { if (z.label) z.label.sprite.material.opacity = (!zone || z === zone) ? 1 : 0.15; });
    }
    function enterRoom(st, zone) {
        st.room = zone; var rk = zone.rk;
        if (rk) { st.orbit.target.set(rk.px + rk.cols * CW / 2, 24, rk.pz + CD / 2); st.orbit.radius = rk.cols * CW * 1.35 + 95; st.applyCamera(); }
        setRoomFocus(st, zone); renderNav(st);
    }
    function exitRoom(st) {
        st.room = null;
        st.orbit.target.set(st.floorW / 2, 26, st.floorD / 2); st.orbit.radius = Math.max(st.floorW, st.floorD) * 1.5 + 110; st.applyCamera();
        setRoomFocus(st, null); renderNav(st);
    }
    function renderJournal(st) {
        if (!st.journal || st.journalHover) return;
        st.journal.innerHTML = (window.miteTr||String)(st.events.slice(0, 5).map(function (ev) {
            return '<div data-ev="' + ev.id + '" style="cursor:pointer;background:rgba(18,26,36,0.92);border-left:3px solid ' + ev.color + ';border-radius:6px;padding:7px 10px;margin-bottom:5px;font-size:12px;color:#e7edf3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 8px rgba(0,0,0,.3)">' + ev.title + (ev.n > 1 ? ' <b style="color:#ffd24d">×' + ev.n + '</b>' : '') + '</div>';
        }).join(""));
        Array.prototype.forEach.call(st.journal.querySelectorAll("[data-ev]"), function (el) {
            el.onclick = function () { showEvent(st, +el.getAttribute("data-ev")); };
        });
    }
    function stepsHtml(steps) {
        steps = steps.filter(Boolean);
        return steps.map(function (s, i) {
            var col = s.s === "done" ? "#2fb56a" : s.s === "active" ? "#e8a400" : "#aeb6c2";
            var ic = s.s === "done" ? "✓" : s.s === "active" ? "●" : "";
            var line = i < steps.length - 1 ? '<div style="position:absolute;left:11px;top:25px;bottom:-3px;width:2px;background:#e6e9ef"></div>' : '';
            return '<div style="position:relative;padding:0 0 17px 34px">' + line
                + '<div style="position:absolute;left:0;top:0;width:23px;height:23px;border-radius:50%;background:' + col + ';color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center">' + ic + '</div>'
                + '<div style="font-size:15px;font-weight:600;color:#16202e;line-height:1.3">' + s.t + '</div>'
                + (s.sub ? '<div style="font-size:13px;color:#6b7686;margin-top:2px;line-height:1.4">' + s.sub + '</div>' : '')
                + '</div>';
        }).join("");
    }
    function showDetailOverlay(st, title, color, html) {
        if (!st.overlay) return;
        st.overlayCard.innerHTML =
            (window.miteTr||String)('<div style="display:flex;align-items:center;gap:11px;margin-bottom:18px">'
            + '<div style="width:6px;height:32px;border-radius:3px;background:' + (color || "#9fb4c8") + '"></div>'
            + '<div style="font-size:20px;font-weight:700;color:#0f141c;letter-spacing:-.2px">' + title + '</div></div>'
            + html
            + '<div style="text-align:right;margin-top:12px"><span id="ov-close" style="cursor:pointer;font-size:14px;font-weight:600;background:#eef1f5;color:#2a3543;padding:9px 22px;border-radius:11px">Закрыть</span></div>');
        st.overlay.style.display = "flex";
        var c = st.overlayCard.querySelector("#ov-close"); if (c) c.onclick = function () { st.overlay.style.display = "none"; };
    }
    function showEvent(st, id) { var ev = st.events.filter(function (e) { return e.id === id; })[0]; if (ev) showDetailOverlay(st, ev.title, ev.color, ev.detail); }
    function showTaskDetail(st, t) {
        if (!t) return;
        if (t.restock) { showDetailOverlay(st, "Разгрузка фуры", "#2fb56a", stepsHtml([{ t: "Фура прибыла на приёмку", s: "done" }, { t: "Паллета снята с машины", s: "done" }, { t: "Размещение на стеллаже", s: "active" }])); return; }
        var low = (t.qty || 99) <= 12;
        var steps = [
            { t: "Заявка на склад поступила", s: "done", sub: "R" + (t.orderNum || "?") + " «" + (t.customer || "") + "»" },
            { t: "Проверка остатка: в наличии " + (t.qty || "?") + " шт", s: "done" },
            low ? { t: "Заказ на пополнение сформирован", s: "done", sub: "остаток низкий — заявка поставщику" } : null,
            { t: "Паллета выписана (подбор по FEFO)", s: "done", sub: (t.sku || "товар") + " · " + fmt(t.value || 0) + " ₽" },
            { t: t.incident ? "Срочный вывоз — " + (t.reason || "риск порчи") : "Погрузчик везёт на отгрузку", s: "active" },
            { t: t.incident ? "Перемещение в рабочую зону / отгрузка раньше срока" : "Отгрузка клиенту", s: "wait" }
        ];
        showDetailOverlay(st, (t.incident ? "Срочный вывоз" : "Заказ") + " R" + (t.orderNum || "?"), t.incident ? "#e24b4a" : "#3a7bd5", stepsHtml(steps));
    }
    function showCriticalDetail(st, id) {
        var c = st.critical.filter(function (x) { return x.id === id; })[0]; if (!c) return;
        var status = c.status === "active" ? "идёт уже <b>" + dur(st.simTime - c.tDetect) + "</b>"
            : c.status === "loss" ? "<b style='color:#ff7a7a'>потеря " + c.lost + " паллет</b> за " + dur(c.tResolve - c.tDetect)
                : "<b style='color:#7af0a3'>решено за " + dur(c.tResolve - c.tDetect) + "</b>";
        var sc = c.scenario, resolved = c.tResolve != null, lossN = c.lost;
        var steps = [
            { t: "Датчик зафиксировал отклонение", s: "done", sub: c.head + (sc ? " · " + sc.root : "") },
            { t: "Создано срочное задание, маршруты пересчитаны", s: "done" },
            { t: "Товар перемещён в рабочую зону / отгружен раньше срока", s: lossN ? "wait" : "done", sub: lossN ? "часть не успели — " + lossN + " паллет списано" : "терморежим сохранён" },
            { t: "Вызван техник", s: "done", sub: "SLA реакции ~2 ч" },
            { t: resolved ? "Техник прибыл и устранил" : "Техник в пути", s: resolved ? "done" : "active", sub: sc ? sc.repair + (sc.risk ? " · риск «" + sc.risk + "» предотвращён" : "") : "" },
            sc && sc.mat && sc.mat.length ? { t: c.buyMat ? "Заказ на пополнение материалов сформирован" : "Материалы списаны со склада", s: resolved ? "done" : "wait", sub: sc.mat[0] + " " + sc.mat[1] + " шт" + (c.buyMat ? " — нет на складе, заявка поставщику" : "") } : null,
            { t: resolved ? "Терморежим восстановлен — инцидент закрыт" : "Восстановление режима", s: resolved ? "done" : "wait", sub: resolved ? "решено за " + dur(c.tResolve - c.tDetect) : "идёт " + dur(st.simTime - c.tDetect) }
        ];
        var earlyMin = 15 + (c.id % 16);
        var benefit = lossN
            ? "Датчик дал сигнал за ~" + earlyMin + " мин до критического порога — бо́льшую часть товара успели вывезти до порчи (не успели только " + lossN + " паллет)."
            : "Датчик дал сигнал за ~" + earlyMin + " мин до критического порога — этого времени хватило переназначить погрузчик и вывезти всю партию <b>до</b> порчи. Списания нет.";
        var benefitHtml = '<div style="margin-top:10px;padding:9px 11px;background:#eafaf0;border:1px solid #bfe8cf;border-radius:8px;font-size:14px;color:#15692f"><b>💰 Выгода раннего обнаружения:</b> ' + benefit + '</div>';
        showDetailOverlay(st, c.head + " — зона " + c.zone, c.color, stepsHtml(steps) + benefitHtml);
    }
    function showCellDetail(st, cell) {
        if (!cell) return;
        var addr = cell.code || "—", zn = cell.zone ? cell.zone.name : "—";
        if (!cell.occ && !cell.load) { showDetailOverlay(st, "📦 Ячейка " + addr, "#9aa3ad", "Ячейка <b>" + addr + "</b> · зона " + zn + "<br>Статус: <b>свободна</b> — товара нет."); return; }
        var dl = cell.daysLeft;
        var srok = (dl != null && !isNaN(dl)) ? (dl < 0 ? "<b style='color:#ff7a7a'>просрочено на " + (-dl) + " дн</b>" : dl <= 3 ? "<b style='color:#e0a800'>истекает — осталось " + dl + " дн</b>" : "осталось " + dl + " дн") : "—";
        var batch = "ПТ-" + (10000 + cell.num);
        var status = cell.done ? "<b style='color:#7af0a3'>отгружено</b>"
            : cell.incident ? "<b style='color:#ff7a7a'>срочный вывоз</b> — " + (cell.reason || "риск порчи")
                : cell.isTask ? "<b style='color:#9fc2f0'>заказан, готовится к отгрузке</b>"
                    : "на хранении";
        var ship = cell.incident ? "сегодня, раньше срока (заказ R" + (cell.orderNum || "?") + ")"
            : cell.isTask ? "сегодня (заказ R" + (cell.orderNum || "?") + " «" + (cell.customer || "") + "»)"
                : (dl != null && dl <= 3 ? "в ближайшие дни (по FEFO)" : "по заявке магазина");
        var temp = cell.zone ? (cell.zone.temp >= 0 ? "+" : "") + t1(cell.zone.temp) + "°C (норма ≤" + (cell.zone.theme.tMax > 0 ? "+" : "") + cell.zone.theme.tMax + ")" : "—";
        var html = "Адрес: <b>" + addr + "</b> · зона " + zn
            + "<br>Товар: <b>" + (cell.sku || "—") + "</b> · " + (cell.qty || "?") + " шт · " + fmt(cell.value) + " ₽"
            + "<br>Партия: " + batch
            + "<br>Годен до: " + (cell.expiry || "—") + " · " + srok
            + "<br>Температура зоны: " + temp
            + "<br>Статус: " + status
            + "<br>Отгрузка: " + ship;
        showDetailOverlay(st, "📦 Ячейка " + addr + " — " + (cell.sku || "товар"), cell.incident ? "#ff7a7a" : cell.isTask ? "#9fc2f0" : "#9be7b4", html);
    }
    // ---- прогноз по агрегату зоны (клик по топ-риску): почему «в риске», хотя сейчас зелено ----
    function showZoneForecast(st, zone) {
        var eq = zone && zone.equip; if (!eq) return;
        var rh = rulHoursWh(eq), busy = eq.alarm || eq.tech;
        var stateTxt = busy ? (eq.tech ? "идёт сервис" : "сервис вызван") : eq.degrading ? "ранний износ — под наблюдением" : "в норме";
        var color = busy ? "#e24b4a" : eq.degrading ? "#e8a400" : "#2fb56a";
        var rows = [
            ["Состояние агрегата", stateTxt],
            ["Вибрация", t1(eq.vib) + " мм/с (норма ≤ " + eq.vibMax + ")"],
            ["Эффективность охлаждения", Math.round(eq.eff) + " %"],
            ["t° зоны / норма", (zone.temp >= 0 ? "+" : "") + t1(zone.temp) + "° / ≤ " + (zone.theme.tMax > 0 ? "+" : "") + zone.theme.tMax + "°"],
            ["Прогноз отказа (RUL)", busy ? "в обслуживании" : "через ~" + rulText(rh)],
            ["ЗИП", (eq.spare || "—") + " — " + eq.spareQty + " шт"]
        ];
        var rec = busy ? "Сервис на месте — терморежим восстанавливается." :
            rh < 2 ? "🔴 Критично: вызвать сервис, замена в ближайшее окно." :
                rh < 6 ? "🟡 Под наблюдением: запланировать ТО, проверить ЗИП." :
                    "🟢 Сейчас всё в норме — это <b>прогноз</b>: отказ ожидается через ~" + rulText(rh) + ". Система вызовет сервис заранее, до роста t° и порчи товара.";
        var html = '<table style="width:100%;border-collapse:collapse;font-size:14px">' + rows.map(function (r) { return '<tr><td style="padding:6px 0;color:#6b7686">' + r[0] + '</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#16202e">' + r[1] + '</td></tr>'; }).join("") + '</table>'
            + '<div style="margin-top:10px;padding:9px 11px;background:#f2f6fb;border:1px solid #dce4ee;border-radius:8px;font-size:13px;color:#2a3543"><b>Прогноз системы:</b> ' + rec + '</div>';
        showDetailOverlay(st, "❄ Агрегат зоны «" + ((zone.name.split("«")[1] || "").replace("»", "")) + "»", color, html);
    }
    // ---- разбор «откуда экономия» по клику на блок предотвращённых потерь ----
    function showWhBenefitDetail(st) {
        var s = st.stats, saved = Math.round(s.saved || 0), prevent = Math.round(s.prevent || 0), scrap = Math.round(s.scrap || 0), would = Math.round(s.would || 0);
        var avg = saved > 0 ? Math.round(prevent / saved) : 0;
        function r(n, v, sub) { return '<tr><td style="padding:9px 0;border-bottom:1px solid #eef1f5"><div style="font-weight:600;color:#16202e">' + n + '</div><div style="font-size:12px;color:#6b7686">' + sub + '</div></td><td style="padding:9px 0;border-bottom:1px solid #eef1f5;text-align:right;font-weight:700;color:#15692f;white-space:nowrap">' + v + '</td></tr>'; }
        var html =
            '<div style="font-size:14px;color:#2a3543;margin-bottom:12px">Ценность датчика — <b>время реакции</b>: отклонение t°/влажности он фиксирует <b>за минуту</b> — задолго до порога порчи. Этого запаса хватает, чтобы переназначить погрузчик и вывезти партию <b>до</b> порчи.</div>'
            + '<table style="width:100%;border-collapse:collapse;font-size:14px">'
            + r("Партий вывезено / отгружено до порчи", saved + " шт", "погрузчик переназначен по сигналу датчика")
            + r("Стоимость сохранённого товара", fmt(prevent) + " ₽", "складские цены партий, ≈ " + fmt(avg) + " ₽ за паллету")
            + r("Не успели (на грани сроков)", scrap + " шт", "резерв для улучшения процесса")
            + '</table>'
            + '<div style="display:flex;justify-content:space-between;margin-top:11px;font-size:16px"><span style="font-weight:700;color:#16202e">Предотвращённый убыток за смену</span><b style="color:#15692f">' + fmt(prevent) + ' ₽</b></div>'
            + '<div style="font-size:13px;color:#6b7686;margin-top:4px">Без мониторинга то же отклонение заметили бы постфактум — товар уже испорчен: убыток составил бы <b>' + fmt(would) + ' ₽</b>.</div>'
            + '<div style="margin-top:12px;font-size:11px;color:#9aa3ad">Расчёт по ценам и остаткам из ERP.</div>';
        showDetailOverlay(st, "🛡 Эффект мониторинга · смена", "#2fb56a", html);
    }
    // ---- критические события дня (что / кто / за сколько решили + причина) ----
    function addCritical(st, rec) {
        st.critId += 1;
        var c = { id: st.critId, head: rec.head, zone: rec.zone, cause: rec.cause || "", color: rec.color || "#ff7a7a", tDetect: st.simTime, tResolve: null, status: "active", lost: 0, scenario: rec.scenario || null, buyMat: false };
        st.critical.unshift(c); if (st.critical.length > 60) st.critical.pop();
        renderCritical(st); return c;
    }
    function resolveCritical(st, c) { if (!c || c.tResolve != null) return; c.tResolve = st.simTime; c.status = c.lost > 0 ? "loss" : "resolved"; renderCritical(st); }
    function renderCritical(st) {
        if (!st.crit || st.critHover) return;
        var list = st.critical, resolved = list.filter(function (c) { return c.tResolve != null && c.status === "resolved"; });
        var avg = resolved.length ? Math.round(resolved.reduce(function (s, c) { return s + (c.tResolve - c.tDetect); }, 0) / resolved.length) : 0;
        var byZone = {}; list.forEach(function (c) { byZone[c.zone] = (byZone[c.zone] || 0) + 1; });
        var worst = "—", wn = 0; Object.keys(byZone).forEach(function (z) { if (byZone[z] > wn) { wn = byZone[z]; worst = z; } });
        st.crit.sum.innerHTML = (window.miteTr||String)("Событий: <b>" + list.length + "</b> · ср. реакция: <b>" + avg + " с</b> · чаще ломалась: <b style=\"color:#ffce4a\">зона " + worst + "</b>"
            + '<br>Предотвращено: <b style="color:#7af0a3">' + fmt(st.stats.prevent) + " ₽</b> · в утиль: <b style=\"color:#ff9b9b\">" + st.stats.scrap + " паллет</b>");
        st.crit.list.innerHTML = (window.miteTr||String)(list.slice(0, 5).map(function (c) {
            var s2 = c.status === "active" ? '<span style="color:#ffce4a">● идёт ' + dur(st.simTime - c.tDetect) + '</span>'
                : c.status === "loss" ? '<span style="color:#ff7a7a">⛔ потеря — ' + c.lost + ' паллет за ' + dur(c.tResolve - c.tDetect) + '</span>'
                    : '<span style="color:#7af0a3">✓ решено за ' + dur(c.tResolve - c.tDetect) + '</span>';
            return '<div data-crit="' + c.id + '" style="cursor:pointer;border-left:3px solid ' + c.color + ';padding:5px 9px;margin-bottom:5px;background:rgba(255,255,255,.05);border-radius:5px"><div>Зона <b>' + c.zone + '</b>: ' + c.head + '</div><div style="font-size:11px;opacity:.82">' + (c.cause ? c.cause + ' · ' : '') + s2 + '</div></div>';
        }).join(""));
        Array.prototype.forEach.call(st.crit.list.querySelectorAll("[data-crit]"), function (el) { el.onclick = function () { showCriticalDetail(st, +el.getAttribute("data-crit")); }; });
    }
    function renderTimeline(st) {
        if (!st.tl || st.tlHover) return;
        var span = Math.max(45, st.simTime);
        var mins = 8 * 60 + Math.round(st.simTime * TSCALE);
        st.tl.clock.textContent = (window.miteTr||String)(("0" + (Math.floor(mins / 60) % 24)).slice(-2) + ":" + ("0" + (mins % 60)).slice(-2));
        st.tl.track.innerHTML = (window.miteTr||String)(st.critical.map(function (c) {
            var x = Math.min(99, (c.tDetect / span) * 100);
            var col = c.status === "resolved" ? "#7af0a3" : c.status === "loss" ? "#ff7a7a" : c.color;
            return '<div data-crit="' + c.id + '" style="position:absolute;left:' + x.toFixed(1) + '%;top:2px;width:8px;height:12px;margin-left:-4px;border-radius:2px;background:' + col + ';cursor:pointer"></div>';
        }).join("") + '<div style="position:absolute;right:0;top:0;width:2px;height:16px;background:#fff;opacity:.5"></div>');
        Array.prototype.forEach.call(st.tl.track.querySelectorAll("[data-crit]"), function (el) { el.onclick = function () { showCriticalDetail(st, +el.getAttribute("data-crit")); }; });
    }
    // ---- звук ----
    function toggleSound(st, btn) {
        st.soundOn = !st.soundOn;
        if (st.soundOn && !st.audio) { try { st.audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { st.audio = null; } }
        if (st.audio && st.audio.state === "suspended") st.audio.resume();
        btn.textContent = (window.miteTr||String)(st.soundOn ? "🔊 Звук: вкл" : "🔊 Звук: выкл");
        btn.style.color = st.soundOn ? "#7af0a3" : "#cfd8e3";
        if (st.soundOn) beep(st, 760, 0.08, 0.05);
    }
    function beep(st, freq, dur, vol) {
        if (!st.soundOn || !st.audio) return;
        try {
            var t = st.audio.currentTime, o = st.audio.createOscillator(), g = st.audio.createGain();
            o.frequency.value = freq; o.type = "sine"; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(g); g.connect(st.audio.destination); o.start(t); o.stop(t + dur + 0.02);
        } catch (e) { }
    }

    function killDevTooltips() { if (window.__lsfTipKilled) return; window.__lsfTipKilled = true; try { var s = document.createElement("style"); s.textContent = (window.miteTr||String)("[data-tippy-root]:has(.lsf-tooltip-path),.tippy-box:has(.lsf-tooltip-path){display:none!important;}"); document.head.appendChild(s); } catch (e) { } }
    function build(element) {
        killDevTooltips();
        var THREE = window.THREE;
        var scene = new THREE.Scene(); scene.background = new THREE.Color(0xeef1f5);
        var camera = new THREE.PerspectiveCamera(45, 1, 1, 9000);
        var renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        element.appendChild(renderer.domElement);
        renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
        scene.add(new THREE.AmbientLight(0xffffff, 0.78));
        var d1 = new THREE.DirectionalLight(0xffffff, 0.55); d1.position.set(0.6, 1, 0.4); scene.add(d1);
        var d2 = new THREE.DirectionalLight(0xffffff, 0.2); d2.position.set(-0.5, 0.5, -0.6); scene.add(d2);
        var world = new THREE.Group(); scene.add(world);
        var orbit = { target: new THREE.Vector3(), radius: 420, theta: -0.62, phi: 0.62 };
        var st = {
            THREE: THREE, camera: camera, renderer: renderer, scene: scene, world: world, orbit: orbit,
            raycast: [], anim: [], forklifts: [], cells: [], gates: [], zones: [], taskPool: [],
            layer: "temp", labelClock: 0, recolorClock: 0, orderClock: 0, orderEvery: 6, excClock: 0, excEvery: 7,
            trucks: [], racksArr: [], truckClock: 5, truckEvery: 13,
            erp: { inbound: 0, unloaded: 0, orders: 0, dispatched: 0 },
            events: [], evId: 0, audio: null, soundOn: false, routeRecalcs: 0, tickT: 0,
            orderNum: 20, palletSeq: 0, eventQueue: [], feedDrain: 0,
            simTime: 0, critical: [], critId: 0, recentDone: [], timeScale: 1.0, tlClock: 0,
            journalHover: false, critHover: false, taskHover: false, tlHover: false,
            stats: { prevent: 0, would: 0, saved: 0, scrap: 0, inc: 0, active: 0 },
            shown: { prevent: 0, would: 0, saved: 0, scrap: 0, inc: 0 }, feedLines: []
        };
        element.__wh = st;
        buildHud(element, st);
        // прямой доступ для демо-харнесса (не зависит от локализации/проекции)
        st.showEffect = function () { showWhBenefitDetail(st); };
        st.showOverlay = function (title, color, html) { showDetailOverlay(st, title, color, html); };
        st.showCellDemo = function () { var c = (st.cells || []).filter(function (x) { return x.incident; })[0] || (st.cells || []).filter(function (x) { return x.isTask; })[0] || (st.cells || []).filter(function (x) { return x.sku; }).sort(function (a, b) { return (a.expDays == null ? 999 : a.expDays) - (b.expDays == null ? 999 : b.expDays); })[0] || (st.cells || [])[0]; if (c) showCellDetail(st, c); return c; };
        st.showZoneDemo = function () { if (!st.zones || !st.zones.length) return null; var z = st.zones.slice().sort(function (a, b) { return rulHoursWh(a.equip) - rulHoursWh(b.equip); })[0]; if (z) { enterRoom(st, z); showZoneForecast(st, z); } return z; };
        // не пускаем клики в lsFusion (иначе всплывает dev-подсказка «Canonical name…» по свойству)
        ["mousedown", "click", "dblclick", "contextmenu"].forEach(function (ev) { element.addEventListener(ev, function (e) { e.stopPropagation(); }); });
        st.setLayer = function (name) {
            st.layer = name;
            Object.keys(st.layerBtns).forEach(function (k) {
                st.layerBtns[k].style.background = (k === name) ? "#3a7bd5" : "transparent";
                st.layerBtns[k].style.color = (k === name) ? "#fff" : "#cfd8e3";
            });
            recolorAll(st); updateZoneLabels(st, true); updateLegend(st);
        };

        st.applyCamera = function () {
            var o = orbit, r = o.radius, s = Math.sin(o.phi), cp = Math.cos(o.phi);
            camera.position.set(o.target.x + r * s * Math.cos(o.theta), o.target.y + r * cp, o.target.z + r * s * Math.sin(o.theta));
            camera.lookAt(o.target);
        };
        st.resize = function () { var w = element.clientWidth || 800, h = element.clientHeight || 560; if (h < 60 || h > 1600) h = 560; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
        if (window.ResizeObserver) { st.ro = new ResizeObserver(st.resize); st.ro.observe(element); }

        var drag = null;
        renderer.domElement.addEventListener("mousedown", function (e) { drag = { x: e.clientX, y: e.clientY, t: orbit.theta, p: orbit.phi, moved: false }; });
        window.addEventListener("mousemove", function (e) { if (!drag) return; var dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; orbit.theta = drag.t - dx * 0.006; orbit.phi = Math.max(0.18, Math.min(1.45, drag.p - dy * 0.006)); });
        window.addEventListener("mouseup", function (e) { if (drag && !drag.moved) pick(e); drag = null; });
        renderer.domElement.addEventListener("wheel", function (e) { e.preventDefault(); orbit.radius = Math.max(70, Math.min(3200, orbit.radius * (1 + (e.deltaY > 0 ? 0.1 : -0.1)))); }, { passive: false });

        var ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
        st.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        function pick(e) {
            var rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1; mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            ray.setFromCamera(mouse, camera);
            // КОНСТРУКТОР: режим размещения — клик по полу создаёт элемент в этой точке
            if (st.placeMode) {
                var pt = new THREE.Vector3();
                if (ray.ray.intersectPlane(st.floorPlane, pt) && st.controller) {
                    st.controller.change({ action: "place", etype: st.placeMode, object: (st.placeNameInp && st.placeNameInp.value) || "", px: Math.round(pt.x), pz: Math.round(pt.z) });
                    if (st.placeNameInp) st.placeNameInp.value = "";
                }
                return;
            }
            var hit = ray.intersectObjects(st.raycast, false)[0];
            // клик по размещённому элементу → панель привязки (шаг 3)
            if (hit && hit.object.userData.placedIx != null) {
                if (st.showPlacedDetail) st.showPlacedDetail(st, hit.object.userData.placedIx, hit.object.userData.placedName);
                return;
            }
            if (hit && hit.object.userData.num != null) {
                var cell = st.cells.filter(function (c) { return c.num === hit.object.userData.num; })[0];
                if (cell) showCellDetail(st, cell);
            }
        }

        function pnow() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
        (function loop() {
            st.raf = requestAnimationFrame(loop);
            var t = pnow() / 1000;
            st.anim.forEach(function (f) { f(t); });
            renderHud(st);
            st.applyCamera(); renderer.render(scene, camera);
        })();
        if (st.sim) clearInterval(st.sim);
        var lastSim = pnow();
        st.sim = setInterval(function () {
            var now = pnow(), dt = Math.min(0.2, (now - lastSim) / 1000); lastSim = now;
            simulate(st, dt);
        }, 50);
        st.resize();
    }

    function addRack(st, rk) {
        var THREE = st.THREE, hgt = rk.levels * CH, ax = rk.orient === 0, sx = ax ? rk.cols * CW : CD, sz = ax ? CD : rk.cols * CW;
        var fm = new THREE.MeshLambertMaterial({ color: 0x5b6470 });
        [[0, 0], [sx, 0], [0, sz], [sx, sz]].forEach(function (c) { var up = new THREE.Mesh(new THREE.BoxGeometry(3, hgt, 3), fm); up.position.set(rk.px + c[0], hgt / 2, rk.pz + c[1]); st.world.add(up); });
        for (var l = 0; l <= rk.levels; l++) { var b = mk(THREE, new THREE.BoxGeometry(sx, 1.5, sz), 0x8a929c); b.position.set(rk.px + sx / 2, l * CH, rk.pz + sz / 2); st.world.add(b); }
        if (rk.name) { var sp = rackLabel(THREE, rk.name); sp.position.set(rk.px + (ax ? -6 : sx / 2), hgt + 26, rk.pz + (ax ? sz / 2 : -6)); st.world.add(sp); }
    }

    function cellPos(rk, col, level) {
        var ax = rk.orient === 0;
        return { x: rk.px + (ax ? col * CW + CW / 2 : CD / 2), z: rk.pz + (ax ? CD / 2 : col * CW + CW / 2), y: level * CH + CH / 2, w: ax ? CW - 3 : CD - 5, d: ax ? CD - 5 : CW - 3 };
    }
    function cellFront(rk, col) {
        var ax = rk.orient === 0;
        return ax ? { x: rk.px + col * CW + CW / 2, z: rk.pz + CD + 14 } : { x: rk.px + CD + 14, z: rk.pz + col * CW + CW / 2 };
    }

    function addCell(st, rk, rec, zone) {
        var THREE = st.THREE, col = +rec[2], level = +rec[3], num = +rec[5], occ = +rec[6] === 1;
        var p = cellPos(rk, col, level);
        var cell = {
            num: num, rk: rk, col: col, level: level, occ: occ, zone: zone, isTask: false, incident: false, done: false,
            daysLeft: parseInt(rec[9], 10), sku: rec[12] || "", store: rec[13] || "", value: +rec[14] || 0,
            expiry: rec[15] || "", qty: +rec[16] || 0, code: rec[17] || (rk.name + "-" + (col + 1) + "-" + (level + 1)),
            front: cellFront(rk, col), load: null, edge: null, cone: null, anim: null, spoilT: 0
        };
        if (!occ) {
            var hit = new THREE.Mesh(new THREE.BoxGeometry(p.w, CH - 6, p.d), new THREE.MeshBasicMaterial({ visible: false }));
            hit.position.set(p.x, p.y, p.z); hit.userData.num = num; st.world.add(hit); st.raycast.push(hit);
            st.cells.push(cell); return cell;
        }
        var by = level * CH + 2;
        var pal = mk(THREE, new THREE.BoxGeometry(p.w * 0.94, 4, p.d * 0.94), 0xb07d4b); pal.position.set(p.x, by + 2, p.z); st.world.add(pal);
        var lh = CH - 12, load = mk(THREE, new THREE.BoxGeometry(p.w * 0.82, lh, p.d * 0.82), 0x3a7bd5);
        load.position.set(p.x, by + 4 + lh / 2, p.z); load.userData.num = num; st.world.add(load); st.raycast.push(load);
        var ed = new THREE.LineSegments(new THREE.EdgesGeometry(load.geometry), new THREE.LineBasicMaterial({ color: 0x33404d, transparent: true, opacity: 0.35 })); ed.position.copy(load.position); st.world.add(ed);
        cell.pal = pal; cell.load = load; cell.edge = ed; cell.cx = p.x; cell.cz = p.z; cell.lh = lh;
        zone.cells.push(cell);
        st.cells.push(cell);
        return cell;
    }

    // ----- цвет ячейки по активному слою -----
    function lerpColor(a, b, t) {
        var ar = a >> 16 & 255, ag = a >> 8 & 255, ab = a & 255, br = b >> 16 & 255, bg = b >> 8 & 255, bb = b & 255;
        return ((ar + (br - ar) * t) << 16) | ((ag + (bg - ag) * t) << 8) | (ab + (bb - ab) * t);
    }
    function layerColor(st, cell) {
        var z = cell.zone;
        if (cell.incident) return 0xd23b3b;
        if (st.layer === "temp") {
            var over = z.temp - z.theme.tMax; // >0 = нарушение
            if (over >= 0) return 0xd23b3b;
            if (over > -2) return 0xe0a800;
            return z.theme.key === "frozen" ? 0x4aa3ff : 0x2f9e6e;
        }
        if (st.layer === "hum") {
            var dh = Math.abs(z.humidity - z.theme.hum);
            if (dh > 12) return 0xd23b3b; if (dh > 7) return 0xe0a800; return 0x2f8fd0;
        }
        if (st.layer === "eth") {
            if (!z.theme.eth) return 0x9aa3ad; // нет этиленовых датчиков
            if (z.ethylene > 1.0) return 0xd23b3b; if (z.ethylene > 0.6) return 0xe0a800; return 0x2f9e6e;
        }
        if (st.layer === "equip") {
            var eq = z.equip; if (!eq) return 0x9aa3ad;
            if (eq.alarm) return 0xd23b3b; if (eq.degrading || eq.eff < 90) return 0xe0a800; return 0x2f9e6e;
        }
        // срок
        var d = cell.daysLeft;
        if (d != null && d < 0) return 0xd23b3b; if (d != null && d <= 3) return 0xe0a800; return 0x2f9e6e;
    }
    function recolorCell(st, cell) { if (cell.load && cell.load.visible) cell.load.material.color.setHex(layerColor(st, cell)); }
    function recolorAll(st) { st.cells.forEach(function (c) { recolorCell(st, c); }); }

    function addGate(st, g) {
        var THREE = st.THREE;
        var post = mk(THREE, new THREE.BoxGeometry(26, 3, 6), 0x394150); post.position.set(g.x, 1.5, g.z); st.world.add(post);
        [-11, 11].forEach(function (dx) { var u = mk(THREE, new THREE.BoxGeometry(3, 22, 3), 0x394150); u.position.set(g.x + dx, 11, g.z); st.world.add(u); });
        var top = mk(THREE, new THREE.BoxGeometry(26, 3, 4), 0x2f9e6e); top.position.set(g.x, 22, g.z); st.world.add(top);
        // без громоздкой надписи «ворота» — док обозначен цветной аркой
    }

    // ===== КОНСТРУКТОР: рендер свободно размещённого элемента (EquipmentUnit с позицией) =====
    // форма меша по etShape; кликабелен (userData.placedIx) для привязки; имя — подписью.
    // параметрический примитив: короб Д×Ш×В в масштабе (1 м ≈ 9 ед.), цвет типа, подпись имени и габаритов
    function addPlacedUnit(st, u) {
        var THREE = st.THREE, x = u.posX, z = u.posZ, pick = null;
        var sh = u.shape || "box";
        var t = (st.equipTypes && st.equipTypes[sh]) || {};
        var M2U = 9;
        var L = Math.max(3, (t.lenM || 1.6) * M2U), W = Math.max(3, (t.widM || 1.4) * M2U), H = Math.max(2, (t.heM || 1.6) * M2U);
        var col = t.color || "#6b7280";
        u.lenM = t.lenM; u.widM = t.widM; u.heM = t.heM;
        var g = new THREE.Group(); g.position.set(x, 0, z); st.world.add(g);
        if (sh === "gate") {
            var jw = Math.max(2.4, W * 0.4);
            [-L / 2 + 1.5, L / 2 - 1.5].forEach(function (dx) { var p = mk(THREE, new THREE.BoxGeometry(3, H, jw), col); p.position.set(dx, H / 2, 0); g.add(p); });
            var topb = mk(THREE, new THREE.BoxGeometry(L, 3, jw), col); topb.position.set(0, H, 0); g.add(topb);
            pick = mk(THREE, new THREE.BoxGeometry(L, H, jw + 3), col, { transparent: true, opacity: 0.001 }); pick.position.set(0, H / 2, 0);
        } else if (sh === "tree") {
            var trunk = mk(THREE, new THREE.CylinderGeometry(1.6, 2.2, H * 0.5, 8), 0x6b4f2a); trunk.position.set(0, H * 0.25, 0); g.add(trunk);
            var crown = mk(THREE, new THREE.SphereGeometry(Math.max(L, W) / 2, 12, 10), col); crown.position.set(0, H * 0.72, 0); g.add(crown);
            pick = crown;
        } else if (sh === "fence") {
            var rail = mk(THREE, new THREE.BoxGeometry(L, Math.max(2, H * 0.2), Math.max(1.6, W)), col); rail.position.set(0, H * 0.78, 0); g.add(rail);
            var np = Math.max(2, Math.round(L / 12));
            for (var i = 0; i <= np; i++) { var po = mk(THREE, new THREE.BoxGeometry(2, H, Math.max(1.6, W)), col); po.position.set(-L / 2 + i * (L / np), H / 2, 0); g.add(po); }
            pick = mk(THREE, new THREE.BoxGeometry(L, H, Math.max(3, W)), col, { transparent: true, opacity: 0.001 }); pick.position.set(0, H / 2, 0);
        } else if (sh === "plot" || sh === "pad") {
            var hh = Math.max(1.2, H);
            var slab = mk(THREE, new THREE.BoxGeometry(L, hh, W), col); slab.position.set(0, hh / 2, 0); g.add(slab);
            var edp = new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry), new THREE.LineBasicMaterial({ color: 0x2b3440, transparent: true, opacity: 0.3 })); edp.position.copy(slab.position); g.add(edp);
            pick = slab;
        } else if (sh === "sensor") {
            var sb = mk(THREE, new THREE.BoxGeometry(Math.max(5, L), Math.max(5, W), Math.max(5, W)), col); sb.position.set(0, H - 3, 0); g.add(sb);
            var stem = mk(THREE, new THREE.BoxGeometry(2, H, 2), 0x6b7686); stem.position.set(0, H / 2, 0); g.add(stem);
            pick = sb;
        } else if (sh === "oven") {
            // печь / сушильная камера: изолированный корпус + дверь с ручкой + дымоход + пульт управления
            var body = mk(THREE, new THREE.BoxGeometry(L, H, W), col); body.position.set(0, H / 2, 0); g.add(body);
            var edO = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), new THREE.LineBasicMaterial({ color: 0x2b3440, transparent: true, opacity: 0.35 })); edO.position.copy(body.position); g.add(edO);
            var frame = mk(THREE, new THREE.BoxGeometry(L * 0.66, H * 0.72, 1), 0x8a7a5a); frame.position.set(-L * 0.06, H * 0.42, W / 2 + 0.1); g.add(frame);
            var door = mk(THREE, new THREE.BoxGeometry(L * 0.6, H * 0.66, 1.6), 0x3a2f28); door.position.set(-L * 0.06, H * 0.42, W / 2 + 0.5); g.add(door);
            var handle = mk(THREE, new THREE.CylinderGeometry(1, 1, H * 0.3, 8), 0xcbb58a); handle.position.set(L * 0.2, H * 0.42, W / 2 + 1.4); g.add(handle);
            var flue = mk(THREE, new THREE.CylinderGeometry(Math.min(L, W) * 0.13, Math.min(L, W) * 0.13, H * 0.5, 14), 0x6b7078); flue.position.set(L * 0.28, H + H * 0.2, -W * 0.22); g.add(flue);
            var panelO = mk(THREE, new THREE.BoxGeometry(L * 0.16, H * 0.24, 1.6), 0x223047); panelO.position.set(L * 0.3, H * 0.62, W / 2 + 0.5); g.add(panelO);
            pick = body;
        } else if (sh === "tank" || sh === "boiler") {
            // вертикальный цилиндр с куполом, ножками и патрубком
            var rT = Math.min(L, W) / 2, bh = H * 0.82;
            var cyl = mk(THREE, new THREE.CylinderGeometry(rT, rT, bh, 24), col); cyl.position.set(0, bh / 2, 0); g.add(cyl);
            var dome = mk(THREE, new THREE.SphereGeometry(rT, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), col); dome.position.set(0, bh, 0); g.add(dome);
            [-1, 1].forEach(function (s) { var leg = mk(THREE, new THREE.BoxGeometry(2, H * 0.14, 2), 0x51606e); leg.position.set(s * rT * 0.6, H * 0.07, 0); g.add(leg); });
            var pipe = mk(THREE, new THREE.CylinderGeometry(rT * 0.14, rT * 0.14, H * 0.3, 10), 0x51606e); pipe.position.set(rT * 0.85, bh * 0.5, 0); g.add(pipe);
            pick = cyl;
        } else if (sh === "silo" || sh === "granary") {
            // высокий цилиндр с конической крышей и обручами
            var rS = Math.min(L, W) / 2, sbh = H * 0.72;
            var scyl = mk(THREE, new THREE.CylinderGeometry(rS, rS, sbh, 20), col); scyl.position.set(0, sbh / 2, 0); g.add(scyl);
            var scone = mk(THREE, new THREE.ConeGeometry(rS * 1.03, H * 0.28, 20), col); scone.position.set(0, sbh + H * 0.14, 0); g.add(scone);
            [0.3, 0.6].forEach(function (fr) { var ring = mk(THREE, new THREE.TorusGeometry(rS * 1.01, 0.5, 6, 20), 0x8a929c); ring.rotation.x = Math.PI / 2; ring.position.set(0, sbh * fr, 0); g.add(ring); });
            pick = scyl;
        } else if (sh === "hopper") {
            // короб-накопитель + воронка-конус снизу
            var rH = Math.min(L, W) / 2, funH = H * 0.5, topH = H * 0.4;
            var htop = mk(THREE, new THREE.BoxGeometry(L, topH, W), col); htop.position.set(0, funH + topH / 2, 0); g.add(htop);
            var fun = mk(THREE, new THREE.CylinderGeometry(rH, rH * 0.2, funH, 12), col); fun.position.set(0, funH / 2, 0); g.add(fun);
            pick = htop;
        } else if (sh === "pump") {
            // насос: рама + горизонтальный мотор + улитка + выходной патрубок
            var baseP = mk(THREE, new THREE.BoxGeometry(L, H * 0.22, W), 0x51606e); baseP.position.set(0, H * 0.11, 0); g.add(baseP);
            var motor = mk(THREE, new THREE.CylinderGeometry(H * 0.3, H * 0.3, L * 0.7, 18), col); motor.rotation.z = Math.PI / 2; motor.position.set(-L * 0.05, H * 0.55, 0); g.add(motor);
            var volute = mk(THREE, new THREE.CylinderGeometry(H * 0.34, H * 0.34, W * 0.5, 16), col); volute.rotation.x = Math.PI / 2; volute.position.set(L * 0.32, H * 0.42, 0); g.add(volute);
            var outlet = mk(THREE, new THREE.CylinderGeometry(2, 2, H * 0.42, 10), 0x51606e); outlet.position.set(L * 0.32, H * 0.66, 0); g.add(outlet);
            pick = motor;
        } else if (sh === "fan") {
            // вентилятор: круглый кожух + ступица + лопасти + опора
            var rF = Math.min(L, W) / 2;
            var housing = mk(THREE, new THREE.CylinderGeometry(rF, rF, Math.max(4, W * 0.5), 20), col); housing.rotation.x = Math.PI / 2; housing.position.set(0, H * 0.6, 0); g.add(housing);
            var hub = mk(THREE, new THREE.CylinderGeometry(rF * 0.22, rF * 0.22, W * 0.55, 12), 0x333a44); hub.rotation.x = Math.PI / 2; hub.position.set(0, H * 0.6, 0); g.add(hub);
            [0, Math.PI / 2].forEach(function (a) { var bl = mk(THREE, new THREE.BoxGeometry(rF * 1.5, 1.5, 3), 0x9aa3ad); bl.position.set(0, H * 0.6, W * 0.28); bl.rotation.z = a; g.add(bl); });
            var standF = mk(THREE, new THREE.BoxGeometry(L * 0.3, H * 0.32, W * 0.3), 0x51606e); standF.position.set(0, H * 0.16, 0); g.add(standF);
            pick = housing;
        } else if (sh === "press") {
            // пресс: основание + 2 стойки + верхняя балка + подвижный ползун
            var baseR = mk(THREE, new THREE.BoxGeometry(L, H * 0.18, W), 0x51606e); baseR.position.set(0, H * 0.09, 0); g.add(baseR);
            [-1, 1].forEach(function (s) { var cc = mk(THREE, new THREE.BoxGeometry(L * 0.16, H * 0.78, W * 0.7), col); cc.position.set(s * L * 0.35, H * 0.5, 0); g.add(cc); });
            var beam = mk(THREE, new THREE.BoxGeometry(L, H * 0.2, W * 0.8), col); beam.position.set(0, H * 0.9, 0); g.add(beam);
            var ram = mk(THREE, new THREE.BoxGeometry(L * 0.42, H * 0.28, W * 0.5), 0x8a929c); ram.position.set(0, H * 0.56, 0); g.add(ram);
            pick = beam;
        } else if (sh === "crusher") {
            // дробилка: корпус + приёмная воронка сверху + боковой мотор
            var bodyC = mk(THREE, new THREE.BoxGeometry(L, H * 0.6, W), col); bodyC.position.set(0, H * 0.3, 0); g.add(bodyC);
            var hopC = mk(THREE, new THREE.CylinderGeometry(Math.min(L, W) * 0.48, Math.min(L, W) * 0.2, H * 0.4, 12), col); hopC.position.set(0, H * 0.8, 0); g.add(hopC);
            var motC = mk(THREE, new THREE.CylinderGeometry(H * 0.16, H * 0.16, W * 0.45, 12), 0x51606e); motC.rotation.x = Math.PI / 2; motC.position.set(L * 0.42, H * 0.3, 0); g.add(motC);
            pick = bodyC;
        } else if (sh === "compressor") {
            // компрессор: горизонтальный ресивер + мотор-блок сверху
            var tankC = mk(THREE, new THREE.CylinderGeometry(H * 0.32, H * 0.32, L * 0.8, 18), col); tankC.rotation.z = Math.PI / 2; tankC.position.set(0, H * 0.32, 0); g.add(tankC);
            var motB = mk(THREE, new THREE.BoxGeometry(L * 0.42, H * 0.42, W * 0.6), 0x51606e); motB.position.set(-L * 0.1, H * 0.72, 0); g.add(motB);
            pick = tankC;
        } else {
            var body = mk(THREE, new THREE.BoxGeometry(L, H, W), col); body.position.set(0, H / 2, 0); g.add(body);
            var ed = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), new THREE.LineBasicMaterial({ color: 0x2b3440, transparent: true, opacity: 0.35 })); ed.position.copy(body.position); g.add(ed);
            pick = body;
        }
        if (pick) { pick.userData.placedIx = u.index; pick.userData.placedName = u.name; st.raycast.push(pick); }
        u.mesh = g;
        var lab = makeLabel(THREE, 256, 64); lab.sprite.scale.set(34, 8.5, 1); lab.sprite.position.set(x, H + 10, z);
        drawTag(lab, (u.name || "элемент") + (u.dev ? " 🔗" : ""), "#1f6f8b"); st.world.add(lab.sprite); u.label = lab.sprite;
        var dl = makeLabel(THREE, 256, 64); dl.sprite.scale.set(28, 7, 1); dl.sprite.position.set(x, 5, z + W / 2 + 5);
        drawTag(dl, (u.lenM || "?") + "×" + (u.widM || "?") + "×" + (u.heM || "?") + " м", "#5a6470"); st.world.add(dl.sprite);
    }

    // холодильный агрегат зоны (вибрация/шум/эффективность охлаждения → предиктивное обслуживание)
    function addCompressor(st, rk, z) {
        var THREE = st.THREE, ax = rk.orient === 0;
        var bx = ax ? rk.px - 18 : rk.px + CD / 2;
        var bz = ax ? rk.pz + CD / 2 : rk.pz - 18;
        var g = new THREE.Group(); g.position.set(bx, 0, bz); st.world.add(g);
        var body = mk(THREE, new THREE.BoxGeometry(14, 16, 18), 0x8d97a3); body.position.set(0, 8, 0); g.add(body);
        var fan = mk(THREE, new THREE.CylinderGeometry(5, 5, 2, 14), 0x4a525c); fan.rotation.z = Math.PI / 2; fan.position.set(8, 9, 0); g.add(fan);
        var L = makeLabel(THREE, 256, 64); L.sprite.scale.set(36, 9, 1); L.sprite.position.set(bx, 28, bz); L.sprite.visible = false; st.world.add(L.sprite);
        var et = (st.equipTypes && (st.equipTypes.compressor || st.equipTypes.hvac)) || {};
        var eq = { health: 100, vib: 1.2, noise: 36, eff: 100, alarm: false, tech: false, techT: 0, techPending: 0, degrading: false, degradeT: 9 + Math.random() * 10, tag: L,
            typeName: et.name || "Холодильный агрегат", vibMax: et.vibMax || 7, mtbf: et.mtbf || 1500, powerKw: et.powerKw || 12, spare: et.spare || "фильтры", spareQty: (et.spareQty != null ? et.spareQty : 4),
            unit: (st.unitByIndex && st.unitByIndex[z.rackIndex]) || null };
        z.equip = eq;
        st.anim.push(function (t) {
            var amp = Math.max(0, eq.vib - 1.5) * 0.5;
            g.position.x = bx + amp * Math.sin(t * 42);
            g.position.z = bz + amp * Math.cos(t * 35) * 0.6;
            fan.rotation.x = t * (6 + eq.vib);
            if (eq.alarm) { var k = 0.4 + 0.4 * Math.sin(t * 6); body.material.emissive.setRGB(0.6 * k, 0.06 * k, 0); }
            else if (eq.degrading) { body.material.emissive.setRGB(0.22, 0.14, 0); }
            else body.material.emissive.setRGB(0, 0, 0);
        });
    }

    // жизненный цикл агрегата: деградация → аларм «техник» → ремонт → восстановление
    function updateEquipment(st, dt) {
        st.zones.forEach(function (z) {
            var eq = z.equip; if (!eq) return;
            if (eq.tech) {
                eq.techT -= dt;
                eq.vib += (1.2 - eq.vib) * Math.min(1, dt * 0.8);
                eq.eff += (100 - eq.eff) * Math.min(1, dt * 0.8);
                eq.noise += (36 - eq.noise) * Math.min(1, dt * 0.8);
                if (eq.techT <= 0) {
                    eq.tech = false; eq.alarm = false; eq.health = 100; eq.degradeT = 12 + Math.random() * 12; z.equipFault = false; if (eq.tag) eq.tag.sprite.visible = false;
                    var zc2 = (z.name.split("«")[1] || "").replace("»", "");
                    var sc2 = (z.activeCrit && z.activeCrit.scenario) || pickScenario(st, "cold");
                    var inStock = Math.random() < 0.6, mat = sc2.mat || [];
                    if (z.activeCrit) z.activeCrit.buyMat = (!inStock && mat.length > 0);
                    var matLine = !mat.length ? "Материалы не требовались." : (inStock ? "Списание материалов: <b>" + mat[0] + " " + mat[1] + " шт</b> (есть на складе)." : "Закупка: <b>" + mat[0] + " " + mat[1] + " шт</b> — на складе закончились, заявка поставщику.");
                    var svcMin = 20 + Math.round(Math.random() * 25), warmDays = 2 + Math.round(Math.random() * 4);
                    feed(st, "✅ Сервис завершён — зона " + zc2 + ", терморежим восстановлен", "#7af0a3",
                        "Зона «" + z.name + "». Датчик поймал заранее: <b>плановый сервис ~" + svcMin + " мин</b> вместо <b>~" + warmDays + " сут</b> тёплой зоны и порчи товара.<br>Корневая причина: " + sc2.root + ".<br>Выполнено: <b>" + sc2.repair + "</b>. Предотвращён риск: <b>" + sc2.risk + "</b>.<br>" + matLine, "fix-" + z.rackIndex);
                    if (!inStock && mat.length > 0) feed(st, "📋 Заявка на закупку — " + mat[0] + " " + mat[1] + " шт", "#9fc2f0", "По итогам сервиса в зоне «" + z.name + "»: закончились <b>" + mat[0] + "</b>. Создана заявка поставщику на <b>" + mat[1] + " шт</b>; до поставки — резервный комплект.", "buy-" + z.rackIndex);
                    var rp = (function (s) { var mm = s && s.match(/(\d+)\s*%/); return mm ? +mm[1] / 100 : 0.6; })(sc2.risk);
                    var savedWh = Math.round((150 + Math.random() * 250) * rp * st.eco.unitPrice);
                    sendWorkOrder(st, { object: "Склад · зона " + zc2, cause: sc2.cause, act: sc2.repair, risk: sc2.risk, spare: mat[0] || "", qty: mat[1] || 0, saved: savedWh });
                }
                return;
            }
            if (eq.alarm) {
                eq.techPending -= dt; eq.eff = Math.max(eq.eff - dt * 1.2, 55);
                if (eq.techPending <= 0) { eq.tech = true; eq.techT = 8; if (eq.tag) drawTag(eq.tag, "Техник на месте…", "#b07400"); }
                return;
            }
            if (!eq.degrading) { eq.degradeT -= dt; if (eq.degradeT > 0) return; eq.degrading = true; feed(st, "📈 Холодильник зоны " + ((z.name.split("«")[1] || "").replace("»", "")) + " теряет стабильность", "#cfd8e3", "Датчики раннего предупреждения зоны «" + z.name + "» фиксируют рост вибрации и шума агрегата — признак износа. Система наблюдает; при ухудшении вызовет сервис заранее, до отказа.", "deg-" + z.rackIndex); }
            eq.vib += dt * 0.9; eq.noise += dt * 2.4; eq.eff -= dt * 7; eq.health -= dt * 6;
            if (eq.vib > (eq.vibMax || 7) || eq.eff < 70) {
                eq.alarm = true; eq.degrading = false; eq.techPending = 16; eq.alarmAt = st.simTime;
                if (eq.tag) { eq.tag.sprite.visible = true; drawTag(eq.tag, "ТЕХНИК · вибр " + t1(eq.vib) + " · холод " + Math.round(eq.eff) + "%", "#d23b3b"); }
                feed(st, "🔧 Сбой холода в зоне " + ((z.name.split("«")[1] || "").replace("»", "")) + " — вызван техник", "#ff9b4a", "Холодильный агрегат зоны «" + z.name + "» теряет мощность: охлаждение упало до <b>" + Math.round(eq.eff) + "%</b>, температура растёт.<br>Вызвали техника (реакция ~2 ч). Товар срочно перемещён в рабочую зону — <b>терморежим сохранён</b>. Датчики сработали раньше, чем человек заметил бы.", "alarm-" + z.rackIndex);
                beep(st, 1040, 0.14, 0.08);
                st.stats.inc += 1;
                if (z.activeCrit && z.activeCrit.head === "Сбой холодильного оборудования") z.activeCrit.cause = "холодильный агрегат теряет мощность — нужен сервис";
            }
        });
    }

    function forklift(st, color) {
        var THREE = st.THREE, g = new THREE.Group();
        function add(m, x, y, z) { m.position.set(x, y, z); g.add(m); return m; }
        add(mk(THREE, new THREE.BoxGeometry(15, 10, 21), color), 0, 6, 0);
        add(mk(THREE, new THREE.BoxGeometry(12, 11, 11), 0xdfe6ef, { transparent: true, opacity: 0.85 }), 0, 16, -4);
        add(mk(THREE, new THREE.BoxGeometry(2, 24, 2), 0x3a4049), -4, 13, 11);
        add(mk(THREE, new THREE.BoxGeometry(2, 24, 2), 0x3a4049), 4, 13, 11);
        add(mk(THREE, new THREE.BoxGeometry(2, 1.5, 13), 0x2c2f35), -4, 2, 18);
        add(mk(THREE, new THREE.BoxGeometry(2, 1.5, 13), 0x2c2f35), 4, 2, 18);
        var pal = add(mk(THREE, new THREE.BoxGeometry(11, 2.5, 11), 0xb07d4b), 0, 4, 18);
        var crg = add(mk(THREE, new THREE.BoxGeometry(9, 8, 9), 0xd23b3b), 0, 9.5, 18);
        pal.visible = false; crg.visible = false; g.userData.load = [pal, crg];
        st.world.add(g); return g;
    }

    function nearestGate(st, x, z) { var best = null, bd = 1e9; st.gates.forEach(function (g) { var d = dist2(x, z, g.x, g.z); if (d < bd) { bd = d; best = g; } }); return best || { x: x, z: z }; }
    function claimTask(st, fk) {
        var best = null, bd = 1e9, bestInc = false;
        for (var i = 0; i < st.taskPool.length; i++) {
            var c = st.taskPool[i]; if (c.claimed || c.done) continue;
            var d = dist2(fk.x, fk.z, c.front.x, c.front.z);
            // приоритет: инциденты датчиков важнее обычных заявок
            if (c.incident && !bestInc) { best = c; bd = d; bestInc = true; }
            else if (c.incident === bestInc && d < bd) { bd = d; best = c; }
        }
        if (best) { best.claimed = true; fk.task = best; fk.phase = "toTask"; setDest(st, fk, best.front.x, best.front.z); }
    }
    function setLoad(fk, on, color) { fk.group.userData.load.forEach(function (m) { m.visible = on; }); if (on && color != null) fk.group.userData.load[1].material.color.setHex(color); }
    // маршрут ТОЛЬКО по проходам: вдоль текущей линии до бокового проезда → по проезду → в нужный фронт (никаких диагоналей сквозь стеллажи)
    function setDest(st, fk, dx, dz) {
        var ax = st.aisleX;
        if (Math.abs(fk.z - dz) < 6) fk.path = [{ x: dx, z: dz }];
        else fk.path = [{ x: ax, z: fk.z }, { x: ax, z: dz }, { x: dx, z: dz }];
        fk.tx = dx; fk.tz = dz;
    }
    function moveStep(fk, dt) {
        if (!fk.path || !fk.path.length) return true;
        var w = fk.path[0], dx = w.x - fk.x, dz = w.z - fk.z, d = Math.sqrt(dx * dx + dz * dz), step = fk.speed * dt;
        if (d <= step || d < 0.001) { fk.x = w.x; fk.z = w.z; fk.path.shift(); return fk.path.length === 0; }
        fk.x += dx / d * step; fk.z += dz / d * step; fk.group.rotation.y = Math.atan2(dx, dz); return false;
    }

    function liftCell(st, cell) {
        if (cell.anim) { var i = st.anim.indexOf(cell.anim); if (i >= 0) st.anim.splice(i, 1); cell.anim = null; }
        if (cell.cone) { st.world.remove(cell.cone); cell.cone = null; }
        if (cell.load) cell.load.visible = false; if (cell.edge) cell.edge.visible = false; if (cell.pal) cell.pal.visible = false;
        cell.occ = false;
    }
    function dropTask(st, cell) { var i = st.taskPool.indexOf(cell); if (i >= 0) st.taskPool.splice(i, 1); cell.isTask = false; cell.incident = false; st.stats.active = st.taskPool.length; }

    function completeTask(st, cell, fk) {
        cell.done = true; cell.claimed = false; dropTask(st, cell); liftCell(st, cell);
        st.stats.saved += 1; st.erp.dispatched += 1;
        st.recentDone.unshift({ title: "R" + (cell.orderNum || "?") + " «" + (cell.customer || "") + "» — " + cell.sku, t: st.simTime }); if (st.recentDone.length > 8) st.recentDone.pop();
        var moved = Math.random() < 0.4 ? " Соседнюю паллету перенесли на вечернюю отгрузку в заказ R" + (st.orderNum + 1 + Math.floor(Math.random() * 9)) + " «" + CUSTOMERS[(cell.orderNum + 4) % CUSTOMERS.length] + "»." : "";
        if (cell.wasIncident) {
            st.stats.prevent += cell.value; st.stats.would += cell.value;
            if (cell.equipInc) {
                feed(st, "✅ Паллета " + cell.palletNum + " перемещена в рабочую зону — терморежим сохранён", "#7af0a3",
                    "Из-за сбоя холода паллета " + cell.palletNum + " («" + cell.sku + "», " + fmt(cell.value) + " ₽) <b>срочно перемещена в рабочую холодильную зону</b> — терморежим сохранён, продукция спасена (заказ R" + cell.orderNum + " «" + cell.customer + "»)." + moved, "rescue-" + cell.orderNum);
            } else {
                feed(st, "✅ R" + cell.orderNum + " «" + cell.customer + "»: паллета " + cell.palletNum + " отгружена раньше срока", "#7af0a3",
                    "Задание <b>R" + cell.orderNum + " «Отгрузка " + cell.customer + "»</b> выполнено: паллета " + cell.palletNum + " («" + cell.sku + "», " + fmt(cell.value) + " ₽) <b>отгружена раньше срока</b> из-за «" + (cell.reason || "риска порчи") + "» — спасли от списания." + moved, "rescue-" + cell.orderNum);
            }
        } else {
            feed(st, "✅ R" + cell.orderNum + " «" + cell.customer + "» выполнено — паллета " + cell.palletNum, "#9be7b4",
                "Задание <b>R" + cell.orderNum + " «Отгрузка " + cell.customer + "»</b> выполнено: паллета " + cell.palletNum + " («" + cell.sku + "», " + fmt(cell.value) + " ₽) отгружена по заявке (FEFO)." + moved, "dispatch-" + cell.orderNum);
        }
    }
    // товар испортился (не успели) — в утиль, это и есть «потеря без своевременной реакции»
    function spoilCell(st, cell) {
        cell.done = true; cell.claimed = false; dropTask(st, cell); liftCell(st, cell);
        st.stats.scrap += 1; st.stats.would += cell.value;
        if (cell.zone && cell.zone.activeCrit) { cell.zone.activeCrit.lost += 1; cell.zone.activeCrit.cause = "не успели вывезти — продукция испортилась"; renderCritical(st); }
        st.recentDone.unshift({ title: "⛔ в утиль: " + cell.sku, t: st.simTime, bad: true }); if (st.recentDone.length > 8) st.recentDone.pop();
        feed(st, "⛔ Списание — паллета " + (cell.palletNum || "?") + " («" + cell.sku + "»)", "#ff7a7a", "Паллета " + (cell.palletNum || "?") + " («" + cell.sku + "», " + fmt(cell.value) + " ₽), заказ R" + (cell.orderNum || "?") + (cell.customer ? " «" + cell.customer + "»" : "") + ", <b>списана</b> — не успели вывезти из-за «" + (cell.reason || "нарушения условий хранения") + "». Цена промедления.", "spoil-" + (cell.palletNum || st.evId));
    }

    function markIncidentVisual(st, cell) {
        cell.load.material.color.setHex(0xd23b3b);
        var col = cell.priColor || "#d23b3b", txt = cell.priText || "!";
        var by = cell.load.position.y + cell.lh / 2 + 15;
        var L = makeLabel(st.THREE, 256, 64); L.sprite.scale.set(txt.length > 3 ? 21 : 13, 5, 1); L.sprite.position.set(cell.cx, by, cell.cz);
        drawTag(L, "⚠ " + txt, col); st.world.add(L.sprite); cell.cone = L.sprite;
        var cr = (parseInt(col.slice(1, 3), 16)) / 255, cg = (parseInt(col.slice(3, 5), 16)) / 255, cb = (parseInt(col.slice(5, 7), 16)) / 255;
        cell.anim = function (t) { var k = 0.35 + 0.35 * Math.sin(t * 5); cell.load.material.emissive.setRGB(cr * k, cg * k, cb * k); L.sprite.position.y = by + 2.5 * Math.sin(t * 3); };
        st.anim.push(cell.anim);
    }

    // ----- датчик зафиксировал инцидент в зоне → спасательные задания на товар под угрозой -----
    function raiseSensorIncident(st, zone) {
        var pool = zone.cells.filter(function (c) { return c.occ && !c.isTask && !c.done && c.load; });
        if (!pool.length) return;
        pool.sort(function (a, b) { return b.value - a.value; });
        var n = Math.min(3, pool.length), rsn = bizReason(zone), firstOrd = st.orderNum + 1;
        var sc = pickScenario(st, scKind(zone)); zone.pendingScenario = sc;
        for (var i = 0; i < n; i++) {
            var c = pool[i]; c.isTask = true; c.incident = true; c.wasIncident = true; c.claimed = false; c.spoilT = 24;
            st.orderNum += 1; c.orderNum = st.orderNum; c.customer = CUSTOMERS[st.orderNum % CUSTOMERS.length]; c.palletNum = ++st.palletSeq; c.reason = rsn; c.equipInc = !!zone.equipFault;
            c.priText = zone.equipFault ? "t°!" : zone.cause === "eth" ? "этилен" : zone.cause === "hum" ? "влага" : "t°!";
            c.priColor = zone.cause === "eth" ? "#16a085" : zone.cause === "hum" ? "#2f6fd0" : "#d23b3b";
            markIncidentVisual(st, c); st.taskPool.push(c); st.stats.active = st.taskPool.length;
        }
        st.stats.inc += 1; st.routeRecalcs += 1;
        var zc = (zone.name.split("«")[1] || "").replace("»", "");
        var ords = n > 1 ? "R" + firstOrd + "–R" + st.orderNum : "R" + st.orderNum;
        var det = "Причина: <b>" + sc.cause + "</b> — " + sc.root + ".<br>Под угрозой <b>" + n + " паллет</b> (" + (n > 1 ? "заказы " : "заказ ") + ords + "). Система переназначила погрузчики на <b>срочный вывоз</b>: товар перемещён в рабочую зону / отгружен раньше срока — до порчи.";
        feed(st, "⚠ " + sc.cause + " — зона " + zc, "#ffce4a", det, "inc-" + firstOrd);
        beep(st, 900, 0.12, 0.06);
    }

    function updateZoneLabels(st, force) {
        st.zones.forEach(function (z) {
            if (!z.label) return;
            var val, col, unit;
            if (st.layer === "hum") { val = Math.round(z.humidity) + "%"; col = Math.abs(z.humidity - z.theme.hum) > 8 ? "#d23b3b" : "#1f6f8b"; }
            else if (st.layer === "eth") { val = z.theme.eth ? "C₂H₄ " + t1(z.ethylene) : "—"; col = (z.theme.eth && z.ethylene > 1.0) ? "#d23b3b" : "#5a6470"; }
            else if (st.layer === "equip") { var eq = z.equip; if (!eq) { val = "—"; col = "#5a6470"; } else if (eq.alarm) { val = "⚠ техник " + Math.round(eq.eff) + "%"; col = "#d23b3b"; } else { val = "вибр " + t1(eq.vib) + " мм/с"; col = eq.degrading ? "#b07400" : "#1f6f8b"; } }
            else if (st.layer === "exp") { val = z.name; col = "#2b3440"; }
            else { val = (z.temp >= 0 ? "+" : "") + t1(z.temp) + "°C"; col = z.temp > z.theme.tMax ? "#d23b3b" : (z.temp > z.theme.tMax - 2 ? "#b07400" : "#1f6f8b"); }
            drawTag(z.label, val, col);
        });
    }

    function simulate(st, dt) {
        dt *= st.timeScale;
        st.simTime += dt;
        drainEvents(st, dt);
        // контрфакт «с датчиками/без»: сэмпл накопленных потерь раз в 1с (с=факт.утиль, без=факт+предотвращено)
        if (st.cf) { st.cf.t += dt; if (st.cf.t >= 1.0) { st.cf.t = 0; var wl = st.stats.would || 0, wo = wl + (st.stats.prevent || 0); st.cf.withHist.push(wl); st.cf.woHist.push(wo); if (st.cf.withHist.length > 80) { st.cf.withHist.shift(); st.cf.woHist.shift(); } } }
        // 1) оборудование (предиктив) + климат зон + детект инцидентов по датчикам
        updateEquipment(st, dt);
        // звук растущей вибрации: тики учащаются и повышаются с ростом
        if (st.soundOn) {
            var mv = 0, deg = false;
            st.zones.forEach(function (z) { if (z.equip && z.equip.degrading) { deg = true; if (z.equip.vib > mv) mv = z.equip.vib; } });
            if (deg) { st.tickT -= dt; if (st.tickT <= 0) { beep(st, 520 + mv * 32, 0.04, 0.03); st.tickT = Math.max(0.22, 1.3 - mv * 0.13); } }
        }
        st.zones.forEach(function (z) {
            var eq = z.equip, cool = eq ? (100 - eq.eff) / 100 * 14 : 0; // падение охлаждения → зона теплеет
            z.driftT -= dt;
            if (z.driftT <= 0) {
                z.driftT = 2 + Math.random() * 3;
                z.door = (Math.random() < 0.15) ? 2.5 : 0;
                z.hTarget = Math.max(40, Math.min(99, z.theme.hum + (z.humBad ? 11 : (Math.random() - 0.5) * 6)));
                if (z.theme.eth) z.eTarget = z.ethBad ? 1.5 : 0.2 + Math.random() * 0.3;
            }
            z.tTarget = z.theme.set + cool + (z.door || 0);
            z.temp += (z.tTarget - z.temp) * Math.min(1, dt * 0.5);
            z.humidity += (z.hTarget - z.humidity) * Math.min(1, dt * 0.4);
            z.humidity = Math.max(0, Math.min(100, z.humidity));
            if (z.theme.eth) z.ethylene += (z.eTarget - z.ethylene) * Math.min(1, dt * 0.3);
            if (z.badT > 0) { z.badT -= dt; if (z.badT <= 0) { z.ethBad = false; z.humBad = false; } }
            // инцидент по датчику, если в зоне ещё нет активного
            var hasActive = false;
            for (var qi = 0; qi < z.cells.length; qi++) { if (z.cells[qi].incident && !z.cells[qi].done) { hasActive = true; break; } }
            if (!hasActive) {
                if (z.temp > z.theme.tMax + 0.3) { z.cause = "temp"; z.equipFault = !!(eq && eq.eff < 82); raiseSensorIncident(st, z); }
                else if (z.theme.eth && z.ethylene > 1.0) { z.cause = "eth"; z.equipFault = false; raiseSensorIncident(st, z); }
                else if (Math.abs(z.humidity - z.theme.hum) > 9) { z.cause = "hum"; z.equipFault = false; raiseSensorIncident(st, z); }
            }
            // критическое событие зоны: начало проблемы и время устранения (MTTR)
            var inTrouble = (z.temp > z.theme.tMax + 0.3) || (z.theme.eth && z.ethylene > 1.0) || Math.abs(z.humidity - z.theme.hum) > 9 || (eq && (eq.alarm || eq.degrading));
            if (inTrouble && !z.activeCrit) {
                var kind = (eq && (eq.alarm || eq.degrading)) ? "cold" : (z.theme.eth && z.ethylene > 1.0) ? "eth" : Math.abs(z.humidity - z.theme.hum) > 9 ? "hum" : "cold";
                var sc = z.pendingScenario || pickScenario(st, kind); z.pendingScenario = null;
                z.activeCrit = addCritical(st, { head: sc.cause, zone: (z.name.split("«")[1] || "").replace("»", ""), cause: sc.root, color: "#ff7a7a", scenario: sc });
            }
            if (z.activeCrit && !inTrouble && !hasActive) { resolveCritical(st, z.activeCrit); z.activeCrit = null; }
        });
        // случайные события не от оборудования: рост этилена (дозревание) / влажности
        st.excClock += dt;
        if (st.excClock >= st.excEvery) {
            st.excClock = 0;
            var fz = st.zones[Math.floor(Math.random() * st.zones.length)];
            if (fz.theme.eth && Math.random() < 0.6) { fz.ethBad = true; fz.badT = 6; }
            else { fz.humBad = true; fz.badT = 6; }
        }

        // 2) перекраска по слою + подписи датчиков (раз в ~0.4с)
        st.recolorClock += dt; st.labelClock += dt;
        if (st.recolorClock > 0.4) { st.recolorClock = 0; recolorAll(st); }
        if (st.labelClock > 0.5) { st.labelClock = 0; updateZoneLabels(st); }
        st.tlClock += dt; if (st.tlClock > 0.5) { st.tlClock = 0; renderTimeline(st); renderCritical(st); }

        // 3) обычные заявки магазинов (ERP-lite) — пореже
        st.orderClock += dt;
        if (st.orderClock >= st.orderEvery) { st.orderClock = 0; if (st.taskPool.length < 18) emitOrder(st); }

        // 4) таймеры порчи у инцидентных заданий
        for (var i = st.taskPool.length - 1; i >= 0; i--) {
            var c = st.taskPool[i]; if (!c.incident || c.claimed) continue;
            c.spoilT -= dt; if (c.spoilT <= 0) spoilCell(st, c);
        }

        // 5) ERP: приход фур (разгрузка → восполнение стеллажей)
        st.truckClock += dt;
        if (st.truckClock >= st.truckEvery) { st.truckClock = 0; spawnInbound(st); }
        for (var tk = st.trucks.length - 1; tk >= 0; tk--) { st.trucks[tk].t -= dt; if (st.trucks[tk].t <= 0) { st.world.remove(st.trucks[tk].group); st.trucks.splice(tk, 1); } }

        // 6) погрузчики: спасение/подгрузка (cell→ворота) и разгрузка (фура→стеллаж) + живая линия маршрута
        st.forklifts.forEach(function (fk) {
            if (fk.phase === "idle") { claimTask(st, fk); if (fk.phase === "idle") { if (!fk.path || !fk.path.length) setDest(st, fk, fk.home.x, fk.home.z); moveStep(fk, dt); } }
            else if (fk.phase === "toTask") {
                if (moveStep(fk, dt)) {
                    if (fk.task && !fk.task.done) {
                        if (fk.task.restock) setLoad(fk, true, 0x6fae5f);
                        else { setLoad(fk, true, fk.task.incident ? 0xd23b3b : 0x9bb0cf); liftCell(st, fk.task); }
                    }
                    fk.phase = "pick"; fk.timer = 0.35;
                }
            }
            else if (fk.phase === "pick") {
                fk.timer -= dt;
                if (fk.timer <= 0) {
                    if (fk.task && fk.task.restock) setDest(st, fk, fk.task.dst.x, fk.task.dst.z);
                    else { var g = nearestGate(st, fk.x, fk.z); setDest(st, fk, g.x, g.z + 22); }
                    fk.phase = "toGate";
                }
            }
            else if (fk.phase === "toGate") { if (moveStep(fk, dt)) { fk.phase = "drop"; fk.timer = 0.3; } }
            else if (fk.phase === "drop") {
                fk.timer -= dt;
                if (fk.timer <= 0) { setLoad(fk, false); if (fk.task) { if (fk.task.restock) finishRestock(st, fk.task); else completeTask(st, fk.task, fk); } fk.task = null; fk.phase = "idle"; }
            }
            if (fk.routeLine) {
                if (fk.task && fk.path && fk.path.length) {
                    var pts = [[fk.x, fk.z]]; for (var pi = 0; pi < fk.path.length; pi++) pts.push([fk.path[pi].x, fk.path[pi].z]);
                    var pos = fk.routeLine.geometry.attributes.position, np = Math.min(5, pts.length);
                    for (var k2 = 0; k2 < 5; k2++) { var p = pts[Math.min(k2, pts.length - 1)]; pos.setXYZ(k2, p[0], 1.6, p[1]); }
                    pos.needsUpdate = true; fk.routeLine.geometry.setDrawRange(0, np);
                    fk.routeLine.visible = true; fk.routeLine.material.color.setHex(fk.task.restock ? 0x4aa35f : fk.task.incident ? 0xd23b3b : 0x3a7bd5);
                } else fk.routeLine.visible = false;
            }
            fk.group.position.set(fk.x, 0, fk.z);
        });
    }

    function emitOrder(st) {
        var free = st.cells.filter(function (c) { return c.occ && !c.isTask && !c.done && c.load; });
        if (!free.length) return;
        var cell = free[Math.floor(Math.random() * free.length)];
        cell.isTask = true; cell.incident = false; cell.wasIncident = false; cell.claimed = false;
        st.orderNum += 1; cell.orderNum = st.orderNum; cell.customer = CUSTOMERS[st.orderNum % CUSTOMERS.length]; cell.palletNum = ++st.palletSeq; cell.reason = null;
        st.taskPool.push(cell); st.stats.active = st.taskPool.length; st.erp.orders += 1;
        feed(st, "🛒 Заказ R" + cell.orderNum + " «" + cell.customer + "» — " + (cell.sku || "товар"), "#9fc2f0", "Новый заказ <b>R" + cell.orderNum + "</b> от «" + cell.customer + "»: «" + (cell.sku || "товар") + "», паллета " + cell.palletNum + ". Подбор по <b>FEFO</b> — что раньше истекает, то раньше на отгрузку.", "order-" + cell.orderNum);
    }

    // ----- ERP: приход фур и разгрузка на стеллажи -----
    function addTruck(st, gate, inbound) {
        var THREE = st.THREE, g = new THREE.Group(), tz = gate.z + 42;
        var trailer = mk(THREE, new THREE.BoxGeometry(20, 18, 34), inbound ? 0x6fae5f : 0x3a7bd5); trailer.position.set(0, 11, 0); g.add(trailer);
        var cab = mk(THREE, new THREE.BoxGeometry(20, 14, 12), 0x3a414c); cab.position.set(0, 9, -23); g.add(cab);
        [[-9, 8], [9, 8], [-9, -16], [9, -16]].forEach(function (w) { var wh = mk(THREE, new THREE.CylinderGeometry(3, 3, 2, 12), 0x1b1f24); wh.rotation.z = Math.PI / 2; wh.position.set(w[0], 3, w[1]); g.add(wh); });
        var L = makeLabel(THREE, 256, 64); L.sprite.scale.set(16, 4, 1); L.sprite.position.set(0, 27, 0);
        drawTag(L, inbound ? "приём" : "отгрузка", inbound ? "#1f7a3a" : "#2b5dab"); g.add(L.sprite);
        g.position.set(gate.x, 0, tz); st.world.add(g);
        return { group: g, front: { x: gate.x, z: tz - 20 } };
    }
    function rackFront(st) {
        if (!st.racksArr.length) return { x: 0, z: 0 };
        var rk = st.racksArr[Math.floor(Math.random() * st.racksArr.length)];
        var ax = rk.orient === 0, col = Math.floor(Math.random() * rk.cols);
        return ax ? { x: rk.px + col * CW + CW / 2, z: rk.pz + CD + 14 } : { x: rk.px + CD + 14, z: rk.pz + col * CW + CW / 2 };
    }
    function spawnInbound(st) {
        if (!st.gates.length) return;
        var gate = st.gates[Math.floor(Math.random() * st.gates.length)];
        var tr = addTruck(st, gate, true); tr.t = 11; st.trucks.push(tr); st.erp.inbound += 1;
        var n = 2 + Math.floor(Math.random() * 2);
        feed(st, "🚚 Приход фуры — " + n + " паллет", "#9fc2f0", "К складу подъехала фура с поставкой (" + n + " паллет). Начинается разгрузка: погрузчики переносят товар из машины на стеллажи. ERP-цепочка: <b>Приход → Разгрузка → Заявка → Подгрузка</b>.", "inbound");
        for (var i = 0; i < n; i++) st.taskPool.push({ restock: true, claimed: false, done: false, incident: false, value: 0, sku: "паллета", front: { x: tr.front.x, z: tr.front.z }, dst: rackFront(st) });
    }
    function finishRestock(st, task) {
        var i = st.taskPool.indexOf(task); if (i >= 0) st.taskPool.splice(i, 1);
        task.done = true; st.erp.unloaded += 1;
        st.recentDone.unshift({ title: "разгрузка → стеллаж", t: st.simTime }); if (st.recentDone.length > 8) st.recentDone.pop();
    }

    function setupForklifts(st, forkCount, racks) {
        st.forklifts = [];
        for (var idx = 0; idx < forkCount; idx++) {
            var rk = racks[String(idx + 1)];
            var home = rk ? { x: rk.px + rk.cols * CW / 2, z: rk.pz + CD + 30 } : { x: 40 + idx * 60, z: 30 };
            var f = forklift(st, FORK_COLORS[idx % FORK_COLORS.length]);
            var L = rackLabel(st.THREE, "П" + (idx + 1)); L.scale.set(14, 7, 1); L.position.set(0, 33, 0); f.add(L);
            f.position.set(home.x, 0, home.z);
            var geo = new st.THREE.BufferGeometry(); geo.setAttribute("position", new st.THREE.BufferAttribute(new Float32Array(15), 3));
            var line = new st.THREE.Line(geo, new st.THREE.LineBasicMaterial({ color: 0x3a7bd5, transparent: true, opacity: 0.85 })); line.visible = false; st.world.add(line);
            st.forklifts.push({ idx: idx + 1, group: f, home: home, x: home.x, z: home.z, tx: home.x, tz: home.z, path: [], phase: "idle", task: null, timer: 0, speed: 66, routeLine: line });
        }
    }

    function rebuild(st, data) {
        var THREE = st.THREE; st.lastData = data;
        // сохранить положение камеры и текущую комнату, чтобы обновление данных НЕ выкидывало из зоны
        var __prevRoom = st.room ? st.room.rackIndex : null;
        var __keep = (st.builtOnce && st.orbit) ? { tx: st.orbit.target.x, ty: st.orbit.target.y, tz: st.orbit.target.z, r: st.orbit.radius, th: st.orbit.theta, ph: st.orbit.phi } : null;
        while (st.world.children.length) st.world.remove(st.world.children[0]);
        st.raycast = []; st.anim = []; st.forklifts = []; st.cells = []; st.gates = []; st.zones = []; st.taskPool = []; st.serverScen = {};
        st.stats = { prevent: 0, would: 0, saved: 0, scrap: 0, inc: 0, active: 0 };
        st.shown = { prevent: 0, would: 0, saved: 0, scrap: 0, inc: 0 };
        st.cf = { withHist: [], woHist: [], t: 0 };
        st.orderClock = 0; st.excClock = 0; st.events = []; st.evId = 0; st.routeRecalcs = 0; st.eventQueue = []; st.feedDrain = 0; st.orderNum = 20; st.palletSeq = 0; if (st.journal) st.journal.innerHTML = (window.miteTr||String)("");
        st.simTime = 0; st.critical = []; st.critId = 0; st.recentDone = []; st.tlClock = 0; if (st.crit) { st.crit.list.innerHTML = (window.miteTr||String)(""); st.crit.sum.innerHTML = (window.miteTr||String)(""); }
        if (st.tl) { st.tl.track.innerHTML = (window.miteTr||String)(""); st.tl.clock.textContent = (window.miteTr||String)("08:00"); }
        st.trucks = []; st.racksArr = []; st.truckClock = 5; st.erp = { inbound: 0, unloaded: 0, orders: 0, dispatched: 0 };

        var recs = data.split("~"), meta = recs[0].split("^");
        var floorW = +meta[2] || 240, floorD = +meta[3] || 140, forkCount = +meta[4] || 3;
        st.floorW = floorW; st.floorD = floorD; st.curHall = +meta[5] || 1; st.room = null; st.hallName = meta[1] || "Склад";
        st.halls = (meta[6] || "").split(";").filter(Boolean).map(function (h) { var p = h.split(":"); return { idx: +p[0], name: p[1], tasks: +p[2] || 0, risk: +p[3] || 0, expired: +p[4] || 0, free: +p[5] || 0 }; });
        var floor = mk(THREE, new THREE.BoxGeometry(floorW + 60, 4, floorD + 60), 0xdfe4ea); floor.position.set(floorW / 2, -2, floorD / 2); st.world.add(floor);
        var grid = new THREE.GridHelper(Math.max(floorW, floorD) + 60, Math.round((Math.max(floorW, floorD) + 60) / 20), 0xb9c2cd, 0xccd3db); grid.position.set(floorW / 2, 0.2, floorD / 2); st.world.add(grid);

        // габариты/цвет ПО ФОРМЕ (etShape) — карта на клиенте; не тащим в данные сцены (иначе 2-й join в unitRec валит wh3dData)
        var TYPE_DIMS = {
            gate: [3.0, 0.4, 2.4, "#2f9e6e"], plot: [2.0, 0.8, 0.25, "#639922"], box: [3.0, 2.0, 2.2, "#854f0b"],
            tree: [1.6, 1.6, 3.5, "#3b6d11"], pad: [10.0, 6.0, 0.1, "#9aa3ad"], fence: [6.0, 0.2, 1.2, "#5f5e5a"],
            compressor: [1.4, 1.2, 1.6, "#4b5563"], hvac: [1.6, 1.2, 1.5, "#3f7d8c"], conveyor: [4.0, 1.2, 0.9, "#59616d"],
            machine: [1.6, 1.4, 1.6, "#6b7280"], sensor: [0.3, 0.3, 1.6, "#3a7bd5"], rack: [2.0, 1.0, 2.5, "#8a929c"],
            press: [2.0, 1.8, 2.6, "#55606e"],
            pump: [1.4, 1.1, 1.3, "#4b6b7d"],
            crusher: [2.2, 1.8, 2.4, "#4a525c"],
            oven: [2.4, 1.6, 2.2, "#9c5a3c"],
            packer: [2.0, 1.4, 2.1, "#6b7f8a"],
            doser: [1.6, 1.6, 2.2, "#8a7f6b"],
            hopper: [2.2, 2.2, 3.0, "#7d7460"],
            tank: [2.4, 2.4, 3.4, "#7d8794"],
            boiler: [2.0, 2.0, 3.0, "#8a6a55"],
            fan: [1.4, 1.4, 1.6, "#6b8f99"],
            screw: [4.0, 0.7, 0.9, "#7a6f5a"],
            rackpal: [2.7, 1.1, 4.0, "#8a929c"],
            rackshelf: [2.0, 0.6, 2.4, "#949ba4"],
            rackcant: [2.4, 1.2, 3.0, "#7f8790"],
            rackdrivein: [3.0, 3.0, 4.5, "#868e98"],
            mezzanine: [6.0, 4.0, 3.0, "#99a1ab"],
            pallet: [1.2, 0.8, 0.2, "#9c7b4a"],
            palletstack: [1.2, 1.0, 1.6, "#a8854f"],
            forklift: [1.2, 2.4, 2.1, "#e0a020"],
            jack: [0.6, 1.6, 0.5, "#c04a3a"],
            dockgate: [3.2, 0.4, 3.0, "#3a4656"],
            sorter: [5.0, 1.2, 0.9, "#59616d"],
            zonepad: [8.0, 5.0, 0.1, "#9aa3ad"],
            barn: [9.0, 5.0, 3.2, "#d8c9a0"],
            barn2: [7.0, 4.0, 2.8, "#cabf98"],
            barn3: [6.0, 4.0, 2.6, "#d2c6a0"],
            silo: [2.6, 2.6, 5.5, "#c9b98a"],
            granary: [3.0, 3.0, 4.5, "#c2b184"],
            hangar: [10.0, 6.0, 3.5, "#b9c0c8"],
            feeder: [1.4, 0.6, 0.7, "#6b8f6b"],
            pen: [6.0, 6.0, 1.0, "#8a7a5a"],
            camera: [0.35, 0.35, 0.5, "#333a44"],
            light: [0.3, 0.3, 3.5, "#d8c24a"],
            panel: [0.8, 0.4, 1.8, "#556070"],
            cabin: [4.0, 2.5, 2.8, "#c0c8d0"],
        };
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
        // пред-проход: справочник оборудования (E^), экономика (ECO^), привязка объектов (U^)
        st.equipTypes = {}; st.equipList = []; st.equipByName = {}; st.units = {}; st.unitByIndex = {}; st.eco = { unitPrice: 480, downtimeRate: 12000, energyTariff: 7, fineRisk: 150000, capex: 450000 };
        for (var pe = 1; pe < recs.length; pe++) { var ef = recs[pe].split("^");
            if (ef[0] === "E") { var dm = TYPE_DIMS[ef[2]] || [1.6, 1.4, 1.8, "#6b7280"]; var et = { name: ef[1], shape: ef[2], kind: ef[3] || "cold", powerKw: +ef[4] || 0, vibMax: +ef[5] || 7, mtbf: +ef[6] || 0, spare: ef[7] || "", spareQty: +ef[8] || 0, count: +ef[9] || 0, lenM: dm[0], widM: dm[1], heM: dm[2], color: dm[3] }; st.equipTypes[ef[2] || "machine"] = et; st.equipList.push(et); st.equipByName[et.name] = et; }
            else if (ef[0] === "T") { var td = st.equipByName[ef[1]]; if (td) { td.lenM = +ef[2] || 1.6; td.widM = +ef[3] || 1.4; td.heM = +ef[4] || 1.8; td.color = ef[5] || "#6b7280"; } }
            else if (ef[0] === "ECO") { st.eco = { unitPrice: +ef[1] || 480, downtimeRate: +ef[2] || 12000, energyTariff: +ef[3] || 7, fineRisk: +ef[4] || 150000, capex: +ef[5] || 450000 }; }
            else if (ef[0] === "U") { var u = { name: ef[1], shape: ef[2], group: ef[3], index: +ef[4] || 0, source: ef[5] || "sim", dev: ef[6] || "", value: ef[7] || "", posX: (ef[8] !== undefined && ef[8] !== "") ? +ef[8] : null, posZ: (ef[9] !== undefined && ef[9] !== "") ? +ef[9] : null, typeName: ef[10] || "" }; st.units[ef[1]] = u; st.unitByIndex[u.index] = u; }
        }
        var racks = {}, order = [], zoneByRack = {};
        for (var i = 1; i < recs.length; i++) {
            var f = recs[i].split("^");
            if (f[0] === "R") {
                var idx = +f[1]; var rk = { idx: idx, px: +f[2], pz: +f[3], cols: +f[4], levels: +f[5], orient: +f[6], name: f[7] || "" };
                racks[f[1]] = rk; order.push(rk); addRack(st, rk);
                var th = zoneTheme(idx);
                var z = { rackIndex: idx, theme: th, name: th.name + " «" + (rk.name || idx) + "»", cells: [], temp: th.set, humidity: th.hum, ethylene: 0.25, tTarget: th.set, hTarget: th.hum, eTarget: 0.25, driftT: 2, door: 0, ethBad: false, humBad: false, badT: 0, equipFault: false, cause: "temp" };
                var L = makeLabel(THREE, 256, 64); L.sprite.scale.set(40, 10, 1);
                L.sprite.position.set(rk.px + rk.cols * CW / 2, rk.levels * CH + 10, rk.pz + CD / 2);
                st.world.add(L.sprite); z.label = L; z.rk = rk; st.zones.push(z); zoneByRack[idx] = z;
                addCompressor(st, rk, z);
            }
            else if (f[0] === "G") { var g = { x: +f[2], z: +f[3], name: f[4] || "" }; st.gates.push(g); addGate(st, g); }
            else if (f[0] === "C") { var rk2 = racks[f[1]]; if (!rk2) continue; addCell(st, rk2, f, zoneByRack[+f[1]]); }
            else if (f[0] === "S") { var sk = f[1] || "cold"; (st.serverScen[sk] = st.serverScen[sk] || []).push({ cause: f[2], root: f[3], repair: f[4], risk: f[5], mat: f[6] ? [f[6], +f[7] || 0] : [] }); }
        }
        if (!st.gates.length) st.gates.push({ x: floorW / 2, z: floorD + 26, name: "" });

        order.sort(function (a, b) { return a.pz - b.pz; });
        for (var kk = 0; kk + 1 < order.length; kk++) { var zc = (order[kk].pz + CD + order[kk + 1].pz) / 2; [-7, 7].forEach(function (dz) { var ln = mk(THREE, new THREE.BoxGeometry(order[kk].cols * CW, 0.6, 2), 0xf3c64a); ln.position.set(order[kk].px + order[kk].cols * CW / 2, 0.4, zc + dz); st.world.add(ln); }); }

        st.racksArr = order;
        var minPx = 1e9; order.forEach(function (r) { if (r.px < minPx) minPx = r.px; }); st.aisleX = (order.length ? minPx : 0) - 16; // боковой проезд слева от стеллажей
        setupForklifts(st, forkCount, racks);
        if (st.gates.length) addTruck(st, st.gates[st.gates.length - 1], false); // фура отгрузки (статичная, для наглядности)
        st.setLayer(st.layer || "temp");
        if (__keep) {
            // обновление данных: вернуть камеру и комнату, где была пользователь
            st.orbit.target.set(__keep.tx, __keep.ty, __keep.tz); st.orbit.radius = __keep.r; st.orbit.theta = __keep.th; st.orbit.phi = __keep.ph; st.applyCamera(); st.resize();
            var __z = (__prevRoom != null) ? st.zones.filter(function (z) { return z.rackIndex === __prevRoom; })[0] : null;
            if (__z) { st.room = __z; setRoomFocus(st, __z); } else setRoomFocus(st, null);
            renderNav(st);
        } else {
            // первая загрузка: общий вид склада
            st.orbit.target.set(floorW / 2, 26, floorD / 2);
            st.orbit.radius = Math.max(floorW, floorD) * 1.5 + 110;
            st.applyCamera(); st.resize();
            renderNav(st); setRoomFocus(st, null);
        }
        // КОНСТРУКТОР: дорисовать свободно размещённые элементы (с позицией)
        Object.keys(st.units).forEach(function (k) { var u = st.units[k]; if (u.posX != null && u.posZ != null) addPlacedUnit(st, u); });
        if (st.refreshPalette) st.refreshPalette(st);
        st.builtOnce = true;
    }

    return {
        render: function (element) {
            element.style.cssText = "position:relative;height:76vh;min-height:440px;min-width:0;overflow:hidden";
            if (window.THREE) build(element);
            else { var n = 0, t = setInterval(function () { if (window.THREE) { clearInterval(t); build(element); element.__pending && rebuild(element.__wh, element.__pending); } else if (++n > 100) clearInterval(t); }, 50); }
        },
        update: function (element, controller, value) {
            var s = (typeof value === "string") ? value : ""; if (!s) return;
            var st = element.__wh; if (st) { st.controller = controller; if (s === st.lastData) return; st.lastData = s; rebuild(st, s); } else element.__pending = s;
        }
    };
}
