// Train Analytics Dashboard - Main Application Logic
// Initialize Chart.js plugins
Chart.register(ChartDataLabels);

// ============================================================
// CONFIGURATION & STATE
// ============================================================
let TRAIN_ROUTE = (typeof window !== 'undefined' && Array.isArray(window.DEFAULT_TRAIN_ROUTE) && window.DEFAULT_TRAIN_ROUTE.length > 1)
    ? [...window.DEFAULT_TRAIN_ROUTE]
    : [
        "CUPJ", "CDM", "SY", "MV", "KTM", "ADT", "KMU", "PML", "TJ", 
        "BAL", "TRB", "TPJ", "TP", "KLT", "KRR", "PGR", "KMD", "URL", 
        "ED", "SA", "DPJ", "HSRA", "CRLM", "BNCE", "BNC", "SBC", "KGI", 
        "MAD", "MYA", "MYS"
    ];

let uploadedFiles = [];
let processing = false;
let currentReportHTML = '';
let currentReportData = null;
let uploadedTrainMetadata = {};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function getStationIndex(station) {
    return TRAIN_ROUTE.indexOf(station);
}

function getAllSegmentsBetween(fromStation, toStation) {
    const segments = [];
    const fromIdx = getStationIndex(fromStation);
    const toIdx = getStationIndex(toStation);
    if (fromIdx === -1 || toIdx === -1 || fromIdx >= toIdx) return segments;
    for (let i = fromIdx; i < toIdx; i++) {
        segments.push(`${TRAIN_ROUTE[i]}→${TRAIN_ROUTE[i+1]}`);
    }
    return segments;
}

