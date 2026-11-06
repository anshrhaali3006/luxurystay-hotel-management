// Dependency-free 3D behaviours: cursor tilt + glare, hero parallax, 3D scroll reveal.
const TILT='[data-tilt],.service-grid article,.stat-card,.portal-stats article,.guest-booking-card,.booking-summary,.reference-card';
const REVEAL='.experience-section>*,.room-showcase>*,.service-grid>*,.results-heading,.available-room,.member-banner>*,.section-heading-row,.portal-stats>*,.guest-booking-card,.services-heading,.guest-checkout,.booking-success';
const PARALLAX='.lux-hero,.booking-page-hero,.portal-welcome,.login-art';
const reduce=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function initLuxeEffects(){
  if(typeof window==='undefined'||window.__luxeFx)return;window.__luxeFx=true;
  let raf=0,active=null;
  const tiltMove=e=>{
    if(e.pointerType&&e.pointerType!=='mouse')return;
    const el=e.target.closest?.(TILT);
    if(active&&active!==el){active.style.setProperty('--rx','0deg');active.style.setProperty('--ry','0deg');active.classList.remove('is-tilting')}
    active=el||null;if(!el||reduce())return;
    cancelAnimationFrame(raf);
    raf=requestAnimationFrame(()=>{
      const r=el.getBoundingClientRect(),px=(e.clientX-r.left)/r.width,py=(e.clientY-r.top)/r.height;
      const max=el.matches('.stat-card,.portal-stats article')?7:9;
      el.style.setProperty('--ry',`${((px-.5)*2*max).toFixed(2)}deg`);
      el.style.setProperty('--rx',`${(-(py-.5)*2*max).toFixed(2)}deg`);
      el.style.setProperty('--gx',`${(px*100).toFixed(1)}%`);el.style.setProperty('--gy',`${(py*100).toFixed(1)}%`);
      el.classList.add('is-tilting');
    });
  };
  document.addEventListener('pointermove',tiltMove,{passive:true});
  document.addEventListener('pointerleave',()=>{if(active){active.style.setProperty('--rx','0deg');active.style.setProperty('--ry','0deg');active.classList.remove('is-tilting');active=null}},true);

  // magnetic buttons: primary actions lean a few pixels toward the cursor
  const MAG='.gold-button,.auth3d-submit,.button.primary';let magnet=null;
  document.addEventListener('pointermove',e=>{
    if(reduce()||(e.pointerType&&e.pointerType!=='mouse'))return;
    const el=e.target.closest?.(MAG);
    if(magnet&&magnet!==el){magnet.style.translate='';magnet=null}
    if(!el||el.disabled)return;magnet=el;
    const r=el.getBoundingClientRect();
    el.style.translate=`${((e.clientX-r.left-r.width/2)*.12).toFixed(1)}px ${((e.clientY-r.top-r.height/2)*.18).toFixed(1)}px`;
  },{passive:true});

  // hero parallax: pointer position becomes --mx/--my (-1..1)
  document.addEventListener('pointermove',e=>{
    if(reduce()||(e.pointerType&&e.pointerType!=='mouse'))return;
    const host=e.target.closest?.(PARALLAX);if(!host)return;
    const r=host.getBoundingClientRect();
    host.style.setProperty('--mx',(((e.clientX-r.left)/r.width-.5)*2).toFixed(3));
    host.style.setProperty('--my',(((e.clientY-r.top)/r.height-.5)*2).toFixed(3));
  },{passive:true});

  // scroll-linked depth for the hero (subtle)
  window.addEventListener('scroll',()=>{document.documentElement.style.setProperty('--scroll',String(Math.min(1,window.scrollY/800)))},{passive:true});

  // 3D reveal on scroll
  if(!('IntersectionObserver' in window)||reduce())return;
  const io=new IntersectionObserver(entries=>entries.forEach(en=>{if(en.isIntersecting){en.target.classList.add('in-view');io.unobserve(en.target)}}),{threshold:.12,rootMargin:'0px 0px -6% 0px'});
  const seen=new WeakSet();
  const scan=(root=document)=>root.querySelectorAll?.(REVEAL).forEach(el=>{if(seen.has(el))return;seen.add(el);el.classList.add('reveal-3d');el.style.setProperty('--d',`${Math.min(6,[...(el.parentElement?.children||[])].indexOf(el))*70}ms`);io.observe(el)});
  scan();
  new MutationObserver(m=>m.forEach(x=>x.addedNodes.forEach(n=>{if(n.nodeType===1){if(n.matches?.(REVEAL)&&!seen.has(n)){seen.add(n);n.classList.add('reveal-3d');io.observe(n)}scan(n)}}))).observe(document.getElementById('root')||document.body,{childList:true,subtree:true});
}
