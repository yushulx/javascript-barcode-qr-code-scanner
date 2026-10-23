// DOM Elements
let dropdown = document.getElementById("dropdown");
let document_type_txt = document.getElementById("document_type_txt");
let country_code_txt = document.getElementById("country_code_txt");
let birth_date_txt = document.getElementById("birth_date_txt");
let document_number_txt = document.getElementById("document_number_txt");
let sex_txt = document.getElementById('sex_txt');
let expiry_date_txt = document.getElementById('expiry_date_txt');
let nationality_txt = document.getElementById('nationality_txt');
let surname_txt = document.getElementById('surname_txt');
let given_names_txt = document.getElementById('given_names_txt');
let optional_data1_txt = document.getElementById('optional_data1_txt');
let optional_data2_txt = document.getElementById('optional_data2_txt');

/* Shared analytics for the Codepool demos (demos/shared/analytics.js). The
   fallback keeps the page working if the script is blocked. */
const analytics = window.DemoAnalytics || {
    ready: function () { },
    error: function () { },
    start: function () { },
    success: function () { },
    fail: function () { },
    action: function () { },
    trialClick: function () { }
};

// Only user-triggered generations are reported, so the initial render is excluded
let initialRenderDone = false;
const APP_START = (window.performance && performance.now) ? performance.now() : Date.now();

const VALID_COUNTRY_CODES = ['USA', 'CAN', 'GBR', 'AUS', 'FRA', 'CHN', 'IND', 'BRA', 'JPN', 'ZAF', 'RUS', 'MEX', 'ITA', 'ESP', 'NLD', 'SWE', 'ARG', 'BEL', 'CHE'];

let dataFromGenerator = '';
let lines = [];