function escapeHtml(str) {
    return String(str).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = 'notification';
    if (type === 'error') notification.classList.add('notification-error');
    if (type === 'info') notification.classList.add('notification-info');
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

function normalizeRoute(route) {
    if (!Array.isArray(route)) return [];
    return route
        .map(station => {
            if (typeof station === 'string') return station.trim().toUpperCase();
            if (!station || typeof station !== 'object') return '';
            const code = station.stationCode || station.stnCode || station.code || station.station || station.stn || '';
            return typeof code === 'string' ? code.trim().toUpperCase() : '';
        })
        .filter(Boolean);
}

function isValidRoute(route) {
    return Array.isArray(route) && route.length >= 2 && route.every(station => typeof station === 'string' && station.trim().length > 0);
}

function findFirstDeep(obj, keys) {
    if (!obj || typeof obj !== 'object') return '';
    for (const key of keys) {
        if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
    }
    for (const value of Object.values(obj)) {
        if (value && typeof value === 'object') {
            const found = findFirstDeep(value, keys);
            if (found !== undefined && found !== null && found !== '') return found;
        }
    }
    return '';
}

function normalizeRunningDays(value, source = {}) {
    const dayMap = [
        ['Mon', ['mon', 'monday', 'runsOnMon', 'trainRunsOnMon']],
        ['Tue', ['tue', 'tues', 'tuesday', 'runsOnTue', 'trainRunsOnTue']],
        ['Wed', ['wed', 'wednesday', 'runsOnWed', 'trainRunsOnWed']],
        ['Thu', ['thu', 'thur', 'thurs', 'thursday', 'runsOnThu', 'trainRunsOnThu']],
        ['Fri', ['fri', 'friday', 'runsOnFri', 'trainRunsOnFri']],
        ['Sat', ['sat', 'saturday', 'runsOnSat', 'trainRunsOnSat']],
        ['Sun', ['sun', 'sunday', 'runsOnSun', 'trainRunsOnSun']]
    ];

    if (Array.isArray(value)) {
        return value
            .map(item => typeof item === 'string' ? item.slice(0, 3) : item?.day || item?.name || item?.code || '')
            .map(day => day.charAt(0).toUpperCase() + day.slice(1).toLowerCase())
            .filter(day => dayMap.some(([label]) => label === day));
    }

    if (typeof value === 'object' && value) {
        return normalizeRunningDays('', value);
    }

    const text = String(value || '').toLowerCase();
    return dayMap
        .filter(([label, keys]) => {
            return keys.some(key => {
                const flag = source[key];
                return flag === true || flag === 'Y' || flag === 'YES' || flag === '1' || flag === 1;
            }) || keys.some(key => text.split(/[^a-z]+/).includes(key.toLowerCase()));
        })
        .map(([label]) => label);
}

function extractRunningDaysFromSources(sources) {
    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const found = [];
    for (const source of sources) {
        if (!source || typeof source !== 'object') continue;
        for (const day of weekDays) {
            const flag = source[`trainRunsOn${day}`] ?? source[`runsOn${day}`];
            if (flag === true || flag === 'Y' || flag === 'YES' || flag === '1' || flag === 1) {
                if (!found.includes(day)) found.push(day);
            }
        }
    }
    if (found.length > 0) return found;

    const runningDaysRaw = sources
        .map(src => findFirstDeep(src, ['runningDays', 'runDays', 'daysOfRun', 'runsOn', 'trainRunsOn']))
        .find(Boolean);
    return normalizeRunningDays(runningDaysRaw, Object.assign({}, ...sources.filter(src => src && typeof src === 'object')));
}

function parseJourneyDateFromFilename(fileName) {
    const match = String(fileName || '').match(/\b(\d{2})(\d{2})\b/);
    if (!match) return '';
    const [, dd, mm] = match;
    const year = new Date().getFullYear();
    return `${year}-${mm}-${dd}`;
}

function formatJourneyDate(value) {
    if (!value) return '';
    const raw = String(value).trim();
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    const compact = raw.match(/^(\d{2})(\d{2})(\d{4})?$/);
    if (compact) return `${compact[1]}/${compact[2]}${compact[3] ? `/${compact[3]}` : ''}`;
    return raw;
}

function getJourneyDay(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
}

function calculateDurationFromStations(firstStation, lastStation) {
    const start = String(firstStation?.departureTime || '').match(/^(\d{2}):(\d{2})$/);
    const end = String(lastStation?.arrivalTime || '').match(/^(\d{2}):(\d{2})$/);
    if (!start || !end) return '';
    const startDay = Number(firstStation.dayCount || 1);
    const endDay = Number(lastStation.dayCount || startDay);
    const startMinutes = (startDay - 1) * 1440 + Number(start[1]) * 60 + Number(start[2]);
    const endMinutes = (endDay - 1) * 1440 + Number(end[1]) * 60 + Number(end[2]);
    const diff = endMinutes - startMinutes;
    if (diff <= 0) return '';
    const hours = Math.floor(diff / 60);
    const minutes = diff % 60;
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

function extractScheduleMetadata(parsed, route) {
    const train = parsed.train && typeof parsed.train === 'object' ? parsed.train : {};
    const trainDetails = parsed.trainDetails && typeof parsed.trainDetails === 'object' ? parsed.trainDetails : {};
    const sources = [parsed, train, trainDetails];
    const runningDays = extractRunningDaysFromSources(sources);
    const stationList = Array.isArray(parsed.stationList) ? parsed.stationList
        : Array.isArray(train.stationList) ? train.stationList
        : Array.isArray(trainDetails.stationList) ? trainDetails.stationList
        : [];
    const firstStation = stationList[0] || {};
    const lastStation = stationList[stationList.length - 1] || {};

    const rawDuration = parsed.duration || train.duration || trainDetails.duration || '';
    const calculatedDuration = calculateDurationFromStations(firstStation, lastStation);

    return {
        journeyDate: sources.map(src => findFirstDeep(src, ['journeyDate', 'dateOfJourney', 'doj', 'chartDate', 'departureDate'])).find(Boolean) || '',
        runningDays,
        distanceKm: lastStation.distance || lastStation.distanceKm || parsed.distanceKm || train.distanceKm || '',
        startTime: firstStation.departureTime || firstStation.depTime || parsed.startTime || train.startTime || '',
        endTime: lastStation.arrivalTime || lastStation.arrTime || parsed.endTime || train.endTime || '',
        duration: rawDuration && rawDuration !== '0' ? rawDuration : calculatedDuration
    };
}

function extractTrainMetadata(parsed) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const train = parsed.train && typeof parsed.train === 'object' ? parsed.train : {};
    const trainDetails = parsed.trainDetails && typeof parsed.trainDetails === 'object' ? parsed.trainDetails : {};
    const route = normalizeRoute(parsed.route || train.route || parsed.stationList || trainDetails.stationList || trainDetails.stationDetails);
    const schedule = extractScheduleMetadata(parsed, route);
    return {
        trainNumber: parsed.trainNumber || parsed.trainNo || train.number || train.trainNumber || trainDetails.trainNo || trainDetails.trainNumber || '',
        trainName: parsed.trainName || train.name || train.trainName || trainDetails.trainName || trainDetails.name || '',
        trainType: parsed.trainType || parsed.type || train.type || train.trainType || trainDetails.trainType || trainDetails.type || '',
        sourceStation: parsed.sourceStation || parsed.fromStation || parsed.stationFrom || train.sourceStation || train.fromStation || trainDetails.sourceStation || trainDetails.fromStation || trainDetails.stationFrom || route[0] || '',
        destinationStation: parsed.destinationStation || parsed.toStation || parsed.stationTo || train.destinationStation || train.toStation || trainDetails.destinationStation || trainDetails.toStation || trainDetails.stationTo || route[route.length - 1] || '',
        route,
        trainDetails: parsed.trainDetails || null,
        ...schedule
    };
}

function normalizeUploadedJson(parsed) {
    if (Array.isArray(parsed)) {
        return { coaches: parsed, metadata: {} };
    }

    if (!parsed || typeof parsed !== 'object') {
        return { coaches: [], metadata: {} };
    }

    const metadata = extractTrainMetadata(parsed);
    let coaches = [];
    if (Array.isArray(parsed.coaches)) {
        coaches = parsed.coaches;
    } else if (Array.isArray(parsed.coachData)) {
        coaches = parsed.coachData;
    } else if (Array.isArray(parsed.data)) {
        coaches = parsed.data;
    } else if (parsed.bdd || parsed.coachName) {
        coaches = [parsed];
    }

    coaches = coaches.map(coach => ({
        ...coach,
        trainNumber: coach.trainNumber || coach.trainNo || metadata.trainNumber || '',
        trainNo: coach.trainNo || coach.trainNumber || metadata.trainNumber || '',
        trainName: coach.trainName || metadata.trainName || '',
        trainType: coach.trainType || metadata.trainType || '',
        sourceStation: coach.sourceStation || metadata.sourceStation || '',
        destinationStation: coach.destinationStation || metadata.destinationStation || ''
    }));

    return { coaches, metadata };
}

function storeUploadedMetadata(metadata, fileName = '') {
    if (!uploadedTrainMetadata.trainNumber && metadata.trainNumber) uploadedTrainMetadata.trainNumber = metadata.trainNumber;
    if (!uploadedTrainMetadata.trainName && metadata.trainName) uploadedTrainMetadata.trainName = metadata.trainName;
    if (!uploadedTrainMetadata.trainType && metadata.trainType) uploadedTrainMetadata.trainType = metadata.trainType;
    if (!uploadedTrainMetadata.sourceStation && metadata.sourceStation) uploadedTrainMetadata.sourceStation = metadata.sourceStation;
    if (!uploadedTrainMetadata.destinationStation && metadata.destinationStation) uploadedTrainMetadata.destinationStation = metadata.destinationStation;
    if (!uploadedTrainMetadata.trainDetails && metadata.trainDetails) uploadedTrainMetadata.trainDetails = metadata.trainDetails;
    if (!uploadedTrainMetadata.journeyDate) uploadedTrainMetadata.journeyDate = metadata.journeyDate || parseJourneyDateFromFilename(fileName);
    if (!uploadedTrainMetadata.distanceKm && metadata.distanceKm) uploadedTrainMetadata.distanceKm = metadata.distanceKm;
    if (!uploadedTrainMetadata.startTime && metadata.startTime) uploadedTrainMetadata.startTime = metadata.startTime;
    if (!uploadedTrainMetadata.endTime && metadata.endTime) uploadedTrainMetadata.endTime = metadata.endTime;
    if (!uploadedTrainMetadata.duration && metadata.duration) uploadedTrainMetadata.duration = metadata.duration;
    if ((!uploadedTrainMetadata.runningDays || uploadedTrainMetadata.runningDays.length === 0) && metadata.runningDays?.length) {
        uploadedTrainMetadata.runningDays = metadata.runningDays;
    }
}

function applyUploadedRoute(route) {
    if (!isValidRoute(route)) return false;
    TRAIN_ROUTE = [...route];
    return true;
}

// ============================================================
// FILE UPLOAD HANDLING
// FILE UPLOAD HANDLING continues below
function setupFileUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files);
        handleFiles(files);
    });

    fileInput.addEventListener('change', function(e) {
        const files = Array.from(e.target.files);
        handleFiles(files);
    });
}

function handleFiles(files) {
    uploadedFiles = files.filter(f => f.name.endsWith('.json') || f.name.endsWith('.txt'));
    uploadedTrainMetadata = {};
    const fileInfo = document.getElementById('fileInfo');
    
    if (uploadedFiles.length === 0) {
        fileInfo.style.display = 'block';
        fileInfo.className = 'file-info error';
        fileInfo.innerHTML = '❌ Please upload valid JSON or TXT files';
        document.getElementById('processBtn').disabled = true;
        return;
    }

    fileInfo.style.display = 'block';
    fileInfo.className = 'file-info';
    fileInfo.innerHTML = `✅ ${uploadedFiles.length} file(s) selected: ${uploadedFiles.map(f => f.name).join(', ')}`;
    document.getElementById('processBtn').disabled = false;
    previewUploadedMetadata();
}

