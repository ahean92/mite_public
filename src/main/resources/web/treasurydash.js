// Кокпит казначейства. Данные (treasuryData): T^totalEur^asOf^ratesTime + записи:
//   CUR^code^sym^rateEur^name^source | ACC^bank^cur^balance | FLOW^dayOffset^category^amount^cur | OFF^bank^cur^term^rate^min^type
// Аналитика (свободные средства с учётом cash-flow, рекомендации) считается на КЛИЕНТЕ.
// «Динамика»: живая лента внутридневных платежей (клиентский тикер) + нарастающий остаток.
function treasurydash() {
    var tr = window.miteTr || String;
    var NS = "http://www.w3.org/2000/svg";
    function el(t, a, x) { var e = document.createElementNS(NS, t); for (var k in a) e.setAttribute(k, a[k]); if (x != null) e.textContent = x; return e; }
    function fmt(v, d) { var n = +v; return isNaN(n) ? "0" : n.toFixed(d == null ? 0 : d); }
    function money(v) { var s = (Math.round(+v || 0)).toString(), neg = s[0] === "-"; if (neg) s = s.slice(1); s = s.replace(/\B(?=(\d{3})+(?!\d))/g, " "); return (neg ? "−" : "") + s; }
    function sym(st, code) { return st.cur[code] ? st.cur[code].sym : code; }
    function eur(st, amt, code) { var r = st.cur[code] ? st.cur[code].rate : 1; return amt / (r || 1); }

    function parse(data) {
        var recs = (data || "").split("~"), h = (recs[0] || "").split("^");
        var st = { total: +h[1] || 0, asOf: h[2] || "", ratesTime: h[3] || "", cur: {}, acc: [], flow: [], off: [] };
        for (var i = 1; i < recs.length; i++) {
            var f = recs[i].split("^");
            if (f[0] === "CUR") st.cur[f[1]] = { sym: f[2] || f[1], rate: +f[3] || 1, name: f[4] || "", src: f[5] || "", mkt: +f[6] || 0, mktSrc: f[7] || "", vol: +f[8] || 0 };
            else if (f[0] === "ACC") st.acc.push({ bank: f[1] || "", code: f[2] || "EUR", bal: +f[3] || 0 });
            else if (f[0] === "FLOW") st.flow.push({ day: +f[1] || 0, cat: f[2] || "", amt: +f[3] || 0, code: f[4] || "EUR", fact: (f[5] !== undefined && f[5] !== "") ? +f[5] : null });
            else if (f[0] === "OFF") { var ob = +f[7] || 0, os = +f[8] || 0, ort = +f[4] || 0; st.off.push({ bank: f[1] || "", code: f[2] || "EUR", term: +f[3] || 0, rate: (ob > 0 ? ob + os / 100 : ort), manual: ort, min: +f[5] || 0, type: f[6] || "short", base: ob, spread: os }); }
        }
        return st;
    }
    function dayLabel(off) { return off === 0 ? tr("сегодня") : (off > 0 ? "+" + off + " " + tr("дн") : off + " " + tr("дн")); }

    // ---- ПЛИТКА 1: остатки по валютам + всего в € ----
    function tileBalances(box, s, live) {
        box.innerHTML = "";
        var t = document.createElement("div"); t.textContent = tr("Остатки по счетам"); t.style.cssText = "font-weight:700;font-size:13px;color:#20303f;margin-bottom:6px"; box.appendChild(t);
        var byCur = {}; s.acc.forEach(function (a) { byCur[a.code] = (byCur[a.code] || 0) + a.bal; });
        var liveEur = eur(s, live || 0, "RUB");
        var big = document.createElement("div"); big.style.cssText = "font-size:24px;font-weight:800;color:#1f6f8b;margin-bottom:8px";
        big.innerHTML = "€ " + money(s.total + liveEur) + " <span style='font-size:12px;color:#8a93a0;font-weight:600'>" + tr("всего в базе") + "</span>"; box.appendChild(big);
        Object.keys(byCur).forEach(function (code) {
            var add = code === "RUB" ? (live || 0) : 0;
            var r = document.createElement("div"); r.style.cssText = "display:flex;justify-content:space-between;gap:12px;padding:3px 0;font-size:13px;color:#33404d;border-top:1px solid #eef1f5";
            r.innerHTML = "<span><b>" + sym(s, code) + "</b> " + money(byCur[code] + add) + " <span style='color:#aab3bf;font-size:10px'>" + (s.cur[code] ? s.cur[code].src : "") + "</span></span><span style='color:#8a93a0'>≈ € " + money(eur(s, byCur[code] + add, code)) + "</span>";
            box.appendChild(r);
        });
        var src = document.createElement("div"); src.style.cssText = "font-size:10px;color:#9aa6b3;margin-top:8px"; src.textContent = "🔄 " + (s.ratesTime || "—") + " · ECB / ЦБ РФ / НБ РБ · " + tr("раз в сутки"); box.appendChild(src);
    }

    // ---- ПЛИТКА 2: cash-flow (нарастающий остаток в € по дням) ----
    function tileCashflow(box, s) {
        box.innerHTML = "";
        var head = document.createElement("div"); head.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:4px";
        var t = document.createElement("div"); t.textContent = tr("Прогноз денежного потока"); t.style.cssText = "font-weight:700;font-size:13px;color:#20303f"; head.appendChild(t);
        var sub = document.createElement("div"); sub.style.cssText = "font-size:11px;color:#8a93a0"; head.appendChild(sub); box.appendChild(head);
        var D0 = -3, D1 = 45, run = [], bal = s.total;
        for (var d = D0; d <= D1; d++) { s.flow.forEach(function (f) { if (f.day === d) bal += eur(s, f.amt, f.code); }); run.push({ d: d, bal: bal }); }
        var W = box.clientWidth || 420, H = Math.max(140, (box.clientHeight || 200) - 34), PL = 46, PB = 18, PT = 8, PR = 8;
        var mx = Math.max.apply(null, run.map(function (p) { return p.bal; }).concat([1])), mn = Math.min.apply(null, run.map(function (p) { return p.bal; }).concat([0]));
        var svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", height: H, preserveAspectRatio: "none" });
        function X(dd) { return PL + (dd - D0) / (D1 - D0) * (W - PL - PR); }
        function Y(v) { return PT + (1 - (v - mn) / (mx - mn || 1)) * (H - PT - PB); }
        [mn, (mn + mx) / 2, mx].forEach(function (v) { var y = Y(v); svg.appendChild(el("line", { x1: PL, y1: y, x2: W - PR, y2: y, stroke: "#e3e8ee", "stroke-width": 1 })); svg.appendChild(el("text", { x: 2, y: y + 3, fill: "#9aa4b1", "font-size": 9 }, "€" + money(v))); });
        var dp = "M" + X(run[0].d) + "," + Y(run[0].bal); for (var i = 1; i < run.length; i++) dp += " L" + X(run[i].d) + "," + Y(run[i].bal);
        svg.appendChild(el("path", { d: dp + " L" + X(run[run.length - 1].d) + "," + Y(mn) + " L" + X(run[0].d) + "," + Y(mn) + " Z", fill: "rgba(31,111,139,0.12)" }));
        svg.appendChild(el("path", { d: dp, fill: "none", stroke: "#1f6f8b", "stroke-width": 2 }));
        svg.appendChild(el("line", { x1: X(0), y1: PT, x2: X(0), y2: H - PB, stroke: "#3a9e57", "stroke-width": 1, "stroke-dasharray": "3 3" }));
        s.flow.forEach(function (f) { if (f.amt < 0 && Math.abs(eur(s, f.amt, f.code)) > (mx - mn) * 0.14) { svg.appendChild(el("circle", { cx: X(f.day), cy: Y(bal0(run, f.day)), r: 3, fill: "#b3261e" })); svg.appendChild(el("text", { x: X(f.day), y: Y(bal0(run, f.day)) - 6, fill: "#b3261e", "font-size": 8, "text-anchor": "middle" }, f.cat)); } });
        [D0, 0, 15, 30, D1].forEach(function (dd) { svg.appendChild(el("text", { x: X(dd) - 6, y: H - 5, fill: "#9aa4b1", "font-size": 9 }, (dd === 0 ? tr("сегодня") : (dd > 0 ? "+" + dd : "" + dd)))); });
        box.appendChild(svg);
        var minBal = Math.min.apply(null, run.map(function (p) { return p.bal; }));
        sub.innerHTML = tr("мин. остаток") + " <b>€ " + money(minBal) + "</b>" + (minBal < 0 ? " <span style='color:#b3261e'>⚠ " + tr("кассовый разрыв") + "</span>" : "");
    }
    function bal0(run, d) { for (var i = 0; i < run.length; i++) if (run[i].d === d) return run[i].bal; return 0; }

    // ---- ПЛИТКА 3: свободные средства + рекомендация (с учётом cash-flow: срок ≤ горизонта) ----
    function tileAdvice(box, s) {
        box.innerHTML = "";
        var t = document.createElement("div"); t.textContent = tr("Свободные средства и размещение"); t.style.cssText = "font-weight:700;font-size:13px;color:#20303f;margin-bottom:6px"; box.appendChild(t);
        var bal = {}; s.acc.forEach(function (a) { bal[a.code] = (bal[a.code] || 0) + a.bal; });
        function running(code, upto) { var b = bal[code] || 0; s.flow.forEach(function (f) { if (f.code === code && f.day >= 0 && f.day <= upto) b += f.amt; }); return b; }
        function minRun(code, T) { var m = bal[code] || 0; for (var d = 0; d <= T; d++) { var r = running(code, d); if (r < m) m = r; } return m; }
        var items = [], totalGainEur = 0;
        Object.keys(bal).forEach(function (code) {
            var buffer = (bal[code] || 0) * 0.05;   // подушка 5%
            var best = null, bestGain = 0, bestInv = 0;
            s.off.filter(function (o) { return o.code === code; }).forEach(function (o) {
                var inv = minRun(code, o.term) - buffer;   // не уйти в минус за срок T
                if (inv < o.min || inv <= 0) return;
                var g = inv * o.rate / 100 * o.term / 365;
                if (g > bestGain) { bestGain = g; best = o; bestInv = inv; }
            });
            if (best) { items.push({ code: code, inv: bestInv, best: best, gain: bestGain }); totalGainEur += eur(s, bestGain, code); }
        });
        items.sort(function (a, b) { return eur(s, b.gain, b.code) - eur(s, a.gain, a.code); });
        items.slice(0, 4).forEach(function (it) {
            var d = document.createElement("div"); d.style.cssText = "padding:5px 0;font-size:12px;color:#33404d;border-top:1px solid #eef1f5;line-height:1.4";
            d.innerHTML = "💰 <b>" + sym(s, it.code) + " " + money(it.inv) + "</b> → " + it.best.bank + " " + (it.best.type === "overnight" ? tr("овернайт") : it.best.term + " " + tr("дн")) + " @ " + fmt(it.best.rate, 1) + "% → <b style='color:#1f9d6b'>+" + sym(s, it.code) + " " + money(it.gain) + "</b>";
            box.appendChild(d);
        });
        var nextOut = s.flow.filter(function (f) { return f.amt < 0 && f.day >= 0; }).sort(function (a, b) { return a.day - b.day; })[0];
        if (nextOut) { var d2 = document.createElement("div"); d2.style.cssText = "padding:5px 0;font-size:12px;color:#b06a1e;border-top:1px solid #eef1f5"; d2.innerHTML = "🛡 " + tr("резерв под") + " «" + nextOut.cat + "» (" + dayLabel(nextOut.day) + ") — " + tr("учтён в сроке"); box.appendChild(d2); }
        var sm = document.createElement("div"); sm.style.cssText = "margin-top:8px;font-size:13px;font-weight:800;color:#1f9d6b"; sm.innerHTML = "Σ " + tr("потенциальный доход") + ": ≈ € " + money(totalGainEur); box.appendChild(sm);
    }

    // ---- ПЛИТКА 4: предложения банков ----
    function tileOffers(box, s) {
        box.innerHTML = "";
        var t = document.createElement("div"); t.textContent = tr("Предложения банков"); t.style.cssText = "font-weight:700;font-size:13px;color:#20303f"; box.appendChild(t);
        var sb = document.createElement("div"); sb.style.cssText = "font-size:10px;color:#9aa6b3;margin-bottom:4px"; sb.textContent = tr("ставка = живая рыночная база + спред банка"); box.appendChild(sb);
        s.off.slice().sort(function (a, b) { return b.rate - a.rate; }).slice(0, 8).forEach(function (o, i) {
            var r = document.createElement("div"); r.style.cssText = "display:flex;justify-content:space-between;gap:8px;padding:3px 0;font-size:12px;color:#33404d;border-top:1px solid #eef1f5" + (i === 0 ? ";background:#eafaf1" : "");
            var base = o.base > 0 ? " <span style='color:#aab3bf;font-size:10px'>" + (s.cur[o.code] ? (s.cur[o.code].mktSrc || "") : "") + " " + fmt(o.base, 1) + "%" + (o.spread ? (o.spread > 0 ? "+" : "−") + Math.abs(o.spread) + tr("бп") : "") + "</span>" : "";
            r.innerHTML = "<span>" + o.bank + " · <b>" + sym(s, o.code) + "</b> · " + (o.type === "overnight" ? tr("овернайт") : o.term + tr("д")) + base + "</span><span style='font-weight:700;color:#1f6f8b'>" + fmt(o.rate, 1) + "%</span>";
            box.appendChild(r);
        });
    }

    // ---- ПЛИТКА 5 (во всю ширину): ЛЕНТА ПЛАТЕЖЕЙ (динамика) ----
    function tileFeed(box, s, live) {
        box.innerHTML = "";
        var head = document.createElement("div"); head.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:6px";
        var t = document.createElement("div"); t.textContent = tr("Лента платежей"); t.style.cssText = "font-weight:700;font-size:13px;color:#20303f"; head.appendChild(t);
        var lg = document.createElement("div"); lg.style.cssText = "font-size:11px;color:#8a93a0"; lg.innerHTML = "<span style='color:#3a9e57'>● " + tr("приход") + "</span> &nbsp; <span style='color:#b3261e'>● " + tr("расход") + "</span>"; head.appendChild(lg); box.appendChild(head);
        var wrap = document.createElement("div"); wrap.style.cssText = "max-height:150px;overflow:auto"; box.appendChild(wrap);
        function row(when, cat, amt, code, isLive) {
            var r = document.createElement("div"); r.style.cssText = "display:flex;align-items:center;gap:10px;padding:4px 6px;font-size:12px;border-bottom:1px solid #f1f4f8;" + (isLive ? "background:#f2fbf6;animation:tflash .8s ease" : "");
            var pos = amt >= 0;
            r.innerHTML = "<span style='width:70px;color:#8a93a0;font-size:11px'>" + when + "</span>"
                + "<span style='width:8px;height:8px;border-radius:50%;background:" + (pos ? "#3a9e57" : "#b3261e") + "'></span>"
                + "<span style='flex:1;color:#33404d'>" + cat + (isLive ? " <span style=\"color:#1f9d6b;font-size:9px;font-weight:700\">LIVE</span>" : "") + "</span>"
                + "<span style='font-weight:700;color:" + (pos ? "#1f9d6b" : "#b3261e") + "'>" + (pos ? "+" : "") + money(amt) + " " + sym(s, code) + "</span>";
            wrap.appendChild(r);
        }
        (live || []).forEach(function (p) { row(p.t, p.cat, p.amt, p.code, true); });
        s.flow.slice().sort(function (a, b) { return a.day - b.day; }).forEach(function (f) { row(dayLabel(f.day), f.cat, f.amt, f.code, false); });
    }

    // ---- ПЛИТКА: ВАЛЮТНАЯ ПОЗИЦИЯ / FX-РИСК ----
    function tileFx(box, s) {
        box.innerHTML = "";
        var t = document.createElement("div"); t.textContent = tr("Валютная позиция и FX-риск"); t.style.cssText = "font-weight:700;font-size:13px;color:#20303f;margin-bottom:6px"; box.appendChild(t);
        var bal = {}, nf = {}; s.acc.forEach(function (a) { bal[a.code] = (bal[a.code] || 0) + a.bal; });
        s.flow.forEach(function (f) { if (f.day >= 0 && f.day <= 30) nf[f.code] = (nf[f.code] || 0) + f.amt; });
        var rows = [], totalRisk = 0;
        Object.keys(bal).forEach(function (code) {
            if (code === "EUR") return;   // база — без валютного риска
            var exp = bal[code] + (nf[code] || 0), expEur = eur(s, exp, code), vol = s.cur[code] ? s.cur[code].vol : 0, risk = Math.abs(expEur) * vol / 100;
            totalRisk += risk; rows.push({ code: code, exp: exp, expEur: expEur, vol: vol, risk: risk });
        });
        rows.sort(function (a, b) { return b.risk - a.risk; });
        var big = document.createElement("div"); big.style.cssText = "font-size:13px;color:#33404d;margin-bottom:6px";
        big.innerHTML = tr("Позиция под риском") + ": <b style='color:#b06a1e'>± € " + money(totalRisk) + "</b> <span style='font-size:11px;color:#8a93a0'>(" + tr("год. волатильность") + ")</span>"; box.appendChild(big);
        var mx = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.expEur); }).concat([1]));
        rows.forEach(function (r) {
            var d = document.createElement("div"); d.style.cssText = "padding:3px 0;font-size:12px;color:#33404d;border-top:1px solid #eef1f5";
            var w = Math.round(Math.abs(r.expEur) / mx * 100);
            d.innerHTML = "<div style='display:flex;justify-content:space-between'><span><b>" + sym(s, r.code) + "</b> " + money(r.exp) + " <span style='color:#8a93a0'>≈ € " + money(r.expEur) + "</span></span><span style='color:#b06a1e'>±€ " + money(r.risk) + " <span style='font-size:10px;color:#aab3bf'>" + fmt(r.vol, 0) + "%</span></span></div>"
                + "<div style='height:5px;border-radius:3px;background:#eef1f5;margin-top:2px'><div style='height:5px;border-radius:3px;width:" + w + "%;background:" + (r.expEur >= 0 ? "#1f6f8b" : "#b3261e") + "'></div></div>";
            box.appendChild(d);
        });
        var top = rows[0];
        if (top) { var h = document.createElement("div"); h.style.cssText = "margin-top:7px;font-size:12px;color:#1f9d6b"; h.innerHTML = "🛡 " + tr("хедж") + ": " + tr("закрыть ~50% позиции") + " " + sym(s, top.code) + " " + tr("форвардом / конвертировать излишек в €"); box.appendChild(h); }
    }

    // ---- ПЛИТКА (во всю ширину): ПЛАТЁЖНЫЙ КАЛЕНДАРЬ ПЛАН/ФАКТ ----
    function tileCalendar(box, s) {
        box.innerHTML = "";
        var t = document.createElement("div"); t.textContent = tr("Платёжный календарь (план / факт)"); t.style.cssText = "font-weight:700;font-size:13px;color:#20303f;margin-bottom:6px"; box.appendChild(t);
        var wrap = document.createElement("div"); wrap.style.cssText = "max-height:170px;overflow:auto"; box.appendChild(wrap);
        var hdr = document.createElement("div"); hdr.style.cssText = "display:flex;gap:8px;font-size:10px;color:#9aa6b3;padding:2px 6px;text-transform:uppercase;letter-spacing:.04em";
        hdr.innerHTML = "<span style='width:74px'>" + tr("срок") + "</span><span style='flex:1'>" + tr("статья") + "</span><span style='width:110px;text-align:right'>" + tr("план") + "</span><span style='width:110px;text-align:right'>" + tr("факт") + "</span><span style='width:90px;text-align:right'>" + tr("откл.") + "</span>"; wrap.appendChild(hdr);
        s.flow.slice().sort(function (a, b) { return a.day - b.day; }).forEach(function (f) {
            var past = f.day < 0, hasFact = f.fact != null, dev = hasFact ? (f.fact - f.amt) : 0;
            var r = document.createElement("div"); r.style.cssText = "display:flex;gap:8px;align-items:center;padding:4px 6px;font-size:12px;color:#33404d;border-top:1px solid #f1f4f8" + (f.day === 0 ? ";background:#f5f9ff" : "");
            r.innerHTML = "<span style='width:74px;color:#8a93a0;font-size:11px'>" + dayLabel(f.day) + "</span>"
                + "<span style='flex:1'>" + f.cat + "</span>"
                + "<span style='width:110px;text-align:right;color:" + (f.amt >= 0 ? "#1f9d6b" : "#b3261e") + "'>" + (f.amt >= 0 ? "+" : "") + money(f.amt) + " " + sym(s, f.code) + "</span>"
                + "<span style='width:110px;text-align:right;font-weight:600'>" + (hasFact ? ((f.fact >= 0 ? "+" : "") + money(f.fact) + " " + sym(s, f.code)) : "<span style='color:#c3ccd6'>" + (past ? "—" : tr("ожид.")) + "</span>") + "</span>"
                + "<span style='width:90px;text-align:right;color:" + (dev === 0 ? "#8a93a0" : (dev > 0 ? "#1f9d6b" : "#b3261e")) + "'>" + (hasFact && dev !== 0 ? ((dev > 0 ? "+" : "") + money(dev)) : "") + "</span>";
            wrap.appendChild(r);
        });
    }

    // ---- ПЛИТКА: НЕСКОЛЬКО ВАРИАНТОВ РАЗМЕЩЕНИЯ ----
    function tileVariants(box, s) {
        box.innerHTML = "";
        var t = document.createElement("div"); t.textContent = tr("Варианты размещения"); t.style.cssText = "font-weight:700;font-size:13px;color:#20303f;margin-bottom:6px"; box.appendChild(t);
        var bal = {}; s.acc.forEach(function (a) { bal[a.code] = (bal[a.code] || 0) + a.bal; });
        function running(code, upto) { var b = bal[code] || 0; s.flow.forEach(function (f) { if (f.code === code && f.day >= 0 && f.day <= upto) b += f.amt; }); return b; }
        function minRun(code, T) { var m = bal[code] || 0; for (var d = 0; d <= T; d++) { var r = running(code, d); if (r < m) m = r; } return m; }
        function offEff(o) { return o.rate; }   // rate уже эффективная (база+спред) из parse
        // стратегия: filter по типу оффера; для каждой валюты берём лучший подходящий оффер и кладём безопасную сумму
        function scenario(name, pick, color) {
            var placedEur = 0, gainEur = 0, wTermEur = 0;
            Object.keys(bal).forEach(function (code) {
                var offers = s.off.filter(function (o) { return o.code === code && pick(o); });
                var buffer = (bal[code] || 0) * 0.05, best = null, bestG = 0, bestInv = 0;
                offers.forEach(function (o) { var inv = minRun(code, o.term) - buffer; if (inv < o.min || inv <= 0) return; var g = inv * offEff(o) / 100 * o.term / 365; if (g > bestG) { bestG = g; best = o; bestInv = inv; } });
                if (best) { var e = eur(s, bestInv, code); placedEur += e; gainEur += eur(s, bestG, code); wTermEur += e * best.term; }
            });
            var total = Object.keys(bal).reduce(function (a, c) { return a + eur(s, bal[c], c); }, 0);
            return { name: name, color: color, placed: placedEur, gain: gainEur, term: placedEur ? Math.round(wTermEur / placedEur) : 0, liq: total - placedEur };
        }
        var scen = [
            scenario(tr("Консервативный"), function (o) { return o.type === "overnight" || o.term <= 30; }, "#3a7bd5"),
            scenario(tr("Сбалансированный"), function (o) { return true; }, "#1f9d6b"),
            scenario(tr("Доходный"), function (o) { return o.term >= 60; }, "#b06a1e")
        ];
        scen.forEach(function (v) {
            var d = document.createElement("div"); d.style.cssText = "padding:6px 0;font-size:12px;color:#33404d;border-top:1px solid #eef1f5";
            d.innerHTML = "<div style='display:flex;justify-content:space-between'><b style='color:" + v.color + "'>" + v.name + "</b><b style='color:#1f9d6b'>+€ " + money(v.gain) + "</b></div>"
                + "<div style='font-size:11px;color:#8a93a0;margin-top:1px'>" + tr("размещаем") + " € " + money(v.placed) + " · " + tr("ср. срок") + " " + v.term + " " + tr("дн") + " · " + tr("ликвидность") + " € " + money(v.liq) + "</div>";
            box.appendChild(d);
        });
    }

    function build(element) {
        var st = { live: [], liveRub: 0 }; element.__tdash = st;
        element.style.cssText = "position:relative;overflow:auto;padding:2px";
        if (!document.getElementById("__tfkeys")) { var sty = document.createElement("style"); sty.id = "__tfkeys"; sty.textContent = "@keyframes tflash{from{background:#d7f3e5}to{background:#f2fbf6}}"; document.head.appendChild(sty); }
        var grid = document.createElement("div"); grid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:10px;font-family:'Segoe UI',sans-serif"; element.appendChild(grid);
        function tile(span) { var t = document.createElement("div"); t.style.cssText = "background:#fff;border:1px solid #e6ebf1;border-radius:12px;padding:9px 11px;min-height:190px;box-shadow:0 1px 4px rgba(20,30,45,.05)" + (span ? ";grid-column:1 / -1;min-height:auto" : ""); grid.appendChild(t); return t; }
        st.t1 = tile(); st.t2 = tile(); st.t3 = tile(); st.t4 = tile(); st.tFx = tile(); st.tVar = tile(); st.tCal = tile(true); st.t5 = tile(true);
        st.redraw = function () {
            if (!st.data) { [st.t1, st.t2, st.t3, st.t4, st.tFx, st.tVar, st.tCal, st.t5].forEach(function (b) { b.innerHTML = '<div style="color:#9aa4b1;font-size:12px;padding:20px;text-align:center">' + tr("нет данных") + "</div>"; }); return; }
            var s = parse(st.data); st.parsed = s;
            tileBalances(st.t1, s, st.liveRub); tileCashflow(st.t2, s); tileAdvice(st.t3, s); tileOffers(st.t4, s);
            tileFx(st.tFx, s); tileVariants(st.tVar, s); tileCalendar(st.tCal, s); tileFeed(st.t5, s, st.live);
        };
        // ДИНАМИКА: живой поток внутридневных платежей (клиентская симуляция)
        var CATS = [["Эквайринг", 1], ["Оплата поставщику", -1], ["Инкассация", 1], ["Комиссия банка", -1], ["Возврат клиента", -1], ["Оплата счёта", 1], ["Поступление по договору", 1]];
        function tick() {
            if (!st.parsed) return;
            var c = CATS[Math.floor(Math.random() * CATS.length)];
            var amt = c[1] * (Math.round((3 + Math.random() * 95)) * 1000);
            var d = new Date(); var hh = ("0" + d.getHours()).slice(-2), mm = ("0" + d.getMinutes()).slice(-2), ssx = ("0" + d.getSeconds()).slice(-2);
            st.live.unshift({ t: hh + ":" + mm + ":" + ssx, cat: tr(c[0]), amt: amt, code: "RUB" });
            if (st.live.length > 6) st.live.pop();
            st.liveRub += amt;
            tileFeed(st.t5, st.parsed, st.live); tileBalances(st.t1, st.parsed, st.liveRub);
        }
        if (st.timer) clearInterval(st.timer); st.timer = setInterval(tick, 3200);
        if (window.ResizeObserver) { new ResizeObserver(function () { if (st.data) st.redraw(); }).observe(element); }
    }

    return {
        render: function (element) { build(element); },
        update: function (element, controller, value) {
            var s = (typeof value === "string") ? value : ""; if (!s) return;
            var st = element.__tdash; if (!st) { build(element); st = element.__tdash; }
            if (s === st.last) return; st.last = s; st.data = s; st.redraw();
        }
    };
}
