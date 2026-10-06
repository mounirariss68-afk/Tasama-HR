/**
 * Synthetic names, with Arabic forms, for a Saudi workforce (Saudi nationals plus the usual expatriate mix).
 *
 * Deliberately excludes the names of the published executives of the client companies, so no synthetic record can be mistaken for a real person.
 */
export type NamePart = [en: string, ar: string];

export const SAUDI_MALE: NamePart[] = [
  ['Abdulaziz', 'عبدالعزيز'], ['Faisal', 'فيصل'], ['Turki', 'تركي'], ['Saud', 'سعود'], ['Fahad', 'فهد'],
  ['Nawaf', 'نواف'], ['Bandar', 'بندر'], ['Majed', 'ماجد'], ['Khalid', 'خالد'], ['Abdullah', 'عبدالله'],
  ['Mohammed', 'محمد'], ['Sultan', 'سلطان'], ['Yazeed', 'يزيد'], ['Meshal', 'مشعل'], ['Rakan', 'راكان'],
  ['Saad', 'سعد'], ['Omar', 'عمر'], ['Ibrahim', 'إبراهيم'], ['Hamad', 'حمد'], ['Nasser', 'ناصر'],
  ['Abdulrahman', 'عبدالرحمن'], ['Talal', 'طلال'], ['Mansour', 'منصور'], ['Ziyad', 'زياد'], ['Waleed', 'وليد'],
  ['Osama', 'أسامة'], ['Badr', 'بدر'], ['Hussam', 'حسام'], ['Anas', 'أنس'], ['Mishari', 'مشاري'],
];
export const SAUDI_FEMALE: NamePart[] = [
  ['Noura', 'نورة'], ['Reem', 'ريم'], ['Lama', 'لمى'], ['Sara', 'سارة'], ['Hessa', 'حصة'],
  ['Alanoud', 'العنود'], ['Latifa', 'لطيفة'], ['Shahad', 'شهد'], ['Ghadah', 'غادة'], ['Maha', 'مها'],
  ['Haifa', 'هيفاء'], ['Abeer', 'عبير'], ['Dalia', 'داليا'], ['Rawan', 'روان'], ['Amal', 'أمل'],
  ['Munira', 'منيرة'], ['Lulwa', 'لولوة'], ['Joud', 'جود'], ['Aljawhara', 'الجوهرة'], ['Deema', 'ديمة'],
  ['Wejdan', 'وجدان'], ['Nouf', 'نوف'], ['Areej', 'أريج'], ['Bayan', 'بيان'], ['Hind', 'هند'],
];
export const SAUDI_FAMILY: NamePart[] = [
  ['Al Otaibi', 'العتيبي'], ['Al Qahtani', 'القحطاني'], ['Al Harbi', 'الحربي'], ['Al Dossary', 'الدوسري'],
  ['Al Shammari', 'الشمري'], ['Al Ghamdi', 'الغامدي'], ['Al Zahrani', 'الزهراني'], ['Al Mutairi', 'المطيري'],
  ['Al Anazi', 'العنزي'], ['Al Subaie', 'السبيعي'], ['Al Shehri', 'الشهري'], ['Al Malki', 'المالكي'],
  ['Al Juhani', 'الجهني'], ['Al Rashidi', 'الرشيدي'], ['Al Saud', 'آل سعود'], ['Al Sheikh', 'آل الشيخ'],
  ['Al Sudairi', 'السديري'], ['Al Tamimi', 'التميمي'], ['Al Yami', 'اليامي'], ['Al Asmari', 'الأسمري'],
  ['Al Rasheed', 'الرشيد'], ['Al Fahad', 'الفهد'], ['Al Muqbel', 'المقبل'], ['Al Nasser', 'الناصر'],
  ['Al Khaldi', 'الخالدي'], ['Al Bishi', 'البيشي'], ['Al Maliki', 'المالكي'], ['Al Qurashi', 'القرشي'],
];

export const ARAB_MALE: NamePart[] = [
  ['Tarek', 'طارق'], ['Karim', 'كريم'], ['Ziad', 'زياد'], ['Rami', 'رامي'], ['Hani', 'هاني'],
  ['Walid', 'وليد'], ['Sami', 'سامي'], ['Nabil', 'نبيل'], ['Fadi', 'فادي'], ['Bassel', 'باسل'],
  ['Mahmoud', 'محمود'], ['Mostafa', 'مصطفى'], ['Amr', 'عمرو'], ['Hazem', 'حازم'],
];
export const ARAB_FEMALE: NamePart[] = [
  ['Rania', 'رانيا'], ['Lina', 'لينا'], ['Dina', 'دينا'], ['Nour', 'نور'], ['Yasmin', 'ياسمين'],
  ['Hala', 'هالة'], ['Rasha', 'رشا'], ['Mai', 'مي'], ['Salma', 'سلمى'], ['Farah', 'فرح'], ['Ghada', 'غادة'],
];
export const ARAB_FAMILY: Record<string, NamePart[]> = {
  EG: [['Mansour', 'منصور'], ['El Sayed', 'السيد'], ['Fahmy', 'فهمي'], ['Ibrahim', 'إبراهيم'], ['Shawky', 'شوقي'], ['Abdelaziz', 'عبدالعزيز']],
  JO: [['Haddad', 'حداد'], ['Khoury', 'خوري'], ['Nasser', 'ناصر'], ['Odeh', 'عودة'], ['Masri', 'المصري']],
  LB: [['Haddad', 'حداد'], ['Khalil', 'خليل'], ['Saab', 'صعب'], ['Gemayel', 'جميل'], ['Aoun', 'عون'], ['Karam', 'كرم']],
  SY: [['Al Halabi', 'الحلبي'], ['Darwish', 'درويش'], ['Kanaan', 'كنعان'], ['Sabbagh', 'صباغ']],
  SD: [['Osman', 'عثمان'], ['Elamin', 'الأمين'], ['Abdelrahim', 'عبدالرحيم'], ['Babiker', 'بابكر']],
  YE: [['Al Hadrami', 'الحضرمي'], ['Ba Wazir', 'باوزير'], ['Al Amoudi', 'العمودي']],
};

