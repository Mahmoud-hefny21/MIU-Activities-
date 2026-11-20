(() => {
  'use strict';

  // A small site-specific circular optical code. It carries the same short-lived
  // server token as the former QR and is read by our attendance scanner.
  const RINGS = 40, SECTORS = 28;
  const MARKER = [7,7,7,7,0,7,0,0,7,0,0,0,7,0,7,0,0,7,0,0,7,0,0,0,7,0,7,0];
  const MAGIC = 0xc7;
  const crc32 = bytes => {
    let crc = 0xffffffff;
    for (const byte of bytes) { crc ^= byte; for (let i=0;i<8;i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const toBits = bytes => bytes.flatMap(byte => Array.from({length:8}, (_,i) => (byte >> (7-i)) & 1));
  const toSymbols = bytes => { const bits=toBits(bytes), symbols=[];for(let i=0;i<bits.length;i+=3)symbols.push(((bits[i]||0)<<2)|((bits[i+1]||0)<<1)|(bits[i+2]||0));return symbols; };
  const symbolHitCounts = Array.from({length:8},(_,symbol)=>symbol===0?0:Array.from({length:41},(_,i)=>-.49+i*.0245).filter(offset=>Math.abs(offset)<=(.18+(symbol-1)*.12)/2).length);
  const decodeSymbol = hits => { if(hits<3)return 0;let best=1;for(let symbol=2;symbol<8;symbol++)if(Math.abs(hits-symbolHitCounts[symbol])<Math.abs(hits-symbolHitCounts[best]))best=symbol;return best; };
  const fromSymbols = symbols => { const bits=[];for(const value of symbols)bits.push((value>>2)&1,(value>>1)&1,value&1);const bytes=[];for(let i=0;i+7<bits.length;i+=8){let value=0;for(let j=0;j<8;j++)value=(value<<1)|bits[i+j];bytes.push(value);}return bytes; };
  const makePayload = text => {
    const value = Array.from(new TextEncoder().encode(text));
    if (value.length > 380) throw new Error('Attendance code is too long for the circular display.');
    const body = [MAGIC, value.length >>> 8, value.length & 255, ...value]; const crc = crc32(body);
    return [...body, crc >>> 24, (crc >>> 16)&255, (crc >>> 8)&255, crc&255];
  };
  const radiusAt = (ring, size) => size * (0.19 + ring * (0.29 / (RINGS - 1)));
  const pointAt = (ring, sector, size, rotation=0, offset=0) => {
    const angle = ((sector + rotation + 0.5 + offset) / SECTORS) * Math.PI * 2 - Math.PI / 2;
    const radius = radiusAt(ring, size), center = size / 2;
    return [center + Math.cos(angle)*radius, center + Math.sin(angle)*radius];
  };
  function drawLogo(context, logo, label, center, diameter) {
    context.save(); context.beginPath(); context.arc(center,center,diameter/2,0,Math.PI*2); context.fillStyle='#fff'; context.fill();
    context.lineWidth=Math.max(2,diameter*.05);context.strokeStyle='#34363a';context.stroke();context.beginPath();context.arc(center,center,diameter*.4,0,Math.PI*2);context.clip();
    const fallback=()=>{const initials=(label||'MIU').trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();context.fillStyle='#14243b';context.font=`700 ${Math.round(diameter*.27)}px Arial,sans-serif`;context.textAlign='center';context.textBaseline='middle';context.fillText(initials||'MIU',center,center);};
    if(!logo){fallback();context.restore();return Promise.resolve();}
    return new Promise(resolve=>{const image=new Image();image.onload=()=>{const inset=diameter*.19,available=diameter-inset*2,scale=Math.min(available/image.naturalWidth,available/image.naturalHeight),w=image.naturalWidth*scale,h=image.naturalHeight*scale;context.drawImage(image,center-w/2,center-h/2,w,h);context.restore();resolve();};image.onerror=()=>{fallback();context.restore();resolve();};image.src=logo;});
  }
  // Attendance codes are standard QR codes. Level M (15% recovery) keeps the long token less dense; the centre logo covers ~3%. Phones' built-in
  // QR readers and the site scanner read them quickly at any distance; older circular codes still decode below.
  async function renderAttendanceQr(container, value, options={}) {
    if(!container||!value)throw new Error('Attendance code data is missing.');
    if(typeof window.QRCode!=='function'&&window.ensureQRCode)await window.ensureQRCode();
    if(typeof window.QRCode!=='function')throw new Error('The QR code could not load. Check your connection and try again.');
    const size=Math.max(280,Number(options.size)||336),pixels=size*3,margin=Math.round(pixels*.06),inner=pixels-margin*2;
    const holder=document.createElement('div');
    new window.QRCode(holder,{text:String(value),width:inner,height:inner,colorDark:'#111827',colorLight:'#ffffff',correctLevel:window.QRCode.CorrectLevel.M});
    const source=holder.querySelector('canvas')||holder.querySelector('img');
    const canvas=document.createElement('canvas');canvas.width=pixels;canvas.height=pixels;canvas.style.maxWidth=size+'px';
    canvas.className='attendance-qr-art is-standard-qr';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',options.alt||'Attendance QR code');
    const context=canvas.getContext('2d');context.fillStyle='#ffffff';context.fillRect(0,0,pixels,pixels);
    context.imageSmoothingEnabled=false;context.drawImage(source,margin,margin,inner,inner);
    container.replaceChildren(canvas);
    await drawLogo(context,options.logo,options.label,pixels/2,pixels*.2);return canvas;
  }
  function decodeCircularAttendanceCode(imageData, options={}) {
    const {width,height}=imageData, diameter=Math.min(width,height), size=diameter*.97,scale=size/336;
    const centers=options.search ? [[.5,.5],...[.3,.4,.6,.7].flatMap(x=>[.3,.4,.5,.6,.7].map(y=>[x,y]))].map(([x,y])=>[width*x,height*y]) : [[.5,.5],[.45,.5],[.55,.5],[.5,.45],[.5,.55]].map(([x,y])=>[width*x,height*y]);
    // This code is shown centered on a dark circular field. Try a few practical
    // display sizes so the scanner also works when the code is farther away.
    const lum=(x,y)=>{const px=Math.round(x),py=Math.round(y);if(px<1||py<1||px>=width-1||py>=height-1)return 0;const i=(py*width+px)*4;return imageData.data[i]*.299+imageData.data[i+1]*.587+imageData.data[i+2]*.114>40?1:0;};
    const sampler=(cx,cy,factor)=>(ring,sector,rotation=0,offset=0)=>{const [nx,ny]=pointAt(ring,sector,336,rotation,offset);return lum((nx-168)*scale*factor+cx,(ny-168)*scale*factor+cy);};
    // Marker ring (ring 0): returns the best rotation and how many of its 28 sectors match.
    const marker=(sample)=>{let best=null,matches=0;for(let step=0;step<SECTORS*4;step++){const candidate=step/4;let m=0;for(let i=0;i<MARKER.length;i++)if(sample(0,i,candidate)===(MARKER[i]?1:0))m++;if(m>matches){matches=m;best=candidate;}}return {rotation:best,matches};};
    // Fine rotation for the marker ring; the lowest score is the closest fit of size and rotation.
    const refine=(sample,coarseRotation)=>{
      let rotation=coarseRotation,bestRotationScore=Infinity;
      for(let step=-25;step<=25;step++) {
        const candidate=coarseRotation+step*.005;let score=0;
        for(let sector=0;sector<MARKER.length;sector++) {
          let hits=0;for(let i=0;i<41;i++)hits+=sample(0,sector,candidate,-.49+i*.0245);
          score+=Math.abs(hits/41-(MARKER[sector]?1:0));
        }
        if(score<bestRotationScore){bestRotationScore=score;rotation=candidate;}
      }
      return {rotation,bestRotationScore};
    };
    const readAt=(sample,coarseRotation)=>{
      const {rotation,bestRotationScore}=refine(sample,coarseRotation);
      const rotationCandidates=[rotation];
      if(bestRotationScore>0.2) for(let step=-20;step<=20;step++) rotationCandidates.push(coarseRotation+step*.0125);
      for(const readRotation of [...new Set(rotationCandidates)]) {
        const symbols=[];
        for(let ring=1;ring<RINGS;ring++)for(let sector=0;sector<SECTORS;sector++) {
          let hits=0;for(let i=0;i<41;i++)hits+=sample(ring,sector,readRotation,-.49+i*.0245);
          symbols.push(decodeSymbol(hits));
        }
        const bytes=fromSymbols(symbols);if(bytes.length<7||bytes[0]!==MAGIC)continue;
        const length=bytes[1]*256+bytes[2],end=3+length;if(end+4>bytes.length)continue;
        const body=bytes.slice(0,end),expected=((bytes[end]<<24)|(bytes[end+1]<<16)|(bytes[end+2]<<8)|bytes[end+3])>>>0;
        if(crc32(body)!==expected)continue;
        try{return new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(bytes.slice(3,end)));}catch{}
      }
      return '';
    };
    for(const [cx,cy] of centers) {
      // 1) Coarse 2% size steps locate the marker ring (cheap). 2) The outer data rings need the exact size, so the
      // reader fine-tunes in 0.4% steps around the best marker sizes (a 1% error shifts the outer rings by a ring).
      const found=[];
      for(let step=104;step>=25;step-=2){const factor=step/100,m=marker(sampler(cx,cy,factor));if(m.matches>=25)found.push({factor,...m});}
      if(!found.length)continue;
      // The exact coarse size is read first, which is all a sharp, well-framed code needs.
      found.sort((a,b)=>b.matches-a.matches);
      const first=readAt(sampler(cx,cy,found[0].factor),found[0].rotation);if(first)return first;
      const fits=[],seen=new Set([found[0].factor]);
      for(const base of found.slice(0,3)) for(const delta of [.004,-.004,.008,-.008,.012,-.012,.016,-.016]) {
        const factor=Math.round((base.factor+delta)*1000)/1000;if(seen.has(factor))continue;seen.add(factor);
        const sample=sampler(cx,cy,factor),m=marker(sample);if(m.matches<26)continue;
        fits.push({sample,rotation:m.rotation,score:refine(sample,m.rotation).bestRotationScore});
      }
      fits.sort((a,b)=>a.score-b.score);
      for(const fit of fits.slice(0,3)){const value=readAt(fit.sample,fit.rotation);if(value)return value;}
    }
    return '';
  }
  window.renderAttendanceQr=renderAttendanceQr;
  window.decodeCircularAttendanceCode=decodeCircularAttendanceCode;
})();
