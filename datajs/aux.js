

var CAMPO = {
  "area": 0,"country": 1,"city": 2,"tipo": 3,"name": 4,
  "varios": 5,"roles": 6,"urlfb": 7,"idfoto": 8,"id": 9
};

// varios (gramática arriba) -> {nom: [valores]}; las listas {v1¬v2}, en sus
// valores; los subcampos sin nombre válido no se leen. Igual que leeVarios()
// de import/campos.py.
// lid: el id de la sala de loc; oid: los ids de las personas o grupos de org con ficha (el join, junto al nombre)
// ext: la fecha real de un evento extrapolado (su fec, llevada al año siguiente: "no verificado"; la pone el join)
const VARIOS=['lat','lon','dir','loc','lid','org','oid','ar1','ai1','ar2','ai2','www','vid','ins','tel','wec','kak','ema','prv','txt','fec','ext'];
const LISTAS=['org','oid','www','vid','ins','tel','wec','kak','ema','prv','txt'];
// (cada vez un objeto nuevo, que se puede cambiar; el texto se analiza una vez, _VARIOS: como leeVarios de import/campos.py.
// tangoglobe lo pide unas 25 veces por fila; 2026-11-10)
const _VARIOS=new Map();
function leeVarios(fila){
  const t=String(fila[CAMPO.varios]||'');
  let p=_VARIOS.get(t);
  if (!p){
    const d={};
    for (const s of t.split('#')){
      const m=s.trim().match(/^([a-z]{2}[a-z0-9]):(.*)$/s);   // (ar1, ai1...)
      if (!m || !VARIOS.includes(m[1])){continue}
      const val=m[2].trim(), lista=LISTAS.includes(m[1]) && val.startsWith('{') && val.endsWith('}');
      for (const v of (lista ? val.slice(1,-1).split('¬') : [val]).map(x => x.trim())){
        if (v && v!='-'){(d[m[1]]=d[m[1]]||[]).push(v)}
      }
    }
    p=Object.entries(d);
    _VARIOS.set(t,p);
  }
  const d={};
  for (const [k,vs] of p){d[k]=vs.slice()}
  return d;
}
// un texto sin acentos y en minúsculas, para buscar y comparar (tangoglobe, el admin de review)
const sinAcentos = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// fecha de un evento (subcampo fec de varios), '' si no tiene. Igual que
// fechaDe() de import/campos.py.
const ES_FECHA=/^(EVT|REG)\./;
function fechaDe(fila){
  const f=(leeVarios(fila).fec||[''])[0];
  return ES_FECHA.test(f) ? f : '';
}
// fecha regular REG (gramática arriba; igual que leeReg de import/campos.py):
// {frec: D|W|M|Q, dias: [0-6] ([] sin día fijo), semanas: ['1'..'5','L'], hora; Q: ancla 'AAAA-MM-DD'};
// null si no la sigue. Q: cada 2 semanas, REG.Q.<día>.<hora>.<AAAAMMDD> (la fecha, una en que sale; 2026-11-01)
function leeReg(f){
  const p=String(f||'').split('.');
  const horaOk=h => /^(\d{4}(-\d{4})?)?$/.test(h);
  if (p[0]!='REG'){return null}
  if (p[1]=='D' && p.length==3 && horaOk(p[2])){return {frec:'D', dias:[0,1,2,3,4,5,6], semanas:[], hora:p[2]}}
  if (p[1]=='W' && p.length==4 && horaOk(p[3]) && /^(\?|[0-6](-[0-6])*)$/.test(p[2])){
    return {frec:'W', dias:p[2]=='?' ? [] : p[2].split('-').map(Number), semanas:[], hora:p[3]};
  }
  // (REG.M.<día>.?.<hora>: mensual sin saber qué semana del mes; semanas []: no sale ningún día concreto; 2026-11-02)
  if (p[1]=='M' && p.length==5 && horaOk(p[4]) && /^[0-6]$/.test(p[2]) && /^(\?|([1-5]|L)(-([1-5]|L))*)$/.test(p[3])){
    return {frec:'M', dias:[Number(p[2])], semanas:p[3]=='?' ? [] : p[3].split('-'), hora:p[4]};
  }
  if (p[1]=='Q' && p.length==5 && horaOk(p[3]) && /^[0-6]$/.test(p[2]) && /^\d{8}$/.test(p[4])){
    const ancla=p[4].slice(0,4)+'-'+p[4].slice(4,6)+'-'+p[4].slice(6);
    const d=new Date(ancla+'T00:00:00Z');
    if (isNaN(d) || d.getUTCDay()!=Number(p[2])){return null}     // la fecha, en su día de la semana
    return {frec:'Q', dias:[Number(p[2])], semanas:[], hora:p[3], ancla:ancla};
  }
  return null;
}
// la fecha REG f (texto o leeReg) sale el día d (Date, a medianoche local); como saleReg de import/campos.py
function saleReg(f, d){
  const r=typeof f=='string' ? leeReg(f) : f;
  if (!r || !r.dias.includes(d.getDay())){return false}
  if (r.frec=='M'){
    const sem=String(Math.floor((d.getDate()-1)/7)+1);
    const ult=new Date(d.getFullYear(), d.getMonth(), d.getDate()+7).getMonth()!=d.getMonth();
    return r.semanas.includes(sem) || (r.semanas.includes('L') && ult);
  }
  if (r.frec=='Q'){
    const dias=Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())-Date.parse(r.ancla+'T00:00:00Z'))/864e5);
    return ((dias%14)+14)%14==0;
  }
  return true;
}
// semanas del mes de una REG mensual, en texto: ['2','4'] -> '2nd,4th'; L -> 'last'
// fecha EVT -> {anyo, mes (0-11), ini, fin}: sus días (Date; fin, el final del último; días como 24-7, hasta el mes siguiente). Sin
// día (?): ini null y fin, el final del mes. null si no es EVT. Como leeEvt() de import/campos.py
function leeEvt(f){
  const m=String(f||'').match(/^EVT\.(\d{1,2})\.[A-Z]{3}\.(\?|\d{1,2}(?:-\d{1,2})?)\.(\d{4})/);
  if (!m) return null;
  const mes=+m[1], anyo=+m[3];
  if (m[2]=='?') return {anyo, mes, ini: null, fin: new Date(anyo, mes+1, 0, 23, 59, 59)};
  const [d1,d2]=m[2].split('-').map(Number), ultimo=d2===undefined ? d1 : d2;
  return {anyo, mes, ini: new Date(anyo, mes, d1), fin: new Date(anyo, ultimo<d1 ? mes+1 : mes, ultimo, 23, 59, 59)};
}
// un evento ya empezado que aún no ha terminado
function enCursoEvt(f){
  const e=leeEvt(f), ahora=new Date();
  return !!(e && e.ini && e.ini<=ahora && ahora<=e.fin);
}
// el nombre de su sala; '' si no se sabe (loc ?)
function locDe(fila){
  const l=(leeVarios(fila).loc||[''])[0];
  return l=='?' ? '' : l;
}

