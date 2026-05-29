# Train Analytics Dashboard

A professional, responsive web application for analyzing train occupancy data from a single self-contained IRCTC collector JSON.

## 📋 Project Structure

```
train-analytics-dashboard/
├── index.html              # Main HTML file (entry point)
├── css/
│   └── styles.css         # All styling (extracted from original file)
├── js/
│   └── app.js             # All application logic (extracted from original file)
├── data/                  # Data files (JSON inputs)
├── assets/                # Images, icons, fonts
├── package.json           # Project metadata & dependencies
├── README.md              # This file
└── .gitignore             # Git ignore rules
```

## 🚀 Features

- **Single JSON Workflow**: Load train info, route, coach details, and coach data from one collector JSON
- **File Upload**: Import self-contained collector JSON files with train info, route, coach details, and coach data
- **Analytics Dashboard**: 
  - Real-time occupancy calculations
  - Station-wise boarding/deboarding analysis
  - Origin-Destination (OD) matrix visualization
  - Interactive charts with Chart.js
- **Export Options**:
  - Download charts as high-resolution PNG images
  - Copy full report to clipboard
  - Take screenshots of reports

## 📦 Dependencies

- **Chart.js 3.9.1** - Data visualization
- **chartjs-plugin-datalabels 2.0.0** - Chart labels
- **html2canvas 1.4.1** - Screenshot capture

All dependencies are loaded via CDN (no local installation required).

## 🛠️ Getting Started

### Option 1: Local File System
1. Extract all project files to a folder
2. Open `index.html` in a modern web browser
3. Upload JSON data files containing coach information

### Option 2: Web Server
```bash
# Using Python 3
python -m http.server 8000

# Using Node.js (with http-server)
npx http-server
```
Then navigate to `http://localhost:8000`

## 📝 Usage

### 1. Upload Data
- Click upload area or drag-drop JSON/TXT files
- Prefer the self-contained JSON created by `scripts/irctc-chart-collector.js`
- Older files containing only coach objects are still supported with the default route
- Expected format:
  ```json
  {
    "trainNumber": "16231",
    "trainName": "Example Express",
    "sourceStation": "CUPJ",
    "destinationStation": "MYS",
    "route": ["CUPJ", "CDM", "MYS"],
    "coachDetails": [{ "coachName": "A1", "coachClass": "2A", "berthCount": 54 }],
    "coaches": [{ "coachName": "A1", "bdd": [] }]
  }
  ```

### 2. Generate Report
1. After uploading files, click "Generate Analytics Report"
2. Wait for processing to complete
3. View interactive charts and statistics
4. Download or copy results

## 🎨 Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Charting**: Chart.js with Data Labels plugin
- **Export**: html2canvas for screenshot generation
- **Compatibility**: Chrome, Firefox, Safari, Edge (modern versions)

## 📊 Data Format

### Coach Data Structure
```json
{
  "coachNumber": "A1",
  "totalSeats": 72,
  "berths": [
    {
      "berthNumber": "1",
      "passenger": {
        "origin": "CUPJ",
        "destination": "MYS"
      }
    }
  ]
}
```

### Route Format
```json
["CUPJ", "CDM", "SY", "MV", "KTM", "MYS"]
```

## 📈 Analytics Generated

- **Total Passengers**: Count of all bookings
- **Seat Utilization**: Percentage of occupied berths
- **Segment Occupancy**: Passenger load on each route segment
- **Station Movement**: Boardings and deboardings per station
- **OD Matrix**: Origin-Destination flow analysis
- **Peak Occupancy**: Busiest segments identified

## 🖥️ Responsive Design

The dashboard is fully responsive and works on:
- Desktop (1600px max container width)
- Tablet (768px breakpoint)
- Mobile (small screens)

## 🔧 Configuration

Default route (30 stations):
```
CUPJ → CDM → SY → MV → KTM → ADT → KMU → PML → TJ → BAL → TRB → TPJ 
→ TP → KLT → KRR → PGR → KMD → URL → ED → SA → DPJ → HSRA → CRLM 
→ BNCE → BNC → SBC → KGI → MAD → MYA → MYS
```

## 📦 Development

### File Organization
- **index.html**: Clean semantic HTML (no embedded styles/scripts)
- **css/styles.css**: All CSS (250+ lines extracted from original)
- **js/app.js**: All JavaScript logic (~500+ lines extracted from original)

### Key Functions
- `normalizeUploadedJson()` - Single JSON metadata and coach extraction
- `processFiles()` - File upload handling
- `generateReport()` - Analytics calculation
- `renderCharts()` - Chart visualization
- `downloadChartAsImage()` - Export functionality

## 🐛 Troubleshooting

### Charts not displaying?
- Ensure Chart.js and plugins are loaded from CDN
- Check browser console for errors
- Verify data format matches expected structure

### Upload fails?
- Use valid JSON format
- Check file encoding (UTF-8)
- Verify file size is reasonable

### Export not working?
- Modern browser required (IE not supported)
- Check browser permissions for downloads
- Ensure enough system memory for canvas rendering

## 📄 License

This project was created as a data analytics tool for train occupancy analysis.

## 🤝 Contributing

To modify or extend:
1. Edit `css/styles.css` for styling changes
2. Edit `js/app.js` for functionality changes
3. Keep `index.html` minimal and semantic
4. Update this README with new features

## 🧰 IRCTC Chart JSON Extractor

Automate chart data extraction from `irctc.co.in/online-charts`:

1. Open the website, enter train number — the train name and type will appear.
2. Click the source station dropdown (this loads all stoppages).
3. Press **F12** → **Console** tab → type `allow pasting` + Enter.
4. Paste the contents of `scripts/irctc-chart-collector.js` and press Enter.
5. It will display train name, type, and route.
6. Now select source station and click **Get Train Chart**.
7. Once redirected to the coach buttons screen, paste the script again and press Enter.
8. Click each coach button one by one:
   - Click coach 1 → nothing prints yet
   - Click coach 2 → captures coach 1 data
   - Click coach 3 → captures coach 2 data
   - ...continue for all coaches...
   - After clicking the last coach, click **any other coach again** to flush the last coach's data
9. Run `window.irctcChartCollector.status()` to verify all coaches were captured.
10. Run `window.irctcChartCollector.downloadJson()` to download the JSON file.

The file is automatically named `<trainNo> <DDMM>.json` (e.g. `16231 1805.json`).  
You can also pass a custom name: `window.irctcChartCollector.downloadJson('custom.json')`

The downloaded JSON now contains:

```json
{
  "trainNumber": "16231",
  "trainName": "Example Express",
  "trainType": "Express",
  "sourceStation": "CUPJ",
  "destinationStation": "MYS",
  "route": ["CUPJ", "CDM", "MYS"],
  "trainDetails": { "...": "raw train details response from IRCTC" },
  "coachDetails": [{ "coachName": "A1", "coachClass": "2A", "berthCount": 54 }],
  "coaches": [{ "...": "coach chart data" }]
}
```

Upload this single JSON in the dashboard to show train name, train number, source, destination, route list, and all coach analytics automatically.

Note: the collector can capture the train-details XHR only after it is installed. If the Network response loaded before pasting the script, re-enter/select the train again, or copy the response JSON and run:

```js
window.irctcChartCollector.addTrainDetails({ ...responseJson })
```

---

**Created**: May 2024  
**Last Updated**: May 2026
