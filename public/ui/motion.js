// layout-fluido — movimento nativo (Web Animations + View Transitions), sem dependência.
// Script clássico: expõe window.motion. Tudo respeita prefers-reduced-motion (duração 0).
(() => {
  const EASE = 'cubic-bezier(.2,.8,.2,1)';
  const EASE_IN = 'cubic-bezier(.4,0,1,1)';
  const POP = 'cubic-bezier(.34,1.56,.64,1)';
  // html[data-motion="off"] = modo print/teste (mesmo efeito do movimento reduzido do sistema)
  const reduz = () => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const d = (ms) => (reduz() ? 0 : ms);
  const anima = (el, frames, ms, easing = EASE, extra = {}) => el.animate(frames, { duration: d(ms), easing, fill: 'both', ...extra });

  // ---------- Entrada em cascata: [data-enter] na ordem do DOM, ou a lista de elementos dada ----------
  // max = quantos itens ganham atraso crescente; do max-ésimo em diante entram juntos. Movimento reduzido: nada anima.
  function enter(root = document, { sel = '[data-enter]', stagger = 40, y = 14, ms = 520, max = Infinity } = {}) {
    if (reduz()) return Promise.resolve([]);
    const els = Array.isArray(root) ? root : [...root.querySelectorAll(sel)];
    return Promise.all(
      els.map((el, i) => anima(el, [{ opacity: 0, transform: `translateY(${y}px)` }, { opacity: 1, transform: 'none' }], ms, EASE, { delay: Math.min(i, max - 1) * stagger, fill: 'backwards' }).finished),
    );
  }

  // ---------- Números contando: <span data-count="4201" data-dec="0" data-prefix="R$ "> ----------
  const fmt = (n, dec) => n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  function countUp(el, { to = Number(el.dataset.count), from = 0, ms = 900 } = {}) {
    const dec = Number(el.dataset.dec || 0);
    const pre = el.dataset.prefix || '';
    const suf = el.dataset.suffix || '';
    if (!d(ms)) return void (el.textContent = pre + fmt(to, dec) + suf);
    const t0 = performance.now();
    const passo = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      const e = 1 - (1 - p) ** 3;
      el.textContent = pre + fmt(from + (to - from) * e, dec) + suf;
      if (p < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }
  const countAll = (root = document) => root.querySelectorAll('[data-count]').forEach((el) => countUp(el));

  // ---------- Indicador deslizante (abas, segmentado, barra de ícones) ----------
  // container posicionado; ind = elemento .tabs__ind/.rail__ind; eixo 'x' (largura acompanha) ou 'y'.
  function indicator(container, ind, { active = '.is-active', eixo = 'x' } = {}) {
    let primeira = true;
    const update = () => {
      const alvo = container.querySelector(active);
      ind.style.opacity = alvo ? '1' : '0';
      if (!alvo) return;
      if (primeira) ind.style.transition = 'none';
      if (eixo === 'x') {
        ind.style.width = `${alvo.offsetWidth}px`;
        ind.style.transform = `translateX(${alvo.offsetLeft}px)`;
      } else {
        ind.style.transform = `translateY(${alvo.offsetTop}px)`;
      }
      if (primeira) {
        ind.offsetWidth; // aplica a posição inicial sem animar
        ind.style.transition = '';
        primeira = false;
      }
    };
    update();
    new ResizeObserver(update).observe(container);
    document.fonts?.ready.then(update);
    return update;
  }

  // Grupo de botões com um ativo (abas, segmentado, barra). onChange(btn) troca o conteúdo.
  function tabs(container, onChange, { eixo = 'x', itens = 'button' } = {}) {
    const ind = container.querySelector('.tabs__ind, .rail__ind');
    const update = ind ? indicator(container, ind, { eixo }) : () => {};
    const botoes = () => [...container.querySelectorAll(itens)].filter((b) => !b.disabled);
    const ativar = (b) => {
      if (b.classList.contains('is-active')) return;
      botoes().forEach((x) => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-selected', String(x === b)); });
      update();
      onChange?.(b);
    };
    container.addEventListener('click', (e) => {
      const b = e.target.closest(itens);
      if (b && container.contains(b)) ativar(b);
    });
    container.addEventListener('keydown', (e) => {
      const teclas = eixo === 'x' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
      const k = teclas.indexOf(e.key);
      if (k < 0) return;
      const lista = botoes();
      const i = lista.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      const prox = lista[(i + (k ? 1 : -1) + lista.length) % lista.length];
      prox.focus();
      ativar(prox);
    });
    return { ativar, update };
  }

  // ---------- FLIP: elementos com [data-flip="id"] deslizam até a posição nova depois de mutate() ----------
  function flip(container, mutate, { ms = 450 } = {}) {
    const els = () => [...container.querySelectorAll('[data-flip]')];
    const antes = new Map(els().map((e) => [e.dataset.flip, e.getBoundingClientRect()]));
    mutate();
    for (const e of els()) {
      const a = antes.get(e.dataset.flip);
      const b = e.getBoundingClientRect();
      if (!a) {
        anima(e, [{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], ms);
        continue;
      }
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (dx || dy) anima(e, [{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], ms);
    }
  }

  // ---------- Camadas: gaveta, menu, paleta (Esc e clique fora fecham; foco volta para quem abriu) ----------
  const ENTRADAS = {
    drawer: [[{ opacity: 0, transform: 'translateX(32px)' }, { opacity: 1, transform: 'none' }], 450],
    pop: [[{ opacity: 0, transform: 'scale(.96) translateY(-4px)' }, { opacity: 1, transform: 'none' }], 220],
    palette: [[{ opacity: 0, transform: 'scale(.97) translateY(8px)' }, { opacity: 1, transform: 'none' }], 300],
  };
  const pilha = [];
  function layer(el, { tipo = 'drawer', scrim = true, onClose } = {}) {
    const volta = document.activeElement;
    const veu = scrim ? document.body.appendChild(Object.assign(document.createElement('div'), { className: 'scrim' })) : null;
    el.hidden = false;
    const [frames, ms] = ENTRADAS[tipo];
    if (veu) anima(veu, [{ opacity: 0 }, { opacity: 1 }], 300);
    anima(el, frames, ms, EASE);
    let fechado = false;
    const fechar = async () => {
      if (fechado) return;
      fechado = true;
      pilha.splice(pilha.indexOf(fechar), 1);
      document.removeEventListener('pointerdown', fora, true);
      const saidas = [anima(el, [...frames].reverse(), Math.min(ms, 240), EASE_IN).finished];
      if (veu) saidas.push(anima(veu, [{ opacity: 1 }, { opacity: 0 }], 240, EASE_IN).finished);
      await Promise.all(saidas);
      el.hidden = true;
      el.getAnimations().forEach((a) => a.cancel());
      veu?.remove();
      volta?.focus?.();
      onClose?.();
    };
    const fora = (e) => !el.contains(e.target) && pilha.at(-1) === fechar && fechar();
    setTimeout(() => document.addEventListener('pointerdown', fora, true));
    pilha.push(fechar);
    el.querySelector('[autofocus], input, button, [tabindex]')?.focus();
    return fechar;
  }
  addEventListener('keydown', (e) => e.key === 'Escape' && pilha.at(-1)?.());

  // Menu suspenso: itens = [{ label, checked?, run }] ou '-'. Abre junto do âncora (ou de x/y).
  function menu(ancora, itens) {
    const m = document.createElement('div');
    m.className = 'menu';
    m.setAttribute('role', 'menu');
    let fechar;
    for (const it of itens) {
      if (it === '-') { m.append(document.createElement('hr')); continue; }
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', it.checked == null ? 'menuitem' : 'menuitemradio');
      if (it.checked != null) b.setAttribute('aria-checked', String(!!it.checked));
      b.textContent = it.label;
      b.onclick = () => { fechar(); it.run?.(); };
      m.append(b);
    }
    m.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const bs = [...m.querySelectorAll('button')];
      const i = bs.indexOf(document.activeElement);
      bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus();
    });
    document.body.append(m);
    const r = ancora.getBoundingClientRect?.() ?? { left: ancora.x, bottom: ancora.y, right: ancora.x };
    const x = Math.min(r.left, innerWidth - m.offsetWidth - 8);
    const y = r.bottom + 6 + m.offsetHeight > innerHeight ? r.top - m.offsetHeight - 6 : r.bottom + 6;
    Object.assign(m.style, { left: `${Math.max(8, x)}px`, top: `${y}px` });
    fechar = layer(m, { tipo: 'pop', scrim: false, onClose: () => m.remove() });
    return fechar;
  }

  // ---------- Aviso escuro centralizado embaixo, com ação (Desfazer) ----------
  function toast(texto, { acao, run, ms = 5000 } = {}) {
    let box = document.querySelector('.toasts');
    if (!box) box = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'toasts' }));
    const t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.append(Object.assign(document.createElement('span'), { textContent: texto }));
    const sair = async () => {
      if (!t.isConnected) return;
      await anima(t, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(10px) scale(.97)' }], 220, EASE_IN).finished;
      t.remove();
    };
    if (acao) {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'btn btn--primary btn--sm', textContent: acao });
      b.onclick = () => { run?.(); sair(); };
      t.append(b);
    }
    box.append(t);
    anima(t, [{ opacity: 0, transform: 'translateY(16px) scale(.96)' }, { opacity: 1, transform: 'none' }], 420, POP);
    setTimeout(sair, ms);
    return sair;
  }

  // "Pulo" de atenção (badge que mudou, botão que liberou)
  const pop = (el) => anima(el, [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], 420, POP, { fill: 'none' });

  // ---------- Tema: aplica com um círculo que abre a partir do botão clicado ----------
  // tema: 'light' | 'dark' | 'system'; salva em localStorage(chave). O script antes da 1ª pintura lê a mesma chave.
  function theme(tema, origem, chave = 'ui:theme') {
    try { localStorage.setItem(chave, tema); } catch {}
    const efetivo = tema === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : tema;
    const aplicar = () => (document.documentElement.dataset.theme = efetivo);
    if (document.documentElement.dataset.theme === efetivo) return;
    if (!document.startViewTransition || reduz()) return aplicar();
    const r = origem?.getBoundingClientRect();
    const x = r ? r.left + r.width / 2 : innerWidth / 2;
    const y = r ? r.top + r.height / 2 : 0;
    const raio = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.startViewTransition(aplicar).ready.then(() =>
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${raio}px at ${x}px ${y}px)`] },
        { duration: 600, easing: EASE, pseudoElement: '::view-transition-new(root)' },
      ),
    );
  }
  function accent(nome, chave = 'ui:accent') {
    try { localStorage.setItem(chave, nome); } catch {}
    if (nome && nome !== 'azul') document.documentElement.dataset.accent = nome;
    else delete document.documentElement.dataset.accent;
  }

  // ---------- Troca de tela: sai rápido, troca, entra em cascata e conta os números ----------
  async function screen(main, swap) {
    if (!reduz()) await anima(main, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px)' }], 140, EASE_IN).finished;
    await swap();
    main.getAnimations().forEach((a) => a.cancel());
    main.scrollTop = 0;
    enter(main);
    countAll(main);
  }

  // Topo ganha fundo/blur quando a página rola
  function stuck(top, alvo = window) {
    const ver = () => top.classList.toggle('is-stuck', (alvo.scrollY ?? alvo.scrollTop) > 4);
    alvo.addEventListener('scroll', ver, { passive: true });
    ver();
  }

  // ---------- Arrastar cartões entre colunas (.col > .col__list > .kcard[data-flip]) ----------
  // onMove(card, colunaNova, colunaAntiga) depois de soltar em outra coluna.
  function drag(board, { onMove } = {}) {
    board.addEventListener('pointerdown', (e) => {
      const card = e.target.closest('.kcard');
      if (!card || e.button !== 0 || e.target.closest('button, a, input')) return;
      const r0 = card.getBoundingClientRect();
      const dx = e.clientX - r0.left;
      const dy = e.clientY - r0.top;
      const origem = card.closest('.col');
      let fantasma = null;
      let sobre = null;
      const mover = (ev) => {
        if (!fantasma) {
          if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 5) return;
          fantasma = card.cloneNode(true);
          fantasma.removeAttribute('data-flip');
          fantasma.classList.add('is-lifted');
          fantasma.style.width = `${r0.width}px`;
          document.body.append(fantasma);
          card.classList.add('is-ghost');
        }
        fantasma.style.left = `${ev.clientX - dx}px`;
        fantasma.style.top = `${ev.clientY - dy}px`;
        const col = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.col');
        if (col !== sobre) { sobre?.classList.remove('is-over'); col?.classList.add('is-over'); sobre = col; }
        if (!col) return;
        const lista = col.querySelector('.col__list');
        const ref = [...lista.children].find((c) => c !== card && ev.clientY < c.getBoundingClientRect().top + c.offsetHeight / 2) || null;
        if (card.parentElement !== lista || card.nextElementSibling !== ref) flip(board, () => lista.insertBefore(card, ref), { ms: 260 });
      };
      const soltar = async () => {
        removeEventListener('pointermove', mover);
        sobre?.classList.remove('is-over');
        if (!fantasma) return;
        // O clique que segue o pointerup não deve abrir o cartão que acabou de ser arrastado
        addEventListener('click', (ev) => ev.stopPropagation(), { capture: true, once: true });
        const r = card.getBoundingClientRect();
        fantasma.style.transition = 'none';
        await anima(fantasma, [{ left: fantasma.style.left, top: fantasma.style.top, rotate: '3deg', scale: '1.03' }, { left: `${r.left}px`, top: `${r.top}px`, rotate: '0deg', scale: '1' }], 260).finished;
        fantasma.remove();
        card.classList.remove('is-ghost');
        const destino = card.closest('.col');
        if (destino !== origem) { pop(card); onMove?.(card, destino, origem); }
      };
      addEventListener('pointermove', mover);
      addEventListener('pointerup', soltar, { once: true });
    });
  }

  window.motion = { EASE, EASE_IN, POP, reduz, enter, countUp, countAll, indicator, tabs, flip, layer, menu, toast, pop, theme, accent, screen, stuck, drag };
})();
