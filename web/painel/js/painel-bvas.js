/* Cadastro de BVAs (gerência), aberto pelo botão "Cadastro de BVAs" da aba Barreiras: a lista em uso (as do app em CONFIG.bvas e as
   cadastradas no painel), "Nova BVA" e editar município, endereço, placa obrigatória, Ficha de Campo e ativa. O nome não muda depois de
   criado (os turnos guardam o nome). Action painelBvaSalvar (bvas.gs); os aparelhos recebem a lista nova na próxima sincronização. */
(function () {
  'use strict';
  if (typeof Painel === 'undefined') return;
  const P = Painel, esc = P.esc;
  const k = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  /** Todas as BVAs: as da base (config.js) e as cadastradas, com a situação; cada uma com a linha do cadastro, se tiver. */
  function lista() {
    const cad = P.bvasCadastro, base = (CONFIG.bvasBase || []), out = [];
    const escalaDe = (c, b) => c && c.escalaRegime ? { regime: c.escalaRegime, dias: Number(c.escalaDias) || 0 } : (b && b.escala) || { regime: 'ajustavel', dias: 0 };
    base.forEach(b => { const c = cad.find(x => k(x.nome) === k(b.nome)); out.push({ ...b, ...(c ? { municipio: c.municipio, endereco: c.endereco, placa: !!c.placa, ficha: !!c.ficha } : {}), escala: escalaDe(c, b), cad: c || null, ativo: c ? !!c.ativo : true, base: true }); });
    cad.filter(c => !base.some(b => k(b.nome) === k(c.nome))).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .forEach(c => out.push({ nome: c.nome, municipio: c.municipio, endereco: c.endereco, placa: !!c.placa, ficha: !!c.ficha, escala: escalaDe(c, null), ativo: !!c.ativo, cad: c, base: false }));
    return out;
  }

  const REG = () => (CONFIG.REGIMES_ESCALA || {});
  const textoReg = e => e.regime === 'dias' ? `${e.dias} dias` : (REG()[e.regime] || 'Período ajustável');
  function abrir() {
    const velho = document.getElementById('pn-bva-dlg'); if (velho) velho.remove();
    const dlg = P.el('dialog', 'pn-dlg pn-bva-dlg'); dlg.id = 'pn-bva-dlg';
    document.body.appendChild(dlg);
    const desenhar = (editando, msg) => {
      const L = lista(), e = editando === '' ? { nome: '', municipio: '', endereco: '', placa: false, ficha: false, ativo: true, escala: { regime: 'ajustavel', dias: 0 }, novo: true } : editando;
      dlg.innerHTML = `<form method="dialog" class="pn-dlg-form" novalidate><h3>Cadastro de BVAs</h3>
        <p class="pn-sub">Lista do campo "Local / Posto (BVA)" do app. Os aparelhos recebem as mudanças na próxima sincronização.</p>
        <div class="pn-tab"><div class="pn-tab-rolo"><table id="pn-bva-tab"><thead><tr><th scope="col">BVA</th><th scope="col">Município</th><th scope="col">Placa</th><th scope="col">Ficha</th><th scope="col">Escala de plantão</th><th scope="col">Situação</th><th scope="col"></th></tr></thead>
          <tbody>${L.map((b, i) => `<tr><td>${esc(b.nome)}</td><td>${esc(b.municipio || '—')}</td><td>${b.placa ? 'obrigatória' : 'opcional'}</td><td>${b.ficha ? 'sim' : 'não'}</td><td>${esc(textoReg(b.escala))}</td>
            <td>${b.ativo ? '<span class="pn-selo bom">ativa</span>' : '<span class="pn-selo">desativada</span>'}</td><td><button type="button" class="pn-btn pn-btn-mini" data-bva-ed="${i}">Editar</button></td></tr>`).join('')}</tbody></table></div></div>
        ${e ? `<fieldset class="pn-conv-cfg-etapa" id="pn-bva-form"><legend>${e.novo ? 'Nova BVA' : esc(e.nome)}</legend>
          ${e.novo ? '<label class="pn-conv-campo">Nome<input id="pn-bva-nome" maxlength="60" placeholder="ex.: BVA - HUMAITÁ" autocomplete="off"></label>' : ''}
          <label class="pn-conv-campo">Município<input id="pn-bva-mun" maxlength="60" value="${esc(e.municipio || '')}" autocomplete="off"></label>
          <label class="pn-conv-campo">Endereço (Termo de Fiscalização)<input id="pn-bva-end" maxlength="160" value="${esc(e.endereco || '')}" autocomplete="off"></label>
          <label class="pn-rg-chk"><input type="checkbox" id="pn-bva-placa" ${e.placa ? 'checked' : ''}> Placa do veículo obrigatória</label>
          <label class="pn-rg-chk"><input type="checkbox" id="pn-bva-ficha" ${e.ficha ? 'checked' : ''}> Gera a Ficha de Campo</label>
          <div class="pn-conv-cfg-grade"><label class="pn-conv-campo">Escala de plantão<select id="pn-bva-reg">${Object.entries(REG()).map(([v, t]) => `<option value="${v}" ${e.escala.regime === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
            <label class="pn-conv-campo" id="pn-bva-dias-box" ${e.escala.regime === 'dias' ? '' : 'hidden'}>Dias do período<input id="pn-bva-dias" inputmode="numeric" maxlength="2" value="${esc(e.escala.dias || '')}"></label></div>
          <p class="pn-sub">Na escala, o coordenador escolhe o início e o fim vem sugerido por este regime (período ajustável: ele escolhe o fim).</p>
          <label class="pn-rg-chk"><input type="checkbox" id="pn-bva-ativo" ${e.ativo ? 'checked' : ''}> Ativa (aparece no app)</label>
          <div class="pn-dlg-botoes"><button type="button" class="pn-btn" id="pn-bva-cancelar-ed">Cancelar</button><button type="button" class="pn-btn pn-btn-prim" id="pn-bva-salvar">Salvar</button></div></fieldset>`
        : '<button type="button" class="pn-btn" id="pn-bva-nova">Nova BVA</button>'}
        <p class="pn-dlg-erro" id="pn-bva-erro" role="alert">${esc(msg || '')}</p>
        <div class="pn-dlg-botoes"><button type="button" class="pn-btn" id="pn-bva-fechar">Fechar</button></div></form>`;
      const q = s => dlg.querySelector(s);
      q('#pn-bva-fechar').onclick = () => dlg.close();
      if (q('#pn-bva-nova')) q('#pn-bva-nova').onclick = () => { desenhar(''); q('#pn-bva-nome').focus(); };
      dlg.querySelectorAll('[data-bva-ed]').forEach(b => { b.onclick = () => desenhar(L[+b.dataset.bvaEd]); });
      if (!e) return;
      q('#pn-bva-cancelar-ed').onclick = () => desenhar(null);
      q('#pn-bva-reg').onchange = ev => { q('#pn-bva-dias-box').hidden = ev.target.value !== 'dias'; };
      q('#pn-bva-salvar').onclick = async () => {
        const bva = { id: e.cad ? e.cad.id : '', nome: e.novo ? q('#pn-bva-nome').value : e.nome, municipio: q('#pn-bva-mun').value, endereco: q('#pn-bva-end').value,
                      placa: q('#pn-bva-placa').checked, ficha: q('#pn-bva-ficha').checked, ativo: q('#pn-bva-ativo').checked,
                      escalaRegime: q('#pn-bva-reg').value, escalaDias: q('#pn-bva-reg').value === 'dias' ? Number(q('#pn-bva-dias').value) || 0 : 0 };
        q('#pn-bva-salvar').disabled = true;
        try {
          const r = await P.chamar({ action: 'painelBvaSalvar', bva });
          CONFIG.aplicarBvas(r.bvas); P.definirBvasCadastro(r.bvas);
          P.toast(`${r.bva.nome} salva. Os aparelhos recebem na próxima sincronização.`); desenhar(null);
        } catch (err) { desenhar(e, err.message); }
      };
    };
    desenhar(null);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.showModal();
  }

  /** Botão da aba Barreiras (só a gerência). */
  function botao() {
    const b = P.el('button', 'pn-btn', 'Cadastro de BVAs'); b.type = 'button'; b.id = 'pn-bva-abrir'; b.onclick = abrir;
    return b;
  }
  window.PainelBvas = { botao, abrir, lista };
})();