// Utility Functions
function randomIntFromInterval(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

function randomDate(startYear = 1900, endYear = new Date().getFullYear()) {
    let year = randomIntFromInterval(startYear, endYear);
    let month = randomIntFromInterval(1, 12);
    let day;

    if ([1, 3, 5, 7, 8, 10, 12].includes(month)) {
        day = randomIntFromInterval(1, 31);
    } else if ([4, 6, 9, 11].includes(month)) {
        day = randomIntFromInterval(1, 30);
    } else { // February
        if ((year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0)) { // leap year
            day = randomIntFromInterval(1, 29);
        } else {
            day = randomIntFromInterval(1, 28);
        }
    }

    let date = new Date(year, month - 1, day);
    return date;
}

function formatDate(date) {
    return date.toISOString().slice(2, 10).replace(/-/g, "");
}

function randomString(length = 10, allowedChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    let result = '';
    for (let i = 0; i < length; i++) {
        result += allowedChars.charAt(Math.floor(Math.random() * allowedChars.length));
    }
    return result;
}

function randomMRZData() {
    let surname = randomString(randomIntFromInterval(3, 7));
    let givenName = randomString(randomIntFromInterval(3, 7));
    let nationality = VALID_COUNTRY_CODES[Math.floor(Math.random() * VALID_COUNTRY_CODES.length)];
    let sex = Math.random() < 0.5 ? 'M' : 'F';
    let documentNumber = randomString(9, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');

    // Get current date
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();

    // Generate birth date (person aged 18-80 years old)
    // Birth year should be between (currentYear - 80) and (currentYear - 18)
    let birthDate = randomDate(currentYear - 80, currentYear - 18);

    // Generate expiry date (1-10 years from now, must be after birth date)
    let expiryDate = randomDate(currentYear + 1, currentYear + 10);

    return {
        'Surname': surname,
        'Given Name': givenName,
        'Nationality': nationality,
        'Sex': sex,
        'Document Number': documentNumber,
        'Birth Date': formatDate(birthDate),
        'Expiry Date': formatDate(expiryDate)
    };
}

function createRandomData() {
    data = randomMRZData();
    surname_txt.value = data['Surname'];
    given_names_txt.value = data['Given Name'];
    nationality_txt.value = data['Nationality'];
    country_code_txt.value = nationality_txt.value;
    sex_txt.value = data['Sex'];
    document_number_txt.value = data['Document Number'];
    birth_date_txt.value = data['Birth Date'];
    expiry_date_txt.value = data['Expiry Date'];
}

// Initialize with default data
document_type_txt.value = 'P';
createRandomData();

// Hide loading indicator on page load
document.addEventListener('DOMContentLoaded', async function () {
    document.getElementById("loading-indicator").style.display = "none";

    // Wait for OCR-B font to load before initializing
    try {
        await document.fonts.load('16px OCR-B');
        console.log('✅ OCR-B font loaded');
    } catch (err) {
        console.warn('⚠️ Font loading error:', err);
    }

    // Initialize with default data after font loads
    selectChanged();

    analytics.ready(((window.performance && performance.now) ? performance.now() : Date.now()) - APP_START);
});

// Event Handlers
function selectChanged() {
    if (dropdown.value === 'ID Card(TD1)') {
        document_type_txt.value = 'I';
    } else if (dropdown.value === 'ID Card(TD2)') {
        document_type_txt.value = 'I';
    } else if (dropdown.value == 'Passport(TD3)') {
        document_type_txt.value = 'P';
    } else if (dropdown.value == 'Visa(A)') {
        document_type_txt.value = 'V';
    } else if (dropdown.value == 'Visa(B)') {
        document_type_txt.value = 'V';
    }

    createRandomData();
    generate();
}

function randomize() {
    analytics.action('randomize');
    createRandomData();
    generate('internal');
}

function generate(source) {
    try {
        let generator;

        if (initialRenderDone && source !== 'internal') {
            analytics.action('generate', { document_kind: dropdown.value });
        }

        if (dropdown.value === 'ID Card(TD1)') {
            generator = new TD1CodeGenerator(
                document_type_txt.value,
                country_code_txt.value,
                document_number_txt.value,
                birth_date_txt.value,
                sex_txt.value,
                expiry_date_txt.value,
                nationality_txt.value,
                surname_txt.value,
                given_names_txt.value,
                optional_data1_txt.value,
                optional_data2_txt.value
            );
        } else if (dropdown.value === 'ID Card(TD2)') {
            generator = new TD2CodeGenerator(
                document_type_txt.value,
                country_code_txt.value,
                surname_txt.value,
                given_names_txt.value,
                document_number_txt.value,
                nationality_txt.value,
                birth_date_txt.value,
                sex_txt.value,
                expiry_date_txt.value,
                optional_data1_txt.value
            );
        } else if (dropdown.value === 'Passport(TD3)') {
            generator = new TD3CodeGenerator(
                document_type_txt.value,
                country_code_txt.value,
                surname_txt.value,
                given_names_txt.value,
                document_number_txt.value,
                nationality_txt.value,
                birth_date_txt.value,
                sex_txt.value,
                expiry_date_txt.value,
                optional_data1_txt.value
            );
        } else if (dropdown.value === 'Visa(A)') {
            generator = new MRVACodeGenerator(
                document_type_txt.value,
                country_code_txt.value,
                surname_txt.value,
                given_names_txt.value,
                document_number_txt.value,
                nationality_txt.value,
                birth_date_txt.value,
                sex_txt.value,
                expiry_date_txt.value,
                optional_data1_txt.value
            );
        } else if (dropdown.value === 'Visa(B)') {
            generator = new MRVBCodeGenerator(
                document_type_txt.value,
                country_code_txt.value,
                surname_txt.value,
                given_names_txt.value,
                document_number_txt.value,
                nationality_txt.value,
                birth_date_txt.value,
                sex_txt.value,
                expiry_date_txt.value,
                optional_data1_txt.value
            );
        }

        dataFromGenerator = generator.toString();
        document.getElementById("outputMRZ").value = dataFromGenerator;
        drawImage();
    } catch (error) {
        console.error('Error generating MRZ:', error);
        document.getElementById("outputMRZ").value = 'Error: ' + error.message;
        analytics.error('generate_failed', error.message);
    }
}

function drawImage() {
    let canvas = document.getElementById("overlay");
    renderDocument(canvas, {
        docType: dropdown.value,
        countryCode: country_code_txt.value,
        surname: surname_txt.value,
        givenNames: given_names_txt.value,
        nationality: nationality_txt.value,
        birthDate: birth_date_txt.value,
        expiryDate: expiry_date_txt.value,
        sex: sex_txt.value,
        docNumber: document_number_txt.value,
        mrzText: dataFromGenerator
    });
}

/* Renders the mock document onto `canvas` from explicit `data` rather than
   the form fields, so both the interactive preview and the stress-test
   engine (stress.js) draw with exactly the same routine — the test images
   cannot drift from what the page demonstrates.

   data: { docType, countryCode, surname, givenNames, nationality, birthDate,
           expiryDate, sex, docNumber, mrzText } */
function renderDocument(canvas, data) {
    let ctx = canvas.getContext("2d");

    // Set canvas dimensions based on document type
    const isPassport = data.docType === 'Passport(TD3)';
    canvas.width = 900;
    canvas.height = isPassport ? 640 : 580;

    // Helper function to truncate text if it exceeds max width
    function truncateText(text, font, maxWidth) {
        ctx.font = font;
        if (ctx.measureText(text).width <= maxWidth) {
            return text;
        }

        let truncated = text;
        while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
            truncated = truncated.slice(0, -1);
        }
        return truncated + (truncated.length < text.length ? '...' : '');
    }

    // Get country-specific background colors
    function getCountryBackground(countryCode) {
        const backgrounds = {
            'USA': { colors: ['#b22234', '#3c3b6e', '#ffffff'], pattern: 'stripes' },
            'CAN': { colors: ['#ff0000', '#ffffff'], pattern: 'simple' },
            'GBR': { colors: ['#012169', '#C8102E', '#ffffff'], pattern: 'union' },
            'FRA': { colors: ['#0055a4', '#ffffff', '#ef4135'], pattern: 'vertical' },
            // Germany is encoded as 'D' in the MRZ (ICAO Doc 9303 exception); keep the ISO code as an alias
            'D': { colors: ['#000000', '#dd0000', '#ffce00'], pattern: 'horizontal' },
            'DEU': { colors: ['#000000', '#dd0000', '#ffce00'], pattern: 'horizontal' },
            'CHN': { colors: ['#de2910', '#ffde00'], pattern: 'simple' },
            'JPN': { colors: ['#bc002d', '#ffffff'], pattern: 'simple' },
            'AUS': { colors: ['#012169', '#ffffff'], pattern: 'simple' },
            'IND': { colors: ['#ff9933', '#ffffff', '#138808'], pattern: 'horizontal' },
            'BRA': { colors: ['#009739', '#fedd00'], pattern: 'simple' },
            'RUS': { colors: ['#ffffff', '#0039a6', '#d52b1e'], pattern: 'horizontal' },
            'MEX': { colors: ['#006847', '#ffffff', '#ce1126'], pattern: 'vertical' },
            'ESP': { colors: ['#c60b1e', '#ffc400'], pattern: 'simple' },
            'ITA': { colors: ['#009246', '#ffffff', '#ce2b37'], pattern: 'vertical' },
            'ZAF': { colors: ['#007a4d', '#ffb612', '#de3831'], pattern: 'simple' },
            'NLD': { colors: ['#ae1c28', '#ffffff', '#21468b'], pattern: 'horizontal' },
            'SWE': { colors: ['#006aa7', '#fecc00'], pattern: 'simple' },
            'ARG': { colors: ['#74acdf', '#ffffff', '#74acdf'], pattern: 'horizontal' },
            'BEL': { colors: ['#000000', '#fdda24', '#ef3340'], pattern: 'vertical' },
            'CHE': { colors: ['#da291c', '#ffffff'], pattern: 'simple' }
        };

        return backgrounds[countryCode] || { colors: ['#e8f4f8', '#d4e9f2', '#c1dfe9'], pattern: 'simple' };
    }

    // Get issuing country code
    const countryCode = data.countryCode.toUpperCase() || 'USA';
    const bgConfig = getCountryBackground(countryCode);

    // Create country-specific gradient background
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);

    if (bgConfig.pattern === 'vertical') {
        // Vertical stripes
        bgConfig.colors.forEach((color, i) => {
            const pos = i / (bgConfig.colors.length - 1);
            gradient.addColorStop(pos, color + '40'); // 40 = 25% opacity
        });
    } else if (bgConfig.pattern === 'horizontal') {
        // Horizontal bands
        bgConfig.colors.forEach((color, i) => {
            const pos = i / (bgConfig.colors.length - 1);
            gradient.addColorStop(pos, color + '40');
        });
    } else {
        // Simple gradient with country colors
        bgConfig.colors.forEach((color, i) => {
            const pos = i / (bgConfig.colors.length - 1);
            gradient.addColorStop(pos, color + '30'); // 30 = 19% opacity
        });
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw decorative pattern with country color
    ctx.save();
    ctx.globalAlpha = 0.05;
    const mainColor = bgConfig.colors[0];
    for (let i = 0; i < 50; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const size = Math.random() * 60 + 20;
        ctx.fillStyle = mainColor;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // Draw main document area with rounded corners
    const docMargin = 40;
    const docWidth = canvas.width - docMargin * 2;
    const docHeight = canvas.height - docMargin * 2;
    const cornerRadius = 15;

    // Document shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 10;

    // Document background - clean base
    ctx.fillStyle = '#f8f9fa';
    ctx.beginPath();
    ctx.roundRect(docMargin, docMargin, docWidth, docHeight, cornerRadius);
    ctx.fill();

    // Add realistic security pattern - guilloche-like lines
    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.strokeStyle = bgConfig.colors[0];
    ctx.lineWidth = 0.5;

    // Draw wave patterns (like real passport security features)
    for (let y = docMargin; y < docMargin + docHeight; y += 8) {
        ctx.beginPath();
        ctx.moveTo(docMargin, y);
        for (let x = docMargin; x < docMargin + docWidth; x += 10) {
            const wave = Math.sin((x - docMargin) * 0.05) * 3;
            ctx.lineTo(x, y + wave);
        }
        ctx.stroke();
    }
    ctx.restore();

    // Add subtle microprinting effect (small repeated text pattern)
    ctx.save();
    ctx.globalAlpha = 0.015;
    ctx.fillStyle = bgConfig.colors[0];
    ctx.font = '4px Arial';
    const microText = countryCode;
    for (let y = docMargin + 10; y < docMargin + docHeight - 10; y += 8) {
        for (let x = docMargin + 10; x < docMargin + docWidth - 10; x += 30) {
            ctx.fillText(microText, x, y);
        }
    }
    ctx.restore();

    // Add corner security elements (like real passports)
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.strokeStyle = bgConfig.colors[0];
    ctx.lineWidth = 1;

    // Top-left corner pattern
    for (let i = 0; i < 5; i++) {
        ctx.strokeRect(docMargin + 10 + i * 3, docMargin + 10 + i * 3, 30 - i * 6, 30 - i * 6);
    }

    // Top-right corner pattern
    for (let i = 0; i < 5; i++) {
        ctx.strokeRect(docMargin + docWidth - 40 + i * 3, docMargin + 10 + i * 3, 30 - i * 6, 30 - i * 6);
    }
    ctx.restore();

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Draw subtle border with country color
    ctx.strokeStyle = bgConfig.colors[0] + '30'; // Country color at 19% opacity
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(docMargin, docMargin, docWidth, docHeight, cornerRadius);
    ctx.stroke();

    lines = data.mrzText.split('\n');

    // Draw header section (smaller for real passport look)
    const headerHeight = 60;
    const headerGradient = ctx.createLinearGradient(docMargin, docMargin, docMargin + docWidth, docMargin + headerHeight);
    headerGradient.addColorStop(0, '#1e293b');
    headerGradient.addColorStop(1, '#334155');
    ctx.fillStyle = headerGradient;
    ctx.beginPath();
    ctx.roundRect(docMargin, docMargin, docWidth, headerHeight, [cornerRadius, cornerRadius, 0, 0]);
    ctx.fill();

    // Country emblem/code
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.arc(docMargin + 45, docMargin + 30, 22, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'white';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(data.countryCode, docMargin + 45, docMargin + 36);

    // Title
    ctx.fillStyle = "white";
    ctx.textAlign = 'left';
    ctx.font = 'bold 24px "Arial"';
    let titleText = '';
    if (data.docType === 'ID Card(TD1)' || data.docType === 'ID Card(TD2)') {
        titleText = 'IDENTIFICATION CARD';
    } else if (data.docType === 'Passport(TD3)') {
        titleText = 'PASSPORT';
    } else {
        titleText = 'VISA';
    }
    ctx.fillText(titleText, docMargin + 85, docMargin + 30);

    // Subtitle
    ctx.font = '11px "Arial"';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillText(data.countryCode, docMargin + 85, docMargin + 48);

    // Main content area starts after header
    const contentStartY = docMargin + headerHeight + 25;

    // Photo area (like a real passport)
    const photoX = docMargin + 50;
    const photoY = contentStartY;
    const photoWidth = 140;
    const photoHeight = 180;

    // Draw photo placeholder with gradient
    const photoGradient = ctx.createLinearGradient(photoX, photoY, photoX + photoWidth, photoY + photoHeight);
    photoGradient.addColorStop(0, '#e2e8f0');
    photoGradient.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = photoGradient;
    ctx.fillRect(photoX, photoY, photoWidth, photoHeight);

    // Photo border
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.strokeRect(photoX, photoY, photoWidth, photoHeight);

    // Photo icon/placeholder
    ctx.fillStyle = '#64748b';
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(photoX + photoWidth / 2, photoY + photoHeight / 2 - 15, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(photoX + photoWidth / 2, photoY + photoHeight / 2 + 45, 45, 35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Photo label
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('PHOTO', photoX + photoWidth / 2, photoY + photoHeight + 15);

    // Info area - to the right of photo
    ctx.textAlign = 'left';
    ctx.fillStyle = "#1e293b";
    const infoX = photoX + photoWidth + 40;
    const infoWidth = docWidth - (infoX - docMargin) - 50;
    let currentY = contentStartY;
    const fieldGap = 28;

    // Upper section fields
    ctx.font = '10px "Arial"';
    ctx.fillStyle = '#64748b';
    ctx.fillText('SURNAME', infoX, currentY);
    ctx.font = 'bold 16px "Arial"';
    ctx.fillStyle = '#1e293b';
    const surname = truncateText(data.surname, 'bold 16px "Arial"', infoWidth);
    ctx.fillText(surname, infoX, currentY + 16);
    currentY += fieldGap;

    ctx.font = '10px "Arial"';
    ctx.fillStyle = '#64748b';
    ctx.fillText('GIVEN NAMES', infoX, currentY);
    ctx.font = 'bold 16px "Arial"';
    ctx.fillStyle = '#1e293b';
    const givenNames = truncateText(data.givenNames, 'bold 16px "Arial"', infoWidth);
    ctx.fillText(givenNames, infoX, currentY + 16);
    currentY += fieldGap;

    ctx.font = '10px "Arial"';
    ctx.fillStyle = '#64748b';
    ctx.fillText('NATIONALITY', infoX, currentY);
    ctx.font = 'bold 16px "Arial"';
    ctx.fillStyle = '#1e293b';
    ctx.fillText(data.nationality, infoX, currentY + 16);
    currentY += fieldGap;

    ctx.font = '10px "Arial"';
    ctx.fillStyle = '#64748b';
    ctx.fillText('DATE OF BIRTH', infoX, currentY);
    ctx.font = 'bold 16px "Arial"';
    ctx.fillStyle = '#1e293b';
    const birthYY = parseInt(data.birthDate.slice(0, 2));
    const birthFullYear = birthYY > 50 ? `19${data.birthDate.slice(0, 2)}` : `20${data.birthDate.slice(0, 2)}`;
    ctx.fillText(`${data.birthDate.slice(4, 6)}.${data.birthDate.slice(2, 4)}.${birthFullYear}`, infoX, currentY + 16);
    currentY += fieldGap;

    ctx.font = '10px "Arial"';
    ctx.fillStyle = '#64748b';
    ctx.fillText('SEX', infoX, currentY);
    ctx.font = 'bold 16px "Arial"';
    ctx.fillStyle = '#1e293b';
    ctx.fillText(data.sex, infoX, currentY + 16);
    currentY += fieldGap;

    // Second row of info
    currentY = contentStartY;
    const infoX2 = infoX + infoWidth / 2;

    ctx.font = '10px "Arial"';
    ctx.fillStyle = '#64748b';
    let docNumLabel = 'PASSPORT NO.';
    if (data.docType === 'ID Card(TD1)' || data.docType === 'ID Card(TD2)') {
        docNumLabel = 'DOCUMENT NO.';
    } else if (data.docType !== 'Passport(TD3)') {
        docNumLabel = 'VISA NO.';
    }
    ctx.fillText(docNumLabel, infoX2, currentY);
    ctx.font = 'bold 16px "Arial"';
    ctx.fillStyle = '#1e293b';
    const docNumber = truncateText(data.docNumber, 'bold 16px "Arial"', infoWidth / 2 - 10);
    ctx.fillText(docNumber, infoX2, currentY + 16);
    currentY += fieldGap;

    ctx.font = '10px "Arial"';
    ctx.fillStyle = '#64748b';
    ctx.fillText('DATE OF ISSUE', infoX2, currentY);
    ctx.font = 'bold 16px "Arial"';
    ctx.fillStyle = '#1e293b';
    // Calculate issue date (expiry - 10 years for example)
    const expiryYY = parseInt(data.expiryDate.slice(0, 2));
    const expiryFullYear = expiryYY > 50 ? 1900 + expiryYY : 2000 + expiryYY;
    const issueYear = expiryFullYear - 10;
    ctx.fillText(`${data.expiryDate.slice(4, 6)}.${data.expiryDate.slice(2, 4)}.${issueYear}`, infoX2, currentY + 16);
    currentY += fieldGap;

    ctx.font = '10px "Arial"';
    ctx.fillStyle = '#64748b';
    ctx.fillText('DATE OF EXPIRY', infoX2, currentY);
    ctx.font = 'bold 16px "Arial"';
    ctx.fillStyle = '#1e293b';
    const expiryYYDisplay = parseInt(data.expiryDate.slice(0, 2));
    const expiryYearDisplay = expiryYYDisplay > 50 ? `19${data.expiryDate.slice(0, 2)}` : `20${data.expiryDate.slice(0, 2)}`;
    ctx.fillText(`${data.expiryDate.slice(4, 6)}.${data.expiryDate.slice(2, 4)}.${expiryYearDisplay}`, infoX2, currentY + 16);
    currentY += fieldGap;

    ctx.font = '10px "Arial"';
    ctx.fillStyle = '#64748b';
    ctx.fillText('AUTHORITY', infoX2, currentY);
    ctx.font = 'bold 16px "Arial"';
    ctx.fillStyle = '#1e293b';
    ctx.fillText(data.countryCode, infoX2, currentY + 16);

    // Draw MRZ section at the bottom (like real passports)
    const mrz = mrzLayout(canvas, lines, docMargin, docWidth);

    ctx.fillStyle = "#000000";
    ctx.font = mrz.fontSize + 'px "OCR-B", monospace';
    ctx.textAlign = 'left';
    lines.forEach(function (line, index) {
        ctx.fillText(line, mrz.x, mrz.firstBaseline + index * mrz.lineHeight);
    });

    // Add "SPECIMEN" watermark
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.font = 'bold 80px Arial';
    ctx.fillStyle = '#ef4444';
    ctx.textAlign = 'center';
    ctx.translate(canvas.width / 2, canvas.height / 2 - 50);
    ctx.rotate(-Math.PI / 6);
    ctx.fillText('SPECIMEN', 0, 0);
    ctx.restore();

    /* The layout is handed back so the stress-test engine can record the zone
       the renderer actually drew as the ground-truth quad, instead of
       recomputing it and drifting. */
    return { mrz: mrz };
}

/* MRZ zone geometry — the single place it is decided, so the preview, the
   exported test images and the ground-truth quad cannot disagree.

   ICAO 9303 fixes the character pitch and the character height at 2.54 mm:
   the number of characters on a line decides how WIDE the zone is, not how
   far apart the characters sit. So the pitch here is the font's own advance
   and only the font SIZE adapts — shrinking just far enough that the longest
   line fits the zone. Stretching the pitch to fill the page (what this did
   before) spaced a 36-character TD1/TD2 line about 20% wider than its glyphs,
   which is not what a document looks like and not what a reader's MRZ
   localizer expects. */
function mrzLayout(canvas, lines, docMargin, docWidth) {
    const padding = 25;
    const lineHeight = 30;
    const x = docMargin + 50;
    const available = docWidth - 100;
    const ctx = canvas.getContext("2d");
    const longest = lines.reduce(function (a, b) { return b.length > a.length ? b : a; }, '');

    let fontSize = 20;
    ctx.font = fontSize + 'px "OCR-B", monospace';
    const naturalWidth = ctx.measureText(longest).width;
    if (naturalWidth > available) {
        fontSize = Math.max(8, Math.floor(fontSize * available / naturalWidth));
        ctx.font = fontSize + 'px "OCR-B", monospace';
    }
    const textWidth = ctx.measureText(longest).width;

    const height = lines.length * lineHeight + padding * 2;
    const y = canvas.height - docMargin - height;
    const firstBaseline = y + padding;
    const lastBaseline = firstBaseline + (lines.length - 1) * lineHeight;

    return {
        x: x,
        y: y,
        w: textWidth,
        h: height,
        padding: padding,
        lineHeight: lineHeight,
        fontSize: fontSize,
        firstBaseline: firstBaseline,
        /* The glyphs themselves, without the padding: the band a reader has to
           find is the text, and that is what the ground truth should mark. */
        textX: x,
        textY: Math.round(firstBaseline - fontSize * 0.8),
        textW: textWidth,
        textH: Math.round(lastBaseline + fontSize * 0.25 - (firstBaseline - fontSize * 0.8))
    };
}

// Generate initial MRZ on page load
window.addEventListener('load', function () {
    generate();
    initialRenderDone = true;
});

/* ---------------------------------------------------------------------------
 * Test-image dataset mode
 *
 * The engine (stress.js) owns the pixels and the ground truth; this section
 * owns the controls, the preview and the export. The rule it enforces is
 * that nothing downstream of a build can show a stale result: the export
 * buttons stay disabled until a dataset exists, and every control that only
 * matters while a build is running is disabled rather than inert.
 * ------------------------------------------------------------------------- */

const DS_IDS = ['modeTabSingle', 'modeTabDataset', 'mode_single', 'mode_dataset',
    'dsPreset', 'dsPresetNote', 'dsSeed', 'dsSamples', 'dsDocType', 'dsDifficulty',
    'dsRows', 'dsBuildBtn', 'dsSeedBtn', 'dsResetBtn', 'dsProgress', 'dsProgressBar',
    'dsProgressText', 'dsStatus', 'dsError', 'dsCanvas', 'dsPrevBtn', 'dsNextBtn',
    'dsCounter', 'dsSampleStatus', 'dsExpected', 'dsApplied', 'dsZipBtn',
    'dsJsonBtn', 'dsPngBtn', 'dsExportError'];

const dsEls = {};
const dsRows = {};
const DS_PRESET_CUSTOM = 'custom';
const dsState = {
    preset: 'mixed',
    baseline: '',
    data: null,      // { spec, samples, annotation, seedHash }
    index: 0,
    busy: false,
    initialised: false,
    available: false // false until stress.js is confirmed present
};

function dsRoundToStep(value, step) {
    const decimals = String(step).indexOf('.') === -1 ? 0 : String(step).split('.')[1].length;
    return Number(value.toFixed(decimals));
}

/* ---- controls ------------------------------------------------------------ */

function dsPopulateSelects() {
    const engine = window.MrzStress;
    Object.keys(engine.PRESETS).forEach(function (id) {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = engine.PRESETS[id].label;
        dsEls.dsPreset.appendChild(option);
    });
    const custom = document.createElement('option');
    custom.value = DS_PRESET_CUSTOM;
    custom.textContent = 'Custom (edited)';
    custom.disabled = true;
    dsEls.dsPreset.appendChild(custom);

    const mixed = document.createElement('option');
    mixed.value = 'mixed';
    mixed.textContent = 'Mixed — a random document per image';
    dsEls.dsDocType.appendChild(mixed);
    [['passport', 'Passport (TD3)'], ['idcard', 'ID card (TD2)'], ['visa', 'Visa (MRVA/MRVB)']]
        .forEach(function (pair) {
            const option = document.createElement('option');
            option.value = pair[0];
            option.textContent = pair[1];
            dsEls.dsDocType.appendChild(option);
        });
}

function dsBuildRows() {
    const engine = window.MrzStress;
    dsEls.dsRows.innerHTML = '';
    engine.DEGRADATIONS.forEach(function (degradation) {
        const row = document.createElement('tr');
        row.dataset.id = degradation.id;

        const cellOn = document.createElement('td');
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.className = 'range-check';
        check.setAttribute('aria-label', 'Apply ' + degradation.label);
        cellOn.appendChild(check);
        row.appendChild(cellOn);

        const cellName = document.createElement('td');
        const name = document.createElement('span');
        name.className = 'range-name';
        name.textContent = degradation.label;
        const hint = document.createElement('span');
        hint.className = 'range-hint';
        hint.textContent = degradation.hint;
        cellName.appendChild(name);
        cellName.appendChild(hint);
        row.appendChild(cellName);

        function numberCell(field) {
            const cell = document.createElement('td');
            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'range-input';
            input.min = degradation.min;
            input.max = degradation.max;
            input.step = degradation.step;
            input.setAttribute('aria-label', degradation.label + ' ' + field);
            cell.appendChild(input);
            return cell;
        }

        const cellMin = numberCell('minimum');
        const cellMax = numberCell('maximum');
        row.appendChild(cellMin);
        row.appendChild(cellMax);

        const cellUnit = document.createElement('td');
        cellUnit.textContent = degradation.unit;
        row.appendChild(cellUnit);

        dsEls.dsRows.appendChild(row);
        dsRows[degradation.id] = {
            row: row,
            check: check,
            min: cellMin.querySelector('input'),
            max: cellMax.querySelector('input')
        };

        check.addEventListener('change', function () {
            dsSyncRowState(degradation.id);
            dsMarkPresetEdited();
        });
        [dsRows[degradation.id].min, dsRows[degradation.id].max].forEach(function (input) {
            input.addEventListener('input', function () {
                const entry = dsRows[degradation.id];
                if (entry.check.checked) {
                    /* Mirror the value into the other bound so a single number
                       is a fixed value, which is what a reader expects from a
                       min/max pair. */
                    if (input === entry.min) entry.max.value = input.value;
                    else entry.min.value = input.value;
                }
                dsMarkPresetEdited();
            });
        });
    });
}

function dsSyncRowState(id) {
    const entry = dsRows[id];
    const on = entry.check.checked;
    entry.min.disabled = !on;
    entry.max.disabled = !on;
    entry.row.classList.toggle('is-off', !on);
}

/* ---- presets ------------------------------------------------------------- */

function dsCanonicalRanges(values) {
    const ids = Object.keys(values || {}).sort();
    return JSON.stringify(ids.map(function (id) { return [id, values[id]]; }));
}

function dsApplyPreset(id) {
    const engine = window.MrzStress;
    const preset = engine.PRESETS[id];
    if (!preset) return;
    dsState.preset = id;
    dsState.baseline = dsCanonicalRanges(preset.values);
    dsEls.dsPreset.value = id;
    dsEls.dsPresetNote.textContent = preset.note;
    dsEls.dsDifficulty.checked = !!preset.difficulty;

    engine.DEGRADATIONS.forEach(function (degradation) {
        const entry = dsRows[degradation.id];
        const range = preset.values[degradation.id];
        if (!range) {
            entry.check.checked = false;
            entry.min.value = dsRoundToStep(degradation.min, degradation.step);
            entry.max.value = dsRoundToStep(degradation.max, degradation.step);
        } else {
            entry.check.checked = true;
            entry.min.value = range[0];
            entry.max.value = range[1];
        }
        dsSyncRowState(degradation.id);
    });
}

function dsMarkPresetEdited() {
    const current = dsCanonicalRanges(dsReadRanges());
    const pristine = current === dsState.baseline;
    dsEls.dsPreset.value = pristine ? dsState.preset : DS_PRESET_CUSTOM;
    dsEls.dsPresetNote.textContent = pristine
        ? (window.MrzStress.PRESETS[dsState.preset] || {}).note || ''
        : 'Edited ranges — no longer the preset. Reload a preset to go back to a measured curve.';
}

/* ---- spec ---------------------------------------------------------------- */

function dsReadRanges() {
    const ranges = {};
    window.MrzStress.DEGRADATIONS.forEach(function (degradation) {
        const entry = dsRows[degradation.id];
        if (!entry.check.checked) return;
        let min = Number(entry.min.value);
        let max = Number(entry.max.value);
        if (!isFinite(min)) min = degradation.min;
        if (!isFinite(max)) max = degradation.max;
        min = Math.max(degradation.min, Math.min(degradation.max, min));
        max = Math.max(degradation.min, Math.min(degradation.max, max));
        if (max < min) { const swap = min; min = max; max = swap; }
        ranges[degradation.id] = [min, max];
    });
    return ranges;
}

function dsReadSpec() {
    return {
        seed: dsEls.dsSeed.value.trim() || 'codepool',
        samples: parseInt(dsEls.dsSamples.value, 10) || 12,
        docType: dsEls.dsDocType.value,
        difficulty: dsEls.dsDifficulty.checked,
        degradations: dsReadRanges()
    };
}

/* ---- build --------------------------------------------------------------- */

function dsShowError(element, message) {
    if (!message) {
        element.textContent = '';
        element.classList.remove('is-visible');
        return;
    }
    element.textContent = message;
    element.classList.add('is-visible');
}

function dsSetBusy(busy) {
    dsState.busy = busy;
    dsEls.dsBuildBtn.disabled = busy;
    dsEls.dsSeedBtn.disabled = busy;
    dsEls.dsResetBtn.disabled = busy;
    if (busy) {
        dsEls.dsProgress.hidden = false;
        dsEls.dsProgressBar.style.width = '0%';
        dsEls.dsZipBtn.disabled = true;
        dsEls.dsJsonBtn.disabled = true;
        dsEls.dsPngBtn.disabled = true;
    } else {
        dsEls.dsProgress.hidden = true;
    }
}

function buildDataset() {
    if (dsState.busy) return Promise.resolve(false);
    const engine = window.MrzStress;
    if (!engine) {
        dsShowError(dsEls.dsError,
            'The dataset engine did not load, so this mode cannot build images. '
            + 'Reload the page and check the console if it keeps failing.');
        return Promise.resolve(false);
    }
    const spec = engine.normalizeSpec(dsReadSpec());
    if (Object.keys(spec.degradations).length === 0 && dsState.preset !== 'clean') {
        dsShowError(dsEls.dsError,
            'Every degradation is switched off, so every image would be identical. Turn '
            + 'at least one on — or choose the Clean preset if you want the undegraded '
            + 'control group.');
        return Promise.resolve(false);
    }
    dsShowError(dsEls.dsError, null);

    dsShowError(dsEls.dsExportError, null);
    dsSetBusy(true);
    const started = Date.now();

    return engine.generateDataset(spec, function (index, total) {
        dsEls.dsProgressBar.style.width = Math.round((index / total) * 100) + '%';
        dsEls.dsProgressText.textContent = 'Rendering document ' + (index + 1) + ' of ' + total + '…';
        dsEls.dsStatus.textContent = 'Building…';
    }).then(function (data) {
        dsState.data = data;
        dsState.index = 0;
        dsEls.dsStatus.textContent = 'Built ' + data.samples.length + ' images in '
            + (Date.now() - started) + ' ms.';
        dsEls.dsProgressBar.style.width = '100%';
        dsEls.dsZipBtn.disabled = false;
        dsEls.dsJsonBtn.disabled = false;
        dsEls.dsPngBtn.disabled = false;
        dsShowSample(0);
        analytics.action('dataset_build', {
            images: data.samples.length,
            preset: dsState.preset,
            doc_type: spec.docType,
            seed: spec.seed
        });
        return true;
    }).catch(function (error) {
        console.error(error);
        dsShowError(dsEls.dsError, 'The dataset could not be built: ' + error.message);
        dsEls.dsStatus.textContent = 'Build failed.';
        return false;
    }).then(function (ok) {
        dsSetBusy(false);
        return ok;
    });
}

/* ---- preview ------------------------------------------------------------- */

function dsShowSample(index) {
    const data = dsState.data;
    if (!data || !data.samples.length) return;
    dsState.index = Math.max(0, Math.min(data.samples.length - 1, index));
    const sample = data.samples[dsState.index];

    const canvas = dsEls.dsCanvas;
    canvas.width = sample.canvas.width;
    canvas.height = sample.canvas.height;
    canvas.getContext('2d').drawImage(sample.canvas, 0, 0);

    const annotation = data.annotation.images[dsState.index];
    dsEls.dsCounter.textContent = (dsState.index + 1) + ' / ' + data.samples.length;
    dsEls.dsPrevBtn.disabled = dsState.index === 0;
    dsEls.dsNextBtn.disabled = dsState.index === data.samples.length - 1;
    dsEls.dsStatus.hidden = false;
    dsEls.dsPngBtn.disabled = false;

    dsEls.dsSampleStatus.textContent = sample.name
        + ' — ' + annotation.mrz.format
        + ', ' + sample.canvas.width + '×' + sample.canvas.height + ' px'
        + ', ' + (annotation.mrz.text.split('\n').length) + ' MRZ lines';

    dsRenderExpected(annotation);
    dsEls.dsApplied.textContent = 'Applied: ' + dsDescribeConditions(annotation.degradations);
}

function dsRenderExpected(annotation) {
    const rows = [
        ['Document type', annotation.mrz.format],
        ['Issuing state', annotation.mrz.issuingState],
        ['Document number', annotation.mrz.fields.documentNumber],
        ['Surname', annotation.mrz.fields.surname],
        ['Given names', annotation.mrz.fields.givenNames],
        ['Nationality', annotation.mrz.fields.nationality],
        ['Date of birth', annotation.mrz.fields.birthDate],
        ['Sex', annotation.mrz.fields.sex],
        ['Date of expiry', annotation.mrz.fields.expiryDate]
    ];
    const digits = annotation.mrz.checkDigits;
    if (digits) {
        if (digits.documentNumber !== null) rows.push(['Check digit — document number', digits.documentNumber]);
        if (digits.birthDate !== null) rows.push(['Check digit — birth date', digits.birthDate]);
        if (digits.expiryDate !== null) rows.push(['Check digit — expiry date', digits.expiryDate]);
        if (digits.composite !== null) rows.push(['Check digit — composite (TD3)', digits.composite]);
    }

    const body = dsEls.dsExpected;
    body.innerHTML = '';
    rows.forEach(function (pair) {
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        th.scope = 'row';
        th.textContent = pair[0];
        const td = document.createElement('td');
        td.textContent = pair[1];
        tr.appendChild(th);
        tr.appendChild(td);
        body.appendChild(tr);
    });

    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = 'MRZ';
    const td = document.createElement('td');
    const pre = document.createElement('span');
    pre.className = 'mrz-quoted';
    pre.textContent = annotation.mrz.text;
    td.appendChild(pre);
    tr.appendChild(th);
    tr.appendChild(td);
    body.appendChild(tr);
}

/* One line naming the conditions that actually shaped the image, most severe
   first — the formatter is the engine's, so the preview cannot describe an
   image with different rules than the annotation was written with. */
function dsDescribeConditions(conditions) {
    const labels = {};
    window.MrzStress.DEGRADATIONS.forEach(function (degradation) {
        labels[degradation.id] = degradation;
    });
    const parts = [];
    Object.keys(conditions).forEach(function (id) {
        if (id === 'inverted') {
            if (conditions[id]) parts.push('inverted');
            return;
        }
        if (id === 'crop_requested') {
            parts.push('frame kept requested ' + conditions[id]);
            return;
        }
        const degradation = labels[id];
        if (degradation) {
            parts.push(degradation.label.toLowerCase() + ' ' + conditions[id] + ' ' + degradation.unit);
        } else {
            parts.push(id + ' ' + conditions[id]);
        }
    });
    return parts.length ? parts.join(', ') : 'nothing applied';
}

/* ---- export -------------------------------------------------------------- */

function dsDownloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
}

function dsUtf8Bytes(text) {
    if (window.TextEncoder) return new TextEncoder().encode(text);
    const out = unescape(encodeURIComponent(text));
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i);
    return bytes;
}

function dsSeedSlug(seed) {
    return String(seed).replace(/[^A-Za-z0-9_-]+/g, '_') || 'dataset';
}

function dsExportZip() {
    const data = dsState.data;
    if (!data) return;
    dsShowError(dsEls.dsExportError, null);
    dsEls.dsZipBtn.disabled = true;
    dsEls.dsProgress.hidden = false;
    dsEls.dsProgressBar.style.width = '100%';
    dsEls.dsProgressText.textContent = 'Packing the ZIP…';

    Promise.all(data.samples.map(function (sample) {
        return sample.blob.arrayBuffer().then(function (buffer) {
            return { name: 'images/' + sample.name, data: new Uint8Array(buffer) };
        });
    })).then(function (images) {
        const json = JSON.stringify(data.annotation, null, 2);
        const entries = [{ name: 'annotations.json', data: dsUtf8Bytes(json) }].concat(images);
        dsDownloadBlob(window.MrzStress.buildZip(entries),
            'mrz-stress-' + dsSeedSlug(data.spec.seed) + '.zip');
        analytics.action('dataset_export', {
            kind: 'zip',
            images: data.annotation.total_images
        });
        dsEls.dsStatus.textContent = 'Exported ' + data.annotation.total_images
            + ' images and their ground truth. Drop the ZIP into the MRZ scanner benchmark.';
        dsEls.dsZipBtn.disabled = false;
        dsEls.dsProgress.hidden = true;
    }).catch(function (error) {
        console.error(error);
        dsEls.dsZipBtn.disabled = false;
        dsEls.dsProgress.hidden = true;
        dsShowError(dsEls.dsExportError, 'The ZIP could not be built: ' + error.message);
    });
}

function dsExportAnnotations() {
    const data = dsState.data;
    if (!data) return;
    dsDownloadBlob(new Blob([JSON.stringify(data.annotation, null, 2)],
        { type: 'application/json' }), 'annotations.json');
    analytics.action('dataset_export', { kind: 'annotations' });
}

function dsExportSample() {
    const data = dsState.data;
    if (!data) return;
    const sample = data.samples[dsState.index];
    dsDownloadBlob(sample.blob, sample.name);
    analytics.action('dataset_export', { kind: 'image' });
}

/* ---- mode ---------------------------------------------------------------- */

function setPageMode(mode) {
    const single = mode === 'single';
    dsEls.mode_single.hidden = !single;
    dsEls.mode_dataset.hidden = single;
    dsEls.modeTabSingle.classList.toggle('is-active', single);
    dsEls.modeTabDataset.classList.toggle('is-active', !single);
    dsEls.modeTabSingle.setAttribute('aria-selected', String(single));
    dsEls.modeTabDataset.setAttribute('aria-selected', String(!single));
    if (!single && dsState.available && !dsState.initialised) {
        dsState.initialised = true;
        /* Build straight away: an empty preview panel reads as a broken page,
           and the build is the point of the mode. */
        buildDataset();
        analytics.action('dataset_mode_open');
    }
}

function dsBind() {
    dsEls.modeTabSingle.addEventListener('click', function () { setPageMode('single'); });
    dsEls.modeTabDataset.addEventListener('click', function () { setPageMode('dataset'); });

    dsEls.dsPreset.addEventListener('change', function () {
        const value = dsEls.dsPreset.value;
        if (value === DS_PRESET_CUSTOM) return;
        dsApplyPreset(value);
    });
    dsEls.dsResetBtn.addEventListener('click', function () {
        dsApplyPreset(dsState.preset === DS_PRESET_CUSTOM ? 'mixed' : dsState.preset);
    });
    dsEls.dsBuildBtn.addEventListener('click', function () {
        buildDataset();
    });
    dsEls.dsSeedBtn.addEventListener('click', function () {
        /* A short, readable, URL-safe seed — the point is that it can be
           written down and typed back in. */
        dsEls.dsSeed.value = 'seed-' + Math.floor(Math.random() * 0xffffffff).toString(36);
        buildDataset();
    });
    dsEls.dsPrevBtn.addEventListener('click', function () { dsShowSample(dsState.index - 1); });
    dsEls.dsNextBtn.addEventListener('click', function () { dsShowSample(dsState.index + 1); });
    dsEls.dsZipBtn.addEventListener('click', dsExportZip);
    dsEls.dsJsonBtn.addEventListener('click', dsExportAnnotations);
    dsEls.dsPngBtn.addEventListener('click', dsExportSample);

    dsEls.dsSamples.addEventListener('change', function () {
        const max = window.MrzStress.MAX_SAMPLES;
        const value = parseInt(dsEls.dsSamples.value, 10);
        if (!isFinite(value)) dsEls.dsSamples.value = 1;
        else dsEls.dsSamples.value = Math.max(1, Math.min(Number(dsEls.dsSamples.max) || max, value));
    });
}

function initDataset() {
    /* Bind the tab before checking anything else. If the engine is missing —
       a stale cache, a blocked script, a partial deploy — an early return
       here leaves the tab inert, and the message explaining the problem is
       inside the panel the visitor can no longer open. "Clicking does
       nothing" is the one failure this page must not have, so the switch
       always works and the report lives inside it. */
    DS_IDS.forEach(function (id) { dsEls[id] = document.getElementById(id); });
    dsBind();

    if (!window.MrzStress) {
        const message = 'The dataset engine (stress.js) did not load, so this mode is '
            + 'unavailable. Reload the page and check the console if it keeps failing.';
        dsEls.dsError.textContent = message;
        dsEls.dsError.classList.add('is-visible');
        dsEls.dsStatus.textContent = 'This mode is unavailable.';
        dsEls.dsBuildBtn.disabled = true;
        console.error('[mrz generator] ' + message);
        return;
    }

    dsState.available = true;
    dsPopulateSelects();
    dsBuildRows();
    dsApplyPreset('mixed');
    dsEls.dsDocType.value = 'mixed';
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDataset);
} else {
    initDataset();
}