function semanasReg(ss){
  const ord={'1':'1st','2':'2nd','3':'3rd','4':'4th','5':'5th','L':'last'};
  return ss.map(s => ord[s]||s).join(',');
}
// texto corto de una fecha REG: 'daily 2000-2300', 'mon,wed 2000', 'fri 2nd,4th 2100', 'sat monthly (week?) 2100', 'every other wed 2000', '? 2100'
function textoReg(f){
  const r=leeReg(f);
  if (!r){return String(f||'')}
  const dias=['sun','mon','tue','wed','thu','fri','sat'];
  const cuando=r.frec=='D' ? 'daily' : (r.frec=='Q' ? 'every other ' : '')+(r.dias.length ? r.dias.map(d => dias[d]).join(',') : '?')
    +(r.frec=='M' ? ' '+(r.semanas.length ? semanasReg(r.semanas) : 'monthly (week?)') : '');
  return cuando+(r.hora ? ' '+r.hora : '');
}

// las agendas de donde salen los datos (las fuentes de import/src.event, su "url:"): la página de una milonga en ellas
// no es la web del evento y no se enseña (2026-11-01, el usuario: "en el detalle no pongas la fuente de datos, sino
// la web del evento"); su portada sí (tangobratislava.com/ es la web de Tango Bratislava)
const AGENDAS_WEB=/^https?:\/\/(www\.)?(agendadeltango\.com|canarytango\.com|hoy-milonga\.com|ktnow\.kr|malagamilongas\.com|tango-argentin\.fr|tangobratislava\.com|tangocat\.net|tangoenbarcelona\.es|tango-international\.eu|tangolx\.com|tangomarathons\.com|tangotoday\.net|tangovalencia\.com|tangoweekend\.org)\/[^?#]*[^\/?#]/i;
function esAgendaWeb(u){ return AGENDAS_WEB.test(String(u||'')); }

// ═══════════════ UTILIDADES DE LAS PÁGINAS ═══════════════
// (app.tw/index.htm, app.tg/index.htm y cmd.review/admin.htm)

// true si el tipo (campo 4) es de un evento, venue, milonga, academy o list (su primera
// palabra); si no, es una persona. Única regla para distinguirlos en las
// páginas (en Python: esTipoEvento de import/pagefb.py). list: fuente de
// información; las mundiales tienen área 'World', país 'world' y ciudad '*world'
function esEvento(tipo){
  return ['event','venue','milonga','practica','academy','list'].includes(String(tipo).trim().split(' ')[0]);
}

// los datos (2026-10-24, un solo fichero, eventos y personas juntos): en local
// datajs/privatetango.out.js (todo, privado: var privatetango); en GitHub, publictango (lo
// que se publica, cifrado: cmd.publicar/push.sh), que llega después, al descifrarlo: si se
// piden antes, salen vacíos y se rehacen cuando llegan (la memoria va con el array de datos)
let _tango = null;
function datosTango(){
  const t = typeof privatetango != 'undefined' ? privatetango : typeof publictango != 'undefined' ? publictango : [];
  if (!_tango || _tango.todas !== t){
    _tango = {todas: t, eventos: t.filter(c => esEvento(c[CAMPO.tipo])), personas: t.filter(c => !esEvento(c[CAMPO.tipo]))};
  }
  return _tango;
}
const eventosTango = () => datosTango().eventos;
const personasTango = () => datosTango().personas;
const esPrivado = () => typeof privatetango != 'undefined';
// el día del join (var privatetangoFecha o publictangoFecha): '' si no lo trae
const fechaTango = () => typeof privatetangoFecha != 'undefined' ? privatetangoFecha : typeof publictangoFecha != 'undefined' ? publictangoFecha : '';

// id del registro (campo id: 8 letras al azar, fijo; lo pone el join, como esId de
// import/comun.py); '' si la fila no lo tiene
function idDe(fila){
  const x = String(fila[CAMPO.id] || '').trim();
  return /^[A-Za-z]{8}$/.test(x) ? x : '';
}

// url para comparar (la misma página aunque se escriba distinto): sin https://,
// www., m., web., mayúsculas, #ancla ni / final. Parámetros: en Facebook solo
// id= y fbid=, y facebook.com/<id>, /p/<nombre>-<id> y /people/<nombre>/<id> como
// profile.php?id=<id>; en las demás webs, todos salvo los de seguimiento (utm_,
// fbclid...): en YouTube watch?v= es otro vídeo. Igual que claveUrl de
// import/comun.py
const SEGUIMIENTO=/^(utm_\w+|fbclid|gclid|mibextid|acontext|__tn__|__cft__\[?\d*\]?|rdid|ref|ref_src|si|igsh|share_url)=/;
function claveUrl(u){
  u=String(u||'').trim().toLowerCase();
  if (u=='' || u=='-'){return ''}
  u=u.replace(/^https?:\/\//,'').replace(/^(www\.|m\.|web\.)/,'').split('#')[0];
  const i=u.indexOf('?');
  const ruta=(i<0 ? u : u.slice(0,i)).replace(/\/+$/,''), q=i<0 ? '' : u.slice(i+1);
  // facebook.com/<id>, /p/<nombre>-<id>, /people/<nombre>/<id>: la misma que profile.php?id=<id>
  const fid=ruta.match(/^(?:facebook|fb)\.com\/(?:p\/[^\/]*-|people\/[^\/]+\/)?(\d{6,})$/);
  if (fid){return 'facebook.com/profile.php?id='+fid[1]}
  // un evento: /events/<id>, también /events/s/<nombre>/<id> y /events/<sala>/<nombre>/<id> (como comun.claveUrl)
  const fev=ruta.match(/^(?:facebook|fb)\.com\/events\/(?:[^?]*\/)?(\d{6,})$/);
  if (fev){return 'facebook.com/events/'+fev[1]}
  const ps=/^(facebook\.com|fb\.com)/.test(ruta)
    ? q.split('&').filter(p => /^(id|fbid)=\d+$|^set=[\w.]+$/.test(p)).slice(0,1)   // set=: el álbum (media/set)
    : q.split('&').filter(p => p && !SEGUIMIENTO.test(p));
  return ruta+(ps.length ? '?'+ps.join('&') : '');
}

// foto de un id (campo 9, idfoto): la primera que haya en import/src.comun/fotos/foto1,2,8/
// (8: las imágenes generadas, la última; eventos 2,1,8: la portada antes; salvo los ids de fotosPerfil, FOTO_PERFIL de adhoc.js: el perfil
// también en sus eventos), según fotosId de datajs/fotoid.js
// (se carga después de aux.js: se lee en la primera llamada).
// {carpeta, fichero: '<id>.<ext>'}; null si no tiene
let fotoSetsCache=null;
function fotoDeId(idfoto,evento){
  if (!idfoto || idfoto=='-'){return null}       // "-": sin foto
  if (!fotoSetsCache){
    fotoSetsCache=Object.fromEntries(['1','2','8'].map(c =>
      [c,new Set(typeof fotosId!='undefined' && fotosId[c] ? fotosId[c] : [])]));
  }
  const perfil=typeof fotosPerfil!='undefined' && fotosPerfil.includes(idfoto);
  for (const c of (evento && !perfil ? ['2','1','8'] : ['1','2','8']))
    for (const e of ['jpg','webp','png'])
      if (fotoSetsCache[c].has(idfoto+'.'+e)){return {carpeta:c, fichero:idfoto+'.'+e}}
  return null;
}

// baja texto como un fichero llamado nombre (tipo: application/json, text/plain...)
function bajaFichero(nombre,texto,tipo){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([texto],{type:tipo}));
  a.download=nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href),1000);
}

