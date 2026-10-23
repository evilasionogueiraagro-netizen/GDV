// Arquivos .gs do back (apps-script/), na ordem de carga: Code.gs primeiro, depois os demais em ordem alfabética.
// O workflow de publicação manda o Code.gs primeiro (filePushOrder); a ordem dos demais não importa.
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', '..', 'apps-script');
function arquivosGs() {
  const outros = fs.readdirSync(DIR).filter(f => f.endsWith('.gs') && f !== 'Code.gs').sort();
  return ['Code.gs'].concat(outros).map(f => path.join(DIR, f));
}
module.exports = { arquivosGs, DIR };
