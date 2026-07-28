// 3D-ЦЕХ (Three.js) на том же движке, что и склад: конвейеры + WIP + станки/агрегаты,
// предиктивное обслуживание (вибрация→отказ→наладчик→ЗИП), OEE/простои/брак, журнал/инциденты,
// сценарии берутся из каталога (S^...), разбор полёта — как последовательность шагов.
// value: 'F' или 'S^kind^cause^root^repair^risk^material^qty ~ ...' (каталог сценариев)
function factory3d() {
    var FORK_COLORS = [0xf2c200, 0x27b083, 0x3a7bd5];
    function mk(THREE, geo, color, opts) { return new THREE.Mesh(geo, new THREE.MeshLambertMaterial(Object.assign({ color: new THREE.Color(color) }, opts || {}))); }
    function fmt(n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
    function t1(n) { return (Math.round(n * 10) / 10).toFixed(1); }
    var TSCALE = 5;
    function dur(sec) { var m = Math.max(1, Math.round(sec * TSCALE)); if (m < 60) return m + " мин"; var h = Math.floor(m / 60), mm = m % 60; return h + " ч" + (mm ? " " + mm + " мин" : ""); }
    // убрать висящие dev-подсказки lsFusion (tippy с «Canonical name») — мешают показу. Обычные tooltip не трогаем.
    function killDevTooltips() { if (window.__lsfTipKilled) return; window.__lsfTipKilled = true; try { var s = document.createElement("style"); s.textContent = (window.miteTr||String)("[data-tippy-root]:has(.lsf-tooltip-path),.tippy-box:has(.lsf-tooltip-path){display:none!important;}"); document.head.appendChild(s); } catch (e) { } }
    // прогноз остаточного ресурса (RUL) по тренду вибрации до порога, в часах
    function rulHours(o) {
        if (!o || o.state === "alarm" || o.state === "repair") return 0;
        var vmax = o.vibMax || 7, rate = (o.shape === "hvac" || o.shape === "compressor") ? 0.7 : 0.9, sec;
        if (o.state === "degrading") sec = Math.max(0, (vmax - o.vib) / rate);
        else sec = Math.max(0, o.degradeT || 0) + (vmax - 1.2) / rate;
        return sec * TSCALE / 60;
    }
    function rulText(h) { return h <= 0 ? "в обслуживании" : h < 1 ? "<1 ч" : h < 48 ? Math.round(h) + " ч" : Math.round(h / 24) + " сут"; }
    function rulColor(h, st) { return (st === "alarm" || st === "repair") ? "#ff8f8f" : h < 2 ? "#ff8f8f" : h < 6 ? "#ffd24d" : "#7af0a3"; }
    // ERP: отправить наряд ТОиР на сервер (создаёт документ + списание ЗИП + заявку)
    function sendWorkOrder(st, o) { try { if (st.controller && st.controller.change) st.controller.change({ action: "workorder", object: o.object || "", cause: o.cause || "", act: o.act || "", risk: o.risk || "", spare: o.spare || "", qty: o.qty || 0, saved: Math.round(o.saved || 0) }); } catch (e) { } }
    function makeLabel(THREE, w, h) { var cv = document.createElement("canvas"); cv.width = w || 256; cv.height = h || 64; var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false })); sp.renderOrder = 10; return { sprite: sp, cv: cv, ctx: cv.getContext("2d") }; }
    function drawTag(L, text, color, bg) { var c = L.ctx, w = L.cv.width, h = L.cv.height; c.clearRect(0, 0, w, h); c.fillStyle = bg || "rgba(255,255,255,0.92)"; c.strokeStyle = color || "#b3261e"; c.lineWidth = 5; var r = 12; c.beginPath(); c.moveTo(r, 2); c.arcTo(w - 2, 2, w - 2, h - 2, r); c.arcTo(w - 2, h - 2, 2, h - 2, r); c.arcTo(2, h - 2, 2, 2, r); c.arcTo(2, 2, w - 2, 2, r); c.closePath(); c.fill(); c.stroke(); c.fillStyle = color || "#b3261e"; c.font = "bold 30px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText((window.miteTr?window.miteTr(text):text), w / 2, h / 2); L.sprite.material.map.needsUpdate = true; }
    function nameLabel(THREE, text) { var L = makeLabel(THREE, 256, 128), c = L.ctx; c.clearRect(0, 0, 256, 128); c.fillStyle = "#2c343f"; c.font = "600 60px 'Segoe UI',Arial,sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText((window.miteTr?window.miteTr(text):text), 128, 66); L.sprite.material.map.needsUpdate = true; L.sprite.scale.set(20, 10, 1); return L.sprite; }

    // ----- библиотека сценариев (fallback, если сервер не дал) -----
    var SCEN = {
        machine: [
            { cause: "Износ подшипника", root: "рост вибрации, выработка подшипникового узла", repair: "замена подшипника, центровка вала", risk: "заклинивание двигателя — 80%", mat: ["подшипник", 2] },
            { cause: "Перегрев двигателя", root: "превышение тока, недостаточное охлаждение", repair: "чистка, восстановление обдува", risk: "выгорание обмотки — 65%", mat: [] }
        ],
        conveyor: [
            { cause: "Проскальзывание ленты", root: "упало натяжение / износ барабана", repair: "натяжка ленты, проверка барабана", risk: "остановка линии — высокий", mat: [] },
            { cause: "Повреждение ленты", root: "надрыв полотна", repair: "вулканизация стыка / замена секции", risk: "обрыв и простой — высокий", mat: ["лента", 1] }
        ]
    };
    function pickScenario(st, kind) { var sv = st.serverScen && st.serverScen[kind]; var pool = (sv && sv.length) ? sv : (SCEN[kind] || SCEN.machine); return pool[(st.critId * 3 + Math.floor(Math.random() * pool.length)) % pool.length]; }
    // ---- бизнес-эффект кейса: что сэкономили / что не ушло в утиль ----
    var UNIT_PRICE = 480; // ₽ за единицу готовой продукции
    function rub(n) { return fmt(Math.round(n)) + " ₽"; }
    function riskPct(sc) { var m = sc && sc.risk && ("" + sc.risk).match(/(\d+)\s*%/); return m ? Math.max(0.3, +m[1] / 100) : 0.6; }
    function addBenefit(st, units, scrap) { st.stats.savedUnits += units; st.stats.savedRub += units * UNIT_PRICE; if (scrap) st.stats.scrapAvoided += units; }
    function benefitLine(text) { return '<div style="margin-top:10px;padding:9px 11px;background:#eafaf0;border:1px solid #bfe8cf;border-radius:8px;font-size:14px;color:#15692f"><b>💰 Бенефит:</b> ' + text + '</div>'; }

    // ---------- HUD ----------
    function buildHud(element, st) {
        var bar = document.createElement("div");
        bar.style.cssText = "position:absolute;left:50%;top:10px;transform:translateX(-50%);z-index:6;display:flex;gap:6px;background:rgba(18,26,36,0.82);padding:6px 8px;border-radius:10px;font-family:'Segoe UI',sans-serif";
        var layers = [["vib", "Вибрация"], ["temp", "Температура"], ["load", "Загрузка"], ["qual", "Качество"], ["energy", "Энергия"], ["climate", "Климат"]];
        st.layerBtns = {};
        layers.forEach(function (l) { var b = document.createElement("div"); b.textContent = (window.miteTr||String)(l[1]); b.style.cssText = "cursor:pointer;color:#cfd8e3;font-size:12px;padding:5px 11px;border-radius:7px;user-select:none"; b.onclick = function () { st.setLayer(l[0]); }; bar.appendChild(b); st.layerBtns[l[0]] = b; });
        var snd = document.createElement("div"); snd.style.cssText = "cursor:pointer;color:#cfd8e3;font-size:12px;padding:5px 11px;border-radius:7px;user-select:none;border-left:1px solid rgba(255,255,255,.15);margin-left:2px"; snd.textContent = (window.miteTr||String)("🔊 Звук: выкл"); snd.onclick = function () { toggleSound(st, snd); }; bar.appendChild(snd);
        element.appendChild(bar);

        var hud = document.createElement("div");
        hud.style.cssText = "position:absolute;left:14px;top:12px;width:318px;font-family:'Segoe UI',sans-serif;pointer-events:none;z-index:5";
        function cell(l, id, col) { return '<div><div style="font-size:10px;letter-spacing:.4px;text-transform:uppercase;opacity:.62">' + l + '</div><div id="' + id + '" style="font-size:20px;font-weight:800;color:' + col + '">0</div></div>'; }
        hud.innerHTML =
            (window.miteTr||String)('<div style="background:rgba(18,26,36,0.86);color:#fff;border-radius:12px;padding:13px 15px;box-shadow:0 8px 26px rgba(0,0,0,.3)">'
            + '<div style="font-size:11px;font-weight:700;letter-spacing:.4px;color:#7af0a3">⚙ <span id="f-title">ЦЕХ</span> · OEE (эффективность)</div>'
            + '<div id="f-oee" style="font-size:30px;font-weight:800;color:#7af0a3;line-height:1.1;margin:2px 0">0%</div>'
            + '<div style="font-size:11px;opacity:.8">доступность <b id="f-av">0%</b> · производит. <b id="f-pf">0%</b> · качество <b id="f-ql">0%</b></div>'
            + '<div style="display:flex;gap:15px;margin-top:10px">' + cell("Выпущено", "f-prod", "#5fe08a") + cell("Брак", "f-def", "#ff8f8f") + cell("Простоев", "f-inc", "#ffd24d") + '</div>'
            + '<div style="margin-top:10px"><div style="display:flex;justify-content:space-between;font-size:11px"><span style="opacity:.8">Предотвращено отказов</span><span id="f-prev" style="font-weight:700;color:#7af0a3">0</span></div>'
            + '<div id="f-pl-box" style="margin-top:8px;padding:9px 11px;background:rgba(122,240,163,0.12);border:1px solid rgba(122,240,163,0.35);border-radius:8px;cursor:pointer;pointer-events:auto">'
            + '<div style="font-size:10px;letter-spacing:.4px;text-transform:uppercase;opacity:.7;color:#7af0a3">💰 Откуда экономия · смена <span style="opacity:.6">— клик</span></div>'
            + '<div style="font-size:11px;opacity:.9;margin-top:3px;display:flex;justify-content:space-between"><span>Готовая продукция не в утиль (<span id="f-saved-units">0</span> ед)</span><b id="f-pl-prod">0 ₽</b></div>'
            + '<div style="font-size:11px;opacity:.9;display:flex;justify-content:space-between"><span>Простой/недовыпуск предотвращён</span><b id="f-pl-out">0 ₽</b></div>'
            + '<div style="font-size:11px;opacity:.9;display:flex;justify-content:space-between"><span>Штрафы за срыв избежали</span><b id="f-pl-fine">0 ₽</b></div>'
            + '<div style="margin-top:4px;border-top:1px solid rgba(122,240,163,0.25);padding-top:4px;display:flex;justify-content:space-between;align-items:center"><span style="font-size:11px;font-weight:600;opacity:.8">Итого за смену</span><span id="f-pl-total" style="font-size:19px;font-weight:800;color:#7af0a3">0 ₽</span></div>'
            + '<div style="font-size:11px;opacity:.78;margin-top:2px">≈ в месяц <b id="f-saved-month">0 ₽</b></div></div>'
            + '<div style="display:flex;justify-content:space-between;font-size:11px;margin-top:6px"><span style="opacity:.8">Энергия смены</span><span><b id="f-kwh">0</b> кВт·ч · <b id="f-cost">0</b> ₽</span></div>'
            + '<div style="display:flex;justify-content:space-between;font-size:11px;margin-top:3px"><span style="opacity:.8">t° цеха (климат)</span><span id="f-room" style="font-weight:700;color:#7af0a3">22°</span></div>'
            + '<div id="f-inv" style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.12);font-size:11px;opacity:.82"></div>'
            + '<div id="f-risks" style="margin-top:7px;font-size:11px;padding:6px 8px;background:rgba(255,210,77,0.08);border:1px solid rgba(255,210,77,0.3);border-radius:7px"></div>'
            + '<div id="f-line" style="margin-top:6px;font-size:11px;opacity:.9;min-height:24px"></div></div>'
            + '</div>');
        element.appendChild(hud);
        var q = function (id) { return hud.querySelector("#" + id); };
        st.hud = { title: q("f-title"), oee: q("f-oee"), av: q("f-av"), pf: q("f-pf"), ql: q("f-ql"), prod: q("f-prod"), def: q("f-def"), inc: q("f-inc"), prev: q("f-prev"), line: q("f-line"), kwh: q("f-kwh"), cost: q("f-cost"), room: q("f-room"), plProd: q("f-pl-prod"), plOut: q("f-pl-out"), plFine: q("f-pl-fine"), plTotal: q("f-pl-total"), savedUnits: q("f-saved-units"), savedMonth: q("f-saved-month"), inv: q("f-inv"), risks: q("f-risks") };
        var plb = q("f-pl-box"); if (plb) plb.onclick = function () { showPLDetail(st); };
        // лента смены — тонкая полоса, прилипшая к низу ОКНА (position:fixed) — не обрезается высокой сценой
        var ftl = document.createElement("div");
        ftl.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:12px;width:min(520px,48%);z-index:60;pointer-events:auto;font-family:'Segoe UI',sans-serif";
        ftl.innerHTML = (window.miteTr||String)('<div style="background:rgba(18,26,36,0.92);border-radius:10px;padding:7px 12px;box-shadow:0 6px 20px rgba(0,0,0,.45)">'
            + '<div style="display:flex;justify-content:space-between;font-size:10px;color:#cfd8e3;margin-bottom:5px"><span>ЛЕНТА СМЕНЫ <span style="opacity:.6">— метки инцидентов, клик</span></span><span id="ft-clock" style="opacity:.85">08:00</span></div>'
            + '<div id="ft-track" style="position:relative;height:14px;background:rgba(255,255,255,.08);border-radius:5px"></div></div>');
        element.appendChild(ftl);
        st.tl = { track: ftl.querySelector("#ft-track"), clock: ftl.querySelector("#ft-clock") };
        ftl.addEventListener("mouseenter", function () { st.tlHover = true; });
        ftl.addEventListener("mouseleave", function () { st.tlHover = false; renderFactoryTimeline(st); });
        if (st.hud.risks) { st.hud.risks.style.pointerEvents = "auto"; st.hud.risks.style.cursor = "pointer"; st.hud.risks.addEventListener("mouseenter", function () { st.risksHover = true; }); st.hud.risks.addEventListener("mouseleave", function () { st.risksHover = false; }); st.hud.risks.addEventListener("click", function (e) { var el = e.target.closest && e.target.closest("[data-rname]"); if (!el) return; var nm = el.getAttribute("data-rname"); var o = st.machines.concat(st.aux).filter(function (x) { return x.name === nm; })[0]; if (o) showEquipDetail(st, o); }); }
        // прямой доступ для демо-харнесса (не зависит от локализации подписей)
        st.showEquip = function (o) { if (o) showEquipDetail(st, o); };
        st.showOverlay = function (title, color, html) { showDetailOverlay(st, title, color, html); };
        st.bestRisk = function () { var pool = st.machines.concat(st.aux).filter(function (m) { return m.state !== "alarm" && m.state !== "repair"; }); pool.sort(function (a, b) { return rulHours(a) - rulHours(b); }); return pool[0] || st.machines[0]; };

        var jr = document.createElement("div"); jr.style.cssText = "position:absolute;left:14px;bottom:14px;width:344px;font-family:'Segoe UI',sans-serif;z-index:6;pointer-events:auto";
        jr.innerHTML = (window.miteTr||String)('<div style="font-size:11px;font-weight:700;letter-spacing:.4px;color:#cfd8e3;margin-bottom:5px;text-shadow:0 1px 3px #000">ЖУРНАЛ СОБЫТИЙ — клик, чтобы провалиться</div><div id="fj-list"></div>');
        element.appendChild(jr); st.journal = jr.querySelector("#fj-list");
        jr.addEventListener("mouseenter", function () { st.journalHover = true; });
        jr.addEventListener("mouseleave", function () { st.journalHover = false; renderJournal(st); });

        var cp = document.createElement("div"); cp.style.cssText = "position:absolute;right:14px;top:12px;width:332px;font-family:'Segoe UI',sans-serif;z-index:6;pointer-events:auto";
        cp.innerHTML = (window.miteTr||String)('<div style="background:rgba(38,16,16,0.9);color:#fff;border-radius:12px;padding:12px 14px;box-shadow:0 8px 26px rgba(0,0,0,.3)"><div style="font-size:11px;font-weight:700;letter-spacing:.4px;color:#ff9b9b">🚨 ИНЦИДЕНТЫ / ПРОСТОИ <span style="opacity:.6;font-weight:400">— клик</span></div><div id="fcp-sum" style="font-size:11px;opacity:.82;margin:5px 0 8px;line-height:1.5"></div><div id="fcp-list" style="font-size:12px;line-height:1.45"></div></div>');
        element.appendChild(cp); st.crit = { sum: cp.querySelector("#fcp-sum"), list: cp.querySelector("#fcp-list") };
        cp.addEventListener("mouseenter", function () { st.critHover = true; });
        cp.addEventListener("mouseleave", function () { st.critHover = false; renderCritical(st); });
        var cfp = document.createElement("div"); cfp.style.cssText = "position:absolute;right:14px;bottom:14px;width:244px;font-family:'Segoe UI',sans-serif;z-index:6;background:rgba(18,26,36,0.88);color:#fff;border-radius:10px;padding:10px 12px;box-shadow:0 8px 26px rgba(0,0,0,.3)"; element.appendChild(cfp); st.cfPanel = cfp;

        var ov = document.createElement("div"); ov.style.cssText = "position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(8,12,18,0.55);z-index:20;pointer-events:auto";
        ov.innerHTML = (window.miteTr||String)('<div id="fov-card" style="max-width:490px;background:#ffffff;color:#2a3543;border-radius:18px;padding:24px 26px;box-shadow:0 18px 60px rgba(0,0,0,.35);font-family:\'Segoe UI\',Arial,sans-serif"></div>');
        ov.onclick = function (e) { if (e.target === ov) ov.style.display = "none"; };
        element.appendChild(ov); st.overlay = ov; st.overlayCard = ov.querySelector("#fov-card");
    }
    function renderHud(st) {
        var s = st.stats, h = st.hud; if (!h) return;
        var av = st.availDen > 0 ? st.availNum / st.availDen : 1;
        var ql = (s.good + s.defect) > 0 ? s.good / (s.good + s.defect) : 1;
        var pf = st.elapsed > 0 ? Math.min(1, s.produced / (st.elapsed * st.idealRate)) : 0;
        var oee = av * pf * ql;
        h.oee.textContent = (window.miteTr||String)(Math.round(oee * 100) + "%");
        h.av.textContent = (window.miteTr||String)(Math.round(av * 100) + "%"); h.pf.textContent = (window.miteTr||String)(Math.round(pf * 100) + "%"); h.ql.textContent = (window.miteTr||String)(Math.round(ql * 100) + "%");
        h.prod.textContent = (window.miteTr||String)(fmt(s.produced)); h.def.textContent = (window.miteTr||String)(fmt(s.defect)); h.inc.textContent = (window.miteTr||String)(fmt(s.inc)); h.prev.textContent = (window.miteTr||String)(fmt(s.prevented));
        if (h.plProd) h.plProd.textContent = (window.miteTr||String)(rub(s.plProduct || 0));
        if (h.plOut) h.plOut.textContent = (window.miteTr||String)(rub(s.plOutput || 0));
        if (h.plFine) h.plFine.textContent = (window.miteTr||String)(rub(s.plFine || 0));
        var plTot = (s.plProduct || 0) + (s.plOutput || 0) + (s.plFine || 0);
        if (h.plTotal) h.plTotal.textContent = (window.miteTr||String)(rub(plTot));
        if (h.savedUnits) h.savedUnits.textContent = (window.miteTr||String)(fmt(s.savedUnits || 0));
        if (h.savedMonth) h.savedMonth.textContent = (window.miteTr||String)(rub(plTot * 22));
        if (h.kwh) h.kwh.textContent = (window.miteTr||String)(fmt(Math.round(st.energyKwh)));
        if (h.cost) h.cost.textContent = (window.miteTr||String)(fmt(Math.round(st.energyKwh * st.eco.energyTariff)));
        if (h.room) { h.room.textContent = (window.miteTr||String)(t1(st.roomTemp) + "°"); h.room.style.color = st.roomTemp > 28 ? "#ff8f8f" : st.roomTemp > 25 ? "#ffd24d" : "#7af0a3"; }
        if (h.inv) { var nH = st.aux.filter(function (a) { return a.shape === "hvac"; }).length, nC = st.aux.filter(function (a) { return a.shape === "compressor"; }).length, nS = (st.equipTypes.sensor && st.equipTypes.sensor.count) || 0; h.inv.innerHTML = (window.miteTr||String)("🏭 Оборудование: <b>" + st.machines.length + "</b> станков · <b>" + nH + "</b> кондиц. · <b>" + nC + "</b> компресс. · <b>" + nS + "</b> датчиков"); }
        if (h.risks && !st.risksHover) { var rk = st.machines.concat(st.aux).map(function (o) { return { o: o, rh: rulHours(o) }; }).sort(function (a, b) { return a.rh - b.rh; }).slice(0, 3); h.risks.innerHTML = (window.miteTr||String)('<div style="font-size:10px;letter-spacing:.4px;text-transform:uppercase;color:#ffd24d;margin-bottom:4px;font-weight:700">🔮 Прогноз · топ-риски (RUL) <span style="opacity:.6;font-weight:400">— клик</span></div>' + rk.map(function (r) { var busy = r.o.state === "alarm" || r.o.state === "repair"; return '<div data-rname="' + (r.o.name || "") + '" style="cursor:pointer;display:flex;justify-content:space-between;line-height:1.6"><span style="opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:175px">' + (r.o.name || "") + '</span><b style="color:' + rulColor(r.rh, r.o.state) + '">' + (busy ? "сервис" : "~" + rulText(r.rh)) + '</b></div>'; }).join("")); }
        if (h.line) h.line.innerHTML = (window.miteTr||String)(st.lines.map(function (ln, i) { return '<div style="color:' + (ln.stopped ? "#ff8f8f" : "#7af0a3") + '">Линия ' + (i + 1) + ': ' + (ln.stopped ? "⛔ простой — " + (ln.stopReason || "инцидент") : "▶ работает") + '</div>'; }).join(""));
    }
    function feed(st, title, color, detail, key) { var qn = st.eventQueue, last = qn[qn.length - 1]; if (key && last && last.key === key) { last.n = (last.n || 1) + 1; last.title = title; if (detail) last.detail = detail; return; } qn.push({ title: title, detail: detail || title, color: color || "#9fb4c8", key: key || ("k" + (++st.evId)), n: 1 }); if (qn.length > 30) qn.shift(); }
    function drainEvents(st, dt) { st.feedDrain += dt; if (st.feedDrain >= 1.1 && st.eventQueue.length) { st.feedDrain = 0; var e = st.eventQueue.shift(); e.id = ++st.evId; st.events.unshift(e); if (st.events.length > 40) st.events.pop(); renderJournal(st); } }
    function renderFactoryTimeline(st) {
        if (!st.tl || st.tlHover) return;
        var span = Math.max(45, st.simTime);
        var mins = 8 * 60 + Math.round(st.simTime * TSCALE);
        st.tl.clock.textContent = (window.miteTr||String)(("0" + (Math.floor(mins / 60) % 24)).slice(-2) + ":" + ("0" + (mins % 60)).slice(-2));
        st.tl.track.innerHTML = (window.miteTr||String)(st.critical.map(function (c) { var x = Math.min(99, (c.tDetect / span) * 100); var col = c.tResolve != null ? "#7af0a3" : c.color; return '<div data-crit="' + c.id + '" style="position:absolute;left:' + x.toFixed(1) + '%;top:2px;width:8px;height:12px;margin-left:-4px;border-radius:2px;background:' + col + ';cursor:pointer"></div>'; }).join("") + '<div style="position:absolute;right:0;top:0;width:2px;height:16px;background:#fff;opacity:.5"></div>');
        Array.prototype.forEach.call(st.tl.track.querySelectorAll("[data-crit]"), function (el) { el.onclick = function () { showCriticalDetail(st, +el.getAttribute("data-crit")); }; });
    }
    function renderJournal(st) { if (!st.journal || st.journalHover) return; st.journal.innerHTML = (window.miteTr||String)(st.events.slice(0, 5).map(function (ev) { return '<div data-ev="' + ev.id + '" style="cursor:pointer;background:rgba(18,26,36,0.92);border-left:3px solid ' + ev.color + ';border-radius:6px;padding:7px 10px;margin-bottom:5px;font-size:12px;color:#e7edf3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 8px rgba(0,0,0,.3)">' + ev.title + (ev.n > 1 ? ' <b style="color:#ffd24d">×' + ev.n + '</b>' : '') + '</div>'; }).join("")); Array.prototype.forEach.call(st.journal.querySelectorAll("[data-ev]"), function (el) { el.onclick = function () { var ev = st.events.filter(function (e) { return e.id === +el.getAttribute("data-ev"); })[0]; if (ev) showDetailOverlay(st, ev.title, ev.color, ev.detail); }; }); }

    function stepsHtml(steps) { steps = steps.filter(Boolean); return steps.map(function (s, i) { var col = s.s === "done" ? "#2fb56a" : s.s === "active" ? "#e8a400" : "#aeb6c2"; var ic = s.s === "done" ? "✓" : s.s === "active" ? "●" : ""; var line = i < steps.length - 1 ? '<div style="position:absolute;left:11px;top:25px;bottom:-3px;width:2px;background:#e6e9ef"></div>' : ''; return '<div style="position:relative;padding:0 0 17px 34px">' + line + '<div style="position:absolute;left:0;top:0;width:23px;height:23px;border-radius:50%;background:' + col + ';color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center">' + ic + '</div><div style="font-size:15px;font-weight:600;color:#16202e;line-height:1.3">' + s.t + '</div>' + (s.sub ? '<div style="font-size:13px;color:#6b7686;margin-top:2px;line-height:1.4">' + s.sub + '</div>' : '') + '</div>'; }).join(""); }
    function showDetailOverlay(st, title, color, html) { if (!st.overlay) return; st.overlayCard.innerHTML = (window.miteTr||String)('<div style="display:flex;align-items:center;gap:11px;margin-bottom:18px"><div style="width:6px;height:32px;border-radius:3px;background:' + (color || "#9fb4c8") + '"></div><div style="font-size:20px;font-weight:700;color:#0f141c">' + title + '</div></div>' + html + '<div style="text-align:right;margin-top:12px"><span id="fov-close" style="cursor:pointer;font-size:14px;font-weight:600;background:#eef1f5;color:#2a3543;padding:9px 22px;border-radius:11px">Закрыть</span></div>'); st.overlay.style.display = "flex"; var c = st.overlayCard.querySelector("#fov-close"); if (c) c.onclick = function () { st.overlay.style.display = "none"; }; }
    // контрфакт «с датчиками / без»: две расходящиеся кривые накопленных потерь
    function renderCf(st) {
        if (!st.cf || !st.cfPanel) return;
        var wh = st.cf.woHist, sh = st.cf.withHist;
        var woNow = wh.length ? wh[wh.length - 1] : 0, withNow = sh.length ? sh[sh.length - 1] : 0, gap = woNow - withNow;
        var mx = Math.max(woNow, 1), n = wh.length, W = 220, H = 42;
        function pts(arr) { if (arr.length < 2) return ""; return arr.map(function (v, i) { return (i * (W / (n - 1))).toFixed(1) + "," + (H - Math.min(1, v / mx) * (H - 4)).toFixed(1); }).join(" "); }
        st.cfPanel.innerHTML = (window.miteTr||String)('<div style="font-size:10px;text-transform:uppercase;letter-spacing:.4px;opacity:.72;color:#ffd24d;margin-bottom:5px">📉 С датчиками / без · потери смены</div>'
            + '<svg width="' + W + '" height="' + H + '" style="display:block;background:rgba(255,255,255,.05);border-radius:5px"><polyline points="' + pts(wh) + '" fill="none" stroke="#ff7a7a" stroke-width="2"/><polyline points="' + pts(sh) + '" fill="none" stroke="#7af0a3" stroke-width="2"/></svg>'
            + '<div style="font-size:11px;margin-top:6px;color:#ff9b9b">● без датчиков: <b>' + rub(woNow) + '</b></div>'
            + '<div style="font-size:11px;color:#7af0a3">● с датчиками (факт): <b>' + rub(withNow) + '</b></div>'
            + '<div style="font-size:13px;font-weight:800;color:#7af0a3;margin-top:3px;border-top:1px solid rgba(255,255,255,.12);padding-top:4px">эффект системы: ' + rub(gap) + '</div>');
    }

    function addCritical(st, rec) { st.critId += 1; var c = { id: st.critId, head: rec.head, line: rec.line, color: rec.color || "#ff7a7a", tDetect: st.simTime, tResolve: null, status: "active", scenario: rec.scenario || null, buyMat: false, kind: rec.kind }; st.critical.unshift(c); if (st.critical.length > 60) st.critical.pop(); renderCritical(st); return c; }
    function resolveCritical(st, c) { if (!c || c.tResolve != null) return; c.tResolve = st.simTime; c.status = "resolved"; renderCritical(st); }
    function renderCritical(st) { if (!st.crit || st.critHover) return; var list = st.critical, resolved = list.filter(function (c) { return c.tResolve != null; }); var avg = resolved.length ? Math.round(resolved.reduce(function (s, c) { return s + (c.tResolve - c.tDetect); }, 0) / resolved.length * TSCALE) : 0; st.crit.sum.innerHTML = (window.miteTr||String)("Инцидентов: <b>" + list.length + "</b> · ср. устранение: <b>" + (avg < 60 ? avg + " мин" : Math.floor(avg / 60) + " ч " + (avg % 60) + " мин") + "</b><br>Предотвращено отказов: <b style=\"color:#7af0a3\">" + st.stats.prevented + "</b> · брак: <b style=\"color:#ff9b9b\">" + st.stats.defect + "</b><br>💰 Спасено: <b style=\"color:#7af0a3\">" + rub(st.stats.savedRub || 0) + "</b> · <b style=\"color:#7af0a3\">" + fmt(st.stats.savedUnits || 0) + " ед</b> не в утиль"); st.crit.list.innerHTML = (window.miteTr||String)(list.slice(0, 5).map(function (c) { var s2 = c.status === "active" ? '<span style="color:#ffce4a">● идёт ' + dur(st.simTime - c.tDetect) + '</span>' : '<span style="color:#7af0a3">✓ устранено за ' + dur(c.tResolve - c.tDetect) + '</span>'; return '<div data-crit="' + c.id + '" style="cursor:pointer;border-left:3px solid ' + c.color + ';padding:5px 9px;margin-bottom:5px;background:rgba(255,255,255,.05);border-radius:5px"><div>Линия <b>' + c.line + '</b>: ' + c.head + '</div><div style="font-size:11px;opacity:.82">' + s2 + '</div></div>'; }).join("")); Array.prototype.forEach.call(st.crit.list.querySelectorAll("[data-crit]"), function (el) { el.onclick = function () { showCriticalDetail(st, +el.getAttribute("data-crit")); }; }); }
    function showCriticalDetail(st, id) {
        var c = st.critical.filter(function (x) { return x.id === id; })[0]; if (!c) return; var sc = c.scenario, resolved = c.tResolve != null;
        var steps = [
            { t: "Датчик зафиксировал отклонение", s: "done", sub: c.head + (sc ? " · " + sc.root : "") },
            { t: c.kind === "conveyor" ? "Линия остановлена (простой)" : "Линия остановлена, узел изолирован", s: "done", sub: "защита оборудования и продукции" },
            { t: "Вызван наладчик", s: "done", sub: "SLA реакции ~2 ч" },
            { t: resolved ? "Наладчик устранил" : "Наладчик в пути", s: resolved ? "done" : "active", sub: sc ? sc.repair + (sc.risk ? " · риск «" + sc.risk + "» предотвращён" : "") : "" },
            sc && sc.mat && sc.mat.length ? { t: c.buyMat ? "Заказ ЗИП сформирован (нет на складе)" : "ЗИП списан со склада", s: resolved ? "done" : "wait", sub: sc.mat[0] + " " + sc.mat[1] + " шт" } : null,
            { t: resolved ? "Линия запущена — инцидент закрыт" : "Восстановление", s: resolved ? "done" : "wait", sub: resolved ? "устранено за " + dur(c.tResolve - c.tDetect) : "идёт " + dur(st.simTime - c.tDetect) }
        ];
        showDetailOverlay(st, c.head + " — линия " + c.line, c.color, stepsHtml(steps) + (c.benefit ? benefitLine(c.benefit) : ""));
    }
    function showMachineDetail(st, m) { showEquipDetail(st, m); }
    // ---- звук ----
    function toggleSound(st, btn) { st.soundOn = !st.soundOn; if (st.soundOn && !st.audio) { try { st.audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { st.audio = null; } } if (st.audio && st.audio.state === "suspended") st.audio.resume(); btn.textContent = (window.miteTr||String)(st.soundOn ? "🔊 Звук: вкл" : "🔊 Звук: выкл"); btn.style.color = st.soundOn ? "#7af0a3" : "#cfd8e3"; if (st.soundOn) beep(st, 760, 0.08, 0.05); }
    function beep(st, f, d, v) { if (!st.soundOn || !st.audio) return; try { var t = st.audio.currentTime, o = st.audio.createOscillator(), g = st.audio.createGain(); o.frequency.value = f; o.type = "sine"; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g); g.connect(st.audio.destination); o.start(t); o.stop(t + d + 0.02); } catch (e) { } }

    function build(element) {
        killDevTooltips();
        var THREE = window.THREE;
        var scene = new THREE.Scene(); scene.background = new THREE.Color(0xeef1f5);
        var camera = new THREE.PerspectiveCamera(45, 1, 1, 9000);
        var renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(window.devicePixelRatio || 1); element.appendChild(renderer.domElement); renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
        scene.add(new THREE.AmbientLight(0xffffff, 0.8)); var d1 = new THREE.DirectionalLight(0xffffff, 0.55); d1.position.set(0.6, 1, 0.4); scene.add(d1);
        var world = new THREE.Group(); scene.add(world);
        var orbit = { target: new THREE.Vector3(), radius: 420, theta: -0.62, phi: 0.62 };
        var st = {
            THREE: THREE, camera: camera, renderer: renderer, scene: scene, world: world, orbit: orbit, raycast: [],
            anim: [], lines: [], machines: [], wip: [], layer: "vib", soundOn: false, audio: null, tickT: 0, simTime: 0,
            events: [], evId: 0, eventQueue: [], feedDrain: 0, critical: [], critId: 0, serverScen: {},
            journalHover: false, critHover: false, idealRate: 0.9, elapsed: 0, availNum: 0, availDen: 0, spawnT: 0,
            equipTypes: {}, units: {}, hvac: null, aux: [], roomTemp: 22, roomBase: 22, energyKwh: 0, energyKw: 0, energyT: 0, histT: 0,
            eco: { unitPrice: 480, downtimeRate: 12000, energyTariff: 7, fineRisk: 150000, capex: 450000 },
            cf: { withHist: [], woHist: [], t: 0 },
            stats: { produced: 0, good: 0, defect: 0, inc: 0, prevented: 0, savedRub: 0, savedUnits: 0, scrapAvoided: 0, plProduct: 0, plOutput: 0, plFine: 0, downtimeH: 0 }
        };
        element.__wh = st; element.__rebuild = function (d) { rebuild(st, d); }; buildHud(element, st);
        ["mousedown", "click", "dblclick", "contextmenu"].forEach(function (ev) { element.addEventListener(ev, function (e) { e.stopPropagation(); }); });
        st.setLayer = function (name) { st.layer = name; Object.keys(st.layerBtns).forEach(function (k) { st.layerBtns[k].style.background = (k === name) ? "#3a7bd5" : "transparent"; st.layerBtns[k].style.color = (k === name) ? "#fff" : "#cfd8e3"; }); recolorAll(st); };
        st.applyCamera = function () { var o = orbit, r = o.radius, s = Math.sin(o.phi), cp = Math.cos(o.phi); camera.position.set(o.target.x + r * s * Math.cos(o.theta), o.target.y + r * cp, o.target.z + r * s * Math.sin(o.theta)); camera.lookAt(o.target); };
        st.resize = function () { var w = element.clientWidth || 800, h = element.clientHeight || 560; if (h < 60 || h > 1600) h = 560; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
        if (window.ResizeObserver) { st.ro = new ResizeObserver(st.resize); st.ro.observe(element); }
        var drag = null;
        renderer.domElement.addEventListener("mousedown", function (e) { drag = { x: e.clientX, y: e.clientY, t: orbit.theta, p: orbit.phi, moved: false }; });
        window.addEventListener("mousemove", function (e) { if (!drag) return; var dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; orbit.theta = drag.t - dx * 0.006; orbit.phi = Math.max(0.18, Math.min(1.45, drag.p - dy * 0.006)); });
        window.addEventListener("mouseup", function (e) { if (drag && !drag.moved) pick(e); drag = null; });
        renderer.domElement.addEventListener("wheel", function (e) { e.preventDefault(); orbit.radius = Math.max(70, Math.min(3200, orbit.radius * (1 + (e.deltaY > 0 ? 0.1 : -0.1)))); }, { passive: false });
        var ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
        function pick(e) { var rect = renderer.domElement.getBoundingClientRect(); mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1; mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1; ray.setFromCamera(mouse, camera); var hit = ray.intersectObjects(st.raycast, false)[0]; if (hit) { var u = hit.object.userData; if (u.machine) showEquipDetail(st, u.machine); else if (u.equip) showEquipDetail(st, u.equip); else if (u.line) focusLine(st, u.line); } }
        function pnow() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
        (function loop() { st.raf = requestAnimationFrame(loop); var t = pnow() / 1000; st.anim.forEach(function (f) { f(t); }); renderHud(st); st.applyCamera(); renderer.render(scene, camera); })();
        if (st.sim) clearInterval(st.sim); var lastSim = pnow();
        st.sim = setInterval(function () { var now = pnow(), dt = Math.min(0.2, (now - lastSim) / 1000); lastSim = now; simulate(st, dt); }, 50);
        st.resize();
    }

    function recolorAll(st) {
        st.machines.forEach(function (m) {
            var col;
            if (m.state === "alarm" || m.state === "repair") col = 0xd23b3b;
            else if (st.layer === "vib") col = m.vib > 7 ? 0xd23b3b : m.vib > 4 ? 0xe0a800 : 0x2f9e6e;
            else if (st.layer === "temp") col = m.temp > 70 ? 0xd23b3b : m.temp > 55 ? 0xe0a800 : 0x2f9e6e;
            else if (st.layer === "load") col = m.load > 90 ? 0xd23b3b : m.load > 75 ? 0xe0a800 : 0x3a7bd5;
            else if (st.layer === "energy") { var pw = (m.powerKw || 7.5) * (0.55 + m.load / 200); col = pw > 9 ? 0xd23b3b : pw > 6.5 ? 0xe0a800 : 0x3a7bd5; }
            else if (st.layer === "climate") col = st.roomTemp > 28 ? 0xd23b3b : st.roomTemp > 25 ? 0xe0a800 : 0x2f9e6e;
            else col = m.line.stopped ? 0xd23b3b : 0x2f9e6e;
            m.body.material.color.setHex(col);
        });
        st.aux.forEach(function (a) {
            var hc, base = a.shape === "compressor" ? 0x9098a3 : 0x7f8a99;
            if (a.state === "alarm" || a.state === "repair") hc = 0xd23b3b;
            else if (st.layer === "climate") hc = st.roomTemp > 28 ? 0xd23b3b : st.roomTemp > 25 ? 0xe0a800 : 0x2f9e6e;
            else if (st.layer === "energy") hc = 0xe0a800;
            else if (st.layer === "temp") hc = a.eff < 80 ? 0xd23b3b : a.eff < 92 ? 0xe0a800 : 0x2f9e6e;
            else if (st.layer === "vib") hc = a.vib > a.vibMax ? 0xd23b3b : a.vib > a.vibMax * 0.6 ? 0xe0a800 : 0x2f9e6e;
            else hc = base;
            a.body.material.color.setHex(hc);
        });
    }

    function addLine(st, idx, z, len) {
        var THREE = st.THREE, w = 16; len = len || 220;
        var line = { idx: idx, z: z, len: len, x0: -len / 2, x1: len / 2, machines: [], speed: 26, stopped: false, stopReason: "", qx: len / 2 - 30 };
        var belt = mk(THREE, new THREE.BoxGeometry(len, 4, w), 0x3a4049); belt.position.set(0, 8, z); belt.userData.line = line; st.world.add(belt); st.raycast.push(belt);
        var top = mk(THREE, new THREE.BoxGeometry(len, 1.5, w - 3), 0x586273); top.position.set(0, 10.4, z); top.userData.line = line; st.world.add(top); st.raycast.push(top); line.topMesh = top;
        [-len / 2, len / 2].forEach(function (x) { var roller = mk(THREE, new THREE.CylinderGeometry(4, 4, w, 16), 0x9aa3ad); roller.rotation.x = Math.PI / 2; roller.position.set(x, 8, z); st.world.add(roller); });
        // бегущие полоски ленты
        var stripes = [];
        for (var s = 0; s < 14; s++) { var st2 = mk(THREE, new THREE.BoxGeometry(6, 0.6, w - 4), 0x6b7686); st2.position.set(line.x0 + s * (len / 14), 11.2, z); st.world.add(st2); stripes.push(st2); }
        line.stripes = stripes; line.stripeStep = len / 14;
        st.lines.push(line);   // без подписи «Линия N» — чистый вид
        return line;
    }
    function addMachine(st, line, x, name) {
        var THREE = st.THREE, g = new THREE.Group(); g.position.set(x, 0, line.z - 18);
        // авто-фигура станка по имени (Дозатор/Смеситель/Фасовка/... → узнаваемая машина; иначе generic-блок)
        var __figMeshes = [], __fig = window.miteShapeLib ? window.miteShapeLib(THREE, name, 26) : null, body, motor = null;
        if (__fig) { g.add(__fig.group); body = __fig.bodies[0]; __fig.group.traverse(function (o) { if (o.isMesh) { st.raycast.push(o); __figMeshes.push(o); } }); }
        else { body = mk(THREE, new THREE.BoxGeometry(20, 26, 18), 0x8a929c); body.position.set(0, 13, 0); g.add(body); st.raycast.push(body); }
        st.world.add(g);
        var tag = makeLabel(THREE, 256, 64); tag.sprite.scale.set(30, 7.5, 1); tag.sprite.position.set(x, 36, line.z - 18); tag.sprite.visible = false; st.world.add(tag.sprite);
        var et = st.equipTypes.machine || {};
        var m = { name: name, line: line, x: x, group: g, body: body, motor: motor, tag: tag, vib: 1.2, temp: 38, load: 70, health: 100, state: "ok", degradeT: 40 + Math.random() * 40, repairT: 0, repairPending: 0, alarmAt: 0, crit: null,
            shape: "machine", vibMax: et.vibMax || 7, powerKw: et.powerKw || 7.5, runtime: 600 + Math.floor(Math.random() * 1400), mtbf: et.mtbf || 2000, spare: et.spare || "подшипник", spareQty: (et.spareQty != null ? et.spareQty : 6), lastTO: 0, hist: [] };
        m.unit = st.units[name] || null; body.userData.machine = m; __figMeshes.forEach(function (o) { o.userData.machine = m; }); line.machines.push(m); st.machines.push(m);
        st.anim.push(function (t) { if (motor) motor.rotation.x = t * (4 + m.vib); var amp = Math.max(0, m.vib - 1.5) * 0.4; g.position.x = x + amp * Math.sin(t * 40); if (m.state === "alarm") { var k = 0.4 + 0.4 * Math.sin(t * 6); if (body.material.emissive) body.material.emissive.setRGB(0.6 * k, 0.05 * k, 0); } else if (body.material.emissive) body.material.emissive.setRGB(0, 0, 0); });
        return m;
    }
    // ---- климат-агрегаты (кондиционеры/компрессоры) из справочника, кол-во из etCount ----
    function addAux(st, shape, idx, total, fw, fd) {
        var THREE = st.THREE, et = st.equipTypes[shape] || {}, isComp = shape === "compressor";
        var spanX = Math.max(60, fw - 90), px = total > 1 ? (-spanX / 2 + idx * (spanX / (total - 1))) : (-fw / 2 + 44), pz = -fd / 2 + 30;
        var g = new THREE.Group(); g.position.set(px, 0, pz);
        // авто-фигура: компрессор или чиллер/кондиционер цеха
        var __auxMeshes = [], __afig = window.miteShapeLib ? window.miteShapeLib(THREE, isComp ? "Компрессор" : "Кондиционер цеха", isComp ? 30 : 28) : null, body, blade = null;
        if (__afig) { g.add(__afig.group); body = __afig.bodies[0]; __afig.group.traverse(function (o) { if (o.isMesh) { st.raycast.push(o); __auxMeshes.push(o); } }); }
        else { body = mk(THREE, new THREE.BoxGeometry(isComp ? 26 : 34, isComp ? 34 : 30, 22), isComp ? 0x9098a3 : 0x7f8a99); body.position.set(0, isComp ? 17 : 15, 0); g.add(body); st.raycast.push(body); }
        st.world.add(g);
        var tag = makeLabel(THREE, 256, 64); tag.sprite.scale.set(36, 9, 1); tag.sprite.position.set(px, isComp ? 46 : 42, pz); tag.sprite.visible = false; st.world.add(tag.sprite);
        // без подписи агрегата — чистый вид (тип виден по фигуре, детали — в карточке по клику)
        var a = {
            name: (et.name || (isComp ? "Компрессор" : "Кондиционер цеха")) + (total > 1 ? " #" + (idx + 1) : ""), shape: shape, cool: true, x: px, z: pz, group: g, body: body, blade: blade, tag: tag,
            vib: 1.2, temp: isComp ? 42 : 34, baseTemp: isComp ? 42 : 34, eff: 100, health: 100, load: 0, state: "ok", degradeT: 55 + Math.random() * 55, repairPending: 0, repairT: 0,
            vibMax: et.vibMax || (isComp ? 7 : 6.5), powerKw: et.powerKw || (isComp ? 15 : 12), mtbf: et.mtbf || 1500, runtime: 700 + Math.floor(Math.random() * 800),
            spare: et.spare || (isComp ? "хладагент R404" : "фильтры"), spareQty: (et.spareQty != null ? et.spareQty : (isComp ? 2 : 4)), lastTO: 0, crit: null, hist: []
        };
        a.unit = st.units[a.name] || null; body.userData.equip = a; __auxMeshes.forEach(function (o) { o.userData.equip = a; }); st.aux.push(a);
        st.anim.push(function (t) { if (blade) blade.rotation.z = t * (5 + a.vib); var amp = Math.max(0, a.vib - 1.5) * 0.4; g.position.x = px + amp * Math.sin(t * 38); if (a.state === "alarm") { var k = 0.4 + 0.4 * Math.sin(t * 6); if (body.material.emissive) body.material.emissive.setRGB(0.6 * k, 0.05 * k, 0); } else if (body.material.emissive) body.material.emissive.setRGB(0, 0, 0); });
        return a;
    }
    function raiseAux(st, a) {
        a.state = "alarm"; a.repairPending = 12; st.stats.inc += 1;
        var sc = pickScenario(st, (st.equipTypes[a.shape] && st.equipTypes[a.shape].kind) || "cold"); a.scenario = sc;
        a.crit = addCritical(st, { head: sc.cause, line: (a.shape === "compressor" ? "компрессор" : "климат"), color: "#ff7a7a", scenario: sc, kind: a.shape }); a.crit.alarmAt = st.simTime;
        if (a.tag) { a.tag.sprite.visible = true; drawTag(a.tag, "СЕРВИС ВЫЗВАН · вибр " + t1(a.vib), "#d23b3b"); }
        feed(st, "❄ " + sc.cause + " — " + a.name, "#ff9b4a", "Датчики «" + a.name + "»: вибрация <b>" + t1(a.vib) + " мм/с</b>, эффективность <b>" + Math.round(a.eff) + "%</b>. " + sc.root + ".<br>Датчик поймал заранее: под наблюдением, сервис вызван (реакция ~2 ч). Рост t° цеха повышает брак — реагируем до отказа.", "aux-alarm-" + a.name);
        beep(st, 900, 0.14, 0.08);
    }
    function auxFix(st, a) {
        a.state = "ok"; a.vib = 1.2; a.eff = 100; a.health = 100; a.degradeT = 70 + Math.random() * 50; a.lastTO = st.simTime; a.runtime = 0;
        var c = a.crit; if (c) {
            var sc = c.scenario, inStock = a.spareQty > 0; if (inStock) a.spareQty -= 1; resolveCritical(st, c); st.stats.prevented += 1;
            var matLine = inStock ? "ЗИП списан: <b>" + a.spare + "</b> (остаток " + a.spareQty + " шт)." : "ЗИП <b>" + a.spare + "</b> — нет на складе, заявка поставщику.";
            var scrapUnits = Math.round((180 + Math.random() * 420) * riskPct(sc)), productRub = Math.round(scrapUnits * st.eco.unitPrice);
            var stabMin = 20 + Math.round(Math.random() * 25), spoilDays = 2 + Math.round(Math.random() * 4);
            st.stats.plProduct += productRub; st.stats.savedUnits += scrapUnits; st.stats.scrapAvoided += scrapUnits; st.stats.savedRub += productRub;
            c.benefit = "датчик поймал заранее: <b>стабилизация ~" + stabMin + " мин</b> вместо порчи партии за ~" + spoilDays + " сут → <b>" + fmt(scrapUnits) + " ед</b> готовой продукции <b>не ушло в утиль</b> (<b>" + rub(productRub) + "</b>).";
            feed(st, "✅ Сервис завершён — " + a.name + " · спасено " + rub(productRub), "#7af0a3", "«" + a.name + "»: <b>" + (sc ? sc.repair : "обслуживание") + "</b>. Эффективность 100%, t° цеха возвращается к норме. Риск «" + (sc ? sc.risk : "рост t° и брак") + "» предотвращён.<br>" + matLine + benefitLine(c.benefit) + '<div style="margin-top:7px;font-size:12px;color:#3a7bd5">📄 Наряд ТОиР создан · ЗИП списан со склада</div>', "aux-fix-" + a.name);
            sendWorkOrder(st, { object: "Цех · " + a.name, cause: sc ? sc.cause : "", act: sc ? sc.repair : "", risk: sc ? sc.risk : "", spare: a.spare || "", qty: 1, saved: productRub });
            if (!inStock) feed(st, "📋 Заказ ЗИП — " + a.spare, "#9fc2f0", "На складе закончился <b>" + a.spare + "</b> для «" + a.name + "». Создана заявка поставщику.", "aux-buy-" + a.name);
        }
        a.crit = null;
    }
    // ---- паспорт оборудования (клик по станку/HVAC) + история датчика ----
    function miniGraph(hist, mx) {
        if (!hist || hist.length < 2) return '<div style="font-size:12px;color:#aeb6c2;margin-top:6px">данных пока мало…</div>';
        var w = 282, hg = 58, n = hist.length, m = mx || 8;
        var pts = hist.map(function (v, i) { return (i * (w / (n - 1))).toFixed(1) + "," + (hg - Math.min(1, v / m) * (hg - 6)).toFixed(1); }).join(" ");
        return '<svg width="' + w + '" height="' + hg + '" style="margin-top:6px;background:#fafbfc;border:1px solid #e6e9ee;border-radius:5px"><polyline points="' + pts + '" fill="none" stroke="#3a7bd5" stroke-width="2"/></svg>';
    }
    function showEquipDetail(st, o) {
        var isCool = !!o.cool, typeTxt = o.shape === "hvac" ? "Кондиционер / чиллер цеха" : o.shape === "compressor" ? "Компрессор" : "Станок линии " + (o.line ? o.line.idx + 1 : "");
        var color = (o.state === "alarm" || o.state === "repair") ? "#e24b4a" : o.state === "degrading" ? "#e8a400" : "#2fb56a";
        var stateTxt = { ok: "в норме", degrading: "ранний износ — наблюдение", alarm: "сервис вызван", repair: "идёт обслуживание" }[o.state] || o.state;
        var rows = [
            ["Тип", typeTxt],
            ["Состояние", stateTxt],
            ["Наработка", Math.round(o.runtime) + " ч  ·  ТО при " + o.mtbf + " ч"],
            ["Вибрация", t1(o.vib) + " мм/с  (норма ≤ " + o.vibMax + ")"],
            isCool ? ["Эффективность охлаждения", Math.round(o.eff) + " %"] : ["t° / загрузка", Math.round(o.temp) + "°  /  " + Math.round(o.load) + "%"],
            ["Мощность", t1(o.powerKw * (isCool ? (1 + (100 - o.eff) * 0.012) : (0.55 + o.load / 200))) + " кВт"],
            ["ЗИП на складе", (o.spare || "—") + (o.spare ? " — " + o.spareQty + " шт" : "")],
            ["Последнее ТО", o.lastTO ? dur(st.simTime - o.lastTO) + " назад" : "с начала смены"],
            ["Прогноз отказа (RUL)", (o.state === "alarm" || o.state === "repair") ? "в обслуживании" : "через ~" + rulText(rulHours(o))],
            ["Источник данных", (o.unit && o.unit.source === "live") ? ("🟢 датчик " + (o.unit.dev || "") + (o.unit.value !== "" ? " · " + o.unit.value : "")) : "—"]
        ];
        var rh = rulHours(o), rec = (o.state === "alarm" || o.state === "repair") ? "Идёт обслуживание — сервис на месте." : rh < 2 ? "🔴 Критично: вызвать наладчика, плановая замена в ближайшую смену." : rh < 6 ? "🟡 Под наблюдением: запланировать ТО, проверить ЗИП на складе." : "🟢 В норме: плановый ресурс достаточен.";
        var due = o.mtbf > 0 ? Math.max(0, Math.min(1, o.runtime / o.mtbf)) : 0;
        var bar = o.mtbf > 0 ? '<div style="margin-top:10px"><div style="font-size:12px;color:#6b7686;margin-bottom:4px">Ресурс до планового ТО</div><div style="height:9px;background:#eef1f5;border-radius:5px;overflow:hidden"><div style="height:100%;width:' + Math.round(due * 100) + '%;background:' + (due > 0.85 ? "#e24b4a" : due > 0.6 ? "#e8a400" : "#2fb56a") + '"></div></div></div>' : "";
        var html = '<table style="width:100%;border-collapse:collapse;font-size:14px">' + rows.map(function (r) { return '<tr><td style="padding:6px 0;color:#6b7686">' + r[0] + '</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#16202e">' + r[1] + '</td></tr>'; }).join("") + '</table>' + bar
            + '<div style="margin-top:12px;font-size:12px;color:#6b7686">История вибрации (датчик)</div>' + miniGraph(o.hist, Math.max(o.vibMax * 1.4, 8))
            + '<div style="margin-top:10px;padding:9px 11px;background:#f2f6fb;border:1px solid #dce4ee;border-radius:8px;font-size:13px;color:#2a3543"><b>Рекомендация системы:</b> ' + rec + '</div>';
        showDetailOverlay(st, (o.shape === "hvac" ? "❄ " : "⚙ ") + o.name, color, html);
    }
    function resetView(st) { if (!st.viewHome) return; st.orbit.target.set(st.viewHome.tx, st.viewHome.ty, st.viewHome.tz); st.orbit.radius = st.viewHome.radius; st.applyCamera(); }
    function focusLine(st, line) { st.orbit.target.set(0, 12, line.z); st.orbit.radius = Math.max(150, line.len * 0.92); st.applyCamera(); showLineDetail(st, line); }
    function showLineDetail(st, line) {
        var wip = st.wip.filter(function (p) { return p.line === line; }).length;
        var statusTxt = line.stopped ? "⛔ простой — " + (line.stopReason || "инцидент") : "▶ работает";
        var html = '<div style="font-size:14px;color:#2a3543;margin-bottom:12px">Статус: <b>' + statusTxt + '</b> · на линии <b>' + wip + '</b> ед · станков: <b>' + line.machines.length + '</b></div>'
            + '<div style="font-size:12px;color:#6b7686;margin-bottom:6px">Станки линии (клик — паспорт):</div>'
            + line.machines.map(function (m, i) { var col = (m.state === "alarm" || m.state === "repair") ? "#e24b4a" : m.state === "degrading" ? "#e8a400" : "#2fb56a"; return '<div data-mi="' + i + '" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;padding:9px 11px;margin-bottom:5px;background:#f2f6fb;border-radius:7px;border-left:3px solid ' + col + '"><span style="font-weight:600;color:#16202e">' + m.name + '</span><span style="font-size:13px;color:#6b7686">вибр ' + t1(m.vib) + " · RUL ~" + rulText(rulHours(m)) + '</span></div>'; }).join("")
            + '<div style="margin-top:12px"><span id="line-back" style="cursor:pointer;font-size:13px;font-weight:600;color:#3a7bd5">← Весь цех (сбросить камеру)</span></div>';
        showDetailOverlay(st, "Линия " + (line.idx + 1), line.stopped ? "#e24b4a" : "#2fb56a", html);
        Array.prototype.forEach.call(st.overlayCard.querySelectorAll("[data-mi]"), function (el) { el.onclick = function () { showEquipDetail(st, line.machines[+el.getAttribute("data-mi")]); }; });
        var bk = st.overlayCard.querySelector("#line-back"); if (bk) bk.onclick = function () { resetView(st); st.overlay.style.display = "none"; };
    }
    function showPLDetail(st) {
        var s = st.stats, tot = (s.plProduct || 0) + (s.plOutput || 0) + (s.plFine || 0);
        var rowsHtml = [
            ["Готовая продукция не в утиль", s.plProduct || 0, fmt(s.savedUnits || 0) + " ед спасено от брака — климат/холод удержан в норме"],
            ["Простой/недовыпуск предотвращён", s.plOutput || 0, "≈ " + Math.round((s.downtimeH || 0) / 8) + " дней внепланового простоя не случилось — замены в плановые окна по 20–40 мин"],
            ["Штрафы за срыв поставки", s.plFine || 0, "неустойки за срыв заказов не возникли"]
        ].map(function (r) { return '<div style="padding:9px 0;border-bottom:1px solid #eef1f5"><div style="display:flex;justify-content:space-between"><span style="font-weight:600;color:#16202e">' + r[0] + '</span><b style="color:#15692f">' + rub(r[1]) + '</b></div><div style="font-size:12px;color:#6b7686;margin-top:2px">' + r[2] + '</div></div>'; }).join("");
        var html = rowsHtml
            + '<div style="display:flex;justify-content:space-between;margin-top:10px;font-size:17px"><span style="font-weight:700;color:#16202e">Итого за смену</span><b style="color:#15692f">' + rub(tot) + '</b></div>'
            + '<div style="margin-top:12px;padding:10px 12px;background:#eafaf0;border:1px solid #bfe8cf;border-radius:8px;font-size:13px;color:#15692f">Откуда экономия: ранняя реакция по датчикам превратила <b>' + (s.prevented || 0) + '</b> потенциальных аварий в плановые замены за минуты — вместо часов простоя и порчи готовой продукции.</div>';
        showDetailOverlay(st, "💰 Откуда экономия · смена", "#2fb56a", html);
    }
    function spawnWIP(st, line) {
        var THREE = st.THREE, m = mk(THREE, new THREE.BoxGeometry(8, 8, 8), 0x9bb0cf); m.position.set(line.x0, 16, line.z); st.world.add(m);
        st.wip.push({ mesh: m, line: line, x: line.x0, good: true, checked: false });
    }

    function lineFix(st, line, m) {
        line.stopped = false; line.stopReason = "";
        if (m) { m.state = "ok"; m.vib = 1.2; m.temp = 38; m.health = 100; m.degradeT = 45 + Math.random() * 40; if (m.tag) m.tag.sprite.visible = false; }
        var c = (m && m.crit) || line.crit; if (c) { var sc = c.scenario, inStock = Math.random() < 0.6, mat = sc && sc.mat || []; c.buyMat = (!inStock && mat.length > 0); resolveCritical(st, c); st.stats.prevented += 1;
            var matLine = !mat.length ? "Материалы не требовались." : (inStock ? "ЗИП списан: <b>" + mat[0] + " " + mat[1] + " шт</b> (со склада)." : "ЗИП заказан: <b>" + mat[0] + " " + mat[1] + " шт</b> — нет на складе, заявка поставщику.");
            var avoidedDays = 7 + Math.round(Math.random() * 14), plannedMin = 15 + Math.round(Math.random() * 30), dailyOut = 30 + Math.round(Math.random() * 30);
            var lostUnits = Math.round(avoidedDays * dailyOut * riskPct(sc));
            var wkTxt = avoidedDays >= 14 ? Math.round(avoidedDays / 7) + " нед" : (avoidedDays >= 7 ? "1–2 нед" : avoidedDays + " дн");
            var outputRub = Math.round(lostUnits * st.eco.unitPrice), fineRub = (riskPct(sc) > 0.6 && Math.random() < 0.45) ? st.eco.fineRisk : 0;
            st.stats.plOutput += outputRub; st.stats.plFine += fineRub; st.stats.downtimeH += avoidedDays * 8; st.stats.savedRub += outputRub + fineRub;
            c.benefit = "датчик поймал заранее: <b>плановая замена ~" + plannedMin + " мин</b> вместо <b>~" + wkTxt + " аварийного простоя</b> → не потеряли <b>" + fmt(lostUnits) + " ед</b> выпуска (<b>" + rub(outputRub) + "</b>)" + (fineRub ? " + штраф за срыв <b>" + rub(fineRub) + "</b>" : "") + ".";
            feed(st, "✅ Наладчик устранил — линия " + (line.idx + 1) + " · спасено " + rub(outputRub + fineRub), "#7af0a3", "Линия " + (line.idx + 1) + (m ? ", станок " + m.name : "") + ". Реакция: <b>~" + dur(c.alarmAt != null ? (st.simTime - c.alarmAt) : 24) + "</b>.<br>Причина: " + (sc ? sc.root : "—") + ".<br>Выполнено: <b>" + (sc ? sc.repair : "—") + "</b>. Риск «" + (sc ? sc.risk : "отказ") + "» предотвращён.<br>" + matLine + benefitLine(c.benefit) + '<div style="margin-top:7px;font-size:12px;color:#3a7bd5">📄 Наряд ТОиР создан · ЗИП списан со склада</div>', "fix-" + (m ? m.name : line.idx));
            sendWorkOrder(st, { object: "Цех · линия " + (line.idx + 1) + (m ? " · " + m.name : ""), cause: sc ? sc.cause : "", act: sc ? sc.repair : "", risk: sc ? sc.risk : "", spare: mat[0] || "", qty: mat[1] || 0, saved: outputRub + fineRub });
            if (c.buyMat) feed(st, "📋 Заказ ЗИП — " + mat[0] + " " + mat[1] + " шт", "#9fc2f0", "На складе закончились <b>" + mat[0] + "</b>. Создана заявка поставщику на <b>" + mat[1] + " шт</b>.", "buy-" + (m ? m.name : line.idx)); }
        if (m) m.crit = null; line.crit = null;
    }
    function raiseMachine(st, m) {
        var line = m.line; m.state = "alarm"; m.alarmAt = st.simTime;
        var sc = pickScenario(st, "machine"); m.vibScenario = sc;
        m.crit = addCritical(st, { head: sc.cause, line: (line.idx + 1), color: "#ff7a7a", scenario: sc, kind: "machine" }); m.crit.alarmAt = st.simTime;
        st.stats.inc += 1; if (m.tag) { m.tag.sprite.visible = true; drawTag(m.tag, "НАЛАДЧИК ВЫЗВАН · вибр " + t1(m.vib), "#d23b3b"); }
        feed(st, "🔧 " + sc.cause + " — линия " + (line.idx + 1) + " (" + m.name + ")", "#ff9b4a", "Датчики станка «" + m.name + "» (линия " + (line.idx + 1) + "): вибрация <b>" + t1(m.vib) + " мм/с</b>. " + sc.root + ".<br>Датчик поймал износ <b>заранее</b>: линия продолжает работу под наблюдением, наладчик вызван (реакция ~2 ч). Плановая остановка — только на замену узла.", "alarm-" + m.name);
        m.repairPending = 14; beep(st, 1040, 0.14, 0.08);
    }
    function raiseConveyor(st, line) {
        line.stopped = true; line.stopReason = "лента"; var sc = pickScenario(st, "conveyor");
        line.crit = addCritical(st, { head: sc.cause, line: (line.idx + 1), color: "#ff7a7a", scenario: sc, kind: "conveyor" }); line.crit.alarmAt = st.simTime; line.repairPending = 10;
        st.stats.inc += 1;
        feed(st, "🔧 " + sc.cause + " — линия " + (line.idx + 1), "#ff9b4a", "Конвейер линии " + (line.idx + 1) + ": " + sc.root + ".<br>Линия <b>остановлена</b>, вызван наладчик (~2 ч).", "conv-" + line.idx);
        beep(st, 980, 0.14, 0.07);
    }
    // ---- ручной запуск инцидента (опционально) ----
    function triggerIncident(st, kind) {
        if (kind === "machine") { var pool = st.machines.filter(function (m) { return m.state === "ok"; }); if (!pool.length) return; var m = pool[Math.floor(Math.random() * pool.length)]; m.state = "degrading"; m.vib = 7.4; m.temp = Math.max(m.temp, 62); feed(st, "📈 Рост вибрации — линия " + (m.line.idx + 1) + " (" + m.name + ")", "#cfd8e3", "Датчик вибрации станка «" + m.name + "» фиксирует рост — ранний износ. Наладчик будет вызван заранее.", "deg-" + m.name); }
        else if (kind === "conveyor") { var lines = st.lines.filter(function (l) { return !l.stopped; }); if (!lines.length) return; raiseConveyor(st, lines[Math.floor(Math.random() * lines.length)]); }
        else if (kind === "hvac") { var pool = st.aux.filter(function (a) { return a.state === "ok"; }); if (!pool.length) return; var a = pool[Math.floor(Math.random() * pool.length)]; a.state = "degrading"; a.vib = a.vibMax + 0.6; a.eff = 74; feed(st, "📈 " + a.name + " теряет стабильность", "#cfd8e3", "Датчики «" + a.name + "» фиксируют рост вибрации и снижение охлаждения — ранний износ. Сервис будет вызван заранее.", "aux-deg-" + a.name); }
    }

    function simulate(st, dt) {
        st.simTime += dt; st.elapsed += dt; drainEvents(st, dt);
        // OEE доступность
        var running = 0; st.lines.forEach(function (l) { if (!l.stopped) running++; });
        st.availNum += (st.lines.length ? running / st.lines.length : 1) * dt; st.availDen += dt;
        // звук растущей вибрации
        if (st.soundOn) { var mv = 0, deg = false; st.machines.forEach(function (m) { if (m.state === "degrading") { deg = true; if (m.vib > mv) mv = m.vib; } }); if (deg) { st.tickT -= dt; if (st.tickT <= 0) { beep(st, 520 + mv * 32, 0.04, 0.03); st.tickT = Math.max(0.22, 1.3 - mv * 0.13); } } }
        // станки: предиктив
        st.machines.forEach(function (m) {
            if (m.state === "repair") { m.repairT -= dt; m.vib += (1.2 - m.vib) * Math.min(1, dt * 0.8); m.temp += (38 - m.temp) * Math.min(1, dt * 0.8); if (m.repairT <= 0) lineFix(st, m.line, m); return; }
            if (m.state === "alarm") { m.repairPending -= dt; if (m.tag) drawTag(m.tag, "НАЛАДЧИК В ПУТИ · вибр " + t1(m.vib), "#d23b3b"); if (m.repairPending <= 0) { m.state = "repair"; m.repairT = 6; m.line.stopped = true; m.line.stopReason = "замена · " + m.name; if (m.tag) drawTag(m.tag, "Наладчик меняет узел…", "#b07400"); feed(st, "🛠 Плановая остановка — линия " + (m.line.idx + 1) + " (" + m.name + ")", "#ffce4a", "Наладчик на месте. Линия " + (m.line.idx + 1) + " кратко остановлена на замену узла станка «" + m.name + "».", "rep-" + m.name); } return; }
            if (m.state === "ok") { m.degradeT -= dt; m.runtime += dt * 0.5; if (m.degradeT <= 0) { m.state = "degrading"; feed(st, "📈 Рост вибрации — линия " + (m.line.idx + 1) + " (" + m.name + ")", "#cfd8e3", "Датчик вибрации станка «" + m.name + "» фиксирует рост — ранний износ. Система наблюдает; при пороге вызовет наладчика заранее.", "deg-" + m.name); } return; }
            // degrading
            m.vib += dt * 0.9; m.temp += dt * 3.5; m.load += dt * 2; m.health -= dt * 6;
            if (m.vib > 7) raiseMachine(st, m);
        });
        // конвейерные инциденты (реже)
        st.convT = (st.convT || 30) - dt; if (st.convT <= 0) { st.convT = 55 + Math.random() * 45; var ln = st.lines[Math.floor(Math.random() * st.lines.length)]; if (ln && !ln.stopped) raiseConveyor(st, ln); }
        st.lines.forEach(function (l) { if (l.crit && l.stopped && l.stopReason === "лента") { l.repairPending -= dt; if (l.repairPending <= 0 && !l.fixing) { l.fixing = true; setTimeout(function () { }, 0); l.repT = (l.repT == null ? 6 : l.repT); } if (l.fixing) { l.repT -= dt; if (l.repT <= 0) { l.fixing = false; l.repT = null; lineFix(st, l, null); } } } });
        // --- климат-агрегаты (кондиционеры/компрессоры): предиктив + влияние на t° цеха ---
        var minEff = 100;
        st.aux.forEach(function (a) {
            if (a.state === "ok") { a.degradeT -= dt; a.runtime += dt * 0.5; if (a.degradeT <= 0) { a.state = "degrading"; feed(st, "📈 " + a.name + " теряет стабильность", "#cfd8e3", "Датчики «" + a.name + "» фиксируют рост вибрации и снижение эффективности — ранний износ. Сервис будет вызван заранее, до отказа.", "aux-deg-" + a.name); } }
            else if (a.state === "degrading") { a.vib += dt * 0.7; a.eff -= dt * 4.5; a.temp += dt * 1.2; if (a.vib > a.vibMax || a.eff < 72) raiseAux(st, a); }
            else if (a.state === "alarm") { a.repairPending -= dt; if (a.tag) drawTag(a.tag, "СЕРВИС В ПУТИ · вибр " + t1(a.vib), "#d23b3b"); if (a.repairPending <= 0) { a.state = "repair"; a.repairT = 7; if (a.tag) drawTag(a.tag, "Сервис на месте…", "#b07400"); feed(st, "🛠 Сервис начат — " + a.name, "#ffce4a", "Сервис на месте. Идёт обслуживание «" + a.name + "»; t° цеха скоро восстановится.", "aux-rep-" + a.name); } }
            else if (a.state === "repair") { a.repairT -= dt; a.vib += (1.2 - a.vib) * Math.min(1, dt * 0.8); a.eff += (100 - a.eff) * Math.min(1, dt * 0.8); a.temp += (a.baseTemp - a.temp) * Math.min(1, dt * 0.8); if (a.repairT <= 0) { if (a.tag) a.tag.sprite.visible = false; auxFix(st, a); } }
            if (a.cool && a.eff < minEff) minEff = a.eff;
        });
        var target = st.roomBase + (100 - minEff) * 0.18;
        st.roomTemp += (target - st.roomTemp) * Math.min(1, dt * 0.4);
        // энергопотребление (кВт) и накопление кВт·ч за смену
        var kw = 0;
        st.machines.forEach(function (m) { if (m.state !== "repair") kw += (m.powerKw || 7.5) * (0.55 + m.load / 200) * (m.state === "degrading" || m.state === "alarm" ? 1.15 : 1); });
        st.aux.forEach(function (a) { if (a.state !== "repair") kw += (a.powerKw || 12) * (1 + (100 - a.eff) * 0.012); });
        st.energyKw = kw; st.energyKwh += kw * dt * TSCALE / 60;
        // выборка истории вибрации для паспортов
        st.histT += dt; if (st.histT >= 0.7) { st.histT = 0; st.machines.forEach(function (m) { m.hist.push(m.vib); if (m.hist.length > 40) m.hist.shift(); }); st.aux.forEach(function (a) { a.hist.push(a.vib); if (a.hist.length > 40) a.hist.shift(); }); }
        // WIP поток
        st.spawnT += dt; if (st.spawnT > 1.4) { st.spawnT = 0; st.lines.forEach(function (l) { spawnWIP(st, l); }); }
        for (var i = st.wip.length - 1; i >= 0; i--) {
            var p = st.wip[i]; if (p.line.stopped) continue;
            p.x += p.line.speed * dt; p.mesh.position.x = p.x;
            // контроль качества
            if (!p.checked && p.x >= p.line.qx) { p.checked = true; var degr = p.line.machines.some(function (mm) { return mm.state !== "ok"; }); var hotc = st.roomTemp > 28; var defRate = (degr ? 0.18 : 0.05) + Math.max(0, (st.roomTemp - 26)) * 0.012; if (Math.random() < defRate) { p.good = false; p.mesh.material.color.setHex(0xe24b4a); st.stats.defect += 1; var why = degr ? " (станок в зоне риска — вибрация выше нормы)" : hotc ? " (t° цеха выше нормы — климат-оборудование снижает охлаждение)" : ""; feed(st, "⛔ Брак на контроле — линия " + (p.line.idx + 1), "#ff7a7a", "Контроль качества линии " + (p.line.idx + 1) + " отбраковал единицу" + why + ". Брак учтён в OEE (качество).", "def-" + p.line.idx); } }
            if (p.x >= p.line.x1) { if (p.good) { st.stats.produced += 1; st.stats.good += 1; } st.world.remove(p.mesh); st.wip.splice(i, 1); }
        }
        // анимация ленты
        st.lines.forEach(function (l) { if (l.stopped) return; l.stripes.forEach(function (s) { s.position.x += l.speed * dt; if (s.position.x > l.x1) s.position.x -= l.len; }); });
        // контрфакт «с датчиками/без»: сэмпл накопленных потерь раз в 1с
        st.cf.t += dt; if (st.cf.t >= 1.0) { st.cf.t = 0; var wl = (st.stats.defect || 0) * st.eco.unitPrice; var wo = wl + (st.stats.plProduct + st.stats.plOutput + st.stats.plFine); st.cf.withHist.push(wl); st.cf.woHist.push(wo); if (st.cf.withHist.length > 80) { st.cf.withHist.shift(); st.cf.woHist.shift(); } }
        // перекраска по слою + контрфакт (раз в 0.4с)
        st.recolorT = (st.recolorT || 0) + dt; if (st.recolorT > 0.4) { st.recolorT = 0; recolorAll(st); renderCf(st); renderFactoryTimeline(st); }
    }

    function rebuild(st, data) {
        var THREE = st.THREE; st.lastData = data;
        var __keep = (st.builtOnce && st.orbit) ? { tx: st.orbit.target.x, ty: st.orbit.target.y, tz: st.orbit.target.z, r: st.orbit.radius, th: st.orbit.theta, ph: st.orbit.phi } : null;
        while (st.world.children.length) st.world.remove(st.world.children[0]);
        st.raycast = []; st.anim = []; st.lines = []; st.machines = []; st.wip = []; st.serverScen = {};
        st.events = []; st.evId = 0; st.eventQueue = []; st.feedDrain = 0; st.critical = []; st.critId = 0; st.simTime = 0;
        st.elapsed = 0; st.availNum = 0; st.availDen = 0; st.spawnT = 0; st.convT = 35; st.stats = { produced: 0, good: 0, defect: 0, inc: 0, prevented: 0, savedRub: 0, savedUnits: 0, scrapAvoided: 0, plProduct: 0, plOutput: 0, plFine: 0, downtimeH: 0 };
        st.equipTypes = {}; st.units = {}; st.hvac = null; st.aux = []; st.cf = { withHist: [], woHist: [], t: 0 }; st.roomTemp = st.roomBase; st.energyKwh = 0; st.energyKw = 0; st.energyT = 0; st.histT = 0;
        if (st.journal) st.journal.innerHTML = (window.miteTr||String)(""); if (st.crit) { st.crit.list.innerHTML = (window.miteTr||String)(""); st.crit.sum.innerHTML = (window.miteTr||String)(""); }
        // парсим: CFG^name^lines^perLine  и  S^kind^cause^root^repair^risk^material^qty
        var cfg = { name: "Цех", lines: 2, perLine: 3 };
        (data || "").split("~").forEach(function (rec) { var f = rec.split("^");
            if (f[0] === "S") { var k = f[1] || "machine"; (st.serverScen[k] = st.serverScen[k] || []).push({ cause: f[2], root: f[3], repair: f[4], risk: f[5], mat: f[6] ? [f[6], +f[7] || 0] : [] }); }
            else if (f[0] === "CFG") { if (f[1]) cfg.name = f[1]; cfg.lines = Math.max(1, Math.min(4, +f[2] || 2)); cfg.perLine = Math.max(1, Math.min(6, +f[3] || 3)); }
            else if (f[0] === "E") { st.equipTypes[f[2] || "machine"] = { name: f[1], shape: f[2], kind: f[3] || "machine", powerKw: +f[4] || 0, vibMax: +f[5] || 7, mtbf: +f[6] || 0, spare: f[7] || "", spareQty: +f[8] || 0, count: +f[9] || 0 }; }
            else if (f[0] === "ECO") { st.eco = { unitPrice: +f[1] || 480, downtimeRate: +f[2] || 12000, energyTariff: +f[3] || 7, fineRisk: +f[4] || 150000, capex: +f[5] || 450000 }; }
            else if (f[0] === "U") { st.units[f[1]] = { name: f[1], shape: f[2], group: f[3], index: +f[4] || 0, source: f[5] || "sim", dev: f[6] || "", value: f[7] || "" }; }
        });
        st.cfg = cfg;
        if (st.hud && st.hud.title) st.hud.title.textContent = (window.miteTr||String)((cfg.name || "ЦЕХ").toUpperCase());
        var NL = cfg.lines, NM = cfg.perLine;
        var len = Math.max(180, NM * 54 + 50);
        // пол + сетка масштабируем под размер цеха
        var fw = Math.max(320, len + 90), fd = Math.max(200, NL * 92 + 70);
        var floor = mk(THREE, new THREE.BoxGeometry(fw, 4, fd), 0xdfe4ea); floor.position.set(0, -2, 0); st.world.add(floor);
        var grid = new THREE.GridHelper(Math.max(fw, fd), Math.round(Math.max(fw, fd) / 20), 0xb9c2cd, 0xccd3db); grid.position.set(0, 0.2, 0); st.world.add(grid);
        // N линий × M станков (из конструктора цеха)
        var namePool = ["Дозатор", "Смеситель", "Фасовка", "Упаковщик", "Этикетировщик", "Запайка", "Пресс", "Сушка", "Маркиратор", "Паллетайзер", "Контроль", "Дробилка"];
        for (var li = 0; li < NL; li++) {
            var z = (NL === 1) ? 0 : (-(NL - 1) * 46 + li * 92);
            var line = addLine(st, li, z, len);
            for (var mi = 0; mi < NM; mi++) {
                var mx = (NM === 1) ? 0 : ((-len / 2 + 45) + mi * ((len - 90) / (NM - 1)));
                addMachine(st, line, mx, namePool[(li * NM + mi) % namePool.length]);
            }
        }
        var hN = (st.equipTypes.hvac && st.equipTypes.hvac.count) || 1, cN = (st.equipTypes.compressor && st.equipTypes.compressor.count) || 0;
        var auxPlan = []; for (var ai = 0; ai < hN; ai++) auxPlan.push("hvac"); for (var ci = 0; ci < cN; ci++) auxPlan.push("compressor"); if (!auxPlan.length) auxPlan.push("hvac");
        auxPlan.forEach(function (shp, k) { addAux(st, shp, k, auxPlan.length, fw, fd); });
        st.hvac = st.aux[0];
        st.idealRate = 0.45 * NL;
        var __homeR = Math.max(340, Math.max(fw, fd) * 1.5);
        if (__keep) { st.orbit.target.set(__keep.tx, __keep.ty, __keep.tz); st.orbit.radius = __keep.r; st.orbit.theta = __keep.th; st.orbit.phi = __keep.ph; st.applyCamera(); st.resize(); }
        else { st.orbit.target.set(0, 18, 0); st.orbit.radius = __homeR; st.applyCamera(); st.resize(); }
        st.viewHome = { tx: 0, ty: 18, tz: 0, radius: __homeR };
        st.builtOnce = true;
        st.setLayer(st.layer || "vib");
    }

    return {
        render: function (element) {
            element.style.cssText = "position:relative;height:76vh;min-height:440px;min-width:0;overflow:hidden";
            if (window.THREE) build(element);
            else { var n = 0, t = setInterval(function () { if (window.THREE) { clearInterval(t); build(element); element.__pending && rebuild(element.__wh, element.__pending); } else if (++n > 100) clearInterval(t); }, 50); }
        },
        update: function (element, controller, value) { var s = (typeof value === "string") ? value : ""; var st = element.__wh; if (st) { st.controller = controller; if (s === st.lastData) return; st.lastData = s; rebuild(st, s); } else element.__pending = s; }
    };
}
