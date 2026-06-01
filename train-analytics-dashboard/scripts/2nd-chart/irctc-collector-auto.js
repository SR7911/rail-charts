const fs = require('fs');
const path = require('path');
const readline = require('readline');
const puppeteer = require('puppeteer');

const COLLECTOR_SCRIPT = path.join(__dirname, 'irctc-chart-collector.js');
const DOWNLOAD_DIR = path.join(__dirname, '..', 'data');

function waitForEnter(promptText) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(promptText, () => { rl.close(); resolve(); });
  });
}

function deriveClass(name) {
  if (/^S\d/i.test(name)) return 'SL';
  if (/^A\d/i.test(name)) return '2A';
  if (/^B\d/i.test(name)) return '3A';
  if (/^HA?\d/i.test(name)) return '1A';
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

async function findCoachClassButtons(page) {
  return await page.evaluate(() => {
    const classPatterns = /^(sleeper|second\s*ac|third\s*ac|first\s*ac|ac\s*chair|chair\s*car|2s|cc|ec|1a|2a|3a|3e|sl|fc|2nd\s*ac|3rd\s*ac|1st\s*ac|ac\s*first|ac\s*second|ac\s*third|first\s*class)$/i;
    const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], [role="tab"], .mat-tab-label, mat-chip, .coach-class-btn, [class*="class"], [class*="coach"]'));
    const found = [];
    for (const el of candidates) {
      const text = (el.innerText || el.textContent || '').trim();
      if (!text || text.length > 20) continue;
      if (classPatterns.test(text) && el.offsetParent !== null) {
        if (!found.some(f => f.text === text)) found.push({ text, index: found.length });
      }
    }
    return found;
  });
}

async function clickCoachClassButton(page, buttonText) {
  return await page.evaluate((text) => {
    const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], [role="tab"], .mat-tab-label, mat-chip, .coach-class-btn, [class*="class"], [class*="coach"]'));
    const target = candidates.find(el => (el.innerText || el.textContent || '').trim() === text && el.offsetParent !== null);
    if (!target) return false;
    target.click();
    return true;
  }, buttonText);
}

async function clickBackButton(page) {
  return await page.evaluate(() => {
    const backPatterns = /^(back|go\s*back|\u2190|\u2039|<|previous)$/i;
    const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], .back-btn, [class*="back"], mat-icon'));
    for (const el of candidates) {
      const text = (el.innerText || el.textContent || '').trim();
      if ((backPatterns.test(text) || el.getAttribute('aria-label')?.toLowerCase().includes('back') ||
           el.querySelector('mat-icon')?.textContent?.includes('arrow_back')) && el.offsetParent !== null) {
        el.click();
        return true;
      }
    }
    if (window.history.length > 1) { window.history.back(); return true; }
    return false;
  });
}

async function setupDownloadBehavior(page) {
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOAD_DIR });
}

async function injectCollectorScript(page) {
  const content = fs.readFileSync(COLLECTOR_SCRIPT, 'utf8');
  await page.evaluate((src) => {
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.textContent = src;
    document.documentElement.appendChild(script);
  }, content);
}

