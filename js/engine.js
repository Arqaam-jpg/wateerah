/* وتيره — محرك الاستخراج والتحليل (يعمل بالكامل داخل المتصفح) */
(function (root) {
  "use strict";

  /* ---------- تطبيع النص العربي مع خريطة مواضع ---------- */
  const CHAR_MAP = { "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ة": "ه", "ؤ": "و", "ئ": "ي", "ـ": "" };
  const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/;
  const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩", FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

  function normChar(ch) {
    let out = ch.normalize("NFKC");
    let r = "";
    for (const c of out) {
      if (DIACRITICS.test(c)) continue;
      let d = AR_DIGITS.indexOf(c); if (d < 0) d = FA_DIGITS.indexOf(c);
      if (d >= 0) { r += String(d); continue; }
      if (c in CHAR_MAP) { r += CHAR_MAP[c]; continue; }
      if (c === "٪") { r += "%"; continue; }
      if (/\s/.test(c)) { r += " "; continue; }
      r += c.toLowerCase();
    }
    return r;
  }

  /** يعيد النص المطبّع وخريطة كل حرف إلى موضعه في الأصل */
  function normalizeWithMap(text) {
    let n = "", map = [];
    for (let i = 0; i < text.length; i++) {
      let ch = text[i];
      // أزواج UTF-16
      if (/[\uD800-\uDBFF]/.test(ch) && i + 1 < text.length) { ch += text[i + 1]; }
      const o = normChar(ch);
      for (const c of o) {
        if (c === " " && n.endsWith(" ")) continue;
        n += c; map.push(i);
      }
      if (ch.length === 2) i++;
    }
    return { n, map };
  }
  const normalize = (t) => normalizeWithMap(String(t || "")).n.trim();

  /* ---------- تقسيم الجمل ---------- */
  function splitSentences(text) {
    const out = [];
    const re = /[^\n.!?؟؛]+[.!?؟؛]?/g;
    let m;
    while ((m = re.exec(text))) {
      const raw = m[0];
      const s = raw.trim();
      if (s.length < 3) continue;
      const start = m.index + raw.indexOf(s);
      // جمل طويلة جداً تُقطّع
      if (s.length > 420) {
        for (let k = 0; k < s.length; k += 380) out.push({ text: s.slice(k, k + 420), start: start + k });
      } else out.push({ text: s, start });
    }
    return out;
  }

  /* ---------- مطابقة المصطلحات ---------- */
  const reCache = new Map();
  function termRegex(term) {
    const t = normalize(term);
    if (reCache.has(t)) return reCache.get(t);
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
    // كلمات قصيرة تتطلب حدوداً؛ العبارات الطويلة تسمح بالسوابق (و، ب، لل...)
    let re;
    if (t.length <= 3) re = new RegExp("(?<![\\p{L}\\p{N}])" + esc + "(?![\\p{L}\\p{N}])", "gu");
    else re = new RegExp("(?<=^|[^\\p{L}\\p{N}]|(?:^|[^\\p{L}\\p{N}])(?:و|ف|ب|ل|ك|ال|وال|بال|فال|كال|لل))" + esc, "gu");
    reCache.set(t, re);
    return re;
  }
  function findTerm(nText, term) {
    const re = termRegex(term); re.lastIndex = 0;
    const hits = []; let m;
    while ((m = re.exec(nText))) { hits.push([m.index, m.index + m[0].length]); if (hits.length > 50) break; }
    return hits;
  }

  /* ---------- التواريخ ---------- */
  const MONTHS = {
    "يناير": 1, "كانون الثاني": 1, "فبراير": 2, "شباط": 2, "مارس": 3, "اذار": 3, "ابريل": 4, "نيسان": 4,
    "مايو": 5, "ايار": 5, "يونيو": 6, "حزيران": 6, "يوليو": 7, "تموز": 7, "اغسطس": 8, "اب": 8,
    "سبتمبر": 9, "ايلول": 9, "اكتوبر": 10, "تشرين الاول": 10, "نوفمبر": 11, "تشرين الثاني": 11, "ديسمبر": 12, "كانون الاول": 12,
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12
  };
  const H_MONTHS = { "محرم": 1, "صفر": 2, "ربيع الاول": 3, "ربيع الثاني": 4, "ربيع الاخر": 4, "جمادي الاولي": 5, "جمادي الاول": 5,
    "جمادي الاخره": 6, "جمادي الثانيه": 6, "جمادي الاخر": 6, "رجب": 7, "شعبان": 8, "رمضان": 9, "شوال": 10, "ذو القعده": 11, "ذي القعده": 11, "ذو الحجه": 12, "ذي الحجه": 12 };

  function hijriToGregorian(y, m, d) {
    // التقويم الهجري الجدولي (تقريبي ± يوم)
    const jd = Math.floor((11 * y + 3) / 30) + 354 * y + 30 * m - Math.floor((m - 1) / 2) + d + 1948440 - 385;
    let l = jd + 68569, n = Math.floor(4 * l / 146097); l = l - Math.floor((146097 * n + 3) / 4);
    const i = Math.floor(4000 * (l + 1) / 1461001); l = l - Math.floor(1461 * i / 4) + 31;
    const j = Math.floor(80 * l / 2447), day = l - Math.floor(2447 * j / 80); l = Math.floor(j / 11);
    const month = j + 2 - 12 * l, year = 100 * (n - 49) + i + l;
    return new Date(Date.UTC(year, month - 1, day));
  }
  function mk(y, m, d, hijriHint) {
    y = +y; m = +m; d = +d;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    if (y >= 1350 && y <= 1500) return { date: hijriToGregorian(y, m, d), hijri: true };
    if (y < 1990 || y > 2100) return null;
    if (hijriHint) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCMonth() !== m - 1) return null;
    return { date: dt, hijri: false };
  }
  /** يستخرج التواريخ من نص مطبّع مع مواضعها */
  function findDates(n) {
    const out = [];
    const push = (r, idx, len) => { if (r) out.push({ ...r, index: idx, end: idx + len }); };
    let m;
    const r1 = /(?<!\d)(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})(?!\d)/g;
    while ((m = r1.exec(n))) push(mk(m[1], m[2], m[3]), m.index, m[0].length);
    const r2 = /(?<!\d)(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{4})(?!\d)/g;
    while ((m = r2.exec(n))) push(mk(m[3], m[2], m[1]), m.index, m[0].length);
    const names = Object.keys(MONTHS).sort((a, b) => b.length - a.length).map((s) => s.replace(/ /g, "\\s+")).join("|");
    const r3 = new RegExp("(?<!\\d)(\\d{1,2})\\s+(?:من\\s+)?(?:شهر\\s+)?(" + names + ")\\s*(?:,|،)?\\s*(\\d{4})", "gu");
    while ((m = r3.exec(n))) push(mk(m[3], MONTHS[m[2].replace(/\s+/g, " ")], m[1]), m.index, m[0].length);
    const r3b = new RegExp("(?<![\\p{L}])(" + names + ")\\s*(\\d{4})", "gu");
    while ((m = r3b.exec(n))) { const mo = MONTHS[m[1].replace(/\s+/g, " ")]; if (!out.some((o) => o.index <= m.index && o.end >= m.index + m[0].length)) push(mk(m[2], mo, 15), m.index, m[0].length); }
    const hn = Object.keys(H_MONTHS).sort((a, b) => b.length - a.length).map((s) => s.replace(/ /g, "\\s+")).join("|");
    const r4 = new RegExp("(?<!\\d)(\\d{1,2})\\s+(" + hn + ")\\s+(1[34]\\d{2})", "gu");
    while ((m = r4.exec(n))) push(mk(m[3], H_MONTHS[m[2].replace(/\s+/g, " ")], m[1]), m.index, m[0].length);
    // إزالة المكرر
    out.sort((a, b) => a.index - b.index);
    return out.filter((d, i) => i === 0 || d.index >= out[i - 1].end);
  }

  /* ---------- استخراج النص من الملفات ---------- */
  function fixRtlItem(s) {
    // بعض ملفات PDF تخرج الكلمات العربية معكوسة الترتيب؛ نكتشف ذلك من «ال» التعريف
    const words = s.split(/\s+/).filter((w) => /[\u0600-\u06FF]{3,}/.test(w));
    if (words.length < 2) return s;
    let fwd = 0, rev = 0;
    for (const w of words) { if (/^(ال|وال|بال)/.test(w)) fwd++; if (/(لا|لاو|لاب)$/.test(w)) rev++; }
    if (rev > fwd && rev >= 2) return [...s].reverse().join("");
    return s;
  }

  async function extractPdf(buf) {
    const pdfjs = root.pdfjsLib;
    if (!pdfjs) throw new Error("قارئ PDF غير متاح");
    const doc = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise;
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent({ disableNormalization: true });
      let line = "", lastY = null, lines = [];
      for (const it of tc.items) {
        const y = it.transform ? Math.round(it.transform[5]) : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 3) { lines.push(line); line = ""; }
        line += (line && !line.endsWith(" ") ? " " : "") + fixRtlItem(it.str);
        if (it.hasEOL) { lines.push(line); line = ""; }
        lastY = y;
      }
      if (line) lines.push(line);
      pages.push(lines.join("\n"));
    }
    // تصحيح ترتيب «لا/لأ» المعكوس في ملفات PDF (أنماط لا ترد في العربية الصحيحة)
    const txt = pages.join("\n\n").replace(/ا([أإآ])ل/g, "ال$1").replace(/اال/g, "الا");
    return { text: txt, pages: doc.numPages };
  }
  async function extractDocx(buf) {
    if (!root.mammoth) throw new Error("قارئ Word غير متاح");
    const r = await root.mammoth.extractRawText({ arrayBuffer: buf });
    return { text: r.value, pages: null };
  }
  async function extractXlsx(buf) {
    const X = root.XLSX;
    if (!X) throw new Error("قارئ Excel غير متاح");
    const wb = X.read(new Uint8Array(buf), { type: "array", cellDates: false, cellNF: true });
    const pad = (n) => String(n).padStart(2, "0");
    const out = [];
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      const rows = [];
      if (ws["!ref"]) {
        const rg = X.utils.decode_range(ws["!ref"]);
        for (let R = rg.s.r; R <= Math.min(rg.e.r, rg.s.r + 5000); R++) {
          const row = [];
          for (let C = rg.s.c; C <= Math.min(rg.e.c, rg.s.c + 60); C++) {
            const c = ws[X.utils.encode_cell({ r: R, c: C })];
            if (!c || c.v == null || c.v === "") { row.push(""); continue; }
            // التواريخ تُقرأ من رمز التاريخ مباشرة لتجنب انزياح المنطقة الزمنية
            if (c.t === "n" && c.z && X.SSF && X.SSF.is_date(c.z)) { const d = X.SSF.parse_date_code(c.v); row.push(d.y + "-" + pad(d.m) + "-" + pad(d.d)); }
            else row.push(c.w != null && c.t === "n" ? c.w : c.v);
          }
          if (row.some((v) => v !== "")) rows.push(row);
        }
      }
      if (!rows.length) continue;
      // الصف الأول غالبًا عناوين أعمدة: نُلحقها بكل خلية لتبقى الصفوف مفهومة
      const head = rows[0].map((h) => String(h).trim());
      const useHead = rows.length > 1 && head.filter(Boolean).length >= 2 && head.every((h) => !/^\d+([.,]\d+)?$/.test(h));
      out.push("ورقة: " + name);
      if (useHead) out.push(head.filter(Boolean).join(" | "));
      rows.slice(useHead ? 1 : 0).forEach((r) => {
        const cells = r.map((v, i) => {
          if (v === "" || v == null) return "";
          const val = String(v).replace(/\s*\n\s*/g, " ").trim();
          return useHead && head[i] ? head[i] + ": " + val : val;
        }).filter(Boolean);
        if (cells.length) out.push(cells.join(" | "));
      });
      out.push("");
    }
    return { text: out.join("\n"), pages: null, sheets: wb.SheetNames.length };
  }
  async function extractFile(file) {
    const name = file.name || "ملف";
    const ext = (name.split(".").pop() || "").toLowerCase();
    const buf = await file.arrayBuffer();
    let res;
    if (ext === "pdf" || file.type === "application/pdf") res = await extractPdf(buf);
    else if (ext === "docx") res = await extractDocx(buf);
    else if (ext === "xlsx" || ext === "xlsm") res = await extractXlsx(buf);
    else if (ext === "xls") throw new Error("صيغة Excel القديمة (.xls) غير مدعومة؛ احفظ الملف بصيغة .xlsx");
    else if (["txt", "md", "csv"].includes(ext) || (file.type || "").startsWith("text/")) res = { text: new TextDecoder("utf-8").decode(buf), pages: null };
    else if (ext === "doc") throw new Error("صيغة Word القديمة (.doc) غير مدعومة؛ احفظ الملف بصيغة .docx");
    else throw new Error("صيغة غير مدعومة: ." + ext);
    const clean = res.text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    return { name, ext: ext.toUpperCase(), size: file.size, text: clean, pages: res.pages, sheets: res.sheets || null, words: clean ? clean.split(/\s+/).length : 0 };
  }

  /* ---------- تقييم الشروط ---------- */
  function inCycle(d, cycle) {
    const s = new Date(cycle.start + "T00:00:00Z"), e = new Date(cycle.end + "T23:59:59Z");
    return d >= s && d <= e;
  }
  function fmtDate(d) { return d.toISOString().slice(0, 10); }

  /** يحضّر مستنداً مرة واحدة: جمل مطبّعة مع خرائط */
  function prepareDoc(att) {
    if (att._prep) return att._prep;
    const sents = splitSentences(att.text).map((s) => {
      const nm = normalizeWithMap(s.text);
      return { ...s, n: nm.n, map: nm.map };
    });
    const prep = { sents };
    Object.defineProperty(att, "_prep", { value: prep, enumerable: false, configurable: true });
    return prep;
  }

  function groupHits(n, group) {
    const hits = [];
    for (const term of group) { const h = findTerm(n, term); if (h.length) hits.push(...h.map((x) => ({ r: x, term }))); }
    return hits;
  }

  /**
   * يقيّم شرطاً واحداً على مجموعة مرفقات.
   * الحالة: full (مدعوم مبدئياً) | partial (جزئي) | missing (ناقص)
   */
  function evaluateCondition(cond, atts, cycle) {
    const groups = (cond.groups || []).filter((g) => g && g.length);
    const negs = cond.negatives || [];
    if (!atts.length) return { status: "missing", score: 0, reason: "لا توجد مرفقات لهذا المتطلب.", evidence: [] };
    let best = null;
    const docGroups = new Set();
    const negFound = [];
    for (const att of atts) {
      const { sents } = prepareDoc(att);
      // «المرساة»: موضوع الشرط قد يرد في عنوان المستند أو اسم الملف لا في الجملة نفسها
      const anchorDoc = cond.anchor && groups[0] ? groupHits(normalize(att.name.replace(/\.[a-z0-9]+$/i, "")) + " " + sents.slice(0, 4).map((x) => x.n).join(" "), groups[0]).length > 0 : false;
      for (let i = 0; i < sents.length; i++) {
        // نافذة: الجملة مع جارتها التالية لالتقاط العبارات الممتدة
        const win = [sents[i], sents[i + 1]].filter(Boolean);
        const hitsPerGroup = groups.map((g) => {
          const h0 = groupHits(win[0].n, g).map((h) => ({ ...h, s: 0 }));
          const h1 = win[1] ? groupHits(win[1].n, g).map((h) => ({ ...h, s: 1 })) : [];
          return h0.length ? h0 : h1;
        });
        if (anchorDoc && !hitsPerGroup[0].length) hitsPerGroup[0] = [{ r: null, term: groups[0][0], anchor: true }];
        groups.forEach((g, gi) => { if (groupHits(sents[i].n, g).length) docGroups.add(gi); });
        const matched = hitsPerGroup.filter((h) => h.length).length;
        for (const nt of negs) if (findTerm(sents[i].n, nt).length) negFound.push({ att: att.name, term: nt, sentence: sents[i].text });
        let dates = [];
        if (cond.date) for (let k = 0; k < win.length; k++) dates.push(...findDates(win[k].n).map((d) => ({ ...d, s: k })));
        const datesIn = dates.filter((d) => inCycle(d.date, cycle));
        let score = groups.length ? matched / groups.length : 0;
        if (cond.date && matched) score = score * 0.75 + (datesIn.length ? 0.25 : 0);
        // تفضيل الأدلة في جملة واحدة
        const usesNext = hitsPerGroup.some((h) => h.length && h[0].s === 1);
        if (hitsPerGroup[0] && hitsPerGroup[0][0] && hitsPerGroup[0][0].anchor) score -= 0.01;
        if (usesNext) score -= 0.02;
        if (!best || score > best.score) best = { score, att, i, win, hitsPerGroup, dates, datesIn, matched };
      }
    }
    const allGroupsInDoc = groups.length && docGroups.size === groups.length;
    let status = "missing", reason = "";
    const b = best;
    const fullLocal = b && b.matched === groups.length;
    if (fullLocal) {
      status = "full";
      reason = "ظهرت في المرفق عبارات تدعم تحقق الشرط وفق قواعد الفحص.";
      if (cond.date) {
        if (b.datesIn.length) reason = "ظهر سياق الشرط مع تاريخ داخل دورة القياس (" + fmtDate(b.datesIn[0].date) + (b.datesIn[0].hijri ? "، محوّل من الهجري" : "") + ").";
        else if (b.dates.length) { status = "partial"; reason = "ظهر سياق الشرط لكن التاريخ (" + fmtDate(b.dates[0].date) + ") خارج دورة القياس."; }
        else { status = "partial"; reason = "ظهر سياق الشرط دون تاريخ واضح يثبت التنفيذ خلال الدورة."; }
      }
    } else if (allGroupsInDoc && docGroups.has(0)) {
      status = "partial"; reason = "عناصر الشرط موجودة لكنها متفرقة في المستند؛ يحتاج تأكيد المراجع.";
    } else if (b && b.matched > 0 && b.hitsPerGroup[0].length && b.matched / groups.length >= 0.5) {
      status = "partial"; reason = "ظهر جزء من عناصر الشرط فقط.";
    } else {
      reason = "لم تظهر في المرفقات عبارات تدعم هذا الشرط.";
    }
    // العبارات النافية (مسودة، غير معتمدة...) تحدّ من الحكم
    const relevantNeg = negFound.filter((x) => b && b.att && x.att === b.att.name);
    if (status === "full" && relevantNeg.length) {
      status = "partial";
      reason = "ظهر ما يدعم الشرط، لكن المرفق يتضمن «" + relevantNeg[0].term + "» مما قد يعني أنه غير نهائي.";
    }
    const evidence = [];
    if (b && b.matched > 0) {
      const parts = b.win.map((s, k) => {
        const ranges = [];
        b.hitsPerGroup.forEach((h) => h.filter((x) => x.s === k && x.r).forEach((x) => ranges.push(x.r)));
        if (cond.date) b.dates.filter((d) => d.s === k).forEach((d) => ranges.push([d.index, d.end]));
        const used = ranges.length > 0 || k === 0;
        return used ? { text: s.text, ranges: ranges.map(([a, z]) => [s.map[a], (s.map[z - 1] ?? s.map[s.map.length - 1]) + 1]).sort((x, y) => x[0] - y[0]).reduce((acc, r) => { const l = acc[acc.length - 1]; if (l && r[0] <= l[1]) l[1] = Math.max(l[1], r[1]); else acc.push([r[0], r[1]]); return acc; }, []) } : null;
      }).filter(Boolean);
      evidence.push({ att: b.att.name, parts, anchor: !!(b.hitsPerGroup[0][0] && b.hitsPerGroup[0][0].anchor) });
    }
    const missingTerms = b ? groups.filter((g, gi) => !b.hitsPerGroup[gi].length).map((g) => g[0]) : groups.map((g) => g[0]);
    return {
      status, score: Math.max(0, Math.min(1, b ? b.score : 0)), reason, evidence,
      missingTerms: status === "full" ? [] : missingTerms,
      negatives: relevantNeg.slice(0, 2).map((x) => x.term)
    };
  }

  function evaluateRequirement(req, atts, cycle) {
    const results = {};
    for (const c of req.conditions) results[c.id] = evaluateCondition(c, atts, cycle);
    return results;
  }

  root.WateerahEngine = { normalize, normalizeWithMap, findDates, hijriToGregorian, extractFile, evaluateCondition, evaluateRequirement, splitSentences, fmtDate, prepareDoc };
  if (typeof module !== "undefined") module.exports = root.WateerahEngine;
})(typeof window !== "undefined" ? window : globalThis);
