// المحتوى: أجهزة التصوير + إرشادات FDA المنشورة (مع روابط المصادر)
// ملاحظة: هذا تطبيق مستقل، مو تابع للـ FDA ولا معتمد منها. الإرشادات ملخصة من صفحات FDA العامة.

export const DEVICES = [
  {
    id: 'ffdm', shape: 'mammo', tag: 'X-ray · 2D',
    name: 'Digital Mammography',
    short: 'FFDM',
    what: 'A low-dose X-ray of the breast captured on a digital detector. Each breast is usually imaged in two views: craniocaudal (CC, top to bottom) and mediolateral oblique (MLO, angled from the side).',
    use: 'The standard screening and diagnostic exam. This is the image type the AI in this app analyzes.',
    parts: ['X-ray tube head', 'Compression paddle', 'Digital detector', 'Rotating C-arm'],
    fda: 'Every U.S. mammography facility must be accredited and certified under the Mammography Quality Standards Act (MQSA) and inspected every year.',
    src: 'https://www.fda.gov/radiation-emitting-products/mammography-quality-standards-act-mqsa-and-mqsa-program',
  },
  {
    id: 'dbt', shape: 'dbt', tag: 'X-ray · 3D',
    name: 'Digital Breast Tomosynthesis',
    short: 'DBT · 3D',
    what: 'The X-ray tube sweeps across an arc and takes several low-dose images from different angles. A computer rebuilds them into thin cross-sectional slices of the breast.',
    use: 'Screening and diagnosis. Slices reduce tissue overlap, which can help when breast tissue is dense.',
    parts: ['Tube moving on an arc', 'Multiple projection angles', 'Slice reconstruction'],
    fda: 'FDA approved DBT for breast cancer screening in 2011. Systems include the Hologic Selenia Dimensions, GE SenoClaire and Siemens MAMMOMAT Inspiration.',
    src: 'https://www.fda.gov/consumers/consumer-updates/mammography-what-you-need-know',
  },
  {
    id: 'cem', shape: 'cem', tag: 'X-ray · Contrast',
    name: 'Contrast-Enhanced Mammography',
    short: 'CEM',
    what: 'An iodine contrast agent is injected into a vein before the mammogram. Cancers often grow extra, leaky blood vessels, so they take up contrast and stand out.',
    use: 'Problem-solving after an unclear mammogram, and an option for some patients who cannot have MRI.',
    parts: ['Iodinated contrast', 'Dual-energy exposures', 'Vascular map'],
    fda: 'FDA-approved exam that, like MRI, depicts cancers through increased and leaky blood vessels.',
    src: 'https://www.fda.gov/consumers/consumer-updates/mammography-what-you-need-know',
  },
  {
    id: 'us', shape: 'ultrasound', tag: 'Sound waves',
    name: 'Breast Ultrasound',
    short: 'US',
    what: 'A handheld probe sends high-frequency sound waves into the breast and builds an image from the echoes. No radiation is used.',
    use: 'Checking a lump or a mammogram finding, telling cysts from solid masses, guiding biopsies, and as a supplemental test for dense breasts.',
    parts: ['Transducer probe', 'Sound-wave fan', 'Real-time imaging'],
    fda: 'FDA notes that for some people with dense breast tissue, imaging tests in addition to a mammogram may help find cancers.',
    src: 'https://www.fda.gov/consumers/womens-health-topics/understanding-breast-density',
  },
  {
    id: 'mri', shape: 'mri', tag: 'Magnetic field',
    name: 'Breast MRI',
    short: 'MRI',
    what: 'A strong magnet and radio waves create detailed images, usually with a gadolinium contrast agent. The patient lies face down with the breasts in a dedicated coil.',
    use: 'Screening for people at high risk, measuring the extent of a known cancer, and checking silicone breast implants for rupture.',
    parts: ['Superconducting magnet', 'Breast coil', 'Contrast injection'],
    fda: 'For silicone gel implants without symptoms, FDA recommends rupture screening by ultrasound or MRI starting 5 to 6 years after surgery, then every 2 to 3 years. MRI is the most effective way to find a silent rupture.',
    src: 'https://www.fda.gov/medical-devices/breast-implants/risks-and-complications-breast-implants',
  },
  {
    id: 'ai', shape: 'ai', tag: 'Software',
    name: 'AI Detection Software',
    short: 'CAD / AI',
    what: 'Algorithms that analyze mammograms or DBT images and mark suspicious areas or score each case for the radiologist.',
    use: 'A second reader that supports, never replaces, the radiologist.',
    parts: ['Deep neural network', 'Case score', 'Region marks'],
    fda: 'FDA has cleared several AI tools for mammography and DBT. The model in this app is a research prototype and is NOT FDA-cleared.',
    src: 'https://www.fda.gov/consumers/consumer-updates/mammography-what-you-need-know',
  },
];

