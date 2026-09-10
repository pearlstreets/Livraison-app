// Noms des pays proposés à l'inscription, dans les 13 langues de l'app.
// Ordre des colonnes = ORDER ci-dessous. Hermes ne fournit pas
// Intl.DisplayNames : la table est donc statique.

const ORDER = ['fr', 'en', 'es', 'zh', 'ar', 'de', 'nl', 'it', 'pt', 'ja', 'th', 'sv', 'ru'];

const NAMES = {
  FR: ["France", "France", "Francia", "法国", "فرنسا", "Frankreich", "Frankrijk", "Francia", "França", "フランス", "ฝรั่งเศส", "Frankrike", "Франция"],
  BE: ["Belgique", "Belgium", "Bélgica", "比利时", "بلجيكا", "Belgien", "België", "Belgio", "Bélgica", "ベルギー", "เบลเยียม", "Belgien", "Бельгия"],
  GB: ["Royaume-Uni", "United Kingdom", "Reino Unido", "英国", "المملكة المتحدة", "Vereinigtes Königreich", "Verenigd Koninkrijk", "Regno Unito", "Reino Unido", "イギリス", "สหราชอาณาจักร", "Storbritannien", "Великобритания"],
  DE: ["Allemagne", "Germany", "Alemania", "德国", "ألمانيا", "Deutschland", "Duitsland", "Germania", "Alemanha", "ドイツ", "เยอรมนี", "Tyskland", "Германия"],
  IT: ["Italie", "Italy", "Italia", "意大利", "إيطاليا", "Italien", "Italië", "Italia", "Itália", "イタリア", "อิตาลี", "Italien", "Италия"],
  ES: ["Espagne", "Spain", "España", "西班牙", "إسبانيا", "Spanien", "Spanje", "Spagna", "Espanha", "スペイン", "สเปน", "Spanien", "Испания"],
  PT: ["Portugal", "Portugal", "Portugal", "葡萄牙", "البرتغال", "Portugal", "Portugal", "Portogallo", "Portugal", "ポルトガル", "โปรตุเกส", "Portugal", "Португалия"],
  NL: ["Pays-Bas", "Netherlands", "Países Bajos", "荷兰", "هولندا", "Niederlande", "Nederland", "Paesi Bassi", "Países Baixos", "オランダ", "เนเธอร์แลนด์", "Nederländerna", "Нидерланды"],
  CH: ["Suisse", "Switzerland", "Suiza", "瑞士", "سويسرا", "Schweiz", "Zwitserland", "Svizzera", "Suíça", "スイス", "สวิตเซอร์แลนด์", "Schweiz", "Швейцария"],
  LU: ["Luxembourg", "Luxembourg", "Luxemburgo", "卢森堡", "لوكسمبورغ", "Luxemburg", "Luxemburg", "Lussemburgo", "Luxemburgo", "ルクセンブルク", "ลักเซมเบิร์ก", "Luxemburg", "Люксембург"],
  AT: ["Autriche", "Austria", "Austria", "奥地利", "النمسا", "Österreich", "Oostenrijk", "Austria", "Áustria", "オーストリア", "ออสเตรีย", "Österrike", "Австрия"],
  IE: ["Irlande", "Ireland", "Irlanda", "爱尔兰", "أيرلندا", "Irland", "Ierland", "Irlanda", "Irlanda", "アイルランド", "ไอร์แลนด์", "Irland", "Ирландия"],
  SE: ["Suède", "Sweden", "Suecia", "瑞典", "السويد", "Schweden", "Zweden", "Svezia", "Suécia", "スウェーデン", "สวีเดน", "Sverige", "Швеция"],
  DK: ["Danemark", "Denmark", "Dinamarca", "丹麦", "الدنمارك", "Dänemark", "Denemarken", "Danimarca", "Dinamarca", "デンマーク", "เดนมาร์ก", "Danmark", "Дания"],
  NO: ["Norvège", "Norway", "Noruega", "挪威", "النرويج", "Norwegen", "Noorwegen", "Norvegia", "Noruega", "ノルウェー", "นอร์เวย์", "Norge", "Норвегия"],
  FI: ["Finlande", "Finland", "Finlandia", "芬兰", "فنلندا", "Finnland", "Finland", "Finlandia", "Finlândia", "フィンランド", "ฟินแลนด์", "Finland", "Финляндия"],
  PL: ["Pologne", "Poland", "Polonia", "波兰", "بولندا", "Polen", "Polen", "Polonia", "Polônia", "ポーランド", "โปแลนด์", "Polen", "Польша"],
  MA: ["Maroc", "Morocco", "Marruecos", "摩洛哥", "المغرب", "Marokko", "Marokko", "Marocco", "Marrocos", "モロッコ", "โมร็อกโก", "Marocko", "Марокко"],
  TN: ["Tunisie", "Tunisia", "Túnez", "突尼斯", "تونس", "Tunesien", "Tunesië", "Tunisia", "Tunísia", "チュニジア", "ตูนิเซีย", "Tunisien", "Тунис"],
  DZ: ["Algérie", "Algeria", "Argelia", "阿尔及利亚", "الجزائر", "Algerien", "Algerije", "Algeria", "Argélia", "アルジェリア", "แอลจีเรีย", "Algeriet", "Алжир"],
  SN: ["Sénégal", "Senegal", "Senegal", "塞内加尔", "السنغال", "Senegal", "Senegal", "Senegal", "Senegal", "セネガル", "เซเนกัล", "Senegal", "Сенегал"],
  CI: ["Côte d'Ivoire", "Côte d'Ivoire", "Costa de Marfil", "科特迪瓦", "ساحل العاج", "Elfenbeinküste", "Ivoorkust", "Costa d'Avorio", "Costa do Marfim", "コートジボワール", "โกตดิวัวร์", "Elfenbenskusten", "Кот-д'Ивуар"],
  CM: ["Cameroun", "Cameroon", "Camerún", "喀麦隆", "الكاميرون", "Kamerun", "Kameroen", "Camerun", "Camarões", "カメルーン", "แคเมอรูน", "Kamerun", "Камерун"],
  CD: ["RD Congo", "DR Congo", "RD del Congo", "刚果（金）", "الكونغو الديمقراطية", "DR Kongo", "DR Congo", "RD del Congo", "RD Congo", "コンゴ民主共和国", "คองโก (กินชาซา)", "DR Kongo", "ДР Конго"],
  EG: ["Égypte", "Egypt", "Egipto", "埃及", "مصر", "Ägypten", "Egypte", "Egitto", "Egito", "エジプト", "อียิปต์", "Egypten", "Египет"],
  LB: ["Liban", "Lebanon", "Líbano", "黎巴嫩", "لبنان", "Libanon", "Libanon", "Libano", "Líbano", "レバノン", "เลบานอน", "Libanon", "Ливан"],
  AE: ["Émirats arabes unis", "United Arab Emirates", "Emiratos Árabes Unidos", "阿联酋", "الإمارات العربية المتحدة", "Vereinigte Arabische Emirate", "Verenigde Arabische Emiraten", "Emirati Arabi Uniti", "Emirados Árabes Unidos", "アラブ首長国連邦", "สหรัฐอาหรับเอมิเรตส์", "Förenade Arabemiraten", "ОАЭ"],
  SA: ["Arabie saoudite", "Saudi Arabia", "Arabia Saudí", "沙特阿拉伯", "السعودية", "Saudi-Arabien", "Saoedi-Arabië", "Arabia Saudita", "Arábia Saudita", "サウジアラビア", "ซาอุดีอาระเบีย", "Saudiarabien", "Саудовская Аравия"],
  TR: ["Turquie", "Türkiye", "Turquía", "土耳其", "تركيا", "Türkei", "Turkije", "Turchia", "Turquia", "トルコ", "ตุรกี", "Turkiet", "Турция"],
  US: ["États-Unis", "United States", "Estados Unidos", "美国", "الولايات المتحدة", "Vereinigte Staaten", "Verenigde Staten", "Stati Uniti", "Estados Unidos", "アメリカ合衆国", "สหรัฐอเมริกา", "USA", "США"],
  CA: ["Canada", "Canada", "Canadá", "加拿大", "كندا", "Kanada", "Canada", "Canada", "Canadá", "カナダ", "แคนาดา", "Kanada", "Канада"],
  MX: ["Mexique", "Mexico", "México", "墨西哥", "المكسيك", "Mexiko", "Mexico", "Messico", "México", "メキシコ", "เม็กซิโก", "Mexiko", "Мексика"],
  BR: ["Brésil", "Brazil", "Brasil", "巴西", "البرازيل", "Brasilien", "Brazilië", "Brasile", "Brasil", "ブラジル", "บราซิล", "Brasilien", "Бразилия"],
  AU: ["Australie", "Australia", "Australia", "澳大利亚", "أستراليا", "Australien", "Australië", "Australia", "Austrália", "オーストラリア", "ออสเตรเลีย", "Australien", "Австралия"],
  JP: ["Japon", "Japan", "Japón", "日本", "اليابان", "Japan", "Japan", "Giappone", "Japão", "日本", "ญี่ปุ่น", "Japan", "Япония"],
  IN: ["Inde", "India", "India", "印度", "الهند", "Indien", "India", "India", "Índia", "インド", "อินเดีย", "Indien", "Индия"],
  RU: ["Russie", "Russia", "Rusia", "俄罗斯", "روسيا", "Russland", "Rusland", "Russia", "Rússia", "ロシア", "รัสเซีย", "Ryssland", "Россия"],
  ZA: ["Afrique du Sud", "South Africa", "Sudáfrica", "南非", "جنوب أفريقيا", "Südafrika", "Zuid-Afrika", "Sudafrica", "África do Sul", "南アフリカ", "แอฟริกาใต้", "Sydafrika", "ЮАР"],
  NG: ["Nigeria", "Nigeria", "Nigeria", "尼日利亚", "نيجيريا", "Nigeria", "Nigeria", "Nigeria", "Nigéria", "ナイジェリア", "ไนจีเรีย", "Nigeria", "Нигерия"],
  KE: ["Kenya", "Kenya", "Kenia", "肯尼亚", "كينيا", "Kenia", "Kenia", "Kenya", "Quênia", "ケニア", "เคนยา", "Kenya", "Кения"],
  GP: ["Guadeloupe", "Guadeloupe", "Guadalupe", "瓜德罗普", "غوادلوب", "Guadeloupe", "Guadeloupe", "Guadalupa", "Guadalupe", "グアドループ", "กวาเดอลูป", "Guadeloupe", "Гваделупа"],
  MQ: ["Martinique", "Martinique", "Martinica", "马提尼克", "مارتينيك", "Martinique", "Martinique", "Martinica", "Martinica", "マルティニーク", "มาร์ตินีก", "Martinique", "Мартиника"],
  RE: ["La Réunion", "Réunion", "Reunión", "留尼汪", "لا ريونيون", "Réunion", "Réunion", "Riunione", "Reunião", "レユニオン", "เรอูนียง", "Réunion", "Реюньон"],
  GF: ["Guyane française", "French Guiana", "Guayana Francesa", "法属圭亚那", "غويانا الفرنسية", "Französisch-Guayana", "Frans-Guyana", "Guyana francese", "Guiana Francesa", "フランス領ギアナ", "เฟรนช์เกียนา", "Franska Guyana", "Французская Гвиана"],
  HT: ["Haïti", "Haiti", "Haití", "海地", "هايتي", "Haiti", "Haïti", "Haiti", "Haiti", "ハイチ", "เฮติ", "Haiti", "Гаити"],
};

/** Nom du pays `code` dans la langue `lang` ; `fallback` si le pays est inconnu. */
export function countryName(code, lang, fallback = '') {
  const row = NAMES[code];
  if (!row) return fallback || code;
  const i = ORDER.indexOf(lang);
  return row[i >= 0 ? i : 0] || row[0];
}
