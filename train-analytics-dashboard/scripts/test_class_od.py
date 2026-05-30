import json
from collections import defaultdict

DATA_FILE = r"d:\Project Files\rail-charts\train-analytics-dashboard\data\16231 1805.json"
TRAIN_ROUTE = ["CUPJ","CDM","SY","MV","KTM","ADT","KMU","PML","TJ","BAL","TRB","TPJ","TP","KLT","KRR","PGR","KMD","URL","ED","SA","DPJ","HSRA","CRLM","BNCE","BNC","SBC","KGI","MAD","MYA","MYS"]

def get_station_index(route, st):
    try:
        return route.index(st)
    except ValueError:
        return -1


def get_all_segments_between(route, a, b):
    fa = get_station_index(route, a)
    fb = get_station_index(route, b)
    if fa == -1 or fb == -1 or fa >= fb:
        return []
    segs = []
    for i in range(fa, fb):
        segs.append(f"{route[i]}→{route[i+1]}")
    return segs


def normalize_coaches(parsed):
    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict):
        # heuristics
        if 'coaches' in parsed and isinstance(parsed['coaches'], list):
            return parsed['coaches']
        if 'bdd' in parsed or 'coachName' in parsed:
            return [parsed]
    return []


def main():
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        text = f.read()
    parsed = json.loads(text)
    coaches = normalize_coaches(parsed)

    classSeatTotals = defaultdict(int)
    stationClassBoardings = defaultdict(lambda: defaultdict(int))
    stationClassDeboardings = defaultdict(lambda: defaultdict(int))
    stationClassOd = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))

    total_pass = 0

    for cidx, coach in enumerate(coaches):
        bdd = coach.get('bdd') or []
        coach_class = coach.get('coachClass') or coach.get('class') or coach.get('type') or 'Unknown'
        seats = len(bdd)
        classSeatTotals[coach_class] += seats

        for berth in bdd:
            bsd = berth.get('bsd') or []
            journeyStart = None
            journeyEnd = None
            isOn = False
            for seg in bsd:
                occ = seg.get('occupancy')
                if occ is True and not isOn:
                    journeyStart = seg.get('from')
                    isOn = True
                elif occ is False and isOn:
                    journeyEnd = seg.get('from')
                    break
            if isOn and not journeyEnd and len(bsd) > 0:
                journeyEnd = bsd[-1].get('to')
            if journeyStart and journeyEnd and journeyStart != journeyEnd:
                fa = get_station_index(TRAIN_ROUTE, journeyStart)
                fb = get_station_index(TRAIN_ROUTE, journeyEnd)
                if fa == -1 or fb == -1 or fa >= fb:
                    continue
                total_pass += 1
                stationClassBoardings[journeyStart][coach_class] += 1
                stationClassDeboardings[journeyEnd][coach_class] += 1
                stationClassOd[journeyStart][journeyEnd][coach_class] += 1

    # show totals for first origin station in TRAIN_ROUTE
    origin = TRAIN_ROUTE[0]
    print(f"Class seat totals:")
    for cl, tot in classSeatTotals.items():
        print(f"  {cl}: {tot}")

    print('\nSample Class-wise OD from origin:', origin)
    od_from_origin = stationClassOd.get(origin, {})
    if not od_from_origin:
        print('  No OD data from this origin in the file.')
        return
    for dest, m in od_from_origin.items():
        print(f"  to {dest}:")
        for cl, cnt in m.items():
            print(f"    {cl}: {cnt}")

if __name__ == '__main__':
    main()