// ════════════════════════════ TIPOS ════════════════════════════

/*
TIPOS: tipos de evento (campo tiporol de las filas de eventos) con su color en
index.htm (app mundo) y su descripción (desc: solo documenta, nadie la lee). Es
la lista de tipos válidos: comun.py pone el más próximo a uno que no esté
(tipoProximo) y descarta la fila si no se parece a ninguno. El orden es el de
index.htm.
*/

// roles: los roles de evento (ROLES_EVENTO) que lleva todo evento de ese tipo (paso1 rolesDeTipo);
// los de un event (sin definir), solo a mano (el manual, resinput entrada.txt)
var TIPOS = {
  "milonga":            {"color": "#adf5d7", "roles": "mlg",     "desc": "milonga: regular (REG) o de un día (EVT: rol iti, itinerante o especial; con show, rol shw)"},
  "practica":           {"color": "#d5f5c8", "roles": "prc",     "desc": "práctica: milonga relajada para practicar (regular)"},
  "venue":              {"color": "#fae3ad", "roles": "",        "desc": "sala, local"},
  "event":              {"color": "#e5f9ff", "roles": "",        "desc": "sin definir: no se sabe cuál (se decide más adelante)"},
  "event party":        {"color": "#d7f6fa", "roles": "mlg",     "desc": "fiesta: dos días o menos"},
  "event festival":     {"color": "#c3e8ff", "roles": "mlg,wks,shw", "desc": "festival: con artistas (shows, clases)"},
  "event encuentro":    {"color": "#7db1ff", "roles": "mlg,enc",     "desc": "encuentro milonguero"},
  "event marathon":     {"color": "#acccfc", "roles": "mlg,mar",     "desc": "maratón: sin artistas, solo baile"},
  "event camp":         {"color": "#9fd8cb", "roles": "mlg,wks", "desc": "camp: campamento de varios días o semanas, con clases y milongas"},
  "event championship": {"color": "#ff6961", "roles": "cup",     "desc": "campeonato, competición"},
  "event seminar":      {"color": "#d0e0f0", "roles": "wks",     "desc": "seminario: una sola pareja de profesores, con clases"},
  "academy":            {"color": "#f3d4ff", "roles": "",     "desc": "academia, escuela, estudio"},
  "list":               {"color": "#e0d4f7", "roles": "",        "desc": "lista o agenda de una zona"}
};

