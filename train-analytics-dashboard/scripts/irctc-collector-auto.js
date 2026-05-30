const fs = require('fs');
const path = require('path');
const readline = require('readline');
const puppeteer = require('puppeteer');

const COLLECTOR_SCRIPT = path.join(__dirname, 'irctc-chart-collector.js');
const DOWNLOAD_DIR = path.join(__dirname, '..', 'data');

function waitForEnter(promptText) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(promptText, () => {
      rl.close();
      resolve();
    });
  });
}

async function findCoachLabels(page) {
  return await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    const labelRegex = /^[A-Za-z]{1,3}\d{1,2}[A-Za-z]?$/;
    const labels = [];
    for (const el of candidates) {
      const text = (el.innerText || '').trim();
      if (!text) continue;
      if (text.length > 1 && text.length <= 5 && labelRegex.test(text) && el.offsetParent !== null) {
        if (!labels.includes(text)) labels.push(text);
      }
    }
    return labels;
  });
}

async function clickCoachButton(page, label) {
  return await page.evaluate((label) => {
    const candidates = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    const target = candidates.find(el => (el.innerText || '').trim() === label && el.offsetParent !== null);
    if (!target) return false;
    target.click();
    return true;
  }, label);
}

async function setupDownloadBehavior(page) {
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: DOWNLOAD_DIR,
  });
}

async function clickOnlineChartsIfNeeded(page) {
  const matched = await page.evaluate(() => {
    const textMatch = /online\s*charts?/i;
    const candidates = Array.from(document.querySelectorAll('a, button, [role="button"], [role="menuitem"]'));
    for (const el of candidates) {
      const text = (el.innerText || el.textContent || '').trim();
      if (textMatch.test(text)) {
        el.click();
        return true;
      }
    }
    return false;
  });
  if (matched) {
    await page.waitForTimeout(3000);
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
    } catch (_) {
      // navigation may be handled by JS; ignore timeout
    }
    return true;
  }
  return false;
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
    console.error('Collector script not found:', COLLECTOR_SCRIPT);
    process.exit(1);
  }

  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized'],
  });

  const page = await browser.newPage();
  await setupDownloadBehavior(page);

  page.on('framenavigated', async (frame) => {
    if (frame === page.mainFrame()) {
      try {
        await injectCollectorScript(page);
        console.log('✅ Collector script re-injected after navigation.');
      } catch (err) {
        console.warn('Collector reinjection failed:', err.message);
      }
    }
  });

  await page.goto('https://www.irctc.co.in/online-charts', { waitUntil: 'networkidle2' });
  if (page.url().includes('/train-search') || !page.url().includes('/online-charts')) {
    console.log('Detected redirect to train-search; trying to open the Online Charts page...');
    const opened = await clickOnlineChartsIfNeeded(page);
    if (!opened) {
      console.warn('Unable to locate an Online Charts button automatically. You may need to navigate to the page manually.');
    }
  }

  await injectCollectorScript(page);
  console.log('\n✅ Collector injected before train search actions.');
  console.log('Now enter the train number, select the source station, and click the button to load the coach chart.');
  console.log('Once the coach buttons are visible, return here and press ENTER to continue.\n');

  await waitForEnter('Press ENTER after the coach selection screen is visible... ');

  let coachLabels = await findCoachLabels(page);
  if (!coachLabels.length) {
    console.error('Could not detect coach buttons automatically. Please ensure the coach buttons are visible.');
    await browser.close();
    process.exit(1);
  }

  console.log('Detected coach buttons:', coachLabels.join(', '));
  console.log('Starting automatic coach clicks. This may take a few minutes.');

  for (const label of coachLabels) {
    const success = await clickCoachButton(page, label);
    if (!success) {
      console.warn(`Skipping coach button ${label}: not found or not clickable.`);
      continue;
    }
    console.log(`Clicked ${label}. Waiting for data capture...`);
    await page.waitForTimeout(4000);
  }

  if (coachLabels.length > 0) {
    console.log('Flushing final coach data by clicking the first coach again.');
    await clickCoachButton(page, coachLabels[0]);
    await page.waitForTimeout(4000);
  }

  console.log('Requesting JSON download from page.');
  await page.evaluate(() => {
    if (window.irctcChartCollector && typeof window.irctcChartCollector.downloadJson === 'function') {
      window.irctcChartCollector.downloadJson();
      return true;
    }
    return false;
  });

  console.log(`If download did not start automatically, use window.irctcChartCollector.downloadJson() in the page console.`);
  console.log(`Saved file to: ${DOWNLOAD_DIR}`);
  console.log('Automation complete. The browser remains open so you can confirm the capture.');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
