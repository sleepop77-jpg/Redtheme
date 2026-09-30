// PyBridge · auth → repo picker (with live push probe + scope readout) → dashboard placeholder
(function(){
if(window.__pyBridge)return;
window.__pyBridge=true;
var $=function(s){return document.querySelector(s)};
var state={pat:'',user:null,repo:null,scopes:null};
try{var a=JSON.parse(localStorage.getItem('pb_auth')||'null');if(a){state.pat=a.pat;state.user=a.user}}catch(e){}
try{var r=JSON.parse(localStorage.getItem('pb_repo')||'null');if(r)state.repo=r}catch(e){}
var split=document.querySelector('.split');
var viewRepos=$('#view-repos'),viewDash=$('#view-dash');
  var current=null,busy=false,pending=null;
  var screens={login:split,repos:viewRepos,dash:viewDash};
  function hideNow(el){if(el===split)el.style.display='none';else el.classList.add('hidden')}
  function reveal(el){
    if(el===split)el.style.display='';else el.classList.remove('hidden');
    el.classList.add('entering');
    void el.offsetWidth;
    requestAnimationFrame(function(){el.classList.remove('entering')});
  }
  function show(which){
    if(!screens[which])return;
    if(busy){pending=which;return}
    var next=screens[which],prev=current;current=which;
    if(!prev||prev===which){reveal(next);return}
    busy=true;
    var prevEl=screens[prev];
    prevEl.classList.add('leaving');
    setTimeout(function(){
      prevEl.classList.remove('leaving');
      hideNow(prevEl);
      reveal(next);
      busy=false;
      if(pending){var p=pending;pending=null;show(p)}
    },430);
  }
function apiGet(path){
return fetch('https://api.github.com'+path,{headers:{Authorization:'Bearer '+state.pat,Accept:'application/vnd.github+json'}})
.then(function(res){
if(!res.ok){var e=new Error('HTTP '+res.status);e.code=res.status;e.headers=res.headers;throw e}
return res.json().then(function(json){return {json:json,headers:res.headers}});
});
}
/* ---- LOGIN ---- */
var form=$('#auth-form');
if(form)form.addEventListener('submit',function(e){
e.preventDefault();
    var pat=$('#pat-input').value.trim();if(!pat)return;
    var btn=$('#connect-btn'),st=$('#status-msg');
    btn.disabled=true;btn.textContent='Verifying…';st.classList.add('hidden');
    state.pat=pat;
    apiGet('/user').then(function(r){
      state.user=r.json;state.scopes=r.headers.get('x-oauth-scopes');
localStorage.setItem('pb_auth',JSON.stringify({pat:pat,user:r.json}));
if(state.repo)enterDash();else show('repos');
}).catch(function(err){
st.textContent='Connection failed: '+err.message;st.className='status error';
}).finally(function(){btn.disabled=false;btn.textContent='Connect Account →'});
});
/* ---- PICKER ---- */
var repos=[],selected=null,probeOk=false;
var trigger=$('#repo-open'),card=$('#picker-card'),list=$('#repo-list'),search=$('#repo-search'),
cont=$('#repo-continue'),probe=$('#repo-probe'),scopeLine=$('#scope-line');
function ago(iso){var d=(Date.now()-new Date(iso).getTime())/1000;
if(d<3600)return Math.max(1,Math.round(d/60))+'m ago';
if(d<86400)return Math.round(d/3600)+'h ago';
return Math.round(d/86400)+'d ago'}
function renderList(q){
q=(q||'').toLowerCase();list.innerHTML='';
var shown=0;
repos.forEach(function(rp){
if(q&&rp.full_name.toLowerCase().indexOf(q)<0)return;
if(shown++>=30)return;
var row=document.createElement('div');
row.className='repo-row'+(selected&&selected.full_name===rp.full_name?' sel':'');
row.innerHTML='<span class="ic">▤</span>'+
'<span class="body"><span class="nm"></span><span class="ds"></span></span>'+
'<span class="mt"></span><span class="chk">✓</span>';
row.querySelector('.nm').textContent=rp.name;
row.querySelector('.ds').textContent=rp.description||'no description';
row.querySelector('.mt').innerHTML=(rp.language||'—')+'<br>'+ago(rp.updated_at);
row.onclick=function(){selected=rp;renderList(search.value);probeRepo(rp)};
list.appendChild(row);
});
if(!shown)list.innerHTML='<div class="status">no repos match.</div>';
}
if(trigger)trigger.addEventListener('click',function(){
trigger.classList.add('hidden');card.classList.remove('hidden');
list.innerHTML='<div class="status">loading your repositories…</div>';
apiGet('/user/repos?affiliation=owner&sort=updated&per_page=60').then(function(r){
repos=r.json;renderList('');
}).catch(function(e){
list.innerHTML='';probe.className='status error';probe.classList.remove('hidden');
probe.textContent='could not list repos: '+e.message;
});
});
if(search)search.addEventListener('input',function(){renderList(search.value)});
function probeRepo(rp){
probeOk=false;cont.disabled=true;
probe.classList.remove('hidden');probe.className='status';
probe.textContent='probing '+rp.full_name+'…';
var scopeP=Promise.resolve();
if(state.scopes==null)scopeP=apiGet('/user').then(function(r){state.scopes=r.headers.get('x-oauth-scopes')}).catch(function(){});
scopeP.then(function(){
if(state.scopes){
scopeLine.classList.remove('hidden');
scopeLine.innerHTML='PAT scopes: '+state.scopes.split(',').map(function(s){return '<span class="scope-chip">'+s.trim()+'</span>'}).join('');
}else{
scopeLine.classList.remove('hidden');
scopeLine.innerHTML='<span class="scope-chip">fine-grained token</span> scopes not exposed by GitHub — the live probe below is the source of truth.';
}
return apiGet('/repos/'+rp.full_name);
}).then(function(r){
var j=r.json;
if(j.archived){probe.className='status error';probe.textContent='✗ '+rp.full_name+' is archived — GitHub rejects all pushes.';return}
var perms=j.permissions||{};
if(!perms.push){probe.className='status error';probe.textContent='✗ token sees this repo but CANNOT push (read-only). Use a classic PAT with repo scope, or grant Contents: Read & write.';return}
var branch=rp.default_branch||'main',note='';
return apiGet('/repos/'+rp.full_name+'/git/ref/heads/'+branch).catch(function(){note=' · branch '+branch+' will be created on first push'}).then(function(){
probeOk=true;cont.disabled=false;
probe.className='status success';
probe.textContent='✓ connection valid — push will work on '+rp.full_name+note;
});
}).catch(function(e){
probe.className='status error';
probe.textContent=(e.code===404)
?'✗ PAT does not correspond to this repo (404): the token can\'t see it — wrong account or missing access.'
:'✗ probe failed: '+e.message;
});
}
if(cont)cont.addEventListener('click',function(){
if(!probeOk||!selected)return;
state.repo={full_name:selected.full_name,branch:selected.default_branch||'main'};
localStorage.setItem('pb_repo',JSON.stringify(state.repo));
enterDash();
});
/* ---- DASHBOARD PLACEHOLDER ---- */
function enterDash(){
var t=$('#dash-title'),p=$('#dash-probe');
if(t)t.textContent=state.repo?state.repo.full_name:'—';
if(p){p.className='status success';p.textContent='✓ push verified · branch '+(state.repo?state.repo.branch:'—')}
show('dash');
}
var sw=$('#dash-switch');
var bRepos=$('#back-repos'),bDash=$('#back-dash');
if(bRepos)bRepos.addEventListener('click',function(){show('login')});
if(bDash)bDash.addEventListener('click',function(){show('repos')});
if(sw)sw.addEventListener('click',function(){
localStorage.removeItem('pb_repo');state.repo=null;selected=null;probeOk=false;
cont.disabled=true;card.classList.add('hidden');trigger.classList.remove('hidden');
probe.classList.add('hidden');scopeLine.classList.add('hidden');
show('repos');
});
/* ---- BOOT ---- */
if(state.pat&&state.user){if(state.repo)enterDash();else show('repos')}
else show('login');
})();
