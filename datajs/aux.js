

var CAMPO = {
  "area": 0,"country": 1,"city": 2,"tipo": 3,"name": 4,
  "varios": 5,"roles": 6,"urlfb": 7,"idfoto": 8,"id": 9
};

// varios (gramática arriba) -> {nom: [valores]}; las listas {v1¬v2}, en sus
// valores; los subcampos sin nombre válido no se leen. Igual que lee_varios()
// de import/campos.py.
const VARIOS=['lat','lon','dir','loc','org','www','vid','ins','tel','wec','kak','ema','prv','txt','fec'];
const LISTAS=['org','www','vid','ins','tel','wec','kak','ema','prv','txt'];
function leeVarios(fila){
  const d={};
  for (const s of String(fila[CAMPO.varios]||'').split('#')){
    const m=s.trim().match(/^([a-z]{3}):(.*)$/s);
    if (!m || !VARIOS.includes(m[1])){continue}
    const val=m[2].trim(), lista=LISTAS.includes(m[1]) && val.startsWith('{') && val.endsWith('}');
    for (const v of (lista ? val.slice(1,-1).split('¬') : [val]).map(x => x.trim())){
      if (v && v!='-'){(d[m[1]]=d[m[1]]||[]).push(v)}
    }
  }
  return d;
}

// fecha de un evento (subcampo fec de varios), '' si no tiene. Igual que
// fecha_de() de import/campos.py.
const ES_FECHA=/^(EVT|REG)\./;
function fechaDe(fila){
  const f=(leeVarios(fila).fec||[''])[0];
  return ES_FECHA.test(f) ? f : '';
}

// fecha regular REG (gramática arriba; igual que lee_reg de import/campos.py):
// {frec: D|W|M, dias: [0-6] ([] sin día fijo), semanas: ['1'..'5','L'], hora};
// null si no la sigue
function leeReg(f){
  const p=String(f||'').split('.');
  const horaOk=h => /^(\d{4}(-\d{4})?)?$/.test(h);
  if (p[0]!='REG'){return null}
  if (p[1]=='D' && p.length==3 && horaOk(p[2])){return {frec:'D', dias:[0,1,2,3,4,5,6], semanas:[], hora:p[2]}}
  if (p[1]=='W' && p.length==4 && horaOk(p[3]) && /^(\?|[0-6](-[0-6])*)$/.test(p[2])){
    return {frec:'W', dias:p[2]=='?' ? [] : p[2].split('-').map(Number), semanas:[], hora:p[3]};
  }
  if (p[1]=='M' && p.length==5 && horaOk(p[4]) && /^[0-6]$/.test(p[2]) && /^([1-5]|L)(-([1-5]|L))*$/.test(p[3])){
    return {frec:'M', dias:[Number(p[2])], semanas:p[3].split('-'), hora:p[4]};
  }
  return null;
}
// semanas del mes de una REG mensual, en texto: ['2','4'] -> '2nd,4th'; L -> 'last'
function semanasReg(ss){
  const ord={'1':'1st','2':'2nd','3':'3rd','4':'4th','5':'5th','L':'last'};
  return ss.map(s => ord[s]||s).join(',');
}
// texto corto de una fecha REG: 'daily 2000-2300', 'mon,wed 2000', 'fri 2nd,4th 2100', '? 2100'
function textoReg(f){
  const r=leeReg(f);
  if (!r){return String(f||'')}
  const dias=['sun','mon','tue','wed','thu','fri','sat'];
  const cuando=r.frec=='D' ? 'daily' : (r.dias.length ? r.dias.map(d => dias[d]).join(',') : '?')
    +(r.frec=='M' ? ' '+semanasReg(r.semanas) : '');
  return cuando+(r.hora ? ' '+r.hora : '');
}

// ═══════════════ UTILIDADES DE LAS PÁGINAS ═══════════════
// (app.tw/index.htm, app.tg/index.htm y app.tg/admin.htm)

// true si el tipo (campo 4) es de un evento, venue, milonga, academy o list (su primera
// palabra); si no, es una persona. Única regla para distinguirlos en las
// páginas (en Python: es_tipo_evento de import/pagefb.py). list: fuente de
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

// id del registro (campo id: 8 letras al azar, fijo; lo pone el join, como es_id de
// import/comun.py); '' si la fila no lo tiene
function idDe(fila){
  const x = String(fila[CAMPO.id] || '').trim();
  return /^[A-Za-z]{8}$/.test(x) ? x : '';
}

