// Geração do Termo de Fiscalização e da Ficha de Campo: carrega o modelo HTML, preenche e imprime/salva em PDF.
const Docs = (() => {
  const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const dataBR = iso => iso.split('-').reverse().join('/');
  /** Fiscais do turno: os digitados no início e os colegas que entraram pelo código (turno compartilhado), sem repetir. */
  function fiscaisDoTurno(t) {
    const chave = n => String(n || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const nomes = String((t && t.fiscal) || '').split(/\s+e\s+|,|;|\//).map(x => x.trim()).filter(Boolean), vistos = new Set(nomes.map(chave));
    let col = []; try { col = JSON.parse((t && t.colegas) || '[]') || []; } catch (e) { col = []; }
    (Array.isArray(col) ? col : []).forEach(n => { n = String(n || '').trim(); if (n && !vistos.has(chave(n))) { vistos.add(chave(n)); nomes.push(n); } });
    return nomes.join(' e ');
  }

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
  // Celular: o print() dentro do iframe imprime a tela do app (Chrome no Android) e o "afterprint" chega antes de o PDF ser gerado;
  // lá o documento pronto é copiado para a própria página (imprimirNaPagina). No computador, imprime o iframe, como sempre.
  const noCelular = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || localStorage.getItem('gdv.imprimirNaPagina') === '1';
  function imprimir(frame, nome) {
    if (noCelular()) return imprimirNaPagina(frame, nome);
    const w = frame.contentWindow, tituloAntes = document.title;
    document.title = nome; frame.contentDocument.title = nome;
    w.addEventListener('afterprint', () => { document.title = tituloAntes; frame.remove(); });
    w.focus();
    w.print();
  }
  /**
   * Impressão na própria página (celular): o documento preenchido vai para um shadow root (#gdv-impressao: os estilos do modelo não
   * vazam para o app nem os do app para ele), com os endereços de imagens resolvidos a partir de documentos/. Na impressão só ele
   * aparece (@media print). Fica na página até o próximo documento ou a próxima tela (o PDF do Android é gerado depois do print()).
   */
  function imprimirNaPagina(frame, nome) {
    const d = frame.contentDocument;
    limparImpressao();
    d.querySelectorAll('[src]').forEach(e => { if (e.src) e.setAttribute('src', e.src); });   // ../img/… → endereço completo
    const regra = r => {
      if (r.selectorText) return r.cssText.replace(r.selectorText, r.selectorText.split(',').map(x => x.trim().replace(/^(html|body)\b/, ':host')).join(', '));
      return /^@page/.test(r.cssText) ? '' : r.cssText;
    };
    let css = '';
    [...d.styleSheets].forEach(sh => { try { css += [...sh.cssRules].map(regra).join('\n') + '\n'; } catch (e) { /* folha de outra origem */ } });
    const host = document.createElement('div'); host.id = 'gdv-impressao';
    const raiz = host.attachShadow({ mode: 'open' });
    raiz.innerHTML = `<style>:host{all:initial;display:block;font-family:Arial,sans-serif;color:#000;background:#fff}\n${css}</style>${d.body.innerHTML}`;
    const pg = document.createElement('style'); pg.id = 'gdv-impressao-pg';
    pg.textContent = '#gdv-impressao{display:none}@page{size:A4 portrait;margin:0}' +
      '@media print{body{margin:0!important;padding:0!important;background:#fff!important}body>*:not(#gdv-impressao){display:none!important}#gdv-impressao{display:block!important}}';
    document.head.appendChild(pg); document.body.appendChild(host); frame.remove();
    limparImpressao.titulo = limparImpressao.titulo || document.title; document.title = nome;
    const imgs = [...raiz.querySelectorAll('img')].map(im => (im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; setTimeout(r, 4000); })));
    return Promise.all(imgs).then(() => window.print());
  }
  /** Tira da página o documento da última impressão (celular) e volta o título. */
  function limparImpressao() {
    ['gdv-impressao', 'gdv-impressao-pg'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); });
    if (limparImpressao.titulo) { document.title = limparImpressao.titulo; limparImpressao.titulo = ''; }
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
      set('fiscal', fiscaisDoTurno(turno));
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

  // Campo "Coordenadas Geográficas" do Termo: usa a coordenada FINAL (encerramento); se ela não foi capturada, usa a do início.
  // Sai em graus, minutos e segundos como no modelo de papel (03° 08' 06.21" S / 59° 56' 20.86" W), com os graus decimais entre parênteses.
  function coordTurno(t) {
    for (const suf of ['Fim', 'Ini']) {
      const la = parseFloat(t['lat' + suf]), ln = parseFloat(t['lng' + suf]);
      if (!isNaN(la) && !isNaN(ln)) return [la, ln];
    }
    return null;
  }
  function gmsTermo(v, pos, neg) {
    const a = Math.abs(v); let d = Math.floor(a), m = Math.floor((a - d) * 60), sg = Math.round(((a - d) * 60 - m) * 6000) / 100;
    if (sg >= 60) { sg = 0; m++; } if (m >= 60) { m = 0; d++; }
    return `${String(d).padStart(2, '0')}° ${String(m).padStart(2, '0')}' ${sg.toFixed(2).padStart(5, '0')}" ${v < 0 ? neg : pos}`;
  }
  function textoCoordenadas(t) {
    const c = coordTurno(t); if (!c) return '';
    return `${gmsTermo(c[0], 'N', 'S')} / ${gmsTermo(c[1], 'E', 'W')} (${c[0].toFixed(5)}, ${c[1].toFixed(5)})`;
  }

  /** Termo de Fiscalização do turno (modelo padrão ADAF 2026): identificação do posto, descrição da ação com os números do turno,
   *  enquadramento legal em branco (linhas para preencher à mão), testemunhas, recebimento da 2ª via e assinatura do servidor. */
  async function termo(turnoId) {
    const { turno, veiculos } = await dadosDoTurno(turnoId);
    const f = await abrirModelo('termo.html'), d = f.contentDocument;
    const set = (id, t) => { const e = d.getElementById(id); if (e) e.textContent = t; };
    const [ano, mes, dia] = turno.data.split('-');
    const partes = turno.numeroTF.split('-');             // TF-001-A-2026
    set('numeroTF', partes[1] + '-' + partes[2]);
    set('ano', partes[3] || ano);
    set('unidade', turno.unidade || CONFIG.unidadePadrao);
    const volante = /m[óo]vel|volante/i.test(turno.posto || ''), bva = (CONFIG.bvas || []).find(b => b.nome === turno.local) || {};
    set('idNome', volante ? 'AÇÃO VOLANTE – ' + (turno.unidade || '') : turno.local);
    set('idAtividade', 'FISCALIZAÇÃO / EDUCAÇÃO SANITÁRIA');
    set('idEndereco', volante ? turno.local : (bva.endereco || ''));
    set('idMunicipio', (volante ? turno.unidade : bva.municipio || turno.unidade || '').toUpperCase());
    set('idUf', 'AMAZONAS');
    set('idCoordenadas', textoCoordenadas(turno));
    set('servidorNome', fiscaisDoTurno(turno));
    const pessoas = veiculos.reduce((s, v) => s + (Number(v.pessoas) || 0), 0) + (Number(turno.pessoasEducacao) || 0);
    let lavrados = (await Store.todos('tfs')).filter(x => x.turnoId === turnoId && !x.cancelado).sort((a, b) => a.numero - b.numero).map(x => x.numeroTxt);
    // com internet, também os da planilha: o TF lavrado no celular do colega e o TF do turno lavrado sem ligação com ele (turnoTFs)
    if (navigator.onLine && typeof Sync !== 'undefined' && Sync.ativado()) {
      try { const r = await Sync.tfsDoTurno(turnoId); lavrados = [...new Set(lavrados.concat(r.tfs || []))].sort(); } catch (e) { /* sem resposta: só os deste aparelho */ }
    }
    const ini = turno.inicio || '__:__', fim = turno.fim || '__:__';
    // turno que só conta pessoas orientadas (volante de Tabatinga: educação sanitária da monilíase)
    const soPes = Number(turno.soPessoas) === 1, temaCfg = ((CONFIG.volantesSoPessoas || {})[String(turno.unidade || '').toUpperCase()] || {}).tema;
    const tema = temaCfg ? esc(temaCfg).replace(/\(([^)]+)\)/, '(<i>$1</i>)') : '';
    d.getElementById('descricaoTexto').innerHTML = `
<p>Em <strong>${esc(dia)}/${esc(mes)}/${esc(ano)}</strong>, das <strong>${esc(ini)}</strong> às <strong>${esc(fim)}</strong> hora(s), ao realizar fiscalização no(a)
<strong>${esc(turno.local)}</strong>, pelo(s) servidor(es) <strong>${esc(fiscaisDoTurno(turno))}</strong>, constatou-se:</p>
${soPes ? `<p>Foram realizadas <strong>${pessoas}</strong> ações de educação sanitária (pessoas orientadas)${tema ? ` sobre a <strong>${tema}</strong>` : ''}.</p>`
  : `<p>Foram fiscalizados <strong>${veiculos.length}</strong> veículos e realizadas <strong>${pessoas}</strong> ações de educação sanitária (pessoas orientadas),
com inspeção de veículos, cargas, bagagens, pessoas e demais materiais sujeitos ao controle da Defesa Agropecuária.</p>`}
<p>Termos de Fiscalização de Barreira lavrados: ${lavrados.length ? `<strong>${esc(lavrados.join('; '))}</strong>` : '<strong>nenhum</strong>'}.</p>
<p>Foram prestadas orientações aos usuários quanto às normas fitossanitárias vigentes, especialmente sobre os riscos de introdução e
dispersão de pragas quarentenárias, com destaque para a <strong>${soPes && tema ? tema : 'Mosca-da-Carambola (<i>Bactrocera carambolae</i>)'}</strong>, e sobre
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

  /* QR code de autenticidade: verificar.html?t=<id do TF>, no mesmo endereço do app (GitHub Pages; nos testes, localhost). */
  const urlVerificar = id => new URL('verificar.html?t=' + encodeURIComponent(id), location.href).href;
  function qrSVG(txt) {
    if (typeof qrcode !== 'function') return '';                     // vendor/qrcode.js (offline, no cache do service worker)
    const q = qrcode(0, 'M'); q.addData(txt); q.make();
    return q.createSvgTag({ cellSize: 2, margin: 4, scalable: true, alt: 'QR code de verificação de autenticidade' });
  }
  /** Assinaturas do TF (imagem no lugar da linha) e recusa do fiscalizado (texto no lugar da assinatura). */
  function assinaturasTF(d, t, arquivos) {
    const ass = jsonPce(t.assinaturas, {}), recusa = Number(t.recusaAssinatura) === 1;
    d.querySelectorAll('[data-papel]').forEach(b => {
      const papel = b.getAttribute('data-papel'), area = b.querySelector('.ass-img');
      area.textContent = '';
      if (papel === 'fiscalizado' && recusa) {
        const r = d.createElement('div'); r.className = 'ass-recusa';
        const bb = d.createElement('b'); bb.textContent = 'Recusou-se a assinar';
        r.append(bb, d.createElement('br'), `Atestado por ${t.fiscal || 'servidor da ADAF'} em ${t.data ? dataBR(t.data) : ''} às ${t.hora || ''}`);
        area.append(r); b.classList.add('assinada'); return;
      }
      const src = imgSegura(arquivos[ass[papel]]);
      if (src) { const im = d.createElement('img'); im.src = src; im.alt = 'Assinatura'; area.append(im); b.classList.add('assinada'); }
    });
  }
  /** Anexo fotográfico: folha(s) no fim, depois das vias, com as fotos em grade (2 por linha) e legenda nº/data. */
  function anexoFotos(d, t, ids, arquivos, depoisDe) {
    const pg = d.createElement('div'); pg.className = 'a4 anexo';
    const via = d.createElement('div'); via.className = 'via'; via.textContent = 'Anexo';
    const h = d.createElement('h2'); h.textContent = `Anexo fotográfico — TF nº ${t.numeroTxt}`;
    const sub = d.createElement('p'); sub.className = 'anexo-sub'; sub.textContent = `${ids.length} foto(s) · ${t.data ? dataBR(t.data) : ''} ${t.hora || ''} · ${t.local || ''}`;
    const grade = d.createElement('div'); grade.className = 'anexo-fotos';
    ids.forEach((fid, i) => {
      const fig = d.createElement('figure'), src = imgSegura(arquivos[fid]);
      if (src) { const im = d.createElement('img'); im.src = src; im.alt = 'Foto ' + (i + 1); fig.append(im); }
      else { const sm = d.createElement('div'); sm.className = 'sem-foto'; sm.textContent = 'foto arquivada no Drive'; fig.append(sm); }
      const c = d.createElement('figcaption'); c.textContent = `Foto ${i + 1} de ${ids.length} — ${t.data ? dataBR(t.data) : ''}`; fig.append(c);
      grade.append(fig);
    });
    pg.append(via, h, sub, grade); depoisDe.after(pg);
    return pg;
  }

  async function tf(id) {
    const t = await Store.obter('tfs', id);
    if (!t) throw new Error('TF não encontrado.');
    const arquivos = typeof Anexos !== 'undefined' ? await Anexos.arquivosPorId(t) : {};
    const f = await abrirModelo('tf.html'), d = f.contentDocument;
    const set = (i, v) => { const e = d.getElementById(i); if (e) e.textContent = v == null ? '' : String(v); };
    const marca = b => (b ? '☑' : '☐');
    const grade = (id, linhas) => {                         // pequena tabela sem bordas (caixas de seleção)
      const tb = d.createElement('table'); tb.style.cssText = 'width:100%;border:none;font-size:12px;';
      linhas.forEach(l => { const tr = d.createElement('tr'); l.forEach(c => { const td = d.createElement('td'); td.style.cssText = `border:none;width:${c.w}%;`; td.textContent = c.t; tr.append(td); }); tb.append(tr); });
      const alvo = d.getElementById(id); alvo.textContent = ''; alvo.append(tb);
    };
    const docs = json(t.documentos, {}), prods = json(t.produtos, []);
    // origem/destino com a UF escolhida no TF ("ITACOATIARA/AM"); texto que já termina na sigla fica como está; TF antigo: só o texto
    const comUF = (txt, uf) => { const x = String(txt || '').trim(), u = String(uf || '').trim(); if (!u) return x; if (!x) return u;
      if (new RegExp(`(^|[\\s/\\-–,(])${u}\\)?$`, 'i').test(x)) return x; return u.length === 2 ? `${x}/${u}` : `${x} (${u})`; };
    set('tf_numero', t.numeroTxt); set('nome', t.nome); set('cpf', fmtDoc(t.doc)); set('rg', t.rg); set('endereco', t.endereco);
    set('relacao', t.relacao); set('municipio', t.municipio); set('uf', t.uf); set('telefone', t.telefone);
    grade('acao_realizada', [[{ w: 50, t: `${marca(t.inspecao)} Inspeção` }, { w: 50, t: `${marca(t.coleta)} Coleta de amostra${t.coleta && t.amostras ? ' – Qtd.: ' + t.amostras : ''}` }]]);
    grade('procedimentos', [
      [{ w: 33, t: `${marca(t.procedimento === 'liberacao')} Liberação` }, { w: 33, t: `${marca(t.procedimento === 'apreensao')} Apreensão p/ destruição` }, { w: 34, t: `${marca(t.procedimento === 'rechaco')} Rechaço` }],
      [{ w: 33, t: `${marca(t.fiel)} Fiel depositário` }, { w: 33, t: `${marca(t.auto)} Auto de Infração` }, { w: 34, t: `${marca(t.advertencia)} Advertência` }]]);
    set('local', t.local); set('data', t.data ? dataBR(t.data) : ''); set('hora', t.hora); set('placa', t.placa); set('origem', comUF(t.origem, t.ufOrigem)); set('destino', comUF(t.destino, t.ufDestino));
    const dc = (rot, k) => ({ w: 25, t: `${marca(docs[k])} ${rot} ${docs[k] || '____________'}` });
    grade('documentos', [[dc('NF Nº', 'nf'), dc('SIF Nº', 'sif'), dc('PTV Nº', 'ptv'), dc('SIE Nº', 'sie')], [dc('SIM Nº', 'sim'), dc('GTA Nº', 'gta'), dc('LACRE', 'lacre'), dc('OUTROS', 'outros')]]);
    set('produtos', prods.join('\n')); set('constatacao', t.constatacao); set('enquadramento', t.enquadramento);
    assinaturasTF(d, t, arquivos);
    const url = urlVerificar(t.id), svg = qrSVG(url), vf = d.getElementById('verif');
    if (svg && vf) {                                                // nas duas vias (clonadas abaixo)
      d.getElementById('verif_qr').innerHTML = svg; vf.setAttribute('data-url', url); vf.hidden = false;
      const u = new URL(url); set('verif_url', u.host + u.pathname); set('verif_cod', 'Código: ' + t.id);
    }

    const pg = d.querySelector('.a4'), vias = CONFIG.TF.vias;
    await caberEmUmaPagina(d, pg);                                  // antes de duplicar: as 2 vias saem iguais
    if (t.cancelado) { const b = d.createElement('div'); b.className = 'cancelado-faixa'; b.textContent = 'TF CANCELADO' + (t.motivoCancel ? ' – ' + t.motivoCancel : ''); pg.insertBefore(b, pg.children[1] || null); }
    const paginas = [pg];
    vias.slice(1).forEach(() => { const c = pg.cloneNode(true); paginas[paginas.length - 1].after(c); paginas.push(c); });
    paginas.forEach((p, i) => { p.querySelector('.via').textContent = vias[i] || ''; });
    const fotos = listaIds(t.fotos);
    if (fotos.length) anexoFotos(d, t, fotos, arquivos, paginas[paginas.length - 1]);   // uma vez só, depois das vias
    await Promise.all([...d.images].map(im => (im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; }))));
    const nomeArq = `TF ${String(t.numeroTxt).replace(/\//g, '-')} ${prods.map(p => String(p).split(' - ')[0]).join('_') || 'SEM_PRODUTO'} ${PROC_TITULO[t.procedimento] || 'OUTRO'}`;
    imprimir(f, nomeArq);
  }

  /**
   * Auto de Infração do TF (modelo ADAF, documentos/auto.html): dados do autuado, placa, origem e destino vêm do TF; os do auto
   * (ocorrência, condutor, RENAVAM, CEP, fatos, enquadramento, ciência, testemunhas, coordenadas) de autoDados. 3 vias, folhas separadas.
   */
  async function auto(id) {
    const t = await Store.obter('tfs', id);
    if (!t) throw new Error('TF não encontrado.');
    if (!(Number(t.auto) === 1 && Number(t.autoNumero) > 0)) throw new Error('Este TF não tem auto de infração.');
    const ai = jsonPce(t.autoDados, {}), f = await abrirModelo('auto.html'), d = f.contentDocument;
    const v = {}, comUF = (x, uf) => [String(x || '').trim(), String(uf || '').trim()].filter(Boolean).join('/');
    const [seq, ano, ...un] = String(t.autoNumeroTxt || '').split('-');
    Object.assign(v, { num_seq: seq, num_ano: ano, num_unidade: un.join('-'), tf_ref: `Lavrado com o TF nº ${t.numeroTxt}`,
      nome: t.nome, doc: fmtDoc(t.doc), nome_comercial: ai.nomeComercial, cadastro: ai.cadastro, condutor: ai.condutor, condutor_cpf: fmtDoc(ai.condutorCpf),
      endereco: t.endereco, municipio: t.municipio, uf: t.uf, cep: ai.cep, renavam: ai.renavam, placa: t.placa,
      procedencia: comUF(t.origem, t.ufOrigem), destino: comUF(t.destino, t.ufDestino), fatos: ai.fatos, enquadramento: ai.enquadramento,
      ciente_nome: ai.condutor || t.nome, ciente_cpf: fmtDoc(ai.condutor ? ai.condutorCpf : t.doc), ciente_ass: ai.ciencia === 'recusou' ? 'Recusou-se a assinar' : ai.ciencia === 'naoSabe' ? 'Não sabe ler e escrever' : '',
      local_data: `${t.local || ''}, ${t.data ? dataBR(t.data) : ''} ${t.hora || ''}`, autuante: t.fiscal });
    const la = parseFloat(ai.lat), lo = parseFloat(ai.lon);
    v.coordenadas = isNaN(la) || isNaN(lo) ? '' : `${gmsTermo(la, 'N', 'S')} / ${gmsTermo(lo, 'E', 'W')} (${la.toFixed(5)}, ${lo.toFixed(5)})`;
    ['t1', 't2'].forEach(k => { const x = ai[k] || {}; v[k + '_nome'] = x.nome; v[k + '_cpf'] = fmtDoc(x.cpf); v[k + '_endereco'] = x.endereco; v[k + '_telefone'] = x.telefone; });
    preencherCampos(d, v);
    const marcas = { oc_unidade: ai.ocorrencia === 'unidade', oc_barreira: (ai.ocorrencia || 'barreira') === 'barreira', oc_estabelecimento: ai.ocorrencia === 'estabelecimento',
      ci_autuado: ai.ciencia === 'autuado', ci_naosabe: ai.ciencia === 'naoSabe', ci_recusou: ai.ciencia === 'recusou' };
    d.querySelectorAll('[data-marca]').forEach(e => { e.textContent = marcas[e.getAttribute('data-marca')] ? '☑' : '☐'; });
    const pg = d.querySelector('.a4');
    await caberEmUmaPagina(d, pg, { campos: ['fatos', 'enquadramento'], primeiro: ['sem ajuste', () => {}] });
    if (t.cancelado) { const b = d.createElement('div'); b.className = 'cancelado-faixa'; b.textContent = 'TF CANCELADO' + (t.motivoCancel ? ' – ' + t.motivoCancel : ''); pg.insertBefore(b, pg.children[1] || null); }
    const paginas = [pg];
    [1, 2].forEach(() => { const c = pg.cloneNode(true); paginas[paginas.length - 1].after(c); paginas.push(c); });
    paginas.forEach((p, i) => p.querySelectorAll('[data-via]').forEach(e => e.classList.toggle('atual', Number(e.getAttribute('data-via')) === i)));
    await Promise.all([...d.images].map(im => (im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; }))));
    imprimir(f, `Auto de Infracao ${String(t.autoNumeroTxt).replace(/\//g, '-')}`);
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
  // Coloca a imagem da assinatura (se colhida na tela) sobre a linha correspondente. Quem não assina (ass[papel + 'Doc']):
  // a foto da pessoa segurando o documento de identificação vai no lugar da assinatura, com o aviso na linha.
  function montarAssinaturas(d, ass, arquivos) {
    d.querySelectorAll('.assinatura[data-papel]').forEach(b => {
      const papel = b.getAttribute('data-papel'), area = b.querySelector('.area'), docId = ass[papel + 'Doc'];
      area.textContent = '';
      if (docId) {
        area.classList.add('doc');
        const src = imgSegura(arquivos[docId]);
        if (src) { const im = d.createElement('img'); im.src = src; im.alt = 'Foto com documento de identificação'; area.append(im); }
        else area.textContent = '(foto arquivada no Drive)';
        b.querySelector('.linha').textContent = 'Não assina: identificado(a) por foto com documento de identificação oficial';
        return;
      }
      const src = imgSegura(arquivos[ass[papel]]);
      if (src) { const im = d.createElement('img'); im.src = src; im.alt = ''; area.append(im); }
    });
  }
  const listaIds = v => { const a = jsonPce(v, []); return Array.isArray(a) ? a.filter(x => typeof x === 'string' && x) : []; };

  /* Levantamento por praga/doença: cada card de praga vira um PDF (dados gerais + só as culturas e fotos daquela praga + assinaturas). */
  const RES_PCE = { detectada: 'Detectada', nao_detectada: 'Não detectada', suspeita: 'Suspeita' };
  const SEM_PRAGA = 'Sem praga informada';
  const objeto = x => x && typeof x === 'object';
  /**
   * Pragas avaliadas no registro: {pragas:[{praga, culturas:[{cultura, area, espLinha, espPlanta, resultado, coleta, tipoMaterial,
   * codigoAmostra, destinoAmostra, fotos:[ids]}]}], gerais:[ids], convertido}. Registro anterior (sem o campo "pragas"): cada cultura vira
   * um card da praga dela (resultado "detectada") ou de "Sem praga informada" (praga '', "não detectada"); as fotos, que eram do
   * levantamento inteiro, ficam em "gerais" (impressas em todos os PDFs). Fotos do registro fora de qualquer cultura também vão para "gerais".
   */
  function pceGrupos(reg) {
    const p = jsonPce(reg && reg.pragas, null), todas = listaIds(reg && reg.fotos);
    const novo = Array.isArray(p) && p.some(g => objeto(g) && Array.isArray(g.culturas) && g.culturas.length);
    let pragas;
    if (novo) {
      pragas = p.filter(g => objeto(g) && Array.isArray(g.culturas)).map(g => ({ praga: String(g.praga || '').trim(),
        culturas: g.culturas.filter(objeto).map(c => ({ ...c, cultura: String(c.cultura || ''), resultado: RES_PCE[c.resultado] ? c.resultado : 'nao_detectada',
          coleta: c.coleta === 'Sim' ? 'Sim' : 'Não', fotos: listaIds(c.fotos) })) })).filter(g => g.culturas.length);
    } else {
      const c0 = jsonPce(reg && reg.culturas, []), ix = new Map();
      pragas = [];
      (Array.isArray(c0) ? c0 : []).filter(c => objeto(c) && String(c.cultura || '').trim()).forEach(c => {
        const praga = String(c.praga || c.pragaAvaliada || '').trim();
        if (!ix.has(praga)) { ix.set(praga, { praga, culturas: [] }); pragas.push(ix.get(praga)); }
        const resultado = RES_PCE[c.resultado] ? c.resultado : (String(c.praga || '').trim() ? 'detectada' : 'nao_detectada');
        ix.get(praga).culturas.push({ ...c, praga: undefined, pragaAvaliada: undefined, resultado, coleta: c.coleta === 'Sim' ? 'Sim' : 'Não', fotos: [] });
      });
    }
    const usadas = new Set(pragas.flatMap(g => g.culturas.flatMap(c => c.fotos)));
    return { pragas, gerais: todas.filter(id => !usadas.has(id)), convertido: !novo };
  }
  const nomePraga = p => String(p || '').trim() || SEM_PRAGA;
  const resumoResultados = culturas => {
    const n = k => culturas.filter(c => c.resultado === k).length;
    return [['detectada', 'detectada(s)'], ['suspeita', 'suspeita(s)'], ['nao_detectada', 'não detectada(s)']].filter(([k]) => n(k)).map(([k, t]) => `${n(k)} ${t}`).join(', ');
  };
  /** Nome sugerido do PDF de uma praga: Levantamento_<produtor>_<praga>_<data>. */
  const nomePdfPce = (reg, praga) => nomeArquivo(`Levantamento_${reg.nome || 'SEM_NOME'}_${nomePraga(praga)}_${dataPce(reg.data).replace(/\//g, '-')}`);

  /**
   * Imprime a ficha de UMA praga/doença (índice `qual` em pceGrupos(reg).pragas; padrão 0).
   * modo 'arquivo': em vez de abrir a impressão, devolve o arquivo PDF gerado no aparelho (pdf.js), para enviar ao produtor.
   */
  async function pceLevantamento(reg, arquivosPorId, qual, modo) {
    if (!reg) throw new Error('Levantamento não encontrado.');
    const arquivos = arquivosPorId || {}, G = pceGrupos(reg), total = G.pragas.length;
    const i = Math.max(0, Math.min(total - 1, Number(qual) || 0));
    const grupo = G.pragas[i] || { praga: '', culturas: [] };
    const f = await abrirModelo('pce-levantamento.html'), d = f.contentDocument;
    const co = coordenadas(reg), culturas = grupo.culturas;
    const fotosCult = culturas.map(c => c.fotos), nFotos = fotosCult.reduce((s, l) => s + l.length, 0) + G.gerais.length;
    preencherCampos(d, Object.assign({}, reg, {
      data: dataPce(reg.data), doc: fmtDoc(reg.doc), coordDec: co.dec || 'Não capturadas', coordGms: co.gms,
      praga: nomePraga(grupo.praga), fichaN: total > 1 ? `${i + 1} de ${total} (uma ficha por praga/doença avaliada na visita)` : '1 de 1',
      resumoPraga: culturas.length ? `${culturas.length} cultura(s) avaliada(s): ${resumoResultados(culturas)}.` : 'Nenhuma cultura informada.',
      nFotos: nFotos ? `(${nFotos})` : '',
      localOrigem: `Local: ${String(reg.tipoLocal || '').trim() || 'não informado'} · Origem: ${String(reg.origemVisita || '').trim() || 'não informada'}`
    }));
    const corpo = d.getElementById('culturasCorpo');
    if (!culturas.length) corpo.innerHTML = '<tr><td colspan="10" class="vazio">Nenhuma cultura informada.</td></tr>';
    else corpo.innerHTML = culturas.map((c, k) => {
      const amostra = c.coleta === 'Sim';
      const td = v => `<td>${esc(v)}</td>`, esp = (v, x) => (!v ? v : x.espUnidade ? `${v} ${x.espUnidade}` : /^\d+([.,]\d+)?$/.test(v) ? `${v} m` : v);   // unidade junto do valor; registro anterior: o cabeçalho dizia m
      return `<tr><td class="n">${k + 1}</td>${td(c.cultura)}${td(c.area)}${td(esp(c.espLinha, c))}${td(esp(c.espPlanta, c))}<td class="res ${esc(c.resultado)}">${esc(RES_PCE[c.resultado])}</td>${td(c.coleta)}`
        + `${td(amostra ? c.tipoMaterial : '–')}${td(amostra ? c.codigoAmostra : '–')}${td(amostra ? c.destinoAmostra : '–')}</tr>`;
    }).join('');
    if (!String(reg.obs || '').trim()) d.getElementById('quadroObs').remove();
    // fotos agrupadas por cultura (legenda: cultura e nº da foto) + fotos gerais do registro anterior
    const alvo = d.getElementById('fotos');
    const grupoFotos = (titulo, sub, ids, legenda) => {
      const g = d.createElement('div'); g.className = 'grupo-fotos';
      const h = d.createElement('h4'); h.textContent = titulo; if (sub) { const s = d.createElement('small'); s.textContent = ' ' + sub; h.append(s); }
      const grade = d.createElement('div'); grade.className = 'fotos';
      montarFotos(d, grade, ids, arquivos);
      grade.querySelectorAll('figcaption').forEach((fc, k) => { fc.textContent = `${legenda} – foto ${k + 1}`; });
      g.append(h, grade); alvo.append(g);
    };
    culturas.forEach((c, k) => { if (c.fotos.length) grupoFotos(`Cultura ${k + 1}: ${c.cultura}`, `· ${RES_PCE[c.resultado]} · ${c.fotos.length} foto(s)`, c.fotos, c.cultura); });
    if (G.gerais.length) grupoFotos('Fotos gerais (registro anterior)', '· do levantamento inteiro, antes da separação por praga', G.gerais, 'Geral');
    if (!nFotos) { alvo.className = 'vazio'; alvo.textContent = 'Nenhuma foto registrada.'; }
    montarAssinaturas(d, jsonPce(reg.assinaturas, {}), arquivos);
    await Promise.all([...d.images].map(im => (im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; }))));
    if (modo === 'arquivo') return PDF.deFrame(f, nomePdfPce(reg, grupo.praga));
    imprimir(f, nomePdfPce(reg, grupo.praga));
  }

  /** Termo de Colheita (2 vias). modo 'arquivo': PDF gerado no aparelho só com a via do produtor (a última). */
  async function pceColheita(termo, arquivosPorId, modo) {
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
    const nomeT = nomeArquivo('Termo_Colheita_' + String(t.numeroTxt || t.numero || 'SEM_NUMERO').replace(/\//g, '_'));
    if (modo === 'arquivo') { paginas.slice(0, -1).forEach(p => p.remove()); return PDF.deFrame(f, nomeT + (paginas.length > 1 ? '_via_do_produtor' : '')); }
    imprimir(f, nomeT);
  }

  /* ---------- PCE: Cadastro de imóvel (monilíase), Cadastro de citros, Termo de Fiscalização do PCE e Relatório de atividades ----------
     Modelos declarativos (documentos/pce-termo.html, pce-termo-citros.html, pce-cadastro-moniliase.html, pce-cadastro-citros.html, pce-relatorio.html)
     preenchidos por documentos/pce-docs.js (o mesmo script do painel). modo 'arquivo': devolve o PDF gerado no aparelho (pdf.js) em vez de abrir a impressão.
     opcoes.extras: outras páginas no mesmo PDF (citros: Cadastro de citros + Termo de Fiscalização da visita). */
  const MODELO_MON = { termo: 'pce-termo.html', cadastro: 'pce-cadastro-moniliase.html', relatorio: 'pce-relatorio.html',
    termoCitros: 'pce-termo-citros.html', cadastroCitros: 'pce-cadastro-citros.html' };
  function nomePdfMon(tipo, r) {
    if (tipo === 'termo') return nomeArquivo('Termo_Fiscalizacao_' + (r.numeroTxt || 'SEM_NUMERO') + '_' + (r.nome || ''));
    if (tipo === 'termoCitros') return nomeArquivo('TF_Citros_' + (r.numeroTxt || 'SEM_NUMERO') + '_' + (r.nome || ''));
    if (tipo === 'cadastroCitros') return nomeArquivo('Cadastro_Citros_' + (r.numeroTxt || 'SEM_NUMERO') + '_' + (r.nome || ''));
    if (tipo === 'cadastro') return nomeArquivo('Cadastro_Moniliase_' + (r.numeroTxt || 'SEM_NUMERO') + '_' + (r.nome || ''));
    return nomeArquivo(`Relatorio_Atividades_${r.localArq || r.local || ''}_${dataPce(r.de).replace(/\//g, '-')}_a_${dataPce(r.ate).replace(/\//g, '-')}`);
  }
  async function pceMon(tipo, dados, opcoes, modo) {
    if (!dados) throw new Error('Registro não encontrado.');
    const f = await abrirModelo(MODELO_MON[tipo]), w = f.contentWindow;
    for (let i = 0; i < 50 && !w.PCEDocs; i++) await new Promise(r => setTimeout(r, 50));   // script do modelo ainda carregando
    if (!w.PCEDocs) { f.remove(); throw new Error('Modelo de impressão indisponível nesta versão do app.'); }
    await w.PCEDocs.montar(f.contentDocument, tipo, dados, opcoes || {});
    const nome = nomePdfMon(tipo, dados);
    if (modo === 'arquivo') return PDF.deFrame(f, nome);
    const folhas = f.contentDocument.querySelectorAll('.a4').length;      // antes de imprimir: no celular o iframe sai da página
    imprimir(f, nome);
    return folhas;
  }

  return { ficha, termo, tf, auto, limparImpressao, fiscaisDoTurno, pceLevantamento, pceGrupos, nomePdfPce, pceColheita, pceMon, nomePdfMon, ordenar, esc };
})();
