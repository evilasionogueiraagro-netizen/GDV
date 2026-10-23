# Dashboard público (sem login)

Números agregados (`web/dashboard/`), visíveis para quem tem o link. Vem desligado: o gerente liga no painel. Veja: [painel](painel.md), [API](../API.md).

## Regras
- Ligar: painel → Dashboard público (só administrador): Publicar, blocos, períodos, modos e Salvar. Pré-visualizar (`?previa=1`) mostra o salvo mesmo desligado.
- Períodos: últimos 15 dias, últimos 30 dias (abre nele, se liberado), ano atual, ano anterior, desde o início e intervalo (de/até, entre 01/01/2000 e hoje).
- Atualiza a cada 5 min (1 min com "barreiras agora"). Cache de 5 min por período; no máximo 12 recálculos por minuto no total; acima disso, cópia de até 6 h.
- Com "Ocultar números pequenos" (padrão), 1 e 2 viram "<3" em levantamentos e detecções; células de calor com menos de 3 somem.
- Padrão da configuração: agregados ligados; `calor` e `aoVivo` desligados; `supressaoPequenos` ligada.
- "Barreiras agora" vem desligado: mostra só BVAs fixas abertas há menos de 12 h, pelo risco de ajudar quem quer evitar a fiscalização.
- Sem servidor, mostra o último dado guardado no navegador, com a data.

## LGPD
- Resposta só com contagens e somas. Nunca nomes, CPF/CNPJ, placas, propriedades, servidores, fiscais, telefones, endereços, fotos, observações ou coordenadas de levantamento e de propriedade.
- Barreiras no mapa: coordenada do turno arredondada a 0,1° (~11 km). Postos volantes nunca são ponto, e o endereço deles não sai.
- BVAs fixas: média das coordenadas de início dos turnos (3 casas, ~100 m). Calor em células de 0,1°, não no centroide do município.

## Código
- `web/dashboard/`: `index.html`, `js/dashboard.js`, `css/dashboard.css`.
- `Code.gs`: action `publicoDados` (`publicoDados_`), `painelPublicoConfig`, `painelPublicoSalvar`; propriedades `PUBLICO_CONFIG` e `PUBLICO_URL`.
- Publicar: automático pelo merge na `main` ([PUBLICACAO-BACK](../PUBLICACAO-BACK.md)). Depois, ligar pelo painel.
