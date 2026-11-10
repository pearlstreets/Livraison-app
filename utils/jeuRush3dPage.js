/**
 * Page web du « Rush » en 3D (screens/JeuRushScreen.js) : course sans fin vue
 * de derrière, sur 3 voies, dans une rue de ville lumineuse (chaussée avec
 * marquage et passages piétons, trottoirs, façades colorées à fenêtres et
 * volets, devantures avec auvents, arbres, lampadaires, ciel clair), rendu
 * Three.js avec lumière, ombres et brume claire. Jamais de nuit ni de fond noir.
 *
 * Le héros : un livreur Pearl Streets (casquette, veste verte, sac isotherme
 * bleu nuit avec le logo), animé en course, saut, glissade, faux pas.
 *
 * Commandes (balayages du doigt, aucune flèche à l'écran) : gauche et droite
 * pour changer de voie, haut pour sauter, bas pour glisser (en l'air : chute
 * rapide puis glissade).
 *
 * Obstacles, tous dessinés en low-poly cartoon (aucune image externe) :
 *  - voitures garées (citadine, berline, minibus, taxi, plusieurs couleurs) :
 *    changer de voie ;
 *  - voitures qui roulent vers le livreur (niveaux plus durs) : elles
 *    attendent phares allumés puis foncent dans leur voie ;
 *  - passants : mamie (canne ou cabas), papy (chapeau) : changer de voie ;
 *    enfants (ballon, trottinette) : changer de voie ou sauter de justesse ;
 *  - jardinière basse, enfant qui joue à la marelle, haie fleurie sur toute
 *    la rue : sauter ;
 *  - barrière de parking, arche de fête de quartier : glisser dessous.
 *
 * Police (logique pure : utils/jeuRushPolice.js) : un choc fait trébucher le
 * livreur et une voiture de police (gyrophare bleu, sans sirène) le suit dans
 * le dos. 10 s sans nouveau choc : elle abandonne et repart. Nouveau choc
 * pendant la poursuite : arrestation (la voiture le rattrape, il lève les
 * mains), puis fin de partie. Le casque encaisse un choc sans police, le
 * turbo écarte l'obstacle.
 *
 * Bonus brillants sur la route, avec jauge de temps dans l'écran :
 *   turbo (vitesse et invincibilité), super saut, x2 points, aimant à colis,
 *   casque (absorbe un choc), ralenti (vitesse x0,65), colis en or (chaque
 *   colis vaut 50 points).
 * Difficulté croissante (vitesse, rangées plus serrées, plus de voies
 * occupées et de voitures qui roulent) et fréquence des bonus :
 * utils/jeuRushDifficulte.js.
 * Les « +10 » des colis montent dans le coin en haut à droite, jamais au
 * milieu de la piste. Les annonces (police, bonus, palier) sont affichées en
 * haut par l'app.
 *
 * Performance : géométries et matériaux partagés, obstacles, colis et bonus
 * recyclés (réserves par type), aucune géométrie créée pendant la course.
 *
 * Messages vers l'app :
 *   { t: 'pret' | 'erreur' }
 *   { t: 'score', score, pieces, total, palier, boosters: [{ id, ratio }], police, policeS }
 *     (police : part restante de la poursuite, 0 à 1 ; policeS : secondes restantes)
 *   { t: 'palier', palier }
 *   { t: 'police', etat: 'poursuite' | 'abandon' | 'arrete' }
 *   { t: 'etat', ... } (photo de la partie, pour la reprise)
 *   { t: 'fin', score, distance, pieces, total, palier }
 * Commandes depuis l'app : window.jeu.demarrer(etat?) / pause() / reprendre(),
 * window.sonJeu.* (utils/sonJeux.js).
 * Aucun accent grave, ni dollar suivi d'accolade, ni barre oblique inverse
 * dans ce code : il vit dans une chaîne.
 */
