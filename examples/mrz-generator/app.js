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

    /* The band is measured before the page is filled in: how much decoration
       fits above it depends on where it starts, and nothing drawn later may
       push it. */
    const mrz = mrzLayout(canvas, lines, docMargin, docWidth);

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

    // Photo area — a portrait drawn from the record, not a grey placeholder
    const photoX = docMargin + 50;
    const photoY = contentStartY;
    const photoWidth = 140;
    const photoHeight = 180;

    drawDocumentPhoto(ctx, photoX, photoY, photoWidth, photoHeight, data);

    // Photo frame
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.strokeRect(photoX, photoY, photoWidth, photoHeight);

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

    // Band above the MRZ: caption, rule, signature and security rosette
    drawMrzBandHints(ctx, {
        mrz: mrz,
        docMargin: docMargin,
        docWidth: docWidth,
        contentBottom: photoY + photoHeight,
        data: data,
        countryColor: bgConfig.colors[0],
        formatNote: MRZ_FORMAT_NOTES[data.docType] || 'ICAO 9303'
    });

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

/* How the band is labelled on the page — the ICAO 9303 layout the string was
   written in, so a reader can tell a TD3 from a MRV-A at a glance. */
const MRZ_FORMAT_NOTES = {
    'Passport(TD3)': 'ICAO 9303 · TD3 · 2 × 44',
    'ID Card(TD1)': 'ICAO 9303 · TD1 · 3 × 30',
    'ID Card(TD2)': 'ICAO 9303 · TD2 · 2 × 36',
    'Visa(A)': 'ICAO 9303 · MRV-A · 2 × 44',
    'Visa(B)': 'ICAO 9303 · MRV-B · 2 × 36'
};

/* ---------------------------------------------------------------------------
 * Portrait
 *
 * A data page without a face reads as a filled-in form, not a document — and
 * a reader demo that hands an SDK a form is testing the wrong thing. This
 * draws a studio headshot from primitives: no photograph, no external file,
 * no likeness of any person.
 *
 * The face is a function of the record, not of the moment. The interactive
 * preview redraws on every keystroke and the dataset renderer draws the same
 * document twice, so a portrait that changed between draws would look like a
 * bug rather than variety.
 * ------------------------------------------------------------------------- */

