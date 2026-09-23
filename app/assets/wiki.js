// Two small helpers: the "Pages" button on phones and the page filter.
(function () {
  var nav = document.getElementById('nav');
  var menu = document.querySelector('.menu');
  if (menu && nav) {
    menu.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      menu.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  var find = document.getElementById('find');
  if (!find || !nav) return;
  var leaves = nav.querySelectorAll('li.leaf');
  var folders = nav.querySelectorAll('li.folder');
  var none = nav.querySelector('.none');
  var wasOpen = [].map.call(folders, function (f) { return f.firstElementChild.open; });
  var plain = function (s) { return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase(); };

  find.addEventListener('input', function () {
    var q = plain(find.value.trim());
    var hits = 0;
    leaves.forEach(function (li) {
      var show = !q || plain(li.getAttribute('data-find')).indexOf(q) !== -1;
      li.hidden = !show;
      if (show) hits++;
    });
    folders.forEach(function (f, i) {
      f.hidden = q && !f.querySelector('li.leaf:not([hidden])');
      f.firstElementChild.open = q ? true : wasOpen[i];
    });
    none.hidden = hits > 0;
  });

  find.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var first = nav.querySelector('li.leaf:not([hidden]) a');
    if (first && find.value.trim()) location.href = first.href;
  });
})();
