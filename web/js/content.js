// المحتوى: أجهزة التصوير + إرشادات FDA المنشورة (مع روابط المصادر)، بالإنكليزي والعربي
// ملاحظة: هذا تطبيق مستقل، مو تابع للـ FDA ولا معتمد منها. الإرشادات ملخصة من صفحات FDA العامة.

export const DEVICES = [
  {
    id: 'ffdm', shape: 'mammo', short: 'FFDM',
    tag: { en: 'X-ray · 2D', ar: 'أشعة سينية · ثنائي الأبعاد' },
    name: { en: 'Digital Mammography', ar: 'الماموغرام الرقمي' },
    what: {
      en: 'A low-dose X-ray of the breast captured on a digital detector. Each breast is usually imaged in two views: craniocaudal (CC, top to bottom) and mediolateral oblique (MLO, angled from the side).',
      ar: 'صورة أشعة سينية منخفضة الجرعة للثدي تُلتقط على كاشف رقمي. يُصوَّر كل ثدي عادةً بوضعيتين: من الأعلى إلى الأسفل (CC)، ومائلة من الجانب (MLO).',
    },
    use: {
      en: 'The standard screening and diagnostic exam. This is the image type the AI in this app analyzes.',
      ar: 'الفحص المعياري للكشف والتشخيص، وهو نوع الصور الذي يحلّله الذكاء الاصطناعي في هذا التطبيق.',
    },
    parts: {
      en: ['X-ray tube head', 'Compression paddle', 'Digital detector', 'Rotating C-arm'],
      ar: ['رأس أنبوب الأشعة', 'لوح الضغط', 'الكاشف الرقمي', 'الذراع الدوّار'],
    },
    fda: {
      en: 'Every U.S. mammography facility must be accredited and certified under the Mammography Quality Standards Act (MQSA) and inspected every year.',
      ar: 'يجب أن يكون كل مركز ماموغرام في الولايات المتحدة معتمدًا ومرخّصًا وفق قانون معايير جودة الماموغرام (MQSA)، وأن يخضع للتفتيش سنويًا.',
    },
    src: 'https://www.fda.gov/radiation-emitting-products/mammography-quality-standards-act-mqsa-and-mqsa-program',
  },
  {
    id: 'dbt', shape: 'dbt', short: 'DBT · 3D',
    tag: { en: 'X-ray · 3D', ar: 'أشعة سينية · ثلاثي الأبعاد' },
    name: { en: 'Digital Breast Tomosynthesis', ar: 'التصوير المقطعي للثدي (توموسينثيسس)' },
    what: {
      en: 'The X-ray tube sweeps across an arc and takes several low-dose images from different angles. A computer rebuilds them into thin cross-sectional slices of the breast.',
      ar: 'يتحرك أنبوب الأشعة على قوس ويلتقط عدة صور منخفضة الجرعة من زوايا مختلفة، ثم يعيد الحاسوب بناءها إلى شرائح مقطعية رقيقة للثدي.',
    },
    use: {
      en: 'Screening and diagnosis. Slices reduce tissue overlap, which can help when breast tissue is dense.',
      ar: 'للكشف والتشخيص. تقلّل الشرائح من تراكب النسيج، ما قد يساعد عندما يكون نسيج الثدي كثيفًا.',
    },
    parts: {
      en: ['Tube moving on an arc', 'Multiple projection angles', 'Slice reconstruction'],
      ar: ['أنبوب يتحرك على قوس', 'زوايا تصوير متعددة', 'إعادة بناء الشرائح'],
    },
    fda: {
      en: 'FDA approved DBT for breast cancer screening in 2011. Systems include the Hologic Selenia Dimensions, GE SenoClaire and Siemens MAMMOMAT Inspiration.',
      ar: 'وافقت FDA على التصوير المقطعي للكشف عن سرطان الثدي عام 2011. من أنظمته: Hologic Selenia Dimensions وGE SenoClaire وSiemens MAMMOMAT Inspiration.',
    },
    src: 'https://www.fda.gov/consumers/consumer-updates/mammography-what-you-need-know',
  },
  {
    id: 'cem', shape: 'cem', short: 'CEM',
    tag: { en: 'X-ray · Contrast', ar: 'أشعة سينية · صبغة' },
    name: { en: 'Contrast-Enhanced Mammography', ar: 'الماموغرام بالصبغة' },
    what: {
      en: 'An iodine contrast agent is injected into a vein before the mammogram. Cancers often grow extra, leaky blood vessels, so they take up contrast and stand out.',
      ar: 'تُحقن صبغة يودية في الوريد قبل التصوير. كثيرًا ما تُكوّن الأورام السرطانية أوعية دموية إضافية نافذة، فتمتص الصبغة وتظهر بوضوح.',
    },
    use: {
      en: 'Problem-solving after an unclear mammogram, and an option for some patients who cannot have MRI.',
      ar: 'لتوضيح نتيجة ماموغرام غير حاسمة، وخيار لبعض المريضات اللواتي لا يمكنهن إجراء الرنين المغناطيسي.',
    },
    parts: {
      en: ['Iodinated contrast', 'Dual-energy exposures', 'Vascular map'],
      ar: ['صبغة يودية', 'تصوير بطاقتين', 'خريطة الأوعية'],
    },
    fda: {
      en: 'FDA-approved exam that, like MRI, depicts cancers through increased and leaky blood vessels.',
      ar: 'فحص معتمد من FDA يُظهر الأورام، كالرنين المغناطيسي، عبر الأوعية الدموية المتزايدة والنافذة.',
    },
    src: 'https://www.fda.gov/consumers/consumer-updates/mammography-what-you-need-know',
  },
  {
    id: 'us', shape: 'ultrasound', short: 'US',
    tag: { en: 'Sound waves', ar: 'موجات صوتية' },
    name: { en: 'Breast Ultrasound', ar: 'السونار (الموجات فوق الصوتية) للثدي' },
    what: {
      en: 'A handheld probe sends high-frequency sound waves into the breast and builds an image from the echoes. No radiation is used.',
      ar: 'مجسّ يدوي يرسل موجات صوتية عالية التردد داخل الثدي ويكوّن صورة من صداها، من دون أي إشعاع.',
    },
    use: {
      en: 'Checking a lump or a mammogram finding, telling cysts from solid masses, guiding biopsies, and as a supplemental test for dense breasts.',
      ar: 'لفحص كتلة أو علامة ظهرت في الماموغرام، والتمييز بين الأكياس والكتل الصلبة، وتوجيه الخزعات، وكفحص مكمّل للثدي الكثيف.',
    },
    parts: {
      en: ['Transducer probe', 'Sound-wave fan', 'Real-time imaging'],
      ar: ['المجسّ', 'مروحة الموجات الصوتية', 'تصوير لحظي'],
    },
    fda: {
      en: 'FDA notes that for some people with dense breast tissue, imaging tests in addition to a mammogram may help find cancers.',
      ar: 'تشير FDA إلى أن فحوصات تصوير إضافية إلى جانب الماموغرام قد تساعد في كشف السرطان لدى بعض ذوات النسيج الكثيف.',
    },
    src: 'https://www.fda.gov/consumers/womens-health-topics/understanding-breast-density',
  },
  {
    id: 'mri', shape: 'mri', short: 'MRI',
    tag: { en: 'Magnetic field', ar: 'مجال مغناطيسي' },
    name: { en: 'Breast MRI', ar: 'الرنين المغناطيسي للثدي' },
    what: {
      en: 'A strong magnet and radio waves create detailed images, usually with a gadolinium contrast agent. The patient lies face down with the breasts in a dedicated coil.',
      ar: 'مغناطيس قوي وموجات راديوية تكوّن صورًا مفصّلة، غالبًا مع صبغة الغادولينيوم. تستلقي المريضة على بطنها ويوضع الثديان في ملف مخصّص.',
    },
    use: {
      en: 'Screening for people at high risk, measuring the extent of a known cancer, and checking silicone breast implants for rupture.',
      ar: 'للكشف لدى ذوات الخطورة العالية، وتحديد امتداد سرطان مُشخّص، وفحص حشوات السيليكون بحثًا عن تمزّق.',
    },
    parts: {
      en: ['Superconducting magnet', 'Breast coil', 'Contrast injection'],
      ar: ['مغناطيس فائق التوصيل', 'ملف الثدي', 'حقن الصبغة'],
    },
    fda: {
      en: 'For silicone gel implants without symptoms, FDA recommends rupture screening by ultrasound or MRI starting 5 to 6 years after surgery, then every 2 to 3 years. MRI is the most effective way to find a silent rupture.',
      ar: 'لحشوات جل السيليكون من دون أعراض، توصي FDA بالكشف عن التمزّق بالسونار أو الرنين بدءًا من 5 إلى 6 سنوات بعد العملية، ثم كل سنتين إلى ثلاث. والرنين هو الأكثر فعالية في كشف التمزّق الصامت.',
    },
    src: 'https://www.fda.gov/medical-devices/breast-implants/risks-and-complications-breast-implants',
  },
  {
    id: 'ai', shape: 'ai', short: 'CAD / AI',
    tag: { en: 'Software', ar: 'برمجيات' },
    name: { en: 'AI Detection Software', ar: 'برمجيات الكشف بالذكاء الاصطناعي' },
    what: {
      en: 'Algorithms that analyze mammograms or DBT images and mark suspicious areas or score each case for the radiologist.',
      ar: 'خوارزميات تحلّل صور الماموغرام أو التصوير المقطعي، وتحدّد المناطق المشبوهة أو تعطي كل حالة درجة لطبيب الأشعة.',
    },
    use: {
      en: 'A second reader that supports, never replaces, the radiologist.',
      ar: 'قارئ ثانٍ يدعم طبيب الأشعة ولا يحلّ محله.',
    },
    parts: {
      en: ['Deep neural network', 'Case score', 'Region marks'],
      ar: ['شبكة عصبية عميقة', 'درجة الحالة', 'تحديد المناطق'],
    },
    fda: {
      en: 'FDA has cleared several AI tools for mammography and DBT. The model in this app is a research prototype and is NOT FDA-cleared.',
      ar: 'أجازت FDA عدة أدوات ذكاء اصطناعي للماموغرام والتصوير المقطعي. أما النموذج في هذا التطبيق فنموذج بحثي أولي و«غير» مُجاز من FDA.',
    },
    src: 'https://www.fda.gov/consumers/consumer-updates/mammography-what-you-need-know',
  },
];