async function previewUploadedMetadata() {
    const fileInfo = document.getElementById('fileInfo');
    for (const file of uploadedFiles) {
        try {
            const parsed = JSON.parse(await file.text());
            const { metadata } = normalizeUploadedJson(parsed);
            storeUploadedMetadata(metadata, file.name);
            if (isValidRoute(metadata.route)) {
                applyUploadedRoute(metadata.route);
                uploadedTrainMetadata.route = metadata.route;
                const fromTo = metadata.sourceStation && metadata.destinationStation ? ` | ${escapeHtml(metadata.sourceStation)} -> ${escapeHtml(metadata.destinationStation)}` : '';
                fileInfo.innerHTML += `<br>Route loaded: ${metadata.route.length} stations${fromTo}${metadata.trainNumber ? ` | Train ${escapeHtml(metadata.trainNumber)}` : ''}${metadata.trainName ? ` ${escapeHtml(metadata.trainName)}` : ''}`;
                return;
            }
        } catch (_) {
            // Parsing errors are shown during full processing so multi-file uploads can still proceed.
        }
    }
}

// ============================================================
// ANALYTICS PROCESSING
// ============================================================
async function processFiles() {
    if (uploadedFiles.length === 0) {
        showNotification('Please upload at least one JSON file', 'error');
        return;
    }

    if (processing) {
        showNotification('Already processing...', 'info');
        return;
    }

    processing = true;
    document.getElementById('processBtn').disabled = true;
    document.getElementById('reportContent').innerHTML = '<div class="loading"><div class="spinner"></div><p>Processing files...</p></div>';

    try {
        const allCoaches = [];
        let routeAppliedFromUpload = false;
        uploadedTrainMetadata = {};
        for (const file of uploadedFiles) {
            const text = await file.text();
            try {
                const parsed = JSON.parse(text);
                const { coaches, metadata } = normalizeUploadedJson(parsed);
                storeUploadedMetadata(metadata, file.name);
                if (!routeAppliedFromUpload && isValidRoute(metadata.route)) {
                    applyUploadedRoute(metadata.route);
                    uploadedTrainMetadata.route = metadata.route;
                    routeAppliedFromUpload = true;
                }
                allCoaches.push(...coaches);
            } catch (e) {
                showNotification(`Failed to parse ${file.name}: ${e.message}`, 'error');
            }
        }

        if (allCoaches.length === 0) {
            document.getElementById('reportContent').innerHTML = '<div class="error">❌ No valid coach data found</div>';
            processing = false;
            document.getElementById('processBtn').disabled = false;
            return;
        }

        if (routeAppliedFromUpload) {
            showNotification(`Route loaded from JSON (${TRAIN_ROUTE.length} stations)`, 'success');
        }

        generateReport(allCoaches);
    } catch (error) {
        showNotification(`Error: ${error.message}`, 'error');
        document.getElementById('reportContent').innerHTML = `<div class="error">❌ Error: ${error.message}</div>`;
    } finally {
        processing = false;
        document.getElementById('processBtn').disabled = false;
    }
}

