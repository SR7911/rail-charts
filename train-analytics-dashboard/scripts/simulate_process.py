import json
from pathlib import Path

TRAIN_ROUTE = [
    "CUPJ", "CDM", "SY", "MV", "KTM", "ADT", "KMU", "PML", "TJ",
    "BAL", "TRB", "TPJ", "TP", "KLT", "KRR", "PGR", "KMD", "URL",
    "ED", "SA", "DPJ", "HSRA", "CRLM", "BNCE", "BNC", "SBC", "KGI",
    "MAD", "MYA", "MYS"
]

def get_station_index(station):
    try:
        return TRAIN_ROUTE.index(station)
    except ValueError:
        return -1

def get_all_segments_between(from_station, to_station):
    segments = []
    from_idx = get_station_index(from_station)
    to_idx = get_station_index(to_station)
    if from_idx == -1 or to_idx == -1 or from_idx >= to_idx:
        return segments
    for i in range(from_idx, to_idx):
        segments.append(f"{TRAIN_ROUTE[i]}→{TRAIN_ROUTE[i+1]}")
    return segments

data_path = Path(__file__).parent.parent / 'data' / '16231 1805.json'
text = data_path.read_text(encoding='utf-8')
coach_array = json.loads(text)

total_passengers = 0
total_seats = 0
segment_occupancy = {f"{TRAIN_ROUTE[i]}→{TRAIN_ROUTE[i+1]}": 0 for i in range(len(TRAIN_ROUTE)-1)}
station_boardings = {}
station_deboardings = {}
od_matrix = {}

for coach in coach_array:
    if 'bdd' in coach and isinstance(coach['bdd'], list):
        total_seats += len(coach['bdd'])

for coach in coach_array:
    if 'bdd' not in coach or not isinstance(coach['bdd'], list):
        continue
    for berth in coach['bdd']:
        if 'bsd' not in berth or not isinstance(berth['bsd'], list):
            continue
        journey_start = None
        journey_end = None
        is_on_board = False
        for segment in berth['bsd']:
            if segment.get('occupancy') is True and not is_on_board:
                journey_start = segment.get('from')
                is_on_board = True
            elif segment.get('occupancy') is False and is_on_board:
                journey_end = segment.get('from')
                break
        if is_on_board and journey_end is None and len(berth['bsd']) > 0:
            journey_end = berth['bsd'][-1].get('to')
        if journey_start and journey_end and journey_start != journey_end:
            from_idx = get_station_index(journey_start)
            to_idx = get_station_index(journey_end)
            if from_idx == -1 or to_idx == -1 or from_idx >= to_idx:
                continue
            traveled_segments = get_all_segments_between(journey_start, journey_end)
            if len(traveled_segments) > 0:
                total_passengers += 1
                station_boardings[journey_start] = station_boardings.get(journey_start, 0) + 1
                station_deboardings[journey_end] = station_deboardings.get(journey_end, 0) + 1
                od_matrix.setdefault(journey_start, {})[journey_end] = od_matrix.get(journey_start, {}).get(journey_end, 0) + 1
                for seg in traveled_segments:
                    segment_occupancy[seg] = segment_occupancy.get(seg, 0) + 1

print('TotalSeats:', total_seats)
print('TotalPassengers:', total_passengers)
print('Top stationBoardings:', sorted(station_boardings.items(), key=lambda x: -x[1])[:10])
print('Top stationDeboardings:', sorted(station_deboardings.items(), key=lambda x: -x[1])[:10])
print('Top segments:', sorted([(k,v) for k,v in segment_occupancy.items() if v>0], key=lambda x: -x[1])[:10])
print('OD entries count:', len(od_matrix))
