/* Maquete do app v2 — tema por query (?tema=dark), ícones, abas do rodapé e calendário.
   Sem backend: os dados são fixos, só para a aparência. */
(function () {
  var q = new URLSearchParams(location.search);
  var d = document.documentElement;
  d.dataset.theme = q.get('tema') === 'dark' ? 'dark' : 'light';
  d.dataset.motion = 'off';

  var P = {
    inicio: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
    agenda: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    folga: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4M9.5 13.5l5 4M14.5 13.5l-5 4"/>',
    perfil: '<circle cx="12" cy="8" r="4"/><path d="M4 20.5c1.4-3.6 4.4-5.5 8-5.5s6.6 1.9 8 5.5"/>',
    escalar: '<rect x="5" y="4" width="14" height="17" rx="3"/><path d="M9 4.5h6M9 10h6M9 14h6M9 18h3"/>',
    equipe: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20c1-3.4 3.4-5.2 6.5-5.2s5.5 1.8 6.5 5.2"/><circle cx="17" cy="9" r="2.8"/><path d="M16.5 14.6c2.4.1 4.1 1.6 5 4.4"/>',
    painel: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    esq: '<path d="m14.5 6-6 6 6 6"/>',
    dir: '<path d="m9.5 6 6 6-6 6"/>',
    mais: '<path d="M12 5v14M5 12h14"/>',
    magia: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="2.5"/>',
    troca: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
    sino: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 21h4"/>',
    musica: '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    projecao: '<rect x="3" y="4" width="18" height="12" rx="2.5"/><path d="M8.5 20h7M12 16v4"/>',
    transmissao: '<rect x="3" y="6.5" width="13" height="11" rx="2.5"/><path d="m16 10.5 5-3v9l-5-3"/>',
    luz: '<path d="M9 17.5h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.8.6 1.1 1.4 1.1 2.2v1.5h5V16c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
    som: '<path d="M4 9.5h4l5-4.5v14l-5-4.5H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
    louvor: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
    recepcao: '<path d="M7 11.5V6.5a1.5 1.5 0 0 1 3 0v4M10 10V5a1.5 1.5 0 0 1 3 0v5M13 10V6a1.5 1.5 0 0 1 3 0v6"/><path d="M16 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6.5 6.5 0 0 1-5.4-2.9L3.6 14.6a1.6 1.6 0 0 1 2.5-2L7 13.5"/>',
    seta: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    voltar: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    convite: '<path d="M4 12.5 20 4l-4 16-4.5-6.5z"/><path d="m11.5 13.5 8.5-9.5"/>',
    relogio: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    alerta: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.3"/>',
    filtro: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    igreja: '<path d="M12 2.5v4M10 4.5h4M5 21V11l7-4.5 7 4.5v10"/><path d="M10 21v-4.5a2 2 0 0 1 4 0V21M3 21h18"/>'
  };
  window.ic = function (n, cls) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"' +
      (cls ? ' class="' + cls + '"' : '') + ' aria-hidden="true">' + (P[n] || '') + '</svg>';
  };

  function render() {
    document.querySelectorAll('[data-ic]').forEach(function (el) { el.insertAdjacentHTML('afterbegin', ic(el.dataset.ic)); });

    var b = document.body;
    var abas = b.dataset.modo === 'lider'
      ? [['cultos', 'Cultos', 'agenda', 'cultos.html'], ['escalar', 'Escalar', 'escalar', 'sugerir.html', 3], ['equipe', 'Equipe', 'equipe', 'equipe.html', 2], ['painel', 'Painel', 'painel', '#']]
      : [['inicio', 'Início', 'inicio', 'inicio.html', 2], ['agenda', 'Agenda', 'agenda', 'agenda.html'], ['folgas', 'Folgas', 'folga', 'agenda.html'], ['perfil', 'Perfil', 'perfil', 'servir.html']];
    if (b.dataset.aba) {
      var nav = document.createElement('nav');
      nav.className = 'tabbar';
      nav.setAttribute('aria-label', 'Abas');
      nav.innerHTML = abas.map(function (a) {
        return '<a href="' + a[3] + '"' + (a[0] === b.dataset.aba ? ' class="is-active" aria-current="page"' : '') + '>' +
          '<span class="pill">' + ic(a[2]) + '</span>' + a[1] + (a[4] ? '<span class="badge">' + a[4] + '</span>' : '') + '</a>';
      }).join('');
      b.appendChild(nav);
    }
    // Links internos levam o tema junto.
    document.querySelectorAll('a[href$=".html"]').forEach(function (a) { a.href = a.getAttribute('href') + location.search; });
  }

  /* Calendário de novembro/2026 (1º = domingo). dias: { n: {cls, html} } */
  window.cal = function (el, dias, opt) {
    opt = opt || {};
    var h = '<div class="cal__nav"><button aria-label="Mês anterior">' + ic('esq') + '</button><b>Novembro 2026</b><button aria-label="Próximo mês">' + ic('dir') + '</button></div>';
    h += '<div class="cal__dow">' + ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div><div class="cal__grid">';
    for (var i = 1; i <= 35; i++) {
      var n = i <= 30 ? i : i - 30, out = i > 30, x = (!out && dias[n]) || {};
      var cls = 'day' + (out ? ' is-out' : '') + (!out && n === 6 ? ' is-today' : '') + (x.cls ? ' ' + x.cls : '');
      h += '<div class="' + cls + '"><span class="n">' + n + '</span>' + (x.html || '') + '</div>';
    }
    h += '</div>';
    if (opt.leg) h += '<div class="cal__leg">' + opt.leg + '</div>';
    el.innerHTML = h;
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
})();