// tipos de people (campo 4 de people, desde 2026-10-19; antes los roles cmt y bed), uno solo:
// person un tanguero (con sus roles), group un grupo o comunidad de tango (sin roles) o couple
// una pareja de baile, una ficha para los dos (con sus roles; sus bailarines: ar1 y ar2, sus
// ids: ai1 y ai2; 2026-11-03, antes el rol cpl: el join lo cambia).
// (hasta 2026-10-19, person se llamaba people y group, community; hasta 2026-10-29 había
// también los tipos shop y hostel, ahora los roles shp y hst: el join los cambia)
// publico: entra en publictango aunque no tenga roles públicos; conRoles: lleva roles (ROLES)
var TIPOS_PERSONA = {
  "person":    {"publico": 0, "conRoles": 1, "desc": "un tanguero",                "color": "#f0f0f0"},
  "group":     {"publico": 1, "conRoles": 0, "desc": "grupo o comunidad de tango", "color": "#c8f0f0"},
  "couple":    {"publico": 1, "conRoles": 1, "desc": "pareja de baile: una ficha para los dos (sus bailarines: ar1 y ar2, sus ids: ai1 y ai2)", "color": "#ffd6e7"}
};

// ════════════════════════════ ROLES ════════════════════════════


var ROLES = {
  "art": {"publico": 1,"desc": "artista",                                  "nombre": "artista",     "color": "#e4ddff","colorPeople": "#e4adff"},
  "p26": {"publico": 1,"desc": "PTC 2026",                                 "nombre": "ptc26",       "color": "#ffe0b3","colorPeople": "#ffe0b3"},
  "p25": {"publico": 1,"desc": "PTC 2025",                                 "nombre": "ptc25",       "color": "#ffe9cc","colorPeople": "#ffe9cc"},
  "p24": {"publico": 1,"desc": "PTC 2024",                                 "nombre": "ptc24",       "color": "#fff2e0","colorPeople": "#fff2e0"},
  "org": {"publico": 1,"desc": "organiza",                                 "nombre": "organiza",    "color": "#ebc4ff","colorPeople": "#ccffcc"},
  "djm": {"publico": 1,"desc": "pasa música",                              "nombre": "tangoDJ",     "color": "#db94ff","colorPeople": "#db94ff"},
  "wrt": {"publico": 1,"desc": "crea contenido: artículos, vídeos, fotos", "nombre": "writer",      "color": "#f9fea0","colorPeople": "#F9EE90"},
  "tch": {"publico": 1,"desc": "profesor que da clases",                   "nombre": "teacher",     "color": "#b3f0e0","colorPeople": "#b3f0e0"},
  "shp": {"publico": 1,"desc": "tienda",                                   "nombre": "shop",        "color": "#d4f5a3","colorPeople": "#d4f5a3"},
  "hst": {"publico": 1,"desc": "alojamiento",                              "nombre": "hostel",      "color": "#d9f2c4","colorPeople": "#d9f2c4"},
};

