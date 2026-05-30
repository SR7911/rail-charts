const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', '16231 1805.json');
const TRAIN_ROUTE = ["CUPJ","CDM","SY","MV","KTM","ADT","KMU","PML","TJ","BAL","TRB","TPJ","TP","KLT","KRR","PGR","KMD","URL","ED","SA","DPJ","HSRA","CRLM","BNCE","BNC","SBC","KGI","MAD","MYA","MYS"];

function getStationIndex(route, st) {
    return route.indexOf(st);
}
function getAllSegmentsBetween(route, a, b) {
    const fa = getStationIndex(route, a);
    const fb = getStationIndex(route, b);
    if (fa === -1 || fb === -1 || fa >= fb) return [];
    const segs = [];
    for (let i = fa; i < fb; i++) segs.push(`${route[i]}→${route[i+1]}`);
    return segs;
}
function normalizeCoaches(parsed) {
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.coaches)) return parsed.coaches;
        if (parsed.bdd || parsed.coachName) return [parsed];
    }
    return [];
}

try {
    const text = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(text);
    const coaches = normalizeCoaches(parsed);
    const classSeatTotals = {};
    const stationClassBoardings = {};
    const stationClassDeboardings = {};
    const stationClassOd = {};

    let total_pass = 0;
    coaches.forEach((coach, cidx) => {
        const bdd = coach.bdd || [];
        const coachClass = coach.coachClass || coach.class || coach.type || 'Unknown';
        classSeatTotals[coachClass] = (classSeatTotals[coachClass] || 0) + bdd.length;

        bdd.forEach(berth => {
            const bsd = berth.bsd || [];
            let journeyStart = null, journeyEnd = null, isOn = false;
            for (const seg of bsd) {
                const occ = seg.occupancy;
                if (occ === true && !isOn) { journeyStart = seg.from; isOn = true; }
                else if (occ === false && isOn) { journeyEnd = seg.from; break; }
            }
            if (isOn && !journeyEnd && bsd.length > 0) journeyEnd = bsd[bsd.length-1].to;
            if (journeyStart && journeyEnd && journeyStart !== journeyEnd) {
                const fa = getStationIndex(TRAIN_ROUTE, journeyStart);
                const fb = getStationIndex(TRAIN_ROUTE, journeyEnd);
                if (fa === -1 || fb === -1 || fa >= fb) return;
                total_pass++;
                stationClassBoardings[journeyStart] = stationClassBoardings[journeyStart] || {};
                stationClassBoardings[journeyStart][coachClass] = (stationClassBoardings[journeyStart][coachClass] || 0) + 1;
                stationClassDeboardings[journeyEnd] = stationClassDeboardings[journeyEnd] || {};
                stationClassDeboardings[journeyEnd][coachClass] = (stationClassDeboardings[journeyEnd][coachClass] || 0) + 1;
                stationClassOd[journeyStart] = stationClassOd[journeyStart] || {};
                stationClassOd[journeyStart][journeyEnd] = stationClassOd[journeyStart][journeyEnd] || {};
                stationClassOd[journeyStart][journeyEnd][coachClass] = (stationClassOd[journeyStart][journeyEnd][coachClass] || 0) + 1;
            }
        });
    });

    console.log('Class seat totals:');
    Object.keys(classSeatTotals).forEach(cl => console.log(`  ${cl}: ${classSeatTotals[cl]}`));

    const origin = TRAIN_ROUTE[0];
    console.log('\nSample Class-wise OD from origin:', origin);
    const od_from_origin = stationClassOd[origin] || {};
    if (!Object.keys(od_from_origin).length) {
        console.log('  No OD data from this origin in the file.');
    } else {
        Object.keys(od_from_origin).forEach(dest => {
            console.log(`  to ${dest}:`);
            const m = od_from_origin[dest];
            Object.keys(m).forEach(cl => console.log(`    ${cl}: ${m[cl]}`));
        });
    }
} catch (err) {
    console.error('Error running test:', err.message);
}
