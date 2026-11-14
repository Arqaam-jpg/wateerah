/* وتيره — واجهة التطبيق */
(function () {
  "use strict";
  const E = window.WateerahEngine;
  const KEY = "wateerah.mvp.v1";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icon = (n, cls = "i") => `<svg class="${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const uid = () => Math.random().toString(36).slice(2, 10);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const AR = new Intl.NumberFormat("ar-SA");
  const n2 = (x) => AR.format(x);
  const pct = (x) => AR.format(Math.round(x * 100)) + "٪";
  const today = () => new Date().toISOString().slice(0, 10);
  const fmtD = (iso) => { if (!iso) return "—"; try { return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso + "T12:00:00Z")); } catch (e) { return iso; } };
  const fmtDT = (ts) => { try { return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(ts)); } catch (e) { return ""; } };
  const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 864e5);
  const sizeTxt = (b) => b > 1048576 ? (b / 1048576).toFixed(1) + " م.ب" : Math.max(1, Math.round(b / 1024)) + " ك.ب";

  const STATUS = {
    full: { label: "مدعوم مبدئيًا", cls: "s-full", ic: "check" },
    partial: { label: "جزئي", cls: "s-partial", ic: "half" },
    missing: { label: "ناقص", cls: "s-missing", ic: "minus" },
    unchecked: { label: "لم يُفحص", cls: "s-unchecked", ic: "minus" }
  };
  const REQ_STATUS = (c) => c.total && c.full === c.total ? ["مدعوم", "s-full"] : c.checked === 0 ? ["لم يُفحص", "s-unchecked"] : c.full + c.partial > 0 ? ["مدعوم جزئيًا", "s-partial"] : ["ناقص", "s-missing"];
  const TYPE_LABEL = { scope: "محتوى", approval: "اعتماد", date: "تاريخ ضمن الدورة" };

  /* ---------- الحالة ---------- */
  function defaults() {
    return {
      v: 1,
      org: { name: "الجهة التجريبية", cycleStart: "2025-12-01", cycleEnd: "2026-11-30", submission: "2026-11-28", target: 90 },
      library: clone(window.WATEERAH_DEFAULT_LIBRARY),
      atts: {}, results: {}, overrides: {}, plans: {}, activity: [],
      ui: { ind: "BC", req: "BC-01", open: {} }
    };
  }
  let S;
  let storageOk = true;
  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) { const d = JSON.parse(raw); if (d && d.v === 1) return Object.assign(defaults(), d); } } catch (e) { storageOk = false; }
    return defaults();
  }
  let saveT;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(S)); storageOk = true; }
      catch (e) { if (storageOk) toast("تعذّر الحفظ في هذا المتصفح؛ صدّر نسخة احتياطية من الإعدادات."); storageOk = false; }
    }, 150);
  }
  function log(text) { S.activity.unshift({ t: Date.now(), text }); S.activity = S.activity.slice(0, 40); }

  /* ---------- حسابات ---------- */
  const allReqs = () => S.library.flatMap((i) => i.requirements.map((r) => ({ ...r, ind: i })));
  const findReq = (id) => allReqs().find((r) => r.id === id);
  function condStatus(c) {
    const o = S.overrides[c.id];
    if (o) return o.status;
    for (const rid in S.results) { const r = S.results[rid]; if (r.conds && r.conds[c.id]) return r.conds[c.id].status; }
    return "unchecked";
  }
  function condResult(reqId, cid) { const r = S.results[reqId]; return r && r.conds ? r.conds[cid] : null; }
  function reqCounts(req) {
    const c = { total: req.conditions.length, full: 0, partial: 0, missing: 0, unchecked: 0, checked: 0 };
    for (const k of req.conditions) { const s = condStatus(k); c[s]++; if (s !== "unchecked") c.checked++; }
    c.cov = c.total ? (c.full + c.partial * 0.5) / c.total : 0;
    return c;
  }
  function totals(reqs = allReqs()) {
    const t = { total: 0, full: 0, partial: 0, missing: 0, unchecked: 0, reqDone: 0, reqs: reqs.length };
    for (const r of reqs) { const c = reqCounts(r); ["total", "full", "partial", "missing", "unchecked"].forEach((k) => (t[k] += c[k])); if (c.total && c.full === c.total) t.reqDone++; }
    t.cov = t.total ? (t.full + t.partial * 0.5) / t.total : 0;
    return t;
  }
  function forecast() {
    const sub = S.org.submission;
    let now = 0, exp = 0, total = 0;
    const steps = [];
    const unplanned = [];
    for (const r of allReqs()) for (const c of r.conditions) {
      total++;
      const s = condStatus(c), w = s === "full" ? 1 : s === "partial" ? 0.5 : 0;
      now += w;
      const p = S.plans[c.id];
      if (s !== "full" && p && p.status !== "done" && p.due && p.due <= sub) { exp += 1; steps.push({ due: p.due, gain: 1 - w }); }
      else if (s !== "full" && p && p.status === "done") { exp += 1; }
      else { exp += w; if (s !== "full" && !p) unplanned.push({ r, c, s }); }
    }
    const nowC = total ? now / total : 0, expC = total ? exp / total : 0;
    const tgt = (S.org.target || 90) / 100;
    const state = expC >= tgt ? ["على المسار", "var(--ok)"] : expC >= tgt - 0.15 ? ["مخاطر محدودة", "var(--part)"] : ["فجوات متوقعة", "var(--bad)"];
    return { nowC, expC, total, steps: steps.sort((a, b) => a.due.localeCompare(b.due)), unplanned, state, tgt };
  }

  /* ---------- أدوات واجهة ---------- */
  let toastT;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 3200); }
  const dlg = $("#dlg");
  function openDialog(title, body, actions = []) {
    dlg.innerHTML = `<div class="dlg-h"><h3>${esc(title)}</h3><button class="iconbtn" data-close aria-label="إغلاق">${icon("x")}</button></div><div class="dlg-b">${body}</div>${actions.length ? `<div class="dlg-f">${actions.map((a, i) => `<button class="btn ${a.cls || ""}" data-act="${i}">${a.label}</button>`).join("")}</div>` : ""}`;
    $("[data-close]", dlg).onclick = () => dlg.close();
    actions.forEach((a, i) => ($(`[data-act="${i}"]`, dlg).onclick = () => { if (a.run && a.run() === false) return; dlg.close(); }));
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  }
  function confirmBox(title, msg, okLabel, run, danger) {
    openDialog(title, `<p style="margin:0">${msg}</p>`, [{ label: "إلغاء" }, { label: okLabel, cls: danger ? "primary" : "primary", run }]);
  }
  const ring = (p, color) => `<div class="ring" style="--p:${Math.round(p * 100)};--c:${color || "var(--brand)"}"><span class="num">${pct(p)}</span></div>`;
  const chip = (s, label) => `<span class="chip ${STATUS[s].cls}">${label || STATUS[s].label}</span>`;

  /* ---------- التنزيل ---------- */
  let dl = null;
  if (window.claude && typeof window.claude.use === "function") { window.claude.use("downloads").then((d) => (dl = d)).catch(() => {}); }
  async function download(filename, data, mime) {
    if (dl) {
      try { await dl.save({ filename, data }); toast("تم حفظ الملف"); return; }
      catch (e) { if (e && e.code === "declined") return; if (e && e.code === "rate_limited") { toast("انتظر لحظة ثم أعد المحاولة"); return; } }
    }
    try {
      const blob = new Blob([data], { type: mime || "application/octet-stream" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    } catch (e) { toast("التنزيل غير متاح هنا؛ استخدم زر النسخ."); }
  }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); toast("تم النسخ"); }
    catch (e) { openDialog("انسخ النص", `<textarea class="input" style="min-height:260px" readonly>${esc(t)}</textarea>`); }
  }

  /* ---------- التوجيه ---------- */
  const VIEWS = [
    { id: "dashboard", label: "لوحة الجاهزية", short: "اللوحة", ic: "grid" },
    { id: "check", label: "فحص المرفقات", short: "الفحص", ic: "scan" },
    { id: "library", label: "المؤشرات والمتطلبات", short: "المكتبة", ic: "layers" },
    { id: "forecast", label: "توقع الجاهزية", short: "التوقع", ic: "trend" },
    { id: "report", label: "تقرير الجاهزية", short: "التقرير", ic: "doc" }
  ];
  function route() {
    let h = (location.hash || "").slice(1);
    let view = h.split("-")[0] || "dashboard";
    if (h.startsWith("check-")) {
      const rid = h.slice(6).toUpperCase();
      const r = findReq(rid);
      if (r) { S.ui.req = r.id; S.ui.ind = r.ind.id; }
    }
    if (![...VIEWS.map((v) => v.id), "settings"].includes(view)) view = "dashboard";
    render(view);
  }
  function go(hash) { if (location.hash === "#" + hash) route(); else location.hash = hash; }

  function renderNav(view) {
    const gaps = totals().missing;
    $("#nav").innerHTML = VIEWS.map((v) => `<a href="#${v.id}" ${v.id === view ? 'aria-current="page"' : ""}>${icon(v.ic)}<span>${v.label}</span>${v.id === "check" && gaps ? `<span class="badge num">${n2(gaps)}</span>` : ""}</a>`).join("");
    $("#tabbar").innerHTML = VIEWS.map((v) => `<a href="#${v.id}" ${v.id === view ? 'aria-current="page"' : ""}>${icon(v.ic)}<span>${v.short}</span></a>`).join("");
    const label = view === "settings" ? "مساحة الجهة" : VIEWS.find((v) => v.id === view).label;
    $("#crumbs").innerHTML = `<span class="hide-sm">مساحة العمل</span><svg class="i hide-sm"><use href="#i-chevl"/></svg><b>${label}</b>`;
    $("#orgName").textContent = S.org.name || "مساحة الجهة";
  }

  let currentView = "dashboard";
  function render(view) {
    view = view || currentView;
    const changed = view !== currentView;
    currentView = view;
    renderNav(view);
    const c = $("#content");
    ({ dashboard: vDashboard, check: vCheck, library: vLibrary, forecast: vForecast, report: vReport, settings: vSettings })[view](c);
    if (changed) { window.scrollTo(0, 0); }
  }

  /* =========================================================
     لوحة الجاهزية
     ========================================================= */
  function vDashboard(c) {
    const t = totals(), f = forecast();
    const days = daysBetween(today(), S.org.submission);
    const gaps = [];
    for (const r of allReqs()) for (const k of r.conditions) { const s = condStatus(k); if (s === "missing" || s === "partial") gaps.push({ r, k, s }); }
    gaps.sort((a, b) => (a.s === "missing" ? 0 : 1) - (b.s === "missing" ? 0 : 1));
    const firstGap = gaps[0];
    const uncheckedReqs = allReqs().filter((r) => reqCounts(r).checked === 0);
    c.innerHTML = `
    <section class="hero">
      <div class="grow">
        <div class="eyebrow">${icon("building")} ${esc(S.org.name)} · دورة القياس ${fmtD(S.org.cycleStart)} – ${fmtD(S.org.cycleEnd)}</div>
        <h1>لوحة الجاهزية</h1>
        <p>صورة لحظية لتغطية أدلتك مقابل شروط كل متطلب، وما الذي يجب إنجازه قبل موعد التقديم.</p>
        <div class="hero-stats">
          <div><b class="num">${days >= 0 ? n2(days) : "انتهى"}</b><span>${days >= 0 ? "يومًا حتى التقديم" : "موعد التقديم"}</span></div>
          <div><b class="num">${pct(t.cov)}</b><span>التغطية الحالية</span></div>
          <div><b class="num">${pct(f.expC)}</b><span>التغطية المتوقعة</span></div>
        </div>
      </div>
      <a class="btn" href="#check${firstGap ? "-" + firstGap.r.id.toLowerCase() : ""}">${icon("scan")} ${firstGap ? "عالج أعلى فجوة" : "ابدأ الفحص"}</a>
    </section>
    <div class="grid g-kpi" style="margin-top:20px">
      <div class="card kpi"><span>${icon("shield")} الشروط المدعومة</span><b class="num">${n2(t.full)} <small>من ${n2(t.total)}</small></b><small>${n2(t.partial)} جزئي</small></div>
      <div class="card kpi"><span>${icon("layers")} متطلبات مكتملة</span><b class="num">${n2(t.reqDone)} <small>من ${n2(t.reqs)}</small></b><small>${n2(S.library.length)} مؤشرات</small></div>
      <div class="card kpi"><span>${icon("flag")} فجوات مفتوحة</span><b class="num" style="color:var(--bad)">${n2(t.missing + t.partial)}</b><small>${n2(t.unchecked)} شرطًا لم يُفحص</small></div>
      <div class="card kpi"><span>${icon("trend")} حالة الخطة</span><b style="color:${f.state[1]};font-size:22px;padding:6px 0 4px">${f.state[0]}</b><small>المستهدف ${pct(f.tgt)}</small></div>
    </div>
    <div class="grid g2" style="margin-top:20px">
      <div class="card">
        <div class="card-h"><div><h2>التغطية حسب المؤشر</h2><p>اضغط على المؤشر لفتح أول متطلب فيه</p></div></div>
        <div class="card-b">
          <div class="bars">${S.library.map((ind) => { const x = totals(ind.requirements); const w = (n) => (x.total ? (n / x.total) * 100 : 0); return `<div class="bar-row" data-ind="${ind.id}" role="button" tabindex="0"><span class="nm">${esc(ind.name)}</span><div class="stack" aria-label="${pct(x.cov)}"><i class="f" style="width:${w(x.full)}%"></i><i class="p" style="width:${w(x.partial)}%"></i><i class="m" style="width:${w(x.missing)}%"></i></div><b class="num" style="text-align:end">${pct(x.cov)}</b></div>`; }).join("")}</div>
          <div class="hr"></div>
          <div class="legend"><span><i style="background:var(--ok)"></i>مدعوم</span><span><i style="background:var(--part)"></i>جزئي</span><span><i style="background:var(--bad)"></i>ناقص</span><span><i style="background:var(--sunk);border:1px solid var(--line)"></i>لم يُفحص</span></div>
        </div>
      </div>
      <div class="card">
        <div class="card-h"><div><h2>آخر النشاطات</h2><p>ما تم في مساحة هذه الجهة</p></div></div>
        <div class="card-b">${S.activity.length ? `<div class="activity">${S.activity.slice(0, 7).map((a) => `<div><i></i><span>${esc(a.text)}<small>${fmtDT(a.t)}</small></span></div>`).join("")}</div>` : `<div class="empty">${icon("scan")}<div>لا نشاط بعد. ابدأ برفع أدلة أول متطلب.</div><a class="btn soft sm" style="margin-top:10px" href="#check">فحص المرفقات</a></div>`}</div>
      </div>
    </div>
    <div class="card" style="margin-top:20px">
      <div class="card-h"><div><h2>الفجوات ذات الأولوية</h2><p>الشروط الناقصة أولًا، ثم الجزئية، ثم المتطلبات غير المفحوصة</p></div><a class="btn ghost sm end" href="#forecast">خطة الاستكمال ${icon("arrow")}</a></div>
      <div class="card-b tw">${gaps.length || uncheckedReqs.length ? `<table class="t"><thead><tr><th>المتطلب</th><th>الشرط</th><th>الحالة</th><th>الخطة</th></tr></thead><tbody>${gaps.slice(0, 8).map((g) => { const p = S.plans[g.k.id]; return `<tr class="click" data-req="${g.r.id}"><td><span class="code">${g.r.id}</span></td><td>${esc(g.k.text)}</td><td>${chip(g.s)}</td><td>${p ? `<span class="muted">${esc(p.owner || "—")} · ${fmtD(p.due)}</span>` : `<span class="muted">غير مخطط</span>`}</td></tr>`; }).join("")}${uncheckedReqs.slice(0, Math.max(0, 8 - gaps.length)).map((r) => `<tr class="click" data-req="${r.id}"><td><span class="code">${r.id}</span></td><td>${esc(r.name)} <span class="muted">(${n2(r.conditions.length)} شروط)</span></td><td>${chip("unchecked")}</td><td><span class="muted">ارفع الأدلة وافحص</span></td></tr>`).join("")}</tbody></table>` : `<div class="empty">لا توجد فجوات مفتوحة 🎉</div>`}</div>
    </div>
    <p class="foot-note">التقييم داخلي مبدئي يعتمد على قواعد نصية قابلة للتعديل ومراجعة المختص، ولا يمثل نتيجة رسمية. تُقرأ الملفات وتبقى في هذا المتصفح.</p>`;
    $$(".bar-row", c).forEach((el) => { const fn = () => { const ind = S.library.find((i) => i.id === el.dataset.ind); if (ind && ind.requirements[0]) go("check-" + ind.requirements[0].id.toLowerCase()); }; el.onclick = fn; el.onkeydown = (e) => { if (e.key === "Enter") fn(); }; });
    $$("tr[data-req]", c).forEach((el) => (el.onclick = () => go("check-" + el.dataset.req.toLowerCase())));
  }

  /* =========================================================
     فحص المرفقات
     ========================================================= */
  const pending = {}; // ملفات قيد الاستخراج
  function vCheck(c) {
    let ind = S.library.find((i) => i.id === S.ui.ind) || S.library[0];
    if (!ind) { c.innerHTML = `<div class="empty">لا توجد مؤشرات. أضف مؤشرًا من المكتبة.</div>`; return; }
    let req = ind.requirements.find((r) => r.id === S.ui.req) || ind.requirements[0];
    if (req) S.ui.req = req.id;
    const atts = (req && S.atts[req.id]) || [];
    const res = req && S.results[req.id];
    const stale = res && res.sig !== attSig(req);
    const cnt = req ? reqCounts(req) : null;
    const f = forecast();
    const samples = req && window.WATEERAH_SAMPLES[req.id];

    c.innerHTML = `
    <section class="hero">
      <div class="grow">
        <div class="eyebrow">${icon("scan")} الفحص الذاتي للجهة</div>
        <h1>فحص أدلة الامتثال</h1>
        <p>ارفع أدلتك، وراجع ما تثبته المرفقات لكل شرط قبل التقديم.</p>
      </div>
      <a class="btn" href="#report">${icon("doc")} تقرير الجاهزية</a>
    </section>
    <div class="pickers">
      <div class="picker"><label for="pInd">المؤشر</label><select id="pInd">${S.library.map((i) => `<option value="${i.id}" ${i.id === ind.id ? "selected" : ""}>${esc(i.name)}</option>`).join("")}</select>${icon("chev")}</div>
      <div class="picker"><label for="pReq">المتطلب</label><select id="pReq">${ind.requirements.map((r) => `<option value="${r.id}" ${req && r.id === req.id ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select>${icon("chev")}</div>
    </div>
    ${req ? `
    <div class="req-meta"><span class="code">${req.id}</span><span class="muted">${n2(req.conditions.length)} شروط</span><span>${esc(req.desc || "")}</span></div>
    <div class="grid g2">
      <div class="card">
        <div class="card-h"><div class="ic">${icon("doc")}</div><div><h2>مرفقات المتطلب</h2><p>أضف المستندات الداعمة للشروط.</p></div></div>
        <div class="card-b">
          <div class="drop" id="drop">
            ${icon("upload", "i big")}
            <b>اسحب الملفات هنا أو اخترها من جهازك</b>
            <small>PDF أو Word أو Excel أو TXT · حتى 15 ميغابايت لكل ملف</small>
            <div class="row" style="justify-content:center;flex-wrap:wrap">
              <button class="btn soft" id="pick">${icon("plus")} اختيار المرفقات</button>
              ${samples ? `<button class="btn ghost sm" id="sample">${icon("sample")} جرّب ملفات نموذجية</button>` : ""}
            </div>
          </div>
          <div class="files" id="files">
            ${atts.map((a) => `<div class="file"><span class="fi">${icon("doc")}</span><div class="meta"><b title="${esc(a.name)}">${esc(a.name)}</b><small>${a.ext} · ${a.pages ? n2(a.pages) + " صفحة · " : ""}${a.sheets ? n2(a.sheets) + " ورقة · " : ""}${n2(a.words)} كلمة${a.sample ? " · نموذجي" : ""}</small></div><button class="iconbtn" data-view="${a.id}" title="عرض النص المستخرج" aria-label="عرض النص">${icon("eye")}</button><button class="iconbtn" data-del="${a.id}" title="إزالة" aria-label="إزالة">${icon("x")}</button></div>`).join("")}
            ${(pending[req.id] || []).map((p) => `<div class="file ${p.err ? "err" : ""}"><span class="fi">${p.err ? icon("x") : `<span class="spin"></span>`}</span><div class="meta"><b>${esc(p.name)}</b><small>${p.err ? esc(p.err) : "جارٍ قراءة النص…"}</small></div>${p.err ? `<button class="iconbtn" data-perr="${p.id}" aria-label="إخفاء">${icon("x")}</button>` : ""}</div>`).join("")}
          </div>
          ${atts.some((a) => a.words < 15) ? `<div class="stale">${icon("flag")} ملف بنص قليل جدًا؛ قد يكون PDF ممسوحًا ضوئيًا. احفظه بصيغة نصية أو Word.</div>` : ""}
          ${stale ? `<div class="stale">${icon("flag")} تغيّرت المرفقات أو القواعد منذ آخر فحص.</div>` : ""}
          <div class="row" style="margin-top:16px">
            <button class="btn primary" id="run" ${atts.length ? "" : "disabled"}>${icon("search")} افحص المرفقات</button>
            ${res ? `<span class="muted" style="font-size:12.5px">آخر فحص: ${fmtDT(res.at)}</span>` : ""}
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-h"><div class="ic">${icon("shield")}</div><div><h2>نتيجة الفحص</h2><p>تفاصيل تحقق كل شرط وموضع الدليل.</p></div><span class="end">${chip(...(() => { const [l, k] = REQ_STATUS(cnt); return [k === "s-full" ? "full" : k === "s-partial" ? "partial" : k === "s-missing" ? "missing" : "unchecked", l]; })())}</span></div>
        <div class="card-b">
          <div class="summary">${ring(cnt.cov, cnt.full === cnt.total ? "var(--ok)" : "var(--brand)")}<div><b>${n2(cnt.full)} من ${n2(cnt.total)} شروط مدعومة</b><small>${cnt.partial ? n2(cnt.partial) + " جزئي · " : ""}التغطية الحالية للمرفقات ضمن هذا المتطلب</small></div></div>
          <div class="conds">${req.conditions.map((k) => condHTML(req, k)).join("")}</div>
          ${priorityHTML(req)}
        </div>
      </div>
    </div>
    <div class="card forecast-strip">
      <div class="ttl"><div class="ic">${icon("trend")}</div><div><h3>توقع الجاهزية</h3><small>حسب خطة الاستكمال</small></div></div>
      <div class="kv"><span>موعد التقديم</span><b class="num">${fmtD(S.org.submission)}</b></div>
      <div class="kv"><span>التغطية المتوقعة</span><b class="num">${pct(f.expC)}</b></div>
      <div class="kv"><span>حالة الخطة</span><b style="color:${f.state[1]}">${f.state[0]}</b></div>
      <a class="btn" href="#forecast">تفاصيل التوقع ${icon("arrow")}</a>
    </div>` : `<div class="empty">لا توجد متطلبات في هذا المؤشر.</div>`}
    <p class="foot-note">التقييم داخلي مبدئي يعتمد على قواعد نصية قابلة للتعديل ومراجعة المختص. تُقرأ الملفات وتبقى في هذا المتصفح.</p>`;

    $("#pInd").onchange = (e) => { const i = S.library.find((x) => x.id === e.target.value); S.ui.ind = i.id; S.ui.req = i.requirements[0] && i.requirements[0].id; save(); history.replaceState(null, "", "#check" + (S.ui.req ? "-" + S.ui.req.toLowerCase() : "")); render(); };
    $("#pReq").onchange = (e) => { S.ui.req = e.target.value; save(); history.replaceState(null, "", "#check-" + S.ui.req.toLowerCase()); render(); };
    if (!req) return;
    const drop = $("#drop");
    $("#pick").onclick = () => { $("#fileIn").value = ""; $("#fileIn").click(); };
    $("#fileIn").onchange = (e) => addFiles(req.id, [...e.target.files]);
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => addFiles(req.id, [...(e.dataTransfer.files || [])]));
    if ($("#sample")) $("#sample").onclick = () => {
      const have = new Set(atts.map((a) => a.name));
      const add = samples.filter((s) => !have.has(s.name));
      const next = add[0];
      if (!next) { toast("أُضيفت كل الملفات النموذجية لهذا المتطلب"); return; }
      (S.atts[req.id] = S.atts[req.id] || []).push({ id: uid(), name: next.name, ext: "TXT", size: next.text.length * 2, text: next.text, pages: null, words: next.text.split(/\s+/).length, sample: true, at: Date.now() });
      log(`أُضيف ملف نموذجي «${next.name}» إلى ${req.id}`); save(); render();
      toast(add.length > 1 ? "أضيف ملف نموذجي، اضغط مجددًا لإضافة التالي" : "أضيف ملف نموذجي");
    };
    $$("[data-del]", c).forEach((b) => (b.onclick = () => {
      const a = atts.find((x) => x.id === b.dataset.del);
      S.atts[req.id] = atts.filter((x) => x.id !== b.dataset.del);
      log(`أُزيل «${a.name}» من ${req.id}`); save(); render();
    }));
    $$("[data-perr]", c).forEach((b) => (b.onclick = () => { pending[req.id] = (pending[req.id] || []).filter((p) => p.id !== b.dataset.perr); render(); }));
    $$("[data-view]", c).forEach((b) => (b.onclick = () => { const a = atts.find((x) => x.id === b.dataset.view); openDialog(a.name, `<div class="muted" style="font-size:13px">النص المستخرج من الملف (${n2(a.words)} كلمة)</div><div class="pre">${esc(a.text.slice(0, 20000)) || "لا يوجد نص قابل للقراءة."}${a.text.length > 20000 ? "\n…" : ""}</div>`); }));
    $("#run").onclick = () => runCheck(req);
    bindConds(c, req);
  }

  function attSig(req) {
    const a = (S.atts[req.id] || []).map((x) => x.id).join(",");
    const r = JSON.stringify(req.conditions.map((k) => [k.groups, k.negatives, k.date, k.anchor]));
    let h = 0; const s = a + "|" + r + "|" + S.org.cycleStart + S.org.cycleEnd;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return String(h);
  }

  async function addFiles(reqId, files) {
    if (!files.length) return;
    const list = (pending[reqId] = pending[reqId] || []);
    const jobs = files.map((f) => ({ id: uid(), name: f.name, f }));
    list.push(...jobs.map(({ id, name }) => ({ id, name })));
    render();
    for (const j of jobs) {
      const p = list.find((x) => x.id === j.id);
      try {
        if (j.f.size > 15 * 1048576) throw new Error("الملف أكبر من 15 ميغابايت");
        const r = await E.extractFile(j.f);
        if (!r.text) throw new Error("لم يُعثر على نص قابل للقراءة (قد يكون ممسوحًا ضوئيًا)");
        (S.atts[reqId] = S.atts[reqId] || []).push({ id: uid(), name: r.name, ext: r.ext, size: r.size, text: r.text.slice(0, 400000), pages: r.pages, sheets: r.sheets, words: r.words, at: Date.now() });
        pending[reqId] = pending[reqId].filter((x) => x.id !== j.id);
        log(`رُفع «${r.name}» إلى ${reqId}`);
      } catch (e) { p.err = (e && e.message) || "تعذّرت قراءة الملف"; }
      save(); if (currentView === "check") render();
    }
  }

  function runCheck(req) {
    const atts = S.atts[req.id] || [];
    const btn = $("#run"); if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spin" style="border-top-color:#fff"></span> جارٍ الفحص…`; }
    setTimeout(() => {
      const conds = E.evaluateRequirement(req, atts, { start: S.org.cycleStart, end: S.org.cycleEnd });
      S.results[req.id] = { at: Date.now(), sig: attSig(req), conds };
      const c = reqCounts(req);
      log(`فُحص ${req.id}: ${n2(c.full)} من ${n2(c.total)} شروط مدعومة`);
      S.ui.open = {}; const firstGap = req.conditions.find((k) => condStatus(k) !== "full"); if (firstGap) S.ui.open[firstGap.id] = 1;
      save(); render(); toast(`اكتمل الفحص: ${n2(c.full)} من ${n2(c.total)} شروط مدعومة`);
    }, 380);
  }

  function hlText(text, ranges) {
    let out = "", last = 0;
    for (const [a, b] of ranges) { if (a < last) continue; out += esc(text.slice(last, a)) + "<mark>" + esc(text.slice(a, b)) + "</mark>"; last = b; }
    return out + esc(text.slice(last));
  }
  function condHTML(req, k) {
    const r = condResult(req.id, k.id), o = S.overrides[k.id], s = condStatus(k), p = S.plans[k.id];
    const open = S.ui.open[k.id];
    const stIc = STATUS[s];
    const label = o ? (o.status === "full" ? "معتمد من المراجع" : "مرفوض من المراجع") : STATUS[s].label;
    return `<div class="cond ${open ? "open" : ""}" data-c="${k.id}">
      <button class="cond-h" aria-expanded="${open ? "true" : "false"}">
        <span class="st ${stIc.cls}">${icon(stIc.ic)}</span>
        <span class="t">${esc(k.text)}</span>
        <span class="chip ${o ? "s-rev" : stIc.cls}">${label}</span>
        ${icon("chev", "i chev")}
      </button>
      <div class="cond-b">
        ${r ? `<p class="reason">${esc(r.reason)}</p>` : `<p class="reason">لم يُفحص بعد. ارفع المرفقات ثم اضغط «افحص المرفقات».</p>`}
        ${r && r.evidence.length ? r.evidence.map((e) => `<div class="quote"><div class="src">${icon("doc")} ${esc(e.att)} · نص الملف${e.anchor ? " · موضوع المستند من عنوانه" : ""}</div>${e.parts.map((pt) => `<p>${hlText(pt.text, pt.ranges)}</p>`).join("")}</div>`).join("") : ""}
        ${r && r.missingTerms && r.missingTerms.length && s !== "full" ? `<div class="missing-terms">عناصر لم تظهر: ${r.missingTerms.map((t) => "«" + esc(t) + "»").join("، ")}</div>` : ""}
        ${s !== "full" && k.hint ? `<div class="hint">${icon("bulb")}<span>${esc(k.hint)}</span></div>` : ""}
        ${o ? `<div class="rev-note">مراجعة المختص: ${o.status === "full" ? "اعتُمد الشرط" : "رُفض الدليل"}${o.note ? " — " + esc(o.note) : ""} · ${fmtDT(o.at)}</div>` : ""}
        <div class="rev-box">
          ${o ? `<button class="btn sm" data-rev="clear">${icon("x")} إلغاء المراجعة</button>` : `<button class="btn sm" data-rev="full">${icon("check")} اعتماد الشرط</button><button class="btn sm" data-rev="missing">${icon("x")} رفض الدليل</button>`}
          ${s !== "full" ? `<button class="btn ghost sm" data-plan>${icon("cal")} ${p ? "تعديل الخطة" : "إضافة إلى الخطة"}</button>` : ""}
          ${p && s !== "full" ? `<span class="muted" style="font-size:12.5px">${esc(p.owner || "بدون مسؤول")} · ${fmtD(p.due)}</span>` : ""}
        </div>
      </div>
    </div>`;
  }
  function priorityHTML(req) {
    const gap = req.conditions.find((k) => condStatus(k) === "missing") || req.conditions.find((k) => condStatus(k) === "partial");
    const cnt = reqCounts(req);
    if (cnt.checked === 0 && !gap) return "";
    if (!gap) return cnt.full === cnt.total ? `<div class="priority ok">${icon("check")}<div><b>المتطلب مكتمل</b><p>كل الشروط مدعومة مبدئيًا. راجع الأدلة وانتقل إلى المتطلب التالي.</p></div></div>` : "";
    return `<div class="priority">${icon("flag")}<div><b>الأولوية الآن</b><p>${esc(gap.hint || gap.text)}</p></div></div>`;
  }
  function bindConds(c, req) {
    $$(".cond", c).forEach((el) => {
      const id = el.dataset.c, k = req.conditions.find((x) => x.id === id);
      $(".cond-h", el).onclick = () => { S.ui.open[id] = !S.ui.open[id]; el.classList.toggle("open"); $(".cond-h", el).setAttribute("aria-expanded", el.classList.contains("open")); save(); };
      $$("[data-rev]", el).forEach((b) => (b.onclick = () => {
        const v = b.dataset.rev;
        if (v === "clear") { delete S.overrides[id]; log(`أُلغيت مراجعة «${k.text}»`); save(); render(); return; }
        openDialog(v === "full" ? "اعتماد الشرط" : "رفض الدليل", `<p style="margin:0">${esc(k.text)}</p><div class="field"><label for="revNote">ملاحظة المراجع (اختيارية)</label><textarea class="input" id="revNote" placeholder="مثال: تم التحقق من صفحة الاعتماد الموقعة"></textarea></div>`, [
          { label: "إلغاء" },
          { label: v === "full" ? "اعتماد" : "رفض", cls: "primary", run: () => { S.overrides[id] = { status: v, note: $("#revNote").value.trim(), at: Date.now() }; log(`${v === "full" ? "اعتُمد" : "رُفض"} الشرط «${k.text}» يدويًا`); save(); render(); } }
        ]);
      }));
      const pb = $("[data-plan]", el); if (pb) pb.onclick = () => planDialog(req, k);
    });
  }
  function planDialog(req, k) {
    const p = S.plans[k.id] || { owner: "", due: "", status: "planned" };
    openDialog("خطة استكمال الشرط", `<p style="margin:0"><span class="code">${req.id}</span> ${esc(k.text)}</p>
      <div class="field"><label for="pOwner">المسؤول</label><input class="input" id="pOwner" value="${esc(p.owner)}" placeholder="مثال: إدارة المخاطر"></div>
      <div class="field"><label for="pDue">تاريخ الإنجاز المتوقع</label><input class="input" type="date" id="pDue" value="${esc(p.due)}"></div>
      <div class="field"><label for="pSt">الحالة</label><select class="input" id="pSt"><option value="planned">مخطط</option><option value="progress">قيد التنفيذ</option><option value="done">منجز (بانتظار رفع الدليل)</option></select></div>`,
      [...(S.plans[k.id] ? [{ label: "حذف الخطة", cls: "danger", run: () => { delete S.plans[k.id]; save(); render(); } }] : []), { label: "إلغاء" }, { label: "حفظ", cls: "primary", run: () => {
        const due = $("#pDue").value; if (!due) { toast("حدد تاريخ الإنجاز"); return false; }
        S.plans[k.id] = { owner: $("#pOwner").value.trim(), due, status: $("#pSt").value }; log(`خُطط للشرط «${k.text}» حتى ${due}`); save(); render();
      } }]);
    $("#pSt").value = p.status;
  }

  /* =========================================================
     المكتبة
     ========================================================= */
  function vLibrary(c) {
    c.innerHTML = `
    <div class="row" style="margin-bottom:18px;flex-wrap:wrap">
      <div><h1 style="font-family:var(--fd);margin:0;font-size:28px">المؤشرات والمتطلبات</h1><p class="muted" style="margin:2px 0 0">قواعد الفحص شفافة وقابلة للتعديل: كل شرط مجموعة عبارات يلزم ظهورها في الدليل.</p></div>
      <span class="spacer"></span>
      <button class="btn" id="addInd">${icon("plus")} مؤشر</button>
      <button class="btn ghost" id="resetLib">استعادة الافتراضي</button>
    </div>
    ${S.library.map((ind) => { const t = totals(ind.requirements); return `<div class="card ind" data-ind="${ind.id}">
      <div class="ind-h"><div class="card-h" style="padding:0"><div class="ic">${icon(ind.icon || "layers")}</div></div><div><h3>${esc(ind.name)}</h3><span class="muted" style="font-size:12.5px">${n2(ind.requirements.length)} متطلبات · تغطية ${pct(t.cov)}</span></div><span class="spacer"></span><button class="btn ghost sm" data-addreq>${icon("plus")} متطلب</button><button class="iconbtn" data-editind aria-label="تعديل">${icon("pen")}</button></div>
      ${ind.requirements.map((r) => { const cn = reqCounts(r); const [l, k] = REQ_STATUS(cn); return `<div class="req" data-req="${r.id}">
        <div class="req-top"><span class="code">${r.id}</span><b>${esc(r.name)}</b><span class="chip ${k}">${l}</span><span class="spacer"></span><a class="btn ghost sm" href="#check-${r.id.toLowerCase()}">فحص</a><button class="btn ghost sm" data-addcond>${icon("plus")} شرط</button><button class="iconbtn" data-editreq aria-label="تعديل المتطلب">${icon("pen")}</button></div>
        <ul>${r.conditions.map((k) => `<li><span class="st chip ${STATUS[condStatus(k)].cls}" style="padding:0 8px">${STATUS[condStatus(k)].label}</span><span class="t">${esc(k.text)}</span><span class="ty">${TYPE_LABEL[k.type] || "محتوى"}</span><button class="iconbtn" style="width:32px;height:32px" data-editcond="${k.id}" aria-label="تعديل الشرط">${icon("pen")}</button></li>`).join("")}</ul>
      </div>`; }).join("")}
    </div>`; }).join("")}`;
    $("#resetLib").onclick = () => confirmBox("استعادة المكتبة الافتراضية", "ستُستبدل كل التعديلات على المؤشرات والقواعد. المرفقات والنتائج تبقى لكن قد تحتاج إعادة فحص.", "استعادة", () => { S.library = clone(window.WATEERAH_DEFAULT_LIBRARY); log("استُعيدت المكتبة الافتراضية"); save(); render(); });
    $("#addInd").onclick = () => indDialog();
    $$(".ind", c).forEach((el) => {
      const ind = S.library.find((i) => i.id === el.dataset.ind);
      $("[data-editind]", el).onclick = () => indDialog(ind);
      $("[data-addreq]", el).onclick = () => reqDialog(ind);
      $$(".req", el).forEach((rel) => {
        const r = ind.requirements.find((x) => x.id === rel.dataset.req);
        $("[data-editreq]", rel).onclick = () => reqDialog(ind, r);
        $("[data-addcond]", rel).onclick = () => condDialog(r);
        $$("[data-editcond]", rel).forEach((b) => (b.onclick = () => condDialog(r, r.conditions.find((k) => k.id === b.dataset.editcond))));
      });
    });
  }
  function indDialog(ind) {
    openDialog(ind ? "تعديل المؤشر" : "مؤشر جديد", `
      <div class="field"><label for="fIndId">الرمز</label><input class="input" id="fIndId" value="${esc(ind ? ind.id : "")}" ${ind ? "disabled" : ""} placeholder="مثال: IT" dir="ltr"></div>
      <div class="field"><label for="fIndName">اسم المؤشر</label><input class="input" id="fIndName" value="${esc(ind ? ind.name : "")}"></div>`,
      [...(ind ? [{ label: "حذف المؤشر", cls: "danger", run: () => { confirmBox("حذف المؤشر", `سيُحذف «${esc(ind.name)}» وكل متطلباته.`, "حذف", () => { S.library = S.library.filter((x) => x !== ind); save(); render(); }); return false; } }] : []),
      { label: "إلغاء" }, { label: "حفظ", cls: "primary", run: () => {
        const name = $("#fIndName").value.trim(); if (!name) { toast("اكتب اسم المؤشر"); return false; }
        if (ind) ind.name = name;
        else { const id = $("#fIndId").value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""); if (!id || S.library.some((x) => x.id === id)) { toast("رمز غير صالح أو مكرر (حروف إنجليزية وأرقام)"); return false; } S.library.push({ id, name, icon: "layers", requirements: [] }); }
        save(); render();
      } }]);
  }
  function reqDialog(ind, r) {
    const nextId = () => { let n = ind.requirements.length + 1, id; do { id = ind.id + "-" + String(n).padStart(2, "0"); n++; } while (findReq(id)); return id; };
    openDialog(r ? "تعديل المتطلب" : "متطلب جديد", `
      <div class="field"><label>الرمز</label><input class="input" value="${esc(r ? r.id : nextId())}" disabled dir="ltr"></div>
      <div class="field"><label for="fReqName">اسم المتطلب</label><input class="input" id="fReqName" value="${esc(r ? r.name : "")}"></div>
      <div class="field"><label for="fReqDesc">الوصف</label><textarea class="input" id="fReqDesc">${esc(r ? r.desc : "")}</textarea></div>`,
      [...(r ? [{ label: "حذف", cls: "danger", run: () => { ind.requirements = ind.requirements.filter((x) => x !== r); delete S.atts[r.id]; delete S.results[r.id]; save(); render(); } }] : []),
      { label: "إلغاء" }, { label: "حفظ", cls: "primary", run: () => {
        const name = $("#fReqName").value.trim(); if (!name) { toast("اكتب اسم المتطلب"); return false; }
        if (r) { r.name = name; r.desc = $("#fReqDesc").value.trim(); }
        else ind.requirements.push({ id: nextId(), name, desc: $("#fReqDesc").value.trim(), conditions: [] });
        save(); render();
      } }]);
  }
  const groupsToText = (g) => (g || []).map((x) => x.join("، ")).join("\n");
  const textToGroups = (t) => t.split("\n").map((l) => l.split(/[،,]/).map((s) => s.trim()).filter(Boolean)).filter((g) => g.length);
  function condDialog(r, k) {
    openDialog(k ? "تعديل قاعدة الشرط" : "شرط جديد", `
      <div class="field"><label for="fCText">نص الشرط</label><input class="input" id="fCText" value="${esc(k ? k.text : "")}"></div>
      <div class="field"><label for="fCType">نوع الشرط</label><select class="input" id="fCType"><option value="scope">محتوى</option><option value="approval">اعتماد</option><option value="date">تاريخ ضمن الدورة</option></select></div>
      <div class="field"><label for="fCGroups">مجموعات العبارات (سطر لكل مجموعة، والمرادفات مفصولة بفاصلة)</label><textarea class="input" id="fCGroups" style="min-height:120px" placeholder="سياسة استمرارية الأعمال، استمرارية الأعمال&#10;جميع الإدارات، كافة الإدارات">${esc(groupsToText(k && k.groups))}</textarea><small class="muted">يُعد الشرط مدعومًا عندما تظهر عبارة من كل مجموعة في الجملة نفسها أو التي تليها. التطبيع يتجاهل التشكيل والهمزات والتاء المربوطة.</small></div>
      <div class="field"><label for="fCNeg">عبارات تخفض الحكم إلى «جزئي»</label><input class="input" id="fCNeg" value="${esc(((k && k.negatives) || []).join("، "))}" placeholder="مسودة، غير معتمدة"></div>
      <label class="check"><input type="checkbox" id="fCDate" ${k && k.date ? "checked" : ""}> يلزم تاريخ داخل دورة القياس قرب السياق</label>
      <label class="check"><input type="checkbox" id="fCAnchor" ${k && k.anchor ? "checked" : ""}> المجموعة الأولى قد ترد في عنوان المستند أو اسم الملف</label>
      <div class="field"><label for="fCHint">ما المطلوب إرفاقه عند النقص</label><input class="input" id="fCHint" value="${esc(k ? k.hint : "")}"></div>`,
      [...(k ? [{ label: "حذف", cls: "danger", run: () => { r.conditions = r.conditions.filter((x) => x !== k); delete S.overrides[k.id]; delete S.plans[k.id]; save(); render(); } }] : []),
      { label: "إلغاء" }, { label: "حفظ", cls: "primary", run: () => {
        const text = $("#fCText").value.trim(), groups = textToGroups($("#fCGroups").value);
        if (!text || !groups.length) { toast("اكتب نص الشرط ومجموعة عبارات واحدة على الأقل"); return false; }
        const data = { text, type: $("#fCType").value, groups, negatives: $("#fCNeg").value.split(/[،,]/).map((s) => s.trim()).filter(Boolean), date: $("#fCDate").checked, anchor: $("#fCAnchor").checked, hint: $("#fCHint").value.trim() };
        if (k) Object.assign(k, data);
        else { let n = r.conditions.length + 1, id; do { id = r.id + "-" + n++; } while (r.conditions.some((x) => x.id === id)); r.conditions.push({ id, ...data }); }
        log(`عُدّلت قواعد ${r.id}`); save(); render();
      } }]);
    $("#fCType").value = (k && k.type) || "scope";
  }

  /* =========================================================
     توقع الجاهزية
     ========================================================= */
  function vForecast(c) {
    const f = forecast();
    const t0 = today(), sub = S.org.submission;
    const open = [];
    for (const r of allReqs()) for (const k of r.conditions) { const s = condStatus(k); if (s !== "full") open.push({ r, k, s, p: S.plans[k.id] }); }
    open.sort((a, b) => ((a.p && a.p.due) || "9999").localeCompare((b.p && b.p.due) || "9999"));
    const late = open.filter((x) => x.p && x.p.due > sub && x.p.status !== "done");
    c.innerHTML = `
    <div class="row" style="margin-bottom:18px;flex-wrap:wrap"><div><h1 style="font-family:var(--fd);margin:0;font-size:28px">توقع الجاهزية</h1><p class="muted" style="margin:2px 0 0">يحسب التغطية المتوقعة يوم التقديم بافتراض إنجاز كل بند مخطط قبل موعده.</p></div></div>
    <div class="grid g-kpi">
      <div class="card kpi"><span>${icon("shield")} التغطية الحالية</span><b class="num">${pct(f.nowC)}</b><small>من ${n2(f.total)} شرطًا</small></div>
      <div class="card kpi"><span>${icon("trend")} التغطية المتوقعة</span><b class="num">${pct(f.expC)}</b><small>يوم ${fmtD(sub)}</small></div>
      <div class="card kpi"><span>${icon("target")} المستهدف</span><b class="num">${pct(f.tgt)}</b><small>قابل للتعديل من الإعدادات</small></div>
      <div class="card kpi"><span>${icon("flag")} حالة الخطة</span><b class="status-big" style="color:${f.state[1]};padding:6px 0 4px;display:block">${f.state[0]}</b><small>${n2(f.unplanned.length)} فجوة بلا خطة · ${n2(late.length)} متأخرة</small></div>
    </div>
    <div class="card" style="margin-top:20px">
      <div class="card-h"><div><h2>منحنى الجاهزية حتى التقديم</h2><p>التغطية التراكمية مع كل بند في الخطة</p></div></div>
      <div class="card-b chart">${chartSVG(f, t0, sub)}</div>
    </div>
    <div class="card" style="margin-top:20px">
      <div class="card-h"><div><h2>خطة الاستكمال</h2><p>كل شرط غير مكتمل، ومسؤوله، وموعده</p></div></div>
      <div class="card-b tw">${open.length ? `<table class="t"><thead><tr><th>المتطلب</th><th>الشرط</th><th>الحالة</th><th>المسؤول</th><th>الموعد</th><th></th></tr></thead><tbody>${open.map((x) => `<tr><td><a class="code" href="#check-${x.r.id.toLowerCase()}" style="text-decoration:none">${x.r.id}</a></td><td>${esc(x.k.text)}</td><td>${chip(x.s)}</td><td>${x.p ? esc(x.p.owner || "—") : `<span class="muted">—</span>`}</td><td>${x.p ? `<span style="color:${x.p.due > sub && x.p.status !== "done" ? "var(--bad)" : "inherit"}" class="num">${fmtD(x.p.due)}</span>${x.p.status === "done" ? ` <span class="chip s-full">منجز</span>` : x.p.status === "progress" ? ` <span class="chip s-partial">قيد التنفيذ</span>` : ""}` : `<span class="chip s-unchecked">غير مخطط</span>`}</td><td><button class="btn ghost sm" data-plan="${x.k.id}">${x.p ? "تعديل" : "خطط"}</button></td></tr>`).join("")}</tbody></table>` : `<div class="empty">لا توجد شروط مفتوحة.</div>`}</div>
    </div>`;
    $$("[data-plan]", c).forEach((b) => (b.onclick = () => { const x = open.find((o) => o.k.id === b.dataset.plan); planDialog(x.r, x.k); }));
  }
  function chartSVG(f, t0, sub) {
    const W = 760, H = 250, L = 46, R = 16, T = 16, B = 34;
    const start = new Date(t0 + "T00:00:00Z"), end = new Date(Math.max(new Date(sub + "T00:00:00Z"), ...f.steps.map((s) => new Date(s.due + "T00:00:00Z")), start.getTime() + 7 * 864e5));
    const span = Math.max(1, end - start);
    const x = (d) => L + ((new Date(d + "T00:00:00Z") - start) / span) * (W - L - R);
    const xr = (d) => W - x(d) + 0; // RTL: الزمن من اليمين إلى اليسار
    const y = (v) => T + (1 - v) * (H - T - B);
    let v = f.nowC, pts = [[xr(t0), y(v)]];
    for (const s of f.steps) { if (s.due < t0) { v += s.gain / f.total; pts[0][1] = y(v); continue; } pts.push([xr(s.due), y(v)]); v += s.gain / f.total; pts.push([xr(s.due), y(v)]); }
    pts.push([xr(end.toISOString().slice(0, 10)), y(v)]);
    const path = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const area = path + ` L ${pts[pts.length - 1][0].toFixed(1)} ${y(0)} L ${pts[0][0].toFixed(1)} ${y(0)} Z`;
    const grid = [0, .25, .5, .75, 1].map((g) => `<line x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}" stroke="var(--line-2)"/><text x="${L - 8}" y="${y(g) + 4}" text-anchor="end">${pct(g)}</text>`).join("");
    const sx = xr(sub);
    return `<svg viewBox="0 0 ${W} ${H}" style="direction:ltr" role="img" aria-label="منحنى التغطية المتوقعة من ${pct(f.nowC)} إلى ${pct(f.expC)}">
      ${grid}
      <line x1="${L}" x2="${W - R}" y1="${y(f.tgt)}" y2="${y(f.tgt)}" stroke="var(--rev)" stroke-dasharray="5 5"/><text x="${W - R}" y="${y(f.tgt) - 6}" text-anchor="end" style="fill:var(--rev)">المستهدف ${pct(f.tgt)}</text>
      <path d="${area}" fill="var(--brand)" opacity=".1"/>
      <path d="${path}" fill="none" stroke="var(--brand)" stroke-width="2.5" stroke-linejoin="round"/>
      <line x1="${sx}" x2="${sx}" y1="${T}" y2="${H - B}" stroke="var(--bad)" stroke-width="1.5"/>
      <text x="${Math.max(L + 40, sx)}" y="${H - B + 18}" text-anchor="middle" style="fill:var(--bad);font-weight:600">التقديم ${fmtD(sub)}</text>
      <text x="${xr(t0)}" y="${H - B + 18}" text-anchor="end">اليوم</text>${f.steps.length ? "" : `<text x="${(L + W - R) / 2}" y="${y(0.5)}" text-anchor="middle" style="font-size:13px">أضف مواعيد للفجوات في الخطة ليرتفع المنحنى</text>`}
      <circle cx="${pts[0][0]}" cy="${pts[0][1]}" r="4.5" fill="var(--brand)"/>
    </svg>`;
  }

  /* =========================================================
     التقرير
     ========================================================= */
  function reportData() {
    const t = totals(), f = forecast();
    return { t, f, at: new Date() };
  }
  function reportHTML(standalone) {
    const { t, f, at } = reportData();
    const st = (s) => `<span class="chip ${STATUS[s].cls}">${STATUS[s].label}</span>`;
    const body = `
      <header style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid #0a2a4d;padding-bottom:14px;margin-bottom:16px">
        <div><img src="data:image/svg+xml;utf8,${encodeURIComponent(window.WATEERAH_LOGO || "")}" alt="وتيره" style="height:74px;display:block;margin-bottom:10px"><div style="color:#6a7f7b;font-size:13px">تقرير الجاهزية</div><h1>${esc(S.org.name)}</h1><div style="color:#6a7f7b;font-size:13px">دورة القياس ${fmtD(S.org.cycleStart)} – ${fmtD(S.org.cycleEnd)} · موعد التقديم ${fmtD(S.org.submission)}</div></div>
        <div style="text-align:left;font-size:12px;color:#6a7f7b">أُعد في<br>${fmtDT(at)}</div>
      </header>
      <section class="kpis">
        <div><span>التغطية الحالية</span><b>${pct(t.cov)}</b></div>
        <div><span>الشروط المدعومة</span><b>${n2(t.full)} / ${n2(t.total)}</b></div>
        <div><span>متطلبات مكتملة</span><b>${n2(t.reqDone)} / ${n2(t.reqs)}</b></div>
        <div><span>التغطية المتوقعة</span><b>${pct(f.expC)}</b><em>${f.state[0]}</em></div>
      </section>
      <h2>ملخص المؤشرات</h2>
      <table class="t"><thead><tr><th>المؤشر</th><th>المتطلبات</th><th>مدعوم</th><th>جزئي</th><th>ناقص</th><th>لم يُفحص</th><th>التغطية</th></tr></thead><tbody>
      ${S.library.map((i) => { const x = totals(i.requirements); return `<tr><td><b>${esc(i.name)}</b></td><td>${n2(i.requirements.length)}</td><td>${n2(x.full)}</td><td>${n2(x.partial)}</td><td>${n2(x.missing)}</td><td>${n2(x.unchecked)}</td><td><b>${pct(x.cov)}</b></td></tr>`; }).join("")}
      </tbody></table>
      <h2>تفاصيل المتطلبات والأدلة</h2>
      ${allReqs().map((r) => { const cn = reqCounts(r); const [l, k] = REQ_STATUS(cn); const atts = S.atts[r.id] || []; return `<div class="req-block">
        <div class="req-head"><span class="code">${r.id}</span> <b>${esc(r.name)}</b> <span class="chip ${k}">${l}</span> <span style="color:#6a7f7b;font-size:12px">· ${esc(r.ind.name)}</span></div>
        <div style="font-size:12px;color:#6a7f7b;margin:4px 0 8px">المرفقات: ${atts.length ? atts.map((a) => esc(a.name)).join("، ") : "لا توجد"}</div>
        <table class="t"><tbody>${r.conditions.map((c) => { const s = condStatus(c), res = condResult(r.id, c.id), o = S.overrides[c.id], p = S.plans[c.id]; const ev = res && res.evidence[0]; return `<tr><td style="width:38%"><b>${esc(c.text)}</b>${o ? `<div class="rev">مراجعة المختص: ${o.status === "full" ? "معتمد" : "مرفوض"}${o.note ? " — " + esc(o.note) : ""}</div>` : ""}</td><td style="width:14%">${st(s)}</td><td>${ev ? `<div class="q">«${esc(ev.parts.map((x) => x.text).join(" ").slice(0, 260))}»<small> — ${esc(ev.att)}</small></div>` : res ? `<span style="color:#6a7f7b">${esc(res.reason)}</span>` : `<span style="color:#6a7f7b">لم يُفحص</span>`}${s !== "full" && c.hint ? `<div class="h">المطلوب: ${esc(c.hint)}${p ? ` · المسؤول: ${esc(p.owner || "—")} · الموعد: ${fmtD(p.due)}` : ""}</div>` : ""}</td></tr>`; }).join("")}</tbody></table>
      </div>`; }).join("")}
      <p class="disc">هذا التقرير تقييم داخلي مبدئي يعتمد على قواعد نصية قابلة للتعديل ومراجعة المختص، ولا يمثل نتيجة رسمية لأي جهة قياس.</p>`;
    const css = `body{font-family:"Plex Ar","IBM Plex Sans Arabic",Tahoma,"Segoe UI",sans-serif;color:#0f2421;margin:0;background:#fff;line-height:1.7;font-size:13.5px}
      .page{max-width:900px;margin:0 auto;padding:36px 32px}
      h1{font-size:26px;margin:2px 0}h2{font-size:17px;margin:26px 0 10px;color:#087f7b}
      .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.kpis div{border:1px solid #dbe4e1;border-radius:12px;padding:10px 14px}.kpis span{display:block;font-size:12px;color:#6a7f7b}.kpis b{font-size:22px}.kpis em{display:block;font-style:normal;font-size:12px;color:#9a5c05}
      table.t{width:100%;border-collapse:collapse}table.t th{background:#eef3f1;text-align:start;font-size:12px;padding:7px 9px}table.t td{border-bottom:1px solid #e8eeec;padding:8px 9px;vertical-align:top}
      .req-block{border:1px solid #dbe4e1;border-radius:12px;padding:12px 14px;margin-bottom:12px;break-inside:avoid}
      .code{font-weight:700;background:#eef3f1;border-radius:6px;padding:1px 7px;font-size:12px}
      .chip{display:inline-block;border-radius:20px;padding:0 9px;font-size:11.5px;font-weight:700;white-space:nowrap}
      .s-full{background:#e1f3e8;color:#1b7a4c}.s-partial{background:#fcefd6;color:#9a5c05}.s-missing{background:#f9e2df;color:#b23a2f}.s-unchecked{background:#edf1f0;color:#73847f}
      .q{color:#3c534f}.q small{color:#6a7f7b}.h{font-size:12px;color:#9a5c05;margin-top:4px}.rev{font-size:12px;color:#5a43a6}
      .disc{font-size:11.5px;color:#6a7f7b;border-top:1px solid #dbe4e1;padding-top:10px;margin-top:24px}
      @media print{.page{padding:0}@page{margin:14mm}}`;
    if (!standalone) return { body, css };
    return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>تقرير الجاهزية — ${esc(S.org.name)}</title><style>${css}</style></head><body><div class="page">${body}</div></body></html>`;
  }
  function reportText() {
    const { t, f } = reportData();
    let s = `تقرير الجاهزية — ${S.org.name}\nموعد التقديم: ${S.org.submission}\nالتغطية الحالية: ${Math.round(t.cov * 100)}٪ · المتوقعة: ${Math.round(f.expC * 100)}٪ (${f.state[0]})\nالشروط المدعومة: ${t.full} من ${t.total}\n\n`;
    for (const r of allReqs()) { const cn = reqCounts(r); s += `${r.id} ${r.name} — ${REQ_STATUS(cn)[0]}\n`; for (const c of r.conditions) { const st = condStatus(c); s += `  • ${c.text}: ${STATUS[st].label}${st !== "full" && c.hint ? " ← " + c.hint : ""}\n`; } }
    return s;
  }
  function gapsCSV() {
    const rows = [["المؤشر", "المتطلب", "الرمز", "الشرط", "الحالة", "المطلوب", "المسؤول", "الموعد"]];
    for (const r of allReqs()) for (const c of r.conditions) { const s = condStatus(c); const p = S.plans[c.id] || {}; rows.push([r.ind.name, r.name, r.id, c.text, STATUS[s].label, s === "full" ? "" : c.hint || "", p.owner || "", p.due || ""]); }
    return "﻿" + rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  }
  function vReport(c) {
    const { body, css } = reportHTML(false);
    const canPrint = !window.claude;
    c.innerHTML = `
    <div class="row no-print" style="margin-bottom:18px;flex-wrap:wrap;gap:10px">
      <div><h1 style="font-family:var(--fd);margin:0;font-size:28px">تقرير الجاهزية</h1><p class="muted" style="margin:2px 0 0">ملخص قابل للمشاركة مع الإدارة: التغطية، والأدلة، والفجوات، ومسؤولو الاستكمال.</p></div>
      <span class="spacer"></span>
      <button class="btn primary" id="dlHtml">${icon("download")} تنزيل التقرير</button>
      <button class="btn" id="dlCsv">${icon("download")} الفجوات (CSV)</button>
      <button class="btn" id="cpTxt">${icon("copy")} نسخ الملخص</button>
      ${canPrint ? `<button class="btn" id="prt">${icon("print")} طباعة / PDF</button>` : ""}
    </div>
    <style>.report-prev{background:#fff;color:#0f2421} ${css.replace(/@media print\{[\s\S]*$/, "").replace(/body\{[^}]*\}/, "").replace(/(^|\})\s*([^{}]+)\{/g, (m, a, sel) => a + sel.split(",").map((x) => ".report-prev " + x.trim()).join(",") + "{")}</style>
    <div class="report-prev">${body}</div>`;
    const stamp = today();
    $("#dlHtml").onclick = () => download(`تقرير-الجاهزية-${stamp}.html`, reportHTML(true), "text/html;charset=utf-8");
    $("#dlCsv").onclick = () => download(`فجوات-وتيره-${stamp}.csv`, gapsCSV(), "text/csv;charset=utf-8");
    $("#cpTxt").onclick = () => copyText(reportText());
    if ($("#prt")) $("#prt").onclick = () => { const w = window.open("", "_blank"); if (!w) { toast("اسمح بالنوافذ المنبثقة للطباعة"); return; } w.document.write(reportHTML(true)); w.document.close(); setTimeout(() => w.print(), 400); };
  }

  /* =========================================================
     الإعدادات / مساحة الجهة
     ========================================================= */
  function vSettings(c) {
    const o = S.org;
    const nAtt = Object.values(S.atts).reduce((a, b) => a + b.length, 0);
    c.innerHTML = `
    <div style="margin-bottom:18px"><h1 style="font-family:var(--fd);margin:0;font-size:28px">مساحة الجهة</h1><p class="muted" style="margin:2px 0 0">بيانات الجهة ودورة القياس. كل البيانات محفوظة في هذا المتصفح فقط.</p></div>
    <div class="grid g2">
      <div class="card"><div class="card-h"><div class="ic">${icon("building")}</div><div><h2>بيانات الجهة والدورة</h2><p>تؤثر التواريخ على فحص شروط «التاريخ ضمن الدورة»</p></div></div>
        <form class="card-b" id="orgForm" style="display:flex;flex-direction:column;gap:14px">
          <div class="field"><label for="oName">اسم الجهة</label><input class="input" id="oName" value="${esc(o.name)}" required></div>
          <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">
            <div class="field"><label for="oCs">بداية دورة القياس</label><input class="input" type="date" id="oCs" value="${o.cycleStart}" required></div>
            <div class="field"><label for="oCe">نهاية دورة القياس</label><input class="input" type="date" id="oCe" value="${o.cycleEnd}" required></div>
            <div class="field"><label for="oSub">موعد التقديم</label><input class="input" type="date" id="oSub" value="${o.submission}" required></div>
            <div class="field"><label for="oTgt">التغطية المستهدفة ٪</label><input class="input" type="number" min="10" max="100" id="oTgt" value="${o.target}" required></div>
          </div>
          <div><button class="btn primary" type="submit">حفظ</button></div>
        </form>
      </div>
      <div class="card"><div class="card-h"><div class="ic">${icon("db")}</div><div><h2>البيانات والنسخ الاحتياطي</h2><p>${n2(nAtt)} مرفقات · ${n2(Object.keys(S.results).length)} متطلبات مفحوصة</p></div></div>
        <div class="card-b" style="display:flex;flex-direction:column;gap:12px">
          <p class="muted" style="margin:0;font-size:13.5px">لا تُرسل الملفات إلى أي خادم. يُحفظ النص المستخرج فقط داخل متصفحك. لنقل العمل إلى جهاز آخر صدّر نسخة احتياطية ثم استوردها هناك.</p>
          <div class="row" style="flex-wrap:wrap"><button class="btn" id="exp">${icon("download")} تصدير نسخة احتياطية</button><button class="btn" id="imp">${icon("upload")} استيراد</button></div>
          <div class="hr"></div>
          <button class="btn danger" id="wipe" style="align-self:flex-start">${icon("trash")} مسح كل بيانات المساحة</button>
          ${storageOk ? "" : `<div class="stale">${icon("flag")} الحفظ المحلي غير متاح في هذا العرض؛ ستُفقد التغييرات عند إغلاق الصفحة ما لم تصدّر نسخة احتياطية.</div>`}
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:20px"><div class="card-h"><div class="ic">${icon("shield")}</div><div><h2>كيف يعمل الفحص؟</h2><p>منهجية شفافة يمكن تدقيقها</p></div></div>
      <div class="card-b" style="font-size:14px;color:var(--ink-2)">
        <ol style="margin:0;padding-inline-start:20px;display:flex;flex-direction:column;gap:6px">
          <li>يُستخرج النص من ملفات PDF وWord وExcel وTXT داخل المتصفح (في Excel يُقرأ كل صف مع عناوين أعمدته كجملة مستقلة)، ويُطبّع (إزالة التشكيل، توحيد الهمزات والتاء المربوطة والأرقام العربية).</li>
          <li>لكل شرط مجموعات عبارات؛ يُعد الشرط «مدعومًا مبدئيًا» عند ظهور عبارة من كل مجموعة في الجملة نفسها أو التي تليها.</li>
          <li>شروط التاريخ تتطلب تاريخًا ميلاديًا أو هجريًا يقع داخل دورة القياس قرب السياق.</li>
          <li>عبارات مثل «مسودة» أو «غير معتمدة» تخفض الحكم إلى «جزئي».</li>
          <li>للمختص الكلمة الأخيرة: يمكنه اعتماد الشرط أو رفض الدليل مع ملاحظة تظهر في التقرير.</li>
        </ol>
      </div>
    </div>`;
    $("#orgForm").onsubmit = (e) => {
      e.preventDefault();
      const cs = $("#oCs").value, ce = $("#oCe").value;
      if (cs > ce) { toast("بداية الدورة يجب أن تسبق نهايتها"); return; }
      Object.assign(S.org, { name: $("#oName").value.trim() || "الجهة", cycleStart: cs, cycleEnd: ce, submission: $("#oSub").value, target: Math.min(100, Math.max(10, +$("#oTgt").value || 90)) });
      log("حُدّثت بيانات الجهة والدورة"); save(); render(); toast("تم الحفظ");
    };
    $("#exp").onclick = () => download(`وتيره-نسخة-احتياطية-${today()}.json`, JSON.stringify(S), "application/json");
    $("#imp").onclick = () => { $("#importIn").value = ""; $("#importIn").click(); };
    $("#importIn").onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { const d = JSON.parse(await f.text()); if (!d || d.v !== 1 || !d.library) throw 0; S = Object.assign(defaults(), d); log("استُوردت نسخة احتياطية"); save(); render(); toast("تم الاستيراد"); }
      catch (err) { toast("الملف ليس نسخة احتياطية صالحة من وتيره"); }
    };
    $("#wipe").onclick = () => confirmBox("مسح البيانات", "ستُحذف المرفقات والنتائج والخطط والتعديلات من هذا المتصفح. لا يمكن التراجع.", "مسح", () => { S = defaults(); save(); render(); toast("تم المسح"); }, true);
  }

  /* ---------- تشغيل ---------- */
  function applyTheme() { const t = S.ui.theme; if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
  $("#themeBtn").onclick = () => {
    const dark = S.ui.theme ? S.ui.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    S.ui.theme = dark ? "light" : "dark"; applyTheme(); save();
  };
  S = load();
  applyTheme();
  window.addEventListener("hashchange", route);
  route();
  // للاختبار
  window.__wateerah = { get state() { return S; }, render, go };
})();