// ROLES_EQUIVALENCIAS (roles antiguos -> rol de ROLES): en datajs/alias.js

// Roles de un evento (campo roles de un evento, separados por coma como los de una persona): lo
// que trae (un festival: wks,mlg,shw...); de ellos se podrá deducir su tipo
var ROLES_EVENTO = {
  "mlg": {"desc": "milonga",                    "nombre": "milonga"},
  "prc": {"desc": "práctica",                   "nombre": "practica"},
  "enc": {"desc": "milongas de encuentro",      "nombre": "encuentro"},
  "mar": {"desc": "milongas de maratón",        "nombre": "marathon"},
  "wks": {"desc": "workshops, clases",          "nombre": "workshop"},
  "pvt": {"desc": "clases privadas",            "nombre": "private"},
  "shw": {"desc": "show",                       "nombre": "show"},
  "cup": {"desc": "competición, campeonato, cup", "nombre": "championship"},
  "liv": {"desc": "música en vivo, orquesta",   "nombre": "live"},
  "iti": {"desc": "milonga de un día: itinerante o especial (no es regular; suele coincidir con una regular)", "nombre": "itinerant"}
};


// ══════════════════════════ FAVORITOS ══════════════════════════

/*

favoritos: estado de los eventos favoritos (lo lee index.htm con ?fav o ?fav2)

Cada fila: [nombre, ciudad, estado]. Es de un evento de su misma ciudad si
todas las palabras de su nombre están en el nombre del evento, así que el
nombre puede estar incompleto. Se compara normalizado: da igual mayúsculas,
tildes y lo que va entre (paréntesis).

Estados: home 🛖, go ⭐, think ❓ (con ?fav2,"mi agenda", solo home y go)

paso1 avisa en join.log ([FAV]) de las entradas que no encuentran evento,
de las que encuentran varios y de los estados que no son estos.

*/


// los datos, en GitHub cifrados (cmd.publicar/cifra.py: datajs/datos.cifrados.js, AES-GCM): se descifran con la clave de
// la url, tangoworld/#k=<clave> o tangoglobe/#k=<clave> (el # no llega al servidor); en local, sin cifrar. aviso(texto):
// cómo decir que falta la clave. true si hay datos
async function descifra(aviso){
  if (typeof DATOS_CIFRADOS == 'undefined') return true;
  const k = new URLSearchParams(location.hash.slice(1)).get('k') || '';
  try {
    const bytes = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));
    const datos = bytes(DATOS_CIFRADOS);
    const clave = await crypto.subtle.importKey('raw', bytes(k.replace(/-/g, '+').replace(/_/g, '/')), 'AES-GCM', false, ['decrypt']);
    const texto = await crypto.subtle.decrypt({name: 'AES-GCM', iv: datos.slice(0, 12)}, clave, datos.slice(12));
    (0, eval)(new TextDecoder().decode(texto));   // var publictango=[...]
    return true;
  } catch (e){
    aviso(k ? 'la clave de la url no es válida' : 'falta la clave en la url (#k=...)');
    return false;
  }
}
