const amb = require('./lib/amb');
const A = require('./lib/pce-app');
// PCE: produtor que não assina — foto dele segurando um documento de identificação no lugar da assinatura, no passo 5 da Nova visita (tela,
// rascunho, Termo gravado, PDF do Termo, Drive, troca por assinatura). Sem a foto a visita não conclui. Dados fictícios.
let falhas = 0;
const ok = (c, m, x) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? ' -> ' + JSON.stringify(x) : '')); if (!c) falhas++; };
(async () => {
  const b = await amb.lancar();
  const p = await A.aparelho(b, 'Pessoa Ficticia Alfa', { assinaturaNaTela: true });   // assinatura na tela está desligada no app (CONFIG.assinaturaNaTela); o teste liga para seguir conferindo esse código
  const espera = async (cond, n = 40) => { for (let i = 0; i < n && !(await cond()); i++) await p.waitForTimeout(100); return cond(); };
  const toast = () => p.textContent('#toast');
  const arqsProd = () => p.evaluate(async () => (await Store.todos('arquivos')).filter(a => a.papel === 'produtor').map(a => ({ id: a.id, tipo: a.tipo, mime: a.mime, rotulo: a.rotulo })));
  await A.identificar(p);
  await A.novoProdutor(p, { doc: '52998224725', nome: 'Raimundo Nonato', propriedade: 'Sítio Esperança', codigo: 'PRP-NAS-1', municipio: 'Manaus', frutos: [{ cultura: 'Banana', area: 1 }] });
  // Banana: Fusariose, Moko e Sigatoka são opcionais e já vêm marcadas "Não tem"
  await A.visita(p, { frutos: ['Banana'], parar: 5 });

  ok(await p.isVisible('#pce-ass-produtor') && await p.isHidden('#pce-docprod') && !(await p.isChecked('#pce-naoassina')) && await p.isHidden('#vi-testemunhas'), 'passo 5 começa com a assinatura na tela; opção "não assina" desmarcada, sem testemunhas');
  await p.check('#pce-naoassina');
  ok(await p.isHidden('#pce-ass-produtor') && await p.isVisible('#pce-docprod') && await p.isVisible('#pce-docprod-btn') && await p.isVisible('#vi-testemunhas'), 'marcar "não assina": some a assinatura do produtor, aparecem a foto com documento e as testemunhas');
  await p.click('#vi-concluir');
  await p.waitForFunction(() => /foto/.test(document.querySelector('#toast').textContent));
  ok(/foto/.test(await toast()) && await p.locator('#pceVisitaForm').count() === 1 && await p.locator('#pce-visita-pronta').count() === 0, 'sem a foto não conclui a visita', await toast());
  await p.setInputFiles('#pce-docprod-in', [{ name: 'doc1.jpg', mimeType: 'image/jpeg', buffer: await A.imagem(p, 2000, 1500, '#258') }]);
  await p.waitForSelector('#pce-docprod-prev img');
  await p.setInputFiles('#pce-docprod-in', [{ name: 'doc2.jpg', mimeType: 'image/jpeg', buffer: await A.imagem(p, 1200, 1600, '#a52') }]);
  await p.waitForFunction(() => /Trocar a foto/.test(document.querySelector('#pce-docprod-btn').textContent));
  let ap = await arqsProd();
  ok(ap.length === 1 && ap[0].tipo === 'foto' && ap[0].mime === 'image/jpeg' && /documento de identificação/.test(ap[0].rotulo), 'trocar a foto: fica só a última (foto, JPEG, com rótulo)', ap);
  ok(/Trocar a foto/.test(await p.textContent('#pce-docprod-btn')), 'botão vira "Trocar a foto"');
  await p.locator('#pce-docprod').scrollIntoViewIfNeeded(); await p.screenshot({ path: amb.saida('pce_naoassina_form.png') });

  // rascunho: recarregar e continuar mantém a opção e a foto
  await espera(() => p.evaluate(async () => { const r = await Store.meta('pceVisitaRascunho'); return !!(r && r.naoAssina && r.ass && r.ass.produtorDoc); }));   // rascunho gravado com a foto
  await p.reload(); await p.waitForSelector('.modulo[data-v=pce]');
  await p.evaluate(async () => { const r = await Store.meta('pceVisitaRascunho'); go('pcevisita', { doc: r.doc, propId: r.propId }); }); await p.waitForSelector('#pceVisitaForm');
  ok(/Passo 5 de 5/.test(await p.textContent('.pce-passos')) && await p.isChecked('#pce-naoassina') && await p.locator('#pce-docprod-prev img').count() === 1 && await p.isHidden('#pce-ass-produtor'), 'rascunho retomado no passo 5: "não assina" marcado e a foto continua');

  // desmarcar volta a assinatura na tela e a foto sai; marcar de novo e refazer
  await p.uncheck('#pce-naoassina');
  await espera(async () => (await arqsProd()).length === 0);
  ok(await p.isVisible('#pce-ass-produtor') && await p.isHidden('#pce-docprod') && (await arqsProd()).length === 0, 'desmarcar: volta a assinatura na tela e a foto não enviada sai do aparelho');
  const cv = p.locator('#pce-ass-produtor'); await cv.scrollIntoViewIfNeeded(); const bb = await cv.boundingBox();
  ok(bb && bb.width > 200 && bb.height > 60, 'quadro de assinatura com tamanho normal', bb);
  await p.check('#pce-naoassina');
  await p.setInputFiles('#pce-docprod-in', [{ name: 'doc3.jpg', mimeType: 'image/jpeg', buffer: await A.imagem(p, 1600, 1200, '#258') }]);
  await p.waitForSelector('#pce-docprod-prev img'); ap = await arqsProd();
  ok(ap.length === 1, 'marcar de novo e tirar outra foto: uma foto só', ap);
  await p.fill('#vi-t1nome', 'Testemunha Ficticia Um'); await p.fill('#vi-t1doc', '111.444.777-35');

  await p.click('#vi-concluir'); await p.waitForSelector('#pce-visita-pronta', { timeout: 20000 });
  const termo = await p.evaluate(async () => (await Store.todos('termosPce')).find(t => t.visitaId));
  const ass = JSON.parse(termo.assinaturas);
  ok(ass.produtorDoc === ap[0].id && !ass.produtor, 'Termo salvo: assinaturas.produtorDoc = id da foto, sem assinatura do produtor', ass);
  ok(JSON.parse(termo.testemunhas).length >= 1 && /Testemunha Ficticia Um/.test(termo.testemunhas), 'testemunha informada no Termo', termo.testemunhas);

  const pr = await A.imprimir(p, '.pce-termo-pronto [data-mon=imprimir]');
  ok(pr.docImg && /Não assina: identificado\(a\) por foto com documento de identificação oficial/.test(pr.texto), 'PDF do Termo: foto com documento no lugar da assinatura do produtor, com o aviso', pr.texto.slice(-300));
  await A.salvarPdf(p, pr, 'pce-termo.html', 'pce_naoassina');

  await A.sync(p);
  const arqS = await A.aba('Arquivos'), tS = (await A.aba('TermosPCE')).find(t => t.id === termo.id);
  ok(arqS.some(a => a.id === ap[0].id && a.tipo === 'foto' && a.papel === 'produtor'), 'foto com documento enviada ao Drive (aba Arquivos: foto, papel produtor)');
  ok(tS && JSON.parse(tS.assinaturas).produtorDoc === ap[0].id, 'planilha: assinaturas do Termo com produtorDoc');
  ok(p.err.length === 0, 'sem erros de JavaScript', p.err);
  await b.close(); process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
