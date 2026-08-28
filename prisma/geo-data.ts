export interface CitySeed {
  slug: string;
  nameAr: string;
  nameEn: string;
}

export interface GovernorateSeed {
  slug: string;
  nameAr: string;
  nameEn: string;
  cities: CitySeed[];
}

// All 27 governorates of Egypt, each with a representative set of major
// cities/districts. The previous prototype only covered 10 (Greater
// Cairo/Delta) — this seed closes that gap nationwide.
export const governorates: GovernorateSeed[] = [
  {
    slug: "cairo",
    nameAr: "القاهرة",
    nameEn: "Cairo",
    cities: [
      { slug: "nasr-city", nameAr: "مدينة نصر", nameEn: "Nasr City" },
      { slug: "maadi", nameAr: "المعادي", nameEn: "Maadi" },
      { slug: "heliopolis", nameAr: "مصر الجديدة", nameEn: "Heliopolis" },
      { slug: "fifth-settlement", nameAr: "التجمع الخامس", nameEn: "Fifth Settlement" },
      { slug: "downtown-cairo", nameAr: "وسط البلد", nameEn: "Downtown Cairo" },
      { slug: "helwan", nameAr: "حلوان", nameEn: "Helwan" },
      { slug: "shubra", nameAr: "شبرا", nameEn: "Shubra" },
    ],
  },
  {
    slug: "giza",
    nameAr: "الجيزة",
    nameEn: "Giza",
    cities: [
      { slug: "dokki", nameAr: "الدقي", nameEn: "Dokki" },
      { slug: "mohandessin", nameAr: "المهندسين", nameEn: "Mohandessin" },
      { slug: "sixth-of-october", nameAr: "6 أكتوبر", nameEn: "6th of October" },
      { slug: "sheikh-zayed", nameAr: "الشيخ زايد", nameEn: "Sheikh Zayed" },
      { slug: "haram", nameAr: "الهرم", nameEn: "Haram" },
      { slug: "faisal", nameAr: "فيصل", nameEn: "Faisal" },
    ],
  },
  {
    slug: "alexandria",
    nameAr: "الإسكندرية",
    nameEn: "Alexandria",
    cities: [
      { slug: "miami", nameAr: "ميامي", nameEn: "Miami" },
      { slug: "smouha", nameAr: "سموحة", nameEn: "Smouha" },
      { slug: "sidi-gaber", nameAr: "سيدي جابر", nameEn: "Sidi Gaber" },
      { slug: "montaza", nameAr: "المنتزه", nameEn: "Montaza" },
      { slug: "agami", nameAr: "العجمي", nameEn: "Agami" },
      { slug: "borg-el-arab", nameAr: "برج العرب", nameEn: "Borg El Arab" },
    ],
  },
  {
    slug: "qalyubia",
    nameAr: "القليوبية",
    nameEn: "Qalyubia",
    cities: [
      { slug: "banha", nameAr: "بنها", nameEn: "Banha" },
      { slug: "shubra-el-kheima", nameAr: "شبرا الخيمة", nameEn: "Shubra El Kheima" },
      { slug: "qalyub", nameAr: "قليوب", nameEn: "Qalyub" },
      { slug: "khanka", nameAr: "الخانكة", nameEn: "Khanka" },
    ],
  },
  {
    slug: "port-said",
    nameAr: "بورسعيد",
    nameEn: "Port Said",
    cities: [
      { slug: "port-said-city", nameAr: "بورسعيد", nameEn: "Port Said City" },
      { slug: "port-fouad", nameAr: "بورفؤاد", nameEn: "Port Fouad" },
    ],
  },
  {
    slug: "suez",
    nameAr: "السويس",
    nameEn: "Suez",
    cities: [
      { slug: "suez-city", nameAr: "السويس", nameEn: "Suez City" },
      { slug: "ain-sokhna", nameAr: "العين السخنة", nameEn: "Ain Sokhna" },
    ],
  },
  {
    slug: "damietta",
    nameAr: "دمياط",
    nameEn: "Damietta",
    cities: [
      { slug: "damietta-city", nameAr: "دمياط", nameEn: "Damietta City" },
      { slug: "new-damietta", nameAr: "دمياط الجديدة", nameEn: "New Damietta" },
      { slug: "ras-el-bar", nameAr: "رأس البر", nameEn: "Ras El Bar" },
    ],
  },
  {
    slug: "dakahlia",
    nameAr: "الدقهلية",
    nameEn: "Dakahlia",
    cities: [
      { slug: "mansoura", nameAr: "المنصورة", nameEn: "Mansoura" },
      { slug: "talkha", nameAr: "طلخا", nameEn: "Talkha" },
      { slug: "mit-ghamr", nameAr: "ميت غمر", nameEn: "Mit Ghamr" },
    ],
  },
  {
    slug: "sharqia",
    nameAr: "الشرقية",
    nameEn: "Sharqia",
    cities: [
      { slug: "zagazig", nameAr: "الزقازيق", nameEn: "Zagazig" },
      { slug: "tenth-of-ramadan", nameAr: "العاشر من رمضان", nameEn: "10th of Ramadan" },
      { slug: "belbeis", nameAr: "بلبيس", nameEn: "Belbeis" },
    ],
  },
  {
    slug: "kafr-el-sheikh",
    nameAr: "كفر الشيخ",
    nameEn: "Kafr El Sheikh",
    cities: [
      { slug: "kafr-el-sheikh-city", nameAr: "كفر الشيخ", nameEn: "Kafr El Sheikh City" },
      { slug: "desouk", nameAr: "دسوق", nameEn: "Desouk" },
      { slug: "baltim", nameAr: "بلطيم", nameEn: "Baltim" },
    ],
  },
  {
    slug: "gharbia",
    nameAr: "الغربية",
    nameEn: "Gharbia",
    cities: [
      { slug: "tanta", nameAr: "طنطا", nameEn: "Tanta" },
      { slug: "el-mahalla-el-kubra", nameAr: "المحلة الكبرى", nameEn: "El Mahalla El Kubra" },
      { slug: "kafr-el-zayat", nameAr: "كفر الزيات", nameEn: "Kafr El Zayat" },
    ],
  },
  {
    slug: "monufia",
    nameAr: "المنوفية",
    nameEn: "Monufia",
    cities: [
      { slug: "shibin-el-kom", nameAr: "شبين الكوم", nameEn: "Shibin El Kom" },
      { slug: "sadat-city", nameAr: "مدينة السادات", nameEn: "Sadat City" },
      { slug: "menouf", nameAr: "منوف", nameEn: "Menouf" },
    ],
  },
  {
    slug: "beheira",
    nameAr: "البحيرة",
    nameEn: "Beheira",
    cities: [
      { slug: "damanhour", nameAr: "دمنهور", nameEn: "Damanhour" },
      { slug: "kafr-el-dawwar", nameAr: "كفر الدوار", nameEn: "Kafr El Dawwar" },
      { slug: "rashid", nameAr: "رشيد", nameEn: "Rashid" },
    ],
  },
  {
    slug: "ismailia",
    nameAr: "الإسماعيلية",
    nameEn: "Ismailia",
    cities: [
      { slug: "ismailia-city", nameAr: "الإسماعيلية", nameEn: "Ismailia City" },
      { slug: "fayed", nameAr: "فايد", nameEn: "Fayed" },
      { slug: "qantara", nameAr: "القنطرة", nameEn: "Qantara" },
    ],
  },
  {
    slug: "beni-suef",
    nameAr: "بني سويف",
    nameEn: "Beni Suef",
    cities: [
      { slug: "beni-suef-city", nameAr: "بني سويف", nameEn: "Beni Suef City" },
      { slug: "new-beni-suef", nameAr: "بني سويف الجديدة", nameEn: "New Beni Suef" },
    ],
  },
  {
    slug: "fayoum",
    nameAr: "الفيوم",
    nameEn: "Fayoum",
    cities: [
      { slug: "fayoum-city", nameAr: "الفيوم", nameEn: "Fayoum City" },
      { slug: "ibsheway", nameAr: "إبشواي", nameEn: "Ibsheway" },
    ],
  },
  {
    slug: "minya",
    nameAr: "المنيا",
    nameEn: "Minya",
    cities: [
      { slug: "minya-city", nameAr: "المنيا", nameEn: "Minya City" },
      { slug: "mallawi", nameAr: "ملوي", nameEn: "Mallawi" },
    ],
  },
  {
    slug: "assiut",
    nameAr: "أسيوط",
    nameEn: "Assiut",
    cities: [
      { slug: "assiut-city", nameAr: "أسيوط", nameEn: "Assiut City" },
      { slug: "dairut", nameAr: "ديروط", nameEn: "Dairut" },
    ],
  },
  {
    slug: "sohag",
    nameAr: "سوهاج",
    nameEn: "Sohag",
    cities: [
      { slug: "sohag-city", nameAr: "سوهاج", nameEn: "Sohag City" },
      { slug: "akhmim", nameAr: "أخميم", nameEn: "Akhmim" },
    ],
  },
  {
    slug: "qena",
    nameAr: "قنا",
    nameEn: "Qena",
    cities: [
      { slug: "qena-city", nameAr: "قنا", nameEn: "Qena City" },
      { slug: "nag-hammadi", nameAr: "نجع حمادي", nameEn: "Nag Hammadi" },
    ],
  },
  {
    slug: "aswan",
    nameAr: "أسوان",
    nameEn: "Aswan",
    cities: [
      { slug: "aswan-city", nameAr: "أسوان", nameEn: "Aswan City" },
      { slug: "kom-ombo", nameAr: "كوم أمبو", nameEn: "Kom Ombo" },
    ],
  },
  {
    slug: "luxor",
    nameAr: "الأقصر",
    nameEn: "Luxor",
    cities: [
      { slug: "luxor-city", nameAr: "الأقصر", nameEn: "Luxor City" },
      { slug: "armant", nameAr: "أرمنت", nameEn: "Armant" },
    ],
  },
  {
    slug: "red-sea",
    nameAr: "البحر الأحمر",
    nameEn: "Red Sea",
    cities: [
      { slug: "hurghada", nameAr: "الغردقة", nameEn: "Hurghada" },
      { slug: "marsa-alam", nameAr: "مرسى علم", nameEn: "Marsa Alam" },
      { slug: "safaga", nameAr: "سفاجا", nameEn: "Safaga" },
    ],
  },
  {
    slug: "new-valley",
    nameAr: "الوادي الجديد",
    nameEn: "New Valley",
    cities: [
      { slug: "kharga", nameAr: "الخارجة", nameEn: "Kharga" },
      { slug: "dakhla", nameAr: "الداخلة", nameEn: "Dakhla" },
    ],
  },
  {
    slug: "matrouh",
    nameAr: "مطروح",
    nameEn: "Matrouh",
    cities: [
      { slug: "marsa-matrouh", nameAr: "مرسى مطروح", nameEn: "Marsa Matrouh" },
      { slug: "sallum", nameAr: "السلوم", nameEn: "Sallum" },
      { slug: "sidi-abdel-rahman", nameAr: "سيدي عبد الرحمن", nameEn: "Sidi Abdel Rahman" },
    ],
  },
  {
    slug: "north-sinai",
    nameAr: "شمال سيناء",
    nameEn: "North Sinai",
    cities: [
      { slug: "arish", nameAr: "العريش", nameEn: "Arish" },
      { slug: "sheikh-zuweid", nameAr: "الشيخ زويد", nameEn: "Sheikh Zuweid" },
    ],
  },
  {
    slug: "south-sinai",
    nameAr: "جنوب سيناء",
    nameEn: "South Sinai",
    cities: [
      { slug: "sharm-el-sheikh", nameAr: "شرم الشيخ", nameEn: "Sharm El Sheikh" },
      { slug: "dahab", nameAr: "دهب", nameEn: "Dahab" },
      { slug: "nuweiba", nameAr: "نويبع", nameEn: "Nuweiba" },
      { slug: "saint-catherine", nameAr: "سانت كاترين", nameEn: "Saint Catherine" },
    ],
  },
];