async function main() {
  if (!fs.existsSync(COLLECTOR_SCRIPT)) {
    console.error('2nd Chart Collector script not found:', COLLECTOR_SCRIPT);
    process.exit(1);
  }
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

  const browser = await puppeteer.launch({ headless: false, defaultViewport: null, args: ['--start-maximized'] });
  const page = await browser.newPage();
  await setupDownloadBehavior(page);

  // CDP for vacantBerth interception
  const client = await page.target().createCDPSession();
  await client.send('Network.enable');
  const collectedVbdResponses = [];
  client.on('Network.responseReceived', async (params) => {
    const url = params.response.url || '';
    if (!url.toLowerCase().includes('vacantberth') && !url.toLowerCase().includes('vacant')) return;
    try {
      const body = await client.send('Network.getResponseBody', { requestId: params.requestId });
      const parsed = JSON.parse(body.body);
      if (parsed && Array.isArray(parsed.vbd)) {
        collectedVbdResponses.push(parsed);
        console.log(`  \u2713 Intercepted vacantBerth: ${parsed.vbd.length} vacant berths`);
      }
    } catch (_) {}
  });

  // Re-inject on navigation
  page.on('framenavigated', async (frame) => {
    if (frame === page.mainFrame()) {
      try { await injectCollectorScript(page); } catch (_) {}
    }
  });

  await page.goto('https://www.irctc.co.in/online-charts', { waitUntil: 'networkidle2' });
  await injectCollectorScript(page);

  console.log('\n\u2705 2nd Chart Collector injected.');
  console.log('Enter the 5-digit train number, select boarding station, click "Get Train Chart".');
  console.log('Once coach class buttons (Sleeper, 2AC, 3AC...) are visible, press ENTER.\n');

  await waitForEnter('Press ENTER after coach class buttons are visible... ');

  let classButtons = await findCoachClassButtons(page);
  if (!classButtons.length) {
    console.log('Auto-detection failed. Trying broader search...');
    classButtons = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], [role="tab"], mat-chip, .mat-chip'));
      const found = [];
      for (const el of candidates) {
        const text = (el.innerText || el.textContent || '').trim();
        if (text && text.length >= 2 && text.length <= 15 && el.offsetParent !== null && !found.some(f => f.text === text)) {
          found.push({ text, index: found.length });
        }
      }
      return found;
    });
    if (classButtons.length) console.log('Found buttons:', classButtons.map(b => b.text).join(', '));
  }

  if (!classButtons.length) {
    console.error('No coach class buttons found. Use manual process instead.');
    return;
  }

  console.log(`Detected ${classButtons.length} class buttons: ${classButtons.map(b => b.text).join(', ')}`);
  console.log('Starting automatic collection...\n');

  for (const btn of classButtons) {
    console.log(`Clicking "${btn.text}"...`);
    const clicked = await clickCoachClassButton(page, btn.text);
    if (!clicked) { console.warn(`  \u26a0 Skipping "${btn.text}".`); continue; }
    await page.waitForTimeout(5000);
    console.log(`  Going back...`);
    await clickBackButton(page);
    await page.waitForTimeout(3000);
  }

  // Build & save
  if (collectedVbdResponses.length > 0) {
    const trainInfo = JSON.parse(await page.evaluate(() => sessionStorage.getItem('irctcTrainInfo') || '{}'));
    const trainNo = trainInfo.trainNo || 'train';
    const now = new Date();
    const ddmm = String(now.getDate()).padStart(2, '0') + String(now.getMonth() + 1).padStart(2, '0');
    const sourceStation = trainInfo.sourceStation || trainInfo.stationFrom || '';
    const destinationStation = trainInfo.destinationStation || trainInfo.stationTo || '';

    const allCoaches = [];
    const seenCoaches = new Set();
    for (const resp of collectedVbdResponses) {
      const coachGrouped = {};
      for (const item of (resp.vbd || [])) {
        const name = item.coachName || 'Unknown';
        if (!coachGrouped[name]) coachGrouped[name] = [];
        coachGrouped[name].push(item);
      }
      for (const [coachName, items] of Object.entries(coachGrouped)) {
        if (seenCoaches.has(coachName)) continue;
        seenCoaches.add(coachName);
        const coachClass = deriveClass(coachName);
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

        allCoaches.push({
          bdd, coachName,
          error: resp.error || null,
          coachClass,
          trainNumber: trainNo, trainNo,
          trainName: trainInfo.trainName || '',
          trainType: trainInfo.trainType || '',
          sourceStation, destinationStation
        });
      }
    }

    const payload = {
      trainNumber: trainNo, trainNo,
      trainName: trainInfo.trainName || '',
      trainType: trainInfo.trainType || '',
      sourceStation, destinationStation,
      fromStation: sourceStation,
      toStation: destinationStation,
      runningDays: trainInfo.runningDays || [],
      route: trainInfo.route || [],
      stationList: trainInfo.stationList || [],
      trainDetails: trainInfo.trainDetails || null,
      journeyDate: trainInfo.journeyDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
      coachDetails: allCoaches.map(c => ({ coachName: c.coachName, coachClass: c.coachClass, berthCount: c.bdd.length })),
      coaches: allCoaches
    };

    const filename = `${trainNo} ${ddmm}.json`;
    const filepath = path.join(DOWNLOAD_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(payload, null, 2));
    console.log(`\n\u2705 Saved: ${filepath}`);
    console.log(`   ${allCoaches.length} coaches, ${allCoaches.reduce((s, c) => s + c.bdd.length, 0)} total berths`);
  } else {
    // Fallback: download from injected collector
    await page.evaluate(() => {
      if (window.irctcChartCollector?.downloadJson) window.irctcChartCollector.downloadJson();
    });
  }

  console.log('\nAutomation complete. Browser remains open for verification.');
}

main().catch((err) => { console.error('Unexpected error:', err); process.exit(1); });
