// Telas de acesso do app de campo: Entrar (matrícula e senha), Trocar senha e Sair. As regras da sessão (token, usuário, registros
// retidos) ficam no sync.js (Sync.entrar, trocarSenha, sair). Só reaproveita as classes do app.css (card, aviso, botao, dica, label).
// Usa funções do app.js em tempo de execução: $, esc, toast, go, VIEW, turnoAtual, pegarLocal.
const Login = (() => {
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const campoUrl = () => CONFIG.sync.url ? '' : '<label>Endereço do servidor<input id="eUrl" type="url" placeholder="https://script.google.com/macros/s/…/exec" required></label>';

  /** Acesso antigo (código de 6 dígitos): continua enquanto a gerência não o desliga. Some quando o servidor avisa que foi desligado. */
  const formCodigoAntigo = () => lsGet('gdv.semCodigo') ? '' : `<form class="card" id="fAtivar"><h3>Código de ativação (acesso antigo)</h3>
    <p>Só para quem ainda não tem matrícula e senha: digite o código de 6 dígitos enviado pelo administrador. A gerência vai desligar este acesso.</p>
    <label>Código de ativação<input id="aCod" inputmode="numeric" maxlength="7" autocomplete="off" placeholder="000 000" required></label>
    <button class="botao sec">Ativar</button></form>`;

  const formEntrar = revogado => `${revogado ? `<div class="card aviso" role="alert"><h3>Acesso revogado</h3>
      <p>O seu acesso a este aparelho foi encerrado. Entre de novo com a sua matrícula e a sua senha; se não conseguir, fale com a gerência. Os registros que não foram enviados continuam guardados aqui.</p></div>` : ''}
    <form class="card" id="fEntrar"><h3>Entrar</h3>
      <p>Entre com a sua matrícula e a sua senha. Só esta etapa exige internet; depois o aparelho fica lembrado até você sair.</p>
      ${campoUrl()}
      <label>Matrícula<input id="eMat" autocomplete="username" autocapitalize="off" spellcheck="false" required></label>
      <label>Senha<input id="eSenha" type="password" autocomplete="current-password" required></label>
      <button class="botao">Entrar</button></form>${formCodigoAntigo()}`;

  const formTrocarSenha = () => {
    const u = Sync.usuario();
    return `<form class="card aviso" id="fTrocarSenha"><h3>Trocar senha</h3>
      <p>${u ? `Matrícula <b>${esc(u.matricula)}</b>. ` : ''}Troque a senha provisória por uma senha só sua para liberar o app. Mínimo de 8 caracteres. Esta etapa exige internet.</p>
      <label>Senha atual<input id="tAtual" type="password" autocomplete="current-password" required></label>
      <label>Nova senha<input id="tNova" type="password" autocomplete="new-password" required></label>
      <label>Repita a nova senha<input id="tRepete" type="password" autocomplete="new-password" required></label>
      <button class="botao">Trocar senha</button>
      <button type="button" class="botao sec" data-sair="1">Sair e entrar com outra matrícula</button></form>`;
  };

  /** HTML da tela de acesso para a situação atual (Sync.situacao): Entrar (sem acesso ou acesso recusado) ou Trocar senha. */
  function tela() {
    const sit = Sync.situacao();
    if (sit === 'senha') return formTrocarSenha();
    return formEntrar(sit === 'entrar' && !!lsGet('gdv.revogado'));
  }

  /** Sai do app: tenta enviar o que está pendente; se sobrar, explica e pede confirmação (os pendentes continuam sendo de quem os fez). */
  async function sair(botao) {
    if (!navigator.onLine) return toast('Sem internet. Para sair é preciso estar conectado: depois de sair, só se volta a entrar com internet.', true);
    if (await turnoAtual()) return toast('Há um turno em andamento neste aparelho. Encerre o turno antes de sair.', true);
    const rotulo = botao ? botao.textContent : '';
    if (botao) { botao.disabled = true; botao.textContent = 'Verificando…'; }
    try {
      await Promise.race([Sync.sincronizar(), new Promise(ok => setTimeout(ok, 20000))]);   // tenta enviar antes de sair (sem esperar para sempre)
      const { total } = await Sync.pendentesMeus();
      const aviso = total
        ? `Há ${total} registro(s) seu(s) que ainda não foram enviados à planilha.\n\nSe você sair agora, eles ficam guardados neste aparelho, em seu nome, e só serão enviados quando você entrar de novo aqui, com a sua matrícula e com internet. Se outra pessoa entrar neste aparelho, eles não saem no nome dela.\n\nSair mesmo assim?`
        : 'Sair deste aparelho? Para voltar, será preciso entrar de novo com a matrícula e a senha, com internet.';
      if (!confirm(aviso)) return;
      await Sync.sair();
      toast('Você saiu.');
      go('modulos');
    } catch (err) { toast(err.message, true); }
    finally { if (botao && botao.isConnected) { botao.disabled = false; botao.textContent = rotulo; } }
  }

  const trabalhando = (e, texto) => {
    const b = e.target.querySelector('button:not([type=button])'), rotulo = b.textContent;
    b.disabled = true; b.textContent = texto;
    return () => { b.disabled = false; b.textContent = rotulo; };
  };

  document.addEventListener('submit', async e => {
    const id = e.target.id;
    if (id === 'fEntrar') {
      e.preventDefault();
      const fim = trabalhando(e, 'Entrando…');
      try {
        const j = await Sync.entrar($('#eMat').value, $('#eSenha').value, $('#eUrl') ? $('#eUrl').value : '');
        toast(Number(j.trocarSenha) === 1 ? 'Troque a senha provisória para continuar.' : `Você entrou como ${j.usuario.nome}.`);
        Sync.sincronizar(); go(VIEW === 'editar' ? 'home' : VIEW);
        pegarLocal();                                                      // pede a permissão de localização uma vez, logo na entrada
      } catch (err) { toast(err.message, true); fim(); const s = $('#eSenha'); if (s) { s.value = ''; s.focus(); } }
    } else if (id === 'fAtivar') {                                         // acesso antigo: código de ativação
      e.preventDefault();
      const fim = trabalhando(e, 'Ativando…');
      try {
        const nome = await Sync.ativar($('#aCod').value, $('#eUrl') ? $('#eUrl').value : '');
        toast(`Aparelho ativado para ${nome}.`); Sync.sincronizar(); go(VIEW === 'editar' ? 'home' : VIEW);
        pegarLocal();
      } catch (err) {
        toast(err.message, true);
        if (/entre com sua matr[ií]cula/i.test(err.message)) go(VIEW === 'editar' ? 'home' : VIEW);   // acesso antigo desligado: some o campo do código
        else fim();
      }
    } else if (id === 'fTrocarSenha') {
      e.preventDefault();
      const atual = $('#tAtual').value, nova = $('#tNova').value, repete = $('#tRepete').value;
      if (nova.length < 8) return toast('A nova senha precisa ter pelo menos 8 caracteres.', true);
      if (nova !== repete) return toast('A repetição não confere com a nova senha.', true);
      if (nova === atual) return toast('A nova senha não pode ser igual à atual.', true);
      const fim = trabalhando(e, 'Trocando…');
      try {
        await Sync.trocarSenha(atual, nova);
        toast('Senha trocada.'); Sync.sincronizar(); go(VIEW === 'editar' ? 'home' : VIEW);
      } catch (err) {
        toast(err.message, true); fim();
        if (/revogado|inv[aá]lido|entre com sua matr[ií]cula/i.test(err.message)) { Sync.marcarRevogado(true); go(VIEW); }   // o acesso caiu: volta para Entrar
      }
    }
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-sair]');
    if (b) sair(b);
  });

  return { tela, sair };
})();
