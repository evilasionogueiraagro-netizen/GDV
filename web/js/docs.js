// Geração do Termo de Fiscalização e da Ficha de Campo: carrega o modelo HTML, preenche e imprime/salva em PDF.
const Docs = (() => {
  const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const dataBR = iso => iso.split('-').reverse().join('/');

  function abrirModelo(arquivo) {
    return new Promise((ok, no) => {
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;left:-9999px;top:0;width:210mm;height:297mm;border:0';
      f.onload = () => ok(f);
      f.onerror = no;
      f.src = 'documentos/' + arquivo;
      document.body.appendChild(f);
    });
  }
  // `nome` vira o título da página durante a impressão (sugestão de nome do arquivo PDF).
  function imprimir(frame, nome) {
    const w = frame.contentWindow, tituloAntes = document.title;
    document.title = nome; frame.contentDocument.title = nome;
    w.addEventListener('afterprint', () => { document.title = tituloAntes; frame.remove(); });
    w.focus();
    w.print();
  }

  const ordenar = v => v.slice().sort((a, b) => (a.hora + a.criadoEm).localeCompare(b.hora + b.criadoEm) || a.criadoEm - b.criadoEm);

  async function dadosDoTurno(turnoId) {
    const turno = await Store.obter('turnos', turnoId);
    const veic = (await Store.todos('veiculos')).filter(v => v.turnoId === turnoId && !v.excluido);
    return { turno, veiculos: ordenar(veic) };
  }

  async function ficha(turnoId) {
    const { turno, veiculos } = await dadosDoTurno(turnoId);
    const f = await abrirModelo('ficha.html'), d = f.contentDocument;
    const set = (id, t) => { const e = d.getElementById(id); if (e) e.textContent = t; };
    set('local', turno.local);
    set('data', dataBR(turno.data));
    set('fiscal', turno.fiscal);
    set('turnoA', turno.letra === 'A' ? '☑' : '☐');
    set('turnoB', turno.letra === 'B' ? '☑' : '☐');
    veiculos.slice(0, CONFIG.linhasFicha).forEach((v, i) => {
      set('hora' + (i + 1), v.hora); set('placa' + (i + 1), v.placa); set('tipo' + (i + 1), v.tipo);
    });
    set('total', veiculos.length);
    imprimir(f, 'Ficha de Campo ' + turno.numeroTF);
    return veiculos.length > CONFIG.linhasFicha ? veiculos.length - CONFIG.linhasFicha : 0;
  }

  // Campo "Coordenadas Geográficas" do Termo: usa a coordenada FINAL (encerramento) em graus decimais;
  // se ela não foi capturada, usa a do início.
  function textoCoordenadas(t) {
    for (const suf of ['Fim', 'Ini']) {
      const la = parseFloat(t['lat' + suf]), ln = parseFloat(t['lng' + suf]);
      if (!isNaN(la) && !isNaN(ln)) return `${la.toFixed(5)}, ${ln.toFixed(5)}`;
    }
    return '';
  }

  async function termo(turnoId) {
    const { turno, veiculos } = await dadosDoTurno(turnoId);
    const f = await abrirModelo('termo.html'), d = f.contentDocument;
    const set = (id, t) => { const e = d.getElementById(id); if (e) e.textContent = t; };
    const [ano, mes, dia] = turno.data.split('-');
    const partes = turno.numeroTF.split('-');             // TF-001-A-2026
    set('numeroTF', partes[1] + '-' + partes[2]);
    set('ano', partes[3] || ano);
    set('unidade', turno.unidade || CONFIG.unidadePadrao);
    const coords = textoCoordenadas(turno), caixa = d.querySelector('.coordenadas');
    if (coords && caixa) {
      const v = d.createElement('span');
      v.className = 'valor'; v.textContent = coords; v.style.whiteSpace = 'nowrap';
      caixa.appendChild(v);
    }
    const pessoas = veiculos.reduce((s, v) => s + (Number(v.pessoas) || 0), 0);
    const lavrados = (await Store.todos('tfs')).filter(x => x.turnoId === turnoId && !x.cancelado).sort((a, b) => a.numero - b.numero).map(x => x.numeroTxt);
    const linhasTF = lavrados.length ? `<strong>${esc(lavrados.join('; '))}</strong>`
      : '____________________________________________________<br>____________________________________________________';
    const ini = turno.inicio || '__:__';
    const fim = turno.fim || '__:__';
    d.getElementById('descricaoTexto').innerHTML = `
<p>Aos <strong>${Number(dia)}</strong> dias do mês de <strong>${MESES[Number(mes) - 1]}</strong> de <strong>${esc(ano)}</strong>,
das <strong>${esc(ini)}</strong> horas às <strong>${esc(fim)}</strong> horas,
foram executadas as atividades de <strong>Fiscalização / Educação Sanitária Vegetal</strong>,
pelo(s) servidor(es) <strong>${esc(turno.fiscal)}</strong>, realizada no <strong>${esc(turno.local)}</strong>,
onde procedeu(ram) à inspeção de veículos, cargas, bagagens, pessoas e demais materiais sujeitos ao controle da Defesa Agropecuária.</p>
<p>Durante a ação foram abordados <strong>${veiculos.length}</strong> veículos, fiscalizadas <strong>${pessoas}</strong> pessoas.<br><br>
Termos de Barreira Lavrados:<br>${linhasTF}</p>
<p>Na inspeção foram verificadas cargas contendo produtos, subprodutos e outros artigos regulamentados, observando-se as exigências
previstas na legislação federal e estadual referente ao trânsito agropecuário e às medidas de defesa vegetal.</p>
<p>Foram prestadas orientações aos usuários quanto às normas fitossanitárias vigentes, especialmente sobre os riscos de introdução e
dispersão de pragas quarentenárias, com destaque para a <strong>Mosca-da-Carambola (Bactrocera carambolae)</strong>, bem como sobre
a obrigatoriedade da apresentação da documentação fitossanitária quando exigida.</p>
<p>Nada mais havendo a registrar, lavrou-se o presente Termo de Fiscalização para fins de comprovação da atividade desenvolvida.</p>`;
    imprimir(f, 'Termo ' + turno.numeroTF);
  }

  /* ---------- Termo de Fiscalização de Barreira (TF), impresso em 2 vias ---------- */
  const json = (v, pad) => { try { return JSON.parse(v); } catch (e) { return pad; } };
  const fmtDoc = v => { const d = String(v || '').replace(/\D/g, ''); return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : d; };
  const PROC_TITULO = { liberacao: 'LIBERACAO', apreensao: 'APREENSAO', rechaco: 'RECHACO' };

  /**
   * Garante que a via caiba em UMA folha A4 (297 mm). Etapas, da menos para a mais visível:
   * 1) tira a linha em branco extra dos produtos; 2) compacta os espaçamentos; 3) deixa Constatação/Enquadramento
   * com a altura do próprio texto; 4) reduz a letra desses dois campos (até 10,5 px); 5) zoom leve (até 88%);
   * 6) último recurso: letra 9 px e zoom até 78%.
   */
  async function caberEmUmaPagina(d, pg) {
    await Promise.all([...d.images].map(i => (i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))));
    if (d.fonts && d.fonts.ready) await d.fonts.ready;
    const alvo = 294 * 96 / 25.4;                                   // 294 mm em px (3 mm de folga na folha de 297 mm)
    const alt = () => pg.getBoundingClientRect().height;
    const campos = ['constatacao', 'enquadramento'].map(i => d.getElementById(i));
    const usado = [];
    const etapa = (nome, fn) => { if (alt() <= alvo) return; fn(); usado.push(nome); };
    etapa('linha extra dos produtos', () => { const l = d.getElementById('produtos2'); if (l) l.closest('tr').style.display = 'none'; });
    etapa('espaçamento compacto', () => pg.classList.add('compacto'));
    etapa('campos com a altura do texto', () => campos.forEach(c => { const td = c.closest('td'); td.style.height = 'auto'; td.style.minHeight = '0'; }));
    let tam = 13, z = 1;
    const fonte = piso => { while (alt() > alvo && tam > piso) { tam -= 0.5; campos.forEach(c => { c.style.fontSize = tam + 'px'; c.style.lineHeight = '1.25'; }); } };
    const zoom = piso => { while (alt() > alvo && z > piso) { z = Math.round((z - 0.02) * 100) / 100; pg.style.zoom = String(z); } };
    fonte(10.5); if (tam < 13) usado.push('letra ' + tam + 'px');
    zoom(0.88);  if (z < 1) usado.push('zoom ' + z);
    fonte(9); zoom(0.78);
    const r = { etapas: usado, fonte: tam, zoom: z, altura: Math.round(alt()), alvo: Math.round(alvo) };
    pg.setAttribute('data-ajuste', JSON.stringify(r));
    return r;
  }

  async function tf(id) {
    const t = await Store.obter('tfs', id);
    if (!t) throw new Error('TF não encontrado.');
    const f = await abrirModelo('tf.html'), d = f.contentDocument;
    const set = (i, v) => { const e = d.getElementById(i); if (e) e.textContent = v == null ? '' : String(v); };
    const marca = b => (b ? '☑' : '☐');
    const grade = (id, linhas) => {                         // pequena tabela sem bordas (caixas de seleção)
      const tb = d.createElement('table'); tb.style.cssText = 'width:100%;border:none;font-size:12px;';
      linhas.forEach(l => { const tr = d.createElement('tr'); l.forEach(c => { const td = d.createElement('td'); td.style.cssText = `border:none;width:${c.w}%;`; td.textContent = c.t; tr.append(td); }); tb.append(tr); });
      const alvo = d.getElementById(id); alvo.textContent = ''; alvo.append(tb);
    };
    const docs = json(t.documentos, {}), prods = json(t.produtos, []);
    set('tf_numero', t.numeroTxt); set('nome', t.nome); set('cpf', fmtDoc(t.doc)); set('rg', t.rg); set('endereco', t.endereco);
    set('relacao', t.relacao); set('municipio', t.municipio); set('uf', t.uf); set('telefone', t.telefone);
    grade('acao_realizada', [[{ w: 50, t: `${marca(t.inspecao)} Inspeção` }, { w: 50, t: `${marca(t.coleta)} Coleta de amostra${t.coleta && t.amostras ? ' – Qtd.: ' + t.amostras : ''}` }]]);
    grade('procedimentos', [
      [{ w: 33, t: `${marca(t.procedimento === 'liberacao')} Liberação` }, { w: 33, t: `${marca(t.procedimento === 'apreensao')} Apreensão p/ destruição` }, { w: 34, t: `${marca(t.procedimento === 'rechaco')} Rechaço` }],
      [{ w: 33, t: `${marca(t.fiel)} Fiel depositário` }, { w: 33, t: `${marca(t.auto)} Auto de Infração` }, { w: 34, t: `${marca(t.advertencia)} Advertência` }]]);
    set('local', t.local); set('data', t.data ? dataBR(t.data) : ''); set('hora', t.hora); set('placa', t.placa); set('origem', t.origem); set('destino', t.destino);
    const dc = (rot, k) => ({ w: 25, t: `${marca(docs[k])} ${rot} ${docs[k] || '____________'}` });
    grade('documentos', [[dc('NF Nº', 'nf'), dc('SIF Nº', 'sif'), dc('PTV Nº', 'ptv'), dc('SIE Nº', 'sie')], [dc('SIM Nº', 'sim'), dc('GTA Nº', 'gta'), dc('LACRE', 'lacre'), dc('OUTROS', 'outros')]]);
    set('produtos', prods.join('\n')); set('constatacao', t.constatacao); set('enquadramento', t.enquadramento);

    const pg = d.querySelector('.a4'), vias = CONFIG.TF.vias;
    await caberEmUmaPagina(d, pg);                                  // antes de duplicar: as 2 vias saem iguais
    if (t.cancelado) { const b = d.createElement('div'); b.className = 'cancelado-faixa'; b.textContent = 'TF CANCELADO' + (t.motivoCancel ? ' – ' + t.motivoCancel : ''); pg.insertBefore(b, pg.children[1] || null); }
    const paginas = [pg];
    vias.slice(1).forEach(() => { const c = pg.cloneNode(true); paginas[paginas.length - 1].after(c); paginas.push(c); });
    paginas.forEach((p, i) => { p.querySelector('.via').textContent = vias[i] || ''; });
    const nomeArq = `TF ${String(t.numeroTxt).replace(/\//g, '-')} ${prods.map(p => String(p).split(' - ')[0]).join('_') || 'SEM_PRODUTO'} ${PROC_TITULO[t.procedimento] || 'OUTRO'}`;
    imprimir(f, nomeArq);
  }

  return { ficha, termo, tf, ordenar, esc };
})();
