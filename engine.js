/* Drawing and folding geometry. No network or DOM dependencies. */
(function(root){'use strict';
  const SIZE=720,TAU=Math.PI*2;
  const MODES=[{n:1,name:'对折',sub:'左右对称'},{n:3,name:'三折式',sub:'三组团花'},{n:4,name:'四折式',sub:'四组团花'},{n:5,name:'五折式',sub:'五组团花'},{n:6,name:'六折式',sub:'六组团花'},{n:8,name:'八折式',sub:'八组团花'},{n:0,name:'连续剪法',sub:'正反交替折'}];
  function geometry(n){if(!MODES.some(m=>m.n===n))throw Error('Unknown fold');if(n===0)return{n,type:'strip',left:270,top:120,width:180,height:480,x:360,y:600,r:480,layers:6};const angle=Math.PI/n,r=Math.min(540,300/Math.sin(angle/2));return {n,type:'radial',angle,r,x:360,y:(720+r)/2,layers:2*n,start:-Math.PI/2-angle/2};}
  function sector(ctx,g,span=g.angle){ctx.beginPath();if(g.type==='strip'){ctx.rect(g.left,g.top,g.width,g.height);return;}ctx.moveTo(g.x,g.y);ctx.arc(g.x,g.y,g.r,g.start,g.start+span);ctx.closePath();}
  function inside(x,y,g){if(g.type==='strip')return x>=g.left&&x<=g.left+g.width&&y>=g.top&&y<=g.top+g.height;const dx=x-g.x,dy=y-g.y,r=Math.hypot(dx,dy);let a=Math.atan2(dy,dx)-g.start;a=(a+TAU)%TAU;return r<=g.r&&a<=g.angle;}
  function closeStroke(stroke){if(stroke.tool==='eraser'||stroke.points.length<4)return stroke;const p=stroke.points,first=p[0],last=p[p.length-1];let length=0;for(let i=1;i<p.length;i++)length+=Math.hypot(p[i].x-p[i-1].x,p[i].y-p[i-1].y);if(length>40&&Math.hypot(first.x-last.x,first.y-last.y)<=14){stroke.points[stroke.points.length-1]={...first};stroke.closed=true;}return stroke;}
  function drawStroke(ctx,stroke){if(!stroke.points.length)return;ctx.globalCompositeOperation=stroke.tool==='eraser'?'destination-out':'source-over';ctx.strokeStyle=ctx.fillStyle='#24312a';ctx.lineWidth=stroke.tool==='eraser'?stroke.size:4;ctx.lineCap=ctx.lineJoin='round';const p=stroke.points;ctx.beginPath();ctx.moveTo(p[0].x,p[0].y);for(let i=1;i<p.length;i++)ctx.lineTo(p[i].x,p[i].y);if(p.length===1)ctx.lineTo(p[0].x+.01,p[0].y);ctx.stroke();}
  function makeLines(canvas,strokes){canvas.width=canvas.height=SIZE;const c=canvas.getContext('2d');strokes.forEach(s=>drawStroke(c,s));return canvas;}
  // Line topology is evaluated before clipping: an outside-to-inside stroke can
  // meet the paper edge naturally. Only the rendered preview is clipped.
  function makeMask(canvas,g,strokes){
    const W=SIZE,N=W*W;canvas.width=canvas.height=W;const c=canvas.getContext('2d');
    strokes.forEach(s=>drawStroke(c,s));const ink=c.getImageData(0,0,W,W).data;
    c.clearRect(0,0,W,W);sector(c,g);c.fillStyle='#000';c.fill();const paper=c.getImageData(0,0,W,W).data;
    const wall=new Uint8Array(N),outside=new Uint8Array(N),cut=new Uint8Array(N),labels=new Int32Array(N),queue=new Int32Array(N);
    for(let i=0;i<N;i++)wall[i]=ink[i*4+3]>=80?1:0;
    let head=0,tail=0;
    function outerPush(i){if(!wall[i]&&!outside[i]){outside[i]=1;queue[tail++]=i;}}
    for(let x=0;x<W;x++){outerPush(x);outerPush((W-1)*W+x);}for(let y=1;y<W-1;y++){outerPush(y*W);outerPush(y*W+W-1);}
    while(head<tail){const i=queue[head++],x=i%W;if(x)outerPush(i-1);if(x<W-1)outerPush(i+1);if(i>=W)outerPush(i-W);if(i<N-W)outerPush(i+W);}
    // Every enclosed line region is removed, even if larger than the remainder.
    for(let i=0;i<N;i++)if(!outside[i]&&!wall[i])cut[i]=1;
    let label=0,largest=0,maxSize=0;
    function partPush(i){if(!labels[i]&&!wall[i]&&!cut[i]&&paper[i*4+3]>=128){labels[i]=label;queue[tail++]=i;}}
    for(let seed=0;seed<N;seed++){
      if(labels[seed]||wall[seed]||cut[seed]||paper[seed*4+3]<128)continue;
      label++;head=tail=0;partPush(seed);
      while(head<tail){const i=queue[head++],x=i%W;if(x)partPush(i-1);if(x<W-1)partPush(i+1);if(i>=W)partPush(i-W);if(i<N-W)partPush(i+W);}
      if(tail>maxSize){maxSize=tail;largest=label;}
    }
    // Open lines crossing the paper boundary remove smaller connected pieces.
    for(let i=0;i<N;i++)if(labels[i]&&labels[i]!==largest)cut[i]=1;
    const filled=new Uint8Array(cut);let pixels=0;
    // Include the line edge next to an actual cut; incomplete lines are guides only.
    for(let i=0;i<N;i++)if(wall[i]){const x=i%W,y=Math.floor(i/W);search:for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const nx=x+dx,ny=y+dy;if(nx>=0&&nx<W&&ny>=0&&ny<W&&cut[ny*W+nx]){filled[i]=1;break search;}}}
    const output=c.createImageData(W,W);for(let i=0;i<N;i++)if(filled[i]&&paper[i*4+3]){output.data[i*4+3]=paper[i*4+3];pixels++;}
    c.clearRect(0,0,W,W);c.putImageData(output,0,0);canvas.analysis={pixels};return canvas;
  }
  function folded(canvas,g,mask,color='#bc4437',progress=1){canvas.width=canvas.height=SIZE;const c=canvas.getContext('2d');sector(c,g);c.fillStyle=color;c.fill();if(mask&&progress>0){c.save();c.globalCompositeOperation='destination-out';c.beginPath();c.rect(0,0,SIZE,SIZE*progress);c.clip();c.drawImage(mask,0,0);c.restore();}return canvas;}
  function unfold(canvas,g,piece,progress=1){canvas.width=canvas.height=SIZE;const c=canvas.getContext('2d');if(g.type==='strip'){const scale=600/(g.layers*g.width);for(let k=0;k<g.layers;k++){c.save();c.translate(360+(k-(g.layers-1)/2)*g.width*scale*progress,360);c.scale(scale*(k%2?1-2*progress:1),scale);c.drawImage(piece,-g.x,-g.top-g.height/2);c.restore();}return canvas;}const scale=300/g.r;for(let k=0;k<g.layers;k++){c.save();c.translate(360,360);c.rotate(k*g.angle*progress);c.scale(scale*(k%2?(1-2*progress):1),scale);c.drawImage(piece,-g.x,-g.y);c.restore();}return canvas;}
  function steps(n){const g=geometry(n);if(n===0)return Array.from({length:6},(_,i)=>({span:6-i,title:i===0?'长方形纸，分成六等份':i===5?'折成一叠，保留连接处':i%2?'沿折线向前折':'沿下一条折线向后折',text:i===0?'按等宽折线准备纸张。接下来像折扇一样正反交替折叠。':i===5?'六层对齐后开始画裁剪线。左右两条边是连接折边，别把连接部位全部剪断。':'正反交替，将外侧一格折向相邻一格。展开时图形会沿水平方向连续排列。'}));const a=[{title:'准备一张圆形彩纸',text:'先看圆心与折线。彩纸从完整的圆开始，接下来沿直径对折。',span:TAU},{title:'沿直径，对折成半圆',text:n===1?'两半重合，边缘对齐。直边是折边，剪口会在展开时左右呼应。':`把两半重合。接下来将半圆分成${n}个相等扇区，每一扇是${Number((180/n).toFixed(1))}°。`,span:Math.PI}];for(let j=1;j<n;j++)a.push({title:j===n-1?'最后一折，对齐边缘':`将最外一扇，向里折拢`,text:j===n-1?`沿最后一条折线折合，得到${Number((180/n).toFixed(1))}°扇形、${2*n}层纸。确认后就可以画样了。`:'沿高亮虚线，把最外侧的一扇折向相邻扇区。下一步继续将叠起的部分向里折。',span:Math.PI-j*g.angle});return a;}
  // Approximate count of physically disconnected pieces at a downsampled resolution.
  function components(canvas,factory){const c=factory(240,240),ctx=c.getContext('2d');ctx.drawImage(canvas,0,0,240,240);const data=ctx.getImageData(0,0,240,240).data,seen=new Uint8Array(240*240);let count=0,pixels=0;const queue=new Int32Array(seen.length);for(let i=0;i<seen.length;i++){if(seen[i]||data[i*4+3]<128)continue;let head=0,tail=0;queue[tail++]=i;seen[i]=1;while(head<tail){const at=queue[head++],x=at%240;for(const nb of [x>0?at-1:-1,x<239?at+1:-1,at-240,at+240])if(nb>=0&&nb<seen.length&&!seen[nb]&&data[nb*4+3]>=128){seen[nb]=1;queue[tail++]=nb;}}if(tail>=8)count++;pixels+=tail;}return{count,pixels};}
  const API={SIZE,TAU,MODES,geometry,sector,inside,closeStroke,drawStroke,makeLines,makeMask,folded,unfold,steps,components};if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.PaperEngine=API;
})(typeof window!=='undefined'?window:this);