// الإرشادات مرتبة حسب مراحل الفحص (الترتيب هنا حقيقي: قبل ← أثناء ← بعد)
export const GUIDANCE = [
  {
    phase: { en: 'Before the exam', ar: 'قبل الفحص' },
    items: [
      {
        title: { en: 'Choose an FDA-certified facility', ar: 'اختاري مركزًا معتمدًا من FDA' },
        body: {
          en: 'Only facilities with a valid MQSA certificate can legally perform mammography. Search certified facilities by ZIP code, and look for the certificate displayed at the facility. Every certificate has an expiration date.',
          ar: 'لا يحق قانونًا إجراء الماموغرام إلا للمراكز الحاصلة على شهادة MQSA سارية. ابحثي عن المراكز المعتمدة بالرمز البريدي، وتأكّدي من الشهادة المعلّقة في المركز، فلكل شهادة تاريخ انتهاء.',
        },
        src: 'https://www.fda.gov/radiation-emitting-products/mammography-information-patients/search-certified-facility',
        label: 'FDA · Search for a Certified Facility',
      },
      {
        title: { en: 'Bring your previous mammograms', ar: 'أحضري صور الماموغرام السابقة' },
        body: {
          en: 'Bring prior mammograms or have them sent to the new facility. The radiologist compares new images with old ones to look for changes.',
          ar: 'أحضري صورك السابقة أو اطلبي إرسالها إلى المركز الجديد، فطبيب الأشعة يقارن الصور الجديدة بالقديمة ليرصد أي تغيّر.',
        },
        src: 'https://www.fda.gov/radiation-emitting-products/mammography-quality-standards-act-mqsa-and-mqsa-program/mammography-information-patients',
        label: 'FDA · Mammography Information for Patients',
      },
    ],
  },
  {
    phase: { en: 'On exam day', ar: 'يوم الفحص' },
    items: [
      {
        title: { en: 'Skip deodorant, powder and lotion', ar: 'تجنّبي مزيل العرق والبودرة والكريمات' },
        body: {
          en: 'Do not wear deodorant, perfume, lotion or powder under your arms or on your breasts. Particles in these products can show up on the X-ray.',
          ar: 'لا تضعي مزيل العرق أو العطر أو الكريم أو البودرة تحت الإبطين أو على الثديين، فجزيئات هذه المنتجات قد تظهر في صورة الأشعة.',
        },
        src: 'https://www.fda.gov/consumers/consumer-updates/mammography-what-you-need-know',
        label: 'FDA · Mammography: What You Need to Know',
      },
      {
        title: { en: 'Tell the technologist about implants', ar: 'أخبري الفنية إن كانت لديك حشوات' },
        body: {
          en: 'If you have breast implants, say so before the exam. The technologist uses special techniques to get the best views and lower the chance of rupture during compression.',
          ar: 'إن كانت لديك حشوات ثدي فأخبري الفنية قبل الفحص، فهي تستخدم تقنيات خاصة للحصول على أفضل صورة وتقليل احتمال التمزّق أثناء الضغط.',
        },
        src: 'https://www.fda.gov/consumers/consumer-updates/what-know-about-breast-implants',
        label: 'FDA · What to Know About Breast Implants',
      },
    ],
  },
  {
    phase: { en: 'After the exam', ar: 'بعد الفحص' },
    items: [
      {
        title: { en: 'Expect a plain-language result within 30 days', ar: 'انتظري نتيجة بلغة مبسّطة خلال 30 يومًا' },
        body: {
          en: 'Under MQSA, the facility must send you a written summary of your results in easy-to-understand language within 30 days of your mammogram.',
          ar: 'بموجب قانون MQSA، يجب أن يرسل لك المركز ملخّصًا مكتوبًا لنتيجتك بلغة سهلة خلال 30 يومًا من الفحص.',
        },
        src: 'https://www.fda.gov/radiation-emitting-products/mammography-information-patients/frequently-asked-questions-about-mqsa',
        label: 'FDA · Frequently Asked Questions About MQSA',
      },
      {
        title: { en: 'Your report must state your breast density', ar: 'يجب أن يذكر تقريرك كثافة الثدي' },
        body: {
          en: 'Since September 10, 2024, facilities must tell you your breast density. Dense tissue can make cancer harder to see on a mammogram and is a risk factor. Talk to your provider about whether more testing is right for you.',
          ar: 'منذ 10 أيلول 2024 أصبح على المراكز إبلاغك بكثافة ثديك. النسيج الكثيف قد يُصعّب رؤية السرطان في الماموغرام وهو عامل خطورة، فناقشي طبيبك في حاجتك إلى فحوصات إضافية.',
        },
        src: 'https://www.fda.gov/consumers/womens-health-topics/understanding-breast-density',
        label: 'FDA · Understanding Breast Density',
      },
    ],
  },
  {
    phase: { en: 'Know the facts', ar: 'حقائق مهمة' },
    items: [
      {
        title: { en: 'A thermogram is not a mammogram', ar: 'التصوير الحراري ليس بديلًا عن الماموغرام' },
        body: {
          en: 'FDA warns that thermography should not be used in place of mammography to screen for or diagnose breast cancer. Thermography devices are only cleared as an add-on to a primary test like mammography.',
          ar: 'تحذّر FDA من استخدام التصوير الحراري بدل الماموغرام للكشف عن سرطان الثدي أو تشخيصه. أجهزة التصوير الحراري مُجازة فقط كفحص مساعد إلى جانب فحص أساسي كالماموغرام.',
        },
        src: 'https://www.fda.gov/consumers/consumer-updates/breast-cancer-screening-thermogram-no-substitute-mammogram',
        label: 'FDA Safety Communication · Feb 25, 2019',
        warn: true,
      },
      {
        title: { en: 'Ask whether 3D mammography suits you', ar: 'اسألي إن كان الماموغرام ثلاثي الأبعاد مناسبًا لك' },
        body: {
          en: 'FDA-approved tomosynthesis (3D) systems create cross-sectional images of the breast and may help evaluate dense breast tissue.',
          ar: 'أنظمة التصوير المقطعي (ثلاثي الأبعاد) المعتمدة من FDA تكوّن صورًا مقطعية للثدي، وقد تساعد في تقييم النسيج الكثيف.',
        },
        src: 'https://www.fda.gov/consumers/consumer-updates/mammography-what-you-need-know',
        label: 'FDA · Mammography: What You Need to Know',
      },
    ],
  },
];
