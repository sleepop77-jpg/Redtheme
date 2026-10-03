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
    var tn=$('#tb-name');if(tn)tn.textContent=state.repo?state.repo.full_name:'—';
    loadTree();
    show('dash');
  }
  var segs=document.querySelectorAll('.seg-btn');
  segs.forEach(function(s){s.addEventListener('click',function(){
    segs.forEach(function(o){o.classList.remove('active')});
    s.classList.add('active');
    var sub=document.querySelector('#view-dash .sub');
    if(sub)sub.textContent=s.textContent+' — this panel grows piece by piece.';
    document.querySelectorAll('#dash-canvas [data-seg]').forEach(function(el){el.classList.toggle('hidden',el.dataset.seg!==s.dataset.seg)});
  })});
  var sendBtn=$('#chat-send'),chatIn=$('#chat-input'),chatLog=$('#chat-log');
  function dockChat(){var c=document.getElementById('dash-canvas');if(c)c.classList.add('docked')}
  function setIdleBrand(show){
    var el=$('#idle-brand');if(!el)return;
    if(show){el.classList.remove('hidden');void el.offsetWidth;el.classList.remove('gone')}
    else if(!el.classList.contains('gone')){
      el.classList.add('gone');
      setTimeout(function(){if(el.classList.contains('gone'))el.classList.add('hidden')},400);
    }
  }
  function updateIdle(){if(chatIn&&chatLog)setIdleBrand(!chatLog.children.length&&chatIn.value.trim()==='')}
  function sendChat(){
    if(!chatIn||!sendBtn)return;
    var t=chatIn.value.trim();
    if(!t){chatIn.style.borderColor='var(--error)';setTimeout(function(){chatIn.style.borderColor=''},450);chatIn.focus();return}
    dockChat();setIdleBrand(false);
    if(/===\s*(PUSHBRIDGE|VIBEBRIDGE)\s*===/i.test(t)){chatIn.value='';armSend();pushPipeline(t);return}
    chatLog.classList.remove('hidden');
    var u=document.createElement('div');u.className='msg user';u.textContent=t;chatLog.appendChild(u);
    var b=document.createElement('div');b.className='msg bot';b.textContent='⚡ Waking up on-device AI...';chatLog.appendChild(b);
    chatLog.scrollTop=chatLog.scrollHeight;
    chatIn.value='';armSend();chatIn.focus();
    askLocalAI(t, b);
  }
  if(sendBtn)sendBtn.addEventListener('click',sendChat);
  function armSend(){if(sendBtn&&chatIn)sendBtn.classList.toggle('armed',chatIn.value.trim().length>0)}
  if(chatIn)chatIn.addEventListener('input',function(){armSend();updateIdle()});
  armSend();
  if(chatIn)chatIn.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat()}});
  /* ---- FILE TREE + IN-BROWSER EDITOR ---- */
  var openPaths={},edPath=null,lastTree=[],imgFile=null,imgDest='';
  function svgIcon(kind,color){
    var head='<svg viewBox="0 0 24 24" fill="none" stroke="'+color+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
    if(kind==='image')return head+'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
    if(kind==='code')return head+'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="10 13 8 15 10 17"/><polyline points="14 13 16 15 14 17"/></svg>';
    if(kind==='folder')return head+'<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
    return head+'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  }
  var ICON_CHEV='<svg viewBox="0 0 24 24" fill="none" stroke="#8a8562" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
  function fileIcon(name){
    var ext=(name.split('.').pop()||'').toLowerCase();
    if(['png','jpg','jpeg','gif','svg','webp','ico','bmp'].indexOf(ext)>=0)return svgIcon('image','#7DA87A');
    if(['js','jsx','mjs'].indexOf(ext)>=0)return svgIcon('code','#b7a24a');
    if(['ts','tsx'].indexOf(ext)>=0)return svgIcon('code','#6b8caf');
    if(ext==='html'||ext==='htm')return svgIcon('code','#c07a52');
    if(ext==='css'||ext==='scss')return svgIcon('code','#7a9cc6');
    if(ext==='py')return svgIcon('code','#6f9c74');
    if(ext==='md'||ext==='txt')return svgIcon('doc','#8a8562');
    if(ext==='json'||ext==='yml'||ext==='yaml')return svgIcon('doc','#a08c5b');
    return svgIcon('doc','#a7a287');
  }
  async function loadTree(){
    if(!state.repo)return;
    var R='/repos/'+state.repo.full_name;
    try{
      var ref=await apiGet(R+'/git/refs/heads/'+state.repo.branch);
      var cm=await apiGet(R+'/git/commits/'+ref.json.object.sha);
      var tr=await apiGet(R+'/git/trees/'+cm.json.tree.sha+'?recursive=1');
      lastTree=tr.json.tree;lastHeadSha=ref.json.object.sha;renderTree(tr.json.tree);maybeRebuildArtifacts();
    }catch(e){}
  }
  function renderTree(entries){
    var host=$('#file-tree');if(!host)return;host.innerHTML='';
    var root={kids:{}};
    entries.forEach(function(e){
      if(e.type!=='blob')return;
      var parts=e.path.split('/'),node=root;
      for(var i=0;i<parts.length-1;i++){node.kids[parts[i]]=node.kids[parts[i]]||{kids:{}};node=node.kids[parts[i]]}
      node.kids[parts[parts.length-1]]={file:true};
    });
    host.appendChild(buildLevel(root,''));
  }
  function buildLevel(node,prefix){
    var wrap=document.createElement('div');
    Object.keys(node.kids).sort(function(a,b){var ka=node.kids[a],kb=node.kids[b];if((ka.file?1:0)!==(kb.file?1:0))return (ka.file?1:0)-(kb.file?1:0);return a.localeCompare(b)}).forEach(function(name){
      var path=prefix?prefix+'/'+name:name,k=node.kids[name],depth=path.split('/').length-1;
      if(k.file){
        var r=document.createElement('div');r.className='tb-row file';r.style.paddingLeft=(12+16*depth)+'px';
        r.innerHTML='<span class="car"></span><span class="fic">'+fileIcon(name)+'</span>';
        r.appendChild(document.createTextNode(name));
        r.onclick=function(){openEditor(path)};
        wrap.appendChild(r);
      }else{
        var box=document.createElement('div');box.className='tb-node'+(openPaths[path]?' tb-open':'');
        var d=document.createElement('div');d.className='tb-row dir';d.style.paddingLeft=(12+16*depth)+'px';
        d.innerHTML='<span class="car">'+ICON_CHEV+'</span><span class="fic">'+svgIcon('folder','#a7a287')+'</span>';
        d.appendChild(document.createTextNode(name));
        d.onclick=function(){openPaths[path]=!openPaths[path];box.classList.toggle('tb-open')};
        var kids=document.createElement('div');kids.className='tb-kids';kids.appendChild(buildLevel(k,path));
        box.appendChild(d);box.appendChild(kids);wrap.appendChild(box);
      }
    });
    return wrap;
  }
  function openEditor(path){
    edPath=path;
    var ov=$('#editor-overlay');if(!ov)return;
    $('#ed-path').textContent=path;$('#ed-status').textContent='loading…';$('#ed-body').value='';
    ov.classList.remove('hidden');
    apiGet('/repos/'+state.repo.full_name+'/contents/'+path+'?ref='+state.repo.branch).then(function(r){
      $('#ed-body').value=b64utf8(r.json.content);
      $('#ed-status').textContent='ready — edits commit straight to '+state.repo.branch;
    }).catch(function(e){$('#ed-status').textContent='✗ '+e.message});
  }
  var contentCache={};
  async function commitEntries(files,msg){
    contentCache={};
    var R='/repos/'+state.repo.full_name,baseSha=null;
    try{var ref=await apiGet(R+'/git/refs/heads/'+state.repo.branch);baseSha=ref.json.object.sha}catch(e){}
    var baseTree=null;
    if(baseSha){var c=await apiGet(R+'/git/commits/'+baseSha);baseTree=c.json.tree.sha}
    var entries=[];
    for(var i=0;i<files.length;i++){var bl=await apiPost(R+'/git/blobs',{content:files[i].content,encoding:files[i].encoding||'utf8'});entries.push({path:files[i].path,mode:'100644',type:'blob',sha:bl.json.sha})}
    var tb={tree:entries};if(baseTree)tb.base_tree=baseTree;
    var tr=await apiPost(R+'/git/trees',tb);
    var cm=await apiPost(R+'/git/commits',{message:msg,tree:tr.json.sha,parents:baseSha?[baseSha]:[]});
    if(baseSha){await apiPatch(R+'/git/refs/heads/'+state.repo.branch,{sha:cm.json.sha})}else{await apiPost(R+'/git/refs',{ref:'refs/heads/'+state.repo.branch,sha:cm.json.sha})}
    return cm.json;
  }
  var edClose=$('#ed-close'),edSave=$('#ed-save');
  if(edClose)edClose.onclick=function(){$('#editor-overlay').classList.add('hidden')};
  if(edSave)edSave.onclick=function(){
    if(!edPath)return;
    edSave.disabled=true;$('#ed-status').textContent='committing…';
    commitEntries([{path:edPath,content:$('#ed-body').value}],'PushBridge: edit '+edPath).then(function(cm){
      $('#ed-status').textContent='✓ committed '+cm.sha.slice(0,7);loadTree();
    }).catch(function(e){$('#ed-status').textContent='✗ '+e.message}).finally(function(){edSave.disabled=false});
  };
  setInterval(function(){var v=$('#view-dash');if(v&&!v.classList.contains('hidden'))loadTree()},45000);

  /* ---- IMAGE SYSTEM ---- */
  function closeImg(){var m=$('#img-modal');if(m)m.classList.add('hidden')}
  function renderDestTree(){
    var host=$('#img-tree');if(!host)return;host.innerHTML='';
    var root=document.createElement('div');root.className='tb-row dir'+(imgDest===''?' dest-on':'');root.style.paddingLeft='8px';
    root.innerHTML='<span class="car"></span><span class="fic">'+svgIcon('folder','#a7a287')+'</span>';root.appendChild(document.createTextNode('repo root /'));
    root.onclick=function(){imgDest='';renderDestTree()};
    host.appendChild(root);
    (lastTree||[]).filter(function(e){return e.type==='tree'}).sort(function(a,b){return a.path.localeCompare(b.path)}).forEach(function(e){
      var depth=e.path.split('/').length;
      var r=document.createElement('div');r.className='tb-row dir'+(imgDest===e.path?' dest-on':'');r.style.paddingLeft=(8+16*depth)+'px';
      r.innerHTML='<span class="car"></span><span class="fic">'+svgIcon('folder','#a7a287')+'</span>';r.appendChild(document.createTextNode(e.path.split('/').pop()));
      r.onclick=function(){imgDest=e.path;renderDestTree()};
      host.appendChild(r);
    });
    var p=$('#img-path');if(p)p.textContent='→ /'+imgDest;
  }
  var imgPlus=$('#img-plus'),imgInput=$('#img-file');
  if(imgPlus)imgPlus.onclick=function(){if(imgInput)imgInput.click()};
  if(imgInput)imgInput.onchange=function(){
    var f=imgInput.files&&imgInput.files[0];if(!f)return;
    imgFile=f;
    var rn=$('#img-rename');if(rn)rn.value=f.name;
    var pv=$('#img-preview');if(pv){pv.innerHTML='';var im=document.createElement('img');im.src=URL.createObjectURL(f);var sp=document.createElement('span');sp.className='fn';sp.textContent=f.name+' · '+(f.size/1024).toFixed(1)+' KB';pv.appendChild(im);pv.appendChild(sp)}
    var m=$('#img-modal');if(m)m.classList.remove('hidden');
    renderDestTree();
  };
  var imgClose=$('#img-close');if(imgClose)imgClose.onclick=closeImg;
  var imgModal=$('#img-modal');
  if(imgModal)imgModal.addEventListener('click',function(e){if(e.target===imgModal)closeImg()});
  var imgSend=$('#img-send');
  if(imgSend)imgSend.onclick=function(){
    if(!imgFile)return;
    var name=($('#img-rename').value||'').trim()||imgFile.name;
    var path=(imgDest?imgDest+'/':'')+name;
    imgSend.disabled=true;imgSend.textContent='Pushing…';
    var fr=new FileReader();
    fr.onload=function(){
      var b64=fr.result.split(',')[1]||'';
      commitEntries([{path:path,content:b64,encoding:'base64'}],'PushBridge: add image '+path).then(function(cm){
        closeImg();dockChat();
        var b=document.createElement('div');b.className='msg bot';b.textContent='✓ image pushed → /'+path+' · commit '+cm.sha.slice(0,7);chatLog.appendChild(b);chatLog.scrollTop=chatLog.scrollHeight;
        loadTree();
      }).catch(function(e){
        var b=document.createElement('div');b.className='msg bot';b.textContent='✗ '+(e.message||e);chatLog.appendChild(b);chatLog.scrollTop=chatLog.scrollHeight;
      }).finally(function(){imgSend.disabled=false;imgSend.textContent='Send!';imgInput.value='';imgFile=null});
    };
    fr.readAsDataURL(imgFile);
  };

  /* ---- RIGHT DOCK ---- */
  var dXl=$('#dock-excel'),dCh=$('#dock-chat'),dSe=$('#dock-search');
  if(dCh)dCh.onclick=function(){if(chatIn)chatIn.focus()};

  /* ---- REPO SEARCH ---- */
  var SEARCH_EXT=/\.(js|jsx|ts|tsx|html|css|md|json|py|txt|yml|yaml|sh|csv|java|c|cpp|h|rb|go|rs|php|sql|toml|ini|cfg)$/i;
  function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
  function getFileContent(path){
    if(contentCache[path])return contentCache[path];
    return apiGet('/repos/'+state.repo.full_name+'/contents/'+path+'?ref='+state.repo.branch).then(function(r){
      contentCache[path]=b64utf8(r.json.content);return contentCache[path];
    });
  }
  function closeSearch(){var m=$('#search-modal');if(m)m.classList.add('hidden')}
  function runSearch(q){
    var host=$('#search-results'),st=$('#search-status');if(!host)return;
    host.innerHTML='';
    if(!q){st.textContent='';return}
    var files=(lastTree||[]).filter(function(e){return e.type==='blob'&&e.size<=100000&&SEARCH_EXT.test(e.path)});
    st.textContent='searching 0/'+files.length;
    var ql=q.toLowerCase(),eq=esc(q).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),rx=new RegExp(eq,'gi');
    (async function(){
      var total=0;
      for(var i=0;i<files.length;i++){
        st.textContent='searching '+(i+1)+'/'+files.length+' · '+files[i].path;
        var content;
        try{content=await getFileContent(files[i].path)}catch(e){continue}
        var lines=content.split('\n'),hits=[];
        for(var L=0;L<lines.length;L++){if(lines[L].toLowerCase().indexOf(ql)>=0)hits.push({n:L+1,t:lines[L]})}
        if(!hits.length)continue;
        total+=hits.length;
        var fh=document.createElement('div');fh.className='sr-file';
        fh.innerHTML='<span class="fic">'+fileIcon(files[i].path)+'</span><span></span><span class="cnt">'+hits.length+'</span>';
        fh.querySelector('span:nth-child(2)').textContent=files[i].path;
        host.appendChild(fh);
        hits.slice(0,40).forEach(function(h){
          var row=document.createElement('div');row.className='sr-line';
          var snip=h.t.trim();if(snip.length>140)snip=snip.slice(0,140)+'…';
          row.innerHTML='<span class="ln">'+h.n+'</span><span>'+esc(snip).replace(rx,'<mark>$&</mark>')+'</span>';
          row.onclick=function(){closeSearch();openEditor(files[i].path)};
          host.appendChild(row);
        });
      }
      st.textContent=total?total+' match(es) in '+host.querySelectorAll('.sr-file').length+' file(s)':'no matches for "'+q+'"';
    })();
  }
  if(dSe)dSe.onclick=function(){var m=$('#search-modal');if(m){m.classList.remove('hidden');var si=$('#search-input');if(si)si.focus()}};
  var seClose=$('#search-close');if(seClose)seClose.onclick=closeSearch;
  var seModal=$('#search-modal');if(seModal)seModal.addEventListener('click',function(e){if(e.target===seModal)closeSearch()});
  var seIn=$('#search-input'),seTimer=null;
  if(seIn)seIn.addEventListener('input',function(){clearTimeout(seTimer);seTimer=setTimeout(function(){runSearch(seIn.value.trim())},350)});

  /* ---- EXCEL WINDOW ---- */
  var xlBuilt=false;
  var xlSaveTimer=null;

  function saveXlWorkspace(){
    var tbl=$('#xl-grid');
    if(!tbl)return;
    var cells=[];
    for(var r=1;r<tbl.rows.length;r++){
      var row=[];
      for(var c=1;c<tbl.rows[r].cells.length;c++){
        row.push(tbl.rows[r].cells[c].textContent||'');
      }
      cells.push(row);
    }
    try{
      localStorage.setItem('pb_excel_workspace',JSON.stringify({
        name:(($('#xl-name').value||'').trim()||'sheet1.csv'),
        cells:cells,
        updatedAt:Date.now()
      }));
    }catch(e){}
  }

  function scheduleXlWorkspaceSave(){
    clearTimeout(xlSaveTimer);
    xlSaveTimer=setTimeout(saveXlWorkspace,250);
  }

  function restoreXlWorkspace(){
    var tbl=$('#xl-grid');
    if(!tbl)return;
    try{
      var raw=localStorage.getItem('pb_excel_workspace');
      if(!raw)return;
      var data=JSON.parse(raw);
      if(data.name){
        var nm=$('#xl-name');
        if(nm)nm.value=data.name;
      }
      if(!Array.isArray(data.cells))return;
      for(var r=0;r<data.cells.length&&r<tbl.rows.length-1;r++){
        for(var c=0;c<data.cells[r].length&&c<tbl.rows[r+1].cells.length-1;c++){
          tbl.rows[r+1].cells[c+1].textContent=data.cells[r][c]||'';
        }
      }
    }catch(e){}
  }

  function xlWorkspaceContext(){
    var tbl=$('#xl-grid');
    if(!tbl)return'';
    try{
      var rows=[];
      for(var r=1;r<tbl.rows.length;r++){
        var cells=tbl.rows[r].cells;
        var row=[];
        var hasData=false;
        for(var c=1;c<cells.length;c++){
          var value=(cells[c].textContent||'').replace(/\r?\n/g,' ');
          row.push(value);
          if(value.trim())hasData=true;
        }
        if(hasData)rows.push(row.join(' | '));
      }
      return rows.join('\n').slice(0,12000);
    }catch(e){
      return'';
    }
  }

  function buildXl(){
    if(xlBuilt)return;xlBuilt=true;
    var tbl=$('#xl-grid');if(!tbl)return;
    var cols='ABCDEFGHIJ'.split('');
    var html='<thead><tr><th class="corner"></th>';
    cols.forEach(function(c){html+='<th class="col">'+c+'</th>'});
    html+='</tr></thead><tbody>';
    for(var r=1;r<=50;r++){
      html+='<tr><th class="row">'+r+'</th>';
      cols.forEach(function(){html+='<td contenteditable="plaintext-only"></td>'});
      html+='</tr>';
    }
    tbl.innerHTML=html+'</tbody>';
    tbl.addEventListener('keydown',function(e){
      var td=e.target.closest?e.target.closest('td'):null;if(!td)return;
      var dr=0,dc=0;
      if(e.key==='ArrowUp')dr=-1;else if(e.key==='ArrowDown'||e.key==='Enter')dr=1;else if(e.key==='ArrowLeft')dc=-1;else if(e.key==='ArrowRight')dc=1;else return;
      e.preventDefault();
      var row=tbl.rows[td.parentElement.rowIndex+dr];if(!row)return;
      var nt=row.cells[td.cellIndex+dc];if(nt&&nt.tagName==='TD')nt.focus();
    });
  }
  function xlCSV(){
    var tbl=$('#xl-grid'),out=[];
    for(var i=1;i<tbl.rows.length;i++){
      var cells=tbl.rows[i].cells,line=[];
      for(var j=1;j<cells.length;j++){var v=(cells[j].textContent||'').replace(/\r?\n/g,' ');line.push(/[",]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v)}
      if(line.some(function(x){return x!==''}))out.push(line.join(','));
    }
    return out.join('\n');
  }
  if(dXl)dXl.onclick=function(){buildXl();var o=$('#xl-overlay');if(o)o.classList.remove('hidden')};
  var xlClose=$('#xl-close');if(xlClose)xlClose.onclick=function(){var o=$('#xl-overlay');if(o)o.classList.add('hidden')};
  var xlName=$('#xl-name');
  if(xlName)xlName.addEventListener('input',function(){scheduleXlWorkspaceSave()});

  var xlSave=$('#xl-save');
  if(xlSave)xlSave.onclick=function(){
    saveXlWorkspace();
    $('#xl-status').textContent='✓ spreadsheet saved to private workspace · not committed to GitHub';
  };

  var xlCommit=$('#xl-commit');
  if(xlCommit)xlCommit.onclick=function(){
    var name=($('#xl-name').value||'').trim()||'sheet1.csv';
    if(!/\.csv$/i.test(name))name+='.csv';
    saveXlWorkspace();
    xlCommit.disabled=true;
    $('#xl-status').textContent='committing explicitly to GitHub…';
    commitEntries([{path:name,content:xlCSV()}],'PushBridge: excel '+name).then(function(cm){
      $('#xl-status').textContent='✓ explicitly committed '+cm.sha.slice(0,7)+' → /'+name;
      dockChat();
      var b=document.createElement('div');b.className='msg bot';b.textContent='✓ spreadsheet explicitly pushed → /'+name+' · commit '+cm.sha.slice(0,7);chatLog.appendChild(b);chatLog.scrollTop=chatLog.scrollHeight;
      loadTree();
    }).catch(function(e){$('#xl-status').textContent='✗ '+e.message}).finally(function(){xlCommit.disabled=false});
  };

  /* ---- DOWNLOADS: ZIP + MD (cached, always warm) ---- */
  var lastHeadSha='',artSha='',mdCache=null,zipCache=null,artBusy=false;
  function dlBubble(msg){dockChat();var b=document.createElement('div');b.className='msg bot';b.textContent=msg;chatLog.appendChild(b);chatLog.scrollTop=chatLog.scrollHeight;return b}
  function saveBlob(blob,name){var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href)},5000)}
  async function buildMD(){
    var files=(lastTree||[]).filter(function(e){return e.type==='blob'&&e.size<=100000&&SEARCH_EXT.test(e.path)});
    var out='# '+state.repo.full_name+'\n\n> Exported by PushBridge · branch '+state.repo.branch+' · '+new Date().toISOString()+'\n\n';
    for(var i=0;i<files.length;i++){
      var c;try{c=await getFileContent(files[i].path)}catch(e){continue}
      var ext=(files[i].path.split('.').pop()||'').toLowerCase();
      out+='## '+files[i].path+'\n\n```'+ext+'\n'+c.split('```').join('`‌`‌`')+'\n```\n\n';
    }
    return out;
  }
  var CRC_T=(function(){var t=new Uint32Array(256);for(var n=0;n<256;n++){var c=n;for(var k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c}return t})();
  function crc32(b){var c=0xFFFFFFFF;for(var i=0;i<b.length;i++)c=CRC_T[(c^b[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
  function b64bytes(b64){var s=atob(b64.replace(/\n/g,''));var u=new Uint8Array(s.length);for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u}
  function zipBlob(list){
    var enc=new TextEncoder(),chunks=[],central=[],offset=0;
    list.forEach(function(e){
      var nameB=enc.encode(e.name),crc=crc32(e.bytes);
      var lh=new Uint8Array(30+nameB.length),dv=new DataView(lh.buffer);
      dv.setUint32(0,0x04034b50,true);dv.setUint16(4,20,true);dv.setUint16(6,0x0800,true);dv.setUint16(8,0,true);dv.setUint16(10,0,true);dv.setUint16(12,0x5421,true);
      dv.setUint32(14,crc,true);dv.setUint32(18,e.bytes.length,true);dv.setUint32(22,e.bytes.length,true);dv.setUint16(26,nameB.length,true);dv.setUint16(28,0,true);
      lh.set(nameB,30);chunks.push(lh,e.bytes);
      central.push({nameB:nameB,crc:crc,size:e.bytes.length,offset:offset});
      offset+=lh.length+e.bytes.length;
    });
    var cdStart=offset;
    central.forEach(function(c){
      var ch=new Uint8Array(46+c.nameB.length),dv=new DataView(ch.buffer);
      dv.setUint32(0,0x02014b50,true);dv.setUint16(4,20,true);dv.setUint16(6,20,true);dv.setUint16(8,0x0800,true);dv.setUint16(10,0,true);dv.setUint16(12,0,true);dv.setUint16(14,0x5421,true);
      dv.setUint32(16,c.crc,true);dv.setUint32(20,c.size,true);dv.setUint32(24,c.size,true);dv.setUint16(28,c.nameB.length,true);dv.setUint32(42,c.offset,true);
      ch.set(c.nameB,46);chunks.push(ch);offset+=ch.length;
    });
    var eocd=new Uint8Array(22),dv2=new DataView(eocd.buffer);
    dv2.setUint32(0,0x06054b50,true);dv2.setUint16(8,central.length,true);dv2.setUint16(10,central.length,true);dv2.setUint32(12,offset-cdStart,true);dv2.setUint32(16,cdStart,true);
    chunks.push(eocd);
    return new Blob(chunks,{type:'application/zip'});
  }
  async function buildZIP(prog){
    var files=(lastTree||[]).filter(function(e){return e.type==='blob'&&e.size<=1000000}).slice(0,300);
    var list=[];
    for(var i=0;i<files.length;i++){
      if(prog)prog(i+1,files.length,files[i].path);
      try{var r=await apiGet('/repos/'+state.repo.full_name+'/contents/'+files[i].path+'?ref='+state.repo.branch);list.push({name:files[i].path,bytes:b64bytes(r.json.content)})}catch(e){}
    }
    return zipBlob(list);
  }
  function maybeRebuildArtifacts(){
    if(!lastHeadSha||lastHeadSha===artSha||artBusy)return;
    artBusy=true;var target=lastHeadSha;
    (async function(){
      try{mdCache=new Blob([await buildMD()],{type:'text/markdown'})}catch(e){}
      try{zipCache=await buildZIP()}catch(e){}
      if(target===lastHeadSha)artSha=target;
      artBusy=false;
      if(lastHeadSha!==artSha)maybeRebuildArtifacts();
    })();
  }
  var dZip=$('#dock-zip');
  if(dZip)dZip.onclick=function(){
    var name=state.repo.name+'-'+state.repo.branch+'.zip';
    if(zipCache&&artSha===lastHeadSha){saveBlob(zipCache,name);dlBubble('✓ zip served from cache · '+(zipCache.size/1024).toFixed(0)+' KB');return}
    var b=dlBubble('zipping '+state.repo.full_name+'…');
    buildZIP(function(i,n,p){b.textContent='zipping '+i+'/'+n+' · '+p}).then(function(blob){
      zipCache=blob;if(lastHeadSha)artSha=lastHeadSha;
      saveBlob(blob,name);
      b.textContent='✓ zip downloaded · '+(blob.size/1024).toFixed(0)+' KB';
    }).catch(function(e){b.textContent='✗ '+e.message});
  };
  var dMd=$('#dock-md');
  if(dMd)dMd.onclick=function(){
    var name=state.repo.name+'-pushbridge.md';
    if(mdCache&&artSha===lastHeadSha){saveBlob(mdCache,name);dlBubble('✓ markdown served from cache · '+(mdCache.size/1024).toFixed(0)+' KB');return}
    var b=dlBubble('building markdown export…');
    buildMD().then(function(out){
      var blob=new Blob([out],{type:'text/markdown'});mdCache=blob;if(lastHeadSha)artSha=lastHeadSha;
      saveBlob(blob,name);
      b.textContent='✓ markdown exported · '+(blob.size/1024).toFixed(0)+' KB';
    }).catch(function(e){b.textContent='✗ '+e.message});
  };


  /* ---- ON-DEVICE AI (QWEN 2.5 1.5B via WebLLM) ---- */
  var mlcEngine = null;
  var engineState = 'null';
  var engineInitPromise = null;
  var generationQueue = Promise.resolve();
  var aiHistory = [];
  var MODEL_PREFS=[/qwen2\.5[-.]?1\.5b/i,/qwen2\.5[-.]?0\.5b/i,/qwen/i,/llama-3\.2-1b/i,/smollm2/i,/tinyllama/i];
  var MODEL_FALLBACK=['Qwen2.5-1.5B-Instruct-q4f16_1','Qwen2.5-0.5B-Instruct-q4f16_1','Qwen2-1.5B-Instruct-q4f16_1','Llama-3.2-1B-Instruct-q4f16_1','SmolLM2-1.7B-Instruct-q4f16_1','TinyLlama-1.1B-Chat-v1.0-q4f16_1'];
  var chosenModel='';
  function resolveModelId(webllm){
    var list=null;
    try{
      var pc=webllm.prebuiltAppConfig||(webllm.default&&webllm.default.prebuiltAppConfig);
      if(pc&&pc.model_list)list=pc.model_list.map(function(m){return m.model_id||m.model});
    }catch(e){}
    if(list&&list.length){
      for(var i=0;i<MODEL_PREFS.length;i++){
        for(var j=0;j<list.length;j++){if(MODEL_PREFS[i].test(list[j]))return list[j]}
      }
      return list[0];
    }
    return null;
  }
  async function resetLocalEngine(logFn) {
    if (logFn) logFn('⚡ Resetting AI engine...');
    var oldEngine = mlcEngine;
    mlcEngine = null;
    engineState = 'null';
    engineInitPromise = null;
    if (oldEngine) {
      try {
        if (typeof oldEngine.unload === 'function') await oldEngine.unload();
        else if (typeof oldEngine.dispose === 'function') oldEngine.dispose();
      } catch (e) {}
    }
  }
  async function getLocalEngine(logFn) {
    if (engineState === 'ready' && mlcEngine) return mlcEngine;
    if (engineState === 'loading' && engineInitPromise) return engineInitPromise;
    engineState = 'loading';
    engineInitPromise = (async () => {
      try {
        logFn('🔍 Checking WebGPU capabilities...');
        if (!navigator.gpu) {
          throw new Error('WEBGPU_UNAVAILABLE');
        }

        logFn('✓ WebGPU API available: yes');

        var adapter = null;
        var adapterMode = '';
        var adapterErrors = [];

        try {
          logFn('🔎 Trying high-performance GPU adapter...');
          adapter = await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
          if (adapter) {
            adapterMode = 'high-performance';
          }
        } catch (e) {
          adapterErrors.push('high-performance: '+(e.message||String(e)));
        }

        if (!adapter) {
          try {
            logFn('🔎 High-performance adapter unavailable — trying default adapter...');
            adapter = await navigator.gpu.requestAdapter();
            if (adapter) {
              adapterMode = 'default';
            }
          } catch (e) {
            adapterErrors.push('default: '+(e.message||String(e)));
          }
        }

        if (!adapter) {
          var detail=adapterErrors.length
            ? ' Details: '+adapterErrors.join(' | ')
            : '';
          throw new Error('WEBGPU_NO_ADAPTER'+detail);
        }

        var adapterInfo='';
        try {
          var info=adapter.info||{};
          var parts=[info.vendor,info.architecture,info.device,info.description].filter(function(v){return v});
          if(parts.length)adapterInfo=' · '+parts.join(' / ');
        } catch(e){}

        logFn('✓ Compatible GPU adapter found: '+adapterMode+adapterInfo);

        logFn('⚡ Importing WebLLM engine...');
        const webllm = await import("https://esm.run/@mlc-ai/web-llm");
        const picked = resolveModelId(webllm);
        const candidates = picked ? [picked].concat(MODEL_FALLBACK.filter(function(m){return m!==picked})) : MODEL_FALLBACK;
        const initProgressCallback = (report) => {
          if (report.text) logFn('⚡ ' + report.text);
        };
        var lastErr=null;
        for (var k=0;k<candidates.length;k++){
          try {
            logFn('⚡ Loading on-device model: ' + candidates[k] + ' (cached after first download)...');
            mlcEngine = await webllm.CreateMLCEngine(candidates[k], { initProgressCallback: initProgressCallback });
            chosenModel = candidates[k];
            logFn('✓ Device creation succeeded: yes');
            logFn('🧠 Selected model: ' + chosenModel);
            break;
          } catch (err) {
            var msg = err.message || String(err);
            if (/Unable to find a compatible GPU/i.test(msg) || /No compatible GPU/i.test(msg) || /Failed to request device/i.test(msg)) {
              throw new Error('WEBGPU_DEVICE_FAILED');
            }
            lastErr=err;
            if (/Cannot find model record/i.test(msg)) continue;
            throw err;
          }
        }
        if (!mlcEngine) throw lastErr || new Error('no usable on-device model in this WebLLM build');
        engineState = 'ready';
        return mlcEngine;
      } catch (err) {
        engineState = 'failed';
        mlcEngine = null;
        var msg = err.message || String(err);
        var userMsg = '';
        if (msg === 'WEBGPU_UNAVAILABLE') {
          userMsg = 'WebGPU is not available in this browser. Local AI requires a browser with WebGPU support.';
        } else if (msg === 'WEBGPU_ADAPTER_FAILED' || msg === 'WEBGPU_NO_ADAPTER') {
          userMsg = 'WebGPU is available but no compatible GPU adapter could be initialized. Please enable hardware acceleration.';
        } else if (msg === 'WEBGPU_DEVICE_FAILED') {
          userMsg = 'Unable to find a compatible GPU. WebGPU device creation failed. Ensure hardware acceleration is enabled.';
        } else {
          userMsg = 'AI Engine failed: ' + msg;
        }
        logFn('✗ ' + userMsg);
        throw new Error(userMsg);
      }
    })();
    return engineInitPromise;
  }
  function showThinking(b){
    b.innerHTML='<span class="think-row"><span class="think-logo"><img src="logo.png" alt="" onerror="this.style.display=\'none\'"></span>'+
      '<span class="think-txt">Thinking<span class="think-dots"><span>.</span><span>.</span><span>.</span></span></span></span>';
    chatLog.scrollTop=chatLog.scrollHeight;
  }
  async function runGeneration(engine, messages, botBubble, logFn) {
    showThinking(botBubble);
    const chunks = await engine.chat.completions.create({
      messages: messages,
      stream: true,
      temperature: 0.7
    });
    var fullReply = "";
    botBubble.textContent = "";
    for await (const chunk of chunks) {
      const curDelta = chunk.choices[0].delta.content;
      if (curDelta) {
        fullReply += curDelta;
        botBubble.textContent = fullReply;
        chatLog.scrollTop = chatLog.scrollHeight;
      }
    }
    return fullReply;
  }
  async function askLocalAI(question, botBubble) {
    var logFn = function(msg) { botBubble.textContent = msg; chatLog.scrollTop = chatLog.scrollHeight; };
    generationQueue = generationQueue.then(async () => {
      var sysPrompt = "You are PushBridge AI, an expert coding assistant running locally in the browser. The user is working on a GitHub repository.\nFile structure:\n";
      var excelContext=xlWorkspaceContext();
      if(excelContext){
        sysPrompt+="\nWorkspace Excel data (PRIVATE, NOT committed to GitHub):\n"+excelContext+"\n";
      }
      var blobs = (lastTree || []).filter(function(e){return e.type==='blob' && SEARCH_EXT.test(e.path) && e.size <= 100000});
      if (blobs.length > 0) {
        sysPrompt += blobs.map(function(e){return e.path}).slice(0, 120).join("\n") + "\n";
      }
      var terms = (question.toLowerCase().match(/[a-z0-9_]{3,}/g) || []).filter(function(v,i,a){return a.indexOf(v)===i}).slice(0, 5);
      var scored = [];
      for (var i = 0; i < Math.min(blobs.length, 25); i++) {
        var content = "";
        try { content = await getFileContent(blobs[i].path); } catch(e) { continue; }
        var lc = content.toLowerCase();
        var score = 0;
        if (blobs[i].path.toLowerCase().indexOf("readme") >= 0) score += 5;
        terms.forEach(function(t) {
          if (blobs[i].path.toLowerCase().indexOf(t) >= 0) score += 3;
          if (lc.indexOf(t) >= 0) score += 1;
        });
        if (score > 0) scored.push({path: blobs[i].path, score: score, content: content});
      }
      scored.sort(function(a,b){return b.score - a.score});
      if (scored.length > 0) {
        sysPrompt += "Most relevant file contents:\n";
        scored.slice(0, 2).forEach(function(f) {
          sysPrompt += "\n=== " + f.path + " ===\n" + f.content.slice(0, 2000) + "\n";
        });
      }
      sysPrompt += "\nYou also control a private Excel workspace inside PushBridge.";
      sysPrompt += "\nIf the user says things such as 'type this in the spreadsheet', 'put this in Excel', 'enter this into the sheet', 'fill the spreadsheet', 'add this to the sheet', or asks you to create or modify spreadsheet data, treat that as an instruction to actually modify the spreadsheet.";
      sysPrompt += "\nWhen such a request is made, do NOT merely describe the data in chat.";
      sysPrompt += "\nOutput the spreadsheet operation using this exact machine-readable format:";
      sysPrompt += "\n===PUSHBRIDGE-EXCEL=== v1";
      sysPrompt += "\nROW 1: value1 | value2 | value3";
      sysPrompt += "\nSET A1: value";
      sysPrompt += "\nAPPEND ROW: value1 | value2 | value3";
      sysPrompt += "\nCLEAR A1";
      sysPrompt += "\nEND";
      sysPrompt += "\nThe Excel workspace is private and must never be committed to GitHub unless the user explicitly asks for that.";
      sysPrompt += "\nAnswer the user's questions about their code concisely using the provided file contents. If they ask you to write or fix code, provide the raw code blocks.";
      aiHistory.push({ role: "user", content: question });
      if (aiHistory.length > 10) aiHistory = aiHistory.slice(-10);
      var messages = [{ role: "system", content: sysPrompt }, ...aiHistory];
      var success = false;
      var finalError = null;
      for (var attempt = 0; attempt < 2; attempt++) {
        try {
          var engine = await getLocalEngine(logFn);
          var fullReply = await runGeneration(engine, messages, botBubble, logFn);
          var excelActionResult=applyAIExcelActions(fullReply);
          if(excelActionResult.count){
            logFn(fullReply + "\n\n✓ Excel workspace updated: "+excelActionResult.count+" cell change(s)");
          }
          aiHistory.push({ role: "assistant", content: fullReply });
          success = true;
          break;
        } catch (e) {
          finalError = e;
          var msg = e.message || String(e);
          var isFatalWebGPU = /WebGPU is not available/i.test(msg) || /no compatible GPU adapter/i.test(msg) || /Unable to find a compatible GPU/i.test(msg) || /WebGPU device creation failed/i.test(msg);
          var isRecoverable = !isFatalWebGPU && (/Object has already been disposed/i.test(msg) || /Model not loaded/i.test(msg) || /device lost/i.test(msg));
          if (isRecoverable && attempt === 0) {
            logFn('⚡ Engine lost detected. Resetting and retrying...');
            await resetLocalEngine(logFn);
            continue;
          }
          break;
        }
      }
      if (!success) {
        aiHistory.pop();
        botBubble.textContent = '✗ AI Error: ' + (finalError ? finalError.message : 'Unknown error');
      }
    }).catch(function(e) {
      botBubble.textContent = '✗ AI Error: ' + (e.message || e);
    });
  }

  /* ---- PUSHBRIDGE CORE ENGINE ---- */
  function apiReq(method,path,body){
    return fetch('https://api.github.com'+path,{method:method,headers:{Authorization:'Bearer '+state.pat,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined})
      .then(function(res){if(!res.ok){var e=new Error('HTTP '+res.status);e.code=res.status;throw e}return res.json().then(function(j){return{json:j}})});
  }
  function apiPost(path,body){return apiReq('POST',path,body)}
  function apiPatch(path,body){return apiReq('PATCH',path,body)}
  function b64utf8(b64){return decodeURIComponent(escape(atob(b64.replace(/\n/g,''))))}
  function histPush(){try{return JSON.parse(localStorage.getItem('pb_history')||'[]')}catch(e){return[]}}
  function parsePayload(text){
    var lines=text.replace(/\r\n/g,'\n').split('\n'),ops=[],cur=null,mode=null,hunk=null;
    for(var i=0;i<lines.length;i++){
      var m=lines[i].match(/^=====\s*(FILE|EDIT|DELETE):\s*(.+?)\s*=====$/);
      if(m){
        if(cur && cur.type==='EDIT' && hunk){cur.hunks.push(hunk);hunk=null;mode='await';}
        if(cur)ops.push(cur);
        cur={type:m[1],path:m[2],content:'',hunks:[]};
        mode=(m[1]==='EDIT'?'await':'content');
        continue;
      }
      if(!cur)continue;
      if(cur.type==='EDIT'){
        if(/^(?:---\s*FIND\s*|FIND:\s*)$/.test(lines[i])){hunk={find:'',replace:''};mode='find';continue}
        if(/^(?:---\s*REPLACE\s*|REPLACE:\s*)$/.test(lines[i])){mode='replace';continue}
        if(/^(?:---\s*END\s*|END\s*)$/.test(lines[i])){if(hunk)cur.hunks.push(hunk);hunk=null;mode='await';continue}
        if(hunk){if(mode==='find')hunk.find+=lines[i]+'\n';else if(mode==='replace')hunk.replace+=lines[i]+'\n'}
        continue;
      }
      cur.content+=lines[i]+'\n';
    }
    if(cur && cur.type==='EDIT' && hunk)cur.hunks.push(hunk);
    if(cur)ops.push(cur);
    ops.forEach(function(o){
      o.content=o.content.replace(/\n$/,'');
      o.hunks.forEach(function(h){h.find=h.find.replace(/\n$/,'');h.replace=h.replace.replace(/\n$/,'')});
    });
    if(!ops.length)throw new Error('no FILE/EDIT/DELETE ops found in payload');
    ops.forEach(function(o){
      if(o.type==='EDIT' && (!o.hunks || !o.hunks.length))throw new Error('EDIT has no valid FIND/REPLACE hunks: '+o.path);
    });
    return ops;
  }
  function applyHunks(content,hunks){
    if(!hunks || !hunks.length)throw new Error('EDIT has no valid FIND/REPLACE hunks');
    for(var i=0;i<hunks.length;i++){
      var idx=content.indexOf(hunks[i].find);
      if(idx<0)throw new Error('FIND block not found (hunk '+(i+1)+')');
      content=content.slice(0,idx)+hunks[i].replace+content.slice(idx+hunks[i].find.length);
    }
    return content;
  }
  function pushPipeline(text){
    chatLog.classList.remove('hidden');
    var b=document.createElement('div');b.className='msg bot';b.textContent='PushBridge: parsing…';chatLog.appendChild(b);
    var log=function(s){b.textContent=s;chatLog.scrollTop=chatLog.scrollHeight};
    sendBtn.disabled=true;
    var ops;
    try{ops=parsePayload(text)}catch(e){log('✗ '+e.message);sendBtn.disabled=false;return}
    log('PushBridge: '+ops.length+' op(s) → '+state.repo.full_name+' @ '+state.repo.branch);
    var R='/repos/'+state.repo.full_name;
    (async function(){
      try{
        var baseSha=null;
        try{var ref=await apiReq('GET',R+'/git/refs/heads/'+state.repo.branch);baseSha=ref.json.object.sha}catch(e){}
        log('Base: '+(baseSha?baseSha.slice(0,7):'no branch yet — will create orphan'));
        var baseTree=null;
        if(baseSha){var c=await apiReq('GET',R+'/git/commits/'+baseSha);baseTree=c.json.tree.sha}
        var entries=[];
        for(var i=0;i<ops.length;i++){
          var op=ops[i];
          log((i+1)+'/'+ops.length+' · '+op.type+' '+op.path);
          if(op.type==='DELETE'){entries.push({path:op.path,mode:'100644',type:'blob',sha:null});continue}
          var content=op.content;
          if(op.type==='EDIT'){
            var cur=await apiReq('GET',R+'/contents/'+op.path+'?ref='+state.repo.branch);
            content=applyHunks(b64utf8(cur.json.content),op.hunks);
          }
          var bl=await apiPost(R+'/git/blobs',{content:content,encoding:'utf8'});
          entries.push({path:op.path,mode:'100644',type:'blob',sha:bl.json.sha});
        }
        var treeBody={tree:entries};if(baseTree)treeBody.base_tree=baseTree;
        var tr=await apiPost(R+'/git/trees',treeBody);
        var cm=await apiPost(R+'/git/commits',{message:'PushBridge: '+ops.length+' file update(s)',tree:tr.json.sha,parents:baseSha?[baseSha]:[]});
        if(baseSha){await apiPatch(R+'/git/refs/heads/'+state.repo.branch,{sha:cm.json.sha})}
        else{await apiPost(R+'/git/refs',{ref:'refs/heads/'+state.repo.branch,sha:cm.json.sha})}
        var h=histPush();h.unshift({repo:state.repo.full_name,at:Date.now(),files:ops.length,ok:true,commit:cm.json.sha});
        localStorage.setItem('pb_history',JSON.stringify(h.slice(0,50)));
        if(typeof logPayloadToExcel==='function')logPayloadToExcel(ops,cm.json.sha,text);
        log('✓ Pushed '+ops.length+' file(s) · commit '+cm.json.sha.slice(0,7)+' · '+cm.json.html_url);
      }catch(e){log('✗ '+(e.message||e))}
      finally{sendBtn.disabled=false;chatLog.scrollTop=chatLog.scrollHeight;loadTree()}
    })();
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
