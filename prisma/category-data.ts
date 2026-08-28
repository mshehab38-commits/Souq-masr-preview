export type AttributeType = "TEXT" | "NUMBER" | "SELECT" | "BOOLEAN";

export interface AttributeOption {
  value: string;
  labelAr: string;
  labelEn: string;
}

export interface CategoryAttributeSeed {
  key: string;
  labelAr: string;
  labelEn: string;
  type: AttributeType;
  options?: AttributeOption[];
  required?: boolean;
}

export type CommerceDefault = "ELIGIBLE" | "NOT_ELIGIBLE" | "ADMIN_REVIEW";

export interface CategorySeed {
  slug: string;
  nameAr: string;
  nameEn: string;
  icon: string;
  // Default checkout eligibility for listings in this category — never a
  // permanent lock, see modules/catalog/commerceEligibility.ts.
  commerceDefault: CommerceDefault;
  attributes: CategoryAttributeSeed[];
}

const condition = (): CategoryAttributeSeed => ({
  key: "condition",
  labelAr: "الحالة",
  labelEn: "Condition",
  type: "SELECT",
  options: [
    { value: "new", labelAr: "جديد", labelEn: "New" },
    { value: "used", labelAr: "مستعمل", labelEn: "Used" },
  ],
});

// The 16 category slugs identified in the existing prototype, now with a
// data-driven attribute schema per category instead of hardcoded frontend
// fields. Admins manage this list from Phase 9 onward.
export const categories: CategorySeed[] = [
  {
    slug: "realestate",
    nameAr: "عقارات",
    nameEn: "Real Estate",
    icon: "building",
    commerceDefault: "NOT_ELIGIBLE",
    attributes: [
      {
        key: "listing_purpose",
        labelAr: "الغرض",
        labelEn: "Purpose",
        type: "SELECT",
        required: true,
        options: [
          { value: "sale", labelAr: "بيع", labelEn: "For Sale" },
          { value: "rent", labelAr: "إيجار", labelEn: "For Rent" },
        ],
      },
      {
        key: "property_type",
        labelAr: "نوع العقار",
        labelEn: "Property Type",
        type: "SELECT",
        required: true,
        options: [
          { value: "apartment", labelAr: "شقة", labelEn: "Apartment" },
          { value: "villa", labelAr: "فيلا", labelEn: "Villa" },
          { value: "land", labelAr: "أرض", labelEn: "Land" },
          { value: "shop", labelAr: "محل تجاري", labelEn: "Shop" },
          { value: "office", labelAr: "مكتب", labelEn: "Office" },
          { value: "chalet", labelAr: "شاليه", labelEn: "Chalet" },
        ],
      },
      { key: "area_sqm", labelAr: "المساحة (م²)", labelEn: "Area (sqm)", type: "NUMBER", required: true },
      { key: "bedrooms", labelAr: "عدد الغرف", labelEn: "Bedrooms", type: "NUMBER" },
      { key: "bathrooms", labelAr: "عدد الحمامات", labelEn: "Bathrooms", type: "NUMBER" },
      {
        key: "finishing",
        labelAr: "التشطيب",
        labelEn: "Finishing",
        type: "SELECT",
        options: [
          { value: "finished", labelAr: "تشطيب كامل", labelEn: "Finished" },
          { value: "semi_finished", labelAr: "نصف تشطيب", labelEn: "Semi-finished" },
          { value: "core_and_shell", labelAr: "على المصنع", labelEn: "Core & Shell" },
        ],
      },
    ],
  },
  {
    slug: "cars",
    nameAr: "سيارات",
    nameEn: "Cars",
    icon: "car",
    commerceDefault: "NOT_ELIGIBLE",
    attributes: [
      { key: "brand", labelAr: "الماركة", labelEn: "Brand", type: "TEXT", required: true },
      { key: "model", labelAr: "الموديل", labelEn: "Model", type: "TEXT", required: true },
      { key: "year", labelAr: "سنة الصنع", labelEn: "Year", type: "NUMBER", required: true },
      { key: "km", labelAr: "الكيلومترات", labelEn: "Kilometers", type: "NUMBER", required: true },
      {
        key: "transmission",
        labelAr: "ناقل الحركة",
        labelEn: "Transmission",
        type: "SELECT",
        options: [
          { value: "automatic", labelAr: "أوتوماتيك", labelEn: "Automatic" },
          { value: "manual", labelAr: "مانيوال", labelEn: "Manual" },
        ],
      },
      {
        key: "fuel_type",
        labelAr: "نوع الوقود",
        labelEn: "Fuel Type",
        type: "SELECT",
        options: [
          { value: "gasoline", labelAr: "بنزين", labelEn: "Gasoline" },
          { value: "diesel", labelAr: "ديزل", labelEn: "Diesel" },
          { value: "electric", labelAr: "كهرباء", labelEn: "Electric" },
          { value: "hybrid", labelAr: "هايبرد", labelEn: "Hybrid" },
        ],
      },
      condition(),
    ],
  },
  {
    slug: "motorcycles",
    nameAr: "دراجات نارية",
    nameEn: "Motorcycles",
    icon: "motorcycle",
    commerceDefault: "NOT_ELIGIBLE",
    attributes: [
      { key: "brand", labelAr: "الماركة", labelEn: "Brand", type: "TEXT", required: true },
      { key: "model", labelAr: "الموديل", labelEn: "Model", type: "TEXT" },
      { key: "year", labelAr: "سنة الصنع", labelEn: "Year", type: "NUMBER" },
      { key: "km", labelAr: "الكيلومترات", labelEn: "Kilometers", type: "NUMBER" },
      condition(),
    ],
  },
  {
    slug: "mobiles",
    nameAr: "موبايلات",
    nameEn: "Mobile Phones",
    icon: "smartphone",
    commerceDefault: "ELIGIBLE",
    attributes: [
      { key: "brand", labelAr: "الماركة", labelEn: "Brand", type: "TEXT", required: true },
      { key: "model", labelAr: "الموديل", labelEn: "Model", type: "TEXT", required: true },
      { key: "storage_gb", labelAr: "سعة التخزين (جيجا)", labelEn: "Storage (GB)", type: "NUMBER" },
      condition(),
      { key: "warranty", labelAr: "يوجد ضمان", labelEn: "Under Warranty", type: "BOOLEAN" },
    ],
  },
  {
    slug: "electronics",
    nameAr: "إلكترونيات",
    nameEn: "Electronics",
    icon: "cpu",
    commerceDefault: "ELIGIBLE",
    attributes: [
      { key: "brand", labelAr: "الماركة", labelEn: "Brand", type: "TEXT" },
      { key: "product_type", labelAr: "نوع المنتج", labelEn: "Product Type", type: "TEXT", required: true },
      condition(),
      { key: "warranty", labelAr: "يوجد ضمان", labelEn: "Under Warranty", type: "BOOLEAN" },
    ],
  },
  {
    slug: "appliances",
    nameAr: "أجهزة منزلية",
    nameEn: "Home Appliances",
    icon: "washing-machine",
    commerceDefault: "ELIGIBLE",
    attributes: [
      { key: "brand", labelAr: "الماركة", labelEn: "Brand", type: "TEXT" },
      condition(),
      { key: "warranty", labelAr: "يوجد ضمان", labelEn: "Under Warranty", type: "BOOLEAN" },
    ],
  },
  {
    slug: "furniture",
    nameAr: "أثاث",
    nameEn: "Furniture",
    icon: "armchair",
    commerceDefault: "ELIGIBLE",
    attributes: [
      { key: "material", labelAr: "الخامة", labelEn: "Material", type: "TEXT" },
      condition(),
    ],
  },
  {
    slug: "jobs",
    nameAr: "وظائف",
    nameEn: "Jobs",
    icon: "briefcase",
    commerceDefault: "NOT_ELIGIBLE",
    attributes: [
      {
        key: "job_type",
        labelAr: "نوع الوظيفة",
        labelEn: "Job Type",
        type: "SELECT",
        required: true,
        options: [
          { value: "full_time", labelAr: "دوام كامل", labelEn: "Full-time" },
          { value: "part_time", labelAr: "دوام جزئي", labelEn: "Part-time" },
          { value: "remote", labelAr: "عن بعد", labelEn: "Remote" },
          { value: "freelance", labelAr: "مستقل", labelEn: "Freelance" },
        ],
      },
      { key: "experience_years", labelAr: "سنوات الخبرة", labelEn: "Years of Experience", type: "NUMBER" },
      { key: "salary_min", labelAr: "الحد الأدنى للراتب", labelEn: "Minimum Salary", type: "NUMBER" },
      { key: "salary_max", labelAr: "الحد الأقصى للراتب", labelEn: "Maximum Salary", type: "NUMBER" },
    ],
  },
  {
    slug: "services",
    nameAr: "خدمات",
    nameEn: "Services",
    icon: "wrench",
    commerceDefault: "NOT_ELIGIBLE",
    attributes: [
      { key: "service_type", labelAr: "نوع الخدمة", labelEn: "Service Type", type: "TEXT", required: true },
      { key: "experience_years", labelAr: "سنوات الخبرة", labelEn: "Years of Experience", type: "NUMBER" },
    ],
  },
  {
    slug: "construction",
    nameAr: "مقاولات وبناء",
    nameEn: "Construction & Contracting",
    icon: "hard-hat",
    commerceDefault: "NOT_ELIGIBLE",
    attributes: [
      { key: "service_type", labelAr: "نوع الخدمة", labelEn: "Service Type", type: "TEXT", required: true },
      { key: "experience_years", labelAr: "سنوات الخبرة", labelEn: "Years of Experience", type: "NUMBER" },
    ],
  },
  {
    slug: "materials",
    nameAr: "مواد بناء",
    nameEn: "Building Materials",
    icon: "bricks",
    commerceDefault: "ELIGIBLE",
    attributes: [
      { key: "material_type", labelAr: "نوع المادة", labelEn: "Material Type", type: "TEXT", required: true },
      {
        key: "unit",
        labelAr: "وحدة القياس",
        labelEn: "Unit",
        type: "SELECT",
        options: [
          { value: "ton", labelAr: "طن", labelEn: "Ton" },
          { value: "meter", labelAr: "متر", labelEn: "Meter" },
          { value: "piece", labelAr: "قطعة", labelEn: "Piece" },
        ],
      },
      { key: "quantity_available", labelAr: "الكمية المتاحة", labelEn: "Quantity Available", type: "NUMBER" },
    ],
  },
  {
    slug: "heavy",
    nameAr: "معدات ثقيلة",
    nameEn: "Heavy Equipment",
    icon: "truck",
    commerceDefault: "NOT_ELIGIBLE",
    attributes: [
      { key: "equipment_type", labelAr: "نوع المعدة", labelEn: "Equipment Type", type: "TEXT", required: true },
      { key: "brand", labelAr: "الماركة", labelEn: "Brand", type: "TEXT" },
      { key: "year", labelAr: "سنة الصنع", labelEn: "Year", type: "NUMBER" },
      condition(),
    ],
  },
  {
    slug: "wholesale",
    nameAr: "جملة",
    nameEn: "Wholesale",
    icon: "package",
    commerceDefault: "ELIGIBLE",
    attributes: [
      { key: "product_type", labelAr: "نوع المنتج", labelEn: "Product Type", type: "TEXT", required: true },
      { key: "min_order_quantity", labelAr: "أقل كمية للطلب", labelEn: "Minimum Order Quantity", type: "NUMBER" },
    ],
  },
  {
    slug: "sports",
    nameAr: "رياضة",
    nameEn: "Sports",
    icon: "dumbbell",
    commerceDefault: "ELIGIBLE",
    attributes: [
      { key: "brand", labelAr: "الماركة", labelEn: "Brand", type: "TEXT" },
      condition(),
    ],
  },
  {
    slug: "games",
    nameAr: "ألعاب",
    nameEn: "Games",
    icon: "gamepad",
    commerceDefault: "ELIGIBLE",
    attributes: [
      {
        key: "platform",
        labelAr: "المنصة",
        labelEn: "Platform",
        type: "SELECT",
        options: [
          { value: "playstation", labelAr: "بلايستيشن", labelEn: "PlayStation" },
          { value: "xbox", labelAr: "إكس بوكس", labelEn: "Xbox" },
          { value: "pc", labelAr: "بي سي", labelEn: "PC" },
          { value: "nintendo", labelAr: "نينتندو", labelEn: "Nintendo" },
        ],
      },
      condition(),
    ],
  },
  {
    slug: "other",
    nameAr: "أخرى",
    nameEn: "Other",
    icon: "grid",
    commerceDefault: "NOT_ELIGIBLE",
    attributes: [condition()],
  },
];
