/**
 * Page web du « Rush » en 3D (screens/JeuRushScreen.js) : course sans fin dans
 * une rue de ville (chaussée avec marquage, trottoirs, immeubles à fenêtres
 * éclairées, devantures de commerces avec auvents, lampadaires, arbres,
 * panneaux Pearl Streets), rendu Three.js avec lumière, ombres et brouillard.
 * La lumière change tous les 1000 m, du plein jour à la nuit.
 *
 * Commandes (balayages du doigt, aucune flèche à l'écran) : gauche et droite
 * pour changer de voie, haut pour sauter, bas pour glisser (en l'air : chute
 * rapide puis glissade). Obstacles : palissades de chantier à éviter, barres
 * basses à sauter, tonneaux qui roulent, bannières suspendues sous lesquelles
 * il faut glisser. Colis ramassés : 10 points, colis doré : 50 points.
 *
 * Bonus brillants sur la route, avec jauge de temps dans l'écran :
 *   turbo (vitesse et invincibilité), super saut, x2 points, aimant à colis,
 *   casque (absorbe un choc).
 *
 * Messages vers l'app :
 *   { t: 'pret' | 'erreur' }
 *   { t: 'score', score, pieces, total, palier, boosters: [{ id, ratio }] }
 *   { t: 'palier', palier }
 *   { t: 'etat', ... } (photo de la partie, pour la reprise)
 *   { t: 'fin', score, distance, pieces, total, palier }
 * Commandes depuis l'app : window.jeu.demarrer(etat?) / pause() / reprendre(),
 * window.sonJeu.* (utils/sonJeux.js).
 * Aucun accent grave ni dollar suivi d'accolade dans ce code : il vit dans une chaîne.
 */
import { MOTEUR_AUDIO_JS } from './sonJeux';
import { LOGO_PEARL_DATA_URL } from './logoPearlBase64';

const THREE_URLS = [
  'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js',
  'https://unpkg.com/three@0.149.0/build/three.min.js',
];

