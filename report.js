// BitmapComps PDF appraisal report. Requires jsPDF + jspdf-autotable and window.BC (from index.html).
(function () {
  var ORANGE = [247, 147, 26], INK = [20, 21, 26], MUTE = [110, 108, 104], LINE = [226, 223, 216], PAPER = [250, 248, 244], DARK = [13, 14, 17];

  function loadSeal() {
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement('canvas'); c.width = c.height = 400;
          c.getContext('2d').drawImage(img, 0, 0, 400, 400);
          res(c.toDataURL('image/jpeg', 0.92));
        } catch (e) { res(null); }
      };
      img.onerror = function () { res(null); };
      img.src = 'seal.svg';
    });
  }

  function f(x) { if (x >= 0.01) return x.toFixed(4); var t = x.toFixed(5).replace(/0+$/, ''); if (t.split('.')[1].length < 4) t = x.toFixed(4); return t; }
  function fr(r) { return !r ? '—' : (r.length > 1 ? f(r[0]) + '–' + f(r[1]) : f(r[0])); }
  function usd(x, rate) { return rate ? '$' + Math.round(x * rate).toLocaleString('en-US') : ''; }

  function compute(d) {
    var BC = window.BC, T = BC.TIERS;
    var items = d.bitmaps.map(function (b) {
      var t = b.t || {}, tk = BC.walletTier(b.h, t), g = tk === 'genesis';
      var sold = g ? null : (T[tk].sold || T[BC.baseTier(b.h)].sold);
      return {
        h: b.h, t: t, tk: tk, year: BC.yearOf(b.h), traits: BC.traitLabels(b.h, t),
        bid: g ? 0 : BC.val(b.h, tk, 'bid'), lo: g ? 0 : BC.val(b.h, tk, 'sold'), hi: g ? 0 : BC.val(b.h, tk, 'sold', 'hi'),
        ask: g ? 0 : BC.val(b.h, tk, 'ask'), soldTxt: g ? 'no comps' : fr(sold)
      };
    });
    var s = { bid: 0, lo: 0, hi: 0, ask: 0, tiers: {}, counts: { patoshi: 0, pizza: 0, punks: 0, sub1k: 0 } };
    items.forEach(function (i) {
      s.bid += i.bid; s.lo += i.lo; s.hi += i.hi; s.ask += i.ask;
      var g = s.tiers[i.tk] = s.tiers[i.tk] || { n: 0, lo: 0, hi: 0, bid: 0 };
      g.n++; g.lo += i.lo; g.hi += i.hi; g.bid += i.bid;
      if (i.t.patoshi === 'true') s.counts.patoshi++;
      if (i.t.pizza === 'true') s.counts.pizza++;
      if (i.t.punks) s.counts.punks++;
      if (i.h < 1000) s.counts.sub1k++;
    });
    return { items: items, s: s };
  }

  function footer(doc, id) {
    var n = doc.getNumberOfPages(), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    for (var p = 1; p <= n; p++) {
      doc.setPage(p);
      doc.setDrawColor.apply(doc, LINE); doc.setLineWidth(0.6); doc.line(48, H - 40, W - 48, H - 40);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor.apply(doc, MUTE);
      doc.text('BitmapComps · bitmapcomps.com · Report ' + id + ' · Not financial advice', 48, H - 26);
      doc.text('Page ' + p + ' of ' + n, W - 48, H - 26, { align: 'right' });
    }
  }

  async function build(d, opts) {
    opts = opts || {};
    var BC = window.BC, T = BC.TIERS, rate = BC.usd();
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
    var W = doc.internal.pageSize.getWidth(), M = 48;
    var C = compute(d), s = C.s;
    var now = new Date(), id = 'BC-' + now.toISOString().slice(0, 10).replace(/-/g, '') + '-' + d.address.slice(-6).toUpperCase();
    var addrShown = opts.maskAddress ? d.address.slice(0, 8) + '…' + d.address.slice(-6) : d.address;
    var seal = await loadSeal();

    // ---- Header band
    doc.setFillColor.apply(doc, DARK); doc.rect(0, 0, W, 150, 'F');
    if (seal) doc.addImage(seal, 'JPEG', W - M - 104, 22, 104, 104);
    doc.setTextColor.apply(doc, ORANGE); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text('BITMAPCOMPS  ·  PRICED BY COMPS, NOT FLOORS', M, 50, { charSpace: 1.2 });
    doc.setTextColor(242, 239, 232); doc.setFont('times', 'normal'); doc.setFontSize(30);
    doc.text('Bitmap Appraisal Report', M, 88);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(200, 196, 188);
    doc.text('Wallet  ' + addrShown, M, 112);
    doc.text('Prepared ' + now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) +
      '   ·   Prices: Satflow, ' + BC.AS_OF + (rate ? '   ·   BTC = $' + Math.round(rate).toLocaleString('en-US') : ''), M, 128);

    // ---- Headline numbers
    var y = 178;
    doc.setTextColor.apply(doc, INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text(d.bitmaps.length + ' valid bitmaps', M, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor.apply(doc, MUTE);
    var bits = [];
    if (s.counts.sub1k) bits.push(s.counts.sub1k + ' sub-1K');
    if (s.counts.patoshi) bits.push(s.counts.patoshi + ' Patoshi');
    if (s.counts.pizza) bits.push(s.counts.pizza + ' pizza');
    if (s.counts.punks) bits.push(s.counts.punks + ' punks');
    doc.text((bits.length ? bits.join(' · ') + '   ·   ' : '') + d.totalInscriptions + ' inscriptions at this address in total', M, y + 16);

    y += 34;
    var bw = (W - 2 * M - 24) / 3, boxes = [
      ['SELL NOW', 'Sum of top bids', f(s.bid) + ' BTC', usd(s.bid, rate), false],
      ['RECENT SALES', 'What comparable blocks sold for', (Math.abs(s.hi - s.lo) < 1e-9 ? f(s.lo) : f(s.lo) + '–' + f(s.hi)) + ' BTC',
        rate ? (Math.abs(s.hi - s.lo) < 1e-9 ? usd(s.lo, rate) : usd(s.lo, rate) + '–' + usd(s.hi, rate)) : '', true],
      ['CHEAPEST ASKS', 'Sum of cheapest listings', f(s.ask) + ' BTC', usd(s.ask, rate), false]
    ];
    boxes.forEach(function (b, i) {
      var x = M + i * (bw + 12);
      doc.setFillColor.apply(doc, b[4] ? [255, 244, 228] : PAPER); doc.setDrawColor.apply(doc, b[4] ? ORANGE : LINE);
      doc.setLineWidth(b[4] ? 1.2 : 0.8); doc.roundedRect(x, y, bw, 86, 6, 6, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, b[4] ? [200, 112, 15] : MUTE); doc.text(b[0], x + 12, y + 18, { charSpace: 0.8 });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor.apply(doc, MUTE); doc.text(b[1], x + 12, y + 30);
      doc.setFont('courier', 'bold'); doc.setFontSize(b[2].length > 14 ? 11.5 : 15); doc.setTextColor.apply(doc, INK); doc.text(b[2], x + 12, y + 56);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor.apply(doc, MUTE); doc.text(b[3], x + 12, y + 74);
    });
    y += 110;

    // ---- Standouts
    var stand = C.items.filter(function (i) { return i.traits.length || i.h < 10000; })
      .sort(function (a, b) { return BC.ORDER.indexOf(a.tk) - BC.ORDER.indexOf(b.tk) || a.h - b.h; });
    function h2(txt, yy) { doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor.apply(doc, ORANGE); doc.text(txt, M, yy, { charSpace: 1 }); }
    var tableStyle = {
      theme: 'plain', margin: { left: M, right: M, bottom: 56 },
      styles: { font: 'helvetica', fontSize: 9, textColor: INK, cellPadding: { top: 5, bottom: 5, left: 6, right: 6 }, lineColor: LINE, lineWidth: { bottom: 0.5 } },
      headStyles: { fontStyle: 'bold', fontSize: 7.5, textColor: MUTE, fillColor: [243, 240, 234] }
    };
    if (stand.length) {
      h2('STANDOUTS', y);
      doc.autoTable(Object.assign({}, tableStyle, {
        startY: y + 8,
        head: [['Bitmap', 'Year', 'Traits', 'Priced as', 'Recent sales (BTC)']],
        body: stand.slice(0, 10).map(function (i) { return [i.h + '.bitmap', i.year, i.traits.join(', ') || '—', T[i.tk].name, i.soldTxt]; }),
        columnStyles: { 0: { fontStyle: 'bold' }, 4: { halign: 'right', font: 'courier' } }
      }));
      y = doc.lastAutoTable.finalY + 22;
      if (stand.length > 10) { doc.setFontSize(8); doc.setTextColor.apply(doc, MUTE); doc.text('+' + (stand.length - 10) + ' more in the full inventory.', M, y - 8); y += 6; }
    }

    // ---- By tier (page 2)
    doc.addPage(); y = 64;
    h2('VALUE BY TIER', y);
    var tierRows = BC.ORDER.filter(function (k) { return s.tiers[k]; }).map(function (k) {
      var g = s.tiers[k];
      return [T[k].name, g.n, f(g.bid), Math.abs(g.hi - g.lo) < 1e-9 ? f(g.lo) : f(g.lo) + '–' + f(g.hi)];
    });
    tierRows.push(['Total', d.bitmaps.length, f(s.bid), Math.abs(s.hi - s.lo) < 1e-9 ? f(s.lo) : f(s.lo) + '–' + f(s.hi)]);
    doc.autoTable(Object.assign({}, tableStyle, {
      startY: y + 8,
      styles: Object.assign({}, tableStyle.styles, { cellPadding: { top: 4, bottom: 4, left: 6, right: 6 } }),
      head: [['Tier', 'Count', 'Top bids (BTC)', 'Recent sales (BTC)']],
      body: tierRows,
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right', font: 'courier' }, 3: { halign: 'right', font: 'courier' } },
      didParseCell: function (h) { if (h.section === 'body' && h.row.index === tierRows.length - 1) { h.cell.styles.fontStyle = 'bold'; h.cell.styles.fillColor = [255, 244, 228]; } }
    }));

    // ---- Method + price sheet
    y = doc.lastAutoTable.finalY + 32;
    doc.setFont('times', 'normal'); doc.setFontSize(20); doc.setTextColor.apply(doc, INK); doc.text('How this appraisal was made', M, y);
    var para = [
      'Ownership|We read every inscription held by this address from the Ordinals Wallet index. Only valid bitmaps count: the first "N.bitmap" inscribed for each block. Later copies of the same block number are not bitmaps and are excluded.',
      'Traits|Each bitmap is classified by year and block-number rarity (sub-1K, 4- and 5-digit 2009) and by special traits: Patoshi blocks mined by Satoshi, pizza blocks, and punk-shaped blocks.',
      'Pricing|Each bitmap is assigned to one tier, in this order: sub-1K, pizza, 2009 4-digit, 2009 5-digit, punks, then plain by year. It is priced at what that tier actually did on Satflow during the week shown: the top standing bid (what you could sell for now), recent sales, and the cheapest listing.',
      'Limits|These are tier prices, not offers on your exact blocks. Where a tier has no reliable bid or ask, we use the plain tier for the block\'s year. Patoshi blocks outside sub-1K are flagged but not given a premium, because there are too few sales to price one. Prices move; check a live marketplace before you trade.'
    ];
    y += 26;
    para.forEach(function (p) {
      var parts = p.split('|');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor.apply(doc, INK); doc.text(parts[0], M, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(50, 50, 52);
      var L = doc.splitTextToSize(parts[1], W - 2 * M); doc.text(L, M, y + 13); y += L.length * 12.5 + 21;
    });

    y += 2; h2('PRICE SHEET USED (SATFLOW, ' + BC.AS_OF.toUpperCase() + ')', y);
    doc.autoTable(Object.assign({}, tableStyle, {
      startY: y + 8,
      head: [['Tier', 'Top bid', 'Recent sales', 'Cheapest ask']],
      styles: Object.assign({}, tableStyle.styles, { fontSize: 8.5, cellPadding: { top: 3.5, bottom: 3.5, left: 6, right: 6 } }),
      body: ['sub1k', 'pizza', 'y2009_4', 'y2009_5', 'punks', 'y2010', 'y2011', 'y2013', 'y2024'].map(function (k) {
        return [T[k].name, fr(T[k].bid), fr(T[k].sold), fr(T[k].ask)];
      }),
      columnStyles: { 1: { halign: 'right', font: 'courier' }, 2: { halign: 'right', font: 'courier' }, 3: { halign: 'right', font: 'courier' } }
    }));
    y = doc.lastAutoTable.finalY + 18;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, MUTE);
    var disc = doc.splitTextToSize('Sources: Satflow (sales, bids, listings); Ordinals Wallet index (ownership, traits); mempool.space (BTC/USD). This report is an informational estimate, not financial, tax or legal advice, and not an offer to buy or sell. BitmapComps does not hold or move any assets and never asks you to connect a wallet or sign anything.', W - 2 * M);
    doc.text(disc, M, y);

    // ---- Page 3+: inventory
    doc.addPage();
    doc.setFont('times', 'normal'); doc.setFontSize(20); doc.setTextColor.apply(doc, INK); doc.text('Full inventory', M, 64);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor.apply(doc, MUTE);
    doc.text('Every valid bitmap at this address, lowest block first. Prices in BTC.', M, 82);
    doc.autoTable(Object.assign({}, tableStyle, {
      startY: 94,
      styles: Object.assign({}, tableStyle.styles, { fontSize: 7.8, cellPadding: { top: 2.4, bottom: 2.4, left: 5, right: 5 } }),
      head: [['#', 'Bitmap', 'Year', 'Priced as', 'Traits', 'Top bid', 'Recent sales', 'Cheapest ask']],
      body: C.items.map(function (i, n) { return [n + 1, i.h + '.bitmap', i.year, T[i.tk].name, i.traits.join(', '), i.tk === 'genesis' ? '—' : f(i.bid), i.soldTxt, i.tk === 'genesis' ? '—' : f(i.ask)]; }),
      columnStyles: { 0: { textColor: MUTE, halign: 'right', cellWidth: 26 }, 1: { fontStyle: 'bold' }, 5: { halign: 'right', font: 'courier' }, 6: { halign: 'right', font: 'courier' }, 7: { halign: 'right', font: 'courier' } },
      didParseCell: function (h) { if (h.section === 'body' && h.row.index % 2 === 1) h.cell.styles.fillColor = [249, 247, 243]; }
    }));

    footer(doc, id);
    doc.setProperties({ title: 'Bitmap Appraisal Report ' + id, subject: 'BitmapComps appraisal', author: 'BitmapComps', creator: 'bitmapcomps.com' });
    return { doc: doc, id: id };
  }

  window.BCReport = { build: build };
})();
