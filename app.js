(function(){
'use strict';
var KEY='misgastos.v1';
var TABS=['resumen','gastos','plan','informe','calendario'];
var WD=['L','M','X','J','V','S','D'];
var DEFAULT_CATS=[
{id:'vivienda',name:'Vivienda',color:1,pct:30},
{id:'supermercado',name:'Supermercado',color:2,pct:14},
{id:'restaurantes',name:'Restaurantes y café',color:3,pct:6},
{id:'transporte',name:'Transporte',color:4,pct:8},
{id:'ocio',name:'Ocio',color:5,pct:6},
{id:'compras',name:'Compras',color:6,pct:6},
{id:'salud',name:'Salud',color:7,pct:3},
{id:'suscripciones',name:'Suscripciones',color:8,pct:3},
{id:'otros',name:'Otros',color:9,pct:4},
{id:'ahorro',name:'Ahorro',color:10,pct:20,saving:true}
];
var KEYWORDS=[
['supermercado',['mercadona','carrefour','lidl','aldi','consum','eroski','alcampo','supermercado','albert heijn','jumbo','dia','hipercor','spar']],
['restaurantes',['mcdonald','burger','starbucks','restaurante','cafe','café','pizza','kebab','telepizza','glovo','uber eats','just eat','thuisbezorgd','bar','panaderia','panadería','heladeria']],
['transporte',['renfe','metro','emt','uber','cabify','bolt','repsol','cepsa','shell','bp','gasolinera','ns','ov-chipkaart','ryanair','vueling','blablacar','parking','taxi','flixbus']],
['ocio',['cine','steam','playstation','ticket','entradas','concierto','discoteca','gimnasio','gym','teatro','museo']],
['suscripciones',['netflix','spotify','apple.com','icloud','disney','hbo','prime video','youtube','openai','anthropic']],
['compras',['amazon','zara','h&m','primark','ikea','decathlon','mediamarkt','pccomponentes','aliexpress','shein','action','hema']],
['salud',['farmacia','clinica','clínica','dentista','optica','óptica','apotheek','hospital','fisio']],
['vivienda',['alquiler','iberdrola','endesa','naturgy','movistar','vodafone','orange','digi','comunidad','luz','agua','gas','huur']]
];
var S={cfg:null,exp:[],dep:[],fix:[],fixSheet:null,fDelArm:false,xCatTouched:false,calMode:'month',calDay:'',moneySheet:null,mDelArm:false,ym:'',tab:'resumen',mode:'local',ready:false,sheet:null,delArm:false,catTouched:false,filter:{cat:'',q:''},cfgVer:0,cfgDirty:false,loadedOnce:false,stale:false};
var db=null,cfgRef=null,expCol=null,depCol=null,fixCol=null,pendingRender=false;

function $(s,r){return (r||document).querySelector(s)}
function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function clone(o){return JSON.parse(JSON.stringify(o))}
function round2(n){return Math.round((n+Number.EPSILON)*100)/100}
function pad(n){return String(n).padStart(2,'0')}
var fmt=new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'});
function money(n){return fmt.format(round2(n||0))}
function fmtNum(n){return String(round2(n)).replace('.',',')}
function pctStr(x){return Math.round(x*100)+' %'}
function clampInt(v,a,b){var n=parseInt(v,10);if(isNaN(n))n=a;return Math.min(b,Math.max(a,n))}
function cap(s){return s.charAt(0).toUpperCase()+s.slice(1)}

/* ---------- fechas ---------- */
function todayStr(){var d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function curYm(){return todayStr().slice(0,7)}
function addMonths(ymd,k){var p=ymd.split('-').map(Number);var t=new Date(p[0],p[1]-1+k,1);var dim=new Date(t.getFullYear(),t.getMonth()+1,0).getDate();return t.getFullYear()+'-'+pad(t.getMonth()+1)+'-'+pad(Math.min(p[2],dim))}
function shiftYm(ym,k){return addMonths(ym+'-01',k).slice(0,7)}
function daysIn(ym){var p=ym.split('-').map(Number);return new Date(p[0],p[1],0).getDate()}
function monthName(ym){var p=ym.split('-').map(Number);return new Date(p[0],p[1]-1,1).toLocaleDateString('es-ES',{month:'long',year:'numeric'})}
function monthOnly(ym){var p=ym.split('-').map(Number);return new Date(p[0],p[1]-1,1).toLocaleDateString('es-ES',{month:'long'})}
function dayLabel(ymd){var p=ymd.split('-').map(Number);return cap(new Date(p[0],p[1]-1,p[2]).toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'}))}

/* ---------- configuración y categorías ---------- */
function defaultCfg(){return {v:1,cats:clone(DEFAULT_CATS),months:{},rules:{}}}
function normCfg(c){
var d=defaultCfg();
if(!c||typeof c!=='object')return d;
if(!Array.isArray(c.cats)||!c.cats.length)c.cats=d.cats;
if(!c.months||typeof c.months!=='object')c.months={};
if(!c.rules||typeof c.rules!=='object')c.rules={};
return c;
}
function cat(id){
var cs=S.cfg.cats;
for(var i=0;i<cs.length;i++)if(cs[i].id===id)return cs[i];
for(var j=0;j<cs.length;j++)if(cs[j].id==='otros')return cs[j];
return {id:'otros',name:'Otros',color:9,pct:0};
}
function spendCats(){return S.cfg.cats.filter(function(c){return !c.saving})}
function savingCat(){return S.cfg.cats.filter(function(c){return c.saving})[0]||null}
function pctsFor(ym){
var out={};S.cfg.cats.forEach(function(c){out[c.id]=c.pct||0});
var m=S.cfg.months[ym];
if(m&&m.pcts)Object.keys(m.pcts).forEach(function(k){out[k]=m.pcts[k]});
return out;
}
function planFor(ym){
var income=depTotal(ym);
var pcts=pctsFor(ym);var spendPct=0,savePct=0;
S.cfg.cats.forEach(function(c){if(c.saving)savePct+=pcts[c.id]||0;else spendPct+=pcts[c.id]||0});
return {has:income>0,income:income,pcts:pcts,spendable:income*spendPct/100,saving:income*savePct/100,savePct:savePct,spendPct:spendPct};
}
function ensurePlan(ym){
if(!S.cfg.months[ym]){
var keys=Object.keys(S.cfg.months).filter(function(k){return k<ym&&S.cfg.months[k].pcts}).sort();
var base=keys.length?clone(S.cfg.months[keys[keys.length-1]].pcts):{};
S.cfg.months[ym]={income:0,pcts:base};
}
if(!S.cfg.months[ym].pcts)S.cfg.months[ym].pcts={};
return S.cfg.months[ym];
}
function lastIncome(before){
var keys=Object.keys(S.cfg.months).filter(function(k){return k<before&&S.cfg.months[k].income>0}).sort();
return keys.length?S.cfg.months[keys[keys.length-1]].income:0;
}

/* ---------- números y pagos pegados ---------- */
function parseAmount(tok){
var s=String(tok||'').replace(/[^\d.,]/g,'').replace(/[.,]+$/,'');
if(!s)return NaN;
var hasC=s.indexOf(',')>=0,hasD=s.indexOf('.')>=0;
if(hasC&&hasD){
if(s.lastIndexOf(',')>s.lastIndexOf('.'))s=s.replace(/\./g,'').replace(',','.');
else s=s.replace(/,/g,'');
}else if(hasC){
s=(s.split(',').length>2)?s.replace(/,/g,''):s.replace(',','.');
}else if(hasD){
if(s.split('.').length>2)s=s.replace(/\./g,'');
else if(/^\d{1,3}\.\d{3}$/.test(s))s=s.replace('.','');
}
var n=parseFloat(s);return isNaN(n)?NaN:n;
}
function num(v){var n=parseAmount(v);return isNaN(n)?0:n}
function parsePaymentLine(line){
line=String(line||'').trim();if(!line)return null;
var re=/\d[\d.,]*/g,m,toks=[];
while((m=re.exec(line))){toks.push({t:m[0],i:m.index})}
if(!toks.length)return null;
var pick=null;
toks.forEach(function(k){if(/[.,]\d{1,2}[.,]?$/.test(k.t)&&!pick)pick=k});
if(!pick)pick=toks[toks.length-1];
var amount=parseAmount(pick.t);
if(isNaN(amount)||amount<=0)return null;
var rest=line.slice(0,pick.i)+' '+line.slice(pick.i+pick.t.length);
rest=rest.replace(/€|eur(os)?\b/ig,' ').replace(/[|;:\-–]+/g,' ').replace(/\s+/g,' ').trim();
return {amount:amount,concept:rest||'Pago con Apple Pay'};
}
function guessCat(text){
var t=String(text||'').toLowerCase();
var rules=S.cfg.rules;
var ks=Object.keys(rules);
for(var i=0;i<ks.length;i++){if(t.indexOf(ks[i])>=0&&S.cfg.cats.some(function(c){return c.id===rules[ks[i]]}))return rules[ks[i]]}
var T=' '+t.replace(/[^a-z0-9áéíóúñü&.\-]+/g,' ')+' ';
for(var j=0;j<KEYWORDS.length;j++){
var words=KEYWORDS[j][1];
for(var w=0;w<words.length;w++){
var hit=words[w].length<=4?T.indexOf(' '+words[w]+' ')>=0:T.indexOf(words[w])>=0;
if(hit&&S.cfg.cats.some(function(c){return c.id===KEYWORDS[j][0]}))return KEYWORDS[j][0];
}
}
return 'otros';
}
function learnRule(concept,catId){
var k=String(concept||'').toLowerCase().trim().slice(0,40);
if(k.length<3||/^pago con apple pay$/.test(k))return;
if(guessCat(k)===catId)return;
if(Object.keys(S.cfg.rules).length>200)return;
S.cfg.rules[k]=catId;touchCfg();
}

/* ---------- cálculo ---------- */
function inMonth(ym){
var l=S.exp.filter(function(e){return e.date&&e.date.slice(0,7)===ym}).concat(fixedExp(ym));
l.sort(function(a,b){return a.date<b.date?1:a.date>b.date?-1:((b.createdAt||0)-(a.createdAt||0))});
return l;
}
function monthStats(ym){
var list=inMonth(ym),by={},total=0;
list.forEach(function(e){var c=cat(e.cat).id;by[c]=(by[c]||0)+e.share;total+=e.share});
return {list:list,by:by,total:round2(total)};
}
function splitAmount(total,n){
var base=Math.floor(total*100/n)/100,out=[],acc=0;
for(var i=0;i<n-1;i++){out.push(base);acc+=base}
out.push(round2(total-acc));return out;
}
function owedTo(e){return e.people>1&&!e.settled?round2(e.amount-e.share):0}
function sortExp(){S.exp.sort(function(a,b){return a.date<b.date?1:a.date>b.date?-1:((b.createdAt||0)-(a.createdAt||0))})}

/* ---------- almacenamiento ---------- */
function persistLocal(){try{localStorage.setItem(KEY,JSON.stringify({cfg:S.cfg,exp:S.exp,dep:S.dep,fix:S.fix}))}catch(e){}}
function loadLocal(){
try{var raw=localStorage.getItem(KEY);if(raw){var o=JSON.parse(raw);S.cfg=normCfg(o.cfg);S.exp=Array.isArray(o.exp)?o.exp:[];S.dep=Array.isArray(o.dep)?o.dep:[];S.fix=Array.isArray(o.fix)?o.fix:[]}}catch(e){}
}
var cfgTimer=null,cfgBusy=false;
function touchCfg(){
S.cfgVer++;S.cfgDirty=true;
if(S.mode==='local'){persistLocal();S.cfgDirty=false;return}
clearTimeout(cfgTimer);cfgTimer=setTimeout(flushCfg,500);
}
async function flushCfg(){
if(cfgBusy){cfgTimer=setTimeout(flushCfg,300);return}
cfgBusy=true;var v=S.cfgVer;
try{await cfgRef.set(clone(S.cfg));if(S.cfgVer===v)S.cfgDirty=false;else cfgTimer=setTimeout(flushCfg,100)}
catch(e){toast('No se pudo guardar el plan. Inténtalo de nuevo.');S.cfgDirty=false}
finally{cfgBusy=false}
}
function newId(){return 'e'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
async function putExp(obj){
if(S.mode==='local'){
var i=S.exp.findIndex(function(x){return x.id===obj.id});
if(i>=0)S.exp[i]=obj;else S.exp.push(obj);
sortExp();persistLocal();render();return;
}
var data=clone(obj);var id=data.id;delete data.id;
await expCol.doc(id).set(data);
}
async function removeExp(id){
if(S.mode==='local'){S.exp=S.exp.filter(function(x){return x.id!==id});persistLocal();render();return}
await expCol.doc(id).delete();
}

function sortDep(){S.dep.sort(function(a,b){return a.date<b.date?1:a.date>b.date?-1:((b.createdAt||0)-(a.createdAt||0))})}
async function putDep(obj){
if(S.mode==='local'){
var i=S.dep.findIndex(function(x){return x.id===obj.id});
if(i>=0)S.dep[i]=obj;else S.dep.push(obj);
sortDep();persistLocal();render();return;
}
var data=clone(obj);var id=data.id;delete data.id;
await depCol.doc(id).set(data);
}
async function removeDep(id){
if(S.mode==='local'){S.dep=S.dep.filter(function(x){return x.id!==id});persistLocal();render();return}
await depCol.doc(id).delete();
}
function outflow(e){return round2(e.share+owedTo(e))}
function balance(){
var t=todayStr(),b=0;
S.dep.forEach(function(d){if(d.date<=t)b+=d.amount});
S.exp.forEach(function(e){if(e.date<=t)b-=outflow(e)});
fixedUpTo(t).forEach(function(e){b-=e.share});
return round2(b);
}
function depMonth(ym){return S.dep.filter(function(d){return d.date&&d.date.slice(0,7)===ym})}
function depTotal(ym){var s=0;depMonth(ym).forEach(function(d){s+=d.amount});return round2(s)}

/* ---------- gastos fijos y pagos programados ---------- */
async function putFix(obj){
if(S.mode==='local'){
var i=S.fix.findIndex(function(x){return x.id===obj.id});
if(i>=0)S.fix[i]=obj;else S.fix.push(obj);
persistLocal();render();return;
}
var data=clone(obj);var id=data.id;delete data.id;
await fixCol.doc(id).set(data);
}
async function removeFix(id){
if(S.mode==='local'){S.fix=S.fix.filter(function(x){return x.id!==id});persistLocal();render();return}
await fixCol.doc(id).delete();
}
function fixedDates(f,ym){
var sy=+f.date.slice(0,4),sm=+f.date.slice(5,7),sd=+f.date.slice(8,10),y=+ym.slice(0,4),m=+ym.slice(5,7),idx;
if(f.freq==='once')return f.date.slice(0,7)===ym?[{date:f.date,n:1}]:[];
if(f.freq==='yearly'){if(m!==sm||y<sy)return [];idx=y-sy}
else{idx=(y-sy)*12+(m-sm);if(idx<0)return []}
if(f.count&&idx>=f.count)return [];
return [{date:ym+'-'+pad(Math.min(sd,daysIn(ym))),n:idx+1}];
}
function mkFixed(f,o){
return {id:'f:'+f.id+':'+o.date,fixedId:f.id,fixed:true,amount:f.amount,share:f.amount,people:1,concept:f.name,cat:f.cat,date:o.date,inst:f.count?o.n+'/'+f.count:null,settled:false,createdAt:0};
}
function fixedExp(ym){
var out=[];
S.fix.forEach(function(f){fixedDates(f,ym).forEach(function(o){out.push(mkFixed(f,o))})});
return out;
}
function fixedUpTo(t){
var out=[],end=t.slice(0,7);
S.fix.forEach(function(f){
var ym=f.date.slice(0,7),guard=0;
while(ym<=end&&guard<600){
fixedDates(f,ym).forEach(function(o){if(o.date<=t)out.push(mkFixed(f,o))});
ym=shiftYm(ym,1);guard++;
}
});
return out;
}
function daysBetween(a,b){
var pa=a.split('-').map(Number),pb=b.split('-').map(Number);
return Math.round((new Date(pb[0],pb[1]-1,pb[2])-new Date(pa[0],pa[1]-1,pa[2]))/86400000);
}
function dueSoon(){
var today=todayStr(),cy=curYm(),months=[cy,shiftYm(cy,1)],out=[];
S.fix.forEach(function(f){
if(!(f.remind>=0))return;
months.forEach(function(ym){
fixedDates(f,ym).forEach(function(o){
var d=daysBetween(today,o.date);
if(d>=0&&d<=f.remind)out.push({f:f,date:o.date,d:d});
});
});
});
out.sort(function(a,b){return a.d-b.d});
return out;
}
function remindText(n){return !(n>=0)?'Sin aviso':n===0?'Aviso el mismo día':'Aviso '+n+(n===1?' día antes':' días antes')}
function fmtDM(ymd){var p=ymd.split('-').map(Number);return new Date(p[0],p[1]-1,p[2]).toLocaleDateString('es-ES',{day:'numeric',month:'long'})}
function yearMode(){return S.tab==='calendario'&&S.calMode==='year'}

/* ---------- interfaz: utilidades ---------- */
var toastTimer=null;
function toast(msg){var t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(function(){t.hidden=true},3200)}
function setChip(){
var c=$('#syncChip');
if(!S.ready){c.textContent='Conectando…';c.className='chip';return}
if(S.stale){c.textContent='Sin conexión, datos posiblemente desactualizados';c.className='chip warn';return}
if(S.mode==='db'){c.textContent='Guardado en tu cuenta';c.className='chip'}
else{c.textContent='Solo en este navegador';c.className='chip warn'}
}
function scheduleRender(){
var a=document.activeElement;
if(a&&$('#view').contains(a)&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)){pendingRender=true;return}
render();
}

/* ---------- vistas ---------- */
function statusFor(spent,max){
if(max<=0)return spent>0?{k:'bad',t:'Sin presupuesto'}:{k:'ok',t:'Sin gasto'};
var r=spent/max;
if(r>1)return {k:'bad',t:'Superado'};
if(r>=0.8)return {k:'warn',t:'Cerca del límite'};
return {k:'ok',t:'Dentro del límite'};
}
function rowHtml(e){
var c=cat(e.cat),owed=owedTo(e);
return '<li class="row"><button class="row-main" data-a="'+(e.fixed?'editFixed':'edit')+'" data-id="'+esc(e.fixed?e.fixedId:e.id)+'">'
+'<span class="dot" style="background:var(--c'+c.color+')"></span>'
+'<span class="row-txt"><span class="row-t">'+esc(e.concept)+'</span>'
+'<span class="row-s">'+esc(c.name)+(e.fixed?' · Gasto fijo':'')+(e.inst?' · cuota '+esc(e.inst):'')+(e.people>1?' · entre '+e.people:'')+'</span></span>'
+'<span class="row-amt">'+money(e.share)+(e.people>1?'<small>de '+money(e.amount)+'</small>':'')+'</span></button>'
+(owed?'<div class="owed"><span>Te deben '+money(owed)+'</span><button class="link" data-a="settle" data-id="'+esc(e.id)+'">Marcar cobrado</button></div>':'')
+'</li>';
}
function depRowHtml(d){
return '<li class="row"><button class="row-main" data-a="editDep" data-id="'+esc(d.id)+'">'
+'<span class="dot" style="background:var(--accent)"></span>'
+'<span class="row-txt"><span class="row-t">'+esc(d.note)+'</span><span class="row-s">Dinero añadido</span></span>'
+'<span class="row-amt" style="color:var(--accent-ink)">+'+money(d.amount)+'</span></button></li>';
}
function accountHtml(){
var b=balance(),st=monthStats(S.ym),mo=esc(monthOnly(S.ym));
return '<section class="account"><p class="eyebrow">Dinero en cuenta</p>'
+'<p class="acc-amt'+(b<0?' bad':'')+'">'+money(b)+'</p>'
+'<div class="acc-row"><span>Añadido en '+mo+'<b>'+money(depTotal(S.ym))+'</b></span><span>Gastado en '+mo+'<b>'+money(st.total)+'</b></span></div>'
+'<div class="actions"><button class="btn primary" data-a="addMoney">+ Añadir dinero</button></div>'
+(S.dep.length?'':'<p class="hero-sub">Empieza añadiendo el dinero que tienes ahora en la cuenta.</p>')+'</section>';
}
function donutHtml(ym,plan){
var slices=[],total=0;
S.cfg.cats.forEach(function(c){var p=plan.pcts[c.id]||0;if(p>0){slices.push({c:c,p:p});total+=p}});
var denom=Math.max(100,total);
if(total<100)slices.push({c:null,p:100-total});
var R=80,C=2*Math.PI*R,off=0,circles='';
slices.forEach(function(s){
var len=s.p/denom*C,gap=slices.length>1?Math.min(2,len*0.5):0;
circles+='<circle cx="100" cy="100" r="80" fill="none" stroke="'+(s.c?'var(--c'+s.c.color+')':'var(--surface-2)')+'" stroke-width="26" stroke-dasharray="'+(len-gap).toFixed(2)+' '+(C-len+gap).toFixed(2)+'" stroke-dashoffset="'+(-off).toFixed(2)+'" transform="rotate(-90 100 100)"/>';
off+=len;
});
var legend=slices.filter(function(s){return s.c}).map(function(s){return '<span><i class="dot" style="background:var(--c'+s.c.color+')"></i>'+esc(s.c.name)+' · '+fmtNum(s.p)+' %</span>'}).join('');
return '<section class="card"><h2>Reparto de '+esc(monthOnly(ym))+'</h2>'
+'<div class="donut"><svg viewBox="0 0 200 200" role="img" aria-label="Reparto de tus ingresos por categoría">'+circles+'</svg>'
+'<div class="donut-c"><span class="eyebrow">Ingresos del mes</span><b class="donut-amt">'+(plan.has?money(plan.income):'Sin definir')+'</b>'
+'<button class="plus" data-a="addMoney" aria-label="Añadir dinero">+</button></div></div>'
+'<div class="legend-grid">'+legend+'</div>'
+'<button class="btn primary" data-a="add">Añadir gasto</button></section>';
}
function fixWhen(f){
var d=parseInt(f.date.slice(8),10);
var w=f.freq==='monthly'?'Día '+d+' de cada mes':f.freq==='yearly'?'Cada '+fmtDM(f.date):fmtDM(f.date)+' de '+f.date.slice(0,4);
return w+(f.count?' · '+f.count+(f.count===1?' pago':' pagos'):'');
}
function fixRowHtml(f){
var c=cat(f.cat);
return '<li class="row"><button class="row-main" data-a="editFixed" data-id="'+esc(f.id)+'"><span class="dot" style="background:var(--c'+c.color+')"></span>'
+'<span class="row-txt"><span class="row-t">'+esc(f.name)+'</span><span class="row-s">'+esc(fixWhen(f))+' · '+esc(remindText(f.remind))+'</span></span>'
+'<span class="row-amt">'+money(f.amount)+'</span></button></li>';
}
function fixedSectionHtml(){
var tot=0;fixedExp(S.ym).forEach(function(e){tot+=e.share});
var rows=S.fix.slice().sort(function(a,b){return parseInt(a.date.slice(8),10)-parseInt(b.date.slice(8),10)}).map(fixRowHtml).join('');
return '<section class="sec"><div class="sec-h"><h3>Gastos fijos</h3><button class="link" data-a="addFixed">+ Añadir</button></div>'
+(S.fix.length?'<p class="hero-sub">En '+esc(monthOnly(S.ym))+': <b>'+money(tot)+'</b></p><ul class="rows">'+rows+'</ul>'
:'<div class="empty">Añade aquí lo que pagas todos los meses, como Netflix, Spotify o una financiación.</div>')+'</section>';
}
function dueHtml(){
var d=dueSoon();if(!d.length)return '';
return '<section class="card"><p class="eyebrow">Próximos cobros</p><ul class="plain" style="display:flex;flex-direction:column;gap:8px">'+d.map(function(x){
return '<li style="display:flex;justify-content:space-between;gap:12px"><span style="min-width:0;overflow-wrap:anywhere"><b>'+(x.d===0?'Hoy':x.d===1?'Mañana':'En '+x.d+' días')+'</b> · '+esc(x.f.name)+'</span><b>'+money(x.f.amount)+'</b></li>';
}).join('')+'</ul></section>';
}
function monthHtml(){
var ym=S.ym,y=+ym.slice(0,4),m=+ym.slice(5,7),dim=daysIn(ym),off=(new Date(y,m-1,1).getDay()+6)%7,today=todayStr();
if(!S.calDay||S.calDay.slice(0,7)!==ym)S.calDay=(ym===curYm()?today:ym+'-01');
var by={};inMonth(ym).forEach(function(e){(by[e.date]=by[e.date]||[]).push(e)});
var cells='',i,d;
for(i=0;i<off;i++)cells+='<span></span>';
for(d=1;d<=dim;d++){
var date=ym+'-'+pad(d),list=by[date]||[];
var dots=list.slice(0,4).map(function(e){return '<i class="cdot'+(e.fixed?' fx':'')+'" style="background:var(--c'+cat(e.cat).color+')"></i>'}).join('');
cells+='<button class="cday'+(date===S.calDay?' sel':'')+(date===today?' today':'')+'" data-a="pickDay" data-date="'+date+'" aria-label="'+d+' de '+monthOnly(ym)+(list.length?', '+list.length+(list.length===1?' movimiento':' movimientos'):'')+'"><span>'+d+'</span><span class="cdots">'+dots+'</span></button>';
}
var head=WD.map(function(w){return '<span>'+w+'</span>'}).join('');
var h='<div class="cal"><div class="cal-h">'+head+'</div><div class="cal-g">'+cells+'</div></div>'
+'<div class="legend"><span><i class="cdot" style="background:var(--muted)"></i> Gasto</span><span><i class="cdot fx" style="background:var(--muted)"></i> Gasto fijo o pago programado</span></div>';
var dl=by[S.calDay]||[];
h+='<section class="sec"><div class="sec-h"><h3>'+esc(dayLabel(S.calDay))+'</h3></div>'
+(dl.length?'<ul class="rows">'+dl.map(rowHtml).join('')+'</ul>':'<div class="empty">Sin movimientos este día.</div>')
+'<div class="actions"><button class="btn primary" data-a="addFixed" data-date="'+S.calDay+'">+ Gasto fijo o pago programado</button><button class="btn" data-a="add" data-date="'+S.calDay+'">+ Gasto</button></div></section>';
var occ=fixedExp(ym).sort(function(a,b){return a.date<b.date?-1:1}),tot=0;
occ.forEach(function(e){tot+=e.share});
if(occ.length){
h+='<section class="sec"><div class="sec-h"><h3>Cobros fijos de '+esc(monthOnly(ym))+'</h3><b>'+money(tot)+'</b></div><ul class="rows">'+occ.map(function(e){
var f=S.fix.filter(function(x){return x.id===e.fixedId})[0],c=cat(e.cat);
return '<li class="row"><button class="row-main" data-a="editFixed" data-id="'+esc(e.fixedId)+'"><span class="dot" style="background:var(--c'+c.color+')"></span>'
+'<span class="row-txt"><span class="row-t">'+esc(e.concept)+'</span><span class="row-s">'+esc(fmtDM(e.date))+(f?' · '+esc(remindText(f.remind)):'')+'</span></span>'
+'<span class="row-amt">'+money(e.share)+'</span></button></li>';
}).join('')+'</ul></section>';
}
return h;
}
function yearHtml(){
var y=+S.ym.slice(0,4),today=todayStr(),tot=0,cards='',m;
for(m=1;m<=12;m++){
var ym=y+'-'+pad(m),occ=fixedExp(ym),dim=daysIn(ym),off=(new Date(y,m-1,1).getDay()+6)%7,sum=0,on={},g='',i,d;
occ.forEach(function(e){sum+=e.share;on[e.date]=1});
tot+=sum;
for(i=0;i<off;i++)g+='<span></span>';
for(d=1;d<=dim;d++){var dt=ym+'-'+pad(d);g+='<span class="md'+(on[dt]?' on':'')+(dt===today?' td':'')+'"></span>'}
cards+='<button class="mcard" data-a="openMonth" data-ym="'+ym+'" aria-label="Abrir '+esc(monthName(ym))+'"><span class="mname">'+esc(cap(monthOnly(ym)))+'</span>'
+'<span class="mini" aria-hidden="true">'+g+'</span>'
+'<span class="msum">'+(occ.length?occ.length+(occ.length===1?' cobro · ':' cobros · ')+money(sum):'Sin cobros fijos')+'</span></button>';
}
return '<section class="card"><p class="eyebrow">Gastos fijos de '+y+'</p><p class="big" style="font-size:30px">'+money(tot)+'</p>'
+'<p class="hero-sub">Los días marcados son cuando se cobra algo fijo. Toca un mes para ver el detalle.</p></section><div class="year">'+cards+'</div>';
}
function viewCalendario(){
var h=dueHtml();
h+='<div class="seg" role="group" aria-label="Vista del calendario"><button data-a="calMode" data-m="month" aria-pressed="'+(S.calMode==='month')+'">Mensual</button><button data-a="calMode" data-m="year" aria-pressed="'+(S.calMode==='year')+'">Anual</button></div>';
h+=S.calMode==='year'?yearHtml():monthHtml();
h+='<section class="card"><h3>Avisos de cobro</h3>'
+'<p class="muted" style="font-size:14px">Los avisos que eliges en cada gasto fijo aparecen aquí y en el Resumen cada vez que abres la app. Una página no puede enviarte notificaciones con la app cerrada. Para que el iPhone te avise, copia la lista y pégala en tu chat con Claude para que prepare un archivo de calendario con esos avisos.</p>'
+'<div class="actions"><button class="btn" data-a="copyFixed">Copiar mis gastos fijos</button></div>'
+'<textarea id="copyBox" readonly hidden aria-label="Lista de gastos fijos"></textarea></section>';
return h;
}
function bannerHtml(){
var cy=curYm(),d=new Date().getDate(),dim=daysIn(cy),prev=shiftYm(cy,-1);
if(S.ym!==cy)return '';
if(d>=dim-2&&monthStats(cy).list.length)
return '<div class="banner"><span>Tu informe de '+esc(monthOnly(cy))+' está casi listo.</span><button class="btn primary" data-a="goInforme" data-ym="'+cy+'">Ver informe</button></div>';
if(d<=7&&monthStats(prev).list.length)
return '<div class="banner"><span>Ya tienes el informe de '+esc(monthOnly(prev))+'.</span><button class="btn primary" data-a="goInforme" data-ym="'+prev+'">Ver informe</button></div>';
return '';
}
function viewResumen(){
var ym=S.ym,st=monthStats(ym),plan=planFor(ym),h='';
h+=bannerHtml();
h+=accountHtml();
h+=dueHtml();
if(plan.has){
var rem=plan.spendable-st.total,ratio=plan.spendable>0?Math.min(1,st.total/plan.spendable):1;
var cy=curYm(),sub='';
if(ym===cy){
var left=daysIn(ym)-new Date().getDate()+1;
sub=rem>0?'Puedes gastar unos '+money(rem/left)+' al día durante '+left+(left===1?' día.':' días.'):'Ya has agotado el presupuesto del mes.';
}
h+='<section class="card"><p class="eyebrow">'+(rem>=0?'Te quedan para gastar':'Te has pasado')+'</p>'
+'<p class="big'+(rem<0?' bad':'')+'">'+money(Math.abs(rem))+'</p>'
+'<div class="bar'+(rem<0?' over':'')+'"><i style="width:'+Math.round(ratio*100)+'%"></i></div>'
+'<p class="hero-sub">'+money(st.total)+' gastados de '+money(plan.spendable)+'. Objetivo de ahorro: '+money(plan.saving)+'.</p>'
+(sub?'<p class="hero-sub">'+sub+'</p>':'')+'</section>';
}
var owed=0,today=todayStr();
S.exp.forEach(function(e){if(e.date<=today)owed+=owedTo(e)});
if(owed>0)h+='<section class="card"><p class="eyebrow">Gastos compartidos</p><p><b>Te deben '+money(owed)+'</b> en total. Márcalo como cobrado desde la lista de gastos.</p></section>';
var rows='',topSpent=0;
spendCats().forEach(function(c){if((st.by[c.id]||0)>topSpent)topSpent=st.by[c.id]||0});
spendCats().forEach(function(c){
var sp=st.by[c.id]||0,max=plan.has?plan.income*(plan.pcts[c.id]||0)/100:0;
if(!sp&&!max)return;
var width,over=false,foot;
if(plan.has){
width=max>0?Math.min(100,sp/max*100):(sp>0?100:0);over=sp>max;
var s=statusFor(sp,max);
foot='<span class="pill '+s.k+'">'+s.t+'</span><span>'+(max-sp>=0?'Quedan '+money(max-sp):'Te pasas '+money(sp-max))+'</span>';
}else{width=topSpent>0?sp/topSpent*100:0;foot=''}
rows+='<li class="catrow"><div class="cat-h"><span class="dot" style="background:var(--c'+c.color+')"></span><span class="cat-n">'+esc(c.name)+'</span>'
+'<span class="cat-v">'+money(sp)+(plan.has?'<small> / '+money(max)+'</small>':'')+'</span></div>'
+'<div class="bar'+(over?' over':'')+'" style="--cc:var(--c'+c.color+')"><i style="width:'+Math.round(width)+'%"></i></div>'
+(foot?'<div class="cat-f">'+foot+'</div>':'')+'</li>';
});
h+='<div class="split"><section class="sec"><div class="sec-h"><h3>Por categoría</h3></div>'
+(rows?'<ul class="cats">'+rows+'</ul>':'<div class="empty">Aún no hay gastos en '+esc(monthOnly(ym))+'. Añade el primero con el botón + Gasto o pega tus pagos de Apple Pay en la pestaña Gastos.</div>')+'</section>'+fixedSectionHtml()+'</div>';
var recent=st.list.slice(0,5);
if(recent.length){
h+='<section class="sec"><div class="sec-h"><h3>Últimos gastos</h3><a class="link" href="#gastos" data-tab="gastos">Ver todos</a></div><ul class="rows">'+recent.map(rowHtml).join('')+'</ul></section>';
}
return h;
}
function listHtml(){
var list=inMonth(S.ym),f=S.filter;
if(f.cat)list=list.filter(function(e){return cat(e.cat).id===f.cat});
if(f.q){var q=f.q.toLowerCase();list=list.filter(function(e){return String(e.concept).toLowerCase().indexOf(q)>=0})}
var deps=f.cat?[]:depMonth(S.ym).filter(function(d){return !f.q||String(d.note).toLowerCase().indexOf(f.q.toLowerCase())>=0});
if(!list.length&&!deps.length)return '<div class="empty">No hay gastos que mostrar.</div>';
var total=0;list.forEach(function(e){total+=e.share});
var items=list.map(function(e){return {date:e.date,t:e.createdAt||0,html:rowHtml(e)}}).concat(deps.map(function(d){return {date:d.date,t:d.createdAt||0,html:depRowHtml(d)}}));
items.sort(function(a,b){return a.date<b.date?1:a.date>b.date?-1:b.t-a.t});
var h='<p class="hero-sub">'+list.length+(list.length===1?' gasto':' gastos')+' · '+money(total)+'</p>';
var cur=null;
items.forEach(function(e){
if(e.date!==cur){if(cur!==null)h+='</ul>';cur=e.date;h+='<p class="day">'+esc(dayLabel(e.date))+'</p><ul class="rows">'}
h+=e.html;
});
return h+'</ul>';
}
function viewGastos(){
var opts='<option value="">Todas las categorías</option>'+spendCats().map(function(c){return '<option value="'+c.id+'"'+(S.filter.cat===c.id?' selected':'')+'>'+esc(c.name)+'</option>'}).join('');
return '<details class="card"><summary>Registrar pagos de Apple Pay</summary>'
+'<p class="muted" style="font-size:14px">Apple no deja que una app lea tus pagos directamente. Lo que sí permite iOS es una automatización de Atajos que se activa con cada pago con tarjeta y te da el importe y el comercio.</p>'
+'<ol><li>En Atajos abre Automatización, pulsa Nueva y elige <b>Transacción</b>. Selecciona tus tarjetas y <b>Ejecutar inmediatamente</b>.</li>'
+'<li>Añade la acción <b>Texto</b> con las variables de la transacción: <code>Importe | Comerciante</code>.</li>'
+'<li>Añade <b>Copiar en el portapapeles</b>.</li>'
+'<li>Después de pagar, abre esta app y pega el texto aquí. Puedes pegar varias líneas a la vez.</li></ol>'
+'<label for="apBox">Pagos pegados</label><textarea id="apBox" placeholder="12,50 | Mercadona&#10;3,20 | Starbucks"></textarea>'
+'<div class="actions"><button class="btn primary" data-a="importAP">Añadir pagos</button></div></details>'
+'<div class="filters"><div><label for="qSearch">Buscar</label><input id="qSearch" type="search" placeholder="Comercio o concepto" value="'+esc(S.filter.q)+'"></div>'
+'<div><label for="qCat">Categoría</label><select id="qCat">'+opts+'</select></div></div>'
+'<div id="list" class="sec">'+listHtml()+'</div>';
}
function planTotals(ym){
var p=pctsFor(ym),t=0;S.cfg.cats.forEach(function(c){t+=p[c.id]||0});return round2(t);
}
function planTotalHtml(ym){
var t=planTotals(ym),d=round2(100-t);
if(d===0)return '<span>Total repartido</span><span>100 %</span>';
return '<span>Total repartido</span><span>'+fmtNum(t)+' % · '+(d>0?'faltan '+fmtNum(d)+' %':'sobran '+fmtNum(-d)+' %')+'</span>';
}
function viewPlan(){
var ym=S.ym,plan=planFor(ym),m=S.cfg.months[ym];
var rows='<div class="plan-head"><span>Categoría</span><span>%</span><span>Máximo</span><span></span></div>';
S.cfg.cats.forEach(function(c){
var removable=c.id!=='otros'&&!c.saving;
rows+='<div class="plan-row"><span class="nm"><span class="dot" style="background:var(--c'+c.color+')"></span>'+esc(c.name)+'</span>'
+'<input data-pct="'+c.id+'" inputmode="decimal" aria-label="Porcentaje de '+esc(c.name)+'" value="'+fmtNum(plan.pcts[c.id]||0)+'">'
+'<span class="eur" data-max="'+c.id+'">'+(plan.has?money(plan.income*(plan.pcts[c.id]||0)/100):'–')+'</span>'
+(removable?'<button class="x" data-a="rmCat" data-id="'+c.id+'" aria-label="Quitar '+esc(c.name)+'">×</button>':'<span></span>')+'</div>';
});
var prev=shiftYm(ym,-1),canRebase=monthStats(prev).total>0;
return donutHtml(ym,plan)
+'<section class="card"><h3>Máximo por categoría</h3><span class="hint">Se calcula con el dinero que añades cada mes. El reparto se guarda por mes y los meses nuevos copian el del último.</span><div class="plan-grid">'+rows+'</div>'
+'<div class="total" id="planTotal">'+planTotalHtml(ym)+'</div>'
+'<div class="actions">'
+'<button class="btn" data-a="rebase"'+(canRebase?'':' disabled')+'>Basar el reparto en '+esc(monthOnly(prev))+'</button>'
+'<button class="btn" data-a="resetPlan">Reparto estándar</button></div>'
+(canRebase?'':'<span class="hint">Se activa cuando hay gastos registrados en el mes anterior.</span>')
+'</section>'
+'<section class="card"><h3>Añadir categoría</h3><div class="inline"><div class="field"><label for="newCat">Nombre</label><input id="newCat" placeholder="Estudios" autocomplete="off"></div>'
+'<button class="btn" data-a="addCat">Añadir</button></div></section>';
}
function nm(v){var p=Math.pow(10,Math.floor(Math.log10(v||1)));var n=v/p;return (n<=1?1:n<=2?2:n<=5?5:10)*p}
function chartHtml(ym,plan,st){
var dim=daysIn(ym),cy=curYm(),last=ym===cy?Math.min(dim,new Date().getDate()):(ym<cy?dim:0);
if(!last)return '';
var daily=[];for(var i=0;i<dim;i++)daily.push(0);
st.list.forEach(function(e){daily[parseInt(e.date.slice(8,10),10)-1]+=e.share});
var cum=[],acc=0;for(var d=0;d<last;d++){acc+=daily[d];cum.push(round2(acc))}
var budget=plan.has?plan.spendable:0;
var ymax=nm(Math.max(acc,budget,1)*1.05);
var W=480,H=220,L=46,R=12,T=12,B=26;
function X(day){return L+(day-1)/(dim-1)*(W-L-R)}
function Y(v){return T+(1-v/ymax)*(H-T-B)}
var g='';
[0,ymax/2,ymax].forEach(function(v){g+='<line class="grid" x1="'+L+'" x2="'+(W-R)+'" y1="'+Y(v).toFixed(1)+'" y2="'+Y(v).toFixed(1)+'"/><text x="'+(L-6)+'" y="'+(Y(v)+4).toFixed(1)+'" text-anchor="end">'+Math.round(v)+' €</text>'});
var xs=[1,8,15,22,dim],seen={};
xs.forEach(function(day){if(seen[day])return;seen[day]=1;g+='<text x="'+X(day).toFixed(1)+'" y="'+(H-8)+'" text-anchor="middle">'+day+'</text>'});
var pts=cum.map(function(v,k){return X(k+1).toFixed(1)+','+Y(v).toFixed(1)}).join(' L');
var area='M'+pts+' L'+X(last).toFixed(1)+','+Y(0).toFixed(1)+' L'+X(1).toFixed(1)+','+Y(0).toFixed(1)+' Z';
var line='<path d="'+area+'" fill="var(--accent-soft)" stroke="none"/><path d="M'+pts+'" fill="none" stroke="var(--accent-ink)" stroke-width="2.5" stroke-linejoin="round"/>'
+'<circle cx="'+X(last).toFixed(1)+'" cy="'+Y(acc).toFixed(1)+'" r="4" fill="var(--accent-ink)"/>';
var pace=budget>0?'<line x1="'+X(1).toFixed(1)+'" y1="'+Y(budget/dim).toFixed(1)+'" x2="'+X(dim).toFixed(1)+'" y2="'+Y(budget).toFixed(1)+'" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="5 4"/>':'';
return '<svg class="chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Gasto acumulado día a día en '+esc(monthName(ym))+'">'+g+pace+line+'</svg>'
+'<div class="legend"><span><b style="color:var(--accent-ink)">━</b> Gasto acumulado</span>'+(budget>0?'<span>╌╌ Ritmo del plan (límite repartido por días)</span>':'')+'</div>';
}
function insights(ym){
var st=monthStats(ym),pym=shiftYm(ym,-1),prev=monthStats(pym),plan=planFor(ym),out=[];
if(!st.list.length)return out;
var top=Object.keys(st.by).map(function(k){return [k,st.by[k]]}).sort(function(a,b){return b[1]-a[1]});
out.push('Tu mayor gasto fue <b>'+esc(cat(top[0][0]).name)+'</b>: '+money(top[0][1])+', el '+pctStr(top[0][1]/st.total)+' del total.');
if(plan.has){
var over=[],excess=0;
spendCats().forEach(function(c){var mx=plan.income*(plan.pcts[c.id]||0)/100,sp=st.by[c.id]||0;if(sp>mx+0.005){over.push(esc(c.name));excess+=sp-mx}});
out.push(over.length?'Te pasaste en <b>'+over.join(', ')+'</b>, por '+money(excess)+' en total sobre los límites del plan.':'Has respetado el límite de todas las categorías.');
var saved=plan.income-st.total;
if(saved>=0){
out.push('Te sobraron '+money(saved)+', el '+pctStr(saved/plan.income)+' de tus ingresos. '+(saved>=plan.saving?'Cumples tu objetivo de ahorro de '+money(plan.saving)+'.':'Te faltaron '+money(plan.saving-saved)+' para tu objetivo de ahorro de '+money(plan.saving)+'.'));
}else out.push('Gastaste '+money(-saved)+' más de lo que ingresaste este mes.');
}
if(prev.list.length){
var best=null,keys={};Object.keys(st.by).concat(Object.keys(prev.by)).forEach(function(k){keys[k]=1});
Object.keys(keys).forEach(function(k){var d=(st.by[k]||0)-(prev.by[k]||0);if(!best||Math.abs(d)>Math.abs(best.d))best={k:k,d:d}});
if(best&&Math.abs(best.d)>=10)out.push('<b>'+esc(cat(best.k).name)+'</b> '+(best.d>0?'subió ':'bajó ')+money(Math.abs(best.d))+' respecto a '+esc(monthOnly(pym))+'.');
}
var small=st.list.filter(function(e){return e.share<5}),sm=0;small.forEach(function(e){sm+=e.share});
if(small.length>=5)out.push(small.length+' gastos pequeños (menos de 5 €) suman '+money(sm)+'.');
var big=st.list.slice().sort(function(a,b){return b.share-a.share})[0];
out.push('Tu gasto más grande fue <b>'+esc(big.concept)+'</b>: '+money(big.share)+'.');
if(ym===curYm()){
var d=new Date().getDate(),dim=daysIn(ym);
if(d>=3&&d<dim)out.push('A este ritmo cerrarás el mes en unos '+money(st.total/d*dim)+'.');
}
return out;
}
function viewInforme(){
var ym=S.ym,st=monthStats(ym),plan=planFor(ym);
if(!st.list.length)return '<div class="empty">Todavía no hay gastos en '+esc(monthOnly(ym))+', así que no hay informe que mostrar.</div>';
var h='<section class="sec"><h2>Informe de '+esc(monthOnly(ym))+'</h2>'+(ym===curYm()?'<p class="muted">Mes en curso: los datos son provisionales.</p>':'')+'</section>';
var days=ym===curYm()?new Date().getDate():daysIn(ym);
h+='<div class="kpis"><div class="kpi"><span class="muted">Gastado</span><b>'+money(st.total)+'</b></div>';
if(plan.has){
var sv=plan.income-st.total;
h+='<div class="kpi"><span class="muted">Ingresos</span><b>'+money(plan.income)+'</b></div>'
+'<div class="kpi"><span class="muted">'+(sv>=0?'Ahorrado':'Déficit')+'</span><b class="'+(sv<0?'bad':'')+'">'+money(Math.abs(sv))+'</b></div>';
}else{
h+='<div class="kpi"><span class="muted">Gastos</span><b>'+st.list.length+'</b></div><div class="kpi"><span class="muted">Media diaria</span><b>'+money(st.total/days)+'</b></div>';
}
h+='</div>';
var ins=insights(ym);
h+='<section class="card"><h3>Lo más destacado</h3><ul class="plain insights">'+ins.map(function(t){return '<li>'+t+'</li>'}).join('')+'</ul></section>';
var top=Object.keys(st.by).map(function(k){return [k,st.by[k]]}).sort(function(a,b){return b[1]-a[1]});
h+='<section class="card"><h3>En qué gastas tu dinero</h3>'+top.map(function(p){
var c=cat(p[0]);return '<div class="hbar"><span><span class="dot" style="background:var(--c'+c.color+');display:inline-block;margin-right:8px"></span>'+esc(c.name)+'</span><span><b>'+money(p[1])+'</b> <span class="muted">· '+pctStr(p[1]/st.total)+'</span></span>'
+'<div class="bar" style="--cc:var(--c'+c.color+')"><i style="width:'+Math.round(p[1]/top[0][1]*100)+'%"></i></div></div>';
}).join('')+'</section>';
var ch=chartHtml(ym,plan,st);
if(ch)h+='<section class="card"><h3>Cómo avanzó el mes</h3>'+ch+'</section>';
var pym=shiftYm(ym,-1),prev=monthStats(pym);
if(prev.list.length){
var keys={};Object.keys(st.by).concat(Object.keys(prev.by)).forEach(function(k){keys[k]=1});
var trs=Object.keys(keys).sort(function(a,b){return (st.by[b]||0)-(st.by[a]||0)}).map(function(k){
var a=st.by[k]||0,b=prev.by[k]||0,d=round2(a-b);
return '<tr><td>'+esc(cat(k).name)+'</td><td>'+money(a)+'</td><td>'+money(b)+'</td><td class="'+(d>0?'up':d<0?'down':'')+'">'+(d>0?'+':'')+money(d)+'</td></tr>';
}).join('');
h+='<section class="card"><h3>Frente a '+esc(monthOnly(pym))+'</h3><div class="tbl-wrap"><table><thead><tr><th>Categoría</th><th>Este mes</th><th>Anterior</th><th>Cambio</th></tr></thead><tbody>'+trs+'</tbody></table></div></section>';
}
var mer={};st.list.forEach(function(e){var k=String(e.concept).toLowerCase().trim();if(!mer[k])mer[k]={n:e.concept,s:0,c:0};mer[k].s+=e.share;mer[k].c++});
var tm=Object.keys(mer).map(function(k){return mer[k]}).sort(function(a,b){return b.s-a.s}).slice(0,5);
h+='<section class="card"><h3>Dónde más gastas</h3><ul class="plain" style="display:flex;flex-direction:column;gap:8px">'+tm.map(function(m){
return '<li style="display:flex;justify-content:space-between;gap:12px"><span style="min-width:0;overflow-wrap:anywhere">'+esc(m.n)+' <span class="muted">· '+m.c+(m.c===1?' pago':' pagos')+'</span></span><b>'+money(m.s)+'</b></li>';
}).join('')+'</ul></section>';
return h;
}
function render(){
pendingRender=false;
if(!S.cfg)return;
$('#monthLabel').textContent=yearMode()?S.ym.slice(0,4):cap(monthName(S.ym));
$$('.tabs a').forEach(function(a){if(a.getAttribute('data-tab')===S.tab)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
var v=$('#view');
v.innerHTML=S.tab==='gastos'?viewGastos():S.tab==='plan'?viewPlan():S.tab==='informe'?viewInforme():S.tab==='calendario'?viewCalendario():viewResumen();
$('.fab').hidden=S.tab==='plan';
setChip();
}
function go(tab){
if(TABS.indexOf(tab)<0)tab='resumen';
S.tab=tab;try{if(location.hash!=='#'+tab)location.hash=tab}catch(e){}
render();window.scrollTo(0,0);
}

/* ---------- hoja de gasto ---------- */
function renderChips(boxId,inputId,sel){
$('#'+boxId).innerHTML=spendCats().map(function(c){
return '<button type="button" class="chip-btn" role="radio" aria-checked="'+(c.id===sel)+'" data-a="pickCat" data-box="'+boxId+'" data-input="'+inputId+'" data-id="'+c.id+'"><i class="dot" style="background:var(--c'+c.color+')"></i><span>'+esc(c.name)+'</span></button>';
}).join('');
$('#'+inputId).value=sel;
}
function pickCategory(boxId,inputId,id){
$('#'+inputId).value=id;
$$('#'+boxId+' .chip-btn').forEach(function(b){b.setAttribute('aria-checked',String(b.getAttribute('data-id')===id))});
}
function openSheet(id,date){
if(!S.ready){toast('Conectando con tu almacén, un momento.');return}
var e=id?S.exp.filter(function(x){return x.id===id})[0]:null;
S.sheet={id:e?e.id:null};S.delArm=false;S.catTouched=!!e;
$('#sheetTitle').textContent=e?'Editar gasto':'Nuevo gasto';
renderChips('fCatChips','fCat',e?cat(e.cat).id:'otros');
$('#fAmount').value=e?fmtNum(e.amount):'';
$('#fConcept').value=e?e.concept:'';
$('#fDate').value=e?e.date:(date||(S.ym===curYm()?todayStr():S.ym+'-01'));
$('#fPeople').value=e?e.people:1;
$('#fInst').value=1;
$('#fPaste').value='';
$('#fInstWrap').hidden=!!e;
$('#pasteWrap').hidden=!!e;
$('#delRow').hidden=!e;
$('#btnDel').textContent='Eliminar';
$('#btnDelAll').hidden=true;
updatePreview();
$('#sheet').hidden=false;
if(!e)setTimeout(function(){$('#fAmount').focus()},40);
}
function closeSheet(){$('#sheet').hidden=true;S.sheet=null;if(pendingRender)render()}
function updatePreview(){
var amt=num($('#fAmount').value),p=clampInt($('#fPeople').value,1,20),n=S.sheet&&S.sheet.id?1:clampInt($('#fInst').value,1,36),t='';
if(amt>0){
var per=amt/n,share=per/p;
if(n>1)t=n+' cuotas de '+money(per)+(p>1?'. Tu parte: '+money(share)+' cada mes.':'.');
else if(p>1)t='Tu parte: '+money(share)+'. Te deben '+money(amt-share)+'.';
}
$('#fPreview').textContent=t;
}
function fillFromPaste(text){
var p=parsePaymentLine(text);
if(!p){toast('No encuentro un importe en ese texto.');return}
$('#fAmount').value=fmtNum(p.amount);$('#fConcept').value=p.concept;
pickCategory('fCatChips','fCat',guessCat(p.concept));S.catTouched=false;updatePreview();
}
async function saveForm(){
var amount=round2(num($('#fAmount').value)),concept=$('#fConcept').value.trim(),catId=$('#fCat').value,date=$('#fDate').value;
var people=clampInt($('#fPeople').value,1,20),n=clampInt($('#fInst').value,1,36);
if(!(amount>0)){toast('Escribe un importe mayor que cero.');$('#fAmount').focus();return}
if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){toast('Elige una fecha.');return}
if(!concept)concept=cat(catId).name;
var btn=$('#btnSave');btn.disabled=true;
try{
if(S.sheet&&S.sheet.id){
var old=S.exp.filter(function(x){return x.id===S.sheet.id})[0];
var upd=Object.assign({},old,{amount:amount,share:round2(amount/people),people:people,concept:concept,cat:catId,date:date,settled:people>1?!!old.settled:false});
await putExp(upd);
}else{
var amounts=splitAmount(amount,n),plan=n>1?newId():null,now=Date.now();
for(var i=0;i<n;i++){
await putExp({id:newId(),amount:amounts[i],share:round2(amounts[i]/people),people:people,concept:concept,cat:catId,date:addMonths(date,i),
inst:n>1?(i+1)+'/'+n:null,plan:plan,settled:false,src:'manual',createdAt:now+i});
}
}
learnRule(concept,catId);
closeSheet();
toast(n>1&&!(S.sheet&&S.sheet.id)?'Gasto fraccionado guardado.':'Gasto guardado.');
if(S.mode==='db')scheduleRender();
}catch(e){toast('No se pudo guardar. Comprueba tu conexión.')}
finally{btn.disabled=false}
}
async function doDelete(all){
var e=S.exp.filter(function(x){return x.id===S.sheet.id})[0];if(!e)return;
try{
if(all&&e.plan){var ids=S.exp.filter(function(x){return x.plan===e.plan}).map(function(x){return x.id});for(var i=0;i<ids.length;i++)await removeExp(ids[i])}
else await removeExp(e.id);
closeSheet();toast('Gasto eliminado.');
}catch(err){toast('No se pudo eliminar.')}
}
async function importAP(){
var box=$('#apBox');if(!box)return;
var lines=box.value.split(/\r?\n/),added=0,skipped=0,now=Date.now();
for(var i=0;i<lines.length;i++){
if(!lines[i].trim())continue;
var p=parsePaymentLine(lines[i]);
if(!p){skipped++;continue}
try{await putExp({id:newId(),amount:round2(p.amount),share:round2(p.amount),people:1,concept:p.concept,cat:guessCat(p.concept),date:todayStr(),inst:null,plan:null,settled:false,src:'applepay',createdAt:now+i});added++}
catch(e){skipped++}
}
if(added)box.value='';
toast(added?('Añadidos '+added+(added===1?' pago':' pagos')+(skipped?'. No entendí '+skipped+'.':'.')):'No pude añadir ningún pago. Revisa el formato.');
}

/* ---------- hoja de gasto fijo ---------- */
function updateFixedUi(){
var freq=$('#xFreq').value,date=$('#xDate').value,cnt=parseInt($('#xCount').value,10),t='';
$('#xCountWrap').hidden=freq==='once';
if(/^\d{4}-\d{2}-\d{2}$/.test(date)){
var d=parseInt(date.slice(8),10);
if(freq==='monthly')t='Se cobra el día '+d+' de cada mes desde el '+fmtDM(date)+(cnt>0?', en '+cnt+(cnt===1?' pago.':' pagos.'):'.')+(d>28?' En los meses más cortos se cobra el último día.':'');
else if(freq==='yearly')t='Se cobra cada año el '+fmtDM(date)+(cnt>0?', durante '+cnt+(cnt===1?' año.':' años.'):'.');
else t='Se cobra una sola vez, el '+fmtDM(date)+'.';
}
$('#xPreview').textContent=t;
}
function openFixed(id,date){
if(!S.ready){toast('Conectando con tu almacén, un momento.');return}
var f=id?S.fix.filter(function(x){return x.id===id})[0]:null;
S.fixSheet={id:f?f.id:null};S.fDelArm=false;S.xCatTouched=!!f;
$('#fixTitle').textContent=f?'Editar gasto fijo':'Nuevo gasto fijo';
$('#xName').value=f?f.name:'';
$('#xAmount').value=f?fmtNum(f.amount):'';
renderChips('xCatChips','xCat',f?cat(f.cat).id:cat('suscripciones').id);
$('#xFreq').value=f?f.freq:'monthly';
$('#xDate').value=f?f.date:(date||todayStr());
$('#xCount').value=f&&f.count?f.count:'';
$('#xRemind').value=String(f?(f.remind>=0?f.remind:-1):1);
$('#xDelRow').hidden=!f;
$('#btnXDel').textContent='Eliminar';
updateFixedUi();
$('#fixSheet').hidden=false;
if(!f)setTimeout(function(){$('#xName').focus()},40);
}
function closeFixed(){$('#fixSheet').hidden=true;S.fixSheet=null;if(pendingRender)render()}
async function saveFixed(){
var name=$('#xName').value.trim(),amount=round2(num($('#xAmount').value)),catId=$('#xCat').value,freq=$('#xFreq').value,date=$('#xDate').value;
var cnt=parseInt($('#xCount').value,10),count=freq!=='once'&&cnt>0?Math.min(cnt,360):null,remind=parseInt($('#xRemind').value,10);
if(!name){toast('Escribe un nombre.');$('#xName').focus();return}
if(!(amount>0)){toast('Escribe un importe mayor que cero.');$('#xAmount').focus();return}
if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){toast('Elige la fecha del primer cobro.');return}
var btn=$('#btnXSave');btn.disabled=true;
try{
var old=S.fixSheet&&S.fixSheet.id?S.fix.filter(function(x){return x.id===S.fixSheet.id})[0]:null;
var fields={name:name,amount:amount,cat:catId,freq:freq,date:date,count:count,remind:remind};
var obj=old?Object.assign({},old,fields):Object.assign({id:newId(),createdAt:Date.now()},fields);
await putFix(obj);
closeFixed();toast('Gasto fijo guardado.');
if(S.mode==='db')scheduleRender();
}catch(e){toast('No se pudo guardar. Comprueba tu conexión.')}
finally{btn.disabled=false}
}
function copyFixed(){
if(!S.fix.length){toast('Aún no tienes gastos fijos.');return}
var lines=S.fix.map(function(f){
var when=f.freq==='monthly'?'cada mes, día '+parseInt(f.date.slice(8),10)+', desde '+f.date:f.freq==='yearly'?'cada año, desde '+f.date:'una sola vez, '+f.date;
return f.name+' | '+fmtNum(f.amount)+' € | '+when+(f.count?' | '+f.count+' pagos':'')+' | '+(f.remind>=0?(f.remind===0?'aviso el mismo día':'aviso '+f.remind+(f.remind===1?' día antes':' días antes')):'sin aviso');
});
var txt='Mis gastos fijos para el calendario:\n'+lines.join('\n');
function fallback(){var b=$('#copyBox');if(!b)return;b.value=txt;b.hidden=false;b.focus();b.select();toast('Selecciona el texto y cópialo.')}
try{
if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(txt).then(function(){toast('Lista copiada.')},fallback);
else fallback();
}catch(e){fallback()}
}

/* ---------- hoja de dinero añadido ---------- */
function openMoney(id){
if(!S.ready){toast('Conectando con tu almacén, un momento.');return}
var d=id?S.dep.filter(function(x){return x.id===id})[0]:null;
S.moneySheet={id:d?d.id:null};S.mDelArm=false;
$('#moneyTitle').textContent=d?'Editar ingreso':'Añadir dinero';
$('#mAmount').value=d?fmtNum(d.amount):'';
$('#mNote').value=d?d.note:'';
$('#mDate').value=d?d.date:todayStr();
$('#mDelRow').hidden=!d;
$('#btnMDel').textContent='Eliminar';
$('#moneySheet').hidden=false;
if(!d)setTimeout(function(){$('#mAmount').focus()},40);
}
function closeMoney(){$('#moneySheet').hidden=true;S.moneySheet=null;if(pendingRender)render()}
async function saveMoney(){
var amount=round2(num($('#mAmount').value)),note=$('#mNote').value.trim(),date=$('#mDate').value;
if(!(amount>0)){toast('Escribe un importe mayor que cero.');$('#mAmount').focus();return}
if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){toast('Elige una fecha.');return}
var btn=$('#btnMSave');btn.disabled=true;
try{
var old=S.moneySheet&&S.moneySheet.id?S.dep.filter(function(x){return x.id===S.moneySheet.id})[0]:null;
var obj=old?Object.assign({},old,{amount:amount,note:note||'Ingreso',date:date}):{id:newId(),amount:amount,note:note||'Ingreso',date:date,createdAt:Date.now()};
await putDep(obj);
closeMoney();toast('Dinero añadido a tu cuenta.');
if(S.mode==='db')scheduleRender();
}catch(e){toast('No se pudo guardar. Comprueba tu conexión.')}
finally{btn.disabled=false}
}

/* ---------- eventos ---------- */
document.addEventListener('click',function(ev){
var tabA=ev.target.closest('a[data-tab]');
if(tabA){ev.preventDefault();go(tabA.getAttribute('data-tab'));return}
var t=ev.target.closest('[data-a]');if(!t)return;
var a=t.getAttribute('data-a'),id=t.getAttribute('data-id');
if(a==='prevMonth'){S.ym=shiftYm(S.ym,yearMode()?-12:-1);render()}
else if(a==='nextMonth'){S.ym=shiftYm(S.ym,yearMode()?12:1);render()}
else if(a==='thisMonth'){S.ym=curYm();render()}
else if(a==='add')openSheet(null,t.getAttribute('data-date'));
else if(a==='addMoney')openMoney(null);
else if(a==='editDep')openMoney(id);
else if(a==='closeMoney')closeMoney();
else if(a==='delDep'){
if(!S.mDelArm){S.mDelArm=true;$('#btnMDel').textContent='Pulsa otra vez para eliminar'}
else if(S.moneySheet&&S.moneySheet.id){removeDep(S.moneySheet.id).then(function(){closeMoney();toast('Ingreso eliminado.')}).catch(function(){toast('No se pudo eliminar.')})}
}
else if(a==='useDeposits'){ensurePlan(S.ym).income=depTotal(S.ym);touchCfg();render()}
else if(a==='addFixed')openFixed(null,t.getAttribute('data-date'));
else if(a==='editFixed')openFixed(id,null);
else if(a==='closeFixed')closeFixed();
else if(a==='delFixed'){
if(!S.fDelArm){S.fDelArm=true;$('#btnXDel').textContent='Pulsa otra vez para eliminar'}
else if(S.fixSheet&&S.fixSheet.id){removeFix(S.fixSheet.id).then(function(){closeFixed();toast('Gasto fijo eliminado.')}).catch(function(){toast('No se pudo eliminar.')})}
}
else if(a==='pickCat'){
pickCategory(t.getAttribute('data-box'),t.getAttribute('data-input'),id);
if(t.getAttribute('data-input')==='fCat')S.catTouched=true;else S.xCatTouched=true;
}
else if(a==='calMode'){S.calMode=t.getAttribute('data-m');render()}
else if(a==='pickDay'){S.calDay=t.getAttribute('data-date');render()}
else if(a==='openMonth'){S.ym=t.getAttribute('data-ym');S.calMode='month';render();window.scrollTo(0,0)}
else if(a==='copyFixed')copyFixed();
else if(a==='edit')openSheet(id);
else if(a==='closeSheet')closeSheet();
else if(a==='fillPaste')fillFromPaste($('#fPaste').value);
else if(a==='delete'){
var e=S.exp.filter(function(x){return x.id===(S.sheet&&S.sheet.id)})[0];
if(!S.delArm){S.delArm=true;$('#btnDel').textContent=e&&e.plan?'Eliminar solo esta cuota':'Pulsa otra vez para eliminar';$('#btnDelAll').hidden=!(e&&e.plan)}
else doDelete(false);
}
else if(a==='deleteAll')doDelete(true);
else if(a==='settle'){
var ex=S.exp.filter(function(x){return x.id===id})[0];
if(ex)putExp(Object.assign({},ex,{settled:true})).then(function(){toast('Marcado como cobrado.')}).catch(function(){toast('No se pudo guardar.')});
}
else if(a==='createPlan'){
var v=num(($('#income0')||{}).value);
if(!(v>0)){toast('Escribe tus ingresos del mes.');return}
ensurePlan(S.ym).income=v;touchCfg();render();
}
else if(a==='importAP')importAP();
else if(a==='goInforme'){S.ym=t.getAttribute('data-ym');go('informe')}
else if(a==='rebase'){
var prev=monthStats(shiftYm(S.ym,-1)),pl=planFor(S.ym),keep=pl.savePct,total=prev.total;
if(!(total>0))return;
var m=ensurePlan(S.ym),sc=spendCats(),sum=0,big=null;
sc.forEach(function(c){var p=Math.round((prev.by[c.id]||0)/total*(100-keep));m.pcts[c.id]=p;sum+=p;if(!big||(prev.by[c.id]||0)>(prev.by[big.id]||0))big=c});
if(big)m.pcts[big.id]+=Math.round(100-keep)-sum;
touchCfg();render();toast('Reparto basado en tu gasto real del mes anterior.');
}
else if(a==='resetPlan'){
var mm=ensurePlan(S.ym);mm.pcts={};
S.cfg.cats.forEach(function(c){var d=DEFAULT_CATS.filter(function(x){return x.id===c.id})[0];mm.pcts[c.id]=d?d.pct:0});
touchCfg();render();
}
else if(a==='addCat'){
var nameEl=$('#newCat'),name=(nameEl.value||'').trim();
if(!name){toast('Escribe un nombre para la categoría.');return}
var cid='c'+Date.now().toString(36);
S.cfg.cats.splice(S.cfg.cats.length-1,0,{id:cid,name:name.slice(0,30),color:(S.cfg.cats.length%10)+1,pct:0});
touchCfg();render();
}
else if(a==='rmCat'){
S.cfg.cats=S.cfg.cats.filter(function(c){return c.id!==id});
touchCfg();render();toast('Categoría quitada. Sus gastos pasan a Otros.');
}
});
document.addEventListener('input',function(ev){
var t=ev.target,id=t.id;
if(id==='fAmount'||id==='fPeople'||id==='fInst')updatePreview();
else if(id==='xFreq'||id==='xDate'||id==='xCount')updateFixedUi();
else if(id==='income'){
var v=num(t.value),m=ensurePlan(S.ym);m.income=v;touchCfg();
var plan=planFor(S.ym);
$$('[data-max]').forEach(function(sp){sp.textContent=plan.has?money(plan.income*(plan.pcts[sp.getAttribute('data-max')]||0)/100):'–'});
}
else if(t.getAttribute&&t.getAttribute('data-pct')){
var cid=t.getAttribute('data-pct'),m2=ensurePlan(S.ym);
m2.pcts[cid]=Math.max(0,Math.min(100,num(t.value)));touchCfg();
var pl=planFor(S.ym);
var sp=$('[data-max="'+cid+'"]');if(sp)sp.textContent=pl.has?money(pl.income*(pl.pcts[cid]||0)/100):'–';
$('#planTotal').innerHTML=planTotalHtml(S.ym);
$('#planTotal').className='total'+(planTotals(S.ym)!==100?' bad':'');
}
else if(id==='qSearch'){S.filter.q=t.value;$('#list').innerHTML=listHtml()}
});
document.addEventListener('change',function(ev){
var t=ev.target;
if(t.id==='qCat'){S.filter.cat=t.value;$('#list').innerHTML=listHtml()}
else if(t.id==='xFreq'||t.id==='xDate'||t.id==='xCount')updateFixedUi();
else if(t.id==='xName'&&!S.xCatTouched&&!(S.fixSheet&&S.fixSheet.id)){var g=guessCat(t.value);if(g!=='otros')pickCategory('xCatChips','xCat',g)}
else if(t.id==='fConcept'&&!S.catTouched&&!(S.sheet&&S.sheet.id)){pickCategory('fCatChips','fCat',guessCat(t.value))}
});
document.addEventListener('focusout',function(){setTimeout(function(){if(pendingRender)scheduleRender()},120)});
$('#expForm').addEventListener('submit',function(ev){ev.preventDefault();saveForm()});
$('#moneyForm').addEventListener('submit',function(ev){ev.preventDefault();saveMoney()});
$('#moneySheet').addEventListener('click',function(ev){if(ev.target===$('#moneySheet'))closeMoney()});
$('#fixForm').addEventListener('submit',function(ev){ev.preventDefault();saveFixed()});
$('#fixSheet').addEventListener('click',function(ev){if(ev.target===$('#fixSheet'))closeFixed()});
$('#sheet').addEventListener('click',function(ev){if(ev.target===$('#sheet'))closeSheet()});
document.addEventListener('keydown',function(ev){
if(ev.key!=='Escape')return;
if(!$('#fixSheet').hidden)closeFixed();else if(!$('#moneySheet').hidden)closeMoney();else if(!$('#sheet').hidden)closeSheet();
});
window.addEventListener('hashchange',function(){var h=location.hash.slice(1);if(h&&h!==S.tab){S.tab=TABS.indexOf(h)>=0?h:'resumen';render()}});

/* ---------- arranque ---------- */
function startLocal(){
S.mode='local';loadLocal();if(!S.cfg)S.cfg=defaultCfg();sortExp();S.ready=true;render();
}
async function init(){
S.ym=curYm();S.cfg=defaultCfg();
var h=location.hash.slice(1);if(TABS.indexOf(h)>=0)S.tab=h;
render();
var user=null;
try{
if(window.claude&&window.claude.use){
var r=await Promise.all([window.claude.use('db'),window.claude.use('user')]);
db=r[0];user=r[1];
}
}catch(e){db=null;user=null}
var uid=null;
try{uid=user?await user.id():null}catch(e){uid=null}
if(!db||!uid){startLocal();return}
try{
var base=db.doc('data/users/'+uid+'/cfg');
cfgRef=base;expCol=base.collection('expenses');depCol=base.collection('deposits');fixCol=base.collection('fixed');
S.mode='db';
var timer=setTimeout(function(){if(!S.loadedOnce){S.stale=true;S.ready=true;setChip()}},10000);
var got={cfg:false,exp:false,dep:false,fix:false};
function done(k){got[k]=true;if(got.cfg&&got.exp&&got.dep&&got.fix&&!S.loadedOnce){S.loadedOnce=true;clearTimeout(timer);S.stale=false;S.ready=true}}
cfgRef.onSnapshot(function(snap){
if(!S.cfgDirty)S.cfg=snap.exists?normCfg(snap.data()):defaultCfg();
done('cfg');scheduleRender();
},function(){toast('No se pudo leer tu plan.');startLocal()});
expCol.orderBy('date','desc').limit(1000).onSnapshot(function(q){
S.exp=q.docs.map(function(d){var o=Object.assign({},d.data());o.id=d.id;if(typeof o.share!=='number')o.share=o.amount;if(!o.people)o.people=1;return o}).filter(function(o){return o.date});
sortExp();done('exp');scheduleRender();
},function(){toast('No se pudieron leer tus gastos.')});
depCol.orderBy('date','desc').limit(1000).onSnapshot(function(q){
S.dep=q.docs.map(function(d){var o=Object.assign({},d.data());o.id=d.id;return o}).filter(function(o){return o.date&&typeof o.amount==='number'});
sortDep();done('dep');scheduleRender();
},function(){toast('No se pudo leer tu dinero añadido.')});
fixCol.limit(500).onSnapshot(function(q){
S.fix=q.docs.map(function(d){var o=Object.assign({},d.data());o.id=d.id;return o}).filter(function(o){return o.date&&o.freq&&typeof o.amount==='number'});
done('fix');scheduleRender();
},function(){toast('No se pudieron leer tus gastos fijos.')});
}catch(e){startLocal()}
}
init();
})();