export const JEU_JS = `
(function(){
  function envoyer(o){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(o)); }catch(e){} }
  var T=window.THREE;
  if(!T){ envoyer({t:'erreur'}); return; }
  var son=function(n){ if(window.sonJeu) window.sonJeu.jouer(n); };
  if(window.sonJeu&&window.sonJeu.choisir) window.sonJeu.choisir('rush');
  function num(x){ x=+x; return isFinite(x)?x:0; }

  // ---------- Réglages ----------
  var LARGEUR_PISTE=9, BORD=LARGEUR_PISTE/2-0.55, VOIES=[-3,0,3];
  var V_DEPART=11, V_MAX=24, GRAV=28, V_SAUT=9.6, PALIER=1000;
  var SEUIL=26;
  var DUREE={turbo:5, saut:10, x2:10, aimant:10};
  var CLES_BONUS=['turbo','saut','x2','aimant'];
  var CIELS=[
    {ciel:0x7ec8ff, bas:0xcdeeff, soleil:0xfff3d6, i:1.25, brume:0xbfe6ff, nuit:0},
    {ciel:0x9fd6ff, bas:0xffe9b8, soleil:0xffe0a8, i:1.15, brume:0xffe2b0, nuit:0.05},
    {ciel:0xff9e6b, bas:0xffd29a, soleil:0xffb070, i:1.0,  brume:0xffb88a, nuit:0.3},
    {ciel:0x6a5acd, bas:0xd9a7ff, soleil:0xffc8e8, i:0.85, brume:0xb49ae6, nuit:0.6},
    {ciel:0x1b2559, bas:0x3c4f9e, soleil:0xbcd0ff, i:0.7,  brume:0x2c3a7a, nuit:1},
    {ciel:0x86e0ff, bas:0xf3fbff, soleil:0xffffff, i:1.3,  brume:0xe6f7ff, nuit:0}
  ];

  // ---------- Scène ----------
  var rendu=new T.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
  rendu.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
  rendu.setSize(window.innerWidth,window.innerHeight);
  rendu.shadowMap.enabled=true; rendu.shadowMap.type=T.PCFSoftShadowMap;
  rendu.outputEncoding=T.sRGBEncoding;
  rendu.toneMapping=T.ACESFilmicToneMapping; rendu.toneMappingExposure=1.05;
  document.body.appendChild(rendu.domElement);
  var scene=new T.Scene();
  scene.fog=new T.Fog(0xbfe6ff,35,140);
  var camera=new T.PerspectiveCamera(62,window.innerWidth/window.innerHeight,0.1,400);
  var hemi=new T.HemisphereLight(0xcdeeff,0x6a7080,0.75); scene.add(hemi);
  var soleil=new T.DirectionalLight(0xfff3d6,1.25);
  soleil.castShadow=true; soleil.shadow.mapSize.set(1024,1024);
  var sc=soleil.shadow.camera; sc.left=-14; sc.right=14; sc.top=22; sc.bottom=-12; sc.near=1; sc.far=80;
  soleil.shadow.bias=-0.0006; scene.add(soleil); scene.add(soleil.target);

  // Ciel en dégradé (grande sphère vue de l'intérieur).
  var cielMat=new T.ShaderMaterial({side:T.BackSide, depthWrite:false, fog:false,
    uniforms:{haut:{value:new T.Color(0x7ec8ff)}, bas:{value:new T.Color(0xcdeeff)}},
    vertexShader:'varying vec3 vp; void main(){ vp=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader:'uniform vec3 haut; uniform vec3 bas; varying vec3 vp; void main(){ float h=clamp(vp.y*1.6+0.15,0.0,1.0); gl_FragColor=vec4(mix(bas,haut,h),1.0); }'});
  var ciel=new T.Mesh(new T.SphereGeometry(300,24,12),cielMat); scene.add(ciel);

  // ---------- Textures dessinées ----------
  function toile(l,h,dessin){ var c=document.createElement('canvas'); c.width=l; c.height=h; dessin(c.getContext('2d'),l,h); var t=new T.CanvasTexture(c); t.encoding=T.sRGBEncoding; t.anisotropy=4; return t; }
  function repeter(t){ t.wrapS=t.wrapT=T.RepeatWrapping; return t; }

  // Chaussée : bitume, marquage des voies (pointillés) et bords pleins. 9 m x 7,5 m par tuile.
  var texRoute=repeter(toile(256,256,function(g,l,h){
    g.fillStyle='#4d525e'; g.fillRect(0,0,l,h);
    for(var i=0;i<900;i++){ var v=60+Math.floor(Math.random()*40); g.fillStyle='rgba('+v+','+v+','+(v+8)+',0.35)'; g.fillRect(Math.random()*l,Math.random()*h,1+Math.random()*3,1+Math.random()*3); }
    g.fillStyle='rgba(30,32,40,0.18)'; g.fillRect(40,0,30,h); g.fillRect(186,0,30,h);
    g.fillStyle='#f4f1e6'; g.fillRect(84,16,5,96); g.fillRect(168,16,5,96);
    g.fillStyle='#f4e7a8'; g.fillRect(6,0,5,h); g.fillRect(245,0,5,h); }));
  texRoute.repeat.set(1,8);
  var texTrottoir=repeter(toile(128,128,function(g,l,h){
    g.fillStyle='#b9bcc4'; g.fillRect(0,0,l,h);
    for(var y=0;y<2;y++) for(var x=0;x<2;x++){ var v=176+Math.floor(Math.random()*26); g.fillStyle='rgb('+v+','+v+','+(v+6)+')'; g.fillRect(x*64+2,y*64+2,60,60); } }));
  texTrottoir.repeat.set(1,20);
  var texBarriere=repeter(toile(128,64,function(g,l,h){
    g.fillStyle='#ffffff'; g.fillRect(0,0,l,h); g.fillStyle='#e03a2f';
    for(var i=-2;i<8;i++){ g.beginPath(); g.moveTo(i*24,h); g.lineTo(i*24+12,h); g.lineTo(i*24+12+h,0); g.lineTo(i*24+h,0); g.closePath(); g.fill(); } }));
  var texGlow=toile(64,64,function(g,l,h){ var r=g.createRadialGradient(32,32,0,32,32,32); r.addColorStop(0,'rgba(255,240,190,1)'); r.addColorStop(0.35,'rgba(255,220,140,0.45)'); r.addColorStop(1,'rgba(255,220,140,0)'); g.fillStyle=r; g.fillRect(0,0,l,h); });
  var texX2=toile(128,128,function(g,l,h){ g.fillStyle='#ffffff'; g.font='bold 92px sans-serif'; g.textAlign='center'; g.textBaseline='middle'; g.strokeStyle='#8a5a00'; g.lineWidth=8; g.strokeText('x2',64,70); g.fillText('x2',64,70); });

  // Façades : fenêtres avec encadrement, corniches, fenêtres allumées au hasard (carte lumineuse pour la nuit).
  var PAL_FAC=['#d9c7a8','#b8604f','#9fb2c4','#e4dccb','#8fa085','#c9976a'];
  function facade(i){
    var c1=document.createElement('canvas'); c1.width=c1.height=256; var g=c1.getContext('2d');
    var c2=document.createElement('canvas'); c2.width=c2.height=256; var e=c2.getContext('2d');
    g.fillStyle=PAL_FAC[i%PAL_FAC.length]; g.fillRect(0,0,256,256);
    for(var k=0;k<260;k++){ g.fillStyle='rgba(0,0,0,'+(Math.random()*0.05)+')'; g.fillRect(Math.random()*256,Math.random()*256,3+Math.random()*10,2); }
    e.fillStyle='#000000'; e.fillRect(0,0,256,256);
    for(var ligne=0;ligne<2;ligne++){ var fy=ligne*128;
      g.fillStyle='rgba(0,0,0,0.18)'; g.fillRect(0,fy,256,5);
      g.fillStyle='rgba(255,255,255,0.22)'; g.fillRect(0,fy+5,256,3);
      for(var col=0;col<2;col++){ var cx=64+col*128, x0=cx-34, y0=fy+24, allume=Math.random()<0.4;
        g.fillStyle='rgba(255,255,255,0.55)'; g.fillRect(x0-5,y0-7,78,100);
        var gr=g.createLinearGradient(0,y0,0,y0+88);
        if(allume){ gr.addColorStop(0,'#ffe9a8'); gr.addColorStop(1,'#ffc766'); } else { gr.addColorStop(0,'#5d7690'); gr.addColorStop(1,'#26364a'); }
        g.fillStyle=gr; g.fillRect(x0,y0,68,88);
        g.fillStyle='rgba(255,255,255,0.7)'; g.fillRect(cx-1.5,y0,3,88); g.fillRect(x0,y0+40,68,3);
        g.fillStyle='rgba(0,0,0,0.3)'; g.fillRect(x0-10,y0+92,88,7);
        if(allume){ e.fillStyle='#ffcf70'; e.fillRect(x0,y0,68,88); e.fillStyle='#000000'; e.fillRect(cx-1.5,y0,3,88); e.fillRect(x0,y0+40,68,3); }
      }
    }
    var t1=new T.CanvasTexture(c1), t2=new T.CanvasTexture(c2);
    [t1,t2].forEach(function(t){ t.wrapS=t.wrapT=T.RepeatWrapping; t.anisotropy=4; t.encoding=T.sRGBEncoding; });
    return {map:t1, em:t2};
  }
  // Devantures : enseigne, deux vitrines éclairées garnies, porte.
  var BOUTIQUES=[
    {nom:'BOULANGERIE', mur:'#e9c58a', auv:'#c0392b'}, {nom:'FLEURISTE', mur:'#a8d5ba', auv:'#2e8b57'},
    {nom:'CAFÉ', mur:'#f4d6c0', auv:'#1f6fb2'}, {nom:'LIBRAIRIE', mur:'#c9b2e8', auv:'#7b4fb3'},
    {nom:'PRIMEUR', mur:'#f2e29b', auv:'#e67e22'}, {nom:'PIZZERIA', mur:'#f1b3b3', auv:'#d63031'}
  ];
  var COUL_PRODUITS=['#e74c3c','#f1c40f','#27ae60','#e67e22','#8e44ad','#ecf0f1','#d35400'];
  function boutique(b){
    var c1=document.createElement('canvas'); c1.width=512; c1.height=128; var g=c1.getContext('2d');
    var c2=document.createElement('canvas'); c2.width=512; c2.height=128; var e=c2.getContext('2d');
    g.fillStyle=b.mur; g.fillRect(0,0,512,128);
    e.fillStyle='#000000'; e.fillRect(0,0,512,128);
    g.fillStyle='#16223F'; g.fillRect(0,0,512,34);
    g.fillStyle='#ffffff'; g.font='bold 24px sans-serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(b.nom,256,18);
    e.fillStyle='#ffffff'; e.font='bold 24px sans-serif'; e.textAlign='center'; e.textBaseline='middle'; e.fillText(b.nom,256,18);
    [[18,196],[298,196]].forEach(function(v){
      var gr=g.createLinearGradient(0,46,0,122); gr.addColorStop(0,'#fff1c4'); gr.addColorStop(1,'#ffd27a');
      g.fillStyle='#2b3350'; g.fillRect(v[0]-4,42,v[1]+8,84); g.fillStyle=gr; g.fillRect(v[0],46,v[1],76);
      e.fillStyle='#ffcf70'; e.fillRect(v[0],46,v[1],76);
      for(var k=0;k<9;k++){ g.fillStyle=COUL_PRODUITS[(Math.random()*COUL_PRODUITS.length)|0]; g.fillRect(v[0]+8+k*20,100-Math.random()*16,14,22); }
      g.fillStyle='rgba(255,255,255,0.4)'; g.fillRect(v[0],46,v[1],5);
    });
    g.fillStyle='#16223F'; g.fillRect(222,44,68,84); g.fillStyle='#8fb9e3'; g.fillRect(230,52,52,60);
    e.fillStyle='#3a4a66'; e.fillRect(230,52,52,60);
    g.fillStyle='#f4c542'; g.fillRect(274,86,4,12);
    var t1=new T.CanvasTexture(c1), t2=new T.CanvasTexture(c2); t1.encoding=t2.encoding=T.sRGBEncoding; t1.anisotropy=4;
    return {map:t1, em:t2};
  }
  function rayures(couleur){ return repeter(toile(64,64,function(g,l,h){ g.fillStyle='#ffffff'; g.fillRect(0,0,l,h); g.fillStyle=couleur; for(var i=0;i<4;i++) g.fillRect(i*16,0,8,h); })); }
  // Panneau Pearl Streets : plaque verte, cadre bleu nuit, logo blanc (window.__LOGO_PEARL).
  var texLogo=toile(512,256,function(g,l,h){ g.fillStyle='#0BB58E'; g.fillRect(0,0,l,h); g.fillStyle='#16223F'; g.fillRect(12,12,l-24,h-24); });
  (function(){ if(!window.__LOGO_PEARL) return; var im=new Image(); im.onload=function(){ var c=texLogo.image, g=c.getContext('2d');
    var lw=c.width-80, lh=lw*im.height/im.width; if(lh>c.height-60){ lh=c.height-60; lw=lh*im.width/im.height; }
    g.drawImage(im,(c.width-lw)/2,(c.height-lh)/2,lw,lh); texLogo.needsUpdate=true; }; im.src=window.__LOGO_PEARL; })();

  // ---------- Matériaux partagés ----------
  function std(c,o){ o=o||{}; o.color=c; if(o.roughness==null) o.roughness=0.6; return new T.MeshStandardMaterial(o); }
  var MF=[], MB=[], MA=[], CORPS=[];
  for(var v=0;v<6;v++){ var fa=facade(v), bo=boutique(BOUTIQUES[v]);
    MF.push(std(0xffffff,{map:fa.map,emissive:0xffffff,emissiveMap:fa.em,emissiveIntensity:0.1,roughness:0.85}));
    MB.push(std(0xffffff,{map:bo.map,emissive:0xffffff,emissiveMap:bo.em,emissiveIntensity:0.3,roughness:0.7}));
    MA.push(std(0xffffff,{map:rayures(BOUTIQUES[v].auv),roughness:0.8,side:T.DoubleSide})); }
  var M={
    route:std(0xffffff,{map:texRoute,roughness:0.92}),
    trottoir:std(0xffffff,{map:texTrottoir,roughness:0.9}),
    bordure:std(0xe3e5ea,{roughness:0.7}), fond:std(0x6b7280,{roughness:1}), toit:std(0x7d8088,{roughness:0.9}),
    barriere:std(0xffffff,{map:texBarriere,roughness:0.6}), orange:new T.MeshBasicMaterial({color:0xff9a1f}),
    acier:std(0x8d96a3,{metalness:0.5,roughness:0.4}), rouge:std(0xe8382f,{roughness:0.45}), blanc:std(0xffffff,{roughness:0.5}),
    carton:std(0xc8924f,{roughness:0.8}), ruban:std(0xf1d9a0,{roughness:0.7}), cartonOr:std(0xffc928,{metalness:0.8,roughness:0.25,emissive:0x7a5200,emissiveIntensity:0.5}),
    tronc:std(0x7a4f2a,{roughness:0.9}), feuille:std(0x2f9e3f,{roughness:0.8}), feuilleB:std(0x3fb04f,{roughness:0.8}), pot:std(0xb5654a,{roughness:0.8}),
    veste:std(0x0bb58e,{roughness:0.55}), reflet:std(0xe9eef5,{metalness:0.3,roughness:0.3,emissive:0xaab4c4,emissiveIntensity:0.35}),
    peau:std(0xf1c19b,{roughness:0.7}), pantalon:std(0x24304f,{roughness:0.8}), chaussure:std(0xffffff,{roughness:0.6}),
    casque:std(0xff6a13,{roughness:0.4,metalness:0.1}), visiere:std(0x27324a,{roughness:0.2,metalness:0.4}), sac:std(0xff6a13,{roughness:0.6}), gant:std(0xffffff,{roughness:0.6}),
    casqueB:std(0x2d7ff9,{roughness:0.3,metalness:0.4,emissive:0x0a3d9c,emissiveIntensity:0.4}),
    logo:std(0xffffff,{map:texLogo,emissive:0xffffff,emissiveMap:texLogo,emissiveIntensity:0.45,roughness:0.6}), cadreLogo:std(0x16223f,{roughness:0.6}),
    ampoule:new T.MeshBasicMaterial({color:0xfff2c0}),
    glow:new T.SpriteMaterial({map:texGlow,transparent:true,opacity:0.2,depthWrite:false,blending:T.AdditiveBlending,fog:false}),
    flaque:new T.MeshBasicMaterial({map:texGlow,transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending,fog:false}),
    ombre:new T.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.25,depthWrite:false}),
    aura:new T.MeshBasicMaterial({color:0xff7a1a,transparent:true,opacity:0.22,depthWrite:false,blending:T.AdditiveBlending}),
    aimantAnneau:new T.MeshBasicMaterial({color:0xe5383b,transparent:true,opacity:0.7,depthWrite:false}),
    nuage:new T.MeshLambertMaterial({color:0xffffff}), skyline:std(0x7f93b3,{roughness:1})
  };
  for(var cv=0;cv<6;cv++) CORPS.push([MF[cv],MF[cv],M.toit,M.toit,MF[cv],MF[cv]]);
  function maille(g,m,ombre,recoit){ var x=new T.Mesh(g,m); x.castShadow=!!ombre; x.receiveShadow=recoit!==false; return x; }

  // ---------- Rue qui se recycle ----------
  var SEG=60, NSEG=5, segments=[], PAS=15;
  var geoRoute=new T.PlaneGeometry(LARGEUR_PISTE,SEG), geoFond=new T.PlaneGeometry(220,SEG);
  var geoTrottoir=new T.BoxGeometry(3.8,0.16,SEG), geoBordure=new T.BoxGeometry(0.22,0.2,SEG);
  var geoPoteauL=new T.CylinderGeometry(0.07,0.1,5.2,8), geoBras=new T.BoxGeometry(1.2,0.08,0.08), geoAmpoule=new T.SphereGeometry(0.17,10,8);
  var geoFlaque=new T.CircleGeometry(2.6,20), geoTronc=new T.CylinderGeometry(0.1,0.14,1.3,8), geoFeuille=new T.SphereGeometry(0.85,14,10), geoPot=new T.CylinderGeometry(0.4,0.3,0.5,12);
  var geoPoteau=new T.CylinderGeometry(0.12,0.12,3.2,8), geoPanneau=new T.BoxGeometry(4.2,2.1,0.15);
  var geoShop=new T.PlaneGeometry(12,3), geoAuvent=new T.BoxGeometry(1.3,0.08,11.4);
  var HAUTEURS=[18,24,30,36,42];
  function corpsImmeuble(h){
    var g=new T.BoxGeometry(12,h,12); g.translate(0,h/2,0);
    var uv=g.attributes.uv;
    for(var f=0;f<6;f++){ if(f===2||f===3) continue; for(var k=0;k<4;k++){ var i=f*4+k; uv.setXY(i,uv.getX(i)*2,uv.getY(i)*h/6); } }
    uv.needsUpdate=true; return g;
  }
  // Un immeuble : corps à façade, devanture au rez-de-chaussée (face à la rue) et auvent rayé.
  function creerImmeuble(cote,z){
    var gr=new T.Group(), n=(Math.random()*6)|0;
    var corps=new T.Mesh(corpsImmeuble(HAUTEURS[(Math.random()*HAUTEURS.length)|0]),CORPS[n]); corps.position.x=cote*(8.5+6); gr.add(corps);
    var dev=new T.Mesh(geoShop,MB[n]); dev.position.set(cote*8.47,1.66,0); dev.rotation.y=cote<0?Math.PI/2:-Math.PI/2; gr.add(dev);
    var au=new T.Mesh(geoAuvent,MA[n]); au.position.set(cote*(8.47-0.62),3.05,0); au.rotation.z=cote*0.2; gr.add(au);
    gr.position.z=z; gr.userData={corps:corps,dev:dev,au:au};
    return gr;
  }
  function creerLampe(cote,z,parent){
    var p=maille(geoPoteauL,M.acier,false,false); p.position.set(cote*4.95,2.6,z); parent.add(p);
    var b=maille(geoBras,M.acier,false,false); b.position.set(cote*(4.95-0.6),5.18,z); parent.add(b);
    var a=new T.Mesh(geoAmpoule,M.ampoule); a.position.set(cote*(4.95-1.15),5.08,z); parent.add(a);
    var s=new T.Sprite(M.glow); s.scale.set(3.2,3.2,1); s.position.copy(a.position); parent.add(s);
    var f=new T.Mesh(geoFlaque,M.flaque); f.rotation.x=-Math.PI/2; f.position.set(cote*3.2,0.03,z); parent.add(f);
  }
  function creerArbre(cote,z,parent){
    var g=new T.Group();
    var pot=maille(geoPot,M.pot,true,true); pot.position.y=0.25; g.add(pot);
    var t=maille(geoTronc,M.tronc,true,true); t.position.y=1.0; g.add(t);
    var f=maille(geoFeuille,M.feuille,true,true); f.position.y=2.1; g.add(f);
    var f2=maille(geoFeuille,M.feuilleB,true,true); f2.position.set(0.35,2.6,0.1); f2.scale.setScalar(0.7); g.add(f2);
    g.position.set(cote*5.5,0.16,z); parent.add(g);
  }
  function creerPanneau(){
    var g=new T.Group();
    [-1,1].forEach(function(c){ var t=maille(geoPoteau,M.acier,true); t.position.set(c*1.5,1.6,-0.1); g.add(t); });
    var b=maille(geoPanneau,[M.cadreLogo,M.cadreLogo,M.cadreLogo,M.cadreLogo,M.logo,M.cadreLogo],true); b.position.y=4.25; g.add(b);
    return g;
  }
  function placerPanneau(pn){ var c=Math.random()<0.5?-1:1; pn.position.set(c*5.7,0.16,-22+Math.random()*44); pn.rotation.y=-c*0.4; }
  for(var s=0;s<NSEG;s++){
    var grp=new T.Group();
    var p=maille(geoRoute,M.route,false,true); p.rotation.x=-Math.PI/2; grp.add(p);
    var h=maille(geoFond,M.fond,false,true); h.rotation.x=-Math.PI/2; h.position.y=-0.03; grp.add(h);
    grp.userData.immeubles=[];
    [-1,1].forEach(function(c){
      var t=maille(geoTrottoir,M.trottoir,false,true); t.position.set(c*6.6,0.08,0); grp.add(t);
      var b=maille(geoBordure,M.bordure,false,true); b.position.set(c*4.6,0.1,0); grp.add(b);
      for(var k=0;k<4;k++){ var im=creerImmeuble(c,-PAS*1.5+k*PAS); grp.add(im); grp.userData.immeubles.push(im); }
      creerLampe(c,-14,grp); creerLampe(c,16,grp); creerArbre(c,-1,grp);
    });
    var pn=creerPanneau(); grp.add(pn); grp.userData.panneau=pn; placerPanneau(pn);
    grp.position.z=-s*SEG; scene.add(grp); segments.push(grp);
  }
  function remixer(sg){
    sg.userData.immeubles.forEach(function(im){ var n=(Math.random()*6)|0, u=im.userData; u.corps.material=CORPS[n]; u.dev.material=MB[n]; u.au.material=MA[n]; });
    placerPanneau(sg.userData.panneau);
  }

  // Nuages et ligne d'horizon (suivent le livreur).
  var lointain=new T.Group(); scene.add(lointain);
  var geoNuage=new T.SphereGeometry(1,12,10);
  for(var n=0;n<10;n++){ var nu=new T.Group(); for(var j=0;j<4;j++){ var bn=new T.Mesh(geoNuage,M.nuage); bn.position.set(j*1.6-2.4,Math.sin(j)*0.6,0); bn.scale.setScalar(1.4+Math.random()*1.2); nu.add(bn); }
    nu.position.set((Math.random()*2-1)*120,48+Math.random()*20,-60-Math.random()*140); nu.scale.setScalar(1.5+Math.random()); lointain.add(nu); }
  var geoTour=new T.BoxGeometry(1,1,1);
  for(var m=0;m<22;m++){ var tour=new T.Mesh(geoTour,M.skyline); var hm=34+Math.random()*50, lm=12+Math.random()*14;
    tour.scale.set(lm,hm,lm); tour.position.set((m/21*2-1)*130,hm/2-1,-135-Math.random()*20); lointain.add(tour); }

  // ---------- Livreur ----------
  var livreur=new T.Group(); scene.add(livreur);
  var corps=new T.Group(); livreur.add(corps);
  var buste=new T.Group(); buste.position.y=0.9; corps.add(buste);
  function limbe(l1,l2,r,mat,matFin){
    var racine=new T.Group();
    var haut=maille(new T.CylinderGeometry(r,r*0.88,l1,10),mat,true); haut.position.y=-l1/2; racine.add(haut);
    var bas=new T.Group(); bas.position.y=-l1; racine.add(bas);
    var b=maille(new T.CylinderGeometry(r*0.88,r*0.75,l2,10),matFin||mat,true); b.position.y=-l2/2; bas.add(b);
    return {racine:racine,bas:bas,l2:l2};
  }
  var torse=maille(new T.CylinderGeometry(0.3,0.25,0.62,14),M.veste,true); torse.scale.z=0.75; torse.position.y=0.31; buste.add(torse);
  var epaules=maille(new T.SphereGeometry(0.3,14,10),M.veste,true); epaules.scale.set(1,0.45,0.75); epaules.position.y=0.6; buste.add(epaules);
  var bandeR=maille(new T.CylinderGeometry(0.315,0.28,0.07,14),M.reflet,false); bandeR.scale.z=0.77; bandeR.position.y=0.28; buste.add(bandeR);
  var cou=maille(new T.CylinderGeometry(0.075,0.085,0.14,8),M.peau,true); cou.position.y=0.72; buste.add(cou);
  var tete=maille(new T.SphereGeometry(0.2,18,14),M.peau,true); tete.position.y=0.87; buste.add(tete);
  var calotte=maille(new T.SphereGeometry(0.225,18,10,0,Math.PI*2,0,Math.PI/2),M.casque,true); calotte.position.y=0.9; buste.add(calotte);
  var visiere=maille(new T.BoxGeometry(0.3,0.05,0.16),M.casque,true); visiere.position.set(0,0.9,-0.2); buste.add(visiere);
  var lunette=maille(new T.BoxGeometry(0.26,0.07,0.05),M.visiere,false); lunette.position.set(0,0.85,-0.19); buste.add(lunette);
  var sac=maille(new T.BoxGeometry(0.5,0.56,0.3),M.sac,true); sac.position.set(0,0.36,0.29); buste.add(sac);
  var couvercle=maille(new T.BoxGeometry(0.52,0.1,0.32),M.casque,true); couvercle.position.set(0,0.66,0.29); buste.add(couvercle);
  var logoSac=new T.Mesh(new T.PlaneGeometry(0.4,0.2),M.logo); logoSac.position.set(0,0.35,0.445); buste.add(logoSac);
  var brasG=limbe(0.3,0.27,0.07,M.veste,M.veste), brasD=limbe(0.3,0.27,0.07,M.veste,M.veste);
  brasG.racine.position.set(-0.37,0.58,0); brasD.racine.position.set(0.37,0.58,0); buste.add(brasG.racine); buste.add(brasD.racine);
  [brasG,brasD].forEach(function(br){ var main=maille(new T.SphereGeometry(0.075,10,8),M.gant,true); main.position.y=-br.l2; br.bas.add(main); });
  var jambeG=limbe(0.45,0.43,0.1,M.pantalon,M.pantalon), jambeD=limbe(0.45,0.43,0.1,M.pantalon,M.pantalon);
  jambeG.racine.position.set(-0.14,0.9,0); jambeD.racine.position.set(0.14,0.9,0); corps.add(jambeG.racine); corps.add(jambeD.racine);
  [jambeG,jambeD].forEach(function(j){ var c=maille(new T.BoxGeometry(0.2,0.12,0.34),M.chaussure,true); c.position.set(0,-j.l2+0.02,-0.06); j.bas.add(c);
    var sem=maille(new T.BoxGeometry(0.21,0.04,0.34),M.reflet,false); sem.position.set(0,-j.l2-0.03,-0.06); j.bas.add(sem); });
  // Casque de chantier du bonus (visible seulement tant qu'il protège).
  var casqueB=new T.Group(); casqueB.position.y=0.92; buste.add(casqueB);
  var domeB=maille(new T.SphereGeometry(0.27,18,10,0,Math.PI*2,0,Math.PI/2),M.casqueB,true); casqueB.add(domeB);
  var bordB=maille(new T.CylinderGeometry(0.33,0.33,0.04,18),M.casqueB,true); bordB.position.y=0.01; casqueB.add(bordB);
  casqueB.visible=false;
  var aura=new T.Mesh(new T.SphereGeometry(1.15,16,12),M.aura); aura.position.y=1.0; aura.visible=false; livreur.add(aura);
  var anneauAimant=new T.Mesh(new T.TorusGeometry(1.5,0.05,8,36),M.aimantAnneau); anneauAimant.rotation.x=Math.PI/2; anneauAimant.position.y=0.9; anneauAimant.visible=false; livreur.add(anneauAimant);
  var ombreL=new T.Mesh(new T.CircleGeometry(0.5,20),M.ombre); ombreL.rotation.x=-Math.PI/2; ombreL.position.y=0.03; scene.add(ombreL);

  function poser(mode,ph){
    var s=Math.sin(ph), c=Math.cos(ph);
    corps.rotation.x=0; corps.position.set(0,0,0); buste.rotation.set(0,0,0);
    if(mode==='cours'){
      corps.position.y=Math.abs(c)*0.07; buste.rotation.x=-0.2; buste.rotation.y=s*0.14;
      jambeG.racine.rotation.x=s*0.95; jambeG.bas.rotation.x=-(0.25+0.85*Math.max(0,c));
      jambeD.racine.rotation.x=-s*0.95; jambeD.bas.rotation.x=-(0.25+0.85*Math.max(0,-c));
      brasG.racine.rotation.x=-s*0.9; brasG.bas.rotation.x=1.2; brasD.racine.rotation.x=s*0.9; brasD.bas.rotation.x=1.2;
    } else if(mode==='air'){
      buste.rotation.x=-0.1;
      jambeG.racine.rotation.x=0.7; jambeG.bas.rotation.x=-0.9; jambeD.racine.rotation.x=-0.25; jambeD.bas.rotation.x=-0.5;
      brasG.racine.rotation.x=1.5; brasG.bas.rotation.x=0.3; brasD.racine.rotation.x=0.8; brasD.bas.rotation.x=0.4;
    } else if(mode==='glisse'){
      corps.rotation.x=1.15; corps.position.set(0,0.06,-0.72);
      jambeG.racine.rotation.x=0.1; jambeG.bas.rotation.x=-0.1; jambeD.racine.rotation.x=0.1; jambeD.bas.rotation.x=-0.1;
      brasG.racine.rotation.x=-1.2; brasG.bas.rotation.x=0.2; brasD.racine.rotation.x=-1.2; brasD.bas.rotation.x=0.2;
    } else {
      buste.rotation.y=Math.sin(ph)*0.12;
      jambeG.racine.rotation.x=0; jambeG.bas.rotation.x=0; jambeD.racine.rotation.x=0; jambeD.bas.rotation.x=0;
      brasG.racine.rotation.x=0.05; brasG.bas.rotation.x=0.15; brasD.racine.rotation.x=0.05; brasD.bas.rotation.x=0.15;
    }
  }

  // ---------- Objets de la course ----------
  var geoLisse=new T.BoxGeometry(1,1,1);
  var geoColis=new T.BoxGeometry(0.52,0.42,0.52), geoRuban=new T.BoxGeometry(0.54,0.43,0.12), geoRuban2=new T.BoxGeometry(0.12,0.43,0.54);
  var geoFut=new T.CylinderGeometry(0.5,0.5,1,18), geoBandeFut=new T.CylinderGeometry(0.52,0.52,0.1,18);
  var geoJambe=new T.CylinderGeometry(0.14,0.14,3.4,10), geoCable=new T.CylinderGeometry(0.02,0.02,1,5);
  var geoBulle=new T.SphereGeometry(0.58,18,14), geoAnneauB=new T.TorusGeometry(0.72,0.035,8,28);
  var objets=[], pieces=[], bonus=[];

  function creerMur(x,l){ var g=new T.Group();
    var hautB=maille(geoLisse,M.barriere,true); hautB.scale.set(l,0.6,0.14); hautB.position.y=1.5; g.add(hautB);
    var basB=maille(geoLisse,M.barriere,true); basB.scale.set(l,0.36,0.14); basB.position.y=0.78; g.add(basB);
    [-1,1].forEach(function(c){ var jb=maille(geoLisse,M.acier,true); jb.scale.set(0.12,1.8,0.5); jb.position.set(c*(l/2-0.1),0.9,0); g.add(jb);
      var lp=new T.Mesh(geoAmpoule,M.orange); lp.position.set(c*(l/2-0.1),1.95,0); g.add(lp); });
    g.position.x=x; g.userData={genre:'mur', demi:l/2, bas:0, haut:1.9, prof:0.5}; return g; }
  function creerBarreBasse(){ var g=new T.Group(); var l=LARGEUR_PISTE-0.2;
    var br=maille(geoLisse,M.barriere,true); br.scale.set(l,0.32,0.22); br.position.y=0.66; g.add(br);
    [-1,1].forEach(function(c){ var jb=maille(geoLisse,M.acier,true); jb.scale.set(0.2,0.85,0.5); jb.position.set(c*(l/2-0.15),0.42,0); g.add(jb); });
    [-2.6,0,2.6].forEach(function(px){ var lp=new T.Mesh(geoAmpoule,M.orange); lp.position.set(px,0.98,0); g.add(lp); });
    g.userData={genre:'bas', demi:l/2, bas:0, haut:0.85, prof:0.5}; return g; }
  function creerTonneau(x){ var g=new T.Group(); var pivot=new T.Group(); g.add(pivot);
    var c=maille(geoFut,M.rouge,true); c.rotation.x=Math.PI/2; pivot.add(c);
    [-0.28,0.28].forEach(function(dz){ var bd=maille(geoBandeFut,M.blanc,true); bd.rotation.x=Math.PI/2; bd.position.z=dz; pivot.add(bd); });
    var marque=maille(geoLisse,M.blanc,false); marque.scale.set(0.22,0.22,1.02); marque.position.set(0.5,0,0); pivot.add(marque);
    g.position.set(x,0.5,0); g.userData={genre:'tonneau', demi:0.5, bas:0, haut:1.0, prof:0.5, pivot:pivot, vx:(Math.random()<0.5?-1:1)*(2+Math.random()*1.5)}; return g; }
  function creerBanniere(){ var g=new T.Group(); var l=LARGEUR_PISTE-0.2;
    var ban=maille(geoLisse,[M.cadreLogo,M.cadreLogo,M.cadreLogo,M.cadreLogo,M.logo,M.cadreLogo],true); ban.scale.set(l,1.5,0.18); ban.position.y=1.85; g.add(ban);
    var traverse=maille(geoLisse,M.acier,true); traverse.scale.set(LARGEUR_PISTE+0.6,0.2,0.3); traverse.position.y=3.4; g.add(traverse);
    [-1,1].forEach(function(c){ var po=maille(geoJambe,M.acier,true); po.position.set(c*(LARGEUR_PISTE/2+0.1),1.7,0); g.add(po); });
    [-3.5,-1.2,1.2,3.5].forEach(function(px){ var ca=new T.Mesh(geoCable,M.acier); ca.scale.y=0.85; ca.position.set(px,3.0,0); g.add(ca); });
    g.userData={genre:'banniere', demi:LARGEUR_PISTE/2, bas:1.05, haut:3.4, prof:0.5}; return g; }

  function creerColis(x,y,z,or){ var g=new T.Group();
    var b=maille(geoColis,or?M.cartonOr:M.carton,true); g.add(b);
    var r1=maille(geoRuban,M.ruban,false); g.add(r1); var r2=maille(geoRuban2,M.ruban,false); g.add(r2);
    g.position.set(x,y,z); g.userData={or:!!or, rate:false}; scene.add(g); pieces.push(g); }

  // Bonus : bulle brillante, forme propre à chaque bonus, anneau tournant.
  var COUL={turbo:0xff7a1a, saut:0x34d058, x2:0xffc928, aimant:0xe5383b, casque:0x2d7ff9};
  var MB_BONUS={};
  CLES_BONUS.concat(['casque']).forEach(function(id){ var col=COUL[id];
    MB_BONUS[id]={
      bulle:new T.MeshStandardMaterial({color:col,transparent:true,opacity:0.3,emissive:col,emissiveIntensity:0.8,roughness:0.15,metalness:0.2,depthWrite:false}),
      icone:new T.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:0.9,roughness:0.3,metalness:0.4}),
      anneau:new T.MeshBasicMaterial({color:col,transparent:true,opacity:0.85})
    }; });
  function iconeBonus(id){ var m=MB_BONUS[id].icone, g=new T.Group(), k;
    if(id==='turbo'){ var co=maille(new T.ConeGeometry(0.2,0.6,14),m,false); co.rotation.x=-Math.PI/2; g.add(co); var fl=maille(new T.ConeGeometry(0.12,0.3,10),M.orange,false); fl.rotation.x=Math.PI/2; fl.position.z=0.42; g.add(fl); }
    else if(id==='saut'){ for(k=0;k<3;k++){ var ti=maille(new T.TorusGeometry(0.2,0.05,8,16),m,false); ti.rotation.x=Math.PI/2; ti.position.y=-0.2+k*0.2; g.add(ti); } }
    else if(id==='x2'){ var pl=new T.Mesh(new T.PlaneGeometry(0.8,0.8),new T.MeshBasicMaterial({map:texX2,transparent:true,side:T.DoubleSide,depthWrite:false})); g.add(pl); }
    else if(id==='aimant'){ var fer=maille(new T.TorusGeometry(0.24,0.09,10,18,Math.PI),m,false); fer.position.y=0.02; g.add(fer);
      [-1,1].forEach(function(c){ var bt=maille(new T.CylinderGeometry(0.09,0.09,0.12,10),M.blanc,false); bt.position.set(c*0.24,-0.06,0); g.add(bt); }); }
    else { var dm=maille(new T.SphereGeometry(0.26,16,10,0,Math.PI*2,0,Math.PI/2),m,false); dm.position.y=-0.04; g.add(dm); var bd=maille(new T.CylinderGeometry(0.32,0.32,0.04,16),m,false); bd.position.y=-0.04; g.add(bd); }
    return g; }
  function creerBonus(id,x,z){ var g=new T.Group();
    g.add(new T.Mesh(geoBulle,MB_BONUS[id].bulle));
    var ic=iconeBonus(id); g.add(ic);
    var an=new T.Mesh(geoAnneauB,MB_BONUS[id].anneau); an.rotation.x=Math.PI/2.4; g.add(an);
    g.position.set(x,1.15,z); g.userData={id:id, ic:ic, an:an, t:Math.random()*6}; scene.add(g); bonus.push(g); }

  // ---------- État ----------
  var E=null, phase='pret', prochainRang=0, dernier=null, raf=null, temps=0, voie=0, cibleX=0, depuisBonus=0;
  function nouvelleCourse(){ return {z:E?E.z:0,x:0,y:0,vy:0,v:V_DEPART,dist:0,ptsDist:0,nbPieces:0,rates:0,points:0,palier:0,anim:0,fini:false,
    b:{turbo:0,saut:0,x2:0,aimant:0}, casque:false, inv:0, glisse:0, glisseAuSol:false, dernierEnvoi:0}; }
  function vider(){ objets.concat(pieces,bonus).forEach(function(o){ scene.remove(o); }); objets=[]; pieces=[]; bonus=[]; }
  function ecartRangees(){ return Math.max(13, E.v*1.25); }
  function ajouter(o,z){ o.position.z=z; scene.add(o); objets.push(o); }
  function rangee(z){
    var diff=Math.min(1,E.dist/2500), r=Math.random(), libre=(Math.random()*3)|0, k, c, i;
    if(r<0.14+0.1*diff && E.dist>150){ ajouter(creerTonneau(VOIES[(Math.random()*3)|0]),z); }
    else if(r<0.34){ ajouter(creerBarreBasse(),z); // barre sur toute la largeur : sauter
      for(k=0;k<3;k++) creerColis(VOIES[libre],1.9,z+1.2-k*1.2,false); }
    else if(r<0.46 && E.dist>250){ ajouter(creerBanniere(),z); // bannière suspendue : glisser dessous
      for(k=0;k<4;k++) creerColis(VOIES[libre],0.55,z+3-k*1.5,false); }
    else { for(i=0;i<3;i++){ if(i===libre) continue; if(Math.random()<0.35-0.25*diff) continue; ajouter(creerMur(VOIES[i],2.6),z); }
      for(c=0;c<5;c++) creerColis(VOIES[libre],0.8,z+4-c*1.6,Math.random()<0.05); }
    if(Math.random()<0.3){ var lv=VOIES[(Math.random()*3)|0]; for(var q=0;q<4;q++) creerColis(lv,0.8,z-8-q*1.6,false); }
    depuisBonus++;
    if(E.dist>60 && depuisBonus>=3 && Math.random()<0.4){ depuisBonus=0; var ids=['turbo','saut','x2','aimant','casque']; creerBonus(ids[(Math.random()*5)|0],VOIES[(Math.random()*3)|0],z-ecartRangees()/2); }
  }

  function appliquerCiel(i){ var c=CIELS[i%CIELS.length]; cielMat.uniforms.haut.value.setHex(c.ciel); cielMat.uniforms.bas.value.setHex(c.bas);
    scene.fog.color.setHex(c.brume); soleil.color.setHex(c.soleil); soleil.intensity=c.i; hemi.intensity=0.45+c.i*0.3;
    for(var k=0;k<6;k++){ MF[k].emissiveIntensity=0.06+c.nuit*1.3; MB[k].emissiveIntensity=0.3+c.nuit*0.9; }
    M.glow.opacity=0.15+c.nuit*0.8; M.flaque.opacity=c.nuit*0.55; M.skyline.color.setHex(0x7f93b3).multiplyScalar(1-c.nuit*0.55); }

  function listeBoosters(){ var l=[]; CLES_BONUS.forEach(function(k){ if(E.b[k]>0) l.push({id:k,ratio:Math.min(1,E.b[k]/DUREE[k])}); }); if(E.casque) l.push({id:'casque',ratio:1}); return l; }
  function score(){ return Math.floor(E.points+E.ptsDist); }
  function envoyerScore(){ envoyer({t:'score',score:score(),pieces:E.nbPieces,total:E.nbPieces+E.rates,palier:E.palier,boosters:listeBoosters()}); }
  function envoyerEtat(){ if(!E||E.fini) return; envoyer({t:'etat',dist:Math.floor(E.dist),points:E.points,ptsDist:Math.floor(E.ptsDist),nbPieces:E.nbPieces,rates:E.rates,palier:E.palier,b:{turbo:E.b.turbo,saut:E.b.saut,x2:E.b.x2,aimant:E.b.aimant},casque:E.casque}); }

  function demarrer(et){ vider(); E=nouvelleCourse(); voie=0; cibleX=0; depuisBonus=0;
    if(et&&typeof et==='object'){ E.dist=num(et.dist); E.points=num(et.points); E.ptsDist=num(et.ptsDist); E.nbPieces=num(et.nbPieces); E.rates=num(et.rates); E.palier=Math.floor(E.dist/PALIER); E.casque=!!et.casque;
      if(et.b) CLES_BONUS.forEach(function(k){ E.b[k]=Math.max(0,Math.min(DUREE[k],num(et.b[k]))); }); }
    prochainRang=E.z-(et?55:45); for(var i=0;i<6;i++){ rangee(prochainRang); prochainRang-=ecartRangees(); }
    appliquerCiel(E.palier); phase='jeu'; dernier=null; envoyerScore(); boucler(); }
  function finir(){ if(E.fini) return; E.fini=true; phase='fin'; son('choc');
    envoyer({t:'fin',score:score(),distance:Math.floor(E.dist),pieces:E.nbPieces,total:E.nbPieces+E.rates,palier:E.palier+1}); }

  // ---------- Gestes ----------
  function sauter(){ if(phase!=='jeu'||E.y>0.001) return; E.glisse=0; E.vy=V_SAUT*(E.b.saut>0?1.4:1); son('saut'); }
  function glisser(){ if(phase!=='jeu') return; son('accroupi');
    if(E.y>0.001){ E.vy=-24; E.glisseAuSol=true; } else E.glisse=0.7; }
  function changerVoie(d){ if(phase!=='jeu') return; var n=Math.max(-1,Math.min(1,voie+d)); if(n!==voie){ voie=n; cibleX=VOIES[voie+1]; } }
  var t0=null;
  window.addEventListener('touchstart',function(e){ var t=e.touches[0]; t0={x:t.clientX,y:t.clientY}; },{passive:true});
  window.addEventListener('touchmove',function(e){ if(!t0||t0.fait){ if(e.cancelable) e.preventDefault(); return; } var t=e.touches[0], dx=t.clientX-t0.x, dy=t.clientY-t0.y, ax=Math.abs(dx), ay=Math.abs(dy), fait=false;
    if(phase==='jeu'){
      if(ax>=SEUIL&&ax>ay*0.8){ changerVoie(dx>0?1:-1); fait=true; }
      else if(dy<=-SEUIL&&ay>ax*0.8){ sauter(); fait=true; }
      else if(dy>=SEUIL&&ay>ax*0.8){ glisser(); fait=true; }
      if(fait){ t0.fait=true; }
    }
    if(e.cancelable) e.preventDefault(); },{passive:false});
  window.addEventListener('touchend',function(){ t0=null; },{passive:true});
  window.addEventListener('keydown',function(e){ var k=e.key; if(k==='ArrowLeft') changerVoie(-1); else if(k==='ArrowRight') changerVoie(1); else if(k==='ArrowUp'||k===' ') sauter(); else if(k==='ArrowDown') glisser(); });

  // ---------- Boucle ----------
  function boucler(){ if(raf) cancelAnimationFrame(raf); raf=requestAnimationFrame(image); }
  function image(ts){
    raf=null;
    var dt=dernier==null?0:Math.min(0.05,(ts-dernier)/1000); dernier=ts; temps+=dt;
    if(phase==='jeu') avancer(dt);
    else if(phase==='pret'){ livreur.position.set(0,0,0); poser('repos',temps*1.2); }
    var fov=62+(E&&E.b.turbo>0&&phase==='jeu'?10:0); if(Math.abs(camera.fov-fov)>0.05){ camera.fov+=(fov-camera.fov)*Math.min(1,dt*6); camera.updateProjectionMatrix(); }
    camera.position.set(livreur.position.x*0.55,4.1,livreur.position.z+7.4);
    camera.lookAt(livreur.position.x*0.35,1.3,livreur.position.z-9);
    soleil.position.set(livreur.position.x+8,18,livreur.position.z+6); soleil.target.position.set(livreur.position.x,0,livreur.position.z-6);
    ciel.position.set(camera.position.x,0,camera.position.z); lointain.position.z=livreur.position.z;
    pieces.forEach(function(p){ p.rotation.y+=dt*3; });
    bonus.forEach(function(b){ var u=b.userData; u.t+=dt; b.position.y=1.15+Math.sin(u.t*2.4)*0.14; u.ic.rotation.y+=dt*2.6; u.an.rotation.z+=dt*2; });
    rendu.render(scene,camera);
    if(phase!=='pause') raf=requestAnimationFrame(image);
  }
  function activer(id){ son('booster');
    if(id==='casque') E.casque=true; else E.b[id]=DUREE[id];
    envoyerScore(); }
  function avancer(dt){
    var b=E.b, tb=b.turbo>0;
    CLES_BONUS.forEach(function(k){ if(b[k]>0) b[k]=Math.max(0,b[k]-dt); });
    if(E.inv>0) E.inv-=dt;
    if(E.glisse>0) E.glisse-=dt;
    var base=Math.min(V_MAX,V_DEPART+Math.sqrt(E.dist)*0.32+E.palier*0.8);
    E.v=base*(tb?1.5:1);
    var dz=E.v*dt; E.z-=dz; E.dist+=dz; E.ptsDist+=dz*(b.x2>0?2:1);
    E.x+=(cibleX-E.x)*Math.min(1,dt*9);
    if(E.y>0||E.vy>0){ E.vy-=GRAV*dt; E.y+=E.vy*dt; if(E.y<=0){ E.y=0; E.vy=0; if(E.glisseAuSol){ E.glisseAuSol=false; E.glisse=0.6; } } }
    var pal=Math.floor(E.dist/PALIER); if(pal>E.palier){ E.palier=pal; appliquerCiel(pal); son('palier'); envoyer({t:'palier',palier:pal}); envoyerEtat(); }
    // Livreur : pose et effets.
    var aTerre=E.y===0, glisse=E.glisse>0&&aTerre; E.anim+=dt*E.v*0.75;
    poser(glisse?'glisse':(aTerre?'cours':'air'),E.anim);
    corps.rotation.z=(E.x-cibleX)*0.12;
    var invinc=tb||E.inv>0;
    corps.visible=!(E.inv>0&&!tb&&((temps*14)|0)%2===0);
    casqueB.visible=E.casque;
    var teinte=tb?0xff7a1a:(b.x2>0?0xffc928:(b.saut>0?0x34d058:0)); aura.visible=teinte!==0; if(aura.visible){ M.aura.color.setHex(teinte); aura.scale.setScalar(1+Math.sin(temps*9)*0.06); }
    anneauAimant.visible=b.aimant>0; if(anneauAimant.visible) anneauAimant.rotation.z+=dt*3;
    livreur.position.set(E.x,E.y,E.z);
    ombreL.position.set(E.x,0.03,E.z); ombreL.scale.setScalar(Math.max(0.4,1-E.y*0.25));
    // Rangées devant, ménage derrière.
    while(prochainRang>E.z-130){ rangee(prochainRang); prochainRang-=ecartRangees(); }
    var taille=glisse?0.8:1.85, bas=E.y;
    for(var i=objets.length-1;i>=0;i--){ var o=objets[i], u=o.userData;
      if(u.genre==='tonneau'){ o.position.x+=u.vx*dt; if(Math.abs(o.position.x)>BORD-0.2){ u.vx=-u.vx; o.position.x=Math.sign(o.position.x)*(BORD-0.2); } u.pivot.rotation.z-=u.vx*dt/0.5; }
      if(o.position.z>E.z+12){ scene.remove(o); objets.splice(i,1); continue; }
      if(Math.abs(o.position.z-E.z)<u.prof+0.25 && Math.abs(o.position.x-E.x)<u.demi+0.3 && bas+taille>u.bas+0.05 && bas<u.haut-0.05){
        if(invinc){ scene.remove(o); objets.splice(i,1); continue; }
        if(E.casque){ E.casque=false; E.inv=1.2; son('choc'); scene.remove(o); objets.splice(i,1); envoyerScore(); continue; }
        livreur.position.z=E.z; finir(); return; }
    }
    var cy=E.y+(glisse?0.4:0.9), aimant=b.aimant>0;
    for(var k=pieces.length-1;k>=0;k--){ var p=pieces[k], pu=p.userData;
      if(aimant&&p.position.z<E.z+1&&p.position.z>E.z-9&&Math.abs(p.position.x-E.x)<7){
        p.position.x+=(E.x-p.position.x)*Math.min(1,dt*7); p.position.y+=(cy-p.position.y)*Math.min(1,dt*7); p.position.z+=(E.z-p.position.z)*Math.min(1,dt*3); }
      if(Math.abs(p.position.z-E.z)<0.8 && Math.abs(p.position.x-E.x)<0.8 && Math.abs(p.position.y-cy)<1.0){
        scene.remove(p); pieces.splice(k,1); E.nbPieces++; E.points+=(pu.or?50:10)*(b.x2>0?2:1); son(pu.or?'bonus':'ramasse'); continue; }
      if(p.position.z>E.z+1&&!pu.rate){ pu.rate=true; E.rates++; }
      if(p.position.z>E.z+10){ scene.remove(p); pieces.splice(k,1); }
    }
    for(var q=bonus.length-1;q>=0;q--){ var bo=bonus[q];
      if(bo.position.z>E.z+10){ scene.remove(bo); bonus.splice(q,1); continue; }
      if(Math.abs(bo.position.z-E.z)<0.9 && Math.abs(bo.position.x-E.x)<0.9 && Math.abs(bo.position.y-cy)<1.3){ var id=bo.userData.id; scene.remove(bo); bonus.splice(q,1); activer(id); }
    }
    // Rue recyclée.
    segments.forEach(function(sg){ if(sg.position.z-SEG/2>E.z+15){ sg.position.z-=SEG*NSEG; remixer(sg); } });
    E.dernierEnvoi+=dt; if(E.dernierEnvoi>=0.1){ E.dernierEnvoi=0; envoyerScore(); }
  }

  window.addEventListener('resize',function(){ rendu.setSize(window.innerWidth,window.innerHeight); camera.aspect=window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); });
  window.jeu={
    demarrer:demarrer,
    pause:function(){ if(phase==='jeu'){ phase='pause'; if(raf) cancelAnimationFrame(raf); raf=null; envoyerEtat(); } },
    reprendre:function(){ if(phase==='pause'){ phase='jeu'; dernier=null; boucler(); } }
  };
  appliquerCiel(0); boucler();
  envoyer({t:'pret'});
})();
`;

function chargeur() {
  // Charge Three.js (premier miroir, sinon le second), puis le jeu.
  return `
(function(){
  var urls=${JSON.stringify(THREE_URLS)}, i=0;
  function suivant(){
    if(i>=urls.length){ try{ window.ReactNativeWebView.postMessage(JSON.stringify({t:'erreur'})); }catch(e){} return; }
    var s=document.createElement('script'); s.src=urls[i++]; s.onload=function(){ window.__lancerJeu(); }; s.onerror=suivant; document.head.appendChild(s);
  }
  suivant();
})();`;
}

export const PAGE_RUSH_3D = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body{margin:0;padding:0;overflow:hidden;background:#7ec8ff;touch-action:none;-webkit-user-select:none;user-select:none;height:100%}canvas{display:block}</style>
</head><body>
<script>window.__LOGO_PEARL=${JSON.stringify(LOGO_PEARL_DATA_URL)};</script>
<script>${MOTEUR_AUDIO_JS}</script>
<script>window.__lancerJeu=function(){${JEU_JS}};</script>
<script>${chargeur()}</script>
</body></html>`;
