// LAYRS logo: exactly as tall as the capital letters of the city's name, standing on the same baseline.
// Runs on its own, before the map loads; the logo stays hidden until the fonts are in and it is measured.
(function () {
  function place(h1, logo, probe) {
    var cs = getComputedStyle(h1), ctx = document.createElement('canvas').getContext('2d');
    ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    var name = h1.textContent.replace('LAYRS', '').trim();
    var cap = ctx.measureText(name.charAt(0) || 'H').actualBoundingBoxAscent;
    var base = probe.getBoundingClientRect().top - h1.getBoundingClientRect().top;
    logo.style.height = cap + 'px';
    logo.style.top = (base - cap) + 'px';
    logo.style.fontSize = (cap / 4.6) + 'px';
    h1.style.paddingLeft = (logo.getBoundingClientRect().width + cap * 0.22) + 'px';
  }
  // A long name (a theme's 'Molens in Zuid-Holland') is set smaller until it clears the year on the right, at its
  // widest, and the mode bar where that stands beside the name.
  function room(h1) {
    var year = document.querySelector('.tally-year'), modes = document.querySelector('.modes'), r = h1.getBoundingClientRect();
    var right = innerWidth;
    if (year) {
      var cs = getComputedStyle(year), ctx = document.createElement('canvas').getContext('2d');
      ctx.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      right = year.getBoundingClientRect().right - Math.max(ctx.measureText('Today').width, ctx.measureText('8888').width) - 12;
    }
    var m = modes && modes.getBoundingClientRect();
    if (m && m.top < r.bottom && m.bottom > r.top) right = Math.min(right, m.left - 12);
    return right - r.left;
  }
  function fit() {
    var h1 = document.querySelector('h1'), logo = h1 && h1.querySelector('.layrs'), probe = h1 && h1.querySelector('.baseline');
    if (!logo || !probe) return;
    h1.style.fontSize = '';
    place(h1, logo, probe);
    var all = document.createRange();
    all.selectNodeContents(h1);
    var w = all.getBoundingClientRect().right - h1.getBoundingClientRect().left, free = room(h1);
    if (w > free) {
      h1.style.fontSize = Math.max(16, parseFloat(getComputedStyle(h1).fontSize) * free / w) + 'px';
      place(h1, logo, probe);
    }
    logo.classList.add('fitted');
  }
  function ready() {
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(fit);
    // the map's script names the city or theme later on
    var h1 = document.querySelector('h1');
    if (h1) new MutationObserver(fit).observe(h1, { childList: true, characterData: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
  addEventListener('resize', fit);
})();