function generateReport(allCoaches) {
    const segmentOccupancy = {};
    const stationBoardings = {};
    const stationDeboardings = {};
    const stationClassBoardings = {};
    const stationClassDeboardings = {};
    const stationClassOd = {};
    const classSeatTotals = {};
    const stationBookings = {};
    const odMatrix = {};
    const coachPassengers = {};
    let totalPassengers = 0;
    let totalSeats = 0;

    // initialize segments and stations
    for (let i = 0; i < TRAIN_ROUTE.length - 1; i++) segmentOccupancy[`${TRAIN_ROUTE[i]}→${TRAIN_ROUTE[i+1]}`] = 0;
    TRAIN_ROUTE.forEach(s => { stationBoardings[s] = 0; stationDeboardings[s] = 0; stationBookings[s] = 0; });

    // Process each coach using the sample JSON schema (coach.bdd -> berth.bsd)
    allCoaches.forEach((coach, cIdx) => {
        if (!coach.bdd || !Array.isArray(coach.bdd)) return;
        const coachNameKey = coach.coachName || `Coach_${cIdx+1}`;
        const coachClass = coach.coachClass || coach.coach_type || coach.class || coach.type || 'Unknown';
        coachPassengers[coachNameKey] = coach.bdd.length;
        totalSeats += coach.bdd.length;
        // accumulate seats per coach class for occupied/total display
        classSeatTotals[coachClass] = (classSeatTotals[coachClass] || 0) + coach.bdd.length;

        for (const berth of coach.bdd) {
            if (!berth.bsd || !Array.isArray(berth.bsd)) continue;
            let journeyStart = null, journeyEnd = null, isOnBoard = false;
            for (const seg of berth.bsd) {
                if (seg.occupancy === true && !isOnBoard) {
                    journeyStart = seg.from;
                    isOnBoard = true;
                } else if (seg.occupancy === false && isOnBoard) {
                    journeyEnd = seg.from;
                    break;
                }
            }
            if (isOnBoard && !journeyEnd && berth.bsd.length > 0) journeyEnd = berth.bsd[berth.bsd.length - 1].to;

            if (journeyStart && journeyEnd && journeyStart !== journeyEnd) {
                const fromIdx = getStationIndex(journeyStart);
                const toIdx = getStationIndex(journeyEnd);
                if (fromIdx === -1 || toIdx === -1 || fromIdx >= toIdx) continue;
                const traveledSegments = getAllSegmentsBetween(journeyStart, journeyEnd);
                if (traveledSegments.length === 0) continue;

                totalPassengers++;
                stationBoardings[journeyStart] = (stationBoardings[journeyStart] || 0) + 1;
                stationBookings[journeyStart] = (stationBookings[journeyStart] || 0) + 1;
                stationDeboardings[journeyEnd] = (stationDeboardings[journeyEnd] || 0) + 1;
                // Track class-wise boardings/deboardings per station
                stationClassBoardings[journeyStart] = stationClassBoardings[journeyStart] || {};
                stationClassBoardings[journeyStart][coachClass] = (stationClassBoardings[journeyStart][coachClass] || 0) + 1;
                stationClassDeboardings[journeyEnd] = stationClassDeboardings[journeyEnd] || {};
                stationClassDeboardings[journeyEnd][coachClass] = (stationClassDeboardings[journeyEnd][coachClass] || 0) + 1;
                // Track class-wise OD (origin -> destination -> class)
                stationClassOd[journeyStart] = stationClassOd[journeyStart] || {};
                stationClassOd[journeyStart][journeyEnd] = stationClassOd[journeyStart][journeyEnd] || {};
                stationClassOd[journeyStart][journeyEnd][coachClass] = (stationClassOd[journeyStart][journeyEnd][coachClass] || 0) + 1;
                odMatrix[journeyStart] = odMatrix[journeyStart] || {};
                odMatrix[journeyStart][journeyEnd] = (odMatrix[journeyStart][journeyEnd] || 0) + 1;

                for (const segKey of traveledSegments) {
                    segmentOccupancy[segKey] = (segmentOccupancy[segKey] || 0) + 1;
                }
            }
        }
    });

    const sortedSegments = Object.entries(segmentOccupancy).filter(([_,v])=>v>0).sort((a,b)=>b[1]-a[1]);
    const maxOccupancy = sortedSegments.length ? sortedSegments[0][1] : 0;
    const avgOccupancy = sortedSegments.length ? Math.round(sortedSegments.reduce((s,[_,v])=>s+v,0)/sortedSegments.length) : 0;
    const topSegments = sortedSegments.slice(0,15);

    // build top OD flows from odMatrix
    const odFlows = [];
    for (const o in odMatrix) for (const d in odMatrix[o]) odFlows.push({ origin: o, dest: d, count: odMatrix[o][d] });
    odFlows.sort((a,b)=>b.count-a.count);
    const topODFlows = odFlows.slice(0,15);

    const top10Boarding = Object.entries(stationBoardings).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([s,c])=>({station:s,count:c}));
    const top10Deboarding = Object.entries(stationDeboardings).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([s,c])=>({station:s,count:c}));

    // compute cumulative station load (bookings on - deboards off) along the route
    const stationLoad = {};
    let cumulativeLoad = 0;
    for (const station of TRAIN_ROUTE) {
        cumulativeLoad += (stationBoardings[station] || 0);
        cumulativeLoad -= (stationDeboardings[station] || 0);
        stationLoad[station] = cumulativeLoad;
    }

    // determine origin/destination based on boardings/deboardings
    let originStation = TRAIN_ROUTE[0];
    let destinationStation = TRAIN_ROUTE[TRAIN_ROUTE.length-1];
    for (let i = 0; i < TRAIN_ROUTE.length; i++) {
        if ((stationBoardings[TRAIN_ROUTE[i]] || 0) > 0) { originStation = TRAIN_ROUTE[i]; break; }
    }
    for (let i = TRAIN_ROUTE.length - 1; i >= 0; i--) {
        if ((stationDeboardings[TRAIN_ROUTE[i]] || 0) > 0) { destinationStation = TRAIN_ROUTE[i]; break; }
    }
    if (uploadedTrainMetadata.sourceStation) originStation = uploadedTrainMetadata.sourceStation;
    if (uploadedTrainMetadata.destinationStation) destinationStation = uploadedTrainMetadata.destinationStation;

    let rawTrainName = uploadedTrainMetadata.trainName || allCoaches[0]?.trainName || '';
    let rawTrainNumber = uploadedTrainMetadata.trainNumber || allCoaches[0]?.trainNumber || allCoaches[0]?.trainNo || '';
    if ((!rawTrainNumber || rawTrainNumber === '') && uploadedFiles && uploadedFiles.length > 0) {
        const fname = uploadedFiles[0].name || '';
        const m = fname.match(/(\d{3,6})/);
        if (m) rawTrainNumber = m[1];
    }

    let typeLabel = '';
    if (uploadedTrainMetadata.trainType || allCoaches[0]?.trainType) {
        typeLabel = uploadedTrainMetadata.trainType || allCoaches[0]?.trainType;
    } else {
        const tnLower = String(rawTrainName || '').toLowerCase();
        if (tnLower.includes('superfast') || tnLower.includes('sf') || tnLower.includes('super fast')) {
            typeLabel = 'SF Express';
        } else if (tnLower.includes('express')) {
            typeLabel = 'Express';
        } else if (rawTrainName) {
            typeLabel = rawTrainName;
        } else if (rawTrainNumber) {
            typeLabel = 'Express';
        } else {
            typeLabel = 'Train';
        }
    }

    const trainTitle = rawTrainName || typeLabel || 'Train';
    const trainNumberPrefix = rawTrainNumber ? `${rawTrainNumber} ` : '';
    const trainTypeSuffix = typeLabel && typeLabel !== trainTitle ? ` (${typeLabel})` : '';
    const displayTrainLine = `${trainNumberPrefix}${trainTitle}${trainTypeSuffix} - ${originStation} → ${destinationStation}`;

    currentReportData = {
        trainName: rawTrainName,
        trainNumber: rawTrainNumber,
        trainType: typeLabel,
        trainDisplayLine: displayTrainLine,
        originStation,
        destinationStation,
        route: [...TRAIN_ROUTE],
        journeyDate: uploadedTrainMetadata.journeyDate || '',
        runningDays: uploadedTrainMetadata.runningDays || [],
        distanceKm: uploadedTrainMetadata.distanceKm || '',
        startTime: uploadedTrainMetadata.startTime || '',
        endTime: uploadedTrainMetadata.endTime || '',
        duration: uploadedTrainMetadata.duration || '',
        totalPassengers,
        totalSeats,
        avgOccupancy,
        maxOccupancy,
        segmentOccupancy,
        stationBoardings,
        stationDeboardings,
        stationBookings,
        stationLoad,
        odMatrix,
        coachPassengers
        ,
        stationClassBoardings,
        stationClassDeboardings,
        stationClassOd,
        classSeatTotals
    };

    displayReport(currentReportData, topSegments, topODFlows, top10Boarding, top10Deboarding);
}

function calculateODFlows(allCoaches) {
    const odMap = {};
    
    allCoaches.forEach(coach => {
        if (!coach.berths || !Array.isArray(coach.berths)) return;
        
        coach.berths.forEach(berth => {
            if (berth.passenger && berth.passenger.origin && berth.passenger.destination) {
                const key = `${berth.passenger.origin}→${berth.passenger.destination}`;
                odMap[key] = (odMap[key] || 0) + 1;
            }
        });
    });

    return Object.entries(odMap)
        .map(([key, count]) => {
            const [origin, dest] = key.split('→');
            return { origin, dest, count, key };
        })
        .sort((a, b) => b.count - a.count);
}