// url para comparar (la misma página aunque se escriba distinto): sin https://,
// www., m., web., mayúsculas, #ancla ni / final. Parámetros: en Facebook solo
// id= y fbid=, y facebook.com/<id>, /p/<nombre>-<id> y /people/<nombre>/<id> como
// profile.php?id=<id>; en las demás webs, todos salvo los de seguimiento (utm_,
// fbclid...): en YouTube watch?v= es otro vídeo. Igual que clave_url de
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
  // un evento: /events/<id>, también /events/s/<nombre>/<id> y /events/<sala>/<nombre>/<id> (como comun.clave_url)
  const fev=ruta.match(/^(?:facebook|fb)\.com\/events\/(?:[^?]*\/)?(\d{6,})$/);
  if (fev){return 'facebook.com/events/'+fev[1]}
  const ps=/^(facebook\.com|fb\.com)/.test(ruta)
    ? q.split('&').filter(p => /^(id|fbid)=\d+$/.test(p)).slice(0,1)
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
(tipo_proximo) y descarta la fila si no se parece a ninguno. El orden es el de
index.htm.
*/

// roles: los roles de evento (ROLES_EVENTO) que lleva todo evento de ese tipo (paso1 roles_de_tipo);
// los de un event (sin definir), solo a mano (el manual, resfoto in.txt)
var TIPOS = {
  "milonga":            {"color": "#adf5d7", "roles": "mlg",     "desc": "milonga: regular (puede tener actuación)"},
  "practica":           {"color": "#d5f5c8", "roles": "prc",     "desc": "práctica: milonga relajada para practicar (regular)"},
  "venue":              {"color": "#fae3ad", "roles": "",        "desc": "sala, local"},
  "event":              {"color": "#e5f9ff", "roles": "",        "desc": "sin definir: no se sabe cuál (se decide más adelante)"},
  "event party":        {"color": "#d7f6fa", "roles": "mlg",     "desc": "fiesta: dos días o menos"},
  "event milonga+":     {"color": "#7fe8c0", "roles": "mlg,shw", "desc": "milonga+: una noche de milonga con show (actuación, orquesta, música en vivo); si es de una milonga regular, salen las dos"},
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
// person un tanguero (con sus roles) o group un grupo o comunidad de tango (sin roles).
// (hasta 2026-10-19, person se llamaba people y group, community; hasta 2026-10-29 había
// también los tipos shop y hostel, ahora los roles shp y hst: el join los cambia)
// publico: entra en publictango aunque no tenga roles públicos
var TIPOS_PERSONA = {
  "person":    {"publico": 0, "desc": "un tanguero",                "color": "#f0f0f0"},
  "group":     {"publico": 1, "desc": "grupo o comunidad de tango", "color": "#c8f0f0"}
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
  "mil": {"publico": 0,"desc": "buen baile",                               "nombre": "milonguera",  "color": "#ffccff","colorPeople": "#ffccff"},
  "com": {"publico": 0,"desc": "buena compañía",                           "nombre": "compañía",    "color": "#ffcccc","colorPeople": "#ffcccc"},
  "vip": {"publico": 0,"desc": "mil+com+inf",                              "nombre": "mil+com+inf", "color": "#ff9999","colorPeople": "#ff9999"},
  "dan": {"publico": 0,"desc": "baile regular",                            "nombre": "dancer",      "color": "#cfe8ff","colorPeople": "#cfe8ff"},
  "inf": {"publico": 0,"desc": "proveedor de información",                 "nombre": "source",      "color": "#F9AA90","colorPeople": "#F9AA90"},
  "non": {"publico": 0,"desc": "no interesa",                              "nombre": "pariah",      "color": "#e0e0e0","colorPeople": "#e0e0e0"}
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
  "liv": {"desc": "música en vivo, orquesta",   "nombre": "live"}
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

var favoritos=[
  ["Big Milonga -Estrellas-","Suncheon","home"],
  ["Busan Tango Marathon","Busan","home"],
  ["Cherry Blossoms Milonga","Changwon","home"],
  ["ChunCheon Tango Marathon","Chuncheon","home"],
  ["Crab Milonga","Pohang","home"],
  ["Daegu International Tango Marathon","Daegu","home"],
  ["Festivalito de Tango en Hong Kong","Hong Kong","go"],
  ["Greater China Tango Championship","Chengdu","think"],
  ["Gunsan Sunset Tango Marathon","Gunsan","home"],
  ["ICH Chengdu Tango Festival&Competition","Chengdu","think"],
  ["Jeju Summ Milonga","Jeju","think"],
  ["More than Tango Marathon & Festival & Cup","Shanghai","think"],
  ["Nanjing Tango Festival","Nanjing","think"],
  ["Oriental Tango Congress(OTC)","Beijing","think"],
  ["Sakura Tango Festival","Fukuoka","think"],
  ["Sapporo Tango Festival","Sapporo","think"],
  ["Select Tango Weekend","Beijing","go"],
  ["Shenyang Summer Ice & Snow Tango Weekend","Shenyang","go"],
  ["Taiwan Tango Marathon","Doulan Village","go"], 
  ["TANGO CHINA-Dapeng Tango Holiday","Shenzhen","go"],
  ["Vietnam Tango Marathon","Da Nang","go"],
  ["Hong Kong Tango Marathon","Hong Kong","go"],
];
