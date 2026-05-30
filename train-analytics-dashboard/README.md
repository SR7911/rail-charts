# Train Analytics Dashboard

A responsive analytics app for IRCTC coach chart JSON. It loads train metadata, route, coach details, and coach occupancy from a single exported JSON file, then generates charts and tables for station movement, OD flows, class-wise movement, and load analysis.

## 📋 Project Structure

```
train-analytics-dashboard/
├── index.html              # Main HTML file (entry point)
├── css/
│   └── styles.css         # Styling and responsive layout
├── js/
│   └── app.js             # Dashboard logic and analytics
├── data/                  # Input JSON files and downloads
├── scripts/               # Collector + automation helpers
│   ├── irctc-chart-collector.js
│   ├── irctc-collector-auto.js
├── package.json           # Node scripts and dev dependencies
├── README.md              # Project documentation
└── .gitignore             # Git ignore rules
```

## 🚀 What it does

- Parses IRCTC coach JSON and extracts all coach boarding/deboarding segments
- Builds station-level boarding, deboarding, net change, and cumulative load
- Creates an Origin-Destination (OD) matrix with colored intensity
- Adds class-wise origin→destination movement and totals
- Shows chart exports, screenshot export, and clipboard report copy
- Supports both manual JSON upload and automated IRCTC extraction

## 📦 Dependencies

- **Chart.js 3.9.1**
- **chartjs-plugin-datalabels 2.0.0**
- **html2canvas 1.4.1**
- **http-server** (development script)
- **puppeteer** (automation helper)

> The dashboard itself loads charts and screenshot libraries from CDN; `npm install` is only required for automation and local server helpers.

## 🛠️ Setup

Open a terminal in `train-analytics-dashboard` and run:

```bash
npm install
```

Then start the app locally with either:

```bash
npm run serve
```

or

```bash
npm start
```

Open `http://localhost:8000` or `http://127.0.0.1:8080` in your browser.

## 📝 Using the Dashboard

### 1. Upload a JSON file
- Drag and drop, or click the upload area
- Supported files: JSON, TXT
- Recommended: use the IRCTC collector export from `scripts/irctc-chart-collector.js`

### 2. Generate the report
- Click **Generate Analytics Report**
- The dashboard shows
  - passenger totals
  - station-wise charts
  - OD matrix
  - class-wise movement
  - export buttons

### 3. Export data
- Download charts as high-resolution PNG
- Take a full-page screenshot of the report
- Copy the report text to clipboard

## ✅ Expected Input JSON

The collector output should include metadata plus coach objects.

Example structure:

```json
{
  "trainNumber": "16231",
  "trainName": "Example Express",
  "trainType": "Express",
  "sourceStation": "CUPJ",
  "destinationStation": "MYS",
  "route": ["CUPJ", "CDM", "MYS"],
  "stationList": ["CUPJ", "CDM", "MYS"],
  "trainDetails": { "...": "raw train details response from IRCTC" },
  "coachDetails": [
    { "coachName": "A1", "coachClass": "2A", "berthCount": 54 }
  ],
  "coaches": [
    { "coachName": "A1", "bdd": [ /* berth segments */ ] }
  ]
}
```

### Coach object schema

```json
{
  "coachName": "A1",
  "coachClass": "2A",
  "bdd": [
    {
      "berthNumber": "1",
      "bsd": [
        { "from": "CUPJ", "to": "CDM", "occupancy": true },
        { "from": "CDM", "to": "MYS", "occupancy": false }
      ]
    }
  ]
}
```

## 🌐 IRCTC JSON Collector

There are two supported extraction methods.

### Option 1: Automated collector

1. Install dependencies in the dashboard folder:
   ```bash
   npm install
   ```
2. Run the automation script:
   ```bash
   npm run irctc-auto
   ```
3. The script opens `https://www.irctc.co.in/online-charts`.
4. Enter the train number and select the source station.
5. The collector is injected before train metadata loads and stays active through navigation.
6. When the coach screen appears, the script clicks coach buttons automatically.
7. The JSON is downloaded into the `data/` folder.

### Option 2: Manual browser collector

1. Open `https://www.irctc.co.in/online-charts`
2. Open DevTools and paste `scripts/irctc-chart-collector.js`
3. Press Enter to install the collector
4. Enter the train number
5. Click the source station dropdown to load stoppages
6. Select source station and click **Get Train Chart**
7. Once on the coach buttons screen shows
8. Click each coach button until all coaches are captured
9. Run:
   ```js
   window.irctcChartCollector.status()
   ```
10. Then run:
   ```js
   window.irctcChartCollector.downloadJson()
   ```

### Important note

The collector must be injected before the train detail XHR completes. If metadata is missing, refresh the page and run the collector again prior to loading the coach chart.

## 📌 Troubleshooting

### Why is `trainName` or `route` blank?
- The collector was injected too late
- The page already loaded train metadata before interception
- Refresh and rerun the collector/automation from the start

### Why does route show invalid codes?
- That only happens if route inference falls back to generic uppercase tokens
- The collector now avoids this and only uses route selectors or XHR payloads

### If the automated collector still fails
- Make sure the page is at `online-charts`
- Ensure the source station dropdown was opened
- Look for console logs in the browser/devtools
- If needed, use the manual collector process

## 🧪 Validation

This dashboard has been tested with real IRCTC collector JSON files and includes:
- station boarding/deboarding tables
- net station load
- OD matrix visualization
- class-wise origin→destination charts
- high-res export functions

## 📦 Scripts

- `npm start` — Launches `http-server .`
- `npm run serve` — Launches `python -m http.server 8000`
- `npm run irctc-auto` — Runs the IRCTC automation collector

## 🛠️ Development Notes

- `js/app.js` contains all analytics logic
- `css/styles.css` contains all app styling
- `scripts/irctc-chart-collector.js` is the manual collector
- `scripts/irctc-collector-auto.js` is the automated puppeteer helper

## 📄 License

MIT-style usage for analytics and experimentation.

---

**Last updated**: May 2026