function portraitSeed(data) {
    const key = [data.surname, data.givenNames, data.docNumber,
        data.countryCode, data.birthDate, data.sex].join('|');
    let hash = 2166136261;
    for (let i = 0; i < key.length; i++) {
        hash ^= key.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function mulberry32(seed) {
    let state = seed >>> 0;
    return function () {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* Both arguments are 6-digit hex; `t` runs 0 (a) to 1 (b). */
function mixColor(a, b, t) {
    const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
    const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
    const out = pa.map(function (value, i) { return Math.round(value + (pb[i] - value) * t); });
    return 'rgb(' + out.join(',') + ')';
}

function drawDocumentPhoto(ctx, x, y, w, h, data) {
    const rnd = mulberry32(portraitSeed(data));
    function pick(list) { return list[Math.floor(rnd() * list.length)]; }
    const female = String(data.sex || '').toUpperCase() === 'F';

    const skin = pick(['#f4d8c3', '#eec6a8', '#e0b08d', '#c8946b', '#a9744c', '#7f563a']);
    const hairColor = pick(['#241a14', '#3a2819', '#54391f', '#7d5426', '#b98f4a',
        '#c9ae74', '#8c8c8c', '#2b2b31']);
    const cloth = pick(['#2a3548', '#33333d', '#463a30', '#1f2d36', '#573a3a', '#2c443c']);
    const iris = pick(['#4a6b8a', '#5c7f5e', '#6b5640', '#3d4a58', '#6f7f8c']);

    /* Framing follows a passport photo, not a portrait painting: the head
       fills most of the frame — crown near the top edge, chin around 74% of
       the height — and the shoulders are cut off at the bottom. A small head
       floating in background reads as a cartoon at 140 px. */
    const cx = x + w / 2;
    const headRX = w * 0.295;
    const headRY = h * 0.315;
    const headCY = y + h * 0.425;
    const crown = headCY - headRY;
    const chin = headCY + headRY;
    const eyeY = headCY - headRY * 0.02;
    const noseY = headCY + headRY * 0.42;
    const mouthY = headCY + headRY * 0.61;
    const hairlineY = headCY - headRY * (0.73 + rnd() * 0.05);
    const partOffset = (rnd() - 0.5) * headRX * 0.30;
    const longHair = female ? rnd() < 0.55 : rnd() < 0.06;

    ctx.save();

    /* Backdrop: the cool grey-blue of a photo booth, lit from behind. */
    const back = ctx.createLinearGradient(x, y, x, y + h);
    back.addColorStop(0, '#d8e1ea');
    back.addColorStop(0.62, '#b8c8d7');
    back.addColorStop(1, '#93a7bb');
    ctx.fillStyle = back;
    ctx.fillRect(x, y, w, h);

    const halo = ctx.createRadialGradient(cx, crown + headRY * 0.5, w * 0.02,
        cx, crown + headRY * 0.5, w * 0.85);
    halo.addColorStop(0, 'rgba(255,255,255,0.42)');
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(x, y, w, h);

    /* Neck, narrower than the jaw and shaded at both sides, so it does not
       read as a rectangle glued under the chin. */
    const neckTop = headCY + headRY * 0.78;
    const neckHW = w * 0.125;
    const neckFill = ctx.createLinearGradient(cx - neckHW, 0, cx + neckHW, 0);
    neckFill.addColorStop(0, mixColor(skin, '#000000', 0.30));
    neckFill.addColorStop(0.45, mixColor(skin, '#000000', 0.12));
    neckFill.addColorStop(1, mixColor(skin, '#000000', 0.30));
    ctx.fillStyle = neckFill;
    ctx.beginPath();
    ctx.moveTo(cx - neckHW * 0.80, neckTop);
    ctx.lineTo(cx - neckHW * 1.02, y + h);
    ctx.lineTo(cx + neckHW * 1.02, y + h);
    ctx.lineTo(cx + neckHW * 0.80, neckTop);
    ctx.closePath();
    ctx.fill();

    const shoulderY = y + h * 0.858;
    const jacket = ctx.createLinearGradient(x, shoulderY, x, y + h);
    jacket.addColorStop(0, mixColor(cloth, '#ffffff', 0.20));
    jacket.addColorStop(1, mixColor(cloth, '#000000', 0.24));
    ctx.fillStyle = jacket;
    ctx.beginPath();
    ctx.moveTo(x - 1, y + h);
    ctx.lineTo(x - 1, shoulderY + h * 0.03);
    ctx.quadraticCurveTo(cx, shoulderY - h * 0.09, x + w + 1, shoulderY + h * 0.03);
    ctx.lineTo(x + w + 1, y + h);
    ctx.closePath();
    ctx.fill();

    /* Open collar, so the silhouette reads as a person in a shirt. */
    ctx.fillStyle = mixColor('#f6f6f4', '#c4cad2', 0.26);
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.085, shoulderY + h * 0.012);
    ctx.lineTo(cx, shoulderY + h * 0.062);
    ctx.lineTo(cx + w * 0.085, shoulderY + h * 0.012);
    ctx.quadraticCurveTo(cx, shoulderY - h * 0.030, cx - w * 0.085, shoulderY + h * 0.012);
    ctx.closePath();
    ctx.fill();

    const hairBack = ctx.createLinearGradient(cx, crown - headRY * 0.2, cx, y + h);
    hairBack.addColorStop(0, mixColor(hairColor, '#ffffff', 0.13));
    hairBack.addColorStop(1, mixColor(hairColor, '#000000', 0.32));

    /* Long hair falls behind the head but in front of the shoulders. */
    if (longHair) {
        ctx.fillStyle = hairBack;
        ctx.beginPath();
        ctx.moveTo(cx - headRX * 0.86, crown + headRY * 0.16);
        ctx.bezierCurveTo(cx - headRX * 1.34, headCY + headRY * 0.36,
            cx - headRX * 1.18, y + h * 0.84, cx - headRX * 0.92, y + h * 0.90);
        ctx.lineTo(cx + headRX * 0.92, y + h * 0.90);
        ctx.bezierCurveTo(cx + headRX * 1.18, y + h * 0.84,
            cx + headRX * 1.34, headCY + headRY * 0.36, cx + headRX * 0.86, crown + headRY * 0.16);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = mixColor(hairColor, '#000000', 0.40);
        ctx.lineWidth = Math.max(0.7, w * 0.005);
        ctx.stroke();
    }

    /* Face: an oval with a chin point. A plain ellipse reads as a mask. */
    const face = ctx.createLinearGradient(cx - headRX, crown, cx + headRX * 0.7, chin);
    face.addColorStop(0, mixColor(skin, '#ffffff', 0.22));
    face.addColorStop(0.55, skin);
    face.addColorStop(1, mixColor(skin, '#000000', 0.10));
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.moveTo(cx, crown);
    ctx.bezierCurveTo(cx + headRX * 0.78, crown + headRY * 0.02,
        cx + headRX * 1.00, headCY - headRY * 0.34,
        cx + headRX * 0.96, headCY + headRY * 0.06);
    ctx.bezierCurveTo(cx + headRX * 0.94, headCY + headRY * 0.50,
        cx + headRX * 0.74, headCY + headRY * 0.82,
        cx + headRX * 0.38, headCY + headRY * 0.95);
    ctx.bezierCurveTo(cx + headRX * 0.18, headCY + headRY * 1.03,
        cx - headRX * 0.18, headCY + headRY * 1.03,
        cx - headRX * 0.38, headCY + headRY * 0.95);
    ctx.bezierCurveTo(cx - headRX * 0.74, headCY + headRY * 0.82,
        cx - headRX * 0.94, headCY + headRY * 0.50,
        cx - headRX * 0.96, headCY + headRY * 0.06);
    ctx.bezierCurveTo(cx - headRX * 1.00, headCY - headRY * 0.34,
        cx - headRX * 0.78, crown + headRY * 0.02,
        cx, crown);
    ctx.closePath();
    ctx.fill();

    /* Hair: one crescent from temple to temple. Its outer edge sits above the
       skull and its inner edge is the hairline, so the forehead stays skin —
       a hair ellipse drawn behind the head instead leaves a helmet rim
       running down past the jaw. */
    const templeY = headCY - headRY * 0.16;
    const templeX = headRX * 1.02;

    /* Filled from an outline that is drawn again whenever it is needed as a
       clip: the sheen and the strands must not spill onto the forehead, which
       is exactly what a freehand strand path does. */
    function hairOutline() {
        ctx.beginPath();
        ctx.moveTo(cx - templeX, templeY);
        ctx.bezierCurveTo(cx - headRX * 1.16, crown - headRY * 0.22,
            cx + headRX * 1.16, crown - headRY * 0.22,
            cx + templeX, templeY);
        ctx.bezierCurveTo(cx + headRX * 0.58 + partOffset * 0.4, hairlineY - headRY * 0.16,
            cx - headRX * 0.58 + partOffset * 0.4, hairlineY - headRY * 0.16,
            cx - templeX, templeY);
        ctx.closePath();
    }

    ctx.fillStyle = hairBack;
    hairOutline();
    ctx.fill();
    /* Outer edge only. Stroking the closed outline also strokes the
       hairline, which turns the hair into a headband. */
    ctx.strokeStyle = mixColor(hairColor, '#000000', 0.42);
    ctx.lineWidth = Math.max(0.7, w * 0.005);
    ctx.beginPath();
    ctx.moveTo(cx - templeX, templeY);
    ctx.bezierCurveTo(cx - headRX * 1.16, crown - headRY * 0.22,
        cx + headRX * 1.16, crown - headRY * 0.22,
        cx + templeX, templeY);
    ctx.stroke();

    /* Two cues that separate hair from a cap: a soft sheen across the crown
       and a few strands following the fall of the hair. */
    ctx.save();
    hairOutline();
    ctx.clip();

    const sheen = ctx.createRadialGradient(cx - headRX * 0.30, crown + headRY * 0.10, 1,
        cx - headRX * 0.30, crown + headRY * 0.10, headRX * 0.90);
    sheen.addColorStop(0, 'rgba(255,255,255,0.20)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.beginPath();
    ctx.ellipse(cx - headRX * 0.15, crown + headRY * 0.18, headRX * 0.75, headRY * 0.30,
        -0.22, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,0,0,0.085)';
    ctx.lineWidth = Math.max(0.6, w * 0.005);
    for (let i = 0; i < 11; i++) {
        const spread = (i / 10 - 0.5) * 1.9;
        ctx.beginPath();
        ctx.moveTo(cx + spread * headRX * 0.22, crown - headRY * 0.10);
        ctx.quadraticCurveTo(cx + spread * headRX * 0.72, headCY - headRY * 0.52,
            cx + spread * headRX * 0.95, hairlineY + headRY * 0.02);
        ctx.stroke();
    }
    ctx.restore();

    /* Ears, in front of the hair, at eye-to-nose level. */
    [-1, 1].forEach(function (side) {
        ctx.fillStyle = mixColor(skin, '#000000', 0.08);
        ctx.beginPath();
        ctx.ellipse(cx + side * headRX * 0.98, headCY + headRY * 0.02,
            headRX * 0.10, headRY * 0.17, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = mixColor(skin, '#000000', 0.26);
        ctx.lineWidth = Math.max(0.6, w * 0.004);
        ctx.beginPath();
        ctx.arc(cx + side * headRX * 0.98, headCY + headRY * 0.02,
            headRX * 0.05, -Math.PI * 0.55, Math.PI * 0.55);
        ctx.stroke();
    });

    /* Brows. */
    const eyeDX = headRX * 0.415;
    const eyeRX = headRX * 0.175;
    const eyeRY = headRY * 0.068;
    const browY = eyeY - headRY * 0.20;
    ctx.strokeStyle = mixColor(hairColor, '#2a1c14', 0.45);
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1, w * 0.011);
    [-1, 1].forEach(function (side) {
        ctx.beginPath();
        ctx.moveTo(cx + side * (eyeDX - headRX * 0.24), browY + headRY * 0.04);
        ctx.quadraticCurveTo(cx + side * eyeDX, browY - headRY * 0.06,
            cx + side * (eyeDX + headRX * 0.22), browY + headRY * 0.02);
        ctx.stroke();
    });

    /* Eyes: socket shading, sclera, iris, pupil, catchlight, upper lid. */
    [-1, 1].forEach(function (side) {
        const ex = cx + side * eyeDX;
        ctx.fillStyle = 'rgba(120, 88, 72, 0.10)';
        ctx.beginPath();
        ctx.ellipse(ex, eyeY - headRY * 0.02, eyeRX * 1.35, eyeRY * 1.7, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#f8f5f1';
        ctx.beginPath();
        ctx.ellipse(ex, eyeY, eyeRX, eyeRY, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = iris;
        ctx.beginPath();
        ctx.arc(ex, eyeY + headRY * 0.006, eyeRY * 0.92, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#241a1c';
        ctx.beginPath();
        ctx.arc(ex, eyeY + headRY * 0.006, eyeRY * 0.44, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.beginPath();
        ctx.arc(ex - eyeRY * 0.30, eyeY - eyeRY * 0.34, eyeRY * 0.19, 0, Math.PI * 2);
        ctx.fill();

        /* A soft crease above the eye and a lash line along its top edge —
           a filled lid at 7 px of eye height just closes the eye. */
        ctx.fillStyle = 'rgba(96, 66, 52, 0.07)';
        ctx.beginPath();
        ctx.ellipse(ex, eyeY - eyeRY * 1.05, eyeRX * 1.10, eyeRY * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = mixColor(skin, '#2d1f1a', 0.55);
        ctx.lineWidth = Math.max(0.9, w * 0.006);
        ctx.beginPath();
        ctx.ellipse(ex, eyeY, eyeRX, eyeRY, 0, Math.PI * 1.05, Math.PI * 1.95);
        ctx.stroke();
    });

    /* Nose: one soft shadow line and two nostrils — enough at this size. */
    const bridge = ctx.createLinearGradient(cx - headRX * 0.16, 0, cx + headRX * 0.20, 0);
    bridge.addColorStop(0, 'rgba(112, 78, 60, 0)');
    bridge.addColorStop(0.62, 'rgba(112, 78, 60, 0.13)');
    bridge.addColorStop(1, 'rgba(112, 78, 60, 0)');
    ctx.fillStyle = bridge;
    ctx.beginPath();
    ctx.ellipse(cx + headRX * 0.05, eyeY + headRY * 0.24,
        headRX * 0.16, headRY * 0.30, 0, 0, Math.PI * 2);
    ctx.fill();

    const noseShadow = ctx.createRadialGradient(cx, noseY - headRY * 0.02, 1,
        cx, noseY, headRX * 0.30);
    noseShadow.addColorStop(0, 'rgba(112, 78, 60, 0.22)');
    noseShadow.addColorStop(1, 'rgba(112, 78, 60, 0)');
    ctx.fillStyle = noseShadow;
    ctx.beginPath();
    ctx.ellipse(cx, noseY, headRX * 0.30, headRY * 0.10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(98, 64, 48, 0.32)';
    [-1, 1].forEach(function (side) {
        ctx.beginPath();
        ctx.ellipse(cx + side * headRX * 0.10, noseY + headRY * 0.015,
            headRX * 0.038, headRY * 0.014, 0, 0, Math.PI * 2);
        ctx.fill();
    });

    /* Mouth. */
    const lipWidth = headRX * 0.30;
    ctx.fillStyle = mixColor(skin, '#a2453f', female ? 0.62 : 0.46);
    ctx.beginPath();
    ctx.moveTo(cx - lipWidth, mouthY);
    ctx.quadraticCurveTo(cx - lipWidth * 0.40, mouthY - headRY * 0.095,
        cx, mouthY - headRY * 0.02);
    ctx.quadraticCurveTo(cx + lipWidth * 0.40, mouthY - headRY * 0.095,
        cx + lipWidth, mouthY);
    ctx.quadraticCurveTo(cx, mouthY + headRY * 0.115,
        cx - lipWidth, mouthY);
    ctx.fill();
    ctx.strokeStyle = 'rgba(112, 52, 46, 0.38)';
    ctx.lineWidth = Math.max(0.7, w * 0.005);
    ctx.beginPath();
    ctx.moveTo(cx - lipWidth * 0.92, mouthY);
    ctx.quadraticCurveTo(cx, mouthY + headRY * 0.018, cx + lipWidth * 0.92, mouthY);
    ctx.stroke();

    /* Cheek warmth and the shadow the chin throws on the neck. */
    [-1, 1].forEach(function (side) {
        const blushX = cx + side * headRX * 0.58;
        const blushY = headCY + headRY * 0.30;
        const blush = ctx.createRadialGradient(blushX, blushY, 1, blushX, blushY, headRX * 0.46);
        blush.addColorStop(0, 'rgba(204, 108, 92, 0.14)');
        blush.addColorStop(1, 'rgba(204, 108, 92, 0)');
        ctx.fillStyle = blush;
        ctx.beginPath();
        ctx.arc(blushX, blushY, headRX * 0.46, 0, Math.PI * 2);
        ctx.fill();
    });

    const jaw = ctx.createRadialGradient(cx, headCY + headRY * 1.02, 1,
        cx, headCY + headRY * 1.02, headRX * 0.80);
    jaw.addColorStop(0, 'rgba(70, 48, 38, 0.22)');
    jaw.addColorStop(1, 'rgba(70, 48, 38, 0)');
    ctx.fillStyle = jaw;
    ctx.beginPath();
    ctx.ellipse(cx, headCY + headRY * 1.02, headRX * 0.80, headRY * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();

    /* Print grain and a slight vignette: what separates a photo from a
       drawing at this size. */
    for (let i = 0; i < 520; i++) {
        ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(20,28,40,0.045)';
        ctx.fillRect(x + rnd() * w, y + rnd() * h, 1.3, 1.3);
    }

    const vignette = ctx.createRadialGradient(cx, headCY, w * 0.36,
        cx, headCY, w * 1.02);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(14, 22, 34, 0.24)');
    ctx.fillStyle = vignette;
    ctx.fillRect(x, y, w, h);

    ctx.restore();
}

/* ---------------------------------------------------------------------------
 * Page furniture between the fields and the MRZ band
 *
 * A passport data page carries more than fields: a signature, a security
 * rosette and a caption on the machine-readable zone. Leaving that space empty
 * made the preview read as a form with an MRZ bolted on. Everything here is
 * decoration, so a layout with no room (TD1 puts the band 80 px under the
 * photo) drops it instead of squeezing it.
 * ------------------------------------------------------------------------- */

function drawSignature(ctx, x, baselineY, maxWidth, data) {
    const rnd = mulberry32(portraitSeed(data) ^ 0x5bd1e995);
    ctx.save();
    ctx.strokeStyle = 'rgba(28, 38, 56, 0.62)';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();

    const loops = 3 + Math.floor(rnd() * 3);
    const step = maxWidth / loops;
    let cursor = x;
    ctx.moveTo(cursor, baselineY);
    for (let i = 0; i < loops; i++) {
        const reach = step * (0.70 + rnd() * 0.45);
        const rise = 9 + rnd() * 13;
        ctx.bezierCurveTo(cursor + reach * 0.18, baselineY - rise,
            cursor + reach * 0.62, baselineY + rise * 0.55,
            cursor + reach, baselineY - rise * 0.28);
        cursor += reach;
    }

    ctx.moveTo(x + 4, baselineY + 6);
    ctx.quadraticCurveTo(x + maxWidth * 0.55, baselineY + 13 + rnd() * 4,
        Math.min(cursor + 16, x + maxWidth), baselineY + 1);
    ctx.stroke();
    ctx.restore();
}

/* Guilloche rosette — overlapping rotated ellipses, the pattern printed on
   almost every passport. Stroke count is fixed, so the cost is the same for
   one preview or a hundred dataset images. */
function drawGuilloche(ctx, cx, cy, radius, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.8;
    ctx.globalAlpha = 0.13;
    for (let i = 0; i < 54; i++) {
        const angle = (Math.PI * 2 * i) / 54;
        const squash = 0.10 + ((i * 7) % 5) * 0.045;
        ctx.beginPath();
        ctx.ellipse(cx, cy, radius, radius * squash, angle, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.globalAlpha = 0.20;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.96, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

function drawMrzBandHints(ctx, opts) {
    const docMargin = opts.docMargin;
    const docWidth = opts.docWidth;
    const left = docMargin + 50;
    const right = docMargin + docWidth - 50;
    const dividerY = opts.mrz.y - 16;
    const gap = dividerY - opts.contentBottom;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 9px Arial';
    ctx.fillText('MACHINE READABLE ZONE', left, dividerY - 9);

    ctx.textAlign = 'right';
    ctx.font = '9px Arial';
    ctx.fillText(opts.formatNote, right, dividerY - 9);

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, dividerY + 0.5);
    ctx.lineTo(right, dividerY + 0.5);
    ctx.stroke();

    if (gap >= 96) {
        ctx.textAlign = 'left';
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 9px Arial';
        ctx.fillText('HOLDER SIGNATURE', left, opts.contentBottom + 26);

        const lineY = opts.contentBottom + 62;
        ctx.strokeStyle = '#c3ccd6';
        ctx.beginPath();
        ctx.moveTo(left, lineY + 0.5);
        ctx.lineTo(left + 200, lineY + 0.5);
        ctx.stroke();

        drawSignature(ctx, left + 8, lineY - 4, 182, opts.data);
    }

    if (gap >= 150) {
        drawGuilloche(ctx, docMargin + docWidth * 0.64,
            opts.contentBottom + gap * 0.46,
            Math.min(78, gap * 0.46), opts.countryColor);
    }
    ctx.restore();
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

