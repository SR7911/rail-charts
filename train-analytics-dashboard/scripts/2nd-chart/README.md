# 2nd Chart Preparation - Data Collector

Collects vacant berth data from IRCTC online charts after **2nd chart preparation**. Produces the same JSON format as the 1st chart collector, compatible with the Train Analytics Dashboard.

## How 2nd Chart Differs from 1st Chart

| Aspect | 1st Chart | 2nd Chart |
|--------|-----------|-----------|
| When | ~4 hours before departure | ~30 mins before departure |
| UI | Individual coach buttons (S1, S2, B1...) | Coach class buttons (Sleeper, 2AC, 3AC...) |
| Network response | `bdd` array per coach | `vacantBerth` XHR with `vbd` array |
| Data | All berths with full occupancy | Only vacant berth segments |
| Navigation | Stays on same page | Navigates to vacant details, need to go back |

## Files

```
scripts/
├── irctc-chart-collector-2nd.js   # Manual collector (paste in browser console)
├── irctc-collector-auto-2nd.js    # Puppeteer automation
```

## Manual Collection

1. Open `https://www.irctc.co.in/online-charts`
2. Open DevTools Console (F12 → Console)
3. Paste the contents of `scripts/irctc-chart-collector-2nd.js` and press Enter
4. Enter the 5-digit train number (train details are captured automatically from network)
5. Select boarding station and click **Get Train Chart**
6. You'll see coach class buttons (Sleeper, Second AC, Third AC, etc.)
7. Click a class button → vacant berth data is captured automatically
8. Navigate back to the class selection screen
9. Click the next class button, repeat for all available classes
10. Check progress:
    ```js
    window.irctcChartCollector.status()
    ```
11. Download the JSON:
    ```js
    window.irctcChartCollector.downloadJson()
    ```

## Automated Collection

1. Install dependencies (if not already done):
   ```bash
   cd train-analytics-dashboard
   npm install
   ```

2. Run:
   ```bash
   node scripts/irctc-collector-auto-2nd.js
   ```

3. Browser opens IRCTC online charts page
4. Enter the 5-digit train number (train details captured automatically)
5. Select boarding station and click **Get Train Chart**
6. Wait for coach class buttons to appear
7. Press ENTER in terminal
8. Script automatically:
   - Detects class buttons (Sleeper, 2AC, 3AC...)
   - Clicks each button
   - Waits for `vacantBerth` XHR response (intercepted via CDP)
   - Navigates back
   - Repeats for all classes
9. JSON saved to `data/` folder

## Output Format

Same structure as 1st chart output, compatible with the dashboard:

```json
{
  "trainNumber": "11018",
  "trainNo": "11018",
  "trainName": "KARNATAKA EXP",
  "sourceStation": "KIK",
  "destinationStation": "LTT",
  "route": ["KIK", "NGT", "VM", "TBM", "MS", "PUNE", "LTT"],
  "stationList": [...],
  "trainDetails": {...},
  "coachDetails": [
    { "coachName": "S1", "coachClass": "SL", "berthCount": 72 }
  ],
  "coaches": [
    {
      "coachName": "S1",
      "coachClass": "SL",
      "bdd": [
        {
          "berthNo": 4,
          "from": "KIK",
          "to": "LTT",
          "bsd": [
            { "splitNo": 1, "from": "KIK", "to": "VM", "occupancy": false },
            { "splitNo": 2, "from": "VM", "to": "LTT", "occupancy": true }
          ]
        },
        {
          "berthNo": 23,
          "from": "KIK",
          "to": "LTT",
          "bsd": [
            { "splitNo": 1, "from": "KIK", "to": "NGT", "occupancy": false },
            { "splitNo": 2, "from": "NGT", "to": "PUNE", "occupancy": true },
            { "splitNo": 3, "from": "PUNE", "to": "LTT", "occupancy": false }
          ]
        }
      ]
    }
  ]
}
```

## How VBD Conversion Works

The `vacantBerth` API returns only vacant segments. The collector fills in occupied gaps:

**Raw `vbd` response:**
```json
{ "coachName": "S1", "berthNumber": 23, "from": "KIK", "to": "NGT", "splitNo": 1 },
{ "coachName": "S1", "berthNumber": 23, "from": "PUNE", "to": "LTT", "splitNo": 2 }
```

**Converted output:**
```json
{
  "berthNo": 23,
  "from": "KIK",
  "to": "LTT",
  "bsd": [
    { "splitNo": 1, "from": "KIK", "to": "NGT", "occupancy": false },
    { "splitNo": 2, "from": "NGT", "to": "PUNE", "occupancy": true },
    { "splitNo": 3, "from": "PUNE", "to": "LTT", "occupancy": false }
  ]
}
```

Rules:
- Vacant segments from `vbd` → `occupancy: false`
- Gaps between vacant segments → `occupancy: true`
- If first vacant doesn't start at source station → occupied head added
- If last vacant doesn't end at destination station → occupied tail added

## Troubleshooting

### Train details missing in output
- The collector must be injected **before** entering the train number
- If already entered, refresh and re-inject before searching again

### No class buttons detected
- Ensure 2nd chart is actually prepared (check IRCTC website)
- If auto-detection fails, the script tries a broader button search
- Use manual process as fallback

### Back navigation not working
- The auto script tries multiple back button patterns
- If it fails, the script falls back to `history.back()`
- In manual mode, just click the browser back button yourself
