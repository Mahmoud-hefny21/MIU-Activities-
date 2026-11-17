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
  function paint(context, bytes, size) {
    const center=size/2, outer=size*.495;
    context.fillStyle='#171719';context.beginPath();context.arc(center,center,outer,0,Math.PI*2);context.fill();
    const all=[...MARKER,...toSymbols(bytes)],step=Math.PI*2/SECTORS, radial=size*.29/RINGS;
    for(let ring=0;ring<RINGS;ring++) for(let sector=0;sector<SECTORS;sector++) {
      const symbol=all[ring*SECTORS+sector]||0; if(!symbol) continue;
      // Each visible dash carries three bits through its length. This creates
      // fewer, longer segmented marks while keeping enough capacity for tokens.
      const fraction=ring===0&&symbol===7?1:.18+(symbol-1)*.12, a0=(sector+.5-fraction/2)*step-Math.PI/2,a1=(sector+.5+fraction/2)*step-Math.PI/2,r=radiusAt(ring,size),thickness=radial*.66;
      context.beginPath();context.arc(center,center,r, a0,a1);context.strokeStyle=ring%3===0?'#fff':'#89898b';context.lineWidth=thickness;context.lineCap='butt';context.stroke();
    }
  }
  async function renderAttendanceQr(container, value, options={}) {
    if(!container||!value)throw new Error('Attendance code data is missing.');
    const size=Math.max(280,Number(options.size)||336),canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;canvas.className='attendance-qr-art';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',options.alt||'Rotating circular attendance code');
    paint(canvas.getContext('2d'),makePayload(value),size);container.replaceChildren(canvas);
    await drawLogo(canvas.getContext('2d'),options.logo,options.label,size/2,size*.22);return canvas;
  }
  function decodeCircularAttendanceCode(imageData, options={}) {
    const {width,height}=imageData, diameter=Math.min(width,height), size=diameter*.97,scale=size/336;
    const centers=options.search ? [[.5,.5],...[.3,.4,.6,.7].flatMap(x=>[.3,.4,.5,.6,.7].map(y=>[x,y]))].map(([x,y])=>[width*x,height*y]) : [[.5,.5],[.45,.5],[.55,.5],[.5,.45],[.5,.55]].map(([x,y])=>[width*x,height*y]);
    // This code is shown centered on a dark circular field. Try a few practical
    // display sizes so the scanner also works when the code is farther away.
    for(const [cx,cy] of centers) for(let factor=1;factor>=.25;factor-=.02) {
      const sample=(ring,sector,rotation=0,offset=0)=>{
        const [nx,ny]=pointAt(ring,sector,336,rotation,offset),x=(nx-168)*scale*factor+cx,y=(ny-168)*scale*factor+cy;
        const px=Math.round(x),py=Math.round(y);if(px<1||py<1||px>=width-1||py>=height-1)return 0;
        const i=(py*width+px)*4;return imageData.data[i]*.299+imageData.data[i+1]*.587+imageData.data[i+2]*.114>40?1:0;
      };
      let coarseRotation=null,coarseMatches=0;
      for(let rotationStep=0;rotationStep<SECTORS*4;rotationStep++) {
        const candidate=rotationStep/4;
        let matches=0;for(let i=0;i<MARKER.length;i++)if(sample(0,i,candidate)===(MARKER[i]?1:0))matches++;
        if(matches>coarseMatches){coarseMatches=matches;coarseRotation=candidate;}
      }
      if(coarseMatches<25)continue;
      let rotation=coarseRotation,bestRotationScore=Infinity;
      for(let step=-25;step<=25;step++) {
        const candidate=coarseRotation+step*.005;let score=0;
        for(let sector=0;sector<MARKER.length;sector++) {
          let hits=0;for(let i=0;i<41;i++)hits+=sample(0,sector,candidate,-.49+i*.0245);
          score+=Math.abs(hits/41-(MARKER[sector]?1:0));
        }
        if(score<bestRotationScore){bestRotationScore=score;rotation=candidate;}
      }
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
    }
    return '';
  }
  window.renderAttendanceQr=renderAttendanceQr;
  window.decodeCircularAttendanceCode=decodeCircularAttendanceCode;
})();
