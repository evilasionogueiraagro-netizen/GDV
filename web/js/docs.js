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
  function imprimir(frame) {
    const w = frame.contentWindow;
    w.addEventListener('afterprint', () => frame.remove());
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
    imprimir(f);
    return veiculos.length > CONFIG.linhasFicha ? veiculos.length - CONFIG.linhasFicha : 0;
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
    const pessoas = veiculos.reduce((s, v) => s + (Number(v.pessoas) || 0), 0);
    const ini = turno.inicio || '__:__';
    const fim = turno.fim || '__:__';
    d.getElementById('descricaoTexto').innerHTML = `
<p>Aos <strong>${Number(dia)}</strong> dias do mês de <strong>${MESES[Number(mes) - 1]}</strong> de <strong>${esc(ano)}</strong>,
das <strong>${esc(ini)}</strong> horas às <strong>${esc(fim)}</strong> horas,
foram executadas as atividades de <strong>Fiscalização / Educação Sanitária Vegetal</strong>,
pelo(s) servidor(es) <strong>${esc(turno.fiscal)}</strong>, realizada no <strong>${esc(turno.local)}</strong>,
onde procedeu(ram) à inspeção de veículos, cargas, bagagens, pessoas e demais materiais sujeitos ao controle da Defesa Agropecuária.</p>
<p>Durante a ação foram abordados <strong>${veiculos.length}</strong> veículos, fiscalizadas <strong>${pessoas}</strong> pessoas.<br><br>
Termos de Barreira Lavrados:<br>____________________________________________________<br>____________________________________________________</p>
<p>Na inspeção foram verificadas cargas contendo produtos, subprodutos e outros artigos regulamentados, observando-se as exigências
previstas na legislação federal e estadual referente ao trânsito agropecuário e às medidas de defesa vegetal.</p>
<p>Foram prestadas orientações aos usuários quanto às normas fitossanitárias vigentes, especialmente sobre os riscos de introdução e
dispersão de pragas quarentenárias, com destaque para a <strong>Mosca-da-Carambola (Bactrocera carambolae)</strong>, bem como sobre
a obrigatoriedade da apresentação da documentação fitossanitária quando exigida.</p>
<p>Nada mais havendo a registrar, lavrou-se o presente Termo de Fiscalização para fins de comprovação da atividade desenvolvida.</p>`;
    imprimir(f);
  }

  return { ficha, termo, ordenar, esc };
})();
