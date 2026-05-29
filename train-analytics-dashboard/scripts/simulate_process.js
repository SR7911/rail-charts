const fs = require('fs');
const path = require('path');

const TRAIN_ROUTE = [
    "CUPJ", "CDM", "SY", "MV", "KTM", "ADT", "KMU", "PML", "TJ", 
    "BAL", "TRB", "TPJ", "TP", "KLT", "KRR", "PGR", "KMD", "URL", 
    "ED", "SA", "DPJ", "HSRA", "CRLM", "BNCE", "BNC", "SBC", "KGI", 
    "MAD", "MYA", "MYS"
];

function getStationIndex(station) { return TRAIN_ROUTE.indexOf(station); }
function getAllSegmentsBetween(fromStation, toStation) {
    const segments = [];
    const fromIdx = getStationIndex(fromStation);
    const toIdx = getStationIndex(toStation);
    if (fromIdx === -1 || toIdx === -1 || fromIdx >= toIdx) return segments;
    for (let i = fromIdx; i < toIdx; i++) segments.push(`${TRAIN_ROUTE[i]}→${TRAIN_ROUTE[i+1]}`);
    return segments;
}

const filePath = path.join(__dirname, '..', 'data', '16231 1805.json');
const text = fs.readFileSync(filePath, 'utf8');
const coachArray = JSON.parse(text);

let totalPassengers = 0;
let totalSeats = 0;
const segmentOccupancy = {};
const stationBoardings = {};
const stationDeboardings = {};
const stationBookings = {};
const odMatrix = {};

for (let i = 0; i < TRAIN_ROUTE.length - 1; i++) segmentOccupancy[`${TRAIN_ROUTE[i]}→${TRAIN_ROUTE[i+1]}`] = 0;

for (const coachData of coachArray) {
    if (coachData.bdd && Array.isArray(coachData.bdd)) totalSeats += coachData.bdd.length;
}

for (const coachData of coachArray) {
    if (!coachData.bdd || !Array.isArray(coachData.bdd)) continue;
    for (const berth of coachData.bdd) {
        if (!berth.bsd || !Array.isArray(berth.bsd)) continue;
        let journeyStart = null, journeyEnd = null, isOnBoard = false;
        for (const segment of berth.bsd) {
            if (segment.occupancy === true && !isOnBoard) {
                journeyStart = segment.from;
                isOnBoard = true;
            } else if (segment.occupancy === false && isOnBoard) {
                journeyEnd = segment.from;
                break;
            }
        }
        if (isOnBoard && !journeyEnd && berth.bsd.length > 0) journeyEnd = berth.bsd[berth.bsd.length - 1].to;
        if (journeyStart && journeyEnd && journeyStart !== journeyEnd) {
            const fromIdx = getStationIndex(journeyStart);
            const toIdx = getStationIndex(journeyEnd);
            if (fromIdx === -1 || toIdx === -1 || fromIdx >= toIdx) continue;
            const traveledSegments = getAllSegmentsBetween(journeyStart, journeyEnd);
            if (traveledSegments.length > 0) {
                totalPassengers++;
                stationBoardings[journeyStart] = (stationBoardings[journeyStart] || 0) + 1;
                stationBookings[journeyStart] = (stationBookings[journeyStart] || 0) + 1;
                stationDeboardings[journeyEnd] = (stationDeboardings[journeyEnd] || 0) + 1;
                if (!odMatrix[journeyStart]) odMatrix[journeyStart] = {};
                odMatrix[journeyStart][journeyEnd] = (odMatrix[journeyStart][journeyEnd] || 0) + 1;
                for (const seg of traveledSegments) segmentOccupancy[seg] = (segmentOccupancy[seg] || 0) + 1;
            }
        }
    }
}

console.log('TotalSeats:', totalSeats);
console.log('TotalPassengers:', totalPassengers);
console.log('Top stationBoardings:', Object.entries(stationBoardings).sort((a,b)=>b[1]-a[1]).slice(0,10));
console.log('Top stationDeboardings:', Object.entries(stationDeboardings).sort((a,b)=>b[1]-a[1]).slice(0,10));
console.log('Top segments:', Object.entries(segmentOccupancy).filter(([k,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,10));
console.log('OD entries count:', Object.keys(odMatrix).length);