export const SOUTH_ASIAN_MALE: NamePart[] = [
  ['Arjun', 'أرجون'], ['Rahul', 'راهول'], ['Sanjay', 'سانجاي'], ['Vikram', 'فيكرام'], ['Anil', 'أنيل'],
  ['Suresh', 'سوريش'], ['Imran', 'عمران'], ['Faisal', 'فيصل'], ['Bilal', 'بلال'], ['Asad', 'أسد'],
  ['Rohan', 'روهان'], ['Nikhil', 'نيخيل'], ['Kashif', 'كاشف'], ['Ravi', 'رافي'],
];
export const SOUTH_ASIAN_FEMALE: NamePart[] = [
  ['Priya', 'بريا'], ['Anjali', 'أنجالي'], ['Divya', 'ديفيا'], ['Sana', 'سناء'], ['Ayesha', 'عائشة'],
  ['Meera', 'ميرا'], ['Kavya', 'كافيا'], ['Zainab', 'زينب'], ['Neha', 'نيها'],
];
export const SOUTH_ASIAN_FAMILY: Record<string, NamePart[]> = {
  IN: [['Menon', 'مينون'], ['Pillai', 'بيلاي'], ['Nair', 'ناير'], ['Sharma', 'شارما'], ['Iyer', 'أيير'], ['Kapoor', 'كابور'], ['Thomas', 'توماس'], ['DSouza', 'ديسوزا'], ['Reddy', 'ريدي']],
  PK: [['Khan', 'خان'], ['Qureshi', 'قريشي'], ['Siddiqui', 'صديقي'], ['Malik', 'مالك'], ['Hussain', 'حسين']],
  BD: [['Rahman', 'رحمن'], ['Hossain', 'حسين'], ['Chowdhury', 'تشودري']],
};

export const OTHER: Record<string, { male: NamePart[]; female: NamePart[]; family: NamePart[] }> = {
  PH: {
    male: [['Jose', 'خوسيه'], ['Mark', 'مارك'], ['Paolo', 'باولو']],
    female: [['Maria', 'ماريا'], ['Grace', 'جريس'], ['Joy', 'جوي'], ['Angela', 'أنجيلا']],
    family: [['Santos', 'سانتوس'], ['Reyes', 'رييس'], ['Cruz', 'كروز'], ['Bautista', 'باوتيستا']],
  },
  GB: {
    male: [['James', 'جيمس'], ['Oliver', 'أوليفر'], ['Daniel', 'دانيال']],
    female: [['Emma', 'إيما'], ['Sophie', 'صوفي'], ['Claire', 'كلير']],
    family: [['Harrison', 'هاريسون'], ['Clarke', 'كلارك'], ['Bennett', 'بينيت'], ['Walsh', 'والش']],
  },
};

/** Nationality weights for the non-Saudi share of a client workforce. Synthetic. */
export const EXPAT_MIX: [string, number][] = [
  ['EG', 18], ['IN', 16], ['JO', 9], ['PK', 8], ['LB', 6], ['SY', 5], ['PH', 9], ['GB', 7], ['SD', 5], ['YE', 4], ['BD', 4],
];
export const nationalityMix = (saudiShare: number): [string, number][] => {
  const total = EXPAT_MIX.reduce((a, [, w]) => a + w, 0);
  return [['SA', Math.round(saudiShare * 1000)], ...EXPAT_MIX.map(([n, w]) => [n, Math.round((1 - saudiShare) * 1000 * w / total)] as [string, number])];
};

export const NATIONALITY_NAME: Record<string, [string, string]> = {
  SA: ['Saudi', 'سعودي'], IN: ['Indian', 'هندي'], PK: ['Pakistani', 'باكستاني'], EG: ['Egyptian', 'مصري'],
  JO: ['Jordanian', 'أردني'], LB: ['Lebanese', 'لبناني'], SY: ['Syrian', 'سوري'], PH: ['Filipino', 'فلبيني'],
  GB: ['British', 'بريطاني'], SD: ['Sudanese', 'سوداني'], YE: ['Yemeni', 'يمني'], BD: ['Bangladeshi', 'بنغلاديشي'],
};

export const BANKS = ['Al Rajhi Bank', 'Saudi National Bank', 'Riyad Bank', 'Alinma Bank', 'Bank Albilad', 'Banque Saudi Fransi', 'Saudi Awwal Bank'];
