// Агро-аналитика: слой ПОД 3D-сценой. Плитки: рост/САТ, прогноз на дни вперёд, прогноз урожая,
// удобрения (NPK + заявки в ERP), приоритетные советы. Питается тем же снимком agroData — синтез на клиенте.
// Запись: U^name^type^crop^site^airT^airH^soilM^soilT^leafW^soilMin^frostThr^px^pz^gcode^cover^area^cropVal^soilN^nMin^gdd^gddH
// Шапка: A^objs^area^gNowT^gMinT^gPrecip
function agrodash() {
    var tr = window.miteTr || String;
    function rnd(s) { var x = 2166136261; for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = (x * 16777619) >>> 0; } return (x % 1000) / 1000; }
    function fmt(v, d) { var n = +v; return isNaN(n) ? "0" : n.toFixed(d == null ? 0 : d); }
    function money(v) { v = Math.round(+v || 0); return v.toLocaleString ? v.toLocaleString("ru-RU") : "" + v; }
    var STAGE = ["Всходы", "Вегетация", "Созревание", "Уборка"], DAILY_GDD = 15;
    // РАЗНООБРАЗНЫЕ болезни по культуре и условиям (лист влажный/жарко) — не одна «мучнистая роса»
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

    function parse(data) {
        var recs = (data || "").split("~"), h = (recs[0] || "").split("^");
        var g = { nowT: h[3] !== "" ? +h[3] : null, minT: h[4] !== "" ? +h[4] : null, precip: h[5] !== "" ? +h[5] : null };
        g.hasFc = g.nowT != null; g.rain = g.precip != null && g.precip >= 60;
        var us = [], fert = [], batches = [], orders = [];
        for (var i = 1; i < recs.length; i++) {
            var f = recs[i].split("^");
            if (f[0] === "F") { fert.push({ name: f[1], qty: +f[2] || 0, min: +f[3] || 0, price: +f[4] || 0 }); continue; }
            if (f[0] === "B") { batches.push({ name: f[1], number: f[2], qtyIn: +f[3] || 0, remain: +f[4] || 0, expiry: f[5] || "", supplier: f[6] || "", price: +f[7] || 0 }); continue; }
            if (f[0] === "O") { orders.push({ number: f[1], product: f[2], qty: +f[3] || 0, status: f[4] || "" }); continue; }
            if (f[0] !== "U") continue;
            var leafW = +f[9], airH = +f[6], soilM = +f[7], soilMin = +f[10], frostThr = +f[11], gcode = +f[14] || 0;
            var disease = synthDisease(f[3], leafW, airH);
            var frost = g.hasFc && g.minT != null && g.minT <= frostThr, dry = soilM < soilMin;
            var u = {
                name: f[1], type: f[2], crop: f[3], site: f[4], soilM: soilM, soilMin: soilMin, leafW: leafW, airH: airH,
                gcode: gcode, stage: STAGE[gcode] || "Всходы", cover: +f[15] || 0, area: +f[16] || 0, cropVal: +f[17] || 0,
                soilN: +f[18] || 0, nMin: +f[19] || 30, gdd: +f[20] || 0, gddH: +f[21] || 1500,
                disease: disease, frost: frost, dry: dry,
                water: dry && !g.rain && !frost, lowN: (+f[18] || 0) < (+f[19] || 30),
                doneWater: f[22] === "1", doneTreat: f[23] === "1", doneFert: f[24] === "1", doneHarvest: f[25] === "1",
                fertProduct: f[26] || "", fertReason: f[27] || ""
            };
            u.health = Math.max(0.35, Math.min(1, (disease ? 0.65 : 1) * (u.cover / 100 + 0.15)));
            u.yield = u.area * u.cropVal * u.health;
            u.daysToHarvest = Math.max(0, Math.round((u.gddH - u.gdd) / DAILY_GDD));
            us.push(u);
        }
        return { g: g, us: us, fert: fert, batches: batches, orders: orders, fields: us.filter(function (u) { return u.type !== "orchard" || true; }) };
    }

    function card(title, body) { return '<div style="flex:1 1 300px;min-width:280px;background:#fff;border:1px solid #e4e8ee;border-radius:12px;padding:12px 14px;box-shadow:0 1px 3px rgba(0,0,0,.05)"><div style="font-size:12px;font-weight:800;color:#33404f;margin-bottom:9px;text-transform:uppercase;letter-spacing:.3px">' + title + '</div>' + body + '</div>'; }
    function bar(pct, col, label, right) {
        return '<div style="margin:5px 0"><div style="display:flex;justify-content:space-between;font-size:11px;color:#55606e;margin-bottom:2px"><span>' + label + '</span><span style="font-weight:700">' + (right || "") + '</span></div>'
            + '<div style="height:9px;background:#eef1f5;border-radius:5px;overflow:hidden"><div style="height:9px;width:' + Math.max(2, Math.min(100, pct)) + '%;background:' + col + '"></div></div></div>';
    }
    function capNote() { return ""; }

    function tileGrowth(us) {
        var arr = us.filter(function (u) { return u.gddH > 0; }).sort(function (a, c) { return (c.gdd / c.gddH) - (a.gdd / a.gddH); });
        var b = arr.map(function (u) {
            var pct = Math.min(100, u.gdd / u.gddH * 100), col = pct >= 100 ? "#b04a2e" : pct >= 70 ? "#d9a441" : "#3a9e57";
            var eta = u.daysToHarvest <= 0 ? tr("готово") : "~" + u.daysToHarvest + " " + tr("дн");
            return bar(pct, col, u.name + " · " + u.stage, fmt(pct, 0) + "% · " + tr("уборка") + " " + eta);
        }).join("");
        var foot = '<div style="margin-top:5px;font-size:10px;color:#9aa"><b>' + tr("Откуда") + ':</b> ' + tr("САТ (сумма активных темп.) / порог культуры; дни = остаток САТ ÷ ~15°/сут") + '</div>';
        return card("🌱 " + tr("Рост / САТ · дней до уборки"), (b || "<div style='color:#9aa'>—</div>") + foot);
    }

    function tileForecast(g) {
        if (!g.hasFc) return card("🌦 " + tr("Прогноз на 5 дней"), "<div style='color:#9aa;font-size:12px'>" + tr("нет данных — «Обновить погоду»") + "</div>");
        var names = ["Сегодня", "Завтра", "+2", "+3", "+4"], html = '<div style="display:flex;gap:6px;text-align:center">';
        for (var d = 0; d < 5; d++) {
            var r = rnd("day" + d), t = Math.round(g.nowT + (r - 0.5) * 8 - d * 0.6), pr = Math.round(Math.min(100, Math.max(0, g.precip * (0.5 + r))));
            var ic = t <= 2 ? "❄" : pr >= 60 ? "🌧" : pr >= 30 ? "⛅" : "☀", col = t <= 2 ? "#4f79c7" : pr >= 60 ? "#2f9ec7" : "#d9a441";
            html += '<div style="flex:1;background:#f6f8fb;border-radius:9px;padding:7px 3px"><div style="font-size:10px;color:#8a93a0">' + tr(names[d]) + '</div><div style="font-size:22px">' + ic + '</div><div style="font-size:15px;font-weight:800;color:' + col + '">' + t + '°</div><div style="font-size:10px;color:#5a6675">💧' + pr + '%</div></div>';
        }
        return card("🌦 " + tr("Прогноз на 5 дней") + " (предиктив)", html + "</div>");
    }

    function tileYield(us) {
        var tot = 0, arr = us.filter(function (u) { return u.yield > 0; }).sort(function (a, c) { return c.yield - a.yield; });
        arr.forEach(function (u) { tot += u.yield; });
        var b = arr.map(function (u) {
            var d = new Date(); d.setDate(d.getDate() + u.daysToHarvest);
            var when = u.daysToHarvest <= 0 ? tr("готово") : ("~" + d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }));
            return bar(u.health * 100, u.health > 0.8 ? "#3a9e57" : u.health > 0.6 ? "#d9a441" : "#d23b3b", u.name + " · " + tr("уборка") + " " + when, money(u.yield) + " ₽");
        }).join("");
        var foot = '<div style="margin-top:6px;font-size:10px;color:#9aa"><b>' + tr("Откуда") + ':</b> ' + tr("выручка = площадь × ценность/га × индекс здоровья (0.35–1.0, зависит от болезни и покрова)") + '</div>';
        return card("💰 " + tr("Прогноз урожая") + " · " + money(tot) + " ₽", (b || "<div style='color:#9aa'>—</div>") + foot);
    }

    // ── Комбайны: статистика/предиктив по уборке ──
    var YLD = { "Озимая пшеница": 5.5, "Пшеница": 5.5, "Кукуруза": 9, "Подсолнечник": 2.8, "Соя": 2.5, "Рапс": 3.2 }, HRATE = 25;
    function tileCombines(us) {
        var harv = us.filter(function (u) { return u.gcode >= 2 && u.type !== "greenhouse" && u.type !== "orchard"; });
        if (!harv.length) return card("🚜 " + tr("Комбайны · уборка"), "<div style='color:#3a9e57;font-size:12px'>" + tr("нет полей в уборке") + "</div>");
        var totA = 0, totT = 0, maxEta = 0;
        var b = harv.sort(function (a, c) { return c.area - a.area; }).map(function (u) {
            var yph = YLD[u.crop] || 4, active = u.gcode >= 3;
            var pct = active ? Math.round(40 + rnd(u.name) * 45) : 0, remHa = u.area * (1 - pct / 100), eta = Math.max(1, Math.ceil(remHa / HRATE));
            totA += u.area; totT += u.area * yph; if (active && eta > maxEta) maxEta = eta;
            return bar(active ? pct : 3, active ? "#b04a2e" : "#d9a441", u.name + " · " + fmt(u.area, 0) + " га · " + (active ? tr("уборка") + " " + pct + "%" : tr("созревание")), active ? "ETA ~" + eta + " " + tr("сут") : tr("готовится"));
        }).join("");
        var foot = '<div style="margin-top:6px;font-size:11px;color:#55606e">' + tr("В уборке") + ': <b>' + harv.length + '</b> · ' + fmt(totA, 0) + ' га · ' + tr("ожид. сбор") + ' ~<b>' + fmt(totT, 0) + ' т</b> · ' + tr("до конца") + ' ~' + maxEta + ' ' + tr("сут") + '</div>';
        return card("🚜 " + tr("Комбайны · уборка (предиктив)"), b + foot);
    }
    // ── Удобрения/СЗР: рекомендации по культуре/вредителю ──
    function fertAdvice(u) {
        var d = (u.disease || "").toLowerCase();
        if (d) {
            if (/рос|мучнист|оидиум/.test(d)) return ["🦠", u.disease + " → Сера/Тиовит", tr("контактный серосодержащий; не в жару >28°, 10–12 дн")];
            if (/фитофтор|милдью|пероноспор|ложная/.test(d)) return ["🦠", u.disease + " → Ридомил/медьсодерж.", tr("системный до дождя, влажная погода; интервал 10–14 дн")];
            if (/ржавчин|септориоз|пятнист|альтернар|кладоспор|гельминт|церкоспор/.test(d)) return ["🦠", u.disease + " → триазолы/медный купорос", tr("фунгицид по вегетации, чередовать д.в.")];
            if (/парш|монилиоз|склеротин|фомоз|головн/.test(d)) return ["🦠", u.disease + " → медный купорос/бордоская", tr("профилактика + удалить поражённые")];
            return ["🦠", u.disease + " → фунгицид", tr("обработать по листу")];
        }
        if (u.fertReason && u.fertReason !== "поддерживающее NPK") return ["🧪", u.fertProduct || "NPK-комплекс", u.fertReason];
        return ["✔", "—", tr("питание в норме (поддерживающее NPK при необходимости)")];
    }
    function tileFert(us) {
        var b = us.map(function (u) {
            var adv = fertAdvice(u), low = u.soilN < u.nMin;
            return '<div style="padding:4px 0;border-bottom:1px solid #eef1f5">'
                + '<div style="display:flex;justify-content:space-between;font-size:11px"><span style="font-weight:700;color:#33404f">' + u.name + '</span><span style="color:' + (low ? "#d23b3b" : "#3a9e57") + '">N ' + fmt(u.soilN, 0) + " / " + fmt(u.nMin, 0) + '</span></div>'
                + '<div style="font-size:11px;color:#55606e;margin-top:1px">' + adv[0] + ' <b>' + adv[1] + '</b> — ' + adv[2] + '</div></div>';
        }).join("");
        return card("🧪 " + tr("Удобрения / СЗР — рекомендации"), b || "<div style='color:#9aa'>—</div>");
    }
    // ── Склад удобрений/СЗР → заявки в ERP ──
    function tileStock(fert) {
        if (!fert.length) return card("📦 " + tr("Склад удобрений/СЗР"), "<div style='color:#9aa;font-size:12px'>" + tr("нет данных склада") + "</div>");
        var need = 0, cost = 0;
        var b = fert.map(function (s) {
            var low = s.qty < s.min, pct = Math.min(100, s.qty / (s.min * 1.5) * 100);
            if (low) { need++; cost += Math.ceil(s.min * 1.5 - s.qty) * s.price; }
            return bar(pct, low ? "#d23b3b" : "#3a9e57", s.name, fmt(s.qty, 0) + "/" + fmt(s.min, 0) + " кг" + (low ? " · ⚠" : ""));
        }).join("");
        var foot = '<div style="margin-top:6px;font-size:11px;color:#55606e">' + tr("Ниже минимума") + ': <b>' + need + '</b> · ' + tr("пополнение") + ' ~<b>' + money(cost) + ' ₽</b>' + (need ? ' · ' + tr("заявка в ERP — авто") : "") + '</div>';
        return card("📦 " + tr("Склад удобрений/СЗР → ERP"), b + foot);
    }
    // ── Аналитика по ПАРТИЯМ удобрений/СЗР (приход/остаток/срок/поставщик) ──
    function daysToExpiry(s) {
        s = s || ""; var iso = /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/.exec(s);   // ГГГГ-ММ-ДД (как отдаёт сервер)
        if (iso) return Math.round((new Date(+iso[1], +iso[2] - 1, +iso[3]) - new Date()) / 86400000);
        var dmy = /(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/.exec(s);                 // ДД.ММ.ГГГГ (запасной)
        if (dmy) return Math.round((new Date(+dmy[3], +dmy[2] - 1, +dmy[1]) - new Date()) / 86400000);
        return null;
    }
    function fmtDate(s) { var m = /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/.exec(s || ""); return m ? (("0" + m[3]).slice(-2) + "." + ("0" + m[2]).slice(-2) + "." + m[1]) : (s || ""); }
    function tileBatches(batches) {
        if (!batches.length) return card("🏷 " + tr("Партии удобрений/СЗР"), "<div style='color:#9aa;font-size:12px'>" + tr("нет партий") + "</div>");
        var totVal = 0, soon = 0;
        var b = batches.map(function (bt) {
            var dl = daysToExpiry(bt.expiry), pct = bt.qtyIn > 0 ? bt.remain / bt.qtyIn * 100 : 0;
            var expd = dl != null && dl < 0, exp = dl != null && dl >= 0 && dl < 90;
            if (exp || expd) soon++;
            totVal += bt.remain * bt.price;
            var col = expd ? "#8a1f14" : exp ? "#d9a441" : "#3a9e57";
            var right = fmt(bt.remain, 0) + "/" + fmt(bt.qtyIn, 0) + " кг" + (dl != null ? " · " + (expd ? "⚠" + tr("просроч.") : dl + " " + tr("дн")) : "");
            return '<div style="padding:2px 0;border-bottom:1px solid #eef1f5">' + bar(pct, col, bt.name + " · " + bt.number, right)
                + '<div style="font-size:9px;color:#8a93a0;margin-top:-1px">' + bt.supplier + " · " + tr("годен до") + " " + fmtDate(bt.expiry) + " · " + money(bt.remain * bt.price) + " ₽</div></div>";
        }).join("");
        var foot = '<div style="margin-top:6px;font-size:11px;color:#55606e">' + tr("Партий") + ': <b>' + batches.length + '</b> · ' + tr("истекает") + ': <b style="color:' + (soon ? "#d9a441" : "#3a9e57") + '">' + soon + '</b> · ' + tr("остатки на") + ' ~<b>' + money(totVal) + ' ₽</b></div>';
        return card("🏷 " + tr("Партии удобрений/СЗР — аналитика"), b + foot);
    }
    // ── План дня: запланировано/сделано + чек-лист (сделанное вычёркивается) ──
    function tilePlan(us) {
        var tasks = [];
        us.forEach(function (u) {
            if (u.water || u.doneWater) tasks.push([u.name, "💧 " + tr("полив"), u.doneWater]);
            if (u.disease || u.doneTreat) tasks.push([u.name, "🦠 " + tr("обработка") + (u.disease ? " (" + u.disease + ")" : ""), u.doneTreat]);
            if (u.lowN || u.doneFert) tasks.push([u.name, "🧪 " + tr("удобрение"), u.doneFert]);
            if (u.gcode >= 3 || u.doneHarvest) tasks.push([u.name, "🌾 " + tr("уборка"), u.doneHarvest]);
        });
        var done = tasks.filter(function (t) { return t[2]; }).length, total = tasks.length;
        var head = bar(total ? done / total * 100 : 100, "#3a9e57", tr("Сделано") + " " + done + " " + tr("из") + " " + total, fmt(total ? done / total * 100 : 100, 0) + "%");
        var body = total ? tasks.map(function (t) {
            return '<div style="display:flex;gap:6px;align-items:center;padding:1px 0;font-size:11px;' + (t[2] ? "color:#9aa;text-decoration:line-through" : "color:#33404f") + '"><span>' + (t[2] ? "☑" : "☐") + '</span><span>' + t[0] + " · " + t[1] + '</span></div>';
        }).join("") : "<div style='color:#3a9e57;font-size:12px'>" + tr("на сегодня задач нет") + "</div>";
        return card("📋 " + tr("План дня — события"), head + '<div style="margin-top:5px">' + body + "</div>");
    }
    // ── Заказы поставщику (ERP) по удобрениям/СЗР — видимая связь агро↔ERP ──
    function tileOrders(orders) {
        if (!orders.length) return card("🧾 " + tr("Заказы поставщику (ERP)"), "<div style='color:#9aa;font-size:12px'>" + tr("нет заявок") + "</div>");
        var col = { "создана": "#d9a441", "подтверждена": "#2b8cff", "отгружена": "#2b8cff", "получена": "#3a9e57" };
        var b = orders.slice(-6).reverse().map(function (o) {
            return '<div style="display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px solid #eef1f5;font-size:11px"><span><b>№' + o.number + '</b> · ' + o.product + '</span><span>' + fmt(o.qty, 0) + ' кг · <b style="color:' + (col[o.status] || "#8a93a0") + '">' + o.status + '</b></span></div>';
        }).join("");
        var foot = '<div style="margin-top:5px;font-size:11px;color:#55606e">' + tr("Заявок всего") + ': <b>' + orders.length + '</b> · ' + tr("создаются авто при дозаказе; полный журнал — Данные → ТОиР → Заявки поставщику") + '</div>';
        return card("🧾 " + tr("Заказы поставщику (ERP) — связь"), b + foot);
    }
    // ── Экономика дня: экономия/риск с явными формулами («откуда») ──
    function tileEconomy(us, g) {
        var IRR = 1800, LOSS = 0.3;
        var save = 0, risk = 0, rows = [];
        us.forEach(function (u) {
            if (g.rain && u.dry) { var s = u.area * IRR; save += s; rows.push(["💧", u.name, "+" + money(s) + " ₽", tr("дождь скоро + сухо → полив не нужен")]); }
            if (u.frost) { var r = u.area * u.cropVal * LOSS; risk += r; rows.push(["❄", u.name, "−" + money(r) + " ₽", tr("заморозок ≤ порога → укрыть/обогрев")]); }
        });
        var head = '<div style="display:flex;gap:14px;margin-bottom:6px">'
            + '<div><div style="font-size:10px;color:#8a93a0">' + tr("Экономия (полив)") + '</div><div style="font-size:18px;font-weight:800;color:#3a9e57">' + money(save) + ' ₽</div></div>'
            + '<div><div style="font-size:10px;color:#8a93a0">' + tr("Риск (заморозок)") + '</div><div style="font-size:18px;font-weight:800;color:#d23b3b">' + money(risk) + ' ₽</div></div></div>';
        var body = rows.length ? rows.map(function (r) { return '<div style="font-size:11px;color:#33404f;padding:1px 0">' + r[0] + ' <b>' + r[1] + '</b> ' + r[2] + ' <span style="color:#8a93a0">— ' + r[3] + '</span></div>'; }).join("") : "<div style='color:#3a9e57;font-size:12px'>" + tr("рисков и экономии сейчас нет") + "</div>";
        var foot = '<div style="margin-top:6px;font-size:10px;color:#9aa;line-height:1.4"><b>' + tr("Откуда") + ':</b> ' + tr("экономия = площадь × ") + IRR + tr(" ₽/га (когда дождь заменяет полив); риск = площадь × ценность/га × ") + (LOSS * 100) + tr("% потерь при заморозке")+'</div>';
        return card("💰 " + tr("Экономика дня — экономия / риск"), head + body + foot);
    }

    function tileAdvice(us, g) {
        var A = [];
        us.forEach(function (u) {
            if (u.frost) A.push([1, "❄", u.name + ": " + tr("заморозок — укрыть/обогрев")]);
            else if (u.disease) A.push([2, "🦠", u.name + ": " + u.disease + " — " + tr("обработать")]);
            else if (u.gcode >= 3) A.push([3, "🌾", u.name + ": " + tr("созрело — убирать")]);
            else if (g.rain && u.dry) A.push([5, "🌧", u.name + ": " + tr("дождь — полив отложить")]);
            else if (u.water) A.push([4, "💧", u.name + ": " + tr("сухо — полить")]);
            if (u.lowN) A.push([6, "🧪", u.name + ": " + tr("низкий N — удобрить/заявка")]);
        });
        A.sort(function (a, b) { return a[0] - b[0]; });
        var b = A.slice(0, 8).map(function (a) { return '<div style="display:flex;gap:8px;align-items:flex-start;padding:3px 0;font-size:12px;color:#33404f"><span style="font-size:15px">' + a[1] + '</span><span>' + a[2] + '</span></div>'; }).join("");
        return card("✅ " + tr("Советы (приоритет)"), b || "<div style='color:#3a9e57'>" + tr("всё в норме") + "</div>");
    }

    function build(element, data) {
        var p = parse(data);
        element.innerHTML = '<div style="font-family:\'Segoe UI\',sans-serif;padding:12px 14px;background:#f1f4f8"><div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">'
            + tilePlan(p.us) + tileGrowth(p.us) + tileForecast(p.g) + tileYield(p.us) + tileEconomy(p.us, p.g) + tileCombines(p.us) + tileFert(p.us) + tileStock(p.fert) + tileOrders(p.orders) + tileBatches(p.batches) + tileAdvice(p.us, p.g)
            + '</div></div>';
    }

    return {
        render: function (element) { element.style.cssText = "overflow:auto;height:100%"; if (element.__pending) build(element, element.__pending); },
        update: function (element, controller, value) { var s = (typeof value === "string") ? value : ""; if (s === element.__last) return; element.__last = s; if (s) build(element, s); else element.__pending = s; }
    };
}