// الإرشادات مرتبة حسب مراحل الفحص (الترتيب هنا حقيقي: قبل ← أثناء ← بعد)
export const GUIDANCE = [
  {
    phase: 'Before the exam',
    items: [
      {
        title: 'Choose an FDA-certified facility',
        body: 'Only facilities with a valid MQSA certificate can legally perform mammography. Search certified facilities by ZIP code, and look for the certificate displayed at the facility. Every certificate has an expiration date.',
        src: 'https://www.fda.gov/radiation-emitting-products/mammography-information-patients/search-certified-facility',
        label: 'FDA · Search for a Certified Facility',
      },
      {
        title: 'Bring your previous mammograms',
        body: 'Bring prior mammograms or have them sent to the new facility. The radiologist compares new images with old ones to look for changes.',
        src: 'https://www.fda.gov/radiation-emitting-products/mammography-quality-standards-act-mqsa-and-mqsa-program/mammography-information-patients',
        label: 'FDA · Mammography Information for Patients',
      },
    ],
  },
  {
    phase: 'On exam day',
    items: [
      {
        title: 'Skip deodorant, powder and lotion',
        body: 'Do not wear deodorant, perfume, lotion or powder under your arms or on your breasts. Particles in these products can show up on the X-ray.',
        src: 'https://www.fda.gov/consumers/consumer-updates/mammography-what-you-need-know',
        label: 'FDA · Mammography: What You Need to Know',
      },
      {
        title: 'Tell the technologist about implants',
        body: 'If you have breast implants, say so before the exam. The technologist uses special techniques to get the best views and lower the chance of rupture during compression.',
        src: 'https://www.fda.gov/consumers/consumer-updates/what-know-about-breast-implants',
        label: 'FDA · What to Know About Breast Implants',
      },
    ],
  },
  {
    phase: 'After the exam',
    items: [
      {
        title: 'Expect a plain-language result within 30 days',
        body: 'Under MQSA, the facility must send you a written summary of your results in easy-to-understand language within 30 days of your mammogram.',
        src: 'https://www.fda.gov/radiation-emitting-products/mammography-information-patients/frequently-asked-questions-about-mqsa',
        label: 'FDA · Frequently Asked Questions About MQSA',
      },
      {
        title: 'Your report must state your breast density',
        body: 'Since September 10, 2024, facilities must tell you your breast density. Dense tissue can make cancer harder to see on a mammogram and is a risk factor. Talk to your provider about whether more testing is right for you.',
        src: 'https://www.fda.gov/consumers/womens-health-topics/understanding-breast-density',
        label: 'FDA · Understanding Breast Density',
      },
    ],
  },
  {
    phase: 'Know the facts',
    items: [
      {
        title: 'A thermogram is not a mammogram',
        body: 'FDA warns that thermography should not be used in place of mammography to screen for or diagnose breast cancer. Thermography devices are only cleared as an add-on to a primary test like mammography.',
        src: 'https://www.fda.gov/consumers/consumer-updates/breast-cancer-screening-thermogram-no-substitute-mammogram',
        label: 'FDA Safety Communication · Feb 25, 2019',
        warn: true,
      },
      {
        title: 'Ask whether 3D mammography suits you',
        body: 'FDA-approved tomosynthesis (3D) systems create cross-sectional images of the breast and may help evaluate dense breast tissue.',
        src: 'https://www.fda.gov/consumers/consumer-updates/mammography-what-you-need-know',
        label: 'FDA · Mammography: What You Need to Know',
      },
    ],
  },
];