function displayReport(reportData, topSegments, topODFlows, top10Boarding, top10Deboarding) {
    const seatUtilization = reportData.totalSeats > 0 
        ? Math.round((reportData.totalPassengers / reportData.totalSeats) * 100)
        : 0;

    // Build OD matrix HTML
    let odMatrixHtml = '<div id="odMatrixContainer" class="od-matrix-container"><table class="od-matrix"><thead><tr><th>Origin → Destination</th>';
    for (const destStation of TRAIN_ROUTE) odMatrixHtml += `<th>${destStation}</th>`;
    odMatrixHtml += '</tr></thead><tbody>';
    let maxODFlow = 0;
    if (reportData.odMatrix) {
        for (const o in reportData.odMatrix) for (const d in reportData.odMatrix[o]) maxODFlow = Math.max(maxODFlow, reportData.odMatrix[o][d]);
    }
    for (const originStation of TRAIN_ROUTE) {
        odMatrixHtml += '<tr><td><strong>' + originStation + '</strong></td>';
        for (const destStation of TRAIN_ROUTE) {
            const count = reportData.odMatrix?.[originStation]?.[destStation] || 0;
            let cellClass = 'od-cell';
            if (count === 0 || originStation === destStation) cellClass += ' od-cell-zero';
            else {
                const intensity = maxODFlow ? count / maxODFlow : 0;
                if (intensity > 0.7) cellClass += ' od-cell-high';
                else if (intensity > 0.3) cellClass += ' od-cell-medium';
                else cellClass += ' od-cell-low';
            }
            odMatrixHtml += `<td class="${cellClass}">${count > 0 ? count.toLocaleString() : '-'}</td>`;
        }
        odMatrixHtml += '</tr>';
    }
    odMatrixHtml += '</tbody></table></div>';

    // determine display train type
    const typeLabel = reportData.trainType || reportData.trainName || 'Train';
    const coachesCount = Object.keys(reportData.coachPassengers || {}).length || 0;
    const seatUtilStr = reportData.totalSeats > 0 ? ((reportData.totalPassengers / reportData.totalSeats) * 100).toFixed(1) : '0.0';

    const trainTitle = reportData.trainName || typeLabel || 'Train';
    const trainNumberPrefix = reportData.trainNumber ? `${reportData.trainNumber} ` : '';
    const trainTypeSuffix = typeLabel && typeLabel !== trainTitle ? ` (${typeLabel})` : '';
    const headerLine = `${trainNumberPrefix}${trainTitle}${trainTypeSuffix} - ${reportData.originStation} → ${reportData.destinationStation}`;
    const routeList = Array.isArray(reportData.route) ? reportData.route : TRAIN_ROUTE;
    const routePreview = routeList.map(station => escapeHtml(station)).join(' → ');
    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const runningDays = Array.isArray(reportData.runningDays) ? reportData.runningDays : [];
    const hasRunInfo = runningDays.length > 0;
    const currentJourneyDay = getJourneyDay(reportData.journeyDate);
    const weekHtml = weekDays.map(day => {
        const runs = hasRunInfo && runningDays.includes(day);
        const classes = ['week-day'];
        if (runs) classes.push('runs');
        if (hasRunInfo && !runs) classes.push('no-run');
        if (currentJourneyDay === day) classes.push('current');
        return `<div class="${classes.join(' ')}"><span>${day}</span><small>${hasRunInfo ? (runs ? 'Runs' : 'No run') : 'No data'}</small></div>`;
    }).join('');
    const scheduleCards = [
        ['Journey Date', formatJourneyDate(reportData.journeyDate) || 'Not available'],
        ['Total Kilometers', reportData.distanceKm ? `${escapeHtml(reportData.distanceKm)} km` : 'Not available'],
        ['Source Departure', reportData.startTime || 'Not available'],
        ['Destination Arrival', reportData.endTime || 'Not available'],
        ['Duration', reportData.duration || 'Not available']
    ].map(([label, value]) => `<div class="journey-stat"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join('');

    // Build station-wise table (Boardings / Deboardings / Net Change / Bookings / Cumulative Load)
    let stationTableHtml = `<div class="table-wrapper"><table><thead><tr><th>#</th><th>Station</th><th>Boardings</th><th>Deboardings</th><th>Net Change</th><th>Bookings</th><th>Cumulative Load</th></tr></thead><tbody>`;
    TRAIN_ROUTE.forEach((station, idx) => {
        const board = reportData.stationBoardings?.[station] || 0;
        const deboard = reportData.stationDeboardings?.[station] || 0;
        const net = board - deboard;
        const bookings = reportData.stationBookings?.[station] || 0;
        const load = reportData.stationLoad?.[station] ?? (board - deboard);
        stationTableHtml += `<tr><td>${idx+1}</td><td><strong>${escapeHtml(station)}</strong></td><td>${board.toLocaleString()}</td><td>${deboard.toLocaleString()}</td><td style="color: ${net>=0?'#26de81':'#ff4757'};">${net>=0?'+':''}${net.toLocaleString()}</td><td>${bookings.toLocaleString()}</td><td>${load.toLocaleString()}</td></tr>`;
    });
    stationTableHtml += '</tbody></table></div>';

    const html = `
        <div id="screenshot-area">
            <div class="train-header-card">
                <div>
                    <div class="train-number-name">${escapeHtml(headerLine)}</div>
                    <div class="train-meta-detail">📅 Journey: ${escapeHtml(reportData.originStation)} → ${escapeHtml(reportData.destinationStation)} | Via ${routeList.length} stations</div>
                </div>
                <div class="train-route-dir">📍 ${escapeHtml(reportData.originStation)} → ${escapeHtml(reportData.destinationStation)}</div>
            </div>
            <div class="train-meta-detail" style="margin: -8px 20px 16px;">Route: ${routePreview}</div>
            <div class="journey-overview">
                <div class="journey-stats">${scheduleCards}</div>
                <div class="week-view">
                    <div class="week-view-title">Train Running Days${currentJourneyDay ? ` | Journey day: ${escapeHtml(currentJourneyDay)}` : ''}</div>
                    <div class="week-days">${weekHtml}</div>
                </div>
            </div>

            <div class="success" style="margin:20px;">✅ ${reportData.totalPassengers.toLocaleString()} passengers | ${reportData.totalSeats.toLocaleString()} seats | Utilization ${seatUtilStr}% | Total coaches: ${coachesCount}</div>
            
            <div class="summary-cards">
                <div class="card"><h3>👥 Passengers</h3><div class="value">${reportData.totalPassengers.toLocaleString()}</div><div class="subtitle">Unique bookings</div></div>
                <div class="card"><h3>🛏 Total Seats</h3><div class="value">${reportData.totalSeats.toLocaleString()}</div><div class="subtitle">Berths available</div></div>
                <div class="card"><h3>📊 Utilization</h3><div class="value">${seatUtilization}%</div><div class="subtitle">Occupancy rate</div></div>
                <div class="card"><h3>📈 Avg Segment Load</h3><div class="value">${reportData.avgOccupancy}</div><div class="subtitle">Per segment</div></div>
                <div class="card"><h3>📥 Peak Occupancy</h3><div class="value">${reportData.maxOccupancy.toLocaleString()}</div><div class="subtitle">${topSegments[0]?.[0] || 'N/A'}</div></div>
            </div>

            <div class="section">
                <h2>🚉 Station-wise Movement</h2>
                <button id="downloadStationChartBtn" style="background: #26de81; margin-bottom: 15px;">📸 Download Station Chart as Image</button>
                <div class="chart-container"><canvas id="stationChart"></canvas></div>
                ${stationTableHtml}
            </div>

            <div class="section">
                <h2>📊 Top 15 Passenger Flows</h2>
                <button id="downloadOdChartBtn" style="background: #764ba2; margin-bottom: 15px;">📸 Download OD Chart as Image</button>
                <div class="chart-container"><canvas id="odChart"></canvas></div>
            </div>

            <div class="section">
                <h2>🧭 Class-wise Movement</h2>
                <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;flex-wrap:wrap;">
                    <label for="classOriginSelector" style="font-weight:600;">Select Origin Station:</label>
                    <select id="classOriginSelector" style="padding:8px;border-radius:6px;border:1px solid #ddd;background:white;">
                        ${routeList.map(st => `<option value="${st}">${st}</option>`).join('')}
                    </select>
                    <button id="downloadClassChartBtn" style="background:#667eea;color:white;padding:8px 12px;border-radius:6px;">📸 Download Class Chart</button>
                </div>
                <div class="chart-container"><canvas id="classMovementChart"></canvas></div>
                <div id="classMovementTable" class="table-wrapper" style="margin-top:12px;"></div>
                <small style="display:block;margin-top:8px;color:#666;">Showing deboarding counts per destination station, broken down by coach class for the selected origin.</small>
            </div>

            <div class="section">
                <h2>🗺️ Origin-Destination Matrix</h2>
                <button id="downloadOdMatrixBtn" style="background: #764ba2; margin-bottom: 15px;">📸 Download OD Matrix as High-Res Image</button>
                ${odMatrixHtml}
            </div>
        </div>
    `;

    document.getElementById('reportContent').innerHTML = html;
    document.getElementById('shareToolbar').style.display = 'flex';
    currentReportHTML = html;
    
    renderCharts(reportData.segmentOccupancy, reportData.stationBoardings, reportData.stationDeboardings, topSegments, topODFlows);
    setupDownloadButtons();

    // --- Station class-wise UI ---
    function renderStationClassTableFor(station) {
        const boardMap = (currentReportData.stationClassBoardings && currentReportData.stationClassBoardings[station]) || {};
        const deboardMap = (currentReportData.stationClassDeboardings && currentReportData.stationClassDeboardings[station]) || {};
        const classes = Array.from(new Set([...Object.keys(boardMap), ...Object.keys(deboardMap)])).sort();
        if (classes.length === 0) {
            document.getElementById('stationClassTable').innerHTML = '<div class="warning">No class-wise boarding/deboarding data for this station.</div>';
            return;
        }
        let tableHtml = '<table><thead><tr><th>Coach Class</th><th>Boardings</th><th>Deboardings</th><th>Total</th></tr></thead><tbody>';
        let totalBoard = 0, totalDeboard = 0;
        classes.forEach(cl => {
            const b = boardMap[cl] || 0;
            const d = deboardMap[cl] || 0;
            totalBoard += b; totalDeboard += d;
            tableHtml += `<tr><td><strong>${escapeHtml(cl)}</strong></td><td>${b.toLocaleString()}</td><td>${d.toLocaleString()}</td><td>${(b+d).toLocaleString()}</td></tr>`;
        });
        tableHtml += `<tr class="rank-1"><td><strong>Total</strong></td><td><strong>${totalBoard.toLocaleString()}</strong></td><td><strong>${totalDeboard.toLocaleString()}</strong></td><td><strong>${(totalBoard+totalDeboard).toLocaleString()}</strong></td></tr>`;
        tableHtml += '</tbody></table>';
        document.getElementById('stationClassTable').innerHTML = tableHtml;
    }

    const selector = document.getElementById('stationClassSelector');
    if (selector) {
        selector.addEventListener('change', (e) => renderStationClassTableFor(e.target.value));
        // initial render
        const initialStation = selector.value || routeList[0] || TRAIN_ROUTE[0];
        renderStationClassTableFor(initialStation);
    }

    // --- Class-wise Movement chart and table ---
    let classMovementChartInstance = null;
    function renderClassMovementFor(origin) {
        const odByClass = (currentReportData.stationClassOd && currentReportData.stationClassOd[origin]) || {};
        // classes set
        const classesSet = new Set();
        for (const dest in odByClass) {
            const m = odByClass[dest];
            for (const cl in m) classesSet.add(cl);
        }
        const classes = Array.from(classesSet).sort();
        const destinations = TRAIN_ROUTE.filter(s => s !== origin);
        const classTotals = currentReportData.classSeatTotals || {};

        const datasets = classes.map((cl, idx) => {
            const colorPalette = ['#667eea','#764ba2','#26de81','#ff6b6b','#ffa502','#00b7c7','#ff4757','#a29bfe'];
            const bg = colorPalette[idx % colorPalette.length];
            return {
                label: cl,
                data: destinations.map(dest => (odByClass[dest] && odByClass[dest][cl]) || 0),
                backgroundColor: bg
            };
        });

        // render chart (stacked)
        const ctx = document.getElementById('classMovementChart');
        if (!ctx) return;
        if (classMovementChartInstance) classMovementChartInstance.destroy();
        classMovementChartInstance = new Chart(ctx, {
            type: 'bar',
            data: { labels: destinations, datasets },
            options: {
                plugins: { datalabels: { display: false } },
                responsive: true,
                scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Passengers' } } }
            }
        });

        // render table
        if (!classes.length) {
            document.getElementById('classMovementTable').innerHTML = '<div class="warning">No class-wise OD data for this origin station.</div>';
            return;
        }
        let tableHtml = '<table><thead><tr><th>Destination</th>' + classes.map(c=>`<th>${escapeHtml(c)}</th>`).join('') + '<th>Total</th></tr></thead><tbody>';
        destinations.forEach(dest => {
            let rowTotal = 0;
            const cols = classes.map(cl => { const v = (odByClass[dest] && odByClass[dest][cl]) || 0; rowTotal += v; return `<td>${v.toLocaleString()}</td>`; }).join('');
            tableHtml += `<tr><td><strong>${escapeHtml(dest)}</strong></td>${cols}<td><strong>${rowTotal.toLocaleString()}</strong></td></tr>`;
        });
        // totals
        tableHtml += '<tr class="rank-1"><td><strong>Total</strong></td>';
        classes.forEach(cl => {
            let sum = 0; destinations.forEach(dest => { sum += (odByClass[dest] && odByClass[dest][cl]) || 0; });
            const totalSeatsForClass = classTotals[cl] || 0;
            const displayTotal = totalSeatsForClass ? `${sum}/${totalSeatsForClass}` : `${sum}`;
            tableHtml += `<td><strong>${displayTotal}</strong></td>`;
        });
        const grand = destinations.reduce((s,d)=> s + classes.reduce((ss,cl)=> ss + ((odByClass[d] && odByClass[d][cl])||0),0),0);
        tableHtml += `<td><strong>${grand.toLocaleString()}</strong></td></tr>`;
        tableHtml += '</tbody></table>';
        document.getElementById('classMovementTable').innerHTML = tableHtml;
    }

    const classOriginSelector = document.getElementById('classOriginSelector');
    if (classOriginSelector) {
        classOriginSelector.addEventListener('change', (e) => renderClassMovementFor(e.target.value));
        // initial render
        renderClassMovementFor(classOriginSelector.value || TRAIN_ROUTE[0]);
    }

    const downloadClassChartBtn = document.getElementById('downloadClassChartBtn');
    if (downloadClassChartBtn) {
        downloadClassChartBtn.addEventListener('click', () => {
            // reuse downloadChartAsImage for classMovementChart
            downloadChartAsImage('classMovementChart', `class_movement_${currentReportData?.trainName?.replace(/\s/g,'_')||'report'}`, 3);
        });
    }
}

function renderCharts(segmentOccupancy, stationBoardings, stationDeboardings, topSegments, topODFlows) {
    if(document.getElementById('stationChart')) {
        new Chart(document.getElementById('stationChart'), {
            type: 'bar',
            data: {
                labels: TRAIN_ROUTE,
                datasets: [
                    { label: 'Boardings', data: TRAIN_ROUTE.map(s=>stationBoardings[s]||0), backgroundColor: '#26de81' },
                    { label: 'Deboardings', data: TRAIN_ROUTE.map(s=>stationDeboardings[s]||0), backgroundColor: '#ff4757' }
                ]
            },
            options: {
                plugins: {
                    datalabels: {
                        anchor: 'end',
                        align: 'top',
                        offset: 2,
                        color: function(context) {
                            return context.datasetIndex === 0 ? '#26de81' : '#ff4757';
                        },
                        strokeWidth: 0.5,
                        font: { size: 9, weight: 'bold' },
                        formatter: (value) => value > 0 ? value.toLocaleString() : ''
                    }
                },
                scales: { y: { beginAtZero: true } }
            }
        });
    }

    if(document.getElementById('odChart') && topODFlows.length) {
        new Chart(document.getElementById('odChart'), {
            type: 'bar',
            data: {
                labels: topODFlows.map(f=>`${f.origin}→${f.dest}`),
                datasets: [{
                    label: 'Passengers',
                    data: topODFlows.map(f=>f.count),
                    backgroundColor: '#764ba2'
                }]
            },
            options: {
                plugins: {
                    datalabels: {
                        anchor: 'end',
                        align: 'top',
                        offset: 4,
                        color: '#764ba2',
                        strokeColor: '#4a2a7a',
                        strokeWidth: 1,
                        fontWeight: 'bold',
                        font: { size: 10 },
                        formatter: function(value) {
                            if (value === undefined || value === null) return '';
                            return Number(value).toLocaleString();
                        },
                        rotation: 0
                    }
                },
                scales: { 
                    y: { 
                        beginAtZero: true,
                        title: { display: true, text: 'Number of Passengers' }
                    }
                },
                maintainAspectRatio: true,
                responsive: true
            }
        });
    }
}

function setupDownloadButtons() {
    const odChartBtn = document.getElementById('downloadOdChartBtn');
    const stationChartBtn = document.getElementById('downloadStationChartBtn');
    const odMatrixBtn = document.getElementById('downloadOdMatrixBtn');

    if (odChartBtn) {
        odChartBtn.onclick = () => downloadChartAsImage('odChart', `od_chart_${currentReportData?.trainName?.replace(/\s/g, '_') || 'report'}`, 3);
    }
    if (stationChartBtn) {
        stationChartBtn.onclick = () => downloadChartAsImage('stationChart', `station_chart_${currentReportData?.trainName?.replace(/\s/g, '_') || 'report'}`, 3);
    }
    if (odMatrixBtn) {
        odMatrixBtn.onclick = downloadOdMatrixAsImage;
    }
}

function downloadOdMatrixAsImage() {
    const matrixContainer = document.querySelector('.od-matrix-container');
    if (!matrixContainer) { showNotification("OD Matrix not found", "error"); return; }
    
    showNotification("📸 Capturing OD Matrix in high quality...", "info");
    
    // Temporarily modify container for better capture
    const originalOverflow = matrixContainer.style.overflow;
    matrixContainer.style.overflow = 'visible';
    
    html2canvas(matrixContainer, {
        scale: 4,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
        windowWidth: matrixContainer.scrollWidth,
        windowHeight: matrixContainer.scrollHeight,
        onclone: (clonedDoc, element) => {
            // Improve table rendering in clone
            const tables = clonedDoc.querySelectorAll('table');
            tables.forEach(table => {
                table.style.fontSize = '14px';
                table.style.borderCollapse = 'separate';
            });
        }
    }).then(canvas => {
        matrixContainer.style.overflow = originalOverflow;
        
        // Create ultra high-res version
        const finalCanvas = document.createElement('canvas');
        const ctx = finalCanvas.getContext('2d');
        const scale = 2;
        finalCanvas.width = canvas.width * scale;
        finalCanvas.height = canvas.height * scale;
        
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(canvas, 0, 0, finalCanvas.width, finalCanvas.height);
        
        const link = document.createElement('a');
        const trainName = currentReportData?.trainName?.replace(/\s/g, '_') || 'report';
        link.download = `od_matrix_${trainName}_hq.png`;
        link.href = finalCanvas.toDataURL('image/png', 1.0);
        link.click();
        showNotification("✓ High-res OD Matrix downloaded!", "success");
    }).catch(err => {
        matrixContainer.style.overflow = originalOverflow;
        showNotification("Failed to capture OD Matrix", "error");
    });
}

function downloadChartAsImage(chartId, filename, scale = 5) {
    const canvas = document.getElementById(chartId);
    if (!canvas) { showNotification(`Chart ${chartId} not found`, "error"); return; }
    
    showNotification(`📸 Capturing ${filename} in high quality...`, "info");
    
    // Get the chart instance
    const chart = Chart.getChart(chartId);
    if (!chart) {
        showNotification(`Chart ${chartId} not initialized`, "error");
        return;
    }
    
    // Store original options
    let originalDevicePixelRatio = chart.config.options.devicePixelRatio;
    
    // Temporarily increase device pixel ratio
    chart.config.options.devicePixelRatio = 4;
    chart.update();
    
    // Use a temporary canvas with higher scale
    setTimeout(() => {
        const originalCanvas = canvas;
        const highResCanvas = document.createElement('canvas');
        const ctx = highResCanvas.getContext('2d');
        
        // Enable anti-aliasing for smoother edges
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        const width = originalCanvas.width;
        const height = originalCanvas.height;
        highResCanvas.width = width * scale;
        highResCanvas.height = height * scale;
        
        // Draw with high quality interpolation
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.scale(scale, scale);
        ctx.drawImage(originalCanvas, 0, 0, width, height);
        
        // Reset chart device pixel ratio
        chart.config.options.devicePixelRatio = originalDevicePixelRatio || 1;
        chart.update();
        
        // Convert to PNG with high quality
        const link = document.createElement('a');
        link.download = `${filename}_hq.png`;
        link.href = highResCanvas.toDataURL('image/png');
        link.click();
        
        showNotification(`✓ ${filename} high-res image saved!`, "success");
    }, 100);
}

async function copyFullReportToClipboard() {
    if (!currentReportData) {
        showNotification("No report to copy. Generate a report first.", "error");
        return;
    }
    
    const screenshotArea = document.getElementById('screenshot-area');
    if (!screenshotArea) {
        showNotification("Report content not found", "error");
        return;
    }
    
    // Create a temporary div to extract text content with formatting
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = currentReportHTML;
    
    // Extract plain text with formatting markers
    let plainText = "=" .repeat(60) + "\n";
    plainText += "🚂 TRAIN CHART OCCUPANCY REPORT\n";
    plainText += "=" .repeat(60) + "\n\n";
    
    // Extract train info
    const trainName = currentReportData.trainName || "Express";
    const trainNumber = currentReportData.trainNumber || "XXXX";
    const originStation = currentReportData.originStation || TRAIN_ROUTE[0];
    const destinationStation = currentReportData.destinationStation || TRAIN_ROUTE[TRAIN_ROUTE.length-1];
    
    plainText += `TRAIN: ${trainName} (${trainNumber})\n`;
    plainText += `ROUTE: ${originStation} → ${destinationStation} (via ${TRAIN_ROUTE.length} stations)\n`;
    plainText += "-".repeat(60) + "\n\n";
    
    // Statistics
    plainText += `📊 KEY STATISTICS:\n`;
    plainText += `   Total Passengers: ${currentReportData.totalPassengers.toLocaleString()}\n`;
    plainText += `   Total Seats: ${currentReportData.totalSeats.toLocaleString()}\n`;
    const seatUtil = currentReportData.totalSeats > 0 ? ((currentReportData.totalPassengers / currentReportData.totalSeats) * 100).toFixed(1) : 0;
    plainText += `   Seat Utilization: ${seatUtil}%\n`;
    plainText += `   Average Segment Load: ${currentReportData.avgOccupancy}\n`;
    plainText += `   Peak Occupancy: ${currentReportData.maxOccupancy}\n`;
    
    // Top segments
    plainText += `\n🔥 TOP 10 BUSIEST SEGMENTS:\n`;
    const sortedSegments = Object.entries(currentReportData.segmentOccupancy).filter(([_,v]) => v>0).sort((a,b)=>b[1]-a[1]).slice(0,10);
    sortedSegments.forEach(([seg, count], idx) => {
        plainText += `   ${idx+1}. ${seg}: ${count.toLocaleString()} passengers\n`;
    });
    
    // Top boarding stations
    plainText += `\n🚉 TOP BOARDING STATIONS:\n`;
    const topBoardings = Object.entries(currentReportData.stationBoardings).sort((a,b)=>b[1]-a[1]).slice(0,15);
    topBoardings.forEach(([st, count]) => {
        plainText += `   ${st}: ${count.toLocaleString()} boardings\n`;
    });
    
    // Top deboarding stations
    plainText += `\n🚉 TOP DEBOARDING STATIONS:\n`;
    const topDeboardings = Object.entries(currentReportData.stationDeboardings).sort((a,b)=>b[1]-a[1]).slice(0,15);
    topDeboardings.forEach(([st, count]) => {
        plainText += `   ${st}: ${count.toLocaleString()} deboardings\n`;
    });
    
    plainText += `\n📅 Generated: ${new Date().toLocaleString()}\n`;
    plainText += "=" .repeat(60) + "\n";
    
    // Copy to clipboard using modern API
    try {
        await navigator.clipboard.writeText(plainText);
        
        // Add visual feedback on the report area
        const screenshotDiv = document.getElementById('screenshot-area');
        if (screenshotDiv) {
            screenshotDiv.classList.add('copy-highlight');
            setTimeout(() => screenshotDiv.classList.remove('copy-highlight'), 500);
        }
        
        showNotification("✓ Full report copied to clipboard! (Text format)", "success");
    } catch (err) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = plainText;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showNotification("✓ Report copied to clipboard (Fallback method)", "success");
    }
}

