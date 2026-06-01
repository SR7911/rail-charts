// IRCTC 2nd Chart Collector (Standalone)
// Paste this in browser console on IRCTC online-charts page during 2nd chart preparation.
// It intercepts vacantBerth XHR responses when you click coach class buttons.
(function() {
    if (window.__irctcVbdCaptureInstalled) {
        console.log('%c⚠ 2nd Chart Collector already active.', 'color:orange');
        return;
    }
    window.__irctcVbdCaptureInstalled = true;

    const origLog = console.log.bind(console);
    const coaches = [];
    const seenCoaches = new Set();

    function parseMaybeJson(text) {
        if (!text || typeof text !== 'string') return null;
        try { return JSON.parse(text); } catch (_) { return null; }
    }

    function deriveClassFromCoachName(name) {
        if (/^S\d/i.test(name)) return 'SL';
        if (/^A\d/i.test(name)) return '2A';
        if (/^B\d/i.test(name)) return '3A';
        if (/^HA?\d/i.test(name)) return '1A';
        if (/^E\d|^EC/i.test(name)) return 'EC';
        if (/^C\d|^D\d/i.test(name)) return 'CC';
        return '';
    }

    function getTotalBerthsForClass(coachClass) {
        switch(coachClass) {
            case 'SL': return 80;
            case '3A': return 72;
            case '2A': return 52;
            case '1A': return 24;
            case 'EC': return 56;
            case 'CC': return 78;
            case '2S': return 108;
            default: return 80;
        }
    }

    function getTrainInfo() {
        return JSON.parse(sessionStorage.getItem('irctcTrainInfo') || '{}');
    }

    function todayIsoDate() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    function detectTrainInfoFromPage() {
        const info = {};
        const pageText = document.body.innerText || '';

        const trainNoInput = document.querySelector('input[formcontrolname="trainNo"], input[name="trainNo"], input[placeholder*="Train"], input[aria-label*="Train"]');
        if (trainNoInput && trainNoInput.value) {
            const m = trainNoInput.value.match(/(\d{4,6})/);
            if (m) info.trainNo = m[1];
        }

        const trainMatch = pageText.match(/(\d{5})\s*[-\u2013]\s*(.+?)(?:\s*\([^)]+\))?(?:\n|$)/);
        if (trainMatch) {
            if (!info.trainNo) info.trainNo = trainMatch[1];
            const name = trainMatch[2].trim();
            if (name && !/(reservation|chart|journey|details)/i.test(name)) {
                info.trainName = name;
            }
        }

        // Try from visible headings
        const headings = document.querySelectorAll('h1, h2, h3, .train-name, .trainName, [class*="train-name"]');
        for (const el of headings) {
            const text = (el.innerText || '').trim();
            const m = text.match(/(\d{5})\s*[-\u2013]?\s*([A-Z][A-Z\s]+)/i);
            if (m) {
                if (!info.trainNo) info.trainNo = m[1];
                if (!info.trainName && !/(reservation|chart|journey|details)/i.test(m[2])) {
                    info.trainName = m[2].trim();
                }
                break;
            }
        }

        // Try to find source/destination from page text like "SRC to DEST" or route display
        const routeMatch = pageText.match(/([A-Z]{2,5})\s*(?:to|\u2192|->|\u2013)\s*([A-Z]{2,5})/i);
        if (routeMatch) {
            info.sourceStation = routeMatch[1].toUpperCase();
            info.destinationStation = routeMatch[2].toUpperCase();
        }

        return info;
    }

    // === TRAIN DETAILS CAPTURE ===
    function captureTrainDetails(parsed) {
        const prev = getTrainInfo();
        const route = Array.isArray(parsed.stationList)
            ? parsed.stationList.map(s => s.stationCode).filter(Boolean)
            : [];
        const merged = {
            ...prev,
            ...parsed,
            trainNo: parsed.trainNumber || prev.trainNo,
            trainNumber: parsed.trainNumber || prev.trainNumber,
            trainName: parsed.trainName || prev.trainName,
            sourceStation: parsed.stationFrom || prev.sourceStation || (route[0] || ''),
            destinationStation: parsed.stationTo || prev.destinationStation || (route[route.length - 1] || ''),
            route: route.length > 0 ? route : prev.route || [],
            trainDetails: parsed
        };
        sessionStorage.setItem('irctcTrainInfo', JSON.stringify(merged));
        origLog('%c\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501', 'color:#22c55e');
        origLog(`%c\ud83d\ude82 TRAIN DETAILS CAPTURED`, 'color:#22c55e;font-weight:bold;font-size:13px');
        origLog(`%c   Number : ${merged.trainNumber || 'N/A'}`, 'color:#4ade80;font-weight:bold');
        origLog(`%c   Name   : ${merged.trainName || 'N/A'}`, 'color:#4ade80;font-weight:bold');
        origLog(`%c   From   : ${merged.sourceStation || 'N/A'}`, 'color:#4ade80');
        origLog(`%c   To     : ${merged.destinationStation || 'N/A'}`, 'color:#4ade80');
        origLog(`%c   Stops  : ${route.length || 0} stations`, 'color:#4ade80');
        origLog('%c\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501', 'color:#22c55e');
        origLog('%c\u27a1 Now select boarding station and click "Get Train Chart"', 'color:#fbbf24;font-weight:bold');
    }

    function installNetworkCapture() {
        // Intercept XHR
        const nativeOpen = XMLHttpRequest.prototype.open;
        const nativeSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function(...args) {
            this.__collectorUrl = args[1] || '';
            return nativeOpen.apply(this, args);
        };
        XMLHttpRequest.prototype.send = function(...args) {
            this.addEventListener('load', function() {
                if (this.status < 200 || this.status >= 300) return;
                const url = this.__collectorUrl || '';
                let text = '';
                try { text = this.responseText; } catch (_) { text = typeof this.response === 'string' ? this.response : ''; }
                const parsed = parseMaybeJson(text);
                if (!parsed) return;
                // Train details
                if (parsed.trainNumber && parsed.stationList) {
                    captureTrainDetails(parsed);
                }
                // VacantBerth
                if (url.toLowerCase().includes('vacantberth') || url.toLowerCase().includes('vacant')) {
                    if (Array.isArray(parsed.vbd)) handleVbdResponse(parsed, url);
                }
            });
            return nativeSend.apply(this, args);
        };

        // Intercept fetch
        const nativeFetch = window.fetch;
        if (typeof nativeFetch === 'function') {
            window.fetch = async function(...args) {
                const response = await nativeFetch.apply(this, args);
                const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
                response.clone().text().then(text => {
                    const parsed = parseMaybeJson(text);
                    if (!parsed) return;
                    if (parsed.trainNumber && parsed.stationList) {
                        captureTrainDetails(parsed);
                    }
                    if (url.toLowerCase().includes('vacantberth') || url.toLowerCase().includes('vacant')) {
                        if (Array.isArray(parsed.vbd)) handleVbdResponse(parsed, url);
                    }
                }).catch(() => {});
                return response;
            };
        }
    }

    // === VBD CONVERSION ===
    function buildFullBsd(vacantSegments, sourceStation, destinationStation) {
        const sorted = vacantSegments.slice().sort((a, b) => a.splitNo - b.splitNo);
        const bsd = [];
        let splitNo = 1;
        if (sorted[0].from !== sourceStation && sourceStation) {
            bsd.push({ splitNo: splitNo++, from: sourceStation, to: sorted[0].from, quota: 'GN', occupancy: true });
        }
        for (let i = 0; i < sorted.length; i++) {
            if (i > 0) {
                const prevTo = sorted[i - 1].to;
                const currFrom = sorted[i].from;
                if (prevTo !== currFrom) {
                    bsd.push({ splitNo: splitNo++, from: prevTo, to: currFrom, quota: 'GN', occupancy: true });
                }
            }
            bsd.push({ splitNo: splitNo++, from: sorted[i].from, to: sorted[i].to, quota: 'GN', occupancy: false });
        }
        const lastTo = sorted[sorted.length - 1].to;
        if (lastTo !== destinationStation && destinationStation) {
            bsd.push({ splitNo: splitNo++, from: lastTo, to: destinationStation, quota: 'GN', occupancy: true });
        }
        return bsd;
    }

    function convertVbdToCoachFormat(vbdResponse) {
        const vbd = vbdResponse.vbd || [];
        if (!vbd.length) return [];

        const coachGrouped = {};
        for (const item of vbd) {
            const name = item.coachName || 'Unknown';
            if (!coachGrouped[name]) coachGrouped[name] = [];
            coachGrouped[name].push(item);
        }

        const info = getTrainInfo();
        let sourceStation = info.sourceStation || info.stationFrom || '';
        let destinationStation = info.destinationStation || info.stationTo || '';

        // Derive source/destination from vbd data if not available
        // Note: only use first 'from' as source (reliable), but DO NOT derive destination
        // from vbd because vbd only contains vacant segments and may not reach the actual destination
        if (!sourceStation) {
            // The earliest 'from' station across all berths with splitNo=1 is likely the source
            const splitOneFroms = vbd.filter(v => v.splitNo === 1).map(v => v.from);
            if (splitOneFroms.length > 0) {
                // Most common 'from' in splitNo=1 entries
                const freq = {};
                splitOneFroms.forEach(f => { freq[f] = (freq[f] || 0) + 1; });
                sourceStation = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
            }
        }

        return Object.entries(coachGrouped).map(([coachName, items]) => {
            const coachClass = deriveClassFromCoachName(coachName);
            const totalBerths = getTotalBerthsForClass(coachClass);

            const berthGrouped = {};
            for (const item of items) {
                const key = item.berthNumber;
                if (!berthGrouped[key]) berthGrouped[key] = [];
                berthGrouped[key].push(item);
            }

            const bdd = [];
            for (let berthNo = 1; berthNo <= totalBerths; berthNo++) {
                if (berthGrouped[berthNo]) {
                    const segments = berthGrouped[berthNo];
                    const first = segments[0];
                    const bsd = buildFullBsd(segments, sourceStation, destinationStation);
                    bdd.push({
                        cabinCoupe: first.cabinCoupe || null,
                        cabinCoupeNameNo: first.cabinCoupeNo || null,
                        berthCode: (first.berthCode || '').trim(),
                        berthNo: berthNo,
                        from: sourceStation || bsd[0].from,
                        to: destinationStation || bsd[bsd.length - 1].to,
                        bsd,
                        quotaCntStn: null,
                        enable: true
                    });
                } else {
                    bdd.push({
                        cabinCoupe: null,
                        cabinCoupeNameNo: null,
                        berthCode: '',
                        berthNo: berthNo,
                        from: sourceStation,
                        to: destinationStation,
                        bsd: [{ splitNo: 1, from: sourceStation, to: destinationStation, quota: 'GN', occupancy: true }],
                        quotaCntStn: null,
                        enable: true
                    });
                }
            }

            return {
                bdd, coachName,
                error: vbdResponse.error || null,
                coachClass,
                trainNumber: info.trainNo || '',
                trainNo: info.trainNo || '',
                trainName: info.trainName || '',
                trainType: info.trainType || '',
                sourceStation, destinationStation
            };
        });
    }

    function handleVbdResponse(payload, url) {
        if (!payload || !Array.isArray(payload.vbd)) return;
        const coachData = convertVbdToCoachFormat(payload);
        for (const coach of coachData) {
            const key = coach.coachName;
            if (seenCoaches.has(key)) continue;
            seenCoaches.add(key);
            coaches.push(coach);
            origLog(`%c\u2713 Captured: ${key} (${coach.coachClass}) \u2014 ${coach.bdd.length} berths | Total coaches: ${coaches.length}`, 'color:#22c55e;font-weight:bold');
        }
    }

    // === INSTALL INTERCEPTION ===
    installNetworkCapture();

    // === PAYLOAD & DOWNLOAD ===
    function buildPayload() {
        let info = getTrainInfo();

        if (!info.trainNo) {
            const pageInfo = detectTrainInfoFromPage();
            info = { ...info, ...pageInfo };
            sessionStorage.setItem('irctcTrainInfo', JSON.stringify(info));
        }

        if ((!info.sourceStation || !info.destinationStation) && coaches.length > 0) {
            const firstCoach = coaches[0];
            if (firstCoach.bdd && firstCoach.bdd.length > 0) {
                const firstBerth = firstCoach.bdd[0];
                if (!info.sourceStation && firstBerth.from) info.sourceStation = firstBerth.from;
            }
        }

        // Prompt user if destination still unknown
        if (!info.destinationStation) {
            const dest = prompt('Destination station could not be detected.\nPlease enter the destination station code (e.g., MYS, LTT):');
            if (dest && dest.trim()) info.destinationStation = dest.trim().toUpperCase();
        }
        if (!info.sourceStation) {
            const src = prompt('Source station could not be detected.\nPlease enter the source station code (e.g., CUPJ, KIK):');
            if (src && src.trim()) info.sourceStation = src.trim().toUpperCase();
        }
        if (!info.trainNo) {
            const no = prompt('Train number could not be detected.\nPlease enter the 5-digit train number:');
            if (no && no.trim()) { info.trainNo = no.trim(); info.trainNumber = no.trim(); }
        }
        if (!info.trainName) {
            const name = prompt('Train name could not be detected.\nPlease enter the train name (e.g., MYSURU EXPRESS):');
            if (name && name.trim()) info.trainName = name.trim();
        }

        return {
            trainNumber: info.trainNo || info.trainNumber || '',
            trainNo: info.trainNo || info.trainNumber || '',
            trainName: info.trainName || '',
            trainType: info.trainType || '',
            sourceStation: info.sourceStation || info.stationFrom || '',
            destinationStation: info.destinationStation || info.stationTo || '',
            fromStation: info.sourceStation || info.stationFrom || '',
            toStation: info.destinationStation || info.stationTo || '',
            runningDays: info.runningDays || [],
            route: info.route || [],
            stationList: info.stationList || [],
            trainDetails: info.trainDetails || null,
            journeyDate: info.journeyDate || todayIsoDate(),
            coachDetails: coaches.map(c => ({ coachName: c.coachName, coachClass: c.coachClass, berthCount: c.bdd.length })),
            coaches
        };
    }

    // === PUBLIC API ===
    const collector = {
        getCoaches: () => coaches,
        getTrainInfo,
        status() {
            const info = getTrainInfo();
            origLog(`%c\ud83d\udcca Train: ${info.trainNo || '?'} ${info.trainName || ''}`, 'color:purple');
            origLog(`%c\ud83d\udcca From/To: ${info.sourceStation || '?'} \u2192 ${info.destinationStation || '?'}`, 'color:purple');
            origLog(`%c\ud83d\udcca Coaches: ${coaches.length} captured: ${coaches.map(c => `${c.coachName}(${c.coachClass})`).join(', ')}`, 'color:purple');
            origLog(`%c\ud83d\udcca Total berths: ${coaches.reduce((s, c) => s + c.bdd.length, 0)}`, 'color:purple');
        },
        downloadJson(filename) {
            const payload = buildPayload();
            if (!filename) {
                const no = payload.trainNumber || 'train';
                const now = new Date();
                const ddmm = String(now.getDate()).padStart(2, '0') + String(now.getMonth() + 1).padStart(2, '0');
                filename = `${no} ${ddmm}.json`;
            }
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            origLog(`%c\u2b07 Downloaded ${filename} (${coaches.length} coaches, ${coaches.reduce((s, c) => s + c.bdd.length, 0)} berths)`, 'color:blue;font-weight:bold');
        },
        reset() {
            coaches.length = 0;
            seenCoaches.clear();
            origLog('%c\u21ba Collector reset', 'color:orange;font-weight:bold');
        }
    };

    if (!window.irctcChartCollector) {
        window.irctcChartCollector = collector;
    }
    window.irctc2ndChartCollector = collector;

    // === STARTUP MESSAGE ===
    origLog('%c\u2705 2nd Chart Collector ready.', 'color:#22c55e;font-size:13px;font-weight:bold');
    origLog('%c\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501', 'color:#64748b');
    origLog('%c\ud83d\udccb NEXT STEPS:', 'color:#fbbf24;font-weight:bold;font-size:13px');
    origLog('%c   1. Enter the 5-digit train number in the search box', 'color:#e2e8f0');
    origLog('%c   2. Train details will be captured automatically (watch for green \u2713)', 'color:#e2e8f0');
    origLog('%c   3. Select boarding station and click "Get Train Chart"', 'color:#e2e8f0');
    origLog('%c   4. Click each coach class button (Sleeper, 2AC, 3AC...)', 'color:#e2e8f0');
    origLog('%c   5. After clicking, go back and click the next class', 'color:#e2e8f0');
    origLog('%c   6. When done, run:', 'color:#e2e8f0');
    origLog('%c      window.irctcChartCollector.downloadJson()', 'color:#67e8f9;font-family:monospace');
    origLog('%c\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501', 'color:#64748b');
    origLog('%c\u23f3 Waiting for train number entry...', 'color:#94a3b8');
})();
