// IRCTC Chart Collector - All-in-One
// Run this on irctc.co.in/online-charts AFTER entering train number and clicking the source station dropdown.
// It extracts train info + route, then sets up the coach collector that works after redirect.
(function() {
    const origLog = console.log.bind(console);

    installNetworkCapture();

    function parseMaybeJson(text) {
        if (!text || typeof text !== 'string') return null;
        try { return JSON.parse(text); } catch (_) { return null; }
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

    function findRouteArray(obj) {
        if (!obj || typeof obj !== 'object') return [];
        const routeKeys = new Set([
            'route', 'routes', 'stationList', 'stationDetails', 'trainRoute',
            'trainRouteList', 'stoppages', 'stoppageList', 'schedule',
            'stationCodeList', 'stations'
        ]);
        const queue = [obj];
        while (queue.length) {
            const current = queue.shift();
            if (!current || typeof current !== 'object') continue;
            for (const [key, value] of Object.entries(current)) {
                if (Array.isArray(value) && routeKeys.has(key) && value.length > 0) return value;
                if (value && typeof value === 'object') queue.push(value);
            }
        }
        return [];
    }

    function stationCodeFrom(value) {
        if (typeof value === 'string') {
            const code = value.split(' ')[0].split('-')[0].trim().toUpperCase();
            return code.length >= 2 && code.length <= 5 ? code : '';
        }
        if (!value || typeof value !== 'object') return '';
        const code = findFirstDeep(value, [
            'stationCode', 'stnCode', 'code', 'stn', 'station',
            'fromStationCode', 'toStationCode', 'sourceStation', 'destinationStation'
        ]);
        return typeof code === 'string' ? stationCodeFrom(code) : '';
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

    function normalizeTrainDetails(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const stationList = Array.isArray(raw.stationList) ? raw.stationList : [];
        const hasRunDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].some(day => raw[`trainRunsOn${day}`]);
        if (stationList.length === 0 && !hasRunDays) return null;

        const route = [];
        for (const item of stationList.length ? stationList : findRouteArray(raw)) {
            const code = stationCodeFrom(item);
            if (code && !route.includes(code)) route.push(code);
        }

        const trainNo = String(findFirstDeep(raw, ['trainNo', 'trainNumber', 'trnNo', 'number']) || '').trim();
        const trainName = String(findFirstDeep(raw, ['trainName', 'name', 'trnName']) || '').trim();
        const trainType = String(findFirstDeep(raw, ['trainType', 'type', 'trainCategory']) || '').trim();
        const sourceStation = stationCodeFrom(raw.stationFrom || findFirstDeep(raw, ['sourceStation', 'fromStation', 'from', 'srcStn', 'sourceStationCode', 'fromStationCode'])) || route[0] || '';
        const destinationStation = stationCodeFrom(raw.stationTo || findFirstDeep(raw, ['destinationStation', 'toStation', 'to', 'dstnStn', 'destinationStationCode', 'toStationCode'])) || route[route.length - 1] || '';
        const firstStation = stationList[0] || {};
        const lastStation = stationList[stationList.length - 1] || {};
        const calculatedDuration = calculateDurationFromStations(firstStation, lastStation);
        const runningDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].filter(day => raw[`trainRunsOn${day}`] === 'Y');
        const schedule = {
            runningDays,
            distanceKm: lastStation.distance || raw.distance || raw.totalDistance || '',
            startTime: firstStation.departureTime || raw.startTime || raw.departureTime || '',
            endTime: lastStation.arrivalTime || raw.endTime || raw.arrivalTime || '',
            duration: raw.duration && raw.duration !== '0' ? raw.duration : calculatedDuration,
            timeStamp: raw.timeStamp || '',
            stationList
        };

        if (!trainNo && !trainName && route.length < 2 && !sourceStation && !destinationStation) return null;
        return { trainNo, trainName, trainType, sourceStation, destinationStation, route, ...schedule, raw };
    }

    function handleNetworkResponse(payload) {
        const details = normalizeTrainDetails(payload);
        if (details) mergeTrainInfo(details);
    }

    function normalizeStationCode(value) {
        if (typeof value === 'string') {
            const code = value.trim().toUpperCase().split(' ')[0].split('-')[0];
            return code.length >= 2 && code.length <= 5 ? code : '';
        }
        if (!value || typeof value !== 'object') return '';
        return normalizeStationCode(findFirstDeep(value, [
            'stationCode', 'stnCode', 'code', 'stn', 'station', 'fromStationCode', 'toStationCode'
        ]));
    }

    function normalizeTrainName(value) {
        if (typeof value !== 'string') return '';
        return value.trim().replace(/\s+/g, ' ');
    }

    function detectTrainInfoFromPage() {
        const pageText = document.body.innerText || '';
        const info = {};

        const trainNoMatch = pageText.match(/(?:Train(?:\s*(?:No\.?|Number))|Trn\s*No\.?)\s*[:\-]?\s*(\d{2,6})\b/i);
        if (trainNoMatch) info.trainNo = trainNoMatch[1].trim();

        const trainNameMatch = pageText.match(/(?:Train\s*Name\s*[:\-]?\s*|Name\s*[:\-]?\s*)([A-Za-z0-9][A-Za-z0-9\s&\-\/\(\)]+)/i);
        if (trainNameMatch) {
            const name = normalizeTrainName(trainNameMatch[1]);
            if (name && !/(reservation|chart|journey|details)/i.test(name) && (!info.trainNo || pageText.indexOf(name) > pageText.indexOf(info.trainNo))) {
                info.trainName = name;
            }
        }

        const typeMatch = pageText.match(/(Express|Superfast|Mail|Shatabdi|Rajdhani|Duronto|Garib|Jan[ ]?Shatabdi|Humsafar|AC|SF|Fast)/i);
        if (typeMatch) info.trainType = typeMatch[1].trim();

        const route = [];
        const routeSelectors = [
            'select[formcontrolname="sourceStation"] option',
            'select[name="sourceStation"] option',
            'mat-option',
            'li[role="option"]',
            '.cdk-overlay-pane mat-option',
            'select option',
            '.station-list li',
            '.route-list li',
            '.station-names li'
        ];
        for (const sel of routeSelectors) {
            const options = Array.from(document.querySelectorAll(sel));
            if (options.length > 0) {
                options.forEach(opt => {
                    const text = (opt.innerText || opt.textContent || '').trim();
                    const code = normalizeStationCode(text);
                    if (code && !route.includes(code)) route.push(code);
                });
                if (route.length > 0) break;
            }
        }

        // Do not infer route from generic uppercase tokens in page text.
        // That can produce false station codes like CHAIR, CAR, CC, TTE, JN.

        if (route.length > 0) {
            info.route = route;
            info.sourceStation = route[0];
            info.destinationStation = route[route.length - 1];
            info.fromStation = route[0];
            info.toStation = route[route.length - 1];
            info.stationList = route;
        }

        const sourceInput = document.querySelector('input[formcontrolname="sourceStation"], input[name="sourceStation"], input[placeholder*="Source"], input[aria-label*="Source"]');
        if (sourceInput && sourceInput.value) info.sourceStation = normalizeStationCode(sourceInput.value);

        const destInput = document.querySelector('input[formcontrolname="destinationStation"], input[name="destinationStation"], input[placeholder*="Destination"], input[aria-label*="Destination"]');
        if (destInput && destInput.value) info.destinationStation = normalizeStationCode(destInput.value);

        const trainNoInput = document.querySelector('input[formcontrolname="trainNo"], input[name="trainNo"], input[placeholder*="Train"], input[aria-label*="Train"]');
        if (trainNoInput && trainNoInput.value) {
            const candidate = String(trainNoInput.value).trim();
            const parsed = candidate.match(/(\d{2,6})/);
            if (parsed) info.trainNo = parsed[1];
        }

        const trainNameLabel = document.querySelector('input[formcontrolname="trainName"], input[name="trainName"], [placeholder*="Train Name"], .train-name, .trainName');
        if (trainNameLabel && trainNameLabel.value) info.trainName = normalizeTrainName(trainNameLabel.value);

        return info;
    }

    function mergeTrainInfo(details) {
        if (!details) return;
        const previous = JSON.parse(sessionStorage.getItem('irctcTrainInfo') || '{}');
        const merged = {
            ...previous,
            trainNo: previous.trainNo || details.trainNo || details.trainNumber || '',
            trainNumber: previous.trainNumber || details.trainNumber || details.trainNo || details.trainNo || '',
            trainName: previous.trainName || details.trainName || '',
            trainType: previous.trainType || details.trainType || '',
            sourceStation: previous.sourceStation || details.sourceStation || details.fromStation || details.route?.[0] || '',
            destinationStation: previous.destinationStation || details.destinationStation || details.toStation || details.route?.[details.route.length - 1] || '',
            route: Array.isArray(previous.route) && previous.route.length > 0 ? previous.route : Array.isArray(details.route) ? details.route : [],
            runningDays: Array.isArray(previous.runningDays) && previous.runningDays.length > 0 ? previous.runningDays : Array.isArray(details.runningDays) ? details.runningDays : [],
            distanceKm: previous.distanceKm || details.distanceKm || '',
            startTime: previous.startTime || details.startTime || '',
            endTime: previous.endTime || details.endTime || '',
            duration: previous.duration || details.duration || '',
            journeyDate: previous.journeyDate || details.journeyDate || '',
            stationList: Array.isArray(previous.stationList) && previous.stationList.length > 0 ? previous.stationList : Array.isArray(details.stationList) ? details.stationList : [],
            trainDetails: previous.trainDetails || details.raw || details.trainDetails || null
        };
        sessionStorage.setItem('irctcTrainInfo', JSON.stringify(merged));
        origLog(`%c✓ Captured train details XHR: ${merged.trainNo || 'unknown'} ${merged.trainName || ''} (${merged.route?.length || 0} stations)`, 'color:green;font-weight:bold');
    }

    function todayIsoDate() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    function installNetworkCapture() {
        if (window.__irctcTrainDetailsCaptureInstalled) return;
        window.__irctcTrainDetailsCaptureInstalled = true;

        const nativeFetch = window.fetch;
        if (typeof nativeFetch === 'function') {
            window.fetch = async function(...args) {
                const response = await nativeFetch.apply(this, args);
                response.clone().text().then(text => {
                    const parsed = parseMaybeJson(text);
                    if (parsed) handleNetworkResponse(parsed);
                }).catch(() => {});
                return response;
            };
        }

        const nativeOpen = XMLHttpRequest.prototype.open;
        const nativeSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function(...args) {
            this.__irctcCollectorUrl = args[1];
            return nativeOpen.apply(this, args);
        };
        XMLHttpRequest.prototype.send = function(...args) {
            this.addEventListener('load', function() {
                if (this.status < 200 || this.status >= 300) return;
                let responseText = '';
                try {
                    responseText = this.responseText;
                } catch (_) {
                    responseText = typeof this.response === 'string' ? this.response : '';
                }
                const parsed = parseMaybeJson(responseText);
                if (parsed) handleNetworkResponse(parsed);
            });
            return nativeSend.apply(this, args);
        };
    }

    // --- Extract Train Info & Route ---
    let trainNo = '', trainName = '', trainType = '';

    const trainInput = document.querySelector('input[formcontrolname="trainNo"], input[name="trainNo"], input[placeholder*="Train"], input[placeholder*="train"]');
    if (trainInput) trainNo = trainInput.value.trim();

    const allText = document.body.innerText;
    const trainMatch = allText.match(/(\d{5})\s*[-–]\s*(.+?)(?:\s*\(([^)]+)\))?(?:\n|$)/);
    if (trainMatch) {
        trainNo = trainNo || trainMatch[1];
        trainName = trainMatch[2].trim();
        trainType = trainMatch[3] ? trainMatch[3].trim() : '';
    }

    // Extract route from source station dropdown
    const route = [];
    const selectors = [
        'select[formcontrolname="sourceStation"] option',
        'select[name="sourceStation"] option',
        'mat-option',
        'option',
        'li[role="option"]',
        '[role="listbox"] [role="option"]',
        '.cdk-overlay-pane mat-option',
        'select option'
    ];
    for (const sel of selectors) {
        const options = document.querySelectorAll(sel);
        if (options.length > 1) {
            options.forEach(opt => {
                const val = (opt.value || opt.getAttribute('ng-reflect-value') || opt.textContent || '').trim();
                if (val && val !== '' && val !== 'null' && !val.toLowerCase().includes('select')) {
                    const code = val.split(' ')[0].split('-')[0].trim().toUpperCase();
                    if (code && code.length >= 2 && code.length <= 5 && !route.includes(code)) {
                        route.push(code);
                    }
                }
            });
            if (route.length > 0) break;
        }
    }

    const previousInfo = JSON.parse(sessionStorage.getItem('irctcTrainInfo') || '{}');
    const pageInfo = detectTrainInfoFromPage();
    if (!trainNo) trainNo = pageInfo.trainNo || previousInfo.trainNo || '';
    if (!trainName) trainName = pageInfo.trainName || previousInfo.trainName || '';
    if (!trainType) trainType = pageInfo.trainType || previousInfo.trainType || '';
    if (route.length === 0) {
        if (Array.isArray(pageInfo.route) && pageInfo.route.length > 0) route.push(...pageInfo.route);
        else if (Array.isArray(previousInfo.route)) route.push(...previousInfo.route);
    }
    const sourceStation = previousInfo.sourceStation || pageInfo.sourceStation || route[0] || '';
    const destinationStation = previousInfo.destinationStation || pageInfo.destinationStation || route[route.length - 1] || '';

    origLog('%c🚂 Train Info:', 'color:green;font-size:14px');
    origLog(`   No: ${trainNo} | Name: ${trainName} | Type: ${trainType}`);
    origLog(`   From/To: ${sourceStation || '-'} -> ${destinationStation || '-'}`);
    origLog(`   Route (${route.length} stations): ${JSON.stringify(route)}`);

    if (route.length > 0) {
        navigator.clipboard.writeText(JSON.stringify(route)).then(() => {
            origLog('%c📋 Route copied to clipboard!', 'color:blue;font-weight:bold');
        }).catch(() => {});
    } else {
        origLog('%c⚠ No route found. Make sure source station dropdown is loaded (click on it first), then re-run.', 'color:orange');
    }

    // --- Store in sessionStorage so it survives the redirect ---
    sessionStorage.setItem('irctcTrainInfo', JSON.stringify({
        ...previousInfo,
        trainNo,
        trainName,
        trainType,
        sourceStation,
        destinationStation,
        route
    }));

    // --- Setup Coach Collector (works on current page and after redirect) ---
    if (window.irctcChartCollector) {
        origLog('%c⚠ Collector already active.', 'color:orange');
        return;
    }

    const coaches = [];
    const seenKeys = new Set();

    console.log = function(...args) {
        origLog(...args);
        for (const arg of args) {
            const obj = tryParse(arg);
            if (obj && isCoachData(obj)) addCoach(obj);
            if (Array.isArray(obj)) obj.forEach(item => { if (isCoachData(item)) addCoach(item); });
        }
    };

    function tryParse(val) {
        if (val && typeof val === 'object') return val;
        if (typeof val !== 'string') return null;
        try { return JSON.parse(val.trim()); } catch(_) {}
        const s = val.indexOf('{'), e = val.lastIndexOf('}');
        if (s !== -1 && e > s) try { return JSON.parse(val.slice(s, e + 1)); } catch(_) {}
        const as = val.indexOf('['), ae = val.lastIndexOf(']');
        if (as !== -1 && ae > as) try { return JSON.parse(val.slice(as, ae + 1)); } catch(_) {}
        return null;
    }

    function isCoachData(obj) {
        return obj && typeof obj === 'object' && (obj.bdd || obj.coachName);
    }

    function enrichCoach(obj) {
        const info = window.irctcChartCollector?.getTrainInfo?.() || JSON.parse(sessionStorage.getItem('irctcTrainInfo') || '{}');
        return {
            ...obj,
            trainNumber: obj.trainNumber || obj.trainNo || info.trainNo || '',
            trainNo: obj.trainNo || obj.trainNumber || info.trainNo || '',
            trainName: obj.trainName || info.trainName || '',
            trainType: obj.trainType || info.trainType || '',
            sourceStation: obj.sourceStation || info.sourceStation || info.route?.[0] || '',
            destinationStation: obj.destinationStation || info.destinationStation || info.route?.[info.route.length - 1] || ''
        };
    }

    function getCoachDetails(list = coaches) {
        return list.map((coach, index) => ({
            coachName: coach.coachName || `Coach_${index + 1}`,
            coachClass: coach.coachClass || coach.class || '',
            berthCount: Array.isArray(coach.bdd) ? coach.bdd.length : 0
        }));
    }

    function buildPayload() {
        const info = window.irctcChartCollector?.getTrainInfo?.() || {};
        const enrichedCoaches = coaches.map(enrichCoach);
        const firstWithNumber = enrichedCoaches.find(c => c.trainNumber || c.trainNo);
        const firstWithName = enrichedCoaches.find(c => c.trainName);
        const firstWithType = enrichedCoaches.find(c => c.trainType);
        const trainNumber = info.trainNo || firstWithNumber?.trainNumber || firstWithNumber?.trainNo || '';
        const trainName = info.trainName || firstWithName?.trainName || '';
        const trainType = info.trainType || firstWithType?.trainType || '';
        const route = Array.isArray(info.route) ? info.route : [];
        const sourceStation = info.sourceStation || route[0] || '';
        const destinationStation = info.destinationStation || route[route.length - 1] || '';
        const runningDays = Array.isArray(info.runningDays) ? info.runningDays : [];
        const runFlags = {
            trainRunsOnMon: runningDays.includes('Mon') ? 'Y' : 'N',
            trainRunsOnTue: runningDays.includes('Tue') ? 'Y' : 'N',
            trainRunsOnWed: runningDays.includes('Wed') ? 'Y' : 'N',
            trainRunsOnThu: runningDays.includes('Thu') ? 'Y' : 'N',
            trainRunsOnFri: runningDays.includes('Fri') ? 'Y' : 'N',
            trainRunsOnSat: runningDays.includes('Sat') ? 'Y' : 'N',
            trainRunsOnSun: runningDays.includes('Sun') ? 'Y' : 'N'
        };
        const distanceKm = info.distanceKm || '';
        const startTime = info.startTime || '';
        const endTime = info.endTime || '';
        const duration = info.duration || '';
        const journeyDate = info.journeyDate || todayIsoDate();

        return {
            trainNumber,
            trainNo: trainNumber,
            trainName,
            trainType,
            sourceStation,
            destinationStation,
            fromStation: sourceStation,
            toStation: destinationStation,
            runningDays,
            ...runFlags,
            distanceKm,
            startTime,
            endTime,
            duration,
            journeyDate,
            train: {
                number: trainNumber,
                name: trainName,
                type: trainType,
                sourceStation,
                destinationStation,
                fromStation: sourceStation,
                toStation: destinationStation,
                runningDays,
                ...runFlags,
                distanceKm,
                startTime,
                endTime,
                duration,
                journeyDate
            },
            route,
            stationList: info.stationList || [],
            trainDetails: info.trainDetails || null,
            coachDetails: getCoachDetails(enrichedCoaches),
            coaches: enrichedCoaches
        };
    }

    function addCoach(obj) {
        const key = obj.coachName || JSON.stringify(obj).slice(0, 100);
        if (seenKeys.has(key)) return;
        seenKeys.add(key);
        coaches.push(enrichCoach(obj));
        origLog(`%c✓ Captured: ${key} (${coaches.length} total)`, 'color:green;font-weight:bold');
    }

    window.irctcChartCollector = {
        getCoaches: () => coaches,
        getTrainInfo() {
            return JSON.parse(sessionStorage.getItem('irctcTrainInfo') || '{}');
        },
        status() {
            const info = this.getTrainInfo();
            origLog(`%c📊 Train: ${info.trainNo} ${info.trainName} (${info.trainType})`, 'color:purple');
            origLog(`%c📊 From/To: ${info.sourceStation || '-'} -> ${info.destinationStation || '-'}`, 'color:purple');
            origLog(`%c📊 Route: ${info.route?.length || 0} stations`, 'color:purple');
            origLog(`%c📊 Coaches: ${coaches.length} captured: ${coaches.map(c => c.coachName).join(', ')}`, 'color:purple');
        },
        addTrainDetails(details) {
            const parsed = typeof details === 'string' ? parseMaybeJson(details) : details;
            if (!parsed) {
                origLog('%c⚠ Could not parse train details JSON.', 'color:orange');
                return false;
            }
            handleNetworkResponse(parsed);
            return true;
        },
        downloadJson(filename) {
            const payload = buildPayload();
            if (!filename) {
                const info = this.getTrainInfo();
                const no = payload.trainNumber || payload.trainNo || info.trainNo || 'train';
                const now = new Date();
                const ddmm = String(now.getDate()).padStart(2,'0') + String(now.getMonth()+1).padStart(2,'0');
                filename = `${no} ${ddmm}.json`;
            }
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            origLog(`%c⬇ Downloaded ${filename} (${coaches.length} coaches, ${payload.route.length} route stations)`, 'color:blue;font-weight:bold');
        },
        reset() {
            coaches.length = 0;
            seenKeys.clear();
            origLog('%c↺ Collector reset', 'color:orange;font-weight:bold');
        }
    };

    origLog('%c✅ Collector ready. If train details were already loaded, re-enter/select the train or run window.irctcChartCollector.addTrainDetails(<network response JSON>).', 'color:green;font-size:12px');
    origLog('Now select source station, click "Get Train Chart", then click coach buttons.');
    origLog('After all coaches captured, run: window.irctcChartCollector.downloadJson()');
})();