import { MOTEUR_AUDIO_JS } from './sonJeux';
import { DIFFICULTE_RUSH_JS } from './jeuRushDifficulte';
import { POLICE_RUSH_JS } from './jeuRushPolice';
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
  function hasard(l){ return l[Math.min(l.length-1,(Math.random()*l.length)|0)]; }
  ${DIFFICULTE_RUSH_JS}
  ${POLICE_RUSH_JS}

  // ---------- Réglages ----------
  var LARGEUR_PISTE=9, BORD=LARGEUR_PISTE/2-0.55, VOIES=[-3,0,3];
  var V_DEPART=RUSH_DIFF.V_DEPART, GRAV=RUSH_DIFF.GRAV, V_SAUT=RUSH_DIFF.V_SAUT, PALIER=1000;
  var SEUIL=26;
  var DUREE=RUSH_DIFF.DUREE;
  var CLES_BONUS=['turbo','saut','x2','aimant','ralenti','or'];
  // Ciels du jour seulement (jamais de nuit) : un par palier, en boucle.
  var CIELS=[
    {ciel:0x5fbcff, bas:0xdff4ff, soleil:0xfff3d6, i:1.3,  brume:0xcdeeff},
    {ciel:0x4fb2ff, bas:0xeaf8ff, soleil:0xffffff, i:1.4,  brume:0xd8f1ff},
    {ciel:0x72c2ff, bas:0xffeccc, soleil:0xffe6b8, i:1.3,  brume:0xffead0},
    {ciel:0x86ceff, bas:0xffe3f0, soleil:0xfff0f6, i:1.25, brume:0xf4e6f2},
    {ciel:0x5cc6ff, bas:0xe8ffea, soleil:0xfffbe0, i:1.35, brume:0xdaf5e6},
    {ciel:0x68bfff, bas:0xf3fbff, soleil:0xffffff, i:1.35, brume:0xe2f4ff}
  ];

  // ---------- Scène ----------
  // Économie de batterie : résolution plafonnée à 1,5, anticrénelage
  // seulement sur les écrans peu denses, ombres simples en 512.
  var DPR=Math.min(window.devicePixelRatio||1,1.5);
  var rendu=new T.WebGLRenderer({antialias:(window.devicePixelRatio||1)<1.5, powerPreference:'default'});
  rendu.setPixelRatio(DPR);
  rendu.setSize(window.innerWidth,window.innerHeight);
  rendu.setClearColor(0xbfe6ff,1);
  rendu.shadowMap.enabled=true; rendu.shadowMap.type=T.PCFShadowMap;
  rendu.outputEncoding=T.sRGBEncoding;
  rendu.toneMapping=T.ACESFilmicToneMapping; rendu.toneMappingExposure=1.1;
  document.body.appendChild(rendu.domElement);
  var scene=new T.Scene();
  scene.fog=new T.Fog(0xcdeeff,40,150);
  var camera=new T.PerspectiveCamera(62,window.innerWidth/window.innerHeight,0.1,400);
  var hemi=new T.HemisphereLight(0xe4f4ff,0x8a8f99,0.85); scene.add(hemi);
  var soleil=new T.DirectionalLight(0xfff3d6,1.3);
  soleil.castShadow=true; soleil.shadow.mapSize.set(512,512);
  var sc=soleil.shadow.camera; sc.left=-14; sc.right=14; sc.top=22; sc.bottom=-12; sc.near=1; sc.far=80;
  soleil.shadow.bias=-0.0006; scene.add(soleil); scene.add(soleil.target);

  // Ciel en dégradé (grande sphère vue de l'intérieur).
  var cielMat=new T.ShaderMaterial({side:T.BackSide, depthWrite:false, fog:false,
    uniforms:{haut:{value:new T.Color(0x5fbcff)}, bas:{value:new T.Color(0xdff4ff)}},
    vertexShader:'varying vec3 vp; void main(){ vp=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader:'uniform vec3 haut; uniform vec3 bas; varying vec3 vp; void main(){ float h=clamp(vp.y*1.6+0.15,0.0,1.0); gl_FragColor=vec4(mix(bas,haut,h),1.0); }'});
  var ciel=new T.Mesh(new T.SphereGeometry(300,24,12),cielMat); scene.add(ciel);

  // ---------- Textures dessinées ----------
  function toile(l,h,dessin){ var c=document.createElement('canvas'); c.width=l; c.height=h; dessin(c.getContext('2d'),l,h); var t=new T.CanvasTexture(c); t.encoding=T.sRGBEncoding; t.anisotropy=4; return t; }
  function repeter(t){ t.wrapS=t.wrapT=T.RepeatWrapping; return t; }

  // Chaussée : bitume clair, pointillés des voies et bords pleins. 9 m x 7,5 m par tuile.
  var texRoute=repeter(toile(256,256,function(g,l,h){
    g.fillStyle='#5d636f'; g.fillRect(0,0,l,h);
    for(var i=0;i<900;i++){ var v=78+Math.floor(Math.random()*40); g.fillStyle='rgba('+v+','+v+','+(v+8)+',0.35)'; g.fillRect(Math.random()*l,Math.random()*h,1+Math.random()*3,1+Math.random()*3); }
    g.fillStyle='#f4f1e6'; g.fillRect(84,16,5,96); g.fillRect(168,16,5,96);
    g.fillStyle='#f4f1e6'; g.fillRect(6,0,5,h); g.fillRect(245,0,5,h); }));
  texRoute.repeat.set(1,8);
  // Passage piéton : bandes blanches sur fond transparent.
  var texPassage=toile(256,64,function(g,l,h){ g.clearRect(0,0,l,h); g.fillStyle='rgba(250,250,245,0.95)'; for(var i=0;i<9;i++) g.fillRect(8+i*28,0,16,h); });
  var texTrottoir=repeter(toile(128,128,function(g,l,h){
    g.fillStyle='#c9ccd3'; g.fillRect(0,0,l,h);
    for(var y=0;y<2;y++) for(var x=0;x<2;x++){ var v=196+Math.floor(Math.random()*22); g.fillStyle='rgb('+v+','+v+','+(v+4)+')'; g.fillRect(x*64+2,y*64+2,60,60); } }));
  texTrottoir.repeat.set(1,20);
  var texGlow=toile(64,64,function(g,l,h){ var r=g.createRadialGradient(32,32,0,32,32,32); r.addColorStop(0,'rgba(255,255,255,1)'); r.addColorStop(0.35,'rgba(255,255,255,0.45)'); r.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=r; g.fillRect(0,0,l,h); });
  var texX2=toile(128,128,function(g,l,h){ g.fillStyle='#ffffff'; g.font='bold 92px sans-serif'; g.textAlign='center'; g.textBaseline='middle'; g.strokeStyle='#8a5a00'; g.lineWidth=8; g.strokeText('x2',64,70); g.fillText('x2',64,70); });

  // Façades colorées : fenêtres à carreaux, volets, jardinières, corniches.
  var PAL_FAC=['#f6c9a0','#9fd3e6','#f4a9a3','#b8e3b0','#ffe08a','#cdb9ff','#f7d0e4','#a9cfff'];
  var PAL_VOLET=['#2e8b57','#1f6fb2','#c0392b','#7b4fb3','#e67e22','#16223f'];
  function facade(i){
    return repeter(toile(256,256,function(g){
      g.fillStyle=PAL_FAC[i%PAL_FAC.length]; g.fillRect(0,0,256,256);
      for(var k=0;k<200;k++){ g.fillStyle='rgba(255,255,255,'+(Math.random()*0.08)+')'; g.fillRect(Math.random()*256,Math.random()*256,3+Math.random()*10,2); }
      var volet=PAL_VOLET[(i*7+3)%PAL_VOLET.length];
      for(var ligne=0;ligne<2;ligne++){ var fy=ligne*128;
        g.fillStyle='rgba(255,255,255,0.65)'; g.fillRect(0,fy,256,6);
        g.fillStyle='rgba(0,0,0,0.08)'; g.fillRect(0,fy+6,256,3);
        for(var col=0;col<2;col++){ var cx=64+col*128, x0=cx-28, y0=fy+26;
          g.fillStyle=volet; g.fillRect(x0-22,y0-2,18,84); g.fillRect(x0+58,y0-2,18,84);
          g.fillStyle='rgba(255,255,255,0.25)'; for(var b=0;b<6;b++){ g.fillRect(x0-20,y0+4+b*13,14,3); g.fillRect(x0+60,y0+4+b*13,14,3); }
          g.fillStyle='#ffffff'; g.fillRect(x0-4,y0-6,64,92);
          var gr=g.createLinearGradient(0,y0,0,y0+80); gr.addColorStop(0,'#cfeeff'); gr.addColorStop(1,'#6fa8d6');
          g.fillStyle=gr; g.fillRect(x0,y0,56,80);
          g.fillStyle='rgba(255,255,255,0.55)'; g.fillRect(x0+6,y0+4,8,30);
          g.fillStyle='#ffffff'; g.fillRect(cx-2,y0,4,80); g.fillRect(x0,y0+38,56,4);
          g.fillStyle='#8a5a3b'; g.fillRect(x0-6,y0+82,68,10);
          var fl=['#ff5a7a','#ffd23f','#ff8c42','#ffffff','#b45cff'];
          for(var f=0;f<7;f++){ g.fillStyle=fl[(f+i)%fl.length]; g.beginPath(); g.arc(x0+f*9+1,y0+80,5,0,6.3); g.fill(); }
          g.fillStyle='#3fa34d'; g.fillRect(x0-4,y0+84,62,3);
        }
      }
    }));
  }
  // Devantures : enseigne, deux vitrines garnies, porte.
  var BOUTIQUES=[
    {nom:'BOULANGERIE', mur:'#f3d39b', auv:'#e74c3c'}, {nom:'FLEURISTE', mur:'#b6e3c6', auv:'#27ae60'},
    {nom:'CAFÉ', mur:'#f8dcc8', auv:'#2d7ff9'}, {nom:'LIBRAIRIE', mur:'#d8c6f2', auv:'#8e5bd6'},
    {nom:'PRIMEUR', mur:'#f7ea9f', auv:'#ff8c2b'}, {nom:'PIZZERIA', mur:'#f8c3c3', auv:'#e8433a'},
    {nom:'GLACIER', mur:'#c9ecff', auv:'#22b8cf'}, {nom:'FROMAGERIE', mur:'#fff0b3', auv:'#f2b705'}
  ];
  var COUL_PRODUITS=['#e74c3c','#f1c40f','#27ae60','#e67e22','#8e44ad','#ecf0f1','#d35400'];
  function boutique(b){
    var c1=document.createElement('canvas'); c1.width=512; c1.height=128; var g=c1.getContext('2d');
    g.fillStyle=b.mur; g.fillRect(0,0,512,128);
    g.fillStyle='#16223F'; g.fillRect(0,0,512,34);
    g.fillStyle='#ffffff'; g.font='bold 24px sans-serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(b.nom,256,18);
    [[18,196],[298,196]].forEach(function(v){
      var gr=g.createLinearGradient(0,46,0,122); gr.addColorStop(0,'#fff7dc'); gr.addColorStop(1,'#ffe1a1');
      g.fillStyle='#2b3350'; g.fillRect(v[0]-4,42,v[1]+8,84); g.fillStyle=gr; g.fillRect(v[0],46,v[1],76);
      for(var k=0;k<9;k++){ g.fillStyle=COUL_PRODUITS[(Math.random()*COUL_PRODUITS.length)|0]; g.fillRect(v[0]+8+k*20,100-Math.random()*16,14,22); }
      g.fillStyle='rgba(255,255,255,0.45)'; g.fillRect(v[0],46,v[1],5);
    });
    g.fillStyle='#16223F'; g.fillRect(222,44,68,84); g.fillStyle='#9fd0f0'; g.fillRect(230,52,52,60);
    g.fillStyle='#f4c542'; g.fillRect(274,86,4,12);
    var t1=new T.CanvasTexture(c1); t1.encoding=T.sRGBEncoding; t1.anisotropy=4;
    return t1;
  }
  function rayures(couleur,n){ return repeter(toile(64,64,function(g,l,h){ g.fillStyle='#ffffff'; g.fillRect(0,0,l,h); g.fillStyle=couleur; for(var i=0;i<(n||4);i++) g.fillRect(i*64/(n||4),0,32/(n||4),h); })); }
  // Panneau Pearl Streets : plaque verte, cadre bleu nuit, logo blanc (window.__LOGO_PEARL).
  var texLogo=toile(512,256,function(g,l,h){ g.fillStyle='#0BB58E'; g.fillRect(0,0,l,h); g.fillStyle='#16223F'; g.fillRect(12,12,l-24,h-24); });
  (function(){ if(!window.__LOGO_PEARL) return; var im=new Image(); im.onload=function(){ var c=texLogo.image, g=c.getContext('2d');
    var lw=c.width-80, lh=lw*im.height/im.width; if(lh>c.height-60){ lh=c.height-60; lw=lh*im.width/im.height; }
    g.drawImage(im,(c.width-lw)/2,(c.height-lh)/2,lw,lh); texLogo.needsUpdate=true; }; im.src=window.__LOGO_PEARL; })();
  // Fanions de fête de quartier (fond transparent).
  var texFanions=toile(512,64,function(g,l){ var cs=['#e8433a','#ffd23f','#2d7ff9','#34b36a','#ff8c2b','#b45cff'];
    g.clearRect(0,0,l,64); g.fillStyle='#ffffff'; g.fillRect(0,4,l,3);
    for(var i=0;i<16;i++){ g.fillStyle=cs[i%cs.length]; g.beginPath(); g.moveTo(i*32+2,6); g.lineTo(i*32+30,6); g.lineTo(i*32+16,58); g.closePath(); g.fill(); } });
  // Haie fleurie : feuillage et fleurs.
  var texHaie=repeter(toile(128,64,function(g,l,h){ g.fillStyle='#3d9c48'; g.fillRect(0,0,l,h);
    for(var i=0;i<160;i++){ g.fillStyle=Math.random()<0.5?'#2f8a3c':'#56b85e'; g.beginPath(); g.arc(Math.random()*l,Math.random()*h,3+Math.random()*4,0,6.3); g.fill(); }
    var fl=['#ff5a7a','#ffd23f','#ffffff','#ff8c42','#c77dff']; for(var k=0;k<26;k++){ g.fillStyle=fl[k%fl.length]; g.beginPath(); g.arc(Math.random()*l,Math.random()*h,3,0,6.3); g.fill(); } }));
  texHaie.repeat.set(6,1);
  // Marelle à la craie (fond transparent).
  var texMarelle=toile(128,256,function(g){ g.clearRect(0,0,128,256); g.strokeStyle='rgba(255,255,255,0.95)'; g.lineWidth=5;
    var cases=[[39,200],[39,150],[14,100],[64,100],[39,50],[39,4]]; var cs=['#ffd23f','#ff8fb1','#8fd3ff','#b6f09c','#ffd23f','#ff8fb1'];
    cases.forEach(function(c,i){ g.fillStyle=cs[i]; g.globalAlpha=0.45; g.fillRect(c[0],c[1],50,46); g.globalAlpha=1; g.strokeRect(c[0],c[1],50,46); }); });

  // ---------- Matériaux partagés ----------
  function std(c,o){ o=o||{}; o.color=c; if(o.roughness==null) o.roughness=0.6; return new T.MeshStandardMaterial(o); }
  function basique(c){ return new T.MeshBasicMaterial({color:c}); }
  var MF=[], MB=[], MA=[], CORPS=[];
  for(var v=0;v<8;v++){
    MF.push(std(0xffffff,{map:facade(v),roughness:0.85}));
    MB.push(std(0xffffff,{map:boutique(BOUTIQUES[v]),emissive:0xffffff,emissiveMap:null,emissiveIntensity:0,roughness:0.7}));
    MA.push(std(0xffffff,{map:rayures(BOUTIQUES[v].auv),roughness:0.8,side:T.DoubleSide})); }
  var M={
    route:std(0xffffff,{map:texRoute,roughness:0.92}),
    passage:new T.MeshStandardMaterial({map:texPassage,transparent:true,roughness:0.8,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),
    trottoir:std(0xffffff,{map:texTrottoir,roughness:0.9}),
    bordure:std(0xeef0f3,{roughness:0.7}), fond:std(0x9aa3ad,{roughness:1}), toit:std(0xb0745a,{roughness:0.9}),
    orange:basique(0xff9a1f), acier:std(0x8d96a3,{metalness:0.5,roughness:0.4}), blanc:std(0xffffff,{roughness:0.5}),
    carton:std(0xc8924f,{roughness:0.8}), ruban:std(0xf1d9a0,{roughness:0.7}), cartonOr:std(0xffc928,{metalness:0.8,roughness:0.25,emissive:0x7a5200,emissiveIntensity:0.5}),
    tronc:std(0x7a4f2a,{roughness:0.9}), feuille:std(0x3aa64a,{roughness:0.8}), feuilleB:std(0x5cc35f,{roughness:0.8}),
    // Livreur Pearl Streets.
    veste:std(0x0bb58e,{roughness:0.55}), marine:std(0x16223f,{roughness:0.6}), reflet:std(0xe9eef5,{metalness:0.3,roughness:0.3,emissive:0xaab4c4,emissiveIntensity:0.35}),
    peau:std(0xf1c19b,{roughness:0.7}), cheveux:std(0x4a2f1f,{roughness:0.8}), pantalon:std(0x24304f,{roughness:0.8}), chaussure:std(0xffffff,{roughness:0.6}),
    casquette:std(0x0bb58e,{roughness:0.5}), sacIso:std(0x16223f,{roughness:0.5}), gant:std(0xffffff,{roughness:0.6}), oeil:basique(0x1d2230),
    casqueB:std(0x2d7ff9,{roughness:0.3,metalness:0.4,emissive:0x0a3d9c,emissiveIntensity:0.4}),
    logo:std(0xffffff,{map:texLogo,emissive:0xffffff,emissiveMap:texLogo,emissiveIntensity:0.45,roughness:0.6}), cadreLogo:std(0x16223f,{roughness:0.6}),
    ampoule:basique(0xfff2c0),
    glow:new T.SpriteMaterial({map:texGlow,color:0xfff0c0,transparent:true,opacity:0.12,depthWrite:false,blending:T.AdditiveBlending,fog:false}),
    ombre:new T.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.22,depthWrite:false}),
    aura:new T.MeshBasicMaterial({color:0xff7a1a,transparent:true,opacity:0.22,depthWrite:false,blending:T.AdditiveBlending}),
    aimantAnneau:new T.MeshBasicMaterial({color:0xe5383b,transparent:true,opacity:0.7,depthWrite:false}),
    nuage:new T.MeshLambertMaterial({color:0xffffff}), skyline:std(0xa9bdd8,{roughness:1}),
    // Voitures.
    pneu:std(0x23262d,{roughness:0.9}), dessous:std(0x2a2f3a,{roughness:0.9}),
    taxiSigne:std(0xffffff,{emissive:0xfff3b0,emissiveIntensity:0.6}),
    gyroBarre:std(0x1d2230,{roughness:0.5}), gyroA:basique(0x2d7ff9), gyroB:basique(0x2d7ff9),
    gyroGlow:new T.SpriteMaterial({map:texGlow,color:0x3d8bff,transparent:true,opacity:0.9,depthWrite:false,blending:T.AdditiveBlending,fog:false}),
    // Décor des obstacles.
    bois:std(0xa86a3d,{roughness:0.85}), pierre:std(0xd8d2c4,{roughness:0.9}), haie:std(0xffffff,{map:texHaie,roughness:0.9}),
    poteauJaune:std(0xf5c518,{roughness:0.5}), brasBarriere:std(0xffffff,{map:rayures('#e8433a',6),roughness:0.5}),
    vertPearl:std(0x0bb58e,{roughness:0.6}),
    fanions:new T.MeshStandardMaterial({map:texFanions,transparent:true,side:T.DoubleSide,roughness:0.8,depthWrite:false}),
    marelle:new T.MeshStandardMaterial({map:texMarelle,transparent:true,roughness:0.9,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),
    // Passants.
    collant:std(0xe8c9a8,{roughness:0.8}), cheveuxGris:std(0xd9dde3,{roughness:0.8}), lunettes:basique(0x2a2f3a),
    canne:std(0x6b4423,{roughness:0.7}), moustache:std(0xf2f2f2,{roughness:0.9}), chaussureF:std(0x5a3d2b,{roughness:0.7}),
    craie:std(0xffffff,{roughness:0.9})
  };
  M.trottoir.color.setHex(0xffffff);
  function mats(liste){ return liste.map(function(c){ return std(c,{roughness:0.7}); }); }
  var MAT_ROBE=mats([0x9b7fd1,0xe58fb0,0x6c9bd2,0x6fbf8f,0xf2a65a]), MAT_GILET=mats([0xd94f6b,0xf3c74a,0x7fb3d5,0xffffff,0x9fd18b]);
  var MAT_CABAS=mats([0xe8433a,0x2d7ff9,0x34b36a,0xff8c2b]), MAT_VESTE_P=mats([0x8a6a4a,0x4f6d8a,0x6b7b5a,0x9a5b5b]);
  var MAT_PANT_P=mats([0x6b6f78,0x3d4a5c,0x8a7a64]), MAT_CHAPEAU=mats([0x3d4a5c,0x6b4f3a,0x2f5d50,0x7a2e3a]);
  var MAT_TSHIRT=mats([0xff5a5f,0xffd23f,0x2d7ff9,0x34d058,0xff8c42,0xb45cff]), MAT_SHORT=mats([0x2b4c7e,0x6b7b8c,0xe8433a,0x3fa34d]);
  var MAT_CHEV=mats([0x4a2f1f,0xe0b25a,0x1d1a18,0x9c4a1f]), MAT_BALLON=mats([0xffffff,0xff5a5f,0xffd23f,0x2d7ff9]);
  var MAT_FLEUR=mats([0xff5a7a,0xffd23f,0xffffff,0xff8c42,0xc77dff]);
  for(var cv=0;cv<8;cv++) CORPS.push([MF[cv],MF[cv],M.toit,M.toit,MF[cv],MF[cv]]);
  function maille(g,m,ombre,recoit){ var x=new T.Mesh(g,m); x.castShadow=!!ombre; x.receiveShadow=recoit!==false; return x; }

  // Géométries partagées par tous les objets de la course (créées une seule fois).
  var geoBoite=new T.BoxGeometry(1,1,1), geoSph=new T.SphereGeometry(1,12,10), geoCyl=new T.CylinderGeometry(1,1,1,10);
  var geoTronc=new T.CylinderGeometry(0.6,1,1,12), geoDemiSph=new T.SphereGeometry(1,14,8,0,Math.PI*2,0,Math.PI/2);
  var geoEssieu=new T.CylinderGeometry(0.33,0.33,1,12); geoEssieu.rotateZ(Math.PI/2);
  var geoPlan=new T.PlaneGeometry(1,1);
  function piece(geo,mat,sx,sy,sz,x,y,z,parent,ombre){ var m=maille(geo,mat,!!ombre,false); m.scale.set(sx,sy,sz); m.position.set(x,y,z); parent.add(m); return m; }

  // ---------- Rue qui se recycle ----------
  var SEG=60, NSEG=5, segments=[], PAS=15;
  var geoRoute=new T.PlaneGeometry(LARGEUR_PISTE,SEG), geoFond=new T.PlaneGeometry(220,SEG), geoPassage=new T.PlaneGeometry(LARGEUR_PISTE-0.4,3.2);
  var geoTrottoir=new T.BoxGeometry(3.8,0.16,SEG), geoBordure=new T.BoxGeometry(0.22,0.2,SEG);
  var geoPoteauL=new T.CylinderGeometry(0.07,0.1,5.2,8), geoBras=new T.BoxGeometry(1.2,0.08,0.08), geoAmpoule=new T.SphereGeometry(0.17,10,8);
  var geoTroncA=new T.CylinderGeometry(0.1,0.15,1.8,8), geoFeuille=new T.SphereGeometry(1,14,10);
  var geoPoteau=new T.CylinderGeometry(0.12,0.12,3.2,8), geoPanneau=new T.BoxGeometry(1.5,0.75,0.12);
  var geoShop=new T.PlaneGeometry(12,3), geoAuvent=new T.BoxGeometry(1.3,0.08,11.4);
  var HAUTEURS=[12,15,18,21,24];
  function corpsImmeuble(h){
    var g=new T.BoxGeometry(12,h,12); g.translate(0,h/2,0);
    var uv=g.attributes.uv;
    for(var f=0;f<6;f++){ if(f===2||f===3) continue; for(var k=0;k<4;k++){ var i=f*4+k; uv.setXY(i,uv.getX(i)*2,uv.getY(i)*h/6); } }
    uv.needsUpdate=true; return g;
  }
  var GEO_IMM=HAUTEURS.map(corpsImmeuble);
  // Un immeuble : corps à façade, devanture au rez-de-chaussée (face à la rue) et auvent rayé.
  function creerImmeuble(cote,z){
    var gr=new T.Group(), n=(Math.random()*8)|0;
    var corps=new T.Mesh(hasard(GEO_IMM),CORPS[n]); corps.position.x=cote*(8.5+6); gr.add(corps);
    var dev=new T.Mesh(geoShop,MB[n]); dev.position.set(cote*8.47,1.66,0); dev.rotation.y=cote<0?Math.PI/2:-Math.PI/2; gr.add(dev);
    var au=new T.Mesh(geoAuvent,MA[n]); au.position.set(cote*(8.47-0.62),3.05,0); au.rotation.z=cote*0.2; gr.add(au);
    gr.position.z=z; gr.userData={corps:corps,dev:dev,au:au};
    return gr;
  }
  function creerLampe(cote,z,parent){
    var p=maille(geoPoteauL,M.acier,false,false); p.position.set(cote*4.95,2.6,z); parent.add(p);
    var b=maille(geoBras,M.acier,false,false); b.position.set(cote*(4.95-0.6),5.18,z); parent.add(b);
    var a=new T.Mesh(geoAmpoule,M.ampoule); a.position.set(cote*(4.95-1.15),5.08,z); parent.add(a);
  }
  // Arbre d'alignement : tronc et deux boules de feuillage.
  function creerArbre(cote,z,parent){
    var g=new T.Group();
    var t=maille(geoTroncA,M.tronc,true,true); t.position.y=0.9; g.add(t);
    var f=maille(geoFeuille,M.feuille,true,true); f.position.y=2.4; f.scale.set(1.15,1,1.15); g.add(f);
    var f2=maille(geoFeuille,M.feuilleB,false,true); f2.position.set(0.3,3.05,0.15); f2.scale.setScalar(0.7); g.add(f2);
    g.position.set(cote*5.6,0.16,z); parent.add(g);
  }
  function creerPanneau(){
    var g=new T.Group();
    // Petit panneau discret, jamais un grand panneau.
    var t=maille(geoPoteau,M.acier,true); t.scale.set(0.6,0.85,0.6); t.position.set(0,1.36,-0.1); g.add(t);
    var b=maille(geoPanneau,[M.cadreLogo,M.cadreLogo,M.cadreLogo,M.cadreLogo,M.logo,M.cadreLogo],true); b.position.y=3.0; g.add(b);
    return g;
  }
  function placerPanneau(pn){ var c=Math.random()<0.5?-1:1; pn.position.set(c*5.7,0.16,-22+Math.random()*44); pn.rotation.y=-c*0.4; }
  for(var s=0;s<NSEG;s++){
    var grp=new T.Group();
    var p=maille(geoRoute,M.route,false,true); p.rotation.x=-Math.PI/2; grp.add(p);
    var pp=maille(geoPassage,M.passage,false,true); pp.rotation.x=-Math.PI/2; pp.position.set(0,0.012,8); grp.add(pp);
    var h=maille(geoFond,M.fond,false,true); h.rotation.x=-Math.PI/2; h.position.y=-0.03; grp.add(h);
    grp.userData.immeubles=[];
    [-1,1].forEach(function(c){
      var t=maille(geoTrottoir,M.trottoir,false,true); t.position.set(c*6.6,0.08,0); grp.add(t);
      var b=maille(geoBordure,M.bordure,false,true); b.position.set(c*4.6,0.1,0); grp.add(b);
      for(var k=0;k<4;k++){ var im=creerImmeuble(c,-PAS*1.5+k*PAS); grp.add(im); grp.userData.immeubles.push(im); }
      creerLampe(c,-14,grp); creerLampe(c,16,grp); creerArbre(c,-24,grp); creerArbre(c,1,grp); creerArbre(c,26,grp);
    });
    var pn=creerPanneau(); grp.add(pn); grp.userData.panneau=pn; placerPanneau(pn);
    grp.position.z=-s*SEG; scene.add(grp); segments.push(grp);
  }
  function remixer(sg){
    sg.userData.immeubles.forEach(function(im){ var n=(Math.random()*8)|0, u=im.userData; u.corps.material=CORPS[n]; u.corps.geometry=hasard(GEO_IMM); u.dev.material=MB[n]; u.au.material=MA[n]; });
    placerPanneau(sg.userData.panneau);
  }

  // Nuages et ligne d'horizon (suivent le livreur).
  var lointain=new T.Group(); scene.add(lointain);
  for(var n=0;n<10;n++){ var nu=new T.Group(); for(var j=0;j<4;j++){ var bn=new T.Mesh(geoSph,M.nuage); bn.position.set(j*1.6-2.4,Math.sin(j)*0.6,0); bn.scale.setScalar(1.4+Math.random()*1.2); nu.add(bn); }
    nu.position.set((Math.random()*2-1)*120,48+Math.random()*20,-60-Math.random()*140); nu.scale.setScalar(1.5+Math.random()); lointain.add(nu); }
  for(var m=0;m<22;m++){ var tour=new T.Mesh(geoBoite,M.skyline); var hm=10+Math.random()*15, lm=12+Math.random()*14;
    tour.scale.set(lm,hm,lm); tour.position.set((m/21*2-1)*130,hm/2-1,-135-Math.random()*20); lointain.add(tour); }

  // ---------- Livreur Pearl Streets ----------
  // Couleurs de la tenue rendues telles quelles (vert Pearl, bleu nuit) : sans cette conversion, la sortie sRGB
  // les éclaircit et le livreur se fond dans la chaussée grise.
  [M.veste,M.casquette,M.marine,M.pantalon,M.sacIso].forEach(function(m){ m.color.convertSRGBToLinear(); });
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
  var colV=maille(new T.CylinderGeometry(0.13,0.16,0.08,12),M.marine,false); colV.position.y=0.68; buste.add(colV);
  var cou=maille(new T.CylinderGeometry(0.075,0.085,0.14,8),M.peau,true); cou.position.y=0.72; buste.add(cou);
  var tete=maille(new T.SphereGeometry(0.2,18,14),M.peau,true); tete.position.y=0.87; buste.add(tete);
  var cheveux=maille(new T.SphereGeometry(0.205,16,12),M.cheveux,false); cheveux.scale.set(1,0.8,1); cheveux.position.set(0,0.88,0.03); buste.add(cheveux);
  [-1,1].forEach(function(c){ var oe=new T.Mesh(geoSph,M.oeil); oe.scale.setScalar(0.028); oe.position.set(c*0.075,0.89,-0.185); buste.add(oe); });
  // Casquette verte à visière bleu nuit.
  var calotte=maille(new T.SphereGeometry(0.215,18,10,0,Math.PI*2,0,Math.PI/2),M.casquette,true); calotte.position.y=0.92; buste.add(calotte);
  var visiere=maille(new T.CylinderGeometry(0.17,0.17,0.03,16,1,false,Math.PI/2,Math.PI),M.marine,true); visiere.position.set(0,0.925,-0.12); buste.add(visiere);
  var bouton=new T.Mesh(geoSph,M.marine); bouton.scale.setScalar(0.03); bouton.position.y=1.135; buste.add(bouton);
  // Sac de livraison isotherme sur le dos, logo Pearl Streets.
  var sac=maille(new T.BoxGeometry(0.56,0.6,0.38),M.sacIso,true); sac.position.set(0,0.38,0.31); buste.add(sac);
  var couvercle=maille(new T.BoxGeometry(0.58,0.08,0.4),M.veste,true); couvercle.position.set(0,0.7,0.31); buste.add(couvercle);
  var logoSac=new T.Mesh(new T.PlaneGeometry(0.44,0.22),M.logo); logoSac.position.set(0,0.4,0.505); buste.add(logoSac);
  [-1,1].forEach(function(c){ var br=maille(new T.BoxGeometry(0.06,0.5,0.04),M.marine,false); br.position.set(c*0.17,0.42,-0.2); buste.add(br); });
  var brasG=limbe(0.3,0.27,0.07,M.veste,M.veste), brasD=limbe(0.3,0.27,0.07,M.veste,M.veste);
  brasG.racine.position.set(-0.37,0.58,0); brasD.racine.position.set(0.37,0.58,0); buste.add(brasG.racine); buste.add(brasD.racine);
  [brasG,brasD].forEach(function(br){ var main=maille(new T.SphereGeometry(0.075,10,8),M.gant,true); main.position.y=-br.l2; br.bas.add(main); });
  var jambeG=limbe(0.45,0.43,0.1,M.pantalon,M.pantalon), jambeD=limbe(0.45,0.43,0.1,M.pantalon,M.pantalon);
  jambeG.racine.position.set(-0.14,0.9,0); jambeD.racine.position.set(0.14,0.9,0); corps.add(jambeG.racine); corps.add(jambeD.racine);
  [jambeG,jambeD].forEach(function(j){ var c=maille(new T.BoxGeometry(0.2,0.12,0.34),M.chaussure,true); c.position.set(0,-j.l2+0.02,-0.06); j.bas.add(c);
    var sem=maille(new T.BoxGeometry(0.21,0.04,0.34),M.veste,false); sem.position.set(0,-j.l2-0.03,-0.06); j.bas.add(sem); });
  // Casque du bonus (visible seulement tant qu'il protège).
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
    brasG.racine.rotation.z=0; brasD.racine.rotation.z=0;
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
    } else if(mode==='trebuche'){
      // Faux pas : penché en avant, bras qui moulinent (ph : 0 à 1).
      var k=Math.sin(Math.PI*Math.min(1,ph));
      corps.rotation.x=-0.55*k; corps.position.y=0.02;
      jambeG.racine.rotation.x=0.6*k; jambeG.bas.rotation.x=-0.8; jambeD.racine.rotation.x=-0.5*k; jambeD.bas.rotation.x=-0.3;
      brasG.racine.rotation.x=-2.2*k; brasG.racine.rotation.z=-0.6*k; brasG.bas.rotation.x=0.3;
      brasD.racine.rotation.x=-1.6*k; brasD.racine.rotation.z=0.6*k; brasD.bas.rotation.x=0.3;
    } else if(mode==='arrete'){
      // Arrêté : debout, les deux mains en l'air.
      jambeG.racine.rotation.x=0; jambeG.bas.rotation.x=0; jambeD.racine.rotation.x=0; jambeD.bas.rotation.x=0;
      brasG.racine.rotation.z=-2.7; brasG.racine.rotation.x=0; brasG.bas.rotation.x=0.2;
      brasD.racine.rotation.z=2.7; brasD.racine.rotation.x=0; brasD.bas.rotation.x=0.2;
      buste.rotation.y=Math.sin(ph*3)*0.08;
    } else {
      buste.rotation.y=Math.sin(ph)*0.12;
      jambeG.racine.rotation.x=0; jambeG.bas.rotation.x=0; jambeD.racine.rotation.x=0; jambeD.bas.rotation.x=0;
      brasG.racine.rotation.x=0.05; brasG.bas.rotation.x=0.15; brasD.racine.rotation.x=0.05; brasD.bas.rotation.x=0.15;
    }
  }

  // ---------- Voitures ----------
  // Textures par couleur : flancs (portières), face avant (phares, calandre), arrière (feux, plaque), vitres.
  var COUL_VOIT=['#e8433a','#2f7fe0','#34b36a','#f4f4f4','#ff8c2b','#8e5bd6','#22b8b0','#f06292'], TAXI='#f5c518';
  function texCote(col,bande,texte){ return toile(128,64,function(g,l,h){ g.fillStyle=col; g.fillRect(0,0,l,h);
    if(bande){ g.fillStyle=bande; g.fillRect(0,20,l,18); if(texte){ g.fillStyle='#ffffff'; g.font='bold 15px sans-serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(texte,l/2,29); } }
    g.fillStyle='rgba(0,0,0,0.25)'; g.fillRect(63,0,2,h-12); g.fillRect(40,16,10,3); g.fillRect(96,16,10,3);
    g.fillStyle='#2a2f3a'; g.fillRect(0,h-10,l,10); }); }
  function texFace(col,avant){ return toile(128,64,function(g,l,h){ g.fillStyle=col; g.fillRect(0,0,l,h);
    g.fillStyle='#2a2f3a'; g.fillRect(0,h-16,l,16);
    if(avant){ g.fillStyle='#fffbe0'; g.fillRect(8,12,30,18); g.fillRect(l-38,12,30,18); g.fillStyle='#39414f'; g.fillRect(46,16,36,16); g.fillStyle='rgba(255,255,255,0.5)'; for(var i=0;i<4;i++) g.fillRect(48,18+i*4,32,1); }
    else { g.fillStyle='#ff3b30'; g.fillRect(6,12,28,16); g.fillRect(l-34,12,28,16); g.fillStyle='#ffffff'; g.fillRect(44,h-30,40,12); g.fillStyle='#1d2230'; g.fillRect(50,h-27,28,6); } }); }
  function texVitre(col,deux){ return toile(128,64,function(g,l,h){ g.fillStyle=col; g.fillRect(0,0,l,h);
    var gr=g.createLinearGradient(0,6,0,58); gr.addColorStop(0,'#d6f0ff'); gr.addColorStop(1,'#6d9fc6'); g.fillStyle=gr;
    if(deux){ g.fillRect(8,8,52,50); g.fillRect(68,8,52,50); } else g.fillRect(8,6,112,52);
    g.fillStyle='rgba(255,255,255,0.45)'; g.fillRect(16,10,8,40); g.fillRect(deux?76:60,10,6,40); }); }
  function jeuMat(col,bande,texte){ var plein=std(col,{roughness:0.35,metalness:0.15});
    var cote=std(0xffffff,{map:texCote(col,bande,texte),roughness:0.35,metalness:0.15});
    var av=std(0xffffff,{map:texFace(col,true),roughness:0.4}), ar=std(0xffffff,{map:texFace(col,false),roughness:0.4});
    var vc=std(0xffffff,{map:texVitre(col,true),roughness:0.25,metalness:0.2}), pb=std(0xffffff,{map:texVitre(col,false),roughness:0.25,metalness:0.2});
    // Faces d'une boîte : +x, -x, +y, -y, +z (arrière), -z (avant : sens de la course).
    return {corps:[cote,cote,plein,M.dessous,ar,av], cabine:[vc,vc,plein,M.dessous,pb,pb]}; }
  var MAT_VOIT=COUL_VOIT.map(function(c){ return jeuMat(c); }), MAT_TAXI=jeuMat(TAXI), MAT_POLICE=jeuMat('#f7f9fc','#1f3c8f','POLICE');
  var MODELES={
    citadine:{L:3.4,h:0.6,lc:1.8,hc:0.58,zc:0.15,w:1.7},
    berline:{L:4.2,h:0.58,lc:2.1,hc:0.56,zc:0.2,w:1.8},
    minibus:{L:4.4,h:0.66,lc:3.3,hc:1.0,zc:0.4,w:1.9},
    taxi:{L:4.2,h:0.58,lc:2.1,hc:0.56,zc:0.2,w:1.8},
    police:{L:4.2,h:0.6,lc:2.1,hc:0.56,zc:0.2,w:1.84}
  };
  function creerVoiture(type){
    var m=MODELES[type], g=new T.Group(), mat=type==='police'?MAT_POLICE:(type==='taxi'?MAT_TAXI:MAT_VOIT[0]);
    var cp=maille(geoBoite,mat.corps,true,false); cp.scale.set(m.w,m.h,m.L); cp.position.y=0.3+m.h/2; g.add(cp);
    var cab=maille(geoBoite,mat.cabine,true,false); cab.scale.set(m.w-0.14,m.hc,m.lc); cab.position.set(0,0.3+m.h+m.hc/2,m.zc); g.add(cab);
    [-1,1].forEach(function(c){ var e=maille(geoEssieu,M.pneu,false,false); e.scale.set(m.w+0.06,1,1); e.position.set(0,0.33,c*(m.L/2-0.78)); g.add(e); });
    var top=0.3+m.h+m.hc;
    if(type==='taxi') piece(geoBoite,M.taxiSigne,0.5,0.16,0.24,0,top+0.08,m.zc,g,false);
    g.userData={type:type, genre:'plein', demi:m.w/2, bas:0, haut:top, prof:m.L/2, corps:cp, cab:cab, anim:'voiture'};
    return g;
  }
  function teinterVoiture(o){ var u=o.userData; if(u.type==='taxi'||u.type==='police') return;
    var k=MAT_VOIT[(Math.random()*MAT_VOIT.length)|0]; u.corps.material=k.corps; u.cab.material=k.cabine; }

  // Voiture de police : une seule, réutilisée, gyrophare bleu clignotant (sans sirène).
  var police=creerVoiture('police');
  (function(){ var top=police.userData.haut, zc=MODELES.police.zc;
    piece(geoBoite,M.gyroBarre,0.95,0.08,0.3,0,top+0.04,zc,police,false);
    var a=piece(geoBoite,M.gyroA,0.36,0.14,0.26,-0.25,top+0.15,zc,police,false), b=piece(geoBoite,M.gyroB,0.36,0.14,0.26,0.25,top+0.15,zc,police,false);
    var ga=new T.Sprite(M.gyroGlow); ga.scale.set(2.4,2.4,1); ga.position.set(-0.25,top+0.2,zc); police.add(ga);
    var gb=new T.Sprite(M.gyroGlow.clone()); gb.scale.set(2.4,2.4,1); gb.position.set(0.25,top+0.2,zc); police.add(gb);
    police.userData.feux=[a,b]; police.userData.halos=[ga,gb]; })();
  police.visible=false; scene.add(police);
  var polX=0;

  // ---------- Passants ----------
  function membre(parent,x,y,len,r,mat,matBout,pied){
    var p=new T.Group(); p.position.set(x,y,0); parent.add(p);
    piece(geoCyl,mat,r,len,r,0,-len/2,0,p,false);
    if(matBout){ if(pied) piece(geoBoite,matBout,r*2.4,0.07,r*3.6,0,-len,0.04,p,false); else piece(geoSph,matBout,r*1.15,r*1.15,r*1.15,0,-len,0,p,false); }
    return p;
  }
  function yeux(parent,y,z,ecart){ [-1,1].forEach(function(c){ var oe=new T.Mesh(geoSph,M.oeil); oe.scale.setScalar(0.022); oe.position.set(c*ecart,y,z); parent.add(oe); }); }
  // Ils regardent vers le livreur (+z). Adultes : trop grands pour être sautés.
  function creerMamie(){
    var g=new T.Group(), u={type:'mamie', genre:'plein', demi:0.45, bas:0, haut:1.8, prof:0.35, jambes:[], bras:[], anim:'marche'};
    var robe=hasard(MAT_ROBE), gilet=hasard(MAT_GILET);
    u.jambes.push(membre(g,-0.09,0.5,0.46,0.05,M.collant,M.chaussureF,true), membre(g,0.09,0.5,0.46,0.05,M.collant,M.chaussureF,true));
    piece(geoTronc,robe,0.31,0.6,0.27,0,0.76,0,g,true);
    piece(geoCyl,gilet,0.2,0.42,0.17,0,1.24,0,g,true);
    piece(geoSph,M.peau,0.16,0.17,0.16,0,1.6,0,g,false);
    piece(geoSph,M.cheveuxGris,0.168,0.15,0.17,0,1.65,-0.025,g,false);
    piece(geoSph,M.cheveuxGris,0.08,0.08,0.08,0,1.79,-0.08,g,false);
    piece(geoBoite,M.lunettes,0.2,0.035,0.02,0,1.62,0.155,g,false);
    var bG=membre(g,-0.25,1.42,0.46,0.045,gilet,M.peau), bD=membre(g,0.25,1.42,0.46,0.045,gilet,M.peau); u.bras.push(bG,bD);
    if(Math.random()<0.5){ var ca=piece(geoCyl,M.canne,0.022,0.98,0.022,0.34,0.49,0.1,g,false); ca.rotation.z=-0.06; }
    else piece(geoBoite,hasard(MAT_CABAS),0.24,0.3,0.13,0,-0.62,0,bG,false);
    g.userData=u; return g;
  }
  function creerPapy(){
    var g=new T.Group(), u={type:'papy', genre:'plein', demi:0.45, bas:0, haut:1.9, prof:0.35, jambes:[], bras:[], anim:'marche'};
    var veste=hasard(MAT_VESTE_P), pant=hasard(MAT_PANT_P);
    u.jambes.push(membre(g,-0.1,0.8,0.76,0.065,pant,M.chaussureF,true), membre(g,0.1,0.8,0.76,0.065,pant,M.chaussureF,true));
    piece(geoCyl,veste,0.24,0.66,0.18,0,1.13,0,g,true);
    piece(geoSph,M.peau,0.16,0.17,0.16,0,1.62,0,g,false);
    piece(geoBoite,M.moustache,0.15,0.035,0.04,0,1.56,0.15,g,false);
    yeux(g,1.65,0.145,0.06);
    var ch=hasard(MAT_CHAPEAU);
    piece(geoCyl,ch,0.25,0.03,0.25,0,1.74,0,g,false); piece(geoCyl,ch,0.16,0.15,0.16,0,1.82,0,g,false);
    var bG=membre(g,-0.29,1.42,0.52,0.05,veste,M.peau), bD=membre(g,0.29,1.42,0.52,0.05,veste,M.peau); u.bras.push(bG,bD);
    if(Math.random()<0.5){ var ca=piece(geoCyl,M.canne,0.022,1.0,0.022,0,-0.5,0.05,bD,false); ca.rotation.x=0.1; }
    g.userData=u; return g;
  }
  // Enfants : petits, on peut aussi les sauter (de justesse).
  function corpsEnfant(g,u,dy){
    var t=hasard(MAT_TSHIRT), sh=hasard(MAT_SHORT);
    u.jambes.push(membre(g,-0.07,0.38+dy,0.36,0.05,M.peau,M.chaussure,true), membre(g,0.07,0.38+dy,0.36,0.05,M.peau,M.chaussure,true));
    piece(geoBoite,sh,0.27,0.14,0.18,0,0.42+dy,0,g,false);
    piece(geoCyl,t,0.15,0.3,0.12,0,0.62+dy,0,g,true);
    piece(geoSph,M.peau,0.15,0.15,0.15,0,0.9+dy,0,g,false);
    piece(geoSph,hasard(MAT_CHEV),0.155,0.12,0.16,0,0.95+dy,-0.02,g,false);
    yeux(g,0.91+dy,0.138,0.055);
    var bG=membre(g,-0.19,0.74+dy,0.3,0.04,t,M.peau), bD=membre(g,0.19,0.74+dy,0.3,0.04,t,M.peau); u.bras.push(bG,bD);
  }
  function creerEnfantBallon(){
    var g=new T.Group(), u={type:'enfantBallon', genre:'plein', demi:0.4, bas:0, haut:1.05, prof:0.35, jambes:[], bras:[], anim:'ballon'};
    corpsEnfant(g,u,0);
    var b=piece(geoSph,hasard(MAT_BALLON),0.14,0.14,0.14,0.28,0.14,0.22,g,true); u.ballon=b;
    g.userData=u; return g;
  }
  function creerEnfantTrottinette(){
    var g=new T.Group(), u={type:'enfantTrottinette', genre:'plein', demi:0.4, bas:0, haut:1.2, prof:0.45, jambes:[], bras:[], anim:'trottinette'};
    corpsEnfant(g,u,0.12);
    var c=hasard(MAT_CABAS);
    piece(geoBoite,c,0.14,0.04,0.66,0,0.1,0,g,true);
    var st=piece(geoCyl,M.acier,0.025,0.82,0.025,0,0.5,0.3,g,false); st.rotation.x=-0.15;
    piece(geoBoite,c,0.44,0.04,0.04,0,0.9,0.36,g,false);
    piece(geoDemiSph,c,0.17,0.15,0.17,0,1.05,0,g,false);
    g.userData=u; return g;
  }
  // Enfant accroupi qui joue à la marelle : se saute.
  function creerEnfantAccroupi(){
    var g=new T.Group(), u={type:'enfantAccroupi', genre:'bas', demi:0.45, bas:0, haut:0.75, prof:0.35, jambes:[], bras:[], anim:'craie'};
    var t=hasard(MAT_TSHIRT);
    piece(geoSph,hasard(MAT_SHORT),0.2,0.14,0.2,0,0.2,0,g,false);
    [-1,1].forEach(function(c){ piece(geoSph,M.peau,0.07,0.07,0.07,c*0.1,0.3,0.12,g,false); });
    piece(geoCyl,t,0.14,0.26,0.11,0,0.4,-0.02,g,true);
    piece(geoSph,M.peau,0.15,0.15,0.15,0,0.65,0.03,g,false);
    piece(geoSph,hasard(MAT_CHEV),0.155,0.12,0.16,0,0.7,0.0,g,false);
    yeux(g,0.66,0.17,0.055);
    var bD=membre(g,0.17,0.48,0.28,0.04,t,M.craie); bD.rotation.x=-1.0; u.bras.push(bD);
    var m=new T.Mesh(geoPlan,M.marelle); m.rotation.x=-Math.PI/2; m.scale.set(1.2,2.4,1); m.position.set(-0.6,0.012,-1.2); g.add(m);
    g.userData=u; return g;
  }
  // Jardinière basse fleurie dans une voie : se saute.
  function creerJardiniere(){
    var g=new T.Group(), u={type:'jardiniere', genre:'bas', demi:1.25, bas:0, haut:0.78, prof:0.38};
    piece(geoBoite,M.bois,2.5,0.5,0.75,0,0.25,0,g,true);
    piece(geoBoite,M.feuille,2.36,0.2,0.62,0,0.58,0,g,false);
    for(var i=0;i<5;i++) piece(geoSph,MAT_FLEUR[i%MAT_FLEUR.length],0.12,0.1,0.12,-0.95+i*0.48,0.7,(i%2?0.12:-0.12),g,false);
    g.userData=u; return g;
  }
  // Barrière de parking abaissée dans une voie : glisser dessous (ou sauter haut).
  function creerBarriere(){
    var g=new T.Group(), u={type:'barriere', genre:'haut', demi:1.4, bas:1.05, haut:1.42, prof:0.25};
    piece(geoBoite,M.poteauJaune,0.26,1.3,0.26,-1.32,0.65,0,g,true);
    piece(geoBoite,M.brasBarriere,2.7,0.13,0.1,0.05,1.22,0,g,true);
    piece(geoBoite,M.acier,0.2,0.24,0.3,-1.32,1.3,0,g,false);
    piece(geoBoite,M.acier,0.08,0.5,0.08,1.35,0.25,0,g,false);
    g.userData=u; return g;
  }
  // Haie fleurie sur toute la largeur de la rue : sauter.
  function creerHaie(){
    var g=new T.Group(), l=LARGEUR_PISTE-0.2, u={type:'haie', genre:'bas', demi:l/2, bas:0, haut:0.82, prof:0.42};
    piece(geoBoite,M.pierre,l,0.3,0.84,0,0.15,0,g,true);
    piece(geoBoite,M.haie,l-0.2,0.45,0.66,0,0.52,0,g,true);
    g.userData=u; return g;
  }
  // Arche de fête de quartier sur toute la rue : glisser dessous.
  function creerArche(){
    var g=new T.Group(), l=LARGEUR_PISTE-0.2, u={type:'arche', genre:'haut', demi:LARGEUR_PISTE/2, bas:1.05, haut:3.4, prof:0.5};
    piece(geoBoite,M.vertPearl,l,1.4,0.14,0,1.85,0,g,true);
    var lg=new T.Mesh(geoPlan,M.logo); lg.scale.set(2.2,1.1,1); lg.position.set(0,1.85,0.08); g.add(lg);
    piece(geoBoite,M.blanc,LARGEUR_PISTE+0.6,0.16,0.22,0,3.4,0,g,true);
    [-1,1].forEach(function(c){ piece(geoCyl,M.blanc,0.13,3.5,0.13,c*(LARGEUR_PISTE/2+0.1),1.75,0,g,true); });
    var f=new T.Mesh(geoPlan,M.fanions); f.scale.set(LARGEUR_PISTE,0.55,1); f.position.set(0,3.05,0.14); g.add(f);
    g.userData=u; return g;
  }

  // ---------- Colis et bonus ----------
  var geoColis=new T.BoxGeometry(0.52,0.42,0.52), geoRuban=new T.BoxGeometry(0.54,0.43,0.12), geoRuban2=new T.BoxGeometry(0.12,0.43,0.54);
  var geoBulle=new T.SphereGeometry(0.58,18,14), geoAnneauB=new T.TorusGeometry(0.72,0.035,8,28);
  function creerColis(){ var g=new T.Group();
    g.add(maille(geoColis,M.carton,true)); g.add(maille(geoRuban,M.ruban,false)); g.add(maille(geoRuban2,M.ruban,false));
    g.userData={type:'colis', or:false, rate:false}; return g; }
  // Bonus : bulle brillante, forme propre à chaque bonus, anneau tournant.
  var COUL={turbo:0xff7a1a, saut:0x34d058, x2:0xffc928, aimant:0xe5383b, casque:0x2d7ff9, ralenti:0x22b8cf, or:0xf2b705};
  var MB_BONUS={};
  CLES_BONUS.concat(['casque']).forEach(function(id){ var col=COUL[id];
    MB_BONUS[id]={
      bulle:new T.MeshStandardMaterial({color:col,transparent:true,opacity:0.3,emissive:col,emissiveIntensity:0.8,roughness:0.15,metalness:0.2,depthWrite:false}),
      icone:new T.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:0.9,roughness:0.3,metalness:0.4}),
      anneau:new T.MeshBasicMaterial({color:col,transparent:true,opacity:0.85})
    }; });
  // Géométries des icônes : créées une fois, partagées par toutes les bulles.
  var GI={cone:new T.ConeGeometry(0.2,0.6,14), flamme:new T.ConeGeometry(0.12,0.3,10), tore:new T.TorusGeometry(0.2,0.05,8,16), plan:new T.PlaneGeometry(0.8,0.8),
    fer:new T.TorusGeometry(0.24,0.09,10,18,Math.PI), bout:new T.CylinderGeometry(0.09,0.09,0.12,10), sablier:new T.ConeGeometry(0.18,0.26,14), plateau:new T.CylinderGeometry(0.22,0.22,0.04,14),
    dome:new T.SphereGeometry(0.26,16,10,0,Math.PI*2,0,Math.PI/2), bord:new T.CylinderGeometry(0.32,0.32,0.04,16)};
  var matX2=new T.MeshBasicMaterial({map:texX2,transparent:true,side:T.DoubleSide,depthWrite:false});
  function iconeBonus(id){ var m=MB_BONUS[id].icone, g=new T.Group(), k;
    if(id==='turbo'){ var co=maille(GI.cone,m,false); co.rotation.x=-Math.PI/2; g.add(co); var fl=maille(GI.flamme,M.orange,false); fl.rotation.x=Math.PI/2; fl.position.z=0.42; g.add(fl); }
    else if(id==='saut'){ for(k=0;k<3;k++){ var ti=maille(GI.tore,m,false); ti.rotation.x=Math.PI/2; ti.position.y=-0.2+k*0.2; g.add(ti); } }
    else if(id==='x2'){ g.add(new T.Mesh(GI.plan,matX2)); }
    else if(id==='aimant'){ var fer=maille(GI.fer,m,false); fer.position.y=0.02; g.add(fer);
      [-1,1].forEach(function(c){ var bt=maille(GI.bout,M.blanc,false); bt.position.set(c*0.24,-0.06,0); g.add(bt); }); }
    else if(id==='ralenti'){ // Sablier : deux cônes pointe contre pointe, cadre blanc.
      [-1,1].forEach(function(c){ var cn=maille(GI.sablier,m,false); cn.rotation.x=c>0?Math.PI:0; cn.position.y=c*0.13; g.add(cn);
        var pl=maille(GI.plateau,M.blanc,false); pl.position.y=c*0.28; g.add(pl); }); }
    else if(id==='or'){ var cb=maille(geoColis,M.cartonOr,false); cb.scale.setScalar(0.75); g.add(cb);
      var rb=maille(geoRuban,M.ruban,false); rb.scale.setScalar(0.75); g.add(rb); }
    else { var dm=maille(GI.dome,m,false); dm.position.y=-0.04; g.add(dm); var bd=maille(GI.bord,m,false); bd.position.y=-0.04; g.add(bd); }
    return g; }
  function creerBonusObjet(id){ var g=new T.Group();
    g.add(new T.Mesh(geoBulle,MB_BONUS[id].bulle));
    var ic=iconeBonus(id); g.add(ic);
    var an=new T.Mesh(geoAnneauB,MB_BONUS[id].anneau); an.rotation.x=Math.PI/2.4; g.add(an);
    g.userData={type:'bonus_'+id, id:id, ic:ic, an:an, t:0}; return g; }

  // ---------- Réserves (recyclage, aucune création pendant la course une fois rodé) ----------
  var FAB={citadine:function(){ return creerVoiture('citadine'); }, berline:function(){ return creerVoiture('berline'); },
    minibus:function(){ return creerVoiture('minibus'); }, taxi:function(){ return creerVoiture('taxi'); },
    mamie:creerMamie, papy:creerPapy, enfantBallon:creerEnfantBallon, enfantTrottinette:creerEnfantTrottinette,
    enfantAccroupi:creerEnfantAccroupi, jardiniere:creerJardiniere, barriere:creerBarriere, haie:creerHaie, arche:creerArche, colis:creerColis};
  CLES_BONUS.concat(['casque']).forEach(function(id){ FAB['bonus_'+id]=function(){ return creerBonusObjet(id); }; });
  var RESERVE={};
  function prendre(type){ var l=RESERVE[type], o=(l&&l.length)?l.pop():FAB[type](); o.visible=true; scene.add(o); return o; }
  function rendre(o){ scene.remove(o); var t=o.userData.type; (RESERVE[t]||(RESERVE[t]=[])).push(o); }
  var objets=[], pieces=[], bonus=[];

  // ---------- État ----------
  var E=null, phase='pret', prochainRang=0, dernier=null, raf=null, temps=0, voie=0, cibleX=0, depuisBonus=0;
  var occPrec=[false,false,false], zPrec=null, recul=0;
  function nouvelleCourse(){ return {z:E?E.z:0,x:0,y:0,vy:0,v:V_DEPART,dist:0,ptsDist:0,nbPieces:0,rates:0,points:0,palier:0,anim:0,fini:false,
    b:{turbo:0,saut:0,x2:0,aimant:0,ralenti:0,or:0}, casque:false, inv:0, glisse:0, glisseAuSol:false, trebuche:0, dernierEnvoi:0, police:RUSH_POLICE.creer()}; }
  function vider(){ objets.concat(pieces,bonus).forEach(rendre); objets=[]; pieces=[]; bonus=[]; }
  function placer(type,x,z){ var o=prendre(type), u=o.userData; o.position.set(x,0,z); o.rotation.set(0,0,0);
    u.vz=0; u.roule=false; u.declenche=0; u.cogne=false; u.choc=0; u.t=Math.random()*6;
    if(u.anim==='voiture') teinterVoiture(o);
    objets.push(o); return o; }
  function poserColis(x,y,z,or){ var g=prendre('colis'); g.position.set(x,y,z); g.rotation.set(0,0,0); g.userData.or=!!or; g.userData.rate=false; pieces.push(g); }
  function poserBonus(id,x,z){ var g=prendre('bonus_'+id); g.position.set(x,1.15,z); g.userData.t=Math.random()*6; bonus.push(g); }
  function modeleVoiture(){ var r=Math.random(); return r<0.34?'citadine':(r<0.68?'berline':(r<0.86?'minibus':'taxi')); }
  // Obstacle d'une voie occupée.
  function obstacleVoie(sorte,i,z){
    var x=VOIES[i], o;
    if(sorte==='voiture'){ o=placer(modeleVoiture(),x,z); if(Math.random()<0.5) o.rotation.y=Math.PI; }
    else if(sorte==='adulte') placer(Math.random()<0.5?'mamie':'papy',x,z);
    else if(sorte==='enfant') placer(Math.random()<0.55?'enfantBallon':'enfantTrottinette',x,z);
    else if(sorte==='bas') placer(Math.random()<0.6?'jardiniere':'enfantAccroupi',x,z);
    else placer('barriere',x,z);
  }
  // Pose une rangée à z ; rend son genre (pour l'écart suivant) : 'bas' (haie à sauter), 'banniere' (arche), 'mur' (voies).
  function rangee(z){
    var d=E.dist+(E.z-z), r=Math.random(), libre=(Math.random()*3)|0, pR=RUSH_DIFF.pVoitureRoule(d), genre='mur', occ=[false,false,false], k, c, i;
    var ecartPrec=zPrec==null?20:Math.max(0,zPrec-z);
    if(r<pR){
      // Voiture qui roule vers le livreur, dans une voie de préférence vide à la rangée précédente.
      var cands=[]; for(i=0;i<3;i++) if(i!==libre&&!occPrec[i]) cands.push(i);
      if(!cands.length) for(i=0;i<3;i++) if(i!==libre) cands.push(i);
      var vr=hasard(cands), car=placer(modeleVoiture(),VOIES[vr],z);
      car.rotation.y=Math.PI; car.userData.vz=RUSH_DIFF.vVoitureRoule(d,Math.random()); car.userData.declenche=Math.max(6,ecartPrec-4.5); occ[vr]=true;
      for(i=0;i<3;i++){ if(i===libre||i===vr) continue; if(Math.random()<RUSH_DIFF.pVoieLibre(d)) continue; obstacleVoie(RUSH_DIFF.choisirObstacle(Math.random()),i,z); occ[i]=true; }
      for(c=0;c<5;c++) poserColis(VOIES[libre],0.8,z+4-c*1.6,Math.random()<0.05);
      genre='mur';
    } else if(r<pR+0.14){ placer('haie',0,z); genre='bas'; occ=[true,true,true];
      for(k=0;k<3;k++) poserColis(VOIES[libre],1.9,z+1.2-k*1.2,false); }
    else if(r<pR+0.24 && d>250){ placer('arche',0,z); genre='banniere'; occ=[true,true,true];
      for(k=0;k<4;k++) poserColis(VOIES[libre],0.55,z+3-k*1.5,false); }
    else { for(i=0;i<3;i++){ if(i===libre) continue; if(Math.random()<RUSH_DIFF.pVoieLibre(d)) continue; obstacleVoie(RUSH_DIFF.choisirObstacle(Math.random()),i,z); occ[i]=true; }
      for(c=0;c<5;c++) poserColis(VOIES[libre],0.8,z+4-c*1.6,Math.random()<0.05); }
    if(Math.random()<0.3){ var lv=VOIES[(Math.random()*3)|0]; for(var q=0;q<4;q++) poserColis(lv,0.8,z-8-q*1.6,false); }
    depuisBonus++;
    if(RUSH_DIFF.bonusPossible(d,depuisBonus,Math.random())){ depuisBonus=0; poserBonus(RUSH_DIFF.choisirBonus(Math.random()),VOIES[(Math.random()*3)|0],z-RUSH_DIFF.ecart(d,E.palier,'')/2); }
    occPrec=occ; zPrec=z;
    return genre;
  }
  function poserRangee(){ var d=E.dist+(E.z-prochainRang), g=rangee(prochainRang); prochainRang-=RUSH_DIFF.ecart(d,Math.floor(d/PALIER),g); }

  var TEINTE_TOURS=new T.Color(0x8fa6c4); // Tours lointaines : silhouette basse teintée de la brume du ciel
  function appliquerCiel(i){ var c=CIELS[i%CIELS.length]; cielMat.uniforms.haut.value.setHex(c.ciel); cielMat.uniforms.bas.value.setHex(c.bas);
    scene.fog.color.setHex(c.brume); rendu.setClearColor(c.brume,1); M.skyline.color.setHex(c.brume).lerp(TEINTE_TOURS,0.3); soleil.color.setHex(c.soleil); soleil.intensity=c.i; hemi.intensity=0.5+c.i*0.3; }

  var SCORE_MAX=2000000; // Plafond serveur (DeliveryApp/views_jeux.py)
  function listeBoosters(){ var l=[]; CLES_BONUS.forEach(function(k){ if(E.b[k]>0) l.push({id:k,ratio:Math.min(1,E.b[k]/DUREE[k])}); }); if(E.casque) l.push({id:'casque',ratio:1}); return l; }
  function score(){ return Math.min(SCORE_MAX,Math.floor(E.points+E.ptsDist)); }
  function envoyerScore(){ var P=E.police, enP=RUSH_POLICE.enPoursuite(P);
    envoyer({t:'score',score:score(),pieces:E.nbPieces,total:E.nbPieces+E.rates,palier:E.palier,boosters:listeBoosters(),
      police:enP?Math.round(RUSH_POLICE.ratio(P)*20)/20:0, policeS:enP?RUSH_POLICE.secondes(P):0}); }
  function envoyerEtat(){ if(!E||E.fini||E.police.arrete) return; envoyer({t:'etat',dist:Math.floor(E.dist),points:E.points,ptsDist:Math.floor(E.ptsDist),nbPieces:E.nbPieces,rates:E.rates,palier:E.palier,b:{turbo:E.b.turbo,saut:E.b.saut,x2:E.b.x2,aimant:E.b.aimant,ralenti:E.b.ralenti,or:E.b.or},casque:E.casque,police:RUSH_POLICE.photo(E.police)}); }

  function demarrer(et){ vider(); E=nouvelleCourse(); voie=0; cibleX=0; depuisBonus=0; occPrec=[false,false,false]; zPrec=null;
    if(et&&typeof et==='object'){ E.dist=num(et.dist); E.points=num(et.points); E.ptsDist=num(et.ptsDist); E.nbPieces=num(et.nbPieces); E.rates=num(et.rates); E.palier=Math.floor(E.dist/PALIER); E.casque=!!et.casque;
      if(et.b) CLES_BONUS.forEach(function(k){ E.b[k]=Math.max(0,Math.min(DUREE[k],num(et.b[k]))); });
      E.police=RUSH_POLICE.restaurer(et.police); }
    livreur.rotation.set(0,0,0); polX=0; recul=RUSH_POLICE.visible(E.police)?1:0;
    prochainRang=E.z-(et?55:45); for(var i=0;i<6;i++) poserRangee();
    appliquerCiel(E.palier); phase='jeu'; dernier=null; envoyerScore(); boucler(); }
  function finir(){ if(E.fini) return; E.fini=true; phase='fin';
    envoyer({t:'fin',score:score(),distance:Math.floor(E.dist),pieces:E.nbPieces,total:E.nbPieces+E.rates,palier:E.palier+1}); }

  // ---------- Gestes ----------
  function libre(){ return phase==='jeu'&&E&&!E.police.arrete; }
  function sauter(){ if(!libre()||E.y>0.001) return; E.glisse=0; E.vy=V_SAUT*(E.b.saut>0?1.4:1); son('saut'); }
  function glisser(){ if(!libre()) return; son('accroupi');
    if(E.y>0.001){ E.vy=-24; E.glisseAuSol=true; } else E.glisse=0.7; }
  function changerVoie(d){ if(!libre()) return; var n=Math.max(-1,Math.min(1,voie+d)); if(n!==voie){ voie=n; cibleX=VOIES[voie+1]; } }
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

  // ---------- Récompenses visibles : « +10 » / « +50 », en haut à droite ----------
  var stylePop=document.createElement('style');
  stylePop.textContent='.pop{position:absolute;left:0;top:0;pointer-events:none;font:900 26px -apple-system,Roboto,sans-serif;color:#F2B705;text-shadow:0 1px 3px #7a4a00,0 0 2px #fff;opacity:0;will-change:transform,opacity}'
    +'.pop.or{color:#fff;text-shadow:0 1px 3px #b8860b,0 0 6px #F2B705;font-size:32px}'
    +'.pop.vu{animation:monte .8s ease-out forwards}'
    +'.pop{left:auto;right:12px;top:8px;transform-origin:100% 0}'
    +'@keyframes monte{0%{opacity:0;transform:translateY(22px) scale(.6)}20%{opacity:1;transform:translateY(0) scale(1.1)}70%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-6px) scale(1)}}';
  document.head.appendChild(stylePop);
  var pops=[], popI=0;
  for(var pi=0;pi<6;pi++){ var d=document.createElement('div'); d.className='pop'; document.body.appendChild(d); pops.push(d); }
  // Le dernier gain seul, dans le coin en haut à droite (jamais au milieu de la piste).
  function montrerPop(texte,or){
    var avant=pops[(popI+pops.length-1)%pops.length]; avant.className='pop';
    var d=pops[popI]; popI=(popI+1)%pops.length;
    d.className='pop'+(or?' or':''); d.textContent=texte;
    void d.offsetWidth; d.className='pop vu'+(or?' or':'');
  }

  // ---------- Boucle ----------
  // 60 images par seconde au plus en course, 24 à l'accueil, arrêt en fin de
  // partie, en pause et quand la page est cachée (moins de chauffe).
  var IMAGE_MIN=15, IMAGE_REPOS=41;
  function boucler(){ if(raf) cancelAnimationFrame(raf); raf=requestAnimationFrame(image); }
  function image(ts){
    raf=null;
    if(document.hidden) return;
    if(dernier!=null && ts-dernier<(phase==='jeu'?IMAGE_MIN:IMAGE_REPOS)){ raf=requestAnimationFrame(image); return; }
    var dt=dernier==null?0:Math.min(0.05,(ts-dernier)/1000); dernier=ts; temps+=dt;
    if(phase==='jeu') avancer(dt);
    else if(phase==='pret'){ livreur.position.set(0,0,0); poser('repos',temps*1.2); }
    var fov=62+(E&&E.b.turbo>0&&phase==='jeu'?10:0); if(Math.abs(camera.fov-fov)>0.05){ camera.fov+=(fov-camera.fov)*Math.min(1,dt*6); camera.updateProjectionMatrix(); }
    placerCamera(dt);
    soleil.position.set(livreur.position.x+8,18,livreur.position.z+6); soleil.target.position.set(livreur.position.x,0,livreur.position.z-6);
    ciel.position.set(camera.position.x,0,camera.position.z); lointain.position.z=livreur.position.z;
    for(var ip=0;ip<pieces.length;ip++) pieces[ip].rotation.y+=dt*3;
    for(var ib=0;ib<bonus.length;ib++){ var bb=bonus[ib], u=bb.userData; u.t+=dt; bb.position.y=1.15+Math.sin(u.t*2.4)*0.14; u.ic.rotation.y+=dt*2.6; u.an.rotation.z+=dt*2; }
    rendu.render(scene,camera);
    if(phase!=='pause'&&phase!=='fin') raf=requestAnimationFrame(image);
  }
  // Caméra derrière le livreur ; plus haute et plus loin quand la police suit (elle reste visible dans son dos) ;
  // de côté pendant l'arrestation.
  var vise=new T.Vector3();
  function placerCamera(dt){
    var lp=livreur.position, ar=E&&E.police.arrete, cible=E&&RUSH_POLICE.visible(E.police)?1:0;
    recul+=(cible-recul)*Math.min(1,dt*2.5);
    // Poursuite : assez haut et assez loin pour voir toute la voiture (gyrophare, feux) dans le tiers bas.
    if(ar){ var a=Math.min(1,E.police.arrestation/0.8);
      camera.position.set(lp.x*0.55+a*3.4,4.1+recul*2.4-a*3.1,lp.z+7.4+recul*4.5-a*3.7);
      vise.set(lp.x*(0.35+0.65*a),(1.3-recul)*(1-a)+1.1*a,lp.z+(-9+recul*3)*(1-a)); }
    else { camera.position.set(lp.x*0.55,4.1+recul*2.4,lp.z+7.4+recul*4.5); vise.set(lp.x*0.35,1.3-recul,lp.z-9+recul*3); }
    camera.lookAt(vise);
  }
  function activer(id){ son('booster');
    if(id==='casque') E.casque=true; else E.b[id]=DUREE[id];
    envoyer({t:'bonus',id:id}); envoyerScore(); }
  // Voiture de police dans le dos du livreur, gyrophare bleu alterné.
  function animerPolice(dt){
    var P=E.police, vis=RUSH_POLICE.visible(P);
    police.visible=vis; if(!vis){ polX=E.x; return; }
    polX+=(E.x-polX)*Math.min(1,dt*(P.arrete?6:2.6));
    police.position.set(polX,0,E.z+RUSH_POLICE.ecart(P)+MODELES.police.L/2);
    police.rotation.y=(E.x-polX)*-0.06;
    var u=police.userData, on=((temps*(P.arrete?10:6))|0)%2===0;
    M.gyroA.color.setHex(on?0x4da3ff:0x0b2a6e); M.gyroB.color.setHex(on?0x0b2a6e:0x4da3ff);
    u.halos[0].material.opacity=on?0.95:0.15; u.halos[1].material.opacity=on?0.15:0.95;
  }
  function animerObstacle(o,u,dt,dz){
    if(dz>50) return;
    u.t+=dt;
    if(u.jambes&&u.jambes.length){ var s=Math.sin(u.t*5)*0.35; u.jambes[0].rotation.x=s; u.jambes[1].rotation.x=-s; }
    if(u.bras&&u.bras.length===2){ var sb=Math.sin(u.t*5)*0.3; u.bras[0].rotation.x=-sb; u.bras[1].rotation.x=sb; }
    if(u.anim==='ballon'&&u.ballon) u.ballon.position.y=0.14+Math.abs(Math.sin(u.t*4))*0.35;
    if(u.anim==='craie'&&u.bras.length) u.bras[0].rotation.z=Math.sin(u.t*6)*0.3;
    if(u.choc>0){ u.choc=Math.max(0,u.choc-dt); o.rotation.z=Math.sin(u.choc*40)*0.12*u.choc/0.7; if(u.choc===0) o.rotation.z=0; }
  }
  // Arrestation : le livreur s'arrête juste derrière l'obstacle cogné, et la voie de la police est dégagée
  // derrière lui (obstacles déjà passés rendus au pool), pour qu'elle ne traverse rien.
  function preparerArrestation(cause){
    var cu=cause.userData; E.z=Math.max(E.z,cause.position.z+cu.prof+0.35); E.v=Math.min(E.v,1.5);
    for(var i=objets.length-1;i>=0;i--){ var o=objets[i], u=o.userData; if(o===cause) continue;
      if(o.position.z+u.prof>E.z-1 && o.position.z-u.prof<E.z+RUSH_POLICE.ECART_SUIT+MODELES.police.L+2 && Math.abs(o.position.x-E.x)<u.demi+1.2){ rendre(o); objets.splice(i,1); } }
  }
  function arrestation(dt){
    var P=E.police, res=RUSH_POLICE.avancer(P,dt);
    E.v=Math.max(0,E.v-dt*(E.v*3+6)); E.z-=E.v*dt;
    E.x+=(cibleX-E.x)*Math.min(1,dt*9);
    if(E.y>0||E.vy>0){ E.vy-=GRAV*dt; E.y+=E.vy*dt; if(E.y<=0){ E.y=0; E.vy=0; } }
    var a=Math.min(1,P.arrestation/0.6);
    livreur.rotation.y=Math.PI*0.75*a;
    poser(E.v>1?'cours':'arrete',E.v>1?(E.anim+=dt*E.v*0.75):temps);
    corps.visible=true; aura.visible=false; anneauAimant.visible=false;
    livreur.position.set(E.x,E.y,E.z); ombreL.position.set(E.x,0.03,E.z);
    for(var i=0;i<objets.length;i++){ var o=objets[i]; animerObstacle(o,o.userData,dt,o.position.z-E.z); }
    animerPolice(dt);
    if(res==='fin') finir();
  }
  function avancer(dt){
    if(E.police.arrete){ arrestation(dt); return; }
    var b=E.b, tb=b.turbo>0, P=E.police;
    for(var ik=0;ik<CLES_BONUS.length;ik++){ var kb=CLES_BONUS[ik]; if(b[kb]>0) b[kb]=Math.max(0,b[kb]-dt); }
    if(E.inv>0) E.inv-=dt;
    if(E.glisse>0) E.glisse-=dt;
    if(E.trebuche>0) E.trebuche=Math.max(0,E.trebuche-dt);
    if(RUSH_POLICE.avancer(P,dt)==='abandon'){ envoyer({t:'police',etat:'abandon'}); envoyerScore(); }
    var base=RUSH_DIFF.vitesse(E.dist,E.palier);
    // Turbo prime sur ralenti ; fin du ralenti en douceur sur la dernière seconde ; faux pas : vitesse réduite.
    E.v=base*(tb?1.5:(b.ralenti>0?1-0.35*Math.min(1,b.ralenti):1))*(E.trebuche>0?0.7:1);
    var dz=E.v*dt; E.z-=dz; E.dist+=dz; E.ptsDist+=dz*(b.x2>0?2:1);
    E.x+=(cibleX-E.x)*Math.min(1,dt*9);
    if(E.y>0||E.vy>0){ E.vy-=GRAV*dt; E.y+=E.vy*dt; if(E.y<=0){ E.y=0; E.vy=0; if(E.glisseAuSol){ E.glisseAuSol=false; E.glisse=0.6; } } }
    var pal=Math.floor(E.dist/PALIER); if(pal>E.palier){ E.palier=pal; appliquerCiel(pal); son('palier'); envoyer({t:'palier',palier:pal}); envoyerEtat(); }
    // Livreur : pose et effets.
    var aTerre=E.y===0, glisse=E.glisse>0&&aTerre; E.anim+=dt*E.v*0.75;
    if(E.trebuche>0&&aTerre&&!glisse) poser('trebuche',1-E.trebuche/0.6); else poser(glisse?'glisse':(aTerre?'cours':'air'),E.anim);
    corps.rotation.z=(E.x-cibleX)*0.12;
    corps.visible=!(E.inv>0&&!tb&&((temps*14)|0)%2===0);
    casqueB.visible=E.casque;
    var teinte=tb?0xff7a1a:(b.x2>0?0xffc928:(b.or>0?0xf2b705:(b.ralenti>0?0x22b8cf:(b.saut>0?0x34d058:0)))); aura.visible=teinte!==0; if(aura.visible){ M.aura.color.setHex(teinte); aura.scale.setScalar(1+Math.sin(temps*9)*0.06); }
    anneauAimant.visible=b.aimant>0; if(anneauAimant.visible) anneauAimant.rotation.z+=dt*3;
    livreur.position.set(E.x,E.y,E.z);
    ombreL.position.set(E.x,0.03,E.z); ombreL.scale.setScalar(Math.max(0.4,1-E.y*0.25));
    // Rangées devant, ménage derrière.
    while(prochainRang>E.z-130) poserRangee();
    var taille=glisse?0.8:1.85, bas=E.y;
    for(var i=objets.length-1;i>=0;i--){ var o=objets[i], u=o.userData;
      // Voiture qui roule : elle attend phares allumés, puis fonce vers le livreur dans sa voie.
      var mv=0; if(u.vz>0){ if(!u.roule&&o.position.z-E.z>-u.declenche) u.roule=true; if(u.roule){ mv=u.vz*dt; o.position.z+=mv; } }
      if(o.position.z>E.z+(u.vz>0?9:12)){ rendre(o); objets.splice(i,1); continue; }
      animerObstacle(o,u,dt,E.z-o.position.z);
      if(u.cogne||E.inv>0) continue;
      // Balayage sur le trajet de l'image (livreur et voiture qui roule) : rien ne se traverse quand les images ralentissent.
      var dc=o.position.z-E.z, dp=dc-mv-dz, zone=u.prof+0.25;
      if(Math.max(dc,dp)>-zone && Math.min(dc,dp)<zone && Math.abs(o.position.x-E.x)<u.demi+0.3 && bas+taille>u.bas+0.05 && bas<u.haut-0.05){
        var rep=RUSH_POLICE.choc(P,{turbo:tb,casque:E.casque});
        if(rep==='turbo'){ rendre(o); objets.splice(i,1); continue; }
        u.cogne=true; u.choc=0.7; son('choc');
        if(rep==='casque'){ E.casque=false; E.inv=1.2; envoyerScore(); continue; }
        if(rep==='poursuite'){ E.inv=1.2; E.trebuche=0.6; E.glisse=0; envoyer({t:'police',etat:'poursuite'}); envoyerScore(); continue; }
        // Deuxième choc pendant la poursuite : arrestation.
        E.trebuche=0; preparerArrestation(o); envoyer({t:'police',etat:'arrete'}); envoyerScore(); animerPolice(dt); return;
      }
    }
    var cy=E.y+(glisse?0.4:0.9), aimant=b.aimant>0, mOr=b.or>0;
    for(var k=pieces.length-1;k>=0;k--){ var p=pieces[k], pu=p.userData;
      p.children[0].material=(pu.or||mOr)?M.cartonOr:M.carton; // Colis en or : tous dorés tant qu'il dure
      if(aimant&&p.position.z<E.z+1&&p.position.z>E.z-9&&Math.abs(p.position.x-E.x)<7){
        p.position.x+=(E.x-p.position.x)*Math.min(1,dt*7); p.position.y+=(cy-p.position.y)*Math.min(1,dt*7); p.position.z+=(E.z-p.position.z)*Math.min(1,dt*3); }
      if(Math.abs(p.position.z-E.z)<0.8 && Math.abs(p.position.x-E.x)<0.8 && Math.abs(p.position.y-cy)<1.0){
        var dore=pu.or||b.or>0, gain=(dore?50:10)*(b.x2>0?2:1);
        montrerPop('+'+gain,dore);
        rendre(p); pieces.splice(k,1); E.nbPieces++; E.points+=gain; son(dore?'bonus':'ramasse');
        E.serie=(E.serie||0)+1; if(E.serie%10===0) envoyer({t:'serie',n:E.serie});
        continue; }
      if(p.position.z>E.z+1&&!pu.rate){ pu.rate=true; E.rates++; E.serie=0; }
      if(p.position.z>E.z+10){ rendre(p); pieces.splice(k,1); }
    }
    for(var q=bonus.length-1;q>=0;q--){ var bo=bonus[q];
      if(bo.position.z>E.z+10){ rendre(bo); bonus.splice(q,1); continue; }
      if(Math.abs(bo.position.z-E.z)<0.9 && Math.abs(bo.position.x-E.x)<0.9 && Math.abs(bo.position.y-cy)<1.3){ var id=bo.userData.id; rendre(bo); bonus.splice(q,1); activer(id); }
    }
    animerPolice(dt);
    // Rue recyclée.
    for(var is=0;is<segments.length;is++){ var sg=segments[is]; if(sg.position.z-SEG/2>E.z+15){ sg.position.z-=SEG*NSEG; remixer(sg); } }
    E.dernierEnvoi+=dt; if(E.dernierEnvoi>=0.1){ E.dernierEnvoi=0; envoyerScore(); }
  }

  window.addEventListener('resize',function(){ rendu.setSize(window.innerWidth,window.innerHeight); camera.aspect=window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); });
  window.jeu={
    demarrer:demarrer,
    pause:function(){ if(phase==='jeu'){ phase='pause'; if(raf) cancelAnimationFrame(raf); raf=null; envoyerEtat(); } },
    reprendre:function(){ if(phase==='pause'){ phase='jeu'; dernier=null; boucler(); } }
  };
  // Page cachée (WebView en arrière-plan) : plus aucune image calculée.
  document.addEventListener('visibilitychange',function(){
    if(document.hidden){ if(raf) cancelAnimationFrame(raf); raf=null; }
    else if(phase!=='pause'&&phase!=='fin'){ dernier=null; boucler(); }
  });
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
<style>html,body{margin:0;padding:0;overflow:hidden;background:#bfe6ff;touch-action:none;-webkit-user-select:none;user-select:none;height:100%}canvas{display:block}</style>
</head><body>
<script>window.__LOGO_PEARL=${JSON.stringify(LOGO_PEARL_DATA_URL)};</script>
<script>${MOTEUR_AUDIO_JS}</script>
<script>window.__lancerJeu=function(){${JEU_JS}};</script>
<script>${chargeur()}</script>
</body></html>`;
