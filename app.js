/* ScanCode main script (ES5) */
(function(){
  'use strict';

  // --------- DOM ---------
  var video = document.getElementById('video');
  var overlay = document.getElementById('overlay');
  var work = document.getElementById('work');
  var ctx = overlay.getContext('2d');
  var wctx = work.getContext('2d');

  var pillEngine = document.getElementById('pill-engine');
  var pillPerm = document.getElementById('pill-perm');
  var pillOCR = document.getElementById('pill-ocr');
  var pillAuto = document.getElementById('pill-autolog');

  var cameraSelect = document.getElementById('cameraSelect');
  var facingSelect = document.getElementById('facingSelect');
  var cooldownInput = document.getElementById('cooldown');
  var delayInput = document.getElementById('delay');
  var scaleMode = document.getElementById('scaleMode');
  var focusWrap = document.getElementById('focusWrap');
  var focusSlider = document.getElementById('focusSlider');

  var btnPerm = document.getElementById('btnPerm');
  var btnRefresh = document.getElementById('btnRefresh');
  var btnStart = document.getElementById('btnStart');
  var btnStop = document.getElementById('btnStop');
  var autoLog = document.getElementById('autoLog');
  var toggleOCR = document.getElementById('toggleOCR');
  var btnSnapshot = document.getElementById('btnSnapshot');
  var btnRoiReset = document.getElementById('btnRoiReset');
  var btnClear = document.getElementById('btnClear');

  var importCSV = document.getElementById('importCSV');
  var importXLSX = document.getElementById('importXLSX');
  var exportCSV = document.getElementById('exportCSV');
  var exportXLSX = document.getElementById('exportXLSX');
  var exportZIP = document.getElementById('exportZIP');

  var noteInput = document.getElementById('noteInput');

  var logTable = document.getElementById('logTable').querySelector('tbody');
  var toastEl = document.getElementById('toast');

  // --------- State ---------
  var state = {
    stream: null,
    track: null,
    devices: [],
    deviceId: null,
    engine: '—',
    cooldownMs: 5000,
    scanTimer: null,
    cooldownTimer: null,
    scanning: false,
    lastScanAt: 0,
    rows: [],
    seen: {}, // key -> count
    nextRowId: 1,
    roi: { x: 0.6, y: 0.6, w: 0.35, h: 0.25 }, // normalized
    roiDragging: null,
    roiDirty: true,
    ocrReady: false,
    ocrWorker: null,
    ocrWords: [],
    overlayPulse: 0,
    autolog: true,
    wantOcr: true,
    focusSupported: false,
    focusMin: 0, focusMax: 1000, focusStep: 1
  };

  // persistent prefs
  function loadPrefs(){
    try{
      var s = localStorage.getItem('scancode_prefs');
      if(s){
        var p = JSON.parse(s);
        if(typeof p.autolog === 'boolean'){ state.autolog = p.autolog; autoLog.checked = state.autolog; }
        if(typeof p.wantOcr === 'boolean'){ state.wantOcr = p.wantOcr; toggleOCR.checked = state.wantOcr; }
        if(typeof p.cooldownMs === 'number'){ state.cooldownMs = p.cooldownMs; cooldownInput.value = Math.round(state.cooldownMs/1000); }
        if(typeof p.roi === 'object'){ state.roi = p.roi; }
        if(typeof p.scaleMode === 'string'){ scaleMode.value = p.scaleMode; }
      }
      var d = localStorage.getItem('scancode_data');
      if(d){
        var o = JSON.parse(d);
        if(o.rows && o.rows.length){ state.rows = o.rows; state.nextRowId = 1 + o.rows.reduce(function(m, r){ return Math.max(m, r.id||0); }, 0); }
        if(o.seen){ state.seen = o.seen; }
      }
    }catch(e){ console.warn('prefs/data load', e); }
    updateAutoPill();
    renderRows();
  }
  function savePrefs(){
    try{
      localStorage.setItem('scancode_prefs', JSON.stringify({
        autolog: state.autolog,
        wantOcr: state.wantOcr,
        cooldownMs: state.cooldownMs,
        roi: state.roi,
        scaleMode: scaleMode.value
      }));
    }catch(e){}
  }
  function saveData(){
    try{
      localStorage.setItem('scancode_data', JSON.stringify({ rows: state.rows, seen: state.seen }));
    }catch(e){}
  }

  function toast(msg){
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(function(){ toastEl.classList.remove('show'); }, 1800);
  }

  function setPill(el, text, cls){
    el.textContent = text;
    el.className = 'pill' + (cls?(' '+cls):'');
  }

  function updateAutoPill(){
    setPill(pillAuto, 'Auto‑log: ' + (state.autolog ? 'On' : 'Off'), state.autolog ? 'ok' : 'warn');
  }

  // --------- Permissions & Devices ---------
  function checkPermission(){
    if(!navigator.permissions || !navigator.permissions.query){ setPill(pillPerm, 'Perm: ?','warn'); return; }
    navigator.permissions.query({ name: 'camera' }).then(function(res){
      setPill(pillPerm, 'Perm: ' + res.state, res.state==='granted'?'ok':(res.state==='prompt'?'warn':'bad'));
      res.onchange = function(){ setPill(pillPerm, 'Perm: ' + res.state, res.state==='granted'?'ok':(res.state==='prompt'?'warn':'bad')); };
    })['catch'](function(){ setPill(pillPerm, 'Perm: ?','warn'); });
  }

  function requestPermission(){
    navigator.mediaDevices.getUserMedia({ video: true, audio: false }).then(function(stream){
      // stop immediately; just to unlock enumerateDevices
      stream.getTracks().forEach(function(t){ t.stop(); });
      enumerateCams();
      checkPermission();
      toast('Permission granted.');
    })['catch'](function(err){
      console.warn(err);
      toast('Permission denied or failed.');
      checkPermission();
    });
  }

  function enumerateCams(){
    if(!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices){ return; }
    navigator.mediaDevices.enumerateDevices().then(function(list){
      state.devices = list.filter(function(d){ return d.kind === 'videoinput'; });
      cameraSelect.innerHTML = '';
      state.devices.forEach(function(d, idx){
        var opt = document.createElement('option');
        opt.value = d.deviceId || '';
        opt.textContent = (d.label || ('Camera ' + (idx+1)));
        cameraSelect.appendChild(opt);
      });
      if(state.deviceId){
        var had = false;
        for(var i=0;i<cameraSelect.options.length;i++){
          if(cameraSelect.options[i].value === state.deviceId){ cameraSelect.selectedIndex = i; had = true; break; }
        }
        if(!had && cameraSelect.options.length){ cameraSelect.selectedIndex = 0; state.deviceId = cameraSelect.value; }
      }else if(cameraSelect.options.length){
        cameraSelect.selectedIndex = 0; state.deviceId = cameraSelect.value;
      }
    });
  }

  function startStream(){
    if(state.scanning){ return; }
    var constraints = { video: { facingMode: facingSelect.value || undefined } };
    if(state.deviceId){ constraints.video.deviceId = { exact: state.deviceId }; }
    navigator.mediaDevices.getUserMedia(constraints).then(function(stream){
      state.stream = stream;
      video.srcObject = stream;
      var tracks = stream.getVideoTracks();
      state.track = tracks && tracks[0];
      state.scanning = true;
      sizeOverlay();
      video.addEventListener('loadedmetadata', sizeOverlayOnce, { once: true });
      video.addEventListener('playing', sizeOverlay);
      setupFocusUI();
      scanLoopSchedule(100);
    })['catch'](function(err){
      console.warn('getUserMedia', err);
      toast('Camera start failed.');
      state.scanning = false;
    });
  }

  function stopStream(){
    if(state.scanTimer){ clearTimeout(state.scanTimer); state.scanTimer = null; }
    if(state.stream){
      state.stream.getTracks().forEach(function(t){ t.stop(); });
    }
    state.stream = null; state.track = null; state.scanning = false;
  }

  cameraSelect.addEventListener('change', function(){
    state.deviceId = cameraSelect.value || null;
    savePrefs();
    if(state.scanning){ stopStream(); startStream(); }
  });
  facingSelect.addEventListener('change', function(){
    savePrefs();
    if(state.scanning){ stopStream(); startStream(); }
  });

  // --------- Focus UI ---------
  function setupFocusUI(){
    // Default hide
    focusWrap.classList.add('hidden');
    state.focusSupported = false;
    if(!state.track || !state.track.getCapabilities){ return; }
    var caps;
    try{ caps = state.track.getCapabilities(); }catch(e){ return; }
    // focusDistance is more widely used; also focusMode array may exist
    var hasRange = caps.focusDistance && typeof caps.focusDistance.min === 'number' && typeof caps.focusDistance.max === 'number';
    var modes = caps.focusMode && (caps.focusMode.indexOf ? caps.focusMode : []);
    var manualOK = (modes && modes.indexOf && modes.indexOf('manual') !== -1) || hasRange;

    if(manualOK){
      state.focusSupported = true;
      var min = hasRange ? caps.focusDistance.min : 0;
      var max = hasRange ? caps.focusDistance.max : 1000;
      var step = hasRange ? (caps.focusDistance.step || 1) : 1;
      state.focusMin = min; state.focusMax = max; state.focusStep = step;
      focusSlider.min = String(0);
      focusSlider.max = String(1000);
      focusSlider.step = String(1);
      // restore last value per device
      var key = 'scancode_focus_' + (state.deviceId || 'default');
      var saved = localStorage.getItem(key);
      var val = saved ? Number(saved) : 500;
      if(!(val>=0 && val<=1000)) val = 500;
      focusSlider.value = String(val);
      focusWrap.classList.remove('hidden');
      focusSlider.oninput = function(){
        var pct = Number(focusSlider.value)/1000;
        var fval = min + pct*(max-min);
        applyFocus(fval);
        try{ localStorage.setItem(key, String(focusSlider.value)); }catch(e){}
      };
      // apply initial value softly
      setTimeout(function(){ focusSlider.oninput(); }, 100);
    }
  }

  function applyFocus(dist){
    if(!state.track || !state.track.applyConstraints){ return; }
    state.track.applyConstraints({ advanced: [ { focusMode: 'manual', focusDistance: dist } ] })
      .then(function(){})
      ['catch'](function(e){ console.warn('applyConstraints', e); focusWrap.classList.add('hidden'); });
  }

  // --------- Overlay sizing & ROI ---------
  function sizeOverlay(){ 
    overlay.width = video.clientWidth || video.videoWidth || 1280;
    overlay.height = video.clientHeight || video.videoHeight || 720;
    work.width = video.videoWidth || 1280;
    work.height = video.videoHeight || 720;
    state.roiDirty = true;
  }
  function sizeOverlayOnce(){ sizeOverlay(); }

  function roiRectPx(){
    var w = overlay.width, h = overlay.height;
    return {
      x: Math.round(state.roi.x * w),
      y: Math.round(state.roi.y * h),
      w: Math.round(state.roi.w * w),
      h: Math.round(state.roi.h * h)
    };
  }

  function drawOverlayBoxes(scanPolys){
    var w = overlay.width, h = overlay.height;
    ctx.clearRect(0,0,w,h);

    // OCR ROI (dashed green when has words)
    var rr = roiRectPx();
    ctx.save();
    ctx.setLineDash([6,4]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,255,0,0.9)';
    ctx.fillStyle = state.ocrWords && state.ocrWords.length ? 'rgba(0,255,0,0.12)' : 'rgba(0,0,0,0.12)';
    ctx.strokeRect(rr.x, rr.y, rr.w, rr.h);
    ctx.fillRect(rr.x, rr.y, rr.w, rr.h);
    ctx.restore();

    // ROI handle (bottom-right)
    ctx.save();
    ctx.fillStyle = '#00ff77';
    ctx.fillRect(rr.x + rr.w - 10, rr.y + rr.h - 10, 10, 10);
    ctx.restore();

    // OCR word boxes
    if(state.ocrWords && state.ocrWords.length){
      ctx.save();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,0,0,0.9)';
      for(var i=0;i<state.ocrWords.length;i++){
        var b = state.ocrWords[i].bbox; // in overlay coords
        if(!b) continue;
        ctx.strokeRect(b.x, b.y, b.w, b.h);
      }
      ctx.restore();
    }

    // Scannable polygons (from engines)
    if(scanPolys && scanPolys.length){
      ctx.save();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(90,209,255,0.95)';
      ctx.lineWidth = 2;
      for(var p=0;p<scanPolys.length;p++){
        var poly = scanPolys[p];
        ctx.beginPath();
        for(var j=0;j<poly.length;j++){
          var pt = poly[j];
          if(j===0) ctx.moveTo(pt.x*w, pt.y*h); else ctx.lineTo(pt.x*w, pt.y*h);
        }
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ROI interactions (drag/resize) - mouse + touch
  function within(x,y,rect){ return x>=rect.x && y>=rect.y && x<=rect.x+rect.w && y<=rect.y+rect.h; }
  function onPointerDown(ev){
    var rect = overlay.getBoundingClientRect();
    var x = (ev.clientX || (ev.touches && ev.touches[0].clientX) || 0) - rect.left;
    var y = (ev.clientY || (ev.touches && ev.touches[0].clientY) || 0) - rect.top;
    var rr = roiRectPx();
    var handle = { x: rr.x+rr.w-10, y: rr.y+rr.h-10, w:10, h:10 };
    if(within(x,y, handle)){
      state.roiDragging = { mode:'resize', ox:x, oy:y, rr: rr };
    }else if(within(x,y, rr)){
      state.roiDragging = { mode:'move', ox:x, oy:y, rr: rr };
    }else{
      state.roiDragging = null;
    }
  }
  function onPointerMove(ev){
    if(!state.roiDragging) return;
    ev.preventDefault();
    var rect = overlay.getBoundingClientRect();
    var x = (ev.clientX || (ev.touches && ev.touches[0].clientX) || 0) - rect.left;
    var y = (ev.clientY || (ev.touches && ev.touches[0].clientY) || 0) - rect.top;
    var dx = x - state.roiDragging.ox;
    var dy = y - state.roiDragging.oy;
    var rr = state.roiDragging.rr;
    var w = overlay.width, h = overlay.height;

    if(state.roiDragging.mode==='move'){
      var nx = Math.max(0, Math.min(w - rr.w, rr.x + dx));
      var ny = Math.max(0, Math.min(h - rr.h, rr.y + dy));
      state.roi.x = nx / w; state.roi.y = ny / h;
    }else{
      var nw = Math.max(40, Math.min(w - rr.x, rr.w + dx));
      var nh = Math.max(30, Math.min(h - rr.y, rr.h + dy));
      state.roi.w = nw / w; state.roi.h = nh / h;
    }
    drawOverlayBoxes(null);
  }
  function onPointerUp(){ state.roiDragging = null; savePrefs(); }

  overlay.addEventListener('mousedown', onPointerDown);
  overlay.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);
  overlay.addEventListener('touchstart', onPointerDown, { passive:false });
  overlay.addEventListener('touchmove', onPointerMove, { passive:false });
  window.addEventListener('touchend', onPointerUp);

  btnRoiReset.addEventListener('click', function(){
    state.roi = { x: 0.6, y: 0.6, w: 0.35, h: 0.25 };
    savePrefs();
    drawOverlayBoxes(null);
  });

  // --------- Decode Engines ---------
  var haveBD = ('BarcodeDetector' in window);
  var haveZX = (typeof window.ZXingBrowser !== 'undefined' || typeof window.ZXing !== 'undefined');
  var haveJsQR = (typeof window.jsQR !== 'undefined');
  var engineStep = 0; // 0 BD, 1 ZX, 2 jsQR

  function updateEngineAvailability(){
    haveBD = ('BarcodeDetector' in window);
    haveZX = (typeof window.ZXingBrowser !== 'undefined' || typeof window.ZXing !== 'undefined');
    haveJsQR = (typeof window.jsQR !== 'undefined');
  }

  function setEnginePill(name){
    state.engine = name;
    setPill(pillEngine, 'Engine: ' + name, name==='BD'?'ok':(name==='ZXing'?'warn':(name==='jsQR'?'warn':'bad')));
  }

  function frameToImageData(targetW){
    // draw current video frame into work canvas and return ImageData
    var vw = video.videoWidth || work.width, vh = video.videoHeight || work.height;
    if(!vw || !vh) return null;
    // scale
    var maxW = targetW || vw;
    if(scaleMode.value && scaleMode.value !== 'auto'){
      maxW = Math.min(maxW, parseInt(scaleMode.value,10));
    }
    var w = Math.min(vw, maxW);
    var h = Math.round(vh * (w / vw));
    work.width = w; work.height = h;
    try{
      wctx.drawImage(video, 0, 0, w, h);
      return wctx.getImageData(0,0,w,h);
    }catch(e){
      return null;
    }
  }

  function scheduleCooldown(){
    state.lastScanAt = Date.now();
  }

  function inCooldown(){
    var cd = state.cooldownMs;
    return (Date.now() - state.lastScanAt) < cd;
  }

  function scanLoopSchedule(ms){
    if(state.scanTimer){ clearTimeout(state.scanTimer); }
    state.scanTimer = setTimeout(scanLoop, ms||150);
  }

  function scanLoop(){
    if(!state.scanning){ return; }
    updateEngineAvailability();
    var polys = []; // to draw
    // Draw overlay baseline (ROI + prev words)
    drawOverlayBoxes(null);

    // Skip decode during cooldown but keep overlays/ocr words refreshing lightly
    if(inCooldown() && state.autolog){
      // light OCR pulse for ROI feedback
      ocrPulse(false, null);
      return scanLoopSchedule(160);
    }

    // Cascade
    if(haveBD){
      tryBD(polys, function(hit){ 
        if(hit){ handleDetection(hit, 'BD', hit.polygon || null); }
        drawOverlayBoxes(polys); 
        scanLoopSchedule(180);
      });
      return;
    }
    if(haveZX){
      tryZX(polys, function(hit){
        if(hit){ handleDetection(hit, 'ZXing', hit.polygon || null); }
        drawOverlayBoxes(polys);
        scanLoopSchedule(220);
      });
      return;
    }
    if(haveJsQR){
      tryJsQR(polys, function(hit){
        if(hit){ handleDetection(hit, 'jsQR', hit.polygon || null); }
        drawOverlayBoxes(polys);
        scanLoopSchedule(220);
      });
      return;
    }
    setEnginePill('None');
    scanLoopSchedule(300);
  }

  function tryBD(polys, cb){
    setEnginePill('BD');
    var fmts = (window.BarcodeDetector && window.BarcodeDetector.getSupportedFormats) ? window.BarcodeDetector.getSupportedFormats() : null;
    try{
      var det = fmts ? new window.BarcodeDetector({ formats: fmts }) : new window.BarcodeDetector();
      // use ImageBitmap for speed if available
      var vw = video.videoWidth, vh = video.videoHeight;
      if(!vw || !vh) return cb(null);
      createImageBitmap(video).then(function(bitmap){
        return det.detect(bitmap);
      }).then(function(list){
        if(list && list.length){
          var b = list[0];
          if(b.cornerPoints && b.cornerPoints.length){
            var w = overlay.width, h = overlay.height;
            var poly = [];
            for(var i=0;i<b.cornerPoints.length;i++){
              var pt = b.cornerPoints[i];
              poly.push({ x: pt.x/(video.videoWidth||w), y: pt.y/(video.videoHeight||h) });
            }
            polys.push(poly);
          }
          cb({ text: b.rawValue || b.rawValue, format: b.format || 'unknown', polygon: polys[0] || null, source:'camera' });
        }else{
          cb(null);
        }
      })['catch'](function(){ cb(null); });
    }catch(e){ cb(null); }
  }

  function tryZX(polys, cb){
    setEnginePill('ZXing');
    // We support two globals: ZXingBrowser.readBarcodesFromImageData OR ZXing().
    var id = frameToImageData(1024);
    if(!id){ return cb(null); }
    var reader = (window.ZXingBrowser && window.ZXingBrowser) || (window.ZXing && window.ZXing);
    if(reader && reader.readBarcodesFromImageData){
      reader.readBarcodesFromImageData(id, { tryHarder:true }).then(function(res){
        if(res && res.length){
          var r = res[0];
          if(r && r.cornerPoints && r.cornerPoints.length){
            var poly = r.cornerPoints.map(function(p){ return { x: p.x/id.width, y: p.y/id.height }; });
            polys.push(poly);
          }
          cb({ text: r.text || r.rawValue, format: (r.format || (r.barcodeFormat && r.barcodeFormat.toString())) || 'unknown', polygon: polys[0]||null, source:'camera' });
        }else cb(null);
      })['catch'](function(){ cb(null); });
      return;
    }
    // Fallback to generic decode(data,w,h) if exposed
    if(reader && reader.decode){
      try{
        var decoded = reader.decode(id.data, id.width, id.height);
        if(decoded){ cb({ text: decoded.text||String(decoded), format: decoded.format||'unknown', source:'camera' }); return; }
      }catch(e){}
    }
    cb(null);
  }

  function tryJsQR(polys, cb){
    setEnginePill('jsQR');
    var id = frameToImageData(640);
    if(!id || !window.jsQR){ return cb(null); }
    try{
      var res = window.jsQR(id.data, id.width, id.height, { inversionAttempts: 'dontInvert' });
      if(res && res.location){
        var loc = res.location;
        var poly = [
          { x: loc.topLeftCorner.x/id.width, y: loc.topLeftCorner.y/id.height },
          { x: loc.topRightCorner.x/id.width, y: loc.topRightCorner.y/id.height },
          { x: loc.bottomRightCorner.x/id.width, y: loc.bottomRightCorner.y/id.height },
          { x: loc.bottomLeftCorner.x/id.width, y: loc.bottomLeftCorner.y/id.height }
        ];
        polys.push(poly);
        cb({ text: res.data, format: 'QR_CODE', polygon: poly, source:'camera' });
      }else cb(null);
    }catch(e){ cb(null); }
  }

  // --------- Detection handling ---------
  function handleDetection(hit, engine, poly){
    if(!hit || !hit.text){ return; }
    var key = (hit.text + '|' + (hit.format||'') ).slice(0,1024);
    var count = state.seen[key] ? (state.seen[key]+1) : 1;
    var now = new Date();
    var dateStr = now.toLocaleDateString();
    var timeStr = now.toLocaleTimeString();
    var row = {
      id: state.nextRowId++,
      value: hit.text,
      format: hit.format || 'unknown',
      engine: engine,
      source: hit.source || 'camera',
      date: dateStr,
      time: timeStr,
      weight_g: null,
      photo: null,
      count: count,
      notes: (noteInput.value || '')
    };

    if(state.autolog){
      // dedup: only log first time
      if(state.seen[key]){
        // bumped count only
        state.seen[key] = count;
        bumpRowCountByKey(key, count);
        scheduleCooldown();
        return;
      }
      state.seen[key] = count;
      addRow(row, key);
      scheduleCooldown();
      // delayed weight + photo
      var delayMs = Math.max(0, Math.min(4000, Math.round(Number(delayInput.value)*1000)));
      setTimeout(function(){
        capturePhotoAndOCR(row.id);
      }, delayMs);
    }else{
      // snapshot mode only logs when user presses Snapshot; here we just keep overlays
    }
  }

  function bumpRowCountByKey(key, count){
    // find first row with matching key
    for(var i=0;i<state.rows.length;i++){
      var r = state.rows[i];
      var k = (r.value + '|' + (r.format||'') );
      if(k===key){
        r.count = count;
        var tr = document.getElementById('row-'+r.id);
        if(tr){ tr.querySelector('[data-col="count"]').textContent = String(count); }
        saveData();
        return;
      }
    }
  }

  function addRow(row, key){
    state.rows.push(row);
    saveData();
    var tr = document.createElement('tr');
    tr.id = 'row-'+row.id;
    function td(txt, col){
      var el = document.createElement('td');
      if(col){ el.setAttribute('data-col', col); }
      el.textContent = (txt==null?'':String(txt));
      return el;
    }
    tr.appendChild(td(String(row.id), 'id'));
    tr.appendChild(td(row.value, 'value'));
    tr.appendChild(td(row.format, 'format'));
    tr.appendChild(td(row.engine, 'engine'));
    tr.appendChild(td(row.source, 'source'));
    tr.appendChild(td(row.date, 'date'));
    tr.appendChild(td(row.time, 'time'));
    tr.appendChild(td('', 'weight_g'));
    var imgTd = document.createElement('td'); imgTd.setAttribute('data-col','photo');
    tr.appendChild(imgTd);
    tr.appendChild(td(String(row.count), 'count'));
    tr.appendChild(td(row.notes, 'notes'));
    logTable.insertBefore(tr, logTable.firstChild);
  }

  function renderRows(){
    logTable.innerHTML = '';
    for(var i=0;i<state.rows.length;i++){
      addRow(state.rows[i]);
    }
  }

  // --------- Snapshot pipeline ---------
  btnSnapshot.addEventListener('click', function(){
    if(state.autolog){ toast('Turn OFF Auto‑logging to use Snapshot.'); return; }
    var id = frameToImageData(1024);
    if(!id){ toast('No frame.'); return; }
    // Try decode (cascade quickly)
    var didLog = false;
    var attemptJsQR = function(next){
      if(!window.jsQR) return next(null);
      try{
        var res = window.jsQR(id.data, id.width, id.height, { inversionAttempts:'dontInvert' });
        if(res && res.data){
          return next({ text: res.data, format:'QR_CODE' });
        }
      }catch(e){}
      next(null);
    };
    var attemptZX = function(next){
      var reader = (window.ZXingBrowser && window.ZXingBrowser) || (window.ZXing && window.ZXing);
      if(reader && reader.readBarcodesFromImageData){
        reader.readBarcodesFromImageData(id, { tryHarder:true }).then(function(res){
          if(res && res.length){ next({ text: res[0].text || res[0].rawValue, format: (res[0].format || 'unknown') }); }
          else next(null);
        })['catch'](function(){ next(null); });
      }else next(null);
    };
    var attemptBD = function(next){
      if(!window.BarcodeDetector) return next(null);
      try{
        var det = new window.BarcodeDetector();
        // convert ImageData back to canvas for detect() (which needs ImageBitmap/ImageBitmapSource)
        var c = document.createElement('canvas'); c.width = id.width; c.height = id.height;
        c.getContext('2d').putImageData(id,0,0);
        createImageBitmap(c).then(function(bmp){
          return det.detect(bmp);
        }).then(function(list){
          if(list && list.length){ next({ text:list[0].rawValue, format:list[0].format||'unknown' }); } else next(null);
        })['catch'](function(){ next(null); });
      }catch(e){ next(null); }
    };

    attemptBD(function(resBD){
      if(resBD){ logFromSnapshot(resBD); return; }
      attemptZX(function(resZX){
        if(resZX){ logFromSnapshot(resZX); return; }
        attemptJsQR(function(resQR){
          if(resQR){ logFromSnapshot(resQR); return; }
          // nothing decoded; still allow OCR + photo log? We'll log an empty value row only if OCR produces weight
          capturePhotoAndOCR(null, function(weight, photoData){
            if(weight!=null){
              var now = new Date();
              var row = {
                id: state.nextRowId++,
                value: '',
                format: '',
                engine: '—',
                source: 'snapshot',
                date: now.toLocaleDateString(),
                time: now.toLocaleTimeString(),
                weight_g: weight,
                photo: photoData,
                count: 1,
                notes: noteInput.value || ''
              };
              state.rows.push(row); saveData(); renderRows();
              toast('Snapshot logged (weight only).');
            }else{
              toast('No code detected.');
            }
          });
        });
      });
    });
  });

  function logFromSnapshot(hit){
    var key = (hit.text + '|' + (hit.format||''));
    if(state.seen[key]){
      state.seen[key]++;
      bumpRowCountByKey(key, state.seen[key]);
    }else{
      state.seen[key] = 1;
      var now = new Date();
      var row = {
        id: state.nextRowId++,
        value: hit.text,
        format: hit.format || 'unknown',
        engine: 'Snapshot',
        source: 'snapshot',
        date: now.toLocaleDateString(),
        time: now.toLocaleTimeString(),
        weight_g: null,
        photo: null,
        count: 1,
        notes: noteInput.value || ''
      };
      state.rows.push(row); saveData(); renderRows();
    }
    capturePhotoAndOCR(state.nextRowId - 1, function(){ toast('Snapshot logged.'); });
  }

  // --------- Photo + OCR ---------
  function capturePhotoAndOCR(rowId, cb){
    // photo
    var vw = video.videoWidth||1280, vh = video.videoHeight||720;
    var c = document.createElement('canvas'); c.width = vw; c.height = vh;
    var cx = c.getContext('2d');
    try{ cx.drawImage(video, 0, 0, vw, vh); }catch(e){}
    var photoData = null;
    try{ photoData = c.toDataURL('image/jpeg', 0.85); }catch(e){}

    // OCR if enabled
    if(!state.wantOcr){
      if(rowId){ setRowPhoto(rowId, photoData); }
      if(cb) cb(null, photoData);
      return;
    }
    // crop ROI from c -> roiC
    var rr = {
      x: Math.round(state.roi.x * vw),
      y: Math.round(state.roi.y * vh),
      w: Math.round(state.roi.w * vw),
      h: Math.round(state.roi.h * vh)
    };
    var roiC = document.createElement('canvas'); roiC.width = rr.w*2; roiC.height = rr.h*2;
    var rx = roiC.getContext('2d');
    // upscale 2x and light threshold
    try{
      rx.imageSmoothingEnabled = false;
      rx.drawImage(c, rr.x, rr.y, rr.w, rr.h, 0, 0, roiC.width, roiC.height);
      var id = rx.getImageData(0,0,roiC.width, roiC.height);
      // threshold
      for(var i=0;i<id.data.length;i+=4){
        var yv = (id.data[i]*0.299 + id.data[i+1]*0.587 + id.data[i+2]*0.114)|0;
        var v = yv > 150 ? 255 : 0;
        id.data[i]=id.data[i+1]=id.data[i+2]=v;
      }
      rx.putImageData(id,0,0);
    }catch(e){}

    ensureOcrWorker(function(ok){
      if(!ok){
        ocrPulse(false, null);
        if(rowId){ setRowPhoto(rowId, photoData); }
        if(cb) cb(null, photoData);
        return;
      }
      recognizeCanvas(roiC, function(text, words){
        var grams = parseWeightToGrams(text);
        if(grams!=null){ toast('Captured weight: '+ grams.toFixed(2) +' g'); }
        // map word boxes to overlay coords
        var ow = overlay.width, oh = overlay.height;
        var vrw = video.videoWidth||ow, vrh = video.videoHeight||oh;
        var roiPx = {
          x: state.roi.x * ow,
          y: state.roi.y * oh,
          w: state.roi.w * ow,
          h: state.roi.h * oh
        };
        state.ocrWords = [];
        for(var i=0;i<(words||[]).length;i++){
          var wbx = words[i];
          if(wbx && wbx.bbox){
            var bx = {
              x: roiPx.x + (wbx.bbox.x/roiC.width)*roiPx.w,
              y: roiPx.y + (wbx.bbox.y/roiC.height)*roiPx.h,
              w: (wbx.bbox.w/roiC.width)*roiPx.w,
              h: (wbx.bbox.h/roiC.height)*roiPx.h
            };
            state.ocrWords.push({ text: wbx.text, bbox: bx });
          }
        }
        drawOverlayBoxes(null);
        if(rowId){
          setRowPhoto(rowId, photoData);
          if(grams!=null){ setRowWeight(rowId, grams); }
        }
        if(cb) cb(grams, photoData);
      });
    });
  }

  function setRowPhoto(id, dataUrl){
    var r = getRowById(id); if(!r) return;
    r.photo = dataUrl;
    var tr = document.getElementById('row-'+id);
    if(tr){
      var td = tr.querySelector('[data-col="photo"]');
      td.innerHTML = '';
      if(dataUrl){
        var img = document.createElement('img');
        img.src = dataUrl; img.alt = 'snapshot'; img.style.maxWidth='120px'; img.style.maxHeight='80px';
        td.appendChild(img);
      }
    }
    saveData();
  }
  function setRowWeight(id, grams){
    var r = getRowById(id); if(!r) return;
    r.weight_g = grams;
    var tr = document.getElementById('row-'+id);
    if(tr){
      tr.querySelector('[data-col="weight_g"]').textContent = String(grams.toFixed(2));
    }
    saveData();
  }
  function getRowById(id){
    for(var i=0;i<state.rows.length;i++){ if(state.rows[i].id===id) return state.rows[i]; }
    return null;
  }

  // OCR helpers
  function ensureOcrWorker(cb){
    if(state.ocrReady){ setPill(pillOCR, 'OCR: Ready', 'ok'); return cb(true); }
    if(typeof window.Tesseract === 'undefined'){
      setPill(pillOCR, 'OCR: Unavailable', 'warn'); return cb(false);
    }
    setPill(pillOCR, 'OCR: Loading…', 'warn');
    // Try modern worker
    if(window.Tesseract.createWorker){
      var worker = window.Tesseract.createWorker({
        workerPath: 'vendor/worker.min.js',
        corePath: 'vendor/tesseract-core/tesseract-core.wasm.js',
        langPath: 'vendor/lang-data',
        gzip: true
      });
      worker.load().then(function(){
        return worker.loadLanguage('eng');
      }).then(function(){ return worker.initialize('eng'); }).then(function(){
        state.ocrWorker = worker; state.ocrReady = true;
        setPill(pillOCR, 'OCR: Ready', 'ok');
        cb(true);
      })['catch'](function(e){
        console.warn('OCR worker load', e);
        // fallback: legacy Tesseract.recognize signatures
        state.ocrWorker = null; state.ocrReady = true;
        setPill(pillOCR, 'OCR: Legacy', 'warn');
        cb(true);
      });
      return;
    }
    // No worker API; assume legacy recognize available
    state.ocrWorker = null; state.ocrReady = true;
    setPill(pillOCR, 'OCR: Legacy', 'warn');
    cb(true);
  }

  function recognizeCanvas(canvas, cb){
    // Prefer worker
    if(state.ocrWorker && state.ocrWorker.recognize){
      state.ocrWorker.recognize(canvas).then(function(res){
        var text = (res && res.data && res.data.text) ? res.data.text : '';
        var words = [];
        if(res && res.data && res.data.words){
          for(var i=0;i<res.data.words.length;i++){
            var w = res.data.words[i];
            if(w && w.text && w.bbox){ words.push({ text: w.text, bbox: { x:w.bbox.x0, y:w.bbox.y0, w:w.bbox.x1-w.bbox.x0, h:w.bbox.y1-w.bbox.y0 } }); }
          }
        }
        cb(text, words);
      })['catch'](function(e){ console.warn('ocr recognize', e); cb('', []); });
      return;
    }
    // Legacy recognize signatures
    if(window.Tesseract && window.Tesseract.recognize){
      try{
        window.Tesseract.recognize(canvas, 'eng').then(function(res){
          var text = (res && res.data && res.data.text) ? res.data.text : (res.text || '');
          cb(text, []);
        })['catch'](function(){ cb('', []); });
        return;
      }catch(e){
        try{
          window.Tesseract.recognize(canvas, { lang: 'eng' }).then(function(res){
            var text = res && (res.text || (res.data && res.data.text)) || '';
            cb(text, []);
          })['catch'](function(){ cb('', []); });
          return;
        }catch(e2){ cb('', []); }
      }
    }else{
      cb('', []);
    }
  }

  function parseWeightToGrams(text){
    if(!text) return null;
    var t = String(text).toLowerCase().replace(/,/g,'');
    var m = t.match(/([0-9]*\.?[0-9]+)\s*(kg|g|gram|grams|lb|lbs|oz|ounce|ounces)?/);
    if(!m) return null;
    var val = parseFloat(m[1]);
    var unit = (m[2]||'g');
    var g = null;
    if(unit==='g' || unit==='gram' || unit==='grams'){ g = val; }
    else if(unit==='kg'){ g = val * 1000; }
    else if(unit==='lb' || unit==='lbs'){ g = val * 453.59237; }
    else if(unit==='oz' || unit==='ounce' || unit==='ounces'){ g = val * 28.349523125; }
    else{ g = val; }
    if(isNaN(g)) return null;
    return Math.round(g*100)/100;
  }

  function ocrPulse(hasText, words){
    // lightweight feedback to keep ROI pulsing; currently handled by drawOverlayBoxes using state.ocrWords
    // we could add subtle animation if desired.
  }

  // --------- Import / Export ---------
  function rowsToCSV(rows){
    var cols = ['id','value','format','engine','source','date','time','weight_g','photo','count','notes'];
    var out = [ cols.join(',') ];
    for(var i=0;i<rows.length;i++){
      var r = rows[i];
      var row = [];
      for(var c=0;c<cols.length;c++){
        var v = r[cols[c]];
        if(v==null) v='';
        v = String(v);
        // Excel cell limit for CSV is lenient but we keep parity with XLSX truncation
        if(v.length>32760) v = v.slice(0,32760);
        if(v.indexOf('"')!==-1 || v.indexOf(',')!==-1 || v.indexOf('\n')!==-1){
          v = '"' + v.replace(/"/g,'""') + '"';
        }
        row.push(v);
      }
      out.push(row.join(','));
    }
    return out.join('\r\n');
  }

  function download(name, data, type){
    var a = document.createElement('a');
    a.download = name;
    a.href = URL.createObjectURL(new Blob([data], { type: type||'text/plain' }));
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 2000);
  }

  exportCSV.addEventListener('click', function(){
    var csv = rowsToCSV(state.rows);
    download('scancode.csv', csv, 'text/csv');
  });

  exportXLSX.addEventListener('click', function(){
    if(typeof window.XLSX === 'undefined'){ toast('XLSX library not loaded.'); return; }
    var wb = window.XLSX.utils.book_new();
    var cols = ['id','value','format','engine','source','date','time','weight_g','photo','count','notes'];
    var data = [ cols ];
    for(var i=0;i<state.rows.length;i++){
      var r = state.rows[i];
      var row = [];
      for(var c=0;c<cols.length;c++){
        var v = r[cols[c]];
        if(v==null) v='';
        v = String(v);
        if(v.length>32760) v = v.slice(0,32760);
        row.push(v);
      }
      data.push(row);
    }
    var ws = window.XLSX.utils.aoa_to_sheet(data);
    window.XLSX.utils.book_append_sheet(wb, ws, 'ScanCode');
    var out = window.XLSX.write(wb, { bookType:'xlsx', type:'array' });
    download('scancode.xlsx', out, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  exportZIP.addEventListener('click', function(){
    if(typeof window.JSZip === 'undefined'){ toast('JSZip not loaded.'); return; }
    var zip = new window.JSZip();
    var csv = rowsToCSV(state.rows);
    zip.file('scancode.csv', csv);
    var photoDir = zip.folder('photos');
    for(var i=0;i<state.rows.length;i++){
      var r = state.rows[i];
      if(r.photo && r.photo.indexOf('data:image')===0){
        var base64 = r.photo.split(',')[1];
        photoDir.file('row-'+r.id+'.jpg', base64, { base64:true });
      }
    }
    zip.generateAsync({ type:'blob' }).then(function(content){
      download('scancode.zip', content, 'application/zip');
    });
  });

  importCSV.addEventListener('change', function(){
    var f = importCSV.files && importCSV.files[0];
    if(!f) return;
    var reader = new FileReader();
    reader.onload = function(){
      try{
        var text = String(reader.result);
        var lines = text.split(/\r?\n/);
        var header = lines.shift();
        var cols = header.split(',');
        // basic CSV (quoted fields allowed)
        var hdr = ['id','value','format','engine','source','date','time','weight_g','photo','count','notes'];
        var rows = [];
        function parseLine(line){
          var out = []; var cur = ''; var inq=false;
          for(var i=0;i<line.length;i++){
            var ch = line[i];
            if(ch === '"' ){
              if(inq && line[i+1]==='"'){ cur+='"'; i++; }
              else inq = !inq;
            }else if(ch === ',' && !inq){
              out.push(cur); cur='';
            }else{
              cur+=ch;
            }
          }
          out.push(cur);
          return out;
        }
        state.rows = []; state.seen = {}; state.nextRowId = 1;
        for(var li=0; li<lines.length; li++){
          var line = lines[li];
          if(!line) continue;
          var cells = parseLine(line);
          var obj = {};
          for(var c=0;c<Math.min(cells.length, hdr.length); c++){
            obj[hdr[c]] = cells[c];
          }
          if(obj.id){ obj.id = Number(obj.id)||state.nextRowId++; }
          else obj.id = state.nextRowId++;
          obj.count = Number(obj.count)||1;
          if(obj.weight_g!=null && obj.weight_g!=='') obj.weight_g = Number(obj.weight_g);
          state.rows.push(obj);
          var key = (obj.value + '|' + (obj.format||''));
          state.seen[key] = obj.count;
        }
        saveData(); renderRows();
        toast('CSV imported.');
      }catch(e){ console.warn(e); toast('CSV import failed.'); }
    };
    reader.readAsText(f);
    importCSV.value = '';
  });

  importXLSX.addEventListener('change', function(){
    if(typeof window.XLSX === 'undefined'){ toast('XLSX library not loaded.'); importXLSX.value=''; return; }
    var f = importXLSX.files && importXLSX.files[0];
    if(!f) return;
    var reader = new FileReader();
    reader.onload = function(){
      try{
        var data = new Uint8Array(reader.result);
        var wb = window.XLSX.read(data, { type:'array' });
        var ws = wb.Sheets[wb.SheetNames[0]];
        var json = window.XLSX.utils.sheet_to_json(ws, { defval:'' });
        state.rows = []; state.seen = {}; state.nextRowId = 1;
        for(var i=0;i<json.length;i++){
          var o = json[i];
          var row = {
            id: o.id ? Number(o.id) : state.nextRowId++,
            value: String(o.value||''),
            format: String(o.format||''),
            engine: String(o.engine||''),
            source: String(o.source||''),
            date: String(o.date||''),
            time: String(o.time||''),
            weight_g: o.weight_g===''?null:Number(o.weight_g),
            photo: String(o.photo||''),
            count: o.count?Number(o.count):1,
            notes: String(o.notes||'')
          };
          state.rows.push(row);
          var key = (row.value + '|' + (row.format||''));
          state.seen[key] = row.count;
        }
        saveData(); renderRows();
        toast('XLSX imported.');
      }catch(e){ console.warn(e); toast('XLSX import failed.'); }
    };
    reader.readAsArrayBuffer(f);
    importXLSX.value = '';
  });

  btnClear.addEventListener('click', function(){
    if(!confirm('Clear all rows?')) return;
    state.rows = []; state.seen = {}; state.nextRowId = 1;
    saveData(); renderRows();
  });

  // --------- Events ---------
  btnPerm.addEventListener('click', requestPermission);
  btnRefresh.addEventListener('click', enumerateCams);
  btnStart.addEventListener('click', startStream);
  btnStop.addEventListener('click', stopStream);

  cooldownInput.addEventListener('change', function(){
    var v = Math.max(0, Math.min(20, Number(cooldownInput.value)||0));
    state.cooldownMs = Math.round(v*1000);
    savePrefs();
  });
  delayInput.addEventListener('change', function(){
    savePrefs();
  });
  scaleMode.addEventListener('change', function(){ savePrefs(); });

  autoLog.addEventListener('change', function(){
    state.autolog = !!autoLog.checked;
    updateAutoPill();
    savePrefs();
  });
  toggleOCR.addEventListener('change', function(){
    state.wantOcr = !!toggleOCR.checked;
    savePrefs();
  });

  // --------- Init ---------
  function init(){
    checkPermission();
    enumerateCams();
    loadPrefs();
    // initial overlay
    drawOverlayBoxes(null);
    // Warm manifest/service worker registration done in sw-reg.js
  }

  document.addEventListener('DOMContentLoaded', init);
})();
