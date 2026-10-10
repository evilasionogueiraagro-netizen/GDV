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
    // Uma folha por 50 veículos: a 1ª folha é o modelo; as seguintes são cópias dele com a numeração continuando (51, 52…).
    const modelo = d.getElementById('pagina'), porFolha = CONFIG.linhasFicha;
    const folhas = Math.max(1, Math.ceil(veiculos.length / porFolha));
    const paginas = [modelo];
    for (let k = 1; k < folhas; k++) paginas.push(modelo.parentNode.appendChild(modelo.cloneNode(true)));
    paginas.forEach((pg, k) => {
      const set = (id, t) => { const e = pg.querySelector('#' + id); if (e) e.textContent = t; };
      set('local', turno.local);
      set('data', dataBR(turno.data));
      set('fiscal', turno.fiscal);
      set('turnoHorario', `das ${turno.inicio || '__:__'} às ${turno.fim || '__:__'}`);   // horário real de início/encerramento
      set('total', veiculos.length);
      for (let n = 1; n <= porFolha; n++) {
        const v = veiculos[k * porFolha + n - 1], h = pg.querySelector('#hora' + n);
        if (k && h && h.previousElementSibling) h.previousElementSibling.textContent = k * porFolha + n;   // nº da linha continua
        if (v) { set('hora' + n, v.hora); set('placa' + n, v.placa); set('tipo' + n, v.tipo); }
      }
      if (folhas > 1) { const t = pg.querySelector('#titulo'); if (t) t.textContent += ` – FOLHA ${k + 1}/${folhas}`; }
      if (k) pg.classList.add('folha-extra');
    });
    imprimir(f, 'Ficha de Campo ' + turno.numeroTF);
    return 0;
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
  // `opc` (opcional) adapta a outros modelos: `campos` = ids dos textos longos que podem ter a letra reduzida;
  // `primeiro` = [nome, função] da 1ª etapa. Sem `opc`, vale o comportamento do TF.
  async function caberEmUmaPagina(d, pg, opc = {}) {
    await Promise.all([...d.images].map(i => (i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))));
    if (d.fonts && d.fonts.ready) await d.fonts.ready;
    const alvo = 294 * 96 / 25.4;                                   // 294 mm em px (3 mm de folga na folha de 297 mm)
    const alt = () => pg.getBoundingClientRect().height;
    const campos = (opc.campos || ['constatacao', 'enquadramento']).map(i => d.getElementById(i)).filter(Boolean);
    const usado = [];
    const etapa = (nome, fn) => { if (alt() <= alvo) return; fn(); usado.push(nome); };
    const [nome1, fn1] = opc.primeiro || ['linha extra dos produtos', () => { const l = d.getElementById('produtos2'); if (l) l.closest('tr').style.display = 'none'; }];
    etapa(nome1, fn1);
    etapa('espaçamento compacto', () => pg.classList.add('compacto'));
    etapa('campos com a altura do texto', () => campos.forEach(c => { const td = c.closest('td'); if (td) { td.style.height = 'auto'; td.style.minHeight = '0'; } }));
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

  /* ---------- PCE: Ficha de Levantamento Fitossanitário e Termo de Colheita de Amostras ---------- */
  // Campos JSON chegam como string (ou já como objeto); parse defensivo.
  const jsonPce = (v, pad) => { if (v && typeof v === 'object') return v; const r = json(v, pad); return r && typeof r === 'object' ? r : pad; };
  const dataPce = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || ''); };
  const dataExtenso = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}` : ''; };
  const nomeArquivo = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');
  // Graus decimais → GMS (ex.: -3.1234 → 3°07'24,2" S)
  function gms(v, pos, neg) {
    const a = Math.abs(v); let g = Math.floor(a), m = Math.floor((a - g) * 60), s = Math.round(((a - g) * 60 - m) * 600) / 10;
    if (s >= 60) { s = 0; m++; } if (m >= 60) { m = 0; g++; }
    return `${g}°${String(m).padStart(2, '0')}'${s.toFixed(1).padStart(4, '0').replace('.', ',')}" ${v < 0 ? neg : pos}`;
  }
  function coordenadas(r) {
    const la = parseFloat(r.lat), lo = parseFloat(r.lon);
    if (isNaN(la) || isNaN(lo)) return { dec: '', gms: '' };
    const prec = parseFloat(r.precisao);
    return { dec: `${la.toFixed(6)}, ${lo.toFixed(6)}` + (isNaN(prec) ? '' : ` (± ${Math.round(prec)} m)`), gms: `${gms(la, 'N', 'S')}  ${gms(lo, 'L', 'O')}` };
  }
  // Preenche todos os elementos [data-campo] com texto (textContent: sem risco de HTML injetado).
  function preencherCampos(d, valores) {
    d.querySelectorAll('[data-campo]').forEach(e => {
      const k = e.getAttribute('data-campo'), v = valores[k];
      e.textContent = v == null ? '' : String(v);
    });
  }
  const imgSegura = a => (a && typeof a.dados === 'string' && /^data:image\/(jpeg|png|webp|gif);/i.test(a.dados) ? a.dados : '');
  // Grade de fotos: miniatura se a foto está no aparelho; senão, aviso de que está no Drive.
  function montarFotos(d, alvo, ids, arquivos) {
    alvo.textContent = '';
    ids.forEach((id, i) => {
      const fig = d.createElement('figure'); fig.className = 'foto';
      const src = imgSegura(arquivos[id]);
      if (src) { const im = d.createElement('img'); im.src = src; im.alt = ''; fig.append(im); }
      else { const s = d.createElement('div'); s.className = 'sem-foto'; s.textContent = 'foto arquivada no Drive'; fig.append(s); }
      const c = d.createElement('figcaption'); c.textContent = 'Foto ' + (i + 1); fig.append(c);
      alvo.append(fig);
    });
  }
  // Coloca a imagem da assinatura (se colhida na tela) sobre a linha correspondente.
  function montarAssinaturas(d, ass, arquivos) {
    d.querySelectorAll('.assinatura[data-papel]').forEach(b => {
      const src = imgSegura(arquivos[ass[b.getAttribute('data-papel')]]), area = b.querySelector('.area');
      area.textContent = '';
      if (src) { const im = d.createElement('img'); im.src = src; im.alt = ''; area.append(im); }
    });
  }
  const listaIds = v => { const a = jsonPce(v, []); return Array.isArray(a) ? a.filter(x => typeof x === 'string' && x) : []; };

  async function pceLevantamento(reg, arquivosPorId) {
    if (!reg) throw new Error('Levantamento não encontrado.');
    const arquivos = arquivosPorId || {};
    const f = await abrirModelo('pce-levantamento.html'), d = f.contentDocument;
    const co = coordenadas(reg), fotos = listaIds(reg.fotos);
    const culturas = (() => { const c = jsonPce(reg.culturas, []); return Array.isArray(c) ? c.filter(x => x && typeof x === 'object') : []; })();
    preencherCampos(d, Object.assign({}, reg, {
      data: dataPce(reg.data), doc: fmtDoc(reg.doc), coordDec: co.dec || 'Não capturadas', coordGms: co.gms,
      nFotos: fotos.length ? `(${fotos.length})` : ''
    }));
    const corpo = d.getElementById('culturasCorpo');
    if (!culturas.length) corpo.innerHTML = '<tr><td colspan="10" class="vazio">Nenhuma cultura informada.</td></tr>';
    else corpo.innerHTML = culturas.map((c, i) => {
      const amostra = c.coleta === 'Sim';
      const td = v => `<td>${esc(v)}</td>`;
      return `<tr><td class="n">${i + 1}</td>${td(c.cultura)}${td(c.area)}${td(c.espLinha)}${td(c.espPlanta)}${td(c.praga)}${td(c.coleta || 'Não')}`
        + `${td(amostra ? c.tipoMaterial : '–')}${td(amostra ? c.codigoAmostra : '–')}${td(amostra ? c.destinoAmostra : '–')}</tr>`;
    }).join('');
    if (!String(reg.obs || '').trim()) d.getElementById('quadroObs').remove();
    const gradeFotos = d.getElementById('fotos');
    if (fotos.length) montarFotos(d, gradeFotos, fotos, arquivos);
    else { gradeFotos.className = 'vazio'; gradeFotos.textContent = 'Nenhuma foto registrada.'; }
    montarAssinaturas(d, jsonPce(reg.assinaturas, {}), arquivos);
    await Promise.all([...d.images].map(i => (i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))));
    imprimir(f, nomeArquivo(`Levantamento_${reg.nome || 'SEM_NOME'}_${dataPce(reg.data).replace(/\//g, '-')}`));
  }

  async function pceColheita(termo, arquivosPorId) {
    const t = termo;
    if (!t) throw new Error('Termo de colheita não encontrado.');
    const arquivos = arquivosPorId || {};
    const f = await abrirModelo('pce-colheita.html'), d = f.contentDocument;
    const co = coordenadas(t), fotos = listaIds(t.fotos), MAX_FOTOS = 4;
    const ext = dataExtenso(t.data);
    preencherCampos(d, Object.assign({}, t, {
      unidade: String(t.unidade || '').toUpperCase(), data: dataPce(t.data), doc: fmtDoc(t.doc),
      coordDec: co.dec || 'Não capturadas', coordGms: co.gms,
      localData: [t.local || t.municipio, ext].filter(Boolean).join(', ') || '____________________, ____ de ______________ de ______'
    }));
    const gradeFotos = d.getElementById('fotos'), extra = d.getElementById('fotosExtra');
    if (fotos.length) {
      montarFotos(d, gradeFotos, fotos.slice(0, MAX_FOTOS), arquivos);
      if (fotos.length > MAX_FOTOS) extra.textContent = `+${fotos.length - MAX_FOTOS} foto(s) no Drive`;
    } else { gradeFotos.className = 'vazio'; gradeFotos.textContent = 'Nenhuma foto registrada.'; }
    montarAssinaturas(d, jsonPce(t.assinaturas, {}), arquivos);

    const pg = d.querySelector('.a4');
    if (t.cancelado) { const b = d.createElement('div'); b.className = 'cancelado-faixa'; b.textContent = 'TERMO CANCELADO' + (t.motivoCancel ? ' – ' + t.motivoCancel : ''); pg.insertBefore(b, d.querySelector('.quadro')); }
    await caberEmUmaPagina(d, pg, { campos: ['descricao'], primeiro: ['texto oficial com a altura do texto', () => { const td = d.querySelector('td.descricao'); if (td) td.style.height = 'auto'; }] });
    const cfg = (typeof CONFIG !== 'undefined' && CONFIG.PCE && CONFIG.PCE.vias) || 2;
    const vias = Array.isArray(cfg) ? cfg : ['Via da ADAF', 'Via do produtor'].slice(0, Math.max(1, Number(cfg) || 2));
    const paginas = [pg];
    vias.slice(1).forEach(() => { const c = pg.cloneNode(true); paginas[paginas.length - 1].after(c); paginas.push(c); });
    paginas.forEach((p, i) => { p.querySelector('.via').textContent = vias[i] || ''; });
    imprimir(f, nomeArquivo('Termo_Colheita_' + String(t.numeroTxt || t.numero || 'SEM_NUMERO').replace(/\//g, '_')));
  }

  return { ficha, termo, tf, pceLevantamento, pceColheita, ordenar, esc };
})();
