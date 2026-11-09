/**
 * Page web du « Rush » en 3D (screens/JeuRushScreen.js) : course sans fin
 * dans un monde de plateformes coloré (prairies, champignons géants, blocs de
 * briques, pièces d'or), rendu Three.js avec lumière, ombres et brouillard.
 *
 * Commandes : glisser le doigt à gauche ou à droite pour déplacer le livreur,
 * glisser vers le haut pour sauter. Murs de briques à éviter, rondins à
 * sauter, boules à piques qui roulent d'un bord à l'autre. Pièce = 10 points,
 * étoile = 50 points. Un palier plus rapide (et une nouvelle lumière) tous
 * les 1000 m.
 *
 * Messages vers l'app : { t: 'pret' | 'erreur' | 'score' | 'palier' | 'fin' }.
 * Commandes depuis l'app : window.jeu.demarrer() / pause() / reprendre(),
 * window.sonJeu.* (utils/sonJeux.js).
 * Aucun accent grave (`) ni ${ dans ce code : il vit dans une chaîne.
 */
import { MOTEUR_AUDIO_JS } from './sonJeux';

const THREE_URLS = [
  'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js',
  'https://unpkg.com/three@0.149.0/build/three.min.js',
];

const JEU_JS = `
(function(){
  function envoyer(o){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(o)); }catch(e){} }
  var T=window.THREE;
  if(!T){ envoyer({t:'erreur'}); return; }
  var son=function(n){ if(window.sonJeu) window.sonJeu.jouer(n); };

  // ---------- Réglages ----------
  var LARGEUR_PISTE=9, BORD=LARGEUR_PISTE/2-0.55;
  var V_DEPART=11, V_MAX=24, GRAV=28, V_SAUT=9.6;
  var PALIER=1000;
  var CIELS=[
    {ciel:0x7ec8ff, bas:0xcdeeff, sol:0x5cc04a, soleil:0xfff3d6, i:1.25, brume:0xbfe6ff},
    {ciel:0x9fd6ff, bas:0xffe9b8, sol:0x63b844, soleil:0xffe0a8, i:1.15, brume:0xffe2b0},
    {ciel:0xff9e6b, bas:0xffd29a, sol:0x4f9e3c, soleil:0xffb070, i:1.0,  brume:0xffb88a},
    {ciel:0x6a5acd, bas:0xd9a7ff, sol:0x3f8a46, soleil:0xffc8e8, i:0.85, brume:0xb49ae6},
    {ciel:0x1b2559, bas:0x3c4f9e, sol:0x2f6e3a, soleil:0xbcd0ff, i:0.7,  brume:0x2c3a7a},
    {ciel:0x86e0ff, bas:0xf3fbff, sol:0x6ccf5a, soleil:0xffffff, i:1.3,  brume:0xe6f7ff}
  ];

  // ---------- Scène ----------
  var rendu=new T.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
  rendu.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  rendu.setSize(window.innerWidth,window.innerHeight);
  rendu.shadowMap.enabled=true; rendu.shadowMap.type=T.PCFSoftShadowMap;
  rendu.outputEncoding=T.sRGBEncoding;
  rendu.toneMapping=T.ACESFilmicToneMapping; rendu.toneMappingExposure=1.05;
  document.body.appendChild(rendu.domElement);
  var scene=new T.Scene();
  scene.fog=new T.Fog(0xbfe6ff,40,150);
  var camera=new T.PerspectiveCamera(62,window.innerWidth/window.innerHeight,0.1,400);
  var hemi=new T.HemisphereLight(0xcdeeff,0x4a8a3a,0.75); scene.add(hemi);
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
  var texBrique=toile(128,128,function(g,l,h){ g.fillStyle='#b5562a'; g.fillRect(0,0,l,h); g.fillStyle='#d8743c';
    for(var y=0;y<4;y++) for(var x=0;x<3;x++){ var dx=(y%2)*21; g.fillRect(x*43+dx-21+2,y*32+2,39,28); }
    g.fillStyle='rgba(0,0,0,0.18)'; for(var y2=0;y2<4;y2++) g.fillRect(0,y2*32+28,l,4); });
  texBrique.wrapS=texBrique.wrapT=T.RepeatWrapping;
  var texPiste=toile(256,256,function(g,l,h){ g.fillStyle='#e8c98a'; g.fillRect(0,0,l,h);
    for(var y=0;y<4;y++) for(var x=0;x<4;x++){ var v=200+Math.floor(Math.random()*30); g.fillStyle='rgb('+(v+30)+','+(v)+','+(v-70)+')'; g.fillRect(x*64+3,y*64+3,58,58); }
    g.strokeStyle='rgba(120,80,30,0.35)'; g.lineWidth=3; for(var i=0;i<=4;i++){ g.beginPath(); g.moveTo(i*64,0); g.lineTo(i*64,h); g.stroke(); g.beginPath(); g.moveTo(0,i*64); g.lineTo(l,i*64); g.stroke(); } });
  texPiste.wrapS=texPiste.wrapT=T.RepeatWrapping; texPiste.repeat.set(3,14);
  var texHerbe=toile(256,256,function(g,l,h){ g.fillStyle='#5cbf49'; g.fillRect(0,0,l,h);
    for(var i=0;i<2200;i++){ g.fillStyle='rgba('+(40+Math.random()*60|0)+','+(150+Math.random()*80|0)+',40,0.5)'; g.fillRect(Math.random()*l,Math.random()*h,2,3); } });
  texHerbe.wrapS=texHerbe.wrapT=T.RepeatWrapping; texHerbe.repeat.set(20,8);

  // ---------- Matériaux partagés ----------
  function std(c,o){ o=o||{}; o.color=c; if(o.roughness==null) o.roughness=0.6; return new T.MeshStandardMaterial(o); }
  var M={
    brique:std(0xffffff,{map:texBrique,roughness:0.85}),
    piste:std(0xffffff,{map:texPiste,roughness:0.9}),
    herbe:std(0xffffff,{map:texHerbe,roughness:1}),
    bord:std(0xf4f0e6,{roughness:0.7}),
    or:std(0xffc928,{metalness:0.85,roughness:0.25,emissive:0x5a3a00,emissiveIntensity:0.35}),
    etoile:std(0xfff06a,{metalness:0.5,roughness:0.3,emissive:0xffb800,emissiveIntensity:0.6}),
    bois:std(0x8a5a2b,{roughness:0.9}), boisClair:std(0xc79a5a,{roughness:0.9}),
    piques:std(0x2b2b33,{metalness:0.4,roughness:0.4}), pique:std(0xe8e8f0,{metalness:0.6,roughness:0.3}),
    rouge:std(0xe8382f,{roughness:0.45}), blanc:std(0xffffff,{roughness:0.5}), creme:std(0xf6e7c8,{roughness:0.8}),
    colline:std(0x4fb043,{roughness:0.95}), collineF:std(0x3e9a3a,{roughness:0.95}),
    tronc:std(0x7a4f2a,{roughness:0.9}), feuille:std(0x2f9e3f,{roughness:0.8}),
    nuage:new T.MeshLambertMaterial({color:0xffffff}), montagne:std(0x7aa6c8,{roughness:1}), neige:std(0xffffff,{roughness:0.8}),
    veste:std(0xff6a13,{roughness:0.55}), peau:std(0xf1c19b,{roughness:0.7}), pantalon:std(0x2d3a5a,{roughness:0.8}),
    sac:std(0x111827,{roughness:0.6}), casquette:std(0xff6a13,{roughness:0.5}), chaussure:std(0xffffff,{roughness:0.6}),
    fleurR:std(0xff4f6d), fleurJ:std(0xffd23f), ombre:new T.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.25,depthWrite:false})
  };
  function maille(g,m,ombre,recoit){ var x=new T.Mesh(g,m); x.castShadow=!!ombre; x.receiveShadow=recoit!==false; return x; }

  // ---------- Sol qui se recycle ----------
  var SEG=60, NSEG=5, segments=[];
  for(var s=0;s<NSEG;s++){
    var grp=new T.Group();
    var p=maille(new T.PlaneGeometry(LARGEUR_PISTE,SEG),M.piste,false,true); p.rotation.x=-Math.PI/2; grp.add(p);
    var h=maille(new T.PlaneGeometry(220,SEG),M.herbe,false,true); h.rotation.x=-Math.PI/2; h.position.y=-0.02; grp.add(h);
    [-1,1].forEach(function(c){ var b=maille(new T.BoxGeometry(0.35,0.25,SEG),M.bord,false,true); b.position.set(c*(LARGEUR_PISTE/2+0.17),0.12,0); grp.add(b); });
    grp.position.z=-s*SEG; scene.add(grp); segments.push(grp);
  }

  // ---------- Décor ----------
  var decor=[];
  var geoTige=new T.CylinderGeometry(0.55,0.75,3,14), geoChapeau=new T.SphereGeometry(2,20,12,0,Math.PI*2,0,Math.PI/2), geoPoint=new T.SphereGeometry(0.32,10,8);
  function champignon(){ var g=new T.Group(); var t=maille(geoTige,M.creme,true); t.position.y=1.5; g.add(t);
    var c=maille(geoChapeau,M.rouge,true); c.position.y=2.9; c.scale.y=0.75; g.add(c);
    for(var i=0;i<6;i++){ var a=i/6*Math.PI*2, d=maille(geoPoint,M.blanc); d.position.set(Math.cos(a)*1.25,3.95,Math.sin(a)*1.25); d.scale.y=0.5; g.add(d); }
    var d0=maille(geoPoint,M.blanc); d0.position.set(0,4.4,0); d0.scale.y=0.5; g.add(d0); return g; }
  var geoTronc=new T.CylinderGeometry(0.25,0.35,2,8), geoFeuille=new T.SphereGeometry(1.4,14,10);
  function arbre(){ var g=new T.Group(); var t=maille(geoTronc,M.tronc,true); t.position.y=1; g.add(t);
    var f=maille(geoFeuille,M.feuille,true); f.position.y=2.7; g.add(f); var f2=maille(geoFeuille,M.feuille,true); f2.position.set(0.5,3.6,0.2); f2.scale.setScalar(0.7); g.add(f2); return g; }
  var geoColline=new T.SphereGeometry(1,20,12,0,Math.PI*2,0,Math.PI/2);
  function colline(){ var g=new T.Group(); var c=maille(geoColline,Math.random()<0.5?M.colline:M.collineF,false); c.scale.set(6+Math.random()*6,3+Math.random()*4,6+Math.random()*4); g.add(c); return g; }
  var geoBloc=new T.BoxGeometry(1.4,1.4,1.4);
  function blocsVolants(){ var g=new T.Group(); var n=2+(Math.random()*3|0); for(var i=0;i<n;i++){ var b=maille(geoBloc,i===1?M.or:M.brique,true); b.position.set(i*1.4,0,0); g.add(b); } g.position.y=5+Math.random()*2; return g; }
  var geoFleur=new T.SphereGeometry(0.22,8,6), geoTigeF=new T.CylinderGeometry(0.04,0.04,0.5,5);
  function fleurs(){ var g=new T.Group(); for(var i=0;i<5;i++){ var tg=maille(geoTigeF,M.feuille); tg.position.set(Math.random()*2-1,0.25,Math.random()*2-1); g.add(tg);
    var f=maille(geoFleur,Math.random()<0.5?M.fleurR:M.fleurJ); f.position.set(tg.position.x,0.55,tg.position.z); g.add(f); } return g; }
  var FABRIQUES=[champignon,champignon,arbre,arbre,colline,fleurs,fleurs,blocsVolants];
  var LONG_DECOR=SEG*NSEG;
  function placerDecor(o,z){ var cote=Math.random()<0.5?-1:1; var loin=o.userData.type==='colline'?14+Math.random()*30:(o.userData.type==='blocs'?LARGEUR_PISTE/2+1+Math.random()*4:LARGEUR_PISTE/2+2.5+Math.random()*16);
    o.position.x=cote*loin+(o.userData.type==='blocs'&&cote<0?-4:0); o.position.z=z; o.rotation.y=Math.random()*Math.PI*2; var k=0.8+Math.random()*0.6; o.scale.setScalar(o.userData.type==='colline'?1:k); }
  for(var d=0;d<70;d++){ var f=FABRIQUES[d%FABRIQUES.length]; var o=f(); o.userData.type=f===colline?'colline':(f===blocsVolants?'blocs':'autre'); placerDecor(o,-Math.random()*LONG_DECOR); if(o.userData.type==='blocs') o.rotation.y=0; scene.add(o); decor.push(o); }

  // Nuages et montagnes lointaines (suivent le livreur).
  var lointain=new T.Group(); scene.add(lointain);
  var geoNuage=new T.SphereGeometry(1,12,10);
  for(var n=0;n<14;n++){ var nu=new T.Group(); for(var j=0;j<4;j++){ var b=new T.Mesh(geoNuage,M.nuage); b.position.set(j*1.6-2.4,Math.sin(j)*0.6,0); b.scale.setScalar(1.4+Math.random()*1.2); nu.add(b); }
    nu.position.set((Math.random()*2-1)*120,22+Math.random()*18,-60-Math.random()*140); nu.scale.setScalar(1.5+Math.random()); lointain.add(nu); }
  var geoMont=new T.ConeGeometry(1,1,7), geoNeige=new T.ConeGeometry(1,1,7);
  for(var m=0;m<16;m++){ var mo=new T.Group(); var cm=new T.Mesh(geoMont,M.montagne); var hm=25+Math.random()*30; cm.scale.set(18+Math.random()*14,hm,18); cm.position.y=hm/2; mo.add(cm);
    var ne=new T.Mesh(geoNeige,M.neige); ne.scale.set(cm.scale.x*0.32,hm*0.32,cm.scale.z*0.32); ne.position.y=hm*0.84; mo.add(ne);
    mo.position.set((m/15*2-1)*200,-1,-210-Math.random()*30); lointain.add(mo); }

  // ---------- Livreur ----------
  var livreur=new T.Group(); scene.add(livreur);
  var corps=new T.Group(); livreur.add(corps);
  function membre(l,r,mat){ var g=new T.Group(); var m=maille(new T.CylinderGeometry(r,r*0.9,l,10),mat,true); m.position.y=-l/2; g.add(m); return g; }
  var torse=maille(new T.CylinderGeometry(0.34,0.3,0.75,14),M.veste,true); torse.position.y=1.15; corps.add(torse);
  var tete=maille(new T.SphereGeometry(0.27,18,14),M.peau,true); tete.position.y=1.78; corps.add(tete);
  var casq=maille(new T.SphereGeometry(0.29,18,10,0,Math.PI*2,0,Math.PI/2),M.casquette,true); casq.position.y=1.82; corps.add(casq);
  var visiere=maille(new T.BoxGeometry(0.32,0.04,0.22),M.casquette,true); visiere.position.set(0,1.84,-0.3); corps.add(visiere);
  var sac=maille(new T.BoxGeometry(0.62,0.62,0.4),M.sac,true); sac.position.set(0,1.25,0.38); corps.add(sac);
  var bande=maille(new T.BoxGeometry(0.64,0.12,0.42),M.veste,false); bande.position.set(0,1.3,0.38); corps.add(bande);
  var jambeG=membre(0.75,0.12,M.pantalon), jambeD=membre(0.75,0.12,M.pantalon); jambeG.position.set(-0.15,0.8,0); jambeD.position.set(0.15,0.8,0); corps.add(jambeG); corps.add(jambeD);
  [jambeG,jambeD].forEach(function(j){ var c=maille(new T.BoxGeometry(0.2,0.12,0.3),M.chaussure,true); c.position.set(0,-0.78,-0.05); j.add(c); });
  var brasG=membre(0.62,0.09,M.veste), brasD=membre(0.62,0.09,M.veste); brasG.position.set(-0.43,1.48,0); brasD.position.set(0.43,1.48,0); corps.add(brasG); corps.add(brasD);
  var ombreL=new T.Mesh(new T.CircleGeometry(0.5,20),M.ombre); ombreL.rotation.x=-Math.PI/2; ombreL.position.y=0.02; scene.add(ombreL);

  // ---------- Objets de la course ----------
  var geoMur=new T.BoxGeometry(1,1,1), geoRondin=new T.CylinderGeometry(0.4,0.4,1,16), geoBout=new T.CircleGeometry(0.4,16);
  var geoBoule=new T.SphereGeometry(0.6,16,12), geoPique=new T.ConeGeometry(0.12,0.4,6);
  var geoPiece=new T.CylinderGeometry(0.38,0.38,0.08,22);
  var geoEtoile=(function(){ var f=new T.Shape(); for(var i=0;i<10;i++){ var r=i%2?0.22:0.5, a=i/10*Math.PI*2+Math.PI/2; if(i===0) f.moveTo(Math.cos(a)*r,Math.sin(a)*r); else f.lineTo(Math.cos(a)*r,Math.sin(a)*r); } f.closePath();
    var g=new T.ExtrudeGeometry(f,{depth:0.16,bevelEnabled:true,bevelSize:0.04,bevelThickness:0.04,bevelSegments:2}); g.center(); return g; })();
  var objets=[], pieces=[];
  function creerMur(x,l){ var g=new T.Group(); var b=maille(geoMur,M.brique,true); b.scale.set(l,1.9,1); b.position.y=0.95; g.add(b);
    texBrique.repeat.set(1,1); g.position.x=x; g.userData={genre:'mur', demi:l/2, haut:1.9}; return g; }
  function creerRondin(x,l){ var g=new T.Group(); var r=maille(geoRondin,M.bois,true); r.rotation.z=Math.PI/2; r.scale.set(1,l,1); r.position.y=0.42; g.add(r);
    [-1,1].forEach(function(c){ var b=maille(geoBout,M.boisClair,false); b.rotation.y=c*Math.PI/2; b.position.set(c*l/2+c*0.001,0.42,0); g.add(b); });
    g.position.x=x; g.userData={genre:'rondin', demi:l/2, haut:0.82}; return g; }
  function creerBoule(x){ var g=new T.Group(); var b=maille(geoBoule,M.piques,true); g.add(b);
    for(var i=0;i<14;i++){ var p=maille(geoPique,M.pique,true); var v=new T.Vector3(Math.random()*2-1,Math.random()*2-1,Math.random()*2-1).normalize(); p.position.copy(v.clone().multiplyScalar(0.62)); p.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v); b.add(p); }
    g.position.set(x,0.7,0); g.userData={genre:'boule', demi:0.6, haut:1.4, boule:b, vx:(Math.random()<0.5?-1:1)*(2+Math.random()*1.5)}; return g; }
  function creerPiece(x,y,z,etoile){ var p=maille(etoile?geoEtoile:geoPiece,etoile?M.etoile:M.or,true); if(!etoile) p.rotation.z=Math.PI/2; p.position.set(x,y,z); p.userData={etoile:!!etoile}; scene.add(p); pieces.push(p); }

  // ---------- État ----------
  var E=null, phase='pret', prochainRang=0, dernier=null, raf=null, temps=0;
  var cibleX=0;
  function nouvelleCourse(){ return {z:E?E.z:0,x:0,y:0,vy:0,v:V_DEPART,dist:0,nbPieces:0,points:0,palier:0,anim:0,fini:false}; }
  function vider(){ objets.forEach(function(o){ scene.remove(o); }); pieces.forEach(function(p){ scene.remove(p); }); objets=[]; pieces=[]; }
  var VOIES=[-3,0,3];
  function rangee(z){
    var diff=Math.min(1,E.dist/2500), r=Math.random();
    var libre=(Math.random()*3)|0;
    if(r<0.18+0.1*diff && E.dist>150){ var o=creerBoule(VOIES[(Math.random()*3)|0]); o.position.z=z; scene.add(o); objets.push(o); }
    else if(r<0.5){ // rondin sur toute la largeur : sauter
      var ro=creerRondin(0,LARGEUR_PISTE-0.2); ro.position.z=z; scene.add(ro); objets.push(ro);
      for(var k=0;k<3;k++) creerPiece(VOIES[libre],1.9,z+1.2-k*1.2,false);
    } else { // murs sur 1 ou 2 voies, une voie toujours libre
      for(var i=0;i<3;i++){ if(i===libre) continue; if(Math.random()<0.35-0.25*diff && i!==libre) continue;
        var m=creerMur(VOIES[i],2.6); m.position.z=z; scene.add(m); objets.push(m); }
      for(var c=0;c<5;c++) creerPiece(VOIES[libre],0.8,z+4-c*1.6,Math.random()<0.04);
    }
    if(Math.random()<0.35){ var lv=VOIES[(Math.random()*3)|0]; for(var q=0;q<4;q++) creerPiece(lv,0.8,z-8-q*1.6,false); }
  }
  function ecartRangees(){ return Math.max(13, E.v*1.25); }

  function appliquerCiel(i){ var c=CIELS[i%CIELS.length]; cielMat.uniforms.haut.value.setHex(c.ciel); cielMat.uniforms.bas.value.setHex(c.bas);
    scene.fog.color.setHex(c.brume); soleil.color.setHex(c.soleil); soleil.intensity=c.i; hemi.intensity=0.45+c.i*0.3; M.herbe.color.setHex(0xffffff).lerp(new T.Color(c.sol),0.35); }

  function demarrer(){ vider(); E=nouvelleCourse(); cibleX=0; prochainRang=E.z-45; for(var i=0;i<6;i++){ rangee(prochainRang); prochainRang-=ecartRangees(); }
    appliquerCiel(0); phase='jeu'; dernier=null; envoyer({t:'score',score:0,pieces:0,palier:0}); boucler(); }
  function finir(){ if(E.fini) return; E.fini=true; phase='fin'; son('choc');
    envoyer({t:'fin',score:Math.floor(E.points+E.dist),distance:Math.floor(E.dist),pieces:E.nbPieces,palier:E.palier+1}); }
  function sauter(){ if(phase!=='jeu'||E.y>0.001) return; E.vy=V_SAUT; son('saut'); }

  // ---------- Commandes tactiles ----------
  var t0=null;
  window.addEventListener('touchstart',function(e){ var t=e.touches[0]; t0={x:t.clientX,y:t.clientY,dernierX:t.clientX,saut:false}; },{passive:true});
  window.addEventListener('touchmove',function(e){ if(!t0) return; var t=e.touches[0];
    var dx=t.clientX-t0.dernierX; t0.dernierX=t.clientX;
    if(phase==='jeu') cibleX=Math.max(-BORD,Math.min(BORD,cibleX+dx*(LARGEUR_PISTE/window.innerWidth)*1.35));
    var monte=t0.y-t.clientY;
    if(!t0.saut && monte>32 && monte>Math.abs(t.clientX-t0.x)*1.1){ t0.saut=true; sauter(); }
    if(e.cancelable) e.preventDefault(); },{passive:false});
  window.addEventListener('touchend',function(){ t0=null; },{passive:true});

  // ---------- Boucle ----------
  function boucler(){ if(raf) cancelAnimationFrame(raf); raf=requestAnimationFrame(image); }
  function image(ts){
    raf=null;
    var dt=dernier==null?0:Math.min(0.05,(ts-dernier)/1000); dernier=ts; temps+=dt;
    if(phase==='jeu') avancer(dt);
    else if(phase==='pret'){ livreur.position.set(0,0,0); corps.rotation.y=Math.sin(temps)*0.15; }
    camera.position.set(livreur.position.x*0.55,4.1,livreur.position.z+7.4);
    camera.lookAt(livreur.position.x*0.35,1.3,livreur.position.z-9);
    soleil.position.set(livreur.position.x+8,18,livreur.position.z+6); soleil.target.position.set(livreur.position.x,0,livreur.position.z-6);
    ciel.position.set(camera.position.x,0,camera.position.z); lointain.position.z=livreur.position.z;
    pieces.forEach(function(p){ p.rotation.y+=dt*(p.userData.etoile?2:4); });
    rendu.render(scene,camera);
    if(phase!=='pause') raf=requestAnimationFrame(image);
  }
  function avancer(dt){
    E.v=Math.min(V_MAX,V_DEPART+Math.sqrt(E.dist)*0.32+E.palier*0.8);
    var dz=E.v*dt; E.z-=dz; E.dist+=dz;
    E.x+=(cibleX-E.x)*Math.min(1,dt*14);
    if(E.y>0||E.vy>0){ E.vy-=GRAV*dt; E.y+=E.vy*dt; if(E.y<=0){ E.y=0; E.vy=0; } }
    var pal=Math.floor(E.dist/PALIER); if(pal>E.palier){ E.palier=pal; appliquerCiel(pal); son('palier'); envoyer({t:'palier',palier:pal}); }
    // Livreur et animation de course.
    E.anim+=dt*E.v*0.75; var aTerre=E.y===0; var b=aTerre?Math.sin(E.anim)*0.8:0.5;
    jambeG.rotation.x=b; jambeD.rotation.x=aTerre?-b:-0.9; brasG.rotation.x=-b*0.8; brasD.rotation.x=b*0.8;
    corps.position.y=aTerre?Math.abs(Math.cos(E.anim))*0.08:0; corps.rotation.y=0; corps.rotation.z=(E.x-cibleX)*0.12;
    livreur.position.set(E.x,E.y,E.z);
    ombreL.position.set(E.x,0.02,E.z); ombreL.scale.setScalar(Math.max(0.4,1-E.y*0.3));
    // Rangées devant, ménage derrière.
    while(prochainRang>E.z-130){ rangee(prochainRang); prochainRang-=ecartRangees(); }
    for(var i=objets.length-1;i>=0;i--){ var o=objets[i], u=o.userData;
      if(u.genre==='boule'){ o.position.x+=u.vx*dt; if(Math.abs(o.position.x)>BORD-0.2){ u.vx=-u.vx; o.position.x=Math.sign(o.position.x)*(BORD-0.2); } u.boule.rotation.z-=u.vx*dt/0.6; u.boule.rotation.x-=dt*3; }
      if(o.position.z>E.z+12){ scene.remove(o); objets.splice(i,1); continue; }
      var prof=u.genre==='rondin'?0.45:(u.genre==='boule'?0.55:0.5);
      if(Math.abs(o.position.z-E.z)<prof+0.25 && Math.abs(o.position.x-E.x)<u.demi+0.32 && E.y<u.haut-0.05){ livreur.position.z=E.z; finir(); return; }
    }
    for(var k=pieces.length-1;k>=0;k--){ var p=pieces[k];
      if(p.position.z>E.z+10){ scene.remove(p); pieces.splice(k,1); continue; }
      if(Math.abs(p.position.z-E.z)<0.8 && Math.abs(p.position.x-E.x)<0.8 && Math.abs(p.position.y-(E.y+0.9))<1.1){
        scene.remove(p); pieces.splice(k,1); E.nbPieces++; E.points+=p.userData.etoile?50:10; son(p.userData.etoile?'bonus':'piece'); }
    }
    // Sol et décor recyclés.
    segments.forEach(function(sg){ if(sg.position.z-SEG/2>E.z+15) sg.position.z-=SEG*NSEG; });
    decor.forEach(function(o){ if(o.position.z>E.z+20) placerDecor(o,o.position.z-LONG_DECOR); });
    if(((temps*10)|0)!==((temps*10-dt*10)|0)) envoyer({t:'score',score:Math.floor(E.points+E.dist),pieces:E.nbPieces,palier:E.palier});
  }

  window.addEventListener('resize',function(){ rendu.setSize(window.innerWidth,window.innerHeight); camera.aspect=window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); });
  window.jeu={
    demarrer:demarrer,
    pause:function(){ if(phase==='jeu'){ phase='pause'; if(raf) cancelAnimationFrame(raf); raf=null; } },
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
<script>${MOTEUR_AUDIO_JS}</script>
<script>window.__lancerJeu=function(){${JEU_JS}};</script>
<script>${chargeur()}</script>
</body></html>`;