async function captureScreenshot() {
    const element = document.getElementById('screenshot-area');
    if (!element) { showNotification("Generate report first...", "error"); return null; }
    showNotification("📸 Capturing high-quality screenshot...", "info");
    try {
        const originalStyle = element.style.cssText;
        element.style.overflow = 'visible';
        
        const canvas = await html2canvas(element, { 
            scale: 4,
            backgroundColor: '#ffffff',
            logging: false,
            useCORS: true,
            allowTaint: false,
            windowWidth: element.scrollWidth,
            windowHeight: element.scrollHeight,
            onclone: (clonedDoc, element) => {
                // Ensure charts render properly in clone
                const clonedCharts = clonedDoc.querySelectorAll('canvas');
                clonedCharts.forEach(canvas => {
                    canvas.style.maxWidth = '100%';
                    canvas.style.height = 'auto';
                });
            }
        });
        
        element.style.cssText = originalStyle;
        showNotification("✅ High-res screenshot ready!", "success");
        return canvas;
    } catch(err) {
        showNotification("❌ Screenshot failed: " + err.message, "error");
        return null;
    }
}

// ============================================================
// EVENT LISTENERS & INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    setupFileUpload();
    
    document.getElementById('copyFullReportBtn').addEventListener('click', copyFullReportToClipboard);
    
    document.getElementById('screenshotBtn').addEventListener('click', async () => {
        const canvas = await captureScreenshot();
        if (canvas) {
            const link = document.createElement('a');
            // Uses the 0th index name logic we discussed or fallback
            const name = currentReportData?.trainName?.split(' ')[0] || 'Train';
            link.download = `${name}_Report_${new Date().getTime()}.png`;
            link.href = canvas.toDataURL('image/png', 1.0);
            link.click();
            showNotification("✅ Image saved!", "success");
        }
    });
    
    document.getElementById('twitterShareBtn').addEventListener('click', async () => {
        const canvas = await captureScreenshot();
        if (canvas && currentReportData) {
            const trainName = currentReportData.trainName || 'Train';
            const trainNumber = currentReportData.trainNumber || '';
            const passengers = currentReportData.totalPassengers?.toLocaleString() || 'N/A';
            const text = encodeURIComponent(`🚆 ${trainName} ${trainNumber} | ${passengers} passengers | Route: ${currentReportData.originStation} → ${currentReportData.destinationStation}\n\n#TrainAnalytics #RailwayData`);
            canvas.toBlob((blob) => {
                const link = document.createElement('a');
                link.download = `twitter_${trainName.replace(/\s/g, '_')}.png`;
                link.href = canvas.toDataURL('image/png', 1.0);
                link.click();
                window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
                showNotification("📤 Image downloaded! Tweet window opened — attach the screenshot.", "info");
            }, 'image/png');
        }
    });
    
    document.getElementById('processBtn').addEventListener('click', processFiles);
});
