/* global OBSWebSocket */
const SETTINGS_KEY='obs-control-pages-settings-v1';
const STATE_KEY='obs-control-pages-overlay-v1';
const SOURCE_NAME='OBS Control Overlay';
const channel=new BroadcastChannel('obs-control-overlay');
const defaults={visible:false,name:'',title:'',logoUrl:'',accent:'#ff5c35',template:'classic',scale:1,ticker:'',tickerVisible:false,tickerBackground:'#d8191f',tickerColor:'#ffffff',timerSeconds:0,timerVisible:false,timerRunning:false,timerStartedAt:0,timerPosition:'top-left',timerBackground:'#12141b',timerColor:'#ffffff'};
const defaultSpeakers=Array.from({length:10},(_,i)=>({id:`speaker-${i+1}`,name:i<3?['สุชาติ พรมี','มาดีโอ–อกเชษฐ์ เจต','พล–ทวีพล พวงแก้ว'][i]:'',title:i<3?['ขอนแก่น','ดีไซเนอร์และครีเอเตอร์','Co-founder สิงห์ท่า'][i]:'',accent:['#ff5c35','#775cff','#00b98b'][i]||'#ff5c35',template:'classic',scale:1,logoUrl:''}));
let saved={};try{saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')}catch{}
let state={...defaults,...saved.overlay};let speakers=Array.isArray(saved.speakers)?saved.speakers:defaultSpeakers;
let obs=null,connected=false,timerInterval=null,liveId='';
const $=(id)=>document.getElementById(id);
const notice=(text)=>{$('notice').textContent=text};
const persist=()=>localStorage.setItem(SETTINGS_KEY,JSON.stringify({obsUrl:$('obsUrl').value.trim(),speakers,overlay:state}));
const publish=()=>{localStorage.setItem(STATE_KEY,JSON.stringify(state));channel.postMessage(state);persist()};
const overlayUrl=()=>new URL('./overlay.html',location.href).href;

$('obsUrl').value=saved.obsUrl||'ws://127.0.0.1:4455';
$('dockUrl').textContent=location.href;
$('overlayUrl').textContent=overlayUrl();

function renderSpeakers(){
  $('speakerList').innerHTML='';
  speakers.forEach((speaker,index)=>{
    const row=document.createElement('article');row.className=`speaker ${liveId===speaker.id?'live':''}`;row.style.setProperty('--accent',speaker.accent);
    row.innerHTML=`<strong>${index+1}</strong><label class="logo-picker">${speaker.logoUrl?`<img alt="โลโก้" src="${speaker.logoUrl}">`:'+รูป'}<input type="file" accept="image/*"></label><input class="name" value="${escapeHtml(speaker.name)}" placeholder="ชื่อ–นามสกุล"><input class="title" value="${escapeHtml(speaker.title)}" placeholder="ตำแหน่ง"><select class="template"><option value="classic">Classic</option><option value="glass">Glass</option><option value="neon">Neon</option><option value="minimal">Minimal</option><option value="ribbon">Ribbon</option></select><label class="scale"><input type="range" min="0.6" max="1.4" step="0.1" value="${speaker.scale||1}"></label><button class="play">${liveId===speaker.id?'● LIVE':'▶ PLAY'}</button>`;
    row.querySelector('.template').value=speaker.template||'classic';
    row.querySelector('.name').oninput=e=>{speaker.name=e.target.value;persist()};row.querySelector('.title').oninput=e=>{speaker.title=e.target.value;persist()};
    row.querySelector('.template').onchange=e=>{speaker.template=e.target.value;persist()};row.querySelector('.scale input').oninput=e=>{speaker.scale=Number(e.target.value);persist()};
    row.querySelector('.logo-picker input').onchange=e=>loadLogo(e.target.files[0],speaker);
    row.querySelector('.play').onclick=()=>showSpeaker(speaker);
    row.querySelector('strong').ondblclick=()=>{const color=document.createElement('input');color.type='color';color.value=speaker.accent;color.oninput=()=>{speaker.accent=color.value;renderSpeakers();persist()};color.click()};
    $('speakerList').appendChild(row);
  });
}
function escapeHtml(value=''){return value.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function loadLogo(file,speaker){if(!file)return;if(file.size>700000){notice('โลโก้ต้องมีขนาดไม่เกิน 700 KB');return}const reader=new FileReader();reader.onload=()=>{speaker.logoUrl=reader.result;renderSpeakers();persist();notice('บันทึกโลโก้แล้ว')};reader.readAsDataURL(file)}

async function connect(){
  try{obs=new OBSWebSocket();await obs.connect($('obsUrl').value.trim(),$('obsPassword').value);connected=true;$('status').textContent='● OBS CONNECTED';$('status').classList.add('online');persist();await refreshScenes();notice('เชื่อมต่อ OBS สำเร็จ')}
  catch(error){connected=false;$('status').textContent='● OFFLINE';$('status').classList.remove('online');notice(`เชื่อม OBS ไม่สำเร็จ: ${error.message}`)}
}
async function ensureOverlay(){
  if(!connected)throw new Error('กรุณาเชื่อมต่อ OBS ก่อน');
  const {currentProgramSceneName:sceneName}=await obs.call('GetCurrentProgramScene');
  const {inputs}=await obs.call('GetInputList');const existing=inputs.find(i=>i.inputName===SOURCE_NAME);
  const inputSettings={url:overlayUrl(),width:1920,height:1080,reroute_audio:false,shutdown:false,restart_when_active:false};
  if(!existing)await obs.call('CreateInput',{sceneName,inputName:SOURCE_NAME,inputKind:'browser_source',inputSettings,sceneItemEnabled:true});
  else{await obs.call('SetInputSettings',{inputName:SOURCE_NAME,inputSettings,overlay:true});try{await obs.call('GetSceneItemId',{sceneName,sourceName:SOURCE_NAME})}catch{await obs.call('CreateSceneItem',{sceneName,sourceName:SOURCE_NAME,sceneItemEnabled:true})}}
  const {sceneItemId}=await obs.call('GetSceneItemId',{sceneName,sourceName:SOURCE_NAME});await obs.call('SetSceneItemEnabled',{sceneName,sceneItemId,sceneItemEnabled:true});
  return sceneName;
}
async function showSpeaker(speaker){try{await ensureOverlay();state={...state,visible:true,name:speaker.name,title:speaker.title,logoUrl:speaker.logoUrl||'',accent:speaker.accent,template:speaker.template,scale:speaker.scale};liveId=speaker.id;publish();renderSpeakers();notice(`กำลังแสดงป้ายชื่อ ${speaker.name}`)}catch(e){notice(e.message)}}

async function refreshScenes(){if(!connected)return;try{const data=await obs.call('GetSceneList');$('sceneList').innerHTML='';data.scenes.forEach(scene=>{const button=document.createElement('button');button.textContent=scene.sceneName;button.classList.toggle('active',scene.sceneName===data.currentProgramSceneName);button.onclick=async()=>{await obs.call('SetCurrentProgramScene',{sceneName:scene.sceneName});refreshScenes()};$('sceneList').appendChild(button)})}catch(e){notice(e.message)}}
async function selectCamera(name){if(!connected){notice('กรุณาเชื่อมต่อ OBS ก่อน');return}try{const {currentProgramSceneName:sceneName}=await obs.call('GetCurrentProgramScene');for(const camera of ['Camera 1','Camera 2','Camera 3']){try{const {sceneItemId}=await obs.call('GetSceneItemId',{sceneName,sourceName:camera});await obs.call('SetSceneItemEnabled',{sceneName,sceneItemId,sceneItemEnabled:camera===name})}catch{}}notice(`เปิด ${name} แล้ว`)}catch(e){notice(e.message)}}

document.querySelectorAll('.tabs button').forEach(button=>button.onclick=()=>{document.querySelectorAll('.tabs button,.tab-panel').forEach(el=>el.classList.remove('active'));button.classList.add('active');$(button.dataset.tab).classList.add('active')});
$('connectButton').onclick=connect;$('installOverlay').onclick=async()=>{try{const scene=await ensureOverlay();publish();notice(`สร้าง Browser Source ใน Scene ${scene} แล้ว`)}catch(e){notice(e.message)}};
$('hideLowerThird').onclick=()=>{state.visible=false;liveId='';publish();renderSpeakers();notice('ซ่อนป้ายชื่อแล้ว')};
$('showTicker').onclick=async()=>{try{await ensureOverlay();state.ticker=$('tickerText').value;state.tickerBackground=$('tickerBackground').value;state.tickerColor=$('tickerColor').value;state.tickerVisible=true;publish();notice('เปิด Ticker แล้ว')}catch(e){notice(e.message)}};
$('hideTicker').onclick=()=>{state.tickerVisible=false;publish();notice('ปิด Ticker แล้ว')};
function syncTimer(){const elapsed=state.timerRunning?Math.floor((Date.now()-state.timerStartedAt)/1000):state.timerSeconds;state.timerSeconds=Math.max(0,elapsed);$('timerReadout').textContent=`${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(elapsed%60).padStart(2,'0')}`;if(state.timerRunning)publish()}
$('toggleTimer').onclick=async()=>{try{await ensureOverlay();if(state.timerRunning){syncTimer();state.timerRunning=false;$('toggleTimer').textContent='▶ เริ่ม';clearInterval(timerInterval)}else{state.timerStartedAt=Date.now()-state.timerSeconds*1000;state.timerRunning=true;state.timerVisible=true;$('toggleTimer').textContent='Ⅱ หยุด';timerInterval=setInterval(syncTimer,1000)}state.timerPosition=$('timerPosition').value;state.timerBackground=$('timerBackground').value;state.timerColor=$('timerColor').value;publish()}catch(e){notice(e.message)}};
$('resetTimer').onclick=()=>{state.timerRunning=false;state.timerVisible=false;state.timerSeconds=0;clearInterval(timerInterval);$('toggleTimer').textContent='▶ เริ่ม';syncTimer();publish()};
$('refreshScenes').onclick=refreshScenes;document.querySelectorAll('[data-camera]').forEach(button=>button.onclick=()=>selectCamera(button.dataset.camera));
$('tickerText').value=state.ticker||'';$('tickerBackground').value=state.tickerBackground;$('tickerColor').value=state.tickerColor;$('timerPosition').value=state.timerPosition;$('timerBackground').value=state.timerBackground;$('timerColor').value=state.timerColor;
renderSpeakers();syncTimer();publish();
